import {UserRole} from '@prisma/client';
import {AuthError} from './errors';
export const roles: readonly string[] = Object.values(UserRole);
export function canonicalEmail(value: unknown): string {
  if (typeof value !== 'string') throw new AuthError('AUTH_INPUT');
  const trimmed = value.trim();
  if (!/^[!-~]+$/.test(trimmed)) throw new AuthError('AUTH_INPUT');
  const email = trimmed.toLowerCase();
  // Deliberately no provider-specific dot/plus rewrites or Unicode address guessing.
  if (email.length > 255 || !/^[a-z0-9.!#$%&'*+\/=?^_\x60{|}~-]+@[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?\.[a-z]{2,63}$/.test(email)) throw new AuthError('AUTH_INPUT');
  return email;
}
export function canonicalUid(value: unknown): string {
  if (typeof value !== 'string') throw new AuthError('AUTH_INPUT');
  const trimmed = value.trim();
  if (!/^[a-zA-Z0-9]+(?:-[a-zA-Z0-9]+)+$/.test(trimmed) || trimmed.length > 64) throw new AuthError('AUTH_INPUT');
  return trimmed.toUpperCase();
}
export function loginIdentity(value: unknown): {email: string} | {uid: string} {
  return typeof value === 'string' && value.includes('@') ? {email: canonicalEmail(value)} : {uid: canonicalUid(value)};
}
export function isInternalId(value: unknown): value is string {
  return typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(value);
}
