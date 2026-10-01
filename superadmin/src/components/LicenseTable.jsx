import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Copy, RefreshCw, Ban, PlayCircle, ArrowRightLeft, Trash2, Eye, PauseCircle, Monitor, Hourglass } from 'lucide-react';
import { Button, Badge, Empty } from './ui';
import { useAdmin } from '../context';
import { setLicenseStatus, deleteLicense, ensureCode } from '../lib/data';
import DevicesModal from './DevicesModal';
import { fmtDate, money, licenseState } from '../lib/format';
import { LicenseForm, KeyResult } from './LicenseModals';

export default function LicenseTable({ licenses, showClient = true }) {
  const { toast, toastError, confirm, isHead, devices } = useAdmin();
  const [manage, setManage] = useState(null);
  const count = (id) => (devices || []).filter((d) => d.licenseId === id).length;
  const [form, setForm] = useState(null);
  const [result, setResult] = useState(null);
  const nav = useNavigate();

  const status = async (l, s) => {
    const labels = { revoked: 'Revoke', suspended: 'Suspend', active: 'Reactivate', pending: 'Mark payment pending for' };
    const ok = await confirm({
      title: `${labels[s]} ${s === 'pending' ? '' : 'license for '}${l.businessName}?`,
      message: s === 'active' ? 'The POS will work again after its next online check (or re-activation with the key).' : 'The POS stops working the next time it is online. An offline POS keeps working until it connects or the license expires. You can add a message the shop will see.',
      danger: s !== 'active',
      confirmText: labels[s].replace(' for', ''),
      input: s === 'active' ? undefined : 'Message shown to the shop (optional)',
    });
    if (ok === false) return;
    try {
      await setLicenseStatus(l, s, typeof ok === 'string' ? ok : '');
      toast('License updated');
    } catch (e) {
      toastError(e);
    }
  };

  const remove = async (l) => {
    if (!(await confirm({ title: 'Delete this license record?', message: 'It will be revoked and removed from the list.', danger: true, confirmText: 'Delete' }))) return;
    try {
      await deleteLicense(l);
      toast('License deleted');
    } catch (e) {
      toastError(e);
    }
  };

  if (!licenses.length) return <Empty title="No licenses" text="Generate a license key for this client's computer." />;

  return (
    <>
      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              {showClient && <th>Client</th>}
              <th>Devices</th><th>Plan</th><th>Expires</th><th className="num">Users</th><th className="num">Price</th><th>Status</th><th />
            </tr>
          </thead>
          <tbody>
            {licenses.map((l) => {
              const st = licenseState(l);
              return (
                <tr key={l.id}>
                  {showClient && (
                    <td><a href={`#/clients/${l.clientId}`} className="b" style={{ color: 'var(--text)', textDecoration: 'none' }} onClick={(e) => { e.preventDefault(); nav(`/clients/${l.clientId}`); }}>{l.businessName}</a><div className="small faint">{l.clientPhone}</div></td>
                  )}
                  <td>
                    <Button size="sm" variant="soft" icon={Monitor} onClick={() => setManage(l)} title="Manage devices of this license">
                      {count(l.id)} / {l.machineId === '*' ? l.maxDevices || 1 : 1}
                    </Button>
                    {l.machineId !== '*' && <div className="small mono faint" style={{ marginTop: 3 }}>{l.machineId}</div>}
                  </td>
                  <td style={{ textTransform: 'capitalize' }}>{String(l.plan).replace('_', ' ')}</td>
                  <td className="nowrap">{l.expiresAt ? fmtDate(l.expiresAt) : 'Lifetime'}</td>
                  <td className="num">{l.maxUsers || '∞'}</td>
                  <td className="num">{l.price ? money(l.price) : '—'}{l.price > 0 && !l.paid && <div><Badge color="red">Unpaid</Badge></div>}</td>
                  <td><Badge color={st.color}>{st.label}</Badge></td>
                  <td className="right nowrap">
                    <Button size="sm" variant="ghost" icon={Eye} title="Show key" onClick={() => setResult(l)} />
                    <Button size="sm" variant="ghost" icon={Copy} title="Copy key" onClick={async () => { try { navigator.clipboard.writeText(l.code || (await ensureCode(l))); toast('License key copied'); } catch (e) { toastError(e); } }} />
                    {l.status !== 'revoked' && <Button size="sm" variant="ghost" icon={RefreshCw} title="Renew / extend" onClick={() => setForm({ mode: 'renew', license: l })} />}
                    {l.status !== 'revoked' && <Button size="sm" variant="ghost" icon={ArrowRightLeft} title="Transfer to new computer" onClick={() => setForm({ mode: 'transfer', license: l })} />}
                    {l.status === 'active' && <Button size="sm" variant="ghost" icon={PauseCircle} title="Suspend" onClick={() => status(l, 'suspended')} />}
                    {l.status === 'active' && <Button size="sm" variant="ghost" icon={Hourglass} title="Payment pending (blocks the POS)" onClick={() => status(l, 'pending')} />}
                    {l.status === 'active' && <Button size="sm" variant="ghost" icon={Ban} title="Revoke" onClick={() => status(l, 'revoked')} />}
                    {l.status !== 'active' && <Button size="sm" variant="ghost" icon={PlayCircle} title="Reactivate" onClick={() => status(l, 'active')} />}
                    {isHead && l.status === 'revoked' && <Button size="sm" variant="ghost" icon={Trash2} title="Delete" onClick={() => remove(l)} />}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {form && (
        <LicenseForm
          mode={form.mode}
          license={form.license}
          onClose={() => setForm(null)}
          onIssued={(lic) => { setForm(null); setResult(lic); toast(form.mode === 'renew' ? 'License renewed' : 'License transferred'); }}
        />
      )}
      {result && <KeyResult license={result} onClose={() => setResult(null)} />}
      {manage && <DevicesModal license={manage} onClose={() => setManage(null)} />}
    </>
  );
}
