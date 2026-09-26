import { useEffect, useState } from 'react';
import { UserCog, Plus, Pencil, ShieldCheck, KeyRound } from 'lucide-react';
import { api } from '../lib/api';
import { useApp } from '../context/AppContext';
import { formatDateTime, initials } from '../lib/format';
import { PageHead, Button, Loading, Modal, Field, Input, Select, Switch, Badge, Check } from '../components/ui';

export default function Users() {
  const { user: me, toast, toastError, confirm, setInfo } = useApp();
  const [rows, setRows] = useState(null);
  const [meta, setMeta] = useState(null);
  const [edit, setEdit] = useState(null);
  const [busy, setBusy] = useState(false);

  const load = () => api('users.list').then(setRows).catch(toastError);
  useEffect(() => {
    load();
    api('users.meta').then(setMeta).catch(toastError);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const roleDefaults = (role) => meta.roles.find((r) => r.key === role)?.permissions || [];

  const openNew = () => setEdit({ name: '', username: '', role: 'cashier', password: '', pin: '', active: true, customPermissions: roleDefaults('cashier') });
  const openEdit = (u) => setEdit({ ...u, password: '', pin: '', customPermissions: u.customPermissions.length ? u.customPermissions : u.permissions });

  const save = async () => {
    setBusy(true);
    try {
      await api('users.save', edit);
      toast('User saved');
      setEdit(null);
      load();
      api('app.info').then(setInfo).catch(() => {});
    } catch (e) {
      toastError(e);
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!(await confirm({ title: `Delete ${edit.name}?`, message: 'Users with sales history are deactivated instead of deleted.', danger: true, confirmText: 'Delete' }))) return;
    try {
      const r = await api('users.remove', { id: edit.id });
      toast(r.deactivated ? 'User deactivated' : 'User deleted');
      setEdit(null);
      load();
    } catch (e) {
      toastError(e);
    }
  };

  const togglePerm = (k, on) => setEdit((e) => ({ ...e, customPermissions: on ? [...new Set([...e.customPermissions, k])] : e.customPermissions.filter((x) => x !== k) }));

  if (!rows || !meta) return <Loading />;

  return (
    <div className="col" style={{ gap: 16 }}>
      <PageHead title="Users" sub="Create staff accounts. Cashiers log in quickly with a 4-digit PIN.">
        <Button variant="primary" icon={Plus} onClick={openNew}>Add User</Button>
      </PageHead>
      <div className="grid grid-3">
        {rows.map((u) => (
          <div key={u.id} className="card card-pad" style={{ opacity: u.active ? 1 : 0.6 }}>
            <div className="row">
              <div className="avatar" style={{ width: 46, height: 46, fontSize: 17 }}>{initials(u.name)}</div>
              <div className="grow">
                <div className="b" style={{ fontSize: 16 }}>{u.name} {u.id === me.id && <span className="faint small">(you)</span>}</div>
                <div className="small faint">@{u.username}</div>
              </div>
              <Button size="sm" variant="ghost" icon={Pencil} onClick={() => openEdit(u)}>Edit</Button>
            </div>
            <div className="row wrap" style={{ marginTop: 12 }}>
              <Badge color={u.role === 'admin' ? 'indigo' : 'blue'}><ShieldCheck size={12} /> {meta.roles.find((r) => r.key === u.role)?.label}</Badge>
              {u.active ? <Badge color="green">Active</Badge> : <Badge color="red">Disabled</Badge>}
              {u.hasPin && <Badge><KeyRound size={12} /> PIN</Badge>}
            </div>
            <div className="small faint" style={{ marginTop: 10 }}>{u.role === 'admin' ? 'Full access' : `${u.permissions.length} permissions`} · Last login {u.lastLogin ? formatDateTime(u.lastLogin) : 'never'}</div>
          </div>
        ))}
      </div>
      {edit && (
        <Modal
          title={edit.id ? 'Edit User' : 'Add User'}
          icon={UserCog}
          size="lg"
          onClose={() => setEdit(null)}
          footer={
            <>
              {edit.id && edit.id !== me.id && <Button variant="danger-ghost" onClick={remove} style={{ marginRight: 'auto' }}>Delete</Button>}
              <Button onClick={() => setEdit(null)}>Cancel</Button>
              <Button variant="primary" onClick={save} loading={busy}>Save User</Button>
            </>
          }
        >
          <div className="grid" style={{ gridTemplateColumns: '1fr 1fr', gap: 20 }}>
            <div className="col" style={{ gap: 14 }}>
              <Field label="Full name"><Input autoFocus value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} /></Field>
              <Field label="Username"><Input value={edit.username} onChange={(e) => setEdit({ ...edit, username: e.target.value.toLowerCase() })} placeholder="e.g. ali" /></Field>
              <Field label={edit.id ? 'New password (leave empty to keep)' : 'Password'}><Input type="password" value={edit.password} onChange={(e) => setEdit({ ...edit, password: e.target.value })} /></Field>
              <Field label={edit.id ? (edit.hasPin ? 'New PIN (leave empty to keep)' : 'PIN (4 digits)') : 'PIN (4 digits, for quick login)'}>
                <Input type="password" inputMode="numeric" maxLength={4} value={edit.pin} onChange={(e) => setEdit({ ...edit, pin: e.target.value.replace(/\D/g, '') })} placeholder="••••" />
              </Field>
              {edit.id && edit.hasPin && <Check label="Remove PIN login for this user" checked={!!edit.removePin} onChange={(v) => setEdit({ ...edit, removePin: v })} />}
              <div className="toggle-row">
                <div className="t"><div>Active</div><div>Disabled users cannot log in.</div></div>
                <Switch checked={edit.active} onChange={(v) => setEdit({ ...edit, active: v })} disabled={edit.id === me.id} />
              </div>
            </div>
            <div className="col" style={{ gap: 14 }}>
              <Field label="Role">
                <Select value={edit.role} onChange={(e) => setEdit({ ...edit, role: e.target.value, customPermissions: roleDefaults(e.target.value) })} options={meta.roles.map((r) => ({ value: r.key, label: r.label }))} />
              </Field>
              <div>
                <div className="label" style={{ marginBottom: 8 }}>Permissions</div>
                {edit.role === 'admin' ? (
                  <div className="muted small">Admins have full access to everything.</div>
                ) : (
                  <div className="grid grid-2" style={{ gap: 8 }}>
                    {meta.permissions.map((p) => (
                      <Check key={p.key} label={p.label} checked={edit.customPermissions.includes(p.key)} onChange={(v) => togglePerm(p.key, v)} />
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
