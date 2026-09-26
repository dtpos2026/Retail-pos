// License signing for Retail POS (runs in the browser, WebCrypto ECDSA P-256 / SHA-256).
// Key format must match electron/license/license.js:
//   RPOS1.<base64url(JSON payload)>.<base64url(IEEE-P1363 signature)>

const subtle = globalThis.crypto.subtle;
const ALG = { name: 'ECDSA', namedCurve: 'P-256' };
const SIGN = { name: 'ECDSA', hash: 'SHA-256' };

export function b64url(bytes) {
  let bin = '';
  const arr = new Uint8Array(bytes);
  for (let i = 0; i < arr.length; i++) bin += String.fromCharCode(arr[i]);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function b64urlToBytes(s) {
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4);
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function toPem(der) {
  const b64 = btoa(String.fromCharCode(...new Uint8Array(der)));
  return `-----BEGIN PUBLIC KEY-----\n${b64.match(/.{1,64}/g).join('\n')}\n-----END PUBLIC KEY-----\n`;
}

function fromPem(pem) {
  const b64 = pem.replace(/-----[^-]+-----/g, '').replace(/\s+/g, '');
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out.buffer;
}

export async function generateKeyPair() {
  const kp = await subtle.generateKey(ALG, true, ['sign', 'verify']);
  const privateJwk = await subtle.exportKey('jwk', kp.privateKey);
  const spki = await subtle.exportKey('spki', kp.publicKey);
  return { privateJwk, publicPem: toPem(spki) };
}

const utf8 = (s) => new TextEncoder().encode(s);

/** Payload fields: lid, cid, bn, mid, plan, iat, exp, mu */
export async function signLicense(privateJwk, payload) {
  const key = await subtle.importKey('jwk', privateJwk, ALG, false, ['sign']);
  const body = b64url(utf8(JSON.stringify({ v: 1, ...payload })));
  const sig = await subtle.sign(SIGN, key, utf8(body));
  return `RPOS1.${body}.${b64url(sig)}`;
}

export async function verifyLicense(publicPem, licenseKey) {
  const parts = String(licenseKey).trim().split('.');
  if (parts.length !== 3 || parts[0] !== 'RPOS1') return null;
  const key = await subtle.importKey('spki', fromPem(publicPem), ALG, false, ['verify']);
  const ok = await subtle.verify(SIGN, key, b64urlToBytes(parts[2]), utf8(parts[1]));
  if (!ok) return null;
  return JSON.parse(new TextDecoder().decode(b64urlToBytes(parts[1])));
}

export const MACHINE_ID_RE = /^[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}$/;

export function normalizeMachineId(s) {
  const hex = String(s || '').toUpperCase().replace(/[^0-9A-F]/g, '');
  return hex.length === 16 ? hex.match(/.{4}/g).join('-') : String(s || '').trim().toUpperCase();
}

export const PLANS = [
  { key: 'trial', label: 'Trial', months: 0, days: 7 },
  { key: 'monthly', label: 'Monthly', months: 1 },
  { key: 'quarterly', label: 'Quarterly (3 months)', months: 3 },
  { key: 'half_yearly', label: 'Half-yearly (6 months)', months: 6 },
  { key: 'yearly', label: 'Yearly', months: 12 },
  { key: 'lifetime', label: 'Lifetime', months: null },
  { key: 'custom', label: 'Custom expiry', months: undefined },
];

export function ymd(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function expiryFor(planKey, startYmd) {
  const plan = PLANS.find((p) => p.key === planKey);
  if (!plan || plan.months === null) return null;
  const [y, m, d] = startYmd.split('-').map(Number);
  if (plan.days) return ymd(new Date(y, m - 1, d + plan.days));
  const months = plan.months === undefined ? 12 : plan.months;
  // Clamp to month end: 31 Jan + 1 month = 28/29 Feb.
  const last = new Date(y, m - 1 + months + 1, 0).getDate();
  return ymd(new Date(y, m - 1 + months, Math.min(d, last)));
}
