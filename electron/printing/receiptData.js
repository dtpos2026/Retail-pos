'use strict';

const settings = require('../services/settings');
const { formatDate, formatTime, orderTypeLabel } = require('../../shared/format.mjs');
const { round2, amountInWords } = require('../core/util');
const { bodyWidthMm } = require('./common');
const { qrSvg } = require('./qr');

function methodLabel(key) {
  const m = settings.get('payment').methods.find((x) => x.key === key);
  return m ? m.label : key || '';
}

/** Normalise an order row (with items/payments/tokens) into what templates render. */
function build(order, overrides = {}) {
  const business = settings.get('business');
  const cfg = { ...settings.get('receipt'), ...(overrides.receipt || {}) };
  const sales = settings.get('sales');
  const currency = settings.get('general').currency || 'Rs.';

  cfg.bodyWidth = bodyWidthMm(cfg.paperWidth);
  const items = order.items.map((i) => ({
    name: i.name,
    qty: i.qty,
    price: i.unit_price,
    discount: i.discount,
    gross: round2(i.qty * i.unit_price),
    total: i.total,
    notes: i.notes,
  }));
  const completed = order.status === 'completed';
  const tendered = round2(order.paid + order.change_amount);
  let statusLabel = 'PAID';
  if (!completed) statusLabel = order.status === 'pending' ? 'BILL (UNPAID)' : order.status.toUpperCase();
  else if (order.due > 0) statusLabel = order.paid > 0 ? 'PARTIALLY PAID' : 'CREDIT (UNPAID)';

  return {
    currency,
    cfg,
    business,
    order: {
      no: order.order_no,
      date: formatDate(order.created_at),
      time: formatTime(order.completed_at || order.created_at),
      type: orderTypeLabel(order.order_type),
      orderType: order.order_type,
      table: order.table_name,
      token: order.token_no,
      cashier: order.cashier_name,
      waiter: order.waiter_name || '',
      rider: order.rider_name || '',
      customer: order.customer_name || order.customer_mobile ? { name: order.customer_name, mobile: order.customer_mobile, address: order.customer_address } : null,
      notes: order.notes,
      status: order.status,
      statusLabel,
      completed,
      reprint: !!overrides.reprint,
    },
    items,
    itemCount: items.length,
    qtyCount: round2(items.reduce((s, i) => s + i.qty, 0)),
    totals: {
      subtotal: order.subtotal,
      itemDiscount: order.item_discount,
      orderDiscount: order.order_discount,
      discount: round2(order.item_discount + order.order_discount),
      tax: order.tax_amount,
      taxLabel: `${sales.taxLabel || 'Tax'}${order.tax_rate ? ` (${order.tax_rate}%)` : ''}`,
      delivery: order.delivery_charges,
      roundOff: order.round_off,
      total: order.total,
      tendered,
      paid: order.paid,
      change: order.change_amount,
      due: order.due,
      method: methodLabel(order.payment_method),
      bank: order.payment_bank || '',
      payments: (order.payments || []).map((p) => ({ method: methodLabel(p.method), amount: p.amount })),
    },
    footer: cfg.footerText,
    bankAccounts: bankAccounts(),
    words: cfg.amountInWords ? amountInWords(order.total) : '',
    qr: buildQr(cfg, order),
  };
}

function bankAccounts() {
  const pay = settings.get('payment');
  if (!pay.showBankOnReceipt) return [];
  return (pay.bankAccounts || []).filter((a) => a.enabled);
}

function buildQr(cfg, order) {
  if (cfg.qrMode === 'off') return null;
  const text = cfg.qrMode === 'custom' ? String(cfg.qrText || '').trim() : `${order.order_no}|${order.total}|${order.created_at}`;
  if (!text) return null;
  try {
    return { svg: qrSvg(text), label: cfg.qrMode === 'custom' ? cfg.qrLabel : 'Scan for order details' };
  } catch {
    return null;
  }
}

/** Realistic sample order used for previews and test prints. */
function sampleOrder() {
  const now = new Date();
  const ts = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:00`;
  const items = [
    { name: 'Zinger Burger', qty: 2, unit_price: 450, discount: 0, total: 900, notes: 'Extra mayo' },
    { name: 'چکن بریانی (Special)', qty: 1, unit_price: 480, discount: 30, total: 450, notes: null },
    { name: 'French Fries', qty: 1, unit_price: 250, discount: 0, total: 250, notes: null },
    { name: 'Cold Drink 500ml', qty: 3, unit_price: 120, discount: 0, total: 360, notes: null },
  ];
  return {
    order_no: 'ORD-000123',
    order_type: 'dine_in',
    status: 'completed',
    table_name: 'Table 4',
    token_no: '027',
    cashier_name: 'Cashier',
    customer_name: 'Ahmed Khan',
    customer_mobile: '03001234567',
    customer_address: null,
    notes: null,
    created_at: ts,
    completed_at: ts,
    items,
    subtotal: 1990,
    item_discount: 30,
    order_discount: 60,
    tax_rate: 0,
    tax_amount: 0,
    delivery_charges: 0,
    round_off: 0,
    total: 1900,
    paid: 1900,
    change_amount: 100,
    due: 0,
    payment_method: 'cash',
    payments: [{ method: 'cash', amount: 1900 }],
  };
}

module.exports = { build, sampleOrder, methodLabel };
