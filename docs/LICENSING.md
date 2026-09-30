# Licensing

## Quick summary (v1.1)
1. In the Super Admin panel create a client → **Generate license**. Choose **Online device registration** (recommended) and the **max devices** (default 1). No Computer ID is needed.
2. The client pastes the key in Retail POS → **Activate**. The POS registers that computer under the license (**internet needed once**). It is saved — the POS never asks again, and works fully offline afterwards.
3. From the panel you can **Block / Unblock**, **Suspend / Activate** or **Remove** any device, and raise the device limit. The POS applies the change **within minutes of being online** (it checks every 5 minutes; every 45 s while blocked).
4. A second computer trying the same key is refused by the server rules once the limit is reached ("This license is already used on 1 device"). Raise the limit (or remove the old device) to allow it.
5. *Locked to one Computer ID* keys still exist for shops that must activate fully offline.


## How it works
- The Super Admin panel owns an **ECDSA P-256 key pair**. The private key signs licenses. The POS only needs the **public key**, so it can verify licenses but never create them. **You do not paste anything:** the panel publishes the public key automatically (Firestore `publicConfig/signing`, written by the head admin only). Every installed POS downloads it once on its first launch (internet needed once) and from then on asks for a license key. Embedding it in `electron/license/config.js` is optional.
- A license key looks like `RPOS1.<payload>.<signature>` (base64url). Payload:

| Field | Meaning |
|---|---|
| `lid` | license id (Firestore doc id) |
| `cid` | client id |
| `bn` | business name |
| `mid` | Computer ID the key is bound to, or `*` (any computer) |
| `plan` | trial, monthly, quarterly, half_yearly, yearly, lifetime, custom |
| `iat` | issue date |
| `exp` | expiry date `YYYY-MM-DD`, or `null` for lifetime |
| `mu` | max active users (0 = unlimited) |
| `md` | max devices when the key was issued (the live limit is `licenseStatus/{lid}.maxDevices`) |

- **Computer ID** = SHA-256 of the Windows `MachineGuid`, shown as `XXXX-XXXX-XXXX-XXXX`. It stays the same after reinstalling the app; it changes if Windows is reinstalled. Use **Transfer** in the panel for a new PC.
- License state is stored in `%APPDATA%\Retail POS\license.json`, separate from the business database, so restoring a backup never removes the license.

## POS states
| State | Meaning | POS usable |
|---|---|---|
| `needs_key` | installed build has not yet downloaded the public key (first launch, no internet) | no — "Connect & set up" screen |
| `unlicensed` | key downloaded, no license entered yet (trial is off: `TRIAL_DAYS = 0`) | no — activation screen |
| `trial` | only when `TRIAL_DAYS` > 0 in `config.js` | yes |
| `active` | valid key for this computer | yes (warning 7 days before expiry) |
| `trial_expired` / `expired` | activation or renewal needed | no — activation screen |
| `revoked` | revoked or suspended in the panel (seen during an online check) | no |
| `invalid` | key belongs to another computer | no |
| `clock` | Windows date was moved back more than 2 days | no, until the date is fixed |
| `unconfigured` | unpackaged development run without a key (never for installed builds) | yes, with a banner |

When the POS is blocked, all data stays safe. Only the activation screen is shown until a valid key is entered.

## Online check (optional, automatic)
Every 6 hours, and at start-up, the POS tries `GET licenseStatus/{lid}` from Firestore (8 s timeout):
- `status: revoked | suspended` → license blocked.
- `status: active` with a newer signed key for the same `lid` and computer → the new key is installed automatically (**renewal without the customer typing anything**).
- Offline or any error → nothing changes.

## Renewal, transfer and revocation (panel)
- **Renew**: same license id, new expiry. Customers who are online get it automatically; offline customers paste the new key.
- **Transfer**: revokes the old license and issues a new one for the new Computer ID.
- **Suspend / Revoke / Reactivate**: updates `licenseStatus`.

## Security notes
- Never commit the private key. It lives in Firestore `config/signing` (admins only) and in your offline backup file.
- If you replace the signing key, rebuild the POS with the new public key. Old installations will keep accepting only keys signed with the old key.
- The Firebase web `apiKey` in the code is a public identifier, not a secret. Access is enforced by Authentication and `firestore.rules`.

## Device registration (v1.1)
- Firestore: `licenseStatus/{lid}` holds `status`, `key`, `maxDevices`, `deviceCount`; `devices/{lid}_{machineId}` holds one registered computer (`name`, `os`, `appVersion`, `status`, `firstSeen`, `lastSeen`).
- The POS registers itself with one atomic batch (device document + counter). **`firestore.rules` enforce the limit on the server** — a modified POS cannot exceed it (tested with the Firebase emulator, including simultaneous registrations).
- The POS can update only `name / os / appVersion / lastSeen` of its own device document; it can never change its `status`.
- Device states seen by the POS: `active`, `suspended`, `blocked`, `removed` (→ "Register this device"), plus license states `revoked`, `expired`, `invalid`.
- When a device is blocked/suspended while the app is open, the screen locks with a clear message and the cart is kept; it unlocks automatically after the device is re-activated and the POS is online.
- Reinstalling Windows changes the Computer ID → it counts as a new device. Remove the old device in the panel to free the slot.

Machine-locked keys (`mid` = a Computer ID) activate offline; they register quietly the first time the POS is online, so they also appear in the Devices page.
