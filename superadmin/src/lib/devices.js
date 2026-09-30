import { tsToDate } from './format';

export const ONLINE_MS = 15 * 60 * 1000;

export function isOnline(d) {
  const t = tsToDate(d.lastSeen);
  return !!t && Date.now() - t.getTime() < ONLINE_MS;
}

export function ago(v) {
  const t = tsToDate(v);
  if (!t) return 'never';
  const m = Math.max(0, Math.round((Date.now() - t.getTime()) / 60000));
  if (m < 1) return 'just now';
  if (m < 60) return `${m} min ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} h ago`;
  return `${Math.floor(h / 24)} d ago`;
}

export const DEVICE_STATUS = {
  active: { label: 'Active', color: 'green' },
  suspended: { label: 'Suspended', color: 'amber' },
  blocked: { label: 'Blocked', color: 'red' },
};
