'use strict';

const ctx = require('../core/context');
const settings = require('./settings');
const { AppError } = require('../core/errors');
const { localDate, isDateStr, round2 } = require('../core/util');

const TYPE_LABEL = { dine_in: 'Dine-In', takeaway: 'Takeaway', delivery: 'Delivery' };

const REPORTS = [
  { key: 'sales', label: 'Sales Report', group: 'Sales' },
  { key: 'orders', label: 'Order Report', group: 'Sales' },
  { key: 'dine_in', label: 'Dine-In Sales', group: 'Sales' },
  { key: 'takeaway', label: 'Takeaway Sales', group: 'Sales' },
  { key: 'delivery', label: 'Delivery Sales', group: 'Sales' },
  { key: 'products', label: 'Product Sales', group: 'Items' },
  { key: 'categories', label: 'Category Sales', group: 'Items' },
  { key: 'payments', label: 'Payment Report', group: 'Money' },
  { key: 'dues', label: 'Credit / Due Report', group: 'Money' },
  { key: 'discounts', label: 'Discount Report', group: 'Money' },
  { key: 'profit', label: 'Profit Report', group: 'Money' },
  { key: 'cashiers', label: 'Cashier Report', group: 'Staff' },
  { key: 'inventory', label: 'Inventory Report', group: 'Stock' },
  { key: 'stock_movements', label: 'Stock Movements', group: 'Stock' },
];

const money = (key, label) => ({ key, label, type: 'money' });
const num = (key, label) => ({ key, label, type: 'number' });
const text = (key, label) => ({ key, label, type: 'text' });

function range(from, to) {
  const f = isDateStr(from) ? from : localDate();
  const t = isDateStr(to) ? to : f;
  if (f > t) throw new AppError('Start date must be before end date.');
  return { from: f, to: t };
}

function sumCols(rows, keys) {
  const totals = {};
  for (const k of keys) totals[k] = round2(rows.reduce((s, r) => s + (Number(r[k]) || 0), 0));
  return totals;
}

function sales({ from, to }) {
  const rows = ctx.db.all(
    `SELECT business_date AS date, COUNT(*) AS orders, SUM(subtotal) AS gross, SUM(item_discount + order_discount) AS discount,
       SUM(tax_amount) AS tax, SUM(delivery_charges) AS delivery, SUM(total) AS total, SUM(paid) AS paid, SUM(due) AS due
     FROM orders WHERE status = 'completed' AND business_date BETWEEN ? AND ? GROUP BY business_date ORDER BY business_date`,
    [from, to]
  );
  const totals = sumCols(rows, ['orders', 'gross', 'discount', 'tax', 'delivery', 'total', 'paid', 'due']);
  const refunds = ctx.db.get(
    "SELECT COUNT(*) c, COALESCE(SUM(total),0) t FROM orders WHERE status = 'refunded' AND business_date BETWEEN ? AND ?",
    [from, to]
  );
  return {
    columns: [text('date', 'Date'), num('orders', 'Orders'), money('gross', 'Gross'), money('discount', 'Discount'), money('tax', 'Tax'), money('delivery', 'Delivery'), money('total', 'Net Sales'), money('paid', 'Received'), money('due', 'Due')],
    rows,
    totals: { date: 'Total', ...totals },
    cards: [
      { label: 'Net Sales', value: totals.total, type: 'money' },
      { label: 'Orders', value: totals.orders, type: 'number' },
      { label: 'Average Order', value: totals.orders ? round2(totals.total / totals.orders) : 0, type: 'money' },
      { label: 'Discounts', value: totals.discount, type: 'money' },
      { label: 'Refunded', value: round2(refunds.t), type: 'money', hint: `${refunds.c} order(s)` },
    ],
  };
}

function orders({ from, to, orderType }) {
  const params = [from, to];
  let extra = '';
  if (orderType) {
    extra = ' AND order_type = ?';
    params.push(orderType);
  }
  const rows = ctx.db
    .all(
      `SELECT order_no, created_at, order_type, customer_name, table_name, cashier_name, status, payment_method, total, paid, due
       FROM orders WHERE business_date BETWEEN ? AND ? AND status <> 'pending'${extra} ORDER BY id`,
      params
    )
    .map((r) => ({ ...r, order_type: TYPE_LABEL[r.order_type] || r.order_type, payment_method: r.payment_method || '-' }));
  const completed = rows.filter((r) => r.status === 'completed');
  const totals = sumCols(completed, ['total', 'paid', 'due']);
  return {
    columns: [text('order_no', 'Order #'), text('created_at', 'Date / Time'), text('order_type', 'Type'), text('customer_name', 'Customer'), text('table_name', 'Table'), text('cashier_name', 'Cashier'), text('status', 'Status'), text('payment_method', 'Payment'), money('total', 'Total'), money('paid', 'Paid'), money('due', 'Due')],
    rows,
    totals: { order_no: 'Completed total', ...totals },
    cards: [
      { label: 'Completed Orders', value: completed.length, type: 'number' },
      { label: 'Sales', value: totals.total, type: 'money' },
      { label: 'Average Order', value: completed.length ? round2(totals.total / completed.length) : 0, type: 'money' },
      { label: 'Cancelled / Refunded', value: rows.length - completed.length, type: 'number' },
    ],
    note: 'Totals include completed orders only.',
  };
}

