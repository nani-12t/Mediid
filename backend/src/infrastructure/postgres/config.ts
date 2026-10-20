import { PostgresError } from './errors';
export type Environment = Record<string, string | undefined>;
export interface PostgresConfig {
  readonly url: string;
  readonly poolSize: number;
  readonly retries: number;
  readonly retryDelayMs: number;
  readonly migrationsDirectory: string;
}
function invalid(field: string): never { throw new PostgresError('PG_CONFIG', field + ' is missing or invalid.'); }
function integer(env: Environment, key: string, fallback: number, minimum: number, maximum: number): number {
  const text = env[key] ?? String(fallback);
  if (!/^\d+$/.test(text)) return invalid(key);
  const value = Number(text); if (value < minimum || value > maximum) return invalid(key); return value;
}
function connection(env: Environment, key: string, role: string, pool: number): string {
  let url: URL; try { url = new URL(env[key] || ''); } catch { return invalid(key); }
  if (!['postgres:', 'postgresql:'].includes(url.protocol) || !url.hostname || url.pathname.length < 2 || url.hash || !url.password) return invalid(key);
  try { if (decodeURIComponent(url.username) !== role) return invalid(key); } catch { return invalid(key); }
  const allowed = new Set(['schema','sslmode','sslaccept','sslrootcert','sslcert','sslidentity','sslpassword']);
  for (const name of url.searchParams.keys()) if (!allowed.has(name)) return invalid(key);
  if (url.searchParams.has('schema') && url.searchParams.get('schema') !== 'public') return invalid(key);
  if (env.NODE_ENV === 'production' && (url.searchParams.get('sslmode') !== 'require' || url.searchParams.get('sslaccept') !== 'strict')) return invalid(key + ' TLS');
  url.searchParams.set('schema','public');
  url.searchParams.set('connection_limit',String(pool));
  url.searchParams.set('pool_timeout',String(integer(env,'PG_POOL_TIMEOUT_SECONDS',5,1,30)));
  url.searchParams.set('connect_timeout',String(integer(env,'PG_CONNECT_TIMEOUT_SECONDS',3,1,30)));
  url.searchParams.set('socket_timeout',String(integer(env,'PG_QUERY_TIMEOUT_SECONDS',10,1,120)));
  url.searchParams.set('application_name','mediid_postgres_infrastructure');
  return url.toString();
}
function environment(env: Environment): void {
  if (env.NODE_ENV && !['development','test','production'].includes(env.NODE_ENV)) invalid('NODE_ENV');
}
export function runtimeConfig(env: Environment = process.env): PostgresConfig {
  environment(env);
  const poolSize = integer(env,'PG_POOL_SIZE',env.NODE_ENV === 'production' ? 10 : env.NODE_ENV === 'test' ? 2 : 4,1,50);
  return Object.freeze({url:connection(env,'PG_RUNTIME_URL','mediid_runtime',poolSize),poolSize,
    retries:integer(env,'PG_CONNECT_ATTEMPTS',3,1,5),retryDelayMs:integer(env,'PG_RETRY_DELAY_MS',250,0,2000),
    migrationsDirectory: require('node:path').resolve(__dirname,'../../../prisma/migrations')});
}
export function migrationUrl(env: Environment = process.env): string {
  environment(env); return connection(env,'PG_MIGRATION_URL','mediid_migrator',1);
}
export function diagnosticsConfig(env: Environment = process.env): PostgresConfig {
  environment(env); return Object.freeze({url:connection(env,'PG_READONLY_URL','mediid_diagnostics',1),poolSize:1,
    retries:integer(env,'PG_CONNECT_ATTEMPTS',3,1,5),retryDelayMs:integer(env,'PG_RETRY_DELAY_MS',250,0,2000),
    migrationsDirectory:require('node:path').resolve(__dirname,'../../../prisma/migrations')});
}
