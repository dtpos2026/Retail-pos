import { useEffect, useState } from 'react';
import { ReceiptText } from 'lucide-react';
import { api } from '../lib/api';
import { useApp } from '../context/AppContext';
import { formatDateTime, orderTypeLabel, today, shiftDate } from '../lib/format';
import { PageHead, SearchBox, Select, Loading, Empty, StatusBadge, Money, Input } from '../components/ui';
import OrderDetail from '../components/OrderDetail';

const PRESETS = [
  { value: 'today', label: 'Today' },
  { value: 'yesterday', label: 'Yesterday' },
  { value: '7', label: 'Last 7 days' },
  { value: '30', label: 'Last 30 days' },
  { value: 'all', label: 'All time' },
  { value: 'custom', label: 'Custom…' },
];

export function rangeFor(preset, custom) {
  const t = today();
  switch (preset) {
    case 'today': return { from: t, to: t };
    case 'yesterday': return { from: shiftDate(t, -1), to: shiftDate(t, -1) };
    case '7': return { from: shiftDate(t, -6), to: t };
    case '30': return { from: shiftDate(t, -29), to: t };
    case 'custom': return custom;
    default: return {};
  }
}

export default function Orders() {
  const { toastError, settings } = useApp();
  const [rows, setRows] = useState(null);
  const [search, setSearch] = useState('');
  const [preset, setPreset] = useState('today');
  const [custom, setCustom] = useState({ from: today(), to: today() });
  const [status, setStatus] = useState('');
  const [type, setType] = useState('');
  const [pay, setPay] = useState('');
  const [open, setOpen] = useState(null);
  const methodLabel = (k) => settings.payment.methods.find((x) => x.key === k)?.label || k || '—';

  const load = () => {
    const r = search.trim() ? {} : rangeFor(preset, custom);
    api('orders.list', { search, ...r, status, orderType: type, paymentStatus: pay, limit: 1000 }).then(setRows).catch(toastError);
  };

  useEffect(() => {
    const t = setTimeout(load, 200);
    return () => clearTimeout(t);
  }, [search, preset, custom, status, type, pay]); // eslint-disable-line react-hooks/exhaustive-deps

  const total = rows ? rows.filter((r) => r.status === 'completed').reduce((s, r) => s + r.total, 0) : 0;

  return (
    <div className="col" style={{ gap: 16 }}>
      <PageHead title="Orders" sub={rows ? `${rows.length} orders found` : ''}>
        {rows && <span className="badge indigo" style={{ fontSize: 14, padding: '6px 12px' }}>Sales: <Money value={total} /></span>}
      </PageHead>
      <div className="card card-pad row wrap">
        <SearchBox value={search} onChange={setSearch} placeholder="Order #, customer, mobile, token, table…" style={{ flex: 1, minWidth: 260 }} />
        <Select value={preset} onChange={(e) => setPreset(e.target.value)} options={PRESETS} style={{ width: 150 }} />
        {preset === 'custom' && (
          <>
            <Input type="date" value={custom.from} onChange={(e) => setCustom({ ...custom, from: e.target.value })} style={{ width: 160 }} />
            <Input type="date" value={custom.to} onChange={(e) => setCustom({ ...custom, to: e.target.value })} style={{ width: 160 }} />
          </>
        )}
        <Select value={status} onChange={(e) => setStatus(e.target.value)} style={{ width: 140 }} options={[{ value: '', label: 'All status' }, { value: 'pending', label: 'Pending' }, { value: 'completed', label: 'Completed' }, { value: 'cancelled', label: 'Cancelled' }, { value: 'refunded', label: 'Refunded' }]} />
        <Select value={type} onChange={(e) => setType(e.target.value)} style={{ width: 140 }} options={[{ value: '', label: 'All types' }, { value: 'dine_in', label: 'Dine-In' }, { value: 'takeaway', label: 'Takeaway' }, { value: 'delivery', label: 'Delivery' }]} />
        <Select value={pay} onChange={(e) => setPay(e.target.value)} style={{ width: 150 }} options={[{ value: '', label: 'All payments' }, { value: 'paid', label: 'Paid' }, { value: 'due', label: 'Has due' }, { value: 'unpaid', label: 'Unpaid' }]} />
      </div>
      <div className="card">
        {!rows ? (
          <Loading />
        ) : rows.length === 0 ? (
          <Empty icon={ReceiptText} title="No orders found" text="Try a different date range or search." />
        ) : (
          <div className="table-wrap" style={{ maxHeight: 'calc(100vh - 290px)' }}>
            <table className="table">
              <thead>
                <tr><th>Order #</th><th>Date / Time</th><th>Type</th><th>Customer</th><th>Table</th><th>Token</th><th>Items</th><th>Payment</th><th>Status</th><th className="num">Total</th></tr>
              </thead>
              <tbody>
                {rows.map((o) => (
                  <tr key={o.id} className="clickable" onClick={() => setOpen(o.id)}>
                    <td className="b">{o.order_no}</td>
                    <td className="muted nowrap">{formatDateTime(o.created_at)}</td>
                    <td>{orderTypeLabel(o.order_type)}</td>
                    <td><bdi>{o.customer_name || '—'}</bdi>{o.customer_mobile && <div className="small faint">{o.customer_mobile}</div>}</td>
                    <td><bdi>{o.table_name || '—'}</bdi></td>
                    <td>{o.token_no ? `#${o.token_no}` : '—'}</td>
                    <td>{o.item_count}</td>
                    <td>{o.status === 'completed' ? (o.due > 0 ? <span className="badge red">Due <Money value={o.due} /></span> : methodLabel(o.payment_method)) : '—'}</td>
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
