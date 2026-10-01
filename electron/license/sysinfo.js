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

function refreshGeo() {
  if (geoBusy) return geoBusy;
  if (geo && Date.now() - geoAt < GEO_TTL) return Promise.resolve();
  const c = new AbortController();
  const t = setTimeout(() => c.abort(), 6000);
  geoBusy = fetch('https://ipwho.is/', { signal: c.signal })
    .then((r) => r.json())
    .then((j) => {
      if (j && j.success !== false && j.ip) {
        geo = {
          publicIp: String(j.ip),
          city: String(j.city || ''),
          region: String(j.region || ''),
          country: String(j.country || ''),
          isp: String((j.connection && (j.connection.isp || j.connection.org)) || ''),
          ipLat: Number.isFinite(Number(j.latitude)) ? Number(j.latitude) : undefined,
          ipLng: Number.isFinite(Number(j.longitude)) ? Number(j.longitude) : undefined,
        };
        geoAt = Date.now();
      }
    })
    .catch(() => {})
    .finally(() => {
      clearTimeout(t);
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

/** Everything known right now (kicks off the slow parts in the background). */
async function collect({ wait = false } = {}) {
  const slow = Promise.all([hardware(), refreshGeo()]);
  if (wait) await Promise.race([slow, new Promise((r) => setTimeout(r, 7000))]);
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
    ...(geo ? { ...geo, geoAt: undefined } : {}),
  };
}

module.exports = { collect };
