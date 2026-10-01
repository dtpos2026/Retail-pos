import {
  collection, doc, getDoc, getDocs, setDoc, updateDoc, deleteDoc, addDoc, query, where, orderBy, limit, serverTimestamp, writeBatch, onSnapshot, Timestamp, getCountFromServer,
} from 'firebase/firestore';
import { db, auth, HEAD_ADMIN_EMAIL } from '../firebase';
import { signLicense, ymd } from './license';

const me = () => auth.currentUser?.email || '';

export function isHeadEmail(email) {
  return String(email || '').toLowerCase() === HEAD_ADMIN_EMAIL;
}

/** Returns 'head' | 'admin' | null for the signed-in user. */
export async function resolveRole(user) {
  if (!user?.email) return null;
  if (isHeadEmail(user.email)) return 'head';
  try {
    const snap = await getDoc(doc(db, 'admins', user.email.toLowerCase()));
    return snap.exists() && snap.data().active ? 'admin' : null;
  } catch {
    return null;
  }
}

export async function logActivity(action, detail, extra = {}) {
  try {
    await addDoc(collection(db, 'activity'), { action, detail, by: me(), at: serverTimestamp(), ...extra });
  } catch {
    /* activity is best effort */
  }
}

/** Audit-log housekeeping (head admin): delete entries older than N days (0 = everything). Returns how many were removed. */
export async function pruneActivity(days) {
  const cutoff = days > 0 ? Timestamp.fromMillis(Date.now() - days * 86400000) : null;
  let removed = 0;
  for (;;) {
    const q = cutoff ? query(collection(db, 'activity'), where('at', '<', cutoff), limit(400)) : query(collection(db, 'activity'), limit(400));
    const snap = await getDocs(q);
    if (snap.empty) break;
    const batch = writeBatch(db);
    snap.docs.forEach((d) => batch.delete(d.ref));
    await batch.commit();
    removed += snap.size;
    if (snap.size < 400) break;
  }
  return removed;
}

export async function countActivity() {
  return (await getCountFromServer(collection(db, 'activity'))).data().count;
}

// ------------------------------------------------------------------ live lists
export function watch(name, cb, onError, ...constraints) {
  return onSnapshot(
    query(collection(db, name), ...constraints),
    (snap) => cb(snap.docs.map((d) => ({ id: d.id, ...d.data() }))),
    onError
  );
}

// ------------------------------------------------------------------ clients
export async function saveClient(data) {
  const clean = {
    businessName: String(data.businessName || '').trim(),
    ownerName: String(data.ownerName || '').trim(),
    phone: String(data.phone || '').trim(),
    email: String(data.email || '').trim().toLowerCase(),
    city: String(data.city || '').trim(),
    address: String(data.address || '').trim(),
    businessType: data.businessType || 'restaurant',
    notes: String(data.notes || '').trim(),
    status: data.status || 'active',
    updatedAt: serverTimestamp(),
  };
  if (!clean.businessName) throw new Error('Business name is required.');
  if (!clean.phone) throw new Error('Phone number is required.');
  if (data.id) {
    await updateDoc(doc(db, 'clients', data.id), clean);
    await logActivity('client.update', `Updated client ${clean.businessName}`, { clientId: data.id });
    return data.id;
  }
  const ref = await addDoc(collection(db, 'clients'), { ...clean, createdAt: serverTimestamp(), createdBy: me() });
  await logActivity('client.create', `Added client ${clean.businessName}`, { clientId: ref.id });
  return ref.id;
}

export async function deleteClient(client) {
  const lic = await getDocs(query(collection(db, 'licenses'), where('clientId', '==', client.id)));
  if (!lic.empty) throw new Error('This client has licenses. Revoke them and mark the client inactive instead.');
  await deleteDoc(doc(db, 'clients', client.id));
  await logActivity('client.delete', `Deleted client ${client.businessName}`);
}

export async function clientLicenses(clientId) {
  const snap = await getDocs(query(collection(db, 'licenses'), where('clientId', '==', clientId)));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() })).sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
}

// ------------------------------------------------------------------ signing key
export async function getSigningConfig() {
  const snap = await getDoc(doc(db, 'config', 'signing'));
  return snap.exists() ? snap.data() : null;
}

/** Publish the public key so installed POS builds can fetch it (no copy/paste into the app). Head admin only. */
export async function publishPublicKey(publicPem) {
  const pem = publicPem || (await getSigningConfig())?.publicPem;
  if (!pem) return false;
  try {
    const cur = await getDoc(doc(db, 'publicConfig', 'signing'));
    if (cur.exists() && cur.data().publicPem === pem) return true;
    await setDoc(doc(db, 'publicConfig', 'signing'), { publicPem: pem, updatedAt: serverTimestamp() });
    return true;
  } catch {
    return false; // not the head admin, or rules not deployed yet
  }
}

