import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Armchair, Plus, Pencil, Trash2, CalendarClock, CheckCircle2, Users, Clock3, ArrowRightLeft, Merge, Split, Eraser, Layers, History, LayoutGrid } from 'lucide-react';
import { api } from '../lib/api';
import { useApp } from '../context/AppContext';
import { formatTime, formatDateTime } from '../lib/format';
import { PageHead, Button, Loading, Empty, StatusBadge, Money, Modal, Field, Input, NumberInput, Select, Tabs } from '../components/ui';
import TableVisual from '../components/TableVisual';
import OrderDetail from '../components/OrderDetail';
import { TransferModal, MergeModal, SplitModal, FloorsModal } from '../components/TableModals';
import { rangeFor } from './Orders';

const PRESETS = [
  { value: 'today', label: 'Today' },
  { value: 'yesterday', label: 'Yesterday' },
  { value: '7', label: 'Last 7 days' },
  { value: '30', label: 'Last 30 days' },
  { value: 'all', label: 'All time' },
];

function DineHistory({ tables }) {
  const { toastError, settings } = useApp();
  const [preset, setPreset] = useState('today');
  const [tableId, setTableId] = useState('');
  const [status, setStatus] = useState('');
  const [data, setData] = useState(null);
  const [open, setOpen] = useState(null);
  const methodLabel = (k) => settings.payment.methods.find((x) => x.key === k)?.label || k || '—';

  const load = () => api('tables.history', { ...rangeFor(preset), tableId: tableId || undefined, status: status || undefined }).then(setData).catch(toastError);
  useEffect(() => {
    load();
  }, [preset, tableId, status]); // eslint-disable-line react-hooks/exhaustive-deps

  const total = data ? data.rows.filter((r) => r.status === 'completed').reduce((s, r) => s + r.total, 0) : 0;
  return (
    <div className="col" style={{ gap: 14 }}>
      <div className="card card-pad row wrap">
        <Select value={preset} onChange={(e) => setPreset(e.target.value)} options={PRESETS} style={{ width: 160 }} />
        <Select value={tableId} onChange={(e) => setTableId(e.target.value)} style={{ width: 180 }} options={[{ value: '', label: 'All tables' }, ...tables.map((t) => ({ value: t.id, label: t.name }))]} />
        <Select value={status} onChange={(e) => setStatus(e.target.value)} style={{ width: 150 }} options={[{ value: '', label: 'All status' }, { value: 'completed', label: 'Completed' }, { value: 'pending', label: 'Running' }, { value: 'cancelled', label: 'Cancelled / merged' }]} />
        <div className="grow" />
        {data && <span className="badge indigo" style={{ fontSize: 14, padding: '6px 12px' }}>{data.rows.filter((r) => r.status === 'completed').length} bills · <Money value={total} /></span>}
      </div>
      {data && data.perTable.length > 0 && (
        <div className="chip-row">
          {data.perTable.map((p) => (
            <span key={p.table} className="chip" style={{ cursor: 'default' }}>
              <b><bdi>{p.table}</bdi></b> <span className="n">{p.orders}</span> <Money value={p.sales} />
            </span>
          ))}
        </div>
      )}
      <div className="card">
        {!data ? (
          <Loading />
        ) : data.rows.length === 0 ? (
          <Empty icon={History} title="No dine-in history" text="Dine-in bills will appear here." />
        ) : (
          <div className="table-wrap" style={{ maxHeight: 'calc(100vh - 340px)' }}>
            <table className="table">
              <thead>
                <tr><th>Order #</th><th>Table</th><th>Date / Time</th><th>Customer</th><th>Items</th><th>Payment</th><th>Cashier</th><th>Status</th><th className="num">Total</th></tr>
              </thead>
              <tbody>
                {data.rows.map((o) => (
                  <tr key={o.id} className="clickable" onClick={() => setOpen(o.id)}>
                    <td className="b">{o.order_no}{o.merged_note && <div className="small faint">{o.merged_note}</div>}</td>
                    <td><bdi>{o.table_name || '—'}</bdi></td>
                    <td className="muted nowrap">{formatDateTime(o.created_at)}</td>
                    <td><bdi>{o.customer_name || '—'}</bdi></td>
                    <td>{o.item_count}</td>
                    <td>{o.status === 'completed' ? <>{methodLabel(o.payment_method)}{o.payment_bank && <div className="small faint">{o.payment_bank}</div>}</> : '—'}</td>
                    <td>{o.cashier_name}</td>
                    <td><StatusBadge status={o.status} /></td>
                    <td className="num b"><Money value={o.total} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      {open && <OrderDetail id={open} onClose={() => setOpen(null)} onChanged={load} />}
    </div>
  );
}

export default function Tables() {
  const { toast, toastError, confirm, can } = useApp();
  const [tables, setTables] = useState(null);
  const [floors, setFloors] = useState([]);
  const [floor, setFloor] = useState('all');
  const [tab, setTab] = useState('floor');
  const [edit, setEdit] = useState(null);
  const [manage, setManage] = useState(false);
  const [floorsOpen, setFloorsOpen] = useState(false);
  const [op, setOp] = useState(null); // { kind: 'transfer'|'merge'|'split', table }
  const nav = useNavigate();
  const admin = can('settings');

  const load = () => {
    api('tables.list').then(setTables).catch(toastError);
    api('tables.floors').then(setFloors).catch(() => {});
  };
  useEffect(() => {
    load();
    const t = setInterval(load, 20000);
    return () => clearInterval(t);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const open = (t) => {
    if (manage) return setEdit({ ...t, floorId: t.floor_id || '' });
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

  const freeTable = async (e, t) => {
    e.stopPropagation();
    const msg = t.status === 'occupied' && t.order_no
      ? `${t.name} has a running bill (${t.order_no}, ${t.item_count} items). Freeing the table CANCELS that bill. To keep it, use Transfer instead.`
      : `${t.name} will be marked as free.`;
    if (!(await confirm({ title: `Free ${t.name}?`, message: msg, danger: t.status === 'occupied', confirmText: 'Free table' }))) return;
    try {
      const r = await api('tables.free', { tableId: t.id });
      toast(r.cancelled ? `${t.name} is free (${r.cancelled} cancelled)` : `${t.name} is free`);
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

  const done = () => {
    setOp(null);
    load();
  };

  const shown = useMemo(() => {
    if (!tables) return [];
    if (floor === 'all') return tables;
    if (floor === 'none') return tables.filter((t) => !t.floor_id);
    return tables.filter((t) => t.floor_id === Number(floor));
  }, [tables, floor]);

  if (!tables) return <Loading />;
  const counts = { available: 0, occupied: 0, reserved: 0 };
  tables.forEach((t) => counts[t.status]++);
  const hasUnassigned = floors.length > 0 && tables.some((t) => !t.floor_id);
  const stop = (fn) => (e) => {
    e.stopPropagation();
    fn();
  };

  return (
    <div className="col" style={{ gap: 16 }}>
      <PageHead title="Tables" sub="Tap a free table to start a dine-in order, or an occupied table to open its bill.">
        <span className="badge green">{counts.available} available</span>
        <span className="badge red">{counts.occupied} occupied</span>
        <span className="badge amber">{counts.reserved} reserved</span>
        {admin && tab === 'floor' && (
          <>
            <Button icon={Layers} onClick={() => setFloorsOpen(true)}>Floors</Button>
            <Button variant={manage ? 'primary' : undefined} icon={Pencil} onClick={() => setManage(!manage)}>{manage ? 'Done' : 'Manage'}</Button>
            <Button icon={Plus} onClick={() => setEdit({ name: '', capacity: 4, floorId: floor !== 'all' && floor !== 'none' ? Number(floor) : '' })}>Add Table</Button>
          </>
        )}
      </PageHead>
      <Tabs
        tabs={[{ key: 'floor', label: 'Floor plan', icon: LayoutGrid }, { key: 'history', label: 'Dine-in history', icon: History }]}
        value={tab}
        onChange={setTab}
      />
      {tab === 'history' ? (
        <DineHistory tables={tables} />
      ) : (
        <>
          {(floors.length > 0) && (
            <div className="chip-row">
              <button className={`chip ${floor === 'all' ? 'on' : ''}`} onClick={() => setFloor('all')}>All floors <span className="n">{tables.length}</span></button>
              {floors.map((f) => (
                <button key={f.id} className={`chip ${floor === String(f.id) ? 'on' : ''}`} onClick={() => setFloor(String(f.id))}>
                  <bdi>{f.name}</bdi> <span className="n">{tables.filter((t) => t.floor_id === f.id).length}</span>
                </button>
              ))}
              {hasUnassigned && <button className={`chip ${floor === 'none' ? 'on' : ''}`} onClick={() => setFloor('none')}>Other tables <span className="n">{tables.filter((t) => !t.floor_id).length}</span></button>}
            </div>
          )}
          {manage && <div className="banner info" style={{ borderRadius: 12 }}>Manage mode: click a table to rename it, change seats, move it to a floor or delete it.</div>}
          {shown.length === 0 ? (
            <div className="card">
              <Empty icon={Armchair} title="No tables here" text="Add your restaurant tables to take dine-in orders." action={admin && <Button variant="primary" icon={Plus} onClick={bulk}>Add tables</Button>} />
            </div>
          ) : (
            <div className="floor">
              {shown.map((t) => (
                <div key={t.id} className={`tcard ${t.status}`} onClick={() => open(t)}>
                  <TableVisual name={t.name} capacity={t.capacity} />
                  <div className="row" style={{ justifyContent: 'center', gap: 10 }}>
                    <StatusBadge status={t.status} />
                    <span className="small muted row" style={{ gap: 5 }}><Users size={14} /> {t.capacity}</span>
                  </div>
                  {t.status === 'occupied' && t.order_no ? (
                    <div className="col" style={{ gap: 6, marginTop: 'auto' }}>
                      <div className="small muted row" style={{ gap: 6 }}><Clock3 size={14} /> {t.order_no} · since {formatTime(t.order_created)}</div>
                      <div className="row"><span className="small muted">{t.item_count} items</span><span className="grow" /><b style={{ fontSize: 17 }}><Money value={t.order_total} /></b></div>
                      {!manage && (
                        <div className="row" style={{ gap: 6, flexWrap: 'wrap' }}>
                          <Button size="sm" icon={ArrowRightLeft} title="Move bill to another table" onClick={stop(() => setOp({ kind: 'transfer', table: t }))}>Move</Button>
                          <Button size="sm" icon={Merge} title="Merge other bills into this one" onClick={stop(() => setOp({ kind: 'merge', table: t }))} disabled={counts.occupied < 2}>Merge</Button>
                          <Button size="sm" icon={Split} title="Split items to a new bill" onClick={stop(() => setOp({ kind: 'split', table: t }))} disabled={t.item_count < 1}>Split</Button>
                          <Button size="sm" variant="danger-ghost" icon={Eraser} title="Free this table (cancels the bill)" onClick={(e) => freeTable(e, t)} />
                        </div>
                      )}
                    </div>
                  ) : (
                    !manage && (
                      <div className="row" style={{ marginTop: 'auto', gap: 6 }}>
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
        </>
      )}
      {op?.kind === 'transfer' && <TransferModal table={op.table} tables={tables} floors={floors} onClose={() => setOp(null)} onDone={done} />}
      {op?.kind === 'merge' && <MergeModal table={op.table} tables={tables} floors={floors} onClose={() => setOp(null)} onDone={done} />}
      {op?.kind === 'split' && <SplitModal table={op.table} tables={tables} floors={floors} onClose={() => setOp(null)} onDone={done} />}
      {floorsOpen && <FloorsModal floors={floors} onClose={() => setFloorsOpen(false)} onChanged={load} />}
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
            <Field label="Floor / area" hint={floors.length ? '' : 'Create floors with the Floors button first.'}>
              <Select value={String(edit.floorId || '')} onChange={(e) => setEdit({ ...edit, floorId: e.target.value })} options={[{ value: '', label: '— No floor —' }, ...floors.map((f) => ({ value: String(f.id), label: f.name }))]} />
            </Field>
          </div>
        </Modal>
      )}
    </div>
  );
}
