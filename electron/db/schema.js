'use strict';

/**
 * Versioned migrations. Never edit a released migration — add a new one.
 * All timestamps are local time strings "YYYY-MM-DD HH:MM:SS".
 * Money columns are REAL rupees rounded to 2 decimals in the service layer.
 */
const migrations = [
  {
    version: 1,
    sql: `
CREATE TABLE settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE counters (
  name       TEXT PRIMARY KEY,
  value      INTEGER NOT NULL DEFAULT 0,
  reset_date TEXT
);

CREATE TABLE users (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  name          TEXT NOT NULL,
  username      TEXT NOT NULL UNIQUE COLLATE NOCASE,
  password_hash TEXT NOT NULL,
  pin_hash      TEXT,
  role          TEXT NOT NULL DEFAULT 'cashier',
  permissions   TEXT NOT NULL DEFAULT '[]',
  active        INTEGER NOT NULL DEFAULT 1,
  last_login    TEXT,
  created_at    TEXT NOT NULL
);

CREATE TABLE categories (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  name       TEXT NOT NULL,
  color      TEXT NOT NULL DEFAULT '#4f46e5',
  icon       TEXT NOT NULL DEFAULT 'tag',
  sort_order INTEGER NOT NULL DEFAULT 0,
  active     INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL
);

CREATE TABLE products (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  name        TEXT NOT NULL,
  sku         TEXT,
  barcode     TEXT,
  category_id INTEGER REFERENCES categories(id) ON DELETE SET NULL,
  sale_price  REAL NOT NULL DEFAULT 0,
  cost_price  REAL NOT NULL DEFAULT 0,
  discount    REAL NOT NULL DEFAULT 0,
  stock_qty   REAL NOT NULL DEFAULT 0,
  low_stock   REAL NOT NULL DEFAULT 0,
  unit        TEXT NOT NULL DEFAULT 'pcs',
  track_stock INTEGER NOT NULL DEFAULT 1,
  image       BLOB,
  image_mime  TEXT,
  active      INTEGER NOT NULL DEFAULT 1,
  sort_order  INTEGER NOT NULL DEFAULT 0,
  created_at  TEXT NOT NULL,
  updated_at  TEXT NOT NULL
);
CREATE UNIQUE INDEX ux_products_sku ON products(sku) WHERE sku IS NOT NULL AND sku <> '';
CREATE INDEX ix_products_barcode ON products(barcode);
CREATE INDEX ix_products_category ON products(category_id);

CREATE TABLE customers (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  name       TEXT NOT NULL,
  mobile     TEXT,
  address    TEXT,
  notes      TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX ix_customers_mobile ON customers(mobile);

CREATE TABLE dining_tables (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  name             TEXT NOT NULL,
  capacity         INTEGER NOT NULL DEFAULT 4,
  status           TEXT NOT NULL DEFAULT 'available',
  current_order_id INTEGER,
  sort_order       INTEGER NOT NULL DEFAULT 0,
  active           INTEGER NOT NULL DEFAULT 1,
  created_at       TEXT NOT NULL
);

CREATE TABLE orders (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  order_no         TEXT NOT NULL UNIQUE,
  order_type       TEXT NOT NULL,
  status           TEXT NOT NULL DEFAULT 'pending',
  payment_status   TEXT NOT NULL DEFAULT 'unpaid',
  table_id         INTEGER REFERENCES dining_tables(id) ON DELETE SET NULL,
  table_name       TEXT,
  customer_id      INTEGER REFERENCES customers(id) ON DELETE SET NULL,
  customer_name    TEXT,
  customer_mobile  TEXT,
  customer_address TEXT,
  subtotal         REAL NOT NULL DEFAULT 0,
  item_discount    REAL NOT NULL DEFAULT 0,
  order_discount   REAL NOT NULL DEFAULT 0,
  tax_rate         REAL NOT NULL DEFAULT 0,
  tax_amount       REAL NOT NULL DEFAULT 0,
  delivery_charges REAL NOT NULL DEFAULT 0,
  round_off        REAL NOT NULL DEFAULT 0,
  total            REAL NOT NULL DEFAULT 0,
  cost_total       REAL NOT NULL DEFAULT 0,
  paid             REAL NOT NULL DEFAULT 0,
  change_amount    REAL NOT NULL DEFAULT 0,
  due              REAL NOT NULL DEFAULT 0,
  payment_method   TEXT,
  notes            TEXT,
  token_no         TEXT,
  stock_applied    INTEGER NOT NULL DEFAULT 0,
  cashier_id       INTEGER,
  cashier_name     TEXT,
  business_date    TEXT NOT NULL,
  created_at       TEXT NOT NULL,
  updated_at       TEXT NOT NULL,
  completed_at     TEXT,
  cancel_reason    TEXT
);
CREATE INDEX ix_orders_date ON orders(business_date);
CREATE INDEX ix_orders_status ON orders(status);
CREATE INDEX ix_orders_customer ON orders(customer_id);

CREATE TABLE order_items (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id   INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  product_id INTEGER REFERENCES products(id) ON DELETE SET NULL,
  name       TEXT NOT NULL,
  category   TEXT,
  qty        REAL NOT NULL,
  unit_price REAL NOT NULL,
  cost_price REAL NOT NULL DEFAULT 0,
  discount   REAL NOT NULL DEFAULT 0,
  total      REAL NOT NULL,
  notes      TEXT
);
CREATE INDEX ix_items_order ON order_items(order_id);
CREATE INDEX ix_items_product ON order_items(product_id);

CREATE TABLE payments (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id   INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  method     TEXT NOT NULL,
  amount     REAL NOT NULL,
  user_id    INTEGER,
  created_at TEXT NOT NULL
);
CREATE INDEX ix_payments_order ON payments(order_id);
CREATE INDEX ix_payments_date ON payments(created_at);

CREATE TABLE tokens (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  token_no      TEXT NOT NULL,
  order_id      INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  items         TEXT NOT NULL DEFAULT '[]',
  status        TEXT NOT NULL DEFAULT 'preparing',
  business_date TEXT NOT NULL,
  created_at    TEXT NOT NULL,
  updated_at    TEXT NOT NULL
);
CREATE INDEX ix_tokens_date ON tokens(business_date);

CREATE TABLE stock_movements (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  type       TEXT NOT NULL,
  qty        REAL NOT NULL,
  balance    REAL NOT NULL,
  unit_cost  REAL,
  note       TEXT,
  order_id   INTEGER,
  user_id    INTEGER,
  user_name  TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX ix_stock_product ON stock_movements(product_id);
CREATE INDEX ix_stock_date ON stock_movements(created_at);
`,
  },
];

module.exports = { migrations };
