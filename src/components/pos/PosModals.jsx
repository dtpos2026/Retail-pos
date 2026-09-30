import { useEffect, useState } from 'react';
import { Percent, UserRound, Armchair, PauseCircle, PencilLine, PlusSquare, Search, Trash2, PlayCircle } from 'lucide-react';
import { Modal, Button, Field, Input, NumberInput, Seg, Empty, Money, StatusBadge, SearchBox } from '../ui';
import { api } from '../../lib/api';
import { useApp } from '../../context/AppContext';
import { formatDateTime, orderTypeLabel, round2 } from '../../lib/format';
import TableVisual from '../TableVisual';

export function ItemModal({ item, onClose, onSave, onRemove, canDiscount }) {
  const [qty, setQty] = useState(item.qty);
  const [price, setPrice] = useState(item.unitPrice);
  const [mode, setMode] = useState('amount');
  const [disc, setDisc] = useState(item.unitDiscount || 0);
  const [notes, setNotes] = useState(item.notes || '');
  const unitDiscount = mode === 'percent' ? round2((Number(price) * (Number(disc) || 0)) / 100) : Number(disc) || 0;
  const save = () => onSave({ qty: Math.max(0.01, Number(qty) || 1), unitPrice: item.productId ? item.unitPrice : Number(price) || 0, unitDiscount: Math.min(unitDiscount, Number(price)), notes });
  return (
    <Modal
      title={item.name}
      icon={PencilLine}
      onClose={onClose}
      footer={
        <>
          <Button variant="danger-ghost" icon={Trash2} onClick={onRemove} style={{ marginRight: 'auto' }}>Remove</Button>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" onClick={save}>Update Item</Button>
        </>
      }
    >
      <div className="form-grid" onKeyDown={(e) => e.key === 'Enter' && e.target.tagName !== 'TEXTAREA' && save()}>
        <Field label="Quantity">
          <NumberInput autoFocus selectOnFocus value={qty} onChange={setQty} />
        </Field>
        <Field label="Unit Price" hint={item.productId ? 'Change prices in Products' : undefined}>
          <NumberInput value={price} onChange={setPrice} disabled={!!item.productId} />
        </Field>
        {canDiscount && (
          <>
            <Field label="Discount per unit">
              <NumberInput value={disc} onChange={setDisc} />
            </Field>
            <Field label="Discount type">
              <Seg value={mode} onChange={setMode} options={[{ value: 'amount', label: 'Rs.' }, { value: 'percent', label: '%' }]} />
            </Field>
          </>
        )}
        <Field label="Note (e.g. less spicy, no onion)" className="full">
          <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional note printed on receipt / token" />
        </Field>
      </div>
    </Modal>
  );
}

export function DiscountModal({ cart, subtotal, onClose, onSave }) {
  const [mode, setMode] = useState(cart.discountMode || 'amount');
  const [value, setValue] = useState(cart.discountValue || '');
  const amount = mode === 'percent' ? round2((subtotal * (Number(value) || 0)) / 100) : Number(value) || 0;
  const save = () => onSave({ discountMode: mode, discountValue: Number(value) || 0, orderDiscount: Math.min(subtotal, Math.max(0, amount)) });
  return (
    <Modal
      title="Bill Discount"
      icon={Percent}
      size="sm"
      onClose={onClose}
      footer={
        <>
          <Button onClick={() => onSave({ discountMode: 'amount', discountValue: 0, orderDiscount: 0 })}>Remove</Button>
          <Button variant="primary" onClick={save}>Apply</Button>
        </>
      }
    >
      <div className="col">
        <Seg value={mode} onChange={setMode} options={[{ value: 'amount', label: 'Amount (Rs.)' }, { value: 'percent', label: 'Percent (%)' }]} />
        <NumberInput className="lg" autoFocus selectOnFocus value={value} onChange={setValue} onKeyDown={(e) => e.key === 'Enter' && save()} />
        <div className="row wrap">
          {(mode === 'percent' ? [5, 10, 15, 20] : [50, 100, 200, 500]).map((v) => (
            <Button key={v} size="sm" onClick={() => setValue(v)}>{mode === 'percent' ? `${v}%` : v}</Button>
          ))}
        </div>
        <div className="muted">Discount: <b><Money value={Math.min(subtotal, amount)} /></b></div>
      </div>
    </Modal>
  );
}

