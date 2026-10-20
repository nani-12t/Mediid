import {createPrivateKey, createPublicKey, KeyObject} from 'node:crypto';
import {AuthError} from '../errors';
export interface AuthConfig {
  readonly issuer: string;
  readonly audience: string;
  readonly keyId: string;
  readonly privateKey: KeyObject;
  readonly publicKey: KeyObject;
  readonly tokenSeconds: number;
  readonly bcryptCost: number;
  readonly resetSeconds: number;
}
function required(env: NodeJS.ProcessEnv, name: string): string {
  const value = env[name];
  if (!value || value !== value.trim()) throw new AuthError('AUTH_CONFIG');
  return value;
}
function bounded(env: NodeJS.ProcessEnv, name: string, min: number, max: number): number {
  const text = required(env, name);
  if (!/^\d+$/.test(text) || Number(text) < min || Number(text) > max) throw new AuthError('AUTH_CONFIG');
  return Number(text);
}
export function authConfig(env: NodeJS.ProcessEnv = process.env): AuthConfig {
  try {
    const issuer = required(env, 'AUTH_JWT_ISSUER'), audience = required(env, 'AUTH_JWT_AUDIENCE');
    const keyId = required(env, 'AUTH_JWT_KEY_ID');
    if (!/^[A-Za-z0-9_-]{1,64}$/.test(keyId) || issuer.length > 255 || audience.length > 255) throw new AuthError('AUTH_CONFIG');
    const privateKey = createPrivateKey((env.AUTH_JWT_PRIVATE_KEY ?? '').trim().replace(/\\n/g, '\n'));
    const publicKey = createPublicKey((env.AUTH_JWT_PUBLIC_KEY ?? '').trim().replace(/\\n/g, '\n'));
    for (const key of [privateKey, publicKey]) {
      if (key.asymmetricKeyType !== 'rsa' || (key.asymmetricKeyDetails?.modulusLength ?? 0) < 2048) throw new AuthError('AUTH_CONFIG');
    }
    const derived = createPublicKey(privateKey).export({type: 'spki', format: 'der'});
    if (!derived.equals(publicKey.export({type: 'spki', format: 'der'}))) throw new AuthError('AUTH_CONFIG');
    return Object.freeze({issuer, audience, keyId, privateKey, publicKey,
      tokenSeconds: bounded(env, 'AUTH_JWT_TTL_SECONDS', 60, 900),
      bcryptCost: bounded(env, 'AUTH_BCRYPT_COST', 12, 14),
      resetSeconds: bounded(env, 'AUTH_RESET_TTL_SECONDS', 300, 1800)});
  } catch { throw new AuthError('AUTH_CONFIG'); }
}
