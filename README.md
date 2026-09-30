# Retail POS

**Simple Offline POS for Small Businesses** — a Windows desktop point-of-sale for kiryana stores, dhabas, biryani and burger points, fast food, cafés, bakeries and small restaurants in Pakistan.
It runs **100% offline** on the shop's computer. A separate **Super Admin web panel** (Firebase) is used by the vendor to manage clients and generate license keys.

```
Retail-pos/                  ← POS software (Windows, offline). Run npm commands here.
├── electron/                main process: database, services, printing, license
├── src/                     React UI
├── shared/  assets/  build/  scripts/  tests/
├── package.json
├── superadmin/              ← Super Admin web panel (Firebase). Its own npm commands.
└── docs/                    setup guides
```


## What's new in v1.1.0

- **Printing rebuilt** — direct *Thermal (ESC/POS)* printing: **no blank paper at the top**, exact length, precise cut and near-instant start. The Windows-driver method stays available. → [docs/PRINTER_SETUP.md](docs/PRINTER_SETUP.md)
- **11 receipt designs** (added Boxed Grid, Bold Restaurant, Tax Invoice + QR, Luxury, Ticket), **5 token designs**, **kitchen slips (KOT)**, optional **QR code**, **amount in words**.
- **80 mm / 58 mm reports** — every report prints compactly on thermal paper or saves as **PNG**; new **Day Summary (Z Report)**.
- **Hold / Running** module in the sidebar (hold, running dine-in tables, retrieve, KOT, print bill, cancel).
- **7 themes** — *Royal Purple* (Digital Target, default), *Crimson Red & White*, *Black & Gold*, Emerald, Sunset, Ocean, Night — plus a promo **banner**, **splash screen**, animated login, floor-plan **tables**, animated order-success screen.
- **Device licensing** — one license = N computers; register once, then it is saved; **block / suspend / remove devices live** from the Super Admin panel; server-enforced limit. → [docs/LICENSING.md](docs/LICENSING.md)
- **Super Admin panel redesign** — dashboard with charts, Devices page, device limit per license.
- **Developed by Digital Target** branding and version number everywhere (login, sidebar, splash, About, receipts, reports).

## Quick commands (Windows CMD)

**POS software** (in the main folder):
```cmd
cd C:\Retail-pos
npm install
npm run build
npm run dist
```
→ Installer: `release\RetailPOS-Setup-1.0.0.exe`

**Super Admin panel**:
```cmd
cd C:\Retail-pos\superadmin
npm install
npm run build
npx firebase-tools login
npx firebase-tools deploy
```
→ Panel: https://retail-pos-db7c6.web.app

---

## 1. Features

### POS desktop app (offline)
| Module | What it does |
|---|---|
| **Login** | Quick 4-digit PIN tiles or username/password. Every sale records the cashier, date and time. |
| **Dashboard** | Today's sales, orders, profit (when cost prices exist), cash / card / bank, credit due, dine-in / takeaway / delivery split, pending orders, tables occupied, low stock, recent transactions, top items, 7-day and hourly charts. |
| **POS / New Sale** | Category tabs, product cards with images, search and barcode scanning (USB scanners work as keyboards), a cart with qty stepper, item discount and notes, bill discount (Rs. or %), open (custom) items, tax, delivery charges, round-off, hold/resume orders, fast payment (Cash / Card / Bank / Other, quick cash buttons, change / due), credit sales, and auto print. |
| **Sale types** | **Dine-In** (table, running bill, print bill, settle), **Takeaway** (optional customer, token), **Delivery** (name, mobile, address, delivery charges). |
| **Tables** | Available / Occupied / Reserved board. Click a free table to start an order, or an occupied table to open its bill. Add, rename or delete tables, or add many at once. |
| **Orders** | Search by order #, customer, mobile, token or table, and filter by date, status, type or payment. Order details, reprint, token print or generate, receive due payment, cancel (pending), refund (completed; stock is returned), open in POS. |
| **Tokens** | Automatic numbers (001, 002, …) with daily reset or continuous numbering. Combined, per-item or no token. Kitchen board: Preparing → Ready → Collected. 58/80 mm token print. |
| **Products** | Name (Urdu supported), SKU, barcode, category, sale / cost price, per-unit discount, unit, opening stock, low stock alert, image (auto-resized), active / inactive. |
| **Categories** | Colour, icon, sort order, show/hide on POS. |
| **Customers** | Name, mobile, address, notes, purchase history, total spent, outstanding due. Created automatically from delivery and credit sales. |
| **Inventory** (optional) | On/off switch. Stock in (with weighted average cost), stock out, count adjustment, full history, stock value, low / out of stock. Sales reduce stock; refunds return it. |
| **Reports** | Sales (daily / weekly / monthly / custom), Orders, Dine-In, Takeaway, Delivery, Product Sales, Category Sales, Payments, Credit / Due, Discounts, Profit, Cashier, Inventory, Stock Movements. Print, **PDF**, **CSV**, **Excel (.xlsx)**. |
| **Users** | Admin, Manager, Cashier, Kitchen and Delivery roles with per-user permission checkboxes. Cashiers cannot open Settings, Users or Reports unless granted. |
| **Receipt printing** | 6 real templates (Classic, Modern, Minimal, Restaurant, Retail Invoice, Compact), 58 mm and 80 mm, logo (size and alignment), margins, fonts, footer, show/hide fields, compact mode, copies, live preview identical to the print, test print, and embedded Urdu font. |
| **Printers** | Any Windows printer (USB, Bluetooth, network) for receipts and a separate token/kitchen printer. Direct thermal ESC/POS printing (no blank paper, exact cut) or Windows driver mode; silent printing; clear error when printing fails. |
| **Backup & Restore** | Backup now, backup to USB / folder, automatic daily backup (keeps the last N), restore with a safety copy, last-backup indicator. |
| **Data safety** | SQLite WAL + `synchronous=FULL`, every sale in one transaction, integrity check at start-up, crash handlers, friendly error messages (technical details only in logs). |
| **License** | 7-day trial, then activation with a signed key. The computer registers once (online) and is remembered; the Super Admin can block / suspend / remove devices live and set the device limit. Renewals and revocations are picked up automatically when online. |

