'use strict';

const fs = require('fs');
const path = require('path');
const { app, BrowserWindow } = require('electron');
const ctx = require('../core/context');
const logger = require('../core/logger');
const settings = require('../services/settings');
const { AppError } = require('../core/errors');
const escpos = require('./escpos');
const rasterize = require('./rasterize');
const rawPrint = require('./rawPrint');
const detect = require('./detect');

const MICRONS_PER_PX = 25400 / 96;
let queue = Promise.resolve();
const inFlight = new Set();

/** Developer / test hook: write the ESC/POS job to a folder instead of a printer. */
const dumpDir = () => (!app.isPackaged && process.env.RPOS_PRINT_DUMP) || null;

// ---------------------------------------------------------------------------------------
// Printer discovery: cached list, background refresh, automatic choice of the thermal printer
// ---------------------------------------------------------------------------------------

const LIST_TTL = 15000;
let cache = { list: [], at: 0 };
let refreshing = null;

function mapPrinter(p) {
  return { name: p.name, displayName: p.displayName || p.name, description: p.description || '', isDefault: !!p.isDefault, status: p.status };
}

/** Ask Windows for the installed printers (uses any open window; hidden worker windows are fine). */
function refreshPrinters() {
  if (refreshing) return refreshing;
  const win = BrowserWindow.getAllWindows().find((w) => !w.isDestroyed());
  if (!win) return Promise.resolve(cache.list);
  refreshing = win.webContents
    .getPrintersAsync()
    .then((list) => {
      cache = { list: list.map(mapPrinter), at: Date.now() };
      return cache.list;
    })
    .catch((err) => {
      logger.warn('Printer list failed', err.message);
      return cache.list;
    })
    .finally(() => {
      refreshing = null;
    });
  return refreshing;
}

/** Printer list; instant when the cache is fresh (printing never waits for Windows to enumerate printers). */
async function listPrinters({ fresh = false } = {}) {
  if (fresh || !cache.at || Date.now() - cache.at > LIST_TTL) await refreshPrinters();
  return cache.list;
}

/** Name of the printer to use for a job: the chosen one, else the auto-detected thermal printer, else the Windows default. */
function autoName(list) {
  const pr = settings.get('printer');
  if (pr.autoDetect === false) return (list.find((p) => p.isDefault) || {}).name || '';
  const p = detect.pickThermal(list);
  return p ? p.name : '';
}

async function resolvePrinter(name) {
  let printers = await listPrinters();
  if (!printers.length) printers = await listPrinters({ fresh: true });
  if (!printers.length) throw new AppError('No printer is installed on this computer. Install your printer driver in Windows first.');
  if (!name) {
    const auto = autoName(printers);
    if (!auto) throw new AppError('No printer selected. Choose a printer in Settings → Printers.');
    return auto;
  }
  if (!printers.some((p) => p.name === name)) {
    printers = await listPrinters({ fresh: true }); // it may have just been plugged in / switched on
    if (!printers.some((p) => p.name === name)) throw new AppError(`Printer "${name}" was not found. Check that it is connected and turned on, or choose another printer in Settings.`);
  }
  return name;
}

/** What the UI shows: which printer is in use and whether it looks ready. */
async function printerStatus({ fresh = false } = {}) {
  const list = await listPrinters({ fresh });
  const pr = settings.get('printer');
  const chosen = pr.receiptPrinter;
  const name = chosen || autoName(list);
  const p = list.find((x) => x.name === name);
  const helper = pr.method === 'thermal' && process.platform === 'win32' ? await rawPrint.ping() : null;
  return {
    name: name || '',
    auto: !chosen,
    found: !!p,
    offline: p ? detect.isOffline(p) : false,
    ready: !!p && !detect.isOffline(p) && helper !== false,
    helper,
    count: list.length,
    virtual: p ? detect.isVirtual(p) : false,
  };
}

let monitor = null;

/** Keeps the printer path alive: fresh printer list, print helper running, render worker warm. */
function startMonitor() {
  if (monitor) return;
  const tick = async () => {
    try {
      await refreshPrinters();
      if (settings.get('printer').method === 'thermal') {
        rasterize.warmUp();
        await rawPrint.ping();
      }
    } catch (err) {
      logger.warn('Printer monitor', err.message);
    }
  };
  monitor = setInterval(tick, 20000);
  monitor.unref?.();
  tick();
}

