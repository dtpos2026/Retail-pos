'use strict';

// Full-data export / import (JSON + Excel): every table, pictures, long values, rollback on bad files.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'rpos-dx-'));
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
const dx = require('../electron/services/dataExchange');

seed.ensureDefaults();
auth.login({ username: 'admin', password: 'admin123' });
seed.loadDemo();
// a big picture (> one Excel cell) on one product + a logo-sized setting value + awkward text
const png = Buffer.alloc(60000, 7);
const first = products.list({}).find((p) => p.sale_price > 0);
products.save({ id: first.id, name: first.name, sale_price: first.sale_price, image: `data:image/png;base64,${png.toString('base64')}`, sku: '00123', barcode: '0300 111' });
settings.set('business', { logo: `data:image/png;base64,${'A'.repeat(70000)}` });
settings.set('receipt', { footerText: 'شکریہ — "thanks" & <b>' });
const ord = orders.save({ orderType: 'takeaway', action: 'pay', items: [{ productId: first.id, qty: 2, unitPrice: first.sale_price }], payment: { method: 'cash', tendered: 100000 }, tokenMode: 'none' });

const count = (t) => ctx.db.get(`SELECT COUNT(*) c FROM ${t}`).c;
const TABLES = ['products', 'categories', 'orders', 'order_items', 'payments', 'users', 'settings', 'customers'];
const before = Object.fromEntries(TABLES.map((t) => [t, count(t)]));
const productRow = () => ctx.db.get('SELECT * FROM products WHERE id = ?', [first.id]);

for (const format of ['json', 'xlsx']) {
  test(`${format}: export everything, wipe, import -> identical data`, async () => {
    const file = path.join(tmp, `export.${format}`);
    const r = dx.exportTo({ file, format });
    assert.ok(r.size > 1000);
    const want = { sku: productRow().sku, barcode: productRow().barcode, img: Buffer.from(productRow().image).toString('hex'), name: productRow().name };
    const logo = settings.get('business').logo;
    assert.ok(logo && logo.length > 60000);
    const ins = dx.inspect({ file });
    assert.equal(ins.format, format);
    assert.equal(ins.orders, before.orders);
    // change the live data
    ctx.db.exec('DELETE FROM payments; DELETE FROM order_items; DELETE FROM orders; DELETE FROM products;');
    settings.set('business', { logo: null });
    settings.set('receipt', { footerText: 'x' });
    assert.equal(count('products'), 0);
    const res = await dx.importFrom({ file });
    assert.equal(res.imported, true);
    assert.ok(fs.existsSync(res.safetyBackup));
    for (const t of TABLES) assert.equal(count(t), before[t], `${t} rows restored`);
    const row = productRow();
    assert.equal(row.sku, want.sku); // '00123' stays text
    assert.equal(row.barcode, want.barcode);
    assert.equal(row.name, want.name);
    assert.equal(Buffer.from(row.image).toString('hex'), want.img, 'picture bytes identical');
    assert.equal(settings.get('business').logo, logo, 'long logo value intact');
    assert.equal(settings.get('receipt').footerText, 'شکریہ — "thanks" & <b>');
    assert.equal(ctx.db.get('SELECT total FROM orders WHERE id = ?', [ord.id]).total, ord.total);
    assert.equal(ctx.user, null, 'session is cleared after an import (the app restarts)');
    auth.login({ username: 'admin', password: 'admin123' });
    // new records continue after the imported ids
    const o2 = orders.save({ orderType: 'takeaway', action: 'pay', items: [{ productId: first.id, qty: 1, unitPrice: first.sale_price }], payment: { method: 'cash', tendered: 100000 }, tokenMode: 'none' });
    assert.ok(o2.id > ord.id);
    ctx.db.run('DELETE FROM payments WHERE order_id = ?', [o2.id]); ctx.db.run('DELETE FROM order_items WHERE order_id = ?', [o2.id]); ctx.db.run('DELETE FROM orders WHERE id = ?', [o2.id]);
  });
}

