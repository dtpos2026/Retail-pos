import { useEffect, useMemo, useRef, useState } from 'react';
import { Receipt, Plus, Pencil, Trash2, Printer, Settings2, Eye, Wallet, CircleDollarSign, Clock3, ImagePlus, X } from 'lucide-react';
import { useAdmin } from '../context';
import { watch } from '../lib/data';
import { watchInvoices, getProfile, saveProfile, saveInvoice, deleteInvoice, invoiceTotal, nextInvoiceNo, DEFAULT_PROFILE } from '../lib/billing';
import { invoiceHtml, printHtml } from '../lib/invoiceHtml';
import { PageHead, Button, Stat, SearchBox, Seg, Loading, Empty, Badge, Modal, Field, Input, NumberInput, Select } from '../components/ui';
import { money, fmtDate } from '../lib/format';

const today = () => new Date().toISOString().slice(0, 10);
const METHODS = ['Cash', 'Bank transfer', 'JazzCash', 'EasyPaisa', 'Cheque', 'Other'];

function shrink(file, max = 360) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onerror = () => reject(new Error('Could not read the image.'));
    r.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('This image could not be opened.'));
      img.onload = () => {
        const s = Math.min(1, max / Math.max(img.width, img.height));
        const c = document.createElement('canvas');
        c.width = Math.round(img.width * s);
        c.height = Math.round(img.height * s);
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
        resolve(c.toDataURL('image/png'));
      };
      img.src = r.result;
    };
    r.readAsDataURL(file);
  });
}

function ProfileModal({ profile, onClose, onSaved }) {
  const { toast, toastError } = useAdmin();
  const [p, setP] = useState(profile);
  const [busy, setBusy] = useState(false);
  const logo = useRef(null);
  const sig = useRef(null);
  const set = (k) => (e) => setP({ ...p, [k]: e.target ? e.target.value : e });
  const pick = (k) => async (e) => {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f) return;
    try {
      setP({ ...p, [k]: await shrink(f) });
    } catch (err) {
      toastError(err);
    }
  };
  const save = async () => {
    setBusy(true);
    try {
      await saveProfile(p);
      toast('Invoice settings saved');
      onSaved(p);
      onClose();
    } catch (e) {
      toastError(e);
      setBusy(false);
    }
  };
  return (
    <Modal title="Invoice settings" icon={Settings2} size="lg" onClose={onClose} footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" onClick={save} loading={busy}>Save</Button></>}>
      <div className="form-grid">
        <Field label="Business name"><Input value={p.name} onChange={set('name')} /></Field>
        <Field label="Tagline"><Input value={p.tagline} onChange={set('tagline')} /></Field>
        <Field label="Phone"><Input value={p.phone} onChange={set('phone')} /></Field>
        <Field label="WhatsApp"><Input value={p.whatsapp} onChange={set('whatsapp')} /></Field>
        <Field label="Email"><Input value={p.email} onChange={set('email')} /></Field>
        <Field label="Website"><Input value={p.website} onChange={set('website')} /></Field>
        <Field label="Address" className="full"><Input value={p.address} onChange={set('address')} /></Field>
        <Field label="Signatory name"><Input value={p.signatory} onChange={set('signatory')} /></Field>
        <Field label="Invoice prefix" hint="e.g. DT → DT-2026-0001"><Input value={p.prefix} onChange={set('prefix')} /></Field>
        <Field label="Currency"><Input value={p.currency} onChange={set('currency')} /></Field>
        <Field label="Verification page URL" hint="Empty = this panel's address. The invoice QR opens  URL?verify=CODE"><Input value={p.verifyBase} onChange={set('verifyBase')} placeholder="https://your-app.web.app/" /></Field>
        <Field label="Footer note" className="full"><Input value={p.footer} onChange={set('footer')} /></Field>
        {[['logo', 'Logo', logo], ['signature', 'Signature', sig]].map(([k, label, ref]) => (
          <div key={k} className="col" style={{ gap: 6 }}>
            <div className="label">{label}</div>
            <div className="row">
              <div className="thumb" style={{ width: 120, height: 60, borderRadius: 10, background: 'var(--surface-3)', cursor: 'pointer' }} onClick={() => ref.current?.click()}>
                {p[k] ? <img src={p[k]} alt="" style={{ maxWidth: '100%', maxHeight: '100%' }} /> : <ImagePlus size={22} color="var(--text-3)" />}
              </div>
              {p[k] && <Button size="sm" variant="danger-ghost" icon={X} onClick={() => setP({ ...p, [k]: '' })}>Remove</Button>}
              <input ref={ref} type="file" accept="image/png,image/jpeg" hidden onChange={pick(k)} />
            </div>
          </div>
        ))}
      </div>
    </Modal>
  );
}

