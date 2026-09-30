import { useState } from 'react';
import { KeyRound, Copy, RefreshCw, Mail, ShieldAlert, ShieldOff, PauseCircle, MonitorSmartphone, Wifi, LogOut } from 'lucide-react';
import { api } from '../lib/api';
import { useApp } from '../context/AppContext';
import { Button, Field, Badge } from '../components/ui';
import { BRAND } from '@shared/brand.mjs';
import { DtMark, DT_LOCKUP_WHITE } from '../components/Brand';
import SupportBox from '../components/SupportBox';

/** Activation / device registration form — used on the full-screen gate and inside Settings → License. */
export function LicenseActivateForm({ onDone }) {
  const { license, setLicense, toast } = useApp();
  const [key, setKey] = useState('');
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');

  const copy = () => {
    navigator.clipboard.writeText(license.machineId);
    toast('Computer ID copied');
  };

  const run = async (name, fn) => {
    setBusy(name);
    setError('');
    try {
      const st = await fn();
      if (st) setLicense(st);
      return st;
    } catch (e) {
      setError(e.message);
      api('license.status').then(setLicense).catch(() => {});
      return null;
    } finally {
      setBusy('');
    }
  };

  const activate = async () => {
    const st = await run('activate', () => api('license.activate', { key }));
    if (st?.usable) {
      toast('License activated. Thank you!');
      setKey('');
      onDone?.(st);
    }
  };
  const register = async () => {
    const st = await run('register', () => api('license.registerDevice'));
    if (st?.usable) toast('This device is registered.');
  };
  const refresh = async () => {
    const st = await run('refresh', () => api('license.refresh'));
    if (st?.usable) toast('License is active again.');
    else if (st) toast(st.message || 'Still not active.', 'warn');
    if (st && st.state !== 'needs_key') setError('');
  };

  const needsRegister = license?.state === 'unregistered';
  const locked = ['blocked', 'suspended', 'revoked', 'pending'].includes(license?.state);
  const needsKey = license?.state === 'needs_key';

  return (
    <div className="col" style={{ gap: 16 }}>
      <Field label="This computer's ID" hint="Your provider sees this ID in the Super Admin panel after activation.">
        <div className="row">
          <div className="input mono b" style={{ display: 'flex', alignItems: 'center', fontSize: 17, letterSpacing: 1 }}>{license?.machineId}</div>
          <Button icon={Copy} onClick={copy}>Copy</Button>
        </div>
      </Field>

      {needsRegister && (
        <div className="card card-pad col" style={{ background: 'var(--primary-50)', borderColor: 'transparent', gap: 10 }}>
          <div className="row"><MonitorSmartphone size={18} color="var(--primary)" /><b>Register this device</b></div>
          <div className="small muted">Your license key is saved. This computer must be registered once (internet needed). It will not ask again after that.</div>
          <Button variant="primary" size="lg" icon={Wifi} onClick={register} loading={busy === 'register'}>Register this device</Button>
        </div>
      )}

      {needsKey && (
        <div className="card card-pad col" style={{ background: 'var(--primary-50)', borderColor: 'transparent', gap: 10 }}>
          <div className="row"><Wifi size={18} color="var(--primary)" /><b>Internet needed once</b></div>
          <div className="small muted">DT Retail POS downloads its licensing setup from your provider the first time it starts. After that it works fully offline.</div>
          <Button variant="primary" size="lg" icon={RefreshCw} onClick={refresh} loading={busy === 'refresh'}>Connect &amp; set up</Button>
        </div>
      )}

      {locked && (
        <Button icon={RefreshCw} onClick={refresh} loading={busy === 'refresh'}>Check again (internet needed)</Button>
      )}

      <Field label={license?.licenseId ? 'Enter a new license key (renewal / different license)' : 'License Key'}>
        <textarea className="textarea mono" rows={4} value={key} onChange={(e) => setKey(e.target.value)} placeholder="Paste your RPOS1.… license key here" style={{ fontSize: 12 }} />
      </Field>
      {error && <div className="badge red" style={{ padding: '10px 12px', whiteSpace: 'normal', borderRadius: 10 }}>{error}</div>}
      <div className="row">
        <Button variant="primary" size="lg" icon={KeyRound} onClick={activate} loading={busy === 'activate'} disabled={!key.trim()}>
          Activate License
        </Button>
        {license?.licenseId && !locked && !needsRegister && (
          <Button icon={RefreshCw} onClick={refresh} loading={busy === 'refresh'} title="Check online for renewal">Check for renewal</Button>
        )}
      </div>
    </div>
  );
}

