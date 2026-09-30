import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ReceiptText, Printer, Ticket, Undo2, XCircle, PlayCircle, HandCoins, Eye, ImageDown, ChefHat } from 'lucide-react';
import { api } from '../lib/api';
import { useApp } from '../context/AppContext';
import { formatDateTime, formatMoney, formatQty, orderTypeLabel } from '../lib/format';
import { Modal, Button, Loading, StatusBadge, Field, NumberInput, Select } from './ui';
import ReceiptPreview from './ReceiptPreview';

export default function OrderDetail({ id, onClose, onChanged }) {
  const { settings, toast, toastError, confirm, can } = useApp();
  const [o, setO] = useState(null);
  const [pay, setPay] = useState(null);
  const [preview, setPreview] = useState(false);
  const [busy, setBusy] = useState('');
  const nav = useNavigate();
  const cur = settings.general.currency;
  const m = (v) => formatMoney(v, cur);
  const methods = settings.payment.methods.filter((x) => x.enabled);
  const methodLabel = (k) => settings.payment.methods.find((x) => x.key === k)?.label || k || '—';

  const load = () => api('orders.get', { id }).then(setO).catch(toastError);
  useEffect(() => {
    load();
  }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  const run = async (key, fn, msg) => {
    setBusy(key);
    try {
      await fn();
      if (msg) toast(msg);
      await load();
      onChanged?.();
    } catch (e) {
      toastError(e);
    } finally {
      setBusy('');
    }
  };

  if (!o) return <Modal title="Order" onClose={onClose}><Loading /></Modal>;

  const refund = async () => {
    const reason = await confirm({ title: `Refund ${o.order_no}?`, message: `The sale of ${m(o.total)} will be removed from sales totals${settings.inventory.enabled ? ' and stock will be returned' : ''}.`, confirmText: 'Refund', danger: true, input: 'Reason (optional)' });
    if (reason !== false) run('refund', () => api('orders.refund', { id: o.id, reason }), 'Order refunded');
  };
  const cancel = async () => {
    const reason = await confirm({ title: `Cancel ${o.order_no}?`, confirmText: 'Cancel order', danger: true, input: 'Reason (optional)' });
    if (reason !== false) run('cancel', () => api('orders.cancel', { id: o.id, reason }), 'Order cancelled');
  };

  return (
    <Modal
      title={`Order ${o.order_no}`}
      icon={ReceiptText}
      size="lg"
      onClose={onClose}
      footer={
        <>
          {o.status === 'completed' && can('refund') && <Button variant="danger-ghost" icon={Undo2} onClick={refund} loading={busy === 'refund'} style={{ marginRight: 'auto' }}>Refund</Button>}
          {o.status === 'pending' && <Button variant="danger-ghost" icon={XCircle} onClick={cancel} loading={busy === 'cancel'} style={{ marginRight: 'auto' }}>Cancel order</Button>}
          <Button icon={Eye} onClick={() => setPreview(true)}>Preview</Button>
          <Button icon={ImageDown} title="Save the receipt as a PNG image" loading={busy === 'png'} onClick={() => run('png', async () => { const r = await api('print.savePng', { kind: 'receipt', orderId: o.id }); if (!r.canceled) toast('Saved as PNG'); })}>PNG</Button>
          {o.status === 'pending' && <Button icon={ChefHat} loading={busy === 'kot'} onClick={() => run('kot', () => api('print.kot', { orderId: o.id }), 'Kitchen ticket sent')}>KOT</Button>}
          {o.tokens.length > 0 ? (
            <Button icon={Ticket} loading={busy === 'token'} onClick={() => run('token', () => api('print.tokens', { orderId: o.id }), 'Token sent to printer')}>Print token</Button>
          ) : (
            o.status === 'completed' && settings.token.enabled && <Button icon={Ticket} loading={busy === 'token'} onClick={() => run('token', async () => { await api('orders.addToken', { id: o.id }); await api('print.tokens', { orderId: o.id }); }, 'Token generated')}>Generate token</Button>
          )}
          <Button icon={Printer} loading={busy === 'print'} onClick={() => run('print', () => api('print.receipt', { orderId: o.id, reprint: o.status === 'completed' }), 'Receipt sent to printer')}>{o.status === 'pending' ? 'Print bill' : 'Reprint'}</Button>
          {o.status === 'pending' && can('pos') && <Button variant="primary" icon={PlayCircle} onClick={() => { onClose(); nav('/pos', { state: { orderId: o.id } }); }}>Open in POS</Button>}
          {o.status === 'completed' && o.due > 0 && <Button variant="primary" icon={HandCoins} onClick={() => setPay({ amount: o.due, method: methods[0]?.key })}>Receive due</Button>}
        </>
      }
    >
      <div className="grid" style={{ gridTemplateColumns: '1.5fr 1fr', gap: 18 }}>
        <div>
          <div className="row wrap" style={{ marginBottom: 12 }}>
            <StatusBadge status={o.status} />
            {o.status === 'completed' && <StatusBadge status={o.payment_status} />}
            <span className="badge">{orderTypeLabel(o.order_type)}</span>
            {o.token_no && <span className="badge indigo">Token #{o.token_no}</span>}
          </div>
          <div className="table-wrap card" style={{ maxHeight: 300 }}>
            <table className="table">
              <thead><tr><th>Item</th><th className="num">Qty</th><th className="num">Price</th><th className="num">Total</th></tr></thead>
              <tbody>
                {o.items.map((i) => (
                  <tr key={i.id}>
                    <td><bdi>{i.name}</bdi>{i.notes && <div className="small faint"><bdi>{i.notes}</bdi></div>}{i.discount > 0 && <div className="small" style={{ color: 'var(--success)' }}>Discount −{m(i.discount)}</div>}</td>
                    <td className="num">{formatQty(i.qty)}</td>
                    <td className="num">{m(i.unit_price)}</td>
                    <td className="num b">{m(i.total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {o.notes && <div className="mt small"><b>Note:</b> <bdi>{o.notes}</bdi></div>}
          {o.cancel_reason && <div className="mt small" style={{ color: 'var(--danger)' }}><b>Reason:</b> {o.cancel_reason}</div>}
        </div>
        <div className="col" style={{ gap: 12 }}>
          <div className="kv small">
            <div>Date</div><div>{formatDateTime(o.created_at)}</div>
            <div>Cashier</div><div>{o.cashier_name}</div>
            {o.table_name && (<><div>Table</div><div><bdi>{o.table_name}</bdi></div></>)}
            {o.customer_name && (<><div>Customer</div><div><bdi>{o.customer_name}</bdi></div></>)}
            {o.customer_mobile && (<><div>Mobile</div><div>{o.customer_mobile}</div></>)}
            {o.customer_address && (<><div>Address</div><div><bdi>{o.customer_address}</bdi></div></>)}
            <div>Payment</div><div>{methodLabel(o.payment_method)}{o.payment_bank ? <div className="small muted">{o.payment_bank}</div> : null}</div>
          </div>
          <div className="card card-pad" style={{ background: 'var(--surface-2)' }}>
            <div className="tline"><span>Subtotal</span><span>{m(o.subtotal)}</span></div>
            {o.item_discount + o.order_discount > 0 && <div className="tline"><span>Discount</span><span>− {m(o.item_discount + o.order_discount)}</span></div>}
            {o.tax_amount > 0 && <div className="tline"><span>Tax ({o.tax_rate}%)</span><span>{m(o.tax_amount)}</span></div>}
            {o.delivery_charges > 0 && <div className="tline"><span>Delivery</span><span>{m(o.delivery_charges)}</span></div>}
            {o.round_off !== 0 && <div className="tline"><span>Round off</span><span>{o.round_off}</span></div>}
            <div className="tline total" style={{ fontSize: 19 }}><span>Total</span><span>{m(o.total)}</span></div>
            {o.status !== 'pending' && (
              <>
                <div className="tline"><span>Paid</span><span>{m(o.paid)}</span></div>
                {o.change_amount > 0 && <div className="tline"><span>Change given</span><span>{m(o.change_amount)}</span></div>}
                {o.due > 0 && <div className="tline b" style={{ color: 'var(--danger)' }}><span>Due</span><span>{m(o.due)}</span></div>}
              </>
            )}
          </div>
          {o.payments.length > 1 && (
            <div className="small">
              <div className="label" style={{ marginBottom: 4 }}>Payments</div>
              {o.payments.map((p) => (
                <div key={p.id} className="tline"><span>{formatDateTime(p.created_at)} · {methodLabel(p.method)}</span><span>{m(p.amount)}</span></div>
              ))}
            </div>
          )}
        </div>
      </div>

      {pay && (
        <Modal
          title="Receive Due Payment"
          icon={HandCoins}
          size="sm"
          onClose={() => setPay(null)}
          footer={
            <>
              <Button onClick={() => setPay(null)}>Cancel</Button>
              <Button variant="primary" loading={busy === 'pay'} onClick={() => run('pay', () => api('orders.receivePayment', { id: o.id, amount: pay.amount, method: pay.method }), 'Payment received').then(() => setPay(null))}>Receive</Button>
            </>
          }
        >
          <div className="col">
            <div className="muted">Outstanding: <b>{m(o.due)}</b></div>
            <Field label="Amount"><NumberInput autoFocus selectOnFocus value={pay.amount} onChange={(v) => setPay({ ...pay, amount: v })} /></Field>
            <Field label="Method"><Select value={pay.method} onChange={(e) => setPay({ ...pay, method: e.target.value })} options={methods.map((x) => ({ value: x.key, label: x.label }))} /></Field>
          </div>
        </Modal>
      )}
      {preview && (
        <Modal title="Receipt Preview" size="sm" onClose={() => setPreview(false)}>
          <ReceiptPreview args={{ orderId: o.id }} />
        </Modal>
      )}
    </Modal>
  );
}
