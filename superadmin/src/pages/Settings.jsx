import { useEffect, useRef, useState } from 'react';
import { KeyRound, Copy, Download, Upload, ShieldCheck, FlaskConical, AlertTriangle, FileCode2 } from 'lucide-react';
import { getSigningConfig, saveSigningConfig } from '../lib/data';
import { generateKeyPair, signLicense, verifyLicense } from '../lib/license';
import { useAdmin } from '../context';
import { fmtDateTime } from '../lib/format';
import { PageHead, Button, Loading, Badge } from '../components/ui';

export default function Settings() {
  const { isHead, toast, toastError, confirm, user } = useAdmin();
  const [cfg, setCfg] = useState(undefined);
  const [busy, setBusy] = useState('');
  const fileRef = useRef(null);

  const load = () => getSigningConfig().then(setCfg).catch((e) => { toastError(e); setCfg(null); });
  useEffect(() => {
    load();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const create = async () => {
    setBusy('create');
    try {
      await saveSigningConfig(await generateKeyPair());
      toast('Signing key created');
      await load();
    } catch (e) {
      toastError(e);
    } finally {
      setBusy('');
    }
  };

  const download = () => {
    const blob = new Blob([JSON.stringify({ app: 'retail-pos', kind: 'license-signing-key', privateJwk: cfg.privateJwk, publicPem: cfg.publicPem }, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'retail-pos-signing-key-BACKUP.json';
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const importKey = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      const data = JSON.parse(await file.text());
      if (!data.privateJwk || !data.publicPem) throw new Error('This is not a Retail POS signing key backup.');
      const test = await signLicense(data.privateJwk, { lid: 't', cid: 't', bn: 't', mid: '*', plan: 't', iat: '2026-01-01', exp: null, mu: 0 });
      if (!(await verifyLicense(data.publicPem, test))) throw new Error('Private and public key do not match.');
      if (cfg && !(await confirm({ title: 'Replace signing key?', message: 'Licenses signed with the current key will no longer be accepted by POS builds that use the new public key.', danger: true, confirmText: 'Replace' }))) return;
      await saveSigningConfig(data);
      toast('Signing key imported');
      load();
    } catch (err) {
      toastError(err);
    }
  };

  const selfTest = async () => {
    setBusy('test');
    try {
      const key = await signLicense(cfg.privateJwk, { lid: 'self-test', cid: 'x', bn: 'Self Test', mid: '*', plan: 'test', iat: '2026-01-01', exp: null, mu: 0 });
      const ok = await verifyLicense(cfg.publicPem, key);
      toast(ok ? 'Key pair works: test license signed and verified.' : 'Verification failed!', ok ? 'success' : 'error');
    } finally {
      setBusy('');
    }
  };

  if (cfg === undefined) return <Loading />;
  const snippet = cfg ? `const PUBLIC_KEY_PEM = \`${cfg.publicPem.trim()}\`;` : '';

  return (
    <div className="col" style={{ gap: 16, maxWidth: 980 }}>
      <PageHead title="Settings" sub={`Signed in as ${user.email}`} />
      <div className="card">
        <div className="card-head">
          <KeyRound size={18} />
          <h3>License signing key</h3>
          <div className="actions">{cfg ? <Badge color="green">Configured</Badge> : <Badge color="amber">Not set up</Badge>}</div>
        </div>
        <div className="card-pad col" style={{ gap: 14 }}>
          {!cfg ? (
            <>
              <p className="muted" style={{ margin: 0 }}>
                Licenses are signed with a private key that stays in this panel (stored in Firestore, readable by admins only). The POS app contains only the public key, so it can verify licenses offline but can never create them.
              </p>
              {isHead ? (
                <div className="row">
                  <Button variant="primary" icon={ShieldCheck} onClick={create} loading={busy === 'create'}>Create signing key</Button>
                  <Button icon={Upload} onClick={() => fileRef.current?.click()}>Import from backup</Button>
                </div>
              ) : (
                <div className="badge amber">Ask the head admin to create the signing key.</div>
              )}
            </>
          ) : (
            <>
              <div className="small faint">Created {fmtDateTime(cfg.createdAt)} by {cfg.createdBy}</div>
              <div>
                <div className="label" style={{ marginBottom: 6 }}>Public key (goes into the POS app)</div>
                <div className="key-box" style={{ whiteSpace: 'pre' }}>{cfg.publicPem}</div>
              </div>
              <div className="row wrap">
                <Button icon={Copy} onClick={() => { navigator.clipboard.writeText(cfg.publicPem); toast('Public key copied'); }}>Copy public key</Button>
                <Button icon={FileCode2} onClick={() => { navigator.clipboard.writeText(snippet); toast('Code snippet copied'); }}>Copy config.js line</Button>
                <Button icon={FlaskConical} onClick={selfTest} loading={busy === 'test'}>Test key pair</Button>
                {isHead && <Button icon={Download} onClick={download}>Download private backup</Button>}
                {isHead && <Button variant="ghost" icon={Upload} onClick={() => fileRef.current?.click()}>Import / replace</Button>}
              </div>
              <div className="card card-pad small" style={{ background: 'var(--info-50)', borderColor: 'transparent' }}>
                <b>Put this key into the POS before building installers for customers:</b>
                <ol style={{ margin: '8px 0 0', paddingLeft: 18, lineHeight: 1.7 }}>
                  <li>Open <code>electron/license/config.js</code></li>
                  <li>Replace the line <code>const PUBLIC_KEY_PEM = ``;</code> with the copied config.js line.</li>
                  <li>Build the installer (<code>npm run dist</code> or the GitHub Actions workflow).</li>
                </ol>
              </div>
              <div className="card card-pad small row" style={{ background: 'var(--warning-50)', borderColor: 'transparent', alignItems: 'flex-start' }}>
                <AlertTriangle size={18} color="var(--warning)" style={{ flexShrink: 0 }} />
                <div>Keep the private backup file somewhere safe and offline (USB). Never share it. If it is lost and the Firestore data is deleted, you cannot issue new licenses for existing installations.</div>
              </div>
            </>
          )}
          <input ref={fileRef} type="file" accept="application/json" hidden onChange={importKey} />
        </div>
      </div>
    </div>
  );
}