test('a damaged or foreign file changes nothing', async () => {
  const bad = path.join(tmp, 'bad.json');
  fs.writeFileSync(bad, '{ not json');
  await assert.rejects(() => dx.importFrom({ file: bad }), /not valid JSON/);
  fs.writeFileSync(bad, JSON.stringify({ meta: { app: 'Other' }, tables: {} }));
  await assert.rejects(() => dx.importFrom({ file: bad }), /not a DT Retail POS/);
  // incomplete: no users
  const good = path.join(tmp, 'good.json');
  dx.exportTo({ file: good, format: 'json' });
  const j = JSON.parse(fs.readFileSync(good, 'utf8'));
  j.tables.users = [];
  fs.writeFileSync(bad, JSON.stringify(j));
  await assert.rejects(() => dx.importFrom({ file: bad }), /no "users" data/);
  // newer software
  j.tables.users = [{ id: 1 }];
  j.meta.schemaVersion = 999;
  fs.writeFileSync(bad, JSON.stringify(j));
  await assert.rejects(() => dx.importFrom({ file: bad }), /newer version/);
  // bad reference: an order item pointing to a missing order -> rolled back, nothing lost
  const j2 = JSON.parse(fs.readFileSync(good, 'utf8'));
  j2.tables.order_items.push({ ...j2.tables.order_items[0], id: 99999, order_id: 424242 });
  fs.writeFileSync(bad, JSON.stringify(j2));
  await assert.rejects(() => dx.importFrom({ file: bad }), /inconsistent/);
  for (const t of TABLES.filter((x) => x !== 'settings')) assert.equal(count(t), before[t], `${t} untouched after a rejected import`); // (the safety backup only adds its own 'backup' settings row)
  assert.ok(settings.get('business').logo.length > 60000);
  // bad number
  const j3 = JSON.parse(fs.readFileSync(good, 'utf8'));
  j3.tables.products[0].sale_price = 'abc';
  fs.writeFileSync(bad, JSON.stringify(j3));
  await assert.rejects(() => dx.importFrom({ file: bad }), /not a number/);
  assert.equal(count('products'), before.products);
});

test('Excel edited by hand: empty cells use defaults, extra sheets/columns are ignored', async () => {
  const { workbookToXlsx } = require('../electron/printing/xlsx');
  const base = dx.snapshot();
  const keep = ['settings', 'users', 'categories', 'products'];
  const cell = (v) => (v === null ? null : typeof v === 'number' ? { v, t: 'g' } : { v: String(v), t: 's' });
  const sheets = [{ name: '_info', rows: [[{ v: 'key' }, { v: 'value' }], [{ v: 'app' }, { v: 'DT Retail POS' }], [{ v: 'format' }, { v: 1, t: 'g' }], [{ v: 'schemaVersion' }, { v: 1, t: 'g' }]] }];
  for (const t of keep) {
    const d = base[t];
    const cols = t === 'products' ? [...d.columns, 'extra_col'] : d.columns;
    const rows = d.rows.map((r) => (t === 'products' ? [...r, 'zzz'] : r)).map((r) => r.map(cell));
    if (t === 'products') {
      // blank the optional columns of the first product: they must become defaults / NULL, not errors
      const blank = ['discount', 'low_stock', 'unit', 'image', 'sku'];
      rows[0] = rows[0].map((c, i) => (blank.includes(cols[i]) ? null : c));
    }
    sheets.push({ name: t, rows: [cols.map((v) => ({ v, bold: true })), ...rows] });
  }
  sheets.push({ name: 'Notes', rows: [[{ v: 'ignored' }]] });
  const file = path.join(tmp, 'hand.xlsx');
  fs.writeFileSync(file, workbookToXlsx(sheets));
  await dx.importFrom({ file });
  assert.equal(count('products'), before.products);
  assert.equal(count('orders'), 0, 'tables missing from the file are emptied');
  const p0 = ctx.db.get('SELECT * FROM products ORDER BY id LIMIT 1');
  assert.equal(p0.unit, 'pcs'); assert.equal(p0.discount, 0); assert.equal(p0.sku, null);
});

test.after(() => {
  try { ctx.db.close(); } catch { /* ignore */ }
  fs.rmSync(tmp, { recursive: true, force: true });
});
