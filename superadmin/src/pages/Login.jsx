import { useState } from 'react';
import { signInWithEmailAndPassword, signInWithPopup, GoogleAuthProvider, sendPasswordResetEmail, sendEmailVerification } from 'firebase/auth';
import { LogIn, Mail, KeyRound, ShieldAlert, RefreshCw, LogOut, Building2, BadgeCheck, CloudOff, Monitor, ShieldCheck } from 'lucide-react';
import { auth } from '../firebase';
import { resolveRole } from '../lib/data';
import { useAdmin, friendly } from '../context';
import { Button, Field, Input } from '../components/ui';
import { DtMark, Floaters, DT_LOCKUP_WHITE, DT_LOCKUP_PURPLE, BRAND } from '../components/Brand';

function Brand() {
  return (
    <div className="auth-brand">
      <Floaters />
      <div className="row" style={{ gap: 14 }}>
        <div className="auth-logo" style={{ width: 54, height: 54 }}><DtMark size={28} /></div>
        <div>
          <div style={{ fontWeight: 800, fontSize: 19 }}>{BRAND.product}</div>
          <div style={{ opacity: 0.7, fontSize: 13 }}>{BRAND.panel} Panel</div>
        </div>
      </div>
      <div>
        <h1>Clients, licenses
          <br />&amp; devices.</h1>
        <div className="sub">Generate secure license keys and control every registered computer — live.</div>
        <div className="auth-feats" style={{ marginTop: 34 }}>
          <div className="auth-feat"><Building2 size={20} /> Client records</div>
          <div className="auth-feat"><KeyRound size={20} /> Signed license keys</div>
          <div className="auth-feat"><Monitor size={20} /> Device limits</div>
          <div className="auth-feat"><ShieldCheck size={20} /> Block &amp; suspend live</div>
          <div className="auth-feat"><BadgeCheck size={20} /> Renew &amp; revoke</div>
          <div className="auth-feat"><CloudOff size={20} /> POS stays offline</div>
        </div>
      </div>
      <div className="auth-footer-brand">
        <img src={DT_LOCKUP_WHITE} alt="" />
        <div style={{ lineHeight: 1.35 }}>
          <div style={{ fontSize: 11, letterSpacing: '.14em', textTransform: 'uppercase', opacity: 0.7 }}>Developed by</div>
          <div style={{ fontWeight: 700 }}>{BRAND.developer} · v{BRAND.version}</div>
        </div>
      </div>
    </div>
  );
}

export default function Login() {
  const { toast } = useAdmin();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');

  const run = async (key, fn) => {
    setBusy(key);
    setError('');
    try {
      await fn();
    } catch (e) {
      setError(friendly(e));
    } finally {
      setBusy('');
    }
  };

  return (
    <div className="auth">
      <Brand />
      <div className="auth-panel">
        <form
          className="auth-box col"
          style={{ gap: 14 }}
          onSubmit={(e) => {
            e.preventDefault();
            run('email', () => signInWithEmailAndPassword(auth, email.trim(), password));
          }}
        >
          <div>
            <h2 style={{ fontSize: 26, fontWeight: 800 }}>Super Admin sign in</h2>
            <p className="muted" style={{ marginTop: 6 }}>Use your administrator account.</p>
          </div>
          <Field label="Email"><Input type="email" autoFocus value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" /></Field>
          <Field label="Password"><Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} /></Field>
          <Button type="submit" variant="primary" size="lg" icon={LogIn} loading={busy === 'email'}>Sign in</Button>
          <div className="row" style={{ gap: 8 }}>
            <div className="hr grow" />
            <span className="faint small">or</span>
            <div className="hr grow" />
          </div>
          <Button size="lg" onClick={() => run('google', () => signInWithPopup(auth, new GoogleAuthProvider()))} loading={busy === 'google'}>
            <svg width="18" height="18" viewBox="0 0 48 48"><path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34.1 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" /><path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34.1 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" /><path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z" /><path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 38.2 44 33 44 24c0-1.3-.1-2.4-.4-3.5z" /></svg>
            Continue with Google
          </Button>
          <Button
            variant="ghost"
            icon={Mail}
            onClick={() =>
              email.trim()
                ? run('reset', async () => {
                    await sendPasswordResetEmail(auth, email.trim());
                    toast('Password reset email sent.');
                  })
                : setError('Enter your email first, then click "Forgot password".')
            }
            loading={busy === 'reset'}
          >
            Forgot password
          </Button>
          {error && <div className="badge red" style={{ padding: '10px 12px', borderRadius: 10, whiteSpace: 'normal' }}>{error}</div>}
        </form>
      </div>
    </div>
  );
}

export function VerifyEmail() {
  const { user, logout, toast, setRole } = useAdmin();
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const send = async () => {
    setBusy('send');
    setError('');
    try {
      await sendEmailVerification(user);
      toast(`Verification email sent to ${user.email}`);
    } catch (e) {
      setError(friendly(e));
    } finally {
      setBusy('');
    }
  };
  const check = async () => {
    setBusy('check');
    await user.reload();
    await user.getIdToken(true); // refresh token so security rules see email_verified
    if (auth.currentUser.emailVerified) {
      setRole(await resolveRole(auth.currentUser));
      window.location.reload();
    } else setError('Not verified yet. Open the link in the email, then click again.');
    setBusy('');
  };
  return (
    <div className="auth">
      <Brand />
      <div className="auth-panel">
        <div className="auth-box col" style={{ gap: 14 }}>
          <h2 style={{ fontSize: 24, fontWeight: 800 }}>Verify your email</h2>
          <p className="muted" style={{ margin: 0 }}>For security, the Super Admin email must be verified. We will send a link to <b>{user.email}</b>.</p>
          <Button variant="primary" size="lg" icon={Mail} onClick={send} loading={busy === 'send'}>Send verification email</Button>
          <Button icon={RefreshCw} onClick={check} loading={busy === 'check'}>I have verified — continue</Button>
          <Button variant="ghost" icon={LogOut} onClick={logout}>Sign out</Button>
          {error && <div className="badge red" style={{ padding: '10px 12px', borderRadius: 10, whiteSpace: 'normal' }}>{error}</div>}
        </div>
      </div>
    </div>
  );
}

export function NoAccess() {
  const { user, logout } = useAdmin();
  return (
    <div className="auth">
      <Brand />
      <div className="auth-panel">
        <div className="auth-box col" style={{ gap: 14 }}>
          <ShieldAlert size={40} color="var(--danger)" />
          <h2 style={{ fontSize: 24, fontWeight: 800 }}>No access</h2>
          <p className="muted" style={{ margin: 0 }}><b>{user.email}</b> is not a Super Admin. Ask the head admin to add you under Admins.</p>
          <Button icon={LogOut} onClick={logout}>Sign out</Button>
        </div>
      </div>
    </div>
  );
}
