import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { createRequire } from 'node:module';
import path from 'node:path';
import { startNativeCluster } from './helpers/native-cluster.mjs';

const require = createRequire(import.meta.url);
const { PrismaClient } = require('@prisma/client');
const { MongoMemoryServer } = require('mongodb-memory-server');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const { reconcileLegacyAuth } = require('../src/auth/migration');
const { readLegacySnapshot } = require('../scripts/migrate-auth.cjs');
const { mongoObjectIdToUuid, newPostgresId } = require('../src/identifiers/uuid');
const { IdentityRepository } = require('../src/auth/repositories/identity');
const { AuthorizationPolicies } = require('../src/auth/policies/ownership');
const { loginIdentity } = require('../src/auth/identity');

const checks = [];
async function check(name, fn) {
  await fn(); checks.push(name); console.log('PASS migration native: ' + name);
}
const id = number => number.toString(16).padStart(24, '0');
const sourceTime = new Date('2024-03-17T12:45:00.000Z');
const importStartedAt = new Date();
const cluster = await startNativeCluster();
let mongo, source, prisma, second, runtime;
try {
  const database = await cluster.database();
  await database.db.exec('CREATE EXTENSION vector; CREATE EXTENSION btree_gist;');
  await database.db.exec(readFileSync('prisma/roles.sql', 'utf8'));
  const credentials = Object.fromEntries(['mediid_migrator', 'mediid_runtime', 'mediid_diagnostics'].map(role => [role, randomBytes(32).toString('hex')]));
  for (const [role, password] of Object.entries(credentials)) await cluster.admin.query('ALTER ROLE ' + role + " LOGIN PASSWORD '" + password + "'");
  const url = database.url('mediid_migrator', credentials.mediid_migrator);
  await check('all reviewed forward migrations deploy with the real migrator credential', async () => {
    const deployed = spawnSync(process.execPath, ['scripts/prisma.cjs', 'deploy'], {
      env: { ...process.env, NODE_ENV: 'test', PG_ENV_FILE: path.join(cluster.root, 'absent.env'), PG_MIGRATION_URL: url },
      encoding: 'utf8', windowsHide: true, timeout: 120000
    });
    assert.equal(deployed.status, 0, deployed.stdout + deployed.stderr);
    const expected = readdirSync('prisma/migrations', { withFileTypes: true }).filter(entry => entry.isDirectory()).length;
    assert.equal((await database.db.query('SELECT count(*)::int n FROM _prisma_migrations WHERE finished_at IS NOT NULL')).rows[0].n, expected);
  });
  prisma = new PrismaClient({ datasources: { db: { url } }, log: [] });
  second = new PrismaClient({ datasources: { db: { url } }, log: [] });
  runtime = new PrismaClient({ datasources: { db: { url: database.url('mediid_runtime', credentials.mediid_runtime) } }, log: [] });
  mongo = await MongoMemoryServer.create({ binary: { version: '7.0.30', downloadDir: path.resolve('.test-data/mongodb-binaries') }, instance: { ip: '127.0.0.1' } });
  source = await mongoose.createConnection(mongo.getUri('mediid_phase22b_synthetic'), { autoIndex: false }).asPromise();
  const hash = await bcrypt.hash('SyntheticLegacyPassword123!', 8);
  const account = (number, role, fields = {}) => ({ _id: new mongoose.Types.ObjectId(id(number)), role, password: hash,
    email: 'synthetic' + number + '@example.invalid', isActive: true, createdAt: sourceTime, ...fields });
  const profile = (number, owner, uid, fields = {}) => ({ _id: new mongoose.Types.ObjectId(id(number)),
    user: new mongoose.Types.ObjectId(id(owner)), uid, qrCode: 'data:image/png;base64,SyntheticOriginal-' + uid,
    firstName: 'Synthetic', lastName: 'Identity', createdAt: sourceTime, isActive: true, ...fields });
  await source.collection('users').insertMany([
    account(1, 'patient', { email: ' Patient@Example.Invalid ' }), account(2, 'hospital_admin'),
    account(3, 'doctor', { uid: 'HID-TEST0001-SRDOC-0001' }), account(4, 'doctor', { uid: 'DOC-PRIVATE1' }),
    account(5, 'patient', { isActive: false }), account(6, 'doctor', { email: null, uid: 'DOC-UIDONLY1' })
  ]);
  await source.collection('patients').insertMany([
    profile(101, 1, 'MID-PATIENT1', { medicalHistory: [{ diagnosis: 'ExcludedSyntheticMedicalData' }], emergency: { aadhaarNumber: 'ExcludedSyntheticIdentifier' }, qrActive: true }),
    profile(105, 5, 'MID-INACTIVE1', { qrActive: false })
  ]);
  await source.collection('hospitals').insertOne(profile(102, 2, 'HID-TEST0001', { name: 'Synthetic Hospital', doctorSequence: 7, staffSequence: 3, billing: ['ExcludedSyntheticBilling'] }));
  await source.collection('doctors').insertMany([
    profile(103, 3, 'HID-TEST0001-SRDOC-0001', { hospital: new mongoose.Types.ObjectId(id(102)), specialization: 'Synthetic medicine' }),
    profile(104, 4, 'DOC-PRIVATE1', { isPrivatePractice: true, specialization: 'Synthetic medicine' }),
    profile(106, 6, 'DOC-UIDONLY1', { isPrivatePractice: true, specialization: 'Synthetic medicine' })
  ]);
  const snapshot = await readLegacySnapshot(source);
  const count = async table => (await database.db.query('SELECT count(*)::int n FROM public.' + table)).rows[0].n;
  const hasConflict = (report, code) => report.conflicts.some(conflict => conflict.code === code);
  await check('real synthetic Mongo snapshot contains only projected identity fields and no clinical data', async () => {
    assert.equal(snapshot.users.length, 6);
    for (const secret of ['medicalHistory', 'aadhaarNumber', 'billing', 'ExcludedSynthetic']) assert.ok(!JSON.stringify(snapshot).includes(secret));
    assert.equal(snapshot.doctors[0].hospital, id(102));
  });
  await check('CLI requires explicit apply confirmation and rejects production without connecting', async () => {
    for (const [args, nodeEnv] of [[['apply'], 'test'], [['dry-run'], 'production']]) {
      const result = spawnSync(process.execPath, ['scripts/migrate-auth.cjs', ...args], {
        env: { ...process.env, NODE_ENV: nodeEnv, AUTH_MIGRATION_MONGO_URI: mongo.getUri('mediid_phase22b_synthetic'), PG_MIGRATION_URL: url },
        encoding: 'utf8', windowsHide: true, timeout: 15000
      });
      assert.equal(result.status, 2);
      assert.ok(!result.stderr.includes(url));
    }
  });
  await check('dry-run and validation report six identities with zero writes', async () => {
    for (const mode of ['dry-run', 'validate']) {
      const report = await reconcileLegacyAuth(prisma, snapshot, mode);
      assert.equal(report.status, mode === 'validate' ? 'validated' : 'dry-run', JSON.stringify(report));
      assert.equal(report.ready, 6); assert.equal(report.applied, 0);
    }
    assert.equal(await count('users'), 0); assert.equal(await count('auth_legacy_links'), 0);
  });
  await check('canonical email and public UID collisions abort apply without merging', async () => {
    const emailConflict = structuredClone(snapshot);
    emailConflict.users[4].email = 'patient@example.invalid';
    const duplicate = await reconcileLegacyAuth(prisma, emailConflict, 'apply');
    assert.equal(duplicate.status, 'conflict'); assert.ok(hasConflict(duplicate, 'SOURCE_EMAIL_COLLISION'));
    const uidConflict = structuredClone(snapshot);
    uidConflict.users[5].uid = uidConflict.users[3].uid;
    uidConflict.doctors[2].uid = uidConflict.doctors[1].uid;
    const uidReport = await reconcileLegacyAuth(prisma, uidConflict, 'apply');
    assert.equal(uidReport.status, 'conflict'); assert.ok(hasConflict(uidReport, 'SOURCE_UID_COLLISION'));
    assert.equal(await count('users'), 0);
    for (const sensitive of [hash, snapshot.users[0].email, snapshot.patients[0].qrCode]) assert.ok(!JSON.stringify(duplicate).includes(sensitive));
  });
  await check('unsupported public identifiers and missing source times require reconciliation', async () => {
    const uidConflict = structuredClone(snapshot); uidConflict.patients[0].uid = ' mid-patient1 ';
    assert.ok(hasConflict(await reconcileLegacyAuth(prisma, uidConflict, 'apply'), 'NONCANONICAL_PUBLIC_UID'));
    const timeConflict = structuredClone(snapshot); delete timeConflict.doctors[0].createdAt;
    assert.ok(hasConflict(await reconcileLegacyAuth(prisma, timeConflict, 'apply'), 'MISSING_SOURCE_TIME'));
    const independent = structuredClone(snapshot); delete independent.doctors[1].isPrivatePractice;
    assert.ok(hasConflict(await reconcileLegacyAuth(prisma, independent, 'apply'), 'INDEPENDENT_DOCTOR_REQUIRES_EXPLICIT_PRACTICE'));
    const reset = structuredClone(snapshot); reset.users[0].resetPasswordToken = 'synthetic-not-a-migratable-credential';
    assert.ok(hasConflict(await reconcileLegacyAuth(prisma, reset, 'apply'), 'OUTSTANDING_LEGACY_RESET'));
    assert.equal(await count('users'), 0);
  });
  await check('missing or invalid hospital sequence counters require reconciliation without writes', async () => {
    for (const field of ['doctorSequence', 'staffSequence']) {
      for (const value of [undefined, -1, 1.5, 2147483647]) {
        const invalid = structuredClone(snapshot); invalid.hospitals[0][field] = value;
        assert.ok(hasConflict(await reconcileLegacyAuth(prisma, invalid, 'apply'), 'INVALID_SOURCE_SEQUENCE'));
      }
    }
    assert.equal(await count('users'), 0);
  });
  await check('actual runtime credential cannot run the identity migrator', async () => {
    const report = await reconcileLegacyAuth(runtime, snapshot, 'apply');
    assert.equal(report.status, 'refused'); assert.ok(hasConflict(report, 'MIGRATOR_CREDENTIAL_REQUIRED'));
    assert.equal(await count('users'), 0);
  });
  await check('existing target login identities are conflicts and are never silently adopted', async () => {
    const target = newPostgresId();
    await database.db.query("INSERT INTO users(id,email,password_hash,role,updated_at) VALUES($1,$2,$3,'patient',now())", [target, 'patient@example.invalid', hash]);
    const report = await reconcileLegacyAuth(prisma, snapshot, 'apply');
    assert.equal(report.status, 'conflict'); assert.ok(hasConflict(report, 'TARGET_IDENTITY_COLLISION'));
    assert.equal(await count('users'), 1);
    await database.db.query('DELETE FROM users WHERE id=$1', [target]);
  });
  await check('an interrupted run restarts from atomic checkpoints without duplicate identities', async () => {
    const stopped = await reconcileLegacyAuth(prisma, snapshot, 'apply', { onCommitted() { throw new Error('Synthetic operator interruption'); } });
    assert.equal(stopped.status, 'interrupted'); assert.equal(stopped.applied, 1);
    assert.equal(await count('auth_legacy_links'), 1); assert.equal(await count('users'), 1);
    const resumed = await reconcileLegacyAuth(prisma, snapshot, 'apply');
    assert.equal(resumed.status, 'applied', JSON.stringify(resumed)); assert.equal(resumed.applied, 5); assert.equal(resumed.skipped, 1);
    assert.equal(await count('users'), 6); assert.equal(await count('auth_legacy_links'), 6);
  });
  await check('UUIDv5 mapping, original public UID/QR bytes, roles, active state and bcrypt hashes survive', async () => {
    for (const original of snapshot.users) {
      const row = (await database.db.query('SELECT id,email,uid,role,is_active,password_hash,created_at FROM users WHERE id=$1', [mongoObjectIdToUuid(original._id)])).rows[0];
      assert.equal(row.id[14], '5'); assert.equal(row.password_hash, original.password);
      assert.equal(row.role, original.role); assert.equal(row.is_active, original.isActive);
      assert.equal(row.uid, original.uid ?? null); assert.equal(row.created_at.toISOString(), sourceTime.toISOString());
      assert.ok(await bcrypt.compare('SyntheticLegacyPassword123!', row.password_hash));
    }
    for (const original of [...snapshot.patients, ...snapshot.hospitals, ...snapshot.doctors]) {
      const row = (await database.db.query('SELECT public_uid,legacy_profile_id,safe_profile FROM auth_profiles WHERE user_id=$1', [mongoObjectIdToUuid(original.user)])).rows[0];
      assert.equal(row.public_uid, original.uid); assert.equal(row.safe_profile.uid, original.uid);
      assert.equal(row.safe_profile.qrCode, original.qrCode); assert.equal(row.legacy_profile_id, original._id);
      assert.equal(row.safe_profile._id, original._id);
      assert.ok(!Object.hasOwn(row.safe_profile, 'medicalHistory')); assert.ok(!Object.hasOwn(row.safe_profile, 'password'));
    }
    const uidUser = await prisma.user.findUnique({ where: loginIdentity(' doc-uidonly1 '), select: { id: true, email: true, uid: true } });
    assert.equal(uidUser.id, mongoObjectIdToUuid(id(6))); assert.equal(uidUser.email, null); assert.equal(uidUser.uid, 'DOC-UIDONLY1');
  });
  const repository = new IdentityRepository({ client: runtime });
  const policies = new AuthorizationPolicies(repository);
  await check('minimal core ownership and authoritative hospital memberships satisfy existing policies', async () => {
    await policies.patientSelf({ id: mongoObjectIdToUuid(id(1)), role: 'patient' }, mongoObjectIdToUuid(id(101)));
    await policies.hospitalAdmin({ id: mongoObjectIdToUuid(id(2)), role: 'hospital_admin' }, mongoObjectIdToUuid(id(102)));
    await policies.doctorHospital({ id: mongoObjectIdToUuid(id(3)), role: 'doctor' }, mongoObjectIdToUuid(id(102)));
    await policies.privateClinic({ id: mongoObjectIdToUuid(id(4)), role: 'doctor' }, mongoObjectIdToUuid(id(104)));
    await assert.rejects(() => policies.doctorHospital({ id: mongoObjectIdToUuid(id(4)), role: 'doctor' }, mongoObjectIdToUuid(id(102))));
    await assert.rejects(() => policies.patientSelf({ id: mongoObjectIdToUuid(id(5)), role: 'patient' }, mongoObjectIdToUuid(id(105))));
    const independent = await prisma.doctor.findUnique({ where: { id: mongoObjectIdToUuid(id(104)) }, select: { primaryHospitalId: true, isPrivatePractice: true } });
    assert.equal(independent.primaryHospitalId, null); assert.equal(independent.isPrivatePractice, true);
    assert.equal(await count('doctor_hospital_memberships'), 1);
    const membership = (await database.db.query('SELECT joined_at FROM doctor_hospital_memberships')).rows[0];
    assert.ok(membership.joined_at >= importStartedAt && membership.joined_at <= new Date());
    assert.notEqual(membership.joined_at.toISOString(), sourceTime.toISOString());
    const basis = (await database.db.query("SELECT details->>'joinedAtBasis' basis FROM auth_provisioning_audit WHERE action='legacy_membership_import'")).rows[0];
    assert.equal(basis.basis, 'import_time');
    const audit = (await database.db.query("SELECT actor_user_id,doctor_id,hospital_id FROM auth_provisioning_audit WHERE action='legacy_membership_import'")).rows[0];
    assert.equal(audit.actor_user_id, mongoObjectIdToUuid(id(2))); assert.equal(audit.doctor_id, mongoObjectIdToUuid(id(103))); assert.equal(audit.hospital_id, mongoObjectIdToUuid(id(102)));
  });
  await check('unchanged reruns skip all users and source drift cannot overwrite migrated identity', async () => {
    const report = await reconcileLegacyAuth(prisma, snapshot, 'apply');
    assert.equal(report.status, 'applied'); assert.equal(report.applied, 0); assert.equal(report.skipped, 6);
    assert.equal(await count('doctor_hospital_memberships'), 1); assert.equal(await count('auth_provisioning_audit'), 1);
    const changed = structuredClone(snapshot); changed.patients[0].firstName = 'ChangedSource';
    const conflict = await reconcileLegacyAuth(prisma, changed, 'apply');
    assert.equal(conflict.status, 'conflict'); assert.ok(hasConflict(conflict, 'SOURCE_CHANGED_REQUIRES_RECONCILIATION'));
    assert.equal((await prisma.patient.findUnique({ where: { id: mongoObjectIdToUuid(id(101)) }, select: { firstName: true } })).firstName, 'Synthetic');
    for (const table of ['encounters', 'medical_documents', 'hospital_appointments', 'appointment_payments']) assert.equal(await count(table), 0);
  });
  const expanded = structuredClone(snapshot);
  expanded.users.push({ _id: id(7), role: 'patient', password: hash, email: 'extra@example.invalid', isActive: true, createdAt: sourceTime });
  expanded.patients.push({ _id: id(107), user: id(7), uid: 'MID-EXTRA1', firstName: 'Synthetic', lastName: 'Extra', createdAt: sourceTime });
  await check('failure before checkpoint rolls back the complete user/profile transaction', async () => {
    const faulting = new Proxy(prisma, { get(target, key) {
      if (key === '$transaction') return callback => prisma.$transaction(tx => callback(new Proxy(tx, { get(transaction, operation) {
        if (operation === '$executeRaw') return (sql, ...values) => {
          if (sql[0].includes('INSERT INTO public.auth_legacy_links')) throw new Error('Synthetic injected checkpoint failure');
          return transaction.$executeRaw(sql, ...values);
        };
        return transaction[operation];
      } })));
      return target[key];
    } });
    const report = await reconcileLegacyAuth(faulting, expanded, 'apply');
    assert.equal(report.status, 'interrupted'); assert.equal(await count('users'), 6); assert.equal(await count('patients'), 2);
    assert.equal(await count('auth_profiles'), 6); assert.equal(await count('auth_legacy_links'), 6);
  });
  await check('independent native connections reconcile the same new identity only once', async () => {
    const reports = await Promise.all([reconcileLegacyAuth(prisma, expanded, 'apply'), reconcileLegacyAuth(second, expanded, 'apply')]);
    for (const report of reports) assert.equal(report.status, 'applied', JSON.stringify(report));
    assert.equal(reports.reduce((total, report) => total + report.applied, 0), 1);
    assert.equal(await count('users'), 7); assert.equal(await count('auth_legacy_links'), 7); assert.equal(await count('patients'), 3);
  });
  await check('preserved hospital counters issue the next doctor UID without reusing earlier allocations', async () => {
    const hospitalId = mongoObjectIdToUuid(id(102));
    const counters = (await database.db.query('SELECT doctor_sequence,staff_sequence FROM hospitals WHERE id=$1', [hospitalId])).rows[0];
    assert.deepEqual(counters, { doctor_sequence: 7, staff_sequence: 3 });
    const { Provisioning } = require('../src/auth/provisioning');
    const service = new Provisioning({ client: runtime }, { hash: async () => { throw new Error('not used by provisioning'); } });
    const created = await service.createDoctor({ id: mongoObjectIdToUuid(id(2)) }, {
      hospitalId, firstName: 'Next', lastName: 'Doctor', specialization: 'Synthetic'
    });
    assert.equal(created.doctor.uid, 'HID-TEST0001-DOC-0008');
  });
  console.log('Phase 2.2B synthetic Mongo/native PostgreSQL reconciliation checks passed: ' + checks.length);
} finally {
  await Promise.allSettled([source?.close(), prisma?.$disconnect(), second?.$disconnect(), runtime?.$disconnect()]);
  if (mongo) await mongo.stop();
  await cluster.stop();
}
