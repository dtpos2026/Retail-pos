import { useEffect, useMemo, useRef, useState } from 'react';
import { Banknote, CreditCard, Landmark, Wallet, CheckCircle2, Printer, Ticket } from 'lucide-react';
import { Modal, Button, Check, Seg } from '../ui';
import { useApp } from '../../context/AppContext';
import { formatMoney, calcPayment } from '../../lib/format';

const METHOD_ICONS = { cash: Banknote, card: CreditCard, bank: Landmark, other: Wallet };

export default function PaymentModal({ total, orderType, customerName, onClose, onComplete, busy }) {
  const { settings } = useApp();
  const cur = settings.general.currency;
  const methods = settings.payment.methods.filter((m) => m.enabled);
  const tokenCfg = settings.token;
  const tokenDefault = tokenCfg.enabled && tokenCfg.orderTypes.includes(orderType) ? tokenCfg.mode : 'none';

  const [method, setMethod] = useState(methods[0]?.key || 'cash');
  const [tendered, setTendered] = useState('');
  const [tokenMode, setTokenMode] = useState(tokenDefault);
  const [printReceipt, setPrintReceipt] = useState(settings.printer.autoPrintReceipt);
  const inputRef = useRef(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, [method]);

  const amount = tendered === '' ? total : Number(tendered) || 0;
  const pay = calcPayment(total, amount);

  const quick = useMemo(() => {
    const notes = settings.payment.quickCash || [100, 500, 1000, 5000];
    const set = new Set();
    for (const n of notes) {
      const v = Math.ceil(total / n) * n;
      if (v >= total) set.add(v);
    }
    return [...set].sort((a, b) => a - b).slice(0, 4);
  }, [total, settings.payment.quickCash]);

  const creditBlocked = pay.due > 0 && (!settings.sales.allowCredit || !customerName);
  const submit = () => {
    if (busy || creditBlocked) return;
    onComplete({ method, tendered: amount, tokenMode, printReceipt });
  };

  const onKey = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      submit();
    }
  };

  return (
    <Modal
      title="Payment"
      icon={Wallet}
      size="lg"
      onClose={busy ? undefined : onClose}
      footer={
        <>
          <Button onClick={onClose} disabled={busy}>Back to cart</Button>
          <Button variant="success" size="lg" icon={CheckCircle2} onClick={submit} loading={busy} disabled={creditBlocked} style={{ minWidth: 230 }}>
            Complete Sale <kbd>Enter</kbd>
          </Button>
        </>
      }
    >
      <div className="grid" style={{ gridTemplateColumns: '1fr 1fr', gap: 20 }}>
        <div className="col" style={{ gap: 14 }}>
          <div className="pay-total">
            <div className="l">Total Payable</div>
            <div className="v">{formatMoney(total, cur)}</div>
          </div>
          <div className="methods" style={{ gridTemplateColumns: `repeat(${Math.min(4, methods.length)}, 1fr)` }}>
            {methods.map((m) => {
              const Icon = METHOD_ICONS[m.key] || Wallet;
              return (
                <button key={m.key} className={`method ${method === m.key ? 'on' : ''}`} onClick={() => { setMethod(m.key); if (m.key !== 'cash') setTendered(''); }}>
                  <Icon size={22} />
                  {m.label}
                </button>
              );
            })}
          </div>
          {tokenCfg.enabled && (
            <div className="col" style={{ gap: 6 }}>
              <div className="label"><Ticket size={14} style={{ verticalAlign: -2 }} /> Token</div>
              <Seg
                value={tokenMode}
                onChange={setTokenMode}
                options={[
                  { value: 'combined', label: 'Combined' },
                  { value: 'item', label: 'Per Item' },
                  { value: 'none', label: 'No Token' },
                ]}
              />
            </div>
          )}
          <Check label={<span><Printer size={14} style={{ verticalAlign: -2 }} /> Print receipt</span>} checked={printReceipt} onChange={setPrintReceipt} />
        </div>

        <div className="col" style={{ gap: 14 }}>
          <div className="field">
            <label>Amount Received</label>
            <input
              ref={inputRef}
              className="input lg"
              type="number"
              inputMode="decimal"
              placeholder={String(total)}
              value={tendered}
              onChange={(e) => setTendered(e.target.value)}
              onKeyDown={onKey}
              onWheel={(e) => e.target.blur()}
            />
          </div>
          <div className="quick" style={{ gridTemplateColumns: `repeat(${quick.length + 1}, 1fr)` }}>
            <Button variant="soft" onClick={() => setTendered('')}>Exact</Button>
            {quick.map((q) => (
              <Button key={q} onClick={() => setTendered(String(q))}>{q.toLocaleString('en-PK')}</Button>
            ))}
          </div>
          <div className="change-box">
            <div>
              <div className="label">Change</div>
              <div className="v" style={{ color: 'var(--success)' }}>{formatMoney(pay.change, cur)}</div>
            </div>
            <div>
              <div className="label">Due (Credit)</div>
              <div className="v" style={{ color: pay.due > 0 ? 'var(--danger)' : 'var(--text-3)' }}>{formatMoney(pay.due, cur)}</div>
            </div>
          </div>
          {pay.due > 0 && (
            <div className="badge amber" style={{ whiteSpace: 'normal', padding: '9px 12px', borderRadius: 10 }}>
              {!settings.sales.allowCredit
                ? 'Credit sales are disabled. Receive the full amount.'
                : !customerName
                  ? 'Add the customer (name) to save this as a credit sale.'
                  : `${formatMoney(pay.due, cur)} will be recorded as due from ${customerName}.`}
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
}
