import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Building2, KeyRound, AlarmClock, Ban, Wallet, Plus, AlertTriangle, Monitor, Wifi, TrendingUp, Layers } from 'lucide-react';
import { watch, getSigningConfig } from '../lib/data';
import { useAdmin } from '../context';
import { money, fmtDate, licenseState, tsToDate, daysLeft, initials } from '../lib/format';
import { isOnline, ago } from '../lib/devices';
import { Stat, Button, Loading, Empty, Badge } from '../components/ui';
import BarChart from '../components/BarChart';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function lastMonths(n) {
  const out = [];
  const now = new Date();
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    out.push({ key: `${d.getFullYear()}-${d.getMonth()}`, label: MONTHS[d.getMonth()], year: d.getFullYear() });
  }
  return out;
}

export default function Dashboard() {
  const { toastError, devices, user } = useAdmin();
  const [clients, setClients] = useState(null);
  const [licenses, setLicenses] = useState(null);
  const [signing, setSigning] = useState(undefined);
  const nav = useNavigate();

  useEffect(() => {
    const a = watch('clients', setClients, toastError);
    const b = watch('licenses', setLicenses, toastError);
    getSigningConfig().then(setSigning).catch(() => setSigning(null));
    return () => {
      a();
      b();
    };
  }, [toastError]);

  const stats = useMemo(() => {
    if (!licenses) return null;
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const months = lastMonths(6);
    const revenue = Object.fromEntries(months.map((m) => [m.key, 0]));
    const issued = Object.fromEntries(months.map((m) => [m.key, 0]));
    const plans = {};
    let active = 0, expiring = 0, expired = 0, revoked = 0, revenueMonth = 0, revenueTotal = 0, unpaid = 0;
    for (const l of licenses) {
      const st = licenseState(l).key;
      if (st === 'active' || st === 'expiring') active++;
      if (st === 'expiring') expiring++;
      if (st === 'expired') expired++;
      if (st === 'revoked' || st === 'suspended') revoked++;
      const d = tsToDate(l.createdAt);
      if (d) {
        const k = `${d.getFullYear()}-${d.getMonth()}`;
        if (k in issued) issued[k]++;
        if (l.paid && k in revenue) revenue[k] += l.price || 0;
        if (l.paid && d >= monthStart) revenueMonth += l.price || 0;
      }
      if (l.paid) revenueTotal += l.price || 0;
      else if (l.price) unpaid += l.price;
      plans[l.plan] = (plans[l.plan] || 0) + 1;
    }
    return { active, expiring, expired, revoked, revenueMonth, revenueTotal, unpaid, months, revenue, issued, plans };
  }, [licenses]);

  if (!clients || !licenses || !devices || signing === undefined) return <Loading />;

  const online = devices.filter(isOnline);
  const blocked = devices.filter((d) => d.status !== 'active').length;
  const soon = licenses.filter((l) => l.status === 'active' && l.expiresAt && daysLeft(l.expiresAt) <= 30).sort((a, b) => a.expiresAt.localeCompare(b.expiresAt)).slice(0, 6);
  const recentDevices = [...devices].sort((a, b) => (tsToDate(b.lastSeen) || 0) - (tsToDate(a.lastSeen) || 0)).slice(0, 6);
  const planTotal = Object.values(stats.plans).reduce((s, v) => s + v, 0) || 1;

  return (
    <div className="col" style={{ gap: 18 }}>
      <div className="promo-hero">
        <div>
          <h2>Welcome, {(user.displayName || user.email.split('@')[0]).replace(/[._]/g, ' ')}</h2>
          <p>{clients.length} clients · {licenses.length} licenses · {online.length} device(s) online right now</p>
        </div>
        <div className="row" style={{ marginLeft: 'auto', gap: 8, flexShrink: 0 }}>
          <Button icon={Building2} onClick={() => nav('/clients?new=1')} style={{ background: 'rgba(255,255,255,.16)', color: '#fff', borderColor: 'rgba(255,255,255,.3)' }}>Add client</Button>
          <Button icon={Plus} onClick={() => nav('/licenses?new=1')} style={{ background: '#fff', color: 'var(--primary-600)', borderColor: '#fff' }}>Generate license</Button>
        </div>
      </div>

      {!signing && (
        <div className="card card-pad row" style={{ background: 'var(--warning-50)', borderColor: 'transparent' }}>
          <AlertTriangle color="var(--warning)" />
          <div className="grow"><b>Set up your license signing key first.</b> Without it you cannot generate licenses.</div>
          <Button variant="primary" onClick={() => nav('/settings')}>Open Settings</Button>
        </div>
      )}

      <div className="grid grid-4">
        <Stat hero icon={Building2} label="Clients" value={clients.length} hint={`${clients.filter((c) => c.status !== 'inactive').length} active`} />
        <Stat icon={KeyRound} label="Active licenses" value={stats.active} hint={`${licenses.length} issued · ${stats.expired} expired`} color="#16a34a" />
        <Stat icon={Monitor} label="Devices" value={devices.length} hint={<span><b style={{ color: '#16a34a' }}>{online.length} online</b> · {blocked} blocked/suspended</span>} color="#0ea5e9" />
        <Stat icon={AlarmClock} label="Expiring in 15 days" value={stats.expiring} hint={`${stats.revoked} revoked / suspended`} color="#d97706" />
      </div>

      <div className="grid" style={{ gridTemplateColumns: '2fr 1fr' }}>
        <div className="card">
          <div className="card-head"><TrendingUp size={17} /><h3>Revenue — last 6 months</h3>
            <div className="actions"><Badge color="indigo">This month {money(stats.revenueMonth)}</Badge></div></div>
          <div className="card-pad">
            <BarChart data={stats.months.map((m) => ({ label: m.label, value: stats.revenue[m.key], tip: `${m.label} ${m.year}` }))} format={money} empty="No paid licenses yet" />
          </div>
        </div>
        <div className="card">
          <div className="card-head"><Layers size={17} /><h3>Plans & money</h3></div>
          <div className="card-pad col" style={{ gap: 14 }}>
            {Object.entries(stats.plans).length === 0 ? <div className="muted small">No licenses yet.</div> : Object.entries(stats.plans).sort((a, b) => b[1] - a[1]).map(([plan, n]) => (
              <div key={plan}>
                <div className="row small" style={{ marginBottom: 5 }}><b style={{ textTransform: 'capitalize' }}>{plan.replace('_', ' ')}</b><span className="grow" /><span>{n}</span></div>
                <div className="progress"><div style={{ width: `${(n / planTotal) * 100}%` }} /></div>
              </div>
            ))}
            <div className="hr" style={{ margin: 0 }} />
            <div className="row"><span className="muted">All-time revenue</span><span className="grow" /><b>{money(stats.revenueTotal)}</b></div>
            <div className="row"><span className="muted">Unpaid</span><span className="grow" /><b style={{ color: stats.unpaid ? 'var(--danger)' : undefined }}>{money(stats.unpaid)}</b></div>
          </div>
        </div>
      </div>

      <div className="grid grid-3">
        <div className="card">
          <div className="card-head"><Wifi size={17} /><h3>Devices — latest activity</h3><div className="actions"><Button size="sm" variant="ghost" onClick={() => nav('/devices')}>All</Button></div></div>
          {recentDevices.length === 0 ? <Empty icon={Monitor} title="No devices yet" text="They appear when a client activates." /> : recentDevices.map((d) => (
            <div key={d.id} className="list-item">
              <span className={`dot ${isOnline(d) ? 'on' : ''}`} />
              <div className="grow" style={{ minWidth: 0 }}><div className="b ellipsis"><bdi>{d.businessName}</bdi></div><div className="small faint ellipsis">{d.name} · {isOnline(d) ? 'online' : ago(d.lastSeen)}</div></div>
              {d.status !== 'active' && <Badge color={d.status === 'blocked' ? 'red' : 'amber'}>{d.status}</Badge>}
            </div>
          ))}
        </div>
        <div className="card">
          <div className="card-head"><AlarmClock size={17} /><h3>Expiring within 30 days</h3></div>
          {soon.length === 0 ? <Empty icon={AlarmClock} title="Nothing expiring soon" /> : soon.map((l) => (
            <div key={l.id} className="list-item" style={{ cursor: 'pointer' }} onClick={() => nav(`/clients/${l.clientId}`)}>
              <div className="grow"><div className="b"><bdi>{l.businessName}</bdi></div><div className="small faint">{l.clientPhone} · {l.plan}</div></div>
              <Badge color={licenseState(l).color}>{fmtDate(l.expiresAt)}</Badge>
            </div>
          ))}
        </div>
        <div className="card">
          <div className="card-head"><Wallet size={17} /><h3>Recently issued</h3></div>
          {licenses.length === 0 ? <Empty icon={KeyRound} title="No licenses yet" text="Add a client, then generate a license." /> : [...licenses].sort((a, b) => (tsToDate(b.createdAt) || 0) - (tsToDate(a.createdAt) || 0)).slice(0, 6).map((l) => {
            const st = licenseState(l);
            return (
              <div key={l.id} className="list-item" style={{ cursor: 'pointer' }} onClick={() => nav(`/clients/${l.clientId}`)}>
                <div className="thumb" style={{ width: 34, height: 34, fontSize: 13, background: 'var(--primary-50)', color: 'var(--primary)' }}>{initials(l.businessName)}</div>
                <div className="grow"><div className="b"><bdi>{l.businessName}</bdi></div><div className="small faint">{l.plan} · {fmtDate(l.createdAt)}</div></div>
                <Badge color={st.color}>{st.label}</Badge>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