const GATE = {
  blocked: { icon: ShieldOff, color: 'var(--danger)', title: 'Device blocked' },
  suspended: { icon: PauseCircle, color: 'var(--warning)', title: 'Device suspended' },
  revoked: { icon: ShieldOff, color: 'var(--danger)', title: 'License deactivated' },
  unregistered: { icon: MonitorSmartphone, color: 'var(--primary)', title: 'Register this device' },
  expired: { icon: ShieldAlert, color: 'var(--warning)', title: 'License expired' },
  trial_expired: { icon: ShieldAlert, color: 'var(--warning)', title: 'Trial ended' },
  invalid: { icon: ShieldAlert, color: 'var(--danger)', title: 'Wrong computer' },
  clock: { icon: ShieldAlert, color: 'var(--danger)', title: 'Check date & time' },
  pending: { icon: PauseCircle, color: 'var(--warning)', title: 'Payment pending' },
  needs_key: { icon: Wifi, color: 'var(--primary)', title: 'Set up licensing' },
  unlicensed: { icon: KeyRound, color: 'var(--primary)', title: 'Activate DT Retail POS' },
};

export default function Activation() {
  const { license, user, logout, info } = useApp();
  const g = GATE[license?.state] || { icon: ShieldAlert, color: 'var(--warning)', title: 'Activate DT Retail POS' };
  const Icon = g.icon;
  return (
    <div className="auth">
      <div className="auth-brand">
        <div className="row" style={{ gap: 14 }}>
          <div className="auth-logo" style={{ width: 54, height: 54 }}><DtMark size={28} /></div>
          <div style={{ fontWeight: 800, fontSize: 19 }}>{BRAND.product}</div>
        </div>
        <div>
          <h1>{g.title}</h1>
          <div className="sub">Your data is safe. {license?.state === 'blocked' || license?.state === 'suspended' ? 'Billing continues once your provider re-activates this device.' : 'Activate a license to continue billing.'}</div>
        </div>
        <div className="auth-footer-brand">
          <img src={DT_LOCKUP_WHITE} alt="" />
          <div style={{ lineHeight: 1.4 }}>
            <div style={{ fontWeight: 700 }}>{license?.vendor?.name || BRAND.developer}</div>
            <div className="row" style={{ gap: 6, opacity: 0.85 }}><Mail size={14} /> {license?.vendor?.email || BRAND.email}</div>
            <div style={{ opacity: 0.6, fontSize: 12 }}>v{info?.version || license?.version}</div>
          </div>
        </div>
      </div>
      <div className="auth-panel">
        <div className="auth-box" style={{ width: 480 }}>
          <div className="card card-pad" style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
            <Icon size={26} style={{ flexShrink: 0, color: g.color }} />
            <div>
              <div className="b" style={{ marginBottom: 2 }}>{g.title}</div>
              <div className="muted">{license?.message || 'A license is required.'}</div>
            </div>
          </div>
          <div className="mt">
            <LicenseActivateForm />
          </div>
          {license?.licenseId && ['blocked', 'suspended', 'revoked', 'pending', 'expired'].includes(license?.state) && (
            <div className="card card-pad mt"><SupportBox compact /></div>
          )}
          {user && (
            <div className="mt center">
              <Button variant="ghost" icon={LogOut} onClick={logout}>Log out</Button>
            </div>
          )}
          {license?.device?.registered && <div className="center mt"><Badge>Device: {license.device.name}</Badge></div>}
        </div>
      </div>
    </div>
  );
}
