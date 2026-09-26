'use strict';

const ctx = require('../core/context');
const settings = require('./settings');
const { AppError, assert } = require('../core/errors');
const { nowLocal, round2, toNumber, cleanStr } = require('../core/util');

function isEnabled() {
  return settings.get('inventory').enabled;
}

function move(productId, type, qty, { note, orderId, unitCost } = {}) {
  const p = ctx.db.get('SELECT id, name, stock_qty FROM products WHERE id = ?', [productId]);
  if (!p) return;
  const balance = round2(p.stock_qty + qty);
  ctx.db.run('UPDATE products SET stock_qty = ? WHERE id = ?', [balance, productId]);
  ctx.db.run(
    `INSERT INTO stock_movements (product_id, type, qty, balance, unit_cost, note, order_id, user_id, user_name, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [productId, type, round2(qty), balance, unitCost ?? null, note || null, orderId || null, ctx.user?.id, ctx.user?.name, nowLocal()]
  );
  return balance;
}

/** Deduct stock for a completed order. Called inside the checkout transaction. */
function applySale(orderId) {
  if (!isEnabled()) return false;
  const order = ctx.db.get('SELECT id, order_no, stock_applied FROM orders WHERE id = ?', [orderId]);
  if (!order || order.stock_applied) return false;
  const { allowNegative } = settings.get('inventory');
  const items = ctx.db.all(
    `SELECT i.product_id, SUM(i.qty) qty, p.name, p.stock_qty, p.track_stock
     FROM order_items i JOIN products p ON p.id = i.product_id
     WHERE i.order_id = ? GROUP BY i.product_id`,
    [orderId]
  );
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
  const items = ctx.db.all(
    `SELECT i.product_id, SUM(i.qty) qty, p.track_stock FROM order_items i JOIN products p ON p.id = i.product_id
     WHERE i.order_id = ? GROUP BY i.product_id`,
    [orderId]
  );
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
  qty = round2(toNumber(qty));
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
      const diff = round2(qty - p.stock_qty);
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
  const products = ctx.db.all(
    `SELECT p.id, p.name, p.sku, p.unit, p.stock_qty, p.low_stock, p.cost_price, p.sale_price, p.track_stock, p.active,
       c.name AS category_name
     FROM products p LEFT JOIN categories c ON c.id = p.category_id
     WHERE p.track_stock = 1 ORDER BY p.name`
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
    products,
    totals: { items: products.length, stockValue: round2(stockValue), saleValue: round2(saleValue), low, out },
  };
}

module.exports = { isEnabled, applySale, reverseSale, adjust, movements, summary };
