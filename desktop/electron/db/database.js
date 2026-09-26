'use strict';

const fs = require('fs');
const path = require('path');
const { DatabaseSync } = require('node:sqlite');
const { migrations } = require('./schema');
const logger = require('../core/logger');

/**
 * Thin wrapper around node:sqlite with:
 *  - WAL + synchronous=FULL for crash / power-failure safety
 *  - cached prepared statements
 *  - nested transactions via savepoints
 *  - parameter sanitising (booleans / undefined are not accepted by node:sqlite)
 */
class Database {
  constructor(file) {
    this.file = file;
    this.stmts = new Map();
    this.depth = 0;
    this.open();
  }

  open() {
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    this.db = new DatabaseSync(this.file);
    this.db.exec('PRAGMA journal_mode = WAL;');
    this.db.exec('PRAGMA synchronous = FULL;');
    this.db.exec('PRAGMA foreign_keys = ON;');
    this.db.exec('PRAGMA busy_timeout = 5000;');
    this.stmts.clear();
    this.migrate();
  }

  close() {
    try {
      this.db.exec('PRAGMA wal_checkpoint(TRUNCATE);');
    } catch {
      /* ignore */
    }
    this.stmts.clear();
    this.db.close();
    this.db = null;
  }

  migrate() {
    this.db.exec('CREATE TABLE IF NOT EXISTS schema_version (version INTEGER NOT NULL)');
    const row = this.db.prepare('SELECT version FROM schema_version LIMIT 1').get();
    let version = row ? row.version : 0;
    if (!row) this.db.prepare('INSERT INTO schema_version (version) VALUES (0)').run();
    for (const m of migrations) {
      if (m.version <= version) continue;
      logger.info(`Applying migration ${m.version}`);
      this.transaction(() => {
        this.db.exec(m.sql);
        this.db.prepare('UPDATE schema_version SET version = ?').run(m.version);
      });
      version = m.version;
    }
  }

  stmt(sql) {
    let s = this.stmts.get(sql);
    if (!s) {
      s = this.db.prepare(sql);
      this.stmts.set(sql, s);
    }
    return s;
  }

  static clean(params) {
    const fix = (v) => (v === undefined ? null : typeof v === 'boolean' ? (v ? 1 : 0) : v);
    if (Array.isArray(params)) return params.map(fix);
    if (params && typeof params === 'object' && !(params instanceof Uint8Array)) {
      const out = {};
      for (const k of Object.keys(params)) out[k] = fix(params[k]);
      return out;
    }
    return fix(params);
  }

  args(params) {
    if (params === undefined) return [];
    if (Array.isArray(params)) return Database.clean(params);
    return [Database.clean(params)];
  }

  get(sql, params) {
    return this.stmt(sql).get(...this.args(params));
  }

  all(sql, params) {
    return this.stmt(sql).all(...this.args(params));
  }

  run(sql, params) {
    const r = this.stmt(sql).run(...this.args(params));
    return { changes: Number(r.changes), lastInsertRowid: Number(r.lastInsertRowid) };
  }

  exec(sql) {
    this.db.exec(sql);
  }

  transaction(fn) {
    const sp = `sp_${this.depth}`;
    if (this.depth === 0) this.db.exec('BEGIN IMMEDIATE');
    else this.db.exec(`SAVEPOINT ${sp}`);
    this.depth++;
    try {
      const result = fn();
      this.depth--;
      if (this.depth === 0) this.db.exec('COMMIT');
      else this.db.exec(`RELEASE ${sp}`);
      return result;
    } catch (err) {
      this.depth--;
      if (this.depth === 0) this.db.exec('ROLLBACK');
      else this.db.exec(`ROLLBACK TO ${sp}; RELEASE ${sp}`);
      throw err;
    }
  }

  integrityCheck() {
    const r = this.db.prepare('PRAGMA integrity_check').get();
    return r && Object.values(r)[0] === 'ok';
  }
}

module.exports = { Database };
