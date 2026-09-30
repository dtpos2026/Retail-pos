'use strict';

/*
 * ESC/POS encoder for thermal receipt printers.
 *
 * The whole receipt (any template, any language, logo, boxes) is rendered as an
 * image and sent as raster bands. The printer therefore prints exactly what the
 * template looks like, feeds only what we ask for, and cuts right after — with no
 * dependency on the Windows driver's page size (which is what caused blank paper
 * at the top of receipts).
 */

const ESC = 0x1b;
const GS = 0x1d;

/** Printable dots per line for a paper width (203 dpi = 8 dots/mm). */
function dotsForPaper(paperMm, override) {
  if (override && override % 8 === 0) return override;
  return Number(paperMm) === 58 ? 384 : 576;
}

/** Printable width in millimetres for a dot count. */
function mmForDots(dots) {
  return dots / 8;
}

const DARKNESS = { light: 185, normal: 150, dark: 120 };

/**
 * Pack a grayscale image into 1-bit rows (1 = black), MSB first.
 * @param {Uint8Array} gray width*height gray values (0 black .. 255 white)
 * @param {{x:number,y:number,w:number,h:number}[]} ditherRects regions (dots) that get error-diffusion dithering (logos)
 */
function packBitmap(gray, width, height, { threshold = 150, ditherRects = [] } = {}) {
  const work = gray;
  // Floyd–Steinberg only inside picture regions so text stays crisp.
  for (const r of ditherRects) {
    const x0 = Math.max(0, Math.floor(r.x));
    const y0 = Math.max(0, Math.floor(r.y));
    const x1 = Math.min(width, Math.ceil(r.x + r.w));
    const y1 = Math.min(height, Math.ceil(r.y + r.h));
    if (x1 <= x0 || y1 <= y0) continue;
    const w = x1 - x0;
    const h = y1 - y0;
    const buf = new Float32Array(w * h);
    // Contrast curve first: dark brand colours become solid black, light tints become white,
    // and only true mid-tones get dithered.
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const v = work[(y0 + y) * width + x0 + x];
        buf[y * w + x] = Math.max(0, Math.min(255, ((v - 85) * 255) / (215 - 85)));
      }
    }
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = y * w + x;
        const old = buf[i];
        const nv = old < 128 ? 0 : 255;
        buf[i] = nv;
        const err = old - nv;
        if (x + 1 < w) buf[i + 1] += (err * 7) / 16;
        if (y + 1 < h) {
          if (x > 0) buf[i + w - 1] += (err * 3) / 16;
          buf[i + w] += (err * 5) / 16;
          if (x + 1 < w) buf[i + w + 1] += err / 16;
        }
      }
    }
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) work[(y0 + y) * width + x0 + x] = buf[y * w + x] < 128 ? 0 : 255;
  }

  const rowBytes = Math.ceil(width / 8);
  const out = Buffer.alloc(rowBytes * height);
  for (let y = 0; y < height; y++) {
    const rowStart = y * width;
    const outStart = y * rowBytes;
    for (let bx = 0; bx < rowBytes; bx++) {
      let byte = 0;
      const base = bx * 8;
      for (let b = 0; b < 8; b++) {
        const x = base + b;
        if (x < width && work[rowStart + x] < threshold) byte |= 0x80 >> b;
      }
      out[outStart + bx] = byte;
    }
  }
  return { width: rowBytes * 8, height, rowBytes, data: out };
}

/** Remove fully blank rows at the end (the HTML's own bottom margin is re-added by feed). */
function trimBlankTail(bitmap, keepRows = 0) {
  const { rowBytes, data } = bitmap;
  let last = bitmap.height - 1;
  while (last >= 0) {
    let blank = true;
    const s = last * rowBytes;
    for (let i = 0; i < rowBytes; i++) {
      if (data[s + i] !== 0) {
        blank = false;
        break;
      }
    }
    if (!blank) break;
    last--;
  }
  const height = Math.min(bitmap.height, last + 1 + keepRows);
  return { ...bitmap, height, data: data.subarray(0, height * rowBytes) };
}

/**
 * Build the complete print job.
 * @param {{width:number,height:number,rowBytes:number,data:Buffer}} bitmap
 * @param {{cut?:'partial'|'full'|'none', feedMm?:number, compatCut?:boolean, copies?:number, band?:number}} opts
 */
function buildJob(bitmap, { cut = 'partial', feedMm = 3, compatCut = false, copies = 1, band = 240 } = {}) {
  const parts = [];
  for (let c = 0; c < Math.max(1, copies); c++) {
    parts.push(Buffer.from([ESC, 0x40])); // initialise
    for (let y = 0; y < bitmap.height; y += band) {
      const rows = Math.min(band, bitmap.height - y);
      const head = Buffer.from([GS, 0x76, 0x30, 0x00, bitmap.rowBytes & 0xff, (bitmap.rowBytes >> 8) & 0xff, rows & 0xff, (rows >> 8) & 0xff]);
      parts.push(head, bitmap.data.subarray(y * bitmap.rowBytes, (y + rows) * bitmap.rowBytes));
    }
    const feedDots = Math.max(0, Math.min(255, Math.round(feedMm * 8)));
    if (cut === 'none') {
      // Leave a little paper to tear off.
      parts.push(Buffer.from([ESC, 0x4a, Math.max(feedDots, 96)]));
    } else if (compatCut) {
      parts.push(Buffer.from([ESC, 0x4a, Math.max(feedDots, 100)])); // feed past the cutter
      parts.push(Buffer.from([GS, 0x56, cut === 'full' ? 0x00 : 0x01]));
    } else {
      if (feedDots) parts.push(Buffer.from([ESC, 0x4a, feedDots]));
      parts.push(Buffer.from([GS, 0x56, cut === 'full' ? 0x41 : 0x42, 0x00])); // feed to cutter + cut
    }
  }
  return Buffer.concat(parts);
}

/**
 * Decode a job produced by buildJob back into a 1-bit image (used by tests and by the
 * developer "dump" mode to preview exactly what the printer would print).
 */
function decodeJob(buf) {
  let i = 0;
  const rows = [];
  let rowBytes = 0;
  let cuts = 0;
  let feeds = 0;
  while (i < buf.length) {
    if (buf[i] === ESC && buf[i + 1] === 0x40) i += 2;
    else if (buf[i] === ESC && buf[i + 1] === 0x4a) {
      feeds += buf[i + 2];
      i += 3;
    } else if (buf[i] === GS && buf[i + 1] === 0x76 && buf[i + 2] === 0x30) {
      rowBytes = buf[i + 4] | (buf[i + 5] << 8);
      const h = buf[i + 6] | (buf[i + 7] << 8);
      i += 8;
      for (let y = 0; y < h; y++) rows.push(buf.subarray(i + y * rowBytes, i + (y + 1) * rowBytes));
      i += rowBytes * h;
    } else if (buf[i] === GS && buf[i + 1] === 0x56) {
      cuts++;
      i += buf[i + 2] >= 65 ? 4 : 3;
    } else throw new Error(`Unknown ESC/POS command at ${i}: ${buf[i].toString(16)}`);
  }
  return { rowBytes, width: rowBytes * 8, height: rows.length, rows, cuts, feedDots: feeds };
}

module.exports = { dotsForPaper, mmForDots, DARKNESS, packBitmap, trimBlankTail, buildJob, decodeJob };
