'use strict';

/*
 * Attaching printers from inside the software (Windows):
 *   Bluetooth — search nearby devices, pair with a PIN (0000 / 1234 for most thermal printers), switch on the
 *               printer's serial (SPP) service so Windows creates its COM port, or forget the printer again.
 *               Uses the classic Windows Bluetooth API (bthprops.cpl) through a small C# helper that PowerShell
 *               compiles on the fly — nothing extra to install.
 *   USB      — a thermal printer plugged in without its driver only shows up as a "USB001" port: install the
 *               built-in "Generic / Text Only" driver on that port (the software sends raw ESC/POS anyway).
 *
 * Tests / development: setFake(dir) simulates everything with dir/bt.json, dir/usb.json and dir/ports.json.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFile } = require('child_process');
const { AppError } = require('../core/errors');
const logger = require('../core/logger');
const serial = require('./serial');

let fakeDir = null;
const setFake = (dir) => {
  fakeDir = dir || null;
};

const SPP = '00001101-0000-1000-8000-00805F9B34FB';
const BT_CS = String.raw`
using System;
using System.Collections.Generic;
using System.Runtime.InteropServices;
using System.Text;

public static class DtBt {
  [StructLayout(LayoutKind.Sequential)]
  struct SYSTEMTIME { public ushort y, mo, dw, d, h, mi, s, ms; }

  [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
  struct BLUETOOTH_DEVICE_INFO {
    public uint dwSize;
    public ulong Address;
    public uint ulClassofDevice;
    public int fConnected;
    public int fRemembered;
    public int fAuthenticated;
    public SYSTEMTIME stLastSeen;
    public SYSTEMTIME stLastUsed;
    [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 248)] public string szName;
  }

  [StructLayout(LayoutKind.Sequential)]
  struct BLUETOOTH_DEVICE_SEARCH_PARAMS {
    public uint dwSize;
    public int fReturnAuthenticated;
    public int fReturnRemembered;
    public int fReturnUnknown;
    public int fReturnConnected;
    public int fIssueInquiry;
    public byte cTimeoutMultiplier;
    public IntPtr hRadio;
  }

  [StructLayout(LayoutKind.Sequential)]
  struct BLUETOOTH_FIND_RADIO_PARAMS { public uint dwSize; }

  [DllImport("bthprops.cpl", SetLastError = true)] static extern IntPtr BluetoothFindFirstRadio(ref BLUETOOTH_FIND_RADIO_PARAMS p, out IntPtr hRadio);
  [DllImport("bthprops.cpl", SetLastError = true)] static extern bool BluetoothFindRadioClose(IntPtr hFind);
  [DllImport("bthprops.cpl", SetLastError = true)] static extern IntPtr BluetoothFindFirstDevice(ref BLUETOOTH_DEVICE_SEARCH_PARAMS p, ref BLUETOOTH_DEVICE_INFO info);
  [DllImport("bthprops.cpl", SetLastError = true)] static extern bool BluetoothFindNextDevice(IntPtr hFind, ref BLUETOOTH_DEVICE_INFO info);
  [DllImport("bthprops.cpl", SetLastError = true)] static extern bool BluetoothFindDeviceClose(IntPtr hFind);
  [DllImport("bthprops.cpl", SetLastError = true)] static extern uint BluetoothGetDeviceInfo(IntPtr hRadio, ref BLUETOOTH_DEVICE_INFO info);
  [DllImport("bthprops.cpl", SetLastError = true, CharSet = CharSet.Unicode)] static extern uint BluetoothAuthenticateDevice(IntPtr hwnd, IntPtr hRadio, ref BLUETOOTH_DEVICE_INFO info, string passkey, uint len);
  [DllImport("bthprops.cpl", SetLastError = true)] static extern uint BluetoothSetServiceState(IntPtr hRadio, ref BLUETOOTH_DEVICE_INFO info, ref Guid service, uint flags);
  [DllImport("bthprops.cpl", SetLastError = true)] static extern uint BluetoothRemoveDevice(ref ulong address);
  [DllImport("kernel32.dll")] static extern bool CloseHandle(IntPtr h);

  static string Esc(string s) {
    var b = new StringBuilder();
    foreach (char c in s ?? "") {
      if (c == '"' || c == '\\') b.Append('\\').Append(c);
      else if (c < ' ') b.Append(' ');
      else b.Append(c);
    }
    return b.ToString();
  }

  static IntPtr Radio() {
    var p = new BLUETOOTH_FIND_RADIO_PARAMS();
    p.dwSize = (uint)Marshal.SizeOf(typeof(BLUETOOTH_FIND_RADIO_PARAMS));
    // Windows sometimes answers "no radio" for a moment while Bluetooth wakes up: ask a few times.
    // A NULL radio is allowed by the API and means "all local radios", so a miss is never fatal.
    for (int i = 0; i < 4; i++) {
      IntPtr radio;
      IntPtr find = BluetoothFindFirstRadio(ref p, out radio);
      if (find != IntPtr.Zero) { BluetoothFindRadioClose(find); return radio; }
      System.Threading.Thread.Sleep(400);
    }
    return IntPtr.Zero;
  }

  static BLUETOOTH_DEVICE_INFO NewInfo() {
    var i = new BLUETOOTH_DEVICE_INFO();
    i.dwSize = (uint)Marshal.SizeOf(typeof(BLUETOOTH_DEVICE_INFO));
    i.szName = "";
    return i;
  }

  public static string Scan(int seconds) {
    IntPtr radio = Radio();
    var sp = new BLUETOOTH_DEVICE_SEARCH_PARAMS();
    sp.dwSize = (uint)Marshal.SizeOf(typeof(BLUETOOTH_DEVICE_SEARCH_PARAMS));
    sp.fReturnAuthenticated = 1; sp.fReturnRemembered = 1; sp.fReturnUnknown = 1; sp.fReturnConnected = 1; sp.fIssueInquiry = 1;
    sp.cTimeoutMultiplier = (byte)Math.Max(2, Math.Min(12, (int)Math.Round(seconds / 1.28)));
    sp.hRadio = radio;
    var info = NewInfo();
    var items = new List<string>();
    IntPtr find = BluetoothFindFirstDevice(ref sp, ref info);
    if (find != IntPtr.Zero) {
      do {
        items.Add(string.Format("{{\"address\":\"{0:X12}\",\"name\":\"{1}\",\"cod\":{2},\"paired\":{3},\"remembered\":{4},\"connected\":{5}}}",
          info.Address, Esc(info.szName), info.ulClassofDevice, info.fAuthenticated != 0 ? "true" : "false", info.fRemembered != 0 ? "true" : "false", info.fConnected != 0 ? "true" : "false"));
        info = NewInfo();
      } while (BluetoothFindNextDevice(find, ref info));
      BluetoothFindDeviceClose(find);
    }
    if (radio != IntPtr.Zero) CloseHandle(radio);
    return "{\"devices\":[" + string.Join(",", items.ToArray()) + "]}";
  }

  public static string Pair(string address, string pins) {
    IntPtr radio = Radio();
    var info = NewInfo();
    info.Address = Convert.ToUInt64(address, 16);
    BluetoothGetDeviceInfo(radio, ref info);
    uint auth = 0;
    string used = "";
    // already paired (Windows remembers it): no PIN needed. Otherwise try each PIN in turn, in this one run.
    if (info.fAuthenticated == 0) {
      foreach (string pin in pins.Split(',')) {
        if (pin.Length == 0) continue;
        var attempt = NewInfo();
        attempt.Address = info.Address;
        BluetoothGetDeviceInfo(radio, ref attempt);
        auth = BluetoothAuthenticateDevice(IntPtr.Zero, radio, ref attempt, pin, (uint)pin.Length);
        used = pin;
        var chk = NewInfo();
        chk.Address = info.Address;
        BluetoothGetDeviceInfo(radio, ref chk);
        if (auth == 0 || chk.fAuthenticated != 0) { info = chk; break; }
      }
    }
    var spp = new Guid("${SPP}");
    uint svc = 1;
    for (int i = 0; i < 3 && svc != 0; i++) {
      svc = BluetoothSetServiceState(radio, ref info, ref spp, 1);
      if (svc != 0) System.Threading.Thread.Sleep(700);
    }
    var check = NewInfo();
    check.Address = info.Address;
    BluetoothGetDeviceInfo(radio, ref check);
    if (radio != IntPtr.Zero) CloseHandle(radio);
    return string.Format("{{\"auth\":{0},\"service\":{1},\"paired\":{2},\"name\":\"{3}\",\"pin\":\"{4}\"}}", auth, svc, check.fAuthenticated != 0 ? "true" : "false", Esc(check.szName), Esc(used));
  }

  public static string Forget(string address) {
    ulong a = Convert.ToUInt64(address, 16);
    uint r = BluetoothRemoveDevice(ref a);
    return "{\"removed\":" + (r == 0 ? "true" : "false") + ",\"code\":" + r + "}";
  }
}
`;

let scriptPath = null;
function helperScript() {
  if (scriptPath && fs.existsSync(scriptPath)) return scriptPath;
  scriptPath = path.join(os.tmpdir(), `dtpos-bt-${process.pid}.ps1`);
  const ps = [
    'param([string]$Action, [string]$Address = "", [string]$Pin = "0000", [int]$Seconds = 10)',
    "$ErrorActionPreference = 'Stop'",
    'try {',
    `  Add-Type -TypeDefinition @'\n${BT_CS}\n'@ -Language CSharp`,
    '  switch ($Action) {',
    '    "scan"   { [DtBt]::Scan($Seconds) }',
    '    "pair"   { [DtBt]::Pair($Address, $Pin) }',
    '    "forget" { [DtBt]::Forget($Address) }',
    '  }',
    '} catch { $m = ($_.Exception.Message -replace \'["\\\\]\', \' \'); Write-Output ("{""error"":""" + $m + """}") }',
  ].join('\r\n');
  fs.writeFileSync(scriptPath, ps, 'utf8');
  return scriptPath;
}

function runHelper(args, timeout) {
  return new Promise((resolve, reject) => {
    execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', helperScript(), ...args], { windowsHide: true, timeout, maxBuffer: 2 * 1024 * 1024 }, (err, out) => {
      const line = String(out || '').trim().split(/\r?\n/).filter(Boolean).pop() || '';
      let json = null;
      try {
        json = JSON.parse(line);
      } catch {
        json = null;
      }
      if (json) return resolve(json);
      reject(new AppError(err && err.killed ? 'Bluetooth did not answer in time. Try again.' : 'Could not use Bluetooth on this computer. Use "Open Windows Bluetooth settings" instead.'));
    });
  });
}

// ---- helpers shared with the simulation ----------------------------------------------------------
const readJson = (f, d) => {
  try {
    return JSON.parse(fs.readFileSync(f, 'utf8'));
  } catch {
    return d;
  }
};
const writeJson = (f, v) => fs.writeFileSync(f, JSON.stringify(v, null, 1));
const cleanAddress = (a) => String(a || '').replace(/[^0-9a-f]/gi, '').toUpperCase();
const PRINTER_RE = /print|pos|thermal|receipt|mtp|xp-|rpp|pt-|mpt|bt-?58|bt-?80|58mm|80mm|speed|medialink|zjiang|goojprt|hoin|sewoo|bixolon|epson|star/i;
const IMAGING = 0x600; // Bluetooth class of device: major class "imaging" (printers, scanners)

/** Nearby + known Bluetooth devices, printers first. */
async function btScan({ seconds = 10 } = {}) {
  let devices;
  if (fakeDir) devices = readJson(path.join(fakeDir, 'bt.json'), []);
  else {
    if (process.platform !== 'win32') throw new AppError('Bluetooth pairing works on Windows only.');
    const r = await runHelper(['-Action', 'scan', '-Seconds', String(Math.max(4, Math.min(15, Number(seconds) || 10)))], 60000);
    if (r.error) throw new AppError(`Bluetooth search failed: ${r.error}`);
    devices = r.devices || [];
  }
  return devices
    .map((d) => ({ address: cleanAddress(d.address), name: d.name || '(no name)', paired: !!d.paired, connected: !!d.connected, likelyPrinter: (Number(d.cod) & 0x1f00) === IMAGING || PRINTER_RE.test(d.name || '') }))
    .filter((d) => d.address.length === 12)
    .sort((a, b) => Number(b.likelyPrinter) - Number(a.likelyPrinter) || Number(b.paired) - Number(a.paired) || a.name.localeCompare(b.name));
}

