# DT Retail POS — Design Guide (A to Z)

**Splash · Login · Themes · Smooth animations · Branding · Screens · Print designs · Fast printing**
By Digital Target · v1.1.3 · all screenshots are from the real app with demo data.

Use this guide to give any other software the same **luxury, smooth, VIP feel**. It describes design only — colours, motion, layouts and print styles.

---

## 1. Brand identity
- **Name:** DT Retail POS — developed by **Digital Target** (`digitaltarget.digital@gmail.com`).
- **Logo:** Digital Target mark (white triangles forming a "D/T" block) — used on splash, login, sidebar top (mark), sidebar footer (lockup "DIGITAL TARGET").
- **App icon:** purple gradient rounded square with a white receipt (kept as the product identity).
- **Signature:** "Powered by Digital Target" + version number `vX.Y.Z` always visible (sidebar footer, login, About, receipt footer).
- **Voice:** simple, friendly, English UI with Urdu support on receipts.
- **Typography:** Inter / Segoe UI for the app; Arial/Consolas on receipts; Noto Naskh Arabic (embedded) for Urdu.

| Token | Value |
|---|---|
| Card radius | 14 px (modals 18 px, table cards 16 px) |
| Small radius | 10 px / 7 px |
| Shadow | `0 1px 3px rgba(15,23,42,.06), 0 4px 14px rgba(15,23,42,.05)` |
| Big shadow | `0 20px 50px rgba(15,23,42,.18)` |
| Buttons/inputs | 40 px high, 11 px radius, focus ring in primary colour |

## 2. Splash screen (animated)
Frameless, transparent, rounded card (about 560×380) over a dark violet gradient with two blurred, slowly drifting colour orbs.

![Splash — frame 1](images/splash-1.png) ![Splash — frame 2](images/splash-2.png)

**Timeline (total ≈ 2.3 s minimum):**
| Time | Motion |
|---|---|
| 0 s | Card fades/scales in (`scale .94 → 1`, 0.5 s, `cubic-bezier(.2,.9,.3,1)`) |
| 0.1 – 0.7 s | The 4 logo triangles **pop in one by one** (`scale .2, rotate −25° → 1`, 0.55 s, overshoot `cubic-bezier(.2,1.3,.4,1)`) |
| 0.85 s | Wordmark **DT RETAIL POS** slides up 12 px + fades in |
| 1.0 s | Tagline fades in |
| 1.05 s | Thin progress bar appears; a light streak slides across it in a loop |
| footer | "Developed by Digital Target · vX.Y.Z" in small spaced capitals |
The splash stays until the main window is ready **and** the minimum time has passed, then the app reveals maximised — no white flash.

## 3. Login screen (animated)
Two panels: a **brand panel** (gradient, floating translucent shapes, headline, 3 feature chips, Digital Target lockup) and a **form panel** (user tiles + PIN pad).

![Login — entering](images/login-1.png) ![Login — settled](images/login-2.png)

Motion: headline `riseIn .7s`, subtitle `.25 s` delay, feature chips staggered, form box `riseIn .55s`, logo `popIn` then a soft **glow pulse** (2.6 s loop), background shapes float (`floatY`, 11–14 s ease-in-out). User taps a tile → PIN pad → the shell fades in.

## 4. Motion system (keep it smooth, never slow)
| Name | Use | Spec |
|---|---|---|
| `pageIn` | every page change | 0.22 s, `translateY(6px) → 0`, fade |
| `riseIn` | cards, modals, login | 0.18–0.7 s, `translateY(18px) scale(.985) → 0` |
| `popIn` | logo, success numbers | 0.5–0.7 s with slight overshoot |
| `glow` | logo, occupied tables | box-shadow ring pulse 2.4–2.6 s |
| `floatY` | background shapes | 11–14 s ease-in-out infinite |
| `shimmer` | loading skeletons | 1.4 s |
| `drawCheck` | payment success tick | stroke-dash draw + expanding rings + confetti (1.1 s) |
| Buttons / inputs | hover, focus | 0.12 s colour + shadow, press = `translateY(1px)` |
| Product tile | tap | 0.1 s border/shadow, 0.05 s press |
Rules: nothing longer than 0.7 s except decorative loops; every animation is disabled when **Animations = off** in Settings (`data-anim="off"`), for slow PCs.

## 5. Themes (luxury, red & white, dark)
Seven themes switch instantly from Settings → Appearance (CSS variables, no reload).

![Appearance settings](images/themes-settings.png)

| Theme | Primary | Sidebar | Mood |
|---|---|---|---|
| **Royal** (default) | `#6d28d9` | `#2a0a55` | purple gradient with gold accent |
| **Crimson** | `#dc2626` | `#2b0b0d` | **red & white** |
| **Black & Gold** | `#d4a017` | `#050505` | dark luxury |
| Emerald | `#059669` | `#063a2b` | fresh green |
| Sunset | `#ea580c` | `#34160a` | warm orange |
| Ocean | `#0284c7` | `#07304a` | calm blue |
| Night | `#8b5cf6` | `#070c17` | full dark mode |

Optional **banner** (title, subtitle, image) can sit on the dashboard and POS.

![Royal](images/dashboard-royal.png) ![Crimson](images/dashboard-crimson.png)
![Black & Gold](images/dashboard-gold.png) ![Night](images/dashboard-night.png)
![Emerald](images/dashboard-emerald.png) ![Ocean](images/dashboard-ocean.png)
![Sunset](images/dashboard-sunset.png)

