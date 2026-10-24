'use strict';

const dotenv = require('dotenv');
const path = require('node:path');
const { PostgresInfrastructure } = require('./client');
const { runtimeConfig, diagnosticsConfig } = require('./config');
const { PostgresError, safeFailure } = require('./errors');

async function main() {
  const mode = process.argv[2] || 'check';
  if (!['check', 'readonly', 'watch'].includes(mode)) {
    throw new PostgresError('PG_CONFIG', 'Unsupported PostgreSQL diagnostic command.');
  }
  const service = new PostgresInfrastructure(mode === 'readonly' ? diagnosticsConfig() : runtimeConfig());
  let timer;
  let finishing;
  const shutdown = () => finishing ??= (async () => {
    if (timer) clearInterval(timer);
    await service.stop();
    console.log(JSON.stringify(service.status()));
    process.disconnect?.();
  })();
  process.once('SIGINT', () => void shutdown());
  process.once('SIGTERM', () => void shutdown());
  process.on('message', message => {
    if (message?.action === 'shutdown') void shutdown();
  });
  try {
    await service.start();
    console.log(JSON.stringify(service.status()));
    if (mode === 'watch') timer = setInterval(() => undefined, 1000);
    else await shutdown();
  } catch (error) {
    await service.stop();
    if (finishing) {
      await finishing;
      return;
    }
    throw error;
  }
}

if (require.main === module) {
  dotenv.config({ path: process.env.PG_ENV_FILE || path.resolve(__dirname, '../../../.env.postgres.local') });
  void main().catch(error => {
    const safe = safeFailure(error);
    console.error(JSON.stringify({ status: 'unavailable', code: safe.code, message: safe.message }));
    process.exitCode = 1;
    process.disconnect?.();
  });
}
