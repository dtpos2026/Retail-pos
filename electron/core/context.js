'use strict';

/**
 * Process-wide state for the main process: the open database, the logged-in
 * user and resolved paths. Services read from here instead of importing
 * Electron so they stay testable in plain Node.
 */
const ctx = {
  db: null,
  user: null,
  paths: {
    userData: null,
    dbFile: null,
    backups: null,
    logs: null,
    temp: null,
    assets: null,
  },
};

module.exports = ctx;
