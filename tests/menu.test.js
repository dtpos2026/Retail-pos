'use strict';

// Variants (Small/Medium/Large), recipes (ingredient stock) and weighed items (kg).
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'rpos-menu-'));
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

seed.ensureDefaults();
auth.login({ username: 'admin', password: 'admin123' });
settings.set('inventory', { enabled: true, allowNegative: true });
const stock = (id) => products.get({ id }).stock_qty;

test('variants: sizes with their own prices are sold and stored on the bill', () => {
  const id = products.save({ name: 'Pizza', sale_price: 500, cost_price: 0, unit: 'pcs', variants: [{ name: 'Small', price: 500 }, { name: 'Medium', price: 800 }, { name: 'Large', price: 1100 }] });
  const p = products.get({ id });
  assert.deepEqual(p.variants.map((v) => [v.name, v.price]), [['Small', 500], ['Medium', 800], ['Large', 1100]]);
  assert.equal(products.list({}).find((x) => x.id === id).variants.length, 3);
  const large = p.variants[2];
  const o = orders.save({ orderType: 'takeaway', action: 'pay', items: [{ productId: id, variantId: large.id, qty: 2 }], payment: { method: 'cash', tendered: 5000 }, tokenMode: 'none' });
  assert.equal(o.total, 2200);
  assert.equal(o.items[0].name, 'Pizza (Large)');
  assert.equal(o.items[0].variant_name, 'Large');
  assert.throws(() => products.save({ name: 'X', sale_price: 1, variants: [{ name: 'A', price: 1 }, { name: 'a', price: 2 }] }), /twice/);
  assert.throws(() => orders.save({ orderType: 'takeaway', action: 'hold', items: [{ productId: id, variantId: 99999, qty: 1 }] }), /no longer exists/);
  // editing keeps variant ids stable
  products.save({ id, name: 'Pizza', sale_price: 500, variants: [{ id: p.variants[0].id, name: 'Small', price: 550 }, { id: p.variants[1].id, name: 'Medium', price: 800 }] });
  const p2 = products.get({ id });
  assert.equal(p2.variants.length, 2);
  assert.equal(p2.variants[0].price, 550);
});

test('recipe: selling a dish uses its ingredients (scaled by size), cost comes from the recipe, refund restores', () => {
  const dough = products.save({ name: 'Dough', sale_price: 0, cost_price: 20, unit: 'kg', stock_qty: 50, weighed: true, is_ingredient: true });
  const cheese = products.save({ name: 'Cheese', sale_price: 0, cost_price: 100, unit: 'kg', stock_qty: 20, weighed: true, is_ingredient: true });
  const pid = products.save({
    name: 'Cheese Pizza', sale_price: 600, unit: 'pcs',
    variants: [{ name: 'Small', price: 600, recipe_factor: 0.5 }, { name: 'Large', price: 1200, recipe_factor: 1.5 }],
    recipe: [{ ingredientId: dough, qty: 0.3 }, { ingredientId: cheese, qty: 0.2 }],
  });
  const p = products.get({ id: pid });
  assert.equal(p.recipe.length, 2);
  assert.equal(p.cost_price, 26); // 0.3*20 + 0.2*100
  assert.equal(products.list({ activeOnly: true }).some((x) => x.id === dough), false, 'ingredients are hidden from the POS');
  const large = p.variants.find((v) => v.name === 'Large');
  const o = orders.save({ orderType: 'takeaway', action: 'pay', items: [{ productId: pid, variantId: large.id, qty: 2 }], payment: { method: 'cash', tendered: 5000 }, tokenMode: 'none' });
  // 2 pizzas x factor 1.5 x recipe
  assert.equal(stock(dough), 50 - 2 * 1.5 * 0.3);
  assert.equal(stock(cheese), 20 - 2 * 1.5 * 0.2);
  assert.equal(o.items[0].cost_price, 39); // 26 * 1.5
  orders.refund({ id: o.id, reason: 'test' });
  assert.equal(stock(dough), 50);
  assert.equal(stock(cheese), 20);
  assert.throws(() => products.save({ name: 'Loop', sale_price: 1, recipe: [{ ingredientId: 99999, qty: 1 }] }), /no longer exists/);
  assert.throws(() => products.save({ name: 'Zero', sale_price: 1, recipe: [{ ingredientId: dough, qty: 0 }] }), /greater than zero/);
  assert.equal(products.remove({ id: dough }).deactivated, true, 'an ingredient used by a recipe is never deleted');
});

test('weighed items: 1.375 kg of beef is priced per kg and deducts the exact weight', () => {
  const beef = products.save({ name: 'Beef', sale_price: 1800, cost_price: 1500, unit: 'kg', stock_qty: 30, weighed: true });
  assert.equal(products.get({ id: beef }).weighed, true);
  const o = orders.save({ orderType: 'takeaway', action: 'pay', items: [{ productId: beef, qty: 1.375 }], payment: { method: 'cash', tendered: 5000 }, tokenMode: 'none' });
  assert.equal(o.items[0].qty, 1.375);
  assert.equal(o.total, 2475); // 1.375 * 1800
  assert.equal(stock(beef), 28.625);
});

test('deals can contain recipe dishes: stock flows down to the ingredients', () => {
  const rice = products.save({ name: 'Rice', sale_price: 0, cost_price: 200, unit: 'kg', stock_qty: 40, is_ingredient: true });
  const biryani = products.save({ name: 'Biryani', sale_price: 400, recipe: [{ ingredientId: rice, qty: 0.25 }] });
  const deal = products.save({ name: 'Biryani Duo', sale_price: 700, isDeal: true, dealItems: [{ productId: biryani, qty: 2 }] });
  orders.save({ orderType: 'takeaway', action: 'pay', items: [{ productId: deal, qty: 3 }], payment: { method: 'cash', tendered: 5000 }, tokenMode: 'none' });
  assert.equal(stock(rice), 40 - 3 * 2 * 0.25);
});
