'use strict';

const ctx = require('../core/context');
const settings = require('./settings');
const { AppError, assert } = require('../core/errors');
const { nowLocal, round2, toNumber, cleanStr } = require('../core/util');
const round3 = (n) => Math.round((Number(n) + Number.EPSILON) * 1000) / 1000; // kg / litre precision to the gram

/**
 * Stock lines of an order. A dish with a recipe uses its ingredients (× the size factor), a deal uses its
 * components (each of which may have its own recipe), everything else uses itself.
 */
function stockLines(orderId) {
  const acc = new Map();
  const add = (pid, q) => acc.set(pid, (acc.get(pid) || 0) + q);
  const expand = (pid, qty, factor, depth) => {
    const p = ctx.db.get('SELECT id, is_deal FROM products WHERE id = ?', [pid]);
    if (!p || depth > 4) return;
    if (p.is_deal) {
      for (const c of ctx.db.all('SELECT product_id, qty FROM deal_items WHERE deal_id = ?', [pid])) expand(c.product_id, qty * c.qty, 1, depth + 1);
      return;
    }
    const rec = ctx.db.all('SELECT ingredient_id, qty FROM recipe_items WHERE product_id = ?', [pid]);
    if (rec.length) {
      for (const r of rec) add(r.ingredient_id, qty * factor * r.qty);
      return;
    }
    add(pid, qty);
  };
  for (const it of ctx.db.all('SELECT product_id, qty, recipe_factor FROM order_items WHERE order_id = ? AND product_id IS NOT NULL', [orderId])) {
    expand(it.product_id, it.qty, it.recipe_factor || 1, 0);
  }
  if (!acc.size) return [];
  return [...acc.entries()].map(([pid, qty]) => {
    const p = ctx.db.get('SELECT name, stock_qty, track_stock FROM products WHERE id = ?', [pid]);
    return { product_id: pid, qty: round3(qty), name: p.name, stock_qty: p.stock_qty, track_stock: p.track_stock };
  });
}

function isEnabled() {
  return settings.get('inventory').enabled;
}

const MODES = ['retail', 'restaurant'];
const mode = () => settings.get('inventory').mode || '';
const isRestaurant = () => mode() === 'restaurant';

/**
 * Choose how stock works — once. Retail: every product is its own stock. Restaurant: stock lives in raw
 * "inventory items" (ghee, chicken, daal…) and menu dishes use them through their recipes, so dishes stop
 * carrying stock of their own. The choice is locked afterwards (only a factory reset clears it).
 */
function setMode({ mode: next }) {
  assert(MODES.includes(next), 'Choose Retail or Restaurant.');
  const cur = settings.get('inventory');
  if (cur.modeLocked) throw new AppError(`The inventory type is already set to "${cur.mode}" and cannot be changed.`);
  return ctx.db.transaction(() => {
    if (next === 'restaurant') ctx.db.run('UPDATE products SET track_stock = 0 WHERE is_ingredient = 0');
    return settings.set('inventory', { mode: next, modeLocked: true }, { internal: true });
  });
}

/** Restaurant mode: add / edit a raw inventory item (hidden from the POS, used in recipes). */
function saveItem(input) {
  const products = require('./products');
  const name = cleanStr(input.name, 120);
  assert(name, 'Item name is required.');
  const id = input.id ? Number(input.id) : null;
  if (id) {
    const p = ctx.db.get('SELECT id, is_ingredient FROM products WHERE id = ?', [id]);
    assert(p && p.is_ingredient, 'Inventory item not found.');
  }
  return products.save({
    id: id || undefined,
    name,
    unit: cleanStr(input.unit || 'kg', 20) || 'kg',
    sale_price: 0,
    cost_price: round2(toNumber(input.cost_price)),
    low_stock: round3(toNumber(input.low_stock)),
    stock_qty: id ? undefined : round3(toNumber(input.stock_qty)),
    track_stock: true,
    is_ingredient: true,
    category_id: null,
    active: input.active !== false,
  });
}

