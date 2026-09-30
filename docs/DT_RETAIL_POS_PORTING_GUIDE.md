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

## 11. Appendix — printer module source code (copy into the other software)
Same printer features as DT Retail POS: **auto-detect the thermal printer, keep it active, fast direct ESC/POS printing, equal side margins, retry.**
Copy these 5 files into `electron/printing/` and wire them like this:
1. `printService` builds HTML → calls `printer.printHtml(html, { printerName, widthMm, copies, jobKey })`.
2. On app start (after the window is visible) call `printer.warmUp()` (starts the 20-second keep-alive monitor); on quit call `printer.shutdown()`.
3. Expose two IPC routes: `print.printers` → `listPrinters({fresh})` and `print.status` → `printerStatus()`; show a status pill in the UI.
4. Settings needed (`printer` section): `receiptPrinter:''`, `autoDetect:true`, `method:'thermal'`, `cut:'partial'`, `feedMm:3`, `darkness:'normal'`, `dots:0`, `shift:0`, `compatCut:false`.
5. Receipt HTML must use `<body style="width: {bodyWidthMm}mm">` where `bodyWidthMm = effectiveDots(paper, settings).content / 8`.
Requires: Electron, Windows, `settings`, `logger`, `AppError`, `ctx.paths.temp` from your app (replace with your own equivalents).

