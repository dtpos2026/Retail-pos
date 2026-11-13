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

- **Side balance (dots)** — makes the left and right margins equal. Press **Margin test**: if the left gap is bigger use a negative value (e.g. −8), if the right gap is bigger use a positive one (+8). 8 dots = 1 mm.

### Automatic printer detection
Leave *Receipt printer* on **Auto-detect thermal printer**. DT Retail POS recognises thermal printers by name (POS-80, XP-80, RP326, TM-T20, …), ignores PDF/XPS/OneNote, refreshes the list every 20 seconds and keeps the print helper awake, so printing starts instantly even after the printer was switched on later. If the first attempt fails (printer just woke up / was re-plugged) it re-detects and retries automatically. The top bar shows the printer status (green = ready).

## USB thermal printer (most common)
1. Install the driver from the printer CD / website (it appears in Windows as e.g. *POS-80*, *XP-58*).
2. In Retail POS → **Settings → Printers**, choose the **Receipt printer** (optionally a separate **Token / kitchen printer**).
3. Click **Test receipt**. Then choose a design in **Settings → Receipt** (11 designs, 58 mm and 80 mm, live preview).

## Add a printer inside the software (Bluetooth, COM port, USB without driver)
**Settings → Printers → Add a printer** has three tabs. Windows only; the software needs no driver for COM / Bluetooth printers because it sends the ESC/POS bytes straight to the port.

**Bluetooth** (58 mm mini printers, MediaLink, SpeedX, Xprinter, MPT-II, XP-P300, RPP02…)
1. Switch the printer on and keep it within 1–2 m. Disconnect it from any phone.
2. **Search for Bluetooth printers** (about 10 s). Likely printers are listed first and marked *Printer*.
3. **Pair**. The PIN is tried automatically (`0000`, then `1234`); type another PIN in the box if your printer uses one (see its self-test page).
4. Windows creates a COM port (e.g. COM5). Press **Test print**, then **Use for receipts** (and/or **Use for kitchen / tokens**).
5. **Forget** (the unlink button) removes the pairing. *Windows Bluetooth settings* opens Windows' own page if you prefer pairing there (then use the **COM port** tab).

**Text test** (next to *Test print*) sends only a few plain lines — no picture. Use it first: if the text prints but the receipt does not, the printer is connected and the problem is speed (choose *Safe*); if even the text does not print, the message says whether Windows could not connect or the printer stopped taking data. Details (connect time, bytes sent) are written to the log: Settings → General → *Open logs*.

**COM port** — lists every COM port (Bluetooth, USB-to-serial, old serial printers) with *Test print* / *Use for…*. Two settings:
- **Speed (baud)** — only for a serial *cable* (9600 is usual; try 115200 if the print is garbage). Bluetooth ignores it.
- **Sending speed** — *Auto* (default: slow and steady for Bluetooth, normal for cables), *Safe* (slowest), *Fast* (cables only).

**USB (no driver)** — a USB thermal printer without its driver only shows up as a port such as `USB001`. Press **Install**: Windows asks permission once and the built-in *Generic / Text Only* driver is installed on that port. The printer then appears in the normal printer list.

A COM / Bluetooth printer is saved as `serial:COM5`. If the port disappears (printer off / unpaired) the Printers page and the top bar say so, and **Verify printers** really opens the port to check that the printer answers.

> **Please test once on the shop's computer.** Pairing and direct COM printing depend on the printer model and the Bluetooth adapter; they were verified here only with a simulated printer (no real Bluetooth / USB hardware).

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
