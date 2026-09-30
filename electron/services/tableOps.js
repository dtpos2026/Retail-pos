'use strict';

/*
 * Table management for running dine-in bills:
 *   transfer – move a running bill to another free table
 *   merge    – combine the running bills of several tables into one bill
 *   split    – move some items of a running bill to a new bill on another free table
 *   free     – clear a table (cancels its running bill)
 */

const ctx = require('../core/context');
const settings = require('./settings');
const counters = require('./counters');
const { AppError, assert } = require('../core/errors');
const { nowLocal, localDate, round2, toNumber, cleanStr } = require('../core/util');
const { calcOrder } = require('../../shared/calc.mjs');

function pendingOrder(id) {
  const o = ctx.db.get('SELECT * FROM orders WHERE id = ?', [Number(id)]);
  assert(o, 'Order not found.');
  assert(o.status === 'pending', 'This bill is already closed.');
  assert(o.order_type === 'dine_in', 'Only dine-in bills can be moved between tables.');
  return o;
}

function freeTableRow(id) {
  const t = ctx.db.get('SELECT * FROM dining_tables WHERE id = ? AND active = 1', [Number(id)]);
  assert(t, 'Table not found.');
  if (t.status === 'occupied' && t.current_order_id) {
    const cur = ctx.db.get("SELECT id FROM orders WHERE id = ? AND status = 'pending'", [t.current_order_id]);
    if (cur) throw new AppError(`${t.name} already has a running bill.`);
  }
  assert(t.status !== 'reserved', `${t.name} is reserved. Free it first.`);
  return t;
}

function release(tableId, orderId) {
  if (tableId) ctx.db.run("UPDATE dining_tables SET status = 'available', current_order_id = NULL WHERE id = ? AND current_order_id = ?", [tableId, orderId]);
}

/** Recalculate line totals and order totals from the order's items. */
function recalc(orderId, orderDiscount) {
  const sales = settings.get('sales');
  const o = ctx.db.get('SELECT * FROM orders WHERE id = ?', [orderId]);
  const items = ctx.db.all('SELECT * FROM order_items WHERE order_id = ? ORDER BY id', [orderId]);
  const disc = orderDiscount === undefined ? o.order_discount : orderDiscount;
  const totals = calcOrder({
    items: items.map((i) => ({ qty: i.qty, unitPrice: i.unit_price, unitDiscount: i.qty ? i.discount / i.qty : 0 })),
    orderDiscount: disc,
    deliveryCharges: 0,
    taxEnabled: sales.taxEnabled,
    taxRate: sales.taxRate,
    roundTotal: sales.roundTotal,
  });
  items.forEach((i, idx) => ctx.db.run('UPDATE order_items SET discount = ?, total = ? WHERE id = ?', [totals.lines[idx].discount, totals.lines[idx].total, i.id]));
  const cost = round2(items.reduce((s, i) => s + i.cost_price * i.qty, 0));
  ctx.db.run(
    `UPDATE orders SET subtotal = ?, item_discount = ?, order_discount = ?, tax_rate = ?, tax_amount = ?, round_off = ?, total = ?, cost_total = ?, updated_at = ? WHERE id = ?`,
    [totals.subtotal, totals.itemDiscount, totals.orderDiscount, sales.taxEnabled ? sales.taxRate : 0, totals.tax, totals.roundOff, totals.total, cost, nowLocal(), orderId]
  );
}

function transfer({ orderId, toTableId }) {
  const o = pendingOrder(orderId);
  assert(o.table_id !== Number(toTableId), 'The bill is already on this table.');
  return ctx.db.transaction(() => {
    const t = freeTableRow(toTableId);
    release(o.table_id, o.id);
    ctx.db.run('UPDATE orders SET table_id = ?, table_name = ?, updated_at = ? WHERE id = ?', [t.id, t.name, nowLocal(), o.id]);
    ctx.db.run("UPDATE dining_tables SET status = 'occupied', current_order_id = ? WHERE id = ?", [o.id, t.id]);
    return { orderId: o.id, table: t.name };
  });
}

/** Merge the running bills `fromOrderIds` into `intoOrderId`; the emptied tables become free. */
function merge({ intoOrderId, fromOrderIds }) {
  const from = [...new Set((Array.isArray(fromOrderIds) ? fromOrderIds : []).map(Number).filter((x) => x && x !== Number(intoOrderId)))];
  assert(from.length > 0, 'Select at least one more table to merge.');
  return ctx.db.transaction(() => {
    const into = pendingOrder(intoOrderId);
    let extraDiscount = 0;
    const names = [];
    for (const fid of from) {
      const f = pendingOrder(fid);
      ctx.db.run('UPDATE order_items SET order_id = ? WHERE order_id = ?', [into.id, f.id]);
      extraDiscount += toNumber(f.order_discount);
      names.push(f.table_name || f.order_no);
      ctx.db.run(
        "UPDATE orders SET status = 'cancelled', cancel_reason = ?, subtotal = 0, item_discount = 0, order_discount = 0, tax_amount = 0, total = 0, cost_total = 0, updated_at = ? WHERE id = ?",
        [`Merged into ${into.order_no}`, nowLocal(), f.id]
      );
      release(f.table_id, f.id);
    }
    const note = `Merged: ${names.join(', ')}`;
    ctx.db.run('UPDATE orders SET merged_note = ? WHERE id = ?', [[into.merged_note, note].filter(Boolean).join(' · '), into.id]);
    recalc(into.id, round2(toNumber(into.order_discount) + extraDiscount));
    return { orderId: into.id, merged: names };
  });
}

