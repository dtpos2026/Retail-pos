// Formatting helpers shared by the UI and the receipt/report printers.
// Pakistani conventions: "Rs." currency, dd/mm/yyyy dates, 12-hour time.

const numFmt = new Intl.NumberFormat('en-PK', { maximumFractionDigits: 2, minimumFractionDigits: 0 });
const numFmt2 = new Intl.NumberFormat('en-PK', { maximumFractionDigits: 2, minimumFractionDigits: 2 });

export function formatNumber(n) {
  return numFmt.format(Number(n) || 0);
}

/** "Rs. 1,250" — decimals shown only when present. */
export function formatMoney(n, currency = 'Rs.') {
  const v = Number(n) || 0;
  const s = Number.isInteger(Math.round(v * 100) / 100) ? numFmt.format(v) : numFmt2.format(v);
  return `${currency} ${s}`;
}

function parse(ts) {
  if (!ts) return null;
  if (ts instanceof Date) return ts;
  // "YYYY-MM-DD HH:MM:SS" local, or ISO
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?$/.exec(ts);
  if (m) return new Date(+m[1], +m[2] - 1, +m[3], +(m[4] || 0), +(m[5] || 0), +(m[6] || 0));
  const d = new Date(ts);
  return Number.isNaN(d.getTime()) ? null : d;
}

const p2 = (n) => String(n).padStart(2, '0');

export function formatDate(ts) {
  const d = parse(ts);
  if (!d) return '';
  return `${p2(d.getDate())}/${p2(d.getMonth() + 1)}/${d.getFullYear()}`;
}

export function formatTime(ts) {
  const d = parse(ts);
  if (!d) return '';
  let h = d.getHours();
  const ampm = h >= 12 ? 'PM' : 'AM';
  h = h % 12 || 12;
  return `${p2(h)}:${p2(d.getMinutes())} ${ampm}`;
}

export function formatDateTime(ts) {
  const d = parse(ts);
  return d ? `${formatDate(d)} ${formatTime(d)}` : '';
}

export const ORDER_TYPE_LABELS = { dine_in: 'Dine-In', takeaway: 'Takeaway', delivery: 'Delivery' };

export function orderTypeLabel(t) {
  return ORDER_TYPE_LABELS[t] || t || '';
}

export function formatQty(q) {
  return numFmt.format(Number(q) || 0);
}
