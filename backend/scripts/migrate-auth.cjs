'use strict';

const projections = {
  users: { _id: 1, email: 1, uid: 1, password: 1, role: 1, isActive: 1, createdAt: 1,
    updatedAt: 1, lastLogin: 1, resetPasswordToken: 1, resetPasswordExpire: 1 },
  patients: { _id: 1, user: 1, uid: 1, qrCode: 1, firstName: 1, lastName: 1, qrActive: 1, createdAt: 1, updatedAt: 1 },
  hospitals: { _id: 1, user: 1, uid: 1, qrCode: 1, name: 1, isActive: 1, doctorSequence: 1, staffSequence: 1, createdAt: 1, updatedAt: 1 },
  doctors: { _id: 1, user: 1, hospital: 1, uid: 1, qrCode: 1, firstName: 1, lastName: 1,
    specialization: 1, isActive: 1, isPrivatePractice: 1, createdAt: 1, updatedAt: 1 }
};
async function readLegacySnapshot(connection) {
  const entries = await Promise.all(Object.entries(projections).map(async ([name, projection]) => {
    const records = await connection.collection(name).find({}, { projection, maxTimeMS: 30000 }).toArray();
    return [name, records.map(record => {
      const result = { ...record };
      for (const key of ['_id', 'user', 'hospital']) if (result[key] != null && typeof result[key].toHexString === 'function') result[key] = result[key].toHexString();
      return result;
    })];
  }));
  return Object.fromEntries(entries);
}
async function main(args = process.argv.slice(2), env = process.env) {
  const [mode, ...flags] = args;
  if (!['dry-run', 'validate', 'apply'].includes(mode) ||
      flags.some(flag => flag !== '--confirm-apply') ||
      (mode === 'apply' ? flags.length !== 1 : flags.length !== 0)) {
    console.error(JSON.stringify({ status: 'refused', code: 'MIGRATION_ARGUMENTS',
      message: 'Use dry-run, validate, or apply --confirm-apply with explicit migration credentials.' }));
    return 2;
  }
  if (env.NODE_ENV === 'production' || !['test', 'development'].includes(env.NODE_ENV) ||
      typeof env.AUTH_MIGRATION_MONGO_URI !== 'string' || !/^mongodb(?:\+srv)?:\/\//.test(env.AUTH_MIGRATION_MONGO_URI)) {
    console.error(JSON.stringify({ status: 'refused', code: 'MIGRATION_CONFIGURATION',
      message: 'Explicit non-production environment and AUTH_MIGRATION_MONGO_URI are required.' }));
    return 2;
  }
  let mongo, prisma;
  try {
    // Reject arguments/environments before loading database clients.
    const { PrismaClient } = require('@prisma/client');
    const mongoose = require('mongoose');
    const { migrationUrl } = require('../src/infrastructure/postgres/config');
    const { reconcileLegacyAuth } = require('../src/auth/migration');
    // Never load the live application .env or accept a runtime/superuser URL.
    prisma = new PrismaClient({ datasources: { db: { url: migrationUrl(env) } }, log: [] });
    mongo = await mongoose.createConnection(env.AUTH_MIGRATION_MONGO_URI, {
      serverSelectionTimeoutMS: 5000, connectTimeoutMS: 5000, maxPoolSize: 1, autoIndex: false
    }).asPromise();
    const report = await reconcileLegacyAuth(prisma, await readLegacySnapshot(mongo), mode);
    console.log(JSON.stringify(report));
    return ['dry-run', 'validated', 'applied'].includes(report.status) ? 0 : 1;
  } catch {
    console.error(JSON.stringify({ status: 'unavailable', code: 'MIGRATION_UNAVAILABLE',
      message: 'Identity reconciliation is unavailable; no raw database details are reported.' }));
    return 1;
  } finally {
    await Promise.allSettled([mongo?.close(), prisma?.$disconnect()]);
  }
}
if (require.main === module) main().then(code => { process.exitCode = code; });
module.exports = { readLegacySnapshot, main };
