'use strict';

const { esc, t, baseCss, logoHtml, wrap } = require('./common');
const { formatMoney, formatQty } = require('../../shared/format.mjs');

/*
 * Six genuinely different thermal receipt layouts. Every template receives the
 * same normalised data (see receiptData.build) and honours the receipt
 * settings (margins, font, logo, show/hide flags, compact mode).
 */

const TEMPLATES = [
  { key: 'classic', label: 'Classic', description: 'Centered header, dashed lines and a 4-column item table.' },
  { key: 'modern', label: 'Modern', description: 'Bold black header band, two-line items and a highlighted total.' },
  { key: 'minimal', label: 'Minimal', description: 'Clean left-aligned layout with no borders.' },
  { key: 'restaurant', label: 'Restaurant', description: 'Large order type, table and token; quantities first.' },
  { key: 'retail', label: 'Retail Invoice', description: 'Invoice style with boxed grid, item counts and savings.' },
  { key: 'compact', label: 'Compact', description: 'Smallest paper usage — one line per item. Great for 58mm.' },
];

// ---------- shared fragments ------------------------------------------------

function m(d, v) {
  return formatMoney(v, d.currency);
}
function n(v) {
  return formatMoney(v, '').trim();
}

function align(a) {
  return ['left', 'right', 'center'].includes(a) ? a : 'center';
}

function businessLines(d, { nameSize = 1.5, nameWeight = 700 } = {}) {
  const b = d.business;
  const c = d.cfg;
  const lines = [];
  lines.push(`<div style="font-size:${nameSize}em;font-weight:${nameWeight};line-height:1.15">${t(b.name)}</div>`);
  if (b.tagline) lines.push(`<div>${t(b.tagline)}</div>`);
  if (b.address) lines.push(`<div>${t(b.address)}</div>`);
  if (b.phone) lines.push(`<div>Ph: ${esc(b.phone)}</div>`);
  if (c.showNtn && b.ntn) lines.push(`<div>NTN: ${esc(b.ntn)}</div>`);
  if (b.extraInfo) lines.push(`<div>${t(b.extraInfo)}</div>`);
  return `<div style="text-align:${align(c.nameAlign)}">${lines.join('')}</div>`;
}

function metaPairs(d) {
  const o = d.order;
  const c = d.cfg;
  const pairs = [];
  if (c.showOrderNo) pairs.push(['Order #', o.no]);
  pairs.push(['Date', `${o.date} ${o.time}`]);
  pairs.push(['Type', o.type]);
  if (c.showTable && o.table) pairs.push(['Table', o.table]);
  if (o.token) pairs.push(['Token', o.token]);
  if (c.showCashier && o.cashier) pairs.push(['Cashier', o.cashier]);
  if (c.showCustomer && o.customer) {
    if (o.customer.name) pairs.push(['Customer', o.customer.name]);
    if (o.customer.mobile) pairs.push(['Mobile', o.customer.mobile]);
    if (o.customer.address) pairs.push(['Address', o.customer.address]);
  }
  return pairs;
}

function totalsRows(d) {
  const tt = d.totals;
  const c = d.cfg;
  const rows = [['Subtotal', tt.subtotal]];
  if (c.showDiscount && tt.itemDiscount > 0) rows.push(['Item Discount', -tt.itemDiscount]);
  if (c.showDiscount && tt.orderDiscount > 0) rows.push(['Discount', -tt.orderDiscount]);
  if (!c.showDiscount && tt.discount > 0) rows.push(['Discount', -tt.discount]);
  if (tt.tax > 0) rows.push([tt.taxLabel, tt.tax]);
  if (tt.delivery > 0) rows.push(['Delivery Charges', tt.delivery]);
  if (tt.roundOff) rows.push(['Round Off', tt.roundOff]);
  return rows;
}

function paymentRows(d) {
  const tt = d.totals;
  const o = d.order;
  if (!d.cfg.showPayment || !o.completed) return [];
  const rows = [];
  if (tt.method) rows.push(['Payment', tt.method, true]);
  rows.push(['Paid', tt.tendered]);
  if (tt.change > 0) rows.push(['Change', tt.change]);
  if (tt.due > 0) rows.push(['Balance Due', tt.due]);
  return rows;
}

