import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Armchair, Plus, Pencil, Trash2, CalendarClock, CheckCircle2, Users, Clock3 } from 'lucide-react';
import { api } from '../lib/api';
import { useApp } from '../context/AppContext';
import { formatTime } from '../lib/format';
import { PageHead, Button, Loading, Empty, StatusBadge, Money, Modal, Field, Input, NumberInput } from '../components/ui';

export default function Tables() {
  const { toast, toastError, confirm, can } = useApp();
  const [tables, setTables] = useState(null);
  const [edit, setEdit] = useState(null);
  const [manage, setManage] = useState(false);
  const nav = useNavigate();
  const admin = can('settings');

  const load = () => api('tables.list').then(setTables).catch(toastError);
  useEffect(() => {
    load();
    const t = setInterval(load, 20000);
    return () => clearInterval(t);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const open = (t) => {
    if (manage) return setEdit(t);
    if (t.status === 'occupied' && t.current_order_id) nav('/pos', { state: { orderId: t.current_order_id } });
    else if (can('pos')) nav('/pos', { state: { table: { id: t.id, name: t.name } } });
  };

  const setStatus = async (e, t, status) => {
    e.stopPropagation();
    try {
      await api('tables.setStatus', { id: t.id, status });
      load();
    } catch (err) {
      toastError(err);
    }
  };

  const save = async () => {
    try {
      await api('tables.save', edit);
      toast('Table saved');
      setEdit(null);
      load();
    } catch (e) {
      toastError(e);
    }
  };

  const remove = async () => {
    if (!(await confirm({ title: `Delete ${edit.name}?`, danger: true, confirmText: 'Delete' }))) return;
    try {
      await api('tables.remove', { id: edit.id });
      setEdit(null);
      load();
    } catch (e) {
      toastError(e);
    }
  };

  const bulk = async () => {
    const n = await confirm({ title: 'Add tables', message: 'How many tables do you want to add?', input: 'e.g. 10', confirmText: 'Add' });
    if (n === false) return;
    try {
      await api('tables.bulkAdd', { count: Number(n) || 1 });
      load();
    } catch (e) {
      toastError(e);
    }
  };

  if (!tables) return <Loading />;
  const counts = { available: 0, occupied: 0, reserved: 0 };
  tables.forEach((t) => counts[t.status]++);

  return (
    <div className="col" style={{ gap: 16 }}>
      <PageHead title="Tables" sub="Tap an available table to start a dine-in order, or an occupied table to open its bill.">
        <span className="badge green">{counts.available} available</span>
        <span className="badge red">{counts.occupied} occupied</span>
        <span className="badge amber">{counts.reserved} reserved</span>
        {admin && (
          <>
            <Button variant={manage ? 'primary' : undefined} icon={Pencil} onClick={() => setManage(!manage)}>{manage ? 'Done' : 'Manage'}</Button>
            <Button icon={Plus} onClick={() => setEdit({ name: '', capacity: 4 })}>Add Table</Button>
          </>
        )}
      </PageHead>
      {manage && <div className="banner info" style={{ borderRadius: 12 }}>Manage mode: click a table to rename, change seats or delete it.</div>}
      {tables.length === 0 ? (
        <div className="card">
          <Empty icon={Armchair} title="No tables yet" text="Add your restaurant tables to take dine-in orders." action={admin && <Button variant="primary" icon={Plus} onClick={bulk}>Add tables</Button>} />
        </div>
      ) : (
        <div className="tgrid">
          {tables.map((t) => (
            <div key={t.id} className={`tcard ${t.status}`} onClick={() => open(t)}>
              <div className="row">
                <div className="tn grow"><bdi>{t.name}</bdi></div>
                <StatusBadge status={t.status} />
              </div>
              <div className="small muted row" style={{ gap: 6 }}><Users size={14} /> {t.capacity} seats</div>
              {t.status === 'occupied' && t.order_no ? (
                <div className="col" style={{ gap: 4, marginTop: 'auto' }}>
                  <div className="small muted row" style={{ gap: 6 }}><Clock3 size={14} /> {t.order_no} · since {formatTime(t.order_created)}</div>
                  <div className="row"><span className="small muted">{t.item_count} items</span><span className="grow" /><b style={{ fontSize: 17 }}><Money value={t.order_total} /></b></div>
                </div>
              ) : (
                !manage && (
                  <div className="row" style={{ marginTop: 'auto' }}>
                    {t.status === 'reserved' ? (
                      <Button size="sm" icon={CheckCircle2} onClick={(e) => setStatus(e, t, 'available')}>Free</Button>
                    ) : (
                      <Button size="sm" variant="ghost" icon={CalendarClock} onClick={(e) => setStatus(e, t, 'reserved')}>Reserve</Button>
                    )}
                  </div>
                )
              )}
            </div>
          ))}
        </div>
      )}
      {edit && (
        <Modal
          title={edit.id ? 'Edit Table' : 'Add Table'}
          icon={Armchair}
          size="sm"
          onClose={() => setEdit(null)}
          footer={
            <>
              {edit.id && <Button variant="danger-ghost" icon={Trash2} onClick={remove} style={{ marginRight: 'auto' }}>Delete</Button>}
              {!edit.id && <Button onClick={() => { setEdit(null); bulk(); }} style={{ marginRight: 'auto' }}>Add many…</Button>}
              <Button onClick={() => setEdit(null)}>Cancel</Button>
              <Button variant="primary" onClick={save}>Save</Button>
            </>
          }
        >
          <div className="col">
            <Field label="Table name"><Input autoFocus value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} placeholder="e.g. Table 5 or Family Hall 1" /></Field>
            <Field label="Seats"><NumberInput value={edit.capacity} onChange={(v) => setEdit({ ...edit, capacity: v })} /></Field>
          </div>
        </Modal>
      )}
    </div>
  );
}
