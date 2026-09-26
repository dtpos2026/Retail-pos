import { initializeApp } from 'firebase/app';
import { getAuth, connectAuthEmulator } from 'firebase/auth';
import { initializeFirestore, persistentLocalCache, connectFirestoreEmulator } from 'firebase/firestore';

// Firebase web config (public identifiers — access is protected by Auth + firestore.rules).
export const firebaseConfig = {
  apiKey: 'AIzaSyBQUeH40tsiJoZgklJQCYKCNX8IP500qQg',
  authDomain: 'retail-pos-db7c6.firebaseapp.com',
  projectId: 'retail-pos-db7c6',
  storageBucket: 'retail-pos-db7c6.firebasestorage.app',
  messagingSenderId: '264815630986',
  appId: '1:264815630986:web:7769f552245486de516b73',
  measurementId: 'G-F1DD0M8LFN',
};

/** The head of the Super Admin panel. Must match firestore.rules. */
export const HEAD_ADMIN_EMAIL = 'digitaltarget.digital@gmail.com';

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = initializeFirestore(app, { localCache: persistentLocalCache() });

// Local testing: `VITE_USE_EMULATORS=1 npm run dev` with `firebase emulators:start`.
if (import.meta.env.VITE_USE_EMULATORS === '1') {
  connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
  connectFirestoreEmulator(db, '127.0.0.1', 8080);
}
