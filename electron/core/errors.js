'use strict';

/**
 * AppError carries a message that is safe to show to cashiers.
 * Any other thrown error is logged and replaced with a generic message.
 */
class AppError extends Error {
  constructor(message, code = 'APP_ERROR') {
    super(message);
    this.name = 'AppError';
    this.code = code;
    this.userFacing = true;
  }
}

function fail(message, code) {
  throw new AppError(message, code);
}

function assert(condition, message, code) {
  if (!condition) throw new AppError(message, code);
}

module.exports = { AppError, fail, assert };
