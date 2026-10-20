import {createHash, randomBytes} from 'node:crypto';
import {AuthError} from '../errors';
export function resetDigest(secret: unknown): string {
  if (typeof secret !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(secret)) throw new AuthError('AUTH_RESET');
  return createHash('sha256').update(secret, 'utf8').digest('hex');
}
export function resetCredential(seconds: number, now = new Date()): {secret: string; digest: string; expiresAt: Date} {
  const secret = randomBytes(32).toString('base64url');
  return {secret, digest: resetDigest(secret), expiresAt: new Date(now.getTime() + seconds * 1000)};
}