function InvoiceForm({ invoice, invoices, clients, licenses, profile, onClose, onSaved }) {
  const { toast, toastError } = useAdmin();
  const [f, setF] = useState(() => invoice || {
    invoiceNo: nextInvoiceNo(invoices, profile.prefix),
    date: today(),
    customer: { restaurant: '', owner: '', address: '', phone: '', whatsapp: '', licenseKey: '', licenseRef: '' },
    pkg: '', description: '', amount: '', extras: [], discount: '', paid: '', paymentDate: '', paymentMethod: 'Cash', notes: '',
  });
  const [busy, setBusy] = useState(false);
  const setC = (k) => (e) => setF({ ...f, customer: { ...f.customer, [k]: e.target.value } });
  const total = invoiceTotal(f);

  const pickLicense = (id) => {
    const l = licenses.find((x) => x.id === id);
    if (!l) return;
    const c = clients.find((x) => x.id === l.clientId) || {};
    setF({
      ...f,
      customer: { ...f.customer, restaurant: l.businessName, owner: c.ownerName || '', phone: l.clientPhone || c.phone || '', whatsapp: c.phone || '', address: c.address || '', licenseKey: l.key, licenseRef: l.id },
      pkg: l.plan, description: `${String(l.plan).replace('_', ' ')} license${l.expiresAt ? ` until ${l.expiresAt}` : ' (lifetime)'}`, amount: f.amount || l.price || '',
    });
  };
  const save = async () => {
    setBusy(true);
    try {
      let licenseStatus = 'unknown';
      const l = licenses.find((x) => x.id === f.customer.licenseRef);
      if (l) licenseStatus = l.status;
      await saveInvoice({ ...f, amount: Number(f.amount) || 0, discount: Number(f.discount) || 0, paid: Number(f.paid) || 0 }, profile, invoices, licenseStatus);
      toast('Invoice saved');
      onSaved();
      onClose();
    } catch (e) {
      toastError(e);
      setBusy(false);
    }
  };
  return (
    <Modal title={invoice ? `Edit ${invoice.invoiceNo}` : 'New invoice'} icon={Receipt} size="lg" onClose={onClose} footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" onClick={save} loading={busy}>Save invoice</Button></>}>
      <div className="col" style={{ gap: 14 }}>
        <Field label="Pick a license (fills the customer details)">
          <Select value={f.customer.licenseRef || ''} onChange={(e) => pickLicense(e.target.value)} options={[{ value: '', label: '— type the customer manually —' }, ...licenses.map((l) => ({ value: l.id, label: `${l.businessName} · ${l.plan}` }))]} />
        </Field>
        <div className="form-grid">
          <Field label="Invoice no."><Input value={f.invoiceNo} onChange={(e) => setF({ ...f, invoiceNo: e.target.value })} /></Field>
          <Field label="Date"><Input type="date" value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} /></Field>
          <Field label="Restaurant / customer *"><Input value={f.customer.restaurant} onChange={setC('restaurant')} /></Field>
          <Field label="Owner"><Input value={f.customer.owner} onChange={setC('owner')} /></Field>
          <Field label="Phone"><Input value={f.customer.phone} onChange={setC('phone')} /></Field>
          <Field label="Address"><Input value={f.customer.address} onChange={setC('address')} /></Field>
          <Field label="Package / plan"><Input value={f.pkg} onChange={(e) => setF({ ...f, pkg: e.target.value })} placeholder="e.g. yearly" /></Field>
          <Field label="Description"><Input value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} /></Field>
          <Field label="Amount"><NumberInput value={f.amount} onChange={(v) => setF({ ...f, amount: v })} /></Field>
          <Field label="Discount"><NumberInput value={f.discount} onChange={(v) => setF({ ...f, discount: v })} /></Field>
        </div>
        <div className="col" style={{ gap: 6 }}>
          <div className="row"><div className="label grow">Extra charges (installation, training, hardware…)</div><Button size="sm" icon={Plus} onClick={() => setF({ ...f, extras: [...(f.extras || []), { label: '', amount: '' }] })}>Add</Button></div>
          {(f.extras || []).map((x, i) => (
            <div key={i} className="row">
              <Input placeholder="Label" value={x.label} onChange={(e) => setF({ ...f, extras: f.extras.map((y, j) => (j === i ? { ...y, label: e.target.value } : y)) })} />
              <NumberInput style={{ maxWidth: 140 }} value={x.amount} onChange={(v) => setF({ ...f, extras: f.extras.map((y, j) => (j === i ? { ...y, amount: v } : y)) })} />
              <Button size="sm" variant="danger-ghost" icon={Trash2} onClick={() => setF({ ...f, extras: f.extras.filter((_, j) => j !== i) })} />
            </div>
          ))}
        </div>
        <div className="form-grid">
          <Field label="Paid so far"><NumberInput value={f.paid} onChange={(v) => setF({ ...f, paid: v })} /></Field>
          <Field label="Payment date"><Input type="date" value={f.paymentDate} onChange={(e) => setF({ ...f, paymentDate: e.target.value })} /></Field>
          <Field label="Payment method"><Select value={f.paymentMethod} onChange={(e) => setF({ ...f, paymentMethod: e.target.value })} options={METHODS.map((m) => ({ value: m, label: m }))} /></Field>
          <Field label="Notes"><Input value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} /></Field>
        </div>
        <div className="card card-pad row" style={{ background: 'var(--primary-50)', borderColor: 'transparent' }}>
          <b className="grow">Total</b><b style={{ fontSize: 20 }}>{profile.currency} {total.toLocaleString('en-PK')}</b>
          <span className="muted">Balance {profile.currency} {Math.max(0, total - (Number(f.paid) || 0)).toLocaleString('en-PK')}</span>
        </div>
      </div>
    </Modal>
  );
}

