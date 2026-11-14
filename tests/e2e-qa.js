// Final QA sweep (real Electron app, simulated Bluetooth printer):
//   Restaurant mode set-up -> demo -> every page and every Settings tab opens without errors ->
//   raw item Stock In from the UI -> recipe visible -> a dish sale deducts raw stock ->
//   token OFF prints a KOT (and not when the KOT switch is off) -> cashier is refused admin actions ->
//   factory reset unlocks the inventory type again.
// Run: npm run build && xvfb-run -a node tests/e2e-qa.js
const { _electron } = require('playwright-core');
const path = require('path');
const fs = require('fs');
const os = require('os');
const escpos = require('../electron/printing/escpos');
const DESK = path.join(__dirname, '..');
const SHOTS = path.join(__dirname, '.e2e-shots');
fs.mkdirSync(SHOTS, { recursive: true });
const ud = fs.mkdtempSync(path.join(os.tmpdir(), 'rpos-qa-'));
const fake = fs.mkdtempSync(path.join(os.tmpdir(), 'rpos-qa-prn-'));
fs.writeFileSync(path.join(fake, 'bt.json'), JSON.stringify([{ address: 'DC0D30A1B2C3', name: 'PT-210_3DCC', cod: 0x1f00 }]));
fs.writeFileSync(path.join(fake, 'ports.json'), '[]');
fs.writeFileSync(path.join(fake, 'usb.json'), '[]');

let failed = false;

