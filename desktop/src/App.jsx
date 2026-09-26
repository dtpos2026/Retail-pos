import { Component, useEffect, useState } from 'react';
import { HashRouter, Navigate, Route, Routes } from 'react-router-dom';
import { useApp } from './context/AppContext';
import { PosProvider } from './context/PosContext';
import { api } from './lib/api';
import { Loading, Button } from './components/ui';
import Shell from './components/Shell';
import Login from './pages/Login';
import Activation from './pages/Activation';
import Dashboard from './pages/Dashboard';
import Pos from './pages/Pos';
import Orders from './pages/Orders';
import Tables from './pages/Tables';
import Products from './pages/Products';
import Categories from './pages/Categories';
import Customers from './pages/Customers';
import Tokens from './pages/Tokens';
import Inventory from './pages/Inventory';
import Reports from './pages/Reports';
import Users from './pages/Users';
import Settings from './pages/Settings';

export const MODULES = [
  { path: '/dashboard', perm: 'dashboard', element: <Dashboard /> },
  { path: '/pos', perm: 'pos', element: <Pos /> },
  { path: '/orders', perm: 'orders', element: <Orders /> },
  { path: '/tables', perm: 'tables', element: <Tables /> },
  { path: '/products', perm: 'products', element: <Products /> },
  { path: '/categories', perm: 'categories', element: <Categories /> },
  { path: '/customers', perm: 'customers', element: <Customers /> },
  { path: '/tokens', perm: 'tokens', element: <Tokens /> },
  { path: '/inventory', perm: 'inventory', element: <Inventory /> },
  { path: '/reports', perm: 'reports', element: <Reports /> },
  { path: '/users', perm: 'users', element: <Users /> },
  { path: '/settings', perm: 'settings', element: <Settings /> },
];

class ErrorBoundary extends Component {
  state = { error: null };
  static getDerivedStateFromError(error) {
    return { error };
  }
  componentDidCatch(error) {
    console.error(error);
  }
  render() {
    if (this.state.error) {
      return (
        <div className="empty" style={{ height: '100%' }}>
          <h4>Something went wrong on this screen.</h4>
          <p>Please try again. Your saved data is safe.</p>
          <Button variant="primary" onClick={() => this.setState({ error: null })}>
            Try again
          </Button>
        </div>
      );
    }
    return this.props.children;
  }
}

export default function App() {
  const { user, setUser, license, reloadLicense, reloadSettings, setInfo, can } = useApp();
  const [booting, setBooting] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        setInfo(await api('app.info'));
        const lic = await reloadLicense();
        if (lic.usable) {
          const u = await api('auth.current');
          if (u) {
            await reloadSettings();
            setUser(u);
          }
        }
      } catch {
        /* shown on login */
      } finally {
        setBooting(false);
      }
    })();
  }, [reloadLicense, reloadSettings, setInfo, setUser]);

  if (booting) return <Loading />;
  if (license && !license.usable) return <Activation />;
  if (!user) return <Login />;

  const home = can('pos') ? '/pos' : MODULES.find((m) => can(m.perm))?.path || '/pos';
  return (
    <HashRouter>
      <PosProvider>
        <Shell>
          <ErrorBoundary>
            <Routes>
              {MODULES.filter((m) => can(m.perm)).map((m) => (
                <Route key={m.path} path={m.path} element={m.element} />
              ))}
              <Route path="*" element={<Navigate to={can('dashboard') ? '/dashboard' : home} replace />} />
            </Routes>
          </ErrorBoundary>
        </Shell>
      </PosProvider>
    </HashRouter>
  );
}