// ---------------------------------------------------------------------------------------
// Thermal (ESC/POS raster) — default
// ---------------------------------------------------------------------------------------

function thermalGeometry(widthMm) {
  const pr = settings.get('printer');
  const { total, shift, content } = escpos.effectiveDots(widthMm, pr);
  return { dots: total, content, shift, cssWidthMm: escpos.mmForDots(content), pr };
}

async function buildThermalJob(html, { widthMm, copies = 1 }) {
  const { dots, content, shift, cssWidthMm, pr } = thermalGeometry(widthMm);
  const img = await rasterize.renderBgra(html, { cssWidthMm, pixelWidth: content });
  const left = Math.max(0, shift); // + shift: unused dots on the left, content moves right
  const gray = escpos.padGray(rasterize.toGray(img), img.width, img.height, dots, left);
  img.imgRects = img.imgRects.map((r) => ({ ...r, x: r.x + left }));
  img.width = dots;
  const looksBlank = !gray.some((v) => v < 200);
  if (looksBlank) throw new AppError('The receipt image came out blank. Switch to "Windows driver" print method in Settings → Printers and try again.');
  const bitmap = escpos.trimBlankTail(
    escpos.packBitmap(gray, img.width, img.height, { threshold: escpos.DARKNESS[pr.darkness] || 150, ditherRects: img.imgRects }),
    6
  );
  const job = escpos.buildJob(bitmap, { cut: pr.cut, feedMm: pr.feedMm, compatCut: pr.compatCut, copies });
  return { job, bitmap };
}

/**
 * A printer that just woke up, was re-plugged or whose helper died can fail the very first attempt.
 * Re-detect (fresh list, helper restart) and retry a couple of times before reporting an error.
 */
async function sendWithRetry(requested, deviceName, job, doc) {
  let name = deviceName;
  let lastErr;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      await rawPrint.sendRaw(name, job, doc);
      return;
    } catch (err) {
      lastErr = err;
      logger.warn('Print attempt failed', attempt + 1, name, err.message);
      if (attempt === 2) break;
      await new Promise((r) => setTimeout(r, 500 + attempt * 700));
      rawPrint.shutdown();
      try {
        name = await resolvePrinter(requested);
      } catch (e2) {
        lastErr = e2;
      }
    }
  }
  throw lastErr;
}

async function printThermal(html, { printerName, widthMm, copies = 1, jobKey }) {
  const dump = dumpDir();
  const deviceName = dump ? '(dump)' : await resolvePrinter(printerName);
  const { job } = await buildThermalJob(html, { widthMm, copies });
  if (dump) {
    fs.mkdirSync(dump, { recursive: true });
    fs.writeFileSync(path.join(dump, `${String(jobKey || 'job').replace(/[^\w.-]+/g, '_')}-${Date.now()}.escpos`), job);
  } else {
    await sendWithRetry(printerName, deviceName, job, `DT Retail POS ${jobKey || ''}`.trim());
  }
  logger.info('Printed (thermal)', jobKey || '', 'on', deviceName, `${job.length} bytes`);
  return { printer: deviceName, method: 'thermal' };
}

// ---------------------------------------------------------------------------------------
// Windows driver (Chromium print) — fallback for printers that do not speak ESC/POS
// ---------------------------------------------------------------------------------------

function loadHtml(win, html) {
  fs.mkdirSync(ctx.paths.temp, { recursive: true });
  const file = path.join(ctx.paths.temp, `print-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.html`);
  fs.writeFileSync(file, html, 'utf8');
  return win.loadFile(file).then(() => file);
}

