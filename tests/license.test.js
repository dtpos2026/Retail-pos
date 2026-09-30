'use strict';

// License + device registration logic (POS side) against an in-memory fake of the Firestore REST API.
const test = require('node:test');
const assert = require('node:assert');
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');

const { privateKey, publicKey } = crypto.generateKeyPair ? crypto.generateKeyPairSync('ec', { namedCurve: 'P-256' }) : {};
const pem = publicKey.export({ type: 'spki', format: 'pem' });
const cfgPath = require.resolve('../electron/license/config.js');
require.cache[cfgPath] = { id: cfgPath, filename: cfgPath, loaded: true, exports: { PUBLIC_KEY_PEM: pem, TRIAL_DAYS: 7, FIREBASE: { projectId: 'demo', apiKey: 'k' }, VENDOR: { name: 'Vendor', email: 'v@x' } } };
const ctx = require('../electron/core/context');
ctx.paths.userData = fs.mkdtempSync(path.join(os.tmpdir(), 'rpos-lic-'));
const lic = require('../electron/license/license.js');
const MID = lic.machineId();

function sign(payload) {
  const body = Buffer.from(JSON.stringify({ v: 1, ...payload })).toString('base64url');
  const sig = crypto.sign('sha256', Buffer.from(body), { key: privateKey, dsaEncoding: 'ieee-p1363' }).toString('base64url');
  return `RPOS1.${body}.${sig}`;
}
const base = { cid: 'C', bn: 'Shop', plan: 'yearly', iat: '2026-01-01', exp: '2099-12-31', mu: 0, md: 1 };

// ---- fake Firestore --------------------------------------------------------------------------
const db = new Map();
let offline = false;
const enc = (o) => ({ fields: Object.fromEntries(Object.entries(o).map(([k, v]) => [k, typeof v === 'number' ? { integerValue: String(v) } : { stringValue: String(v) }])) });
const realFetch = globalThis.fetch;
globalThis.fetch = async (url, opts = {}) => {
  if (offline) throw new Error('network down');
  const u = String(url);
  const m = /documents\/(licenseStatus|devices)\/([^?]+)/.exec(u);
  if (opts.method === 'POST' && u.includes(':commit')) {
    const writes = JSON.parse(opts.body).writes;
    const lsW = writes.find((w) => w.update.name.includes('/licenseStatus/'));
    const dvW = writes.find((w) => w.update.name.includes('/devices/'));
    const lsId = lsW.update.name.split('/licenseStatus/')[1];
    const cur = db.get(`licenseStatus/${lsId}`);
    const newCount = Number(lsW.update.fields.deviceCount.integerValue);
    if (newCount !== cur.deviceCount + 1 || newCount > cur.maxDevices) return { ok: false, status: 403, json: async () => ({ error: { message: 'denied' } }) };
    db.set(`licenseStatus/${lsId}`, { ...cur, deviceCount: newCount });
    const f = Object.fromEntries(Object.entries(dvW.update.fields).map(([k, v]) => [k, v.stringValue]));
    db.set(`devices/${dvW.update.name.split('/devices/')[1]}`, f);
    return { ok: true, status: 200, json: async () => ({}) };
  }
  if (m) {
    const d = db.get(`${m[1]}/${decodeURIComponent(m[2])}`);
    if (!d) return { ok: false, status: 404, json: async () => ({}) };
    return { ok: true, status: 200, json: async () => enc(d) };
  }
  return { ok: false, status: 404, json: async () => ({}) };
};
const reset = () => {
  db.clear();
  offline = false;
  lic.removeLicense();
};

test('trial -> activate a "*" key registers this device online and stays active offline afterwards', async () => {
  reset();
  assert.equal(lic.status().state, 'trial');
  db.set('licenseStatus/L1', { status: 'active', maxDevices: 1, deviceCount: 0, key: 'x' });
  const events = [];
  const off = lic.onChange((st) => events.push(st.state));
  const st = await lic.activate({ key: sign({ ...base, lid: 'L1', mid: '*' }) });
  assert.equal(st.state, 'active');
  assert.equal(st.device.registered, true);
  assert.ok(db.get(`devices/L1_${MID}`), 'device document created');
  assert.equal(db.get('licenseStatus/L1').deviceCount, 1);
  assert.ok(events.includes('active'), 'listeners notified');
  offline = true; // shop has no internet any more
  assert.equal(lic.status().usable, true, 'saved: does not ask again');
  assert.equal(await lic.onlineCheck(), null, 'silent when offline');
  assert.equal(lic.status().usable, true);
  off();
});

test('device limit: a second computer cannot use the same license', async () => {
  reset();
  db.set('licenseStatus/L2', { status: 'active', maxDevices: 1, deviceCount: 1, key: 'x' }); // another PC already registered
  await assert.rejects(() => lic.activate({ key: sign({ ...base, lid: 'L2', mid: '*' }) }), /already used on 1 device/);
  assert.notEqual(lic.status().state, 'active');
  assert.equal(lic.status().device, undefined, 'a key that cannot be used here is not kept');
  // provider raises the limit -> registration works
  db.set('licenseStatus/L2', { status: 'active', maxDevices: 2, deviceCount: 1, key: 'x' });
  const st = await lic.activate({ key: sign({ ...base, lid: 'L2', mid: '*' }) });
  assert.equal(st.state, 'active');
  assert.equal(db.get('licenseStatus/L2').deviceCount, 2);
});

