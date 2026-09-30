const assert = require('assert');
process.env.RPOS_FIRESTORE_URL = 'http://127.0.0.1:8080/v1/projects/retail-pos-db7c6/databases/(default)/documents';
const cloud = require('../../electron/license/cloud.js');
const AUTH = 'http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1';
const base = process.env.RPOS_FIRESTORE_URL;
const j = (r) => r.json();
async function adminToken() {
  await fetch(`${AUTH}/accounts:signUp?key=k`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: 'digitaltarget.digital@gmail.com', password: 'Secret#123', returnSecureToken: true }) });
  const s = await j(await fetch(`${AUTH}/accounts:signInWithPassword?key=k`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: 'digitaltarget.digital@gmail.com', password: 'Secret#123', returnSecureToken: true }) }));
  await fetch(`${AUTH}/projects/retail-pos-db7c6/accounts:update`, { method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer owner' }, body: JSON.stringify({ localId: s.localId, emailVerified: true }) });
  const t = await j(await fetch(`${AUTH}/accounts:signInWithPassword?key=k`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: 'digitaltarget.digital@gmail.com', password: 'Secret#123', returnSecureToken: true }) }));
  return t.idToken;
}
const S = (v) => ({ stringValue: v });
async function main() {
  const tok = await adminToken();
  const H = { 'content-type': 'application/json', authorization: `Bearer ${tok}` };
  const admin = {
    set: (path, fields) => fetch(`${base}/${path}`, { method: 'PATCH', headers: H, body: JSON.stringify({ fields }) }),
    patch: (path, fields, mask) => fetch(`${base}/${path}?${mask.map((m) => `updateMask.fieldPaths=${m}`).join('&')}`, { method: 'PATCH', headers: H, body: JSON.stringify({ fields }) }),
    del: (path) => fetch(`${base}/${path}`, { method: 'DELETE', headers: H }),
  };
  const r0 = await admin.set('licenseStatus/L1', { status: S('active'), key: S('k1'), maxDevices: { integerValue: '1' }, deviceCount: { integerValue: '0' } });
  assert.equal(r0.status, 200, 'admin can create licenseStatus');

  // public key: anyone can read it, only the head admin can publish it
  const pk = await admin.set('publicConfig/signing', { publicPem: S('-----BEGIN PUBLIC KEY-----\nX\n-----END PUBLIC KEY-----') });
  assert.equal(pk.status, 200, 'head admin can publish the public key');
  const got = await cloud.getPublicKey();
  assert.ok(got && got.publicPem.includes('BEGIN PUBLIC KEY'), 'POS can read the public key without signing in');
  const anon = await fetch(`${base}/publicConfig/signing`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ fields: { publicPem: S('evil') } }) });
  assert.notEqual(anon.status, 200, 'anonymous cannot overwrite the public key');
  console.log('OK   public key readable by POS, writable by head admin only');

  // support: shop posts + reads its thread, cannot impersonate admin, cannot list threads
  await cloud.sendMessage({ lid: 'L1', businessName: 'Shop', text: 'Hello from the shop' });
  const thread = await cloud.listMessages('L1');
  assert.equal(thread.length, 1); assert.equal(thread[0].from, 'shop'); assert.equal(thread[0].text, 'Hello from the shop');
  const fake = await fetch(`${base}/supportThreads/L1/messages`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ fields: { from: S('admin'), text: S('pay me'), businessName: S('x') } }) });
  assert.notEqual(fake.status, 200, 'shop cannot post as admin');
  const lst = await fetch(`${base}/supportThreads`);
  assert.notEqual(lst.status, 200, 'threads cannot be listed without sign-in');
  const noLic = await fetch(`${base}:commit`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ writes: [{ update: { name: `projects/retail-pos-db7c6/databases/(default)/documents/supportThreads/NOPE`, fields: { businessName: S('x'), lastText: S('hi'), unreadAdmin: { booleanValue: true } } }, updateTransforms: [{ fieldPath: 'lastAt', setToServerValue: 'REQUEST_TIME' }] }] }) });
  assert.notEqual(noLic.status, 200, 'thread needs an existing license');
  const adminReply = await fetch(`${base}/supportThreads/L1/messages`, { method: 'POST', headers: H, body: JSON.stringify({ fields: { from: S('admin'), text: S('Answer'), createdAt: { timestampValue: new Date().toISOString() } } }) });
  assert.equal(adminReply.status, 200, 'admin can reply');
  assert.equal((await cloud.listMessages('L1')).length, 2);
  console.log('OK   support thread: shop posts/reads, cannot impersonate or list; admin replies');

  // billing: staff only, public verification record by code
  assert.equal((await admin.set('invoices/I1', { invoiceNo: S('DT-2026-0001') })).status, 200);
  assert.equal((await admin.set('invoiceVerify/ABCDEFGH23456789', { invoiceNo: S('DT-2026-0001'), restaurant: S('Shop') })).status, 200);
  assert.equal((await fetch(`${base}/invoiceVerify/ABCDEFGH23456789`)).status, 200, 'anyone with the code can verify');
  assert.notEqual((await fetch(`${base}/invoiceVerify`)).status, 200, 'verification records cannot be listed');
  assert.notEqual((await fetch(`${base}/invoices/I1`)).status, 200, 'invoices are staff only');
  assert.equal((await admin.set('licenseStatus/L1', { status: S('pending'), message: S('Payment due'), key: S('k1'), maxDevices: { integerValue: '1' }, deviceCount: { integerValue: '0' } })).status, 200);
  const pst = await cloud.fetchState('L1', 'ZZZZ');
  assert.equal(pst.license.status, 'pending'); assert.equal(pst.license.message, 'Payment due');
  assert.equal((await admin.set('licenseStatus/L1', { status: S('active'), message: S(''), key: S('k1'), maxDevices: { integerValue: '1' }, deviceCount: { integerValue: '0' } })).status, 200);
  console.log('OK   invoices staff-only; verify record public by code; pending status + message readable by POS');

  // 1) first device registers
  const a = await cloud.registerDevice({ lid: 'L1', machineId: 'AAAA-AAAA-AAAA-AAAA', businessName: 'Shop', version: '1.1.0' });
  assert.equal(a.status, 'active'); assert.equal(a.created, true); console.log('OK   first device registered');
  // idempotent
  const a2 = await cloud.registerDevice({ lid: 'L1', machineId: 'AAAA-AAAA-AAAA-AAAA', businessName: 'Shop', version: '1.1.0' });
  assert.equal(a2.created, false); console.log('OK   re-registering same device is idempotent');
  // 2) second device refused (client check)
  await assert.rejects(() => cloud.registerDevice({ lid: 'L1', machineId: 'BBBB-BBBB-BBBB-BBBB', businessName: 'Shop', version: '1.1.0' }), (e) => e.code === 'DEVICE_LIMIT');
  console.log('OK   second device refused: limit 1');
  // 3) bypass attempt: skip the client check and commit directly -> rules must reject
  const bypass = await fetch(`${base}:commit`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ writes: [
    { update: { name: 'projects/retail-pos-db7c6/databases/(default)/documents/licenseStatus/L1', fields: { deviceCount: { integerValue: '2' }, lastDevice: S('BBBB-BBBB-BBBB-BBBB') } }, updateMask: { fieldPaths: ['deviceCount', 'lastDevice'] }, currentDocument: { exists: true } },
    { update: { name: 'projects/retail-pos-db7c6/databases/(default)/documents/devices/L1_BBBB-BBBB-BBBB-BBBB', fields: { licenseId: S('L1'), machineId: S('BBBB-BBBB-BBBB-BBBB'), name: S('x'), os: S('x'), appVersion: S('1'), status: S('active'), businessName: S('Shop') } }, updateTransforms: [{ fieldPath: 'firstSeen', setToServerValue: 'REQUEST_TIME' }, { fieldPath: 'lastSeen', setToServerValue: 'REQUEST_TIME' }], currentDocument: { exists: false } },
  ] }) });
  assert.equal(bypass.status, 403); console.log('OK   rules reject a bypass beyond the device limit');
  // counter bump without a device doc is rejected
  const bump = await fetch(`${base}/licenseStatus/L1?updateMask.fieldPaths=deviceCount&updateMask.fieldPaths=lastDevice`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ fields: { deviceCount: { integerValue: '1' }, lastDevice: S('ZZZZ') } }) });
  assert.equal(bump.status, 403); console.log('OK   counter cannot be changed without a device document');
  // 4) POS cannot change its own status, admin can block
  const selfUnblock = await fetch(`${base}/devices/L1_AAAA-AAAA-AAAA-AAAA?updateMask.fieldPaths=status`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ fields: { status: S('blocked') } }) });
  assert.equal(selfUnblock.status, 403); console.log('OK   POS cannot modify its own status');
  await cloud.heartbeat({ lid: 'L1', machineId: 'AAAA-AAAA-AAAA-AAAA', version: '1.1.1' }); console.log('OK   heartbeat allowed');
  assert.equal((await admin.patch('devices/L1_AAAA-AAAA-AAAA-AAAA', { status: S('blocked') }, ['status'])).status, 200);
  let st = await cloud.fetchState('L1', 'AAAA-AAAA-AAAA-AAAA'); assert.equal(st.device.status, 'blocked'); console.log('OK   admin blocked device -> POS sees "blocked"');
  await admin.patch('devices/L1_AAAA-AAAA-AAAA-AAAA', { status: S('suspended') }, ['status']);
  st = await cloud.fetchState('L1', 'AAAA-AAAA-AAAA-AAAA'); assert.equal(st.device.status, 'suspended');
  await admin.patch('devices/L1_AAAA-AAAA-AAAA-AAAA', { status: S('active') }, ['status']);
  st = await cloud.fetchState('L1', 'AAAA-AAAA-AAAA-AAAA'); assert.equal(st.device.status, 'active'); console.log('OK   suspended -> active again');
  // 5) admin raises the limit; B registers
  await admin.patch('licenseStatus/L1', { maxDevices: { integerValue: '2' } }, ['maxDevices']);
  const b = await cloud.registerDevice({ lid: 'L1', machineId: 'BBBB-BBBB-BBBB-BBBB', businessName: 'Shop', version: '1.1.0' }); assert.equal(b.created, true); console.log('OK   limit raised to 2 -> second device registers');
  // 6) race: limit 3, count 2 -> two devices at once, exactly one wins
  await admin.patch('licenseStatus/L1', { maxDevices: { integerValue: '3' } }, ['maxDevices']);
  const race = await Promise.allSettled(['CCCC-CCCC-CCCC-CCCC', 'DDDD-DDDD-DDDD-DDDD'].map((m) => cloud.registerDevice({ lid: 'L1', machineId: m, businessName: 'Shop', version: '1' })));
  const wins = race.filter((x) => x.status === 'fulfilled').length; assert.equal(wins, 1, `race wins=${wins}`); console.log('OK   simultaneous registrations: exactly 1 succeeds');
  // 7) admin removes device and frees slot
  await admin.del('devices/L1_BBBB-BBBB-BBBB-BBBB');
  await admin.patch('licenseStatus/L1', { deviceCount: { integerValue: '2' } }, ['deviceCount']);
  st = await cloud.fetchState('L1', 'BBBB-BBBB-BBBB-BBBB'); assert.equal(st.device, null); console.log('OK   removed device disappears (POS will show "removed")');
  // 8) revoked license cannot register
  await admin.patch('licenseStatus/L1', { status: S('revoked') }, ['status']);
  await assert.rejects(() => cloud.registerDevice({ lid: 'L1', machineId: 'EEEE-EEEE-EEEE-EEEE', businessName: 'Shop', version: '1' }), (e) => e.code === 'INACTIVE'); console.log('OK   revoked license cannot register new devices');
  console.log('ALL DEVICE TESTS PASSED');
}
main().catch((e) => { console.error('FAIL', e); process.exit(1); });
