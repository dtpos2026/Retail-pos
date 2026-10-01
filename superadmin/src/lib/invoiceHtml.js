import QRCode from 'qrcode';
import { invoiceTotal, verifyUrl } from './billing';

const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

import { DT_LOCKUP_PURPLE } from '../components/Brand';

const money = (n, cur) => `${cur} ${Number(n || 0).toLocaleString('en-PK', { maximumFractionDigits: 2 })}`;

async function toDataUrl(url) {
  if (!url || url.startsWith('data:')) return url || '';
  try {
    const blob = await (await fetch(url)).blob();
    return await new Promise((resolve) => {
      const r = new FileReader();
      r.onload = () => resolve(String(r.result));
      r.readAsDataURL(blob);
    });
  } catch {
    return '';
  }
}

/** Line items: new invoices have items[]; older ones had one amount + description. */
export function invoiceLines(inv) {
  if (Array.isArray(inv.items) && inv.items.length) return inv.items.map((i) => ({ description: i.description, qty: Number(i.qty) || 0, rate: Number(i.rate) || 0 }));
  return [{ description: inv.description || inv.pkg || 'Software license', qty: 1, rate: Number(inv.amount) || 0 }];
}

function a4(inv, profile, ctx) {
  const { cur, total, paid, due, status, qr, logo, payQr } = ctx;
  const lines = invoiceLines(inv);
  const extras = (inv.extras || []).filter((e) => e.label || Number(e.amount));
  const cust = inv.customer || {};
  const pill = status === 'PAID' ? '#16a34a' : status === 'PARTIALLY PAID' ? '#d97706' : '#dc2626';
  const info = [
    ['Invoice date', inv.date],
    ['Due date', inv.dueDate || 'On receipt'],
    inv.service && ['Service', inv.service],
    inv.paymentMethod && ['Payment', inv.paymentMethod],
    inv.pkg && ['Package', inv.pkg],
    inv.period && ['Period', inv.period],
  ].filter(Boolean);
  const hasPay = profile.paymentTitle || profile.paymentBank || profile.paymentAccount || payQr;
  const terms = String(profile.terms || '').split('\n').map((t) => t.trim()).filter(Boolean);
  const subtotal = lines.reduce((x, l) => x + l.qty * l.rate, 0) + extras.reduce((x, e) => x + (Number(e.amount) || 0), 0);
  return `<!doctype html><html><head><meta charset="utf-8"><title>${esc(inv.invoiceNo)}</title><style>
*{box-sizing:border-box;margin:0;padding:0}
@page{size:A4;margin:0}
html,body{width:210mm;min-height:297mm}
body{font-family:Inter,'Segoe UI',Arial,sans-serif;color:#1f1147;font-size:11.5px;position:relative;-webkit-print-color-adjust:exact;print-color-adjust:exact}
.hd{background:linear-gradient(120deg,#3b0764 0%,#4c1d95 45%,#5b21b6 100%);color:#fff;padding:20mm 15mm 11mm;display:flex;justify-content:space-between;align-items:center;height:62mm}
.logo{background:#fff;border-radius:10px;padding:9px 14px;display:flex;align-items:center;min-width:46mm;height:21mm}
.logo img{max-height:15mm;max-width:44mm;object-fit:contain}
.ti{text-align:right}.ti h1{font-size:46px;letter-spacing:.22em;font-weight:800;line-height:1;margin-right:-.22em}
.ti .no{font-size:15px;margin-top:8px;opacity:.95}
.pill{display:inline-block;background:#fff;color:${pill};font-weight:800;letter-spacing:.1em;border-radius:20px;padding:4px 16px;margin-top:9px;font-size:12px}
.wrap{padding:0 15mm}
.row3{display:grid;grid-template-columns:1fr 1fr 1fr;gap:10mm;margin-top:9mm;align-items:start}
.lab{color:#5b21b6;font-weight:800;letter-spacing:.18em;font-size:10px;margin-bottom:5px}
.nm{font-size:17px;font-weight:800;line-height:1.2}.mut{color:#6b6f8a}.prj{margin-top:7px;line-height:1.35}
.panel{background:#f3f0fb;border-radius:14px;padding:12px 15px}
.panel .r{display:flex;justify-content:space-between;gap:10px;padding:4px 0}
.panel .r span:first-child{color:#6b6f8a}.panel .r b{text-align:right}
table.it{width:100%;border-collapse:separate;border-spacing:0;margin-top:10mm}
table.it th{background:#3b0764;color:#fff;text-align:left;padding:11px 14px;letter-spacing:.12em;font-size:10.5px}
table.it th:first-child{border-radius:12px 0 0 0}table.it th:last-child{border-radius:0 12px 0 0}
table.it th.c,table.it td.c{text-align:center}table.it th.r,table.it td.r{text-align:right}
table.it td{padding:11px 14px;border-bottom:1px solid #e7e2f5;font-size:13px}
.two{display:grid;grid-template-columns:1.05fr 1fr;gap:9mm;margin-top:8mm;align-items:start}
.card{border:1px solid #e3ddf3;border-radius:16px;overflow:hidden}
.pay{padding:14px 16px;display:flex;gap:14px;align-items:center}
.pay img.q{width:27mm;height:27mm;object-fit:contain}
.pay .t{flex:1}.pay .t .lab{margin-bottom:6px}.pay .t div{line-height:1.55;font-size:13px}
.vq{text-align:center;font-size:10px;color:#6b6f8a}.vq img{width:27mm;height:27mm;display:block;margin-bottom:3px}
.tot .r{display:flex;justify-content:space-between;padding:13px 18px;font-size:14px}
.tot .grand{background:#3b0764;color:#fff;font-weight:800;font-size:17px}
.tot .pd{color:#16a34a}.tot .bd{color:#dc2626;font-weight:800;font-size:16px}
.bot{display:flex;justify-content:space-between;align-items:flex-end;margin-top:14mm}
.terms .lab{margin-bottom:6px}.terms p{color:#6b6f8a;font-size:12px;line-height:1.7}
.sig{text-align:center;min-width:62mm}.sig img{max-height:18mm;max-width:50mm}
.sig .ln{border-top:3px solid #3b0764;margin-top:4px;padding-top:7px}.sig b{font-size:14px}
.ft{position:absolute;left:0;right:0;bottom:0;border-top:4px solid #3b0764;background:#f3f0fb;padding:9px 15mm;display:flex;justify-content:space-between;font-size:12px}
.ft b{color:#3b0764}.ft span{color:#6b6f8a}
</style></head><body>
<div class="hd"><div class="logo">${logo ? `<img src="${logo}">` : `<b style="font-size:18px;color:#3b0764">${esc(profile.name)}</b>`}</div>
<div class="ti"><h1>INVOICE</h1><div class="no">${esc(inv.invoiceNo)}</div><span class="pill">${status === 'PARTIALLY PAID' ? 'PARTIAL' : status}</span></div></div>
<div class="wrap">
<div class="row3">
 <div><div class="lab">FROM</div><div class="nm">${esc(profile.name)}</div>${profile.phone ? `<div class="mut" style="margin-top:3px">Phone: ${esc(profile.phone)}</div>` : ''}${profile.email ? `<div class="mut">${esc(profile.email)}</div>` : ''}${profile.address ? `<div class="mut">${esc(profile.address)}</div>` : ''}</div>
 <div><div class="lab">BILL TO</div><div class="nm">${esc(cust.restaurant)}</div>${cust.phone ? `<div class="mut" style="margin-top:3px">${esc(cust.phone)}</div>` : ''}${cust.owner ? `<div class="mut">${esc(cust.owner)}</div>` : ''}${cust.address ? `<div class="mut">${esc(cust.address)}</div>` : ''}${inv.project ? `<div class="prj"><span class="mut">Project:</span> <b>${esc(inv.project)}</b></div>` : ''}</div>
 <div class="panel">${info.map(([k, v]) => `<div class="r"><span>${esc(k)}</span><b>${esc(v)}</b></div>`).join('')}</div>
</div>
<table class="it"><thead><tr><th style="width:8%">#</th><th>DESCRIPTION</th><th class="c" style="width:10%">QTY</th><th class="r" style="width:16%">RATE</th><th class="r" style="width:17%">AMOUNT</th></tr></thead><tbody>
${lines.map((l, i) => `<tr><td>${i + 1}</td><td>${esc(l.description)}</td><td class="c">${l.qty}</td><td class="r">${Number(l.rate).toLocaleString('en-PK')}</td><td class="r"><b>${(l.qty * l.rate).toLocaleString('en-PK')}</b></td></tr>`).join('')}
${extras.map((e, i) => `<tr><td>${lines.length + i + 1}</td><td>${esc(e.label)}</td><td class="c">1</td><td class="r">${Number(e.amount || 0).toLocaleString('en-PK')}</td><td class="r"><b>${Number(e.amount || 0).toLocaleString('en-PK')}</b></td></tr>`).join('')}
</tbody></table>
<div class="two">
 <div>${hasPay || qr ? `<div class="card pay">${payQr ? `<img class="q" src="${payQr}">` : ''}<div class="t"><div class="lab">PAYMENT DETAILS</div>${profile.paymentTitle ? `<div>${esc(profile.paymentTitle)}</div>` : ''}${profile.paymentBank ? `<div>${esc(profile.paymentBank)}</div>` : ''}${profile.paymentAccount ? `<div>${esc(profile.paymentAccount)}</div>` : ''}</div>${qr ? `<div class="vq"><img src="${qr}">Scan to verify</div>` : ''}</div>` : ''}</div>
 <div class="card tot"><div class="r"><span>Subtotal</span><span>${money(subtotal, cur)}</span></div>${Number(inv.discount) > 0 ? `<div class="r"><span>Discount</span><span>− ${money(inv.discount, cur)}</span></div>` : ''}<div class="r grand"><span>Total</span><span>${money(total, cur)}</span></div><div class="r pd"><span>Paid</span><span>${money(paid, cur)}</span></div><div class="r bd"><span>Balance Due</span><span>${money(due, cur)}</span></div></div>
</div>
<div class="bot"><div class="terms">${terms.length ? `<div class="lab">TERMS &amp; CONDITIONS</div>${terms.map((t, i) => `<p>${i + 1}. ${esc(t)}</p>`).join('')}` : ''}${inv.notes ? `<p style="margin-top:8px"><b>Note:</b> ${esc(inv.notes)}</p>` : ''}</div>
<div class="sig">${profile.signature ? `<img src="${profile.signature}">` : '<div style="height:16mm"></div>'}<div class="ln"><b>${esc(profile.signatory || profile.name)}</b><div class="mut">Authorized Signatory</div></div></div></div>
</div>
<div class="ft"><b>${esc(profile.footer || 'Thank you for your business!')}</b><span>${esc([profile.name, profile.phone && `Phone: ${profile.phone}`].filter(Boolean).join(' | '))}</span></div>
</body></html>`;
}