### escpos.js — ESC/POS encoder (raster, cut, side balance)
```
'use strict';

/*
 * ESC/POS encoder for thermal receipt printers.
 *
 * The whole receipt (any template, any language, logo, boxes) is rendered as an
 * image and sent as raster bands. The printer therefore prints exactly what the
 * template looks like, feeds only what we ask for, and cuts right after — with no
 * dependency on the Windows driver's page size (which is what caused blank paper
 * at the top of receipts).
 */

const ESC = 0x1b;
const GS = 0x1d;

/** Printable dots per line for a paper width (203 dpi = 8 dots/mm). */
function dotsForPaper(paperMm, override) {
  if (override && override % 8 === 0) return override;
  return Number(paperMm) === 58 ? 384 : 576;
}

/**
 * Dots the receipt content is laid out in. A horizontal `shift` (dots, + = right) reserves that many dots
 * on one side, so both side margins can be balanced for printers whose head is not centred on the paper.
 */
function effectiveDots(paperMm, pr = {}) {
  const total = dotsForPaper(paperMm, pr.dots);
  const shift = Math.max(-96, Math.min(96, Math.round(Number(pr.shift) || 0)));
  return { total, shift, content: total - Math.abs(shift) };
}

/** Place a grayscale image of `w` dots inside a `total`-dot wide row, `left` dots from the left edge (white fill). */
function padGray(gray, w, h, total, left) {
  if (total === w && !left) return gray;
  const out = new Uint8Array(total * h).fill(255);
  for (let y = 0; y < h; y++) out.set(gray.subarray(y * w, (y + 1) * w), y * total + left);
  return out;
}

/** Printable width in millimetres for a dot count. */
function mmForDots(dots) {
  return dots / 8;
}

const DARKNESS = { light: 185, normal: 150, dark: 120 };

/**
 * Pack a grayscale image into 1-bit rows (1 = black), MSB first.
 * @param {Uint8Array} gray width*height gray values (0 black .. 255 white)
 * @param {{x:number,y:number,w:number,h:number}[]} ditherRects regions (dots) that get error-diffusion dithering (logos)
 */
function packBitmap(gray, width, height, { threshold = 150, ditherRects = [] } = {}) {
  const work = gray;
  // Floyd–Steinberg only inside picture regions so text stays crisp.
  for (const r of ditherRects) {
    const x0 = Math.max(0, Math.floor(r.x));
    const y0 = Math.max(0, Math.floor(r.y));
    const x1 = Math.min(width, Math.ceil(r.x + r.w));
    const y1 = Math.min(height, Math.ceil(r.y + r.h));
    if (x1 <= x0 || y1 <= y0) continue;
    const w = x1 - x0;
    const h = y1 - y0;
    const buf = new Float32Array(w * h);
    // Contrast curve first: dark brand colours become solid black, light tints become white,
    // and only true mid-tones get dithered.
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const v = work[(y0 + y) * width + x0 + x];
        buf[y * w + x] = Math.max(0, Math.min(255, ((v - 85) * 255) / (215 - 85)));
      }
    }
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = y * w + x;
        const old = buf[i];
        const nv = old < 128 ? 0 : 255;
        buf[i] = nv;
        const err = old - nv;
        if (x + 1 < w) buf[i + 1] += (err * 7) / 16;
        if (y + 1 < h) {
          if (x > 0) buf[i + w - 1] += (err * 3) / 16;
          buf[i + w] += (err * 5) / 16;
          if (x + 1 < w) buf[i + w + 1] += err / 16;
        }
      }
    }
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) work[(y0 + y) * width + x0 + x] = buf[y * w + x] < 128 ? 0 : 255;
  }

  const rowBytes = Math.ceil(width / 8);
  const out = Buffer.alloc(rowBytes * height);
  for (let y = 0; y < height; y++) {
    const rowStart = y * width;
    const outStart = y * rowBytes;
    for (let bx = 0; bx < rowBytes; bx++) {
      let byte = 0;
      const base = bx * 8;
      for (let b = 0; b < 8; b++) {
        const x = base + b;
        if (x < width && work[rowStart + x] < threshold) byte |= 0x80 >> b;
      }
      out[outStart + bx] = byte;
    }
  }
  return { width: rowBytes * 8, height, rowBytes, data: out };
}

/** Remove fully blank rows at the end (the HTML's own bottom margin is re-added by feed). */
function trimBlankTail(bitmap, keepRows = 0) {
  const { rowBytes, data } = bitmap;
  let last = bitmap.height - 1;
  while (last >= 0) {
    let blank = true;
    const s = last * rowBytes;
    for (let i = 0; i < rowBytes; i++) {
      if (data[s + i] !== 0) {
        blank = false;
        break;
      }
    }
    if (!blank) break;
    last--;
  }
  const height = Math.min(bitmap.height, last + 1 + keepRows);
  return { ...bitmap, height, data: data.subarray(0, height * rowBytes) };
}

/**
 * Build the complete print job.
 * @param {{width:number,height:number,rowBytes:number,data:Buffer}} bitmap
 * @param {{cut?:'partial'|'full'|'none', feedMm?:number, compatCut?:boolean, copies?:number, band?:number}} opts
 */
function buildJob(bitmap, { cut = 'partial', feedMm = 3, compatCut = false, copies = 1, band = 240 } = {}) {
  const parts = [];
  for (let c = 0; c < Math.max(1, copies); c++) {
    parts.push(Buffer.from([ESC, 0x40])); // initialise
    for (let y = 0; y < bitmap.height; y += band) {
      const rows = Math.min(band, bitmap.height - y);
      const head = Buffer.from([GS, 0x76, 0x30, 0x00, bitmap.rowBytes & 0xff, (bitmap.rowBytes >> 8) & 0xff, rows & 0xff, (rows >> 8) & 0xff]);
      parts.push(head, bitmap.data.subarray(y * bitmap.rowBytes, (y + rows) * bitmap.rowBytes));
    }
    const feedDots = Math.max(0, Math.min(255, Math.round(feedMm * 8)));
    if (cut === 'none') {
      // Leave a little paper to tear off.
      parts.push(Buffer.from([ESC, 0x4a, Math.max(feedDots, 96)]));
    } else if (compatCut) {
      parts.push(Buffer.from([ESC, 0x4a, Math.max(feedDots, 100)])); // feed past the cutter
      parts.push(Buffer.from([GS, 0x56, cut === 'full' ? 0x00 : 0x01]));
    } else {
      if (feedDots) parts.push(Buffer.from([ESC, 0x4a, feedDots]));
      parts.push(Buffer.from([GS, 0x56, cut === 'full' ? 0x41 : 0x42, 0x00])); // feed to cutter + cut
    }
  }
  return Buffer.concat(parts);
}

/**
 * Decode a job produced by buildJob back into a 1-bit image (used by tests and by the
 * developer "dump" mode to preview exactly what the printer would print).
 */
function decodeJob(buf) {
  let i = 0;
  const rows = [];
  let rowBytes = 0;
  let cuts = 0;
  let feeds = 0;
  while (i < buf.length) {
    if (buf[i] === ESC && buf[i + 1] === 0x40) i += 2;
    else if (buf[i] === ESC && buf[i + 1] === 0x4a) {
      feeds += buf[i + 2];
      i += 3;
    } else if (buf[i] === GS && buf[i + 1] === 0x76 && buf[i + 2] === 0x30) {
      rowBytes = buf[i + 4] | (buf[i + 5] << 8);
      const h = buf[i + 6] | (buf[i + 7] << 8);
      i += 8;
      for (let y = 0; y < h; y++) rows.push(buf.subarray(i + y * rowBytes, i + (y + 1) * rowBytes));
      i += rowBytes * h;
    } else if (buf[i] === GS && buf[i + 1] === 0x56) {
      cuts++;
      i += buf[i + 2] >= 65 ? 4 : 3;
    } else throw new Error(`Unknown ESC/POS command at ${i}: ${buf[i].toString(16)}`);
  }
  return { rowBytes, width: rowBytes * 8, height: rows.length, rows, cuts, feedDots: feeds };
}

module.exports = { effectiveDots, padGray, dotsForPaper, mmForDots, DARKNESS, packBitmap, trimBlankTail, buildJob, decodeJob };
```

