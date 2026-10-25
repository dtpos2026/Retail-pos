'use strict';

// Remote password reset (provider -> POS) and the sales totals sent to the provider.
const test = require('node:test');
const assert = require('node:assert');
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'rpos-reset-'));
const ctx = require('../electron/core/context');
ctx.paths = { userData: tmp, dbFile: path.join(tmp, 'data', 'test.db'), backups: path.join(tmp, 'backups'), logs: path.join(tmp, 'logs'), temp: path.join(tmp, 'temp') };
fs.mkdirSync(ctx.paths.backups, { recursive: true });
const { Database } = require('../electron/db/database');
ctx.db = new Database(ctx.paths.dbFile);
const seed = require('../electron/db/seed');
const auth = require('../electron/services/auth');
const users = require('../electron/services/users');
const products = require('../electron/services/products');
const orders = require('../electron/services/orders');
const dashboard = require('../electron/services/dashboard');
const { localDate, addDays } = require('../electron/core/util');

seed.ensureDefaults();
auth.login({ username: 'admin', password: 'admin123' });

// exactly what the Super Admin panel (WebCrypto PBKDF2) produces
const pbkdf2 = (secret, iter = 210000) => {
  const salt = crypto.randomBytes(16);
  return `pbkdf2$${iter}$${salt.toString('hex')}$${crypto.pbkdf2Sync(secret, salt, iter, 32, 'sha256').toString('hex')}`;
};

test('a reset from the provider sets a new password and PIN; old ones stop working; hashes are upgraded', () => {
  users.save({ name: 'Ali', username: 'ali', password: 'ali-old-1', pin: '4321', role: 'cashier' });
  const r = auth.applyRemoteReset({ username: 'ALI', passwordHash: pbkdf2('NewPass#9'), pinHash: pbkdf2('7788') });
  assert.equal(r.ok, true);
  assert.equal(r.username, 'ali');
  auth.logout();
  assert.throws(() => auth.login({ username: 'ali', password: 'ali-old-1' }), /Wrong username or password/);
  const u = auth.login({ username: 'ali', password: 'NewPass#9' });
  assert.equal(u.username, 'ali');
  assert.match(ctx.db.get("SELECT password_hash h FROM users WHERE username = 'ali'").h, /^scrypt\$/, 'upgraded to scrypt after the first sign-in');
  auth.logout();
  const id = ctx.db.get("SELECT id FROM users WHERE username = 'ali'").id;
  assert.throws(() => auth.loginPin({ userId: id, pin: '4321' }), /Wrong PIN/);
  assert.equal(auth.loginPin({ userId: id, pin: '7788' }).username, 'ali');
  assert.match(ctx.db.get("SELECT pin_hash h FROM users WHERE username = 'ali'").h, /^scrypt\$/);
});

test('a reset clears the brute-force lock so the user can sign in at once', () => {
  auth.logout();
  for (let i = 0; i < 5; i++) assert.throws(() => auth.login({ username: 'ali', password: 'nope' }));
  assert.throws(() => auth.login({ username: 'ali', password: 'NewPass#9' }), /Too many wrong attempts/);
  auth.applyRemoteReset({ username: 'ali', passwordHash: pbkdf2('Another#1') });
  assert.equal(auth.login({ username: 'ali', password: 'Another#1' }).username, 'ali');
});

test('removePin drops the PIN login; bad or unknown requests change nothing', () => {
  const before = ctx.db.get("SELECT password_hash h, pin_hash p FROM users WHERE username = 'ali'");
  assert.equal(auth.applyRemoteReset({ username: 'ghost', passwordHash: pbkdf2('x1x1x1') }).ok, false);
  assert.equal(auth.applyRemoteReset({ username: 'ali', passwordHash: 'plain-text-password' }).ok, false);
  assert.equal(auth.applyRemoteReset({ username: 'ali', passwordHash: pbkdf2('okok11'), pinHash: 'scrypt$aa$bb' }).ok, false);
  assert.equal(auth.applyRemoteReset({ username: '', passwordHash: pbkdf2('okok11') }).ok, false);
  assert.deepEqual(ctx.db.get("SELECT password_hash h, pin_hash p FROM users WHERE username = 'ali'"), before);
  assert.equal(auth.applyRemoteReset({ username: 'ali', passwordHash: pbkdf2('okok11'), removePin: true }).ok, true);
  assert.equal(ctx.db.get("SELECT pin_hash p FROM users WHERE username = 'ali'").p, null);
});

test('a hash with weak settings or a wrong secret never verifies', () => {
  assert.equal(auth.verifySecret('x', 'pbkdf2$1$aa$bb'), false);
  assert.equal(auth.verifySecret('x', 'pbkdf2$210000$' + 'ab'.repeat(16) + '$' + 'cd'.repeat(32)), false);
  assert.equal(auth.verifySecret('', ''), false);
});

test('sales totals: today, this month and the last 14 days — completed orders only, no single orders', () => {
  auth.login({ username: 'admin', password: 'admin123' });
  const p = products.save({ name: 'Item', sale_price: 1000 });
  const pid = typeof p === 'object' ? p.id : p;
  const sale = (price) => orders.save({ orderType: 'takeaway', action: 'pay', items: [{ productId: pid, qty: 1, unitPrice: price }], payment: { method: 'cash', tendered: price }, tokenMode: 'none' });
  const a = sale(1000);
  const b = sale(2500);
  const c = sale(700);
  const gone = orders.save({ orderType: 'takeaway', action: 'hold', items: [{ productId: pid, qty: 1, unitPrice: 9999 }] });
  orders.cancel({ id: gone.id, reason: 'test' });
  const d = sale(300);
  orders.refund({ id: d.id, reason: 'test' });
  const today = localDate();
  const yesterday = addDays(today, -1);
  const oldDay = addDays(today, -40);
  ctx.db.run('UPDATE orders SET business_date = ? WHERE id = ?', [yesterday, c.id]);
  const e = sale(5000);
  ctx.db.run('UPDATE orders SET business_date = ? WHERE id = ?', [oldDay, e.id]);
  const t = dashboard.salesTotals();
  assert.equal(t.date, today);
  assert.equal(t.today, 3500);
  const inMonth = (dt) => dt.slice(0, 7) === today.slice(0, 7);
  assert.equal(t.month, 3500 + (inMonth(yesterday) ? 700 : 0));
  assert.match(t.days, new RegExp(`${today.slice(5)}:3500`));
  assert.match(t.days, new RegExp(`${yesterday.slice(5)}:700`));
  assert.ok(!t.days.includes(oldDay.slice(5)), 'older than 14 days is not listed');
  assert.ok(t.days.length < 400);
  assert.ok(![a, b].some((o) => !o.id));
});

test('salesTotals handles a month boundary and an empty day', () => {
  const t = dashboard.salesTotals(new Date(2026, 0, 1)); // 1 Jan: month = just today, nothing sold
  assert.deepEqual({ date: t.date, today: t.today, month: t.month, days: t.days }, { date: '2026-01-01', today: 0, month: 0, days: '' });
});

test.after(() => {
  try { ctx.db.close(); } catch { /* ignore */ }
  fs.rmSync(tmp, { recursive: true, force: true });
});
