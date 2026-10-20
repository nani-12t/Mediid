export class PostgresError extends Error {
  constructor(public readonly code: string, message: string) { super(message); this.name = 'PostgresError'; }
}
export function safeFailure(error: unknown): PostgresError {
  if (error instanceof PostgresError) return error;
  const code = (error as {code?: unknown;errorCode?:unknown})?.code ?? (error as {errorCode?:unknown})?.errorCode;
  return new PostgresError(code === 'P1000' ? 'PG_AUTHENTICATION' : 'PG_UNAVAILABLE',
    code === 'P1000' ? 'PostgreSQL authentication failed.' : 'PostgreSQL is unavailable or initialization failed.');
}
