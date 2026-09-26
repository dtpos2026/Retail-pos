'use strict';

const ctx = require('../core/context');
const { AppError, assert } = require('../core/errors');
const { nowLocal, cleanStr } = require('../core/util');

function normalizeMobile(m) {
  return cleanStr(m, 20).replace(/[^\d+]/g, '');
}

function list({ search } = {}) {
  const q = String(search || '').trim();
  return ctx.db.all(
    `SELECT c.*,
       (SELECT COUNT(*) FROM orders o WHERE o.customer_id = c.id AND o.status = 'completed') AS order_count,
       (SELECT COALESCE(SUM(total), 0) FROM orders o WHERE o.customer_id = c.id AND o.status = 'completed') AS total_spent,
       (SELECT COALESCE(SUM(due), 0) FROM orders o WHERE o.customer_id = c.id AND o.status = 'completed') AS total_due,
       (SELECT MAX(created_at) FROM orders o WHERE o.customer_id = c.id) AS last_order
     FROM customers c
     ${q ? 'WHERE c.name LIKE $q OR c.mobile LIKE $q' : ''}
     ORDER BY c.name LIMIT 500`,
    q ? { q: `%${q}%` } : {}
  );
}

function get({ id }) {
  const c = ctx.db.get('SELECT * FROM customers WHERE id = ?', [Number(id)]);
  assert(c, 'Customer not found.');
  const orders = ctx.db.all(
    `SELECT id, order_no, order_type, status, payment_status, total, paid, due, created_at
     FROM orders WHERE customer_id = ? ORDER BY id DESC LIMIT 100`,
    [c.id]
  );
  const stats = ctx.db.get(
    `SELECT COUNT(*) orders, COALESCE(SUM(total),0) spent, COALESCE(SUM(due),0) due
     FROM orders WHERE customer_id = ? AND status = 'completed'`,
    [c.id]
  );
  return { ...c, orders, stats };
}

function save(input) {
  const id = input.id ? Number(input.id) : null;
  const name = cleanStr(input.name, 100);
  const mobile = normalizeMobile(input.mobile);
  assert(name, 'Customer name is required.');
  if (mobile) {
    const dupe = ctx.db.get('SELECT id, name FROM customers WHERE mobile = ? AND id <> ?', [mobile, id || 0]);
    if (dupe) throw new AppError(`Mobile number already saved for "${dupe.name}".`);
  }
  const vals = [name, mobile || null, cleanStr(input.address, 300) || null, cleanStr(input.notes, 500) || null];
  if (id) {
    ctx.db.run('UPDATE customers SET name = ?, mobile = ?, address = ?, notes = ? WHERE id = ?', [...vals, id]);
    return id;
  }
  return ctx.db.run('INSERT INTO customers (name, mobile, address, notes, created_at) VALUES (?, ?, ?, ?, ?)', [...vals, nowLocal()]).lastInsertRowid;
}

/**
 * Used by POS checkout: reuse an existing customer (by id or mobile) or
 * create one so delivery details are remembered next time.
 */
function upsertFromOrder({ id, name, mobile, address }) {
  name = cleanStr(name, 100);
  mobile = normalizeMobile(mobile);
  address = cleanStr(address, 300);
  if (id) {
    const c = ctx.db.get('SELECT * FROM customers WHERE id = ?', [Number(id)]);
    if (c) {
      if (address && address !== c.address) ctx.db.run('UPDATE customers SET address = ? WHERE id = ?', [address, c.id]);
      return c.id;
    }
  }
  if (mobile) {
    const c = ctx.db.get('SELECT * FROM customers WHERE mobile = ?', [mobile]);
    if (c) {
      if (address && address !== c.address) ctx.db.run('UPDATE customers SET address = ? WHERE id = ?', [address, c.id]);
      return c.id;
    }
  }
  if (!name || (!mobile && !address)) return null;
  return ctx.db.run('INSERT INTO customers (name, mobile, address, created_at) VALUES (?, ?, ?, ?)', [name, mobile || null, address || null, nowLocal()])
    .lastInsertRowid;
}

function remove({ id }) {
  ctx.db.run('DELETE FROM customers WHERE id = ?', [Number(id)]);
  return true;
}

module.exports = { list, get, save, remove, upsertFromOrder, normalizeMobile };
