import { useMemo, useState } from 'react';
import { KeyRound, Copy, MessageCircle, RefreshCw, Eye, EyeOff, CheckCircle2, Clock, AlertTriangle, XCircle } from 'lucide-react';
import { Modal, Button, Field, Input, Select, Check } from './ui';
import { useAdmin } from '../context';
import { createPasswordReset, cancelPasswordReset } from '../lib/data';
import { parseUsers } from '../lib/sales';
import { fmtDateTime } from '../lib/format';

// no look-alike characters (0/O, 1/l/I) so the password can be read out over the phone
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
export function randomPassword(n = 8) {
  const bytes = crypto.getRandomValues(new Uint8Array(n));
  return [...bytes].map((b) => ALPHABET[b % ALPHABET.length]).join('');
}

/** Status of the reset prepared for a device (pending / applied / failed), shown in the list and in this window. */
export function ResetBadge({ reset }) {
  if (!reset) return null;
  if (reset.status === 'pending') return <span className="badge amber" title={`for "${reset.username}", prepared ${fmtDateTime(reset.createdAt)}`}><Clock size={12} /> Reset waiting for the POS</span>;
  if (reset.status === 'applied') return <span className="badge green" title={fmtDateTime(reset.appliedAt)}><CheckCircle2 size={12} /> Password reset done</span>;
  return <span className="badge red" title={reset.note || ''}><AlertTriangle size={12} /> Reset {reset.status}</span>;
}

/**
 * Set a new password for a user of a restaurant's POS. The POS is offline software, so the reset travels through
 * the server: it is applied the next time that POS is online, then the client signs in with the new password.
 * Give it either a `device` or a `license` (then the computer is chosen inside).
 */