function products({ from, to }) {
  const rows = ctx.db
    .all(
      `SELECT i.name, COALESCE(i.category, '-') AS category, SUM(i.qty) AS qty, SUM(i.total) AS revenue,
         SUM(i.cost_price * i.qty) AS cost, SUM(i.total - i.cost_price * i.qty) AS profit
       FROM order_items i JOIN orders o ON o.id = i.order_id
       WHERE o.status = 'completed' AND o.business_date BETWEEN ? AND ?
       GROUP BY COALESCE(i.product_id, i.name) ORDER BY revenue DESC`,
      [from, to]
    )
    .map((r) => ({ ...r, qty: round2(r.qty), revenue: round2(r.revenue), cost: round2(r.cost), profit: round2(r.profit) }));
  const totals = sumCols(rows, ['qty', 'revenue', 'cost', 'profit']);
  return {
    columns: [text('name', 'Product'), text('category', 'Category'), num('qty', 'Qty Sold'), money('revenue', 'Revenue'), money('cost', 'Cost'), money('profit', 'Profit')],
    rows,
    totals: { name: 'Total', ...totals },
    cards: [
      { label: 'Items Sold', value: totals.qty, type: 'number' },
      { label: 'Revenue', value: totals.revenue, type: 'money' },
      { label: 'Products', value: rows.length, type: 'number' },
    ],
    note: 'Revenue is after item discounts, before order-level discount and tax.',
  };
}

function categories({ from, to }) {
  const rows = ctx.db
    .all(
      `SELECT COALESCE(i.category, 'Uncategorised') AS category, COUNT(DISTINCT o.id) AS orders, SUM(i.qty) AS qty,
         SUM(i.total) AS revenue, SUM(i.total - i.cost_price * i.qty) AS profit
       FROM order_items i JOIN orders o ON o.id = i.order_id
       WHERE o.status = 'completed' AND o.business_date BETWEEN ? AND ?
       GROUP BY COALESCE(i.category, 'Uncategorised') ORDER BY revenue DESC`,
      [from, to]
    )
    .map((r) => ({ ...r, qty: round2(r.qty), revenue: round2(r.revenue), profit: round2(r.profit) }));
  const totals = sumCols(rows, ['qty', 'revenue', 'profit']);
  return {
    columns: [text('category', 'Category'), num('orders', 'Orders'), num('qty', 'Qty Sold'), money('revenue', 'Revenue'), money('profit', 'Profit')],
    rows,
    totals: { category: 'Total', ...totals },
    cards: [{ label: 'Revenue', value: totals.revenue, type: 'money' }, { label: 'Items Sold', value: totals.qty, type: 'number' }],
  };
}

function methodLabel(key) {
  const m = settings.get('payment').methods.find((x) => x.key === key);
  return m ? m.label : key;
}

function payments({ from, to }) {
  const rows = ctx.db
    .all(
      `SELECT p.method, COUNT(*) AS count, SUM(p.amount) AS amount FROM payments p JOIN orders o ON o.id = p.order_id
       WHERE o.status = 'completed' AND substr(p.created_at, 1, 10) BETWEEN ? AND ? GROUP BY p.method ORDER BY amount DESC`,
      [from, to]
    )
    .map((r) => ({ method: methodLabel(r.method), count: r.count, amount: round2(r.amount) }));
  const due = ctx.db.get("SELECT COALESCE(SUM(due),0) d FROM orders WHERE status = 'completed' AND business_date BETWEEN ? AND ?", [from, to]).d;
  const totals = sumCols(rows, ['count', 'amount']);
  return {
    columns: [text('method', 'Payment Method'), num('count', 'Transactions'), money('amount', 'Amount Received')],
    rows,
    totals: { method: 'Total', ...totals },
    cards: [
      { label: 'Total Received', value: totals.amount, type: 'money' },
      ...rows.map((r) => ({ label: r.method, value: r.amount, type: 'money' })),
      { label: 'Credit (Unpaid)', value: round2(due), type: 'money' },
    ],
    note: 'Payments are grouped by the date they were received, including dues collected later.',
  };
}

