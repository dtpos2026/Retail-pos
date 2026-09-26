'use strict';

const settings = require('../services/settings');
const { esc, t, baseCss, wrap } = require('./common');
const { formatMoney, formatQty, formatDate, formatTime, orderTypeLabel } = require('../../shared/format.mjs');

/**
 * Kitchen / customer token. One HTML document per token so that every token
 * is its own print job (and the printer auto-cuts between them).
 */
function renderToken(order, token, overrides = {}) {
  const cfg = { ...settings.get('token'), ...(overrides.token || {}) };
  const rc = settings.get('receipt');
  const business = settings.get('business');
  const currency = settings.get('general').currency || 'Rs.';
  const items = Array.isArray(token.items) ? token.items : JSON.parse(token.items || '[]');
  const total = items.reduce((s, i) => s + (Number(i.total) || 0), 0);
  const multi = order.tokens && order.tokens.length > 1;

  const css =
    baseCss({
      paperWidth: cfg.paperWidth,
      marginTop: rc.marginTop,
      marginBottom: rc.marginBottom,
      marginLeft: cfg.paperWidth === 58 ? Math.min(rc.marginLeft, 2) : rc.marginLeft,
      marginRight: cfg.paperWidth === 58 ? Math.min(rc.marginRight, 2) : rc.marginRight,
      fontSize: rc.fontSize,
      fontFamily: rc.fontFamily,
      compact: false,
    }) +
    `.num{font-size:${cfg.numberSize}px;font-weight:700;line-height:1;letter-spacing:1px}
     .box{border:2px solid #000;border-radius:2mm;padding:2mm 1mm;margin:1.5mm 0}
     .row{display:flex;justify-content:space-between;gap:2mm}`;

  const logo =
    cfg.showLogo && business.logo
      ? `<div class="logo" style="justify-content:center"><img src="${business.logo}" style="width:35%" alt=""></div>`
      : '';
  const itemsHtml = cfg.showItems
    ? `<div style="text-align:left;margin-top:1.5mm">${items
        .map(
          (i) => `<div class="row" style="padding:.4mm 0"><span><b>${formatQty(i.qty)} ×</b> ${t(i.name)}${i.notes ? `<div class="note">${t(i.notes)}</div>` : ''}</span>${cfg.showPrices ? `<span class="nowrap">${formatMoney(i.total, '').trim()}</span>` : ''}</div>`
        )
        .join('')}</div>`
    : '';

  const body = `
    ${logo}
    <div class="c">
      ${cfg.showBusinessName ? `<div class="b" style="font-size:1.3em">${t(business.name)}</div>` : ''}
      <div class="box">
        <div class="b" style="font-size:1.15em;letter-spacing:2px">${esc(cfg.title || 'TOKEN')}</div>
        <div class="num">#${esc(token.token_no)}</div>
      </div>
      <div class="row"><span>${esc(order.order_no)}</span><span class="b">${esc(orderTypeLabel(order.order_type))}${order.table_name ? ' · ' + t(order.table_name) : ''}</span></div>
      ${order.customer_name ? `<div class="row"><span>Customer</span><span>${t(order.customer_name)}</span></div>` : ''}
      <div style="border-top:1px dashed #000;margin:1.2mm 0"></div>
      ${itemsHtml}
      ${cfg.showTotal ? `<div style="border-top:1px dashed #000;margin:1.2mm 0"></div><div class="row b" style="font-size:1.2em"><span>Total</span><span>${formatMoney(multi ? total : order.total, currency)}</span></div>` : ''}
      <div style="border-top:1px dashed #000;margin:1.2mm 0"></div>
      <div class="row" style="font-size:.9em"><span>${formatDate(token.created_at)}</span><span>${formatTime(token.created_at)}</span></div>
      ${cfg.footer ? `<div style="margin-top:1.5mm">${t(cfg.footer)}</div>` : ''}
    </div>`;
  return wrap(css, body, `Token ${token.token_no}`);
}

module.exports = { renderToken };
