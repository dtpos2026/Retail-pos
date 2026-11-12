'use strict';

/*
 * Printers on a COM port: Bluetooth thermal printers (Windows creates a "Standard Serial over Bluetooth link"
 * COM port when they are paired), USB-to-serial and real serial printers. The ESC/POS job is written straight
 * to the port — no Windows printer and no driver needed. Such a printer is stored as "serial:COM5".
 *
 * Tests / development: setFake(dir) makes every COM port a file in `dir` (ports listed in dir/ports.json).
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFile } = require('child_process');
const { AppError } = require('../core/errors');
const logger = require('../core/logger');

const PREFIX = 'serial:';
let fakeDir = null;
const setFake = (dir) => {
  fakeDir = dir || null;
  cache = { list: [], at: 0 };
};

const isSerialName = (name) => typeof name === 'string' && name.toLowerCase().startsWith(PREFIX);
const portOf = (name) => {
  const m = /^serial:(COM\d{1,3})$/i.exec(String(name || '').trim());
  return m ? m[1].toUpperCase() : null;
};
const nameFor = (port) => `${PREFIX}${String(port).toUpperCase()}`;

// How fast the job is pushed into the port. Small Bluetooth printers have tiny buffers; "safe" never overruns them.
const SPEEDS = { safe: { chunk: 256, gap: 60 }, normal: { chunk: 1024, gap: 25 }, fast: { chunk: 4096, gap: 4 } };
const BAUDS = [9600, 19200, 38400, 57600, 115200];

const LIST_SCRIPT = [
  "$ErrorActionPreference = 'SilentlyContinue'",
  "$r = @(Get-CimInstance Win32_PnPEntity | Where-Object { $_.Name -match '\\(COM\\d+\\)' -or $_.DeviceID -like 'BTHENUM\\DEV_*' } | Select-Object Name, DeviceID, Manufacturer, Status)",
  'ConvertTo-Json -InputObject $r -Compress',
].join('; ');

/**
 * Turn the Windows device list into COM ports. Exported for tests.
 * Bluetooth: the outgoing port carries the printer's address; the incoming one has 000000000000 and is skipped.
 */
function parsePorts(json) {
  let rows;
  try {
    rows = JSON.parse(String(json || '').trim() || '[]');
  } catch {
    return [];
  }
  if (!Array.isArray(rows)) rows = [rows];
  const btNames = {};
  for (const r of rows) {
    const m = /^BTHENUM\\DEV_([0-9A-F]{12})/i.exec(r.DeviceID || '');
    if (m && r.Name) btNames[m[1].toUpperCase()] = r.Name;
  }
  const out = [];
  for (const r of rows) {
    const m = /\((COM\d{1,3})\)/i.exec(r.Name || '');
    if (!m) continue;
    const id = String(r.DeviceID || '');
    let kind = 'serial';
    let address = '';
    if (/^BTHENUM\\/i.test(id)) {
      kind = 'bluetooth';
      const a = /&([0-9A-F]{12})_/i.exec(id);
      address = a ? a[1].toUpperCase() : '';
      if (!address || /^0+$/.test(address)) continue; // incoming port: Windows listens there, it never prints
    } else if (/^(USB|FTDIBUS|SILABSER|CH34|PROLIFIC)/i.test(id) || /usb/i.test(r.Name || '')) kind = 'usb';
    const port = m[1].toUpperCase();
    out.push({
      port,
      name: nameFor(port),
      kind,
      address,
      deviceName: kind === 'bluetooth' ? btNames[address] || '' : String(r.Name || '').replace(/\s*\(COM\d+\)\s*$/i, ''),
      ok: !r.Status || r.Status === 'OK',
    });
  }
  return out.sort((a, b) => (a.kind === b.kind ? Number(a.port.slice(3)) - Number(b.port.slice(3)) : a.kind === 'bluetooth' ? -1 : b.kind === 'bluetooth' ? 1 : a.kind < b.kind ? 1 : -1));
}

let cache = { list: [], at: 0 };
let listing = null;

