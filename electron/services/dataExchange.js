'use strict';

/*
 * Full data export / import in portable formats — every table of the database ("A to Z"):
 *   .json  – readable, one row per line, products' pictures as base64
 *   .xlsx  – one worksheet per table (first row = column names) + an "_info" sheet; very long values
 *            (pictures, receipt logos) are split into an "_long" sheet because a cell holds 32,767 characters
 * Import REPLACES all current data (after a safety backup) inside one transaction, so a bad file changes nothing.
 */

const fs = require('fs');
const path = require('path');
const ctx = require('../core/context');
const logger = require('../core/logger');
const { AppError } = require('../core/errors');
const { nowLocal } = require('../core/util');
const { migrations } = require('../db/schema');
const { workbookToXlsx } = require('../printing/xlsx');
const { parseWorkbook } = require('../core/tabular');
const settings = require('./settings');
const backup = require('./backup');

const APP = 'DT Retail POS';
const FORMAT = 1;
const LONG = '@@LONG@@';
const CHUNK = 30000;
const INTERNAL = new Set(['schema_version']);

const q = (n) => `"${String(n).replace(/"/g, '""')}"`;
const schemaVersion = () => migrations[migrations.length - 1].version;
const appVersion = () => {
  try {
    return require('../../package.json').version;
  } catch {
    return '';
  }
};

function tableNames() {
  return ctx.db
    .all("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name")
    .map((r) => r.name)
    .filter((n) => !INTERNAL.has(n));
}

const columnsOf = (t) => ctx.db.all(`PRAGMA table_info(${q(t)})`);
const isBlob = (c) => /BLOB/i.test(c.type || '');
const isInt = (c) => /INT/i.test(c.type || '');
const isReal = (c) => /REAL|FLOA|DOUB|NUM|DEC/i.test(c.type || '');

/** A value as it is written to a file (BLOBs become "base64:…"). */
function outValue(c, v) {
  if (v === null || v === undefined) return null;
  if (v instanceof Uint8Array || Buffer.isBuffer(v)) return `base64:${Buffer.from(v).toString('base64')}`;
  if (typeof v === 'bigint') return Number(v);
  return v;
}

/** Everything in the database: { table: { columns: [names], types: {...}, rows: [[values]] } } */
function snapshot() {
  const out = {};
  for (const t of tableNames()) {
    const cols = columnsOf(t);
    const rows = ctx.db.all(`SELECT * FROM ${q(t)} ORDER BY rowid`).map((r) => cols.map((c) => outValue(c, r[c.name])));
    out[t] = { columns: cols.map((c) => c.name), rows };
  }
  return out;
}

function metaFor(data) {
  return { app: APP, kind: 'data', format: FORMAT, schemaVersion: schemaVersion(), appVersion: appVersion(), exportedAt: nowLocal(), counts: Object.fromEntries(Object.entries(data).map(([t, d]) => [t, d.rows.length])) };
}

// ------------------------------------------------------------------ export
function toJson(data, meta) {
  const parts = Object.entries(data).map(([t, d]) => {
    const lines = d.rows.map((r) => `      ${JSON.stringify(Object.fromEntries(d.columns.map((c, i) => [c, r[i]])))}`);
    return `    ${JSON.stringify(t)}: [${lines.length ? `\n${lines.join(',\n')}\n    ` : ''}]`;
  });
  return `{\n  "meta": ${JSON.stringify(meta)},\n  "tables": {\n${parts.join(',\n')}\n  }\n}\n`;
}

