'use strict';

// Printing engine tests (pure Node): ESC/POS encoding, templates, thermal reports, KOT, tokens, QR, words.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'rpos-print-'));
const ctx = require('../electron/core/context');
ctx.paths = { userData: tmp, dbFile: path.join(tmp, 'data', 'p.db'), backups: tmp, logs: tmp, temp: tmp };
const { Database } = require('../electron/db/database');
ctx.db = new Database(ctx.paths.dbFile);
const seed = require('../electron/db/seed');
seed.ensureDefaults();
seed.loadDemo();
const auth = require('../electron/services/auth');
auth.login({ username: 'admin', password: 'admin123' });
const settings = require('../electron/services/settings');
const orders = require('../electron/services/orders');
const products = require('../electron/services/products');
const reports = require('../electron/services/reports');
const printService = require('../electron/printing/printService');
const escpos = require('../electron/printing/escpos');
const { amountInWords, localDate } = require('../electron/core/util');
const { qrSvg } = require('../electron/printing/qr');

const P = products.list({});
for (let i = 0; i < 4; i++) orders.save({ orderType: 'takeaway', action: 'pay', items: [{ productId: P[i].id, qty: 2 }], payment: { method: 'cash' }, tokenMode: 'combined' });
const today = localDate();

test('ESC/POS: bitmap -> job -> decode round trip, band split, cut', () => {
  const w = 576;
  const h = 700;
  const gray = new Uint8Array(w * h).fill(255);
  for (let y = 100; y < 130; y++) for (let x = 40; x < 200; x++) gray[y * w + x] = 0; // black block
  const bmp = escpos.packBitmap(gray, w, h, { threshold: 150 });
  assert.equal(bmp.rowBytes, 72);
  const trimmed = escpos.trimBlankTail(bmp, 4);
  assert.equal(trimmed.height, 134, 'trailing blank rows removed');
  const job = escpos.buildJob(trimmed, { cut: 'partial', feedMm: 3, copies: 2 });
  const dec = escpos.decodeJob(job);
  assert.equal(dec.width, 576);
  assert.equal(dec.height, 134 * 2);
  assert.equal(dec.cuts, 2);
  // pixel (50,110) is black, (300,110) is white
  assert.ok(dec.rows[110][50 >> 3] & (0x80 >> (50 & 7)));
  assert.ok(!(dec.rows[110][300 >> 3] & (0x80 >> (300 & 7))));
  // bands never exceed 240 rows
  const big = escpos.packBitmap(new Uint8Array(w * 1000), w, 1000);
  assert.ok(escpos.decodeJob(escpos.buildJob(big, {})).height === 1000);
  // no-cut and compat-cut variants
  assert.equal(escpos.decodeJob(escpos.buildJob(trimmed, { cut: 'none' })).cuts, 0);
  assert.equal(escpos.decodeJob(escpos.buildJob(trimmed, { cut: 'full', compatCut: true })).cuts, 1);
  assert.equal(escpos.dotsForPaper(58), 384);
  assert.equal(escpos.dotsForPaper(80), 576);
  assert.equal(escpos.dotsForPaper(80, 640), 640);
});

test('side balance: content width shrinks and is padded so both margins can be equalised', () => {
  const e = escpos.effectiveDots(80, { shift: 8 });
  assert.deepEqual(e, { total: 576, shift: 8, content: 568 });
  assert.equal(escpos.effectiveDots(80, { shift: -16 }).content, 560);
  assert.equal(escpos.effectiveDots(58, {}).content, 384);
  assert.equal(escpos.effectiveDots(80, { shift: 999 }).shift, 96);
  const gray = new Uint8Array([0, 0, 0, 0]); // 2x2 black
  const out = escpos.padGray(gray, 2, 2, 6, 3);
  assert.equal(out.length, 12);
  assert.deepEqual([...out.slice(0, 6)], [255, 255, 255, 0, 0, 255]);
  assert.equal(escpos.padGray(gray, 2, 2, 2, 0), gray);
});

test('printer auto-detect prefers the thermal printer and ignores virtual ones', () => {
  const detect = require('../electron/printing/detect');
  const list = [
    { name: 'Microsoft Print to PDF', isDefault: true, status: 0 },
    { name: 'OneNote (Desktop)', status: 0 },
    { name: 'HP LaserJet 1020', status: 0 },
    { name: 'XP-80C', status: 0 },
  ];
  assert.equal(detect.pickThermal(list).name, 'XP-80C');
  assert.equal(detect.pickThermal([{ name: 'Microsoft XPS Document Writer' }, { name: 'HP LaserJet 1020', isDefault: true }]).name, 'HP LaserJet 1020');
  assert.equal(detect.pickThermal([{ name: 'Microsoft Print to PDF' }]), null);
  assert.equal(detect.pickThermal([{ name: 'POS-80', status: 0x80 }, { name: 'RP326 Receipt Printer', status: 0 }]).name, 'RP326 Receipt Printer');
  assert.ok(detect.isOffline({ status: 0x80 }));
  assert.equal(detect.pickThermal([]), null);
});

