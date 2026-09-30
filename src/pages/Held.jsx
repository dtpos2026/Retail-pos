import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { PauseCircle, PlayCircle, Printer, ChefHat, XCircle, Armchair, ShoppingBag, Bike, Clock3, UserRound, RefreshCw } from 'lucide-react';
import { api } from '../lib/api';
import { useApp } from '../context/AppContext';
import { formatQty, orderTypeLabel } from '../lib/format';
import { PageHead, Button, Loading, Empty, SearchBox, Money, Badge } from '../components/ui';

const KIND = (o) => (o.order_type === 'dine_in' ? 'running' : o.order_type === 'delivery' ? 'delivery' : 'hold');

function ago(ts) {
  const m = Math.max(0, Math.round((Date.now() - new Date(ts.replace(' ', 'T')).getTime()) / 60000));
  if (m < 1) return 'just now';
  if (m < 60) return `${m} min ago`;
  const h = Math.floor(m / 60);
  return h < 24 ? `${h} h ${m % 60} min ago` : `${Math.floor(h / 24)} d ago`;
}

const FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'running', label: 'Running (Dine-In)', icon: Armchair },
  { key: 'hold', label: 'On Hold (Takeaway)', icon: ShoppingBag },
  { key: 'delivery', label: 'Delivery', icon: Bike },
];

export default function Held() {
  const { toast, toastError, confirm } = useApp();
  const [rows, setRows] = useState(null);
  const [filter, setFilter] = useState('all');
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState('');
  const nav = useNavigate();

  const load = () => api('orders.pending', { withItems: true }).then(setRows).catch(toastError);
  useEffect(() => {
    load();
    const t = setInterval(load, 15000);
    return () => clearInterval(t);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const counts = useMemo(() => {
    const c = { all: 0, running: 0, hold: 0, delivery: 0 };
    (rows || []).forEach((o) => {
      c.all++;
      c[KIND(o)]++;
    });
    return c;
  }, [rows]);

  const list = useMemo(() => {
    const s = q.trim().toLowerCase();
    return (rows || []).filter(
      (o) => (filter === 'all' || KIND(o) === filter) && (!s || [o.order_no, o.customer_name, o.table_name, o.customer_mobile].some((v) => String(v || '').toLowerCase().includes(s)))
    );
  }, [rows, filter, q]);

  const act = async (key, fn, msg) => {
    setBusy(key);
    try {
      await fn();
      if (msg) toast(msg);
    } catch (e) {
      toastError(e);
    } finally {
      setBusy('');
    }
  };

  const cancel = async (o) => {
    const reason = await confirm({ title: `Cancel ${o.order_no}?`, message: 'The order is cancelled and its table is freed.', confirmText: 'Cancel order', danger: true, input: 'Reason (optional)' });
    if (reason === false) return;
    await act(`c${o.id}`, async () => {
      await api('orders.cancel', { id: o.id, reason });
      await load();
    }, `${o.order_no} cancelled`);
  };

  if (!rows) return <Loading />;
  return (
    <div className="col" style={{ gap: 16 }}>
      <PageHead title="Hold / Running Orders" sub="Bills you put on hold, and dine-in tables that are still running. Retrieve any of them to continue billing.">
        <Button icon={RefreshCw} onClick={load}>Refresh</Button>
      </PageHead>
      <div className="card card-pad row wrap">
        <div className="chip-row">
          {FILTERS.map((f) => (
            <button key={f.key} className={`chip ${filter === f.key ? 'on' : ''}`} onClick={() => setFilter(f.key)}>
              {f.icon && <f.icon size={15} />} {f.label} <span className="n">{counts[f.key]}</span>
            </button>
          ))}
        </div>
        <div className="grow" />
        <SearchBox value={q} onChange={setQ} placeholder="Order #, table, customer…" style={{ width: 280 }} />
      </div>

      {list.length === 0 ? (
        <div className="card">
          <Empty icon={PauseCircle} title={rows.length ? 'No matching orders' : 'Nothing on hold'} text={rows.length ? 'Try another filter.' : 'Press F8 on the POS screen to hold a bill, or start a dine-in order on a table. It will appear here.'} action={<Button variant="primary" onClick={() => nav('/pos')}>Go to POS</Button>} />
        </div>
      ) : (
        <div className="held-grid">
          {list.map((o, i) => {
            const kind = KIND(o);
            return (
              <div key={o.id} className={`held-card ${kind}`} style={{ animationDelay: `${Math.min(i, 8) * 40}ms` }}>
                <div className="row">
                  <div className="no grow">{o.order_no}</div>
                  <Badge color="red">UNPAID</Badge>
                  <Badge color={kind === 'running' ? 'red' : kind === 'delivery' ? 'blue' : 'amber'}>{kind === 'running' ? 'Running' : kind === 'delivery' ? 'Delivery' : 'On hold'}</Badge>
                </div>
                <div className="row wrap small muted" style={{ gap: 12 }}>
                  <span className="row" style={{ gap: 5 }}>{o.order_type === 'dine_in' ? <Armchair size={14} /> : o.order_type === 'delivery' ? <Bike size={14} /> : <ShoppingBag size={14} />} {orderTypeLabel(o.order_type)}{o.table_name ? ` · ` : ''}<b><bdi>{o.table_name || ''}</bdi></b></span>
                  <span className="row" style={{ gap: 5 }}><Clock3 size={14} /> {ago(o.created_at)}</span>
                  {(o.customer_name || o.customer_mobile) && <span className="row" style={{ gap: 5 }}><UserRound size={14} /> <bdi>{o.customer_name || o.customer_mobile}</bdi></span>}
                </div>
                <div className="items">
                  {o.items.slice(0, 4).map((it, idx) => (
                    <div key={idx}><span><b>{formatQty(it.qty)}×</b> <bdi>{it.name}</bdi></span><span><Money value={it.total} /></span></div>
                  ))}
                  {o.items.length > 4 && <div className="faint">+ {o.items.length - 4} more item(s)</div>}
                </div>
                <div className="row">
                  <span className="muted small">{o.item_count} item(s)</span>
                  <span className="grow" />
                  <span className="tot"><Money value={o.total} /></span>
                </div>
                <div className="acts">
                  <Button variant="primary" icon={PlayCircle} className="grow" onClick={() => nav('/pos', { state: { orderId: o.id } })}>Retrieve</Button>
                  <Button icon={ChefHat} title="Print kitchen ticket (KOT)" loading={busy === `k${o.id}`} onClick={() => act(`k${o.id}`, () => api('print.kot', { orderId: o.id }), 'Kitchen ticket sent')} />
                  <Button icon={Printer} title="Print bill" loading={busy === `p${o.id}`} onClick={() => act(`p${o.id}`, () => api('print.receipt', { orderId: o.id }), 'Bill sent to printer')} />
                  <Button variant="danger-ghost" icon={XCircle} title="Cancel order" onClick={() => cancel(o)} />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
