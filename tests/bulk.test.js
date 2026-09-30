'use strict';

// Bulk menu import (xlsx / csv), bulk pictures and deals.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'rpos-bulk-'));
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
const inventory = require('../electron/services/inventory');
const bulk = require('../electron/services/bulk');
const { parseTable } = require('../electron/core/tabular');

seed.ensureDefaults();
auth.login({ username: 'admin', password: 'admin123' });
settings.set('inventory', { enabled: true });
const b64 = (buf) => Buffer.from(buf).toString('base64');

test('xlsx template round-trips through the reader', () => {
  const rows = parseTable(bulk.templateXlsx(), 'x.xlsx');
  assert.deepEqual(rows[0].slice(0, 3), ['Name', 'Category', 'Price']);
  assert.equal(rows.length, 4);
  assert.equal(rows[1][0], 'Zinger Burger');
  assert.equal(rows[1][2], '450');
});

test('csv with quotes, semicolons, BOM and Urdu parses', () => {
  const csv = '﻿Name;Category;Price\r\n"Chicken, Tikka";BBQ;"1,200"\r\nچکن بریانی;Biryani;Rs. 380\r\n';
  const rows = parseTable(Buffer.from(csv), 'm.csv');
  assert.equal(rows[1][0], 'Chicken, Tikka');
  const p = bulk.parseMenu({ name: 'm.csv', data: b64(csv) });
  assert.equal(p.counts.new, 2);
  assert.equal(p.rows[0].sale_price, 1200);
  assert.equal(p.rows[1].sale_price, 380);
});

test('import creates items + categories, updates existing by name, reports errors', () => {
  const csv = 'Item,Group,Rate,Stock\nZinger Burger,Burgers,450,20\nFries,Sides,150,\nBad Row,Sides,abc,\nzinger burger,Burgers,500,\n,Sides,10,\n';
  const p = bulk.parseMenu({ name: 'a.csv', data: b64(csv) });
  assert.equal(p.counts.new, 2);
  assert.equal(p.counts.error, 3);
  const r = bulk.importMenu({ rows: p.rows });
  assert.equal(r.created, 2);
  assert.equal(r.categoriesCreated, 2);
  assert.equal(products.list({}).find((x) => x.name === 'Zinger Burger').stock_qty, 20);
  // second import: same names -> updates, price changes, stock untouched
  const p2 = bulk.parseMenu({ name: 'b.csv', data: b64('Name,Category,Price\nZinger Burger,Burgers,475\nNew Wrap,Wraps,300\n') });
  assert.equal(p2.counts.update, 1);
  assert.equal(p2.counts.new, 1);
  const r2 = bulk.importMenu({ rows: p2.rows });
  assert.deepEqual([r2.created, r2.updated], [1, 1]);
  const z = products.list({}).find((x) => x.name === 'Zinger Burger');
  assert.equal(z.sale_price, 475);
  assert.equal(z.stock_qty, 20);
  assert.equal(products.list({}).find((x) => x.name === 'New Wrap').category_name, 'Wraps');
  // "do not update existing" skips
  const p3 = bulk.parseMenu({ name: 'c.csv', data: b64('Name,Price\nZinger Burger,999\n') });
  assert.equal(bulk.importMenu({ rows: p3.rows, updateExisting: false }).skipped, 1);
  assert.equal(products.list({}).find((x) => x.name === 'Zinger Burger').sale_price, 475);
  assert.throws(() => parseTable(Buffer.from([0xd0, 0xcf, 0x11]), 'old.xls'), /\.xlsx/);
});

test('bulk pictures are stored per item and reject bad data', () => {
  const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
  const z = products.list({}).find((x) => x.name === 'Zinger Burger');
  const r = bulk.setImages({ items: [{ id: z.id, image: png }, { id: z.id, name: 'Bad', image: 'nope' }] });
  assert.equal(r.saved, 1);
  assert.equal(r.errors.length, 1);
  assert.equal(products.get({ id: z.id }).has_image, true);
});

test('deals: created from items, cost auto-summed, stock deducted from components and restored on refund', () => {
  const burger = products.list({}).find((x) => x.name === 'Zinger Burger');
  const fries = products.list({}).find((x) => x.name === 'Fries');
  products.save({ ...burger, cost_price: 200, id: burger.id });
  products.save({ ...fries, cost_price: 60, id: fries.id });
  const dealId = products.save({
    name: 'Burger Combo', sale_price: 550, category_id: burger.category_id, isDeal: true,
    dealItems: [{ productId: burger.id, qty: 2 }, { productId: fries.id, qty: 1 }],
  });
  const d = products.get({ id: dealId });
  assert.equal(d.is_deal, true);
  assert.equal(d.cost_price, 460);
  assert.equal(d.track_stock, false);
  assert.equal(d.deal_items.length, 2);
  assert.equal(products.list({}).find((x) => x.id === dealId).deal_text, '2 × Zinger Burger + 1 × Fries');

  assert.throws(() => products.save({ name: 'Bad', sale_price: 1, isDeal: true, dealItems: [] }), /at least one item/);
  assert.throws(() => products.save({ name: 'Nested', sale_price: 1, isDeal: true, dealItems: [{ productId: dealId, qty: 1 }] }), /itself a deal/);
  assert.throws(() => products.save({ name: 'Dupe', sale_price: 1, isDeal: true, dealItems: [{ productId: burger.id, qty: 1 }, { productId: burger.id, qty: 1 }] }), /twice/);

  const b0 = products.get({ id: burger.id }).stock_qty;
  const f0 = products.get({ id: fries.id }).stock_qty;
  const o = orders.save({ orderType: 'takeaway', action: 'pay', items: [{ productId: dealId, qty: 2, unitPrice: 550 }], payment: { method: 'cash', tendered: 1100 }, tokenMode: 'none' });
  assert.equal(o.total, 1100);
  assert.match(o.items[0].notes, /2 × Zinger Burger \+ 1 × Fries/);
  assert.equal(products.get({ id: burger.id }).stock_qty, b0 - 4);
  assert.equal(products.get({ id: fries.id }).stock_qty, f0 - 2);
  assert.equal(o.items[0].cost_price, 460);
  orders.refund({ id: o.id, reason: 'test' });
  assert.equal(products.get({ id: burger.id }).stock_qty, b0);
  assert.equal(products.get({ id: fries.id }).stock_qty, f0);
  // a component used by a deal is deactivated, not deleted
  assert.equal(products.remove({ id: fries.id }).deactivated, true);
  // editing the deal keeps it a deal
  products.save({ id: dealId, name: 'Burger Combo', sale_price: 500, dealItems: [{ productId: burger.id, qty: 1 }] });
  assert.equal(products.get({ id: dealId }).deal_items.length, 1);
});
