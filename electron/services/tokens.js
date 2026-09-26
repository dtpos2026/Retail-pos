'use strict';

const ctx = require('../core/context');
const settings = require('./settings');
const counters = require('./counters');
const { assert } = require('../core/errors');
const { nowLocal, localDate, isDateStr, pad } = require('../core/util');

const STATUSES = ['preparing', 'ready', 'served', 'cancelled'];

function list({ date, status } = {}) {
  const d = isDateStr(date) ? date : localDate();
  const params = { d };
  let where = 't.business_date = $d';
  if (status) {
    where += ' AND t.status = $s';
    params.s = status;
  }
  return ctx.db
    .all(
      `SELECT t.*, o.order_no, o.order_type, o.total, o.customer_name, o.status AS order_status
       FROM tokens t JOIN orders o ON o.id = t.order_id WHERE ${where} ORDER BY t.id DESC`,
      params
    )
    .map((t) => ({ ...t, items: JSON.parse(t.items) }));
}

function setStatus({ id, status }) {
  assert(STATUSES.includes(status), 'Invalid token status.');
  ctx.db.run('UPDATE tokens SET status = ?, updated_at = ? WHERE id = ?', [status, nowLocal(), Number(id)]);
  return true;
}

function info() {
  const cfg = settings.get('token');
  const c = counters.peek('token');
  const today = localDate();
  const last = cfg.reset === 'daily' && c.reset_date !== today ? 0 : c.value;
  return {
    lastNumber: last,
    nextToken: `${cfg.prefix || ''}${pad(last + 1, cfg.digits)}`,
    todayCount: ctx.db.get('SELECT COUNT(*) c FROM tokens WHERE business_date = ?', [today]).c,
  };
}

function resetCounter() {
  counters.reset('token', 0);
  return info();
}

module.exports = { list, setStatus, info, resetCounter };
