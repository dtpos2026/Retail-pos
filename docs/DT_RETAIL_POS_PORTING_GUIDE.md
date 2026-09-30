# DT Retail POS — Feature Guide for Building the Same Luxury Experience in Another Software

**By Digital Target · Version 1.1.3**
Give this file (or the PDF) to any developer or AI assistant and say:
*"Build my other software with the same features, luxury look, printing and licensing described here."*

---

## 1. What the product is
DT Retail POS is a **fully offline Windows POS** for small Pakistani businesses (retail, restaurant, cafe, takeaway, delivery).
Internet is used only for licensing (one-time device registration, live block / suspend, renewals). Everything else works offline.

| Part | Technology |
|---|---|
| Desktop app | Electron 44, React 18, Vite, `node:sqlite` (WAL, synchronous=FULL, versioned migrations) |
| Printing | Direct ESC/POS raster to the Windows spooler (RAW), driver mode as fallback |
| Licensing | ECDSA P-256 signed keys + Firestore REST (device registration, block/suspend) |
| Super Admin panel | React + Firebase Auth + Firestore + Hosting (clients, licenses, devices) |
| Installer | electron-builder (NSIS installer + portable), built on Windows |

## 2. Modules (sidebar)
Dashboard · POS / New Sale · **Hold / Running / Retrieve** (own module) · Orders · Tables (floor plan) · Products · Categories · Customers · Tokens · Inventory · Reports · Users & roles · Settings (Business, Appearance, Receipt, Printers, Tokens, Sales & Tax, Payments, Inventory, Backup & Restore, License, General).

Key POS behaviour: dine-in / takeaway / delivery, per-item notes, discounts, tax, split payments, walk-in customer circle, hold a bill and retrieve it later, running orders per table, token numbers (daily reset), KOT (kitchen slip), animated success screen after payment.

## 3. Luxury look & feel (design system)
- **Theme tokens (CSS variables)**: `--primary --primary-600 --primary-50 --primary-100 --primary-rgb --grad-a/b/c --nav-a/b --sidebar --sidebar-2 --accent --bg --surface --text --border --on-primary`. Applied with `data-theme` and `data-anim` on `<html>`.
- **7 themes**

| Theme | Primary | Sidebar | Style |
|---|---|---|---|
| Royal (default) | #6d28d9 | #2a0a55 | purple gradient, gold accent |
| Crimson | #dc2626 | #2b0b0d | **red & white** |
| Gold | #d4a017 | #050505 | black + gold, dark luxury |
| Emerald | #059669 | #063a2b | green |
| Sunset | #ea580c | #34160a | orange |
| Ocean | #0284c7 | #07304a | blue |
| Night | #8b5cf6 | #070c17 | dark mode |

- Gradient collapsible sidebar with brand mark, rounded cards (14–18 px), soft layered shadows, hover-lift, pill badges, optional dashboard **banner image**.
- **Animated splash** (separate frameless window, min 2.3 s): triangles pop in, wordmark, progress bar, "Developed by Digital Target · vX".
- **Animated login**: brand panel + form panel, staggered entrance, user tiles + PIN pad.
- Floor-plan **table cards** (shape, seats, status colour), product tiles, animated **sale-success** screen.
- Branding everywhere: Digital Target logo (lockup + mark), developer credit, version number in sidebar footer, login and About.
- App icon: purple receipt icon; product name **DT Retail POS**.

## 4. Printing — the most important part
### Problem solved
Windows thermal drivers feed a blank page at the top of the receipt (page size mismatch). Chromium/driver printing is also slow.

### Solution (implement exactly like this)
1. Build the receipt as **HTML/CSS** (any design, Urdu, logo, boxes, QR).
2. Render it in a **hidden, reused BrowserWindow** whose body width equals the printable width (72 mm = 576 dots on 80 mm paper; 48 mm = 384 dots on 58 mm). Zoom so 1 CSS mm = 8 dots.
3. `capturePage` in 2000 px tiles → BGRA → gray.
4. Threshold (Floyd–Steinberg dithering **only** inside logo/image rectangles so text stays crisp).
5. Pack 1-bit rows → `GS v 0` raster bands (240 rows each) → `ESC J` feed → `GS V 66 0` (feed + partial cut).
6. Send with **winspool P/Invoke (RAW datatype)** through one **persistent PowerShell process** (only the first print pays start-up; later prints ≈ 150 ms).
7. Trim blank rows at the end; the job contains exactly the receipt length → **no blank top margin, exact cut**.