export async function saveSigningConfig({ privateJwk, publicPem }) {
  await setDoc(doc(db, 'config', 'signing'), { privateJwk, publicPem, createdAt: serverTimestamp(), createdBy: me() });
  await publishPublicKey(publicPem);
  await logActivity('config.signing', 'Created license signing key');
}

// ------------------------------------------------------------------ short license codes
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
/** DTPOS-XXXX-XXXX-XXXX-XXXX — 80 random bits; the POS looks the real signed key up by this code. */
export function makeCode() {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  const c = [...bytes].map((b) => CODE_ALPHABET[b % 32]).join('');
  return `DTPOS-${c.slice(0, 4)}-${c.slice(4, 8)}-${c.slice(8, 12)}-${c.slice(12, 16)}`;
}

/** Make sure a license has a short code (older licenses get one on demand). */
export async function ensureCode(lic) {
  if (lic.code) return lic.code;
  const code = makeCode();
  const batch = writeBatch(db);
  batch.set(doc(db, 'licenseCodes', code), { licenseId: lic.id, key: lic.key, updatedAt: serverTimestamp() });
  batch.update(doc(db, 'licenses', lic.id), { code });
  batch.set(doc(db, 'licenseStatus', lic.id), { code }, { merge: true });
  await batch.commit();
  lic.code = code;
  return code;
}

// ------------------------------------------------------------------ licenses
/**
 * Create (or re-issue) a signed license and publish its public status.
 * input: { id?, client, machineId, plan, startDate, expiresAt, maxUsers, price, paid, notes }
 */
export async function issueLicense(input) {
  const cfg = await getSigningConfig();
  if (!cfg?.privateJwk) throw new Error('No signing key yet. Create it in Settings first.');
  const ref = input.id ? doc(db, 'licenses', input.id) : doc(collection(db, 'licenses'));
  const payload = {
    lid: ref.id,
    cid: input.client.id,
    bn: input.client.businessName,
    mid: input.machineId || '*',
    plan: input.plan,
    iat: ymd(new Date()),
    exp: input.expiresAt || null,
    mu: Number(input.maxUsers) || 0,
    md: Math.max(1, Number(input.maxDevices) || 1),
  };
  const key = await signLicense(cfg.privateJwk, payload);
  const prev = input.id ? await getDoc(ref) : null;
  const code = (prev && prev.exists() && prev.data().code) || makeCode();
  const record = {
    code,
    clientId: input.client.id,
    businessName: input.client.businessName,
    clientPhone: input.client.phone || '',
    machineId: payload.mid,
    plan: payload.plan,
    startDate: input.startDate || payload.iat,
    expiresAt: payload.exp,
    maxUsers: payload.mu,
    price: Number(input.price) || 0,
    paid: !!input.paid,
    notes: String(input.notes || ''),
    status: 'active',
    key,
    issuedAt: payload.iat,
    updatedAt: serverTimestamp(),
  };
  const maxDevices = Math.max(1, Number(input.maxDevices) || 1);
  record.maxDevices = maxDevices;
  const batch = writeBatch(db);
  if (input.id) batch.update(ref, record);
  else batch.set(ref, { ...record, createdAt: serverTimestamp(), createdBy: me() });
  // Public status doc: merge so the live device counter survives renewals.
  batch.set(doc(db, 'licenseCodes', code), { licenseId: ref.id, key, updatedAt: serverTimestamp() });
  const status = { status: 'active', key, code, expiresAt: payload.exp, maxDevices, updatedAt: serverTimestamp() };
  batch.set(doc(db, 'licenseStatus', ref.id), input.id ? status : { ...status, deviceCount: 0 }, { merge: true });
  await batch.commit();
  await logActivity(input.id ? 'license.renew' : 'license.create', `${input.id ? 'Re-issued' : 'Issued'} ${payload.plan} license for ${payload.bn}${payload.exp ? ` until ${payload.exp}` : ' (lifetime)'}`, { licenseId: ref.id, clientId: payload.cid });
  return { id: ref.id, ...record };
}