### Super Admin panel (web, Firebase)
- Sign-in with email/password or Google. Head admin: **digitaltarget.digital@gmail.com** (verified email required).
- Clients: business, owner, phone/WhatsApp, email, city, address, type, notes, status.
- License generation: plan (Trial / Monthly / Quarterly / Half-yearly / Yearly / Lifetime / Custom), expiry, max users, **max devices**, online device registration or Computer-ID lock, price, paid, notes, **WhatsApp-ready message**.
- **Devices**: live list of every registered computer (online dot, last seen, Windows/POS version) with Block / Unblock / Suspend / Activate / Remove.
- Renew / extend, transfer to a new PC, suspend, revoke, reactivate, delete.
- Dashboard: clients, active / expiring / expired / revoked licenses, revenue (month and all-time), unpaid.
- Extra admins (managed by the head admin), and an activity log of every change.
- Signing-key management with a public key for the POS, a private-key backup/import, and a self-test.
- Firestore security rules included (tested with the Firebase emulator).

---

## 2. Default login (POS)

| Username | Password | PIN |
|---|---|---|
| `admin` | `admin123` | `1234` |

A red banner reminds the admin to change the default password (**Users → Edit**).
**Settings → General → Load demo data** adds a sample restaurant (Burgers, Biryani, BBQ, Karahi, Fast Food and Drinks, with 20 products including an Urdu name), 8 tables, 3 customers and a cashier (`cashier` / `cashier123`, PIN `1111`).

---

## 3. Running and building the POS (desktop)

Requirements: **Node.js 22+** (Windows 10/11 for building the installer).

```bash
npm install
npm run dev          # development: Vite + Electron with hot reload
npm test             # 31 service tests (sales, tables, tokens, inventory, reports, backup/restore, permissions, templates…)
npm start            # build the UI and run the production app
```

### Windows installer
```bash
npm run dist         # → release/RetailPOS-Setup-1.0.0.exe   (NSIS installer)
npm run dist:portable  # → release/RetailPOS-Portable-1.0.0.exe (no install needed)
```
- Build on Windows, **or** use GitHub → Actions → **Build Windows installer** → *Run workflow* (or push a tag like `v1.0.0`) and download the `RetailPOS-Windows` artifact.
- The app has **no native modules** (it uses the SQLite built into Electron/Node, `node:sqlite`), so builds are simple and reliable.
- The installer lets the user choose the install folder, creates desktop and Start-menu shortcuts, and **keeps business data on uninstall**.

