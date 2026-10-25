import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Banknote, CalendarDays, Store } from 'lucide-react';
import { useAdmin } from '../context';
import { Badge, Empty } from './ui';
import { Stat } from './ui';
import { sumSales, fmtSales } from '../lib/sales';
import { isOnline } from '../lib/devices';
import { initials } from '../lib/format';

/** Restaurant logo (thumbnail sent by its POS) or the initials of its name. */
export function Logo({ src, name, size = 34, ring }) {
  return src ? (
    <img src={src} alt="" style={{ width: size, height: size, borderRadius: Math.round(size / 4), objectFit: 'contain', background: '#fff', border: `2px solid ${ring || 'var(--border)'}`, flexShrink: 0 }} />
  ) : (
    <div className="thumb" style={{ width: size, height: size, fontSize: Math.round(size * 0.38), background: 'var(--primary-50)', color: 'var(--primary)', borderRadius: Math.round(size / 4), flexShrink: 0 }}>{initials(name)}</div>
  );
}

/** One row per license (= one restaurant): its computers' sales added up. */
export function restaurantsOf(devices) {
  const m = new Map();
  for (const d of devices || []) {
    const r = m.get(d.licenseId) || { id: d.licenseId, name: d.businessName, logo: '', devices: [] };
    r.devices.push(d);
    if (!r.logo && d.logoThumb) r.logo = d.logoThumb;
    m.set(d.licenseId, r);
  }
  return [...m.values()].map((r) => ({ ...r, online: r.devices.some(isOnline), ...sumSales(r.devices) }));
}

/** Dashboard card: today's and this month's sales of every restaurant (totals only, never single orders). */
export default function SalesBoard() {
  const { devices } = useAdmin();
  const nav = useNavigate();
  const rows = useMemo(() => restaurantsOf(devices).sort((a, b) => b.today - a.today || b.month - a.month), [devices]);
  const all = useMemo(() => sumSales(devices), [devices]);
  const reporting = rows.filter((r) => r.reporting > 0).length;
  return (
    <div className="card">
      <div className="card-head"><Banknote size={17} /><h3>Restaurants' sales</h3><div className="actions"><Badge color="indigo">{reporting} of {rows.length} reporting</Badge></div></div>
      <div className="card-pad grid grid-3" style={{ paddingBottom: 6 }}>
        <Stat hero icon={Banknote} label="Sales today (all)" value={fmtSales(all.today)} hint="completed bills of today" />
        <Stat icon={CalendarDays} label="Sales this month (all)" value={fmtSales(all.month)} color="#0ea5e9" />
        <Stat icon={Store} label="Restaurants selling today" value={rows.filter((r) => r.today > 0).length} hint={`of ${rows.length} registered`} color="#16a34a" />
      </div>
      {rows.length === 0 ? (
        <Empty icon={Store} title="No restaurants yet" text="Sales appear here as soon as a client's POS is online." />
      ) : (
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th>Restaurant</th><th className="num">Today</th><th className="num">This month</th></tr></thead>
            <tbody>
              {rows.slice(0, 12).map((r) => (
                <tr key={r.id} className="clickable" onClick={() => nav('/devices')}>
                  <td>
                    <div className="row" style={{ gap: 10 }}>
                      <Logo src={r.logo} name={r.name} />
                      <span className={`dot ${r.online ? 'on' : ''}`} title={r.online ? 'Online now' : 'Offline'} />
                      <b className="ellipsis"><bdi>{r.name}</bdi></b>
                    </div>
                  </td>
                  <td className="num"><b>{r.reporting ? fmtSales(r.today) : '—'}</b></td>
                  <td className="num">{r.reporting ? fmtSales(r.month) : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
