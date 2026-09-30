const nf = new Intl.NumberFormat('en-PK', { maximumFractionDigits: 0 });

export const money = (v) => `Rs. ${nf.format(Number(v) || 0)}`;

export function tsToDate(ts) {
  if (!ts) return null;
  if (ts.toDate) return ts.toDate();
  if (ts.seconds) return new Date(ts.seconds * 1000);
  return new Date(ts);
}

export function fmtDate(v) {
  const d = typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) ? new Date(v + 'T00:00:00') : tsToDate(v);
  if (!d || Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

export function fmtDateTime(v) {
  const d = tsToDate(v);
  if (!d) return '—';
  return d.toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export function daysLeft(ymd) {
  if (!ymd) return null;
  const [y, m, d] = ymd.split('-').map(Number);
  return Math.ceil((new Date(y, m - 1, d, 23, 59, 59) - Date.now()) / 86400000);
}

/** Effective state shown in the panel: revoked/suspended override, then expiry. */
export function licenseState(l) {
  if (l.status === 'revoked') return { key: 'revoked', label: 'Revoked', color: 'red' };
  if (l.status === 'suspended') return { key: 'suspended', label: 'Suspended', color: 'amber' };
  if (l.status === 'pending') return { key: 'pending', label: 'Pending payment', color: 'amber' };
  const left = daysLeft(l.expiresAt);
  if (left !== null && left <= 0) return { key: 'expired', label: 'Expired', color: 'red' };
  if (left !== null && left <= 15) return { key: 'expiring', label: `Expires in ${left}d`, color: 'amber' };
  return { key: 'active', label: 'Active', color: 'green' };
}

export function initials(name) {
  const p = String(name || '?').trim().split(/\s+/);
  return ((p[0]?.[0] || '') + (p[1]?.[0] || '')).toUpperCase() || '?';
}