/** COM ports of this computer (Bluetooth printers first). Cached for a few seconds. */
async function listPorts({ fresh = false } = {}) {
  if (!fresh && cache.at && Date.now() - cache.at < 8000) return cache.list;
  if (fakeDir) {
    let list = [];
    try {
      list = JSON.parse(fs.readFileSync(path.join(fakeDir, 'ports.json'), 'utf8')).map((p) => ({ name: nameFor(p.port), ok: true, address: '', deviceName: '', kind: 'serial', ...p }));
    } catch {
      list = [];
    }
    cache = { list, at: Date.now() };
    return list;
  }
  if (process.platform !== 'win32') return [];
  if (listing) return listing;
  listing = new Promise((resolve) => {
    execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', LIST_SCRIPT], { windowsHide: true, timeout: 20000, maxBuffer: 4 * 1024 * 1024 }, (err, out) => {
      if (err) logger.warn('COM port list failed', err.message);
      const list = err ? cache.list : parsePorts(out);
      cache = { list, at: Date.now() };
      listing = null;
      resolve(list);
    });
  });
  return listing;
}

/*
 * Real COM access goes through .NET's SerialPort (PowerShell). Node's own fs.open on "\\.\COMn" fails on Windows
 * with "UNKNOWN", and two jobs on one port at once fail with "busy" — so every job on a port runs one at a time.
 */
const WRITE_SCRIPT = [
  'param([string]$Port, [string]$File, [int]$Baud = 9600, [int]$Chunk = 1024, [int]$Gap = 25, [int]$Probe = 0, [int]$Timeout = 15000)',
  "$ErrorActionPreference = 'Stop'",
  'function Done($o) { [Console]::Out.WriteLine((ConvertTo-Json -InputObject $o -Compress)); exit 0 }',
  '$sp = $null',
  'try {',
  "  $sp = New-Object System.IO.Ports.SerialPort $Port, $Baud, ([System.IO.Ports.Parity]::None), 8, ([System.IO.Ports.StopBits]::One)",
  "  $sp.Handshake = [System.IO.Ports.Handshake]::None",
  '  $sp.WriteTimeout = $Timeout; $sp.ReadTimeout = 1000; $sp.DtrEnable = $true; $sp.RtsEnable = $true',
  '  $sp.Open()',
  '  if (-not $Probe) {',
  '    $bytes = [System.IO.File]::ReadAllBytes($File)',
  '    for ($i = 0; $i -lt $bytes.Length; $i += $Chunk) {',
  '      $n = [Math]::Min($Chunk, $bytes.Length - $i)',
  '      $sp.Write($bytes, $i, $n)',
  '      if ($Gap -gt 0) { Start-Sleep -Milliseconds $Gap }',
  '    }',
  '    $t = 0; while ($sp.BytesToWrite -gt 0 -and $t -lt $Timeout) { Start-Sleep -Milliseconds 50; $t += 50 }',
  '    Start-Sleep -Milliseconds 300',
  '  }',
  '  $sp.Close()',
  '  Done @{ ok = $true }',
  '} catch {',
  '  if ($sp) { try { $sp.Close() } catch {} }',
  '  Done @{ ok = $false; type = $_.Exception.GetType().Name; error = $_.Exception.Message }',
  '}',
].join('\r\n');

let scriptFile = null;
function writeScript() {
  if (scriptFile && fs.existsSync(scriptFile)) return scriptFile;
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dtpos-com-'));
  scriptFile = path.join(dir, 'com.ps1');
  fs.writeFileSync(scriptFile, WRITE_SCRIPT, 'utf8');
  return scriptFile;
}

/** Turn what the helper reported into a message a cashier can act on. Exported for tests. */
function explainHelper(r, port) {
  const type = String((r && r.type) || '');
  const msg = String((r && r.error) || '');
  if (/UnauthorizedAccess/i.test(type) || /denied|in use|being used/i.test(msg)) return new AppError(`${port} is being used by another program (or another print is still running). Close it and try again.`);
  if (/FileNotFound|ArgumentException/i.test(type) || /does not exist|could not find|not exist/i.test(msg)) return new AppError(`${port} does not exist on this computer. Pair the Bluetooth printer again or check its cable, then press Detect again.`);
  if (/Timeout/i.test(type) || /timeout|timed out|semaphore/i.test(msg)) return new AppError(`The printer on ${port} did not answer. Switch it on, bring it closer (Bluetooth) and try again.`);
  if (/IOException/i.test(type)) return new AppError(`The printer on ${port} is not connected. Switch it on, keep it close, and make sure no phone is connected to it, then try again.`);
  return new AppError(`Printing on ${port} failed (${msg || type || 'unknown error'}).`);
}

