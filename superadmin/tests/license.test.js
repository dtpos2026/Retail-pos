// Cross-check: keys signed by the Super Admin panel verify in the desktop app.
import test from 'node:test';
import assert from 'node:assert';
import { createRequire } from 'node:module';
import crypto from 'node:crypto';
import { generateKeyPair, signLicense, verifyLicense, expiryFor, normalizeMachineId } from '../src/lib/license.js';

const require = createRequire(import.meta.url);

test('panel-signed key verifies with desktop algorithm', async () => {
  const { privateJwk, publicPem } = await generateKeyPair();
  const key = await signLicense(privateJwk, { lid: 'abc', cid: 'c1', bn: 'کراچی بریانی', mid: 'AAAA-BBBB-CCCC-DDDD', plan: 'yearly', iat: '2026-01-01', exp: '2027-01-01', mu: 3 });
  const [, body, sig] = key.split('.');
  const ok = crypto.verify('sha256', Buffer.from(body), { key: publicPem, dsaEncoding: 'ieee-p1363' }, Buffer.from(sig, 'base64url'));
  assert.ok(ok, 'node crypto verifies WebCrypto signature');
  const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
  assert.equal(payload.bn, 'کراچی بریانی');
  assert.deepEqual((await verifyLicense(publicPem, key)).lid, 'abc');
  const tampered = key.replace(/\.(.)/, '.X');
  assert.equal(await verifyLicense(publicPem, tampered), null);
});

test('desktop license module accepts panel key', async () => {
  const { privateJwk, publicPem } = await generateKeyPair();
  const cfgPath = require.resolve('../../electron/license/config.js');
  require.cache[cfgPath] = { id: cfgPath, filename: cfgPath, loaded: true, exports: { PUBLIC_KEY_PEM: publicPem, TRIAL_DAYS: 7, FIREBASE: { projectId: 'x', apiKey: 'y' }, VENDOR: {} } };
  const ctx = require('../../electron/core/context.js');
  const fs = require('node:fs');
  const os = require('node:os');
  ctx.paths.userData = fs.mkdtempSync(os.tmpdir() + '/rpos-lic-');
  const lic = require('../../electron/license/license.js');
  assert.equal(lic.status().state, 'trial');
  const mid = lic.machineId();
  const key = await signLicense(privateJwk, { lid: 'L9', cid: 'C9', bn: 'Test Shop', mid, plan: 'yearly', iat: '2026-01-01', exp: '2099-12-31', mu: 2 });
  const st = lic.activate({ key });
  assert.equal(st.state, 'active');
  assert.equal(st.maxUsers, 2);
  const other = await signLicense(privateJwk, { lid: 'L10', cid: 'C9', bn: 'Test Shop', mid: '0000-0000-0000-0000', plan: 'yearly', iat: '2026-01-01', exp: null, mu: 0 });
  assert.throws(() => lic.activate({ key: other }), /issued for computer/);
  const expired = await signLicense(privateJwk, { lid: 'L11', cid: 'C9', bn: 'Test Shop', mid: '*', plan: 'monthly', iat: '2020-01-01', exp: '2020-02-01', mu: 0 });
  assert.throws(() => lic.activate({ key: expired }), /expired/);

  // Online check: renewal (new key, same lid) is picked up; revocation disables; reactivation restores.
  const renewed = await signLicense(privateJwk, { lid: 'L9', cid: 'C9', bn: 'Test Shop', mid, plan: 'yearly', iat: '2026-06-01', exp: '2100-12-31', mu: 5 });
  let remote = { status: 'active', key: renewed };
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (url) => {
    assert.match(String(url), /licenseStatus\/L9/);
    return { ok: true, status: 200, json: async () => ({ fields: { status: { stringValue: remote.status }, key: { stringValue: remote.key } } }) };
  };
  try {
    let s = await lic.onlineCheck();
    assert.equal(s.expiresAt, '2100-12-31');
    assert.equal(s.maxUsers, 5);
    remote = { status: 'revoked', key: renewed };
    s = await lic.onlineCheck();
    assert.equal(s.state, 'revoked');
    assert.equal(s.usable, false);
    remote = { status: 'active', key: renewed };
    s = await lic.onlineCheck();
    assert.equal(s.state, 'active');
    // Offline: network error leaves state untouched.
    globalThis.fetch = async () => { throw new Error('offline'); };
    assert.equal(await lic.onlineCheck(), null);
    assert.equal(lic.status().state, 'active');
  } finally {
    globalThis.fetch = realFetch;
  }
});

test('plan expiry and machine id helpers', () => {
  assert.equal(expiryFor('monthly', '2026-01-31'), '2026-02-28');
  assert.equal(expiryFor('yearly', '2026-09-26'), '2027-09-26');
  assert.equal(expiryFor('lifetime', '2026-09-26'), null);
  assert.equal(expiryFor('trial', '2026-09-26'), '2026-10-03');
  assert.equal(normalizeMachineId('aaaabbbbccccdddd'), 'AAAA-BBBB-CCCC-DDDD');
});
