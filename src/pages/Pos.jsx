import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  UtensilsCrossed, ShoppingBag, Bike, Armchair, UserRound, PauseCircle, Percent, Plus, Minus, Trash2, FilePlus2,
  CreditCard, Printer, Save, X, ScanBarcode, PlusSquare, StickyNote, ShoppingCart, LayoutGrid, CheckCircle2,
} from 'lucide-react';
import { api } from '../lib/api';
import { useApp } from '../context/AppContext';
import { usePos, cartFromOrder } from '../context/PosContext';
import { calcOrder, formatMoney, formatQty, initials, round2 } from '../lib/format';
import { Button, Seg, Empty, NumberInput, Loading } from '../components/ui';
import { PromoBanner } from '../components/Banner';
import { CategoryIcon } from '../components/CategoryIcon';
import PaymentModal from '../components/pos/PaymentModal';
import { ItemModal, DiscountModal, CustomerModal, TableModal, HeldOrdersModal, CustomItemModal } from '../components/pos/PosModals';

const TYPE_OPTIONS = [
  { value: 'dine_in', label: 'Dine-In', icon: UtensilsCrossed, key: 'enableDineIn' },
  { value: 'takeaway', label: 'Takeaway', icon: ShoppingBag, key: 'enableTakeaway' },
  { value: 'delivery', label: 'Delivery', icon: Bike, key: 'enableDelivery' },
];

