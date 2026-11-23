'use strict';

const settings = require('../services/settings');
const { esc, t, baseCss, wrap, logoHtml, bodyWidthMm } = require('./common');
const { formatMoney, formatNumber, formatDate, formatDateTime } = require('../../shared/format.mjs');

/*
 * Compact reports for 80 mm / 58 mm thermal paper. Every report becomes a boxed table:
 * first column as the label (with optional second line), then up to 3 (2 on 58 mm) numeric
 * columns. Works for all reports, so a shop owner can print or share any of them as PNG.
 */
const HINTS = {
  sales: { label: 'date', cols: ['orders', 'total', 'due'] },
  orders: { label: 'order_no', sub: ['created_at', 'order_type', 'customer_name'], cols: ['total'] },
  dine_in: { label: 'order_no', sub: ['created_at', 'table_name'], cols: ['total'] },
  takeaway: { label: 'order_no', sub: ['created_at', 'customer_name'], cols: ['total'] },
  delivery: { label: 'order_no', sub: ['created_at', 'customer_name'], cols: ['total'] },
  products: { label: 'name', sub: ['category'], cols: ['qty', 'revenue', 'profit'] },
  categories: { label: 'category', cols: ['qty', 'revenue', 'profit'] },
  payments: { label: 'method', cols: ['count', 'amount'] },
  dues: { label: 'customer_name', sub: ['order_no', 'created_at'], cols: ['total', 'due'] },
  discounts: { label: 'order_no', sub: ['created_at', 'cashier_name'], cols: ['total_discount', 'total'] },
  profit: { label: 'date', cols: ['net_sales', 'cost', 'profit'] },
  cashiers: { label: 'cashier', cols: ['orders', 'sales', 'cash'] },
  inventory: { label: 'name', sub: ['category', 'status'], cols: ['stock_qty', 'stock_value'] },
  stock_movements: { label: 'name', sub: ['created_at', 'note'], cols: ['type', 'qty'] },
};

function fmt(col, v, currency) {
  if (v === null || v === undefined || v === '') return '';
  if (col.type === 'money') return formatMoney(v, '').trim();
  if (col.type === 'number') return formatNumber(v);
  return String(v);
}

function shortLabel(c) {
  return c.label.replace('Received', 'Recd').replace('Amount', 'Amt').replace('Revenue', 'Rev.').replace('Discount', 'Disc.').replace('Transactions', 'Txns');
}

