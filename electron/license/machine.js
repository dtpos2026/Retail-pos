'use strict';

const os = require('os');
const crypto = require('crypto');
const { execFileSync } = require('child_process');

let cached = null;

function windowsGuid() {
  try {
    const out = execFileSync('reg', ['query', 'HKLM\\SOFTWARE\\Microsoft\\Cryptography', '/v', 'MachineGuid'], {
      encoding: 'utf8',
      windowsHide: true,
      timeout: 5000,
    });
    const m = /MachineGuid\s+REG_SZ\s+([\w-]+)/i.exec(out);
    return m ? m[1] : null;
  } catch {
    return null;
  }
}

function linuxId() {
  try {
    return require('fs').readFileSync('/etc/machine-id', 'utf8').trim();
  } catch {
    return null;
  }
}

/**
 * Stable per-computer identifier shown to the customer and bound into the
 * license. Format: XXXX-XXXX-XXXX-XXXX.
 */
function machineId() {
  if (cached) return cached;
  let base = process.platform === 'win32' ? windowsGuid() : linuxId();
  if (!base) {
    const macs = Object.values(os.networkInterfaces())
      .flat()
      .filter((n) => n && !n.internal && n.mac && n.mac !== '00:00:00:00:00:00')
      .map((n) => n.mac)
      .sort();
    base = `${os.hostname()}|${os.cpus()[0]?.model || ''}|${macs[0] || ''}`;
  }
  const hex = crypto.createHash('sha256').update(`retail-pos|${base}`).digest('hex').toUpperCase();
  cached = hex.slice(0, 16).match(/.{4}/g).join('-');
  return cached;
}

module.exports = { machineId };
