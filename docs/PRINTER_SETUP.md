# Printer Setup

Retail POS prints to any printer that Windows lists (**Settings → Printers**). Printing is silent — no dialog — and starts right after payment.

## Two print methods (Settings → Printers → *Print method*)

| Method | Use it for | What it does |
|---|---|---|
| **Thermal — fast (recommended, default)** | Every 58 mm / 80 mm thermal printer (XPrinter, Rongta, POS-80, BlackCopper, Epson TM …) | Renders the receipt exactly as designed, converts it to a bitmap and sends it straight to the printer (ESC/POS). **No blank paper at the top**, exact length, precise cut, ~0.2 s to start printing. |
| **Windows driver** | Laser / inkjet / special printers, or thermal printers that do not understand ESC/POS | Prints through the Windows driver. Thermal drivers often add blank paper here — that is why Thermal mode is the default. |

If a thermal printer prints strange characters, switch to *Windows driver*.

### Thermal options
- **Paper cut** — partial, full, or none (tear off). *Compatibility cut* is for older printers.
- **Extra feed (mm)** — blank space after the last line before the cut (default 3 mm). Increase it if the cut touches the last line.
- **Print darkness** — light / normal / dark (bolder text on faded paper).
- **Print width (dots)** — Auto = 384 dots for 58 mm, 576 dots for 80 mm. Change only if your printer uses another width (e.g. 512 or 640).

## USB thermal printer (most common)
1. Install the driver from the printer CD / website (it appears in Windows as e.g. *POS-80*, *XP-58*).
2. In Retail POS → **Settings → Printers**, choose the **Receipt printer** (optionally a separate **Token / kitchen printer**).
3. Click **Test receipt**. Then choose a design in **Settings → Receipt** (11 designs, 58 mm and 80 mm, live preview).

## Bluetooth thermal printer
1. Windows **Settings → Bluetooth & devices → Add device** (PIN usually `0000` or `1234`).
2. Install the printer driver and select the Bluetooth COM port it creates.
3. It then appears in **Settings → Printers**. Select it and press **Test receipt**.

## Network / Wi-Fi printers
Add the printer in Windows first (by IP address), then select it in Retail POS.

## What can be printed
- **Receipts / bills** — 11 designs: Classic, Modern, Minimal, Restaurant, Retail Invoice, Compact, Boxed Grid, Bold Restaurant, Tax Invoice + QR, Luxury, Ticket. Optional QR code, amount in words, logo, Urdu.
- **Tokens** — 5 designs: Classic, Boxed, Bold Number, Minimal, Ticket (combined or per-item).
- **Kitchen slips (KOT)** — from **Hold / Running** or an order: items only, no prices, table and notes in a box.
- **Reports** — every report prints compactly on **80 mm or 58 mm** (Reports → *Print 80mm*), or saves as a **PNG** to share on WhatsApp. The **Day Summary (Z Report)** is a one-page closing sheet.
- Any receipt can also be saved as a **PNG** (Orders → order → *PNG*).

## Urdu
The *Noto Naskh Arabic* font is embedded, so Urdu business/product names print correctly on any PC.

## Troubleshooting
| Problem | Fix |
|---|---|
| "Printer … was not found" | The printer is off, unplugged or renamed. Select it again in Settings → Printers. |
| "No printer is installed" | Install the Windows driver first. |
| Strange characters printed | Switch *Print method* to **Windows driver**. |
| Nothing prints, no error | Check the Windows print queue for a paused / errored job. |
| Blank paper at the top | Use **Thermal — fast** (default). With *Windows driver*, set the driver's paper size to the roll width and margins to 0. |
| Cut touches the text / cuts too late | Change **Extra feed (mm)**. |
| Prints too light | *Print darkness → Dark*, or use a fresh paper roll. |
| Right side cut off | Check the roll width (58 / 80 mm) and *Print width (dots)*. |
| "Direct printing is blocked" | PowerShell is restricted on this PC — use *Windows driver*. |

If printing fails after a sale, the sale is still saved and a clear message is shown. Reprint from **Orders → Reprint**.
