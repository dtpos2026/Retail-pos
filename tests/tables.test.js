'use strict';

// Table management, floors, dine-in history and bank accounts (temp database, no Electron).
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'rpos-tbl-'));
const ctx = require('../electron/core/context');
ctx.paths = { userData: tmp, dbFile: path.join(tmp, 'data', 'test.db'), backups: path.join(tmp, 'backups'), logs: path.join(tmp, 'logs'), temp: path.join(tmp, 'temp') };
fs.mkdirSync(ctx.paths.backups, { recursive: true });
const { Database } = require('../electron/db/database');
ctx.db = new Database(ctx.paths.dbFile);
const seed = require('../electron/db/seed');
const auth = require('../electron/services/auth');
const settings = require('../electron/services/settings');
const products = require('../electron/services/products');
const orders = require('../electron/services/orders');
const tables = require('../electron/services/tables');
const tableOps = require('../electron/services/tableOps');
const receiptData = require('../electron/printing/receiptData');
const { renderReceipt } = require('../electron/printing/receiptTemplates');

seed.ensureDefaults();
seed.loadDemo();
auth.login({ username: 'admin', password: 'admin123' });
const P = products.list({}).slice(0, 3);
const T = tables.list();

function running(table, lines) {
  return orders.save({ orderType: 'dine_in', action: 'hold', tableId: table.id, items: lines.map(([p, q]) => ({ productId: p.id, qty: q, unitPrice: p.sale_price })) });
}
const tbl = (id) => tables.list().find((t) => t.id === id);

test('transfer moves a running bill to a free table', () => {
  const o = running(T[0], [[P[0], 2]]);
  const r = tableOps.transfer({ orderId: o.id, toTableId: T[1].id });
  assert.equal(r.table, T[1].name);
  assert.equal(tbl(T[0].id).status, 'available');
  assert.equal(tbl(T[1].id).current_order_id, o.id);
  assert.equal(orders.get({ id: o.id }).table_name, T[1].name);
  const busy = running(T[2], [[P[1], 1]]);
  assert.throws(() => tableOps.transfer({ orderId: busy.id, toTableId: T[1].id }), /already has a running bill/);
  tableOps.free({ tableId: T[1].id });
  tableOps.free({ tableId: T[2].id });
});

test('merge combines bills, frees the other tables and keeps totals right', () => {
  const a = running(T[0], [[P[0], 1]]);
  const b = running(T[1], [[P[1], 2]]);
  const c = running(T[2], [[P[2], 1]]);
  const expected = a.total + b.total + c.total;
  const r = tableOps.merge({ intoOrderId: a.id, fromOrderIds: [b.id, c.id] });
  const m = orders.get({ id: a.id });
  assert.equal(m.items.length, 3);
  assert.equal(m.total, expected);
  assert.deepEqual(r.merged.length, 2);
  assert.equal(tbl(T[1].id).status, 'available');
  assert.equal(tbl(T[2].id).status, 'available');
  assert.equal(orders.get({ id: b.id }).status, 'cancelled');
  assert.match(orders.get({ id: b.id }).cancel_reason, /Merged into/);
  const paid = orders.save({ id: a.id, orderType: 'dine_in', action: 'pay', tableId: T[0].id, items: m.items.map((i) => ({ productId: i.product_id, qty: i.qty, unitPrice: i.unit_price })), payment: { method: 'cash', tendered: m.total }, tokenMode: 'none' });
  assert.equal(paid.status, 'completed');
});

