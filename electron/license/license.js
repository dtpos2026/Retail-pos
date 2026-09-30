'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execFileSync } = require('child_process');
const ctx = require('../core/context');
const logger = require('../core/logger');
const { AppError } = require('../core/errors');
const { machineId } = require('./machine');
const cloud = require('./cloud');
const { PUBLIC_KEY_PEM, TRIAL_DAYS, VENDOR } = require('./config');

const VERSION = (() => {
  try {
    return require('../../package.json').version;
  } catch {
    return '0.0.0';
  }
})();

/*
 * License key format:  RPOS1.<base64url(JSON payload)>.<base64url(ECDSA P-256 / SHA-256 signature, IEEE-P1363)>
 * Payload: { v, lid, cid, bn, mid, plan, iat, exp, mu }
 *   lid  license id (Firestore doc id)    cid  client id
 *   bn   business name                    mid  machine id or "*" (any computer)
 *   plan plan name                         iat  issue date (YYYY-MM-DD)
 *   exp  expiry date (YYYY-MM-DD) or null (lifetime)
 *   mu   max active users (0 = unlimited)
 */

const DAY = 86400000;
let state = null; // persisted in userData/license.json (machine level, survives DB restore)

function file() {
  return path.join(ctx.paths.userData, 'license.json');
}

// Second copy of the trial start date in the Windows registry, so deleting
// license.json does not restart the trial.
const REG_KEY = 'HKCU\\Software\\RetailPOS';

function registryTrialStart() {
  if (process.platform !== 'win32') return null;
  try {
    const out = execFileSync('reg', ['query', REG_KEY, '/v', 'ts'], { encoding: 'utf8', windowsHide: true, timeout: 5000 });
    const m = /ts\s+REG_SZ\s+(\S+)/.exec(out);
    return m && !Number.isNaN(Date.parse(m[1])) ? m[1] : null;
  } catch {
    return null;
  }
}

function writeRegistryTrialStart(iso) {
  if (process.platform !== 'win32') return;
  try {
    execFileSync('reg', ['add', REG_KEY, '/v', 'ts', '/t', 'REG_SZ', '/d', iso, '/f'], { windowsHide: true, timeout: 5000 });
  } catch {
    /* best effort */
  }
}

function load() {
  if (state) return state;
  try {
    state = JSON.parse(fs.readFileSync(file(), 'utf8'));
  } catch {
    state = {};
  }
  const reg = registryTrialStart();
  const earliest = [state.trialStart, reg, new Date().toISOString()].filter(Boolean).sort()[0];
  if (state.trialStart !== earliest) {
    state.trialStart = earliest;
    save();
  }
  if (reg !== earliest) writeRegistryTrialStart(earliest);
  return state;
}

function save() {
  try {
    const tmp = file() + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(state, null, 2));
    fs.renameSync(tmp, file());
  } catch (err) {
    logger.error('Could not save license state', err);
  }
}

function b64urlDecode(s) {
  return Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/'), 'base64');
}

/*
 * Public key: embedded in config.js when present, otherwise downloaded once from the provider's Super Admin
 * (Firestore publicConfig/signing, written only by the head admin) and cached in userData/license-key.pem.
 */
let publicKey = PUBLIC_KEY_PEM;
const keyFile = () => path.join(ctx.paths.userData, 'license-key.pem');

let keyTried = 0;
function loadKey() {
  if (publicKey.includes('BEGIN PUBLIC KEY')) return;
  if (Date.now() - keyTried < 3000) return;
  keyTried = Date.now();
  try {
    const pem = fs.readFileSync(keyFile(), 'utf8');
    crypto.createPublicKey(pem);
    publicKey = pem;
  } catch {
    /* none cached yet */
  }
}

function configured() {
  loadKey();
  return publicKey.includes('BEGIN PUBLIC KEY');
}

const packaged = () => {
  try {
    return !!require('electron').app.isPackaged;
  } catch {
    return false;
  }
};

