# Retail POS — Feature & Luxury Design Spec (for building an advanced edition)

Give this file to any developer / AI to build the next, more advanced edition with the same feel.

## 1. Product
Offline Windows POS for small Pakistani retail / restaurant / cafe businesses, by **Digital Target**.
Stack: Electron 44 + React 18 + Vite + `node:sqlite` (WAL). Fully offline; internet only for licensing (device registration, live block/suspend, renewals).
Separate Firebase **Super Admin** web panel (React + Firebase Auth + Firestore + Hosting) for clients, licenses, devices.

## 2. Modules
Dashboard · POS (dine-in / takeaway / delivery, discounts, tax, split payment) · Orders · Tables (floor plan) · Hold / Running / Retrieve (own sidebar module) · Products · Categories · Customers · Tokens · Inventory · Reports · Users & roles · Settings · Backup / Restore · License.

## 3. Luxury look (design system)
- CSS variables per theme: `--primary --primary-rgb --grad-a/b/c --nav-a/b --sidebar --on-primary`; `data-theme`, `data-anim` on `<html>`.
- 7 themes: Royal (default), Crimson (red & white), Gold, Emerald, Sunset, Ocean, Night. Optional banner image on dashboard.
- Gradient sidebar with collapsible mark, rounded cards (14–18px), soft layered shadows, subtle hover-lift, pill badges.
- Animated splash (triangles pop in, RETAIL POS wordmark, progress bar, "Developed by Digital Target · vX"), min 2.3 s.
- Animated login (brand panel + form panel, staggered entrance), animated sale-success screen.
- Floor-plan table cards (shape + seats + status colour), product tiles, walk-in customer circle.
- Digital Target logo (lockup + mark), developer credit and version in sidebar footer/login/about.

## 4. Printing (the important part)
- **Direct ESC/POS raster** to the Windows spooler (RAW): HTML template → hidden window → screenshot → gray → threshold (dither only for logos) → `GS v 0` bands → feed → `GS V` cut. Avoids driver page-size = no blank top margin, ~150 ms after warm-up (persistent PowerShell winspool).
- Driver mode (Chromium print) as fallback. Settings: paper 58/80 mm (384 / 576 dots), cut partial/full/none, extra feed, darkness, compat cut.
- 11 receipt designs (classic, boxed bold, luxury, ticket, tax invoice + QR, compact…), 5 token designs, KOT, amount in words, Urdu (Noto Naskh), QR, "Powered by Digital Target".
- 80/58 mm thermal reports: sales, item-wise, dine-in/takeaway/delivery, payments, Day Summary — print or **Save PNG**.

## 5. Licensing & devices
- ECDSA P-256 signed keys `RPOS1.<payload>.<sig>` (lid, cid, business, machine id, plan, iat, exp, max users, max devices).
- First run: admin creates account → license key entered once → device registers (internet once) → never asked again.
- 1 license = 1 device by default; **device limit raised from the panel**; limit enforced server-side by `firestore.rules` (atomic batch + counter).
- Panel can block / unblock / suspend / activate / remove a device live; POS re-checks every 5 min (45 s while blocked); works offline otherwise.
- Public key goes in `electron/license/config.js` (`PUBLIC_KEY_PEM`) before customer builds.

## 6. Ideas for the advanced edition
Cash-drawer kick · Urdu/English bilingual receipt · barcode scanner & label printing · multi-branch sync (optional cloud) · loyalty points & customer wallet · supplier/purchase module · expense & profit-loss · WhatsApp bill share · kitchen display screen · role-based dashboards · auto-update channel · dark "night" POS mode by default · sound + haptic-style feedback · onboarding wizard.

## 7. Build
Root: `npm install` → `npm run build` → `npm run dist` (installer in `release/`).
Panel: `cd superadmin` → `npm install` → `npm run build` → `npx firebase-tools deploy`.
