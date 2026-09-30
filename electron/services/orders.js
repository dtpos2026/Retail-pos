'use strict';

const ctx = require('../core/context');
const settings = require('./settings');
const counters = require('./counters');
const inventory = require('./inventory');
const customers = require('./customers');
const { can } = require('../core/permissions');
const { AppError, assert } = require('../core/errors');
const { nowLocal, localDate, round2, toNumber, cleanStr, isDateStr } = require('../core/util');
const { calcOrder, calcPayment } = require('../../shared/calc.mjs');
const staff = require('./staff');

const ORDER_TYPES = ['dine_in', 'takeaway', 'delivery'];

function methodKeys() {
  return settings.get('payment').methods.filter((m) => m.enabled).map((m) => m.key);
}

function get({ id }) {
  const o = ctx.db.get('SELECT * FROM orders WHERE id = ?', [Number(id)]);
  assert(o, 'Order not found.');
  o.items = ctx.db.all('SELECT * FROM order_items WHERE order_id = ? ORDER BY id', [o.id]);
  o.payments = ctx.db.all('SELECT * FROM payments WHERE order_id = ? ORDER BY id', [o.id]);
  o.tokens = ctx.db.all('SELECT * FROM tokens WHERE order_id = ? ORDER BY id', [o.id]).map((t) => ({ ...t, items: JSON.parse(t.items) }));
  return o;
}

function list({ search, from, to, status, orderType, paymentStatus, cashierId, limit } = {}) {
  const where = [];
  const p = {};
  if (search) {
    where.push('(o.order_no LIKE $q OR o.customer_name LIKE $q OR o.customer_mobile LIKE $q OR o.token_no = $exact OR o.table_name LIKE $q)');
    p.q = `%${String(search).trim()}%`;
    p.exact = String(search).trim();
  }
  if (isDateStr(from)) {
    where.push('o.business_date >= $from');
    p.from = from;
  }
  if (isDateStr(to)) {
    where.push('o.business_date <= $to');
    p.to = to;
  }
  if (status) {
    where.push('o.status = $status');
    p.status = status;
  }
  if (orderType) {
    where.push('o.order_type = $type');
    p.type = orderType;
  }
  if (paymentStatus === 'due') where.push("o.due > 0 AND o.status = 'completed'");
  else if (paymentStatus) {
    where.push('o.payment_status = $ps');
    p.ps = paymentStatus;
  }
  if (cashierId) {
    where.push('o.cashier_id = $cid');
    p.cid = Number(cashierId);
  }
  p.lim = Math.min(5000, Number(limit) || 500);
  return ctx.db.all(
    `SELECT o.id, o.order_no, o.order_type, o.status, o.payment_status, o.table_name, o.customer_name, o.customer_mobile,
       o.total, o.paid, o.due, o.payment_method, o.token_no, o.cashier_name, o.waiter_name, o.rider_name, o.created_at, o.completed_at,
       (SELECT COUNT(*) FROM order_items i WHERE i.order_id = o.id) AS item_count
     FROM orders o ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
     ORDER BY o.id DESC LIMIT $lim`,
    p
  );
}

function pending({ withItems } = {}) {
  const rows = list({ status: 'pending', limit: 200 });
  if (!withItems || !rows.length) return rows;
  const items = ctx.db.all(
    `SELECT order_id, name, qty, total, notes FROM order_items WHERE order_id IN (${rows.map(() => '?').join(',')}) ORDER BY id`,
    rows.map((r) => r.id)
  );
  const by = {};
  for (const i of items) (by[i.order_id] = by[i.order_id] || []).push(i);
  return rows.map((r) => ({ ...r, items: by[r.id] || [] }));
}

/**
 * Create or update an order.
 *   action "hold" – save as pending (dine-in running bill / held order)
 *   action "pay"  – settle: record payment, complete, deduct stock, generate tokens
 */
