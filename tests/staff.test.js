'use strict';

// Waiters (dine-in) and riders (delivery) on orders, receipts, KOT and reports.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'rpos-staff-'));
const ctx = require('../electron/core/context');
ctx.paths = { userData: tmp, dbFile: path.join(tmp, 'data', 'test.db'), backups: path.join(tmp, 'backups'), logs: path.join(tmp, 'logs'), temp: path.join(tmp, 'temp') };
fs.mkdirSync(ctx.paths.backups, { recursive: true });
const { Database } = require('../electron/db/database');
ctx.db = new Database(ctx.paths.dbFile);
const seed = require('../electron/db/seed');
const auth = require('../electron/services/auth');
const products = require('../electron/services/products');
const orders = require('../electron/services/orders');
const tables = require('../electron/services/tables');
const staff = require('../electron/services/staff');
const reports = require('../electron/services/reports');
const printService = require('../electron/printing/printService');

seed.ensureDefaults();
seed.loadDemo();
auth.login({ username: 'admin', password: 'admin123' });
const P = products.list({})[0];
const T = tables.list()[0];
const line = [{ productId: P.id, qty: 1, unitPrice: P.sale_price }];

test('staff: add, reject duplicates, deactivate keeps old names', () => {
  const w = staff.save({ name: 'Ali', role: 'waiter', phone: '0300' });
  const r = staff.save({ name: 'Bilal', role: 'rider' });
  assert.throws(() => staff.save({ name: 'ali', role: 'waiter' }), /already exists/);
  assert.throws(() => staff.save({ name: 'X', role: 'chef' }), /Waiter or Rider/);
  assert.equal(staff.list({ role: 'waiter' }).length, 1);
  assert.equal(staff.list({}).length, 2);
  assert.ok(w && r);
});

test('dine-in bill stores the waiter; delivery stores the rider; receipt + KOT print them; reports add up', () => {
  const w = staff.list({ role: 'waiter' })[0];
  const r = staff.list({ role: 'rider' })[0];
  const dine = orders.save({ orderType: 'dine_in', action: 'pay', tableId: T.id, waiterId: w.id, riderId: r.id, items: line, payment: { method: 'cash', tendered: 5000 }, tokenMode: 'none' });
  assert.equal(dine.waiter_name, 'Ali');
  assert.equal(dine.rider_name, null, 'rider is ignored on dine-in');
  const del = orders.save({ orderType: 'delivery', action: 'pay', waiterId: w.id, riderId: r.id, customer: { name: 'Sara', mobile: '03001234567', address: 'House 1' }, deliveryCharges: 100, items: line, payment: { method: 'cash', tendered: 5000 }, tokenMode: 'none' });
  assert.equal(del.rider_name, 'Bilal');
  assert.equal(del.waiter_name, null, 'waiter is ignored on delivery');
  assert.match(printService.receiptHtml({ orderId: dine.id }), /Waiter[\s\S]*Ali/);
  assert.match(printService.receiptHtml({ orderId: del.id }), /Rider[\s\S]*Bilal/);
  assert.match(printService.kotHtml({ orderId: dine.id }), /Waiter[\s\S]*Ali/);
  const today = dine.business_date;
  const wr = reports.run({ key: 'waiters', from: today, to: today });
  assert.equal(wr.rows.find((x) => x.person === 'Ali').orders, 1);
  const rr = reports.run({ key: 'riders', from: today, to: today });
  assert.equal(rr.rows.find((x) => x.person === 'Bilal').delivery, 100);
  staff.remove({ id: w.id });
  assert.equal(staff.list({ role: 'waiter' }).length, 0);
  assert.equal(orders.get({ id: dine.id }).waiter_name, 'Ali');
  assert.throws(() => orders.save({ orderType: 'dine_in', action: 'hold', tableId: T.id, waiterId: 9999, items: line }), /no longer exists/);
});
