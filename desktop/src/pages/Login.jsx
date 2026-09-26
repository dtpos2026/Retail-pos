import { useCallback, useEffect, useState } from 'react';
import { Zap, WifiOff, Printer, Ticket, ShieldCheck, BarChart3, Delete, KeyRound, LogIn, Grid3x3 } from 'lucide-react';
import { api } from '../lib/api';
import { useApp } from '../context/AppContext';
import { initials } from '../lib/format';
import { Button, Field, Input } from '../components/ui';

export default function Login() {
  const { setUser, reloadSettings, info, license } = useApp();
  const [users, setUsers] = useState([]);
  const [mode, setMode] = useState('pin');
  const [sel, setSel] = useState(null);
  const [pin, setPin] = useState('');
  const [form, setForm] = useState({ username: '', password: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api('auth.loginUsers')
      .then((u) => {
        setUsers(u);
        if (!u.length) setMode('password');
        if (u.length === 1) setSel(u[0]);
      })
      .catch(() => setMode('password'));
  }, []);

  const finish = useCallback(
    async (u) => {
      await reloadSettings();
      setUser(u);
    },
    [reloadSettings, setUser]
  );

  const submitPin = useCallback(
    async (value) => {
      if (!sel || busy) return;
      setBusy(true);
      setError('');
      try {
        await finish(await api('auth.loginPin', { userId: sel.id, pin: value }));
      } catch (e) {
        setError(e.message);
        setPin('');
      } finally {
        setBusy(false);
      }
    },
    [sel, busy, finish]
  );

  const press = useCallback((d) => {
    setError('');
    setPin((p) => (p.length >= 4 ? p : p + d));
  }, []);

  // PINs are 4 digits: submit automatically when complete.
  useEffect(() => {
    if (pin.length === 4) submitPin(pin);
  }, [pin]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (mode !== 'pin') return;
    const onKey = (e) => {
      if (/^\d$/.test(e.key)) press(e.key);
      else if (e.key === 'Backspace') setPin((p) => p.slice(0, -1));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [mode, press]);

  const submitPassword = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await finish(await api('auth.login', form));
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="auth">
      <div className="auth-brand">
        <div className="row" style={{ gap: 14 }}>
          <div className="brand-logo" style={{ width: 52, height: 52, fontSize: 24, borderRadius: 14 }}>R</div>
          <div>
            <div style={{ fontWeight: 700, fontSize: 18 }}>Retail POS</div>
            <div style={{ opacity: 0.7, fontSize: 13 }}>v{info?.version}</div>
          </div>
        </div>
        <div>
          <h1>
            Billing made
            <br />
            simple &amp; fast.
          </h1>
          <div className="sub">Simple Offline POS for Small Businesses</div>
          <div className="auth-feats" style={{ marginTop: 34 }}>
            <div className="auth-feat"><Zap size={20} /> Bill in seconds</div>
            <div className="auth-feat"><WifiOff size={20} /> Works 100% offline</div>
            <div className="auth-feat"><Printer size={20} /> 58mm &amp; 80mm receipts</div>
            <div className="auth-feat"><Ticket size={20} /> Tokens &amp; tables</div>
            <div className="auth-feat"><BarChart3 size={20} /> Daily reports</div>
            <div className="auth-feat"><ShieldCheck size={20} /> Safe backups</div>
          </div>
        </div>
        <div style={{ opacity: 0.6, fontSize: 13 }}>
          {license?.state === 'active' ? `Licensed to ${license.businessName}` : license?.state === 'trial' ? license.message : ''}
        </div>
      </div>

      <div className="auth-panel">
        <div className="auth-box">
          <h2 style={{ fontSize: 26, fontWeight: 800 }}>Welcome back</h2>
          <p className="muted" style={{ marginTop: 6 }}>{mode === 'pin' ? 'Select your name and enter your PIN.' : 'Sign in with your username and password.'}</p>

          {mode === 'pin' ? (
            <div className="mt">
              <div className="user-tiles">
                {users.map((u) => (
                  <div
                    key={u.id}
                    className={`user-tile ${sel?.id === u.id ? 'on' : ''}`}
                    onClick={() => {
                      setSel(u);
                      setPin('');
                      setError('');
                    }}
                  >
                    <div className="avatar">{initials(u.name)}</div>
                    <div className="ellipsis" style={{ maxWidth: '100%' }}>{u.name}</div>
                    <div className="faint small" style={{ textTransform: 'capitalize' }}>{u.role}</div>
                  </div>
                ))}
              </div>
              {sel && (
                <>
                  <div className="pin-dots">
                    {[0, 1, 2, 3].map((i) => (
                      <span key={i} className={i < pin.length ? 'on' : ''} />
                    ))}
                  </div>
                  <div className="pinpad">
                    {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((d) => (
                      <button key={d} onClick={() => press(d)} disabled={busy}>{d}</button>
                    ))}
                    <button onClick={() => setPin('')} title="Clear">C</button>
                    <button onClick={() => press('0')} disabled={busy}>0</button>
                    <button onClick={() => setPin((p) => p.slice(0, -1))} title="Back"><Delete size={20} /></button>
                  </div>
                </>
              )}
            </div>
          ) : (
            <form className="col mt" onSubmit={submitPassword}>
              <Field label="Username">
                <Input autoFocus value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} placeholder="e.g. admin" />
              </Field>
              <Field label="Password">
                <Input type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} placeholder="••••••" />
              </Field>
              <Button type="submit" variant="primary" size="lg" icon={LogIn} loading={busy}>
                Sign in
              </Button>
            </form>
          )}

          {error && (
            <div className="badge red" style={{ display: 'flex', marginTop: 14, padding: '10px 12px', borderRadius: 10, whiteSpace: 'normal' }}>
              {error}
            </div>
          )}

          <div className="row mt" style={{ justifyContent: 'center' }}>
            {mode === 'pin' ? (
              <Button variant="ghost" icon={KeyRound} onClick={() => { setMode('password'); setError(''); }}>
                Use username &amp; password
              </Button>
            ) : (
              users.length > 0 && (
                <Button variant="ghost" icon={Grid3x3} onClick={() => { setMode('pin'); setError(''); }}>
                  Quick PIN login
                </Button>
              )
            )}
          </div>

          {info?.defaultAdmin && (
            <div className="card card-pad mt small" style={{ background: 'var(--info-50)', borderColor: 'transparent', color: 'var(--info)' }}>
              <b>First login:</b> username <b>admin</b>, password <b>admin123</b> (PIN <b>1234</b>). Please change it after signing in.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
