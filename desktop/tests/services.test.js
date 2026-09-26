'use strict';

// Service-level tests (run with: npm test). Uses a temp database; no Electron needed.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'rpos-test-'));
const ctx = require('../electron/core/context');
ctx.paths = { userData: tmp, dbFile: path.join(tmp, 'data', 'test.db'), backups: path.join(tmp, 'backups'), logs: path.join(tmp, 'logs'), temp: path.join(tmp, 'temp') };
fs.mkdirSync(ctx.paths.backups, { recursive: true });

const { Database } = require('../electron/db/database');
ctx.db = new Database(ctx.paths.dbFile);
const seed = require('../electron/db/seed');
const auth = require('../electron/services/auth');
const settings = require('../electron/services/settings');
const products = require('../electron/services/products');
const categories = require('../electron/services/categories');
const orders = require('../electron/services/orders');
const tables = require('../electron/services/tables');
const tokens = require('../electron/services/tokens');
const reports = require('../electron/services/reports');
const dashboard = require('../electron/services/dashboard');
const backup = require('../electron/services/backup');
const users = require('../electron/services/users');
const printService = require('../electron/printing/printService');
const { can } = require('../electron/core/permissions');

seed.ensureDefaults();

test('default admin can log in with password and PIN', () => {
  const u = auth.login({ username: 'admin', password: 'admin123' });
  assert.equal(u.role, 'admin');
  auth.logout();
  const loginUsers = auth.loginUsers();
  assert.ok(loginUsers.length >= 1);
  const u2 = auth.loginPin({ userId: loginUsers[0].id, pin: '1234' });
  assert.equal(u2.username, 'admin');
  assert.throws(() => auth.login({ username: 'admin', password: 'wrong' }), /Wrong username or password/);
});

test('demo data loads', () => {
  seed.loadDemo();
  assert.ok(products.list({}).length >= 20);
  assert.ok(categories.list().length >= 6);
  assert.equal(tables.list().length, 8);
});

test('Test 1: product -> sale -> payment -> receipt', () => {
  auth.login({ username: 'admin', password: 'admin123' });
  const id = products.save({ name: 'Test Burger', sale_price: 500, cost_price: 300, stock_qty: 10, category_id: categories.list()[0].id });
  const o = orders.save({ orderType: 'takeaway', action: 'pay', items: [{ productId: id, qty: 2, unitPrice: 500 }], payment: { method: 'cash', tendered: 1500 }, tokenMode: 'none' });
  assert.equal(o.status, 'completed');
  assert.equal(o.total, 1000);
  assert.equal(o.change_amount, 500);
  assert.equal(o.paid, 1000);
  assert.match(o.order_no, /^ORD-\d{6}$/);
  const html = printService.receiptHtml({ orderId: o.id });
  assert.match(html, /Test Burger/);
  assert.match(html, /ORD-/);
});

test('order numbers are unique and sequential', () => {
  const p = products.list({})[0];
  const a = orders.save({ orderType: 'takeaway', action: 'pay', items: [{ productId: p.id, qty: 1, unitPrice: p.sale_price }], payment: { method: 'cash' }, tokenMode: 'none' });
  const b = orders.save({ orderType: 'takeaway', action: 'pay', items: [{ productId: p.id, qty: 1, unitPrice: p.sale_price }], payment: { method: 'cash' }, tokenMode: 'none' });
  assert.notEqual(a.order_no, b.order_no);
  assert.equal(Number(b.order_no.slice(4)) - Number(a.order_no.slice(4)), 1);
});

test('Test 2: dine-in table hold -> add items -> settle frees table', () => {
  const t = tables.list()[0];
  const p = products.list({})[0];
  const held = orders.save({ orderType: 'dine_in', tableId: t.id, action: 'hold', items: [{ productId: p.id, qty: 1, unitPrice: p.sale_price }] });
  assert.equal(held.status, 'pending');
  assert.equal(tables.list().find((x) => x.id === t.id).status, 'occupied');
  assert.throws(() => orders.save({ orderType: 'dine_in', tableId: t.id, action: 'hold', items: [{ productId: p.id, qty: 1 }] }), /already has an open order/);
  const updated = orders.save({ id: held.id, orderType: 'dine_in', tableId: t.id, action: 'hold', items: [{ productId: p.id, qty: 3, unitPrice: p.sale_price }] });
  assert.equal(updated.items[0].qty, 3);
  const html = printService.receiptHtml({ orderId: held.id });
  assert.match(html, /BILL \(UNPAID\)/);
  const settled = orders.save({ id: held.id, orderType: 'dine_in', tableId: t.id, action: 'pay', items: [{ productId: p.id, qty: 3, unitPrice: p.sale_price }], payment: { method: 'card' } });
  assert.equal(settled.status, 'completed');
  assert.equal(tables.list().find((x) => x.id === t.id).status, 'available');
});

