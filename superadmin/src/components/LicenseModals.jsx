import { useMemo, useState } from 'react';
import { KeyRound, Copy, MessageCircle, CheckCircle2, AlertTriangle } from 'lucide-react';
import { Modal, Button, Field, Input, Select, NumberInput, Check, Badge } from './ui';
import { useAdmin, friendly } from '../context';
import { issueLicense, setLicenseStatus, saveClient } from '../lib/data';
import { PLANS, expiryFor, ymd, MACHINE_ID_RE, normalizeMachineId } from '../lib/license';
import { fmtDate } from '../lib/format';

/**
 * Generate a new license, renew (same license id, new expiry) or transfer
 * (revoke old + issue new for another computer).
 */
export function LicenseForm({ clients, client: fixedClient, license, mode = 'new', onClose, onIssued }) {
  const { toastError } = useAdmin();
  const today = ymd(new Date());
  const renewStart = license?.expiresAt && license.expiresAt > today ? license.expiresAt : today;
  const [f, setF] = useState(() => ({
    clientId: fixedClient?.id || license?.clientId || '__new',
    newName: '',
    newOwner: '',
    newPhone: '',
    machineId: mode === 'transfer' ? '' : license?.machineId === '*' ? '' : license?.machineId || '',
    plan: license?.plan && mode !== 'new' ? license.plan : 'yearly',
    startDate: mode === 'renew' ? renewStart : today,
    expiresAt: expiryFor(license?.plan && mode !== 'new' ? license.plan : 'yearly', mode === 'renew' ? renewStart : today),
    maxUsers: license?.maxUsers ?? 0,
    price: mode === 'renew' ? license?.price || '' : '',
    paid: true,
    notes: '',
    online: mode === 'transfer' ? true : license ? license.machineId === '*' : true, // online device registration (recommended)
    maxDevices: license?.maxDevices || 1,
  }));
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const set = (k) => (v) => setF((x) => ({ ...x, [k]: v }));
  const isNew = mode === 'new' && !fixedClient && f.clientId === '__new';
  const client = fixedClient || clients?.find((c) => c.id === f.clientId) || (license && { id: license.clientId, businessName: license.businessName, phone: license.clientPhone });
  const mid = normalizeMachineId(f.machineId);
  const midOk = f.online || MACHINE_ID_RE.test(mid);

  const setPlan = (plan) => setF((x) => ({ ...x, plan, expiresAt: plan === 'custom' ? x.expiresAt || expiryFor('yearly', x.startDate) : expiryFor(plan, x.startDate) }));
  const setStart = (startDate) => setF((x) => ({ ...x, startDate, expiresAt: x.plan === 'custom' ? x.expiresAt : expiryFor(x.plan, startDate) }));

  const submit = async () => {
    setErr('');
    if (!client && !isNew) return setErr('Select a client.');
    if (isNew && (!f.newName.trim() || !f.newPhone.trim())) return setErr('Enter the restaurant name and phone number.');
    if (!midOk) return setErr('Enter the Computer ID shown on the POS activation screen (format XXXX-XXXX-XXXX-XXXX), or choose online device registration.');
    if (f.plan !== 'lifetime' && !f.expiresAt) return setErr('Select an expiry date.');
    setBusy(true);
    try {
      if (mode === 'transfer') await setLicenseStatus(license, 'revoked');
      let useClient = client;
      if (isNew) {
        const id = await saveClient({ businessName: f.newName, ownerName: f.newOwner, phone: f.newPhone });
        useClient = { id, businessName: f.newName.trim(), phone: f.newPhone.trim() };
      }
      const lic = await issueLicense({
        id: mode === 'renew' ? license.id : undefined,
        client: useClient,
        machineId: f.online ? '*' : mid,
        maxDevices: f.online ? f.maxDevices : 1,
        plan: f.plan,
        startDate: f.startDate,
        expiresAt: f.plan === 'lifetime' ? null : f.expiresAt,
        maxUsers: f.maxUsers,
        price: f.price,
        paid: f.paid,
        notes: f.notes,
      });
      onIssued(lic);
    } catch (e) {
      toastError(e);
      setErr(friendly(e));
    } finally {
      setBusy(false);
    }
  };

  const title = { new: 'Generate License', renew: 'Renew License', transfer: 'Transfer to New Computer' }[mode];
  return (
    <Modal
      title={title}
      icon={KeyRound}
      size="lg"
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" icon={KeyRound} onClick={submit} loading={busy}>{mode === 'renew' ? 'Renew & generate key' : 'Generate license key'}</Button>
        </>
      }
    >
      <div className="form-grid">
        {fixedClient || mode !== 'new' ? (
          <Field label="Client" className="full"><Input value={client?.businessName || license?.businessName || ''} disabled /></Field>
        ) : (
          <Field label="Client" className="full">
            <Select value={f.clientId} onChange={(e) => set('clientId')(e.target.value)} options={[{ value: '__new', label: '+ New restaurant (enter details below)' }, ...(clients || []).map((c) => ({ value: c.id, label: `${c.businessName}${c.city ? ` · ${c.city}` : ''}` }))]} />
          </Field>
        )}
        {isNew && (
          <>
            <Field label="Restaurant / business name *"><Input autoFocus dir="auto" value={f.newName} onChange={(e) => set('newName')(e.target.value)} placeholder="e.g. Al-Madina Restaurant" /></Field>
            <Field label="Owner name"><Input dir="auto" value={f.newOwner} onChange={(e) => set('newOwner')(e.target.value)} /></Field>
            <Field label="Owner phone / WhatsApp *" className="full"><Input value={f.newPhone} onChange={(e) => set('newPhone')(e.target.value)} placeholder="03XX-XXXXXXX" /></Field>
          </>
        )}
        <div className="full seg-radio">
          <div className={`radio-card ${f.online ? 'on' : ''}`} onClick={() => set('online')(true)}>
            <input type="radio" checked={f.online} readOnly style={{ marginTop: 3 }} />
            <div><b>Online device registration <Badge color="green">Recommended</Badge></b>
              <span className="small muted">No Computer ID needed. The client activates once (internet needed once), the computer is registered under this license, and you can block / suspend it live. You decide how many computers may register.</span></div>
          </div>
          <div className={`radio-card ${!f.online ? 'on' : ''}`} onClick={() => set('online')(false)}>
            <input type="radio" checked={!f.online} readOnly style={{ marginTop: 3 }} />
            <div><b>Locked to one Computer ID</b>
              <span className="small muted">Works fully offline on a single computer. Ask the client for the Computer ID shown on the POS activation screen.</span></div>
          </div>
        </div>
        {f.online ? (
          <Field label="Max devices (computers)" hint="1 = one shop computer. Increase later from Devices any time." className="full">
            <NumberInput value={f.maxDevices} onChange={set('maxDevices')} />
          </Field>
        ) : (
          <Field label="Computer ID (from POS activation screen)" className="full" hint={mode === 'transfer' ? `Old computer ${license.machineId} will be revoked.` : 'Format XXXX-XXXX-XXXX-XXXX'}>
            <Input value={f.machineId} onChange={(e) => set('machineId')(e.target.value)} placeholder="XXXX-XXXX-XXXX-XXXX" className="mono" style={{ letterSpacing: 1, fontWeight: 600 }} />
          </Field>
        )}
        <Field label="Plan"><Select value={f.plan} onChange={(e) => setPlan(e.target.value)} options={PLANS.map((p) => ({ value: p.key, label: p.label }))} /></Field>
        <Field label="Max active users" hint="0 = unlimited"><NumberInput value={f.maxUsers} onChange={set('maxUsers')} /></Field>
        <Field label="Start date"><Input type="date" value={f.startDate} onChange={(e) => setStart(e.target.value)} /></Field>
        <Field label="Expiry date" hint={f.plan === 'lifetime' ? 'Never expires' : fmtDate(f.expiresAt)}>
          <Input type="date" value={f.plan === 'lifetime' ? '' : f.expiresAt || ''} disabled={f.plan === 'lifetime'} onChange={(e) => setF((x) => ({ ...x, plan: 'custom', expiresAt: e.target.value }))} />
        </Field>
        <Field label="Price (Rs.)"><NumberInput value={f.price} onChange={set('price')} placeholder="0" /></Field>
        <Field label="Payment"><div style={{ paddingTop: 8 }}><Check label="Payment received" checked={f.paid} onChange={set('paid')} /></div></Field>
        <Field label="Notes (internal)" className="full"><Input value={f.notes} onChange={(e) => set('notes')(e.target.value)} placeholder="e.g. Paid via JazzCash, 2nd counter PC" /></Field>
      </div>
      {!midOk && f.machineId && <div className="badge amber mt" style={{ whiteSpace: 'normal', padding: '8px 12px' }}><AlertTriangle size={14} /> Computer ID should look like 1A2B-3C4D-5E6F-7A8B</div>}
      {err && <div className="badge red mt" style={{ whiteSpace: 'normal', padding: '8px 12px' }}>{err}</div>}
    </Modal>
  );
}