/** Download the provider's public key (internet needed once). Resolves true when licensing is configured. */
async function ensureKey() {
  if (configured()) return true;
  // Unpackaged development runs stay license-free (set RPOS_FORCE_LICENSE=1 to test the real flow).
  if (!packaged() && !process.env.RPOS_FORCE_LICENSE) return false;
  const before = status();
  try {
    const doc = await cloud.getPublicKey();
    if (doc && typeof doc.publicPem === 'string' && doc.publicPem.includes('BEGIN PUBLIC KEY')) {
      crypto.createPublicKey(doc.publicPem);
      fs.mkdirSync(path.dirname(keyFile()), { recursive: true });
      fs.writeFileSync(keyFile(), doc.publicPem, 'utf8');
      publicKey = doc.publicPem;
      keyTried = 0;
      logger.info('License public key downloaded');
      notify(before);
      return true;
    }
  } catch (err) {
    logger.info('Public key not available yet', err.message);
  }
  return false;
}

/** Returns the payload when the signature is valid, otherwise throws AppError. */
function decode(key) {
  const clean = String(key || '').replace(/\s+/g, '');
  const parts = clean.split('.');
  if (parts.length !== 3 || parts[0] !== 'RPOS1') throw new AppError('This is not a valid Retail POS license key.');
  let ok = false;
  try {
    ok = crypto.verify('sha256', Buffer.from(parts[1]), { key: publicKey, dsaEncoding: 'ieee-p1363' }, b64urlDecode(parts[2]));
  } catch (err) {
    logger.warn('License verify error', err.message);
  }
  if (!ok) throw new AppError('License key is invalid or was not issued for this software.');
  let payload;
  try {
    payload = JSON.parse(b64urlDecode(parts[1]).toString('utf8'));
  } catch {
    throw new AppError('License key is damaged.');
  }
  return { payload, key: clean };
}

function today() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function daysUntil(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const end = new Date(y, m - 1, d, 23, 59, 59).getTime();
  return Math.ceil((end - Date.now()) / DAY);
}

/** Detect the system clock being moved backwards to extend a license. */
function clockTampered(s) {
  const now = Date.now();
  if (s.lastSeen && now < s.lastSeen - 2 * DAY) return true;
  if (!s.lastSeen || now > s.lastSeen) {
    s.lastSeen = now;
    save();
  }
  return false;
}


const DEVICE_MSG = {
  blocked: 'This device has been blocked by your provider. Please contact support.',
  suspended: 'This device has been suspended by your provider. It will work again when it is re-activated.',
  removed: 'This device was removed from the license by your provider. Register it again to continue (internet needed once).',
};

function status() {
  const s = load();
  const mid = machineId();
  const base = { machineId: mid, configured: configured(), vendor: VENDOR, version: VERSION, lastOnlineCheck: s.lastOnlineCheck || null };

  if (!configured()) {
    if (packaged()) return { ...base, state: 'needs_key', usable: false, message: 'Connect to the internet once to set up licensing for this software.' };
    return { ...base, state: 'unconfigured', usable: true, message: 'Developer build — licensing not configured.' };
  }
  if (clockTampered(s)) {
    return { ...base, state: 'clock', usable: false, message: 'Your computer date/time appears to be wrong. Please correct the date and time, then restart.' };
  }

  if (s.key) {
    try {
      const { payload } = decode(s.key);
      const dev = s.device && s.device.regMid === mid ? s.device : null;
      const info = {
        ...base,
        licenseId: payload.lid,
        clientId: payload.cid,
        businessName: payload.bn,
        plan: payload.plan,
        issuedAt: payload.iat,
        expiresAt: payload.exp || null,
        maxUsers: payload.mu || 0,
        maxDevices: s.maxDevices || payload.md || 1,
        device: dev ? { registered: true, status: dev.status || 'active', name: dev.name, registeredAt: dev.registeredAt } : { registered: false },
      };
      if (payload.mid !== '*' && payload.mid !== mid) {
        return { ...info, state: 'invalid', usable: false, message: 'This license belongs to a different computer.' };
      }
      if (s.hold && s.hold.status === 'pending') {
        return { ...info, state: 'pending', usable: false, message: s.hold.message || 'Your license payment is pending. Please contact your provider.' };
      }
      if (s.revoked === payload.lid) {
        const suspended = s.hold && s.hold.status === 'suspended';
        return { ...info, state: 'revoked', usable: false, message: (s.hold && s.hold.message) || (suspended ? 'This license has been suspended by your provider.' : 'This license has been deactivated by your provider.') };
      }
      // Device registration: license keys that are not locked to this computer need an online registration once.
      if (!dev && payload.mid === '*') {
        return { ...info, state: 'unregistered', usable: false, message: s.deviceError || 'This device is not registered yet. Register it to continue (internet needed once).' };
      }
      if (dev && dev.status === 'removed') return { ...info, state: 'unregistered', usable: false, message: DEVICE_MSG.removed };
      if (dev && dev.status === 'blocked') return { ...info, state: 'blocked', usable: false, message: DEVICE_MSG.blocked };
      if (dev && dev.status === 'suspended') return { ...info, state: 'suspended', usable: false, message: DEVICE_MSG.suspended };
      if (payload.exp) {
        const left = daysUntil(payload.exp);
        if (left <= 0) return { ...info, state: 'expired', usable: false, daysLeft: 0, message: `License expired on ${payload.exp}.` };
        return { ...info, state: 'active', usable: true, daysLeft: left, message: left <= 7 ? `License expires in ${left} day(s).` : null };
      }
      return { ...info, state: 'active', usable: true, daysLeft: null, message: null };
    } catch (err) {
      logger.warn('Stored license rejected', err.message);
    }
  }

  const used = Math.floor((Date.now() - new Date(s.trialStart).getTime()) / DAY);
  const left = Math.max(0, TRIAL_DAYS - used);
  if (TRIAL_DAYS <= 0) return { ...base, state: 'unlicensed', usable: false, message: 'Enter your license key to start using DT Retail POS.' };
  if (left > 0) return { ...base, state: 'trial', usable: true, trialDaysLeft: left, message: `Trial version — ${left} day(s) left.` };
  return { ...base, state: 'trial_expired', usable: false, trialDaysLeft: 0, message: 'Your trial has ended. Please activate a license to continue.' };
}