### detect.js — Thermal printer auto-detection
```
'use strict';

/** Pure helpers to recognise the thermal receipt printer among the printers Windows lists. */

const VIRTUAL = /pdf|xps|onenote|fax|anydesk|teamviewer|snagit|document writer|print to file|send to|virtual|cutepdf|foxit|adobe|nitro|primopdf|dopdf|remote desktop|rdp/i;
const THERMAL = /thermal|receipt|pos[-_ ]?\d|\bpos\b|xprinter|x-?printer|\bxp[-_ ]?\d|rongta|\brp\d{3}|epson.*tm|\btm[-_ ]?[a-z]?\d{2}|\btsp\d|star.*(tsp|sp\d)|bixolon|srp[-_ ]?\d|citizen|ct-?s\d|zjiang|\bzj[-_ ]?\d|gprinter|\bgp[-_ ]?\d|sunmi|munbyn|hoin|netum|3nstar|sewoo|snbc|black ?copper|bc[-_ ]?85|\b(58|80) ?mm|escpos|esc\/pos|generic.*text/i;
const OFFLINE = 0x80;
const ERROR_BITS = 0x2 | 0x8 | 0x10 | 0x20 | 0x40 | 0x100 | 0x200 | 0x400 | 0x800 | 0x1000 | 0x2000 | 0x4000; // error, paper jam/out/problem, no toner, ... (spooler bits)

const isVirtual = (p) => VIRTUAL.test(`${p.name} ${p.displayName || ''}`);
const isOffline = (p) => Number(p.status) > 0 && (Number(p.status) & OFFLINE) !== 0;

function score(p) {
  if (isVirtual(p)) return -100;
  const text = `${p.name} ${p.displayName || ''} ${p.description || ''}`;
  let s = 0;
  if (THERMAL.test(text)) s += 10;
  if (p.isDefault) s += 2;
  if (isOffline(p)) s -= 5;
  return s;
}

/** Best guess for the receipt printer: a thermal-looking device, else the Windows default, else any real printer. */
function pickThermal(printers) {
  const real = (printers || []).filter((p) => !isVirtual(p));
  if (!real.length) return null;
  const ranked = [...real].sort((a, b) => score(b) - score(a));
  return ranked[0];
}

module.exports = { isVirtual, isOffline, score, pickThermal, ERROR_BITS };
```