function toXlsx(data, meta) {
  const sheets = [];
  const info = [
    ['app', meta.app], ['kind', meta.kind], ['format', meta.format], ['schemaVersion', meta.schemaVersion], ['appVersion', meta.appVersion], ['exportedAt', meta.exportedAt],
    ...Object.entries(meta.counts).map(([t, n]) => [`rows:${t}`, n]),
    ['note', 'Edit values only. Do not rename the sheets or the first row of each sheet. Importing this file in Settings -> Backup replaces ALL data.'],
  ];
  sheets.push({ name: '_info', rows: [[{ v: 'key', bold: true }, { v: 'value', bold: true }], ...info.map(([k, v]) => [{ v: k, bold: true }, { v, t: typeof v === 'number' ? 'g' : 's' }])], widths: [24, 70] });
  const long = [];
  for (const [t, d] of Object.entries(data)) {
    const rows = [d.columns.map((c) => ({ v: c, bold: true }))];
    for (const r of d.rows) {
      rows.push(
        r.map((v, i) => {
          if (v === null || v === undefined) return null;
          if (typeof v === 'number') return { v, t: 'g' };
          const text = String(v);
          if (text.length <= CHUNK) return { v: text, t: 's' };
          for (let p = 0, n = 0; p < text.length; p += CHUNK, n++) long.push([t, String(r[0]), d.columns[i], n, text.slice(p, p + CHUNK)]);
          return { v: LONG, t: 's' };
        }),
      );
    }
    sheets.push({ name: t, rows, widths: d.columns.map((c) => Math.min(40, Math.max(10, c.length + 2))) });
  }
  if (long.length) {
    sheets.push({ name: '_long', rows: [['table', 'key', 'column', 'part', 'text'].map((v) => ({ v, bold: true })), ...long.map((r) => r.map((v, i) => ({ v, t: i === 3 ? 'g' : 's' })))], widths: [18, 14, 18, 8, 60] });
  }
  return workbookToXlsx(sheets);
}

function defaultName(format) {
  const stamp = nowLocal().replace(/[: ]/g, '-').replace(/-(\d\d)-(\d\d)$/, '_$1$2');
  return `RetailPOS-Data-${stamp}.${format === 'xlsx' ? 'xlsx' : 'json'}`;
}

/** Write a full export to `file`. format: 'json' | 'xlsx' */
function exportTo({ file, format }) {
  if (!file) throw new AppError('Choose where to save the file.');
  if (!['json', 'xlsx'].includes(format)) throw new AppError('Unknown format.');
  const data = snapshot();
  const meta = metaFor(data);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, format === 'xlsx' ? toXlsx(data, meta) : toJson(data, meta));
  logger.info('Data exported', format, file);
  return { file, size: fs.statSync(file).size, format, counts: meta.counts, total: Object.values(meta.counts).reduce((a, b) => a + b, 0) };
}

// ------------------------------------------------------------------ read
/** Parse a file into { meta, tables: { name: { columns, rows: [[...]] } } } with raw (JSON-typed or string) values. */
function readFile(file) {
  if (!file || !fs.existsSync(file)) throw new AppError('File not found.');
  const buf = fs.readFileSync(file);
  const isZip = buf.length > 3 && buf[0] === 0x50 && buf[1] === 0x4b;
  let meta;
  const tables = {};
  if (isZip) {
    const sheets = parseWorkbook(buf);
    const byName = new Map(sheets.map((s) => [s.name.toLowerCase(), s]));
    const infoSheet = byName.get('_info');
    if (!infoSheet) throw new AppError(`This Excel file was not exported from ${APP} (the "_info" sheet is missing).`);
    meta = Object.fromEntries(infoSheet.rows.slice(1).map((r) => [r[0], r[1]]));
    meta.format = Number(meta.format);
    meta.schemaVersion = Number(meta.schemaVersion);
    const long = new Map();
    const ls = byName.get('_long');
    if (ls) {
      for (const [t, key, col, part, text] of ls.rows.slice(1)) {
        const k = `${t}|${key}|${col}`;
        if (!long.has(k)) long.set(k, []);
        long.get(k)[Number(part) || 0] = text;
      }
    }
    for (const sh of sheets) {
      if (sh.name.startsWith('_') || !sh.rows.length) continue;
      const header = sh.rows[0];
      const rows = sh.rows.slice(1).filter((r) => r.some((c) => c !== ''));
      for (const r of rows) {
        r.forEach((v, i) => {
          if (v === LONG) r[i] = (long.get(`${sh.name}|${r[0]}|${header[i]}`) || []).join('');
        });
      }
      tables[sh.name] = { columns: header, rows };
    }
  } else {
    let j;
    try {
      j = JSON.parse(buf.toString('utf8').replace(/^﻿/, ''));
    } catch {
      throw new AppError('This file is not valid JSON or Excel (.xlsx).');
    }
    meta = j && j.meta;
    if (!meta || !j.tables || typeof j.tables !== 'object') throw new AppError(`This is not a ${APP} data file.`);
    for (const [t, rows] of Object.entries(j.tables)) {
      const list = Array.isArray(rows) ? rows : [];
      const cols = [...new Set(list.flatMap((r) => Object.keys(r || {})))];
      tables[t] = { columns: cols, rows: list.map((r) => cols.map((c) => (r[c] === undefined ? null : r[c]))) };
    }
  }
  if (!meta || meta.app !== APP) throw new AppError(`This is not a ${APP} data file.`);
  if (Number(meta.schemaVersion) > schemaVersion()) throw new AppError('This file was exported from a newer version of the software. Please update the software first.');
  return { meta, tables, format: isZip ? 'xlsx' : 'json' };
}