/** Standalone HTML of an invoice — `format` is 'a4' or '80mm'. Opened in a print frame (Print / Save as PDF). */
export async function invoiceHtml(inv, profile, format = 'a4') {
  const cur = profile.currency || 'Rs.';
  const total = invoiceTotal(inv);
  const paid = Number(inv.paid) || 0;
  const due = Math.max(0, total - paid);
  const qr = inv.verifyCode ? await QRCode.toDataURL(verifyUrl(profile, inv.verifyCode), { margin: 0, width: 240 }) : '';
  const status = paid >= total && total > 0 ? 'PAID' : paid > 0 ? 'PARTIALLY PAID' : 'UNPAID';
  if (format === 'a4') {
    const logo = (await toDataUrl(profile.logo)) || (await toDataUrl(DT_LOCKUP_PURPLE));
    return a4(inv, profile, { cur, total, paid, due, status, qr, logo, payQr: profile.paymentQr });
  }
  const lines = [...invoiceLines(inv).map((l) => [`${l.description}${l.qty !== 1 ? ` × ${l.qty}` : ''}`, l.qty * l.rate]), ...(inv.extras || []).map((e) => [e.label, e.amount])];
  if (Number(inv.discount) > 0) lines.push(['Discount', -Number(inv.discount)]);
  const num = (n) => money(n, cur);
  const css = `@page{size:80mm auto;margin:0}body{width:72mm;margin:0 auto;padding:3mm 0;font:12px Arial,sans-serif;color:#000}h1{font-size:16px;margin:0;text-align:center}.c{text-align:center}.row{display:flex;justify-content:space-between;gap:6px;padding:2px 0}.hr{border-top:1px dashed #000;margin:5px 0}.b{font-weight:700}.tot{font-size:15px}.stamp{border:2px solid #000;padding:2px 8px;display:inline-block;font-weight:800;margin:4px 0}img.qr{width:26mm;height:26mm}`;
  const cust = inv.customer || {};
  const body = `${profile.logo ? `<div class="c"><img src="${profile.logo}" style="max-height:40px"></div>` : ''}<h1>${esc(profile.name)}</h1><div class="c">${esc(profile.tagline)}</div><div class="c">${esc([profile.phone, profile.email].filter(Boolean).join(' · '))}</div><div class="hr"></div><div class="c b">INVOICE ${esc(inv.invoiceNo)}</div><div class="c">${esc(inv.date)}</div><div class="hr"></div>
<div class="b">${esc(cust.restaurant)}</div>${cust.owner ? `<div>${esc(cust.owner)}</div>` : ''}${cust.phone ? `<div>${esc(cust.phone)}</div>` : ''}<div class="hr"></div>
${lines.map(([k, v]) => `<div class="row"><span>${esc(k)}</span><span>${num(v)}</span></div>`).join('')}<div class="hr"></div>
<div class="row b tot"><span>TOTAL</span><span>${num(total)}</span></div><div class="row"><span>Paid</span><span>${num(paid)}</span></div><div class="row b"><span>Balance</span><span>${num(due)}</span></div><div class="c"><span class="stamp">${status}</span></div>
${profile.paymentBank ? `<div class="hr"></div><div class="b c">PAYMENT DETAILS</div><div class="c">${esc([profile.paymentTitle, profile.paymentBank, profile.paymentAccount].filter(Boolean).join(' · '))}</div>` : ''}
<div class="hr"></div>${qr ? `<div class="c"><img class="qr" src="${qr}"><div style="font-size:10px">Scan to verify this invoice</div></div>` : ''}<div class="c" style="margin-top:4px">${esc(profile.footer)}</div>`;
  return `<!doctype html><html><head><meta charset="utf-8"><title>${esc(inv.invoiceNo)}</title><style>*{box-sizing:border-box}${css}</style></head><body>${body}</body></html>`;
}

/** Print through a hidden iframe (browser print dialog → printer or "Save as PDF"). */
export function printHtml(html) {
  const f = document.createElement('iframe');
  f.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0';
  document.body.appendChild(f);
  f.srcdoc = html;
  f.onload = () => {
    setTimeout(() => {
      f.contentWindow.focus();
      f.contentWindow.print();
      setTimeout(() => f.remove(), 2000);
    }, 250);
  };
}
