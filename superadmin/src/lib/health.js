import { firebaseConfig } from '../firebase';

/** "Test cloud connection": checks Firestore + Email/Password sign-in without touching any data. */
export async function testCloud() {
  const out = [];
  const pid = firebaseConfig.projectId;
  const key = firebaseConfig.apiKey;
  try {
    const r = await fetch(`https://firestore.googleapis.com/v1/projects/${pid}/databases/(default)/documents/publicConfig/signing?key=${key}`);
    if (r.status === 200) out.push({ ok: true, text: 'Firestore is reachable and the public key is published.' });
    else if (r.status === 404) out.push({ ok: true, text: 'Firestore is reachable and the rules are deployed (public key not published yet — open the Dashboard once as head admin).' });
    else if (r.status === 403) out.push({ ok: false, text: 'Firestore answered "permission denied": deploy firestore.rules (npx firebase-tools deploy --only firestore:rules).' });
    else out.push({ ok: false, text: `Firestore answered ${r.status}. Is the Firestore database created?` });
  } catch {
    out.push({ ok: false, text: 'Cannot reach Firebase — check your internet connection.' });
  }
  try {
    const r = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${key}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: 'probe@invalid.example', password: 'probe-probe', returnSecureToken: false }) });
    const msg = (await r.json())?.error?.message || '';
    if (/OPERATION_NOT_ALLOWED|PASSWORD_LOGIN_DISABLED/.test(msg)) out.push({ ok: false, text: 'Email/Password sign-in is NOT enabled: Firebase console → Authentication → Sign-in method → Email/Password → Enable.' });
    else out.push({ ok: true, text: 'Email/Password sign-in is enabled.' });
  } catch {
    out.push({ ok: false, text: 'Could not check sign-in settings (offline?).' });
  }
  return out;
}
