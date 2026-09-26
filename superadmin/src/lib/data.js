import {
  collection, doc, getDoc, getDocs, setDoc, updateDoc, deleteDoc, addDoc, query, where, orderBy, limit, serverTimestamp, writeBatch, onSnapshot,
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

export async function saveSigningConfig({ privateJwk, publicPem }) {
  await setDoc(doc(db, 'config', 'signing'), { privateJwk, publicPem, createdAt: serverTimestamp(), createdBy: me() });
  await logActivity('config.signing', 'Created license signing key');
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
  };
  const key = await signLicense(cfg.privateJwk, payload);
  const record = {
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
  const batch = writeBatch(db);
  if (input.id) batch.update(ref, record);
  else batch.set(ref, { ...record, createdAt: serverTimestamp(), createdBy: me() });
  batch.set(doc(db, 'licenseStatus', ref.id), { status: 'active', key, expiresAt: payload.exp, updatedAt: serverTimestamp() });
  await batch.commit();
  await logActivity(input.id ? 'license.renew' : 'license.create', `${input.id ? 'Re-issued' : 'Issued'} ${payload.plan} license for ${payload.bn}${payload.exp ? ` until ${payload.exp}` : ' (lifetime)'}`, { licenseId: ref.id, clientId: payload.cid });
  return { id: ref.id, ...record };
}

export async function setLicenseStatus(lic, status) {
  const batch = writeBatch(db);
  batch.update(doc(db, 'licenses', lic.id), { status, updatedAt: serverTimestamp() });
  batch.set(doc(db, 'licenseStatus', lic.id), { status, key: lic.key, expiresAt: lic.expiresAt || null, updatedAt: serverTimestamp() });
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
