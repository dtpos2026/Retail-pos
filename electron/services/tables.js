'use strict';

const ctx = require('../core/context');
const { AppError, assert } = require('../core/errors');
const { nowLocal, cleanStr } = require('../core/util');

function list() {
  return ctx.db
    .all(
      `SELECT t.*, o.order_no, o.total AS order_total, o.created_at AS order_created,
         (SELECT COUNT(*) FROM order_items i WHERE i.order_id = o.id) AS item_count
       FROM dining_tables t
       LEFT JOIN orders o ON o.id = t.current_order_id AND o.status = 'pending'
       WHERE t.active = 1 ORDER BY t.sort_order, t.id`
    )
    .map((t) => ({ ...t, active: !!t.active }));
}

function save(input) {
  const id = input.id ? Number(input.id) : null;
  const name = cleanStr(input.name, 40);
  assert(name, 'Table name is required.');
  const capacity = Math.max(1, Math.min(50, Number(input.capacity) || 4));
  const dupe = ctx.db.get('SELECT id FROM dining_tables WHERE name = ? COLLATE NOCASE AND active = 1 AND id <> ?', [name, id || 0]);
  if (dupe) throw new AppError('A table with this name already exists.');
  if (id) {
    ctx.db.run('UPDATE dining_tables SET name = ?, capacity = ? WHERE id = ?', [name, capacity, id]);
    return id;
  }
  const max = ctx.db.get('SELECT COALESCE(MAX(sort_order), 0) m FROM dining_tables').m;
  return ctx.db.run('INSERT INTO dining_tables (name, capacity, sort_order, created_at) VALUES (?, ?, ?, ?)', [name, capacity, max + 1, nowLocal()])
    .lastInsertRowid;
}

/** Quickly add N tables named "Table X". */
function bulkAdd({ count }) {
  const n = Math.max(1, Math.min(100, Number(count) || 1));
  ctx.db.transaction(() => {
    let max = ctx.db.get('SELECT COALESCE(MAX(sort_order), 0) m FROM dining_tables').m;
    let num = ctx.db.get('SELECT COUNT(*) c FROM dining_tables WHERE active = 1').c;
    for (let i = 0; i < n; i++) {
      num++;
      let name = `Table ${num}`;
      while (ctx.db.get('SELECT id FROM dining_tables WHERE name = ? AND active = 1', [name])) name = `Table ${++num}`;
      ctx.db.run('INSERT INTO dining_tables (name, capacity, sort_order, created_at) VALUES (?, 4, ?, ?)', [name, ++max, nowLocal()]);
    }
  });
  return true;
}

function setStatus({ id, status }) {
  assert(['available', 'reserved'].includes(status), 'Invalid table status.');
  const t = ctx.db.get('SELECT * FROM dining_tables WHERE id = ?', [Number(id)]);
  assert(t, 'Table not found.');
  if (t.status === 'occupied') throw new AppError('This table has an open order. Settle or cancel it first.');
  ctx.db.run('UPDATE dining_tables SET status = ? WHERE id = ?', [status, t.id]);
  return true;
}

function remove({ id }) {
  const t = ctx.db.get('SELECT * FROM dining_tables WHERE id = ?', [Number(id)]);
  assert(t, 'Table not found.');
  if (t.status === 'occupied') throw new AppError('This table has an open order. Settle or cancel it first.');
  // Soft delete keeps old orders pointing at a valid row.
  ctx.db.run('UPDATE dining_tables SET active = 0 WHERE id = ?', [t.id]);
  return true;
}

module.exports = { list, save, bulkAdd, setStatus, remove };
