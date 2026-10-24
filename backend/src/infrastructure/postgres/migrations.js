'use strict';

const { readdirSync, readFileSync } = require('node:fs');
const { createHash } = require('node:crypto');
const { join } = require('node:path');
const { PostgresError } = require('./errors');

function expectedMigrations(directory) {
  try {
    return new Map(readdirSync(directory, { withFileTypes: true })
      .filter(entry => entry.isDirectory())
      .map(entry => {
        const source = readFileSync(join(directory, entry.name, 'migration.sql'), 'utf8');
        const lf = source.replace(/\r\n/g, '\n');
        const checksums = [source, lf, lf.replace(/\n/g, '\r\n')]
          .map(text => createHash('sha256').update(text).digest('hex'));
        return [entry.name, checksums];
      }));
  } catch {
    throw new PostgresError('PG_MIGRATION_FILES', 'Local migration files are unavailable.');
  }
}

async function verifyMigrations(client, directory) {
  const expected = expectedMigrations(directory);
  if (!expected.size) throw new PostgresError('PG_MIGRATION_FILES', 'No local migrations were found.');
  let rows;
  try {
    rows = await client.$queryRaw`SELECT migration_name, checksum, finished_at, rolled_back_at FROM public._prisma_migrations`;
  } catch {
    throw new PostgresError('PG_MIGRATIONS_MISSING', 'PostgreSQL migration history is unavailable. Deploy reviewed migrations first.');
  }
  const applied = new Map();
  for (const row of rows) {
    if (row.rolled_back_at) continue;
    if (!row.finished_at) throw new PostgresError('PG_MIGRATIONS_INCOMPLETE', 'PostgreSQL has an incomplete migration.');
    if (applied.has(row.migration_name)) throw new PostgresError('PG_MIGRATIONS_DRIFT', 'PostgreSQL migration history is inconsistent.');
    applied.set(row.migration_name, row.checksum);
  }
  if (applied.size !== expected.size) {
    throw new PostgresError('PG_MIGRATIONS_PENDING', 'PostgreSQL migrations are missing or unexpected.');
  }
  for (const [name, checksums] of expected) {
    if (!checksums.includes(applied.get(name) || '')) {
      throw new PostgresError('PG_MIGRATIONS_DRIFT', 'PostgreSQL migration checksum does not match the reviewed files.');
    }
  }
  return applied.size;
}

module.exports = { expectedMigrations, verifyMigrations };
