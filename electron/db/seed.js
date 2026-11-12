'use strict';

const ctx = require('../core/context');
const settings = require('../services/settings');
const { hashSecret } = require('../services/auth');
const { nowLocal } = require('../core/util');
const logger = require('../core/logger');

const DEFAULT_ADMIN = { username: 'admin', password: 'admin123', pin: '1234' };

/** First run: create the default admin account. */
function ensureDefaults() {
  const count = ctx.db.get('SELECT COUNT(*) c FROM users').c;
  if (count === 0) {
    ctx.db.run(
      'INSERT INTO users (name, username, password_hash, pin_hash, role, permissions, active, created_at) VALUES (?, ?, ?, ?, ?, ?, 1, ?)',
      ['Administrator', DEFAULT_ADMIN.username, hashSecret(DEFAULT_ADMIN.password), hashSecret(DEFAULT_ADMIN.pin), 'admin', '[]', nowLocal()]
    );
    logger.info('Default admin user created');
  }
}

const DEMO = {
  categories: [
    { name: 'Burgers', color: '#f97316', icon: 'sandwich' },
    { name: 'Biryani', color: '#eab308', icon: 'soup' },
    { name: 'BBQ', color: '#dc2626', icon: 'flame' },
    { name: 'Karahi', color: '#9333ea', icon: 'cooking-pot' },
    { name: 'Fast Food', color: '#0ea5e9', icon: 'pizza' },
    { name: 'Drinks', color: '#16a34a', icon: 'cup-soda' },
  ],
  products: [
    ['Zinger Burger', 'Burgers', 450, 280, 'BRG-01'],
    ['Chicken Burger', 'Burgers', 350, 210, 'BRG-02'],
    ['Beef Burger', 'Burgers', 550, 340, 'BRG-03'],
    ['Chicken Biryani', 'Biryani', 380, 220, 'BRY-01'],
    ['چکن بریانی (Special)', 'Biryani', 480, 290, 'BRY-02'],
    ['Beef Biryani', 'Biryani', 420, 260, 'BRY-03'],
    ['Chicken Tikka', 'BBQ', 400, 240, 'BBQ-01'],
    ['Seekh Kabab (4 pcs)', 'BBQ', 520, 300, 'BBQ-02'],
    ['Malai Boti', 'BBQ', 650, 400, 'BBQ-03'],
    ['Chicken Karahi (Half)', 'Karahi', 1100, 700, 'KRH-01'],
    ['Chicken Karahi (Full)', 'Karahi', 2000, 1300, 'KRH-02'],
    ['Mutton Karahi (Half)', 'Karahi', 2200, 1500, 'KRH-03'],
    ['French Fries', 'Fast Food', 250, 90, 'FF-01'],
    ['Loaded Fries', 'Fast Food', 450, 200, 'FF-02'],
    ['Chicken Shawarma', 'Fast Food', 300, 170, 'FF-03'],
    ['Cold Drink 500ml', 'Drinks', 120, 85, 'DRK-01', '8961008210012'],
    ['Cold Drink 1.5L', 'Drinks', 230, 180, 'DRK-02', '8961008210029'],
    ['Mineral Water 500ml', 'Drinks', 70, 45, 'DRK-03', '8964000110016'],
    ['Lassi', 'Drinks', 180, 70, 'DRK-04'],
    ['Doodh Patti Chai', 'Drinks', 90, 35, 'DRK-05'],
  ],
  // restaurant inventory: [name, unit, cost per unit, opening stock, low alert]
  ingredients: [
    ['Chicken', 'kg', 650, 20, 5],
    ['Rice (Basmati)', 'kg', 380, 25, 5],
    ['Ghee / Oil', 'kg', 560, 15, 3],
    ['Beef', 'kg', 1300, 15, 3],
    ['Daal Mash', 'kg', 420, 10, 2],
    ['Flour (Atta)', 'kg', 140, 40, 8],
  ],
  recipes: {
    'Chicken Biryani': [['Chicken', 0.15], ['Rice (Basmati)', 0.12], ['Ghee / Oil', 0.02]],
    'Chicken Karahi (Half)': [['Chicken', 0.5], ['Ghee / Oil', 0.08]],
    'Chicken Karahi (Full)': [['Chicken', 1], ['Ghee / Oil', 0.15]],
    'Beef Burger': [['Beef', 0.15]],
  },
  customers: [
    ['Ahmed Khan', '03001234567', 'House 12, Street 5, Gulberg, Lahore'],
    ['Sara Ali', '03211234567', 'Flat 3B, Clifton Block 2, Karachi'],
    ['Bilal Hussain', '03331234567', 'Shop 7, Main Bazaar, Rawalpindi'],
  ],
};

