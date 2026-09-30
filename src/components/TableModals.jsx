import { useEffect, useState } from 'react';
import { ArrowRightLeft, Merge, Split, Layers, Plus, Pencil, Trash2, Minus } from 'lucide-react';
import { api } from '../lib/api';
import { useApp } from '../context/AppContext';
import { Modal, Button, Field, Input, Money, Loading } from './ui';
import TableVisual from './TableVisual';

/** Grid of tables to pick from. */
function TablePick({ tables, selected, onPick, multi, floors }) {
  const groups = [];
  const byFloor = (fid) => tables.filter((t) => (t.floor_id || 0) === fid);
  for (const f of floors) if (byFloor(f.id).length) groups.push({ name: f.name, list: byFloor(f.id) });
  if (byFloor(0).length) groups.push({ name: floors.length ? 'Other tables' : '', list: byFloor(0) });
  if (!tables.length) return <div className="muted center" style={{ padding: 18 }}>No matching tables.</div>;
  return (
    <div className="col" style={{ gap: 12 }}>
      {groups.map((g) => (
        <div key={g.name}>
          {g.name && <div className="label" style={{ marginBottom: 6 }}>{g.name}</div>}
          <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))', gap: 10 }}>
            {g.list.map((t) => {
              const on = multi ? selected.includes(t.id) : selected === t.id;
              return (
                <button key={t.id} type="button" className={`tcard ${t.status} ${on ? 'picked' : ''}`} style={{ minHeight: 0, padding: 10, borderColor: on ? 'var(--primary)' : undefined, boxShadow: on ? '0 0 0 3px rgba(var(--primary-rgb), .25)' : undefined }} onClick={() => onPick(t.id)}>
                  <div className="b small"><bdi>{t.name}</bdi></div>
                  <div className="small muted">{t.status === 'occupied' ? <Money value={t.order_total} /> : `${t.capacity} seats`}</div>
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

export function TransferModal({ table, tables, floors, onClose, onDone }) {
  const { toast, toastError } = useApp();
  const [to, setTo] = useState(null);
  const [busy, setBusy] = useState(false);
  const free = tables.filter((t) => t.status === 'available');
  const go = async () => {
    setBusy(true);
    try {
      const r = await api('tables.transfer', { orderId: table.current_order_id, toTableId: to });
      toast(`Bill moved to ${r.table}`);
      onDone();
    } catch (e) {
      toastError(e);
      setBusy(false);
    }
  };
  return (
    <Modal title={`Transfer ${table.name}`} icon={ArrowRightLeft} onClose={onClose} footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" onClick={go} disabled={!to} loading={busy}>Move bill here</Button></>}>
      <div className="small muted" style={{ marginBottom: 10 }}>Move the running bill of <b>{table.name}</b> ({table.order_no}) to a free table.</div>
      <TablePick tables={free} floors={floors} selected={to} onPick={setTo} />
    </Modal>
  );
}

export function MergeModal({ table, tables, floors, onClose, onDone }) {
  const { toast, toastError } = useApp();
  const [sel, setSel] = useState([]);
  const [busy, setBusy] = useState(false);
  const others = tables.filter((t) => t.status === 'occupied' && t.current_order_id && t.id !== table.id);
  const toggle = (id) => setSel((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  const go = async () => {
    setBusy(true);
    try {
      const r = await api('tables.merge', { intoOrderId: table.current_order_id, fromOrderIds: others.filter((t) => sel.includes(t.id)).map((t) => t.current_order_id) });
      toast(`Merged ${r.merged.join(', ')} into ${table.name}`);
      onDone();
    } catch (e) {
      toastError(e);
      setBusy(false);
    }
  };
  return (
    <Modal title={`Merge into ${table.name}`} icon={Merge} onClose={onClose} footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" onClick={go} disabled={!sel.length} loading={busy}>Merge {sel.length || ''} bill{sel.length === 1 ? '' : 's'}</Button></>}>
      <div className="small muted" style={{ marginBottom: 10 }}>Select the tables whose bills should be added to <b>{table.name}</b>. Their tables become free and everything is billed together.</div>
      <TablePick tables={others} floors={floors} selected={sel} onPick={toggle} multi />
    </Modal>
  );
}

export function SplitModal({ table, tables, floors, onClose, onDone }) {
  const { toast, toastError } = useApp();
  const [order, setOrder] = useState(null);
  const [qty, setQty] = useState({});
  const [to, setTo] = useState(null);
  const [busy, setBusy] = useState(false);
  const free = tables.filter((t) => t.status === 'available');
  useEffect(() => {
    api('orders.get', { id: table.current_order_id }).then(setOrder).catch(toastError);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const step = (it, d) => setQty((q) => ({ ...q, [it.id]: Math.max(0, Math.min(it.qty, Math.round(((q[it.id] || 0) + d) * 100) / 100)) }));
  const lines = order ? order.items.filter((i) => (qty[i.id] || 0) > 0).map((i) => ({ itemId: i.id, qty: qty[i.id] })) : [];
  const go = async () => {
    setBusy(true);
    try {
      const r = await api('tables.split', { orderId: table.current_order_id, lines, toTableId: to });
      toast(`New bill created on ${r.table}`);
      onDone();
    } catch (e) {
      toastError(e);
      setBusy(false);
    }
  };
  return (
    <Modal title={`Split ${table.name}`} icon={Split} size="lg" onClose={onClose} footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" onClick={go} disabled={!lines.length || !to} loading={busy}>Create new bill</Button></>}>
      {!order ? (
        <Loading />
      ) : (
        <div className="grid" style={{ gridTemplateColumns: '1.1fr 1fr', gap: 20 }}>
          <div className="col" style={{ gap: 8 }}>
            <div className="label">1. Choose items to move</div>
            {order.items.map((it) => (
              <div key={it.id} className="row" style={{ gap: 8, padding: '7px 10px', border: '1px solid var(--border)', borderRadius: 10 }}>
                <div className="grow"><b><bdi>{it.name}</bdi></b><div className="small muted">{it.qty} × <Money value={it.unit_price} /></div></div>
                <Button size="sm" icon={Minus} onClick={() => step(it, -1)} />
                <b style={{ minWidth: 26, textAlign: 'center' }}>{qty[it.id] || 0}</b>
                <Button size="sm" icon={Plus} onClick={() => step(it, 1)} />
              </div>
            ))}
          </div>
          <div className="col" style={{ gap: 8 }}>
            <div className="label">2. Move to a free table</div>
            <TablePick tables={free} floors={floors} selected={to} onPick={setTo} />
          </div>
        </div>
      )}
    </Modal>
  );
}

export function FloorsModal({ floors, onClose, onChanged }) {
  const { toastError, confirm } = useApp();
  const [name, setName] = useState('');
  const add = async () => {
    try {
      await api('tables.floorSave', { name });
      setName('');
      onChanged();
    } catch (e) {
      toastError(e);
    }
  };
  const rename = async (f) => {
    const n = await confirm({ title: 'Rename floor', input: 'Floor name', inputValue: f.name, confirmText: 'Save' });
    if (n === false || !String(n).trim()) return;
    try {
      await api('tables.floorSave', { id: f.id, name: n });
      onChanged();
    } catch (e) {
      toastError(e);
    }
  };
  const remove = async (f) => {
    if (!(await confirm({ title: `Delete ${f.name}?`, message: 'Its tables are kept and move to "Other tables".', danger: true, confirmText: 'Delete' }))) return;
    try {
      await api('tables.floorRemove', { id: f.id });
      onChanged();
    } catch (e) {
      toastError(e);
    }
  };
  return (
    <Modal title="Floors / Areas" icon={Layers} size="sm" onClose={onClose} footer={<Button variant="primary" onClick={onClose}>Done</Button>}>
      <div className="col" style={{ gap: 10 }}>
        {floors.length === 0 && <div className="muted small">No floors yet. Add areas like Ground Floor, First Floor, Garden or Family Hall, then assign tables to them.</div>}
        {floors.map((f) => (
          <div key={f.id} className="row" style={{ gap: 8, padding: '8px 10px', border: '1px solid var(--border)', borderRadius: 10 }}>
            <b className="grow"><bdi>{f.name}</bdi></b>
            <Button size="sm" icon={Pencil} onClick={() => rename(f)} />
            <Button size="sm" variant="danger-ghost" icon={Trash2} onClick={() => remove(f)} />
          </div>
        ))}
        <div className="row" style={{ gap: 8 }}>
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="New floor name" onKeyDown={(e) => e.key === 'Enter' && add()} />
          <Button variant="primary" icon={Plus} onClick={add} disabled={!name.trim()}>Add</Button>
        </div>
      </div>
    </Modal>
  );
}