/** status: active | suspended | revoked | pending (payment pending). `message` is shown to the shop. */
export async function setLicenseStatus(lic, status, message = '') {
  const batch = writeBatch(db);
  batch.update(doc(db, 'licenses', lic.id), { status, statusMessage: String(message || ''), updatedAt: serverTimestamp() });
  batch.set(doc(db, 'licenseStatus', lic.id), { status, message: String(message || ''), key: lic.key, expiresAt: lic.expiresAt || null, updatedAt: serverTimestamp() }, { merge: true });
  await batch.commit();
  await logActivity(`license.${status}`, `License for ${lic.businessName} set to ${status}`, { licenseId: lic.id, clientId: lic.clientId });
}

export async function deleteLicense(lic) {
  const batch = writeBatch(db);
  batch.delete(doc(db, 'licenses', lic.id));
  batch.set(doc(db, 'licenseStatus', lic.id), { status: 'revoked', key: '', expiresAt: null, updatedAt: serverTimestamp() });
  await batch.commit();
  await logActivity('license.delete', `Deleted license for ${lic.businessName}`, { licenseId: lic.id });
}

// ------------------------------------------------------------------ devices
export async function setDeviceStatus(device, status) {
  await updateDoc(doc(db, 'devices', device.id), { status });
  await logActivity(`device.${status}`, `Device ${device.name || device.machineId} of ${device.businessName} set to ${status}`, { licenseId: device.licenseId });
}

/** Remove a device and free its slot (the POS must register again). */
export async function removeDevice(device) {
  const batch = writeBatch(db);
  batch.delete(doc(db, 'devices', device.id));
  const lsRef = doc(db, 'licenseStatus', device.licenseId);
  const ls = await getDoc(lsRef);
  if (ls.exists()) batch.update(lsRef, { deviceCount: Math.max(0, (ls.data().deviceCount || 1) - 1), updatedAt: serverTimestamp() });
  await batch.commit();
  await logActivity('device.remove', `Removed device ${device.name || device.machineId} of ${device.businessName}`, { licenseId: device.licenseId });
}

/** Put a computer on the map (admin-set position; the POS never reports a location by itself). */
export async function setDeviceLocation(device, lat, lng, label = '') {
  const la = Number(lat);
  const ln = Number(lng);
  if (!Number.isFinite(la) || !Number.isFinite(ln) || Math.abs(la) > 90 || Math.abs(ln) > 180) throw new Error('Latitude / longitude are not valid.');
  await updateDoc(doc(db, 'devices', device.id), { lat: la, lng: ln, locationLabel: String(label || ''), locationBy: me() });
  await logActivity('device.location', `Set location of ${device.name || device.machineId} (${device.businessName})`, { licenseId: device.licenseId });
}

export async function clearDeviceLocation(device) {
  await updateDoc(doc(db, 'devices', device.id), { lat: null, lng: null, locationLabel: '' });
}

// ------------------------------------------------------------------ backup / export / import
export async function loadRegistry() {
  const [c, l] = await Promise.all([getDocs(collection(db, 'clients')), getDocs(collection(db, 'licenses'))]);
  return { clients: c.docs.map((d) => ({ id: d.id, ...d.data() })), licenses: l.docs.map((d) => ({ id: d.id, ...d.data() })) };
}

const plainTs = (v) => (v && typeof v.toDate === 'function' ? v.toDate().toISOString() : v);
const cleanDoc = (o) => Object.fromEntries(Object.entries(o).filter(([k]) => k !== 'id').map(([k, v]) => [k, plainTs(v)]));

export async function exportBackup() {
  const { clients, licenses } = await loadRegistry();
  return { app: 'retail-pos-superadmin', v: 1, exportedAt: new Date().toISOString(), clients: clients.map((c) => ({ id: c.id, ...cleanDoc(c) })), licenses: licenses.map((l) => ({ id: l.id, ...cleanDoc(l) })) };
}

/** Merge a backup: existing records are kept unless the backup copy is newer (updatedAt). */
export async function importBackup(json) {
  if (!json || json.app !== 'retail-pos-superadmin' || !Array.isArray(json.clients) || !Array.isArray(json.licenses)) throw new Error('This is not a Retail POS Super Admin backup file.');
  const cur = await loadRegistry();
  const have = (list, id) => list.find((x) => x.id === id);
  let clients = 0;
  let licenses = 0;
  const toDate = (v) => (typeof v === 'string' && v ? new Date(v) : null);
  for (const c of json.clients) {
    const old = have(cur.clients, c.id);
    if (old) continue;
    const { id, createdAt, updatedAt, ...rest } = c;
    await setDoc(doc(db, 'clients', id), { ...rest, createdAt: toDate(createdAt) || serverTimestamp(), updatedAt: serverTimestamp() });
    clients++;
  }
  for (const l of json.licenses) {
    if (have(cur.licenses, l.id)) continue;
    const { id, createdAt, updatedAt, ...rest } = l;
    const batch = writeBatch(db);
    batch.set(doc(db, 'licenses', id), { ...rest, createdAt: toDate(createdAt) || serverTimestamp(), updatedAt: serverTimestamp() });
    batch.set(doc(db, 'licenseStatus', id), { status: rest.status || 'active', message: rest.statusMessage || '', key: rest.key || '', expiresAt: rest.expiresAt || null, maxDevices: rest.maxDevices || 1, deviceCount: 0, updatedAt: serverTimestamp() }, { merge: true });
    await batch.commit();
    licenses++;
  }
  await logActivity('backup.import', `Imported backup: ${clients} clients, ${licenses} licenses`);
  return { clients, licenses };
}

