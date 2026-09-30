'use strict';

const settings = require('../services/settings');
const { esc, t, baseCss, wrap, bodyWidthMm } = require('./common');
const { formatMoney, formatQty, formatDate, formatTime, orderTypeLabel } = require('../../shared/format.mjs');

const TOKEN_DESIGNS = [
  { key: 'classic', label: 'Classic', description: 'Centered frame with the number inside.' },
  { key: 'boxed', label: 'Boxed', description: 'Heavy frame, black TOKEN band and boxed item table.' },
  { key: 'bold', label: 'Bold Number', description: 'Giant number for counters — readable from across the room.' },
  { key: 'minimal', label: 'Minimal', description: 'Number and items only, very little paper.' },
  { key: 'ticket', label: 'Ticket', description: 'Zig-zag edges and a dashed stub, like an event ticket.' },
];

function css(paperWidth, extra = '') {
  const rc = settings.get('receipt');
  const narrow = paperWidth === 58;
  return (
    baseCss({
      paperWidth,
      bodyWidth: bodyWidthMm(paperWidth),
      marginTop: rc.marginTop,
      marginBottom: rc.marginBottom,
      marginSide: narrow ? Math.min(rc.marginSide, 1) : rc.marginSide,
      fontSize: rc.fontSize,
      fontFamily: rc.fontFamily,
      compact: false,
    }) +
    `.row{display:flex;justify-content:space-between;gap:2mm}.hr{border-top:1px dashed #000;margin:1.2mm 0}${extra}`
  );
}

function tokenParts(order, token, cfg) {
  const business = settings.get('business');
  const currency = settings.get('general').currency || 'Rs.';
  const items = Array.isArray(token.items) ? token.items : JSON.parse(token.items || '[]');
  const multi = order.tokens && order.tokens.length > 1;
  const total = multi ? items.reduce((s, i) => s + (Number(i.total) || 0), 0) : order.total;
  const logo =
    cfg.showLogo && business.logo ? `<div class="logo" style="justify-content:center"><img src="${business.logo}" style="width:38%" alt=""></div>` : '';
  const name = cfg.showBusinessName ? `<div class="b" style="font-size:1.3em">${t(business.name)}</div>` : '';
  const itemsHtml = (big = false) =>
    cfg.showItems
      ? `<div style="text-align:left;margin-top:1.5mm">${items
          .map(
            (i) => `<div class="row" style="padding:.5mm 0;${big ? 'font-size:1.15em;' : ''}"><span><b>${formatQty(i.qty)} ×</b> ${t(i.name)}${i.notes ? `<div class="note">${t(i.notes)}</div>` : ''}</span>${cfg.showPrices ? `<span class="nowrap">${formatMoney(i.total, '').trim()}</span>` : ''}</div>`
          )
          .join('')}</div>`
      : '';
  const totalHtml = cfg.showTotal ? `<div class="row b" style="font-size:1.2em;margin-top:1mm"><span>Total</span><span>${formatMoney(total, currency)}</span></div>` : '';
  const type = `${esc(orderTypeLabel(order.order_type))}${order.table_name ? ' · ' + t(order.table_name) : ''}`;
  const foot = `<div class="row" style="font-size:.9em;margin-top:1.2mm"><span>${formatDate(token.created_at)}</span><span>${formatTime(token.created_at)}</span></div>${cfg.footer ? `<div style="margin-top:1.5mm">${t(cfg.footer)}</div>` : ''}`;
  return { logo, name, itemsHtml, totalHtml, type, foot, items };
}

function zig(width, flip) {
  const teeth = Math.round(width / 2.6);
  const step = 100 / teeth;
  let pts = '';
  for (let i = 0; i <= teeth; i++) pts += `${(i * step).toFixed(2)},${i % 2 ? (flip ? 0 : 8) : flip ? 8 : 0} `;
  const path = flip ? `M0,0 L${pts.trim().replace(/ /g, ' L')} L100,0 Z` : `M0,8 L${pts.trim().replace(/ /g, ' L')} L100,8 Z`;
  return `<svg viewBox="0 0 100 8" preserveAspectRatio="none" style="display:block;width:100%;height:2.6mm"><path d="${path}" fill="#000"/></svg>`;
}

/**
 * Token — every token is its own document so each one is a separate print job (and cut).
 */
