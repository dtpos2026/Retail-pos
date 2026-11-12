'use strict';

/*
 * Printers on a COM port: Bluetooth thermal printers (Windows creates a "Standard Serial over Bluetooth link"
 * COM port when they are paired), USB-to-serial and real serial printers. The ESC/POS job is written straight
 * to the port — no Windows printer and no driver needed. Such a printer is stored as "serial:COM5".
 *
 * Tests / development: setFake(dir) makes every COM port a file in `dir` (ports listed in dir/ports.json).
 */

const fs = require('fs');
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

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
function withTimeout(promise, ms, message) {
  let t;
  return Promise.race([promise, new Promise((_, rej) => (t = setTimeout(() => rej(new AppError(message)), ms)))]).finally(() => clearTimeout(t));
}

/** Baud rate etc. for wired serial / USB-serial printers (a Bluetooth link ignores these). */
function configure(port, baud) {
  return new Promise((resolve) => {
    const b = BAUDS.includes(Number(baud)) ? Number(baud) : 9600;
    execFile('cmd.exe', ['/c', 'mode', port, `BAUD=${b}`, 'PARITY=N', 'DATA=8', 'STOP=1', 'to=off', 'xon=off', 'dtr=on', 'rts=on'], { windowsHide: true, timeout: 8000 }, () => resolve());
  });
}

function explain(err, port) {
  if (err instanceof AppError) return err;
  const code = err && err.code;
  if (code === 'ENOENT') return new AppError(`${port} does not exist on this computer. Pair the Bluetooth printer again or check its cable, then press Detect again.`);
  if (code === 'EBUSY' || code === 'EACCES' || code === 'EPERM') return new AppError(`${port} is being used by another program (or another print is still running). Close it and try again.`);
  if (code === 'ETIMEDOUT' || code === 'EIO') return new AppError(`The printer on ${port} did not answer. Switch it on, bring it closer (Bluetooth) and try again.`);
  return new AppError(`Printing on ${port} failed (${code || (err && err.message) || 'unknown error'}).`);
}

/** Write an ESC/POS job to a COM port in small pieces. */
async function send(port, bytes, { baud = 9600, speed = 'normal', kind } = {}) {
  const { chunk, gap } = SPEEDS[speed] || SPEEDS.normal;
  const data = Buffer.from(bytes);
  if (fakeDir) {
    const file = path.join(fakeDir, `${port}.bin`);
    if (!fs.existsSync(path.join(fakeDir, 'ports.json')) || !(await listPorts({ fresh: true })).some((p) => p.port === port)) throw explain({ code: 'ENOENT' }, port);
    for (let i = 0; i < data.length; i += chunk) fs.appendFileSync(file, data.subarray(i, i + chunk));
    return { port, bytes: data.length };
  }
  if (process.platform !== 'win32') throw new AppError('COM / Bluetooth printers work on Windows only.');
  if (kind !== 'bluetooth') await configure(port, baud);
  let fh;
  try {
    fh = await withTimeout(fs.promises.open(`\\\\.\\${port}`, 'r+'), 20000, `The printer on ${port} did not answer. Switch it on, bring it closer (Bluetooth) and try again.`);
    for (let i = 0; i < data.length; i += chunk) {
      await withTimeout(fh.write(data.subarray(i, i + chunk)), 20000, `The printer on ${port} stopped answering in the middle of the job.`);
      if (gap) await sleep(gap);
    }
  } catch (err) {
    throw explain(err, port);
  } finally {
    if (fh) await fh.close().catch(() => {});
  }
  return { port, bytes: data.length };
}

/** "Verify": open the port for a moment (for Bluetooth this makes Windows connect to the printer). */
async function probe(port) {
  if (fakeDir) return (await listPorts({ fresh: true })).some((p) => p.port === port) ? { ok: true } : { ok: false, message: `${port} does not exist.` };
  if (process.platform !== 'win32') return { ok: false, message: 'Windows only.' };
  let fh;
  try {
    fh = await withTimeout(fs.promises.open(`\\\\.\\${port}`, 'r+'), 15000, `No answer on ${port}.`);
    return { ok: true };
  } catch (err) {
    return { ok: false, message: explain(err, port).message };
  } finally {
    if (fh) await fh.close().catch(() => {});
  }
}

module.exports = { PREFIX, SPEEDS, BAUDS, setFake, isSerialName, portOf, nameFor, parsePorts, listPorts, send, probe };