function itemNote(d, i) {
  return d.cfg.showItemNotes && i.notes ? `<div class="note">&nbsp;&nbsp;- ${t(i.notes)}</div>` : '';
}

function footer(d, extra = '') {
  const parts = [];
  if (d.order.notes) parts.push(`<div style="margin-bottom:1mm">Note: ${t(d.order.notes)}</div>`);
  if (d.footer) parts.push(`<div>${t(d.footer).replace(/\n/g, '<br>')}</div>`);
  if (d.order.reprint) parts.push('<div class="b" style="margin-top:1mm">** DUPLICATE COPY **</div>');
  parts.push('<div style="font-size:.75em;margin-top:1.5mm">Powered by Retail POS</div>');
  return `<div class="c" style="${extra}">${parts.join('')}</div>`;
}

function statusBanner(d) {
  const o = d.order;
  if (o.completed && d.totals.due <= 0) return '';
  return `<div class="c b" style="border:1.5px solid #000;padding:1mm;margin:1.5mm 0;font-size:1.1em">${esc(o.statusLabel)}</div>`;
}

// ---------- 1. Classic ------------------------------------------------------

function classic(d) {
  const hr = '<div style="border-top:1px dashed #000;margin:1.5mm 0"></div>';
  const meta = metaPairs(d)
    .map(([k, v]) => `<tr><td class="nowrap" style="padding-right:2mm">${k}</td><td class="r">${t(v)}</td></tr>`)
    .join('');
  const narrow = d.cfg.paperWidth === 58;
  const items = d.items
    .map((i) =>
      narrow
        ? `<tr><td colspan="3" class="b">${t(i.name)}</td></tr>
           <tr><td>${formatQty(i.qty)} x ${n(i.price)}</td><td class="r">${i.discount > 0 && d.cfg.showDiscount ? '-' + n(i.discount) : ''}</td><td class="r">${n(i.total)}</td></tr>
           ${i.notes && d.cfg.showItemNotes ? `<tr><td colspan="3">${itemNote(d, i)}</td></tr>` : ''}`
        : `<tr><td>${t(i.name)}${itemNote(d, i)}${i.discount > 0 && d.cfg.showDiscount ? `<div class="note">&nbsp;&nbsp;disc -${n(i.discount)}</div>` : ''}</td>
           <td class="c">${formatQty(i.qty)}</td><td class="r">${n(i.price)}</td><td class="r">${n(i.total)}</td></tr>`
    )
    .join('');
  const head = narrow
    ? '<tr class="b"><td>Item</td><td></td><td class="r">Amount</td></tr>'
    : '<tr class="b"><td>Item</td><td class="c" style="width:9%">Qty</td><td class="r" style="width:22%">Rate</td><td class="r" style="width:24%">Amount</td></tr>';
  const totals = totalsRows(d).map(([k, v]) => `<tr><td>${k}</td><td class="r">${n(v)}</td></tr>`).join('');
  const pays = paymentRows(d).map(([k, v, txt]) => `<tr><td>${k}</td><td class="r">${txt ? esc(v) : n(v)}</td></tr>`).join('');
  return `
    ${logoHtml(d)}${businessLines(d)}${hr}
    <div class="c b" style="font-size:1.05em">${d.order.completed ? 'SALES RECEIPT' : 'BILL'}</div>${hr}
    <table>${meta}</table>${hr}
    <table>${head}<tr><td colspan="4" style="border-top:1px dashed #000;height:1mm"></td></tr>${items}</table>${hr}
    <table>${totals}</table>
    <div style="border-top:1px dashed #000;margin:1mm 0"></div>
    <table><tr class="b" style="font-size:1.3em"><td>TOTAL</td><td class="r">${m(d, d.totals.total)}</td></tr></table>
    ${pays ? `<div style="border-top:1px dashed #000;margin:1mm 0"></div><table>${pays}</table>` : ''}
    ${statusBanner(d)}${hr}${footer(d)}`;
}

// ---------- 2. Modern -------------------------------------------------------

