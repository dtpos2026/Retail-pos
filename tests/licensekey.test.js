'use strict';

// Installed builds have no key inside; they download the provider's public key once and then require a license from the first launch.
const test = require('node:test');
const assert = require('node:assert');
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');

const { privateKey, publicKey } = crypto.generateKeyPairSync('ec', { namedCurve: 'P-256' });
const pem = publicKey.export({ type: 'spki', format: 'pem' });
const cfgPath = require.resolve('../electron/license/config.js');
require.cache[cfgPath] = { id: cfgPath, filename: cfgPath, loaded: true, exports: { PUBLIC_KEY_PEM: '', TRIAL_DAYS: 0, FIREBASE: { projectId: 'demo', apiKey: 'k' }, VENDOR: { name: 'V', email: 'v@x' } } };
const elPath = require.resolve('electron');
require.cache[elPath] = { id: elPath, filename: elPath, loaded: true, exports: { app: { isPackaged: true } } };
const ctx = require('../electron/core/context');
ctx.paths.userData = fs.mkdtempSync(path.join(os.tmpdir(), 'rpos-key-'));
const lic = require('../electron/license/license.js');

let published = true;
let online = true;
const realFetch = globalThis.fetch;
globalThis.fetch = async (url) => {
  if (!online) throw new Error('down');
  if (String(url).includes('/publicConfig/signing')) {
    return published ? { ok: true, status: 200, json: async () => ({ fields: { publicPem: { stringValue: pem } } }) } : { ok: false, status: 404, json: async () => ({}) };
  }
  return { ok: false, status: 404, json: async () => ({}) };
};

test('installed build without a key is locked until it downloads the public key', async () => {
  assert.equal(lic.status().state, 'needs_key');
  assert.equal(lic.status().usable, false);
  online = false;
  await assert.rejects(() => lic.activate({ key: 'RPOS1.a.b' }), /internet/i);
  online = true;
  published = false;
  assert.equal(await lic.ensureKey(), false);
  published = true;
  assert.equal(await lic.ensureKey(), true);
  assert.equal(fs.existsSync(path.join(ctx.paths.userData, 'license-key.pem')), true);
});

test('with the key downloaded, a license key is required from the very first launch (no trial)', () => {
  const st = lic.status();
  assert.equal(st.state, 'unlicensed');
  assert.equal(st.usable, false);
  const forged = Buffer.from(JSON.stringify({ v: 1, lid: 'X', mid: '*', exp: null })).toString('base64url');
  assert.throws(() => lic.decode(`RPOS1.${forged}.AAAA`), /invalid|not issued/i);
  const body = Buffer.from(JSON.stringify({ v: 1, lid: 'X', cid: 'C', bn: 'Shop', mid: '*', plan: 'p', iat: '2026-01-01', exp: null, mu: 0 })).toString('base64url');
  const sig = crypto.sign('sha256', Buffer.from(body), { key: privateKey, dsaEncoding: 'ieee-p1363' }).toString('base64url');
  assert.equal(lic.decode(`RPOS1.${body}.${sig}`).payload.lid, 'X');
});

test.after(() => {
  globalThis.fetch = realFetch;
});
