'use strict';

/*
 * Device details shared with the provider's Super Admin (for support, asset list and the device map):
 * computer name, OS, model, CPU / RAM, local + public IP and the approximate location of that IP.
 * Collected in the background; every part is best effort and never blocks the POS.
 */

const os = require('os');
const { execFile } = require('child_process');
const logger = require('../core/logger');

let model = null; // { manufacturer, model } from Windows, resolved once
let geo = null; // { publicIp, city, region, country, isp, ipLat, ipLng, geoAt }
let geoAt = 0;
let hardwareTried = false;
let geoBusy = null;

const GEO_TTL = 30 * 60 * 1000;

function hardware() {
  if (hardwareTried || process.platform !== 'win32') return Promise.resolve();
  hardwareTried = true;
  return new Promise((resolve) => {
    execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', '(Get-CimInstance Win32_ComputerSystem | Select-Object Manufacturer,Model | ConvertTo-Json -Compress)'], { windowsHide: true, timeout: 8000 }, (err, out) => {
      try {
        if (!err) {
          const j = JSON.parse(String(out).trim());
          model = { manufacturer: String(j.Manufacturer || '').trim(), model: String(j.Model || '').trim() };
        }
      } catch (e) {
        logger.info('Hardware model unavailable', e.message);
      }
      resolve();
    });
  });
}

let gps = null; // Windows location service fix { gpsLat, gpsLng, gpsAcc }
let gpsStatus = process.platform === 'win32' ? 'pending' : 'unsupported'; // ok | off | denied | nodata | error | pending | unsupported
let gpsAt = 0;
let gpsBusy = null;
const GPS_SCRIPT = [
  'Add-Type -AssemblyName System.Device',
  '$w = New-Object System.Device.Location.GeoCoordinateWatcher([System.Device.Location.GeoPositionAccuracy]::High)',
  '[void]$w.TryStart($false, [TimeSpan]::FromSeconds(8))',
  '$end = (Get-Date).AddSeconds(14)',
  'while ((Get-Date) -lt $end -and $w.Position.Location.IsUnknown -and $w.Permission.ToString() -ne "Denied" -and $w.Status.ToString() -ne "Disabled") { Start-Sleep -Milliseconds 400 }',
  '$l = $w.Position.Location',
  '$c = [Globalization.CultureInfo]::InvariantCulture',
  'if (-not $l.IsUnknown) { "OK," + $l.Latitude.ToString($c) + "," + $l.Longitude.ToString($c) + "," + $l.HorizontalAccuracy.ToString($c) } else { "NO," + $w.Permission.ToString() + "," + $w.Status.ToString() }',
].join('; ');

/** Interpret the PowerShell answer: { fix } or { status }. Exported for tests. */
function parseGps(out) {
  const text = String(out || '');
  const ok = /^OK,(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?),(\d+(?:\.\d+)?)\s*$/m.exec(text);
  if (ok && Math.abs(Number(ok[1])) <= 90 && Math.abs(Number(ok[2])) <= 180) return { fix: { gpsLat: Number(ok[1]), gpsLng: Number(ok[2]), gpsAcc: Math.round(Number(ok[3])) }, status: 'ok' };
  const no = /^NO,(\w+),(\w+)\s*$/m.exec(text);
  if (no) return { status: no[1] === 'Denied' ? 'denied' : no[2] === 'Disabled' ? 'off' : 'nodata' };
  return { status: 'error' };
}

/** Precise position from the Windows location service (Wi-Fi / GPS) when location is allowed on the computer. */
function refreshGps() {
  if (process.platform !== 'win32') return Promise.resolve();
  if (gpsBusy) return gpsBusy;
  if (gpsAt && Date.now() - gpsAt < GEO_TTL) return Promise.resolve();
  gpsAt = Date.now();
  gpsBusy = new Promise((resolve) => {
    execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', GPS_SCRIPT], { windowsHide: true, timeout: 30000 }, (err, out) => {
      try {
        const r = err ? { status: 'error' } : parseGps(out);
        gpsStatus = r.status;
        if (r.fix) gps = r.fix;
        else if (r.status !== 'error') gpsAt = Date.now() - GEO_TTL + 5 * 60 * 1000; // no fix: look again in 5 minutes, not 30
      } catch {
        gpsStatus = 'error';
      }
      gpsBusy = null;
      resolve();
    });
  });
  return gpsBusy;
}

