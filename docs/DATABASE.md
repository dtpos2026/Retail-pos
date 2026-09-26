# Database

Retail POS uses **SQLite** (`node:sqlite`, built into Electron) at `%APPDATA%\Retail POS\data\retailpos.db`.

- `journal_mode=WAL`, `synchronous=FULL`, `foreign_keys=ON`. A committed sale survives power loss.
- Every checkout (order + items + payment + stock + token + table) is **one transaction**, so it is saved completely or not at all.
- `PRAGMA integrity_check` runs at start-up.
- Migrations are versioned in `desktop/electron/db/schema.js` (`schema_version` table).
- Timestamps are local time `YYYY-MM-DD HH:MM:SS`; money is stored in rupees (REAL, rounded to 2 decimals).

## Tables
| Table | Key columns |
|---|---|
| `settings` | key (section), value (JSON) — business, receipt, printer, token, sales, inventory, payment, backup, general |
| `counters` | name (`order`, `token`), value, reset_date — gap-free numbering inside transactions |
| `users` | name, username (unique), password_hash (scrypt), pin_hash, role, permissions (JSON), active, last_login |
| `categories` | name, color, icon, sort_order, active |
| `products` | name, sku (unique), barcode, category_id, sale_price, cost_price, discount, stock_qty, low_stock, unit, track_stock, image (BLOB), image_mime, active |
| `customers` | name, mobile, address, notes |
| `dining_tables` | name, capacity, status (available/occupied/reserved), current_order_id, active |
| `orders` | order_no (unique, e.g. ORD-000001), order_type (dine_in/takeaway/delivery), status (pending/completed/cancelled/refunded), payment_status (unpaid/partial/paid), table, customer snapshot, subtotal, item_discount, order_discount, tax_rate, tax_amount, delivery_charges, round_off, total, cost_total, paid, change_amount, due, payment_method, token_no, stock_applied, cashier_id/name, business_date, created/updated/completed_at, cancel_reason |
| `order_items` | order_id, product_id, name, category, qty, unit_price, cost_price, discount (line), total, notes |
| `payments` | order_id, method, amount, user_id, created_at (also used for later due collections) |
| `tokens` | token_no, order_id, items (JSON), status (preparing/ready/served/cancelled), business_date |
| `stock_movements` | product_id, type (opening/in/out/adjust/sale/return), qty (+/−), balance, unit_cost, note, order_id, user |

Product images are stored inside the database, so a backup is a **single file** that contains everything.

## Backups
- Files: `RetailPOS-Backup-YYYY-MM-DD_HHMM.rposbak` (a consistent SQLite copy made with the SQLite online backup API).
- Automatic backups: `RetailPOS-Auto-…` in `%APPDATA%\Retail POS\backups` (or your chosen folder), once a day, keeping the last N.
- Restore checks the file (integrity, required tables, version), saves a `RetailPOS-PreRestore-…` safety copy, replaces the database and restarts the app.
