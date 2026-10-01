'use strict';

/*
 * Reads spreadsheet data into rows of strings:
 *   .xlsx  – minimal reader (zip + sharedStrings + first worksheet), no dependencies
 *   .csv / .txt – RFC-4180 style parser, comma / semicolon / tab detected
 */

const zlib = require('zlib');
const { AppError } = require('./errors');

function unzip(buf) {
  // Find the end-of-central-directory record.
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65557); i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new AppError('This file is not a valid Excel (.xlsx) file.');
  const count = buf.readUInt16LE(eocd + 10);
  let p = buf.readUInt32LE(eocd + 16);
  const files = new Map();
  for (let n = 0; n < count; n++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) break;
    const method = buf.readUInt16LE(p + 10);
    const csize = buf.readUInt32LE(p + 20);
    const nlen = buf.readUInt16LE(p + 28);
    const elen = buf.readUInt16LE(p + 30);
    const clen = buf.readUInt16LE(p + 32);
    const lho = buf.readUInt32LE(p + 42);
    const name = buf.toString('utf8', p + 46, p + 46 + nlen);
    p += 46 + nlen + elen + clen;
    const lnlen = buf.readUInt16LE(lho + 26);
    const lelen = buf.readUInt16LE(lho + 28);
    const start = lho + 30 + lnlen + lelen;
    const raw = buf.subarray(start, start + csize);
    files.set(name, () => (method === 0 ? raw : zlib.inflateRawSync(raw)));
  }
  return files;
}

const decodeXml = (s) =>
  s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&amp;/g, '&');

function colIndex(ref) {
  const letters = /^[A-Z]+/i.exec(ref)[0].toUpperCase();
  let n = 0;
  for (const ch of letters) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}

function textOf(xml) {
  // concatenates all <t> runs (rich text safe)
  const out = [];
  const re = /<t[^>]*>([\s\S]*?)<\/t>/g;
  let m;
  while ((m = re.exec(xml))) out.push(decodeXml(m[1]));
  return out.join('');
}

/** Rows of one worksheet XML (cells as strings, gaps filled with ''). */
function sheetRows(sheet, shared) {
  const rows = [];
  const rowRe = /<row[^>]*>([\s\S]*?)<\/row>/g;
  let rm;
  while ((rm = rowRe.exec(sheet))) {
    const cells = [];
    const cellRe = /<c ([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g;
    let cm;
    let next = 0;
    while ((cm = cellRe.exec(rm[1]))) {
      const attrs = cm[1];
      const ref = /r="([A-Z]+\d+)"/i.exec(attrs);
      const idx = ref ? colIndex(ref[1]) : next;
      next = idx + 1;
      const type = (/t="(\w+)"/.exec(attrs) || [])[1];
      const body = cm[2] || '';
      let val = '';
      if (type === 's') val = shared[Number((/<v>([\s\S]*?)<\/v>/.exec(body) || [])[1])] || '';
      else if (type === 'inlineStr') val = textOf(body);
      else {
        const v = /<v>([\s\S]*?)<\/v>/.exec(body);
        val = v ? decodeXml(v[1]) : '';
      }
      cells[idx] = val;
    }
    rows.push(Array.from(cells, (c) => (c === undefined ? '' : String(c))));
  }
  return rows;
}

/** Every worksheet of an .xlsx file, in workbook order: [{ name, rows }]. */
function parseWorkbook(buf) {
  const files = unzip(buf);
  const get = (n) => (files.has(n) ? files.get(n)().toString('utf8') : null);
  const shared = [];
  const sst = get('xl/sharedStrings.xml');
  if (sst) {
    const re = /<si[^>]*>([\s\S]*?)<\/si>/g;
    let m;
    while ((m = re.exec(sst))) shared.push(textOf(m[1]));
  }
  const wb = get('xl/workbook.xml');
  const rels = get('xl/_rels/workbook.xml.rels');
  const out = [];
  if (wb && rels) {
    const sheetRe = /<sheet\s[^>]*>/g;
    let sm;
    while ((sm = sheetRe.exec(wb))) {
      const name = decodeXml((/name="([^"]*)"/.exec(sm[0]) || [])[1] || `Sheet${out.length + 1}`);
      const rid = /r:id="([^"]+)"/.exec(sm[0]);
      if (!rid) continue;
      const rel = new RegExp(`<Relationship [^>]*Id="${rid[1]}"[^>]*>`).exec(rels);
      const target = rel && /Target="([^"]+)"/.exec(rel[0]);
      if (!target) continue;
      const sheetPath = target[1].startsWith('/') ? target[1].slice(1) : `xl/${target[1].replace(/^\.\//, '')}`;
      const xml = get(sheetPath);
      if (xml) out.push({ name, rows: sheetRows(xml, shared) });
    }
  }
  if (!out.length) {
    const xml = get('xl/worksheets/sheet1.xml');
    if (!xml) throw new AppError('Could not find a worksheet in this Excel file.');
    out.push({ name: 'Sheet1', rows: sheetRows(xml, shared) });
  }
  return out;
}

/** First worksheet only (menu import etc.). */
function parseXlsx(buf) {
  return parseWorkbook(buf)[0].rows;
}

function parseCsv(text) {
  text = text.replace(/^﻿/, '');
  const first = text.split(/\r?\n/, 1)[0] || '';
  const delim = [',', ';', '\t'].map((d) => [d, first.split(d).length]).sort((a, b) => b[1] - a[1])[0][0];
  const rows = [];
  let row = [];
  let cur = '';
  let q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          cur += '"';
          i++;
        } else q = false;
      } else cur += ch;
    } else if (ch === '"') q = true;
    else if (ch === delim) {
      row.push(cur);
      cur = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(cur);
      rows.push(row);
      row = [];
      cur = '';
    } else cur += ch;
  }
  if (cur !== '' || row.length) {
    row.push(cur);
    rows.push(row);
  }
  return rows;
}

/** @returns {string[][]} non-empty rows */
function parseTable(buf, filename = '') {
  let rows;
  if (buf.length > 3 && buf[0] === 0x50 && buf[1] === 0x4b) rows = parseXlsx(buf);
  else if (/\.xls$/i.test(filename) || (buf[0] === 0xd0 && buf[1] === 0xcf)) throw new AppError('Old .xls files are not supported. In Excel choose File → Save As → "Excel Workbook (.xlsx)" or CSV.');
  else rows = parseCsv(buf.toString('utf8'));
  return rows.map((r) => r.map((c) => String(c ?? '').trim())).filter((r) => r.some((c) => c !== ''));
}

module.exports = { parseTable, parseXlsx, parseWorkbook, parseCsv };