### rawPrint.js — Windows spooler RAW sender + keep-alive
```
'use strict';

const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const ctx = require('../core/context');
const logger = require('../core/logger');
const { AppError } = require('../core/errors');

/*
 * Sends raw bytes (ESC/POS) to a Windows printer through the print spooler (winspool, datatype RAW).
 * A single PowerShell process is kept alive, so only the very first print pays the ~1 s start-up.
 */

const SCRIPT = String.raw`
$ErrorActionPreference = 'Stop'
$code = @'
using System;
using System.Runtime.InteropServices;
public static class RawPrinter {
  [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
  public class DOCINFO {
    [MarshalAs(UnmanagedType.LPWStr)] public string pDocName;
    [MarshalAs(UnmanagedType.LPWStr)] public string pOutputFile;
    [MarshalAs(UnmanagedType.LPWStr)] public string pDataType;
  }
  [DllImport("winspool.drv", EntryPoint = "OpenPrinterW", SetLastError = true, CharSet = CharSet.Unicode, ExactSpelling = true)]
  static extern bool OpenPrinter(string name, out IntPtr h, IntPtr pd);
  [DllImport("winspool.drv", SetLastError = true, ExactSpelling = true)]
  static extern bool ClosePrinter(IntPtr h);
  [DllImport("winspool.drv", EntryPoint = "StartDocPrinterW", SetLastError = true, CharSet = CharSet.Unicode, ExactSpelling = true)]
  static extern bool StartDocPrinter(IntPtr h, int level, [In, MarshalAs(UnmanagedType.LPStruct)] DOCINFO di);
  [DllImport("winspool.drv", SetLastError = true, ExactSpelling = true)]
  static extern bool EndDocPrinter(IntPtr h);
  [DllImport("winspool.drv", SetLastError = true, ExactSpelling = true)]
  static extern bool StartPagePrinter(IntPtr h);
  [DllImport("winspool.drv", SetLastError = true, ExactSpelling = true)]
  static extern bool EndPagePrinter(IntPtr h);
  [DllImport("winspool.drv", SetLastError = true, ExactSpelling = true)]
  static extern bool WritePrinter(IntPtr h, IntPtr p, int n, out int written);
  public static string Send(string printer, byte[] data, string docName) {
    IntPtr h;
    if (!OpenPrinter(printer, out h, IntPtr.Zero)) return "ERR:open:" + Marshal.GetLastWin32Error();
    try {
      var di = new DOCINFO(); di.pDocName = docName; di.pOutputFile = null; di.pDataType = "RAW";
      if (!StartDocPrinter(h, 1, di)) return "ERR:startdoc:" + Marshal.GetLastWin32Error();
      try {
        if (!StartPagePrinter(h)) return "ERR:startpage:" + Marshal.GetLastWin32Error();
        IntPtr p = Marshal.AllocCoTaskMem(data.Length);
        try {
          Marshal.Copy(data, 0, p, data.Length);
          int w;
          if (!WritePrinter(h, p, data.Length, out w) || w != data.Length) return "ERR:write:" + Marshal.GetLastWin32Error();
        } finally { Marshal.FreeCoTaskMem(p); }
        EndPagePrinter(h);
      } finally { EndDocPrinter(h); }
    } finally { ClosePrinter(h); }
    return "OK";
  }
}
'@
Add-Type -TypeDefinition $code
[Console]::Out.WriteLine('READY')
[Console]::Out.Flush()
while (($line = [Console]::In.ReadLine()) -ne $null) {
  if ($line.Length -eq 0) { continue }
  $id = '0'
  try {
    $req = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($line)) | ConvertFrom-Json
    $id = [string]$req.id
    if ($req.cmd -eq 'ping') { $res = 'OK' }
    else {
      $bytes = [IO.File]::ReadAllBytes($req.file)
      $res = [RawPrinter]::Send([string]$req.printer, $bytes, [string]$req.doc)
    }
  } catch { $res = 'ERR:script:' + ($_.Exception.Message -replace '[\r\n|]', ' ') }
  [Console]::Out.WriteLine($id + '|' + $res)
  [Console]::Out.Flush()
}
`;

let proc = null;
let readyPromise = null;
let buffer = '';
let counter = 0;
const pending = new Map();

function failAll(message) {
  for (const [, p] of pending) {
    clearTimeout(p.timer);
    p.reject(new AppError(message));
  }
  pending.clear();
}

function start() {
  if (proc && readyPromise) return readyPromise;
  const dir = path.join(ctx.paths.temp, 'tools');
  fs.mkdirSync(dir, { recursive: true });
  const script = path.join(dir, 'rawprint.ps1');
  // BOM so Windows PowerShell 5.1 reads the file as UTF-8.
  fs.writeFileSync(script, '﻿' + SCRIPT, 'utf8');
  buffer = '';
  proc = spawn('powershell.exe', ['-NoLogo', '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', script], {
    windowsHide: true,
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  const p = proc;
  readyPromise = new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new AppError('The print helper did not start. Switch to "Windows driver" print method in Settings → Printers.')), 30000);
    let ready = false;
    p.stdout.setEncoding('utf8');
    p.stdout.on('data', (chunk) => {
      buffer += chunk;
      let idx;
      while ((idx = buffer.indexOf('\n')) >= 0) {
        const line = buffer.slice(0, idx).replace(/\r$/, '');
        buffer = buffer.slice(idx + 1);
        if (!ready && line === 'READY') {
          ready = true;
          clearTimeout(timer);
          resolve();
          continue;
        }
        const sep = line.indexOf('|');
        if (sep < 0) continue;
        const id = line.slice(0, sep);
        const entry = pending.get(id);
        if (entry) {
          pending.delete(id);
          clearTimeout(entry.timer);
          entry.resolve(line.slice(sep + 1));
        }
      }
    });
    let errText = '';
    p.stderr.setEncoding('utf8');
    p.stderr.on('data', (d) => {
      errText += d;
    });
    p.on('error', (err) => {
      clearTimeout(timer);
      logger.error('Print helper failed to start', err);
      reject(new AppError('Windows PowerShell is required for direct thermal printing. Switch to "Windows driver" print method in Settings → Printers.'));
    });
    p.on('exit', (code) => {
      clearTimeout(timer);
      logger.warn('Print helper exited', code, errText.slice(0, 500));
      if (proc === p) {
        proc = null;
        readyPromise = null;
      }
      if (!ready) reject(new AppError('The print helper could not start (PowerShell restricted?). Switch to "Windows driver" print method in Settings → Printers.'));
      failAll('The print helper stopped. Please try again.');
    });
  });
  readyPromise.catch(() => {
    if (proc === p) {
      try {
        p.kill();
      } catch {
        /* ignore */
      }
      proc = null;
      readyPromise = null;
    }
  });
  return readyPromise;
}

function send(payload, timeoutMs = 20000) {
  return new Promise((resolve, reject) => {
    const id = String(++counter);
    const timer = setTimeout(() => {
      pending.delete(id);
      reject(new AppError('The printer did not respond in time. Check that it is on and connected, then try again.'));
    }, timeoutMs);
    pending.set(id, { resolve, reject, timer });
    const line = Buffer.from(JSON.stringify({ id, ...payload }), 'utf8').toString('base64');
    proc.stdin.write(line + '\n');
  });
}

function explain(code, printer) {
  const n = Number((/^ERR:\w+:(\d+)$/.exec(code) || [])[1]);
  if (n === 1801) return `Printer "${printer}" was not found. Check the name in Settings → Printers.`;
  if (n === 5) return `Access to printer "${printer}" was denied. Run Retail POS as the same Windows user that installed the printer.`;
  if (n === 1796 || n === 1797) return `Printer "${printer}" does not accept direct printing. Switch to "Windows driver" print method in Settings → Printers.`;
  if (/^ERR:(write|startdoc|startpage):/.test(code)) return `Printing failed on "${printer}". Check that it is on, has paper, and the cover is closed.`;
  if (code.startsWith('ERR:script:')) return 'Direct printing is blocked on this computer. Switch to "Windows driver" print method in Settings → Printers.';
  return `Printing failed on "${printer}" (${code}).`;
}

/** Start the helper in the background so the first receipt prints immediately. */
function warmUp() {
  if (process.platform !== 'win32') return;
  start().catch((err) => logger.warn('Print helper warm-up failed', err.message));
}

async function sendRaw(printerName, bytes, docName = 'Retail POS') {
  if (process.platform !== 'win32') throw new AppError('Direct thermal printing works on Windows only.');
  await start();
  const file = path.join(ctx.paths.temp, `job-${Date.now()}-${++counter}.bin`);
  fs.writeFileSync(file, bytes);
  try {
    const res = await send({ printer: printerName, file, doc: docName });
    if (res !== 'OK') {
      logger.error('Raw print failed', printerName, res);
      throw new AppError(explain(res, printerName));
    }
  } finally {
    fs.unlink(file, () => {});
  }
}

function shutdown() {
  if (proc) {
    try {
      proc.stdin.end();
      proc.kill();
    } catch {
      /* ignore */
    }
    proc = null;
    readyPromise = null;
  }
}

/** Keep-alive: makes sure the helper process is running and answering. Resolves true when ready. */
async function ping() {
  if (process.platform !== 'win32') return false;
  try {
    await start();
    return (await send({ cmd: 'ping' }, 5000)) === 'OK';
  } catch {
    shutdown();
    return false;
  }
}

module.exports = { sendRaw, warmUp, shutdown, ping };
```

