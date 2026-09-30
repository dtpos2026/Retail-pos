# Super Admin Panel — Setup Guide

The Super Admin panel is a web app (Firebase Hosting + Authentication + Firestore) for the vendor.
Project: **retail-pos-db7c6**. Head admin: **digitaltarget.digital@gmail.com**.

The POS itself never needs this panel to run. It only needs the license key the panel generates.

## 1. Firebase Console (one-time)

1. Open <https://console.firebase.google.com/> → project **retail-pos-db7c6**.
2. **Build → Firestore Database → Create database** → choose a location (e.g. `asia-south1`) → *Production mode*.
3. **Build → Authentication → Get started → Sign-in method**, then enable:
   - **Email/Password**
   - **Google** (optional, but it is the easiest sign-in: a Google account's email is already verified)
4. **Authentication → Users → Add user** → email `digitaltarget.digital@gmail.com` and a strong password of your choice.
5. **Authentication → Settings → User actions**: untick **Enable create (sign-up)** so nobody else can create accounts from the web. You add accounts yourself in the console.
6. **Authentication → Settings → Authorized domains**: `retail-pos-db7c6.web.app` and `retail-pos-db7c6.firebaseapp.com` are there by default. Add your own domain if you use one.

## 2. Deploy the panel and security rules

```bash
cd superadmin
npm install
npm run build
npx firebase-tools login          # sign in with the Google account that owns the Firebase project
npx firebase-tools deploy         # hosting + firestore.rules + indexes
```
Open **https://retail-pos-db7c6.web.app**.

The database structure is created automatically by the panel on first use. There is nothing to create by hand.

## 3. First sign-in

1. Sign in with `digitaltarget.digital@gmail.com` and your password (or *Continue with Google*).
2. Password accounts must verify the email once: click **Send verification email**, open the link, then **I have verified — continue**.
3. **Settings → Create signing key**. Then:
   - **Download private backup** and keep the JSON file safe and offline (USB).
   - The public key is **published automatically** (or press **Publish public key now**). Nothing needs to be pasted into the POS.
   - Build the POS installer. From now on every build accepts licenses from this panel.
4. (Optional) **Admins → Add admin** to let staff generate licenses. They sign in with their own verified email.

## 4. Firestore collections

| Collection | Contents | Access |
|---|---|---|
| `clients/{id}` | businessName, ownerName, phone, email, city, address, businessType, notes, status, createdAt/By | admins |
| `licenses/{id}` | clientId, businessName, clientPhone, machineId, plan, startDate, expiresAt, maxUsers, price, paid, notes, status (`active`/`suspended`/`revoked`), key, issuedAt, createdAt/By | admins (delete: head) |
| `licenseStatus/{licenseId}` | status, key, expiresAt, maxDevices, deviceCount, updatedAt | **public read by id** (the POS online check); admins write; the POS may only add 1 to `deviceCount` together with its own device document |
| `devices/{licenseId}_{machineId}` | licenseId, machineId, name, os, appVersion, businessName, status (`active`/`suspended`/`blocked`), firstSeen, lastSeen | admins read/write; the POS may create its own (limit enforced) and send heartbeats |
| `config/signing` | privateJwk, publicPem, createdAt/By | admins read; head writes |
| `admins/{email}` | email, name, active, addedAt/By | admins read; head writes |
| `activity/{id}` | action, detail, by, at, clientId?, licenseId? | admins read and create; immutable |

Rules are in `superadmin/firestore.rules`. Everything requires a **verified** email that is the head admin or an active entry in `admins`.

## 5. Local testing with emulators (optional)

```bash
cd superadmin
npx firebase-tools emulators:start --only auth,firestore     # terminal 1
VITE_USE_EMULATORS=1 npm run dev                             # terminal 2
```

## 6. Devices page (v1.1)
**Devices** lists every registered computer live: business, computer name, Computer ID, Windows version, POS version, first/last seen and an *online now* dot (seen in the last 15 minutes).
- **Suspend / Activate** — temporary stop (e.g. unpaid dues).
- **Block / Unblock** — hard stop.
- **Remove** — frees the slot; the POS shows "Register this device".
- Licenses → the **1 / 1** button → change **Max devices** for a license.

**Redeploy the rules after updating** (`npx firebase-tools deploy --only firestore:rules`) — the device limit is enforced by `firestore.rules`.