function runHelper(port, extra, killAfter) {
  return new Promise((resolve, reject) => {
    const args = ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', writeScript(), '-Port', port, ...extra];
    execFile('powershell.exe', args, { windowsHide: true, timeout: killAfter, maxBuffer: 1024 * 1024 }, (err, out) => {
      if (err && err.killed) return reject(new AppError(`The printer on ${port} did not answer. Switch it on, bring it closer (Bluetooth) and try again.`));
      let r = null;
      try {
        r = JSON.parse(String(out || '').trim().split(/\r?\n/).pop());
      } catch {
        r = null;
      }
      if (!r) return reject(new AppError(`Printing on ${port} failed (${(err && err.message) || 'no answer from Windows'}).`));
      if (!r.ok) return reject(explainHelper(r, port));
      resolve(r);
    });
  });
}

// one job at a time per port (a second open of the same COM port is refused by Windows)
const queues = new Map();
function exclusive(port, job) {
  const prev = queues.get(port) || Promise.resolve();
  const run = prev.catch(() => {}).then(job);
  const tail = run.catch(() => {});
  queues.set(port, tail);
  tail.then(() => queues.get(port) === tail && queues.delete(port));
  return run;
}

/** Write an ESC/POS job to a COM port in small pieces. */
async function send(port, bytes, { baud = 9600, speed = 'normal' } = {}) {
  const { chunk, gap } = SPEEDS[speed] || SPEEDS.normal;
  const data = Buffer.from(bytes);
  if (fakeDir) {
    return exclusive(port, async () => {
      const file = path.join(fakeDir, `${port}.bin`);
      if (!fs.existsSync(path.join(fakeDir, 'ports.json')) || !(await listPorts({ fresh: true })).some((p) => p.port === port)) throw explainHelper({ type: 'FileNotFoundException' }, port);
      for (let i = 0; i < data.length; i += chunk) fs.appendFileSync(file, data.subarray(i, i + chunk));
      return { port, bytes: data.length };
    });
  }
  if (process.platform !== 'win32') throw new AppError('COM / Bluetooth printers work on Windows only.');
  return exclusive(port, async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dtpos-job-'));
    const file = path.join(dir, 'job.bin');
    fs.writeFileSync(file, data);
    const b = BAUDS.includes(Number(baud)) ? Number(baud) : 9600;
    // time allowed: connecting (Bluetooth can take a while) + the bytes at the chosen pace
    const budget = 30000 + Math.ceil(data.length / chunk) * (gap + 20);
    try {
      await runHelper(port, ['-File', file, '-Baud', String(b), '-Chunk', String(chunk), '-Gap', String(gap)], budget);
    } finally {
      fs.rm(dir, { recursive: true, force: true }, () => {});
    }
    return { port, bytes: data.length };
  });
}

/** "Verify": open the port for a moment (for Bluetooth this makes Windows connect to the printer). */
async function probe(port) {
  if (fakeDir) return exclusive(port, async () => ((await listPorts({ fresh: true })).some((p) => p.port === port) ? { ok: true } : { ok: false, message: `${port} does not exist.` }));
  if (process.platform !== 'win32') return { ok: false, message: 'Windows only.' };
  try {
    await exclusive(port, () => runHelper(port, ['-Probe', '1', '-Timeout', '12000'], 25000));
    return { ok: true };
  } catch (err) {
    return { ok: false, message: err.message };
  }
}

module.exports = { PREFIX, SPEEDS, BAUDS, setFake, isSerialName, portOf, nameFor, parsePorts, listPorts, send, probe, explainHelper };
