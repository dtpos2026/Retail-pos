# DT Retail POS v1.10.1 — Final QA Report

**Date:** 13 Nov 2026 · **Build:** 1.10.1 (commit on branch `claude/wizardly-hawking-l6r6ro`) · **Tester:** automated (real Electron app under Playwright + unit / integration tests)

## 1. Result at a glance

| Area | Tests | Result |
|---|---|---|
| POS unit + integration tests (`npm test`) | 92 | **92 pass, 0 fail** |
| UI end-to-end — original suite (36 steps: login, sales, dine-in, delivery, tables, variants, deals, import, reports, themes, backup / import…) | 36 | **36 pass**, no console errors |
| UI end-to-end — v1.10 features (`e2e-v110.js`) | 11 | **11 pass**, no console errors |
| UI end-to-end — final QA sweep (`e2e-qa.js`) | 9 | **9 pass**, no console errors |
| License e2e (activation, reset, support chat, suspend / reactivate) | 11 | **11 pass** |
| Super Admin panel unit tests | 3 | **3 pass** |
| Firestore rules (emulator): integration + devices | 40+ checks | **all pass** |
| Panel build / POS build (Vite) | 2 | **build OK** |
| Syntax check of every POS source file | all | **OK** |

## 2. What was exercised, feature by feature

| Feature | How it was tested | Result |
|---|---|---|
| **Add a printer — Bluetooth** | UI: Search → list (printers first) → Pair (PIN 0000 / 1234 tried) → COM port appears → Test print → bytes arrive (valid ESC/POS, one cut) → Use for receipts → printer list + status pill; wrong PIN refused; Forget | Pass (simulated printer) |
| **COM port printing** | Port parsing (Bluetooth outgoing / incoming ports, USB-serial); chunked write; one job at a time per port (Test print + Verify no longer collide); friendly error mapping | Pass (simulated) |
| **USB without driver** | UI: USB001 listed → Install → driver recorded | Pass (simulated) |
| **Sale prints on the COM printer** | Normal sale → receipt reaches the COM port | Pass |
| **Inventory Retail / Restaurant** | Chooser shown once → Save & lock → cannot be changed through any call (server-side) → only Factory reset unlocks it (UI verified) | Pass |
| **Restaurant raw items + recipes** | Add raw item, Stock In from the screen, recipe visible in the dish, no Stock column on products, dish sale deducts raw stock, refund returns it, one raw item shared by two dishes | Pass |
| **Delivery rider** | Required setting blocks save; rider typed by hand is saved on the order | Pass |
| **Open rate (khula sauda)** | Item tap → pad → Rs 200 → bill line “Daal Sabzi … 200” → saved total 200; lowering a fixed price needs discount permission | Pass |
| **Token items (roti)** | Qty pad → exactly **one** slip prints; order stored as paid takeaway; slip shows item, quantity, price and total in **every token design** | Pass |
| **Token OFF → KOT** | Token off + KOT on → receipt + KOT (2 slips); KOT off → receipt only (1 slip) | Pass |
| **Per head + service charge** | UI: Per head (3 × 100) + Service 10% → total 795; saved on the order; unit: tax, % and Rs modes, 100% limit, switched-off settings ignored, takeaway never gets them | Pass |
| **Per head on documents** | Every receipt design (11) shows both rows and the total; order detail; Z report and all 17 reports run; refund works; export → wipe → import keeps all new columns | Pass |
| **Help guide** | English / Urdu toggle, RTL layout, Nastaliq font loads, search, empty search, FAQ, 20 topics | Pass |
| **Every page / every Settings tab** | All 13 pages and all 13 Settings tabs open with no error screen and no console / page error | Pass |
| **Permissions** | Cashier is refused inventory-type change, Bluetooth pairing, USB install, settings change, factory reset; admin modules hidden | Pass |
| **Upgrade from v1.9.1** | A real schema-v5 database (with data) opens, migrates to v7, keeps its data, new columns default correctly; second open is a no-op | Pass |

## 3. Bug found and fixed during QA

| # | Problem | Cause | Fix |
|---|---|---|---|
| 1 | Printing on a paired Bluetooth printer failed with **“UNKNOWN”** (seen on a real MediaLink PT-210 in the customer's video) | Node's direct open of `\\.\COMn` does not work on Windows | COM port is now opened through Windows' SerialPort; per-port queue; clear error messages (**v1.10.1**) |
| 2 | “COM4 is being used by another program” when Test print and Verify ran together | Two opens of one port | Jobs on one port run one at a time |
| 3 | Add-a-printer steps cramped; Pair button still shown after pairing | UI layout / state | 2-column steps; Pair only while no COM port exists |
| 4 | Per head / Service / Note buttons cut off on the bill panel | Row did not wrap | Row wraps |

### Round 2 (v1.10.2) — bug hunt after the report
Static analysis (eslint: undefined variables, hooks rules, unused code) found no undefined variable or hook error. Reviewing the logic found and fixed:
- barcode / Enter on an open-rate, token, sized or weighed item skipped the pad and added it silently at the default price;
- merging dine-in bills lost the persons of the merged bill (Per head), and the merged-away bill kept its charges;
- the server did not apply the same “token item” exclusions as the screen.
Tests added: table operations (merge / transfer / split / pay) with per head, token item rules, scanner path. Result: **94 unit, 36 + 12 + 9 + 11 e2e steps, all pass.**

## 4. What could NOT be tested here (honest limits)

1. **Real Bluetooth / USB printer hardware.** Only the customer's video showed real hardware: pairing and COM4 creation worked there; the print step then hit bug #1, which is now fixed — **but the fix itself has not yet been run on that printer.** Please press *Verify printers* and *Test receipt* on the shop computer.
2. **Windows-only code paths** (PowerShell Bluetooth pairing, SerialPort write, USB driver install, Windows GPS) cannot run on the Linux test machine; they were reviewed and exercised through a simulation layer (`RPOS_FAKE_PRINTERS`) that is disabled in packaged builds.
3. **Windows installer build / install** (`npm run dist`) — not built in this session.
4. **Live Firebase** — validated on the emulator only; the Super Admin panel's browser smoke script was not re-run in this round (the panel changed only in its version label).
5. **Pairing details vary by printer model**: some printers need their own PIN (a PIN box is provided) or pairing in Windows Bluetooth settings (a button opens it).

## 5. Behaviour notes (by design)

- Per head and service charge are added **after tax** (like delivery charges); service % is taken on the bill after discount.
- Inventory type is **permanent** until a Factory reset (server enforces this).
- Token-item sales are recorded as paid **takeaway** counter sales.
- Pakistani-style Urdu guide uses Jameel Noori if installed on the PC; otherwise the bundled Noto Nastaliq.

## 6. Recommended first-day checklist on the shop computer

1. Settings → Printers → Add a printer → Bluetooth → pair → **Test print** → *Use for receipts*.
2. **Verify printers**, then a real sale; try the cash drawer if used.
3. Settings → Sales & Tax: set per head / service charge if needed.
4. Inventory: choose the type (Retail / Restaurant) carefully — it locks.
5. Take a **Backup** at the end of the first day.