export default function Pos() {
  const { settings, toast, toastError, confirm, can } = useApp();
  const { cart, dispatch } = usePos();
  const nav = useNavigate();
  const loc = useLocation();
  const cur = settings.general.currency;
  const sales = settings.sales;
  const inv = settings.inventory;

  const [cats, setCats] = useState([]);
  const [products, setProducts] = useState(null);
  const [cat, setCat] = useState(null);
  const [q, setQ] = useState('');
  const [modal, setModal] = useState(null);
  const [busy, setBusy] = useState(false);
  const [lastSale, setLastSale] = useState(null);
  const [heldCount, setHeldCount] = useState(0);
  const searchRef = useRef(null);

  const types = TYPE_OPTIONS.filter((t) => sales[t.key]);

  const loadHeld = useCallback(() => api('orders.pending').then((r) => setHeldCount(r.length)).catch(() => {}), []);
  useEffect(() => {
    loadHeld();
  }, [loadHeld, cart.orderId]);

  const loadProducts = useCallback(() => api('products.list', { activeOnly: true }).then(setProducts).catch(toastError), [toastError]);

  useEffect(() => {
    api('categories.list', { activeOnly: true }).then(setCats).catch(toastError);
    loadProducts();
  }, [loadProducts, toastError]);

  // Make sure the cart's order type is still enabled.
  useEffect(() => {
    if (!cart.items.length && !cart.orderId && !types.some((t) => t.value === cart.orderType)) {
      const def = types.find((t) => t.value === sales.defaultOrderType) || types[0];
      if (def) dispatch({ type: 'set', patch: { orderType: def.value } });
    }
  }, [cart.items.length, cart.orderId, cart.orderType, types, sales.defaultOrderType, dispatch]);

  const newOrder = useCallback(
    (orderType) => {
      const t = orderType || (types.some((x) => x.value === sales.defaultOrderType) ? sales.defaultOrderType : types[0]?.value);
      dispatch({ type: 'reset', orderType: t, deliveryCharges: t === 'delivery' ? sales.defaultDeliveryCharges : 0 });
      setTimeout(() => searchRef.current?.focus(), 0);
    },
    [dispatch, sales, types]
  );

  const openOrder = useCallback(
    async (orderId) => {
      try {
        const o = await api('orders.get', { id: orderId });
        if (o.status !== 'pending') {
          toast(`${o.order_no} is already ${o.status}.`, 'warn');
          return;
        }
        dispatch({ type: 'load', cart: cartFromOrder(o) });
        setModal(null);
      } catch (e) {
        toastError(e);
      }
    },
    [dispatch, toast, toastError]
  );

  // Navigation from Tables / Orders screens.
  useEffect(() => {
    const st = loc.state;
    if (!st) return;
    nav('.', { replace: true, state: null });
    (async () => {
      if (cart.items.length && !cart.orderId && !(await confirm({ title: 'Replace current cart?', message: 'The current cart has items that are not saved.', confirmText: 'Discard cart', danger: true }))) return;
      if (st.orderId) openOrder(st.orderId);
      else if (st.table) {
        dispatch({ type: 'reset', orderType: 'dine_in' });
        dispatch({ type: 'set', patch: { table: st.table } });
      }
    })();
  }, [loc.state]); // eslint-disable-line react-hooks/exhaustive-deps

  // ---- totals -------------------------------------------------------------
  const itemsNet = useMemo(() => round2(cart.items.reduce((s, i) => s + i.qty * (i.unitPrice - Math.min(i.unitPrice, i.unitDiscount || 0)), 0)), [cart.items]);
  const orderDiscount = cart.discountMode === 'percent' ? round2((itemsNet * (Number(cart.discountValue) || 0)) / 100) : cart.orderDiscount;
  const totals = useMemo(
    () =>
      calcOrder({
        items: cart.items,
        orderDiscount,
        deliveryCharges: cart.orderType === 'delivery' ? cart.deliveryCharges : 0,
        taxEnabled: sales.taxEnabled,
        taxRate: sales.taxRate,
        roundTotal: sales.roundTotal,
      }),
    [cart.items, orderDiscount, cart.orderType, cart.deliveryCharges, sales]
  );

  // ---- products ---------------------------------------------------------------
  const filtered = useMemo(() => {
    if (!products) return [];
    const s = q.trim().toLowerCase();
    return products.filter((p) => (!cat || p.category_id === cat) && (!s || p.name.toLowerCase().includes(s) || (p.sku || '').toLowerCase().includes(s) || p.barcode === q.trim()));
  }, [products, cat, q]);

  const qtyInCart = useMemo(() => {
    const m = {};
    for (const i of cart.items) if (i.productId) m[i.productId] = (m[i.productId] || 0) + i.qty;
    return m;
  }, [cart.items]);

  const addProduct = useCallback(
    (p) => {
      if (inv.enabled && !inv.allowNegative && p.track_stock && (qtyInCart[p.id] || 0) + 1 > p.stock_qty) {
        toast(`Only ${formatQty(p.stock_qty)} ${p.unit} of "${p.name}" in stock.`, 'warn');
        return;
      }
      setLastSale(null);
      dispatch({ type: 'add', product: p });
    },
    [dispatch, inv, qtyInCart, toast]
  );

  const onSearchKey = async (e) => {
    if (e.key === 'Escape') setQ('');
    if (e.key !== 'Enter') return;
    const code = q.trim();
    if (!code) return;
    // Barcode scanners type the code and press Enter.
    try {
      const p = await api('products.findByCode', { code });
      if (p) {
        addProduct(p);
        setQ('');
        return;
      }
    } catch {
      /* fall through */
    }
    if (filtered.length === 1) {
      addProduct(filtered[0]);
      setQ('');
    } else if (!filtered.length) toast(`No product found for "${code}"`, 'warn');
  };

  // ---- actions ---------------------------------------------------------------------
  const payload = (action, extra = {}) => ({
    id: cart.orderId,
    orderType: cart.orderType,
    tableId: cart.table?.id,
    customer: cart.customer,
    items: cart.items.map((i) => ({ productId: i.productId, name: i.name, qty: i.qty, unitPrice: i.unitPrice, unitDiscount: i.unitDiscount, notes: i.notes })),
    orderDiscount,
    deliveryCharges: cart.deliveryCharges,
    notes: cart.notes,
    action,
    ...extra,
  });

  const validate = () => {
    if (!cart.items.length) return toast('Cart is empty. Add items first.', 'warn'), false;
    if (cart.orderType === 'dine_in' && !cart.table) return setModal('table'), false;
    if (cart.orderType === 'delivery' && (!cart.customer.name || !cart.customer.mobile || !cart.customer.address)) return setModal('customer'), false;
    return true;
  };

  const hold = async (printBill = false) => {
    if (!validate() || busy) return;
    setBusy(true);
    try {
      const o = await api('orders.save', payload('hold'));
      if (printBill) {
        api('print.receipt', { orderId: o.id }).then(() => toast('Bill sent to printer')).catch(toastError);
        dispatch({ type: 'load', cart: cartFromOrder(o) });
      } else {
        toast(cart.orderType === 'dine_in' ? `Order saved to ${o.table_name}` : `Order ${o.order_no} held`);
        newOrder(cart.orderType);
        loadHeld();
      }
    } catch (e) {
      toastError(e);
    } finally {
      setBusy(false);
    }
  };

  const openPayment = () => {
    if (validate()) setModal('pay');
  };

  const complete = async ({ method, tendered, tokenMode, printReceipt }) => {
    setBusy(true);
    try {
      const o = await api('orders.save', payload('pay', { payment: { method, tendered }, tokenMode }));
      setModal(null);
      setLastSale(o);
      newOrder(cart.orderType);
      if (inv.enabled) loadProducts();
      toast(`${o.order_no} completed${o.change_amount > 0 ? ` — Change ${formatMoney(o.change_amount, cur)}` : ''}${o.token_no ? ` — Token #${o.token_no}` : ''}`);
      api('print.afterSale', { orderId: o.id, receipt: printReceipt })
        .then((r) => r.errors.length && toast(`${r.errors.join('\n')}\nYou can reprint from Orders.`, 'error', 7000))
        .catch(toastError);
    } catch (e) {
      toastError(e);
    } finally {
      setBusy(false);
    }
  };

  const cancelHeld = async () => {
    const reason = await confirm({ title: `Cancel ${cart.orderNo}?`, message: 'The order will be marked as cancelled and the table will be freed.', confirmText: 'Cancel order', danger: true, input: 'Reason (optional)' });
    if (reason === false) return;
    try {
      await api('orders.cancel', { id: cart.orderId, reason });
      toast(`${cart.orderNo} cancelled`);
      newOrder();
    } catch (e) {
      toastError(e);
    }
  };

  const clearCart = async () => {
    if (!cart.items.length && !cart.orderId) return;
    if (cart.orderId) return newOrder();
    if (await confirm({ title: 'Clear cart?', message: 'All items will be removed.', confirmText: 'Clear', danger: true })) newOrder(cart.orderType);
  };

  const setType = (t) => {
    const patch = { orderType: t };
    if (t !== 'dine_in') patch.table = null;
    if (t === 'delivery' && !cart.deliveryCharges) patch.deliveryCharges = sales.defaultDeliveryCharges;
    dispatch({ type: 'set', patch });
    if (t === 'dine_in' && !cart.table) setModal('table');
    if (t === 'delivery' && !cart.customer.mobile) setModal('customer');
  };

  // ---- keyboard shortcuts ------------------------------------------------------
  useEffect(() => {
    const onKey = (e) => {
      if (modal) return;
      const inInput = ['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName) && document.activeElement !== searchRef.current;
      const k = e.key;
      const map = {
        F2: () => searchRef.current?.focus(),
        F3: () => newOrder(),
        F4: () => setModal('customer'),
        F6: () => can('discount') && setModal('discount'),
        F7: () => setModal('held'),
        F8: () => hold(false),
        F9: () => openPayment(),
        F10: () => cart.orderType === 'dine_in' && hold(true),
      };
      if (map[k]) {
        e.preventDefault();
        map[k]();
        return;
      }
      if (e.ctrlKey && k === 'Enter') {
        e.preventDefault();
        openPayment();
        return;
      }
      if (inInput || !cart.selected) return;
      if (k === 'Delete') dispatch({ type: 'remove', key: cart.selected });
      else if ((k === '+' || k === '=') && document.activeElement !== searchRef.current) dispatch({ type: 'inc', key: cart.selected, by: 1 });
      else if (k === '-' && document.activeElement !== searchRef.current) dispatch({ type: 'inc', key: cart.selected, by: -1 });
      else if (k === 'ArrowUp' || k === 'ArrowDown') {
        const idx = cart.items.findIndex((i) => i.key === cart.selected);
        const next = cart.items[idx + (k === 'ArrowUp' ? -1 : 1)];
        if (next) {
          e.preventDefault();
          dispatch({ type: 'select', key: next.key });
        }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  useEffect(() => {
    searchRef.current?.focus();
  }, []);

  const selectedItem = cart.items.find((i) => i.key === modal?.item);
  const gridSize = settings.general.posGridSize || 'medium';

  return (
    <div className={`pos ${settings.general.showImagesOnPos ? '' : 'no-images'}`}>
      {/* ------------------------------------------------------------ products */}
      <div className="pos-left">
        <div className="pos-toolbar">
          <div className="input-icon pos-search">
            <ScanBarcode size={19} />
            <input ref={searchRef} className="input" placeholder="Search product or scan barcode…  (F2)" value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={onSearchKey} />
          </div>
          <Button icon={PlusSquare} onClick={() => setModal('custom')} title="Sell an item that is not in the list">Open Item</Button>
        </div>
        <PromoBanner />
        <div className="cats">
          <button className={`cat-chip ${!cat ? 'on' : ''}`} style={!cat ? { background: 'var(--text)' } : undefined} onClick={() => setCat(null)}>
            <LayoutGrid size={16} /> All
          </button>
          {cats.map((c) => (
            <button key={c.id} className={`cat-chip ${cat === c.id ? 'on' : ''}`} style={cat === c.id ? { background: c.color } : undefined} onClick={() => setCat(c.id)}>
              {cat === c.id ? <CategoryIcon name={c.icon} size={16} /> : <span className="dot" style={{ background: c.color }} />}
              <bdi>{c.name}</bdi>
            </button>
          ))}
        </div>
        {!products ? (
          <Loading />
        ) : filtered.length === 0 ? (
          <Empty
            icon={ShoppingCart}
            title={products.length ? 'No matching products' : 'No products yet'}
            text={products.length ? 'Try another search or category.' : 'Add your products to start billing.'}
            action={!products.length && can('products') && <Button variant="primary" onClick={() => nav('/products')}>Add Products</Button>}
          />
        ) : (
          <div className={`products ${gridSize}`}>
            {filtered.map((p) => {
              const tracked = inv.enabled && p.track_stock;
              const out = tracked && p.stock_qty <= 0;
              const low = tracked && !out && p.stock_qty <= p.low_stock;
              const blocked = out && !inv.allowNegative;
              return (
                <button key={p.id} className={`pcard ${blocked ? 'disabled' : ''}`} style={{ '--cat': p.category_color || '#6366f1' }} onClick={() => !blocked && addProduct(p)}>
                  <div className="img">
                    {p.image_url ? (
                      <img src={p.image_url} alt="" loading="lazy" draggable={false} />
                    ) : (
                      <div className="initials" style={{ background: `linear-gradient(135deg, ${p.category_color || '#6366f1'}, ${p.category_color || '#6366f1'}bb)` }}>{initials(p.name)}</div>
                    )}
                  </div>
                  {qtyInCart[p.id] > 0 && <span className="qty-badge">{formatQty(qtyInCart[p.id])}</span>}
                  {tracked && <span className={`stock ${out ? 'out' : low ? 'low' : ''}`}>{out ? 'Out' : formatQty(p.stock_qty)}</span>}
                  <div className="body">
                    <div className="name"><bdi>{p.name}</bdi></div>
                    <div className="price">
                      {p.discount > 0 && <s className="faint small" style={{ fontWeight: 500, marginRight: 5 }}>{formatMoney(p.sale_price, '')}</s>}
                      {formatMoney(p.sale_price - (p.discount || 0), cur)}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* ------------------------------------------------------------ cart */}
      <div className="cart">
        <div className="cart-head">
          <div className="row">
            <Seg value={cart.orderType} onChange={setType} options={types.map((t) => ({ value: t.value, label: t.label, icon: t.icon }))} />
            <div className="grow" />
            <Button variant="ghost" size="sm" icon={FilePlus2} onClick={() => newOrder()} title="New order (F3)" />
          </div>
          <div className="row">
            {cart.orderType === 'dine_in' && (
              <Button size="sm" variant={cart.table ? 'soft' : undefined} icon={Armchair} onClick={() => setModal('table')}>
                <bdi>{cart.table ? cart.table.name : 'Select table'}</bdi>
              </Button>
            )}
            <Button size="sm" variant={cart.customer.name ? 'soft' : undefined} icon={UserRound} onClick={() => setModal('customer')} title="Customer (F4)" className="grow" style={{ justifyContent: 'flex-start', overflow: 'hidden' }}>
              <span className="ellipsis"><bdi>{cart.customer.name || cart.customer.mobile || (cart.orderType === 'delivery' ? 'Add delivery customer' : 'Walk-in customer')}</bdi></span>
            </Button>
            <Button size="sm" icon={PauseCircle} onClick={() => setModal('held')} title="Held & running orders (F7) — full list in the sidebar: Hold / Running">
              Held{heldCount > 0 && <span className="badge amber" style={{ padding: '0 7px' }}>{heldCount}</span>}
            </Button>
          </div>
          {cart.orderNo && (
            <div className="row small">
              <span className="badge amber">Editing {cart.orderNo}</span>
              <div className="grow" />
              <Button size="sm" variant="danger-ghost" icon={X} onClick={cancelHeld}>Cancel order</Button>
            </div>
          )}
          {cart.orderType === 'delivery' && cart.customer.address && <div className="small muted ellipsis">📍 <bdi>{cart.customer.address}</bdi></div>}
        </div>

        <div className="cart-items">
          {cart.items.length === 0 ? (
            lastSale ? (
              <div className="sale-success">
                <div className="confetti">
                  {Array.from({ length: 16 }, (_, i) => (
                    <i key={i} style={{ background: ['#16a34a', 'var(--primary)', '#f59e0b', '#ef4444', '#0ea5e9'][i % 5], '--x': `${Math.cos((i / 16) * 6.283) * (90 + (i % 3) * 30)}px`, '--y': `${Math.sin((i / 16) * 6.283) * (70 + (i % 4) * 22)}px`, '--rot': `${i * 47}deg`, animationDelay: `${(i % 4) * 30}ms` }} />
                  ))}
                </div>
                <div className="badge-ok">
                  <svg viewBox="0 0 84 84"><circle cx="42" cy="42" r="40" /><path d="M24 43l13 13 24-27" /></svg>
                </div>
                <h4>{lastSale.order_no} completed</h4>
                <div className="muted">Total {formatMoney(lastSale.total, cur)} · Received {formatMoney(lastSale.paid + lastSale.change_amount, cur)}</div>
                {lastSale.change_amount > 0 && <div className="change">Change {formatMoney(lastSale.change_amount, cur)}</div>}
                {lastSale.token_no && <div className="badge indigo" style={{ fontSize: 16, padding: '5px 14px' }}>Token #{lastSale.token_no}</div>}
                <div className="row wrap" style={{ marginTop: 10, justifyContent: 'center' }}>
                  <Button size="sm" icon={Printer} onClick={() => api('print.receipt', { orderId: lastSale.id, reprint: true }).then(() => toast('Receipt sent to printer')).catch(toastError)}>Print receipt</Button>
                  {lastSale.token_no && <Button size="sm" onClick={() => api('print.tokens', { orderId: lastSale.id }).then(() => toast('Token sent to printer')).catch(toastError)}>Print token</Button>}
                  <Button size="sm" onClick={() => api('print.savePng', { kind: 'receipt', orderId: lastSale.id }).then((r) => !r.canceled && toast('Saved as PNG')).catch(toastError)}>Save PNG</Button>
                </div>
                <div className="faint small" style={{ marginTop: 8 }}>Ready for the next customer</div>
              </div>
            ) : (
              <Empty icon={ShoppingCart} title="Cart is empty" text="Click a product or scan a barcode to add it." />
            )
          ) : (
            cart.items.map((i) => {
              const line = round2(i.qty * (i.unitPrice - Math.min(i.unitPrice, i.unitDiscount || 0)));
              return (
                <div key={i.key} className={`citem ${cart.selected === i.key ? 'sel' : ''}`} onClick={() => dispatch({ type: 'select', key: i.key })} onDoubleClick={() => setModal({ item: i.key })}>
                  <div className="grow">
                    <div className="nm"><bdi>{i.name}</bdi></div>
                    <div className="sub">
                      {formatMoney(i.unitPrice, cur)}
                      {i.unitDiscount > 0 && <span style={{ color: 'var(--success)' }}> · −{formatMoney(i.unitDiscount, '')} each</span>}
                      {i.notes && <span> · <StickyNote size={11} /> <bdi>{i.notes}</bdi></span>}
                    </div>
                  </div>
                  <div className="stepper" onClick={(e) => e.stopPropagation()}>
                    <button onClick={() => dispatch({ type: 'inc', key: i.key, by: -1 })}><Minus size={14} /></button>
                    <span onClick={() => setModal({ item: i.key })} style={{ cursor: 'pointer' }}>{formatQty(i.qty)}</span>
                    <button onClick={() => dispatch({ type: 'inc', key: i.key, by: 1 })}><Plus size={14} /></button>
                  </div>
                  <div className="tot">{formatMoney(line, '')}</div>
                  <Button variant="ghost" size="sm" icon={Trash2} onClick={(e) => { e.stopPropagation(); dispatch({ type: 'remove', key: i.key }); }} title="Remove (Del)" />
                </div>
              );
            })
          )}
        </div>

        <div className="cart-foot">
          <div className="tline"><span>Subtotal ({cart.items.length} items)</span><span>{formatMoney(totals.subtotal, cur)}</span></div>
          {totals.totalDiscount > 0 && (
            <div className="tline" style={{ color: 'var(--success)' }}>
              <span>Discount{cart.discountMode === 'percent' && cart.discountValue ? ` (${cart.discountValue}%)` : ''}</span>
              <span>− {formatMoney(totals.totalDiscount, cur)}</span>
            </div>
          )}
          {totals.tax > 0 && <div className="tline"><span>{sales.taxLabel} ({sales.taxRate}%)</span><span>{formatMoney(totals.tax, cur)}</span></div>}
          {cart.orderType === 'delivery' && (
            <div className="tline" style={{ alignItems: 'center' }}>
              <span>Delivery charges</span>
              <NumberInput style={{ width: 100, height: 30, textAlign: 'right' }} value={cart.deliveryCharges} onChange={(v) => dispatch({ type: 'set', patch: { deliveryCharges: Number(v) || 0 } })} />
            </div>
          )}
          {totals.roundOff !== 0 && <div className="tline small"><span>Round off</span><span>{totals.roundOff > 0 ? '+' : ''}{totals.roundOff}</span></div>}
          <div className="tline total"><span>Total</span><span>{formatMoney(totals.total, cur)}</span></div>
          <div className="row" style={{ marginTop: 8, gap: 6 }}>
            {can('discount') && <Button size="sm" icon={Percent} onClick={() => setModal('discount')} disabled={!cart.items.length}>Discount <kbd>F6</kbd></Button>}
            <Button size="sm" icon={StickyNote} onClick={async () => {
              const n = await confirm({ title: 'Order note', input: 'e.g. Pack separately', confirmText: 'Save' });
              if (n !== false) dispatch({ type: 'set', patch: { notes: n } });
            }}>{cart.notes ? 'Note ✓' : 'Note'}</Button>
            <div className="grow" />
            <Button size="sm" variant="danger-ghost" icon={Trash2} onClick={clearCart} disabled={!cart.items.length && !cart.orderId}>Clear</Button>
          </div>
          <div className="pay-actions">
            {cart.orderType === 'dine_in' ? (
              <Button size="lg" icon={Printer} onClick={() => hold(true)} disabled={busy || !cart.items.length} title="Save and print bill (F10)">Bill</Button>
            ) : (
              <span />
            )}
            <Button size="lg" icon={Save} onClick={() => hold(false)} disabled={busy || !cart.items.length} title="Save / hold order (F8)">{cart.orderType === 'dine_in' ? 'Save' : 'Hold'}</Button>
            <Button size="lg" variant="primary" icon={CreditCard} onClick={openPayment} disabled={busy || !cart.items.length} title="Payment (F9)">
              Pay <kbd>F9</kbd>
            </Button>
          </div>
        </div>
      </div>

      {/* ------------------------------------------------------------ modals */}
      {modal === 'pay' && (
        <PaymentModal total={totals.total} orderType={cart.orderType} customerName={cart.customer.name} busy={busy} onClose={() => setModal(null)} onComplete={complete} />
      )}
      {selectedItem && (
        <ItemModal
          item={selectedItem}
          canDiscount={can('discount')}
          onClose={() => setModal(null)}
          onRemove={() => { dispatch({ type: 'remove', key: selectedItem.key }); setModal(null); }}
          onSave={(patch) => { dispatch({ type: 'update', key: selectedItem.key, patch }); setModal(null); }}
        />
      )}
      {modal === 'discount' && (
        <DiscountModal cart={cart} subtotal={itemsNet} onClose={() => setModal(null)} onSave={(patch) => { dispatch({ type: 'set', patch }); setModal(null); }} />
      )}
      {modal === 'customer' && (
        <CustomerModal customer={cart.customer} required={cart.orderType === 'delivery'} onClose={() => setModal(null)} onSave={(c) => { dispatch({ type: 'set', patch: { customer: c } }); setModal(null); }} />
      )}
      {modal === 'table' && (
        <TableModal current={cart.table} onClose={() => setModal(null)} onPick={(t) => {
          if (t.status === 'occupied' && t.current_order_id && t.current_order_id !== cart.orderId) return openOrder(t.current_order_id);
          dispatch({ type: 'set', patch: { table: { id: t.id, name: t.name }, orderType: 'dine_in' } });
          setModal(null);
        }} />
      )}
      {modal === 'held' && <HeldOrdersModal onClose={() => setModal(null)} onOpen={openOrder} />}
      {modal === 'custom' && (
        <CustomItemModal onClose={() => setModal(null)} onAdd={(it) => { dispatch({ type: 'addCustom', ...it }); setModal(null); }} />
      )}
    </div>
  );
}
