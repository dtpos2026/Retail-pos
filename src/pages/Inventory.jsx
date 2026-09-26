import { useEffect, useMemo, useState } from 'react';
import { Boxes, PackagePlus, PackageMinus, ClipboardCheck, History, AlertTriangle, Wallet, PackageX } from 'lucide-react';
import { api } from '../lib/api';
import { useApp } from '../context/AppContext';
import { formatDateTime, formatQty, formatMoney } from '../lib/format';
import { PageHead, Button, Loading, Empty, Modal, Field, NumberInput, Input, SearchBox, Tabs, Stat, Badge, Money, Select } from '../components/ui';

const TYPE_LABEL = { opening: 'Opening', in: 'Stock In', out: 'Stock Out', adjust: 'Adjustment', sale: 'Sale', return: 'Refund return' };

export default function Inventory() {
  const { settings, toast, toastError, can, reloadSettings } = useApp();
  const [tab, setTab] = useState('stock');
  const [data, setData] = useState(null);
  const [moves, setMoves] = useState(null);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('');
  const [op, setOp] = useState(null);
  const cur = settings.general.currency;

  const load = () => api('inventory.summary').then(setData).catch(toastError);
  useEffect(() => {
    load();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (tab === 'history') api('inventory.movements', { limit: 1000 }).then(setMoves).catch(toastError);
  }, [tab]); // eslint-disable-line react-hooks/exhaustive-deps

  const rows = useMemo(() => {
    if (!data) return [];
    const s = search.trim().toLowerCase();
    return data.products.filter(
      (p) => (!s || p.name.toLowerCase().includes(s) || (p.sku || '').toLowerCase().includes(s)) && (!filter || (filter === 'low' ? p.stock_qty > 0 && p.stock_qty <= p.low_stock : p.stock_qty <= 0))
    );
  }, [data, search, filter]);

  const submit = async () => {
    try {
      await api('inventory.adjust', { productId: op.product.id, type: op.type, qty: op.qty, unitCost: op.unitCost, note: op.note });
      toast('Stock updated');
      setOp(null);
      load();
    } catch (e) {
      toastError(e);
    }
  };

  const enable = async () => {
    try {
      await api('settings.set', { section: 'inventory', values: { enabled: true } });
      await reloadSettings();
      load();
      toast('Inventory tracking enabled');
    } catch (e) {
      toastError(e);
    }
  };

  if (!data) return <Loading />;
  const OPS = { in: { title: 'Stock In (Purchase)', icon: PackagePlus }, out: { title: 'Stock Out (Waste / Use)', icon: PackageMinus }, adjust: { title: 'Adjust to Counted Stock', icon: ClipboardCheck } };

  return (
    <div className="col" style={{ gap: 16 }}>
      <PageHead title="Inventory" sub="Track stock in, stock out and adjustments. Sales reduce stock automatically." />
      {!settings.inventory.enabled && (
        <div className="card card-pad row" style={{ background: 'var(--warning-50)', borderColor: 'transparent' }}>
          <AlertTriangle color="var(--warning)" />
          <div className="grow"><b>Inventory tracking is off.</b> The POS works normally, but sales do not reduce stock.</div>
          {can('settings') && <Button variant="primary" onClick={enable}>Enable inventory</Button>}
        </div>
      )}
      <div className="grid grid-4">
        <Stat icon={Boxes} label="Tracked products" value={data.totals.items} color="#4f46e5" />
        <Stat icon={Wallet} label="Stock value (cost)" value={formatMoney(data.totals.stockValue, cur)} hint={`Sale value ${formatMoney(data.totals.saleValue, cur)}`} color="#16a34a" />
        <Stat icon={AlertTriangle} label="Low stock" value={data.totals.low} color="#d97706" />
        <Stat icon={PackageX} label="Out of stock" value={data.totals.out} color="#dc2626" />
      </div>
      <Tabs value={tab} onChange={setTab} tabs={[{ key: 'stock', label: 'Current Stock', icon: Boxes }, { key: 'history', label: 'Stock History', icon: History }]} />
      {tab === 'stock' ? (
        <>
          <div className="card card-pad row">
            <SearchBox value={search} onChange={setSearch} placeholder="Search product…" style={{ flex: 1 }} />
            <Select value={filter} onChange={(e) => setFilter(e.target.value)} style={{ width: 170 }} options={[{ value: '', label: 'All items' }, { value: 'low', label: 'Low stock' }, { value: 'out', label: 'Out of stock' }]} />
          </div>
          <div className="card">
            {rows.length === 0 ? (
              <Empty icon={Boxes} title="No tracked products" text="Turn on 'Track stock' for products you want to count." />
            ) : (
              <div className="table-wrap" style={{ maxHeight: 'calc(100vh - 430px)' }}>
                <table className="table">
                  <thead><tr><th>Product</th><th>Category</th><th className="num">Stock</th><th className="num">Low alert</th><th className="num">Cost</th><th className="num">Value</th><th /></tr></thead>
                  <tbody>
                    {rows.map((p) => (
                      <tr key={p.id}>
                        <td className="b"><bdi>{p.name}</bdi>{!p.active && <Badge>Inactive</Badge>}</td>
                        <td className="muted"><bdi>{p.category_name || '—'}</bdi></td>
                        <td className="num"><Badge color={p.stock_qty <= 0 ? 'red' : p.stock_qty <= p.low_stock ? 'amber' : 'green'}>{formatQty(p.stock_qty)} {p.unit}</Badge></td>
                        <td className="num muted">{formatQty(p.low_stock)}</td>
                        <td className="num"><Money value={p.cost_price} /></td>
                        <td className="num"><Money value={Math.max(0, p.stock_qty) * p.cost_price} /></td>
                        <td className="right nowrap">
                          <Button size="sm" variant="soft" icon={PackagePlus} onClick={() => setOp({ type: 'in', product: p, qty: '', unitCost: p.cost_price, note: '' })}>In</Button>{' '}
                          <Button size="sm" icon={PackageMinus} onClick={() => setOp({ type: 'out', product: p, qty: '', note: '' })}>Out</Button>{' '}
                          <Button size="sm" icon={ClipboardCheck} onClick={() => setOp({ type: 'adjust', product: p, qty: p.stock_qty, note: '' })}>Adjust</Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      ) : (
        <div className="card">
          {!moves ? (
            <Loading />
          ) : moves.length === 0 ? (
            <Empty icon={History} title="No stock movements yet" />
          ) : (
            <div className="table-wrap" style={{ maxHeight: 'calc(100vh - 360px)' }}>
              <table className="table">
                <thead><tr><th>Date / Time</th><th>Product</th><th>Type</th><th className="num">Qty</th><th className="num">Balance</th><th>Note</th><th>User</th></tr></thead>
                <tbody>
                  {moves.map((m) => (
                    <tr key={m.id}>
                      <td className="muted nowrap">{formatDateTime(m.created_at)}</td>
                      <td className="b"><bdi>{m.product_name}</bdi></td>
                      <td><Badge color={m.qty > 0 ? 'green' : 'red'}>{TYPE_LABEL[m.type] || m.type}</Badge></td>
                      <td className="num b" style={{ color: m.qty > 0 ? 'var(--success)' : 'var(--danger)' }}>{m.qty > 0 ? '+' : ''}{formatQty(m.qty)}</td>
                      <td className="num">{formatQty(m.balance)}</td>
                      <td className="muted">{m.note}</td>
                      <td className="muted">{m.user_name || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
      {op && (
        <Modal
          title={OPS[op.type].title}
          icon={OPS[op.type].icon}
          size="sm"
          onClose={() => setOp(null)}
          footer={<><Button onClick={() => setOp(null)}>Cancel</Button><Button variant="primary" onClick={submit}>Save</Button></>}
        >
          <div className="col">
            <div className="b"><bdi>{op.product.name}</bdi></div>
            <div className="muted small">Current stock: {formatQty(op.product.stock_qty)} {op.product.unit}</div>
            <Field label={op.type === 'adjust' ? 'Counted quantity' : 'Quantity'}>
              <NumberInput autoFocus selectOnFocus value={op.qty} onChange={(v) => setOp({ ...op, qty: v })} onKeyDown={(e) => e.key === 'Enter' && submit()} />
            </Field>
            {op.type === 'in' && (
              <Field label="Purchase cost per unit" hint="Updates the average cost price used for profit.">
                <NumberInput value={op.unitCost} onChange={(v) => setOp({ ...op, unitCost: v })} />
              </Field>
            )}
            <Field label="Note"><Input value={op.note} onChange={(e) => setOp({ ...op, note: e.target.value })} placeholder={op.type === 'in' ? 'e.g. Supplier bill #45' : op.type === 'out' ? 'e.g. Expired / damaged' : 'e.g. Monthly stock count'} /></Field>
          </div>
        </Modal>
      )}
    </div>
  );
}