/**
 * Move `lines` ([{ itemId, qty }]) to a new running bill on `toTableId`.
 * At least one item (or part of an item) must stay on the original bill.
 */
function split({ orderId, lines, toTableId }) {
  const wanted = (Array.isArray(lines) ? lines : []).map((l) => ({ itemId: Number(l.itemId), qty: round2(toNumber(l.qty)) })).filter((l) => l.itemId && l.qty > 0);
  assert(wanted.length > 0, 'Select the items to move.');
  return ctx.db.transaction(() => {
    const o = pendingOrder(orderId);
    const t = freeTableRow(toTableId);
    assert(t.id !== o.table_id, 'Choose a different table for the new bill.');
    const items = ctx.db.all('SELECT * FROM order_items WHERE order_id = ?', [o.id]);
    const byId = new Map(items.map((i) => [i.id, i]));
    let remaining = items.reduce((s, i) => s + i.qty, 0);
    const moves = [];
    for (const w of wanted) {
      const it = byId.get(w.itemId);
      assert(it, 'An item was not found on this bill.');
      assert(w.qty <= it.qty + 0.0001, `Cannot move more than ${it.qty} × ${it.name}.`);
      moves.push({ it, qty: Math.min(w.qty, it.qty) });
      remaining -= Math.min(w.qty, it.qty);
    }
    assert(remaining > 0.0001, 'Leave at least one item on the original bill (or use Transfer to move the whole bill).');

    const now = nowLocal();
    const newId = ctx.db.run(
      `INSERT INTO orders (order_no, order_type, status, payment_status, table_id, table_name, customer_id, customer_name, customer_mobile, customer_address,
         cashier_id, cashier_name, business_date, notes, merged_note, created_at, updated_at)
       VALUES (?, 'dine_in', 'pending', 'unpaid', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [counters.nextOrderNo(), t.id, t.name, o.customer_id, o.customer_name, o.customer_mobile, o.customer_address, ctx.user?.id || o.cashier_id, ctx.user?.name || o.cashier_name, localDate(), null, `Split from ${o.order_no} (${o.table_name})`, now, now]
    ).lastInsertRowid;
    for (const { it, qty } of moves) {
      const unitDiscount = it.qty ? it.discount / it.qty : 0;
      ctx.db.run(
        'INSERT INTO order_items (order_id, product_id, name, category, qty, unit_price, cost_price, discount, total, notes) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [newId, it.product_id, it.name, it.category, qty, it.unit_price, it.cost_price, round2(unitDiscount * qty), 0, it.notes]
      );
      if (qty >= it.qty - 0.0001) ctx.db.run('DELETE FROM order_items WHERE id = ?', [it.id]);
      else ctx.db.run('UPDATE order_items SET qty = ? WHERE id = ?', [round2(it.qty - qty), it.id]);
    }
    ctx.db.run("UPDATE dining_tables SET status = 'occupied', current_order_id = ? WHERE id = ?", [newId, t.id]);
    recalc(o.id);
    recalc(newId, 0);
    return { orderId: o.id, newOrderId: newId, table: t.name };
  });
}

/** Clear a table. A running bill on it is cancelled (the UI asks for confirmation first). */
function free({ tableId, reason }) {
  const t = ctx.db.get('SELECT * FROM dining_tables WHERE id = ?', [Number(tableId)]);
  assert(t, 'Table not found.');
  return ctx.db.transaction(() => {
    const cur = t.current_order_id ? ctx.db.get("SELECT * FROM orders WHERE id = ? AND status = 'pending'", [t.current_order_id]) : null;
    if (cur) {
      ctx.db.run("UPDATE orders SET status = 'cancelled', cancel_reason = ?, updated_at = ? WHERE id = ?", [cleanStr(reason, 200) || 'Table freed', nowLocal(), cur.id]);
    }
    ctx.db.run("UPDATE dining_tables SET status = 'available', current_order_id = NULL WHERE id = ?", [t.id]);
    return { cancelled: cur ? cur.order_no : null };
  });
}

/** Dine-in history with a per-table summary. */
function history({ from, to, tableId, status } = {}) {
  const where = ["o.order_type = 'dine_in'"];
  const p = {};
  if (from) { where.push('o.business_date >= $from'); p.from = from; }
  if (to) { where.push('o.business_date <= $to'); p.to = to; }
  if (tableId) { where.push('o.table_id = $tid'); p.tid = Number(tableId); }
  if (status) { where.push('o.status = $st'); p.st = status; }
  const rows = ctx.db.all(
    `SELECT o.id, o.order_no, o.status, o.table_id, o.table_name, o.customer_name, o.total, o.paid, o.due, o.payment_method, o.payment_bank, o.merged_note,
       o.cashier_name, o.created_at, o.completed_at, (SELECT COUNT(*) FROM order_items i WHERE i.order_id = o.id) AS item_count
     FROM orders o WHERE ${where.join(' AND ')} ORDER BY o.id DESC LIMIT 2000`,
    p
  );
  const perTable = {};
  for (const r of rows) {
    if (r.status !== 'completed') continue;
    const k = r.table_name || '—';
    const e = (perTable[k] = perTable[k] || { table: k, orders: 0, sales: 0 });
    e.orders++;
    e.sales = round2(e.sales + r.total);
  }
  return { rows, perTable: Object.values(perTable).sort((a, b) => b.sales - a.sales) };
}

module.exports = { transfer, merge, split, free, history };
