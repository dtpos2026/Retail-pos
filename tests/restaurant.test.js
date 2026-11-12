'use strict';

// v1.10: Retail / Restaurant inventory (locked choice), raw inventory items + recipes, rider rules, "khula sauda" items.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'rpos-rest-'));
const ctx = require('../electron/core/context');
ctx.paths = { userData: tmp, dbFile: path.join(tmp, 'data', 'test.db'), backups: path.join(tmp, 'backups'), logs: path.join(tmp, 'logs'), temp: path.join(tmp, 'temp') };
fs.mkdirSync(ctx.paths.backups, { recursive: true });
const { Database } = require('../electron/db/database');
ctx.db = new Database(ctx.paths.dbFile);
const seed = require('../electron/db/seed');
const auth = require('../electron/services/auth');
const users = require('../electron/services/users');
const settings = require('../electron/services/settings');
const products = require('../electron/services/products');
const orders = require('../electron/services/orders');
const inventory = require('../electron/services/inventory');
const staff = require('../electron/services/staff');

seed.ensureDefaults();
auth.login({ username: 'admin', password: 'admin123' });
const pid = (r) => (typeof r === 'object' ? r.id : r);
const stockOf = (id) => ctx.db.get('SELECT stock_qty s FROM products WHERE id = ?', [id]).s;
const pay = (items, extra = {}) => orders.save({ orderType: 'takeaway', action: 'pay', items, payment: { method: 'cash', tendered: 100000 }, tokenMode: 'none', ...extra });

test('inventory type is not chosen at first and cannot be set through the normal settings call', () => {
  assert.equal(settings.get('inventory').mode, '');
  settings.set('inventory', { mode: 'restaurant', modeLocked: true, enabled: true });
  assert.equal(settings.get('inventory').mode, '', 'mode ignored');
  assert.equal(settings.get('inventory').modeLocked, false);
  assert.equal(settings.get('inventory').enabled, true, 'other values still save');
  assert.throws(() => inventory.setMode({ mode: 'kitchen' }), /Retail or Restaurant/);
});

test('choosing Restaurant locks the choice and takes stock away from menu dishes', () => {
  const burger = pid(products.save({ name: 'Zinger', sale_price: 450, stock_qty: 30, track_stock: true }));
  assert.equal(ctx.db.get('SELECT track_stock t FROM products WHERE id = ?', [burger]).t, 1);
  const v = inventory.setMode({ mode: 'restaurant' });
  assert.equal(v.mode, 'restaurant'); assert.equal(v.modeLocked, true);
  assert.equal(ctx.db.get('SELECT track_stock t FROM products WHERE id = ?', [burger]).t, 0, 'dish no longer tracked');
  assert.throws(() => inventory.setMode({ mode: 'retail' }), /cannot be changed/);
  settings.set('inventory', { mode: 'retail', modeLocked: false });
  assert.equal(settings.get('inventory').mode, 'restaurant', 'still locked');
  // a new dish never carries stock in restaurant mode, even if asked
  const dish = pid(products.save({ name: 'Daal Fry', sale_price: 200, track_stock: true, stock_qty: 50 }));
  assert.equal(ctx.db.get('SELECT track_stock t FROM products WHERE id = ?', [dish]).t, 0);
});

test('raw inventory items: added by hand, hidden from the POS, used by recipes, deducted on sale', () => {
  const ghee = pid(inventory.saveItem({ name: 'Ghee', unit: 'kg', cost_price: 560, stock_qty: 10, low_stock: 2 }));
  const chicken = pid(inventory.saveItem({ name: 'Chicken', unit: 'kg', cost_price: 650, stock_qty: 20.5 }));
  assert.equal(stockOf(chicken), 20.5);
  const pos = products.list({ activeOnly: true }).map((p) => p.name);
  assert.ok(!pos.includes('Ghee') && !pos.includes('Chicken'), 'raw items are not on the POS');
  const karahi = pid(products.save({ name: 'Chicken Karahi', sale_price: 1100, recipe: [{ ingredientId: chicken, qty: 0.5 }, { ingredientId: ghee, qty: 0.075 }] }));
  const plain = pid(products.save({ name: 'Green Salad', sale_price: 100 }));
  settings.set('inventory', { enabled: true, allowNegative: true });
  pay([{ productId: karahi, qty: 2, unitPrice: 1100 }, { productId: plain, qty: 1, unitPrice: 100 }]);
  assert.equal(stockOf(chicken), 19.5);
  assert.equal(stockOf(ghee), 9.85);
  const sum = inventory.summary();
  assert.equal(sum.mode, 'restaurant');
  assert.deepEqual(sum.products.map((p) => p.name).sort(), ['Chicken', 'Ghee'], 'inventory lists raw items only');
  assert.equal(sum.products.find((p) => p.name === 'Chicken').used_in, 1);
  // editing keeps it a raw item; grams are kept
  inventory.saveItem({ id: chicken, name: 'Chicken (boneless)', unit: 'kg', cost_price: 700, low_stock: 3 });
  inventory.adjust({ productId: chicken, type: 'in', qty: 0.375, unitCost: 700 });
  assert.equal(stockOf(chicken), 19.875);
  assert.throws(() => inventory.saveItem({ id: karahi, name: 'x' }), /not found/);
});