export function licensesCsv(licenses) {
  const q = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const head = ['Business', 'Phone', 'Plan', 'Status', 'Issued', 'Expires', 'Max devices', 'Max users', 'Price', 'Paid', 'Key'];
  const rows = licenses.map((l) => [l.businessName, l.clientPhone, l.plan, l.status, l.issuedAt, l.expiresAt || 'Lifetime', l.maxDevices || 1, l.maxUsers || 0, l.price || 0, l.paid ? 'yes' : 'no', l.key]);
  return '\uFEFF' + [head, ...rows].map((r) => r.map(q).join(',')).join('\r\n');
}

/** A computer asked to join a license that is full. Approve = the computer is registered and the limit grows if needed. */
export async function approveRequest(req) {
  const lsRef = doc(db, 'licenseStatus', req.licenseId);
  const ls = await getDoc(lsRef);
  if (!ls.exists()) throw new Error('This license no longer exists.');
  const count = (ls.data().deviceCount || 0) + 1;
  const max = Math.max(ls.data().maxDevices || 1, count);
  const batch = writeBatch(db);
  batch.set(doc(db, 'devices', `${req.licenseId}_${req.machineId}`), {
    licenseId: req.licenseId, machineId: req.machineId, name: req.name || '', os: req.os || '', appVersion: req.appVersion || '', status: 'active',
    businessName: req.businessName || '', ownerName: req.ownerName || '', ownerPhone: req.ownerPhone || '', firstSeen: serverTimestamp(), lastSeen: serverTimestamp(),
  });
  batch.update(lsRef, { deviceCount: count, maxDevices: max, updatedAt: serverTimestamp() });
  batch.update(doc(db, 'licenses', req.licenseId), { maxDevices: max, updatedAt: serverTimestamp() });
  batch.update(doc(db, 'deviceRequests', req.id), { status: 'approved', decidedBy: me(), decidedAt: serverTimestamp() });
  await batch.commit();
  await logActivity('device.approve', `Approved ${req.name || req.machineId} for ${req.businessName} (limit now ${max})`, { licenseId: req.licenseId });
}

export async function rejectRequest(req) {
  await updateDoc(doc(db, 'deviceRequests', req.id), { status: 'rejected', decidedBy: me(), decidedAt: serverTimestamp() });
  await logActivity('device.reject', `Rejected ${req.name || req.machineId} for ${req.businessName}`, { licenseId: req.licenseId });
}

/** Change how many computers may use a license. */
export async function setMaxDevices(lic, n) {
  const max = Math.max(1, Number(n) || 1);
  const batch = writeBatch(db);
  batch.update(doc(db, 'licenses', lic.id), { maxDevices: max, updatedAt: serverTimestamp() });
  batch.set(doc(db, 'licenseStatus', lic.id), { maxDevices: max, updatedAt: serverTimestamp() }, { merge: true });
  await batch.commit();
  await logActivity('license.devices', `Device limit of ${lic.businessName} set to ${max}`, { licenseId: lic.id });
}

// ------------------------------------------------------------------ admins
export async function saveAdmin({ email, name, active }) {
  const e = String(email || '').trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e)) throw new Error('Enter a valid email.');
  if (isHeadEmail(e)) throw new Error('The head admin does not need to be added.');
  await setDoc(doc(db, 'admins', e), { email: e, name: String(name || '').trim(), active: active !== false, addedAt: serverTimestamp(), addedBy: me() }, { merge: true });
  await logActivity('admin.save', `Admin ${e} ${active === false ? 'disabled' : 'saved'}`);
}

export async function removeAdmin(email) {
  await deleteDoc(doc(db, 'admins', email));
  await logActivity('admin.remove', `Removed admin ${email}`);
}

export { orderBy, limit, where };
