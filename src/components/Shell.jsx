import { useEffect, useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import {
  LayoutDashboard, ShoppingCart, ReceiptText, Armchair, Package, Tags, Users2, Ticket, Boxes, BarChart3, UserCog, Settings as SettingsIcon,
  LogOut, PanelLeftClose, PanelLeftOpen, ShieldAlert, KeyRound, PauseCircle,
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import { api } from '../lib/api';
import { initials } from '../lib/format';
import { Button } from './ui';
import { DevFooter, DtMark } from './Brand';

export const NAV = [
  { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard, perm: 'dashboard' },
  { to: '/pos', label: 'POS / New Sale', icon: ShoppingCart, perm: 'pos' },
  { to: '/held', label: 'Hold / Running', icon: PauseCircle, perm: 'pos', badge: 'pending' },
  { to: '/orders', label: 'Orders', icon: ReceiptText, perm: 'orders' },
  { to: '/tables', label: 'Tables', icon: Armchair, perm: 'tables', needs: 'dineIn' },
  { to: '/products', label: 'Products', icon: Package, perm: 'products' },
  { to: '/categories', label: 'Categories', icon: Tags, perm: 'categories' },
  { to: '/customers', label: 'Customers', icon: Users2, perm: 'customers' },
  { to: '/tokens', label: 'Tokens', icon: Ticket, perm: 'tokens' },
  { to: '/inventory', label: 'Inventory', icon: Boxes, perm: 'inventory' },
  { to: '/reports', label: 'Reports', icon: BarChart3, perm: 'reports' },
  { to: '/users', label: 'Users', icon: UserCog, perm: 'users' },
  { to: '/settings', label: 'Settings', icon: SettingsIcon, perm: 'settings' },
];

/** Live indicator of the receipt and kitchen printers (auto-detected, refreshed every 20 s). Click = verify now. */
function PrinterPill() {
  const { toast } = useApp();
  const [st, setSt] = useState(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    let alive = true;
    const load = () => api('print.status').then((s) => alive && setSt(s)).catch(() => {});
    load();
    const t = setInterval(load, 20000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, []);
  const verify = async () => {
    setBusy(true);
    try {
      const r = await api('print.verify');
      setSt({ ...r.receipt, kitchen: r.kitchen, kitchenSame: r.receipt.kitchenSame });
      toast(`${r.receipt.ready ? '✓' : '✗'} ${r.receipt.message}`, r.receipt.ready ? 'success' : 'error');
      if (!r.receipt.kitchenSame) toast(`${r.kitchen.ready ? '✓' : '✗'} Kitchen: ${r.kitchen.message}`, r.kitchen.ready ? 'success' : 'error');
    } catch {
      /* ignore */
    } finally {
      setBusy(false);
    }
  };
  if (!st) return null;
  const dot = (p) => (p.ready ? 'var(--success)' : p.name ? 'var(--warning)' : 'var(--danger)');
  return (
    <button className="chip" style={{ padding: '6px 12px', fontSize: 12.5, opacity: busy ? 0.6 : 1 }} onClick={verify} title={`${st.message}\nClick to verify the printers now`}>
      <i style={{ width: 8, height: 8, borderRadius: 8, background: dot(st), display: 'inline-block' }} />
      <span style={{ maxWidth: 130, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{st.name || 'No printer'}</span>
      {!st.kitchenSame && st.kitchen && (
        <>
          <i style={{ width: 8, height: 8, borderRadius: 8, background: dot(st.kitchen), display: 'inline-block' }} />
          <span style={{ maxWidth: 110, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>KOT: {st.kitchen.name || '—'}</span>
        </>
      )}
    </button>
  );
}

function Clock() {
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 15000);
    return () => clearInterval(t);
  }, []);
  return (
    <div className="clock">
      <b>{now.toLocaleTimeString('en-PK', { hour: '2-digit', minute: '2-digit' })}</b>
      <div>{now.toLocaleDateString('en-PK', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' })}</div>
    </div>
  );
}

export default function Shell({ children }) {
  const { user, settings, license, info, can, logout, confirm } = useApp();
  const [collapsed, setCollapsed] = useState(false);
  const [pending, setPending] = useState(0);
  const loc = useLocation();
  const biz = settings?.business || {};
  const current = NAV.find((n) => loc.pathname.startsWith(n.to));

  useEffect(() => {
    if (!can('orders') && !can('pos')) return undefined;
    const load = () => api('orders.pending').then((r) => setPending(r.length)).catch(() => {});
    load();
    const t = setInterval(load, 20000);
    return () => clearInterval(t);
  }, [loc.pathname, can]);

  // Collapse the sidebar on the POS screen to give products more room.
  useEffect(() => {
    setCollapsed(loc.pathname === '/pos');
  }, [loc.pathname]);

  const doLogout = async () => {
    if (await confirm({ title: 'Log out?', message: 'Any items in the current cart that are not saved will be lost.', confirmText: 'Log out' })) logout();
  };

  const nav = NAV.filter((n) => can(n.perm) && (n.needs !== 'dineIn' || settings?.sales?.enableDineIn));

  return (
    <div className="shell">
      <aside className={`sidebar ${collapsed ? 'collapsed' : ''}`}>
        <div className="brand">
          <div className="brand-logo">{biz.logo ? <img src={biz.logo} alt="" /> : <DtMark size={24} />}</div>
          <div className="brand-text">
            <div className="brand-name">DT Retail POS</div>
            <div className="brand-sub">
              <bdi>{biz.name && biz.name !== 'My Business' ? biz.name : 'Simple Offline POS'}</bdi>
            </div>
          </div>
        </div>
        <nav className="nav">
          {nav.map((n) => (
            <NavLink key={n.to} to={n.to} className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`} title={n.label}>
              <n.icon size={19} />
              <span className="nav-label">{n.label}</span>
              {n.badge === 'pending' && pending > 0 && <span className="badge-dot">{pending}</span>}
            </NavLink>
          ))}
        </nav>
        <div className="sidebar-foot">
          <DevFooter version={info?.version || license?.version || ''} />
          <button className="nav-item" style={{ background: 'none', border: 0, width: '100%', cursor: 'pointer' }} onClick={() => setCollapsed(!collapsed)} title="Toggle sidebar">
            {collapsed ? <PanelLeftOpen size={19} /> : <PanelLeftClose size={19} />}
            <span className="nav-label">Collapse</span>
          </button>
        </div>
      </aside>
      <div className="main">
        <header className="topbar">
          <h1>{current?.label || 'DT Retail POS'}</h1>
          <div className="spacer" />
          <PrinterPill />
          <Clock />
          <div className="user-chip">
            <div className="avatar">{initials(user.name)}</div>
            <div className="who">
              <div className="b">{user.name}</div>
              <small>{user.role}</small>
            </div>
            <Button variant="ghost" size="sm" icon={LogOut} onClick={doLogout} title="Log out" />
          </div>
        </header>
        {license?.state === 'trial' && (
          <div className="banner warn">
            <KeyRound size={16} /> {license.message} {can('settings') ? 'Activate from Settings → License.' : 'Ask your admin to activate the license.'}
          </div>
        )}
        {license?.state === 'active' && license.message && (
          <div className="banner warn">
            <KeyRound size={16} /> {license.message} Contact {license.vendor?.name} to renew.
          </div>
        )}
        {license?.state === 'unconfigured' && info?.packaged && (
          <div className="banner info">
            <ShieldAlert size={16} /> Developer build: licensing is not configured. Do not distribute this build to customers.
          </div>
        )}
        {info?.defaultAdmin && user.role === 'admin' && (
          <div className="banner danger">
            <ShieldAlert size={16} /> You are using the default admin password. Change it in Users to protect your data.
          </div>
        )}
        <main className={`content ${loc.pathname === '/pos' ? 'flush' : ''}`}>
          <div key={loc.pathname} className="page-in" style={loc.pathname === '/pos' ? { height: '100%' } : undefined}>
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
