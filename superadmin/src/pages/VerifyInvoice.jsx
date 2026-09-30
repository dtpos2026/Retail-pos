import { useEffect, useState } from 'react';
import { ShieldCheck, ShieldAlert, Loader2 } from 'lucide-react';
import { getVerifyRecord } from '../lib/billing';
import { DtMark } from '../components/Brand';

/** Public page opened by an invoice QR (?verify=CODE). No sign-in; shows only masked, non-sensitive fields. */
export default function VerifyInvoice({ code }) {
  const [state, setState] = useState({ s: 'loading' });
  useEffect(() => {
    getVerifyRecord(code)
      .then((r) => setState(r ? { s: 'found', r } : { s: 'missing' }))
      .catch(() => setState({ s: 'error' }));
  }, [code]);
  const r = state.r;
  const Row = ({ k, v }) => (
    <div className="row" style={{ padding: '9px 0', borderBottom: '1px solid var(--border)' }}>
      <span className="muted">{k}</span><span className="grow" /><b style={{ textAlign: 'right' }}>{v}</b>
    </div>
  );
  return (
    <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', background: 'var(--bg)', padding: 18 }}>
      <div className="card card-pad" style={{ width: 'min(480px, 100%)' }}>
        <div className="row" style={{ marginBottom: 14 }}>
          <div className="brand-logo" style={{ width: 40, height: 40 }}><DtMark size={22} /></div>
          <b>Invoice verification</b>
        </div>
        {state.s === 'loading' && <div className="center muted" style={{ padding: 30 }}><Loader2 className="spin" /> Checking…</div>}
        {state.s === 'missing' && <div className="row"><ShieldAlert color="var(--danger)" size={28} /><div><b>Not found</b><div className="muted small">This code does not match any invoice. Check the QR code or contact the issuer.</div></div></div>}
        {state.s === 'error' && <div className="row"><ShieldAlert color="var(--warning)" size={28} /><div><b>Could not check</b><div className="muted small">Please check your internet connection and try again.</div></div></div>}
        {r && (
          <>
            <div className="row" style={{ marginBottom: 8 }}><ShieldCheck color="var(--success)" size={30} /><div><b style={{ fontSize: 17 }}>Genuine invoice</b><div className="muted small">Issued by {r.issuer}</div></div></div>
            <Row k="Invoice" v={r.invoiceNo} />
            <Row k="Date" v={r.date} />
            <Row k="Customer" v={<bdi>{r.restaurant}</bdi>} />
            {r.owner && <Row k="Owner" v={<bdi>{r.owner}</bdi>} />}
            <Row k="License" v={r.licenseMasked} />
            {r.plan && <Row k="Package" v={r.plan} />}
            <Row k="License status" v={r.licenseStatus} />
            <Row k="Total" v={`${r.currency} ${Number(r.total).toLocaleString('en-PK')}`} />
            <Row k="Payment" v={r.paid >= r.total && r.total > 0 ? `Paid${r.paymentDate ? ` on ${r.paymentDate}` : ''}` : r.paid > 0 ? `Partly paid (${r.currency} ${Number(r.paid).toLocaleString('en-PK')})` : 'Unpaid'} />
            {r.issuerContact && <div className="small muted center" style={{ marginTop: 12 }}>{r.issuerContact}</div>}
          </>
        )}
      </div>
    </div>
  );
}
