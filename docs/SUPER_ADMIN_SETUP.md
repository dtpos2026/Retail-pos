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

## 7. What is in the panel (v1.2)

| Page | What you do there |
| --- | --- |
| Dashboard | Numbers from your real data, revenue, **renewals in the next 90 days** (5 windows), devices online |
| Clients | Client registry, **Export CSV**, **Backup** (JSON) and **Import** (existing records are kept) |
| Licenses | Issue / renew / transfer keys. Row actions: Suspend, **Payment pending**, Revoke, Reactivate — each can carry a **message the shop sees** |
| Devices | Every computer: block / suspend / remove, live online status, device limit per license |
| Device map | Leaflet map. Select a device → click its place on the map (positions are set by you, nothing is tracked) |
| Billing | Invoices (A4 and 80 mm, print / save as PDF), numbering `DT-2026-0001`, totals, invoice settings (logo, signature, prefix, currency). Each invoice has a **QR**: scanning it opens `…/?verify=CODE`, a public page that shows only masked data |
| Support | Two-way messages with each client. Clients write from **POS → Settings → Support** (also from the locked screen when blocked / payment pending) |
| Verify key | Paste a key: checks the signature and shows plan, expiry, devices and whether it is in your registry |
| Activity log / Admins / Settings | As before (signing key is published automatically for the POS) |

Sign-in screen: **Test cloud connection** checks Firestore, the deployed rules and Email/Password sign-in without touching any data.

### Deploy checklist
1. `cd superadmin && npm install && npm run build`
2. `npx firebase-tools login` then `npx firebase-tools deploy` (hosting **and** `firestore.rules` — the new Support / Billing rules are required).
3. Open the panel as the head admin once (publishes the license public key).
4. In *Billing → Invoice settings* enter your phone, WhatsApp, address, logo and — if the panel is on a custom domain — the **Verification page URL**.
5. Press **Test cloud connection** on the sign-in page: all lines must be green.

### Honest limits
* Support threads are readable by anyone who knows the license id (a long random id). Do not put secrets in messages.
* A computer that is offline cannot be controlled; block / suspend / pending apply the next time it goes online (about 5 minutes; 45 seconds while locked).
* Map tiles come from OpenStreetMap and need internet in the browser.

## 8. v1.6 additions
* **Device details:** every registered computer reports (about every 5 minutes while online) its computer name, Windows user, manufacturer/model, OS, CPU, RAM, local IP, MAC, public IP, ISP and the approximate city of its internet connection. Open **Devices → ⓘ** for the full sheet.
* **Device map:** pins come from the IP location in real time (dashed ring = approximate); you can pin the exact place (Place → click the map) which overrides it.
* **Live control:** the POS checks the license + device status **every minute** (every 30 s while locked). Suspend / block / payment pending / reactivate reach an online POS within about a minute.
* **Issue License:** choose “+ New restaurant” to enter restaurant name, owner and phone and generate the key in one step.
* **Support:** new client messages appear on the Dashboard (Support inbox) and the sidebar badge; the POS shows “✉ new message” when you answer. Delete a single message or the whole chat.
* **Audit log housekeeping (head admin):** Export CSV, Delete > 30 days, Delete > 90 days, Clear all. Entries older than a year are removed automatically so the database never fills up.
* Re-deploy rules after updating: `npx firebase-tools deploy` (device-detail fields and audit deletion need the new rules).

## 9. v1.7 — short keys, first-time details, device approval
* **Short license key:** `DTPOS-XXXX-XXXX-XXXX-XXXX`. The POS looks the signed key up with it once (internet needed once). Older licenses get a short code the first time you open or copy their key. The long `RPOS1…` key stays available (collapsed) for a computer with no internet.
* **First launch asks:** business name, owner name, mobile, license key. They are saved with the computer and shown in the Super Admin (Devices → ⓘ). After that the POS never asks again; it verifies with you in the background every minute.
* **Device approval:** when a license is already used on its maximum computers, the new computer sends an **approval request**. You get an alert (Dashboard, Devices page, sidebar badge). **Approve** registers it and raises the limit; **Reject** blocks it. The POS shows "waiting for approval" and opens by itself once approved.
* **Exact location:** at every login the POS reports the Windows location (Wi-Fi/GPS) when location is allowed on the computer, otherwise the approximate IP location. The map shows exact > IP, with online / last seen.
* Deploy again: `npx firebase-tools deploy` (new rules for `licenseCodes`, `deviceRequests`).