function dues({ from, to }) {
  const rows = ctx.db.all(
    `SELECT order_no, created_at, customer_name, customer_mobile, total, paid, due FROM orders
     WHERE status = 'completed' AND due > 0 AND business_date BETWEEN ? AND ? ORDER BY id`,
    [from, to]
  );
  const totals = sumCols(rows, ['total', 'paid', 'due']);
  return {
    columns: [text('order_no', 'Order #'), text('created_at', 'Date'), text('customer_name', 'Customer'), text('customer_mobile', 'Mobile'), money('total', 'Total'), money('paid', 'Paid'), money('due', 'Due')],
    rows,
    totals: { order_no: 'Total', ...totals },
    cards: [{ label: 'Outstanding Due', value: totals.due, type: 'money' }, { label: 'Credit Orders', value: rows.length, type: 'number' }],
  };
}

function discounts({ from, to }) {
  const rows = ctx.db.all(
    `SELECT order_no, created_at, cashier_name, subtotal, item_discount, order_discount,
       (item_discount + order_discount) AS total_discount, total
     FROM orders WHERE status = 'completed' AND (item_discount + order_discount) > 0 AND business_date BETWEEN ? AND ? ORDER BY id`,
    [from, to]
  );
  const totals = sumCols(rows, ['subtotal', 'item_discount', 'order_discount', 'total_discount', 'total']);
  return {
    columns: [text('order_no', 'Order #'), text('created_at', 'Date'), text('cashier_name', 'Cashier'), money('subtotal', 'Subtotal'), money('item_discount', 'Item Disc.'), money('order_discount', 'Bill Disc.'), money('total_discount', 'Total Disc.'), money('total', 'Net Total')],
    rows,
    totals: { order_no: 'Total', ...totals },
    cards: [{ label: 'Total Discount', value: totals.total_discount, type: 'money' }, { label: 'Discounted Orders', value: rows.length, type: 'number' }],
  };
}

function profit({ from, to }) {
  const rows = ctx.db
    .all(
      `SELECT business_date AS date, COUNT(*) AS orders, SUM(subtotal - item_discount - order_discount) AS net_sales,
         SUM(cost_total) AS cost, SUM(subtotal - item_discount - order_discount - cost_total) AS profit
       FROM orders WHERE status = 'completed' AND business_date BETWEEN ? AND ? GROUP BY business_date ORDER BY business_date`,
      [from, to]
    )
    .map((r) => ({ ...r, net_sales: round2(r.net_sales), cost: round2(r.cost), profit: round2(r.profit), margin: r.net_sales ? round2((r.profit / r.net_sales) * 100) : 0 }));
  const totals = sumCols(rows, ['orders', 'net_sales', 'cost', 'profit']);
  totals.margin = totals.net_sales ? round2((totals.profit / totals.net_sales) * 100) : 0;
  const missing = ctx.db.get(
    `SELECT COUNT(DISTINCT i.name) c FROM order_items i JOIN orders o ON o.id = i.order_id
     WHERE o.status = 'completed' AND o.business_date BETWEEN ? AND ? AND i.cost_price <= 0`,
    [from, to]
  ).c;
  return {
    columns: [text('date', 'Date'), num('orders', 'Orders'), money('net_sales', 'Net Sales (excl. tax)'), money('cost', 'Cost'), money('profit', 'Gross Profit'), num('margin', 'Margin %')],
    rows,
    totals: { date: 'Total', ...totals },
    cards: [
      { label: 'Gross Profit', value: totals.profit, type: 'money' },
      { label: 'Net Sales', value: totals.net_sales, type: 'money' },
      { label: 'Cost', value: totals.cost, type: 'money' },
      { label: 'Margin', value: `${totals.margin}%`, type: 'text' },
    ],
    note: missing ? `${missing} sold item(s) have no cost price, so profit for them is overstated. Add cost prices in Products.` : 'Profit = net sales (after discounts, excluding tax and delivery) minus cost price.',
  };
}

