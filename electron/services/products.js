'use strict';

const ctx = require('../core/context');
const { AppError, assert } = require('../core/errors');
const { nowLocal, cleanStr, round2, toNumber } = require('../core/util');

const COLUMNS = `p.id, p.name, p.sku, p.barcode, p.category_id, p.sale_price, p.cost_price, p.discount,
  p.stock_qty, p.low_stock, p.unit, p.track_stock, p.active, p.sort_order, p.updated_at, p.is_deal,
  (SELECT group_concat(CAST(di.qty AS INTEGER) || ' × ' || cp.name, ' + ') FROM deal_items di JOIN products cp ON cp.id = di.product_id WHERE di.deal_id = p.id) AS deal_text,
  (p.image IS NOT NULL) AS has_image, c.name AS category_name, c.color AS category_color`;

function shape(p) {
  return {
    ...p,
    active: !!p.active,
    is_deal: !!p.is_deal,
    track_stock: !!p.track_stock,
    has_image: !!p.has_image,
    image_url: p.has_image ? `posimg://product/${p.id}?v=${encodeURIComponent(p.updated_at)}` : null,
  };
}

function list({ search, categoryId, activeOnly, lowStockOnly } = {}) {
  const where = [];
  const params = {};
  if (activeOnly) where.push('p.active = 1 AND (c.id IS NULL OR c.active = 1)');
  if (categoryId) {
    where.push('p.category_id = $cat');
    params.cat = Number(categoryId);
  }
  if (search) {
    where.push('(p.name LIKE $q OR p.sku LIKE $q OR p.barcode = $exact)');
    params.q = `%${String(search).trim()}%`;
    params.exact = String(search).trim();
  }
  if (lowStockOnly) where.push('p.track_stock = 1 AND p.stock_qty <= p.low_stock');
  const sql = `SELECT ${COLUMNS} FROM products p LEFT JOIN categories c ON c.id = p.category_id
    ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY c.sort_order, p.sort_order, p.name`;
  return ctx.db.all(sql, params).map(shape);
}

function get({ id }) {
  const p = ctx.db.get(`SELECT ${COLUMNS} FROM products p LEFT JOIN categories c ON c.id = p.category_id WHERE p.id = ?`, [Number(id)]);
  assert(p, 'Product not found.');
  const out = shape(p);
  if (out.is_deal) {
    out.deal_items = ctx.db.all(
      'SELECT di.product_id AS productId, di.qty, cp.name, cp.sale_price, cp.cost_price FROM deal_items di JOIN products cp ON cp.id = di.product_id WHERE di.deal_id = ? ORDER BY di.id',
      [p.id]
    );
  }
  return out;
}

/** Exact barcode / SKU match used by barcode scanners on the POS screen. */
function findByCode({ code }) {
  const c = String(code || '').trim();
  if (!c) return null;
  const p = ctx.db.get(
    `SELECT ${COLUMNS} FROM products p LEFT JOIN categories c ON c.id = p.category_id
     WHERE p.active = 1 AND (p.barcode = ? OR p.sku = ? COLLATE NOCASE) LIMIT 1`,
    [c, c]
  );
  return p ? shape(p) : null;
}

function decodeImage(dataUrl) {
  const m = /^data:(image\/(png|jpeg|webp));base64,(.+)$/.exec(dataUrl || '');
  if (!m) throw new AppError('Image must be PNG, JPG or WEBP.');
  const buf = Buffer.from(m[3], 'base64');
  if (buf.length > 2 * 1024 * 1024) throw new AppError('Image is too large. Please use an image under 2 MB.');
  return { buf, mime: m[1] };
}

