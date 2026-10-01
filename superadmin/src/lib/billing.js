import { collection, doc, getDoc, getDocs, setDoc, deleteDoc, onSnapshot, query, orderBy, serverTimestamp, writeBatch } from 'firebase/firestore';
import { db, auth } from '../firebase';
import { logActivity } from './data';

export const DEFAULT_PROFILE = {
  name: 'Digital Target',
  tagline: 'Retail POS — Software & Support',
  signatory: '',
  phone: '',
  whatsapp: '',
  email: 'digitaltarget.digital@gmail.com',
  address: '',
  website: '',
  prefix: 'DT',
  currency: 'Rs.',
  verifyBase: '',
  footer: 'Thank you for choosing Digital Target.',
  logo: '',
  signature: '',
  paymentTitle: '',
  paymentBank: '',
  paymentAccount: '',
  paymentQr: '',
  terms: 'Payment due within 7 days of invoice date.\nWork starts after advance payment confirmation.',
  dueDays: 0,
};

const round2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;

/** amount + extras − discount, never below zero. */
export function invoiceTotal(inv) {
  const base = Array.isArray(inv.items) && inv.items.length ? inv.items.reduce((s, i) => s + (Number(i.qty) || 0) * (Number(i.rate) || 0), 0) : Number(inv.amount) || 0;
  const extras = (inv.extras || []).reduce((s, e) => s + (Number(e.amount) || 0), 0);
  return Math.max(0, round2(base + extras - (Number(inv.discount) || 0)));
}

/** PREFIX-YYYY-0001 — one more than the highest number used this year for that prefix. */
export function nextInvoiceNo(invoices, prefix = 'DT', date = new Date()) {
  const year = date.getFullYear();
  const re = new RegExp(`^${prefix.replace(/[^A-Za-z0-9]/g, '')}-${year}-(\\d+)$`);
  let max = 0;
  for (const i of invoices) {
    const m = re.exec(i.invoiceNo || '');
    if (m) max = Math.max(max, Number(m[1]));
  }
  return `${prefix.replace(/[^A-Za-z0-9]/g, '') || 'DT'}-${year}-${String(max + 1).padStart(4, '0')}`;
}

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
/** 16 random characters (80 bits) — a reference, never a database id. */
export function newVerifyCode() {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return [...bytes].map((b) => ALPHABET[b % 32]).join('');
}

export const maskKey = (key) => {
  const k = String(key || '');
  return k.length > 8 ? `${k.slice(0, 6)}••••••${k.slice(-4)}` : '••••';
};

export const verifyUrl = (profile, code) => `${(profile.verifyBase || `${location.origin}${location.pathname}`).replace(/[?#].*$/, '')}?verify=${code}`;

export function watchInvoices(cb, onError) {
  return onSnapshot(query(collection(db, 'invoices'), orderBy('createdAt', 'desc')), (snap) => cb(snap.docs.map((d) => ({ id: d.id, ...d.data() }))), onError);
}

export async function getProfile() {
  const snap = await getDoc(doc(db, 'billingProfile', 'main'));
  return { ...DEFAULT_PROFILE, ...(snap.exists() ? snap.data() : {}) };
}

export async function saveProfile(p) {
  await setDoc(doc(db, 'billingProfile', 'main'), { ...p, updatedAt: serverTimestamp() });
  await logActivity('billing.profile', 'Updated invoice settings');
}

/** Public record that the invoice QR opens. Only non-sensitive, masked fields. */
function verifyRecord(inv, profile, licenseStatus) {
  return {
    invoiceNo: inv.invoiceNo,
    date: inv.date,
    restaurant: inv.customer.restaurant,
    owner: inv.customer.owner || '',
    licenseMasked: maskKey(inv.customer.licenseKey),
    licenseStatus: licenseStatus || 'unknown',
    plan: inv.pkg || '',
    paid: round2(inv.paid || 0),
    paymentDate: inv.paymentDate || '',
    total: invoiceTotal(inv),
    currency: profile.currency,
    issuer: profile.name,
    issuerContact: [profile.phone, profile.email].filter(Boolean).join(' · '),
    updatedAt: serverTimestamp(),
  };
}

export async function saveInvoice(inv, profile, existing, licenseStatus) {
  if (!String(inv.customer?.restaurant || '').trim()) throw new Error('Restaurant / customer name is required.');
  if (!String(inv.invoiceNo || '').trim()) throw new Error('Invoice number is required.');
  if (existing.some((x) => x.id !== inv.id && x.invoiceNo === inv.invoiceNo)) throw new Error(`Invoice number ${inv.invoiceNo} is already used.`);
  const id = inv.id || doc(collection(db, 'invoices')).id;
  const code = inv.verifyCode || newVerifyCode();
  const data = { ...inv, id: undefined, verifyCode: code, total: invoiceTotal(inv), updatedAt: serverTimestamp(), by: auth.currentUser?.email || '' };
  delete data.id;
  if (!inv.id) data.createdAt = serverTimestamp();
  const batch = writeBatch(db);
  batch.set(doc(db, 'invoices', id), data, { merge: true });
  batch.set(doc(db, 'invoiceVerify', code), verifyRecord({ ...inv, verifyCode: code }, profile, licenseStatus));
  await batch.commit();
  await logActivity('invoice.save', `Saved invoice ${inv.invoiceNo} (${inv.customer.restaurant})`);
  return id;
}

export async function deleteInvoice(inv) {
  const batch = writeBatch(db);
  batch.delete(doc(db, 'invoices', inv.id));
  if (inv.verifyCode) batch.delete(doc(db, 'invoiceVerify', inv.verifyCode));
  await batch.commit();
  await logActivity('invoice.delete', `Deleted invoice ${inv.invoiceNo}`);
}

/** Public: used by the verification page without signing in. */
export async function getVerifyRecord(code) {
  if (!/^[A-Z0-9]{8,32}$/.test(code || '')) return null;
  const snap = await getDoc(doc(db, 'invoiceVerify', code));
  return snap.exists() ? snap.data() : null;
}

export { getDocs, deleteDoc };
