import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Building2, KeyRound, AlarmClock, Ban, Wallet, Plus, AlertTriangle } from 'lucide-react';
import { watch, getSigningConfig } from '../lib/data';
import { useAdmin } from '../context';
import { money, fmtDate, licenseState, tsToDate, daysLeft } from '../lib/format';
import { PageHead, Stat, Button, Loading, Empty, Badge } from '../components/ui';

export default function Dashboard() {
  const { toastError } = useAdmin();
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
    let active = 0, expiring = 0, expired = 0, revoked = 0, revenueMonth = 0, revenueTotal = 0, unpaid = 0;
    for (const l of licenses) {
      const st = licenseState(l).key;
      if (st === 'active' || st === 'expiring') active++;
      if (st === 'expiring') expiring++;
      if (st === 'expired') expired++;
      if (st === 'revoked' || st === 'suspended') revoked++;
      if (l.paid) {
        revenueTotal += l.price || 0;
        const d = tsToDate(l.updatedAt || l.createdAt);
        if (d && d >= monthStart) revenueMonth += l.price || 0;
      } else if (l.price) unpaid += l.price;
    }
    return { active, expiring, expired, revoked, revenueMonth, revenueTotal, unpaid };
  }, [licenses]);

  if (!clients || !licenses || signing === undefined) return <Loading />;

  const soon = licenses
    .filter((l) => l.status === 'active' && l.expiresAt && daysLeft(l.expiresAt) <= 30)
    .sort((a, b) => a.expiresAt.localeCompare(b.expiresAt))
    .slice(0, 8);
  const recent = [...licenses].sort((a, b) => (tsToDate(b.createdAt) || 0) - (tsToDate(a.createdAt) || 0)).slice(0, 8);

  return (
    <div className="col" style={{ gap: 18 }}>
      <PageHead title="Overview" sub="Clients and licenses across all Retail POS installations.">
        <Button icon={Building2} onClick={() => nav('/clients?new=1')}>Add client</Button>
        <Button variant="primary" icon={Plus} onClick={() => nav('/licenses?new=1')}>Generate license</Button>
      </PageHead>

      {!signing && (
        <div className="card card-pad row" style={{ background: 'var(--warning-50)', borderColor: 'transparent' }}>
          <AlertTriangle color="var(--warning)" />
          <div className="grow"><b>Set up your license signing key first.</b> Without it you cannot generate licenses.</div>
          <Button variant="primary" onClick={() => nav('/settings')}>Open Settings</Button>
        </div>
      )}

      <div className="grid grid-4">
        <Stat hero icon={Building2} label="Clients" value={clients.length} hint={`${clients.filter((c) => c.status !== 'inactive').length} active`} />
        <Stat icon={KeyRound} label="Active licenses" value={stats.active} hint={`${licenses.length} issued in total`} color="#16a34a" />
        <Stat icon={AlarmClock} label="Expiring (15 days)" value={stats.expiring} hint={`${stats.expired} already expired`} color="#d97706" />
        <Stat icon={Ban} label="Revoked / suspended" value={stats.revoked} color="#dc2626" />
      </div>
      <div className="grid grid-3">
        <Stat icon={Wallet} label="Revenue this month" value={money(stats.revenueMonth)} color="#4f46e5" />
        <Stat icon={Wallet} label="Revenue (all time)" value={money(stats.revenueTotal)} color="#0ea5e9" />
        <Stat icon={Wallet} label="Unpaid licenses" value={money(stats.unpaid)} color="#dc2626" />
      </div>

      <div className="grid grid-2">
        <div className="card">
          <div className="card-head"><h3>Expiring within 30 days</h3></div>
          {soon.length === 0 ? (
            <Empty icon={AlarmClock} title="Nothing expiring soon" />
          ) : (
            soon.map((l) => (
              <div key={l.id} className="list-item" style={{ cursor: 'pointer' }} onClick={() => nav(`/clients/${l.clientId}`)}>
                <div className="grow"><div className="b">{l.businessName}</div><div className="small faint">{l.clientPhone} · {l.plan}</div></div>
                <Badge color={licenseState(l).color}>{fmtDate(l.expiresAt)}</Badge>
              </div>
            ))
          )}
        </div>
        <div className="card">
          <div className="card-head"><h3>Recently issued</h3></div>
          {recent.length === 0 ? (
            <Empty icon={KeyRound} title="No licenses yet" text="Add a client, then generate their first license." />
          ) : (
            recent.map((l) => {
              const st = licenseState(l);
              return (
                <div key={l.id} className="list-item" style={{ cursor: 'pointer' }} onClick={() => nav(`/clients/${l.clientId}`)}>
                  <div className="grow"><div className="b">{l.businessName}</div><div className="small faint">{l.plan} · issued {fmtDate(l.createdAt)}</div></div>
                  <Badge color={st.color}>{st.label}</Badge>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
