import { useState } from 'react';
import { Monitor, Save } from 'lucide-react';
import { Modal, Button, NumberInput, Field } from './ui';
import DeviceList from './DeviceList';
import { useAdmin } from '../context';
import { setMaxDevices } from '../lib/data';

/** Devices of one license + how many computers it may use. */
export default function DevicesModal({ license, onClose }) {
  const { devices, toast, toastError } = useAdmin();
  const [max, setMax] = useState(license.maxDevices || 1);
  const [busy, setBusy] = useState(false);
  const list = (devices || []).filter((d) => d.licenseId === license.id);
  const locked = license.machineId !== '*';

  const save = async () => {
    setBusy(true);
    try {
      await setMaxDevices(license, max);
      toast(`Device limit set to ${max}`);
    } catch (e) {
      toastError(e);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal title={`Devices — ${license.businessName}`} icon={Monitor} size="lg" onClose={onClose}>
      {!locked && (
        <div className="row" style={{ alignItems: 'flex-end', marginBottom: 14 }}>
          <Field label="Max devices for this license" hint={`${list.length} registered now. Raise the limit so another computer can register.`} className="grow">
            <NumberInput value={max} onChange={setMax} />
          </Field>
          <Button variant="primary" icon={Save} onClick={save} loading={busy} disabled={Number(max) === (license.maxDevices || 1)}>Save limit</Button>
        </div>
      )}
      {locked && <div className="badge amber" style={{ whiteSpace: 'normal', padding: '8px 12px', marginBottom: 12 }}>This license is locked to Computer ID {license.machineId}. It registers here automatically the first time that computer is online.</div>}
      <div className="card"><DeviceList devices={list} showBusiness={false} empty="No computer has registered with this license yet." /></div>
    </Modal>
  );
}
