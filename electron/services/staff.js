'use strict';

// Waiters (serve dine-in tables) and riders (deliver orders).
const ctx = require('../core/context');
const { AppError, assert } = require('../core/errors');
const { nowLocal, cleanStr } = require('../core/util');

const ROLES = ['waiter', 'rider'];

function list({ role, all } = {}) {
  const where = [];
  const p = [];
  if (role) {
    where.push('role = ?');
    p.push(role);
  }
  if (!all) where.push('active = 1');
  return ctx.db.all(`SELECT * FROM staff ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY role, name COLLATE NOCASE`, p).map((s) => ({ ...s, active: !!s.active }));
}

function save(input) {
  const id = input.id ? Number(input.id) : null;
  const name = cleanStr(input.name, 60);
  assert(name, 'Name is required.');
  assert(ROLES.includes(input.role), 'Choose Waiter or Rider.');
  const dupe = ctx.db.get('SELECT id FROM staff WHERE name = ? COLLATE NOCASE AND role = ? AND active = 1 AND id <> ?', [name, input.role, id || 0]);
  if (dupe) throw new AppError(`A ${input.role} named "${name}" already exists.`);
  const row = [name, cleanStr(input.phone, 30) || null, input.role, input.active === false ? 0 : 1];
  if (id) {
    ctx.db.run('UPDATE staff SET name = ?, phone = ?, role = ?, active = ? WHERE id = ?', [...row, id]);
    return id;
  }
  return ctx.db.run('INSERT INTO staff (name, phone, role, active, created_at) VALUES (?, ?, ?, ?, ?)', [...row, nowLocal()]).lastInsertRowid;
}

/** Old orders keep the name they were saved with, so removing only deactivates. */
function remove({ id }) {
  ctx.db.run('UPDATE staff SET active = 0 WHERE id = ?', [Number(id)]);
  return true;
}

/** Name lookup for an order; null when not chosen. */
function pick(id, role) {
  if (!id) return null;
  const s = ctx.db.get('SELECT id, name FROM staff WHERE id = ? AND role = ?', [Number(id), role]);
  if (!s) throw new AppError(`The selected ${role} no longer exists.`);
  return s;
}

module.exports = { list, save, remove, pick };
