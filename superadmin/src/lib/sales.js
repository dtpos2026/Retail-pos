// Sales TOTALS reported by each POS in its heartbeat (never single orders): today, this month, last 14 days.
import { money } from './format';

const pad = (n) => String(n).padStart(2, '0');
export const dayKey = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

/**
 * What a device sold: `today` only counts when the POS reported it today (otherwise unknown → null),
 * `month` when it was reported in the current month.
 */
export function salesOf(d, now = new Date()) {
  const key = dayKey(now);
  const date = typeof d.salesDate === 'string' ? d.salesDate : '';
  const num = (v) => (Number.isFinite(v) ? v : 0);
  return {
    reported: !!date,
    today: date === key ? num(d.salesToday) : null,
    month: date.slice(0, 7) === key.slice(0, 7) ? num(d.salesMonth) : null,
    asOf: date,
  };
}

/** Sum over several devices (a license with 2 computers, a client, or everything). */
export function sumSales(devices, now = new Date()) {
  let today = 0;
  let month = 0;
  let reporting = 0;
  for (const d of devices || []) {
    const s = salesOf(d, now);
    if (!s.reported) continue;
    reporting += 1;
    today += s.today || 0;
    month += s.month || 0;
  }
  return { today, month, reporting };
}

export const fmtSales = (v) => (v === null || v === undefined ? '—' : money(v));

/** "10-24:9000,10-25:12500" → [{ date: '10-24', total: 9000 }, …] newest last */
export function parseDays(str) {
  return String(str || '')
    .split(',')
    .map((x) => x.split(':'))
    .filter((p) => p.length === 2 && Number.isFinite(Number(p[1])))
    .map(([date, total]) => ({ date, total: Number(total) }));
}

/** "admin|Administrator|admin;ali|Ali|cashier" → [{ username, name, role }] */
export function parseUsers(str) {
  return String(str || '')
    .split(';')
    .map((x) => x.split('|'))
    .filter((p) => p[0])
    .map(([username, name, role]) => ({ username, name: name || username, role: role || '' }));
}