## 6. App shell
- **Sidebar:** gradient, brand mark + name + business name on top, rounded nav items with icons, active item highlighted with the primary gradient, orange badge for pending/held bills, collapsible (auto-collapses on POS), "Powered by Digital Target · version" card at the bottom.
- **Top bar:** page title, printer status pill (green = ready), clock and date, user chip with logout.
- **Dashboard:** greeting banner (gradient card with Refresh and New Sale), 8 KPI cards with tinted icon squares (first card highlighted in primary), 7-day bar chart, sales-by-type progress bars, hourly chart.

## 7. POS (sale screen)
![POS empty](images/pos-empty.png)
![POS cart](images/pos-cart.png)
![POS Crimson](images/pos-crimson.png) ![POS Gold](images/pos-gold.png)

- Left: category chips + search/barcode + product tiles (image, name, price). Right: order panel with **Dine-In / Takeaway / Delivery** switch, customer circle (walk-in), items with quantity steppers, totals and a big Pay button.
- Keyboard: **F9** pay, **F8** hold; barcode scanner works in the search box.
- Payment dialog with big amount field, quick-cash buttons and change display, then the **animated success screen**.

![Payment](images/payment.png) ![Success](images/sale-success.png)

## 8. Tables and Hold / Running / Retrieve
**Tables:** floor-plan cards — shape and seat count, status colour (free / occupied with glowing ring / reserved), running amount and time.

![Tables](images/tables.png)

**Hold / Running:** its own sidebar module (badge shows the count). Cards for every held or running bill with type, table, items, total, time and **Retrieve** button.

![Hold and Running](images/hold-running.png)

## 9. Other screens
![Orders](images/orders.png) ![Products](images/products.png)
![Reports](images/reports.png) ![80mm report preview](images/report-80mm.png)
![Receipt settings with live preview](images/receipt-settings.png) ![Printer settings](images/printers.png)

Patterns: tables with soft row hover and pill status badges, modals that rise in (`riseIn .18 s`), toasts bottom-right, empty states with an icon and one clear action, live receipt preview beside receipt settings.

## 10. Receipt designs (80 mm — 58 mm is the same design narrower)
Eleven designs, all bold and readable on thermal paper, with Urdu, logo, QR and amount-in-words options.

![Classic](images/print-receipt-classic.png) ![Modern](images/print-receipt-modern.png) ![Minimal](images/print-receipt-minimal.png) ![Restaurant](images/print-receipt-restaurant.png)
![Retail Invoice](images/print-receipt-retail.png) ![Compact](images/print-receipt-compact.png) ![Boxed Grid](images/print-receipt-boxed.png) ![Bold Restaurant](images/print-receipt-bold.png)
![Tax Invoice + QR](images/print-receipt-tax.png) ![Luxury](images/print-receipt-luxury.png) ![Ticket](images/print-receipt-ticket.png)

| Design | Character |
|---|---|
| Classic | centred header, dashed lines, 4-column table |
| Modern | black header band, two-line items, highlighted total |
| Minimal | clean, no borders |
| Restaurant | huge order type, table and token; quantity first |
| Retail Invoice | boxed grid, item counts, "you saved" |
| Compact | one line per item — saves paper (great for 58 mm) |
| **Boxed Grid** | **bold boxes around every section and table** |
| **Bold Restaurant** | wide logo, giant DINE-IN / TABLE / TOKEN box, heavy table |
| Tax Invoice + QR | NTN/STRN, tax breakup, words, QR (FBR/PRA style) |
| Luxury | serif type, double-line frame, dotted price leaders |
| Ticket | zig-zag edges, stub number, PAID stamp |

## 11. Token and kitchen slip designs
Five token designs — big token number, order type, table, items — plus a KOT for the kitchen.

![Token classic](images/print-token-classic.png) ![Token boxed](images/print-token-boxed.png) ![Token bold](images/print-token-bold.png) ![Token minimal](images/print-token-minimal.png) ![Token ticket](images/print-token-ticket.png) ![Kitchen slip](images/print-kot.png)

## 12. 80 mm / 58 mm reports (print or Save PNG)
Compact reports for the thermal printer: Day Summary, sales, item-wise, dine-in / takeaway / delivery, payments.

![Day summary](images/print-report-daily.png) ![Sales report](images/print-report-sales.png)

## 13. Fast printing (design view)
- **Instant feel:** after the first receipt the app prints in about **150 ms** of processing; the printer starts moving immediately.
- **No blank paper at the top, exact cut:** the receipt is sent as an image sized to the receipt itself, then cut right after the last line.
- **Always ready:** the thermal printer is **auto-detected**, kept awake in the background, and retried automatically if it just woke up. A green/red printer pill in the top bar tells the cashier at a glance.
- **Equal margins:** *Margin test* + *Side balance* make the left and right gaps identical on any printer.
- **Auto print:** receipt and token print automatically after payment (switchable).
- The print pipeline: HTML design → hidden window → image → ESC/POS raster → Windows spooler (RAW) → cut.

## 14. Design checklist for the other software
1. Tokens first: colours, radius, shadow, spacing as CSS variables; 7 themes on top.
2. Add splash (§2) and animated login (§3); keep motion rules (§4).
3. Sidebar + top bar + dashboard cards (§6); Digital Target branding and version everywhere.
4. Tables / Hold-Running style modules where the software has orders (§8).
5. Print: build the receipt/token/report designs (§10–12) and the fast printer pipeline (§13).
6. Test on a 1366×768 laptop and on a real 58/80 mm printer.

---
*DT Retail POS · Developed by Digital Target · digitaltarget.digital@gmail.com*
