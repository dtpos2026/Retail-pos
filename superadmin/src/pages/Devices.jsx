import { useMemo, useState } from 'react';
import { Monitor, Wifi, ShieldOff, PauseCircle } from 'lucide-react';
import { useAdmin } from '../context';
import { PageHead, Stat, SearchBox, Select, Loading, Empty } from '../components/ui';
import DeviceList from '../components/DeviceList';
import { isOnline } from '../lib/devices';
import { tsToDate } from '../lib/format';

export default function Devices() {
  const { devices } = useAdmin();
  const [q, setQ] = useState('');
  const [state, setState] = useState('');

  const list = useMemo(() => {
    if (!devices) return [];
    const s = q.trim().toLowerCase();
    return devices
      .filter((d) => (!state || (state === 'online' ? isOnline(d) : d.status === state)) && (!s || [d.businessName, d.name, d.machineId, d.os].some((v) => String(v || '').toLowerCase().includes(s))))
      .sort((a, b) => (tsToDate(b.lastSeen) || 0) - (tsToDate(a.lastSeen) || 0));
  }, [devices, q, state]);

  if (!devices) return <Loading />;
  const online = devices.filter(isOnline).length;
  return (
    <div className="col" style={{ gap: 16 }}>
      <PageHead title="Devices" sub="Every computer that registered a license. Block, suspend or remove a device — the POS reacts as soon as it is online." />
      <div className="grid grid-4">
        <Stat hero icon={Monitor} label="Registered devices" value={devices.length} hint="across all licenses" />
        <Stat icon={Wifi} label="Online now" value={online} hint="seen in the last 15 min" color="#16a34a" />
        <Stat icon={PauseCircle} label="Suspended" value={devices.filter((d) => d.status === 'suspended').length} color="#d97706" />
        <Stat icon={ShieldOff} label="Blocked" value={devices.filter((d) => d.status === 'blocked').length} color="#dc2626" />
      </div>
      <div className="card card-pad row wrap">
        <SearchBox value={q} onChange={setQ} placeholder="Search business, computer name, ID…" style={{ flex: 1, minWidth: 240 }} />
        <Select value={state} onChange={(e) => setState(e.target.value)} style={{ width: 180 }} options={[{ value: '', label: 'All devices' }, { value: 'online', label: 'Online now' }, { value: 'active', label: 'Active' }, { value: 'suspended', label: 'Suspended' }, { value: 'blocked', label: 'Blocked' }]} />
      </div>
      <div className="card">
        {list.length === 0 ? <Empty icon={Monitor} title="No devices" text={devices.length ? 'No device matches your filter.' : 'Devices appear here when a client activates a license in Retail POS.'} /> : <DeviceList devices={list} />}
      </div>
    </div>
  );
}