/** What a file contains, without changing anything. */
function inspect({ file }) {
  const { meta, tables, format } = readFile(file);
  const known = new Set(tableNames());
  const counts = Object.entries(tables).map(([name, t]) => ({ name, rows: t.rows.length, known: known.has(name) }));
  for (const need of ['users', 'settings']) {
    if (!tables[need] || !tables[need].rows.length) throw new AppError(`The file has no "${need}" data, so it cannot be a complete export.`);
  }
  return { file, format, exportedAt: meta.exportedAt || '', appVersion: meta.appVersion || '', schemaVersion: Number(meta.schemaVersion) || 0, counts, total: counts.reduce((a, c) => a + (c.known ? c.rows : 0), 0), orders: tables.orders ? tables.orders.rows.length : 0, products: tables.products ? tables.products.rows.length : 0 };
}

// ------------------------------------------------------------------ import
function coerce(c, v, where) {
  const empty = v === undefined || v === null || v === '';
  if (empty) {
    if (c.pk) return null; // let AUTOINCREMENT / the key rule decide
    if (!c.notnull || c.dflt_value !== null) return null; // NULL, or COALESCE(?, default) in the statement
    return isInt(c) || isReal(c) ? 0 : '';
  }
  if (isBlob(c)) return typeof v === 'string' && v.startsWith('base64:') ? Buffer.from(v.slice(7), 'base64') : null;
  if (isInt(c) || isReal(c)) {
    const n = typeof v === 'boolean' ? (v ? 1 : 0) : Number(v);
    if (!Number.isFinite(n)) throw new AppError(`${where}: "${v}" is not a number.`);
    return n;
  }
  return typeof v === 'object' ? JSON.stringify(v) : String(v);
}

/** Replace ALL data by the contents of a JSON / Excel export. */
async function importFrom({ file }) {
  const info = inspect({ file }); // validates
  const { tables } = readFile(file);
  const safety = await backup.create({ targetFolder: ctx.paths.backups, kind: 'pre-restore' });
  const schema = new Map(tableNames().map((t) => [t, columnsOf(t)]));
  const db = ctx.db;
  db.exec('PRAGMA foreign_keys = OFF');
  try {
    db.transaction(() => {
      for (const t of schema.keys()) db.exec(`DELETE FROM ${q(t)}`);
      for (const [t, cols] of schema) {
        const src = tables[t] || tables[Object.keys(tables).find((k) => k.toLowerCase() === t.toLowerCase())];
        if (!src || !src.rows.length) continue;
        const idx = new Map(src.columns.map((c, i) => [String(c).trim().toLowerCase(), i]));
        const use = cols.filter((c) => idx.has(c.name.toLowerCase()));
        if (!use.length) continue;
        const sql = `INSERT INTO ${q(t)} (${use.map((c) => q(c.name)).join(', ')}) VALUES (${use.map((c) => (c.notnull && c.dflt_value !== null && !c.pk ? `COALESCE(?, ${c.dflt_value})` : '?')).join(', ')})`;
        const stmt = db.db.prepare(sql);
        src.rows.forEach((row, n) => {
          const where = `${t}, row ${n + 2}`;
          try {
            stmt.run(...use.map((c) => coerce(c, row[idx.get(c.name.toLowerCase())], where)));
          } catch (err) {
            if (err instanceof AppError) throw err;
            throw new AppError(`Could not import ${where}: ${String(err.message).replace(/^.*?:\s*/, '')}`);
          }
        });
      }
      const bad = db.db.prepare('PRAGMA foreign_key_check').all();
      if (bad.length) {
        const b = bad[0];
        throw new AppError(`The file is inconsistent: a row of "${b.table}" points to a missing record in "${b.parent}" (${bad.length} problem${bad.length > 1 ? 's' : ''}). Nothing was changed.`);
      }
    });
  } finally {
    db.exec('PRAGMA foreign_keys = ON');
    settings.clearCache();
    ctx.user = null;
  }
  logger.info('Data imported from', file);
  return { imported: true, safetyBackup: safety.file, total: info.total, orders: info.orders, products: info.products };
}

module.exports = { exportTo, inspect, importFrom, defaultName, snapshot, readFile };
