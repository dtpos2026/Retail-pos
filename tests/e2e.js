// UI end-to-end test: drives the real Electron app (built renderer) with Playwright.
// Run: npm run build:renderer && npm run test:e2e   (on Linux CI wrap with xvfb-run)
// Screenshots are written to tests/.e2e-shots/.
const { _electron } = require('playwright-core');
const path = require('path');
const fs = require('fs');
const os = require('os');
const DESK = path.join(__dirname, '..');
const SHOTS = path.join(__dirname, '.e2e-shots');
fs.mkdirSync(SHOTS, { recursive: true });
const ud = fs.mkdtempSync(path.join(os.tmpdir(), 'rpos-e2e-'));

let failed = false;

(async () => {
  const app = await _electron.launch({
    executablePath: require('electron'),
    args: [...(process.platform === 'linux' ? ['--no-sandbox'] : []), DESK],
    env: { ...process.env, RPOS_USER_DATA: ud, RPOS_PRINT_DUMP: path.join(ud, 'prints') },
  });
  const errors = [];
  // The splash screen opens first; drive the main window.
  const isMain = (w) => !/splash\.html/.test(w.url());
  let page = app.windows().find(isMain);
  if (!page) page = await app.waitForEvent('window', { predicate: isMain, timeout: 30000 });
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => m.type() === 'error' && errors.push('console: ' + m.text()));
  await page.setViewportSize({ width: 1366, height: 768 });
  const shot = async (n) => { await page.waitForTimeout(500); await page.screenshot({ path: path.join(SHOTS, n + '.png') }); };
  const step = async (name, fn) => { try { await fn(); console.log('OK  ', name); } catch (e) { failed = true; console.log('FAIL', name, e.message.split('\n')[0]); await shot('fail-' + name.replace(/\W+/g, '_')); } };

  await page.waitForSelector('text=Welcome back');
  await page.waitForTimeout(1600); // let the entrance animation finish
  await shot('01-login');
  await step('login admin via PIN', async () => {
    await page.click('.user-tile');
    for (const d of '1234') await page.click(`.pinpad button:text-is("${d}")`);
    await page.waitForSelector('.sidebar');
  });
  await step('load demo data', async () => {
    await page.click('a[href="#/settings"]');
    await page.click('.tabs button:has-text("General")');
    await page.click('button:has-text("Load demo data")');
    await page.click('.modal button:has-text("Continue")');
    await page.waitForSelector('text=Demo data loaded');
  });
  await step('settings business', async () => { await page.click('.tabs button:has-text("Business")'); await shot('02-settings-business'); });
  await step('settings receipt preview', async () => { await page.click('.tabs button:has-text("Receipt")'); await page.waitForSelector('iframe.preview-frame'); await page.waitForTimeout(800); await shot('03-settings-receipt'); });
  await step('switch template modern 58', async () => {
    await page.click('.method:has-text("Modern")');
    await page.click('.seg button:has-text("58 mm")');
    await page.waitForTimeout(900);
    await shot('04-receipt-modern-58');
    await page.click('button:has-text("Save changes")');
    await page.waitForSelector('text=Settings saved');
  });
  await step('token preview', async () => { await page.click('.tabs button:has-text("Tokens")'); await page.waitForTimeout(900); await shot('05-token-settings'); });

  await step('POS takeaway sale', async () => {
    await page.click('a[href="#/pos"]');
    await page.waitForSelector('.pcard');
    await shot('06-pos-empty');
    await page.click('.pcard:has-text("Zinger Burger")');
    await page.click('.pcard:has-text("Zinger Burger")');
    await page.click('.pcard:has-text("French Fries")');
    await page.click('.pcard:has-text("Cold Drink 500ml")');
    await shot('07-pos-cart');
    await page.keyboard.press('F9');
    await page.waitForSelector('text=Total Payable');
    await page.fill('.modal input.input.lg', '2000');
    await shot('08-payment');
    await page.keyboard.press('Enter');
    await page.waitForSelector('text=completed');
    await page.waitForTimeout(1500);
    await shot('09-after-sale');
  });
  await step('barcode scan', async () => {
    await page.fill('.pos-search input', '8961008210012');
    await page.keyboard.press('Enter');
    await page.waitForSelector('.citem:has-text("Cold Drink 500ml")');
  });
  await step('delivery requires customer', async () => {
    await page.click('.cart-head .seg button:has-text("Delivery")');
    await page.waitForSelector('.modal:has-text("Delivery Customer")');
    const inputs = page.locator('.modal .form-grid input');
    await inputs.nth(0).fill('Ali Raza');
    await inputs.nth(1).fill('03001112233');
    await page.fill('.modal textarea', 'House 5, Model Town, Lahore');
    await page.click('.modal button:has-text("Save")');
    await page.keyboard.press('F9');
    await page.waitForSelector('text=Total Payable');
    await page.keyboard.press('Enter');
    await page.waitForSelector('text=completed');
  });
  await step('dine-in table hold', async () => {
    await page.click('.cart-head .seg button:has-text("Dine-In")');
    await page.waitForSelector('.modal:has-text("Select Table")');
    await page.click('.modal .tcard:has-text("Table 3")');
    await page.click('.pcard:has-text("Chicken Biryani")');
    await page.click('.pcard:has-text("Lassi")');
    await page.keyboard.press('F8');
    await page.waitForSelector('text=Order saved to Table 3');
  });
  await step('tables page and reopen', async () => {
    await page.click('a[href="#/tables"]');
    await page.waitForSelector('.tcard.occupied');
    await shot('10-tables');
    await page.click('.tcard.occupied');
    await page.waitForSelector('text=Editing');
    await shot('11-pos-dinein-edit');
    await page.keyboard.press('F9');
    await page.waitForSelector('text=Total Payable');
    await page.keyboard.press('Enter');
    await page.waitForSelector('text=completed');
  });
  await step('orders', async () => { await page.click('a[href="#/orders"]'); await page.waitForSelector('table.table'); await shot('12-orders'); await page.click('table.table tbody tr >> nth=0'); await page.waitForSelector('.modal'); await shot('13-order-detail'); await page.keyboard.press('Escape'); });
  await step('dashboard', async () => { await page.click('a[href="#/dashboard"]'); await page.waitForSelector('text=Today\'s Sales'); await shot('14-dashboard'); });
  await step('products', async () => { await page.click('a[href="#/products"]'); await page.waitForSelector('table.table'); await shot('15-products'); await page.click('button:has-text("Add Product")'); await shot('16-product-form'); await page.keyboard.press('Escape'); });
  await step('categories', async () => { await page.click('a[href="#/categories"]'); await shot('17-categories'); });
  await step('customers', async () => { await page.click('a[href="#/customers"]'); await page.waitForSelector('table.table'); await shot('18-customers'); });
  await step('tokens', async () => { await page.click('a[href="#/tokens"]'); await page.waitForTimeout(600); await shot('19-tokens'); });
  await step('inventory', async () => { await page.click('a[href="#/inventory"]'); await page.waitForTimeout(600); await shot('20-inventory'); });
  await step('reports', async () => { await page.click('a[href="#/reports"]'); await page.waitForSelector('table.table'); await shot('21-reports-sales'); await page.click('button.nav-item:has-text("Product Sales")'); await page.waitForTimeout(500); await shot('22-reports-products'); });
  await step('users', async () => { await page.click('a[href="#/users"]'); await page.waitForTimeout(500); await shot('23-users'); });
  await step('backup', async () => { await page.click('a[href="#/settings"]'); await page.click('.tabs button:has-text("Backup")'); await page.click('button:has-text("Backup now")'); await page.waitForSelector('text=Backup saved'); await shot('24-backup'); });
  await step('license tab', async () => { await page.click('.tabs button:has-text("License")'); await shot('25-license'); });

  await step('hold / running module', async () => {
    // hold a takeaway order from POS, then retrieve it
    await page.click('a[href="#/pos"]');
    await page.waitForSelector('.pcard');
    await page.click('.cart-head .seg button:has-text("Takeaway")');
    await page.click('.pcard:has-text("Lassi")');
    await page.keyboard.press('F8');
    await page.waitForSelector('text=held');
    await page.click('a[href="#/held"]');
    await page.waitForSelector('.held-card:has-text("Takeaway")');
    await shot('12b-held');
    await page.click('.held-card:has-text("Takeaway") button:has-text("Retrieve")');
    await page.waitForSelector('.citem:has-text("Lassi")');
  });
  await step('print pipeline writes an ESC/POS job (no blank top)', async () => {
    const dump = path.join(ud, 'prints');
    const before = fs.existsSync(dump) ? fs.readdirSync(dump).length : 0;
    await page.click('a[href="#/orders"]');
    await page.waitForSelector('table.table');
    await page.click('table.table tbody tr:has-text("Completed") >> nth=0');
    await page.waitForSelector('.modal');
    await page.click('.modal button:has-text("Reprint")');
    await page.waitForSelector('text=Receipt sent to printer');
    const files = fs.readdirSync(dump);
    if (files.length <= before) throw new Error('no print job written');
    const escpos = require('../electron/printing/escpos');
    const j = escpos.decodeJob(fs.readFileSync(path.join(dump, files[files.length - 1])));
    if (j.cuts !== 1 || j.width !== 384 && j.width !== 576) throw new Error(`bad job ${j.width}x${j.height} cuts ${j.cuts}`);
    // first printed row must contain ink within the first few millimetres (no blank feed at the top)
    let firstInk = j.rows.findIndex((r) => r.some((b) => b !== 0));
    if (firstInk > 24) throw new Error(`blank space at top: ${firstInk} rows`);
    await page.keyboard.press('Escape');
  });
  await step('bulk menu import (xlsx), bulk pictures by file name, deal creation', async () => {
    const { reportToXlsx } = require('../electron/printing/xlsx');
    const xlsx = reportToXlsx({
      title: 'Menu',
      columns: [{ key: 'name', label: 'Name' }, { key: 'category', label: 'Category' }, { key: 'sale_price', label: 'Price', type: 'number' }],
      rows: [{ name: 'Zinger Burger', category: 'Burgers', sale_price: 470 }, { name: 'Paneer Tikka Roll', category: 'Rolls', sale_price: 320 }, { name: 'Mango Shake', category: 'Drinks', sale_price: 250 }],
    });
    const xfile = path.join(ud, 'menu.xlsx');
    fs.writeFileSync(xfile, xlsx);
    await page.click('a[href="#/products"]');
    await page.waitForSelector('table.table');
    await page.click('button:has-text("Import Excel")');
    await page.setInputFiles('.modal input[type=file]', xfile);
    await page.waitForSelector('.modal .badge:has-text("2 new")');
    await shot('50-import-preview');
    await page.click('.modal button:has-text("Import 3 items")');
    await page.waitForSelector('.modal:has-text("2 added · 1 updated")');
    await page.click('.modal button:has-text("Done")');
    // pictures: names match items (one with different case / separators, one unknown)
    const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');
    const pics = ['zinger-burger.png', 'PANEER TIKKA ROLL.png', 'mango_shake.png', 'mystery dish.png'].map((n) => { const f = path.join(ud, n); fs.writeFileSync(f, png); return f; });
    await page.click('button:has-text("Bulk pictures")');
    await page.setInputFiles('.modal input[type=file][multiple]:not([webkitdirectory])', pics);
    await page.waitForSelector('.modal .badge:has-text("3 matched")');
    await shot('51-bulk-pictures');
    await page.click('.modal button:has-text("Add 3 pictures")');
    await page.waitForSelector('text=3 pictures added');
    const list = await page.evaluate(() => window.pos.invoke('products.list', {}));
    const withImg = list.data.filter((p) => p.has_image).map((p) => p.name).sort();
    if (!['Mango Shake', 'Paneer Tikka Roll', 'Zinger Burger'].every((n) => withImg.includes(n))) throw new Error('pictures not attached: ' + withImg);
    // deal
    await page.click('button:has-text("Create Deal")');
    await page.fill('.modal input[placeholder^="e.g. Family Deal"]', 'Burger Combo');
    await page.fill('.modal input[placeholder="0"]', '600');
    for (const n of ['Zinger Burger', 'Mango Shake']) {
      await page.fill('.modal input[placeholder^="Search menu items"]', n);
      await page.click(`.modal button:has-text("${n}")`);
    }
    await shot('52-deal-form');
    await page.click('.modal button:has-text("Save Deal")');
    await page.waitForSelector('text=Deal created');
    await page.click('a[href="#/pos"]');
    await page.waitForSelector('.pcard .deal-badge');
    await shot('53-pos-deal');
    await page.click('.pcard:has(.deal-badge)');
    await page.waitForSelector('.citem:has-text("Burger Combo")');
    await page.click('button:has-text("Clear")').catch(() => {});
  });
  await step('table management: floors, transfer, merge, split, free, history', async () => {
    const inv = async (m, a) => { const r = await page.evaluate(([mm, aa]) => window.pos.invoke(mm, aa), [m, a]); if (!r.ok) throw new Error(`${m}: ${r.error && r.error.message}`); return r.data; };
    const f = await inv('tables.floorSave', { name: 'Ground Floor' });
    await inv('tables.floorSave', { name: 'Garden' });
    const tl = await inv('tables.list');
    await inv('tables.assignFloor', { ids: tl.slice(0, 4).map((t) => t.id), floorId: f });
    const prod = (await inv('products.list', {}))[0];
    const hold = (t) => inv('orders.save', { orderType: 'dine_in', action: 'hold', tableId: t.id, items: [{ productId: prod.id, qty: 2, unitPrice: prod.sale_price }] });
    await hold(tl[0]); await hold(tl[1]);
    await page.click('a[href="#/tables"]');
    await page.waitForSelector('.tcard.occupied');
    await page.click('.chip:has-text("Ground Floor")');
    await shot('40-tables-floors');
    // transfer
    await page.click(`.tcard.occupied:has-text("${tl[0].name}") button:has-text("Move")`);
    await page.click(`.modal .tcard.available:has-text("${tl[5].name}")`);
    await shot('41-transfer');
    await page.click('.modal button:has-text("Move bill here")');
    await page.waitForSelector(`text=Bill moved to ${tl[5].name}`);
    // merge
    await page.click('.chip:has-text("All floors")');
    await page.click(`.tcard.occupied:has-text("${tl[1].name}") button:has-text("Merge")`);
    await page.click(`.modal .tcard.occupied:has-text("${tl[5].name}")`);
    await shot('42-merge');
    await page.click('.modal button:has-text("Merge 1 bill")');
    await page.waitForSelector('text=Merged');
    // split
    await page.click(`.tcard.occupied:has-text("${tl[1].name}") button:has-text("Split")`);
    await page.waitForSelector('.modal:has-text("Choose items to move")');
    await page.click('.modal .row:has-text("×") button >> nth=1');
    await page.click(`.modal .tcard.available >> nth=0`);
    await shot('43-split');
    await page.click('.modal button:has-text("Create new bill")');
    await page.waitForSelector('text=New bill created');
    await shot('44-tables-after-split');
    // free
    const occ = await page.locator('.tcard.occupied').count();
    await page.locator('.tcard.occupied').first().locator('button[title^="Free this table"]').click();
    await page.click('.modal button:has-text("Free table")');
    await page.waitForFunction((n) => document.querySelectorAll('.tcard.occupied').length === n - 1, occ);
    // history
    await page.click('.tabs button:has-text("Dine-in history")');
    await page.waitForSelector('table.table');
    await shot('45-dine-history');
  });
  await step('payments: bank account setup + bank sale stores the account', async () => {
    await page.click('a[href="#/settings"]');
    await page.click('.tabs button:has-text("Payments")');
    await page.click('button:has-text("Add bank account")');
    const inputs = page.locator('.card .form-grid input.input');
    await inputs.nth(0).fill('Meezan Bank');
    await inputs.nth(1).fill('Sample Restaurant');
    await inputs.nth(2).fill('0123456789');
    await page.click('text=Print bank account details on receipts');
    await page.click('button:has-text("Save changes")');
    await page.waitForSelector('text=Settings saved');
    await shot('46-bank-settings');
    await page.click('a[href="#/pos"]');
    await page.waitForSelector('.pcard');
    await page.click('.cart-head .seg button:has-text("Takeaway")');
    await page.click('.pcard >> nth=0');
    await page.keyboard.press('F9');
    await page.waitForSelector('text=Total Payable');
    await page.click('.method:has-text("Bank")');
    await page.waitForSelector('text=Paid into account');
    await shot('47-pay-bank');
    await page.keyboard.press('Enter');
    await page.waitForTimeout(1500);
    const list = await page.evaluate(() => window.pos.invoke('orders.list', { status: 'completed', limit: 10 }));
    let found = false;
    for (const row of list.data) {
      const full = await page.evaluate((id) => window.pos.invoke('orders.get', { id }), row.id);
      if (/Meezan Bank/.test(full.data.payment_bank || '')) found = true;
    }
    if (!found) throw new Error('bank account not saved on the sale');
  });
  await step('every receipt design has balanced left/right margins (58 + 80mm)', async () => {
    const dump = path.join(ud, 'prints');
    const escpos = require('../electron/printing/escpos');
    const inv = async (m, a) => {
      const res = await page.evaluate(([mm, aa]) => window.pos.invoke(mm, aa), [m, a]);
      if (!res.ok) throw new Error(`${m}: ${res.error && res.error.message}`);
      return res.data;
    };
    const all = await inv('settings.getAll');
    const templates = await inv('print.templates');
    const bad = [];
    for (const width of [80, 58]) {
      for (const t of templates) {
        await inv('settings.set', { section: 'receipt', values: { ...all.receipt, template: t.key, paperWidth: width } });
        const before = fs.readdirSync(dump).length;
        await inv('print.test', { kind: 'receipt' });
        const files = fs.readdirSync(dump).map((f) => ({ f, t: fs.statSync(path.join(dump, f)).mtimeMs })).sort((a, b) => a.t - b.t);
        if (files.length <= before) throw new Error('no job for ' + t.key);
        const j = escpos.decodeJob(fs.readFileSync(path.join(dump, files[files.length - 1].f)));
        let minX = j.width, maxX = -1;
        for (const r of j.rows) for (let x = 0; x < j.width; x++) if (r[x >> 3] & (0x80 >> (x & 7))) { if (x < minX) minX = x; if (x > maxX) maxX = x; }
        const left = minX, right = j.width - 1 - maxX;
        if (Math.abs(left - right) > 12 || left < 1 || right < 1) bad.push(`${t.key}@${width}: left ${left} right ${right}`);
      }
    }
    await inv('settings.set', { section: 'receipt', values: all.receipt });
    if (bad.length) throw new Error('unbalanced: ' + bad.join('; '));
  });
  await step('80mm report preview + print', async () => {
    await page.click('a[href="#/reports"]');
    await page.waitForSelector('table.table');
    await page.click('.seg button:has-text("80mm")');
    await page.click('button:has-text("Preview")');
    await page.waitForSelector('iframe.preview-frame');
    await page.waitForTimeout(700);
    await shot('21b-report-80mm-preview');
    await page.keyboard.press('Escape');
    await page.click('button:has-text("Print 80mm")');
    await page.waitForSelector('text=Sent to printer');
  });
  await step('appearance: switch themes', async () => {
    await page.click('a[href="#/settings"]');
    await page.click('.tabs button:has-text("Appearance")');
    await page.waitForSelector('.theme-card');
    await shot('27-appearance-royal');
    for (const [name, file] of [['Crimson', '28-theme-crimson'], ['Black & Gold', '29-theme-gold']]) {
      await page.click(`.theme-card:has-text("${name}")`);
      await page.waitForTimeout(300);
      await shot(file);
    }
    await page.click('.theme-card:has-text("Crimson")');
    await page.click('button:has-text("Save changes")');
    await page.waitForSelector('text=Settings saved');
    if ((await page.evaluate(() => document.documentElement.dataset.theme)) !== 'crimson') throw new Error('theme not applied');
    await page.click('.theme-card:has-text("Royal")');
    await page.click('button:has-text("Save changes")');
    await page.waitForSelector('text=Settings saved');
  });
  await step('printer settings: thermal method', async () => {
    await page.click('.tabs button:has-text("Printers")');
    await page.waitForSelector('text=Print method');
    await shot('30-printers');
  });
  await step('cashier restricted', async () => {
    await page.click('.user-chip button');
    await page.click('.modal button:has-text("Log out")');
    await page.waitForSelector('text=Welcome back');
    await page.click('.user-tile:has-text("Cashier")');
    for (const d of '1111') await page.click(`.pinpad button:text-is("${d}")`);
    await page.waitForSelector('.sidebar');
    const nav = await page.locator('.nav-item .nav-label').allTextContents();
    console.log('     cashier nav:', nav.join(', '));
    if (nav.includes('Settings') || nav.includes('Users') || nav.includes('Reports')) throw new Error('cashier sees admin modules');
    await shot('26-cashier');
  });
  console.log('ERRORS:', errors.length ? errors : 'none');
  await app.close();
  if (failed || errors.length) process.exit(1);
})().catch((e) => { console.error(e); process.exit(1); });