/** COM port Windows made for a paired printer (waits a little: the port appears a few seconds after pairing). */
async function portForAddress(address, waitMs = 0) {
  const until = Date.now() + waitMs;
  for (;;) {
    const ports = await serial.listPorts({ fresh: true });
    const p = ports.find((x) => x.kind === 'bluetooth' && x.address === address);
    if (p || Date.now() >= until) return p || null;
    await new Promise((r) => setTimeout(r, 2000));
  }
}

/** Pair a Bluetooth printer and switch on its printing (serial) service. Tries the common PINs. */
async function btPair({ address, pin }) {
  const a = cleanAddress(address);
  if (a.length !== 12) throw new AppError('Choose a printer from the list first.');
  const pins = pin ? [String(pin).trim()] : ['0000', '1234'];
  if (fakeDir) {
    const list = readJson(path.join(fakeDir, 'bt.json'), []);
    const d = list.find((x) => cleanAddress(x.address) === a);
    if (!d) throw new AppError('This printer is not in range any more. Search again.');
    if (d.pin && !pins.includes(String(d.pin))) throw new AppError('Wrong PIN. Try 0000 or 1234, or the PIN printed on the printer’s self-test page.');
    d.paired = true;
    writeJson(path.join(fakeDir, 'bt.json'), list);
    const ports = readJson(path.join(fakeDir, 'ports.json'), []);
    if (!ports.some((p) => p.address === a)) {
      const used = ports.map((p) => Number(String(p.port).slice(3)));
      let n = 5;
      while (used.includes(n)) n++;
      ports.push({ port: `COM${n}`, kind: 'bluetooth', address: a, deviceName: d.name });
      writeJson(path.join(fakeDir, 'ports.json'), ports);
    }
    const p = await portForAddress(a);
    return { paired: true, name: d.name, port: p ? p.port : null, printer: p ? p.name : null };
  }
  if (process.platform !== 'win32') throw new AppError('Bluetooth pairing works on Windows only.');
  const last = await runHelper(['-Action', 'pair', '-Address', a, '-Pin', pins.join(',')], 120000);
  if (last.error) throw new AppError(`Pairing failed: ${last.error}`);
  logger.info('Bluetooth pairing', a, JSON.stringify(last));
  if (!last || !last.paired) {
    throw new AppError(`The printer did not accept the PIN${pins.length > 1 ? 's 0000 / 1234' : ''}. Switch it on, keep it close, check its PIN (often on the self-test page) and try again — or pair it in Windows Bluetooth settings.`);
  }
  const p = await portForAddress(a, 20000);
  return { paired: true, name: last.name, port: p ? p.port : null, printer: p ? p.name : null, serviceCode: last.service };
}