function PreviewModal({ invoice, profile, onClose }) {
  const [format, setFormat] = useState('a4');
  const [html, setHtml] = useState('');
  useEffect(() => {
    invoiceHtml(invoice, profile, format).then(setHtml);
  }, [invoice, profile, format]);
  return (
    <Modal title={`Invoice ${invoice.invoiceNo}`} icon={Eye} size="lg" onClose={onClose} footer={<><Seg value={format} onChange={setFormat} options={[{ value: 'a4', label: 'A4' }, { value: '80mm', label: '80 mm' }]} /><div className="grow" /><Button onClick={onClose}>Close</Button><Button variant="primary" icon={Printer} onClick={() => printHtml(html)} disabled={!html}>Print / Save PDF</Button></>}>
      <iframe title="Invoice preview" srcDoc={html} style={{ width: '100%', height: 520, border: '1px solid var(--border)', borderRadius: 12, background: '#fff' }} />
    </Modal>
  );
}

export default function Billing() {
  const { toastError, toast, confirm } = useAdmin();
  const [invoices, setInvoices] = useState(null);
  const [clients, setClients] = useState([]);
  const [licenses, setLicenses] = useState([]);
  const [profile, setProfile] = useState(DEFAULT_PROFILE);
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState('all');
  const [edit, setEdit] = useState(null);
  const [view, setView] = useState(null);
  const [settings, setSettings] = useState(false);

  useEffect(() => {
    const a = watchInvoices(setInvoices, (e) => { toastError(e); setInvoices([]); });
    const b = watch('clients', setClients, () => {});
    const c = watch('licenses', setLicenses, () => {});
    getProfile().then(setProfile).catch(() => {});
    return () => { a(); b(); c(); };
  }, [toastError]);

  const rows = useMemo(() => {
    const s = q.trim().toLowerCase();
    return (invoices || []).filter((i) => {
      const t = invoiceTotal(i);
      const paid = Number(i.paid) || 0;
      if (filter === 'paid' && !(t > 0 && paid >= t)) return false;
      if (filter === 'unpaid' && paid >= t && t > 0) return false;
      return !s || [i.invoiceNo, i.customer?.restaurant, i.customer?.owner, i.customer?.phone, i.pkg].some((v) => String(v || '').toLowerCase().includes(s));
    });
  }, [invoices, q, filter]);

  if (!invoices) return <Loading />;
  const billed = invoices.reduce((s, i) => s + invoiceTotal(i), 0);
  const paid = invoices.reduce((s, i) => s + Math.min(Number(i.paid) || 0, invoiceTotal(i)), 0);

  const remove = async (i) => {
    if (!(await confirm({ title: `Delete ${i.invoiceNo}?`, message: 'Its verification QR page stops working too.', danger: true, confirmText: 'Delete' }))) return;
    try {
      await deleteInvoice(i);
      toast('Invoice deleted');
    } catch (e) {
      toastError(e);
    }
  };

  return (
    <div className="col" style={{ gap: 16 }}>
      <PageHead title="Billing" sub="Invoices for your clients. Each invoice has a QR that customers can scan to verify it.">
        <Button icon={Settings2} onClick={() => setSettings(true)}>Invoice settings</Button>
        <Button variant="primary" icon={Plus} onClick={() => setEdit({})}>New invoice</Button>
      </PageHead>
      <div className="grid grid-3">
        <Stat hero icon={Wallet} label="Billed" value={money(billed)} hint={`${invoices.length} invoices`} />
        <Stat icon={CircleDollarSign} label="Received" value={money(paid)} color="#16a34a" />
        <Stat icon={Clock3} label="Unpaid" value={money(Math.max(0, billed - paid))} color="#dc2626" />
      </div>
      <div className="card card-pad row wrap">
        <SearchBox value={q} onChange={setQ} placeholder="Search invoice, customer, phone…" style={{ flex: 1, minWidth: 240 }} />
        <Seg value={filter} onChange={setFilter} options={[{ value: 'all', label: 'All' }, { value: 'paid', label: 'Paid' }, { value: 'unpaid', label: 'Unpaid' }]} />
      </div>
      <div className="card">
        {rows.length === 0 ? (
          <Empty icon={Receipt} title="No invoices" text="Create the first invoice for a client." action={<Button variant="primary" icon={Plus} onClick={() => setEdit({})}>New invoice</Button>} />
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>Invoice</th><th>Customer</th><th>Date</th><th>Package</th><th className="num">Total</th><th>Status</th><th /></tr></thead>
              <tbody>
                {rows.map((i) => {
                  const t = invoiceTotal(i);
                  const p = Number(i.paid) || 0;
                  return (
                    <tr key={i.id}>
                      <td className="b">{i.invoiceNo}</td>
                      <td><bdi>{i.customer?.restaurant}</bdi><div className="small faint">{i.customer?.phone}</div></td>
                      <td className="muted nowrap">{fmtDate(i.date)}</td>
                      <td style={{ textTransform: 'capitalize' }}>{i.pkg || '—'}</td>
                      <td className="num b">{money(t)}</td>
                      <td>{t > 0 && p >= t ? <Badge color="green">Paid</Badge> : p > 0 ? <Badge color="amber">Partial · due {money(t - p)}</Badge> : <Badge color="red">Unpaid</Badge>}</td>
                      <td className="right nowrap">
                        <Button size="sm" variant="ghost" icon={Eye} title="Preview / print" onClick={() => setView(i)} />
                        <Button size="sm" variant="ghost" icon={Pencil} title="Edit" onClick={() => setEdit(i)} />
                        <Button size="sm" variant="ghost" icon={Trash2} title="Delete" onClick={() => remove(i)} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
      {edit && <InvoiceForm invoice={edit.id ? edit : null} invoices={invoices} clients={clients} licenses={licenses} profile={profile} onClose={() => setEdit(null)} onSaved={() => {}} />}
      {view && <PreviewModal invoice={view} profile={profile} onClose={() => setView(null)} />}
      {settings && <ProfileModal profile={profile} onClose={() => setSettings(false)} onSaved={setProfile} />}
    </div>
  );
}