async function printDriver(html, { printerName, widthMm, copies = 1, jobKey }) {
  const deviceName = await resolvePrinter(printerName);
  const widthPx = Math.round((widthMm / 25.4) * 96);
  const win = new BrowserWindow({
    show: false,
    width: widthPx + 40,
    height: 800,
    webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false },
  });
  let file;
  try {
    file = await loadHtml(win, html);
    const heightPx = await win.webContents.executeJavaScript(`
      (async () => {
        await document.fonts.ready;
        await Promise.all([...document.images].map(i => i.complete ? 1 : new Promise(r => { i.onload = i.onerror = r; })));
        return Math.ceil(document.body.getBoundingClientRect().height);
      })()`);
    const heightMicrons = Math.max(30000, Math.ceil(heightPx * MICRONS_PER_PX) + 1000);
    await new Promise((resolve, reject) => {
      win.webContents.print(
        {
          silent: true,
          deviceName,
          printBackground: true,
          copies: Math.max(1, Math.min(5, copies)),
          landscape: false,
          scaleFactor: 100,
          margins: { marginType: 'none' },
          pageSize: { width: Math.round(widthMm * 1000), height: heightMicrons },
        },
        (success, reason) => {
          if (success) resolve();
          else {
            logger.error('Print failed', deviceName, reason);
            reject(new AppError(reason === 'cancelled' ? 'Printing was cancelled.' : `Printing failed on "${deviceName}". Check the printer is on, has paper and is connected.`));
          }
        }
      );
    });
    logger.info('Printed (driver)', jobKey || '', 'on', deviceName);
    return { printer: deviceName, method: 'driver' };
  } finally {
    if (!win.isDestroyed()) win.destroy();
    if (file) fs.unlink(file, () => {});
  }
}

// ---------------------------------------------------------------------------------------

/**
 * Print an HTML receipt/token/report. Jobs are serialised, and the same jobKey cannot run twice
 * at once (prevents duplicate prints from double clicks).
 */
function printHtml(html, opts) {
  const { jobKey } = opts;
  if (jobKey && inFlight.has(jobKey)) return Promise.reject(new AppError('This document is already printing.'));
  if (jobKey) inFlight.add(jobKey);
  const method = settings.get('printer').method;
  const job = queue.then(() => (method === 'driver' ? printDriver(html, opts) : printThermal(html, opts)));
  queue = job.catch(() => {});
  return job.finally(() => jobKey && inFlight.delete(jobKey));
}

/** Colour PNG of an HTML document (2x resolution) — for "Save as PNG" / WhatsApp. */
async function renderPng(html, { widthMm }) {
  const { cssWidthMm } = thermalGeometry(widthMm);
  const pixelWidth = Math.round((cssWidthMm / 25.4) * 96 * 2.4);
  const job = queue.then(async () => rasterize.toPng(await rasterize.renderBgra(html, { cssWidthMm, pixelWidth })));
  queue = job.catch(() => {});
  return job;
}

/** Show the system print dialog (used for A4 reports). */
async function printWithDialog(html) {
  const win = new BrowserWindow({ show: false, webPreferences: { sandbox: true } });
  let file;
  try {
    file = await loadHtml(win, html);
    await win.webContents.executeJavaScript('document.fonts.ready.then(() => true)');
    await new Promise((resolve, reject) => {
      win.webContents.print({ silent: false, printBackground: true }, (ok, reason) => (ok || reason === 'cancelled' ? resolve() : reject(new AppError('Printing failed.'))));
    });
  } finally {
    if (!win.isDestroyed()) win.destroy();
    if (file) fs.unlink(file, () => {});
  }
}

async function htmlToPdf(html, { landscape = false } = {}) {
  const win = new BrowserWindow({ show: false, webPreferences: { sandbox: true } });
  let file;
  try {
    file = await loadHtml(win, html);
    await win.webContents.executeJavaScript('document.fonts.ready.then(() => true)');
    return await win.webContents.printToPDF({ printBackground: true, pageSize: 'A4', landscape });
  } finally {
    if (!win.isDestroyed()) win.destroy();
    if (file) fs.unlink(file, () => {});
  }
}

/** Called once the main window is visible: prepares the fast path. */
function warmUp() {
  if (settings.get('printer').method === 'thermal') {
    rasterize.warmUp();
    rawPrint.warmUp();
  }
  startMonitor();
}

module.exports = { listPrinters, printerStatus, refreshPrinters, printHtml, renderPng, printWithDialog, htmlToPdf, warmUp, buildThermalJob, shutdown: () => {
    if (monitor) clearInterval(monitor);
    monitor = null;
    rawPrint.shutdown();
  },
};