/** Listeners are told whenever a background check changes what the user is allowed to do. */
const listeners = new Set();
function onChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
function notify(before) {
  const now = status();
  if (before && before.state === now.state && before.usable === now.usable && before.message === now.message && before.expiresAt === now.expiresAt) return now;
  listeners.forEach((fn) => {
    try {
      fn(now);
    } catch {
      /* ignore */
    }
  });
  return now;
}

function keyPayload() {
  const s = load();
  if (!s.key) return null;
  try {
    return decode(s.key).payload;
  } catch {
    return null;
  }
}

/**
 * Register this computer for the stored license (needs internet once).
 * Throws AppError with a clear message when the limit is reached or there is no connection.
 */
async function registerDevice() {
  const s = load();
  const payload = keyPayload();
  if (!payload) throw new AppError('Enter a license key first.');
  const mid = machineId();
  const before = status();
  try {
    const r = await cloud.registerDevice({ lid: payload.lid, machineId: mid, businessName: payload.bn, version: VERSION });
    s.device = { regMid: mid, status: r.status, name: require('os').hostname(), registeredAt: new Date().toISOString() };
    s.maxDevices = Number(r.license?.maxDevices) || s.maxDevices;
    delete s.deviceError;
    delete s.revoked;
    s.lastOnlineCheck = new Date().toISOString();
    save();
    logger.info('Device registered', payload.lid, r.created ? '(new)' : '(existing)');
  } catch (err) {
    if (err instanceof cloud.CloudError) {
      if (err.offline) {
        s.deviceError = 'Internet is needed once to register this device. Please connect to the internet and try again.';
        save();
        notify(before);
        throw new AppError(s.deviceError, 'OFFLINE');
      }
      s.deviceError = err.message;
      save();
      notify(before);
      throw new AppError(err.message, err.code || 'DEVICE');
    }
    throw err;
  }
  return notify(before);
}

/** Support thread of this license (needs internet). */
async function supportMessages() {
  const payload = keyPayload();
  if (!payload) throw new AppError('Activate a license first.');
  try {
    return await cloud.listMessages(payload.lid);
  } catch (err) {
    if (err instanceof cloud.CloudError && err.offline) throw new AppError('Internet is needed to read support messages.', 'OFFLINE');
    throw new AppError('Could not load messages right now.');
  }
}

async function sendSupport({ text }) {
  const payload = keyPayload();
  if (!payload) throw new AppError('Activate a license first.');
  try {
    await cloud.sendMessage({ lid: payload.lid, businessName: payload.bn, text });
  } catch (err) {
    if (err instanceof cloud.CloudError) throw new AppError(err.offline ? 'Internet is needed to send a message.' : err.message || 'Could not send the message.', err.offline ? 'OFFLINE' : 'SUPPORT');
    throw err;
  }
  return true;
}

