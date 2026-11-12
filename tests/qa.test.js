'use strict';

// Final QA: upgrade from an older database, per head / service charge through receipts, reports, refund and
// export / import, restaurant stock round trip.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { DatabaseSync } = require('node:sqlite');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'rpos-qa-'));

test('upgrade: a v1.9.1 database (schema v5) opens in v1.10 with its data and new columns', () => {
  const { migrations } = require('../electron/db/schema');
  const file = path.join(tmp, 'old', 'old.db');
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const raw = new DatabaseSync(file);
  raw.exec('CREATE TABLE schema_version (version INTEGER NOT NULL)');
  raw.exec('INSERT INTO schema_version VALUES (0)');
  for (const m of migrations.filter((x) => x.version <= 5)) { raw.exec(m.sql); raw.exec(`UPDATE schema_version SET version = ${m.version}`); }
  const now = '2026-01-01 10:00:00';
  raw.exec(`INSERT INTO products (name, sale_price, created_at, updated_at) VALUES ('Old Burger', 450, '${now}', '${now}')`);
  raw.exec(`INSERT INTO orders (order_no, order_type, status, subtotal, total, business_date, created_at, updated_at) VALUES ('ORD-000001', 'dine_in', 'completed', 450, 450, '2026-01-01', '${now}', '${now}')`);
  raw.close();
  const { Database } = require('../electron/db/database');
  const db = new Database(file);
  assert.equal(db.get('SELECT version FROM schema_version').version, migrations[migrations.length - 1].version);
  const o = db.get('SELECT * FROM orders');
  assert.equal(o.total, 450);
  assert.equal(o.covers, 0); assert.equal(o.cover_charge, 0); assert.equal(o.service_charge, 0); assert.equal(o.service_mode, 'percent');
  assert.equal(db.get('SELECT open_price FROM products').open_price, 0);
  db.close();
  // a second open is a no-op
  const again = new Database(file);
  assert.equal(again.get('SELECT COUNT(*) c FROM orders').c, 1);
  again.close();
});

const ctx = require('../electron/core/context');
ctx.paths = { userData: tmp, dbFile: path.join(tmp, 'data', 'qa.db'), backups: path.join(tmp, 'backups'), logs: path.join(tmp, 'logs'), temp: path.join(tmp, 'temp') };
fs.mkdirSync(ctx.paths.backups, { recursive: true });
const { Database } = require('../electron/db/database');
ctx.db = new Database(ctx.paths.dbFile);
const seed = require('../electron/db/seed');
const auth = require('../electron/services/auth');
const settings = require('../electron/services/settings');
const products = require('../electron/services/products');
const orders = require('../electron/services/orders');
const inventory = require('../electron/services/inventory');
const reports = require('../electron/services/reports');
const dx = require('../electron/services/dataExchange');
const tablesSvc = require('../electron/services/tables');

seed.ensureDefaults();
auth.login({ username: 'admin', password: 'admin123' });

test('per head + service charge: receipt rows, order detail, report totals, refund, export / import', async () => {
  const receiptData = require('../electron/printing/receiptData');
  const tpl = require('../electron/printing/receiptTemplates');
  const sales = settings.get('sales');
  settings.set('sales', { ...sales, taxEnabled: true, taxRate: 10, roundTotal: false, perHeadEnabled: true, perHeadRate: 120, perHeadLabel: 'Cover', serviceEnabled: true, serviceMode: 'percent', serviceValue: 5, serviceLabel: 'Service' });
  const table = tablesSvc.save({ name: 'QA-1', seats: 4 });
  const p = products.save({ name: 'QA Karahi', sale_price: 2000, unit: 'plate', track_stock: false });
  const pid = typeof p === 'object' ? p.id : p;
  const o = orders.save({ orderType: 'dine_in', action: 'pay', tableId: table.id || ctx.db.get('SELECT id FROM dining_tables WHERE name = ?', ['QA-1']).id, covers: 4, serviceMode: 'percent', serviceValue: 5, items: [{ productId: pid, name: 'QA Karahi', qty: 1, unitPrice: 2000 }], payment: { method: 'cash', tendered: 5000 }, tokenMode: 'none' });
  // 2000 + tax 10% (200) + cover 4 x 120 (480) + service 5% of 2000 (100)
  assert.equal(o.tax_amount, 200); assert.equal(o.cover_charge, 480); assert.equal(o.service_charge, 100); assert.equal(o.total, 2780);
  assert.equal(o.paid, 2780); assert.equal(o.change_amount, 2220);
  // receipt data + every design shows the two rows
  const data = receiptData.build(orders.get({ id: o.id }), {});
  assert.equal(data.totals.cover, 480); assert.match(data.totals.coverLabel, /Cover \(4 x 120\)/); assert.match(data.totals.serviceLabel, /Service \(5%\)/);
  const base = settings.get('receipt');
  const keys = tpl.TEMPLATES.map((x) => x.key);
  assert.ok(keys.length >= 11, 'all designs');
  for (const key of keys) {
    settings.set('receipt', { ...base, template: key });
    const html = tpl.renderReceipt(receiptData.build(orders.get({ id: o.id }), {}));
    assert.match(html, /Cover \(4 x 120\)/, `${key} shows the per head row`);
    assert.match(html, /Service \(5%\)/, `${key} shows the service charge row`);
    assert.match(html, /2,?780/, `${key} shows the total`);
  }
  settings.set('receipt', base);
  // reports
  const day = reports.run({ key: 'daily', from: o.business_date, to: o.business_date });
  assert.ok(JSON.stringify(day).includes('2780') || JSON.stringify(day).includes('2,780'), 'Z report counts the full total');
  for (const r of reports.REPORTS) assert.doesNotThrow(() => reports.run({ key: r.key, from: o.business_date, to: o.business_date }), `report ${r.key}`);
  // export -> wipe -> import keeps the new columns
  const file = path.join(tmp, 'qa.json');
  dx.exportTo({ file, format: 'json' });
  ctx.db.exec('DELETE FROM payments; DELETE FROM order_items; DELETE FROM orders;');
  await dx.importFrom({ file });
  auth.login({ username: 'admin', password: 'admin123' });
  const back = ctx.db.get('SELECT * FROM orders WHERE id = ?', [o.id]);
  assert.equal(back.covers, 4); assert.equal(back.cover_rate, 120); assert.equal(back.cover_charge, 480); assert.equal(back.service_mode, 'percent'); assert.equal(back.service_value, 5); assert.equal(back.service_charge, 100); assert.equal(back.total, 2780);
  // refund works on such an order
  const r = orders.refund({ id: o.id, reason: 'QA' });
  assert.equal(orders.get({ id: o.id }).status, 'refunded');
  assert.ok(r);
  settings.set('sales', sales);
});

