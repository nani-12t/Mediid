export type AuthCode = 'AUTH_CONFIG' | 'AUTH_INPUT' | 'AUTH_CREDENTIALS' | 'AUTH_TOKEN' | 'AUTH_CONFLICT' | 'AUTH_FORBIDDEN' | 'AUTH_UNAVAILABLE' | 'AUTH_RESET';
const responses: Record<AuthCode, {status: number; message: string}> = {
  AUTH_CONFIG: {status: 503, message: 'Authentication is unavailable.'},
  AUTH_INPUT: {status: 400, message: 'Invalid authentication input.'},
  AUTH_CREDENTIALS: {status: 401, message: 'Invalid credentials.'},
  AUTH_TOKEN: {status: 401, message: 'Invalid or expired authentication token.'},
  AUTH_CONFLICT: {status: 409, message: 'Identity cannot be registered.'},
  AUTH_FORBIDDEN: {status: 403, message: 'Access denied.'},
  AUTH_UNAVAILABLE: {status: 503, message: 'Authentication is unavailable.'},
  AUTH_RESET: {status: 400, message: 'Invalid or expired reset credential.'}
};
export class AuthError extends Error {
  constructor(readonly code: AuthCode) { super(responses[code].message); this.name = 'AuthError'; }
}
export function authResponse(error: unknown): {status: number; body: {code: AuthCode; message: string}} {
  const code = error instanceof AuthError ? error.code : 'AUTH_UNAVAILABLE';
  return {status: responses[code].status, body: {code, message: responses[code].message}};
}