function modern(d) {
  const meta = metaPairs(d)
    .map(([k, v]) => `<div style="display:flex;justify-content:space-between;gap:2mm"><span>${k}</span><span class="b r">${t(v)}</span></div>`)
    .join('');
  const items = d.items
    .map(
      (i) => `<div style="padding:1.2mm 0;border-bottom:1px solid #000">
        <div class="b">${t(i.name)}</div>
        <div style="display:flex;justify-content:space-between"><span>${formatQty(i.qty)} × ${n(i.price)}${i.discount > 0 && d.cfg.showDiscount ? ` <span>(−${n(i.discount)})</span>` : ''}</span><span class="b">${n(i.total)}</span></div>
        ${itemNote(d, i)}</div>`
    )
    .join('');
  const totals = totalsRows(d)
    .map(([k, v]) => `<div style="display:flex;justify-content:space-between"><span>${k}</span><span>${n(v)}</span></div>`)
    .join('');
  const pays = paymentRows(d)
    .map(([k, v, txt]) => `<div style="display:flex;justify-content:space-between"><span>${k}</span><span class="b">${txt ? esc(v) : n(v)}</span></div>`)
    .join('');
  return `
    ${logoHtml(d)}
    <div style="background:#000;color:#fff;padding:2mm;border-radius:2mm;text-align:${align(d.cfg.nameAlign)}">
      <div style="font-size:1.45em;font-weight:700;line-height:1.15">${t(d.business.name)}</div>
      ${d.business.tagline ? `<div style="font-size:.9em">${t(d.business.tagline)}</div>` : ''}
    </div>
    <div style="text-align:${align(d.cfg.nameAlign)};margin-top:1mm;font-size:.92em">
      ${d.business.address ? `<div>${t(d.business.address)}</div>` : ''}
      ${d.business.phone ? `<div>${esc(d.business.phone)}</div>` : ''}
      ${d.cfg.showNtn && d.business.ntn ? `<div>NTN ${esc(d.business.ntn)}</div>` : ''}
      ${d.business.extraInfo ? `<div>${t(d.business.extraInfo)}</div>` : ''}
    </div>
    <div style="margin:2mm 0;padding:1.5mm 0;border-top:2px solid #000;border-bottom:2px solid #000">${meta}</div>
    <div>${items}</div>
    <div style="margin-top:1.5mm">${totals}</div>
    <div style="margin:2mm 0;border:2px solid #000;border-radius:2mm;padding:1.5mm 2mm;display:flex;justify-content:space-between;align-items:center">
      <span class="b">TOTAL</span><span class="b" style="font-size:1.45em">${m(d, d.totals.total)}</span>
    </div>
    ${pays}
    ${statusBanner(d)}
    <div style="margin-top:2mm">${footer(d)}</div>`;
}

// ---------- 3. Minimal ------------------------------------------------------

function minimal(d) {
  const meta = metaPairs(d)
    .map(([k, v]) => `${k}: ${t(v)}`)
    .join('<br>');
  const items = d.items
    .map(
      (i) => `<tr><td style="padding:.6mm 0">${t(i.name)}<br><span style="font-size:.88em">${formatQty(i.qty)} @ ${n(i.price)}${i.discount > 0 && d.cfg.showDiscount ? ` · less ${n(i.discount)}` : ''}</span>${itemNote(d, i)}</td><td class="r" style="padding:.6mm 0">${n(i.total)}</td></tr>`
    )
    .join('');
  const totals = totalsRows(d).map(([k, v]) => `<tr><td>${k}</td><td class="r">${n(v)}</td></tr>`).join('');
  const pays = paymentRows(d).map(([k, v, txt]) => `<tr><td>${k}</td><td class="r">${txt ? esc(v) : n(v)}</td></tr>`).join('');
  return `
    ${logoHtml(d)}
    ${businessLines(d, { nameSize: 1.3 })}
    <div style="height:3mm"></div>
    <div style="font-size:.92em">${meta}</div>
    <div style="height:3mm"></div>
    <table>${items}</table>
    <div style="height:2mm"></div>
    <table>${totals}
      <tr><td colspan="2" style="height:1mm"></td></tr>
      <tr class="b" style="font-size:1.25em"><td>Total</td><td class="r">${m(d, d.totals.total)}</td></tr>
      <tr><td colspan="2" style="height:1mm"></td></tr>
      ${pays}
    </table>
    ${statusBanner(d)}
    <div style="height:3mm"></div>
    ${footer(d, 'text-align:left')}`;
}

// ---------- 4. Restaurant ---------------------------------------------------

