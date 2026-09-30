import { useState } from 'react';
import { Monitor, Ban, ShieldCheck, PauseCircle, PlayCircle, Trash2 } from 'lucide-react';
import { Button, Badge } from './ui';
import { useAdmin } from '../context';
import { setDeviceStatus, removeDevice } from '../lib/data';
import { fmtDateTime } from '../lib/format';
import { isOnline, ago, DEVICE_STATUS } from '../lib/devices';

/** One row per registered computer with live status and admin actions (block / unblock / suspend / activate / remove). */
export default function DeviceList({ devices, showBusiness = true, empty = 'No devices registered yet.' }) {
  const { toast, toastError, confirm } = useAdmin();
  const [busy, setBusy] = useState('');

  const setStatus = async (d, status) => {
    const text = {
      blocked: ['Block this device?', 'The POS on this computer stops working as soon as it is online. Sales data on the computer is not touched.', 'Block'],
      suspended: ['Suspend this device?', 'It stops working until you activate it again. Use this for e.g. unpaid dues.', 'Suspend'],
      active: [null],
    }[status];
    if (text[0] && !(await confirm({ title: text[0], message: text[1], danger: status === 'blocked', confirmText: text[2] }))) return;
    setBusy(d.id);
    try {
      await setDeviceStatus(d, status);
      toast(status === 'active' ? 'Device is active' : `Device ${status}`);
    } catch (e) {
      toastError(e);
    } finally {
      setBusy('');
    }
  };

  const remove = async (d) => {
    if (!(await confirm({ title: 'Remove this device?', message: 'Its slot is freed. The POS shows "register this device" and needs internet to register again.', danger: true, confirmText: 'Remove' }))) return;
    setBusy(d.id);
    try {
      await removeDevice(d);
      toast('Device removed');
    } catch (e) {
      toastError(e);
    } finally {
      setBusy('');
    }
  };

  if (!devices.length) return <div className="card-pad muted center" style={{ padding: 30 }}>{empty}</div>;
  return (
    <div>
      {devices.map((d) => {
        const st = DEVICE_STATUS[d.status] || DEVICE_STATUS.active;
        const on = isOnline(d);
        return (
          <div key={d.id} className="dev-card">
            <div className="dev-ic"><Monitor size={22} /></div>
            <div className="grow" style={{ minWidth: 0 }}>
              <div className="row" style={{ gap: 8 }}>
                <span className={`dot ${on ? 'on' : ''}`} title={on ? 'Online now' : 'Offline'} />
                <b className="ellipsis">{showBusiness ? d.businessName : d.name || 'Computer'}</b>
                <Badge color={st.color}>{st.label}</Badge>
              </div>
              <div className="small muted ellipsis">
                {showBusiness && <span>{d.name} · </span>}
                <span className="mono">{d.machineId}</span> · {d.os} · v{d.appVersion}
              </div>
              <div className="small faint">Registered {fmtDateTime(d.firstSeen)} · {on ? <b style={{ color: '#16a34a' }}>online now</b> : `last seen ${ago(d.lastSeen)}`}</div>
            </div>
            <div className="row" style={{ gap: 6, flexShrink: 0 }}>
              {d.status === 'blocked' ? (
                <Button size="sm" variant="soft" icon={ShieldCheck} loading={busy === d.id} onClick={() => setStatus(d, 'active')}>Unblock</Button>
              ) : (
                <>
                  {d.status === 'suspended' ? (
                    <Button size="sm" variant="soft" icon={PlayCircle} loading={busy === d.id} onClick={() => setStatus(d, 'active')}>Activate</Button>
                  ) : (
                    <Button size="sm" icon={PauseCircle} loading={busy === d.id} onClick={() => setStatus(d, 'suspended')}>Suspend</Button>
                  )}
                  <Button size="sm" variant="danger-ghost" icon={Ban} onClick={() => setStatus(d, 'blocked')}>Block</Button>
                </>
              )}
              <Button size="sm" variant="ghost" icon={Trash2} title="Remove device (frees the slot)" onClick={() => remove(d)} />
            </div>
          </div>
        );
      })}
    </div>
  );
}