Data location on the shop PC: `%APPDATA%\Retail POS\` (`data\retailpos.db`, `backups\`, `logs\`, `license.json`).

> **Before giving the installer to customers:** paste your license public key into `electron/license/config.js` (see [docs/LICENSING.md](docs/LICENSING.md)). Without it the build runs as an unlicensed "developer build" and shows a banner.

---

## 4. Super Admin panel

Full step-by-step guide: **[docs/SUPER_ADMIN_SETUP.md](docs/SUPER_ADMIN_SETUP.md)**. In short:

```bash
cd superadmin
npm install
npm run dev                      # http://localhost:5174
npm test                         # license signing ⇄ POS verification tests
npx firebase-tools login
npx firebase-tools deploy        # deploys hosting + Firestore rules to retail-pos-db7c6
```
Then in Firebase Console: enable **Authentication → Email/Password and Google**, create the user **digitaltarget.digital@gmail.com**, sign in, verify the email, and go to **Settings → Create signing key**.

---

## 5. Licensing flow

1. The customer installs Retail POS, which runs a **7-day trial**.
2. In the Super Admin panel: **Clients → add client → Generate license** (online device registration, max devices 1), **Copy WhatsApp message** and send it.
3. The customer pastes the key in Retail POS → **Activate** (internet needed **once**). The computer is registered and remembered — it never asks again and works fully **offline**.
4. You control the device live from **Devices** (block / suspend / remove) and the limit per license. Renewals and revocations reach the POS automatically whenever it is online.

Details and security notes: [docs/LICENSING.md](docs/LICENSING.md).

---

## 6. Keyboard shortcuts (POS)

| Key | Action | Key | Action |
|---|---|---|---|
| **F2** | Search / scan barcode | **F8** | Hold / save order |
| **F3** | New order | **F9** / Ctrl+Enter | Payment |
| **F4** | Customer | **F10** | Save & print bill (dine-in) |
| **F6** | Bill discount | **Enter** (payment) | Complete sale |
| **F7** | Held orders | **Del / + / − / ↑ ↓** | Remove / change qty / select cart item |

Barcode scanners: scan into the search box and the product is added on **Enter** (matches barcode or SKU).

---

## 7. Architecture

```
Retail-pos/
├── electron/                 Main process (Node) — all business logic, no UI
│   ├── main.js               window, single-instance lock, image protocol, background jobs
│   ├── preload.js            exposes one safe `pos.invoke(method, args)` bridge
│   ├── ipc/router.js         route table: method → service, permission & license checks, friendly errors
│   ├── db/                   database.js (WAL, transactions, migrations), schema.js, seed.js
│   ├── services/             auth, users, settings, categories, products, customers, tables,
│   │                         orders, tokens, counters, inventory, reports, dashboard, backup
│   ├── printing/             receipt data + 6 templates, token, reports (HTML/PDF/CSV/XLSX), printer
│   ├── license/              offline license verification, machine id, config (public key)
│   └── core/                 context, errors, permissions, logger, utils
├── shared/                   calc.mjs (order totals) + format.mjs — used by UI *and* main process
├── src/                      React UI (pages, components, contexts, design system CSS)
└── tests/                    node:test service tests
```
The UI never touches the database. It calls named methods, and the main process validates the session, permissions and license on every call. This keeps a later move to a web/cloud version (a REST API over the same services, cloud sync or multi-branch) straightforward, without rebuilding the app.

---

## 8. Documentation
- [docs/SUPER_ADMIN_SETUP.md](docs/SUPER_ADMIN_SETUP.md): Firebase setup, deployment and admin accounts
- [docs/LICENSING.md](docs/LICENSING.md): key format, signing key, renewals, security
- [docs/PRINTER_SETUP.md](docs/PRINTER_SETUP.md): USB and Bluetooth thermal printers, 58/80 mm, auto-cut, Urdu
- [docs/DATABASE.md](docs/DATABASE.md): tables, columns, backup format

## 9. Known limitations
- **Live control needs internet.** Block / suspend / revoke reach a POS only when it goes online (it checks every 5 minutes). A permanently offline POS keeps working until the license expires.
- **Revocation needs internet.** A revoked or suspended license stops a POS only after that POS connects once. A permanently offline POS keeps working until its license expiry date. Keep plans time-limited (e.g. yearly) for this reason.
- **Real-printer testing:** thermal printing was verified up to the ESC/POS bytes (decoded back to images in tests) but could not be run on a physical printer in the build environment — please run **Settings → Printers → Test receipt** once on the shop's printer and adjust *Extra feed* / *Cut* if needed.
- **Bluetooth printers** must be paired and installed as a Windows printer. The app does not include its own Bluetooth stack.
- The NSIS **installer must be built on Windows** (or with the included GitHub Actions workflow). On Linux/macOS you can build the portable EXE and ZIP.
- Cloud sync, multi-branch, web ordering and a mobile app are **not** included. The architecture is ready for them.

---

### Urdu quick guide (Roman Urdu)
1. Install karein → **admin / admin123** (PIN 1234) se login karein → Users mein password change karein.
2. **Settings → Business**: dukaan ka naam (Urdu bhi chalega), address, phone, logo upload karein.
3. **Settings → Receipt**: 58mm ya 80mm, design (6 templates) select karein → *Save & test print*.
4. **Settings → Printers**: receipt printer aur token printer select karein.
5. **Categories** aur **Products** banayein (ya *Settings → General → Load demo data*).
6. **POS** par product click karein → **F9** → amount likhein → **Enter** → receipt/token print.
7. Rozana **Backup** USB par zaroor rakhein (*Settings → Backup & Restore*).