test('a "*" key needs internet once', async () => {
  reset();
  db.set('licenseStatus/L3', { status: 'active', maxDevices: 1, deviceCount: 0, key: 'x' });
  offline = true;
  await assert.rejects(() => lic.activate({ key: sign({ ...base, lid: 'L3', mid: '*' }) }), /Internet is needed once/);
  const st = lic.status();
  assert.equal(st.state, 'unregistered');
  assert.equal(st.usable, false);
  offline = false;
  const ok = await lic.registerDevice();
  assert.equal(ok.state, 'active');
});

test('live control: block, suspend, un-block, remove device, revoke license', async () => {
  reset();
  db.set('licenseStatus/L4', { status: 'active', maxDevices: 1, deviceCount: 0, key: 'x' });
  await lic.activate({ key: sign({ ...base, lid: 'L4', mid: '*' }) });
  const seen = [];
  lic.onChange((st) => seen.push(st.state));
  const dev = () => db.get(`devices/L4_${MID}`);
  dev().status = 'blocked';
  let st = await lic.onlineCheck();
  assert.equal(st.state, 'blocked'); assert.equal(st.usable, false);
  dev().status = 'suspended';
  st = await lic.onlineCheck();
  assert.equal(st.state, 'suspended'); assert.equal(st.usable, false);
  dev().status = 'active';
  st = await lic.onlineCheck();
  assert.equal(st.state, 'active'); assert.equal(st.usable, true);
  db.delete(`devices/L4_${MID}`); // admin removed the device
  st = await lic.onlineCheck();
  assert.equal(st.state, 'unregistered'); assert.equal(st.usable, false);
  db.get('licenseStatus/L4').deviceCount = 0; // the admin panel frees the slot when removing a device
  st = await lic.registerDevice();
  assert.equal(st.state, 'active');
  db.get('licenseStatus/L4').status = 'revoked';
  st = await lic.onlineCheck();
  assert.equal(st.state, 'revoked'); assert.equal(st.usable, false);
  db.get('licenseStatus/L4').status = 'active';
  st = await lic.onlineCheck();
  assert.equal(st.state, 'active');
  assert.deepEqual([...new Set(seen)], ['blocked', 'suspended', 'active', 'unregistered', 'revoked']);
});

test('payment pending blocks with the admin message; suspended shows the admin message; active restores', async () => {
  reset();
  db.set('licenseStatus/L9', { status: 'active', maxDevices: 1, deviceCount: 0, key: 'x' });
  await lic.activate({ key: sign({ ...base, lid: 'L9', mid: '*' }) });
  db.get('licenseStatus/L9').status = 'pending';
  db.get('licenseStatus/L9').message = 'Please pay the March invoice';
  let st = await lic.onlineCheck();
  assert.equal(st.state, 'pending'); assert.equal(st.usable, false); assert.equal(st.message, 'Please pay the March invoice');
  db.get('licenseStatus/L9').status = 'suspended';
  db.get('licenseStatus/L9').message = 'Suspended for maintenance';
  st = await lic.onlineCheck();
  assert.equal(st.usable, false); assert.equal(st.message, 'Suspended for maintenance');
  db.get('licenseStatus/L9').status = 'active';
  db.get('licenseStatus/L9').message = '';
  st = await lic.onlineCheck();
  assert.equal(st.state, 'active'); assert.equal(st.usable, true);
});

test('renewal: a newer key for the same license is picked up automatically', async () => {
  reset();
  db.set('licenseStatus/L5', { status: 'active', maxDevices: 1, deviceCount: 0, key: 'x' });
  await lic.activate({ key: sign({ ...base, lid: 'L5', mid: '*', exp: '2030-01-01' }) });
  assert.equal(lic.status().expiresAt, '2030-01-01');
  db.get('licenseStatus/L5').key = sign({ ...base, lid: 'L5', mid: '*', exp: '2099-06-30' });
  const st = await lic.onlineCheck();
  assert.equal(st.expiresAt, '2099-06-30');
});

test('machine-locked key works offline and registers quietly when online', async () => {
  reset();
  offline = true;
  const st = await lic.activate({ key: sign({ ...base, lid: 'L6', mid: MID }) });
  assert.equal(st.state, 'active');
  await assert.rejects(() => lic.activate({ key: sign({ ...base, lid: 'L7', mid: '0000-0000-0000-0000' }) }), /issued for computer/);
  offline = false;
  db.set('licenseStatus/L6', { status: 'active', maxDevices: 1, deviceCount: 0, key: 'x' });
  await lic.onlineCheck();
  assert.ok(db.get(`devices/L6_${MID}`), 'registered after the first online check');
  assert.equal(lic.status().state, 'active');
});

test('expired and tampered keys are rejected', async () => {
  reset();
  await assert.rejects(() => lic.activate({ key: sign({ ...base, lid: 'L8', mid: '*', exp: '2020-01-01' }) }), /expired/);
  const good = sign({ ...base, lid: 'L9', mid: '*' });
  await assert.rejects(() => lic.activate({ key: good.replace(/\.(.)/, '.X') }), /invalid|damaged/i);
});

test.after(() => {
  globalThis.fetch = realFetch;
  fs.rmSync(ctx.paths.userData, { recursive: true, force: true });
});
