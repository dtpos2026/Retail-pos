'use strict';

const settings = require('../services/settings');
const orders = require('../services/orders');
const reports = require('../services/reports');
const receiptData = require('./receiptData');
const { renderReceipt, TEMPLATES } = require('./receiptTemplates');
const { renderToken, renderKot, TOKEN_DESIGNS } = require('./tokenTemplate');
const { renderThermalReport } = require('./reportThermal');
const { esc, bodyWidthMm } = require('./common');
const { AppError } = require('../core/errors');

// printer.js needs Electron; load lazily so the HTML builders stay testable in plain Node.
const printer = () => require('./printer');

function receiptHtml({ orderId, sample, overrides, reprint } = {}) {
  const order = sample || !orderId ? receiptData.sampleOrder() : orders.get({ id: orderId });
  return renderReceipt(receiptData.build(order, { ...(overrides || {}), reprint }));
}

function sampleTokenOrder() {
  const order = receiptData.sampleOrder();
  order.order_type = 'takeaway';
  order.table_name = null;
  order.tokens = [{ token_no: '027', created_at: order.created_at, items: order.items.map((i) => ({ name: i.name, qty: i.qty, total: i.total, notes: i.notes })) }];
  return order;
}

function tokenHtmls({ orderId, sample, overrides } = {}) {
  const order = sample || !orderId ? sampleTokenOrder() : orders.get({ id: orderId });
  if (!order.tokens.length) throw new AppError('This order has no token.');
  return order.tokens.map((tk) => renderToken(order, tk, overrides));
}

function kotHtml({ orderId, sample } = {}) {
  const order = sample || !orderId ? { ...receiptData.sampleOrder(), status: 'pending' } : orders.get({ id: orderId });
  return renderKot(order);
}

const receiptPrinter = () => settings.get('printer').receiptPrinter;
const tokenPrinter = () => {
  const pr = settings.get('printer');
  return pr.tokenPrinter || pr.receiptPrinter;
};

async function printReceipt({ orderId, reprint }) {
  const cfg = settings.get('receipt');
  return printer().printHtml(receiptHtml({ orderId, reprint }), {
    printerName: receiptPrinter(),
    widthMm: cfg.paperWidth,
    copies: cfg.copies,
    jobKey: `receipt:${orderId}`,
  });
}

async function printTokens({ orderId }) {
  const cfg = settings.get('token');
  const htmls = tokenHtmls({ orderId });
  let result;
  for (let i = 0; i < htmls.length; i++) {
    result = await printer().printHtml(htmls[i], { printerName: tokenPrinter(), widthMm: cfg.paperWidth, jobKey: `token:${orderId}:${i}` });
  }
  return { ...result, count: htmls.length };
}

/** Kitchen order ticket for a running / held order (goes to the token / kitchen printer). */
async function printKot({ orderId }) {
  return printer().printHtml(kotHtml({ orderId }), { printerName: tokenPrinter(), widthMm: settings.get('token').paperWidth, jobKey: `kot:${orderId}` });
}

/** Receipt + tokens after checkout, according to the auto-print settings. */
async function printAfterSale({ orderId, receipt, token }) {
  const pr = settings.get('printer');
  const out = { receipt: null, token: null, errors: [] };
  if (receipt ?? pr.autoPrintReceipt) {
    try {
      out.receipt = await printReceipt({ orderId });
    } catch (e) {
      out.errors.push(`Receipt: ${e.userFacing ? e.message : 'printing failed'}`);
    }
  }
  const o = orders.get({ id: orderId });
  if ((token ?? pr.autoPrintToken) && o.tokens.length > 0) {
    try {
      out.token = await printTokens({ orderId });
    } catch (e) {
      out.errors.push(`Token: ${e.userFacing ? e.message : 'printing failed'}`);
    }
  }
  return out;
}

function testPageHtml() {
  const w = settings.get('receipt').paperWidth;
  const r = settings.get('receipt');
  const ruler = '|'.padEnd(w === 58 ? 32 : 48, '-') + '|';
  const html = receiptHtml({ sample: true });
  const banner = `<div style="border:2px solid #000;padding:2mm;margin-bottom:2mm;text-align:center">
    <div style="font-weight:700;font-size:1.2em">PRINTER TEST</div>
    <div>Paper: ${w}mm · Template: ${esc(r.template)}</div>
    <div style="font-family:Consolas,monospace;font-size:10px;white-space:nowrap;overflow:hidden">${ruler}</div>
    <div>Urdu: <bdi>اردو پرنٹ ٹیسٹ — شکریہ</bdi></div></div>`;
  return html.replace('<body>', `<body>${banner}`);
}

