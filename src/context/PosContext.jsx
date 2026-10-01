import { createContext, useContext, useMemo, useReducer } from 'react';

const PosCtx = createContext(null);
export const usePos = () => useContext(PosCtx);

let keySeq = 0;
const newKey = () => `k${Date.now().toString(36)}${++keySeq}`;

export function emptyCart(orderType = 'takeaway', deliveryCharges = 0) {
  return {
    orderId: null,
    orderNo: null,
    orderType,
    table: null,
    waiterId: '',
    riderId: '',
    customer: { id: null, name: '', mobile: '', address: '' },
    items: [],
    orderDiscount: 0,
    discountMode: 'amount', // amount | percent
    discountValue: 0,
    deliveryCharges,
    notes: '',
    selected: null,
  };
}

function round2(n) {
  return Math.round((Number(n) + Number.EPSILON) * 1000) / 1000; // quantities keep gram precision (1.375 kg)
}

function reducer(state, a) {
  switch (a.type) {
    case 'reset':
      return emptyCart(a.orderType || state.orderType, a.deliveryCharges ?? 0);
    case 'load':
      return a.cart;
    case 'add': {
      const p = a.product;
      const v = a.variant || null;
      const price = v ? v.price : p.sale_price;
      const existing = state.items.find((i) => i.productId === p.id && !i.notes && i.unitPrice === price && (i.variantId || null) === (v ? v.id : null));
      if (existing) {
        return {
          ...state,
          selected: existing.key,
          items: state.items.map((i) => (i.key === existing.key ? { ...i, qty: round2(i.qty + (a.qty || 1)) } : i)),
        };
      }
      const item = {
        key: newKey(),
        productId: p.id,
        name: v ? `${p.name} (${v.name})` : p.name,
        variantId: v ? v.id : null,
        unitPrice: price,
        unitDiscount: v ? 0 : p.discount || 0,
        qty: a.qty || 1,
        notes: '',
        color: p.category_color,
        unit: p.unit,
        weighed: !!p.weighed,
      };
      return { ...state, selected: item.key, items: [...state.items, item] };
    }
    case 'addCustom': {
      const item = { key: newKey(), productId: null, name: a.name, unitPrice: round2(a.price), unitDiscount: 0, qty: round2(a.qty || 1), notes: '', color: '#64748b', unit: 'pcs' };
      return { ...state, selected: item.key, items: [...state.items, item] };
    }
    case 'qty': {
      const items = state.items
        .map((i) => (i.key === a.key ? { ...i, qty: round2(a.qty) } : i))
        .filter((i) => i.qty > 0);
      return { ...state, items, selected: items.some((i) => i.key === state.selected) ? state.selected : items[items.length - 1]?.key || null };
    }
    case 'inc': {
      const it = state.items.find((i) => i.key === a.key);
      if (!it) return state;
      return reducer(state, { type: 'qty', key: a.key, qty: it.qty + a.by });
    }
    case 'update':
      return { ...state, items: state.items.map((i) => (i.key === a.key ? { ...i, ...a.patch } : i)) };
    case 'remove': {
      const items = state.items.filter((i) => i.key !== a.key);
      return { ...state, items, selected: items[items.length - 1]?.key || null };
    }
    case 'select':
      return { ...state, selected: a.key };
    case 'set':
      return { ...state, ...a.patch };
    default:
      return state;
  }
}

export function PosProvider({ children }) {
  const [cart, dispatch] = useReducer(reducer, undefined, () => emptyCart());
  const value = useMemo(() => ({ cart, dispatch }), [cart]);
  return <PosCtx.Provider value={value}>{children}</PosCtx.Provider>;
}

/** Convert a saved (pending) order into cart state for editing on the POS. */
export function cartFromOrder(o) {
  return {
    ...emptyCart(o.order_type, o.delivery_charges),
    orderId: o.id,
    orderNo: o.order_no,
    table: o.table_id ? { id: o.table_id, name: o.table_name } : null,
    waiterId: o.waiter_id || '',
    riderId: o.rider_id || '',
    customer: { id: o.customer_id, name: o.customer_name || '', mobile: o.customer_mobile || '', address: o.customer_address || '' },
    items: o.items.map((i) => ({
      key: newKey(),
      productId: i.product_id,
      variantId: i.variant_id || null,
      name: i.name,
      unitPrice: i.unit_price,
      unitDiscount: i.qty ? round2(i.discount / i.qty) : 0,
      qty: i.qty,
      notes: i.notes || '',
      color: '#6366f1',
    })),
    orderDiscount: o.order_discount,
    discountMode: 'amount',
    discountValue: o.order_discount,
    notes: o.notes || '',
  };
}
