'use strict';

const fs = require('fs');
const path = require('path');
const { BrowserWindow, nativeImage } = require('electron');
const ctx = require('../core/context');
const logger = require('../core/logger');
const { AppError } = require('../core/errors');

const TILE = 2000; // device-independent px captured per tile (keeps memory and GPU limits safe)

let worker = null;
let idleTimer = null;
let seq = 0;

function createWorker() {
  const win = new BrowserWindow({
    show: false,
    width: 600,
    height: TILE,
    useContentSize: true,
    frame: false,
    skipTaskbar: true,
    paintWhenInitiallyHidden: true,
    webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false, backgroundThrottling: false, spellcheck: false },
  });
  win.on('closed', () => {
    if (worker === win) worker = null;
  });
  return win;
}

/** Reused hidden window: creating one per receipt would add ~300 ms to every print. */
function acquire() {
  if (!worker || worker.isDestroyed()) worker = createWorker();
  clearTimeout(idleTimer);
  idleTimer = setTimeout(() => {
    if (worker && !worker.isDestroyed()) worker.destroy();
    worker = null;
  }, 5 * 60 * 1000);
  idleTimer.unref?.();
  return worker;
}

function warmUp() {
  try {
    const w = acquire();
    w.loadURL('about:blank').catch(() => {});
  } catch (err) {
    logger.warn('Raster worker warm-up failed', err.message);
  }
}

const nextFrames = (wc, n = 2) =>
  wc.executeJavaScript(`new Promise(r => { let n = ${n}; const f = () => (--n <= 0 ? r() : requestAnimationFrame(f)); requestAnimationFrame(f); })`);

/**
 * Render HTML at `pixelWidth` device-independent pixels wide and return BGRA pixels.
 * The document's <body> must be `cssWidthMm` millimetres wide; the page is zoomed so that
 * body width == pixelWidth (e.g. 72 mm -> 576 dots), giving crisp text at printer resolution.
 */
async function renderBgra(html, { cssWidthMm, pixelWidth, maxHeightPx = 60000 }) {
  const win = acquire();
  const wc = win.webContents;
  fs.mkdirSync(ctx.paths.temp, { recursive: true });
  const file = path.join(ctx.paths.temp, `render-${Date.now()}-${++seq}.html`);
  fs.writeFileSync(file, html, 'utf8');
  try {
    win.setContentSize(pixelWidth, TILE);
    await win.loadFile(file);
    const cssWidthPx = (cssWidthMm / 25.4) * 96;
    const zoom = pixelWidth / cssWidthPx;
    wc.setZoomFactor(zoom);

    const info = await wc.executeJavaScript(`(async () => {
      await document.fonts.ready;
      await Promise.all([...document.images].map(i => i.complete ? 1 : new Promise(r => { i.onload = i.onerror = r; })));
      await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
      const s = document.createElement('div');
      s.id = '__spacer';
      const h = Math.ceil(document.body.getBoundingClientRect().height);
      s.style.cssText = 'height:' + (${TILE} / ${zoom} + 50) + 'px;width:1px';
      document.body.appendChild(s);
      const imgs = [...document.images].map(i => { const r = i.getBoundingClientRect(); return { x: r.left, y: r.top + window.scrollY, w: r.width, h: r.height }; });
      return { h, imgs };
    })()`);

    const totalH = Math.min(Math.ceil(info.h * zoom), maxHeightPx);
    if (totalH < 4) throw new AppError('Nothing to print.');
    const out = Buffer.alloc(pixelWidth * totalH * 4, 255);

    for (let y = 0; y < totalH; y += TILE) {
      const wantY = y / zoom;
      const scrollY = await wc.executeJavaScript(`(async () => { window.scrollTo(0, ${wantY}); await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))); return window.scrollY; })()`);
      const placeY = Math.round(scrollY * zoom);
      const tileH = Math.min(TILE, totalH - placeY);
      if (tileH <= 0) break;
      let img = await wc.capturePage({ x: 0, y: 0, width: pixelWidth, height: tileH });
      let size = img.getSize();
      if (!size.width || !size.height) throw new AppError('Could not render the receipt image.');
      if (size.width !== pixelWidth) {
        img = img.resize({ width: pixelWidth, height: Math.max(1, Math.round((size.height * pixelWidth) / size.width)), quality: 'best' });
        size = img.getSize();
      }
      const bmp = img.toBitmap();
      const rows = Math.min(size.height, totalH - placeY);
      bmp.copy(out, placeY * pixelWidth * 4, 0, rows * pixelWidth * 4);
    }
    const imgRects = info.imgs.map((r) => ({ x: r.x * zoom, y: r.y * zoom, w: r.w * zoom, h: r.h * zoom }));
    return { width: pixelWidth, height: totalH, bgra: out, imgRects };
  } finally {
    fs.unlink(file, () => {});
  }
}

/** BGRA -> 8-bit gray (composited on white). */
function toGray({ width, height, bgra }) {
  const gray = new Uint8Array(width * height);
  for (let i = 0, p = 0; i < gray.length; i++, p += 4) {
    const a = bgra[p + 3] / 255;
    const b = bgra[p] * a + 255 * (1 - a);
    const g = bgra[p + 1] * a + 255 * (1 - a);
    const r = bgra[p + 2] * a + 255 * (1 - a);
    gray[i] = (r * 299 + g * 587 + b * 114) / 1000;
  }
  return gray;
}

/** Full-colour PNG (for "Save as PNG" / sharing on WhatsApp). */
function toPng({ width, height, bgra }) {
  return nativeImage.createFromBitmap(bgra, { width, height }).toPNG();
}

module.exports = { renderBgra, toGray, toPng, warmUp };