/** Frame drawn edge to edge: shows at a glance whether left and right margins are equal. */
function marginTestHtml(widthMm) {
  const bw = bodyWidthMm(widthMm);
  const pr = settings.get('printer');
  let ticks = '';
  for (let mm = 0; mm <= Math.floor(bw); mm += 5) {
    const long = mm % 10 === 0;
    ticks += `<i style="position:absolute;left:${mm}mm;top:0;height:${long ? 4 : 2.2}mm;border-left:1px solid #000"></i>`;
    if (long && mm > 0 && mm < bw - 6) ticks += `<span style="position:absolute;left:${mm - 2}mm;top:4.2mm;font-size:9px">${mm}</span>`;
  }
  return `<!doctype html><html><head><meta charset="utf-8"><style>
*{box-sizing:border-box;margin:0;padding:0}html,body{background:#fff;color:#000}
body{width:${bw}mm;font-family:Arial,sans-serif;font-size:12px}
.frame{border:3px solid #000;padding:2mm;text-align:center;line-height:1.45}
.row{display:flex;justify-content:space-between;font-weight:700}
.ruler{position:relative;height:9mm;border-bottom:1px solid #000;margin-bottom:2mm}
</style></head><body>
<div class="ruler">${ticks}</div>
<div class="frame">
  <div class="row"><span>◄ LEFT</span><span>RIGHT ►</span></div>
  <div class="b" style="font-weight:700;font-size:15px;margin:1mm 0">MARGIN TEST</div>
  <div>Paper ${widthMm} mm · width ${bw.toFixed(1)} mm · balance ${Number(pr.shift) || 0}</div>
  <div style="font-size:10px;margin-top:1mm">Both black borders must be the same distance from the paper edges. If the LEFT gap is bigger, lower Side balance (e.g. -8); if the RIGHT gap is bigger, raise it (e.g. +8).</div>
</div>
</body></html>`;
}

async function testPrint({ kind = 'receipt', printerName }) {
  const pr = settings.get('printer');
  if (kind === 'margins') {
    const w = settings.get('receipt').paperWidth;
    return printer().printHtml(marginTestHtml(w), { printerName: printerName ?? pr.receiptPrinter, widthMm: w, jobKey: 'test:margins' });
  }
  if (kind === 'token') {
    const [html] = tokenHtmls({ sample: true });
    return printer().printHtml(html, { printerName: printerName ?? tokenPrinter(), widthMm: settings.get('token').paperWidth, jobKey: 'test:token' });
  }
  if (kind === 'kot') return printer().printHtml(kotHtml({ sample: true }), { printerName: printerName ?? tokenPrinter(), widthMm: settings.get('token').paperWidth, jobKey: 'test:kot' });
  return printer().printHtml(testPageHtml(), { printerName: printerName ?? pr.receiptPrinter, widthMm: settings.get('receipt').paperWidth, jobKey: 'test:receipt' });
}

// ---- thermal reports ---------------------------------------------------------------------

function reportHtml({ key, from, to, width }) {
  return renderThermalReport({ ...reports.run({ key, from, to }), key }, { paperWidth: width });
}

async function printReportThermal({ key, from, to, width }) {
  const w = Number(width) || settings.get('receipt').paperWidth;
  return printer().printHtml(reportHtml({ key, from, to, width: w }), { printerName: receiptPrinter(), widthMm: w, jobKey: `report:${key}:${from}:${to}` });
}

module.exports = {
  TEMPLATES,
  TOKEN_DESIGNS,
  receiptHtml,
  tokenHtmls,
  kotHtml,
  reportHtml,
  printReceipt,
  printTokens,
  printKot,
  printAfterSale,
  printReportThermal,
  testPrint,
  marginTestHtml,
  printerStatus: (a) => printer().printerStatus(a),
  listPrinters: (a) => printer().listPrinters(a || {}),
  renderPng: (html, widthMm) => printer().renderPng(html, { widthMm }),
};
