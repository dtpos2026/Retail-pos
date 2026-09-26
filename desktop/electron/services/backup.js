'use strict';

const fs = require('fs');
const path = require('path');
const { DatabaseSync, backup: sqliteBackup } = require('node:sqlite');
const ctx = require('../core/context');
const settings = require('./settings');
const logger = require('../core/logger');
const { AppError } = require('../core/errors');
const { nowLocal } = require('../core/util');
const { migrations } = require('../db/schema');

const EXT = '.rposbak';

function folder() {
  const f = settings.get('backup').folder;
  return f && fs.existsSync(f) ? f : ctx.paths.backups;
}

function stamp() {
  return nowLocal().replace(/[: ]/g, '-').replace(/-(\d\d)-(\d\d)$/, '_$1$2');
}

function verifyFile(file) {
  let db;
  try {
    db = new DatabaseSync(file, { readOnly: true });
    const ok = db.prepare('PRAGMA integrity_check').get();
    if (!ok || Object.values(ok)[0] !== 'ok') throw new Error('integrity check failed');
    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all().map((r) => r.name);
    for (const t of ['users', 'orders', 'products', 'settings', 'schema_version']) {
      if (!tables.includes(t)) throw new Error(`missing table ${t}`);
    }
    const v = db.prepare('SELECT version FROM schema_version').get().version;
    const latest = migrations[migrations.length - 1].version;
    if (v > latest) throw new AppError('This backup was made with a newer version of Retail POS. Please update the software first.');
    const counts = {
      orders: db.prepare('SELECT COUNT(*) c FROM orders').get().c,
      products: db.prepare('SELECT COUNT(*) c FROM products').get().c,
      users: db.prepare('SELECT COUNT(*) c FROM users').get().c,
    };
    return { version: v, counts };
  } catch (err) {
    if (err instanceof AppError) throw err;
    logger.error('Backup verification failed', file, err);
    throw new AppError('This file is not a valid Retail POS backup or it is damaged.');
  } finally {
    if (db) db.close();
  }
}

async function create({ targetFolder, kind = 'manual' } = {}) {
  const dir = targetFolder || folder();
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `RetailPOS-${{ auto: 'Auto', 'pre-restore': 'PreRestore' }[kind] || 'Backup'}-${stamp()}${EXT}`);
  try {
    ctx.db.exec('PRAGMA wal_checkpoint(PASSIVE);');
    await sqliteBackup(ctx.db.db, file);
  } catch (err) {
    logger.error('Backup failed', err);
    throw new AppError('Backup failed. Check that the folder exists and is writable.');
  }
  const info = verifyFile(file);
  const size = fs.statSync(file).size;
  settings.set('backup', { lastBackupAt: nowLocal(), lastBackupFile: file });
  if (kind === 'auto') prune(dir);
  logger.info('Backup created', file);
  return { file, size, ...info };
}

function prune(dir) {
  const keep = Math.max(3, settings.get('backup').keep || 15);
  const files = fs
    .readdirSync(dir)
    .filter((f) => f.startsWith('RetailPOS-Auto-') && f.endsWith(EXT))
    .sort();
  files.slice(0, Math.max(0, files.length - keep)).forEach((f) => {
    try {
      fs.unlinkSync(path.join(dir, f));
    } catch {
      /* ignore */
    }
  });
}

function list() {
  const dir = folder();
  if (!fs.existsSync(dir)) return { folder: dir, files: [] };
  const files = fs
    .readdirSync(dir)
    .filter((f) => f.endsWith(EXT))
    .map((f) => {
      const st = fs.statSync(path.join(dir, f));
      return { name: f, file: path.join(dir, f), size: st.size, modified: st.mtime.toISOString() };
    })
    .sort((a, b) => b.modified.localeCompare(a.modified));
  return { folder: dir, files };
}

async function autoIfDue() {
  const cfg = settings.get('backup');
  if (!cfg.autoBackup) return null;
  if (cfg.lastBackupAt) {
    const last = new Date(cfg.lastBackupAt.replace(' ', 'T'));
    if (Date.now() - last.getTime() < 20 * 3600 * 1000) return null;
  }
  try {
    return await create({ kind: 'auto' });
  } catch (err) {
    logger.error('Auto backup failed', err);
    return null;
  }
}

/**
 * Replace the live database with a backup. A safety copy of the current data is
 * written first so a wrong restore can be undone.
 */
async function restore({ file }) {
  if (!file || !fs.existsSync(file)) throw new AppError('Backup file not found.');
  const info = verifyFile(file);
  const safety = await create({ targetFolder: ctx.paths.backups, kind: 'pre-restore' });
  const dbFile = ctx.paths.dbFile;
  ctx.db.close();
  try {
    for (const ext of ['-wal', '-shm']) {
      if (fs.existsSync(dbFile + ext)) fs.unlinkSync(dbFile + ext);
    }
    fs.copyFileSync(file, dbFile);
  } catch (err) {
    logger.error('Restore copy failed', err);
    fs.copyFileSync(safety.file, dbFile);
    throw new AppError('Restore failed. Your current data was kept.');
  } finally {
    ctx.db.open();
    settings.clearCache();
    ctx.user = null;
  }
  logger.info('Database restored from', file);
  return { restored: true, safetyBackup: safety.file, ...info };
}

module.exports = { EXT, create, list, restore, autoIfDue, verifyFile, folder };