function renderThermalReport(report, { paperWidth } = {}) {
  const rc = settings.get('receipt');
  const biz = settings.get('business');
  const currency = settings.get('general').currency || 'Rs.';
  const pw = Number(paperWidth) || rc.paperWidth;
  const narrow = pw === 58;
  const css =
    baseCss({
      paperWidth: pw,
      bodyWidth: bodyWidthMm(pw),
      marginTop: rc.marginTop,
      marginBottom: rc.marginBottom,
      marginSide: rc.marginSide,
      fontSize: narrow ? Math.min(rc.fontSize, 11) : Math.min(rc.fontSize, 12),
      fontFamily: rc.fontFamily,
      compact: true,
    }) + '.cellb{border:1.5px solid #000}';

  const period = report.noDate ? `As of ${formatDateTime(new Date())}` : report.from === report.to ? formatDate(report.from) : `${formatDate(report.from)} – ${formatDate(report.to)}`;
  const head = `<div class="c">${logoHtml({ cfg: { ...rc, showLogo: rc.showLogo, logoWidth: Math.min(rc.logoWidth, 40) }, business: biz })}
    <div class="b" style="font-size:1.35em;line-height:1.15">${t(biz.name)}</div></div>
    <div class="c b" style="background:#000;color:#fff;padding:1.2mm;margin:1.5mm 0 1mm;letter-spacing:.5px">${esc(report.title.toUpperCase())}</div>
    <div class="c" style="font-size:.92em">${esc(period)}</div>
    <div class="c" style="font-size:.8em;margin-bottom:1.5mm">Printed ${esc(formatDateTime(new Date()))}</div>`;

  const cards = (report.cards || []).length
    ? `<table class="cellb" style="margin-bottom:2mm">${report.cards
        .slice(0, narrow ? 4 : 6)
        .map((c) => `<tr><td style="padding:.6mm 1.3mm;border-bottom:1px dashed #000">${esc(c.label)}</td><td class="r b" style="padding:.6mm 1.3mm;border-bottom:1px dashed #000">${esc(c.type === 'money' ? formatMoney(c.value, currency) : c.type === 'number' ? formatNumber(c.value) : c.value)}</td></tr>`)
        .join('')}</table>`
    : '';

  let body;
  if (report.summaryStyle) {
    // Section based summary (Day Summary)
    body = `<table class="cellb">${report.rows
      .map((r) =>
        r.kind === 'head'
          ? `<tr><td colspan="2" style="background:#000;color:#fff;padding:.8mm 1.3mm;letter-spacing:1px" class="b">${esc(r.label)}</td></tr>`
          : `<tr><td style="padding:.7mm 1.3mm;${r.bold ? 'font-weight:700;font-size:1.08em;' : ''}">${t(r.label)}</td><td class="r nowrap" style="padding:.7mm 1.3mm;${r.bold ? 'font-weight:700;font-size:1.08em;' : ''}">${esc(r.value)}</td></tr>`
      )
      .join('')}</table>`;
    return wrap(css, head + body + `<div class="c" style="font-size:.75em;margin-top:2mm">Powered by Digital Target · Retail POS</div>`, report.title);
  }

  const hint = HINTS[report.key] || {};
  const byKey = Object.fromEntries(report.columns.map((c) => [c.key, c]));
  const labelCol = byKey[hint.label] || report.columns[0];
  const numeric = (hint.cols ? hint.cols.map((k) => byKey[k]).filter(Boolean) : report.columns.filter((c) => c !== labelCol && c.type !== 'text')).slice(0, narrow ? 2 : 3);
  const subCols = (hint.sub || []).map((k) => byKey[k]).filter(Boolean);
  const cellPad = 'padding:.8mm 1.2mm';
  const ncol = numeric.length;

  const headRow = `<tr style="background:#000;color:#fff" class="b"><td style="${cellPad}">${esc(labelCol.label)}</td>${numeric.map((c) => `<td class="r" style="${cellPad};width:${narrow ? 30 : 24}%">${esc(shortLabel(c))}</td>`).join('')}</tr>`;
  const rows = report.rows
    .map((r) => {
      const sub = subCols.map((c) => fmtSub(c, r[c.key])).filter(Boolean).join(' · ');
      return `<tr><td style="${cellPad};border-top:1px dashed #000"><b>${t(fmt(labelCol, r[labelCol.key], currency))}</b>${sub ? `<div style="font-size:.82em">${t(sub)}</div>` : ''}</td>${numeric
        .map((c) => `<td class="r nowrap" style="${cellPad};border-top:1px dashed #000;vertical-align:top">${esc(fmt(c, r[c.key], currency))}</td>`)
        .join('')}</tr>`;
    })
    .join('');
  const totals = report.totals
    ? `<tr style="border-top:2px solid #000" class="b"><td style="${cellPad};border-top:2px solid #000">${esc(String(report.totals[labelCol.key] ?? 'Total'))}</td>${numeric
        .map((c) => `<td class="r nowrap" style="${cellPad};border-top:2px solid #000">${esc(fmt(c, report.totals[c.key], currency))}</td>`)
        .join('')}</tr>`
    : '';
  body = `<table class="cellb">${headRow}${rows || `<tr><td colspan="${ncol + 1}" class="c" style="padding:3mm">No data</td></tr>`}${totals}</table>`;
  const foot = `<div class="c" style="font-size:.85em;margin-top:1.5mm">${report.rows.length} row(s)</div>${report.note ? `<div style="font-size:.75em;margin-top:1mm">${esc(report.note)}</div>` : ''}<div class="c" style="font-size:.72em;margin-top:2mm">Powered by Digital Target · Retail POS</div>`;
  return wrap(css, head + cards + body + foot, report.title);
}

function fmtSub(col, v) {
  if (v === null || v === undefined || v === '') return '';
  if (col.key === 'created_at') return formatDateTime(v);
  return String(v);
}

module.exports = { renderThermalReport };