function restaurant(d) {
  const o = d.order;
  const dbl = '<div style="border-top:3px double #000;margin:1.5mm 0"></div>';
  const sgl = '<div style="border-top:1px solid #000;margin:1.5mm 0"></div>';
  const big = [];
  big.push(`<div style="font-size:1.35em;font-weight:700">${esc(o.type.toUpperCase())}</div>`);
  if (d.cfg.showTable && o.table) big.push(`<div style="font-size:1.2em;font-weight:700">${t(o.table)}</div>`);
  if (o.token) big.push(`<div style="font-size:1.1em">Token <span style="font-size:1.5em;font-weight:700">#${esc(o.token)}</span></div>`);
  const small = metaPairs(d).filter(([k]) => !['Type', 'Table', 'Token'].includes(k));
  const items = d.items
    .map(
      (i) => `<tr><td class="b nowrap" style="width:12%;padding:.5mm 0">${formatQty(i.qty)}x</td>
        <td style="padding:.5mm 0">${t(i.name)}${itemNote(d, i)}</td><td class="r nowrap" style="padding:.5mm 0">${n(i.total)}</td></tr>`
    )
    .join('');
  const totals = totalsRows(d).map(([k, v]) => `<tr><td>${k}</td><td class="r">${n(v)}</td></tr>`).join('');
  const pays = paymentRows(d).map(([k, v, txt]) => `<tr><td>${k}</td><td class="r">${txt ? esc(v) : n(v)}</td></tr>`).join('');
  return `
    ${logoHtml(d)}${businessLines(d, { nameSize: 1.7 })}${dbl}
    <div class="c" style="border:2px solid #000;padding:1.5mm;margin:1mm 0">${big.join('')}</div>
    <table style="font-size:.92em">${small.map(([k, v]) => `<tr><td>${k}</td><td class="r">${t(v)}</td></tr>`).join('')}</table>${dbl}
    <table>${items}</table>${sgl}
    <table>${totals}</table>${dbl}
    <table><tr class="b" style="font-size:1.4em"><td>GRAND TOTAL</td><td class="r">${m(d, d.totals.total)}</td></tr></table>${dbl}
    ${pays ? `<table>${pays}</table>${sgl}` : ''}
    ${statusBanner(d)}
    ${footer(d)}`;
}

// ---------- 5. Retail invoice -----------------------------------------------

function retail(d) {
  const o = d.order;
  const cell = 'border:1px solid #000;padding:.8mm 1mm';
  const meta = metaPairs(d);
  const metaHtml = meta
    .map(([k, v]) => `<tr><td style="${cell};width:32%" class="b">${k}</td><td style="${cell}">${t(v)}</td></tr>`)
    .join('');
  const narrow = d.cfg.paperWidth === 58;
  const items = d.items
    .map((i, idx) =>
      narrow
        ? `<tr><td style="${cell}" colspan="2">${idx + 1}. ${t(i.name)}${itemNote(d, i)}<br>${formatQty(i.qty)} × ${n(i.price)}</td><td style="${cell}" class="r">${n(i.total)}</td></tr>`
        : `<tr><td style="${cell}" class="c">${idx + 1}</td><td style="${cell}">${t(i.name)}${itemNote(d, i)}</td><td style="${cell}" class="c">${formatQty(i.qty)}</td><td style="${cell}" class="r">${n(i.price)}</td><td style="${cell}" class="r">${n(i.total)}</td></tr>`
    )
    .join('');
  const head = narrow
    ? `<tr class="b"><td style="${cell}" colspan="2">Item</td><td style="${cell}" class="r">Amt</td></tr>`
    : `<tr class="b"><td style="${cell};width:7%" class="c">#</td><td style="${cell}">Description</td><td style="${cell};width:10%" class="c">Qty</td><td style="${cell};width:20%" class="r">Rate</td><td style="${cell};width:22%" class="r">Amount</td></tr>`;
  const totals = totalsRows(d).map(([k, v]) => `<tr><td style="${cell}">${k}</td><td style="${cell}" class="r">${n(v)}</td></tr>`).join('');
  const pays = paymentRows(d).map(([k, v, txt]) => `<tr><td style="${cell}">${k}</td><td style="${cell}" class="r">${txt ? esc(v) : n(v)}</td></tr>`).join('');
  const title = d.totals.tax > 0 ? 'SALES TAX INVOICE' : o.completed ? 'SALES INVOICE' : 'PRO-FORMA BILL';
  return `
    ${logoHtml(d)}${businessLines(d, { nameSize: 1.45 })}
    <div class="c b" style="margin:2mm 0 1.5mm;padding:1mm;background:#000;color:#fff;letter-spacing:.5px">${title}</div>
    <table style="font-size:.92em">${metaHtml}</table>
    <div style="height:1.5mm"></div>
    <table>${head}${items}</table>
    <div style="display:flex;justify-content:space-between;font-size:.9em;margin:1mm 0">
      <span>Items: <b>${d.itemCount}</b></span><span>Total Qty: <b>${formatQty(d.qtyCount)}</b></span>
    </div>
    <table>${totals}<tr class="b" style="font-size:1.2em"><td style="${cell}">NET PAYABLE</td><td style="${cell}" class="r">${m(d, d.totals.total)}</td></tr>${pays}</table>
    ${d.totals.discount > 0 ? `<div class="c b" style="margin-top:1.5mm">You saved ${m(d, d.totals.discount)} today!</div>` : ''}
    ${statusBanner(d)}
    <div style="margin-top:2mm">${footer(d)}</div>
    <div class="c" style="font-size:.8em;margin-top:1mm">Goods once sold can be exchanged with receipt.</div>`;
}

