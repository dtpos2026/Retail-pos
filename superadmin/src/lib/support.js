import { collection, doc, addDoc, setDoc, updateDoc, deleteDoc, getDocs, onSnapshot, query, orderBy, serverTimestamp, writeBatch } from 'firebase/firestore';
import { db, auth } from '../firebase';

/** Inbox: one thread summary per license. */
export function watchThreads(cb, onError) {
  return onSnapshot(collection(db, 'supportThreads'), (snap) => cb(snap.docs.map((d) => ({ id: d.id, ...d.data() }))), onError);
}

export function watchMessages(licenseId, cb, onError) {
  return onSnapshot(query(collection(db, 'supportThreads', licenseId, 'messages'), orderBy('createdAt', 'asc')), (snap) => cb(snap.docs.map((d) => ({ id: d.id, ...d.data() }))), onError);
}

export async function sendAdminMessage(licenseId, businessName, text) {
  const t = String(text || '').trim();
  if (!t) throw new Error('Write a message first.');
  const batch = writeBatch(db);
  batch.set(doc(collection(db, 'supportThreads', licenseId, 'messages')), { from: 'admin', text: t, createdAt: serverTimestamp(), by: auth.currentUser?.email || '', businessName: businessName || '', read: false });
  batch.set(doc(db, 'supportThreads', licenseId), { businessName: businessName || '', lastText: t.slice(0, 280), lastAt: serverTimestamp(), unreadAdmin: false }, { merge: true });
  await batch.commit();
}

export async function markThreadRead(licenseId) {
  await setDoc(doc(db, 'supportThreads', licenseId), { unreadAdmin: false }, { merge: true });
}

export async function deleteThread(licenseId) {
  const msgs = await getDocs(collection(db, 'supportThreads', licenseId, 'messages'));
  const batch = writeBatch(db);
  msgs.docs.forEach((d) => batch.delete(d.ref));
  batch.delete(doc(db, 'supportThreads', licenseId));
  await batch.commit();
}

export async function deleteMessage(licenseId, id) {
  await deleteDoc(doc(db, 'supportThreads', licenseId, 'messages', id));
}

export { addDoc, updateDoc };
