'use strict';

const fs = require('fs');
const { app, dialog, shell, BrowserWindow } = require('electron');
const ctx = require('../core/context');
const logger = require('../core/logger');
const { AppError } = require('../core/errors');
const { can } = require('../core/permissions');
const { localDate } = require('../core/util');

const settings = require('../services/settings');
const auth = require('../services/auth');
const users = require('../services/users');
const categories = require('../services/categories');
const products = require('../services/products');
const customers = require('../services/customers');
const tables = require('../services/tables');
const tableOps = require('../services/tableOps');
const bulk = require('../services/bulk');
const staff = require('../services/staff');
const orders = require('../services/orders');
const tokens = require('../services/tokens');
const inventory = require('../services/inventory');
const reports = require('../services/reports');
const dashboard = require('../services/dashboard');
const backup = require('../services/backup');
const seed = require('../db/seed');
const license = require('../license/license');
const printService = require('../printing/printService');
const { renderReport, renderCsv } = require('../printing/reportHtml');
const { reportToXlsx } = require('../printing/xlsx');

const win = () => BrowserWindow.getFocusedWindow() || BrowserWindow.getAllWindows()[0];

// Settings sections every logged-in user may read (POS needs them).
const PUBLIC_SECTIONS = ['business', 'receipt', 'token', 'sales', 'inventory', 'payment', 'general', 'printer'];

/**
 * Route table: method -> { fn, perm, open }
 *   open:  callable without login (login screen, activation)
 *   perm:  permission key required (see core/permissions.js); undefined = any logged-in user
 *   any:   list of permissions, one of which is required
 */