export function CustomerModal({ customer, required, onClose, onSave }) {
  const [form, setForm] = useState({ id: customer.id, name: customer.name, mobile: customer.mobile, address: customer.address });
  const [q, setQ] = useState('');
  const [results, setResults] = useState([]);
  const [err, setErr] = useState('');

  useEffect(() => {
    if (q.trim().length < 2) return setResults([]);
    const t = setTimeout(() => api('customers.list', { search: q }).then(setResults).catch(() => {}), 150);
    return () => clearTimeout(t);
  }, [q]);

  const pick = (c) => {
    setForm({ id: c.id, name: c.name, mobile: c.mobile || '', address: c.address || '' });
    setQ('');
    setResults([]);
  };
  const save = () => {
    if (required && (!form.name || !form.mobile || !form.address)) return setErr('Name, mobile and address are required for delivery.');
    onSave(form);
  };
  return (
    <Modal
      title={required ? 'Delivery Customer' : 'Customer'}
      icon={UserRound}
      onClose={onClose}
      footer={
        <>
          <Button onClick={() => onSave({ id: null, name: '', mobile: '', address: '' })} style={{ marginRight: 'auto' }}>Walk-in (no customer)</Button>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" onClick={save}>Save</Button>
        </>
      }
    >
      <div className="col">
        <div style={{ position: 'relative' }}>
          <SearchBox value={q} onChange={setQ} placeholder="Search saved customer by name or mobile…" autoFocus />
          {results.length > 0 && (
            <div className="card" style={{ position: 'absolute', left: 0, right: 0, top: 44, zIndex: 5, maxHeight: 220, overflow: 'auto', boxShadow: 'var(--shadow-lg)' }}>
              {results.map((c) => (
                <div key={c.id} className="list-item" style={{ cursor: 'pointer' }} onClick={() => pick(c)}>
                  <div className="grow">
                    <div className="b"><bdi>{c.name}</bdi></div>
                    <div className="small faint">{c.mobile} {c.address ? `· ${c.address}` : ''}</div>
                  </div>
                  {c.total_due > 0 && <span className="badge red">Due <Money value={c.total_due} /></span>}
                </div>
              ))}
            </div>
          )}
        </div>
        <div className="form-grid">
          <Field label="Name">
            <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value, id: null })} />
          </Field>
          <Field label="Mobile">
            <Input value={form.mobile} onChange={(e) => setForm({ ...form, mobile: e.target.value, id: null })} placeholder="03XX-XXXXXXX" />
          </Field>
          <Field label={`Address${required ? '' : ' (optional)'}`} className="full">
            <textarea className="textarea" rows={2} value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />
          </Field>
        </div>
        {err && <div className="badge red" style={{ padding: '8px 12px' }}>{err}</div>}
      </div>
    </Modal>
  );
}

export function TableModal({ current, onClose, onPick }) {
  const [tables, setTables] = useState(null);
  useEffect(() => {
    api('tables.list').then(setTables).catch(() => setTables([]));
  }, []);
  return (
    <Modal title="Select Table" icon={Armchair} size="lg" onClose={onClose}>
      {!tables ? null : tables.length === 0 ? (
        <Empty icon={Armchair} title="No tables yet" text="Add tables from the Tables screen." />
      ) : (
        <div className="tgrid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(170px, 1fr))' }}>
          {tables.map((t) => {
            const running = t.status === 'occupied' && t.id !== current?.id;
            return (
              <div key={t.id} className={`tcard ${t.status}`} style={{ minHeight: 96, alignItems: 'center' }} onClick={() => onPick(t)}>
                <TableVisual name={t.name} capacity={t.capacity} />
                <StatusBadge status={t.status} />
                <div className="small faint">{running ? `Open ${t.order_no}` : `${t.capacity} seats`}</div>
              </div>
            );
          })}
        </div>
      )}
    </Modal>
  );
}

export function HeldOrdersModal({ onClose, onOpen }) {
  const [orders, setOrders] = useState(null);
  useEffect(() => {
    api('orders.pending').then(setOrders).catch(() => setOrders([]));
  }, []);
  return (
    <Modal title="Held & Running Orders" icon={PauseCircle} size="lg" onClose={onClose}>
      {!orders ? null : orders.length === 0 ? (
        <Empty icon={PauseCircle} title="No held orders" text="Orders you hold (F8) and running dine-in bills appear here." />
      ) : (
        <div className="table-wrap" style={{ maxHeight: 440 }}>
          <table className="table">
            <thead>
              <tr><th>Order</th><th>Type</th><th>Table / Customer</th><th>Time</th><th className="num">Total</th><th /></tr>
            </thead>
            <tbody>
              {orders.map((o) => (
                <tr key={o.id} className="clickable" onClick={() => onOpen(o.id)}>
                  <td className="b">{o.order_no}</td>
                  <td>{orderTypeLabel(o.order_type)}</td>
                  <td><bdi>{o.table_name || o.customer_name || '—'}</bdi></td>
                  <td className="muted">{formatDateTime(o.created_at)}</td>
                  <td className="num b"><Money value={o.total} /></td>
                  <td className="right"><Button size="sm" variant="soft" icon={PlayCircle}>Open</Button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Modal>
  );
}

export function CustomItemModal({ onClose, onAdd }) {
  const [name, setName] = useState('');
  const [price, setPrice] = useState('');
  const [qty, setQty] = useState(1);
  const ok = name.trim() && Number(price) > 0;
  const add = () => ok && onAdd({ name: name.trim(), price: Number(price), qty: Number(qty) || 1 });
  return (
    <Modal
      title="Open Item"
      icon={PlusSquare}
      size="sm"
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" onClick={add} disabled={!ok}>Add to Cart</Button>
        </>
      }
    >
      <div className="col" onKeyDown={(e) => e.key === 'Enter' && add()}>
        <p className="muted" style={{ margin: 0 }}>Sell an item that is not in your product list.</p>
        <Field label="Item name">
          <Input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Loose sugar" />
        </Field>
        <div className="form-grid">
          <Field label="Price">
            <NumberInput value={price} onChange={setPrice} />
          </Field>
          <Field label="Quantity">
            <NumberInput value={qty} onChange={setQty} />
          </Field>
        </div>
      </div>
    </Modal>
  );
}

export { Search };