test('factory reset clears the locked choice', () => {
  seed.factoryReset();
  assert.equal(settings.get('inventory').mode, '');
  assert.equal(settings.get('inventory').modeLocked, false);
  inventory.setMode({ mode: 'retail' });
  const p = pid(products.save({ name: 'Biscuit', sale_price: 50, stock_qty: 10, track_stock: true }));
  assert.equal(ctx.db.get('SELECT track_stock t FROM products WHERE id = ?', [p]).t, 1, 'retail products keep their own stock');
});

test('demo data in restaurant mode brings raw items and recipes', () => {
  seed.factoryReset();
  inventory.setMode({ mode: 'restaurant' });
  seed.loadDemo();
  const raw = ctx.db.all('SELECT name FROM products WHERE is_ingredient = 1').map((r) => r.name);
  assert.ok(raw.includes('Chicken') && raw.includes('Rice (Basmati)'));
  assert.equal(ctx.db.get('SELECT COUNT(*) c FROM products WHERE is_ingredient = 0 AND track_stock = 1').c, 0);
  assert.ok(ctx.db.get('SELECT COUNT(*) c FROM recipe_items').c >= 4);
});

test('delivery: rider required (from the list or typed by hand)', () => {
  const p = pid(products.save({ name: 'Pizza', sale_price: 900 }));
  const cust = { name: 'Hina', mobile: '03001112244', address: 'Street 4' };
  settings.set('sales', { requireRider: true });
  assert.throws(() => orders.save({ orderType: 'delivery', action: 'hold', customer: cust, items: [{ productId: p, qty: 1, unitPrice: 900 }] }), /rider/);
  const o = orders.save({ orderType: 'delivery', action: 'hold', customer: cust, riderName: '  Bilal (new)  ', items: [{ productId: p, qty: 1, unitPrice: 900 }] });
  assert.equal(o.rider_name, 'Bilal (new)'); assert.equal(o.rider_id, null);
  const r = pid(staff.save({ name: 'Kamran', role: 'rider' }));
  const o2 = orders.save({ orderType: 'delivery', action: 'hold', customer: cust, riderId: r, riderName: 'ignored', items: [{ productId: p, qty: 1, unitPrice: 900 }] });
  assert.equal(o2.rider_name, 'Kamran');
  settings.set('sales', { requireRider: false });
  const o3 = orders.save({ orderType: 'delivery', action: 'hold', customer: cust, items: [{ productId: p, qty: 1, unitPrice: 900 }] });
  assert.equal(o3.rider_name, null);
});

test('"khula sauda": the typed amount is the price; lowering a fixed price needs the discount permission', () => {
  const daal = pid(products.save({ name: 'Daal Mash Plate', sale_price: 250, unit: 'plate', open_price: true }));
  assert.equal(products.get({ id: daal }).open_price, true);
  const fixed = pid(products.save({ name: 'Naan', sale_price: 40 }));
  users.save({ name: 'Counter', username: 'counter', password: 'c-pass-1', role: 'cashier', customPermissions: ['pos'] });
  auth.logout();
  auth.login({ username: 'counter', password: 'c-pass-1' });
  const o = pay([{ productId: daal, qty: 1, unitPrice: 200 }]);
  assert.equal(o.total, 200); assert.equal(o.items[0].name, 'Daal Mash Plate'); assert.equal(o.items[0].unit_price, 200);
  assert.throws(() => pay([{ productId: fixed, qty: 2, unitPrice: 30 }]), /permission to give discounts/);
  assert.equal(pay([{ productId: fixed, qty: 2, unitPrice: 40 }]).total, 80);
  auth.logout();
  auth.login({ username: 'admin', password: 'admin123' });
  assert.equal(pay([{ productId: fixed, qty: 2, unitPrice: 30 }]).total, 60, 'admin may change the rate');
});

test.after(() => {
  try { ctx.db.close(); } catch { /* ignore */ }
  fs.rmSync(tmp, { recursive: true, force: true });
});

