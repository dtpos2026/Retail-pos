'use strict';

const settings = require('../services/settings');
const orders = require('../services/orders');
const receiptData = require('./receiptData');
const { renderReceipt, TEMPLATES } = require('./receiptTemplates');
const { renderToken } = require('./tokenTemplate');
const { esc } = require('./common');
const { AppError } = require('../core/errors');

// printer.js needs Electron; load lazily so the HTML builders stay testable in Node.
const printer = () => require('./printer');

function receiptHtml({ orderId, sample, overrides, reprint } = {}) {
  const order = sample || !orderId ? receiptData.sampleOrder() : orders.get({ id: orderId });
  return renderReceipt(receiptData.build(order, { ...(overrides || {}), reprint }));
}

function tokenHtmls({ orderId, sample, overrides } = {}) {
  let order;
  if (sample || !orderId) {
    order = receiptData.sampleOrder();
    order.order_type = 'takeaway';
    order.table_name = null;
    order.tokens = [{ token_no: '027', created_at: order.created_at, items: order.items.map((i) => ({ name: i.name, qty: i.qty, total: i.total, notes: i.notes })) }];
  } else {
    order = orders.get({ id: orderId });
  }
  if (!order.tokens.length) throw new AppError('This order has no token.');
  return order.tokens.map((tk) => renderToken(order, tk, overrides));
}

async function printReceipt({ orderId, reprint }) {
  const cfg = settings.get('receipt');
  const html = receiptHtml({ orderId, reprint });
  return printer().printHtml(html, {
    printerName: settings.get('printer').receiptPrinter,
    widthMm: cfg.paperWidth,
    copies: cfg.copies,
    jobKey: `receipt:${orderId}`,
  });
}

async function printTokens({ orderId }) {
  const cfg = settings.get('token');
  const pr = settings.get('printer');
  const htmls = tokenHtmls({ orderId });
  let result;
  for (let i = 0; i < htmls.length; i++) {
    result = await printer().printHtml(htmls[i], {
      printerName: pr.tokenPrinter || pr.receiptPrinter,
      widthMm: cfg.paperWidth,
      jobKey: `token:${orderId}:${i}`,
    });
  }
  return { ...result, count: htmls.length };
}

/** Receipt + tokens after checkout, according to the auto-print settings. */
async function printAfterSale({ orderId, receipt, token }) {
  const pr = settings.get('printer');
  const out = { receipt: null, token: null, errors: [] };
  const wantReceipt = receipt ?? pr.autoPrintReceipt;
  if (wantReceipt) {
    try {
      out.receipt = await printReceipt({ orderId });
    } catch (e) {
      out.errors.push(`Receipt: ${e.userFacing ? e.message : 'printing failed'}`);
    }
  }
  const o = orders.get({ id: orderId });
  const wantToken = (token ?? pr.autoPrintToken) && o.tokens.length > 0;
  if (wantToken) {
    try {
      out.token = await printTokens({ orderId });
    } catch (e) {
      out.errors.push(`Token: ${e.userFacing ? e.message : 'printing failed'}`);
    }
  }
  return out;
}

function testPageHtml(kind) {
  const w = kind === 'token' ? settings.get('token').paperWidth : settings.get('receipt').paperWidth;
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

async function testPrint({ kind = 'receipt', printerName }) {
  const pr = settings.get('printer');
  if (kind === 'token') {
    const [html] = tokenHtmls({ sample: true });
    return printer().printHtml(html, { printerName: printerName ?? (pr.tokenPrinter || pr.receiptPrinter), widthMm: settings.get('token').paperWidth, jobKey: 'test:token' });
  }
  return printer().printHtml(testPageHtml('receipt'), { printerName: printerName ?? pr.receiptPrinter, widthMm: settings.get('receipt').paperWidth, jobKey: 'test:receipt' });
}

module.exports = { TEMPLATES, receiptHtml, tokenHtmls, printReceipt, printTokens, printAfterSale, testPrint, listPrinters: () => printer().listPrinters() };
