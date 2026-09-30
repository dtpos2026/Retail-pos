'use strict';

/*
 * Bulk menu import from Excel / CSV, template + export, and bulk picture assignment.
 * Pictures are matched to menu items by file name (the UI sends [{ id, image }] after matching).
 */

const ctx = require('../core/context');
const { AppError, assert } = require('../core/errors');
const { cleanStr, round2 } = require('../core/util');
const { parseTable } = require('../core/tabular');
const products = require('./products');
const categories = require('./categories');
const { reportToXlsx } = require('../printing/xlsx');

const ALIASES = {
  name: ['name', 'item', 'itemname', 'product', 'productname', 'menu', 'menuitem', 'dish', 'title', 'description', 'نام'],
  category: ['category', 'cat', 'group', 'section', 'type', 'categoryname', 'زمرہ'],
  sale_price: ['price', 'saleprice', 'sellingprice', 'rate', 'amount', 'mrp', 'salerate', 'قیمت'],
  cost_price: ['cost', 'costprice', 'purchaseprice', 'purchase', 'costrate'],
  discount: ['discount', 'disc', 'off'],
  sku: ['sku', 'code', 'itemcode', 'productcode'],
  barcode: ['barcode', 'bar', 'upc', 'ean'],
  unit: ['unit', 'uom', 'measure'],
  stock_qty: ['stock', 'qty', 'quantity', 'openingstock', 'stockqty', 'onhand'],
};
const COLORS = ['#f97316', '#eab308', '#ef4444', '#8b5cf6', '#0ea5e9', '#22c55e', '#ec4899', '#14b8a6', '#6366f1', '#a16207'];
const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9؀-ۿ]/g, '');
const num = (s) => {
  const v = parseFloat(String(s ?? '').replace(/(rs\.?|pkr|₨)/gi, '').replace(/,/g, '').trim());
  return Number.isFinite(v) ? v : NaN;
};

function mapHeader(row) {
  const map = {};
  row.forEach((h, i) => {
    const n = norm(h);
    for (const [key, list] of Object.entries(ALIASES)) if (map[key] === undefined && list.includes(n)) map[key] = i;
  });
  return map;
}

/** Parse a spreadsheet and report what importing it would do. */
function parseMenu({ name, data }) {
  assert(data, 'Choose an Excel or CSV file.');
  const rows = parseTable(Buffer.from(String(data), 'base64'), name || '');
  assert(rows.length > 0, 'The file is empty.');
  let map = mapHeader(rows[0]);
  let body = rows.slice(1);
  if (map.name === undefined) {
    // No header row: assume Name, Category, Price.
    map = { name: 0, category: 1, sale_price: 2 };
    body = rows;
  }
  const existing = ctx.db.all('SELECT id, name, sku FROM products');
  const byName = new Map(existing.map((p) => [p.name.toLowerCase(), p.id]));
  const bySku = new Map(existing.filter((p) => p.sku).map((p) => [p.sku.toLowerCase(), p.id]));
  const seen = new Set();
  const out = body.map((r, i) => {
    const cell = (k) => (map[k] === undefined ? '' : String(r[map[k]] ?? '').trim());
    const line = i + (map.name === 0 && body === rows ? 1 : 2);
    const rec = {
      line,
      name: cleanStr(cell('name'), 120),
      category: cleanStr(cell('category'), 60),
      sale_price: num(cell('sale_price')),
      cost_price: cell('cost_price') === '' ? null : num(cell('cost_price')),
      discount: cell('discount') === '' ? null : num(cell('discount')),
      sku: cleanStr(cell('sku'), 60) || null,
      barcode: cleanStr(cell('barcode'), 60) || null,
      unit: cleanStr(cell('unit'), 20) || null,
      stock_qty: cell('stock_qty') === '' ? null : num(cell('stock_qty')),
    };
    let error = '';
    if (!rec.name) error = 'Missing item name';
    else if (Number.isNaN(rec.sale_price)) error = 'Price is missing or not a number';
    else if (rec.sale_price < 0) error = 'Price cannot be negative';
    else if (seen.has(rec.name.toLowerCase())) error = 'Duplicate name in this file';
    if (rec.name) seen.add(rec.name.toLowerCase());
    const id = (rec.sku && bySku.get(rec.sku.toLowerCase())) || byName.get(rec.name.toLowerCase()) || null;
    return { ...rec, existingId: id, status: error ? 'error' : id ? 'update' : 'new', error };
  });
  const count = (s) => out.filter((r) => r.status === s).length;
  return { rows: out, counts: { total: out.length, new: count('new'), update: count('update'), error: count('error') }, headersFound: Object.keys(map) };
}