/** Adds demo categories/products/tables/customers. Existing names are skipped. */
function loadDemo() {
  const now = nowLocal();
  ctx.db.transaction(() => {
    const catIds = {};
    DEMO.categories.forEach((c, i) => {
      const found = ctx.db.get('SELECT id FROM categories WHERE name = ? COLLATE NOCASE', [c.name]);
      catIds[c.name] = found
        ? found.id
        : ctx.db.run('INSERT INTO categories (name, color, icon, sort_order, active, created_at) VALUES (?, ?, ?, ?, 1, ?)', [c.name, c.color, c.icon, i + 1, now])
            .lastInsertRowid;
    });
    const restaurant = settings.get('inventory').mode === 'restaurant';
    DEMO.products.forEach(([name, cat, price, cost, sku, barcode], i) => {
      if (ctx.db.get('SELECT id FROM products WHERE name = ? OR sku = ?', [name, sku])) return;
      const stock = restaurant ? 0 : cat === 'Drinks' ? 48 : 100;
      const id = ctx.db.run(
        `INSERT INTO products (name, sku, barcode, category_id, sale_price, cost_price, stock_qty, low_stock, unit, track_stock, active, sort_order, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?)`,
        [name, sku, barcode || null, catIds[cat], price, cost, stock, 10, cat === 'Drinks' ? 'bottle' : 'pcs', restaurant ? 0 : 1, i, now, now]
      ).lastInsertRowid;
      if (stock) ctx.db.run(
        "INSERT INTO stock_movements (product_id, type, qty, balance, unit_cost, note, created_at) VALUES (?, 'opening', ?, ?, ?, 'Demo opening stock', ?)",
        [id, stock, stock, cost, now]
      );
    });
    if (restaurant) {
      // raw inventory items + a few recipes, so the restaurant mechanism can be tried at once
      const ing = {};
      for (const [name, unit, cost, stock, low] of DEMO.ingredients) {
        const found = ctx.db.get('SELECT id FROM products WHERE name = ? AND is_ingredient = 1', [name]);
        ing[name] = found ? found.id : ctx.db.run(
          `INSERT INTO products (name, sale_price, cost_price, stock_qty, low_stock, unit, track_stock, is_ingredient, active, sort_order, created_at, updated_at)
           VALUES (?, 0, ?, ?, ?, ?, 1, 1, 1, 0, ?, ?)`,
          [name, cost, stock, low, unit, now, now]
        ).lastInsertRowid;
        if (!found) ctx.db.run("INSERT INTO stock_movements (product_id, type, qty, balance, unit_cost, note, created_at) VALUES (?, 'opening', ?, ?, ?, 'Demo opening stock', ?)", [ing[name], stock, stock, cost, now]);
      }
      for (const [dish, parts] of Object.entries(DEMO.recipes)) {
        const d = ctx.db.get('SELECT id FROM products WHERE name = ? AND is_ingredient = 0', [dish]);
        if (!d || ctx.db.get('SELECT id FROM recipe_items WHERE product_id = ?', [d.id])) continue;
        for (const [name, qty] of parts) ctx.db.run('INSERT INTO recipe_items (product_id, ingredient_id, qty) VALUES (?, ?, ?)', [d.id, ing[name], qty]);
      }
    }
    const tables = ctx.db.get('SELECT COUNT(*) c FROM dining_tables WHERE active = 1').c;
    for (let i = tables + 1; i <= 8; i++) {
      ctx.db.run('INSERT INTO dining_tables (name, capacity, sort_order, created_at) VALUES (?, ?, ?, ?)', [`Table ${i}`, i <= 4 ? 4 : 6, i, now]);
    }
    DEMO.customers.forEach(([name, mobile, address]) => {
      if (!ctx.db.get('SELECT id FROM customers WHERE mobile = ?', [mobile])) {
        ctx.db.run('INSERT INTO customers (name, mobile, address, created_at) VALUES (?, ?, ?, ?)', [name, mobile, address, now]);
      }
    });
    if (!ctx.db.get("SELECT id FROM users WHERE username = 'cashier'")) {
      ctx.db.run(
        "INSERT INTO users (name, username, password_hash, pin_hash, role, permissions, active, created_at) VALUES ('Cashier', 'cashier', ?, ?, 'cashier', '[]', 1, ?)",
        [hashSecret('cashier123'), hashSecret('1111'), now]
      );
    }
    const biz = settings.get('business');
    if (biz.name === 'My Business') {
      settings.set('business', { name: 'Sample Restaurant', address: 'Main Boulevard, Gulberg III, Lahore', phone: '0300-1234567', ntn: '1234567-8' });
    }
  });
  return true;
}

/** Remove orders, tokens, payments and stock history but keep catalogue, users and settings. */
function clearSales() {
  ctx.db.transaction(() => {
    ctx.db.exec(`
      DELETE FROM tokens; DELETE FROM payments; DELETE FROM order_items; DELETE FROM orders;
      DELETE FROM stock_movements; DELETE FROM counters;
      UPDATE dining_tables SET status = 'available', current_order_id = NULL;
    `);
  });
  return true;
}

/** Wipe everything except the current admin and settings. */
function factoryReset() {
  const keepId = ctx.user?.id || 0;
  ctx.db.transaction(() => {
    clearSales();
    ctx.db.exec('DELETE FROM products; DELETE FROM categories; DELETE FROM customers; DELETE FROM dining_tables;');
    ctx.db.run('DELETE FROM users WHERE id <> ?', [keepId]);
    settings.set('inventory', { mode: '', modeLocked: false }, { internal: true }); // a fresh start may choose Retail / Restaurant again
  });
  return true;
}

module.exports = { DEFAULT_ADMIN, ensureDefaults, loadDemo, clearSales, factoryReset };
