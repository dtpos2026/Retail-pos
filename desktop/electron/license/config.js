'use strict';

/**
 * Licensing configuration.
 *
 * PUBLIC_KEY_PEM must be the public key shown in the Super Admin panel under
 * Settings → License Signing Key. Paste it here before building installers for
 * customers. While it is empty the app runs as an unlicensed "developer build"
 * (no activation required) so you can develop and test.
 *
 * The private key never leaves the Super Admin panel / Firestore.
 */
const PUBLIC_KEY_PEM = ``;

/** Days a new installation can be used before activation is required. */
const TRIAL_DAYS = 7;

/**
 * Optional online check. When internet is available the POS reads
 * licenseStatus/{licenseId} from Firestore to pick up renewals and revocations.
 * The POS keeps working fully offline if this is unreachable.
 */
const FIREBASE = {
  projectId: 'retail-pos-db7c6',
  apiKey: 'AIzaSyBQUeH40tsiJoZgklJQCYKCNX8IP500qQg',
};

/** Contact shown on the activation screen. */
const VENDOR = {
  name: 'Digital Target',
  email: 'digitaltarget.digital@gmail.com',
  phone: '',
};

module.exports = { PUBLIC_KEY_PEM, TRIAL_DAYS, FIREBASE, VENDOR };
