import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { CheckCircle2, AlertTriangle, XCircle, Info } from 'lucide-react';
import { api, onApiError } from '../lib/api';
import { Modal, Button, Input } from '../components/ui';

const AppCtx = createContext(null);

export function useApp() {
  return useContext(AppCtx);
}

export function applyAppearance(a) {
  const root = document.documentElement;
  root.dataset.theme = a?.theme || 'royal';
  root.dataset.anim = a?.animations === false ? 'off' : 'on';
}

export function AppProvider({ children }) {
  const [user, setUser] = useState(null);
  const [settings, setSettings] = useState(null);
  const [license, setLicense] = useState(null);
  const [info, setInfo] = useState(null);
  const [pub, setPublic] = useState(null); // theme + shop name/logo, available before login
  const [toasts, setToasts] = useState([]);
  const [dialog, setDialog] = useState(null);
  const idRef = useRef(0);

  const toast = useCallback((message, type = 'success', ms = 3200) => {
    const id = ++idRef.current;
    setToasts((t) => [...t.slice(-2), { id, message, type }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), ms);
  }, []);

  const toastError = useCallback((err) => toast(err?.message || String(err), 'error', 5000), [toast]);

  /** Promise-based confirmation dialog. */
  const confirm = useCallback(
    ({ title = 'Are you sure?', message, confirmText = 'Confirm', danger = false, input }) =>
      new Promise((resolve) => setDialog({ title, message, confirmText, danger, input, resolve, value: '' })),
    []
  );

  const reloadSettings = useCallback(async () => {
    const s = await api('settings.getAll');
    setSettings(s);
    applyAppearance(s.appearance);
    return s;
  }, []);

  const reloadLicense = useCallback(async () => {
    const l = await api('license.status');
    setLicense(l);
    return l;
  }, []);

  // Live license changes pushed by the main process (blocked / suspended / renewed while the app is open).
  useEffect(() => {
    if (!window.pos?.on) return undefined;
    return window.pos.on('license', (st) => setLicense(st));
  }, []);

  const logout = useCallback(async () => {
    await api('auth.logout').catch(() => {});
    setUser(null);
    setSettings(null);
  }, []);

  useEffect(
    () =>
      onApiError((err) => {
        if (err.code === 'AUTH_REQUIRED') setUser(null);
        if (err.code === 'LICENSE_REQUIRED') reloadLicense().catch(() => {});
      }),
    [reloadLicense]
  );

  const can = useCallback((perm) => !!user && (user.role === 'admin' || user.permissions.includes(perm)), [user]);

  const value = useMemo(
    () => ({ user, setUser, settings, setSettings, reloadSettings, license, setLicense, reloadLicense, info, setInfo, pub, setPublic, toast, toastError, confirm, logout, can }),
    [user, settings, reloadSettings, license, reloadLicense, info, pub, toast, toastError, confirm, logout, can]
  );

  const close = (ok) => {
    const d = dialog;
    setDialog(null);
    d.resolve(ok ? (d.input ? d.value || '' : true) : false);
  };

  return (
    <AppCtx.Provider value={value}>
      {children}
      <div className="toasts">
        {toasts.map((t) => (
          <div key={t.id} className={`toast ${t.type}`}>
            {t.type === 'success' ? <CheckCircle2 size={20} /> : t.type === 'error' ? <XCircle size={20} /> : t.type === 'warn' ? <AlertTriangle size={20} /> : <Info size={20} />}
            <div style={{ whiteSpace: 'pre-line' }}>{t.message}</div>
          </div>
        ))}
      </div>
      {dialog && (
        <Modal
          title={dialog.title}
          icon={dialog.danger ? AlertTriangle : Info}
          size="sm"
          onClose={() => close(false)}
          footer={
            <>
              <Button onClick={() => close(false)}>Cancel</Button>
              <Button variant={dialog.danger ? 'danger' : 'primary'} onClick={() => close(true)} autoFocus>
                {dialog.confirmText}
              </Button>
            </>
          }
        >
          {dialog.message && <p className="muted" style={{ marginTop: 0, whiteSpace: 'pre-line' }}>{dialog.message}</p>}
          {dialog.input && (
            <Input
              autoFocus
              placeholder={dialog.input}
              value={dialog.value}
              onChange={(e) => setDialog({ ...dialog, value: e.target.value })}
              onKeyDown={(e) => e.key === 'Enter' && close(true)}
            />
          )}
        </Modal>
      )}
    </AppCtx.Provider>
  );
}