async function btForget({ address }) {
  const a = cleanAddress(address);
  if (fakeDir) {
    const list = readJson(path.join(fakeDir, 'bt.json'), []);
    for (const d of list) if (cleanAddress(d.address) === a) d.paired = false;
    writeJson(path.join(fakeDir, 'bt.json'), list);
    writeJson(path.join(fakeDir, 'ports.json'), readJson(path.join(fakeDir, 'ports.json'), []).filter((p) => p.address !== a));
    await serial.listPorts({ fresh: true });
    return { removed: true };
  }
  if (process.platform !== 'win32') throw new AppError('Windows only.');
  const r = await runHelper(['-Action', 'forget', '-Address', a], 30000);
  await serial.listPorts({ fresh: true });
  return { removed: !!r.removed };
}

// ---- USB: install the built-in generic driver on a driverless USB printer port -------------------------
const USB_SCRIPT = [
  "$ErrorActionPreference = 'SilentlyContinue'",
  "$ports = @(Get-PrinterPort | Where-Object { $_.Name -like 'USB*' } | Select-Object Name, Description)",
  '$used = @(Get-Printer | Select-Object -ExpandProperty PortName)',
  "$out = @($ports | ForEach-Object { [pscustomobject]@{ port = $_.Name; description = [string]$_.Description; hasPrinter = ($used -contains $_.Name) } })",
  'ConvertTo-Json -InputObject $out -Compress',
].join('; ');

