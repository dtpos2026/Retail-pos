// Real licensing flow against a local fake of the Firestore REST API (no internet needed):
// first launch -> key download -> activate -> register device -> login -> admin suspends -> locked screen (no white screen)
// -> support chat -> admin reactivates -> unlocked. Run: npm run build && xvfb-run -a node tests/e2e-license.js
const { _electron } = require('playwright-core');
const http = require('http');
const crypto = require('crypto');
const path = require('path');
const fs = require('fs');
const os = require('os');
const DESK = path.join(__dirname, '..');
const SHOTS = path.join(__dirname, '.e2e-shots');
fs.mkdirSync(SHOTS, { recursive: true });
const ud = fs.mkdtempSync(path.join(os.tmpdir(), 'rpos-lic-e2e-'));

const { privateKey, publicKey } = crypto.generateKeyPairSync('ec', { namedCurve: 'P-256' });
const pem = publicKey.export({ type: 'spki', format: 'pem' });
const sign = (payload) => {
  const body = Buffer.from(JSON.stringify({ v: 1, ...payload })).toString('base64url');
  return `RPOS1.${body}.${crypto.sign('sha256', Buffer.from(body), { key: privateKey, dsaEncoding: 'ieee-p1363' }).toString('base64url')}`;
};
const str = (v) => ({ stringValue: String(v) });
const db = new Map(); // "licenseStatus/L1" -> fields
db.set('publicConfig/signing', { publicPem: str(pem) });
db.set('licenseStatus/LIC1', { status: str('active'), message: str(''), maxDevices: { integerValue: '1' }, deviceCount: { integerValue: '0' }, key: str('x') });

const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://x');
  const p = decodeURIComponent(url.pathname).replace(/^\/docs\/?/, '');
  const send = (code, body) => { res.writeHead(code, { 'content-type': 'application/json' }); res.end(JSON.stringify(body)); };
  if (req.method === 'POST' && p === ':commit') {
    let b = '';
    req.on('data', (c) => (b += c));
    req.on('end', () => {
      for (const w of JSON.parse(b).writes) {
        const name = w.update.name.split('/documents/')[1];
        const cur = db.get(name) || {};
        const next = { ...cur, ...w.update.fields };
        for (const t of w.updateTransforms || []) next[t.fieldPath] = { timestampValue: new Date().toISOString() };
        db.set(name, next);
      }
      send(200, {});
    });
    return;
  }
  const msgs = /^supportThreads\/([^/]+)\/messages$/.exec(p);
  if (msgs) {
    const docs = [...db.entries()].filter(([k]) => k.startsWith(`supportThreads/${msgs[1]}/messages/`)).map(([k, f]) => ({ name: `projects/demo/databases/(default)/documents/${k}`, fields: f }));
    docs.sort((a, b) => (a.fields.createdAt.timestampValue < b.fields.createdAt.timestampValue ? -1 : 1));
    return send(200, { documents: docs });
  }
  const d = db.get(p);
  if (!d) return send(404, {});
  send(200, { name: p, fields: d });
});

let failed = false;
const step = async (name, fn) => { try { await fn(); console.log('OK  ', name); } catch (e) { failed = true; console.log('FAIL', name, String(e.message).split('\n')[0]); } };

(async () => {
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}/docs`;
  const launch = () => _electron.launch({ executablePath: require('electron'), args: ['--no-sandbox', DESK], env: { ...process.env, RPOS_USER_DATA: ud, RPOS_FORCE_LICENSE: '1', RPOS_FIRESTORE_URL: base } });
  const mainPage = async (app) => {
    const isMain = (w) => !/splash\.html/.test(w.url());
    let page = app.windows().find(isMain);
    if (!page) page = await app.waitForEvent('window', { predicate: isMain, timeout: 30000 });
    const errors = [];
    page.on('pageerror', (e) => errors.push('pageerror: ' + e.message + ' ' + String(e.stack).split('\n').slice(0, 4).join(' | ')));
    page.on('console', (m) => m.type() === 'error' && errors.push('console: ' + m.text()));
    await page.setViewportSize({ width: 1366, height: 768 });
    return { page, errors };
  };
  const blank = async (page) => (await page.evaluate(() => document.body.innerText.trim().length)) === 0;

  // ---- 1st launch: nothing inside the build, licensing is set up from the provider ---------------------------
  let app = await launch();
  let { page, errors } = await mainPage(app);
  await step('first launch asks for a license (key downloaded automatically)', async () => {
    await page.waitForSelector('text=Activate DT Retail POS', { timeout: 30000 });
    await page.screenshot({ path: path.join(SHOTS, '70-first-launch.png') });
  });
  const key = sign({ lid: 'LIC1', cid: 'C1', bn: 'Sample Restaurant', mid: '*', plan: 'yearly', iat: '2026-01-01', exp: '2099-12-31', mu: 0, md: 1 });
  await step('activate with the key: device registers, login screen opens', async () => {
    await page.fill('textarea', key);
    await page.click('button:has-text("Activate License")');
    await page.waitForSelector('text=Welcome back', { timeout: 30000 });
    if (!db.get('devices/LIC1_' + [...db.keys()].find((k) => k.startsWith('devices/LIC1_')).split('_')[1])) throw new Error('device not registered online');
    if (db.get('licenseStatus/LIC1').deviceCount.integerValue !== '1') throw new Error('device counter not bumped');
  });
  await step('login works', async () => {
    await page.click('.user-tile');
    for (const d of '1234') await page.click(`.pinpad button:text-is("${d}")`);
    await page.waitForSelector('.sidebar');
  });
  await step('support: message the provider from Settings', async () => {
    await page.click('a[href="#/settings"]');
    await page.click('.tabs button:has-text("Support")');
    await page.fill('textarea[placeholder="Write a message…"]', 'Hello provider, printer question');
    await page.click('button:has-text("Send")');
    await page.waitForSelector('text=Hello provider, printer question');
    const k = [...db.keys()].find((x) => x.startsWith('supportThreads/LIC1/messages/'));
    if (!k) throw new Error('message not stored');
  });
  await app.close();

  // ---- admin suspends; the app is opened again ------------------------------------------------------------------
  await new Promise((r) => setTimeout(r, 800));
  db.set('licenseStatus/LIC1', { ...db.get('licenseStatus/LIC1'), status: str('suspended'), message: str('Suspended: please pay the invoice') });
  app = await launch();
  ({ page, errors } = await mainPage(app));
  await step('suspended license: locked screen with the admin message (no white screen)', async () => {
    await page.waitForSelector('text=Suspended: please pay the invoice', { timeout: 40000 });
    if (await blank(page)) throw new Error('WHITE SCREEN');
    await page.screenshot({ path: path.join(SHOTS, '71-suspended.png') });
  });
  await step('locked screen shows the provider chat and can send a message', async () => {
    await page.waitForSelector('text=Hello provider, printer question', { timeout: 15000 });
    await page.fill('textarea[placeholder="Write a message…"]', 'Please reactivate');
    await page.click('button:has-text("Send")');
    await page.waitForSelector('text=Please reactivate');
  });
  await step('admin reactivates: the app unlocks by itself', async () => {
    db.set('licenseStatus/LIC1', { ...db.get('licenseStatus/LIC1'), status: str('active'), message: str('') });
    await page.click('button:has-text("Check again")');
    await page.waitForSelector('text=Welcome back', { timeout: 30000 });
    if (await blank(page)) throw new Error('WHITE SCREEN');
  });
  await step('no console / page errors', async () => { if (errors.length) throw new Error(errors.join(' | ')); });
  await app.close();
  server.close();
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
