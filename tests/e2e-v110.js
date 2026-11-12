// v1.10 features, driven through the real UI of the Electron app:
//   Add a printer (simulated Bluetooth pairing -> COM port -> bytes arrive), USB driver install (simulated),
//   Help guide (English / Urdu font), Retail vs Restaurant inventory mode, "khula sauda" open rate,
//   token items (roti) and a required / typed rider.
// Run: npm run build && xvfb-run -a node tests/e2e-v110.js      (real Bluetooth / USB hardware is not involved)
const { _electron } = require('playwright-core');
const path = require('path');
const fs = require('fs');
const os = require('os');
const escpos = require('../electron/printing/escpos');
const DESK = path.join(__dirname, '..');
const SHOTS = path.join(__dirname, '.e2e-shots');
fs.mkdirSync(SHOTS, { recursive: true });
const ud = fs.mkdtempSync(path.join(os.tmpdir(), 'rpos-v110-'));
const fake = fs.mkdtempSync(path.join(os.tmpdir(), 'rpos-fakeprn-'));
fs.writeFileSync(path.join(fake, 'bt.json'), JSON.stringify([
  { address: 'AA:BB:CC:00:11:22', name: 'Living room speaker', cod: 0x240404 },
  { address: 'DC:0D:30:A1:B2:C3', name: 'BlueTooth Printer', cod: 0x1f00, pin: '1234' },
]));
fs.writeFileSync(path.join(fake, 'ports.json'), '[]');
fs.writeFileSync(path.join(fake, 'usb.json'), JSON.stringify([{ port: 'USB001', description: 'Virtual printer port for USB', hasPrinter: false }]));

let failed = false;

