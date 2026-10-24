'use strict';

const { PrismaClient } = require('@prisma/client');
const { runtimeConfig } = require('./config');
const { PostgresError, safeFailure } = require('./errors');
const { verifyMigrations } = require('./migrations');

class PostgresInfrastructure {
  constructor(config) {
    this.config = config;
    this.prisma = new PrismaClient({ datasources: { db: { url: config.url } }, log: [], errorFormat: 'minimal' });
    this.connecting = undefined;
    this.stopping = undefined;
    this.stopRequested = false;
    this.state = 'idle';
    this.migrationCount = 0;
    this.attempts = 0;
  }

  get client() {
    if (this.state !== 'ready' || this.stopRequested) throw new PostgresError('PG_NOT_READY', 'PostgreSQL is not ready.');
    return this.prisma;
  }

  status() {
    return {
      status: this.state,
      ready: this.state === 'ready',
      migrations: this.migrationCount,
      attempts: this.attempts,
      capability: 'isolated-postgres-infrastructure'
    };
  }

  start() {
    if (this.stopRequested) return Promise.reject(new PostgresError('PG_STOPPED', 'PostgreSQL infrastructure has been stopped.'));
    if (this.state === 'ready') return Promise.resolve();
    if (!this.connecting) this.connecting = this.initialize().finally(() => { this.connecting = undefined; });
    return this.connecting;
  }

  async initialize() {
    this.state = 'connecting';
    for (let attempt = 1; attempt <= this.config.retries; attempt++) {
      this.attempts = attempt;
      try {
        await this.prisma.$connect();
        if (this.stopRequested) throw new PostgresError('PG_STOPPED', 'PostgreSQL infrastructure has been stopped.');
        const roles = await this.prisma.$queryRaw`SELECT
          (r.rolsuper OR r.rolcreatedb OR r.rolcreaterole OR r.rolbypassrls OR pg_has_role(current_user,'mediid_migrator','MEMBER') OR
           has_schema_privilege(current_user,'public','CREATE') OR has_database_privilege(current_user,current_database(),'CREATE')) AS unsafe
          FROM pg_roles r WHERE r.rolname=current_user`;
        if (roles.length !== 1 || roles[0].unsafe) throw new PostgresError('PG_ROLE_UNSAFE', 'PostgreSQL runtime role has unsafe privileges.');
        this.migrationCount = await verifyMigrations(this.prisma, this.config.migrationsDirectory);
        const grants = await this.prisma.$queryRaw`SELECT has_table_privilege(current_user,'public._prisma_migrations','INSERT,UPDATE,DELETE,TRUNCATE') AS unsafe`;
        if (grants[0]?.unsafe) throw new PostgresError('PG_ROLE_UNSAFE', 'PostgreSQL runtime role can modify migration history.');
        if (this.stopRequested) throw new PostgresError('PG_STOPPED', 'PostgreSQL infrastructure has been stopped.');
        this.state = 'ready';
        return;
      } catch (error) {
        await this.prisma.$disconnect().catch(() => undefined);
        const safe = safeFailure(error);
        if (this.stopRequested || safe.code !== 'PG_UNAVAILABLE' || attempt === this.config.retries) {
          this.state = this.stopRequested ? 'stopped' : 'failed';
          throw safe;
        }
        await new Promise(resolve => setTimeout(resolve, this.config.retryDelayMs));
      }
    }
  }

  stop() {
    if (!this.stopping) {
      this.stopRequested = true;
      this.state = 'stopping';
      this.stopping = (async () => {
        await this.connecting?.catch(() => undefined);
        await this.prisma.$disconnect();
        this.state = 'stopped';
      })();
    }
    return this.stopping;
  }
}

let shared;
function postgresInfrastructure() {
  if (!shared) shared = new PostgresInfrastructure(runtimeConfig());
  return shared;
}

module.exports = { PostgresInfrastructure, postgresInfrastructure };