const routes = {
  // ---- app / license -----------------------------------------------------
  'app.info': {
    open: true,
    fn: () => ({
      name: 'Retail POS',
      version: app.getVersion(),
      packaged: app.isPackaged,
      dataFolder: ctx.paths.userData,
      dbFile: ctx.paths.dbFile,
      logs: ctx.paths.logs,
      today: localDate(),
      defaultAdmin: ctx.db.get("SELECT COUNT(*) c FROM users WHERE username = 'admin'").c > 0 && auth.verifySecret(seed.DEFAULT_ADMIN.password, ctx.db.get("SELECT password_hash FROM users WHERE username = 'admin'")?.password_hash),
    }),
  },
  // Safe to show before login: theme + shop name/logo for the login screen.
  'app.public': {
    open: true,
    fn: () => {
      const b = settings.get('business');
      return { appearance: settings.get('appearance'), business: { name: b.name, logo: b.logo } };
    },
  },
  'app.openDataFolder': { perm: 'settings', fn: () => shell.openPath(ctx.paths.userData) },
  'app.openLogs': { perm: 'settings', fn: () => shell.openPath(ctx.paths.logs) },
  'app.relaunch': {
    open: true,
    fn: () => {
      app.relaunch();
      app.exit(0);
    },
  },
  'license.status': { open: true, fn: () => license.status() },
  'license.activate': { open: true, fn: (a) => license.activate(a) },
  'license.registerDevice': { open: true, fn: () => license.registerDevice() },
  'support.list': { open: true, fn: () => license.supportMessages() },
  'support.send': { open: true, fn: (a) => license.sendSupport(a) },
  'license.refresh': { open: true, fn: async () => (await license.onlineCheck()) || license.status() },
  'license.remove': { perm: 'settings', fn: () => license.removeLicense() },

  // ---- auth ----------------------------------------------------------------
  'auth.login': { open: true, fn: (a) => auth.login(a) },
  'auth.loginPin': { open: true, fn: (a) => auth.loginPin(a) },
  'auth.loginUsers': { open: true, fn: () => auth.loginUsers() },
  'auth.current': { open: true, fn: () => auth.current() },
  'auth.logout': { open: true, fn: () => auth.logout() },
  'auth.changePassword': { fn: (a) => auth.changeOwnPassword(a) },

  // ---- settings ------------------------------------------------------------
  'settings.getAll': {
    fn: () => {
      const all = settings.getAll();
      if (!can(ctx.user, 'settings')) {
        for (const k of Object.keys(all)) if (!PUBLIC_SECTIONS.includes(k)) delete all[k];
      }
      return all;
    },
  },
  'settings.set': {
    fn: ({ section, values }) => {
      const perm = section === 'backup' ? 'backup' : 'settings';
      if (!can(ctx.user, perm)) throw new AppError('You do not have permission to change settings.');
      return settings.set(section, values);
    },
  },

  // ---- users ---------------------------------------------------------------
  'users.list': { perm: 'users', fn: () => users.list() },
  'users.meta': { fn: () => users.meta() },
  'users.save': { perm: 'users', fn: (a) => users.save(a) },
  'users.remove': { perm: 'users', fn: (a) => users.remove(a) },

  // ---- catalogue -----------------------------------------------------------
  'categories.list': { fn: (a) => categories.list(a) },
  'categories.save': { perm: 'categories', fn: (a) => categories.save(a) },
  'categories.remove': { perm: 'categories', fn: (a) => categories.remove(a) },
  'categories.reorder': { perm: 'categories', fn: (a) => categories.reorder(a) },
  'products.list': { fn: (a) => products.list(a) },
  'products.get': { fn: (a) => products.get(a) },
  'products.findByCode': { fn: (a) => products.findByCode(a) },
  'products.save': { perm: 'products', fn: (a) => products.save(a) },
  'products.remove': { perm: 'products', fn: (a) => products.remove(a) },
  'products.importParse': { perm: 'products', fn: (a) => bulk.parseMenu(a) },
  'products.importApply': { perm: 'products', fn: (a) => bulk.importMenu(a) },
  'products.setImages': { perm: 'products', fn: (a) => bulk.setImages(a) },
  'products.template': { perm: 'products', fn: (a) => saveXlsx(a && a.kind === 'menu' ? bulk.menuXlsx() : bulk.templateXlsx(), a && a.kind === 'menu' ? 'Menu-export.xlsx' : 'Menu-import-template.xlsx') },

  // ---- customers / tables --------------------------------------------------
  'customers.list': { any: ['customers', 'pos'], fn: (a) => customers.list(a) },
  'customers.get': { any: ['customers', 'pos'], fn: (a) => customers.get(a) },
  'customers.save': { any: ['customers', 'pos'], fn: (a) => customers.save(a) },
  'customers.remove': { perm: 'customers', fn: (a) => customers.remove(a) },
  'tables.list': { any: ['tables', 'pos'], fn: () => tables.list() },
  'tables.save': { perm: 'settings', fn: (a) => tables.save(a) },
  'tables.bulkAdd': { perm: 'settings', fn: (a) => tables.bulkAdd(a) },
  'tables.setStatus': { any: ['tables', 'pos'], fn: (a) => tables.setStatus(a) },
  'tables.remove': { perm: 'settings', fn: (a) => tables.remove(a) },
  'staff.list': { fn: (a) => staff.list(a) },
  'staff.save': { perm: 'settings', fn: (a) => staff.save(a) },
  'staff.remove': { perm: 'settings', fn: (a) => staff.remove(a) },
  'tables.floors': { any: ['tables', 'pos'], fn: () => tables.floors() },
  'tables.floorSave': { perm: 'settings', fn: (a) => tables.floorSave(a) },
  'tables.floorRemove': { perm: 'settings', fn: (a) => tables.floorRemove(a) },
  'tables.assignFloor': { perm: 'settings', fn: (a) => tables.assignFloor(a) },
  'tables.transfer': { any: ['tables', 'pos'], fn: (a) => tableOps.transfer(a) },
  'tables.merge': { any: ['tables', 'pos'], fn: (a) => tableOps.merge(a) },
  'tables.split': { any: ['tables', 'pos'], fn: (a) => tableOps.split(a) },
  'tables.free': { any: ['tables', 'pos'], fn: (a) => tableOps.free(a) },
  'tables.history': { any: ['tables', 'orders', 'reports'], fn: (a) => tableOps.history(a) },

  // ---- orders / tokens -----------------------------------------------------
  'orders.save': { perm: 'pos', fn: (a) => orders.save(a) },
  'orders.get': { any: ['orders', 'pos', 'tables'], fn: (a) => orders.get(a) },
  'orders.list': { any: ['orders', 'reports'], fn: (a) => orders.list(a) },
  'orders.pending': { any: ['orders', 'pos', 'tables'], fn: (a) => orders.pending(a) },
  'orders.cancel': { any: ['pos', 'refund'], fn: (a) => orders.cancel(a) },
  'orders.refund': { perm: 'refund', fn: (a) => orders.refund(a) },
  'orders.receivePayment': { any: ['orders', 'pos'], fn: (a) => orders.receivePayment(a) },
  'orders.addToken': { any: ['orders', 'pos', 'tokens'], fn: (a) => orders.addToken(a) },
  'tokens.list': { any: ['tokens', 'orders'], fn: (a) => tokens.list(a) },
  'tokens.setStatus': { any: ['tokens', 'orders'], fn: (a) => tokens.setStatus(a) },
  'tokens.info': { fn: () => tokens.info() },
  'tokens.resetCounter': { perm: 'settings', fn: () => tokens.resetCounter() },

  // ---- inventory -----------------------------------------------------------
  'inventory.summary': { any: ['inventory', 'products'], fn: () => inventory.summary() },
  'inventory.adjust': { perm: 'inventory', fn: (a) => inventory.adjust(a) },
  'inventory.movements': { any: ['inventory', 'products'], fn: (a) => inventory.movements(a) },

  // ---- dashboard / reports -------------------------------------------------
  'dashboard.summary': { perm: 'dashboard', fn: () => dashboard.summary() },
  'reports.list': { perm: 'reports', fn: () => reports.list() },
  'reports.run': { perm: 'reports', fn: (a) => reports.run(a) },
  'reports.print': { perm: 'reports', fn: async (a) => require('../printing/printer').printWithDialog(renderReport(reports.run(a))) },
  'reports.export': {
    perm: 'reports',
    fn: async ({ format, ...a }) => {
      const report = reports.run(a);
      const ext = { pdf: 'pdf', csv: 'csv', excel: 'xlsx' }[format];
      if (!ext) throw new AppError('Unknown export format.');
      const name = `${report.title.replace(/[^\w]+/g, '-')}_${report.from}${report.to !== report.from ? '_to_' + report.to : ''}.${ext}`;
      const r = await dialog.showSaveDialog(win(), {
        title: 'Export report',
        defaultPath: require('path').join(app.getPath('documents'), name),
        filters: [{ name: ext.toUpperCase(), extensions: [ext] }],
      });
      if (r.canceled || !r.filePath) return { canceled: true };
      let data;
      if (ext === 'pdf') data = await require('../printing/printer').htmlToPdf(renderReport(report), { landscape: report.columns.length > 7 });
      else if (ext === 'csv') data = renderCsv(report);
      else data = reportToXlsx(report);
      fs.writeFileSync(r.filePath, data);
      shell.showItemInFolder(r.filePath);
      return { file: r.filePath };
    },
  },

  'reports.thermalHtml': { perm: 'reports', fn: (a) => printService.reportHtml(a) },
  'reports.thermalPrint': { perm: 'reports', fn: (a) => printService.printReportThermal(a) },
  'reports.thermalPng': {
    perm: 'reports',
    fn: async (a) => {
      const w = Number(a.width) || settings.get('receipt').paperWidth;
      return savePng(`${a.key}_${a.from}${a.to !== a.from ? '_to_' + a.to : ''}_${w}mm.png`, printService.reportHtml({ ...a, width: w }), w);
    },
  },

  // ---- printing ------------------------------------------------------------
  'print.printers': { fn: (a) => printService.listPrinters(a) },
  'print.verify': { fn: () => printService.verifyPrinters() },
  'print.status': { fn: (a) => printService.printerStatus(a) },
  'print.templates': { fn: () => printService.TEMPLATES },
  'print.receiptHtml': { fn: (a) => printService.receiptHtml(a) },
  'print.tokenHtml': { fn: (a) => printService.tokenHtmls(a) },
  'print.tokenDesigns': { fn: () => printService.TOKEN_DESIGNS },
  'print.kotHtml': { fn: (a) => printService.kotHtml(a) },
  'print.kot': { any: ['pos', 'orders', 'tables'], fn: (a) => printService.printKot(a) },
  'print.savePng': {
    any: ['pos', 'orders', 'tables', 'tokens'],
    fn: async ({ kind = 'receipt', orderId, index = 0 }) => {
      const cfg = settings.get(kind === 'receipt' ? 'receipt' : 'token');
      const html = kind === 'receipt' ? printService.receiptHtml({ orderId }) : kind === 'kot' ? printService.kotHtml({ orderId }) : printService.tokenHtmls({ orderId })[index];
      const o = require('../services/orders').get({ id: orderId });
      return savePng(`${kind === 'receipt' ? 'Receipt' : kind === 'kot' ? 'KOT' : 'Token'}-${o.order_no}.png`, html, cfg.paperWidth);
    },
  },
  'print.receipt': { any: ['pos', 'orders', 'tables'], fn: (a) => printService.printReceipt(a) },
  'print.tokens': { any: ['pos', 'orders', 'tokens'], fn: (a) => printService.printTokens(a) },
  'print.afterSale': { perm: 'pos', fn: (a) => printService.printAfterSale(a) },
  'print.test': { fn: (a) => printService.testPrint(a) },

  // ---- backup / data -------------------------------------------------------
  'backup.list': { perm: 'backup', fn: () => backup.list() },
  'backup.create': { perm: 'backup', fn: (a) => backup.create(a) },
  'backup.createTo': {
    perm: 'backup',
    fn: async () => {
      const r = await dialog.showOpenDialog(win(), { title: 'Choose backup folder (USB drive recommended)', properties: ['openDirectory', 'createDirectory'] });
      if (r.canceled || !r.filePaths[0]) return { canceled: true };
      return backup.create({ targetFolder: r.filePaths[0] });
    },
  },
  'backup.chooseFolder': {
    perm: 'backup',
    fn: async () => {
      const r = await dialog.showOpenDialog(win(), { title: 'Automatic backup folder', properties: ['openDirectory', 'createDirectory'] });
      if (r.canceled || !r.filePaths[0]) return { canceled: true };
      settings.set('backup', { folder: r.filePaths[0] });
      return { folder: r.filePaths[0] };
    },
  },
  'backup.pickFile': {
    perm: 'backup',
    fn: async () => {
      const r = await dialog.showOpenDialog(win(), {
        title: 'Select backup to restore',
        defaultPath: backup.folder(),
        properties: ['openFile'],
        filters: [{ name: 'Retail POS Backup', extensions: [backup.EXT.slice(1)] }],
      });
      if (r.canceled || !r.filePaths[0]) return { canceled: true };
      return { file: r.filePaths[0], ...backup.verifyFile(r.filePaths[0]) };
    },
  },
  'backup.restore': { perm: 'backup', fn: (a) => backup.restore(a) },
  'backup.openFolder': { perm: 'backup', fn: () => shell.openPath(backup.folder()) },
  'data.loadDemo': { perm: 'settings', fn: () => seed.loadDemo() },
  'data.clearSales': { perm: 'settings', fn: () => seed.clearSales() },
  'data.factoryReset': { perm: 'settings', fn: () => seed.factoryReset() },
};

