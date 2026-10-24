'use strict';

class PostgresError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'PostgresError';
    this.code = code;
  }
}

function safeFailure(error) {
  if (error instanceof PostgresError) return error;
  const code = error?.code ?? error?.errorCode;
  return new PostgresError(
    code === 'P1000' ? 'PG_AUTHENTICATION' : 'PG_UNAVAILABLE',
    code === 'P1000' ? 'PostgreSQL authentication failed.' : 'PostgreSQL is unavailable or initialization failed.'
  );
}

module.exports = { PostgresError, safeFailure };
