'use strict';

const crypto = require('crypto');
const ctx = require('../core/context');
const { AppError, assert } = require('../core/errors');
const { nowLocal } = require('../core/util');
const { effectivePermissions } = require('../core/permissions');

function hashSecret(secret) {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(String(secret), salt, 32);
  return `scrypt$${salt.toString('hex')}$${hash.toString('hex')}`;
}

function verifySecret(secret, stored) {
  if (!stored || typeof stored !== 'string') return false;
  const [algo, saltHex, hashHex] = stored.split('$');
  if (algo !== 'scrypt' || !saltHex || !hashHex) return false;
  const expected = Buffer.from(hashHex, 'hex');
  const actual = crypto.scryptSync(String(secret), Buffer.from(saltHex, 'hex'), expected.length);
  return crypto.timingSafeEqual(expected, actual);
}

function publicUser(u) {
  if (!u) return null;
  return {
    id: u.id,
    name: u.name,
    username: u.username,
    role: u.role,
    hasPin: !!u.pin_hash,
    permissions: effectivePermissions(u),
  };
}

// Simple brute-force protection: lock username for 30s after 5 failures.
const failures = new Map();
function checkLock(key) {
  const f = failures.get(key);
  if (f && f.count >= 5 && Date.now() - f.at < 30000) {
    throw new AppError('Too many wrong attempts. Please wait 30 seconds.');
  }
}
function recordFailure(key) {
  const f = failures.get(key) || { count: 0, at: 0 };
  f.count = Date.now() - f.at > 30000 ? 1 : f.count + 1;
  f.at = Date.now();
  failures.set(key, f);
}

function startSession(u) {
  ctx.db.run('UPDATE users SET last_login = ? WHERE id = ?', [nowLocal(), u.id]);
  ctx.user = u;
  return publicUser(u);
}

function login({ username, password }) {
  const key = String(username || '').toLowerCase();
  assert(key && password, 'Enter username and password.');
  checkLock(key);
  const u = ctx.db.get('SELECT * FROM users WHERE username = ? COLLATE NOCASE', [key]);
  if (!u || !verifySecret(password, u.password_hash)) {
    recordFailure(key);
    throw new AppError('Wrong username or password.');
  }
  if (!u.active) throw new AppError('This user account is disabled. Contact your admin.');
  failures.delete(key);
  return startSession(u);
}

function loginPin({ userId, pin }) {
  const key = `pin:${userId}`;
  assert(userId && pin, 'Enter your PIN.');
  checkLock(key);
  const u = ctx.db.get('SELECT * FROM users WHERE id = ?', [Number(userId)]);
  if (!u || !u.pin_hash || !verifySecret(pin, u.pin_hash)) {
    recordFailure(key);
    throw new AppError('Wrong PIN.');
  }
  if (!u.active) throw new AppError('This user account is disabled. Contact your admin.');
  failures.delete(key);
  return startSession(u);
}

function logout() {
  ctx.user = null;
  return true;
}

function current() {
  if (!ctx.user) return null;
  // Reload so permission / active changes apply immediately.
  const u = ctx.db.get('SELECT * FROM users WHERE id = ?', [ctx.user.id]);
  if (!u || !u.active) {
    ctx.user = null;
    return null;
  }
  ctx.user = u;
  return publicUser(u);
}

/** Users shown as quick-login tiles (only those with a PIN). */
function loginUsers() {
  return ctx.db
    .all("SELECT id, name, role FROM users WHERE active = 1 AND pin_hash IS NOT NULL AND pin_hash <> '' ORDER BY role = 'admin' DESC, name")
    .map((u) => ({ id: u.id, name: u.name, role: u.role }));
}

function changeOwnPassword({ currentPassword, newPassword }) {
  assert(ctx.user, 'Please log in again.');
  const u = ctx.db.get('SELECT * FROM users WHERE id = ?', [ctx.user.id]);
  if (!verifySecret(currentPassword, u.password_hash)) throw new AppError('Current password is incorrect.');
  assert(String(newPassword || '').length >= 4, 'New password must be at least 4 characters.');
  ctx.db.run('UPDATE users SET password_hash = ? WHERE id = ?', [hashSecret(newPassword), u.id]);
  return true;
}

module.exports = { hashSecret, verifySecret, publicUser, login, loginPin, logout, current, loginUsers, changeOwnPassword };