test('split moves part of a bill to a new bill; totals add up', () => {
  const o = running(T[0], [[P[0], 3], [P[1], 1]]);
  const first = orders.get({ id: o.id }).items[0];
  const before = o.total;
  const r = tableOps.split({ orderId: o.id, lines: [{ itemId: first.id, qty: 2 }], toTableId: T[1].id });
  const a = orders.get({ id: o.id });
  const b = orders.get({ id: r.newOrderId });
  assert.equal(a.items.find((i) => i.id === first.id).qty, 1);
  assert.equal(b.items[0].qty, 2);
  assert.equal(Math.round((a.total + b.total) * 100), Math.round(before * 100));
  assert.equal(tbl(T[1].id).current_order_id, b.id);
  assert.throws(() => tableOps.split({ orderId: o.id, lines: a.items.map((i) => ({ itemId: i.id, qty: i.qty })), toTableId: T[2].id }), /Leave at least one item/);
  assert.throws(() => tableOps.split({ orderId: o.id, lines: [{ itemId: first.id, qty: 1 }], toTableId: T[1].id }), /already has a running bill/);
  tableOps.free({ tableId: T[0].id });
  tableOps.free({ tableId: T[1].id });
});

test('free table cancels the running bill; history lists dine-in bills', () => {
  const o = running(T[3], [[P[0], 1]]);
  const r = tableOps.free({ tableId: T[3].id, reason: 'Guests left' });
  assert.equal(r.cancelled, o.order_no);
  assert.equal(tbl(T[3].id).status, 'available');
  assert.equal(orders.get({ id: o.id }).status, 'cancelled');
  const h = tableOps.history({});
  assert.ok(h.rows.length >= 4);
  assert.ok(h.rows.every((x) => x.table_name));
  assert.ok(h.perTable.length >= 1);
  assert.equal(tableOps.history({ tableId: T[3].id }).rows.every((x) => x.table_id === T[3].id), true);
});

test('floors: create, assign tables, delete keeps tables', () => {
  const f = tables.floorSave({ name: 'Ground Floor' });
  tables.floorSave({ name: 'Garden' });
  assert.throws(() => tables.floorSave({ name: 'ground floor' }), /already exists/);
  tables.assignFloor({ ids: [T[0].id, T[1].id], floorId: f });
  assert.equal(tables.list().filter((t) => t.floor_id === f).length, 2);
  tables.save({ id: T[2].id, name: T[2].name, capacity: 6, floorId: f });
  assert.equal(tbl(T[2].id).floor_id, f);
  tables.floorRemove({ id: f });
  assert.equal(tables.list().length, T.length);
  assert.ok(tables.list().every((t) => !t.floor_id));
  assert.equal(tables.floors().length, 1);
});

test('bank accounts: validated, required on bank payments, saved and printed', () => {
  assert.throws(() => settings.set('payment', { bankAccounts: [{ bankName: '' }] }), /bank name/);
  assert.throws(() => settings.set('payment', { bankAccounts: [{ bankName: 'HBL' }] }), /account number or IBAN/);
  settings.set('payment', { bankAccounts: [{ id: 'a1', bankName: 'HBL', title: 'My Shop', accountNo: '1234-5678', iban: '' }, { id: 'a2', bankName: 'Meezan', title: 'My Shop', accountNo: '9999', iban: 'PK00MEZN0000' }], showBankOnReceipt: true });
  const p = P[0];
  const base = { orderType: 'takeaway', action: 'pay', items: [{ productId: p.id, qty: 1, unitPrice: p.sale_price }], tokenMode: 'none' };
  assert.throws(() => orders.save({ ...base, payment: { method: 'bank', tendered: p.sale_price } }), /Select the bank account/);
  const o = orders.save({ ...base, payment: { method: 'bank', tendered: p.sale_price, bankAccountId: 'a2' } });
  assert.equal(o.payment_bank, 'Meezan · 9999');
  assert.equal(orders.get({ id: o.id }).payments[0].bank_account, 'Meezan · 9999');
  const html = renderReceipt(receiptData.build(orders.get({ id: o.id }), {}));
  assert.match(html, /Bank Accounts/);
  assert.match(html, /Meezan/);
  assert.match(html, /PK00MEZN0000/);
  const cash = orders.save({ ...base, payment: { method: 'cash', tendered: p.sale_price } });
  assert.equal(cash.payment_bank, null);
});
