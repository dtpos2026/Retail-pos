'use strict';

/**
 * Licensing configuration.
 *
 * PUBLIC_KEY_PEM is optional. Leave it empty: installed builds download the public key once from your
 * Super Admin (it is published automatically when you open the panel) and then require a license key
 * from the first launch. Only unpackaged development runs work without a license.
 *
 * The private key never leaves the Super Admin panel / Firestore.
 */
const PUBLIC_KEY_PEM = ``;

/** Days a new installation can be used before activation is required. */
const TRIAL_DAYS = 0; // 0 = a license key is required from the very first launch

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
