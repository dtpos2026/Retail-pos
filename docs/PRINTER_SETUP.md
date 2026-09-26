# Printer Setup

Retail POS prints to any printer that Windows lists (**Settings → Printers**). Printing is silent: no dialog is shown and it starts right after payment.

## USB thermal printer (most common)
1. Install the driver from the printer's CD or website (e.g. *POS-80*, *XP-80C*, *XP-58*, *BlackCopper*, *Epson TM-T20*).
2. In Windows, open **Printers & scanners → your printer → Printing preferences**:
   - **Paper size:** 80 mm (72 mm printable) or 58 mm (48 mm printable), matching your roll.
   - **Cutter:** *Cut after document* / *Partial cut at end of job* (for auto-cut).
   - **Paper feed / top & bottom margins:** 0 if the option exists.
3. In Retail POS, go to **Settings → Printers**: choose the **Receipt printer** (and optionally a separate **Token / kitchen printer**) and click **Test receipt**.

## Bluetooth thermal printer
1. Turn the printer on and go to Windows **Settings → Bluetooth & devices → Add device** (PIN is usually `0000` or `1234`).
2. Install the printer driver and select the Bluetooth COM port it created (see the printer manual).
3. The printer then appears in **Settings → Printers**. Select it and run **Test receipt**.

## Network / Wi-Fi printers
Add the printer in Windows first (by its IP address), then select it in Retail POS.

## Paper width and design
- **Settings → Receipt**: choose 58 mm or 80 mm, one of 6 templates, margins, font size, logo size and alignment. The preview shows exactly what prints.
- **Settings → Tokens**: the token paper width can differ from the receipt width.
- If the printout is cut off on the right, increase the right margin by 1–2 mm. If there is too much space on the left, reduce the left margin.

## Urdu text
Retail POS embeds the **Noto Naskh Arabic** font in every receipt, so Urdu business and product names print correctly even if Windows has no Urdu font installed.

## Troubleshooting
| Problem | Fix |
|---|---|
| "Printer … was not found" | The printer is off, unplugged or renamed. Select it again in Settings → Printers. |
| "No printer is installed" | Install the Windows driver first. |
| Nothing prints, no error | Check the Windows print queue for a paused or errored job. |
| Blank paper / long feed | Set the paper size in the driver to the roll width and margins to 0. |
| No auto-cut | Enable the cutter in the driver's *Printing preferences*. |
| Printed twice | Set **Copies** to 1 in Settings → Receipt, and check the driver's copies setting. |

If printing fails after a sale, the sale is still saved and the POS shows a clear message. Reprint from **Orders → Reprint**.