/** Force a new position fix on the next collect (called at login). */
function invalidate() {
  gpsAt = 0;
  geoAt = 0;
}

async function fetchJson(url, ms = 6000) {
  const c = new AbortController();
  const t = setTimeout(() => c.abort(), ms);
  try {
    return await (await fetch(url, { signal: c.signal })).json();
  } finally {
    clearTimeout(t);
  }
}

const num = (v) => (v !== '' && v !== null && v !== undefined && Number.isFinite(Number(v)) ? Number(v) : undefined);

/** Normalise the answers of the supported IP-location services. Exported for tests. */
function parseGeo(kind, j) {
  if (!j) return null;
  if (kind === 'ipwho') {
    if (j.success === false || !j.ip) return null;
    return { publicIp: String(j.ip), city: String(j.city || ''), region: String(j.region || ''), country: String(j.country || ''), isp: String((j.connection && (j.connection.isp || j.connection.org)) || ''), ipLat: num(j.latitude), ipLng: num(j.longitude) };
  }
  if (!j.ip) return null; // geojs
  return { publicIp: String(j.ip), city: String(j.city || ''), region: String(j.region || ''), country: String(j.country || ''), isp: String(j.organization_name || ''), ipLat: num(j.latitude), ipLng: num(j.longitude) };
}

function refreshGeo() {
  if (geoBusy) return geoBusy;
  if (geo && geoAt && Date.now() - geoAt < GEO_TTL) return Promise.resolve();
  geoBusy = (async () => {
    for (const [kind, url] of [['ipwho', 'https://ipwho.is/'], ['geojs', 'https://get.geojs.io/v1/ip/geo.json']]) {
      try {
        const g = parseGeo(kind, await fetchJson(url));
        if (g) {
          geo = g;
          geoAt = Date.now();
          return;
        }
      } catch {
        /* try the next service */
      }
    }
  })().finally(() => {
    geoBusy = null;
  });
  return geoBusy;
}

function network() {
  const out = { localIp: '', mac: '' };
  for (const list of Object.values(os.networkInterfaces())) {
    for (const n of list || []) {
      if (n.family === 'IPv4' && !n.internal && !out.localIp) {
        out.localIp = n.address;
        out.mac = n.mac;
      }
    }
  }
  return out;
}

/** Starts (or joins) the slow lookups: hardware model, IP location and the Windows location fix. */
function refresh() {
  return Promise.all([hardware(), refreshGeo(), refreshGps()]).then(() => undefined);
}

/** Everything known right now. */
function snapshot() {
  const cpus = os.cpus() || [];
  let username = '';
  try {
    username = os.userInfo().username;
  } catch {
    /* ignore */
  }
  return {
    hostname: os.hostname(),
    osVersion: `${os.type()} ${os.release()}`.slice(0, 80),
    arch: os.arch(),
    cpu: cpus[0] ? String(cpus[0].model).replace(/\s+/g, ' ').trim().slice(0, 80) : '',
    cores: cpus.length || undefined,
    ramGb: Math.round((os.totalmem() / 1024 ** 3) * 10) / 10,
    username,
    ...(model || {}),
    ...network(),
    ...(geo || {}),
    ...(gps || {}),
    gpsStatus: gps ? 'ok' : gpsStatus,
  };
}

/** Fields that change when new hardware / IP / location facts arrive (to decide on a follow-up heartbeat). */
function signature(s = snapshot()) {
  return [s.manufacturer, s.model, s.publicIp, s.ipLat, s.ipLng, s.gpsLat, s.gpsLng, s.gpsStatus].join('|');
}

/** Snapshot after waiting (at most `waitMs`) for the slow lookups. */
async function collect({ waitMs = 0 } = {}) {
  const slow = refresh();
  if (waitMs > 0) await Promise.race([slow, new Promise((r) => setTimeout(r, waitMs))]);
  return snapshot();
}

/** Human-readable location state for the Settings screen. */
function locationInfo() {
  const s = snapshot();
  return {
    gpsStatus: s.gpsStatus,
    gps: Number.isFinite(s.gpsLat) ? { lat: s.gpsLat, lng: s.gpsLng, acc: s.gpsAcc } : null,
    ip: s.publicIp ? { ip: s.publicIp, city: s.city, region: s.region, country: s.country, lat: s.ipLat, lng: s.ipLng } : null,
  };
}

module.exports = { collect, refresh, snapshot, signature, locationInfo, invalidate, parseGps, parseGeo };