function save(input) {
  const id = input.id ? Number(input.id) : null;
  const name = cleanStr(input.name, 120);
  assert(name, 'Product name is required.');
  const sku = cleanStr(input.sku, 60) || null;
  const barcode = cleanStr(input.barcode, 60) || null;
  const salePrice = round2(toNumber(input.sale_price));
  const costPrice = round2(toNumber(input.cost_price));
  const discount = round2(toNumber(input.discount));
  assert(salePrice >= 0, 'Sale price cannot be negative.');
  assert(costPrice >= 0, 'Cost price cannot be negative.');
  assert(discount >= 0 && discount <= salePrice, 'Discount must be between 0 and the sale price.');
  const categoryId = input.category_id ? Number(input.category_id) : null;
  if (categoryId) assert(ctx.db.get('SELECT id FROM categories WHERE id = ?', [categoryId]), 'Selected category no longer exists.');
  if (sku) {
    const dupe = ctx.db.get('SELECT id FROM products WHERE sku = ? COLLATE NOCASE AND id <> ?', [sku, id || 0]);
    if (dupe) throw new AppError('Another product already uses this code / SKU.');
  }
  if (barcode) {
    const dupe = ctx.db.get('SELECT name FROM products WHERE barcode = ? AND id <> ?', [barcode, id || 0]);
    if (dupe) throw new AppError(`Barcode already used by "${dupe.name}".`);
  }
  // ---- deals (combo: several menu items sold together at one price) ----------------------------
  let isDeal = input.isDeal === undefined ? (id ? !!ctx.db.get('SELECT is_deal FROM products WHERE id = ?', [id])?.is_deal : false) : !!input.isDeal;
  let dealItems = null;
  let dealCost = 0;
  if (isDeal) {
    assert(Array.isArray(input.dealItems) && input.dealItems.length > 0, 'Add at least one item to the deal.');
    const seen = new Set();
    dealItems = input.dealItems.map((d) => {
      const pid = Number(d.productId);
      const qty = round2(toNumber(d.qty));
      assert(qty > 0, 'Deal item quantity must be greater than zero.');
      assert(!seen.has(pid), 'An item is listed twice in the deal. Increase its quantity instead.');
      seen.add(pid);
      assert(pid !== id, 'A deal cannot contain itself.');
      const comp = ctx.db.get('SELECT id, name, cost_price, is_deal FROM products WHERE id = ?', [pid]);
      assert(comp, 'A deal item no longer exists.');
      assert(!comp.is_deal, `"${comp.name}" is itself a deal. Deals cannot contain other deals.`);
      dealCost += comp.cost_price * qty;
      return { pid, qty };
    });
  }
  const fields = {
    name,
    sku,
    barcode,
    category_id: categoryId,
    sale_price: salePrice,
    cost_price: isDeal ? round2(dealCost) : costPrice,
    discount,
    low_stock: round2(toNumber(input.low_stock)),
    unit: cleanStr(input.unit || 'pcs', 20) || 'pcs',
    track_stock: isDeal ? false : input.track_stock !== false,
    is_deal: isDeal,
    active: input.active !== false,
    updated_at: nowLocal(),
  };

  return ctx.db.transaction(() => {
    let productId = id;
    if (id) {
      const existing = ctx.db.get('SELECT id FROM products WHERE id = ?', [id]);
      assert(existing, 'Product not found.');
      const sets = Object.keys(fields).map((k) => `${k} = $${k}`).join(', ');
      ctx.db.run(`UPDATE products SET ${sets} WHERE id = $id`, { ...fields, id });
    } else {
      const opening = round2(toNumber(input.stock_qty));
      const cols = { ...fields, stock_qty: opening, created_at: nowLocal() };
      const keys = Object.keys(cols);
      productId = ctx.db.run(`INSERT INTO products (${keys.join(', ')}) VALUES (${keys.map((k) => '$' + k).join(', ')})`, cols).lastInsertRowid;
      if (opening !== 0) {
        ctx.db.run(
          'INSERT INTO stock_movements (product_id, type, qty, balance, unit_cost, note, user_id, user_name, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
          [productId, 'opening', opening, opening, costPrice, 'Opening stock', ctx.user?.id, ctx.user?.name, nowLocal()]
        );
      }
    }
    if (isDeal) {
      ctx.db.run('DELETE FROM deal_items WHERE deal_id = ?', [productId]);
      for (const d of dealItems) ctx.db.run('INSERT INTO deal_items (deal_id, product_id, qty) VALUES (?, ?, ?)', [productId, d.pid, d.qty]);
    }
    if (input.image === null) {
      ctx.db.run('UPDATE products SET image = NULL, image_mime = NULL WHERE id = ?', [productId]);
    } else if (typeof input.image === 'string' && input.image.startsWith('data:')) {
      const { buf, mime } = decodeImage(input.image);
      ctx.db.run('UPDATE products SET image = ?, image_mime = ? WHERE id = ?', [buf, mime, productId]);
    }
    return productId;
  });
}

function remove({ id }) {
  id = Number(id);
  const used = ctx.db.get('SELECT COUNT(*) c FROM order_items WHERE product_id = ?', [id]).c + ctx.db.get('SELECT COUNT(*) c FROM deal_items WHERE product_id = ?', [id]).c;
  if (used > 0) {
    ctx.db.run('UPDATE products SET active = 0, updated_at = ? WHERE id = ?', [nowLocal(), id]);
    return { deactivated: true };
  }
  ctx.db.run('DELETE FROM products WHERE id = ?', [id]);
  return { deleted: true };
}

function image(id) {
  return ctx.db.get('SELECT image, image_mime FROM products WHERE id = ?', [Number(id)]);
}

/** Set or clear a product's picture from a data URL (used by bulk picture import). */
function setImage(id, dataUrl) {
  const { buf, mime } = decodeImage(dataUrl);
  ctx.db.run('UPDATE products SET image = ?, image_mime = ?, updated_at = ? WHERE id = ?', [buf, mime, nowLocal(), Number(id)]);
}

module.exports = { list, get, findByCode, save, remove, image, setImage };
