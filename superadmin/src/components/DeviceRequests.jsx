import { ShieldQuestion, Check, X } from 'lucide-react';
import { useAdmin } from '../context';
import { approveRequest, rejectRequest } from '../lib/data';
import { Button } from './ui';
import { ago } from '../lib/devices';

/** Computers that tried to use a full license. The admin decides. */
export default function DeviceRequests() {
  const { requests, toast, toastError, confirm } = useAdmin();
  if (!requests.length) return null;
  const approve = async (r) => {
    if (!(await confirm({ title: `Approve ${r.name || 'this computer'}?`, message: `${r.businessName} (${r.ownerName || 'owner'}, ${r.ownerPhone || 'no phone'}) will be allowed to use the license on this extra computer. The device limit grows by one if needed.`, confirmText: 'Approve' }))) return;
    try {
      await approveRequest(r);
      toast('Device approved');
    } catch (e) {
      toastError(e);
    }
  };
  const reject = async (r) => {
    try {
      await rejectRequest(r);
      toast('Request rejected');
    } catch (e) {
      toastError(e);
    }
  };
  return (
    <div className="card" style={{ borderColor: 'var(--warning)' }}>
      <div className="card-head" style={{ background: 'var(--warning-50)' }}><ShieldQuestion size={18} color="var(--warning)" /><h3>Device approval needed ({requests.length})</h3></div>
      {requests.map((r) => (
        <div key={r.id} className="list-item">
          <div className="grow" style={{ minWidth: 0 }}>
            <div className="b"><bdi>{r.businessName}</bdi> <span className="muted small">· {r.ownerName} {r.ownerPhone}</span></div>
            <div className="small faint">New computer {r.name} ({r.os}) · v{r.appVersion} · asked {ago(r.createdAt)} · this license is already at its device limit</div>
          </div>
          <Button size="sm" variant="primary" icon={Check} onClick={() => approve(r)}>Approve</Button>
          <Button size="sm" variant="danger-ghost" icon={X} onClick={() => reject(r)}>Reject</Button>
        </div>
      ))}
    </div>
  );
}