function move(productId, type, qty, { note, orderId, unitCost } = {}) {
  const p = ctx.db.get('SELECT id, name, stock_qty FROM products WHERE id = ?', [productId]);
  if (!p) return;
  const balance = round3(p.stock_qty + qty);
  ctx.db.run('UPDATE products SET stock_qty = ? WHERE id = ?', [balance, productId]);
  ctx.db.run(
    `INSERT INTO stock_movements (product_id, type, qty, balance, unit_cost, note, order_id, user_id, user_name, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [productId, type, round3(qty), balance, unitCost ?? null, note || null, orderId || null, ctx.user?.id, ctx.user?.name, nowLocal()]
  );
  return balance;
}

/** Deduct stock for a completed order. Called inside the checkout transaction. */
function applySale(orderId) {
  if (!isEnabled()) return false;
  const order = ctx.db.get('SELECT id, order_no, stock_applied FROM orders WHERE id = ?', [orderId]);
  if (!order || order.stock_applied) return false;
  const { allowNegative } = settings.get('inventory');
  const items = stockLines(orderId);
  for (const it of items) {
    if (!it.track_stock) continue;
    if (!allowNegative && it.stock_qty < it.qty) {
      throw new AppError(`Not enough stock for "${it.name}". Available: ${it.stock_qty}.`);
    }
    move(it.product_id, 'sale', -it.qty, { orderId, note: `Sale ${order.order_no}` });
  }
  ctx.db.run('UPDATE orders SET stock_applied = 1 WHERE id = ?', [orderId]);
  return true;
}

/** Put stock back when a completed order is refunded. */
function reverseSale(orderId) {
  const order = ctx.db.get('SELECT id, order_no, stock_applied FROM orders WHERE id = ?', [orderId]);
  if (!order || !order.stock_applied) return false;
  const items = stockLines(orderId);
  for (const it of items) {
    if (it.track_stock) move(it.product_id, 'return', it.qty, { orderId, note: `Refund ${order.order_no}` });
  }
  ctx.db.run('UPDATE orders SET stock_applied = 0 WHERE id = ?', [orderId]);
  return true;
}

/**
 * Manual stock operation.
 *  type "in"     – stock received (purchase)
 *  type "out"    – damaged / wasted / used
 *  type "adjust" – set counted quantity
 */
function adjust({ productId, type, qty, unitCost, note }) {
  const p = ctx.db.get('SELECT * FROM products WHERE id = ?', [Number(productId)]);
  assert(p, 'Product not found.');
  qty = round3(toNumber(qty));
  note = cleanStr(note, 200);
  return ctx.db.transaction(() => {
    if (type === 'in') {
      assert(qty > 0, 'Quantity must be greater than zero.');
      const cost = unitCost !== undefined && unitCost !== '' ? round2(toNumber(unitCost)) : null;
      if (cost !== null && cost >= 0) {
        // Weighted average cost keeps profit reports realistic.
        const oldQty = Math.max(0, p.stock_qty);
        const avg = oldQty + qty > 0 ? round2((oldQty * p.cost_price + qty * cost) / (oldQty + qty)) : cost;
        ctx.db.run('UPDATE products SET cost_price = ?, updated_at = ? WHERE id = ?', [avg, nowLocal(), p.id]);
      }
      return move(p.id, 'in', qty, { note: note || 'Stock in', unitCost: cost });
    }
    if (type === 'out') {
      assert(qty > 0, 'Quantity must be greater than zero.');
      return move(p.id, 'out', -qty, { note: note || 'Stock out' });
    }
    if (type === 'adjust') {
      assert(qty >= 0, 'Counted quantity cannot be negative.');
      const diff = round3(qty - p.stock_qty);
      if (diff === 0) return p.stock_qty;
      return move(p.id, 'adjust', diff, { note: note || 'Stock count adjustment' });
    }
    throw new AppError('Unknown stock operation.');
  });
}

function movements({ productId, from, to, limit } = {}) {
  const where = [];
  const params = {};
  if (productId) {
    where.push('m.product_id = $pid');
    params.pid = Number(productId);
  }
  if (from) {
    where.push('m.created_at >= $from');
    params.from = `${from} 00:00:00`;
  }
  if (to) {
    where.push('m.created_at <= $to');
    params.to = `${to} 23:59:59`;
  }
  params.lim = Math.min(2000, Number(limit) || 500);
  return ctx.db.all(
    `SELECT m.*, p.name AS product_name, p.unit FROM stock_movements m JOIN products p ON p.id = m.product_id
     ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY m.id DESC LIMIT $lim`,
    params
  );
}

function summary() {
  const restaurant = isRestaurant();
  const products = ctx.db.all(
    `SELECT p.id, p.name, p.sku, p.unit, p.stock_qty, p.low_stock, p.cost_price, p.sale_price, p.track_stock, p.active, p.is_ingredient,
       c.name AS category_name,
       (SELECT COUNT(DISTINCT r.product_id) FROM recipe_items r WHERE r.ingredient_id = p.id) AS used_in
     FROM products p LEFT JOIN categories c ON c.id = p.category_id
     WHERE ${restaurant ? 'p.is_ingredient = 1' : 'p.track_stock = 1'} ORDER BY p.name`
  );
  let stockValue = 0;
  let saleValue = 0;
  let low = 0;
  let out = 0;
  for (const p of products) {
    if (p.stock_qty > 0) {
      stockValue += p.stock_qty * p.cost_price;
      saleValue += p.stock_qty * p.sale_price;
    }
    if (p.stock_qty <= 0) out++;
    else if (p.stock_qty <= p.low_stock) low++;
  }
  return {
    enabled: isEnabled(),
    mode: mode(),
    products,
    totals: { items: products.length, stockValue: round2(stockValue), saleValue: round2(saleValue), low, out },
  };
}

/** Restaurant mode: delete a raw item (kept but switched off when recipes or history still use it). */
function removeItem({ id }) {
  const p = ctx.db.get('SELECT id, is_ingredient FROM products WHERE id = ?', [Number(id)]);
  assert(p && p.is_ingredient, 'Inventory item not found.');
  return require('./products').remove({ id: p.id });
}

module.exports = { isEnabled, isRestaurant, mode, setMode, saveItem, removeItem, applySale, reverseSale, adjust, movements, summary };
