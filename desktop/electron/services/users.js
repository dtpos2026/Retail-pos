'use strict';

const ctx = require('../core/context');
const { AppError, assert } = require('../core/errors');
const { nowLocal, cleanStr } = require('../core/util');
const { hashSecret } = require('./auth');
const { ROLES, PERMISSIONS, effectivePermissions } = require('../core/permissions');
const license = require('../license/license');

function list() {
  return ctx.db
    .all('SELECT id, name, username, role, permissions, active, last_login, created_at, pin_hash FROM users ORDER BY id')
    .map((u) => ({
      id: u.id,
      name: u.name,
      username: u.username,
      role: u.role,
      customPermissions: safeParse(u.permissions),
      permissions: effectivePermissions(u),
      active: !!u.active,
      hasPin: !!u.pin_hash,
      lastLogin: u.last_login,
      createdAt: u.created_at,
    }));
}

function safeParse(s) {
  try {
    const v = JSON.parse(s || '[]');
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

function meta() {
  return {
    roles: Object.entries(ROLES).map(([key, r]) => ({ key, label: r.label, permissions: r.permissions })),
    permissions: PERMISSIONS,
  };
}

function activeAdmins(excludeId) {
  return ctx.db.get("SELECT COUNT(*) c FROM users WHERE role = 'admin' AND active = 1 AND id <> ?", [excludeId || 0]).c;
}

function checkUserLimit(excludeId) {
  const max = license.maxUsers();
  if (!max) return;
  const count = ctx.db.get('SELECT COUNT(*) c FROM users WHERE active = 1 AND id <> ?', [excludeId || 0]).c;
  if (count >= max) throw new AppError(`Your license allows ${max} active user(s). Contact your provider to upgrade.`);
}

function save(input) {
  const id = input.id ? Number(input.id) : null;
  const name = cleanStr(input.name, 80);
  const username = cleanStr(input.username, 40).toLowerCase();
  const role = ROLES[input.role] ? input.role : 'cashier';
  const active = input.active !== false;
  const perms = Array.isArray(input.customPermissions)
    ? input.customPermissions.filter((k) => PERMISSIONS.some((p) => p.key === k))
    : [];

  assert(name, 'Name is required.');
  assert(/^[a-z0-9._-]{3,40}$/.test(username), 'Username must be 3+ characters (letters, numbers, . _ -).');
  if (input.pin) assert(/^\d{4}$/.test(String(input.pin)), 'PIN must be exactly 4 digits.');
  if (input.password) assert(String(input.password).length >= 4, 'Password must be at least 4 characters.');

  const dupe = ctx.db.get('SELECT id FROM users WHERE username = ? COLLATE NOCASE AND id <> ?', [username, id || 0]);
  if (dupe) throw new AppError('This username is already taken.');

  if (id) {
    const existing = ctx.db.get('SELECT * FROM users WHERE id = ?', [id]);
    assert(existing, 'User not found.');
    if (existing.role === 'admin' && (role !== 'admin' || !active) && activeAdmins(id) === 0) {
      throw new AppError('At least one active Admin is required.');
    }
    if (active && !existing.active) checkUserLimit(id);
    if (ctx.user && ctx.user.id === id && !active) throw new AppError('You cannot disable your own account.');
    ctx.db.run('UPDATE users SET name = ?, username = ?, role = ?, permissions = ?, active = ? WHERE id = ?', [
      name,
      username,
      role,
      JSON.stringify(role === 'admin' ? [] : perms),
      active,
      id,
    ]);
    if (input.password) ctx.db.run('UPDATE users SET password_hash = ? WHERE id = ?', [hashSecret(input.password), id]);
    if (input.pin) ctx.db.run('UPDATE users SET pin_hash = ? WHERE id = ?', [hashSecret(input.pin), id]);
    if (input.removePin) ctx.db.run('UPDATE users SET pin_hash = NULL WHERE id = ?', [id]);
    return id;
  }

  assert(input.password, 'Password is required for a new user.');
  if (active) checkUserLimit();
  const r = ctx.db.run(
    'INSERT INTO users (name, username, password_hash, pin_hash, role, permissions, active, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    [name, username, hashSecret(input.password), input.pin ? hashSecret(input.pin) : null, role, JSON.stringify(role === 'admin' ? [] : perms), active, nowLocal()]
  );
  return r.lastInsertRowid;
}

function remove({ id }) {
  id = Number(id);
  const u = ctx.db.get('SELECT * FROM users WHERE id = ?', [id]);
  assert(u, 'User not found.');
  if (ctx.user && ctx.user.id === id) throw new AppError('You cannot delete your own account.');
  if (u.role === 'admin' && activeAdmins(id) === 0) throw new AppError('At least one active Admin is required.');
  const used = ctx.db.get('SELECT COUNT(*) c FROM orders WHERE cashier_id = ?', [id]).c;
  if (used > 0) {
    // Keep history intact: deactivate instead of deleting.
    ctx.db.run('UPDATE users SET active = 0 WHERE id = ?', [id]);
    return { deactivated: true };
  }
  ctx.db.run('DELETE FROM users WHERE id = ?', [id]);
  return { deleted: true };
}

module.exports = { list, meta, save, remove };