async function savePng(defaultName, html, widthMm) {
  const r = await dialog.showSaveDialog(win(), {
    title: 'Save as PNG',
    defaultPath: require('path').join(app.getPath('pictures'), defaultName),
    filters: [{ name: 'PNG image', extensions: ['png'] }],
  });
  if (r.canceled || !r.filePath) return { canceled: true };
  fs.writeFileSync(r.filePath, await printService.renderPng(html, widthMm));
  shell.showItemInFolder(r.filePath);
  return { file: r.filePath };
}

async function saveXlsx(buffer, defaultName) {
  const r = await dialog.showSaveDialog(win(), {
    title: 'Save Excel file',
    defaultPath: require('path').join(app.getPath('documents'), defaultName),
    filters: [{ name: 'Excel workbook', extensions: ['xlsx'] }],
  });
  if (r.canceled || !r.filePath) return { canceled: true };
  fs.writeFileSync(r.filePath, buffer);
  shell.showItemInFolder(r.filePath);
  return { file: r.filePath };
}

const LICENSE_FREE = new Set(['app.info', 'app.relaunch', 'license.status', 'license.activate', 'license.registerDevice', 'license.refresh', 'support.list', 'support.send', 'auth.current', 'auth.logout']);

async function handle(method, args) {
  const route = routes[method];
  try {
    if (!route) throw new AppError('Unknown action.');
    if (!LICENSE_FREE.has(method) && !license.isUsable()) throw new AppError('License required. Please activate Retail POS.', 'LICENSE_REQUIRED');
    if (!route.open) {
      if (!ctx.user || !auth.current()) throw new AppError('Your session has ended. Please log in again.', 'AUTH_REQUIRED');
      if (route.perm && !can(ctx.user, route.perm)) throw new AppError('You do not have permission for this action.', 'FORBIDDEN');
      if (route.any && !route.any.some((p) => can(ctx.user, p))) throw new AppError('You do not have permission for this action.', 'FORBIDDEN');
    }
    const data = await route.fn(args || {});
    return { ok: true, data: data === undefined ? null : data };
  } catch (err) {
    if (err && err.userFacing) return { ok: false, error: { message: err.message, code: err.code } };
    logger.error(`IPC ${method} failed`, err);
    let message = 'Something went wrong. Please try again.';
    if (err && /SQLITE_BUSY|database is locked/i.test(err.message)) message = 'The database is busy. Please try again in a moment.';
    if (err && /UNIQUE constraint failed/i.test(err.message)) message = 'This record already exists.';
    return { ok: false, error: { message, code: 'INTERNAL' } };
  }
}

module.exports = { handle, routes };
