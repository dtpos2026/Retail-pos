# Licensing

## How it works
- The Super Admin panel owns an **ECDSA P-256 key pair**. The private key signs licenses. The POS contains only the **public key** (`electron/license/config.js`), so it can verify licenses but never create them.
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

- **Computer ID** = SHA-256 of the Windows `MachineGuid`, shown as `XXXX-XXXX-XXXX-XXXX`. It stays the same after reinstalling the app; it changes if Windows is reinstalled. Use **Transfer** in the panel for a new PC.
- License state is stored in `%APPDATA%\Retail POS\license.json`, separate from the business database, so restoring a backup never removes the license.

## POS states
| State | Meaning | POS usable |
|---|---|---|
| `trial` | first 7 days after installation | yes |
| `active` | valid key for this computer | yes (warning 7 days before expiry) |
| `trial_expired` / `expired` | activation or renewal needed | no — activation screen |
| `revoked` | revoked or suspended in the panel (seen during an online check) | no |
| `invalid` | key belongs to another computer | no |
| `clock` | Windows date was moved back more than 2 days | no, until the date is fixed |
| `unconfigured` | no public key in `config.js` (developer build) | yes, with a banner |

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