### rasterize.js — HTML to pixels (hidden window)
```
'use strict';

const fs = require('fs');
const path = require('path');
const { BrowserWindow, nativeImage } = require('electron');
const ctx = require('../core/context');
const logger = require('../core/logger');
const { AppError } = require('../core/errors');

const TILE = 2000; // device-independent px captured per tile (keeps memory and GPU limits safe)

let worker = null;
let idleTimer = null;
let seq = 0;

function createWorker() {
  const win = new BrowserWindow({
    show: false,
    width: 600,
    height: TILE,
    useContentSize: true,
    frame: false,
    skipTaskbar: true,
    paintWhenInitiallyHidden: true,
    webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false, backgroundThrottling: false, spellcheck: false },
  });
  win.on('closed', () => {
    if (worker === win) worker = null;
  });
  return win;
}

/** Reused hidden window: creating one per receipt would add ~300 ms to every print. */
function acquire() {
  if (!worker || worker.isDestroyed()) worker = createWorker();
  clearTimeout(idleTimer);
  idleTimer = setTimeout(() => {
    if (worker && !worker.isDestroyed()) worker.destroy();
    worker = null;
  }, 5 * 60 * 1000);
  idleTimer.unref?.();
  return worker;
}

function warmUp() {
  try {
    const w = acquire();
    w.loadURL('about:blank').catch(() => {});
  } catch (err) {
    logger.warn('Raster worker warm-up failed', err.message);
  }
}

const nextFrames = (wc, n = 2) =>
  wc.executeJavaScript(`new Promise(r => { let n = ${n}; const f = () => (--n <= 0 ? r() : requestAnimationFrame(f)); requestAnimationFrame(f); })`);

/**
 * Render HTML at `pixelWidth` device-independent pixels wide and return BGRA pixels.
 * The document's <body> must be `cssWidthMm` millimetres wide; the page is zoomed so that
 * body width == pixelWidth (e.g. 72 mm -> 576 dots), giving crisp text at printer resolution.
 */
async function renderBgra(html, { cssWidthMm, pixelWidth, maxHeightPx = 60000 }) {
  const win = acquire();
  const wc = win.webContents;
  fs.mkdirSync(ctx.paths.temp, { recursive: true });
  const file = path.join(ctx.paths.temp, `render-${Date.now()}-${++seq}.html`);
  fs.writeFileSync(file, html, 'utf8');
  try {
    win.setContentSize(pixelWidth, TILE);
    await win.loadFile(file);
    const cssWidthPx = (cssWidthMm / 25.4) * 96;
    const zoom = pixelWidth / cssWidthPx;
    wc.setZoomFactor(zoom);

    const info = await wc.executeJavaScript(`(async () => {
      await document.fonts.ready;
      await Promise.all([...document.images].map(i => i.complete ? 1 : new Promise(r => { i.onload = i.onerror = r; })));
      await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
      const s = document.createElement('div');
      s.id = '__spacer';
      const h = Math.ceil(document.body.getBoundingClientRect().height);
      s.style.cssText = 'height:' + (${TILE} / ${zoom} + 50) + 'px;width:1px';
      document.body.appendChild(s);
      const imgs = [...document.images].map(i => { const r = i.getBoundingClientRect(); return { x: r.left, y: r.top + window.scrollY, w: r.width, h: r.height }; });
      return { h, imgs };
    })()`);

    const totalH = Math.min(Math.ceil(info.h * zoom), maxHeightPx);
    if (totalH < 4) throw new AppError('Nothing to print.');
    const out = Buffer.alloc(pixelWidth * totalH * 4, 255);

    for (let y = 0; y < totalH; y += TILE) {
      const wantY = y / zoom;
      const scrollY = await wc.executeJavaScript(`(async () => { window.scrollTo(0, ${wantY}); await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))); return window.scrollY; })()`);
      const placeY = Math.round(scrollY * zoom);
      const tileH = Math.min(TILE, totalH - placeY);
      if (tileH <= 0) break;
      let img = await wc.capturePage({ x: 0, y: 0, width: pixelWidth, height: tileH });
      let size = img.getSize();
      if (!size.width || !size.height) throw new AppError('Could not render the receipt image.');
      if (size.width !== pixelWidth) {
        img = img.resize({ width: pixelWidth, height: Math.max(1, Math.round((size.height * pixelWidth) / size.width)), quality: 'best' });
        size = img.getSize();
      }
      const bmp = img.toBitmap();
      const rows = Math.min(size.height, totalH - placeY);
      bmp.copy(out, placeY * pixelWidth * 4, 0, rows * pixelWidth * 4);
    }
    const imgRects = info.imgs.map((r) => ({ x: r.x * zoom, y: r.y * zoom, w: r.w * zoom, h: r.h * zoom }));
    return { width: pixelWidth, height: totalH, bgra: out, imgRects };
  } finally {
    fs.unlink(file, () => {});
  }
}

/** BGRA -> 8-bit gray (composited on white). */
function toGray({ width, height, bgra }) {
  const gray = new Uint8Array(width * height);
  for (let i = 0, p = 0; i < gray.length; i++, p += 4) {
    const a = bgra[p + 3] / 255;
    const b = bgra[p] * a + 255 * (1 - a);
    const g = bgra[p + 1] * a + 255 * (1 - a);
    const r = bgra[p + 2] * a + 255 * (1 - a);
    gray[i] = (r * 299 + g * 587 + b * 114) / 1000;
  }
  return gray;
}

/** Full-colour PNG (for "Save as PNG" / sharing on WhatsApp). */
function toPng({ width, height, bgra }) {
  return nativeImage.createFromBitmap(bgra, { width, height }).toPNG();
}

module.exports = { renderBgra, toGray, toPng, warmUp };
```