function save(input) {
  const user = ctx.user;
  assert(user, 'Please log in again.');
  const sales = settings.get('sales');
  const tokenCfg = settings.get('token');

  const orderType = ORDER_TYPES.includes(input.orderType) ? input.orderType : null;
  assert(orderType, 'Select Dine-In, Takeaway or Delivery.');
  const typeEnabled = { dine_in: sales.enableDineIn, takeaway: sales.enableTakeaway, delivery: sales.enableDelivery }[orderType];
  assert(typeEnabled, 'This sale type is disabled in Settings.');
  const action = input.action === 'pay' ? 'pay' : 'hold';

  const rawItems = Array.isArray(input.items) ? input.items : [];
  assert(rawItems.length > 0, 'Cart is empty. Add at least one item.');

  return ctx.db.transaction(() => {
    // ---- items ---------------------------------------------------------
    let manualDiscount = toNumber(input.orderDiscount) > 0;
    const items = rawItems.map((it) => {
      const qty = round2(toNumber(it.qty));
      assert(qty > 0, 'Item quantity must be greater than zero.');
      let product = null;
      if (it.productId) {
        product = ctx.db.get(
          'SELECT p.*, c.name AS category_name FROM products p LEFT JOIN categories c ON c.id = p.category_id WHERE p.id = ?',
          [Number(it.productId)]
        );
        assert(product, `Product "${it.name || ''}" no longer exists. Remove it from the cart.`);
      }
      let dealNote = null;
      if (product && product.is_deal) {
        const parts = ctx.db.all('SELECT di.qty, cp.name FROM deal_items di JOIN products cp ON cp.id = di.product_id WHERE di.deal_id = ? ORDER BY di.id', [product.id]);
        dealNote = parts.map((d) => `${Math.round(d.qty * 100) / 100} × ${d.name}`).join(' + ');
      }
      const unitPrice = round2(toNumber(it.unitPrice, product ? product.sale_price : 0));
      const unitDiscount = round2(Math.min(unitPrice, Math.max(0, toNumber(it.unitDiscount))));
      if (unitDiscount > (product ? product.discount : 0) + 0.001) manualDiscount = true;
      const name = cleanStr(it.name || product?.name, 120);
      assert(name, 'Item name is required.');
      return {
        productId: product ? product.id : null,
        name,
        category: product?.category_name || null,
        qty,
        unitPrice,
        unitDiscount,
        costPrice: product ? product.cost_price : 0,
        notes: cleanStr(it.notes, 200) || dealNote,
      };
    });
    if (manualDiscount && !can(user, 'discount')) throw new AppError('You do not have permission to give discounts.');

    const deliveryCharges = orderType === 'delivery' ? toNumber(input.deliveryCharges) : 0;
    const totals = calcOrder({
      items,
      orderDiscount: toNumber(input.orderDiscount),
      deliveryCharges,
      taxEnabled: sales.taxEnabled,
      taxRate: sales.taxRate,
      roundTotal: sales.roundTotal,
    });
    const costTotal = round2(items.reduce((s, it) => s + it.costPrice * it.qty, 0));

    // ---- customer ------------------------------------------------------
    const cust = input.customer || {};
    let customerName = cleanStr(cust.name, 100) || null;
    let customerMobile = customers.normalizeMobile(cust.mobile) || null;
    let customerAddress = cleanStr(cust.address, 300) || null;
    if (orderType === 'delivery') {
      assert(customerName, 'Customer name is required for delivery.');
      assert(customerMobile, 'Mobile number is required for delivery.');
      assert(customerAddress, 'Delivery address is required.');
    }
    const customerId = customerName || customerMobile ? customers.upsertFromOrder({ id: cust.id, name: customerName, mobile: customerMobile, address: customerAddress }) : null;
    if (customerId && !customerName) customerName = ctx.db.get('SELECT name FROM customers WHERE id = ?', [customerId])?.name || null;

    const waiter = orderType === 'dine_in' ? staff.pick(input.waiterId, 'waiter') : null;
    const rider = orderType === 'delivery' ? staff.pick(input.riderId, 'rider') : null;

    // ---- table ---------------------------------------------------------
    let table = null;
    if (orderType === 'dine_in') {
      assert(input.tableId, 'Select a table for Dine-In.');
      table = ctx.db.get('SELECT * FROM dining_tables WHERE id = ? AND active = 1', [Number(input.tableId)]);
      assert(table, 'Selected table was not found.');
    }

    // ---- create / update order row --------------------------------------
    const now = nowLocal();
    let existing = null;
    if (input.id) {
      existing = ctx.db.get('SELECT * FROM orders WHERE id = ?', [Number(input.id)]);
      assert(existing, 'Order not found.');
      assert(existing.status === 'pending', 'This order is already closed and cannot be changed.');
    }
    if (table && table.status === 'occupied' && table.current_order_id && table.current_order_id !== existing?.id) {
      const other = ctx.db.get('SELECT status FROM orders WHERE id = ?', [table.current_order_id]);
      if (other && other.status === 'pending') throw new AppError(`${table.name} already has an open order. Open it from Tables.`);
    }

    const row = {
      order_type: orderType,
      table_id: table ? table.id : null,
      table_name: table ? table.name : null,
      waiter_id: orderType === 'dine_in' ? waiter?.id || null : null,
      waiter_name: orderType === 'dine_in' ? waiter?.name || null : null,
      rider_id: orderType === 'delivery' ? rider?.id || null : null,
      rider_name: orderType === 'delivery' ? rider?.name || null : null,
      customer_id: customerId,
      customer_name: customerName,
      customer_mobile: customerMobile,
      customer_address: customerAddress,
      subtotal: totals.subtotal,
      item_discount: totals.itemDiscount,
      order_discount: totals.orderDiscount,
      tax_rate: sales.taxEnabled ? sales.taxRate : 0,
      tax_amount: totals.tax,
      delivery_charges: totals.deliveryCharges,
      round_off: totals.roundOff,
      total: totals.total,
      cost_total: costTotal,
      notes: cleanStr(input.notes, 500) || null,
      updated_at: now,
    };

    let orderId;
    if (existing) {
      orderId = existing.id;
      const sets = Object.keys(row).map((k) => `${k} = $${k}`).join(', ');
      ctx.db.run(`UPDATE orders SET ${sets} WHERE id = $id`, { ...row, id: orderId });
      ctx.db.run('DELETE FROM order_items WHERE order_id = ?', [orderId]);
      if (existing.table_id && existing.table_id !== row.table_id) {
        ctx.db.run("UPDATE dining_tables SET status = 'available', current_order_id = NULL WHERE id = ? AND current_order_id = ?", [
          existing.table_id,
          orderId,
        ]);
      }
    } else {
      const full = {
        ...row,
        order_no: counters.nextOrderNo(),
        status: 'pending',
        payment_status: 'unpaid',
        cashier_id: user.id,
        cashier_name: user.name,
        business_date: localDate(),
        created_at: now,
      };
      const keys = Object.keys(full);
      orderId = ctx.db.run(`INSERT INTO orders (${keys.join(', ')}) VALUES (${keys.map((k) => '$' + k).join(', ')})`, full).lastInsertRowid;
    }

    items.forEach((it, i) => {
      const line = totals.lines[i];
      ctx.db.run(
        `INSERT INTO order_items (order_id, product_id, name, category, qty, unit_price, cost_price, discount, total, notes)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [orderId, it.productId, it.name, it.category, it.qty, it.unitPrice, it.costPrice, line.discount, line.total, it.notes]
      );
    });

    if (table) {
      ctx.db.run("UPDATE dining_tables SET status = 'occupied', current_order_id = ? WHERE id = ?", [orderId, table.id]);
    }

    // ---- settle ----------------------------------------------------------
    let tokens = [];
    if (action === 'pay') {
      const pay = input.payment || {};
      const method = methodKeys().includes(pay.method) ? pay.method : null;
      assert(method, 'Select a payment method.');
      let bankLabel = null;
      if (method === 'bank') {
        const accounts = (settings.get('payment').bankAccounts || []).filter((a) => a.enabled);
        if (accounts.length) {
          const acc = accounts.find((a) => a.id === pay.bankAccountId) || (accounts.length === 1 ? accounts[0] : null);
          assert(acc, 'Select the bank account the customer paid into.');
          bankLabel = `${acc.bankName} · ${acc.accountNo || acc.iban}`;
        }
      }
      const tendered = pay.tendered === undefined || pay.tendered === null || pay.tendered === '' ? totals.total : toNumber(pay.tendered);
      const p = calcPayment(totals.total, tendered);
      if (p.due > 0) {
        assert(sales.allowCredit, 'Paid amount is less than the total. Credit sales are disabled in Settings.');
        assert(customerName, 'Enter customer name for a credit (unpaid) sale so the due amount can be tracked.');
      }
      const paymentStatus = p.due <= 0 ? 'paid' : p.paid > 0 ? 'partial' : 'unpaid';
      ctx.db.run(
        `UPDATE orders SET status = 'completed', payment_status = ?, paid = ?, change_amount = ?, due = ?, payment_method = ?,
           completed_at = ?, updated_at = ?, payment_bank = ? WHERE id = ?`,
        [paymentStatus, p.paid, p.change, p.due, method, now, now, bankLabel, orderId]
      );
      if (p.paid > 0) {
        ctx.db.run('INSERT INTO payments (order_id, method, amount, user_id, created_at, bank_account) VALUES (?, ?, ?, ?, ?, ?)', [orderId, method, p.paid, user.id, now, bankLabel]);
      }
      inventory.applySale(orderId);
      if (table) ctx.db.run("UPDATE dining_tables SET status = 'available', current_order_id = NULL WHERE id = ?", [table.id]);

      const mode = ['combined', 'item', 'none'].includes(input.tokenMode) ? input.tokenMode : tokenCfg.orderTypes.includes(orderType) ? tokenCfg.mode : 'none';
      if (tokenCfg.enabled && mode !== 'none') tokens = createTokens(orderId, mode, items);
    }

    return get({ id: orderId });
  });
}

function createTokens(orderId, mode, items) {
  const now = nowLocal();
  const today = localDate();
  const groups = mode === 'item' ? items.map((it) => [it]) : [items];
  const numbers = [];
  for (const g of groups) {
    const no = counters.nextToken();
    const payload = g.map((it) => ({ name: it.name, qty: it.qty, category: it.category, notes: it.notes, total: round2(it.qty * (it.unitPrice - it.unitDiscount)) }));
    ctx.db.run('INSERT INTO tokens (token_no, order_id, items, status, business_date, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)', [
      no,
      orderId,
      JSON.stringify(payload),
      'preparing',
      today,
      now,
      now,
    ]);
    numbers.push(no);
  }
  ctx.db.run('UPDATE orders SET token_no = ? WHERE id = ?', [numbers.join(', '), orderId]);
  return numbers;
}

/** Generate a token for an already completed order that has none (e.g. forgot to tick token). */
function addToken({ id, mode }) {
  const o = get({ id });
  assert(o.status === 'completed', 'Tokens can only be generated for completed orders.');
  assert(settings.get('token').enabled, 'Token system is disabled in Settings.');
  return ctx.db.transaction(() => {
    const items = o.items.map((i) => ({ name: i.name, qty: i.qty, category: i.category, notes: i.notes, unitPrice: i.unit_price, unitDiscount: i.qty ? i.discount / i.qty : 0 }));
    createTokens(o.id, mode === 'item' ? 'item' : 'combined', items);
    return get({ id: o.id });
  });
}

function freeTable(o) {
  if (o.table_id) {
    ctx.db.run("UPDATE dining_tables SET status = 'available', current_order_id = NULL WHERE id = ? AND current_order_id = ?", [o.table_id, o.id]);
  }
}

function cancel({ id, reason }) {
  const o = ctx.db.get('SELECT * FROM orders WHERE id = ?', [Number(id)]);
  assert(o, 'Order not found.');
  assert(o.status === 'pending', 'Only open (pending) orders can be cancelled. Use Refund for completed orders.');
  ctx.db.transaction(() => {
    ctx.db.run("UPDATE orders SET status = 'cancelled', cancel_reason = ?, updated_at = ? WHERE id = ?", [cleanStr(reason, 200) || null, nowLocal(), o.id]);
    freeTable(o);
  });
  return true;
}

function refund({ id, reason }) {
  assert(can(ctx.user, 'refund'), 'You do not have permission to refund orders.');
  const o = ctx.db.get('SELECT * FROM orders WHERE id = ?', [Number(id)]);
  assert(o, 'Order not found.');
  assert(o.status === 'completed', 'Only completed orders can be refunded.');
  ctx.db.transaction(() => {
    inventory.reverseSale(o.id);
    ctx.db.run("UPDATE orders SET status = 'refunded', cancel_reason = ?, updated_at = ? WHERE id = ?", [cleanStr(reason, 200) || null, nowLocal(), o.id]);
    ctx.db.run("UPDATE tokens SET status = 'cancelled' WHERE order_id = ?", [o.id]);
  });
  return get({ id: o.id });
}

/** Collect a due amount for a completed credit order. */
function receivePayment({ id, amount, method }) {
  const o = ctx.db.get('SELECT * FROM orders WHERE id = ?', [Number(id)]);
  assert(o, 'Order not found.');
  assert(o.status === 'completed' && o.due > 0, 'This order has no due amount.');
  assert(methodKeys().includes(method), 'Select a payment method.');
  const amt = round2(Math.min(o.due, toNumber(amount)));
  assert(amt > 0, 'Enter an amount greater than zero.');
  const now = nowLocal();
  ctx.db.transaction(() => {
    const due = round2(o.due - amt);
    const paid = round2(o.paid + amt);
    ctx.db.run('UPDATE orders SET paid = ?, due = ?, payment_status = ?, updated_at = ? WHERE id = ?', [paid, due, due <= 0 ? 'paid' : 'partial', now, o.id]);
    ctx.db.run('INSERT INTO payments (order_id, method, amount, user_id, created_at) VALUES (?, ?, ?, ?, ?)', [o.id, method, amt, ctx.user?.id, now]);
  });
  return get({ id: o.id });
}

module.exports = { ORDER_TYPES, get, list, pending, save, addToken, cancel, refund, receivePayment };
