import QRCode from 'qrcode';
import { invoiceTotal, verifyUrl, maskKey } from './billing';

const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const num = (n, cur) => `${cur} ${Number(n || 0).toLocaleString('en-PK', { maximumFractionDigits: 2 })}`;

/** Standalone HTML of an invoice — `format` is 'a4' or '80mm'. Opened in a print frame (Print / Save as PDF). */
export async function invoiceHtml(inv, profile, format = 'a4') {
  const cur = profile.currency || 'Rs.';
  const total = invoiceTotal(inv);
  const paid = Number(inv.paid) || 0;
  const due = Math.max(0, total - paid);
  const qr = inv.verifyCode ? await QRCode.toDataURL(verifyUrl(profile, inv.verifyCode), { margin: 0, width: 240 }) : '';
  const lines = [
    [inv.description || inv.pkg || 'Software license', inv.amount],
    ...(inv.extras || []).map((e) => [e.label, e.amount]),
  ];
  if (Number(inv.discount) > 0) lines.push(['Discount', -Number(inv.discount)]);
  const status = paid >= total && total > 0 ? 'PAID' : paid > 0 ? 'PARTIALLY PAID' : 'UNPAID';
  const narrow = format === '80mm';
  const css = narrow
    ? `@page{size:80mm auto;margin:0}body{width:72mm;margin:0 auto;padding:3mm 0;font:12px Arial,sans-serif;color:#000}h1{font-size:16px;margin:0;text-align:center}.c{text-align:center}.row{display:flex;justify-content:space-between;gap:6px;padding:2px 0}.hr{border-top:1px dashed #000;margin:5px 0}.b{font-weight:700}.tot{font-size:15px}.stamp{border:2px solid #000;padding:2px 8px;display:inline-block;font-weight:800;margin:4px 0}img.qr{width:26mm;height:26mm}`
    : `@page{size:A4;margin:14mm}body{font:13px 'Segoe UI',Arial,sans-serif;color:#1f2340;margin:0}.top{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:3px solid #6d28d9;padding-bottom:12px}h1{font-size:28px;margin:0;color:#6d28d9;letter-spacing:.04em}.muted{color:#6b6f8a}table{width:100%;border-collapse:collapse;margin-top:16px}th{background:#6d28d9;color:#fff;text-align:left;padding:8px 10px}td{padding:8px 10px;border-bottom:1px solid #e3d9f7}.r{text-align:right}.tot td{font-weight:800;font-size:15px;border-top:2px solid #6d28d9}.stamp{display:inline-block;border:3px solid;padding:3px 14px;border-radius:8px;font-weight:800;letter-spacing:.1em;transform:rotate(-6deg)}.paid{color:#16a34a}.unpaid{color:#dc2626}.box{border:1px solid #e3d9f7;border-radius:10px;padding:10px 14px}.foot{margin-top:26px;display:flex;justify-content:space-between;align-items:flex-end;gap:18px}img.qr{width:92px;height:92px}img.logo{max-height:54px;max-width:160px}img.sig{max-height:54px}`;
  const head = narrow
    ? `${profile.logo ? `<div class="c"><img src="${profile.logo}" style="max-height:40px"></div>` : ''}<h1>${esc(profile.name)}</h1><div class="c">${esc(profile.tagline)}</div><div class="c">${esc([profile.phone, profile.email].filter(Boolean).join(' · '))}</div><div class="hr"></div><div class="c b">INVOICE ${esc(inv.invoiceNo)}</div><div class="c">${esc(inv.date)}</div><div class="hr"></div>`
    : `<div class="top"><div>${profile.logo ? `<img class="logo" src="${profile.logo}"><br>` : ''}<b style="font-size:18px">${esc(profile.name)}</b><div class="muted">${esc(profile.tagline)}</div><div class="muted">${esc([profile.address, profile.phone, profile.whatsapp && `WhatsApp ${profile.whatsapp}`, profile.email, profile.website].filter(Boolean).join(' · '))}</div></div><div style="text-align:right"><h1>INVOICE</h1><div><b>${esc(inv.invoiceNo)}</b></div><div class="muted">${esc(inv.date)}</div></div></div>`;
  const cust = inv.customer || {};
  const billTo = narrow
    ? `<div class="b">${esc(cust.restaurant)}</div>${cust.owner ? `<div>${esc(cust.owner)}</div>` : ''}${cust.phone ? `<div>${esc(cust.phone)}</div>` : ''}<div class="hr"></div>`
    : `<div class="box" style="margin-top:16px"><div class="muted">Billed to</div><b style="font-size:15px">${esc(cust.restaurant)}</b><div>${esc([cust.owner, cust.phone, cust.address].filter(Boolean).join(' · '))}</div>${cust.licenseKey ? `<div class="muted">License ${esc(maskKey(cust.licenseKey))}</div>` : ''}</div>`;
  const body = narrow
    ? lines.map(([k, v]) => `<div class="row"><span>${esc(k)}</span><span>${num(v, cur)}</span></div>`).join('') +
      `<div class="hr"></div><div class="row b tot"><span>TOTAL</span><span>${num(total, cur)}</span></div><div class="row"><span>Paid</span><span>${num(paid, cur)}</span></div><div class="row b"><span>Balance</span><span>${num(due, cur)}</span></div><div class="c"><span class="stamp">${status}</span></div>${inv.paymentMethod ? `<div class="c">via ${esc(inv.paymentMethod)}${inv.paymentDate ? ` · ${esc(inv.paymentDate)}` : ''}</div>` : ''}<div class="hr"></div>${qr ? `<div class="c"><img class="qr" src="${qr}"><div style="font-size:10px">Scan to verify this invoice</div></div>` : ''}<div class="c" style="margin-top:4px">${esc(profile.footer)}</div>`
    : `<table><thead><tr><th>Description</th><th class="r">Amount</th></tr></thead><tbody>${lines.map(([k, v]) => `<tr><td>${esc(k)}</td><td class="r">${num(v, cur)}</td></tr>`).join('')}</tbody><tfoot><tr class="tot"><td class="r">Total</td><td class="r">${num(total, cur)}</td></tr><tr><td class="r">Paid</td><td class="r">${num(paid, cur)}</td></tr><tr><td class="r"><b>Balance due</b></td><td class="r"><b>${num(due, cur)}</b></td></tr></tfoot></table>
      <div style="margin-top:14px"><span class="stamp ${status === 'PAID' ? 'paid' : 'unpaid'}">${status}</span> ${inv.paymentMethod ? `<span class="muted"> via ${esc(inv.paymentMethod)}${inv.paymentDate ? ` on ${esc(inv.paymentDate)}` : ''}</span>` : ''}</div>
      ${inv.notes ? `<div class="box" style="margin-top:14px">${esc(inv.notes)}</div>` : ''}
      <div class="foot"><div>${qr ? `<img class="qr" src="${qr}"><div class="muted" style="font-size:11px">Scan to verify this invoice</div>` : ''}</div><div style="text-align:right">${profile.signature ? `<img class="sig" src="${profile.signature}"><br>` : ''}<b>${esc(profile.signatory || profile.name)}</b><div class="muted">Authorised signatory</div></div></div>
      <div class="muted" style="text-align:center;margin-top:16px">${esc(profile.footer)}</div>`;
  return `<!doctype html><html><head><meta charset="utf-8"><title>${esc(inv.invoiceNo)}</title><style>*{box-sizing:border-box}${css}</style></head><body>${head}${billTo}${body}</body></html>`;
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