function cashiers({ from, to }) {
  const rows = ctx.db
    .all(
      `SELECT COALESCE(cashier_name, '-') AS cashier, COUNT(*) AS orders, SUM(total) AS sales,
         SUM(item_discount + order_discount) AS discount, SUM(paid) AS received, SUM(due) AS due
       FROM orders WHERE status = 'completed' AND business_date BETWEEN ? AND ? GROUP BY cashier_id ORDER BY sales DESC`,
      [from, to]
    )
    .map((r) => ({ ...r, sales: round2(r.sales), discount: round2(r.discount), received: round2(r.received), due: round2(r.due) }));
  const cash = ctx.db.all(
    `SELECT COALESCE(u.name, '-') AS cashier, SUM(p.amount) AS cash FROM payments p JOIN orders o ON o.id = p.order_id
     LEFT JOIN users u ON u.id = p.user_id
     WHERE o.status = 'completed' AND p.method = 'cash' AND substr(p.created_at, 1, 10) BETWEEN ? AND ? GROUP BY p.user_id`,
    [from, to]
  );
  const cashMap = Object.fromEntries(cash.map((c) => [c.cashier, round2(c.cash)]));
  rows.forEach((r) => (r.cash = cashMap[r.cashier] || 0));
  const totals = sumCols(rows, ['orders', 'sales', 'discount', 'received', 'due', 'cash']);
  return {
    columns: [text('cashier', 'Cashier'), num('orders', 'Orders'), money('sales', 'Sales'), money('discount', 'Discounts'), money('received', 'Received'), money('cash', 'Cash Collected'), money('due', 'Due')],
    rows,
    totals: { cashier: 'Total', ...totals },
    cards: [{ label: 'Sales', value: totals.sales, type: 'money' }, { label: 'Cash Collected', value: totals.cash, type: 'money' }],
  };
}

function inventoryReport() {
  const rows = ctx.db
    .all(
      `SELECT p.name, COALESCE(c.name, '-') AS category, p.stock_qty, p.unit, p.low_stock, p.cost_price, p.sale_price,
         (CASE WHEN p.stock_qty > 0 THEN p.stock_qty * p.cost_price ELSE 0 END) AS stock_value
       FROM products p LEFT JOIN categories c ON c.id = p.category_id WHERE p.track_stock = 1 AND p.active = 1 ORDER BY p.name`
    )
    .map((r) => ({ ...r, stock_value: round2(r.stock_value), status: r.stock_qty <= 0 ? 'Out of stock' : r.stock_qty <= r.low_stock ? 'Low' : 'OK' }));
  const totals = sumCols(rows, ['stock_value']);
  return {
    columns: [text('name', 'Product'), text('category', 'Category'), num('stock_qty', 'Stock'), text('unit', 'Unit'), num('low_stock', 'Low Alert'), money('cost_price', 'Cost'), money('sale_price', 'Price'), money('stock_value', 'Stock Value'), text('status', 'Status')],
    rows,
    totals: { name: 'Total', ...totals },
    cards: [
      { label: 'Stock Value (cost)', value: totals.stock_value, type: 'money' },
      { label: 'Low Stock', value: rows.filter((r) => r.status === 'Low').length, type: 'number' },
      { label: 'Out of Stock', value: rows.filter((r) => r.status === 'Out of stock').length, type: 'number' },
    ],
    noDate: true,
    note: settings.get('inventory').enabled ? null : 'Inventory tracking is currently disabled in Settings — stock is not being reduced by sales.',
  };
}

function stockMovements({ from, to }) {
  const TYPE = { opening: 'Opening', in: 'Stock In', out: 'Stock Out', adjust: 'Adjustment', sale: 'Sale', return: 'Refund Return' };
  const rows = ctx.db
    .all(
      `SELECT m.created_at, p.name, m.type, m.qty, m.balance, m.note, m.user_name FROM stock_movements m
       JOIN products p ON p.id = m.product_id WHERE substr(m.created_at, 1, 10) BETWEEN ? AND ? ORDER BY m.id`,
      [from, to]
    )
    .map((r) => ({ ...r, type: TYPE[r.type] || r.type }));
  return {
    columns: [text('created_at', 'Date / Time'), text('name', 'Product'), text('type', 'Type'), num('qty', 'Qty'), num('balance', 'Balance'), text('note', 'Note'), text('user_name', 'User')],
    rows,
    totals: null,
    cards: [{ label: 'Movements', value: rows.length, type: 'number' }],
  };
}

function run({ key, from, to }) {
  const def = REPORTS.find((r) => r.key === key);
  if (!def) throw new AppError('Unknown report.');
  const r = range(from, to);
  let out;
  switch (key) {
    case 'sales': out = sales(r); break;
    case 'orders': out = orders(r); break;
    case 'dine_in':
    case 'takeaway':
    case 'delivery': out = orders({ ...r, orderType: key }); break;
    case 'products': out = products(r); break;
    case 'categories': out = categories(r); break;
    case 'payments': out = payments(r); break;
    case 'dues': out = dues(r); break;
    case 'discounts': out = discounts(r); break;
    case 'profit': out = profit(r); break;
    case 'cashiers': out = cashiers(r); break;
    case 'inventory': out = inventoryReport(); break;
    case 'stock_movements': out = stockMovements(r); break;
  }
  return { key, title: def.label, from: r.from, to: r.to, ...out };
}

module.exports = { REPORTS, run, list: () => REPORTS };
