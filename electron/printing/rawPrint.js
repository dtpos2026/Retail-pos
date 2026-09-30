'use strict';

const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const ctx = require('../core/context');
const logger = require('../core/logger');
const { AppError } = require('../core/errors');

/*
 * Sends raw bytes (ESC/POS) to a Windows printer through the print spooler (winspool, datatype RAW).
 * A single PowerShell process is kept alive, so only the very first print pays the ~1 s start-up.
 */

const SCRIPT = String.raw`
$ErrorActionPreference = 'Stop'
$code = @'
using System;
using System.Runtime.InteropServices;
public static class RawPrinter {
  [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
  public class DOCINFO {
    [MarshalAs(UnmanagedType.LPWStr)] public string pDocName;
    [MarshalAs(UnmanagedType.LPWStr)] public string pOutputFile;
    [MarshalAs(UnmanagedType.LPWStr)] public string pDataType;
  }
  [DllImport("winspool.drv", EntryPoint = "OpenPrinterW", SetLastError = true, CharSet = CharSet.Unicode, ExactSpelling = true)]
  static extern bool OpenPrinter(string name, out IntPtr h, IntPtr pd);
  [DllImport("winspool.drv", SetLastError = true, ExactSpelling = true)]
  static extern bool ClosePrinter(IntPtr h);
  [DllImport("winspool.drv", EntryPoint = "StartDocPrinterW", SetLastError = true, CharSet = CharSet.Unicode, ExactSpelling = true)]
  static extern bool StartDocPrinter(IntPtr h, int level, [In, MarshalAs(UnmanagedType.LPStruct)] DOCINFO di);
  [DllImport("winspool.drv", SetLastError = true, ExactSpelling = true)]
  static extern bool EndDocPrinter(IntPtr h);
  [DllImport("winspool.drv", SetLastError = true, ExactSpelling = true)]
  static extern bool StartPagePrinter(IntPtr h);
  [DllImport("winspool.drv", SetLastError = true, ExactSpelling = true)]
  static extern bool EndPagePrinter(IntPtr h);
  [DllImport("winspool.drv", SetLastError = true, ExactSpelling = true)]
  static extern bool WritePrinter(IntPtr h, IntPtr p, int n, out int written);
  public static string Send(string printer, byte[] data, string docName) {
    IntPtr h;
    if (!OpenPrinter(printer, out h, IntPtr.Zero)) return "ERR:open:" + Marshal.GetLastWin32Error();
    try {
      var di = new DOCINFO(); di.pDocName = docName; di.pOutputFile = null; di.pDataType = "RAW";
      if (!StartDocPrinter(h, 1, di)) return "ERR:startdoc:" + Marshal.GetLastWin32Error();
      try {
        if (!StartPagePrinter(h)) return "ERR:startpage:" + Marshal.GetLastWin32Error();
        IntPtr p = Marshal.AllocCoTaskMem(data.Length);
        try {
          Marshal.Copy(data, 0, p, data.Length);
          int w;
          if (!WritePrinter(h, p, data.Length, out w) || w != data.Length) return "ERR:write:" + Marshal.GetLastWin32Error();
        } finally { Marshal.FreeCoTaskMem(p); }
        EndPagePrinter(h);
      } finally { EndDocPrinter(h); }
    } finally { ClosePrinter(h); }
    return "OK";
  }
}
'@
Add-Type -TypeDefinition $code
[Console]::Out.WriteLine('READY')
[Console]::Out.Flush()
while (($line = [Console]::In.ReadLine()) -ne $null) {
  if ($line.Length -eq 0) { continue }
  $id = '0'
  try {
    $req = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($line)) | ConvertFrom-Json
    $id = [string]$req.id
    if ($req.cmd -eq 'ping') { $res = 'OK' }
    else {
      $bytes = [IO.File]::ReadAllBytes($req.file)
      $res = [RawPrinter]::Send([string]$req.printer, $bytes, [string]$req.doc)
    }
  } catch { $res = 'ERR:script:' + ($_.Exception.Message -replace '[\r\n|]', ' ') }
  [Console]::Out.WriteLine($id + '|' + $res)
  [Console]::Out.Flush()
}
`;

let proc = null;
let readyPromise = null;
let buffer = '';
let counter = 0;
const pending = new Map();

function failAll(message) {
  for (const [, p] of pending) {
    clearTimeout(p.timer);
    p.reject(new AppError(message));
  }
  pending.clear();
}

