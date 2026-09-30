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
  // (full activation / device / block logic is covered in ../tests/license.test.js)
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
  const realFetch = globalThis.fetch;
  globalThis.fetch = async () => { throw new Error('offline'); }; // machine-locked keys activate offline
  const st = await lic.activate({ key });
  assert.equal(st.state, 'active');
  assert.equal(st.maxUsers, 2);
  const other = await signLicense(privateJwk, { lid: 'L10', cid: 'C9', bn: 'Test Shop', mid: '0000-0000-0000-0000', plan: 'yearly', iat: '2026-01-01', exp: null, mu: 0 });
  await assert.rejects(() => lic.activate({ key: other }), /issued for computer/);
  const expired = await signLicense(privateJwk, { lid: 'L11', cid: 'C9', bn: 'Test Shop', mid: '*', plan: 'monthly', iat: '2020-01-01', exp: '2020-02-01', mu: 0 });
  await assert.rejects(() => lic.activate({ key: expired }), /expired/);
  globalThis.fetch = realFetch;

});

test('plan expiry and machine id helpers', () => {
  assert.equal(expiryFor('monthly', '2026-01-31'), '2026-02-28');
  assert.equal(expiryFor('yearly', '2026-09-26'), '2027-09-26');
  assert.equal(expiryFor('lifetime', '2026-09-26'), null);
  assert.equal(expiryFor('trial', '2026-09-26'), '2026-10-03');
  assert.equal(normalizeMachineId('aaaabbbbccccdddd'), 'AAAA-BBBB-CCCC-DDDD');
});
