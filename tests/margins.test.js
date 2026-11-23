'use strict';

// Left / right margins are always equal; old unequal values migrate into the printer's side balance.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'rpos-mar-'));
const ctx = require('../electron/core/context');
ctx.paths = { userData: tmp, dbFile: path.join(tmp, 'data', 'test.db'), backups: path.join(tmp, 'backups'), logs: path.join(tmp, 'logs'), temp: path.join(tmp, 'temp') };
fs.mkdirSync(ctx.paths.backups, { recursive: true });
const { Database } = require('../electron/db/database');
ctx.db = new Database(ctx.paths.dbFile);
const seed = require('../electron/db/seed');
const settings = require('../electron/services/settings');
const printService = require('../electron/printing/printService');
seed.ensureDefaults();

test('old unequal margins become one side margin + printer side balance (same printed result)', () => {
  ctx.db.run("INSERT INTO settings (key, value) VALUES ('receipt', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value", [JSON.stringify({ marginLeft: 4, marginRight: 1, paperWidth: 80 })]);
  settings.clearCache();
  const r = settings.get('receipt');
  assert.equal(r.marginSide, 1);
  assert.equal(r.marginLeft, 1);
  assert.equal(r.marginRight, 1);
  assert.equal(settings.get('printer').shift, 24); // (4-1) mm * 8 dots
  settings.clearCache();
  assert.equal(settings.get('receipt').marginSide, 1); // persisted, not migrated twice
  assert.equal(settings.get('printer').shift, 24);
});

test('left and right margins are independent, saved, and used by receipt, token and kitchen slips', () => {
  const pads = (html) => /body\{width:[\d.]+mm;padding:([\d.]+)mm ([\d.]+)mm ([\d.]+)mm ([\d.]+)mm/.exec(html).slice(1, 5).map(Number);
  // the single side margin still sets both sides (older callers)
  settings.set('receipt', { marginSide: 2.5 });
  assert.equal(settings.get('receipt').marginLeft, 2.5);
  assert.equal(settings.get('receipt').marginRight, 2.5);
  // separate values are kept exactly, also after a restart (cache cleared)
  settings.set('receipt', { marginLeft: 1, marginRight: 6 });
  settings.clearCache();
  const r0 = settings.get('receipt');
  assert.equal(r0.marginLeft, 1); assert.equal(r0.marginRight, 6);
  const [, r, , l] = pads(printService.receiptHtml({ sample: true }));
  assert.equal(l, 1); assert.equal(r, 6);
  for (const html of [printService.tokenHtmls({ sample: true })[0], printService.kotHtml({ sample: true })]) {
    const [, rr, , ll] = pads(html);
    assert.ok(ll > 0 && rr > ll, 'token / KOT follow the same left and right margins');
  }
  // preview overrides carry their own margins
  const html = printService.receiptHtml({ sample: true, overrides: { receipt: { ...settings.get('receipt'), marginLeft: 3, marginRight: 0 } } });
  const [, r2, , l2] = pads(html);
  assert.equal(l2, 3); assert.equal(r2, 0);
  assert.throws(() => settings.set('receipt', { marginRight: 30 }), /between 0 and 20/);
  assert.throws(() => settings.set('receipt', { marginLeft: -1 }), /between 0 and 20/);
  settings.set('receipt', { marginLeft: 1, marginRight: 1, marginSide: 1 });
});
