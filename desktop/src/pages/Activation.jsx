import { useState } from 'react';
import { KeyRound, Copy, RefreshCw, Mail, ShieldAlert } from 'lucide-react';
import { api } from '../lib/api';
import { useApp } from '../context/AppContext';
import { Button, Field } from '../components/ui';

/** Full-screen activation (trial ended / expired / revoked) — also used inside Settings → License. */
export function LicenseActivateForm({ onDone }) {
  const { license, setLicense, toast } = useApp();
  const [key, setKey] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const copy = () => {
    navigator.clipboard.writeText(license.machineId);
    toast('Computer ID copied');
  };

  const activate = async () => {
    setBusy(true);
    setError('');
    try {
      const st = await api('license.activate', { key });
      setLicense(st);
      toast('License activated. Thank you!');
      setKey('');
      onDone?.(st);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  const refresh = async () => {
    setBusy(true);
    try {
      setLicense(await api('license.refresh'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="col" style={{ gap: 16 }}>
      <Field label="Your Computer ID" hint="Send this ID to your provider to receive a license key for this computer.">
        <div className="row">
          <div className="input mono b" style={{ display: 'flex', alignItems: 'center', fontSize: 17, letterSpacing: 1 }}>
            {license?.machineId}
          </div>
          <Button icon={Copy} onClick={copy}>Copy</Button>
        </div>
      </Field>
      <Field label="License Key">
        <textarea className="textarea mono" rows={4} value={key} onChange={(e) => setKey(e.target.value)} placeholder="Paste your RPOS1.… license key here" style={{ fontSize: 12 }} />
      </Field>
      {error && <div className="badge red" style={{ padding: '10px 12px', whiteSpace: 'normal', borderRadius: 10 }}>{error}</div>}
      <div className="row">
        <Button variant="primary" size="lg" icon={KeyRound} onClick={activate} loading={busy} disabled={!key.trim()}>
          Activate License
        </Button>
        {license?.licenseId && (
          <Button icon={RefreshCw} onClick={refresh} disabled={busy} title="Check online for renewal">
            Check for renewal
          </Button>
        )}
      </div>
    </div>
  );
}

export default function Activation() {
  const { license } = useApp();
  return (
    <div className="auth">
      <div className="auth-brand">
        <div className="row" style={{ gap: 14 }}>
          <div className="brand-logo" style={{ width: 52, height: 52, fontSize: 24, borderRadius: 14 }}>R</div>
          <div style={{ fontWeight: 700, fontSize: 18 }}>Retail POS</div>
        </div>
        <div>
          <h1>Activate Retail POS</h1>
          <div className="sub">Your data is safe. Activate a license to continue billing.</div>
        </div>
        <div className="col" style={{ opacity: 0.8 }}>
          <div className="row"><Mail size={16} /> {license?.vendor?.email}</div>
          {license?.vendor?.phone && <div>{license.vendor.phone}</div>}
        </div>
      </div>
      <div className="auth-panel">
        <div className="auth-box" style={{ width: 480 }}>
          <div className="card card-pad" style={{ background: 'var(--warning-50)', borderColor: 'transparent', color: 'var(--warning)', display: 'flex', gap: 10 }}>
            <ShieldAlert size={20} style={{ flexShrink: 0 }} />
            <div>{license?.message || 'A license is required.'}</div>
          </div>
          <div className="mt">
            <LicenseActivateForm />
          </div>
        </div>
      </div>
    </div>
  );
}