async function activate({ key }) {
  if (!(await ensureKey())) throw new AppError('Could not set up licensing. Connect to the internet and try again.', 'OFFLINE');
  const { payload, key: clean } = decode(key);
  const mid = machineId();
  if (payload.mid !== '*' && payload.mid !== mid) {
    throw new AppError(`This license was issued for computer ${payload.mid}. This computer's ID is ${mid}.`);
  }
  if (payload.exp && daysUntil(payload.exp) <= 0) throw new AppError(`This license expired on ${payload.exp}.`);
  const s = load();
  const before = status();
  const prev = keyPayload();
  if (!prev || prev.lid !== payload.lid) delete s.device; // a different license: register again
  s.key = clean;
  delete s.deviceError;
  if (s.revoked === payload.lid) delete s.revoked;
  save();
  logger.info('License key stored', payload.lid);
  try {
    await registerDevice();
  } catch (err) {
    if (payload.mid === '*') {
      // Limit reached: do not keep a key that cannot be used on this computer.
      if (err.code === 'DEVICE_LIMIT' || err.code === 'INACTIVE' || err.code === 'NOT_FOUND') {
        delete s.key;
        delete s.device;
        save();
      }
      throw err;
    }
    // Machine-locked key: works offline, registration completes on the next online check.
    logger.info('Machine-locked key activated offline; device registration pending', err.message);
  }
  return notify(before);
}

function removeLicense() {
  const s = load();
  delete s.key;
  delete s.device;
  delete s.deviceError;
  save();
  return status();
}

function isUsable() {
  return status().usable;
}

function maxUsers() {
  const st = status();
  return st.state === 'active' ? st.maxUsers || 0 : 0;
}

/**
 * Best-effort online check. Picks up: license revoked / suspended, renewals (newer signed key),
 * device limit, and this device being blocked / suspended / removed. Also sends a heartbeat.
 * Silent (returns null) when offline.
 */
async function onlineCheck() {
  const s = load();
  if (!configured()) await ensureKey();
  const payload = keyPayload();
  if (!configured() || !payload) return null;
  const mid = machineId();
  const before = status();
  let state;
  try {
    state = await cloud.fetchState(payload.lid, mid);
  } catch {
    return null; // offline or server unreachable — ignore
  }
  const { license, device } = state;
  s.lastOnlineCheck = new Date().toISOString();
  if (license) {
    if (license.status === 'revoked' || license.status === 'suspended') s.revoked = payload.lid;
    else if (s.revoked === payload.lid) delete s.revoked;
    if (['revoked', 'suspended', 'pending'].includes(license.status)) s.hold = { status: license.status, message: license.message || '' };
    else delete s.hold;
    if (license.maxDevices) s.maxDevices = Number(license.maxDevices);
    if (license.status === 'active' && license.key && license.key !== s.key) {
      try {
        const next = decode(license.key).payload;
        if (next.lid === payload.lid && (next.mid === '*' || next.mid === mid)) {
          s.key = license.key;
          logger.info('License updated from server', next.lid, next.exp);
        }
      } catch (err) {
        logger.warn('Remote license key rejected', err.message);
      }
    }
  }
  if (s.device && s.device.regMid === mid) {
    if (device) {
      s.device.status = device.status || 'active';
      cloud.heartbeat({ lid: payload.lid, machineId: mid, version: VERSION }).catch(() => {});
    } else if (license) {
      // Registered before, but the admin deleted the device (freeing the slot).
      s.device.status = 'removed';
    }
  } else if (license && device && payload.mid !== '*') {
    // Machine-locked key that had not finished registering: adopt the server record.
    s.device = { regMid: mid, status: device.status || 'active', name: device.name, registeredAt: new Date().toISOString() };
  } else if (license && !device && payload.mid !== '*' && license.status === 'active') {
    // Machine-locked key, first time online: register quietly (ignore limit errors so an offline shop keeps working).
    try {
      const r = await cloud.registerDevice({ lid: payload.lid, machineId: mid, businessName: payload.bn, version: VERSION });
      s.device = { regMid: mid, status: r.status, name: require('os').hostname(), registeredAt: new Date().toISOString() };
    } catch (err) {
      logger.info('Silent device registration skipped', err.message);
    }
  }
  save();
  return notify(before);
}

module.exports = { status, ensureKey, supportMessages, sendSupport, activate, registerDevice, removeLicense, isUsable, maxUsers, onlineCheck, onChange, machineId, decode, VERSION };