function start() {
  if (proc && readyPromise) return readyPromise;
  const dir = path.join(ctx.paths.temp, 'tools');
  fs.mkdirSync(dir, { recursive: true });
  const script = path.join(dir, 'rawprint.ps1');
  // BOM so Windows PowerShell 5.1 reads the file as UTF-8.
  fs.writeFileSync(script, '﻿' + SCRIPT, 'utf8');
  buffer = '';
  proc = spawn('powershell.exe', ['-NoLogo', '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', script], {
    windowsHide: true,
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  const p = proc;
  readyPromise = new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new AppError('The print helper did not start. Switch to "Windows driver" print method in Settings → Printers.')), 30000);
    let ready = false;
    p.stdout.setEncoding('utf8');
    p.stdout.on('data', (chunk) => {
      buffer += chunk;
      let idx;
      while ((idx = buffer.indexOf('\n')) >= 0) {
        const line = buffer.slice(0, idx).replace(/\r$/, '');
        buffer = buffer.slice(idx + 1);
        if (!ready && line === 'READY') {
          ready = true;
          clearTimeout(timer);
          resolve();
          continue;
        }
        const sep = line.indexOf('|');
        if (sep < 0) continue;
        const id = line.slice(0, sep);
        const entry = pending.get(id);
        if (entry) {
          pending.delete(id);
          clearTimeout(entry.timer);
          entry.resolve(line.slice(sep + 1));
        }
      }
    });
    let errText = '';
    p.stderr.setEncoding('utf8');
    p.stderr.on('data', (d) => {
      errText += d;
    });
    p.on('error', (err) => {
      clearTimeout(timer);
      logger.error('Print helper failed to start', err);
      reject(new AppError('Windows PowerShell is required for direct thermal printing. Switch to "Windows driver" print method in Settings → Printers.'));
    });
    p.on('exit', (code) => {
      clearTimeout(timer);
      logger.warn('Print helper exited', code, errText.slice(0, 500));
      if (proc === p) {
        proc = null;
        readyPromise = null;
      }
      if (!ready) reject(new AppError('The print helper could not start (PowerShell restricted?). Switch to "Windows driver" print method in Settings → Printers.'));
      failAll('The print helper stopped. Please try again.');
    });
  });
  readyPromise.catch(() => {
    if (proc === p) {
      try {
        p.kill();
      } catch {
        /* ignore */
      }
      proc = null;
      readyPromise = null;
    }
  });
  return readyPromise;
}

function send(payload, timeoutMs = 20000) {
  return new Promise((resolve, reject) => {
    const id = String(++counter);
    const timer = setTimeout(() => {
      pending.delete(id);
      reject(new AppError('The printer did not respond in time. Check that it is on and connected, then try again.'));
    }, timeoutMs);
    pending.set(id, { resolve, reject, timer });
    const line = Buffer.from(JSON.stringify({ id, ...payload }), 'utf8').toString('base64');
    proc.stdin.write(line + '\n');
  });
}

function explain(code, printer) {
  const n = Number((/^ERR:\w+:(\d+)$/.exec(code) || [])[1]);
  if (n === 1801) return `Printer "${printer}" was not found. Check the name in Settings → Printers.`;
  if (n === 5) return `Access to printer "${printer}" was denied. Run Retail POS as the same Windows user that installed the printer.`;
  if (n === 1796 || n === 1797) return `Printer "${printer}" does not accept direct printing. Switch to "Windows driver" print method in Settings → Printers.`;
  if (/^ERR:(write|startdoc|startpage):/.test(code)) return `Printing failed on "${printer}". Check that it is on, has paper, and the cover is closed.`;
  if (code.startsWith('ERR:script:')) return 'Direct printing is blocked on this computer. Switch to "Windows driver" print method in Settings → Printers.';
  return `Printing failed on "${printer}" (${code}).`;
}

/** Start the helper in the background so the first receipt prints immediately. */
function warmUp() {
  if (process.platform !== 'win32') return;
  start().catch((err) => logger.warn('Print helper warm-up failed', err.message));
}

async function sendRaw(printerName, bytes, docName = 'Retail POS') {
  if (process.platform !== 'win32') throw new AppError('Direct thermal printing works on Windows only.');
  await start();
  const file = path.join(ctx.paths.temp, `job-${Date.now()}-${++counter}.bin`);
  fs.writeFileSync(file, bytes);
  try {
    const res = await send({ printer: printerName, file, doc: docName });
    if (res !== 'OK') {
      logger.error('Raw print failed', printerName, res);
      throw new AppError(explain(res, printerName));
    }
  } finally {
    fs.unlink(file, () => {});
  }
}

function shutdown() {
  if (proc) {
    try {
      proc.stdin.end();
      proc.kill();
    } catch {
      /* ignore */
    }
    proc = null;
    readyPromise = null;
  }
}

module.exports = { sendRaw, warmUp, shutdown };
