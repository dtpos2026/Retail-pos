'use strict';

const ctx = require('../core/context');
const settings = require('./settings');
const { localDate, addDays, round2 } = require('../core/util');

function summary() {
  const today = localDate();
  const t = ctx.db.get(
    `SELECT COUNT(*) orders,
       COALESCE(SUM(total), 0) sales,
       COALESCE(SUM(subtotal - item_discount - order_discount - cost_total), 0) profit,
       COALESCE(SUM(cost_total), 0) cost,
       COALESCE(SUM(due), 0) credit,
       COALESCE(SUM(CASE WHEN order_type = 'dine_in' THEN total END), 0) dine_in,
       COALESCE(SUM(CASE WHEN order_type = 'takeaway' THEN total END), 0) takeaway,
       COALESCE(SUM(CASE WHEN order_type = 'delivery' THEN total END), 0) delivery,
       COALESCE(SUM(order_discount + item_discount), 0) discounts
     FROM orders WHERE status = 'completed' AND business_date = ?`,
    [today]
  );
  const pay = ctx.db.all(
    `SELECT p.method, COALESCE(SUM(p.amount), 0) amount FROM payments p JOIN orders o ON o.id = p.order_id
     WHERE o.status = 'completed' AND substr(p.created_at, 1, 10) = ? GROUP BY p.method`,
    [today]
  );
  const byMethod = Object.fromEntries(pay.map((r) => [r.method, round2(r.amount)]));
  const costKnown = ctx.db.get(
    `SELECT COUNT(*) c FROM order_items i JOIN orders o ON o.id = i.order_id
     WHERE o.status = 'completed' AND o.business_date = ? AND i.cost_price > 0`,
    [today]
  ).c;

  const pendingOrders = ctx.db.get("SELECT COUNT(*) c FROM orders WHERE status = 'pending'").c;
  const occupiedTables = ctx.db.get("SELECT COUNT(*) c FROM dining_tables WHERE status = 'occupied' AND active = 1").c;
  const totalTables = ctx.db.get('SELECT COUNT(*) c FROM dining_tables WHERE active = 1').c;

  const inventoryOn = settings.get('inventory').enabled;
  const lowStock = inventoryOn
    ? ctx.db.all(
        `SELECT id, name, stock_qty, low_stock, unit FROM products
         WHERE active = 1 AND track_stock = 1 AND stock_qty <= low_stock ORDER BY stock_qty ASC LIMIT 8`
      )
    : [];
  const lowStockCount = inventoryOn
    ? ctx.db.get('SELECT COUNT(*) c FROM products WHERE active = 1 AND track_stock = 1 AND stock_qty <= low_stock').c
    : 0;

  const recent = ctx.db.all(
    `SELECT id, order_no, order_type, status, payment_status, total, customer_name, table_name, created_at
     FROM orders ORDER BY id DESC LIMIT 8`
  );
  const topItems = ctx.db.all(
    `SELECT i.name, SUM(i.qty) qty, SUM(i.total) revenue FROM order_items i JOIN orders o ON o.id = i.order_id
     WHERE o.status = 'completed' AND o.business_date >= ? GROUP BY COALESCE(i.product_id, i.name) ORDER BY qty DESC LIMIT 6`,
    [addDays(today, -6)]
  );

  // Last 7 days sales trend
  const from = addDays(today, -6);
  const days = ctx.db.all(
    `SELECT business_date d, COALESCE(SUM(total), 0) total, COUNT(*) orders FROM orders
     WHERE status = 'completed' AND business_date >= ? GROUP BY business_date`,
    [from]
  );
  const map = Object.fromEntries(days.map((r) => [r.d, r]));
  const trend = [];
  for (let i = 0; i < 7; i++) {
    const d = addDays(from, i);
    trend.push({ date: d, total: round2(map[d]?.total || 0), orders: map[d]?.orders || 0 });
  }

  // Today by hour
  const hours = ctx.db.all(
    `SELECT CAST(substr(created_at, 12, 2) AS INTEGER) h, COALESCE(SUM(total), 0) total FROM orders
     WHERE status = 'completed' AND business_date = ? GROUP BY h`,
    [today]
  );

  return {
    today: {
      orders: t.orders,
      sales: round2(t.sales),
      profit: costKnown > 0 ? round2(t.profit) : null,
      credit: round2(t.credit),
      cash: byMethod.cash || 0,
      card: byMethod.card || 0,
      bank: byMethod.bank || 0,
      other: byMethod.other || 0,
      dineIn: round2(t.dine_in),
      takeaway: round2(t.takeaway),
      delivery: round2(t.delivery),
      discounts: round2(t.discounts),
      avgOrder: t.orders ? round2(t.sales / t.orders) : 0,
    },
    pendingOrders,
    occupiedTables,
    totalTables,
    inventoryOn,
    lowStock,
    lowStockCount,
    recent,
    topItems: topItems.map((r) => ({ ...r, revenue: round2(r.revenue) })),
    trend,
    hours: hours.map((h) => ({ hour: h.h, total: round2(h.total) })),
  };
}

module.exports = { summary };