function renderToken(order, token, overrides = {}) {
  const cfg = { ...settings.get('token'), ...(overrides.token || {}) };
  const p = tokenParts(order, token, cfg);
  const num = cfg.numberSize;
  const design = TOKEN_DESIGNS.some((d) => d.key === cfg.design) ? cfg.design : 'classic';
  const title = esc(cfg.title || 'TOKEN');
  let body;

  if (design === 'boxed') {
    body = `${p.logo}<div class="c">${p.name}
      <div style="border:3px solid #000;margin:1.5mm 0">
        <div style="background:#000;color:#fff;padding:1mm;letter-spacing:3px" class="b">${title}</div>
        <div style="padding:2mm 0 1.5mm;font-size:${num}px;font-weight:800;line-height:1">#${esc(token.token_no)}</div>
        <div style="border-top:2px solid #000;padding:1mm" class="b">${p.type}</div>
      </div>
      <div class="row"><span>${esc(order.order_no)}</span>${order.customer_name ? `<span>${t(order.customer_name)}</span>` : ''}</div>
      ${cfg.showItems ? `<div style="border:2px solid #000;margin-top:1.5mm;padding:1mm 1.5mm">${p.itemsHtml()}${p.totalHtml ? `<div class="hr"></div>${p.totalHtml}` : ''}</div>` : p.totalHtml}
      ${p.foot}</div>`;
  } else if (design === 'bold') {
    body = `${p.logo}<div class="c">${p.name}
      <div class="b" style="font-size:1.15em;letter-spacing:4px;margin-top:1mm">${title}</div>
      <div style="font-size:${Math.round(num * 1.35)}px;font-weight:900;line-height:1;margin:1mm 0;letter-spacing:-1px">${esc(token.token_no)}</div>
      <div style="border-top:4px solid #000;border-bottom:4px solid #000;padding:1mm" class="b">${p.type}</div>
      <div class="row" style="margin-top:1mm"><span>${esc(order.order_no)}</span></div>
      ${p.itemsHtml(true)}${p.totalHtml ? `<div class="hr"></div>${p.totalHtml}` : ''}
      ${p.foot}</div>`;
  } else if (design === 'minimal') {
    body = `<div class="c"><div style="font-size:.9em;letter-spacing:2px">${title} · ${esc(order.order_no)}</div>
      <div style="font-size:${num}px;font-weight:800;line-height:1.05">${esc(token.token_no)}</div>
      <div class="b">${p.type}</div>
      ${p.itemsHtml()}${p.totalHtml}
      <div style="font-size:.85em;margin-top:1mm">${formatDate(token.created_at)} ${formatTime(token.created_at)}</div></div>`;
  } else if (design === 'ticket') {
    const w = bodyWidthMm(cfg.paperWidth);
    body = `${zig(w, false)}<div style="border-left:2px solid #000;border-right:2px solid #000;padding:1.5mm" class="c">${p.logo}${p.name}
      <div style="display:flex;border:2px dashed #000;margin:1.5mm 0;text-align:center">
        <div style="flex:1;padding:1mm"><div style="font-size:.7em">${title}</div><div style="font-size:${Math.round(num * 0.9)}px;font-weight:800;line-height:1">${esc(token.token_no)}</div></div>
        <div style="padding:1mm 2.5mm;border-left:2px dashed #000"><div style="font-size:.7em">ORDER</div><div class="b" style="font-size:1.05em">${esc(order.order_no.replace(/^\D+/, '')) || esc(order.order_no)}</div></div>
      </div>
      <div class="b">${p.type}</div>
      ${p.itemsHtml()}${p.totalHtml ? `<div style="border-top:2px dashed #000;margin:1.2mm 0"></div>${p.totalHtml}` : ''}
      <div style="border-top:2px dashed #000;margin-top:1.2mm"></div>${p.foot}</div>${zig(w, true)}`;
  } else {
    body = `${p.logo}<div class="c">${p.name}
      <div style="border:2px solid #000;border-radius:2mm;padding:2mm 1mm;margin:1.5mm 0">
        <div class="b" style="font-size:1.15em;letter-spacing:2px">${title}</div>
        <div style="font-size:${num}px;font-weight:700;line-height:1;letter-spacing:1px">#${esc(token.token_no)}</div>
      </div>
      <div class="row"><span>${esc(order.order_no)}</span><span class="b">${p.type}</span></div>
      ${order.customer_name ? `<div class="row"><span>Customer</span><span>${t(order.customer_name)}</span></div>` : ''}
      <div class="hr"></div>${p.itemsHtml()}${p.totalHtml ? `<div class="hr"></div>${p.totalHtml}` : ''}
      <div class="hr"></div>${p.foot}</div>`;
  }
  return wrap(css(cfg.paperWidth), body, `Token ${token.token_no}`);
}

/** Kitchen order ticket — items only (no prices), for a running dine-in / held order. */
function renderKot(order, { kotNo } = {}) {
  const cfg = settings.get('token');
  const items = order.items;
  const list = items
    .map(
      (i) => `<div style="display:flex;gap:2.5mm;padding:1.2mm 0;border-bottom:1px dashed #000">
        <span class="b" style="font-size:1.6em;min-width:9mm">${formatQty(i.qty)}</span>
        <span style="font-size:1.15em;font-weight:700;flex:1">${t(i.name)}${i.notes ? `<div style="font-size:.8em;font-weight:400;border:1.5px solid #000;padding:.5mm 1.2mm;margin-top:.6mm;display:inline-block">* ${t(i.notes)}</div>` : ''}</span></div>`
    )
    .join('');
  const body = `<div class="c">
      <div style="background:#000;color:#fff;padding:1.2mm;letter-spacing:3px" class="b">KITCHEN ORDER${kotNo ? ` #${esc(kotNo)}` : ''}</div>
      <div style="border:3px solid #000;margin:1.5mm 0;padding:1mm">
        <div class="b" style="font-size:1.6em">${esc(orderTypeLabel(order.order_type).toUpperCase())}</div>
        ${order.table_name ? `<div class="b" style="font-size:2em;line-height:1.1">${t(order.table_name)}</div>` : ''}
      </div>
      <div class="row"><span class="b">${esc(order.order_no)}</span><span>${formatDate(new Date())} ${formatTime(new Date())}</span></div>
      ${order.customer_name ? `<div class="row"><span>Customer</span><span>${t(order.customer_name)}</span></div>` : ''}
      <div style="text-align:left;margin-top:1.5mm;border-top:2px solid #000">${list}</div>
      <div class="row b" style="margin-top:1.5mm"><span>Items: ${items.length}</span><span>Qty: ${formatQty(items.reduce((s, i) => s + i.qty, 0))}</span></div>
      ${order.notes ? `<div style="border:2px solid #000;padding:1mm;margin-top:1.5mm;text-align:left"><b>NOTE:</b> ${t(order.notes)}</div>` : ''}
      <div style="font-size:.8em;margin-top:2mm">Cashier: ${esc(order.cashier_name || '')}</div></div>`;
  return wrap(css(cfg.paperWidth), body, `KOT ${order.order_no}`);
}

module.exports = { renderToken, renderKot, TOKEN_DESIGNS };