/** USB printer ports, and whether a Windows printer is already installed on each. */
async function usbPorts() {
  if (fakeDir) return readJson(path.join(fakeDir, 'usb.json'), []);
  if (process.platform !== 'win32') return [];
  return new Promise((resolve) => {
    execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', USB_SCRIPT], { windowsHide: true, timeout: 20000 }, (err, out) => {
      let rows = [];
      try {
        rows = JSON.parse(String(out || '').trim() || '[]');
      } catch {
        rows = [];
      }
      if (!Array.isArray(rows)) rows = [rows];
      resolve(rows.filter((r) => r && r.port).map((r) => ({ port: String(r.port), description: String(r.description || ''), hasPrinter: !!r.hasPrinter })));
    });
  });
}

/**
 * Install "Generic / Text Only" on a USB port so the printer appears in Windows (needs admin: Windows asks).
 * Returns the new Windows printer name.
 */
async function installGeneric({ port, name }) {
  const p = String(port || '').trim();
  if (!/^USB\d{3}$/i.test(p)) throw new AppError('Choose a USB port (e.g. USB001).');
  const printerName = String(name || '').replace(/["'`$]/g, '').trim().slice(0, 60) || `Thermal Printer (${p})`;
  if (fakeDir) {
    const list = readJson(path.join(fakeDir, 'usb.json'), []);
    const r = list.find((x) => x.port === p);
    if (!r) throw new AppError(`${p} was not found.`);
    r.hasPrinter = true;
    r.printer = printerName;
    writeJson(path.join(fakeDir, 'usb.json'), list);
    return { installed: true, printer: printerName };
  }
  if (process.platform !== 'win32') throw new AppError('Windows only.');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dtpos-usb-'));
  const result = path.join(dir, 'result.txt');
  const inner = path.join(dir, 'install.ps1');
  fs.writeFileSync(
    inner,
    [
      "$ErrorActionPreference = 'Stop'",
      'try {',
      `  if (-not (Get-Printer -Name '${printerName}' -ErrorAction SilentlyContinue)) { Add-Printer -Name '${printerName}' -DriverName 'Generic / Text Only' -PortName '${p}' }`,
      `  Set-Content -Path '${result}' -Value 'OK'`,
      `} catch { Set-Content -Path '${result}' -Value ('ERR:' + $_.Exception.Message) }`,
    ].join('\r\n'),
    'utf8'
  );
  const outer = `Start-Process powershell.exe -Verb RunAs -WindowStyle Hidden -Wait -ArgumentList '-NoProfile','-ExecutionPolicy','Bypass','-File','${inner}'`;
  await new Promise((resolve) => execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', outer], { windowsHide: true, timeout: 120000 }, () => resolve()));
  let text = '';
  try {
    text = fs.readFileSync(result, 'utf8').trim();
  } catch {
    text = '';
  }
  fs.rm(dir, { recursive: true, force: true }, () => {});
  if (text === 'OK') return { installed: true, printer: printerName };
  if (!text) throw new AppError('Windows did not allow the installation (the admin permission was refused). Try again and press "Yes" when Windows asks.');
  throw new AppError(`Windows could not install the printer: ${text.replace(/^ERR:/, '')}`);
}

module.exports = { setFake, btScan, btPair, btForget, usbPorts, installGeneric, portForAddress };
