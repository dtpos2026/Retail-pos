'use strict';

const os = require('os');
const { FIREBASE } = require('./config');

/*
 * Minimal Firestore REST client used by the POS for:
 *   licenseStatus/{lid}            public read: status, key (renewals), maxDevices, deviceCount
 *   devices/{lid}_{machineId}      this computer's registration: status (active | blocked | suspended)
 * The POS never needs the internet to sell; this is only used to register the device once and to
 * pick up admin actions (block / suspend / renew / limit) whenever a connection is available.
 * Security rules (superadmin/firestore.rules) enforce the device limit on the server side.
 */

const root = () => process.env.RPOS_FIRESTORE_URL || `https://firestore.googleapis.com/v1/projects/${FIREBASE.projectId}/databases/(default)/documents`;
const docName = (p) => `projects/${FIREBASE.projectId}/databases/(default)/documents/${p}`;

class CloudError extends Error {
  constructor(message, { offline = false, status = 0, code = '' } = {}) {
    super(message);
    this.offline = offline;
    this.status = status;
    this.code = code;
  }
}

async function call(url, opts = {}, timeoutMs = 8000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(`${url}${url.includes('?') ? '&' : '?'}key=${FIREBASE.apiKey}`, { ...opts, signal: controller.signal });
  } catch (err) {
    throw new CloudError('No internet connection.', { offline: true });
  } finally {
    clearTimeout(timer);
  }
}

function parseValue(v) {
  if (!v) return null;
  if ('stringValue' in v) return v.stringValue;
  if ('integerValue' in v) return Number(v.integerValue);
  if ('doubleValue' in v) return v.doubleValue;
  if ('booleanValue' in v) return v.booleanValue;
  if ('timestampValue' in v) return v.timestampValue;
  if ('nullValue' in v) return null;
  return null;
}

function parseDoc(doc) {
  const out = {};
  for (const [k, v] of Object.entries(doc.fields || {})) out[k] = parseValue(v);
  return out;
}

/** GET a document; resolves to null when it does not exist. */
async function getDoc(path) {
  const res = await call(`${root()}/${path}`);
  if (res.status === 404) return null;
  if (!res.ok) throw new CloudError(`Server refused the request (${res.status}).`, { status: res.status });
  return parseDoc(await res.json());
}

async function commit(writes) {
  const res = await call(`${root()}:commit`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ writes }) });
  if (!res.ok) {
    let msg = '';
    try {
      msg = (await res.json())?.error?.message || '';
    } catch {
      /* ignore */
    }
    throw new CloudError(msg || `Server refused the request (${res.status}).`, { status: res.status, code: res.status === 403 ? 'DENIED' : res.status === 409 || /ALREADY_EXISTS/.test(msg) ? 'EXISTS' : '' });
  }
  return res.json();
}

const str = (v) => ({ stringValue: String(v ?? '') });

function deviceInfo(version) {
  return { name: os.hostname(), os: `${os.platform()} ${os.release()}`.slice(0, 60), appVersion: version };
}

/** Read license + this device's document. */
async function fetchState(lid, machineId) {
  const [license, device] = await Promise.all([getDoc(`licenseStatus/${encodeURIComponent(lid)}`), getDoc(`devices/${encodeURIComponent(`${lid}_${machineId}`)}`)]);
  return { license, device };
}

/**
 * Register this computer for a license. Atomic: the device document and the license's device counter
 * are written in one batch; the security rules reject it when the limit is reached.
 * Resolves { status: 'active'|'blocked'|'suspended', created: boolean }.
 */
async function registerDevice({ lid, machineId, businessName, version }) {
  const { license, device } = await fetchState(lid, machineId);
  if (!license) throw new CloudError('This license was not found online. Please contact your provider.', { code: 'NOT_FOUND' });
  if (license.status !== 'active') throw new CloudError('This license is not active. Please contact your provider.', { code: 'INACTIVE' });
  if (device) return { status: device.status || 'active', created: false, license };
  const count = Number(license.deviceCount) || 0;
  const max = Number(license.maxDevices) || 1;
  if (count >= max) {
    throw new CloudError(`This license is already used on ${count} device${count === 1 ? '' : 's'} (limit ${max}). Ask your provider to increase the device limit or remove an old device.`, { code: 'DEVICE_LIMIT' });
  }
  const info = deviceInfo(version);
  const id = `${lid}_${machineId}`;
  try {
    await commit([
      {
        update: { name: docName(`licenseStatus/${lid}`), fields: { deviceCount: { integerValue: String(count + 1) }, lastDevice: str(machineId) } },
        updateMask: { fieldPaths: ['deviceCount', 'lastDevice'] },
        currentDocument: { exists: true },
      },
      {
        update: {
          name: docName(`devices/${id}`),
          fields: { licenseId: str(lid), machineId: str(machineId), name: str(info.name), os: str(info.os), appVersion: str(info.appVersion), status: str('active'), businessName: str(businessName) },
        },
        updateTransforms: [
          { fieldPath: 'firstSeen', setToServerValue: 'REQUEST_TIME' },
          { fieldPath: 'lastSeen', setToServerValue: 'REQUEST_TIME' },
        ],
        currentDocument: { exists: false },
      },
    ]);
  } catch (err) {
    if (err instanceof CloudError && (err.code === 'DENIED' || err.code === 'EXISTS')) {
      throw new CloudError('Could not register this device — the device limit was probably just reached. Please contact your provider.', { code: 'DEVICE_LIMIT', status: err.status });
    }
    throw err;
  }
  return { status: 'active', created: true, license: { ...license, deviceCount: count + 1 } };
}

/** Tell the server this device is alive (last seen, version, name). Best effort. */
async function heartbeat({ lid, machineId, version }) {
  const info = deviceInfo(version);
  await commit([
    {
      update: { name: docName(`devices/${lid}_${machineId}`), fields: { name: str(info.name), os: str(info.os), appVersion: str(info.appVersion) } },
      updateMask: { fieldPaths: ['name', 'os', 'appVersion'] },
      updateTransforms: [{ fieldPath: 'lastSeen', setToServerValue: 'REQUEST_TIME' }],
      currentDocument: { exists: true },
    },
  ]);
}

module.exports = { CloudError, fetchState, registerDevice, heartbeat };
