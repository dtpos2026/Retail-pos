import { useState } from 'react';
import { BadgeCheck, ShieldX, KeyRound, Search } from 'lucide-react';
import { useAdmin } from '../context';
import { getSigningConfig } from '../lib/data';
import { verifyLicense } from '../lib/license';
import { PageHead, Button, Badge } from '../components/ui';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { db } from '../firebase';
import { fmtDate, licenseState } from '../lib/format';

function decodePayload(key) {
  try {
    const body = String(key).replace(/\s+/g, '').split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    return JSON.parse(decodeURIComponent(escape(atob(body))));
  } catch {
    return null;
  }
}

export default function VerifyKey() {
  const { toastError } = useAdmin();
  const [key, setKey] = useState('');
  const [res, setRes] = useState(null);
  const [busy, setBusy] = useState(false);

  const check = async () => {
    setBusy(true);
    setRes(null);
    try {
      const cfg = await getSigningConfig();
      if (!cfg?.publicPem) throw new Error('Create the license signing key in Settings first.');
      const clean = key.replace(/\s+/g, '');
      const verified = await verifyLicense(cfg.publicPem, clean);
      const ok = !!verified;
      const payload = verified || decodePayload(clean);
      let record = null;
      if (ok) {
        const snap = await getDocs(query(collection(db, 'licenses'), where('key', '==', clean)));
        record = snap.docs[0] ? { id: snap.docs[0].id, ...snap.docs[0].data() } : null;
      }
      setRes({ ok, payload, record });
    } catch (e) {
      toastError(e);
    } finally {
      setBusy(false);
    }
  };

  const Row = ({ k, v }) => <div className="row" style={{ padding: '8px 0', borderBottom: '1px solid var(--border)' }}><span className="muted">{k}</span><span className="grow" /><b>{v}</b></div>;
  return (
    <div className="col" style={{ gap: 16, maxWidth: 720 }}>
      <PageHead title="Verify a key" sub="A customer reads out or sends a license key — check that it is genuine, without needing their computer." />
      <div className="card card-pad col">
        <textarea className="textarea mono" rows={4} value={key} onChange={(e) => setKey(e.target.value)} placeholder="Paste the RPOS1.… key here" style={{ fontSize: 12 }} />
        <div><Button variant="primary" icon={Search} onClick={check} loading={busy} disabled={!key.trim()}>Verify</Button></div>
      </div>
      {res && (
        <div className="card card-pad col">
          <div className="row">{res.ok ? <BadgeCheck color="var(--success)" size={30} /> : <ShieldX color="var(--danger)" size={30} />}<b style={{ fontSize: 17 }}>{res.ok ? 'Genuine license key' : 'Invalid — this key was not issued by you or was changed'}</b></div>
          {res.ok && res.payload && (
            <>
              <Row k="Business" v={<bdi>{res.payload.bn}</bdi>} />
              <Row k="Plan" v={res.payload.plan} />
              <Row k="Issued" v={fmtDate(res.payload.iat)} />
              <Row k="Expires" v={res.payload.exp ? fmtDate(res.payload.exp) : 'Lifetime'} />
              <Row k="Computers" v={res.payload.mid === '*' ? `up to ${res.payload.md || 1} (registered online)` : `locked to ${res.payload.mid}`} />
              <Row k="Users" v={res.payload.mu || 'Unlimited'} />
              <Row k="In your registry" v={res.record ? <span className="row" style={{ gap: 6 }}><KeyRound size={14} /> {res.record.businessName} <Badge color={licenseState(res.record).color}>{licenseState(res.record).label}</Badge></span> : 'Not found (issued from another system, or the record was deleted)'} />
            </>
          )}
        </div>
      )}
    </div>
  );
}
