import { useEffect, useState } from 'react';
import { ShieldCheck, Plus, Trash2, Crown } from 'lucide-react';
import { watch, saveAdmin, removeAdmin } from '../lib/data';
import { HEAD_ADMIN_EMAIL } from '../firebase';
import { useAdmin } from '../context';
import { fmtDate } from '../lib/format';
import { PageHead, Button, Loading, Modal, Field, Input, Badge, Switch } from '../components/ui';

export default function Admins() {
  const { toast, toastError, confirm } = useAdmin();
  const [rows, setRows] = useState(null);
  const [edit, setEdit] = useState(null);

  useEffect(() => watch('admins', setRows, toastError), [toastError]);

  const save = async () => {
    try {
      await saveAdmin(edit);
      toast('Admin saved');
      setEdit(null);
    } catch (e) {
      toastError(e);
    }
  };
  const toggle = async (a, active) => {
    try {
      await saveAdmin({ ...a, active });
    } catch (e) {
      toastError(e);
    }
  };
  const remove = async (a) => {
    if (!(await confirm({ title: `Remove ${a.email}?`, danger: true, confirmText: 'Remove' }))) return;
    try {
      await removeAdmin(a.id);
      toast('Admin removed');
    } catch (e) {
      toastError(e);
    }
  };

  if (!rows) return <Loading />;
  return (
    <div className="col" style={{ gap: 16 }}>
      <PageHead title="Admins" sub="People who can manage clients and generate licenses. They sign in with their own email (verified).">
        <Button variant="primary" icon={Plus} onClick={() => setEdit({ email: '', name: '', active: true })}>Add admin</Button>
      </PageHead>
      <div className="card">
        <div className="list-item">
          <div className="thumb" style={{ background: 'linear-gradient(135deg,#f59e0b,#ef4444)' }}><Crown size={20} /></div>
          <div className="grow"><div className="b">{HEAD_ADMIN_EMAIL}</div><div className="small faint">Head admin — full control, cannot be removed</div></div>
          <Badge color="indigo">Head</Badge>
        </div>
        {rows.map((a) => (
          <div key={a.id} className="list-item">
            <div className="thumb" style={{ background: 'var(--primary-50)', color: 'var(--primary)' }}><ShieldCheck size={20} /></div>
            <div className="grow"><div className="b">{a.name || a.email}</div><div className="small faint">{a.email} · added {fmtDate(a.addedAt)}</div></div>
            <Badge color={a.active ? 'green' : 'red'}>{a.active ? 'Active' : 'Disabled'}</Badge>
            <Switch checked={a.active} onChange={(v) => toggle(a, v)} />
            <Button size="sm" variant="danger-ghost" icon={Trash2} onClick={() => remove(a)} />
          </div>
        ))}
      </div>
      {edit && (
        <Modal title="Add admin" icon={ShieldCheck} size="sm" onClose={() => setEdit(null)} footer={<><Button onClick={() => setEdit(null)}>Cancel</Button><Button variant="primary" onClick={save}>Save</Button></>}>
          <div className="col">
            <Field label="Email (Google or password account)"><Input autoFocus type="email" value={edit.email} onChange={(e) => setEdit({ ...edit, email: e.target.value })} /></Field>
            <Field label="Name"><Input value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} /></Field>
            <div className="small faint">Create their login in Firebase Console → Authentication, or let them use "Continue with Google".</div>
          </div>
        </Modal>
      )}
    </div>
  );
}