test('Test 3: takeaway token combined + item modes, daily numbering', () => {
  settings.set('token', { enabled: true, mode: 'combined', reset: 'daily', digits: 3 });
  const [p1, p2] = products.list({});
  const before = tokens.info().lastNumber;
  const o = orders.save({ orderType: 'takeaway', action: 'pay', items: [{ productId: p1.id, qty: 1 }, { productId: p2.id, qty: 2 }], payment: { method: 'cash' } });
  assert.equal(o.tokens.length, 1);
  assert.equal(Number(o.tokens[0].token_no), before + 1);
  assert.equal(o.tokens[0].token_no.length, 3);
  const o2 = orders.save({ orderType: 'takeaway', action: 'pay', items: [{ productId: p1.id, qty: 1 }, { productId: p2.id, qty: 2 }], payment: { method: 'cash' }, tokenMode: 'item' });
  assert.equal(o2.tokens.length, 2);
  const htmls = printService.tokenHtmls({ orderId: o2.id });
  assert.equal(htmls.length, 2);
  assert.match(htmls[0], /TOKEN/);
});

test('Test 4: delivery requires customer details and saves customer', () => {
  const p = products.list({})[0];
  assert.throws(() => orders.save({ orderType: 'delivery', action: 'pay', items: [{ productId: p.id, qty: 1 }], payment: { method: 'cash' } }), /Customer name is required/);
  const o = orders.save({
    orderType: 'delivery',
    action: 'pay',
    items: [{ productId: p.id, qty: 1, unitPrice: 450 }],
    customer: { name: 'Delivery Guy', mobile: '0300-7654321', address: 'Street 1, Lahore' },
    deliveryCharges: 100,
    payment: { method: 'cash', tendered: 600 },
    tokenMode: 'none',
  });
  assert.equal(o.total, 550);
  assert.equal(o.delivery_charges, 100);
  assert.equal(o.customer_mobile, '03007654321');
  assert.ok(o.customer_id);
  assert.match(printService.receiptHtml({ orderId: o.id }), /Street 1, Lahore/);
});

test('Test 5/6: inventory enabled reduces stock; disabled leaves it', () => {
  const id = products.save({ name: 'Stock Item', sale_price: 100, cost_price: 50, stock_qty: 20 });
  settings.set('inventory', { enabled: true, allowNegative: false });
  orders.save({ orderType: 'takeaway', action: 'pay', items: [{ productId: id, qty: 3 }], payment: { method: 'cash' }, tokenMode: 'none' });
  assert.equal(products.get({ id }).stock_qty, 17);
  assert.throws(() => orders.save({ orderType: 'takeaway', action: 'pay', items: [{ productId: id, qty: 50 }], payment: { method: 'cash' }, tokenMode: 'none' }), /Not enough stock/);
  settings.set('inventory', { enabled: false });
  orders.save({ orderType: 'takeaway', action: 'pay', items: [{ productId: id, qty: 50 }], payment: { method: 'cash' }, tokenMode: 'none' });
  assert.equal(products.get({ id }).stock_qty, 17);
});

test('refund returns stock', () => {
  const id = products.save({ name: 'Refund Item', sale_price: 100, stock_qty: 5 });
  settings.set('inventory', { enabled: true });
  const o = orders.save({ orderType: 'takeaway', action: 'pay', items: [{ productId: id, qty: 2 }], payment: { method: 'cash' }, tokenMode: 'none' });
  assert.equal(products.get({ id }).stock_qty, 3);
  orders.refund({ id: o.id, reason: 'test' });
  assert.equal(products.get({ id }).stock_qty, 5);
  settings.set('inventory', { enabled: false });
});

test('Test 7/8: cashier permissions restricted, admin full', () => {
  const cashier = ctx.db.get("SELECT * FROM users WHERE username = 'cashier'");
  assert.ok(can(cashier, 'pos'));
  assert.ok(!can(cashier, 'settings'));
  assert.ok(!can(cashier, 'reports'));
  assert.ok(!can(cashier, 'users'));
  const admin = ctx.db.get("SELECT * FROM users WHERE username = 'admin'");
  assert.ok(can(admin, 'settings') && can(admin, 'users') && can(admin, 'backup'));
  // Cashier with no discount permission cannot give discounts
  users.save({ id: cashier.id, name: 'Cashier', username: 'cashier', role: 'cashier', customPermissions: ['pos'] });
  auth.loginPin({ userId: cashier.id, pin: '1111' });
  const p = products.list({})[0];
  assert.throws(() => orders.save({ orderType: 'takeaway', action: 'pay', items: [{ productId: p.id, qty: 1 }], orderDiscount: 50, payment: { method: 'cash' } }), /permission to give discounts/);
  auth.login({ username: 'admin', password: 'admin123' });
});

test('credit sale records due; receive payment clears it', () => {
  const p = products.list({})[0];
  const o = orders.save({ orderType: 'takeaway', action: 'pay', items: [{ productId: p.id, qty: 1, unitPrice: 1000 }], customer: { name: 'Credit Customer' }, payment: { method: 'cash', tendered: 400 }, tokenMode: 'none' });
  assert.equal(o.due, 600);
  assert.equal(o.payment_status, 'partial');
  const o2 = orders.receivePayment({ id: o.id, amount: 600, method: 'cash' });
  assert.equal(o2.due, 0);
  assert.equal(o2.payment_status, 'paid');
});

