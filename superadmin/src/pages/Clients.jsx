import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { Building2, Plus, Pencil, Trash2, Phone, MapPin, Mail, KeyRound, ArrowLeft, Download, Upload, FileSpreadsheet } from 'lucide-react';
import { watch, saveClient, deleteClient, where, exportBackup, importBackup, licensesCsv } from '../lib/data';
import { useAdmin } from '../context';
import { fmtDate, licenseState, tsToDate } from '../lib/format';
import { PageHead, Button, SearchBox, Loading, Empty, Modal, Field, Input, Select, Badge } from '../components/ui';
import LicenseTable from '../components/LicenseTable';
import { LicenseForm, KeyResult } from '../components/LicenseModals';

function download(name, type, content) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([content], { type }));
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}

const TYPES = [
  { value: 'restaurant', label: 'Restaurant / Dhaba' },
  { value: 'fastfood', label: 'Fast Food / Burger Point' },
  { value: 'cafe', label: 'Café / Bakery' },
  { value: 'kiryana', label: 'Kiryana / General Store' },
  { value: 'retail', label: 'Retail Shop' },
  { value: 'other', label: 'Other' },
];

function ClientForm({ client, onClose, onSaved }) {
  const { toast, toastError } = useAdmin();
  const [f, setF] = useState({ businessName: '', ownerName: '', phone: '', email: '', city: '', address: '', businessType: 'restaurant', notes: '', status: 'active', ...client });
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const save = async () => {
    setBusy(true);
    try {
      const id = await saveClient(f);
      toast('Client saved');
      onClose();
      onSaved?.(id);
    } catch (e) {
      toastError(e);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal title={client?.id ? 'Edit Client' : 'Add Client'} icon={Building2} size="lg" onClose={onClose}
      footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" onClick={save} loading={busy}>Save client</Button></>}>
      <div className="form-grid">
        <Field label="Business name *" className="full"><Input autoFocus dir="auto" value={f.businessName} onChange={set('businessName')} /></Field>
        <Field label="Owner name"><Input value={f.ownerName} onChange={set('ownerName')} /></Field>
        <Field label="Phone / WhatsApp *"><Input value={f.phone} onChange={set('phone')} placeholder="03XX-XXXXXXX" /></Field>
        <Field label="Email"><Input type="email" value={f.email} onChange={set('email')} /></Field>
        <Field label="City"><Input value={f.city} onChange={set('city')} placeholder="Lahore" /></Field>
        <Field label="Business type"><Select value={f.businessType} onChange={set('businessType')} options={TYPES} /></Field>
        <Field label="Status"><Select value={f.status} onChange={set('status')} options={[{ value: 'active', label: 'Active' }, { value: 'inactive', label: 'Inactive' }]} /></Field>
        <Field label="Address" className="full"><textarea className="textarea" rows={2} dir="auto" value={f.address} onChange={set('address')} /></Field>
        <Field label="Notes" className="full"><textarea className="textarea" rows={2} value={f.notes} onChange={set('notes')} /></Field>
      </div>
    </Modal>
  );
}

function ClientDetail({ client, onBack }) {
  const { toast, toastError, confirm } = useAdmin();
  const [licenses, setLicenses] = useState(null);
  const [edit, setEdit] = useState(false);
  const [gen, setGen] = useState(false);
  const [result, setResult] = useState(null);

  useEffect(() => watch('licenses', (rows) => setLicenses(rows.sort((a, b) => (tsToDate(b.createdAt) || 0) - (tsToDate(a.createdAt) || 0))), toastError, where('clientId', '==', client.id)), [client.id, toastError]);

  const remove = async () => {
    if (!(await confirm({ title: `Delete ${client.businessName}?`, danger: true, confirmText: 'Delete' }))) return;
    try {
      await deleteClient(client);
      toast('Client deleted');
      onBack();
    } catch (e) {
      toastError(e);
    }
  };

  return (
    <div className="col" style={{ gap: 16 }}>
      <PageHead title={client.businessName} sub={TYPES.find((t) => t.value === client.businessType)?.label}>
        <Button icon={ArrowLeft} onClick={onBack}>All clients</Button>
        <Button icon={Pencil} onClick={() => setEdit(true)}>Edit</Button>
        <Button variant="danger-ghost" icon={Trash2} onClick={remove}>Delete</Button>
        <Button variant="primary" icon={KeyRound} onClick={() => setGen(true)}>Generate license</Button>
      </PageHead>
      <div className="card card-pad grid grid-3">
        <div className="col" style={{ gap: 6 }}>
          <div className="row"><Phone size={16} className="faint" /> {client.phone || '—'}</div>
          <div className="row"><Mail size={16} className="faint" /> {client.email || '—'}</div>
        </div>
        <div className="col" style={{ gap: 6 }}>
          <div className="row"><MapPin size={16} className="faint" /> <span><bdi>{[client.address, client.city].filter(Boolean).join(', ') || '—'}</bdi></span></div>
          <div className="small faint">Owner: {client.ownerName || '—'}</div>
        </div>
        <div className="col" style={{ gap: 6 }}>
          <div><Badge color={client.status === 'inactive' ? 'red' : 'green'}>{client.status === 'inactive' ? 'Inactive' : 'Active'}</Badge></div>
          <div className="small faint">Client since {fmtDate(client.createdAt)}</div>
        </div>
        {client.notes && <div className="small muted" style={{ gridColumn: '1 / -1' }}>{client.notes}</div>}
      </div>
      <div className="card">
        <div className="card-head"><h3>Licenses</h3></div>
        {!licenses ? <Loading /> : <LicenseTable licenses={licenses} showClient={false} />}
      </div>
      {edit && <ClientForm client={client} onClose={() => setEdit(false)} />}
      {gen && <LicenseForm client={client} onClose={() => setGen(false)} onIssued={(lic) => { setGen(false); setResult(lic); }} />}
      {result && <KeyResult license={result} onClose={() => setResult(null)} />}
    </div>
  );
}

export default function Clients() {
  const { toastError, toast } = useAdmin();
  const { id } = useParams();
  const [params, setParams] = useSearchParams();
  const nav = useNavigate();
  const [clients, setClients] = useState(null);
  const [licenses, setLicenses] = useState([]);
  const [q, setQ] = useState('');
  const [adding, setAdding] = useState(params.get('new') === '1');

  useEffect(() => {
    const a = watch('clients', setClients, toastError);
    const b = watch('licenses', setLicenses, toastError);
    return () => {
      a();
      b();
    };
  }, [toastError]);

  const byClient = useMemo(() => {
    const m = {};
    for (const l of licenses) (m[l.clientId] = m[l.clientId] || []).push(l);
    return m;
  }, [licenses]);

  const list = useMemo(() => {
    if (!clients) return [];
    const s = q.trim().toLowerCase();
    return clients
      .filter((c) => !s || [c.businessName, c.ownerName, c.phone, c.city, c.email].some((v) => String(v || '').toLowerCase().includes(s)))
      .sort((a, b) => (tsToDate(b.createdAt) || 0) - (tsToDate(a.createdAt) || 0));
  }, [clients, q]);

  const fileRef = useRef(null);
  const restore = async (e) => {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f) return;
    try {
      const r = await importBackup(JSON.parse(await f.text()));
      toast(`Imported ${r.clients} clients and ${r.licenses} licenses (existing records were kept)`);
    } catch (err) {
      toastError(err);
    }
  };

  if (!clients) return <Loading />;
  const current = id && clients.find((c) => c.id === id);
  if (id && current) return <ClientDetail client={current} onBack={() => nav('/clients')} />;

  return (
    <div className="col" style={{ gap: 16 }}>
      <PageHead title="Clients" sub={`${clients.length} businesses`}>
        <Button icon={FileSpreadsheet} onClick={() => download('licenses.csv', 'text/csv;charset=utf-8', licensesCsv(licenses))}>Export CSV</Button>
        <Button icon={Download} onClick={async () => { try { download(`retail-pos-backup-${new Date().toISOString().slice(0, 10)}.json`, 'application/json', JSON.stringify(await exportBackup(), null, 2)); toast('Backup downloaded'); } catch (e) { toastError(e); } }}>Backup</Button>
        <Button icon={Upload} onClick={() => fileRef.current?.click()}>Import</Button>
        <input ref={fileRef} type="file" accept=".json,application/json" hidden onChange={restore} />
        <Button variant="primary" icon={Plus} onClick={() => setAdding(true)}>Add client</Button>
      </PageHead>
      <div className="card card-pad"><SearchBox value={q} onChange={setQ} placeholder="Search business, owner, phone, city…" /></div>
      <div className="card">
        {list.length === 0 ? (
          <Empty icon={Building2} title={clients.length ? 'No match' : 'No clients yet'} text={clients.length ? 'Try another search.' : 'Add your first client to generate a license.'} />
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>Business</th><th>Phone</th><th className="hide-sm">City</th><th>Licenses</th><th className="hide-sm">Latest expiry</th><th>Status</th></tr></thead>
              <tbody>
                {list.map((c) => {
                  const ls = byClient[c.id] || [];
                  const active = ls.filter((l) => ['active', 'expiring'].includes(licenseState(l).key));
                  const latest = ls.filter((l) => l.status === 'active').sort((a, b) => String(b.expiresAt || '9999').localeCompare(String(a.expiresAt || '9999')))[0];
                  return (
                    <tr key={c.id} className="clickable" onClick={() => nav(`/clients/${c.id}`)}>
                      <td><div className="b"><bdi>{c.businessName}</bdi></div><div className="small faint">{c.ownerName}</div></td>
                      <td>{c.phone}</td>
                      <td className="hide-sm">{c.city || '—'}</td>
                      <td>{ls.length ? <Badge color={active.length ? 'green' : 'red'}>{active.length} active / {ls.length}</Badge> : <Badge>None</Badge>}</td>
                      <td className="hide-sm">{latest ? (latest.expiresAt ? fmtDate(latest.expiresAt) : 'Lifetime') : '—'}</td>
                      <td><Badge color={c.status === 'inactive' ? 'red' : 'green'}>{c.status === 'inactive' ? 'Inactive' : 'Active'}</Badge></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
      {adding && <ClientForm onClose={() => { setAdding(false); if (params.get('new')) setParams({}, { replace: true }); }} onSaved={(newId) => nav(`/clients/${newId}`)} />}
    </div>
  );
}
