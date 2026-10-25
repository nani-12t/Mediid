import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { generateKeyPairSync, randomBytes } from 'node:crypto';
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import http from 'node:http';
import { createRequire } from 'node:module';
import path from 'node:path';
import { startNativeCluster } from './helpers/native-cluster.mjs';
import { startRedis } from './helpers/redis-instance.mjs';
import { insert } from './helpers/review-fixtures.mjs';

const require = createRequire(import.meta.url);
const { UserRole } = require('@prisma/client');
const { roles } = require('../src/auth/identity');
const { newPostgresId } = require('../src/identifiers/uuid');
const { PasswordHasher } = require('../src/auth/crypto/password');
const { startAuthRuntime } = require('../src/auth/runtime');
const { createAuthRouter } = require('../src/auth/http');
const { protect, authorize } = require('../middleware/auth');
const express = require('express');
const jwt = require('jsonwebtoken');

const checks = [];
const authError = code => error => error.code === code;
async function check(name, fn) {
  await fn();
  checks.push(name);
  console.log('PASS hospital staff: ' + name);
}
let cluster, redis, runtime, server;

try {
  await check('generated Prisma UserRole and the normal auth allowlist include hospital_staff', async () => {
    assert.equal(UserRole.hospital_staff, 'hospital_staff');
    assert.ok(Object.values(UserRole).includes('hospital_staff'));
    assert.ok(roles.includes('hospital_staff'));
  });

  cluster = await startNativeCluster();
  redis = await startRedis();
  const database = await cluster.database();
  await database.db.exec('CREATE EXTENSION vector; CREATE EXTENSION btree_gist;');
  await database.db.exec(readFileSync('prisma/roles.sql', 'utf8'));
  const credentials = Object.fromEntries(
    ['mediid_migrator', 'mediid_runtime', 'mediid_diagnostics'].map(role => [role, randomBytes(32).toString('hex')])
  );
  for (const [role, credential] of Object.entries(credentials)) {
    await cluster.admin.query('ALTER ROLE ' + role + " LOGIN PASSWORD '" + credential + "'");
  }
  await check('all existing migrations deploy using a real non-superuser migrator', async () => {
    const deployed = spawnSync(process.execPath, ['scripts/prisma.cjs', 'deploy'], {
      env: {
        ...process.env, NODE_ENV: 'test', PG_ENV_FILE: path.join(cluster.root, 'absent.env'),
        PG_MIGRATION_URL: database.url('mediid_migrator', credentials.mediid_migrator)
      },
      encoding: 'utf8', windowsHide: true, timeout: 120000
    });
    assert.equal(deployed.status, 0, deployed.stdout + deployed.stderr);
    const expected = readdirSync('prisma/migrations', { withFileTypes: true }).filter(entry => entry.isDirectory()).length;
    const applied = await database.db.query('SELECT count(*)::int n FROM _prisma_migrations WHERE finished_at IS NOT NULL');
    assert.equal(applied.rows[0].n, expected);
  });

  const pair = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const allowedOrigin = 'https://synthetic-staff.invalid';
  // The shared infrastructure obtains its URL from process.env. Supply only this
  // disposable cluster; no local env file or externally configured DB is loaded.
  process.env.NODE_ENV = 'test';
  process.env.PG_RUNTIME_URL = database.url('mediid_runtime', credentials.mediid_runtime);
  runtime = await startAuthRuntime({
    NODE_ENV: 'test', AUTH_BACKEND: 'postgres', CLIENT_URL: allowedOrigin, AUTH_ALLOWED_ORIGINS: allowedOrigin,
    AUTH_JWT_ISSUER: 'mediid-staff-synthetic', AUTH_JWT_AUDIENCE: 'mediid-staff-synthetic-api',
    AUTH_JWT_KEY_ID: 'synthetic-staff-key', AUTH_JWT_TTL_SECONDS: '900', AUTH_BCRYPT_COST: '12',
    AUTH_RESET_TTL_SECONDS: '900',
    AUTH_JWT_PRIVATE_KEY: pair.privateKey.export({ type: 'pkcs8', format: 'pem' }),
    AUTH_JWT_PUBLIC_KEY: pair.publicKey.export({ type: 'spki', format: 'pem' }),
    AUTH_REDIS_URL: redis.url, AUTH_RATE_KEY_SECRET: randomBytes(32).toString('hex'),
    SMTP_HOST: '127.0.0.1', SMTP_PORT: '587', SMTP_USER: 'synthetic',
    SMTP_PASS: randomBytes(32).toString('hex'), SMTP_FROM: 'synthetic@example.invalid'
  });
  await check('normal auth runtime uses the actual restricted PostgreSQL runtime credential', async () => {
    const connection = await runtime.postgres.client.$queryRawUnsafe('SELECT current_user AS role');
    assert.equal(connection[0].role, 'mediid_runtime');
    assert.equal(runtime.mode, 'postgres');
  });

  const password = 'SyntheticHospitalStaffPassword123!';
  const hash = await (await PasswordHasher.create(12)).hash(password);
  const user = (role, email, uid = null) => insert(database.db, 'users', {
    id: newPostgresId(), role, email, uid, password_hash: hash, is_active: true, updated_at: new Date()
  });
  const adminA = await user('hospital_admin', 'staff-admin-a@example.invalid');
  const adminB = await user('hospital_admin', 'staff-admin-b@example.invalid');
  const staffUser = await user('hospital_staff', 'reception-a@example.invalid', 'HID-STAFFA01-STF-0001');
  const otherStaffUser = await user('hospital_staff', 'reception-b@example.invalid', 'HID-STAFFB01-STF-0001');
  const patientUser = await user('patient', 'staff-patient@example.invalid');
  const doctorUser = await user('doctor', 'staff-doctor@example.invalid');
  const hospitalA = newPostgresId(), hospitalB = newPostgresId();
  for (const [id, owner, uid] of [[hospitalA, adminA, 'HID-STAFFA01'], [hospitalB, adminB, 'HID-STAFFB01']]) {
    await insert(database.db, 'hospitals', {
      id, user_id: owner.id, uid, name: 'Synthetic staff hospital', updated_at: new Date()
    });
  }
  const staffA = newPostgresId(), staffB = newPostgresId();
  for (const [id, hospital, uid] of [[staffA, hospitalA, staffUser.uid], [staffB, hospitalB, otherStaffUser.uid]]) {
    await insert(database.db, 'hospital_memberships', {
      id, hospital_id: hospital, uid, first_name: 'Synthetic', last_name: 'Reception', role: 'receptionist'
    });
  }
  const patientId = newPostgresId(), doctorId = newPostgresId();
  await insert(database.db, 'patients', {
    id: patientId, user_id: patientUser.id, uid: 'MID-STAFFTEST', first_name: 'Synthetic', last_name: 'Patient', updated_at: new Date()
  });
  await insert(database.db, 'doctors', {
    id: doctorId, user_id: doctorUser.id, uid: 'HID-STAFFA01-DOC-0001', first_name: 'Synthetic',
    last_name: 'Doctor', specialization: 'Synthetic', is_private_practice: true, updated_at: new Date()
  });
  await insert(database.db, 'doctor_hospital_memberships', { id: newPostgresId(), doctor_id: doctorId, hospital_id: hospitalA });

  await check('normal Prisma-backed identity repository reads the active hospital_staff user', async () => {
    const byId = await runtime.sessions.repository.byId(staffUser.id);
    const byEmail = await runtime.sessions.repository.find({ email: staffUser.email });
    assert.deepEqual(byEmail, byId);
    assert.equal(byId.id, staffUser.id);
    assert.equal(byId.role, 'hospital_staff');
    assert.equal(byId.isActive, true);
    assert.equal(byId.uid, staffUser.uid);
  });
  await check('HospitalStaff links require the owning admin and preserve exactly one hospital scope', async () => {
    await assert.rejects(
      () => runtime.provisioning.linkStaff(adminB, { staffId: staffA, userId: staffUser.id, hospitalId: hospitalB }),
      authError('AUTH_FORBIDDEN')
    );
    const linked = await runtime.provisioning.linkStaff(adminA, { staffId: staffA, userId: staffUser.id, hospitalId: hospitalA });
    assert.deepEqual(linked.staff, { id: staffA, userId: staffUser.id, hospitalId: hospitalA });
    await assert.rejects(
      () => runtime.provisioning.linkStaff(adminB, { staffId: staffB, userId: staffUser.id, hospitalId: hospitalB }),
      authError('AUTH_CONFLICT')
    );
    const rows = (await database.db.query(
      'SELECT id,user_id,hospital_id,role::text role FROM hospital_memberships WHERE user_id=$1', [staffUser.id]
    )).rows;
    assert.deepEqual(rows, [{ id: staffA, user_id: staffUser.id, hospital_id: hospitalA, role: 'receptionist' }]);
    assert.equal((await database.db.query('SELECT user_id FROM hospital_memberships WHERE id=$1', [staffB])).rows[0].user_id, null);
  });

  let session, principal;
  await check('normal PostgreSQL Sessions.login issues and verifies RS256 with exactly the hospital_staff role', async () => {
    session = await runtime.sessions.login(' RECEPTION-A@EXAMPLE.INVALID ', password);
    const decoded = jwt.decode(session.token, { complete: true });
    assert.equal(decoded.header.alg, 'RS256');
    assert.equal(decoded.header.kid, 'synthetic-staff-key');
    assert.equal(decoded.payload.role, 'hospital_staff');
    assert.equal(decoded.payload.sub, staffUser.id);
    assert.deepEqual(Object.keys(decoded.payload).sort(), ['aud', 'exp', 'iat', 'iss', 'jti', 'nbf', 'role', 'sid', 'sub', 'ver']);
    const verified = runtime.tokens.verify(session.token);
    principal = await runtime.sessions.authenticate(session.token);
    assert.deepEqual(principal, verified);
    assert.equal(principal.role, 'hospital_staff');
    assert.equal(principal.id, staffUser.id);
    assert.equal(session.user.role, 'hospital_staff');
    assert.equal((await runtime.sessions.me(principal)).user.role, 'hospital_staff');
    const byUid = await runtime.sessions.login(staffUser.uid.toLowerCase(), password);
    assert.equal((await runtime.sessions.authenticate(byUid.token)).role, 'hospital_staff');
    await runtime.sessions.logout(byUid.refreshSecret);
  });
  const draft = { hospitalId: hospitalA, firstName: 'Synthetic', lastName: 'Forbidden', specialization: 'Synthetic medicine' };
  await check('staff cannot provision doctors in any hospital or gain admin authority through a forged role', async () => {
    for (const actor of [principal, { ...principal, role: 'hospital_admin' }]) {
      for (const hospitalId of [hospitalA, hospitalB]) {
        await assert.rejects(() => runtime.provisioning.createDoctor(actor, { ...draft, hospitalId }), authError('AUTH_FORBIDDEN'));
        await assert.rejects(() => runtime.policies.hospitalAdmin(actor, hospitalId), authError('AUTH_FORBIDDEN'));
      }
    }
    assert.equal((await database.db.query('SELECT count(*)::int n FROM doctors')).rows[0].n, 1);
    assert.equal((await database.db.query('SELECT role::text role FROM users WHERE id=$1', [staffUser.id])).rows[0].role, 'hospital_staff');
  });
  await check('a hospital staff link grants no patient, doctor, clinic or EHR authority', async () => {
    for (const operation of [
      () => runtime.policies.patientSelf(principal, patientId),
      () => runtime.policies.doctorIdentity(principal, doctorId),
      () => runtime.policies.doctorHospital(principal, hospitalA),
      () => runtime.policies.hospitalScope(principal, hospitalA),
      () => runtime.policies.privateClinic(principal, doctorId)
    ]) await assert.rejects(operation, authError('AUTH_FORBIDDEN'));
    const connection = await database.connect('mediid_runtime', credentials.mediid_runtime);
    for (const table of ['encounters', 'prescriptions']) {
      await assert.rejects(() => connection.query('SELECT * FROM public.' + table), error => error.code === '42501');
    }
  });

  let businessHandlersReached = 0;
  const app = express();
  app.use(express.json());
  app.use('/api/auth', createAuthRouter(runtime));
  // Mount the production business protection in front of synthetic sentinels.
  // Any successful next() would reach a handler and fail this regression.
  app.use('/api', protect, authorize('hospital_admin', 'doctor', 'patient', 'hospital_staff'), (req, res) => {
    businessHandlersReached++;
    res.json({ unexpected: true });
  });
  server = http.createServer(app);
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = 'http://127.0.0.1:' + server.address().port;
  async function api(route, { method = 'GET', body, token = session.token, csrfToken } = {}) {
    const headers = { Origin: allowedOrigin, Authorization: 'Bearer ' + token };
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    if (csrfToken) {
      headers['X-Mediid-CSRF'] = csrfToken;
      headers.Cookie = 'mediid_csrf=' + csrfToken;
    }
    const response = await fetch(base + '/api/' + route, {
      method, headers, ...(body === undefined ? {} : { body: JSON.stringify(body) }), signal: AbortSignal.timeout(10000)
    });
    return { status: response.status, body: await response.json() };
  }
  await check('mounted auth accepts the staff session but rejects doctor provisioning and admin impersonation', async () => {
    const me = await api('auth/me');
    assert.equal(me.status, 200);
    assert.equal(me.body.user.role, 'hospital_staff');
    const csrf = await api('auth/csrf');
    assert.equal(csrf.status, 200);
    for (const [route, body] of [
      ['auth/provision/doctors', draft],
      ['auth/login', { email: doctorUser.email, password, refresh: false }]
    ]) {
      const result = await api(route, { method: 'POST', body, csrfToken: csrf.body.csrfToken });
      assert.equal(result.status, 403);
      assert.equal(result.body.code, 'AUTH_FORBIDDEN');
    }
  });
  await check('mounted PostgreSQL business protection fails closed for staff and scheduling before legacy reconciliation', async () => {
    for (const route of ['staff', 'appointments', 'hospitals/admin/profile', 'doctor-portal/patient/MID-STAFFTEST']) {
      const result = await api(route);
      assert.equal(result.status, 503, route);
      assert.equal(result.body.code, 'AUTH_DOMAIN_NOT_MIGRATED');
      assert.deepEqual(Object.keys(result.body).sort(), ['code', 'message']);
    }
    assert.equal(businessHandlersReached, 0);
  });
  await check('an explicit legacy mapping still grants staff no hospital-admin, scheduling or clinical business access', async () => {
    await insert(database.db, 'auth_legacy_links', {
      user_id: staffUser.id, mongo_user_id: randomBytes(12).toString('hex'),
      hospital_mongo_id: randomBytes(12).toString('hex'), patient_mongo_id: randomBytes(12).toString('hex'),
      source_fingerprint: randomBytes(32).toString('hex')
    });
    for (const [route, method, body] of [
      ['staff', 'GET'], ['appointments', 'GET'], ['hospitals/admin/profile', 'GET'],
      ['patients/profile', 'GET'], ['doctor-portal/patient/MID-STAFFTEST', 'GET'],
      ['appointments/' + newPostgresId() + '/status', 'PUT', { status: 'completed' }]
    ]) {
      const result = await api(route, { method, body });
      assert.equal(result.status, 503, route);
      assert.equal(result.body.code, 'AUTH_DOMAIN_NOT_MIGRATED');
      assert.deepEqual(Object.keys(result.body).sort(), ['code', 'message']);
    }
    assert.equal(businessHandlersReached, 0);
    assert.equal((await runtime.sessions.authenticate(session.token)).role, 'hospital_staff');
    assert.equal((await runtime.sessions.repository.byId(staffUser.id)).role, 'hospital_staff');
  });

  writeFileSync('.test-data/phase22b-hospital-staff-results.json', JSON.stringify({
    status: 'PASS', passed: checks.length, checks, postgres: 'native', redis: 'real',
    actualRuntimeCredential: true, normalIdentityRepository: true, normalSessionService: true,
    mountedBusinessProtection: true, synthetic: true, productionAccess: false
  }, null, 2) + '\n');
  console.log(checks.length + ' hospital_staff identity boundary checks passed.');
} finally {
  if (server) await new Promise(resolve => server.close(resolve));
  await runtime?.stop();
  await redis?.stop();
  await cluster?.stop();
}
