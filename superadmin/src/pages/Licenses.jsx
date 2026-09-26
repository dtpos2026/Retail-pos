import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Plus, KeyRound } from 'lucide-react';
import { watch } from '../lib/data';
import { useAdmin } from '../context';
import { licenseState, tsToDate } from '../lib/format';
import { PageHead, Button, SearchBox, Select, Loading, Empty } from '../components/ui';
import LicenseTable from '../components/LicenseTable';
import { LicenseForm, KeyResult } from '../components/LicenseModals';

export default function Licenses() {
  const { toastError } = useAdmin();
  const [params, setParams] = useSearchParams();
  const [licenses, setLicenses] = useState(null);
  const [clients, setClients] = useState([]);
  const [q, setQ] = useState('');
  const [state, setState] = useState('');
  const [gen, setGen] = useState(params.get('new') === '1');
  const [result, setResult] = useState(null);

  useEffect(() => {
    const a = watch('licenses', setLicenses, toastError);
    const b = watch('clients', setClients, toastError);
    return () => {
      a();
      b();
    };
  }, [toastError]);

  const list = useMemo(() => {
    if (!licenses) return [];
    const s = q.trim().toLowerCase();
    return licenses
      .filter((l) => (!state || licenseState(l).key === state) && (!s || [l.businessName, l.machineId, l.clientPhone, l.plan, l.id].some((v) => String(v || '').toLowerCase().includes(s))))
      .sort((a, b) => (tsToDate(b.createdAt) || 0) - (tsToDate(a.createdAt) || 0));
  }, [licenses, q, state]);

  const close = () => {
    setGen(false);
    if (params.get('new')) setParams({}, { replace: true });
  };

  if (!licenses) return <Loading />;
  return (
    <div className="col" style={{ gap: 16 }}>
      <PageHead title="Licenses" sub={`${licenses.length} issued`}>
        <Button variant="primary" icon={Plus} onClick={() => setGen(true)} disabled={!clients.length}>Generate license</Button>
      </PageHead>
      <div className="card card-pad row wrap">
        <SearchBox value={q} onChange={setQ} placeholder="Search business, computer ID, phone…" style={{ flex: 1, minWidth: 240 }} />
        <Select value={state} onChange={(e) => setState(e.target.value)} style={{ width: 190 }} options={[
          { value: '', label: 'All licenses' }, { value: 'active', label: 'Active' }, { value: 'expiring', label: 'Expiring soon' },
          { value: 'expired', label: 'Expired' }, { value: 'suspended', label: 'Suspended' }, { value: 'revoked', label: 'Revoked' },
        ]} />
      </div>
      <div className="card">
        {list.length === 0 ? <Empty icon={KeyRound} title="No licenses" text={clients.length ? 'Generate a license for a client.' : 'Add a client first.'} /> : <LicenseTable licenses={list} />}
      </div>
      {gen && <LicenseForm clients={clients} onClose={close} onIssued={(lic) => { close(); setResult(lic); }} />}
      {result && <KeyResult license={result} onClose={() => setResult(null)} />}
    </div>
  );
}