test('token items: instant priced token sale for chosen items / categories, only in the chosen POS modes', () => {
  auth.logout();
  auth.login({ username: 'admin', password: 'admin123' });
  const cat = require('../electron/services/categories');
  const breadCat = pid(cat.save({ name: 'Tandoor', color: '#a16207' }));
  const roti = pid(products.save({ name: 'Roti', sale_price: 20, category_id: breadCat }));
  const naan = pid(products.save({ name: 'Naan', sale_price: 40 }));
  const tea = pid(products.save({ name: 'Tea', sale_price: 60 }));
  settings.set('token', { enabled: false, quickEnabled: true, quickCategoryIds: [breadCat], quickProductIds: [naan], quickOrderTypes: ['takeaway'] });
  const P = (id) => ctx.db.get('SELECT * FROM products WHERE id = ?', [id]);
  assert.equal(orders.isQuickToken(P(roti), 'takeaway'), true, 'by category');
  assert.equal(orders.isQuickToken(P(naan), 'takeaway'), true, 'by item');
  assert.equal(orders.isQuickToken(P(tea), 'takeaway'), false);
  assert.equal(orders.isQuickToken(P(roti), 'dine_in'), false, 'not in dine-in unless chosen');
  const o = orders.quickToken({ productId: roti, qty: 4, orderType: 'takeaway' });
  assert.equal(o.status, 'completed'); assert.equal(o.order_type, 'takeaway'); assert.equal(o.total, 80); assert.equal(o.due, 0);
  assert.equal(o.tokens.length, 1, 'a token even though the token system is off');
  assert.equal(o.tokens[0].items[0].qty, 4); assert.equal(o.tokens[0].items[0].total, 80);
  assert.throws(() => orders.quickToken({ productId: tea, qty: 1, orderType: 'takeaway' }), /not a token item/);
  assert.throws(() => orders.quickToken({ productId: roti, qty: 0, orderType: 'takeaway' }), /how many/);
  settings.set('token', { quickEnabled: false });
  assert.throws(() => orders.quickToken({ productId: roti, qty: 1, orderType: 'takeaway' }), /not a token item/);
});

test('dine-in per head and manual service charge: totals, settings gate, persisted and kept on recalc', () => {
  const settings = require('../electron/services/settings');
  const orders = require('../electron/services/orders');
  const products = require('../electron/services/products');
  const tablesSvc = require('../electron/services/tables');
  const found = ctx.db.all('SELECT id FROM dining_tables LIMIT 1');
  const tableId = found[0] ? found[0].id : tablesSvc.save({ name: 'PH-1', seats: 4 }).id;
  const p = { id: products.save({ name: 'Plain Naan Plate', sale_price: 1000, unit: 'plate', track_stock: false }) };
  const base = { orderType: 'dine_in', action: 'hold', tableId, items: [{ productId: p.id, name: 'Plain Naan Plate', qty: 1, unitPrice: 1000 }] };
  const sales = settings.get('sales');
  settings.set('sales', { ...sales, taxEnabled: false, roundTotal: false, perHeadEnabled: false, serviceEnabled: false });
  // switched off in Settings: ignored
  let o = orders.save({ ...base, covers: 3, serviceMode: 'percent', serviceValue: 10 });
  assert.equal(o.total, 1000); assert.equal(o.covers, 0);
  orders.cancel({ id: o.id });
  settings.set('sales', { ...sales, taxEnabled: false, roundTotal: false, perHeadEnabled: true, perHeadRate: 150, serviceEnabled: true, serviceMode: 'percent', serviceValue: 10 });
  o = orders.save({ ...base, covers: 3, serviceMode: 'percent', serviceValue: 10 });
  assert.equal(o.covers, 3); assert.equal(o.cover_rate, 150); assert.equal(o.cover_charge, 450);
  assert.equal(o.service_charge, 100, '10% of the bill (1000) — not of the per-head amount');
  assert.equal(o.total, 1550);
  const o2 = orders.save({ ...base, id: o.id, covers: 2, coverRate: 200, serviceMode: 'amount', serviceValue: 75 });
  assert.equal(o2.cover_charge, 400); assert.equal(o2.service_charge, 75); assert.equal(o2.total, 1475);
  assert.throws(() => orders.save({ ...base, id: o.id, serviceMode: 'percent', serviceValue: 150 }), /100%/);
  // takeaway never gets them
  const t = orders.save({ orderType: 'takeaway', action: 'hold', covers: 4, serviceValue: 10, items: [{ productId: p.id, name: 'Plain Naan Plate', qty: 1, unitPrice: 1000 }] });
  assert.equal(t.total, 1000);
  orders.cancel({ id: t.id }); orders.cancel({ id: o.id });
  settings.set('sales', sales);
});