### Reliability features
- **Auto-detect** the thermal printer by name (POS-80, XP-80, RP326, TM-T20, Rongta, Bixolon…), ignore PDF/XPS/OneNote.
- Printer list cached and refreshed every 20 s; print helper pinged every 20 s; render window kept warm.
- On failure: fresh detect + helper restart + up to 3 attempts.
- Status pill in the top bar (green = ready) and status card in Settings.
- **Side balance** (± dots) + **Margin test** print to make left/right margins equal on any printer.
- Settings: paper 58/80 mm, cut partial/full/none, extra feed mm, darkness, print width dots, compatibility cut, copies, auto-print receipt/token after payment.

### Designs
- **11 receipt designs**: Classic, Modern, Minimal, Restaurant, Retail Invoice, Compact, Boxed Grid, Bold Restaurant, Tax Invoice + QR, Luxury, Ticket.
- **5 token designs**: Classic, Boxed, Bold, Minimal, Ticket (big token number, order type, table, items).
- **KOT** (kitchen order ticket) for running / held orders.
- Extras: amount in words, QR code (order or custom text), "Powered by Digital Target", Urdu with embedded Noto Naskh Arabic (works on any PC), logo, business details, NTN/STRN, footer text.
- **Reports on 80/58 mm** (print or **Save PNG**): sales summary, item-wise, dine-in / takeaway / delivery, payments, Day Summary; compact layout.

## 5. Licensing & device control
- Key format: `RPOS1.<payload>.<signature>` — ECDSA P-256. Payload: license id, client id, business name, machine id (optional lock), plan, issued/expiry, max users, **max devices**.
- Public key is embedded in the app (`electron/license/config.js` → `PUBLIC_KEY_PEM`); the private key lives only in the Super Admin panel/Firestore. Empty public key = developer build (no license asked).
- **First run**: create admin → enter license key once → device registers (internet once) → **never asked again**. Saved in `userData/license.json` (data folder is pinned to `%APPDATA%\Retail POS` so updates keep it).
- **1 license = 1 device** by default. Limit is raised in the panel. Enforced on the **server** by Firestore rules (atomic batch: device document + counter, `getAfter/existsAfter`).
- Panel actions, live: **block / unblock / suspend / activate / remove** a device, raise the device limit, renew/revoke a license. The POS checks every 5 min (every 45 s while blocked) and pushes the new state to the UI.
- Fully offline otherwise; a machine-locked key works with no internet at all.
- Trial: 7 days, clock-rollback protection.

## 6. Super Admin panel (web)
Dashboard (clients, active/expired licenses, devices online, charts), Clients, Licenses (generate key, plan, expiry, max users, max devices, copy key), **Devices** (name, OS, app version, last seen, status, block/suspend/remove), Settings (signing key, admin users). Firebase Auth (email/Google, verified email), head admin `digitaltarget.digital@gmail.com`. Luxury card UI with the same theme tokens.

## 7. Project structure
```
/                    POS app (Electron + React)
  electron/          main.js, preload.js, ipc/router.js, services/, printing/, license/
  src/               React UI (pages, components, styles/{app,themes,extras}.css)
  shared/            calc.mjs, format.mjs, brand.mjs
  assets/            splash.html, fonts (Noto Naskh Arabic)
  build/             icon.ico / icon.png
  tests/             unit + Playwright e2e
  docs/              guides
superadmin/          Firebase web panel (React + Vite) + firestore.rules
```
Architecture rules: `contextIsolation` on, one `pos.invoke(method, args)` IPC bridge, permission-checked route table, services layer, no business logic in the UI.

## 8. Instructions for the AI / developer porting this to another software
1. Read the target software's existing structure first; keep its data and features.
2. Add the **theme system** (tokens in §3) and the 7 themes, splash and animated login.
3. Replace printing with the **ESC/POS raster pipeline** (§4) — reuse the receipt/token/report HTML templates.
4. Add **licensing + device registration** (§5) with its own Firebase project and rules.
5. Add the **Hold / Running / Retrieve** module and floor-plan tables if the software has orders.
6. Add branding (logo, developer credit, version) and the **printer auto-detect / status** features.
7. Test: unit tests for the encoder and license logic, e2e for the UI, and check the receipt image has no blank top and equal side margins.
8. Build the Windows installer on a Windows machine (`npm run dist`).

## 9. Ideas for the next "advanced" edition
Cash-drawer kick · bilingual (Urdu + English) receipt · barcode scanner + label printing · multi-branch sync · loyalty points / wallet · supplier & purchase module · expenses and profit & loss · WhatsApp bill sharing · kitchen display screen · role-based dashboards · auto-update channel · onboarding wizard · sound feedback.

## 10. Build commands
```
# POS (project root)
npm install
npm run build
npm run dist            # installer in release/

# Super Admin
cd superadmin
npm install
npm run build
npx firebase-tools login
npx firebase-tools deploy
```

---
*DT Retail POS · Developed by Digital Target · digitaltarget.digital@gmail.com*
