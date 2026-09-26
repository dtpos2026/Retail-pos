import { useEffect, useState } from 'react';
import { Ticket, ChefHat, BellRing, CheckCheck, Printer, RefreshCw, Undo2 } from 'lucide-react';
import { api } from '../lib/api';
import { useApp } from '../context/AppContext';
import { formatTime, formatQty, orderTypeLabel, today } from '../lib/format';
import { PageHead, Button, Loading, Empty, Input, Money } from '../components/ui';

const COLS = [
  { key: 'preparing', label: 'Preparing', icon: ChefHat, color: 'var(--warning)', next: 'ready', nextLabel: 'Mark ready' },
  { key: 'ready', label: 'Ready — call customer', icon: BellRing, color: 'var(--success)', next: 'served', nextLabel: 'Collected', prev: 'preparing' },
  { key: 'served', label: 'Collected / Served', icon: CheckCheck, color: 'var(--info)', prev: 'ready' },
];

export default function Tokens() {
  const { settings, toast, toastError, can, confirm } = useApp();
  const [date, setDate] = useState(today());
  const [rows, setRows] = useState(null);
  const [info, setInfo] = useState(null);

  const load = () => {
    api('tokens.list', { date }).then(setRows).catch(toastError);
    api('tokens.info').then(setInfo).catch(() => {});
  };
  useEffect(() => {
    load();
    const t = setInterval(load, 10000);
    return () => clearInterval(t);
  }, [date]); // eslint-disable-line react-hooks/exhaustive-deps

  const move = async (t, status) => {
    try {
      await api('tokens.setStatus', { id: t.id, status });
      load();
    } catch (e) {
      toastError(e);
    }
  };

  const reprint = (t) => api('print.tokens', { orderId: t.order_id }).then(() => toast(`Token #${t.token_no} sent to printer`)).catch(toastError);

  const resetCounter = async () => {
    if (!(await confirm({ title: 'Reset token counter?', message: 'The next token will start again from 1.', confirmText: 'Reset', danger: true }))) return;
    try {
      setInfo(await api('tokens.resetCounter'));
      toast('Token counter reset');
    } catch (e) {
      toastError(e);
    }
  };

  if (!settings.token.enabled) {
    return (
      <div className="card">
        <Empty icon={Ticket} title="Token system is off" text="Turn on tokens in Settings → Tokens to print token numbers for takeaway and delivery orders." />
      </div>
    );
  }

  return (
    <div className="col" style={{ gap: 16 }}>
      <PageHead title="Tokens" sub={info ? `Next token: #${info.nextToken} · ${settings.token.reset === 'daily' ? 'Resets daily' : 'Continuous numbering'}` : ''}>
        <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} style={{ width: 170 }} />
        <Button icon={RefreshCw} onClick={load}>Refresh</Button>
        {can('settings') && <Button onClick={resetCounter}>Reset counter</Button>}
      </PageHead>
      {!rows ? (
        <Loading />
      ) : rows.length === 0 ? (
        <div className="card"><Empty icon={Ticket} title="No tokens for this day" text="Tokens are generated when a takeaway or delivery order is paid." /></div>
      ) : (
        <div className="token-board">
          {COLS.map((col) => {
            const list = rows.filter((t) => t.status === col.key);
            return (
              <div key={col.key} className="token-col">
                <h3 style={{ color: col.color }}><col.icon size={18} /> {col.label} <span className="badge">{list.length}</span></h3>
                {list.length === 0 && <div className="faint small center" style={{ padding: 20 }}>No tokens</div>}
                {list.map((t) => (
                  <div key={t.id} className="token">
                    <div className="row">
                      <div className="no">#{t.token_no}</div>
                      <div className="grow" />
                      <div className="right small">
                        <div className="b">{t.order_no}</div>
                        <div className="faint">{orderTypeLabel(t.order_type)} · {formatTime(t.created_at)}</div>
                      </div>
                    </div>
                    <div className="small" style={{ margin: '8px 0' }}>
                      {t.items.map((i, idx) => (
                        <div key={idx}><b>{formatQty(i.qty)}×</b> <bdi>{i.name}</bdi>{i.notes && <span className="faint"> — <bdi>{i.notes}</bdi></span>}</div>
                      ))}
                    </div>
                    {t.customer_name && <div className="small faint"><bdi>{t.customer_name}</bdi></div>}
                    <div className="row" style={{ marginTop: 8 }}>
                      <span className="small b"><Money value={t.order_total ?? t.total} /></span>
                      <div className="grow" />
                      <Button size="sm" variant="ghost" icon={Printer} onClick={() => reprint(t)} title="Reprint" />
                      {col.prev && <Button size="sm" variant="ghost" icon={Undo2} onClick={() => move(t, col.prev)} title="Move back" />}
                      {col.next && <Button size="sm" variant={col.next === 'ready' ? 'success' : 'soft'} onClick={() => move(t, col.next)}>{col.nextLabel}</Button>}
                    </div>
                  </div>
                ))}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
