'use strict';

const path = require('node:path');
const { PostgresError } = require('./errors');

function invalid(field) {
  throw new PostgresError('PG_CONFIG', field + ' is missing or invalid.');
}

function integer(env, key, fallback, minimum, maximum) {
  const text = env[key] ?? String(fallback);
  if (typeof text !== 'string' || !/^\d+$/.test(text)) return invalid(key);
  const value = Number(text);
  if (value < minimum || value > maximum) return invalid(key);
  return value;
}

function connection(env, key, role, pool) {
  if (typeof env[key] !== 'string') return invalid(key);
  let url;
  try {
    url = new URL(env[key]);
  } catch {
    return invalid(key);
  }
  if (!['postgres:', 'postgresql:'].includes(url.protocol) || !url.hostname ||
      url.pathname.length < 2 || url.hash || !url.password) return invalid(key);
  try {
    if (decodeURIComponent(url.username) !== role) return invalid(key);
  } catch {
    return invalid(key);
  }
  const allowed = new Set(['schema', 'sslmode', 'sslaccept', 'sslrootcert', 'sslcert', 'sslidentity', 'sslpassword']);
  for (const name of url.searchParams.keys()) {
    if (!allowed.has(name)) return invalid(key);
  }
  if (url.searchParams.has('schema') && url.searchParams.get('schema') !== 'public') return invalid(key);
  if (env.NODE_ENV === 'production' &&
      (url.searchParams.get('sslmode') !== 'require' || url.searchParams.get('sslaccept') !== 'strict')) {
    return invalid(key + ' TLS');
  }
  url.searchParams.set('schema', 'public');
  url.searchParams.set('connection_limit', String(pool));
  url.searchParams.set('pool_timeout', String(integer(env, 'PG_POOL_TIMEOUT_SECONDS', 5, 1, 30)));
  url.searchParams.set('connect_timeout', String(integer(env, 'PG_CONNECT_TIMEOUT_SECONDS', 3, 1, 30)));
  url.searchParams.set('socket_timeout', String(integer(env, 'PG_QUERY_TIMEOUT_SECONDS', 10, 1, 120)));
  url.searchParams.set('application_name', 'mediid_postgres_infrastructure');
  return url.toString();
}

function environment(env) {
  if (!env || typeof env !== 'object' || Array.isArray(env)) invalid('PostgreSQL environment');
  if (env.NODE_ENV && !['development', 'test', 'production'].includes(env.NODE_ENV)) invalid('NODE_ENV');
}

function runtimeConfig(env = process.env) {
  environment(env);
  const poolSize = integer(env, 'PG_POOL_SIZE',
    env.NODE_ENV === 'production' ? 10 : env.NODE_ENV === 'test' ? 2 : 4, 1, 50);
  return Object.freeze({
    url: connection(env, 'PG_RUNTIME_URL', 'mediid_runtime', poolSize),
    poolSize,
    retries: integer(env, 'PG_CONNECT_ATTEMPTS', 3, 1, 5),
    retryDelayMs: integer(env, 'PG_RETRY_DELAY_MS', 250, 0, 2000),
    migrationsDirectory: path.resolve(__dirname, '../../../prisma/migrations')
  });
}

function migrationUrl(env = process.env) {
  environment(env);
  return connection(env, 'PG_MIGRATION_URL', 'mediid_migrator', 1);
}

function diagnosticsConfig(env = process.env) {
  environment(env);
  return Object.freeze({
    url: connection(env, 'PG_READONLY_URL', 'mediid_diagnostics', 1),
    poolSize: 1,
    retries: integer(env, 'PG_CONNECT_ATTEMPTS', 3, 1, 5),
    retryDelayMs: integer(env, 'PG_RETRY_DELAY_MS', 250, 0, 2000),
    migrationsDirectory: path.resolve(__dirname, '../../../prisma/migrations')
  });
}

module.exports = { runtimeConfig, migrationUrl, diagnosticsConfig };