export function KeyResult({ license, onClose }) {
  const { toast } = useAdmin();
  const message = useMemo(
    () =>
      `Assalam o Alaikum!\n\nYour Retail POS license for *${license.businessName}* is ready.\n\nPlan: ${license.plan}\nValid until: ${license.expiresAt ? fmtDate(license.expiresAt) : 'Lifetime'}\n${license.machineId === '*' ? `Devices allowed: ${license.maxDevices || 1}` : `Computer ID: ${license.machineId}`}\n\nLicense key (copy all):\n${license.key}\n\nOpen Retail POS → paste the key → Activate License (internet needed once).\nThank you!`,
    [license]
  );
  const copy = (text, what) => {
    navigator.clipboard.writeText(text);
    toast(`${what} copied`);
  };
  return (
    <Modal
      title="License Key Ready"
      icon={CheckCircle2}
      size="lg"
      onClose={onClose}
      footer={
        <>
          <Button icon={MessageCircle} onClick={() => copy(message, 'WhatsApp message')}>Copy WhatsApp message</Button>
          <Button variant="primary" icon={Copy} onClick={() => copy(license.key, 'License key')}>Copy key</Button>
        </>
      }
    >
      <div className="col">
        <div className="kv small">
          <div>Client</div><div className="b">{license.businessName}</div>
          <div>Activation</div><div>{license.machineId === '*' ? `Online registration · up to ${license.maxDevices || 1} device(s)` : <span className="mono">Locked to {license.machineId}</span>}</div>
          <div>Plan</div><div style={{ textTransform: 'capitalize' }}>{license.plan}</div>
          <div>Expires</div><div>{license.expiresAt ? fmtDate(license.expiresAt) : 'Never (lifetime)'}</div>
          <div>Max users</div><div>{license.maxUsers || 'Unlimited'}</div>
        </div>
        <div className="key-box">{license.key}</div>
        <div className="small faint">The client pastes this key in Retail POS → Activate License. It works fully offline. If the POS is online, renewals and revocations are picked up automatically.</div>
      </div>
    </Modal>
  );
}