(async () => {
  const app = await _electron.launch({
    executablePath: require('electron'),
    args: [...(process.platform === 'linux' ? ['--no-sandbox'] : []), DESK],
    // no RPOS_PRINT_DUMP here: jobs really go to the (simulated) COM port
    env: { ...process.env, RPOS_USER_DATA: ud, RPOS_FAKE_PRINTERS: fake },
  });
  const errors = [];
  const isMain = (w) => !/splash\.html/.test(w.url());
  let page = app.windows().find(isMain);
  if (!page) page = await app.waitForEvent('window', { predicate: isMain, timeout: 30000 });
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => m.type() === 'error' && errors.push('console: ' + m.text()));
  await page.setViewportSize({ width: 1366, height: 768 });
  const shot = async (n) => { await page.waitForTimeout(400); await page.screenshot({ path: path.join(SHOTS, n + '.png') }); };
  const step = async (name, fn) => { try { await fn(); console.log('OK  ', name); } catch (e) { failed = true; console.log('FAIL', name, e.message.split('\n').slice(0, 3).join(' | ')); await shot('fail-' + name.replace(/\W+/g, '_')); } };
  const inv = async (m, a) => { const r = await page.evaluate(([mm, aa]) => window.pos.invoke(mm, aa), [m, a || {}]); if (!r.ok) throw new Error(`${m}: ${r.error && r.error.message}`); return r.data; };
  const comFile = () => {
    const ports = JSON.parse(fs.readFileSync(path.join(fake, 'ports.json'), 'utf8'));
    const p = ports.find((x) => x.kind === 'bluetooth');
    return p ? path.join(fake, `${p.port}.bin`) : null;
  };
  const comCuts = () => { const f = comFile(); return f && fs.existsSync(f) ? escpos.decodeJob(fs.readFileSync(f)).cuts : 0; };
  const login = async () => {
    await page.click('.user-tile');
    for (const d of '1234') await page.click(`.pinpad button:text-is("${d}")`);
    await page.waitForSelector('.sidebar');
  };

  await page.waitForSelector('text=Welcome back');
  await page.waitForTimeout(1600);
  await step('login + load demo data', async () => {
    await login();
    await page.click('a[href="#/settings"]');
    await page.click('.tabs button:has-text("General")');
    await page.click('button:has-text("Load demo data")');
    await page.click('.modal button:has-text("Continue")');
    await page.waitForSelector('text=Demo data loaded');
  });

  // ---------------------------------------------------------------- printers
  await step('Add a printer: Bluetooth search -> pair -> test print arrives on the COM port', async () => {
    await page.click('.tabs button:has-text("Printers")');
    await page.click('button:has-text("Add a printer")');
    await page.waitForSelector('.modal:has-text("Add a printer")');
    await page.click('.modal button:has-text("Search for Bluetooth printers")');
    await page.waitForSelector('.add-printer-row:has-text("BlueTooth Printer")');
    await shot('v110-01-bt-search');
    const rows = await page.locator('.add-printer-row').allTextContents();
    if (!rows[0].includes('BlueTooth Printer')) throw new Error('printers must be listed first: ' + rows.join(' | '));
    await page.click('.add-printer-row:has-text("BlueTooth Printer") button:has-text("Pair")');
    await page.waitForSelector('.add-printer-result:has-text("paired and ready")');
    await shot('v110-02-bt-paired');
    await page.click('.add-printer-result button:has-text("Test print")');
    await page.waitForSelector('text=Test page printed');
    const f = comFile();
    if (!f || !fs.existsSync(f) || fs.statSync(f).size < 500) throw new Error('nothing arrived on the COM port');
    const j = escpos.decodeJob(fs.readFileSync(f));
    if (j.cuts !== 1 || (j.width !== 384 && j.width !== 576)) throw new Error(`bad job ${j.width}x${j.height} cuts ${j.cuts}`);
    await page.click('.add-printer-result button:has-text("Use for receipts")');
    await page.waitForSelector('.add-printer-result button:has-text("Receipt printer ✓")');
    // with no separate kitchen printer chosen, the kitchen already shows as the same printer
    await page.waitForSelector('.add-printer-result button:has-text("Kitchen printer ✓")');
    const pr = await inv('settings.getAll');
    if (!/^serial:COM\d+$/.test(pr.printer.receiptPrinter) || (pr.printer.tokenPrinter && pr.printer.tokenPrinter !== pr.printer.receiptPrinter)) throw new Error('printers not saved: ' + pr.printer.receiptPrinter);
    await page.keyboard.press('Escape');
    await page.waitForSelector('.modal', { state: 'detached' });
    // the COM printer is offered in the dropdown and the status pill is ready
    const labels = await page.locator('select option').allTextContents();
    if (!labels.some((l) => /COM\d+ · BlueTooth Printer \(Bluetooth, direct\)/.test(l))) throw new Error('COM printer missing in the printer list');
    await page.click('button:has-text("Verify printers")');
    await page.waitForSelector('text=answered and is ready');
    await shot('v110-03-printers');
  });

  await step('a normal sale prints its receipt on the COM printer', async () => {
    const before = comCuts();
    await page.click('a[href="#/pos"]');
    await page.waitForSelector('.pcard');
    await page.click('.pcard:has-text("Zinger Burger")');
    await page.keyboard.press('F9');
    await page.waitForSelector('text=Total Payable');
    await page.fill('.modal input.input.lg', '5000');
    await page.keyboard.press('Enter');
    await page.waitForSelector('text=completed');
    await page.waitForTimeout(2500);
    if (comCuts() <= before) throw new Error('no receipt reached the COM port');
  });

  await step('Add a printer: USB without a driver -> built-in driver installed', async () => {
    await page.click('a[href="#/settings"]');
    await page.click('.tabs button:has-text("Printers")');
    await page.click('button:has-text("Add a printer")');
    await page.click('.modal .seg button:has-text("USB")');
    await page.waitForSelector('.add-printer-row:has-text("USB001")');
    await page.fill('.add-printer-row:has-text("USB001") input', 'Counter 58mm');
    await shot('v110-04-usb');
    await page.click('.add-printer-row:has-text("USB001") button:has-text("Install")');
    await page.waitForSelector('.add-printer-result:has-text("Counter 58mm")');
    const usb = JSON.parse(fs.readFileSync(path.join(fake, 'usb.json'), 'utf8'));
    if (!usb[0].hasPrinter) throw new Error('driver not installed');
    await page.keyboard.press('Escape');
  });

  // ---------------------------------------------------------------- help guide
  await step('Help guide: English, Urdu Nastaliq font, search, FAQ', async () => {
    await page.click('a[href="#/settings"]');
    await page.click('.tabs button:has-text("Support")');
    await page.waitForSelector('.help');
    const topics = await page.locator('.help-index button').count();
    if (topics < 20) throw new Error('only ' + topics + ' entries');
    await page.click('.help-index button:has-text("Connecting printers")');
    await page.waitForSelector('.help-article:has-text("Add a printer")');
    await shot('v110-05-help-en');
    await page.click('.help-head .seg button:has-text("اردو")');
    await page.waitForSelector('.help.ur');
    await page.waitForSelector('.help-article h3.urdu');
    const fontOk = await page.evaluate(async () => {
      await document.fonts.load('16px "Noto Nastaliq Urdu"', 'اردو');
      const dir = document.querySelector('.help').getAttribute('dir');
      const fam = getComputedStyle(document.querySelector('.help-article h3.urdu')).fontFamily;
      return { loaded: document.fonts.check('16px "Noto Nastaliq Urdu"', 'اردو'), dir, fam };
    });
    if (!fontOk.loaded || fontOk.dir !== 'rtl' || !/Jameel Noori Nastaleeq/.test(fontOk.fam)) throw new Error('urdu font: ' + JSON.stringify(fontOk));
    await shot('v110-06-help-ur');
    await page.fill('.help-search input', 'khula');
    await page.waitForSelector('.help-index button:has-text("کھلا سودا")');
    await page.fill('.help-search input', 'zzzzqq');
    await page.waitForSelector('.help-none');
    await page.fill('.help-search input', '');
    await page.click('.help-index button:has-text("اکثر پوچھے")');
    await page.waitForSelector('.help-faq-item');
    await shot('v110-07-help-faq-ur');
    await page.click('.help-head .seg button:has-text("English")');
    await page.waitForSelector('.help:not(.ur)');
    await page.click('.seg button:has-text("Message provider")');
    await page.waitForSelector('text=Messages with your provider');
  });

  // ---------------------------------------------------------------- restaurant mode
  await step('Inventory: Restaurant mode is chosen once and locks; raw items replace product stock', async () => {
    await page.click('a[href="#/inventory"]');
    await page.waitForSelector('text=What kind of business is the inventory for?');
    await shot('v110-08-inventory-mode');
    await page.click('.inv-mode-opt:has-text("Restaurant")');
    await page.click('button:has-text("Save & lock this choice")');
    await page.click('.modal button:has-text("Save & lock")');
    await page.waitForSelector('text=Inventory type set to');
    if ((await page.locator('text=What kind of business is the inventory for?').count()) !== 0) throw new Error('chooser still visible after locking');
    const st = (await inv('settings.getAll')).inventory;
    if (st.mode !== 'restaurant' || !st.modeLocked) throw new Error('mode not saved');
    // a second change is refused by the server (the UI offers none)
    const again = await page.evaluate(() => window.pos.invoke('inventory.setMode', { mode: 'retail' }));
    if (again.ok) throw new Error('mode changed after locking');
    await page.click('button:has-text("Add inventory item")');
    await page.fill('.modal input >> nth=0', 'Mutton');
    await page.click('.modal button:has-text("Save")');
    await page.waitForSelector('td:has-text("Mutton")');
    await shot('v110-09-raw-items');
    const sum = await inv('inventory.summary');
    if (sum.mode !== 'restaurant' || !sum.products.some((i) => i.name === 'Mutton')) throw new Error('raw item not listed');
  });

  // ---------------------------------------------------------------- khula sauda
  await step('Open rate ("khula sauda"): pick the item, type Rs 200, the bill shows it', async () => {
    const cats = await inv('categories.list');
    await inv('products.save', { name: 'Daal Sabzi', category_id: cats[0].id, sale_price: 150, unit: 'plate', open_price: true });
    await page.click('a[href="#/pos"]');
    await page.waitForSelector('.pcard');
    await page.fill('input[placeholder^="Search product"]', 'Daal Sabzi');
    await page.click('.pcard:has-text("Daal Sabzi")');
    await page.waitForSelector('.price-pad');
    await shot('v110-10-price-pad');
    await page.click('.price-pad button:text-is("200")');
    await page.click('.price-pad button:has-text("Add to cart")');
    await page.waitForSelector('.price-pad', { state: 'detached' });
    const line = await page.locator('.cart-line, .cline, .cart-items').first().innerText();
    if (!/Daal Sabzi/.test(line) || !/200/.test(line)) throw new Error('bill line: ' + line.replace(/\n/g, ' | '));
    await page.keyboard.press('F9');
    await page.waitForSelector('text=Total Payable');
    await page.fill('.modal input.input.lg', '500');
    await page.keyboard.press('Enter');
    await page.waitForSelector('text=completed');
    const list = await inv('orders.list', { limit: 5 });
    const o = await inv('orders.get', { id: list[0].id });
    const it = o.items.find((x) => x.name === 'Daal Sabzi');
    if (!it || Math.round(it.line_total ?? it.total ?? it.unit_price * it.qty) !== 200) throw new Error('saved line: ' + JSON.stringify(it));
  });

  // ---------------------------------------------------------------- token items
  await step('Token items: roti asks the quantity, prints ONE priced token, no receipt / KOT', async () => {
    const cats = await inv('categories.list');
    const roti = await inv('products.save', { name: 'Roti', category_id: cats[0].id, sale_price: 20, unit: 'roti' });
    const rotiId = roti.id || roti;
    const tok = (await inv('settings.getAll')).token;
    await inv('settings.set', { section: 'token', values: { ...tok, quickEnabled: true, quickProductIds: [rotiId], quickCategoryIds: [], quickOrderTypes: ['takeaway'] } });
    await page.reload(); // the signed-in session survives; settings are read again
    await page.waitForSelector('.sidebar');
    await page.click('a[href="#/pos"]');
    await page.waitForSelector('.pcard');
    await page.fill('input[placeholder^="Search product"]', 'Roti');
    await page.waitForSelector('.pcard:has-text("Roti") .token-badge');
    const before = comCuts();
    await page.click('.pcard:has-text("Roti")');
    await page.waitForSelector('.quick-token-pad');
    await page.click('.quick-token-pad button.wp-key:text-is("5")');
    await shot('v110-11-token-pad');
    const priceText = await page.locator('.quick-token-pad .wp-total').innerText();
    if (!/100/.test(priceText)) throw new Error('price should be 100: ' + priceText);
    await page.click('.quick-token-pad button:has-text("Print token")');
    await page.waitForSelector('.quick-token-pad', { state: 'detached' });
    await page.waitForTimeout(2500);
    const after = comCuts();
    if (after - before !== 1) throw new Error(`expected exactly 1 slip (the token), got ${after - before}`);
    const list = await inv('orders.list', { limit: 3 });
    const o = await inv('orders.get', { id: list[0].id });
    if (o.order_type !== 'takeaway' || !o.items.some((x) => x.name === 'Roti' && Number(x.qty) === 5)) throw new Error('token sale not recorded: ' + JSON.stringify({ t: o.order_type, i: o.items.map((x) => [x.name, x.qty]) }));
    if (Math.round(Number(o.total)) !== 100) throw new Error('total ' + o.total);
  });

  await step('Token items settings card: enable, order types, item chips', async () => {
    await page.click('a[href="#/settings"]');
    await page.click('.tabs button:has-text("Tokens")');
    await page.waitForSelector('text=Token items');
    await shot('v110-12-token-items-settings');
  });

  // ---------------------------------------------------------------- per head + service charge
  await step('Dine-in: per head (persons x rate) and a manual service charge on the bill', async () => {
    const sales = (await inv('settings.getAll')).sales;
    await inv('settings.set', { section: 'sales', values: { ...sales, enableDineIn: true, perHeadEnabled: true, perHeadRate: 100, serviceEnabled: true, serviceMode: 'percent', serviceValue: 10 } });
    await page.reload();
    await page.waitForSelector('.sidebar');
    await page.click('a[href="#/pos"]');
    await page.waitForSelector('.pcard');
    await page.click('.cart-head .seg button:has-text("Dine-In")');
    await page.waitForSelector('.modal:has-text("Select Table")');
    await page.click('.modal .tcard.available >> nth=0');
    await page.fill('input[placeholder^="Search product"]', 'Zinger');
    await page.click('.pcard:has-text("Zinger Burger")');
    await page.click('.cart-foot button:has-text("Per head")');
    await page.waitForSelector('.modal:has-text("per person")');
    await page.click('.modal button:text-is("3")');
    await shot('v110-15-per-head');
    await page.click('.modal button:has-text("Apply")');
    await page.click('.cart-foot button:has-text("Service")');
    await page.waitForSelector('.modal:has-text("Service charge")');
    await page.click('.modal button:text-is("10%")');
    await page.click('.modal button:has-text("Apply")');
    const foot = await page.locator('.cart-foot').innerText();
    if (!/Per head \(3 × 100\)/.test(foot) || !/Service charge \(10%\)/.test(foot) || !/795/.test(foot)) throw new Error('bill: ' + foot.replace(/\n/g, ' | '));
    await shot('v110-16-per-head-bill');
    await page.keyboard.press('F8');
    await page.waitForSelector('text=Order saved');
    const list = await inv('orders.pending', {});
    const row = list.find((x) => x.order_type === 'dine_in' && Math.round(x.total) === 795);
    const o = row && (await inv('orders.get', { id: row.id }));
    if (!o || o.cover_charge !== 300 || o.service_charge !== 45 || Math.round(o.total) !== 795) throw new Error('saved: ' + JSON.stringify(o && [o.covers, o.cover_charge, o.service_charge, o.total]));
  });

  // ---------------------------------------------------------------- rider
  await step('Delivery: rider is required, or typed by hand', async () => {
    await inv('settings.set', { section: 'sales', values: { ...(await inv('settings.getAll')).sales, requireRider: true, enableDelivery: true } });
    await page.reload(); // the signed-in session survives; settings are read again
    await page.waitForSelector('.sidebar');
    await page.click('a[href="#/pos"]');
    await page.waitForSelector('.pcard');
    await page.click('.cart-head .seg button:has-text("Delivery")');
    await page.waitForSelector('.modal:has-text("Delivery Customer")');
    const inputs = page.locator('.modal .form-grid input');
    await inputs.nth(0).fill('Sana');
    await inputs.nth(1).fill('03001234567');
    await page.fill('.modal textarea', 'House 5');
    await page.click('.modal button:has-text("Save")');
    await page.click('.pcard:has-text("Zinger Burger")');
    await page.keyboard.press('F8');
    await page.waitForSelector('text=Select the rider');
    await shot('v110-13-rider-required');
    await page.selectOption('.cart-head select', { value: '__type' });
    await page.fill('input[placeholder="Type the rider\'s name"]', 'Bashir (temporary)');
    await shot('v110-14-rider-typed');
    await page.keyboard.press('F8');
    await page.waitForSelector('text=held');
    const list = await inv('orders.pending', {});
    if (!list.some((o) => o.rider_name === 'Bashir (temporary)')) throw new Error('typed rider not saved');
  });

  console.log('ERRORS:', errors.length ? errors : 'none');
  await app.close();
  if (failed || errors.length) process.exit(1);
})().catch((e) => { console.error(e); process.exit(1); });