(async () => {
  const app = await _electron.launch({
    executablePath: require('electron'),
    args: [...(process.platform === 'linux' ? ['--no-sandbox'] : []), DESK],
    env: { ...process.env, RPOS_USER_DATA: ud, RPOS_FAKE_PRINTERS: fake },
  });
  const errors = [];
  const isMain = (w) => !/splash\.html/.test(w.url());
  let page = app.windows().find(isMain);
  if (!page) page = await app.waitForEvent('window', { predicate: isMain, timeout: 30000 });
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => m.type() === 'error' && errors.push('console: ' + m.text()));
  await page.setViewportSize({ width: 1366, height: 768 });
  const shot = async (n) => { await page.waitForTimeout(300); await page.screenshot({ path: path.join(SHOTS, n + '.png') }); };
  const step = async (name, fn) => { try { await fn(); console.log('OK  ', name); } catch (e) { failed = true; console.log('FAIL', name, e.message.split('\n').slice(0, 3).join(' | ')); await shot('fail-qa-' + name.replace(/\W+/g, '_').slice(0, 60)); } };
  const call = (m, a) => page.evaluate(([mm, aa]) => window.pos.invoke(mm, aa), [m, a || {}]);
  const inv = async (m, a) => { const r = await call(m, a); if (!r.ok) throw new Error(`${m}: ${r.error && r.error.message}`); return r.data; };
  const comFile = () => { const p = JSON.parse(fs.readFileSync(path.join(fake, 'ports.json'), 'utf8')).find((x) => x.kind === 'bluetooth'); return p ? path.join(fake, `${p.port}.bin`) : null; };
  const comCuts = () => { const f = comFile(); return f && fs.existsSync(f) ? escpos.decodeJob(fs.readFileSync(f)).cuts : 0; };
  const loginAs = async (tile, pin) => {
    await page.click(`.user-tile:has-text("${tile}")`);
    for (const d of pin) await page.click(`.pinpad button:text-is("${d}")`);
    await page.waitForSelector('.sidebar');
  };
  const logout = async () => { await page.click('.user-chip button'); await page.click('.modal button:has-text("Log out")'); await page.waitForSelector('text=Welcome back'); };
  const noCrash = async (label) => {
    if ((await page.locator('text=Something went wrong').count()) > 0) throw new Error(`${label}: error screen`);
  };

  await page.waitForSelector('text=Welcome back');
  await page.waitForTimeout(1500);

  await step('admin login', async () => { await loginAs('Administrator', '1234'); });

  await step('Inventory: choose Restaurant (locks), then load the demo (raw items + recipes arrive)', async () => {
    await page.click('a[href="#/inventory"]');
    await page.waitForSelector('text=What kind of business is the inventory for?');
    await page.click('.inv-mode-opt:has-text("Restaurant")');
    await page.click('button:has-text("Save & lock this choice")');
    await page.click('.modal button:has-text("Save & lock")');
    await page.waitForSelector('text=Inventory type set to');
    await page.click('a[href="#/settings"]');
    await page.click('.tabs button:has-text("General")');
    await page.click('button:has-text("Load demo data")');
    await page.click('.modal button:has-text("Continue")');
    await page.waitForSelector('text=Demo data loaded');
    const s = await inv('inventory.summary');
    if (s.mode !== 'restaurant' || s.products.length < 5) throw new Error('raw items missing: ' + s.products.length);
    if (s.products.some((p) => !p.is_ingredient)) throw new Error('a dish is listed as stock');
  });

  await step('sweep: every page opens without an error screen or console error', async () => {
    const routes = ['dashboard', 'pos', 'held', 'orders', 'tables', 'products', 'categories', 'customers', 'tokens', 'inventory', 'reports', 'users', 'settings'];
    for (const r of routes) {
      await page.click(`a[href="#/${r}"]`);
      await page.waitForTimeout(700);
      await noCrash(r);
      await shot(`qa-page-${r}`);
    }
  });

  await step('sweep: every Settings tab opens (13 tabs)', async () => {
    await page.click('a[href="#/settings"]');
    const labels = await page.locator('.tabs button').allTextContents();
    if (labels.length < 13) throw new Error('tabs: ' + labels.length);
    for (let i = 0; i < labels.length; i++) {
      await page.locator('.tabs button').nth(i).click();
      await page.waitForTimeout(500);
      await noCrash(labels[i]);
      await shot(`qa-settings-${i}`);
    }
  });

  await step('Restaurant UI: raw item Stock In from the screen, no product stock column, recipe is visible', async () => {
    await page.click('a[href="#/inventory"]');
    await page.waitForSelector('table.table tbody tr');
    const first = page.locator('table.table tbody tr').first();
    const name = (await first.locator('td').first().innerText()).trim();
    const before = (await inv('inventory.summary')).products.find((p) => p.name === name).stock_qty;
    await first.locator('button:has-text("In")').first().click();
    await page.waitForSelector('.modal:has-text("Stock In")');
    await page.fill('.modal input >> nth=0', '5');
    await page.click('.modal-foot button.primary');
    await page.waitForFunction(() => document.querySelectorAll('.toast').length > 0);
    const after = (await inv('inventory.summary')).products.find((p) => p.name === name).stock_qty;
    if (Math.abs(after - before - 5) > 0.001) throw new Error(`stock ${before} -> ${after}`);
    await page.click('a[href="#/products"]');
    await page.waitForSelector('button:has-text("Add Product")'); // the Products page itself (not the Inventory table still on screen)
    await page.waitForSelector('table.table tbody tr:has-text("Chicken Biryani")');
    const heads = await page.locator('table.table thead th').allTextContents();
    if (heads.some((h) => /^stock$/i.test(h.trim()))) throw new Error('product list still has a Stock column');
    await page.click('table.table tbody tr:has-text("Chicken Biryani")');
    await page.waitForSelector('.modal');
    const txt = await page.locator('.modal').innerText();
    if (!/Recipe management/.test(txt) || !/Chicken/.test(txt)) throw new Error('recipe not shown');
    await shot('qa-recipe');
    await page.keyboard.press('Escape');
  });

  await step('a dish sold on the POS takes its raw items out of stock', async () => {
    await inv('settings.set', { section: 'inventory', values: { ...(await inv('settings.getAll')).inventory, enabled: true } });
    const total = async () => (await inv('inventory.summary')).products.reduce((s, p) => s + p.stock_qty, 0);
    const before = await total();
    await page.click('a[href="#/pos"]');
    await page.waitForSelector('.pcard');
    await page.fill('input[placeholder^="Search product"]', 'Chicken Biryani');
    await page.click('.pcard:has-text("Chicken Biryani") >> nth=0');
    await page.keyboard.press('F9');
    await page.waitForSelector('text=Total Payable');
    await page.fill('.modal input.input.lg', '5000');
    await page.keyboard.press('Enter');
    await page.waitForSelector('text=completed');
    await page.waitForTimeout(800);
    const after = await total();
    if (!(after < before)) throw new Error(`raw stock unchanged: ${before} -> ${after}`);
  });

  await step('token OFF: a takeaway sale prints receipt + KOT; with the KOT switch off only the receipt', async () => {
    const sc = await inv('printers.btScan');
    const dev = sc.find((d) => d.name === 'PT-210_3DCC');
    const r = await inv('printers.btPair', { address: dev.address });
    if (!r.printer) throw new Error('no COM printer after pairing');
    const all = await inv('settings.getAll');
    await inv('settings.set', { section: 'printer', values: { ...all.printer, receiptPrinter: r.printer, tokenPrinter: '', autoPrintReceipt: true, autoPrintToken: true } });
    const sell = async () => {
      await page.click('a[href="#/pos"]');
      await page.waitForSelector('.pcard');
      await page.fill('input[placeholder^="Search product"]', 'Beef Burger');
      await page.click('.pcard:has-text("Beef Burger") >> nth=0');
      await page.keyboard.press('F9');
      await page.waitForSelector('text=Total Payable');
      await page.fill('.modal input.input.lg', '5000');
      await page.keyboard.press('Enter');
      await page.waitForSelector('text=completed');
      await page.waitForTimeout(3000);
    };
    const tk = (await inv('settings.getAll')).token;
    await inv('settings.set', { section: 'token', values: { ...tk, enabled: false, kotWhenOff: true } });
    await page.reload(); await page.waitForSelector('.sidebar');
    let c0 = comCuts(); await sell(); const withKot = comCuts() - c0;
    await inv('settings.set', { section: 'token', values: { ...tk, enabled: false, kotWhenOff: false } });
    await page.reload(); await page.waitForSelector('.sidebar');
    c0 = comCuts(); await sell(); const noKot = comCuts() - c0;
    if (withKot !== 2) throw new Error(`token off + KOT on: expected receipt + KOT (2 slips), got ${withKot}`);
    if (noKot !== 1) throw new Error(`token off + KOT off: expected only the receipt (1 slip), got ${noKot}`);
  });

  await step('cashier: cannot change settings, inventory type or pair printers', async () => {
    await logout();
    await loginAs('Cashier', '1111');
    for (const [m, a] of [['inventory.setMode', { mode: 'retail' }], ['printers.btPair', { address: 'DC0D30A1B2C3' }], ['printers.installUsb', { port: 'USB001' }], ['settings.set', { section: 'sales', values: {} }], ['data.factoryReset', {}]]) {
      const r = await call(m, a);
      if (r.ok) throw new Error(`cashier was allowed: ${m}`);
    }
    const nav = await page.locator('.nav-item .nav-label').allTextContents();
    if (nav.includes('Settings') || nav.includes('Users')) throw new Error('cashier sees admin modules');
    await logout();
    await loginAs('Administrator', '1234');
  });

  await step('Factory reset: the Retail / Restaurant choice is offered again', async () => {
    await page.click('a[href="#/settings"]');
    await page.click('.tabs button:has-text("General")');
    await page.click('button:has-text("Factory reset")');
    await page.click('.modal button:has-text("Continue")');
    await page.waitForSelector('text=Data reset');
    await page.click('a[href="#/inventory"]');
    await page.waitForSelector('text=What kind of business is the inventory for?');
    const st = (await inv('settings.getAll')).inventory;
    if (st.mode !== '' || st.modeLocked) throw new Error('mode still locked after a factory reset');
    await shot('qa-after-reset');
  });

  console.log('ERRORS:', errors.length ? errors : 'none');
  await app.close();
  if (failed || errors.length) process.exit(1);
})().catch((e) => { console.error(e); process.exit(1); });