export default function ResetPasswordModal({ device: fixedDevice, license, onClose }) {
  const { devices, resets, toast, toastError, confirm } = useAdmin();
  const candidates = useMemo(() => (fixedDevice ? [fixedDevice] : (devices || []).filter((d) => d.licenseId === license?.id)), [devices, fixedDevice, license]);
  const [devId, setDevId] = useState(candidates[0]?.id || '');
  const device = (devices || []).find((d) => d.id === devId) || candidates.find((d) => d.id === devId) || null;
  const users = useMemo(() => parseUsers(device?.posUsers), [device]);
  const [user, setUser] = useState('');
  const [other, setOther] = useState('');
  const [password, setPassword] = useState(() => randomPassword());
  const [show, setShow] = useState(true);
  const [pin, setPin] = useState('');
  const [removePin, setRemovePin] = useState(false);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(null);
  const username = (users.length && user !== '__other' ? user || users[0]?.username : other).trim();
  const reset = device ? resets[device.id] : null;
  const title = fixedDevice?.businessName || license?.businessName || 'Restaurant';

  const message = (d) => `*${d.businessName} — DT Retail POS*\nUser: ${d.username}\nNaya password: ${d.password}${d.pin ? `\nNaya PIN: ${d.pin}` : ''}\n\n1) Computer ko internet se jorein.\n2) Login screen par "Forgot password or PIN?" dabayein, phir "Check for new password".\n3) Naye password se sign in karein aur Users mein apna password badal lein.\n(Yeh reset ${d.days} din tak chalta hai.)`;

  const save = async () => {
    if (!device) return;
    setBusy(true);
    try {
      await createPasswordReset(device, { username, password, pin, removePin });
      setDone({ businessName: device.businessName, username: username.toLowerCase(), password, pin, days: 7 });
      toast('Password reset prepared');
    } catch (e) {
      toastError(e);
    } finally {
      setBusy(false);
    }
  };

  const cancel = async () => {
    if (!(await confirm({ title: 'Cancel this reset?', message: 'The new password will not be applied.', confirmText: 'Cancel reset', danger: true }))) return;
    try {
      await cancelPasswordReset(device);
      toast('Reset cancelled');
    } catch (e) {
      toastError(e);
    }
  };

  const copy = (text, what) => navigator.clipboard.writeText(text).then(() => toast(`${what} copied`)).catch(toastError);

  if (done) {
    return (
      <Modal title={`Reset ready — ${title}`} icon={CheckCircle2} size="md" onClose={onClose} footer={<Button variant="primary" onClick={onClose}>Done</Button>}>
        <div className="col" style={{ gap: 12 }}>
          <div className="badge green" style={{ whiteSpace: 'normal', padding: '10px 12px', display: 'block', lineHeight: 1.5 }}>
            Saved. The restaurant's POS applies it as soon as it is online (about a minute) or when the client presses <b>Check for new password</b> on the login screen. This is the only time the password is shown — it is not stored in readable form.
          </div>
          <div className="card card-pad col" style={{ gap: 6 }}>
            <div>User: <b className="mono">{done.username}</b></div>
            <div>New password: <b className="mono" style={{ fontSize: 18 }}>{done.password}</b></div>
            {done.pin && <div>New PIN: <b className="mono">{done.pin}</b></div>}
          </div>
          <div className="row wrap">
            <Button icon={Copy} onClick={() => copy(done.password, 'Password')}>Copy password</Button>
            <Button variant="primary" icon={MessageCircle} onClick={() => copy(message(done), 'Message')}>Copy message for the client</Button>
          </div>
        </div>
      </Modal>
    );
  }

  return (
    <Modal
      title={`Reset password — ${title}`}
      icon={KeyRound}
      size="md"
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>Close</Button>
          <Button variant="primary" icon={KeyRound} loading={busy} disabled={!device || !username || password.length < 4} onClick={save}>{reset?.status === 'pending' ? 'Replace the waiting reset' : 'Reset password'}</Button>
        </>
      }
    >
      {candidates.length === 0 ? (
        <div className="badge amber" style={{ whiteSpace: 'normal', padding: '10px 12px', display: 'block' }}>No computer has registered with this license yet, so there is nothing to reset.</div>
      ) : (
        <div className="col" style={{ gap: 12 }}>
          <div className="small muted">The POS is offline software, so the client cannot reset a forgotten password. Set a new one here: it is applied automatically the next time that computer is online.</div>
          {candidates.length > 1 && (
            <Field label="Computer">
              <Select value={devId} onChange={(e) => setDevId(e.target.value)} options={candidates.map((d) => ({ value: d.id, label: `${d.name || 'Computer'} · ${d.machineId}` }))} />
            </Field>
          )}
          {device && (
            <div className="row small faint" style={{ gap: 8 }}>
              <span>{device.name} · <span className="mono">{device.machineId}</span></span>
              <ResetBadge reset={reset} />
              {reset?.status === 'pending' && <Button size="sm" variant="danger-ghost" icon={XCircle} onClick={cancel}>Cancel</Button>}
            </div>
          )}
          {reset && reset.status !== 'pending' && reset.note && <div className="small muted">Last reset ({reset.username}): {reset.note}</div>}
          <Field label="User" hint={users.length ? 'Users on that computer (reported by the POS).' : 'The POS has not reported its user list yet — type the user name (usually "admin").'}>
            {users.length ? (
              <Select value={user === '__other' ? '__other' : user || users[0].username} onChange={(e) => setUser(e.target.value)} options={[...users.map((u) => ({ value: u.username, label: `${u.name} (${u.username}) — ${u.role}` })), { value: '__other', label: 'Another user name…' }]} />
            ) : null}
            {(!users.length || user === '__other') && <Input value={other} onChange={(e) => setOther(e.target.value)} placeholder="admin" style={{ marginTop: users.length ? 8 : 0 }} />}
          </Field>
          <Field label="New password" hint="At least 4 characters. Tell it to the client; the POS asks them to change it in Users.">
            <div className="row" style={{ gap: 6 }}>
              <Input type={show ? 'text' : 'password'} value={password} onChange={(e) => setPassword(e.target.value)} className="mono" style={{ flex: 1 }} />
              <Button icon={show ? EyeOff : Eye} onClick={() => setShow((v) => !v)} title={show ? 'Hide' : 'Show'} />
              <Button icon={RefreshCw} onClick={() => setPassword(randomPassword())} title="Generate a new one">Generate</Button>
            </div>
          </Field>
          <div className="row" style={{ gap: 12, alignItems: 'flex-end' }}>
            <Field label="New PIN (optional)" hint="4 digits, for the quick PIN login." className="grow">
              <Input value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 4))} placeholder="leave empty to keep the old PIN" className="mono" />
            </Field>
            <Check label="Remove PIN login" checked={removePin && !pin} onChange={setRemovePin} />
          </div>
          <div className="small faint">The reset is valid for 7 days. Only a scrambled (PBKDF2) copy of the password is sent to the server; it is wiped after the POS applies it.</div>
        </div>
      )}
    </Modal>
  );
}