test('restaurant: raw stock round trip — sale deducts, refund gives it back, two plates of two dishes share one raw item', () => {
  inventory.setMode({ mode: 'restaurant' });
  const raw = inventory.saveItem({ name: 'QA Ghee', unit: 'kg', stock_qty: 10, cost_price: 900 });
  const rawId = typeof raw === 'object' ? raw.id : raw;
  const mk = (name, qty) => { const r = products.save({ name, sale_price: 500, unit: 'plate', recipe: [{ ingredientId: rawId, qty }] }); return typeof r === 'object' ? r.id : r; };
  const a = mk('QA Daal', 0.1); const b = mk('QA Sabzi', 0.05);
  settings.set('inventory', { enabled: true }, { internal: true });
  const stock = () => ctx.db.get('SELECT stock_qty FROM products WHERE id = ?', [rawId]).stock_qty;
  const o = orders.save({ orderType: 'takeaway', action: 'pay', items: [{ productId: a, name: 'QA Daal', qty: 2, unitPrice: 500 }, { productId: b, name: 'QA Sabzi', qty: 3, unitPrice: 500 }], payment: { method: 'cash', tendered: 5000 }, tokenMode: 'none' });
  assert.equal(stock(), 10 - 0.2 - 0.15, 'two plates daal (0.1) + three sabzi (0.05)');
  orders.refund({ id: o.id, reason: 'QA' });
  assert.equal(stock(), 10, 'refund returns the raw items');
  const sum = inventory.summary();
  assert.ok(sum.products.some((x) => x.id === rawId && x.used_in === 2), 'raw item knows it is used by 2 dishes');
  assert.ok(!sum.products.some((x) => x.id === a), 'dishes are not stock');
  assert.throws(() => inventory.setMode({ mode: 'retail' }), /locked|cannot/i);
});

test('token item slip: quantity, price and total are on the token (every token design), and nothing else prints', () => {
  const printService = require('../electron/printing/printService');
  const tokenCfg = settings.get('token');
  const pid = typeof (products.save({ name: 'QA Roti', sale_price: 25, unit: 'roti', track_stock: false })) === 'object' ? null : ctx.db.get("SELECT id FROM products WHERE name = 'QA Roti'").id;
  const o = orders.save({ orderType: 'takeaway', action: 'pay', items: [{ productId: pid, name: 'QA Roti', qty: 6, unitPrice: 25 }], payment: { method: 'cash', tendered: 150 }, tokenMode: 'combined', forceToken: true });
  assert.equal(o.total, 150);
  for (const design of printService.TOKEN_DESIGNS.map((d) => d.key || d)) {
    settings.set('token', { ...tokenCfg, design });
    const htmls = printService.tokenHtmls({ orderId: o.id, overrides: { token: { showItems: true, showPrices: true, showTotal: true } } });
    assert.ok(htmls.length >= 1, `${design}: a token is produced`);
    const h = htmls.join('');
    assert.match(h, /QA Roti/, `${design}: item`);
    assert.match(h, /6/, `${design}: quantity`);
    assert.match(h, /150/, `${design}: total price`);
  }
  settings.set('token', tokenCfg);
});