function ensureCategory(name, cache) {
  if (!name) return null;
  const key = name.toLowerCase();
  if (cache.has(key)) return cache.get(key);
  let c = ctx.db.get('SELECT id FROM categories WHERE name = ? COLLATE NOCASE', [name]);
  if (!c) {
    const n = ctx.db.get('SELECT COUNT(*) c FROM categories').c;
    c = { id: categories.save({ name, color: COLORS[n % COLORS.length], icon: 'tag' }), created: true };
  }
  cache.set(key, c.id);
  return c.id;
}

/** Create new items and (optionally) update existing ones from parsed rows. */
function importMenu({ rows, updateExisting = true }) {
  assert(Array.isArray(rows) && rows.length, 'Nothing to import.');
  const cache = new Map();
  const catBefore = ctx.db.get('SELECT COUNT(*) c FROM categories').c;
  const res = { created: 0, updated: 0, skipped: 0, errors: [] };
  for (const r of rows) {
    if (r.status === 'error') {
      res.skipped++;
      continue;
    }
    try {
      const categoryId = ensureCategory(r.category, cache);
      if (r.existingId) {
        if (!updateExisting) {
          res.skipped++;
          continue;
        }
        const cur = products.get({ id: r.existingId });
        products.save({
          ...cur,
          id: cur.id,
          name: r.name,
          category_id: r.category ? categoryId : cur.category_id,
          sale_price: r.sale_price,
          cost_price: r.cost_price ?? cur.cost_price,
          discount: r.discount ?? cur.discount,
          sku: r.sku ?? cur.sku,
          barcode: r.barcode ?? cur.barcode,
          unit: r.unit ?? cur.unit,
          dealItems: cur.is_deal ? cur.deal_items : undefined,
          isDeal: cur.is_deal,
          image: undefined,
        });
        res.updated++;
      } else {
        products.save({
          name: r.name,
          category_id: categoryId,
          sale_price: r.sale_price,
          cost_price: r.cost_price ?? 0,
          discount: r.discount ?? 0,
          sku: r.sku,
          barcode: r.barcode,
          unit: r.unit || 'pcs',
          stock_qty: r.stock_qty ?? 0,
          track_stock: true,
          active: true,
        });
        res.created++;
      }
    } catch (e) {
      res.errors.push(`Row ${r.line} (${r.name}): ${e.message}`);
    }
  }
  res.categoriesCreated = ctx.db.get('SELECT COUNT(*) c FROM categories').c - catBefore;
  return res;
}

/** Attach pictures: items = [{ id, image: dataURL }]. */
function setImages({ items }) {
  assert(Array.isArray(items) && items.length, 'No pictures to save.');
  let saved = 0;
  const errors = [];
  ctx.db.transaction(() => {
    for (const it of items) {
      try {
        products.setImage(it.id, it.image);
        saved++;
      } catch (e) {
        errors.push(`${it.name || it.id}: ${e.message}`);
      }
    }
  });
  return { saved, errors };
}

const COLUMNS = [
  { key: 'name', label: 'Name' },
  { key: 'category', label: 'Category' },
  { key: 'sale_price', label: 'Price', type: 'number' },
  { key: 'cost_price', label: 'Cost', type: 'number' },
  { key: 'discount', label: 'Discount', type: 'number' },
  { key: 'sku', label: 'Code' },
  { key: 'barcode', label: 'Barcode' },
  { key: 'unit', label: 'Unit' },
  { key: 'stock_qty', label: 'Stock', type: 'number' },
];

function templateXlsx() {
  return reportToXlsx({
    title: 'Menu',
    columns: COLUMNS,
    rows: [
      { name: 'Zinger Burger', category: 'Burgers', sale_price: 450, cost_price: 280, discount: 0, sku: 'BRG-01', barcode: '', unit: 'pcs', stock_qty: 50 },
      { name: 'Chicken Biryani', category: 'Biryani', sale_price: 380, cost_price: 220, discount: 0, sku: 'BIR-01', barcode: '', unit: 'plate', stock_qty: 30 },
      { name: 'Cold Drink 500ml', category: 'Drinks', sale_price: 120, cost_price: 85, discount: 0, sku: '', barcode: '', unit: 'bottle', stock_qty: 100 },
    ],
  });
}

function menuXlsx() {
  const rows = products.list({}).filter((p) => !p.is_deal).map((p) => ({ ...p, category: p.category_name || '' }));
  return reportToXlsx({ title: 'Menu', columns: COLUMNS, rows });
}

module.exports = { parseMenu, importMenu, setImages, templateXlsx, menuXlsx };
