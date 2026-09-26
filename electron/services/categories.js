'use strict';

const ctx = require('../core/context');
const { AppError, assert } = require('../core/errors');
const { nowLocal, cleanStr } = require('../core/util');

function list({ activeOnly } = {}) {
  return ctx.db
    .all(
      `SELECT c.*, (SELECT COUNT(*) FROM products p WHERE p.category_id = c.id) AS product_count
       FROM categories c ${activeOnly ? 'WHERE c.active = 1' : ''}
       ORDER BY c.sort_order, c.name`
    )
    .map((c) => ({ ...c, active: !!c.active }));
}

function save(input) {
  const id = input.id ? Number(input.id) : null;
  const name = cleanStr(input.name, 60);
  assert(name, 'Category name is required.');
  const color = /^#[0-9a-fA-F]{6}$/.test(input.color || '') ? input.color : '#4f46e5';
  const icon = cleanStr(input.icon || 'tag', 40);
  const active = input.active !== false;
  const dupe = ctx.db.get('SELECT id FROM categories WHERE name = ? COLLATE NOCASE AND id <> ?', [name, id || 0]);
  if (dupe) throw new AppError('A category with this name already exists.');
  if (id) {
    ctx.db.run('UPDATE categories SET name = ?, color = ?, icon = ?, active = ? WHERE id = ?', [name, color, icon, active, id]);
    return id;
  }
  const max = ctx.db.get('SELECT COALESCE(MAX(sort_order), 0) m FROM categories').m;
  return ctx.db.run('INSERT INTO categories (name, color, icon, sort_order, active, created_at) VALUES (?, ?, ?, ?, ?, ?)', [
    name,
    color,
    icon,
    max + 1,
    active,
    nowLocal(),
  ]).lastInsertRowid;
}

function remove({ id }) {
  const c = ctx.db.get('SELECT COUNT(*) c FROM products WHERE category_id = ?', [Number(id)]).c;
  if (c > 0) throw new AppError(`This category has ${c} product(s). Move or delete them first, or deactivate the category.`);
  ctx.db.run('DELETE FROM categories WHERE id = ?', [Number(id)]);
  return true;
}

/** Persist a new order: ids in the desired order. */
function reorder({ ids }) {
  assert(Array.isArray(ids), 'Invalid order.');
  ctx.db.transaction(() => {
    ids.forEach((id, i) => ctx.db.run('UPDATE categories SET sort_order = ? WHERE id = ?', [i + 1, Number(id)]));
  });
  return true;
}

module.exports = { list, save, remove, reorder };
