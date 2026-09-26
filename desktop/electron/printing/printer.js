'use strict';

const fs = require('fs');
const path = require('path');
const { BrowserWindow } = require('electron');
const ctx = require('../core/context');
const logger = require('../core/logger');
const { AppError } = require('../core/errors');

const MICRONS_PER_PX = 25400 / 96;
let queue = Promise.resolve();
const inFlight = new Set();

async function listPrinters() {
  const win = BrowserWindow.getAllWindows()[0];
  if (!win) return [];
  const printers = await win.webContents.getPrintersAsync();
  return printers.map((p) => ({
    name: p.name,
    displayName: p.displayName || p.name,
    description: p.description || '',
    isDefault: !!p.isDefault,
    status: p.status,
  }));
}

async function resolvePrinter(name) {
  const printers = await listPrinters();
  if (!printers.length) throw new AppError('No printer is installed on this computer. Install your printer driver in Windows first.');
  if (!name) {
    const def = printers.find((p) => p.isDefault);
    if (!def) throw new AppError('No printer selected. Choose a printer in Settings → Printers.');
    return def.name;
  }
  if (!printers.some((p) => p.name === name)) {
    throw new AppError(`Printer "${name}" was not found. Check that it is connected and turned on, or choose another printer in Settings.`);
  }
  return name;
}

function loadHtml(win, html) {
  fs.mkdirSync(ctx.paths.temp, { recursive: true });
  const file = path.join(ctx.paths.temp, `print-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.html`);
  fs.writeFileSync(file, html, 'utf8');
  return win.loadFile(file).then(() => file);
}

/**
 * Render HTML in a hidden window and send it to the printer silently.
 * Page height is measured from the content so thermal printers do not feed
 * blank paper, and the driver's auto-cut happens right after the content.
 */
function printHtml(html, { printerName, widthMm, copies = 1, jobKey }) {
  if (jobKey && inFlight.has(jobKey)) return Promise.reject(new AppError('This document is already printing.'));
  if (jobKey) inFlight.add(jobKey);
  const job = queue.then(async () => {
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
      logger.info('Printed', jobKey || '', 'on', deviceName);
      return { printer: deviceName };
    } finally {
      if (!win.isDestroyed()) win.destroy();
      if (file) fs.unlink(file, () => {});
    }
  });
  queue = job.catch(() => {});
  return job.finally(() => jobKey && inFlight.delete(jobKey));
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

module.exports = { listPrinters, printHtml, printWithDialog, htmlToPdf };