test('all 6 receipt templates render at 58mm and 80mm with Urdu and logo', () => {
  const logo = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
  settings.set('business', { name: 'بسم اللہ بریانی', logo });
  const seen = new Set();
  for (const t of printService.TEMPLATES) {
    for (const w of [58, 80]) {
      const html = printService.receiptHtml({ sample: true, overrides: { receipt: { template: t.key, paperWidth: w } } });
      assert.match(html, new RegExp(`width:${w}mm`));
      assert.match(html, /بسم اللہ بریانی/);
      assert.match(html, /چکن بریانی/);
      assert.match(html, /<img src="data:image\/png/);
      assert.match(html, /RPOS Urdu/);
      if (w === 80) seen.add(html.replace(/\d+/g, ''));
    }
  }
  assert.equal(seen.size, 6, 'every template produces a distinct layout');
});

test('Test 14: reports match actual sales', () => {
  const today = require('../electron/core/util').localDate();
  const sum = ctx.db.get("SELECT SUM(total) t, COUNT(*) c FROM orders WHERE status = 'completed' AND business_date = ?", [today]);
  const r = reports.run({ key: 'sales', from: today, to: today });
  assert.equal(r.totals.total, Math.round(sum.t * 100) / 100);
  assert.equal(r.totals.orders, sum.c);
  const d = dashboard.summary();
  assert.equal(d.today.sales, r.totals.total);
  for (const rep of reports.REPORTS) {
    const out = reports.run({ key: rep.key, from: today, to: today });
    assert.ok(Array.isArray(out.rows), rep.key);
  }
  const pay = reports.run({ key: 'payments', from: today, to: today });
  const paidSum = ctx.db.get("SELECT SUM(p.amount) s FROM payments p JOIN orders o ON o.id = p.order_id WHERE o.status = 'completed'").s;
  assert.equal(pay.totals.amount, Math.round(paidSum * 100) / 100);
});

test('Test 13: backup -> reset -> restore', async () => {
  const before = ctx.db.get('SELECT COUNT(*) c FROM orders').c;
  const b = await backup.create({});
  assert.ok(fs.existsSync(b.file));
  seed.factoryReset();
  assert.equal(ctx.db.get('SELECT COUNT(*) c FROM orders').c, 0);
  await backup.restore({ file: b.file });
  assert.equal(ctx.db.get('SELECT COUNT(*) c FROM orders').c, before);
  assert.throws(() => backup.verifyFile(__filename), /not a valid Retail POS backup/);
});

test('Test 15: committed data survives an abrupt close (WAL)', () => {
  auth.login({ username: 'admin', password: 'admin123' });
  const p = products.list({})[0];
  const o = orders.save({ orderType: 'takeaway', action: 'pay', items: [{ productId: p.id, qty: 1 }], payment: { method: 'cash' }, tokenMode: 'none' });
  // Open a second, independent connection without closing the first (simulates crash before checkpoint).
  const { DatabaseSync } = require('node:sqlite');
  const other = new DatabaseSync(ctx.paths.dbFile, { readOnly: true });
  assert.equal(other.prepare('SELECT order_no FROM orders WHERE id = ?').get(o.id).order_no, o.order_no);
  other.close();
  // Failed transaction must not leave partial rows.
  const count = ctx.db.get('SELECT COUNT(*) c FROM order_items').c;
  assert.throws(() => orders.save({ orderType: 'takeaway', action: 'pay', items: [{ productId: p.id, qty: 1 }], payment: { method: 'nope' } }));
  assert.equal(ctx.db.get('SELECT COUNT(*) c FROM order_items').c, count);
  assert.ok(ctx.db.integrityCheck());
});

test('license: key signed with private key verifies; tampered key rejected', () => {
  const crypto = require('crypto');
  const { privateKey, publicKey } = crypto.generateKeyPairSync('ec', { namedCurve: 'P-256' });
  const payload = Buffer.from(JSON.stringify({ v: 1, lid: 'L1', cid: 'C1', bn: 'Shop', mid: '*', plan: 'yearly', iat: '2026-01-01', exp: '2099-01-01', mu: 3 })).toString('base64url');
  const sig = crypto.sign('sha256', Buffer.from(payload), { key: privateKey, dsaEncoding: 'ieee-p1363' }).toString('base64url');
  const pem = publicKey.export({ type: 'spki', format: 'pem' });
  const ok = crypto.verify('sha256', Buffer.from(payload), { key: pem, dsaEncoding: 'ieee-p1363' }, Buffer.from(sig, 'base64url'));
  assert.ok(ok);
  const bad = crypto.verify('sha256', Buffer.from(payload + 'x'), { key: pem, dsaEncoding: 'ieee-p1363' }, Buffer.from(sig, 'base64url'));
  assert.ok(!bad);
});

test.after(() => {
  ctx.db.close();
  fs.rmSync(tmp, { recursive: true, force: true });
});
