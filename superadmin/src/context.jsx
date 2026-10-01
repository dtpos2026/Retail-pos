import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { CheckCircle2, XCircle, Info, AlertTriangle } from 'lucide-react';
import { auth } from './firebase';
import { resolveRole, watch } from './lib/data';
import { Modal, Button, Input } from './components/ui';

const Ctx = createContext(null);
export const useAdmin = () => useContext(Ctx);

export function AdminProvider({ children }) {
  const [user, setUser] = useState(undefined); // undefined = loading
  const [role, setRole] = useState(null);
  const [devices, setDevices] = useState(null); // live list of every registered device
  const [requests, setRequests] = useState([]); // computers waiting for approval
  const [toasts, setToasts] = useState([]);
  const [dialog, setDialog] = useState(null);
  const idRef = useRef(0);

  useEffect(
    () =>
      onAuthStateChanged(auth, async (u) => {
        if (!u) {
          setRole(null);
          setUser(null);
          return;
        }
        setRole(u.emailVerified ? await resolveRole(u) : null);
        setUser(u);
      }),
    []
  );

  useEffect(() => {
    if (!role) {
      setDevices(null);
      return undefined;
    }
    const a = watch('devices', setDevices, () => setDevices([]));
    const b = watch('deviceRequests', (r) => setRequests(r.filter((x) => x.status === 'pending')), () => {});
    return () => {
      a();
      b();
    };
  }, [role]);

  const toast = useCallback((message, type = 'success') => {
    const id = ++idRef.current;
    setToasts((t) => [...t.slice(-2), { id, message, type }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), type === 'error' ? 6000 : 3200);
  }, []);
  const toastError = useCallback((e) => toast(friendly(e), 'error'), [toast]);

  const confirm = useCallback(
    ({ title = 'Are you sure?', message, confirmText = 'Confirm', danger = false, input }) =>
      new Promise((resolve) => setDialog({ title, message, confirmText, danger, input, resolve, value: '' })),
    []
  );

  const logout = useCallback(() => signOut(auth), []);

  const value = useMemo(() => ({ user, role, setRole, isHead: role === 'head', devices, requests, toast, toastError, confirm, logout }), [user, role, devices, requests, toast, toastError, confirm, logout]);

  const close = (ok) => {
    const d = dialog;
    setDialog(null);
    d.resolve(ok ? (d.input ? d.value : true) : false);
  };

  return (
    <Ctx.Provider value={value}>
      {children}
      <div className="toasts">
        {toasts.map((t) => (
          <div key={t.id} className={`toast ${t.type}`}>
            {t.type === 'success' ? <CheckCircle2 size={20} /> : t.type === 'error' ? <XCircle size={20} /> : <Info size={20} />}
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
              <Button variant={dialog.danger ? 'danger' : 'primary'} onClick={() => close(true)}>{dialog.confirmText}</Button>
            </>
          }
        >
          {dialog.message && <p className="muted" style={{ marginTop: 0, whiteSpace: 'pre-line' }}>{dialog.message}</p>}
          {dialog.input && <Input autoFocus placeholder={dialog.input} value={dialog.value} onChange={(e) => setDialog({ ...dialog, value: e.target.value })} />}
        </Modal>
      )}
    </Ctx.Provider>
  );
}

/** Map Firebase error codes to plain language. */
export function friendly(e) {
  const code = e?.code || '';
  const map = {
    'auth/invalid-credential': 'Wrong email or password.',
    'auth/wrong-password': 'Wrong email or password.',
    'auth/user-not-found': 'No account with this email.',
    'auth/too-many-requests': 'Too many attempts. Please wait a few minutes and try again.',
    'auth/network-request-failed': 'No internet connection.',
    'auth/popup-closed-by-user': 'Sign-in window was closed.',
    'auth/operation-not-allowed': 'This sign-in method is not enabled in Firebase Authentication.',
    'permission-denied': 'Permission denied. Only Super Admins can do this.',
    unavailable: 'Cannot reach the server. Check your internet connection.',
  };
  return map[code] || e?.message || 'Something went wrong.';
}
