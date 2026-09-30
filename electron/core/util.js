'use strict';

function round2(n) {
  const v = Number(n) || 0;
  return Math.round((v + Number.EPSILON) * 100) / 100;
}

function toNumber(v, fallback = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function pad(n, len) {
  return String(n).padStart(len, '0');
}

/** Local timestamp "YYYY-MM-DD HH:MM:SS" (Pakistan shops run on local time). */
function nowLocal(d = new Date()) {
  return `${localDate(d)} ${pad(d.getHours(), 2)}:${pad(d.getMinutes(), 2)}:${pad(d.getSeconds(), 2)}`;
}

function localDate(d = new Date()) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1, 2)}-${pad(d.getDate(), 2)}`;
}

function addDays(dateStr, days) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(y, m - 1, d + days);
  return localDate(dt);
}

function cleanStr(v, max = 500) {
  if (v === null || v === undefined) return '';
  return String(v).trim().slice(0, max);
}

function isDateStr(s) {
  return typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s);
}

module.exports = { round2, toNumber, pad, nowLocal, localDate, addDays, cleanStr, isDateStr };

const ONES = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
const TENS = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

function below1000(n) {
  const parts = [];
  if (n >= 100) {
    parts.push(`${ONES[Math.floor(n / 100)]} Hundred`);
    n %= 100;
  }
  if (n >= 20) {
    parts.push(TENS[Math.floor(n / 10)] + (n % 10 ? ` ${ONES[n % 10]}` : ''));
  } else if (n > 0) parts.push(ONES[n]);
  return parts.join(' ');
}

/** 1050 -> "Rupees One Thousand Fifty Only" (Pakistani receipts print this line). */
function amountInWords(amount) {
  const rupees = Math.floor(Math.abs(Number(amount) || 0));
  const paisa = Math.round((Math.abs(Number(amount) || 0) - rupees) * 100);
  if (rupees === 0 && paisa === 0) return 'Rupees Zero Only';
  const units = [[1e7, 'Crore'], [1e5, 'Lakh'], [1e3, 'Thousand']];
  let n = rupees;
  const out = [];
  for (const [v, label] of units) {
    if (n >= v) {
      out.push(`${below1000(Math.floor(n / v))} ${label}`);
      n %= v;
    }
  }
  if (n > 0) out.push(below1000(n));
  let s = `Rupees ${out.join(' ')}`.trim();
  if (rupees === 0) s = 'Rupees Zero';
  if (paisa) s += ` and ${below1000(paisa)} Paisa`;
  return `${s} Only`;
}

module.exports.amountInWords = amountInWords;
