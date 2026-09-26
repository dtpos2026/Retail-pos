'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const ctx = require('../core/context');
const logger = require('../core/logger');
const { AppError } = require('../core/errors');
const { machineId } = require('./machine');
const { PUBLIC_KEY_PEM, TRIAL_DAYS, FIREBASE, VENDOR } = require('./config');

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

function load() {
  if (state) return state;
  try {
    state = JSON.parse(fs.readFileSync(file(), 'utf8'));
  } catch {
    state = {};
  }
  if (!state.trialStart) {
    state.trialStart = new Date().toISOString();
    save();
  }
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

function configured() {
  return PUBLIC_KEY_PEM.includes('BEGIN PUBLIC KEY');
}

/** Returns the payload when the signature is valid, otherwise throws AppError. */
function decode(key) {
  const clean = String(key || '').replace(/\s+/g, '');
  const parts = clean.split('.');
  if (parts.length !== 3 || parts[0] !== 'RPOS1') throw new AppError('This is not a valid Retail POS license key.');
  let ok = false;
  try {
    ok = crypto.verify('sha256', Buffer.from(parts[1]), { key: PUBLIC_KEY_PEM, dsaEncoding: 'ieee-p1363' }, b64urlDecode(parts[2]));
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

function status() {
  const s = load();
  const mid = machineId();
  const base = { machineId: mid, configured: configured(), vendor: VENDOR, lastOnlineCheck: s.lastOnlineCheck || null };

  if (!configured()) {
    return { ...base, state: 'unconfigured', usable: true, message: 'Developer build — licensing not configured.' };
  }
  if (clockTampered(s)) {
    return { ...base, state: 'clock', usable: false, message: 'Your computer date/time appears to be wrong. Please correct the date and time, then restart.' };
  }

  if (s.key) {
    try {
      const { payload } = decode(s.key);
      const info = {
        ...base,
        licenseId: payload.lid,
        clientId: payload.cid,
        businessName: payload.bn,
        plan: payload.plan,
        issuedAt: payload.iat,
        expiresAt: payload.exp || null,
        maxUsers: payload.mu || 0,
      };
      if (payload.mid !== '*' && payload.mid !== mid) {
        return { ...info, state: 'invalid', usable: false, message: 'This license belongs to a different computer.' };
      }
      if (s.revoked === payload.lid) {
        return { ...info, state: 'revoked', usable: false, message: 'This license has been deactivated by your provider.' };
      }
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
  if (left > 0) return { ...base, state: 'trial', usable: true, trialDaysLeft: left, message: `Trial version — ${left} day(s) left.` };
  return { ...base, state: 'trial_expired', usable: false, trialDaysLeft: 0, message: 'Your trial has ended. Please activate a license to continue.' };
}

function activate({ key }) {
  if (!configured()) throw new AppError('Licensing is not configured in this build.');
  const { payload, key: clean } = decode(key);
  const mid = machineId();
  if (payload.mid !== '*' && payload.mid !== mid) {
    throw new AppError(`This license was issued for computer ${payload.mid}. This computer's ID is ${mid}.`);
  }
  if (payload.exp && daysUntil(payload.exp) <= 0) throw new AppError(`This license expired on ${payload.exp}.`);
  const s = load();
  s.key = clean;
  if (s.revoked === payload.lid) delete s.revoked;
  save();
  logger.info('License activated', payload.lid);
  onlineCheck().catch(() => {});
  return status();
}

function removeLicense() {
  const s = load();
  delete s.key;
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
 * Best-effort online check against Firestore (public read of licenseStatus/{lid}).
 * Picks up renewals (a newer signed key) and revocations. Silent when offline.
 */
async function onlineCheck() {
  const s = load();
  if (!configured() || !s.key) return null;
  let payload;
  try {
    payload = decode(s.key).payload;
  } catch {
    return null;
  }
  const url = `https://firestore.googleapis.com/v1/projects/${FIREBASE.projectId}/databases/(default)/documents/licenseStatus/${encodeURIComponent(payload.lid)}?key=${FIREBASE.apiKey}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    const res = await fetch(url, { signal: controller.signal });
    if (res.status === 404) return null;
    if (!res.ok) return null;
    const doc = await res.json();
    const f = doc.fields || {};
    const remoteStatus = f.status?.stringValue;
    const remoteKey = f.key?.stringValue;
    s.lastOnlineCheck = new Date().toISOString();
    if (remoteStatus === 'revoked' || remoteStatus === 'suspended') {
      s.revoked = payload.lid;
    } else if (s.revoked === payload.lid) {
      delete s.revoked;
    }
    if (remoteStatus === 'active' && remoteKey && remoteKey !== s.key) {
      try {
        const next = decode(remoteKey).payload;
        const mid = machineId();
        if (next.lid === payload.lid && (next.mid === '*' || next.mid === mid)) {
          s.key = remoteKey;
          logger.info('License updated from server', next.lid, next.exp);
        }
      } catch (err) {
        logger.warn('Remote license key rejected', err.message);
      }
    }
    save();
    return status();
  } catch {
    return null; // offline — ignore
  } finally {
    clearTimeout(timer);
  }
}

module.exports = { status, activate, removeLicense, isUsable, maxUsers, onlineCheck, machineId, decode };
