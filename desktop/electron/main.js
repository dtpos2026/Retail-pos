'use strict';

const path = require('path');
const fs = require('fs');
const { app, BrowserWindow, ipcMain, protocol, Menu, dialog, shell } = require('electron');

const ctx = require('./core/context');
const logger = require('./core/logger');
const { Database } = require('./db/database');
const seed = require('./db/seed');
const router = require('./ipc/router');
const products = require('./services/products');
const backup = require('./services/backup');
const license = require('./license/license');

const isDev = !app.isPackaged && process.env.RPOS_DEV_SERVER;

// Custom scheme for product images stored in the database.
protocol.registerSchemesAsPrivileged([{ scheme: 'posimg', privileges: { standard: true, secure: true, supportFetchAPI: true } }]);

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    const w = BrowserWindow.getAllWindows()[0];
    if (w) {
      if (w.isMinimized()) w.restore();
      w.focus();
    }
  });
  app.whenReady().then(start).catch(fatal);
}

function initPaths() {
  // Test hook only; packaged builds always use the standard %APPDATA% location.
  if (!app.isPackaged && process.env.RPOS_USER_DATA) app.setPath('userData', process.env.RPOS_USER_DATA);
  const userData = app.getPath('userData');
  ctx.paths.userData = userData;
  ctx.paths.dbFile = path.join(userData, 'data', 'retailpos.db');
  ctx.paths.backups = path.join(userData, 'backups');
  ctx.paths.logs = path.join(userData, 'logs');
  ctx.paths.temp = path.join(app.getPath('temp'), 'retail-pos');
  for (const p of [ctx.paths.backups, ctx.paths.temp]) fs.mkdirSync(p, { recursive: true });
}

function openDatabase() {
  ctx.db = new Database(ctx.paths.dbFile);
  if (!ctx.db.integrityCheck()) {
    logger.error('Database integrity check failed');
    dialog.showMessageBoxSync({
      type: 'warning',
      title: 'Retail POS',
      message: 'The database may be damaged (for example after a power failure).',
      detail: 'Please go to Settings → Backup & Restore and restore your latest backup. Contact support if the problem continues.',
    });
  }
  seed.ensureDefaults();
}

function registerProtocol() {
  protocol.handle('posimg', (request) => {
    const url = new URL(request.url);
    const id = Number(url.pathname.replace(/\//g, ''));
    const row = url.hostname === 'product' && id ? products.image(id) : null;
    if (!row || !row.image) return new Response('Not found', { status: 404 });
    return new Response(Buffer.from(row.image), { headers: { 'content-type': row.image_mime || 'image/jpeg', 'cache-control': 'max-age=31536000' } });
  });
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1366,
    height: 800,
    minWidth: 1100,
    minHeight: 680,
    show: false,
    backgroundColor: '#f4f6fb',
    title: 'Retail POS',
    icon: path.join(__dirname, '..', 'build', 'icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: false,
    },
  });
  win.once('ready-to-show', () => {
    win.maximize();
    win.show();
  });
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (e, url) => {
    if (!url.startsWith('file://') && !(isDev && url.startsWith(process.env.RPOS_DEV_SERVER))) e.preventDefault();
  });
  win.webContents.on('render-process-gone', (_e, details) => {
    logger.error('Renderer crashed', details);
    if (details.reason !== 'clean-exit') win.reload();
  });
  win.webContents.on('before-input-event', (_e, input) => {
    if (input.type === 'keyDown' && input.key === 'F12' && input.control && input.shift) win.webContents.toggleDevTools();
  });

  if (isDev) win.loadURL(process.env.RPOS_DEV_SERVER);
  else win.loadFile(path.join(__dirname, '..', 'dist-renderer', 'index.html'));
  return win;
}

async function start() {
  initPaths();
  logger.init(ctx.paths.logs);
  logger.info(`Retail POS ${app.getVersion()} starting`);
  Menu.setApplicationMenu(null);
  openDatabase();
  registerProtocol();

  ipcMain.handle('api', (_e, method, args) => router.handle(method, args));

  createWindow();

  // Background jobs: auto backup + optional online license check.
  setTimeout(() => backup.autoIfDue(), 15000);
  setInterval(() => backup.autoIfDue(), 60 * 60 * 1000);
  setTimeout(() => license.onlineCheck().catch(() => {}), 5000);
  setInterval(() => license.onlineCheck().catch(() => {}), 6 * 60 * 60 * 1000);
}

function fatal(err) {
  logger.error('Fatal startup error', err);
  dialog.showErrorBox('Retail POS', `Retail POS could not start.\n\n${err && err.message ? err.message : err}\n\nLogs: ${ctx.paths.logs || ''}`);
  app.exit(1);
}

process.on('uncaughtException', (err) => logger.error('Uncaught exception', err));
process.on('unhandledRejection', (err) => logger.error('Unhandled rejection', err));

app.on('window-all-closed', () => app.quit());

app.on('will-quit', () => {
  try {
    if (ctx.db && ctx.db.db) ctx.db.close();
  } catch (err) {
    logger.error('Error closing database', err);
  }
});