test('dithering only touches picture regions and keeps text pixels', () => {
  const w = 64;
  const h = 32;
  const gray = new Uint8Array(w * h).fill(255);
  for (let y = 0; y < h; y++) for (let x = 0; x < 32; x++) gray[y * w + x] = 128; // mid-tone "logo"
  gray[5 * w + 50] = 0; // "text" pixel outside the region
  const bmp = escpos.packBitmap(gray, w, h, { threshold: 150, ditherRects: [{ x: 0, y: 0, w: 32, h }] });
  const black = (x, y) => !!(bmp.data[y * bmp.rowBytes + (x >> 3)] & (0x80 >> (x & 7)));
  assert.ok(black(50, 5), 'text pixel stays black');
  let blacks = 0;
  for (let y = 0; y < h; y++) for (let x = 0; x < 32; x++) if (black(x, y)) blacks++;
  assert.ok(blacks > 200 && blacks < 850, `mid-tone dithered to a mix (${blacks} of 1024)`);
});

test('11 receipt templates, thermal mode prints 72mm/48mm wide, driver mode full paper', () => {
  assert.ok(printService.TEMPLATES.length >= 11);
  settings.set('printer', { method: 'thermal' });
  const html80 = printService.receiptHtml({ sample: true });
  assert.match(html80, /width:72mm/);
  settings.set('receipt', { paperWidth: 58 });
  assert.match(printService.receiptHtml({ sample: true }), /width:48mm/);
  settings.set('printer', { method: 'driver' });
  assert.match(printService.receiptHtml({ sample: true }), /width:58mm/);
  settings.set('printer', { method: 'thermal' });
  settings.set('receipt', { paperWidth: 80 });
});

test('QR code, amount in words and powered-by appear in receipts', () => {
  assert.match(qrSvg('https://digitaltarget.digital'), /<svg[^>]+viewBox/);
  assert.equal(amountInWords(1050), 'Rupees One Thousand Fifty Only');
  assert.equal(amountInWords(1234567.5), 'Rupees Twelve Lakh Thirty Four Thousand Five Hundred Sixty Seven and Fifty Paisa Only');
  settings.set('receipt', { qrMode: 'custom', qrText: 'https://example.com/pay', qrLabel: 'Scan to pay', amountInWords: true, showPoweredBy: true, template: 'tax' });
  const html = printService.receiptHtml({ sample: true });
  assert.match(html, /Scan to pay/);
  assert.match(html, /<svg[^>]+shape-rendering="crispEdges"/);
  assert.match(html, /Rupees One Thousand Nine Hundred Only/);
  assert.match(html, /Powered by Digital Target/);
  settings.set('receipt', { showPoweredBy: false, qrMode: 'off' });
  const plain = printService.receiptHtml({ sample: true });
  assert.doesNotMatch(plain, /Powered by/);
  assert.doesNotMatch(plain, /crispEdges/);
  settings.set('receipt', { template: 'classic', amountInWords: false, showPoweredBy: true });
});

test('token designs render distinct layouts; KOT lists items without prices', () => {
  const seen = new Set();
  for (const d of printService.TOKEN_DESIGNS) {
    settings.set('token', { design: d.key });
    const [html] = printService.tokenHtmls({ sample: true });
    assert.match(html, /027/);
    seen.add(html.replace(/\d+/g, ''));
  }
  assert.equal(seen.size, printService.TOKEN_DESIGNS.length);
  settings.set('token', { design: 'classic' });
  const kot = printService.kotHtml({ sample: true });
  assert.match(kot, /KITCHEN ORDER/);
  assert.match(kot, /Zinger Burger/);
  assert.doesNotMatch(kot, /1,990|Rs\./);
});

test('every report renders as compact 80mm and 58mm thermal HTML; day summary has sections', () => {
  for (const r of reports.REPORTS) {
    for (const width of [80, 58]) {
      const html = printService.reportHtml({ key: r.key, from: today, to: today, width });
      assert.match(html, new RegExp(r.label.toUpperCase().replace(/[()]/g, '\\$&')), r.key);
      assert.match(html, new RegExp(`width:${width === 80 ? 72 : 48}mm`));
    }
  }
  const daily = reports.run({ key: 'daily', from: today, to: today });
  assert.ok(daily.rows.some((x) => x.kind === 'head' && x.label === 'SALES'));
  assert.ok(daily.rows.some((x) => x.label === 'NET SALES'));
  const sum = orders.list({ status: 'completed', from: today, to: today }).reduce((s, o) => s + o.total, 0);
  const net = daily.rows.find((x) => x.label === 'NET SALES').value.replace(/Rs\./, '').replace(/[^\d.]/g, '');
  assert.equal(Number(net), Math.round(sum * 100) / 100, 'day summary net sales equals real sales');
});

test('settings validation for new printer / appearance options', () => {
  assert.throws(() => settings.set('printer', { method: 'laser' }), /print method/);
  assert.throws(() => settings.set('printer', { dots: 333 }), /multiple of 8/);
  assert.throws(() => settings.set('appearance', { theme: 'pink' }), /theme/);
  assert.equal(settings.set('appearance', { theme: 'crimson' }).theme, 'crimson');
  settings.set('appearance', { theme: 'royal' });
});

test.after(() => {
  ctx.db.close();
  fs.rmSync(tmp, { recursive: true, force: true });
});
