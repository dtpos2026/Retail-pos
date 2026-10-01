'use strict';

// Heartbeat falls back to fewer fields when the server rules are older, so "last seen" always gets through.
const test = require('node:test');
const assert = require('node:assert');

const cfgPath = require.resolve('../electron/license/config.js');
require.cache[cfgPath] = { id: cfgPath, filename: cfgPath, loaded: true, exports: { PUBLIC_KEY_PEM: '', TRIAL_DAYS: 0, FIREBASE: { projectId: 'demo', apiKey: 'k' }, VENDOR: { name: 'V', email: 'v@x' } } };
const cloud = require('../electron/license/cloud.js');
const sysinfo = require('../electron/license/sysinfo.js');

const realFetch = globalThis.fetch;
let allowed = null; // set of field names the fake server accepts
const bodies = [];
globalThis.fetch = async (url, opts = {}) => {
  const w = JSON.parse(opts.body).writes[0];
  const keys = Object.keys(w.update.fields);
  bodies.push(keys);
  const bad = keys.filter((k) => !allowed.has(k));
  return bad.length ? { ok: false, status: 403, json: async () => ({ error: { message: 'denied' } }) } : { ok: true, status: 200, json: async () => ({}) };
};
test.after(() => { globalThis.fetch = realFetch; });

const extra = { hostname: 'PC', ownerName: 'Ali', gpsLat: 31.5, gpsLng: 74.3, gpsAcc: 20, gpsStatus: 'ok', publicIp: '1.2.3.4', city: 'Lahore' };
const base = ['name', 'os', 'appVersion'];

test('current rules: everything goes in one request', async () => {
  allowed = new Set([...base, 'hostname', 'ownerName', 'gpsLat', 'gpsLng', 'gpsAcc', 'gpsStatus', 'publicIp', 'city']);
  bodies.length = 0;
  assert.equal(await cloud.heartbeat({ lid: 'L', machineId: 'M', version: '1', extra }), 0);
  assert.equal(bodies.length, 1);
});

test('rules without gpsStatus: second try works (tier 1)', async () => {
  allowed = new Set([...base, 'hostname', 'ownerName', 'gpsLat', 'gpsLng', 'gpsAcc', 'publicIp', 'city']);
  bodies.length = 0;
  assert.equal(await cloud.heartbeat({ lid: 'L', machineId: 'M', version: '1', extra }), 1);
  assert.ok(bodies[1].includes('gpsLat') && !bodies[1].includes('gpsStatus'));
});

test('old rules without gps/owner: still reports IP location (tier 2)', async () => {
  allowed = new Set([...base, 'hostname', 'publicIp', 'city']);
  assert.equal(await cloud.heartbeat({ lid: 'L', machineId: 'M', version: '1', extra }), 2);
});

test('very old rules: only name / os / version, but the heartbeat still lands (tier 3)', async () => {
  allowed = new Set(base);
  assert.equal(await cloud.heartbeat({ lid: 'L', machineId: 'M', version: '1', extra }), 3);
});

test('network down is not retried with fewer fields', async () => {
  const f = globalThis.fetch;
  let n = 0;
  globalThis.fetch = async () => { n++; throw new Error('offline'); };
  await assert.rejects(() => cloud.heartbeat({ lid: 'L', machineId: 'M', version: '1', extra }), /No internet/);
  assert.equal(n, 1);
  globalThis.fetch = f;
});

test('Windows location answers are understood', () => {
  assert.deepEqual(sysinfo.parseGps('OK,31.5204,74.3587,35\r\n'), { fix: { gpsLat: 31.5204, gpsLng: 74.3587, gpsAcc: 35 }, status: 'ok' });
  assert.equal(sysinfo.parseGps('NO,Denied,Ready').status, 'denied');
  assert.equal(sysinfo.parseGps('NO,Granted,Disabled').status, 'off');
  assert.equal(sysinfo.parseGps('NO,Granted,NoData').status, 'nodata');
  assert.equal(sysinfo.parseGps('OK,999,74,1').status, 'error');
  assert.equal(sysinfo.parseGps('').status, 'error');
});

test('IP location from either service', () => {
  assert.equal(sysinfo.parseGeo('ipwho', { success: true, ip: '1.1.1.1', city: 'Karachi', latitude: 24.86, longitude: 67, connection: { isp: 'PTCL' } }).ipLat, 24.86);
  assert.equal(sysinfo.parseGeo('ipwho', { success: false }), null);
  assert.equal(sysinfo.parseGeo('geojs', { ip: '2.2.2.2', latitude: '31.5', longitude: '74.3', organization_name: 'Nayatel' }).isp, 'Nayatel');
});