// ---------- 6. Compact ------------------------------------------------------

function compact(d) {
  const o = d.order;
  const c = d.cfg;
  const hr = '<div style="border-top:1px dashed #000;margin:.8mm 0"></div>';
  const line2 = [c.showOrderNo ? o.no : null, `${o.date} ${o.time}`].filter(Boolean).join(' | ');
  const line3 = [o.type, c.showTable && o.table ? o.table : null, o.token ? `Tkn ${o.token}` : null, c.showCashier ? o.cashier : null]
    .filter(Boolean)
    .map(esc)
    .join(' | ');
  const cust = c.showCustomer && o.customer ? `<div>${t([o.customer.name, o.customer.mobile].filter(Boolean).join(' '))}${o.customer.address ? `<br>${t(o.customer.address)}` : ''}</div>` : '';
  const items = d.items
    .map(
      (i) => `<tr><td style="padding:.2mm 0">${t(i.name)}${c.showItemNotes && i.notes ? ` <i>(${t(i.notes)})</i>` : ''}</td><td class="r nowrap" style="padding:.2mm 1mm">${formatQty(i.qty)}</td><td class="r nowrap" style="padding:.2mm 0">${n(i.total)}</td></tr>`
    )
    .join('');
  const totals = totalsRows(d).filter(([k]) => k !== 'Subtotal' || d.totals.discount > 0 || d.totals.tax > 0 || d.totals.delivery > 0);
  const pays = paymentRows(d);
  return `
    <style>body{font-size:${Math.max(8, c.fontSize - 1.5)}px;line-height:1.18}</style>
    ${logoHtml(d)}
    <div style="text-align:${align(c.nameAlign)}"><div class="b" style="font-size:1.3em">${t(d.business.name)}</div>
      ${d.business.phone ? `<div>${esc(d.business.phone)}</div>` : ''}${c.showNtn && d.business.ntn ? `<div>NTN ${esc(d.business.ntn)}</div>` : ''}</div>
    ${hr}<div>${esc(line2)}</div><div>${line3}</div>${cust}${hr}
    <table>${items}</table>${hr}
    <table>${totals.map(([k, v]) => `<tr><td>${k}</td><td class="r">${n(v)}</td></tr>`).join('')}
      <tr class="b" style="font-size:1.2em"><td>TOTAL</td><td class="r">${m(d, d.totals.total)}</td></tr>
      ${pays.map(([k, v, txt]) => `<tr><td>${k}</td><td class="r">${txt ? esc(v) : n(v)}</td></tr>`).join('')}</table>
    ${statusBanner(d)}${hr}
    ${footer(d)}`;
}

const RENDERERS = { classic, modern, minimal, restaurant, retail, compact };

function renderReceipt(data) {
  const key = RENDERERS[data.cfg.template] ? data.cfg.template : 'classic';
  const body = RENDERERS[key](data);
  return wrap(baseCss(data.cfg), body, `Receipt ${data.order.no}`);
}

module.exports = { TEMPLATES, renderReceipt };
