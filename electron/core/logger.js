'use strict';

const fs = require('fs');
const path = require('path');

let logDir = null;

function init(dir) {
  logDir = dir;
  try {
    fs.mkdirSync(logDir, { recursive: true });
    // Keep only the 14 most recent log files.
    const files = fs.readdirSync(logDir).filter((f) => f.endsWith('.log')).sort();
    files.slice(0, Math.max(0, files.length - 14)).forEach((f) => fs.unlinkSync(path.join(logDir, f)));
  } catch {
    /* logging must never break the app */
  }
}

function write(level, args) {
  const line = `[${new Date().toISOString()}] ${level.toUpperCase()} ${args
    .map((a) => (a instanceof Error ? `${a.message}\n${a.stack}` : typeof a === 'object' ? safeJson(a) : String(a)))
    .join(' ')}\n`;
  if (level === 'error') process.stderr.write(line);
  if (!logDir) return;
  try {
    const file = path.join(logDir, `${new Date().toISOString().slice(0, 10)}.log`);
    fs.appendFileSync(file, line);
  } catch {
    /* ignore */
  }
}

function safeJson(o) {
  try {
    return JSON.stringify(o);
  } catch {
    return String(o);
  }
}

module.exports = {
  init,
  getDir: () => logDir,
  info: (...a) => write('info', a),
  warn: (...a) => write('warn', a),
  error: (...a) => write('error', a),
};
