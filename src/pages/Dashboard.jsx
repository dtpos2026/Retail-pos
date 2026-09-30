import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Wallet, ReceiptText, TrendingUp, Banknote, CreditCard, Clock3, AlertTriangle, UtensilsCrossed, ShoppingBag, Bike, Armchair, ShoppingCart, RefreshCw, Percent,
} from 'lucide-react';
import { api } from '../lib/api';
import { useApp } from '../context/AppContext';
import { formatMoney, formatTime, formatQty, orderTypeLabel } from '../lib/format';
import { Stat, Loading, Empty, StatusBadge, Button, Money, PageHead } from '../components/ui';
import BarChart from '../components/BarChart';
import { HeroBanner } from '../components/Banner';

const DAY = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export default function Dashboard() {
  const { settings, toastError, can, user } = useApp();
  const [d, setD] = useState(null);
  const nav = useNavigate();
  const cur = settings.general.currency;
  const m = (v) => formatMoney(v, cur);

  const load = () => api('dashboard.summary').then(setD).catch(toastError);
  useEffect(() => {
    load();
    const t = setInterval(load, 60000);
    return () => clearInterval(t);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  if (!d) return <Loading />;
  const t = d.today;
  const typeTotal = t.dineIn + t.takeaway + t.delivery || 1;
  const greeting = new Date().getHours() < 12 ? 'Good morning' : new Date().getHours() < 17 ? 'Good afternoon' : 'Good evening';

  const hours = [];
  const openHours = d.hours.length ? d.hours.map((h) => h.hour) : [12];
  const from = Math.min(...openHours, 9);
  const to = Math.max(...openHours, 23);
  for (let h = from; h <= to; h++) {
    const v = d.hours.find((x) => x.hour === h)?.total || 0;
    hours.push({ label: h % 3 === 0 ? `${h % 12 || 12}${h < 12 ? 'a' : 'p'}` : '', tip: `${h % 12 || 12}:00 ${h < 12 ? 'AM' : 'PM'}`, value: v });
  }

  return (
    <div className="col" style={{ gap: 18 }}>
      <HeroBanner title={`${greeting}, ${user.name.split(' ')[0]}`} subtitle={settings.business.name && settings.business.name !== 'My Business' ? `Here is how ${settings.business.name} is doing today.` : 'Here is how your business is doing today.'}>
        <Button icon={RefreshCw} onClick={load} style={{ background: 'rgba(255,255,255,.16)', color: '#fff', borderColor: 'rgba(255,255,255,.3)' }}>Refresh</Button>
        {can('pos') && <Button icon={ShoppingCart} onClick={() => nav('/pos')} style={{ background: '#fff', color: 'var(--primary-600)', borderColor: '#fff' }}>New Sale</Button>}
      </HeroBanner>

      <div className="grid grid-4">
        <Stat hero icon={Wallet} label="Today's Sales" value={m(t.sales)} hint={`${t.orders} orders · avg ${m(t.avgOrder)}`} />
        <Stat icon={ReceiptText} label="Today's Orders" value={t.orders} hint={`${d.pendingOrders} pending / running`} color="#0ea5e9" />
        <Stat icon={TrendingUp} label="Today's Profit" value={t.profit === null ? '—' : m(t.profit)} hint={t.profit === null ? 'Add cost prices to see profit' : 'Sales minus cost price'} color="#16a34a" />
        <Stat icon={Clock3} label="Credit (Due)" value={m(t.credit)} hint="Unpaid amount today" color="#dc2626" />
      </div>

      <div className="grid grid-4">
        <Stat icon={Banknote} label="Cash" value={m(t.cash)} color="#16a34a" />
        <Stat icon={CreditCard} label="Card / Bank / Other" value={m(t.card + t.bank + t.other)} hint={`Card ${m(t.card)} · Bank ${m(t.bank)}`} color="#7c3aed" />
        <Stat icon={Percent} label="Discounts Given" value={m(t.discounts)} color="#d97706" />
        <Stat icon={Armchair} label="Tables Occupied" value={`${d.occupiedTables} / ${d.totalTables}`} hint={d.totalTables ? 'Dine-in running bills' : 'No tables set up'} color="#db2777" />
      </div>

      <div className="grid" style={{ gridTemplateColumns: '2fr 1fr' }}>
        <div className="card">
          <div className="card-head"><h3>Sales — last 7 days</h3></div>
          <div className="card-pad">
            <BarChart
              data={d.trend.map((x) => {
                const dt = new Date(x.date + 'T00:00:00');
                return { label: `${DAY[dt.getDay()]} ${dt.getDate()}`, value: x.total, tip: `${x.orders} orders` };
              })}
              format={m}
            />
          </div>
        </div>
        <div className="card">
          <div className="card-head"><h3>Sales by type (today)</h3></div>
          <div className="card-pad col" style={{ gap: 16 }}>
            {[
              { label: 'Dine-In', v: t.dineIn, icon: UtensilsCrossed },
              { label: 'Takeaway', v: t.takeaway, icon: ShoppingBag },
              { label: 'Delivery', v: t.delivery, icon: Bike },
            ].map((x) => (
              <div key={x.label}>
                <div className="row" style={{ marginBottom: 6 }}>
                  <x.icon size={16} className="muted" />
                  <span className="b">{x.label}</span>
                  <span className="grow" />
                  <span className="b">{m(x.v)}</span>
                  <span className="faint small" style={{ width: 38, textAlign: 'right' }}>{Math.round((x.v / typeTotal) * 100)}%</span>
                </div>
                <div className="progress"><div style={{ width: `${(x.v / typeTotal) * 100}%` }} /></div>
              </div>
            ))}
            <div className="hr" style={{ margin: 0 }} />
            <div className="small muted">Today by hour</div>
            <BarChart data={hours} height={110} format={m} empty="No sales today" />
          </div>
        </div>
      </div>

      <div className="grid grid-3">
        <div className="card" style={{ gridColumn: 'span 2' }}>
          <div className="card-head">
            <h3>Recent transactions</h3>
            <div className="actions">{can('orders') && <Button size="sm" variant="ghost" onClick={() => nav('/orders')}>View all</Button>}</div>
          </div>
          {d.recent.length === 0 ? (
            <Empty icon={ReceiptText} title="No transactions yet" text="Sales you make will appear here." />
          ) : (
            <div className="table-wrap">
              <table className="table">
                <thead><tr><th>Order</th><th>Type</th><th>Customer / Table</th><th>Time</th><th>Status</th><th className="num">Total</th></tr></thead>
                <tbody>
                  {d.recent.map((o) => (
                    <tr key={o.id}>
                      <td className="b">{o.order_no}</td>
                      <td>{orderTypeLabel(o.order_type)}</td>
                      <td><bdi>{o.table_name || o.customer_name || 'Walk-in'}</bdi></td>
                      <td className="muted">{formatTime(o.created_at)}</td>
                      <td><StatusBadge status={o.status === 'completed' && o.payment_status !== 'paid' ? o.payment_status : o.status} /></td>
                      <td className="num b"><Money value={o.total} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
        <div className="col" style={{ gap: 16 }}>
          <div className="card">
            <div className="card-head"><h3>Top selling (7 days)</h3></div>
            {d.topItems.length === 0 ? (
              <Empty icon={TrendingUp} title="No data yet" />
            ) : (
              d.topItems.map((it, i) => (
                <div key={i} className="list-item">
                  <div className="thumb" style={{ width: 30, height: 30, background: 'var(--primary-50)', color: 'var(--primary)', fontSize: 13 }}>{i + 1}</div>
                  <div className="grow ellipsis b"><bdi>{it.name}</bdi></div>
                  <div className="right">
                    <div className="b">{formatQty(it.qty)} sold</div>
                    <div className="small faint">{m(it.revenue)}</div>
                  </div>
                </div>
              ))
            )}
          </div>
          {d.inventoryOn && (
            <div className="card">
              <div className="card-head">
                <AlertTriangle size={17} color="var(--warning)" />
                <h3>Low stock ({d.lowStockCount})</h3>
                <div className="actions">{can('inventory') && <Button size="sm" variant="ghost" onClick={() => nav('/inventory')}>Manage</Button>}</div>
              </div>
              {d.lowStock.length === 0 ? (
                <div className="card-pad muted small">All items are well stocked.</div>
              ) : (
                d.lowStock.map((p) => (
                  <div key={p.id} className="list-item">
                    <div className="grow ellipsis"><bdi>{p.name}</bdi></div>
                    <span className={`badge ${p.stock_qty <= 0 ? 'red' : 'amber'}`}>{formatQty(p.stock_qty)} {p.unit}</span>
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