### printer.js — Printer cache, auto-detect, monitor, retry, print
```
'use strict';

const fs = require('fs');
const path = require('path');
const { app, BrowserWindow } = require('electron');
const ctx = require('../core/context');
const logger = require('../core/logger');
const settings = require('../services/settings');
const { AppError } = require('../core/errors');
const escpos = require('./escpos');
const rasterize = require('./rasterize');
const rawPrint = require('./rawPrint');
const detect = require('./detect');

const MICRONS_PER_PX = 25400 / 96;
let queue = Promise.resolve();
const inFlight = new Set();

/** Developer / test hook: write the ESC/POS job to a folder instead of a printer. */
const dumpDir = () => (!app.isPackaged && process.env.RPOS_PRINT_DUMP) || null;

// ---------------------------------------------------------------------------------------
// Printer discovery: cached list, background refresh, automatic choice of the thermal printer
// ---------------------------------------------------------------------------------------

const LIST_TTL = 15000;
let cache = { list: [], at: 0 };
let refreshing = null;

function mapPrinter(p) {
  return { name: p.name, displayName: p.displayName || p.name, description: p.description || '', isDefault: !!p.isDefault, status: p.status };
}

/** Ask Windows for the installed printers (uses any open window; hidden worker windows are fine). */
function refreshPrinters() {
  if (refreshing) return refreshing;
  const win = BrowserWindow.getAllWindows().find((w) => !w.isDestroyed());
  if (!win) return Promise.resolve(cache.list);
  refreshing = win.webContents
    .getPrintersAsync()
    .then((list) => {
      cache = { list: list.map(mapPrinter), at: Date.now() };
      return cache.list;
    })
    .catch((err) => {
      logger.warn('Printer list failed', err.message);
      return cache.list;
    })
    .finally(() => {
      refreshing = null;
    });
  return refreshing;
}

/** Printer list; instant when the cache is fresh (printing never waits for Windows to enumerate printers). */
async function listPrinters({ fresh = false } = {}) {
  if (fresh || !cache.at || Date.now() - cache.at > LIST_TTL) await refreshPrinters();
  return cache.list;
}

/** Name of the printer to use for a job: the chosen one, else the auto-detected thermal printer, else the Windows default. */
function autoName(list) {
  const pr = settings.get('printer');
  if (pr.autoDetect === false) return (list.find((p) => p.isDefault) || {}).name || '';
  const p = detect.pickThermal(list);
  return p ? p.name : '';
}

async function resolvePrinter(name) {
  let printers = await listPrinters();
  if (!printers.length) printers = await listPrinters({ fresh: true });
  if (!printers.length) throw new AppError('No printer is installed on this computer. Install your printer driver in Windows first.');
  if (!name) {
    const auto = autoName(printers);
    if (!auto) throw new AppError('No printer selected. Choose a printer in Settings → Printers.');
    return auto;
  }
  if (!printers.some((p) => p.name === name)) {
    printers = await listPrinters({ fresh: true }); // it may have just been plugged in / switched on
    if (!printers.some((p) => p.name === name)) throw new AppError(`Printer "${name}" was not found. Check that it is connected and turned on, or choose another printer in Settings.`);
  }
  return name;
}

/** What the UI shows: which printer is in use and whether it looks ready. */
async function printerStatus({ fresh = false } = {}) {
  const list = await listPrinters({ fresh });
  const pr = settings.get('printer');
  const chosen = pr.receiptPrinter;
  const name = chosen || autoName(list);
  const p = list.find((x) => x.name === name);
  const helper = pr.method === 'thermal' && process.platform === 'win32' ? await rawPrint.ping() : null;
  return {
    name: name || '',
    auto: !chosen,
    found: !!p,
    offline: p ? detect.isOffline(p) : false,
    ready: !!p && !detect.isOffline(p) && helper !== false,
    helper,
    count: list.length,
    virtual: p ? detect.isVirtual(p) : false,
  };
}

let monitor = null;

/** Keeps the printer path alive: fresh printer list, print helper running, render worker warm. */
function startMonitor() {
  if (monitor) return;
  const tick = async () => {
    try {
      await refreshPrinters();
      if (settings.get('printer').method === 'thermal') {
        rasterize.warmUp();
        await rawPrint.ping();
      }
    } catch (err) {
      logger.warn('Printer monitor', err.message);
    }
  };
  monitor = setInterval(tick, 20000);
  monitor.unref?.();
  tick();
}

// ---------------------------------------------------------------------------------------
// Thermal (ESC/POS raster) — default
// ---------------------------------------------------------------------------------------

function thermalGeometry(widthMm) {
  const pr = settings.get('printer');
  const { total, shift, content } = escpos.effectiveDots(widthMm, pr);
  return { dots: total, content, shift, cssWidthMm: escpos.mmForDots(content), pr };
}

async function buildThermalJob(html, { widthMm, copies = 1 }) {
  const { dots, content, shift, cssWidthMm, pr } = thermalGeometry(widthMm);
  const img = await rasterize.renderBgra(html, { cssWidthMm, pixelWidth: content });
  const left = Math.max(0, shift); // + shift: unused dots on the left, content moves right
  const gray = escpos.padGray(rasterize.toGray(img), img.width, img.height, dots, left);
  img.imgRects = img.imgRects.map((r) => ({ ...r, x: r.x + left }));
  img.width = dots;
  const looksBlank = !gray.some((v) => v < 200);
  if (looksBlank) throw new AppError('The receipt image came out blank. Switch to "Windows driver" print method in Settings → Printers and try again.');
  const bitmap = escpos.trimBlankTail(
    escpos.packBitmap(gray, img.width, img.height, { threshold: escpos.DARKNESS[pr.darkness] || 150, ditherRects: img.imgRects }),
    6
  );
  const job = escpos.buildJob(bitmap, { cut: pr.cut, feedMm: pr.feedMm, compatCut: pr.compatCut, copies });
  return { job, bitmap };
}

/**
 * A printer that just woke up, was re-plugged or whose helper died can fail the very first attempt.
 * Re-detect (fresh list, helper restart) and retry a couple of times before reporting an error.
 */
async function sendWithRetry(requested, deviceName, job, doc) {
  let name = deviceName;
  let lastErr;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      await rawPrint.sendRaw(name, job, doc);
      return;
    } catch (err) {
      lastErr = err;
      logger.warn('Print attempt failed', attempt + 1, name, err.message);
      if (attempt === 2) break;
      await new Promise((r) => setTimeout(r, 500 + attempt * 700));
      rawPrint.shutdown();
      try {
        name = await resolvePrinter(requested);
      } catch (e2) {
        lastErr = e2;
      }
    }
  }
  throw lastErr;
}

async function printThermal(html, { printerName, widthMm, copies = 1, jobKey }) {
  const dump = dumpDir();
  const deviceName = dump ? '(dump)' : await resolvePrinter(printerName);
  const { job } = await buildThermalJob(html, { widthMm, copies });
  if (dump) {
    fs.mkdirSync(dump, { recursive: true });
    fs.writeFileSync(path.join(dump, `${String(jobKey || 'job').replace(/[^\w.-]+/g, '_')}-${Date.now()}.escpos`), job);
  } else {
    await sendWithRetry(printerName, deviceName, job, `DT Retail POS ${jobKey || ''}`.trim());
  }
  logger.info('Printed (thermal)', jobKey || '', 'on', deviceName, `${job.length} bytes`);
  return { printer: deviceName, method: 'thermal' };
}

// ---------------------------------------------------------------------------------------
// Windows driver (Chromium print) — fallback for printers that do not speak ESC/POS
// ---------------------------------------------------------------------------------------

function loadHtml(win, html) {
  fs.mkdirSync(ctx.paths.temp, { recursive: true });
  const file = path.join(ctx.paths.temp, `print-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.html`);
  fs.writeFileSync(file, html, 'utf8');
  return win.loadFile(file).then(() => file);
}

async function printDriver(html, { printerName, widthMm, copies = 1, jobKey }) {
  const deviceName = await resolvePrinter(printerName);
  const widthPx = Math.round((widthMm / 25.4) * 96);
  const win = new BrowserWindow({
    show: false,
    width: widthPx + 40,
    height: 800,
    webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false },
  });
  let file;
  try {
    file = await loadHtml(win, html);
    const heightPx = await win.webContents.executeJavaScript(`
      (async () => {
        await document.fonts.ready;
        await Promise.all([...document.images].map(i => i.complete ? 1 : new Promise(r => { i.onload = i.onerror = r; })));
        return Math.ceil(document.body.getBoundingClientRect().height);
      })()`);
    const heightMicrons = Math.max(30000, Math.ceil(heightPx * MICRONS_PER_PX) + 1000);
    await new Promise((resolve, reject) => {
      win.webContents.print(
        {
          silent: true,
          deviceName,
          printBackground: true,
          copies: Math.max(1, Math.min(5, copies)),
          landscape: false,
          scaleFactor: 100,
          margins: { marginType: 'none' },
          pageSize: { width: Math.round(widthMm * 1000), height: heightMicrons },
        },
        (success, reason) => {
          if (success) resolve();
          else {
            logger.error('Print failed', deviceName, reason);
            reject(new AppError(reason === 'cancelled' ? 'Printing was cancelled.' : `Printing failed on "${deviceName}". Check the printer is on, has paper and is connected.`));
          }
        }
      );
    });
    logger.info('Printed (driver)', jobKey || '', 'on', deviceName);
    return { printer: deviceName, method: 'driver' };
  } finally {
    if (!win.isDestroyed()) win.destroy();
    if (file) fs.unlink(file, () => {});
  }
}

// ---------------------------------------------------------------------------------------

/**
 * Print an HTML receipt/token/report. Jobs are serialised, and the same jobKey cannot run twice
 * at once (prevents duplicate prints from double clicks).
 */
function printHtml(html, opts) {
  const { jobKey } = opts;
  if (jobKey && inFlight.has(jobKey)) return Promise.reject(new AppError('This document is already printing.'));
  if (jobKey) inFlight.add(jobKey);
  const method = settings.get('printer').method;
  const job = queue.then(() => (method === 'driver' ? printDriver(html, opts) : printThermal(html, opts)));
  queue = job.catch(() => {});
  return job.finally(() => jobKey && inFlight.delete(jobKey));
}

/** Colour PNG of an HTML document (2x resolution) — for "Save as PNG" / WhatsApp. */
async function renderPng(html, { widthMm }) {
  const { cssWidthMm } = thermalGeometry(widthMm);
  const pixelWidth = Math.round((cssWidthMm / 25.4) * 96 * 2.4);
  const job = queue.then(async () => rasterize.toPng(await rasterize.renderBgra(html, { cssWidthMm, pixelWidth })));
  queue = job.catch(() => {});
  return job;
}

/** Show the system print dialog (used for A4 reports). */
async function printWithDialog(html) {
  const win = new BrowserWindow({ show: false, webPreferences: { sandbox: true } });
  let file;
  try {
    file = await loadHtml(win, html);
    await win.webContents.executeJavaScript('document.fonts.ready.then(() => true)');
    await new Promise((resolve, reject) => {
      win.webContents.print({ silent: false, printBackground: true }, (ok, reason) => (ok || reason === 'cancelled' ? resolve() : reject(new AppError('Printing failed.'))));
    });
  } finally {
    if (!win.isDestroyed()) win.destroy();
    if (file) fs.unlink(file, () => {});
  }
}

async function htmlToPdf(html, { landscape = false } = {}) {
  const win = new BrowserWindow({ show: false, webPreferences: { sandbox: true } });
  let file;
  try {
    file = await loadHtml(win, html);
    await win.webContents.executeJavaScript('document.fonts.ready.then(() => true)');
    return await win.webContents.printToPDF({ printBackground: true, pageSize: 'A4', landscape });
  } finally {
    if (!win.isDestroyed()) win.destroy();
    if (file) fs.unlink(file, () => {});
  }
}

/** Called once the main window is visible: prepares the fast path. */
function warmUp() {
  if (settings.get('printer').method === 'thermal') {
    rasterize.warmUp();
    rawPrint.warmUp();
  }
  startMonitor();
}

module.exports = { listPrinters, printerStatus, refreshPrinters, printHtml, renderPng, printWithDialog, htmlToPdf, warmUp, buildThermalJob, shutdown: () => {
    if (monitor) clearInterval(monitor);
    monitor = null;
    rawPrint.shutdown();
  },
};
```

---
*DT Retail POS · Developed by Digital Target · digitaltarget.digital@gmail.com*
