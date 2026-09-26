import { HashRouter, NavLink, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { LayoutDashboard, Building2, KeyRound, ShieldCheck, Settings as SettingsIcon, History, LogOut } from 'lucide-react';
import { useAdmin } from './context';
import { Loading, Button } from './components/ui';
import { initials } from './lib/format';
import Login, { VerifyEmail, NoAccess } from './pages/Login';
import Dashboard from './pages/Dashboard';
import Clients from './pages/Clients';
import Licenses from './pages/Licenses';
import Admins from './pages/Admins';
import Settings from './pages/Settings';
import Activity from './pages/Activity';

const NAV = [
  { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/clients', label: 'Clients', icon: Building2 },
  { to: '/licenses', label: 'Licenses', icon: KeyRound },
  { to: '/activity', label: 'Activity Log', icon: History },
  { to: '/admins', label: 'Admins', icon: ShieldCheck, head: true },
  { to: '/settings', label: 'Settings', icon: SettingsIcon },
];

function Shell({ children }) {
  const { user, role, logout, isHead } = useAdmin();
  const loc = useLocation();
  const current = NAV.find((n) => loc.pathname.startsWith(n.to));
  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-logo admin"><img src="/icon.png" alt="" style={{ background: 'transparent' }} /></div>
          <div className="brand-text">
            <div className="brand-name">Retail POS</div>
            <div className="brand-sub">Super Admin</div>
          </div>
        </div>
        <nav className="nav">
          {NAV.filter((n) => !n.head || isHead).map((n) => (
            <NavLink key={n.to} to={n.to} className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`} title={n.label}>
              <n.icon size={19} />
              <span className="nav-label">{n.label}</span>
            </NavLink>
          ))}
        </nav>
      </aside>
      <div className="main">
        <header className="topbar">
          <h1>{current?.label || 'Super Admin'}</h1>
          <div className="spacer" />
          <div className="user-chip">
            <div className="avatar">{initials(user.displayName || user.email)}</div>
            <div className="who hide-sm">
              <div className="b">{user.displayName || user.email.split('@')[0]}</div>
              <small>{role === 'head' ? 'Head admin' : 'Admin'}</small>
            </div>
            <Button variant="ghost" size="sm" icon={LogOut} onClick={logout} title="Sign out" />
          </div>
        </header>
        <main className="content">{children}</main>
      </div>
    </div>
  );
}

export default function App() {
  const { user, role, isHead } = useAdmin();
  if (user === undefined) return <Loading />;
  if (!user) return <Login />;
  if (!user.emailVerified) return <VerifyEmail />;
  if (!role) return <NoAccess />;
  return (
    <HashRouter>
      <Shell>
        <Routes>
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/clients" element={<Clients />} />
          <Route path="/clients/:id" element={<Clients />} />
          <Route path="/licenses" element={<Licenses />} />
          <Route path="/activity" element={<Activity />} />
          {isHead && <Route path="/admins" element={<Admins />} />}
          <Route path="/settings" element={<Settings />} />
          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>
      </Shell>
    </HashRouter>
  );
}
