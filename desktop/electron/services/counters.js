'use strict';

const ctx = require('../core/context');
const settings = require('./settings');
const { localDate, pad } = require('../core/util');

/** Must be called inside a transaction so the number is never reused. */
function next(name, { dailyReset = false } = {}) {
  const today = localDate();
  const row = ctx.db.get('SELECT value, reset_date FROM counters WHERE name = ?', [name]);
  let value;
  if (!row) {
    value = 1;
    ctx.db.run('INSERT INTO counters (name, value, reset_date) VALUES (?, ?, ?)', [name, value, today]);
  } else {
    value = dailyReset && row.reset_date !== today ? 1 : row.value + 1;
    ctx.db.run('UPDATE counters SET value = ?, reset_date = ? WHERE name = ?', [value, today, name]);
  }
  return value;
}

function nextOrderNo() {
  const s = settings.get('sales');
  // Loop guards against a manually edited counter colliding with an existing number.
  for (;;) {
    const no = `${s.orderPrefix}${pad(next('order'), s.orderDigits)}`;
    if (!ctx.db.get('SELECT id FROM orders WHERE order_no = ?', [no])) return no;
  }
}

function nextToken() {
  const t = settings.get('token');
  const n = next('token', { dailyReset: t.reset === 'daily' });
  return `${t.prefix || ''}${pad(n, t.digits)}`;
}

function peek(name) {
  const row = ctx.db.get('SELECT value, reset_date FROM counters WHERE name = ?', [name]);
  return row || { value: 0, reset_date: null };
}

function reset(name, value = 0) {
  ctx.db.run(
    'INSERT INTO counters (name, value, reset_date) VALUES (?, ?, ?) ON CONFLICT(name) DO UPDATE SET value = excluded.value, reset_date = excluded.reset_date',
    [name, value, localDate()]
  );
}

module.exports = { next, nextOrderNo, nextToken, peek, reset };
