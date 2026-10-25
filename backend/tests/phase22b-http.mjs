import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { spawn, spawnSync } from 'node:child_process';
import { generateKeyPairSync, randomBytes } from 'node:crypto';
import { createRequire } from 'node:module';
import net from 'node:net';
import http from 'node:http';
import path from 'node:path';
import { startNativeCluster } from './helpers/native-cluster.mjs';
import { startRedis } from './helpers/redis-instance.mjs';
const require = createRequire(import.meta.url);
const mongoose = require('mongoose'), bcrypt = require('bcryptjs'), jwt = require('jsonwebtoken');
const { MongoMemoryServer } = require('mongodb-memory-server');
const { newPostgresId } = require('../src/identifiers/uuid');
const { httpConfig } = require('../src/auth/runtime');
const { createAuthRouter } = require('../src/auth/http');
const express = require('express');
const checks = [];
async function check(name, fn) { await fn(); checks.push(name); console.log('PASS auth HTTP: ' + name); }
async function port() {
  const lease = net.createServer(); await new Promise(resolve => lease.listen(0, '127.0.0.1', resolve));
  const value = lease.address().port; await new Promise(resolve => lease.close(resolve)); return value;
}
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
const cluster = await startNativeCluster();
let redis, mongo, source, child, secureServer;
let output = '';
try {
  redis = await startRedis();
  const database = await cluster.database();
  await database.db.exec('CREATE EXTENSION vector; CREATE EXTENSION btree_gist;');
  await database.db.exec(readFileSync('prisma/roles.sql', 'utf8'));
  const credentials = Object.fromEntries(['mediid_migrator', 'mediid_runtime', 'mediid_diagnostics'].map(role => [role, randomBytes(32).toString('hex')]));
  for (const [role, credential] of Object.entries(credentials)) await cluster.admin.query('ALTER ROLE ' + role + " LOGIN PASSWORD '" + credential + "'");
  const migrationUrl = database.url('mediid_migrator', credentials.mediid_migrator);
  const deployed = spawnSync(process.execPath, ['scripts/prisma.cjs', 'deploy'], {
    env: { ...process.env, NODE_ENV: 'test', PG_ENV_FILE: path.join(cluster.root, 'absent.env'), PG_MIGRATION_URL: migrationUrl },
    encoding: 'utf8', windowsHide: true, timeout: 120000
  });
  assert.equal(deployed.status, 0, deployed.stdout + deployed.stderr);
  mongo = await MongoMemoryServer.create({ binary: { version: '7.0.30', downloadDir: path.resolve('.test-data/mongodb-binaries') }, instance: { ip: '127.0.0.1' } });
  source = await mongoose.createConnection(mongo.getUri('mediid_http_synthetic'), { autoIndex: false }).asPromise();
  const password = 'SyntheticHttpPassword123!', hash = await bcrypt.hash(password, 8);
  await source.collection('users').insertOne({ email: 'mongo-only@example.invalid', password: hash, role: 'patient', isActive: true, createdAt: new Date() });
  const originalMongoCount = await source.collection('users').countDocuments();
  let expectedMongoCount = originalMongoCount;
  const pair = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const privatePem = pair.privateKey.export({ type: 'pkcs8', format: 'pem' });
  const publicPem = pair.publicKey.export({ type: 'spki', format: 'pem' });
  const allowedOrigin = 'https://synthetic-client.invalid';
  const env = {};
  for (const key of ['PATH', 'Path', 'SystemRoot', 'WINDIR', 'TEMP', 'TMP', 'USERPROFILE']) if (process.env[key]) env[key] = process.env[key];
  Object.assign(env, {
    NODE_ENV: 'test', HOST: '127.0.0.1', PORT: String(await port()), AUTH_BACKEND: 'postgres',
    MONGO_URI: mongo.getUri('mediid_http_synthetic'), MARKETPLACE_URI: mongo.getUri('marketplace_http_synthetic'),
    DOTENV_CONFIG_PATH: path.join(cluster.root, 'absent.env'), PG_ENV_FILE: path.join(cluster.root, 'absent.env'),
    PG_RUNTIME_URL: database.url('mediid_runtime', credentials.mediid_runtime), AUTH_REDIS_URL: redis.url,
    AUTH_RATE_KEY_SECRET: randomBytes(32).toString('hex'), AUTH_RATE_LOGIN_SOURCE_MAX: '100', AUTH_RATE_LOGIN_IDENTITY_MAX: '5',
    AUTH_ALLOWED_ORIGINS: allowedOrigin, CLIENT_URL: allowedOrigin, AUTH_COOKIE_SAME_SITE: 'lax',
    AUTH_JWT_ISSUER: 'mediid-http-synthetic', AUTH_JWT_AUDIENCE: 'mediid-http-synthetic-api',
    AUTH_JWT_KEY_ID: 'synthetic-http-key', AUTH_JWT_TTL_SECONDS: '900', AUTH_BCRYPT_COST: '12', AUTH_RESET_TTL_SECONDS: '900',
    AUTH_JWT_PRIVATE_KEY: privatePem, AUTH_JWT_PUBLIC_KEY: publicPem,
    SMTP_HOST: '127.0.0.1', SMTP_PORT: '587', SMTP_USER: 'synthetic', SMTP_PASS: randomBytes(32).toString('hex'), SMTP_FROM: 'synthetic@example.invalid',
    REDIS_HOST: '127.0.0.1', REDIS_PORT: '1'
  });
  const secrets = [password, hash, privatePem, migrationUrl, env.PG_RUNTIME_URL, redis.url, env.SMTP_PASS, env.AUTH_RATE_KEY_SECRET, ...Object.values(credentials)];
  const redact = value => secrets.reduce((text, secret) => text.replaceAll(secret, '[redacted]'), String(value));
  child = spawn(process.execPath, [path.resolve('server.js')], { cwd: process.cwd(), env, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
  child.stdout.on('data', value => { output = redact((output + value).slice(-20000)); });
  child.stderr.on('data', value => { output = redact((output + value).slice(-20000)); });
  const deadline = Date.now() + 60000;
  while (!output.includes('Server running on port')) {
    if (child.exitCode !== null || Date.now() > deadline) throw new Error('Synthetic PostgreSQL HTTP startup failed: ' + redact(output));
    await delay(100);
  }
  const base = 'http://127.0.0.1:' + env.PORT;
  const jar = new Map();
  async function api(route, { method = 'GET', body, token, cookies = jar, origin = allowedOrigin, csrf = true, header = null } = {}) {
    const headers = { ...(body === undefined ? {} : { 'Content-Type': 'application/json' }), ...(origin ? { Origin: origin } : {}),
      ...(token ? { Authorization: 'Bearer ' + token } : {}),
      ...(cookies?.size ? { Cookie: [...cookies].map(([key, value]) => key + '=' + value).join('; ') } : {}) };
    if (method !== 'GET' && csrf && cookies?.has('mediid_csrf')) headers['X-Mediid-CSRF'] = header ?? decodeURIComponent(cookies.get('mediid_csrf'));
    const response = await fetch(base + '/api/' + route, { method, headers, ...(body === undefined ? {} : { body: JSON.stringify(body) }), signal: AbortSignal.timeout(15000) });
    const setCookies = response.headers.getSetCookie();
    if (cookies) for (const value of setCookies) {
      const entry = value.split(';')[0], separator = entry.indexOf('='), name = entry.slice(0, separator), data = entry.slice(separator + 1);
      if (!data) cookies.delete(name); else cookies.set(name, data);
    }
    const text = await response.text(); let result;
    try { result = JSON.parse(text); } catch { result = text; }
    return { status: response.status, body: result, headers: response.headers, setCookies };
  }
  await check('actual server.js mounts PostgreSQL auth and exposes the configured compatibility boundary', async () => {
    assert.equal((await api('health')).status, 200);
    assert.deepEqual((await api('auth/config')).body, { backend: 'postgres' });
    assert.equal((await api('seed')).status, 404);
  });
  await check('exact CORS and origin plus double-submit CSRF protect mutation endpoints', async () => {
    const csrf = await api('auth/csrf'); assert.equal(csrf.status, 200);
    assert.match(csrf.body.csrfToken, /^[A-Za-z0-9_-]{43}$/);
    assert.equal(csrf.headers.get('access-control-allow-origin'), allowedOrigin);
    const request = { method: 'POST', body: { email: 'absent@example.invalid', password } };
    for (const extra of [{ csrf: false }, { header: randomBytes(32).toString('base64url') }, { origin: null }, { origin: 'https://synthetic-client.invalid.attacker.invalid' }]) {
      const result = await api('auth/login', { ...request, ...extra });
      assert.equal(result.status, 403); assert.equal(result.body.code, 'AUTH_FORBIDDEN');
    }
    const blocked = await api('auth/config', { origin: 'https://attacker.vercel.app' });
    assert.equal(blocked.headers.get('access-control-allow-origin'), null);
    const preflight = await api('auth/login', { method: 'OPTIONS', origin: allowedOrigin });
    assert.equal(preflight.headers.get('access-control-allow-origin'), allowedOrigin);
  });
  let registered, loggedIn, rotated;
  await check('mounted auth rejects oversized and malformed bodies before credential processing', async () => {
    const oversized = await api('auth/login', { method: 'POST', body: { email: 'x'.repeat(17000) } });
    assert.equal(oversized.status, 413);
    assert.equal(oversized.headers.get('cache-control'), 'no-store');
    const malformed = await fetch(base + '/api/auth/login', {
      method: 'POST', headers: { 'Content-Type': 'application/json', Origin: allowedOrigin },
      body: '{"email":', signal: AbortSignal.timeout(5000)
    });
    assert.equal(malformed.status, 400);
    assert.deepEqual(await malformed.json(), { message: 'Invalid authentication request.' });
  });
  await check('registration returns safe token/user/profile and an HttpOnly refresh cookie without Mongo writes', async () => {
    registered = await api('auth/register', { method: 'POST', body: { email: ' HttpPatient@Example.Invalid ', password, role: 'patient', firstName: 'Synthetic', lastName: 'HTTP' } });
    assert.equal(registered.status, 201, JSON.stringify(registered.body));
    assert.deepEqual(Object.keys(registered.body).sort(), ['profile', 'token', 'user']);
    assert.deepEqual(Object.keys(registered.body.user).sort(), ['email', 'id', 'identityId', 'role', 'uid']);
    assert.equal(registered.body.user.email, 'httppatient@example.invalid'); assert.match(registered.body.profile.uid, /^MID-/);
    const refreshCookie = registered.setCookies.find(cookie => cookie.startsWith('mediid_refresh='));
    for (const attribute of ['HttpOnly', 'Path=/api/auth', 'SameSite=Lax', 'Expires=']) assert.ok(refreshCookie.includes(attribute));
    assert.ok(!refreshCookie.includes('Secure'));
    assert.equal(registered.headers.get('cache-control'), 'no-store');
    for (const key of ['password', 'passwordHash', 'refreshSecret', 'resetPasswordToken']) assert.ok(!Object.hasOwn(registered.body, key));
    const claims = jwt.decode(registered.body.token);
    assert.deepEqual(Object.keys(claims).sort(), ['aud', 'exp', 'iat', 'iss', 'jti', 'nbf', 'role', 'sid', 'sub', 'ver']);
    assert.equal(await source.collection('users').countDocuments(), originalMongoCount);
    assert.equal(await source.collection('patients').countDocuments(), 0);
  });
  await check('production cookie boundary sets Secure and enforces explicit HTTPS origins', async () => {
    const config = httpConfig({ NODE_ENV: 'production', AUTH_ALLOWED_ORIGINS: allowedOrigin, AUTH_COOKIE_SAME_SITE: 'none' });
    assert.equal(config.secure, true);
    assert.throws(() => httpConfig({ NODE_ENV: 'production', AUTH_ALLOWED_ORIGINS: 'http://synthetic.invalid' }));
    const result = { refreshSecret: randomBytes(32).toString('base64url'), expiresAt: new Date(Date.now() + 60000),
      token: 'synthetic-short-access', user: { role: 'patient' }, profile: null };
    const application = express(); application.use(express.json());
    application.use(createAuthRouter({ http: config, sessions: { register: async () => result }, limits: { consume: async () => {} }, provisioning: {} }));
    secureServer = http.createServer(application); await new Promise(resolve => secureServer.listen(0, '127.0.0.1', resolve));
    const root = 'http://127.0.0.1:' + secureServer.address().port;
    const csrf = await fetch(root + '/csrf', { headers: { Origin: allowedOrigin } }); const data = await csrf.json();
    const response = await fetch(root + '/register', { method: 'POST', headers: { Origin: allowedOrigin, 'Content-Type': 'application/json', 'X-Mediid-CSRF': data.csrfToken, Cookie: 'mediid_csrf=' + data.csrfToken }, body: '{}' });
    const cookie = response.headers.getSetCookie().find(value => value.startsWith('mediid_refresh='));
    assert.ok(cookie.includes('Secure')); assert.ok(cookie.includes('HttpOnly')); assert.ok(cookie.includes('SameSite=None'));
    await new Promise(resolve => secureServer.close(resolve)); secureServer = null;
  });
  await check('PostgreSQL login/me work and still-Mongo unlinked business routes return safe 503', async () => {
    loggedIn = await api('auth/login', { method: 'POST', body: { email: 'httppatient@example.invalid', password } });
    assert.equal(loggedIn.status, 200);
    assert.equal((await api('auth/me', { token: loggedIn.body.token })).status, 200);
    const profile = await api('patients/profile', { token: loggedIn.body.token });
    assert.equal(profile.status, 503); assert.equal(profile.body.code, 'AUTH_DOMAIN_NOT_MIGRATED');
    assert.deepEqual(Object.keys(profile.body).sort(), ['code', 'message']);
  });
  await check('Mongo-only accounts, legacy HS256, malformed and unbound RS256 tokens cannot authenticate', async () => {
    const unknown = await api('auth/login', { method: 'POST', body: { email: 'unknown@example.invalid', password } });
    const mongoOnly = await api('auth/login', { method: 'POST', body: { email: 'mongo-only@example.invalid', password } });
    assert.equal(mongoOnly.status, 401); assert.deepEqual(mongoOnly.body, unknown.body);
    const legacy = jwt.sign({ id: String((await source.collection('users').findOne())._id), role: 'patient' }, randomBytes(32).toString('hex'), { algorithm: 'HS256' });
    const unbound = jwt.sign({ role: 'patient' }, pair.privateKey, { algorithm: 'RS256', keyid: env.AUTH_JWT_KEY_ID, subject: loggedIn.body.user.identityId, issuer: env.AUTH_JWT_ISSUER, audience: env.AUTH_JWT_AUDIENCE, expiresIn: 900, notBefore: 0 });
    for (const token of [legacy, unbound, 'malformed.jwt']) assert.equal((await api('auth/me', { token })).status, 401);
  });
  await check('refresh rotation changes the HttpOnly credential and logout immediately rejects access JWTs', async () => {
    const previous = jar.get('mediid_refresh');
    rotated = await api('auth/refresh', { method: 'POST', body: {} });
    assert.equal(rotated.status, 200); assert.notEqual(jar.get('mediid_refresh'), previous);
    assert.equal((await api('auth/me', { token: rotated.body.token })).status, 200);
    assert.equal((await api('auth/logout', { method: 'POST', body: {} })).status, 200);
    assert.ok(!jar.has('mediid_refresh'));
    assert.equal((await api('auth/me', { token: rotated.body.token })).status, 401);
    assert.equal((await api('auth/me', { token: loggedIn.body.token })).status, 401);
  });
  await check('reusing a consumed refresh cookie revokes the successful continuation family', async () => {
    const login = await api('auth/login', { method: 'POST', body: { email: 'httppatient@example.invalid', password } });
    assert.equal(login.status, 200);
    const oldJar = new Map(jar);
    const continuation = await api('auth/refresh', { method: 'POST', body: {} });
    assert.equal(continuation.status, 200);
    const replay = await api('auth/refresh', { method: 'POST', body: {}, cookies: oldJar });
    assert.equal(replay.status, 401);
    assert.equal((await api('auth/me', { token: continuation.body.token })).status, 401);
  });
  // Minimal synthetic PostgreSQL identities allow the admin-only impersonation
  // compatibility operation to prove membership authorization and cookie isolation.
  const adminId = newPostgresId(), doctorUserId = newPostgresId(), hospitalId = newPostgresId(), doctorId = newPostgresId();
  await database.db.query("INSERT INTO users(id,email,password_hash,role,updated_at) VALUES($1,'http-admin@example.invalid',$2,'hospital_admin',now()),($3,'http-doctor@example.invalid',$2,'doctor',now())", [adminId, hash, doctorUserId]);
  await database.db.query("INSERT INTO hospitals(id,user_id,uid,name,updated_at) VALUES($1,$2,'HID-HTTPTEST','Synthetic HTTP Hospital',now())", [hospitalId, adminId]);
  await database.db.query("INSERT INTO doctors(id,user_id,uid,first_name,last_name,specialization,primary_hospital_id,updated_at) VALUES($1,$2,'HID-HTTPTEST-DOC-0001','Synthetic','Doctor','Synthetic medicine',$3,now())", [doctorId, doctorUserId, hospitalId]);
  await database.db.query('INSERT INTO doctor_hospital_memberships(id,doctor_id,hospital_id) VALUES($1,$2,$3)', [newPostgresId(), doctorId, hospitalId]);
  await check('refresh:false needs hospital-admin authorization and preserves the admin refresh cookie', async () => {
    const patient = await api('auth/login', { method: 'POST', body: { email: 'httppatient@example.invalid', password } });
    assert.equal(patient.status, 200);
    const before = jar.get('mediid_refresh'), body = { email: 'http-doctor@example.invalid', password, refresh: false };
    const anonymous = await api('auth/login', { method: 'POST', body });
    assert.equal(anonymous.status, 401); assert.equal(jar.get('mediid_refresh'), before);
    const forbidden = await api('auth/login', { method: 'POST', body, token: patient.body.token });
    assert.equal(forbidden.status, 403); assert.equal(jar.get('mediid_refresh'), before);
    const admin = await api('auth/login', { method: 'POST', body: { email: 'http-admin@example.invalid', password } });
    assert.equal(admin.status, 200); const adminCookie = jar.get('mediid_refresh');
    const allowed = await api('auth/login', { method: 'POST', body, token: admin.body.token });
    assert.equal(allowed.status, 200, JSON.stringify(allowed.body)); assert.equal(allowed.body.user.role, 'doctor');
    assert.equal(allowed.body.profile.authorizedHospitalId, hospitalId);
    assert.equal(allowed.setCookies.length, 0); assert.equal(jar.get('mediid_refresh'), adminCookie);
    assert.equal((await api('auth/me', { token: allowed.body.token })).status, 200);
    const absent = await api('auth/logout', { method: 'POST', body: { sessionOnly: true } });
    assert.equal(absent.status, 401); assert.equal(absent.setCookies.length, 0); assert.equal(jar.get('mediid_refresh'), adminCookie);
    const secondaryLogout = await api('auth/logout', { method: 'POST', body: { sessionOnly: true }, token: allowed.body.token });
    assert.equal(secondaryLogout.status, 200); assert.equal(secondaryLogout.setCookies.length, 0);
    assert.equal(jar.get('mediid_refresh'), adminCookie);
    assert.equal((await api('auth/me', { token: allowed.body.token })).status, 401);
    assert.equal((await api('auth/me', { token: admin.body.token })).status, 200);
  });
  await check('provisioning endpoints require both CSRF and authenticated scope; a public UID is insufficient for activation', async () => {
    const body = { hospitalId, firstName: 'Synthetic', lastName: 'Unauthorised', specialization: 'Synthetic medicine' };
    assert.equal((await api('auth/provision/doctors', { method: 'POST', body, csrf: false })).status, 403);
    assert.equal((await api('auth/provision/doctors', { method: 'POST', body })).status, 401);
    assert.equal((await api('auth/provision/memberships', { method: 'POST', body: { doctorId, hospitalId } })).status, 401);
    assert.equal((await api('auth/provision/staff-links', { method: 'POST', body: { staffId: newPostgresId(), userId: doctorUserId, hospitalId } })).status, 401);
    const activation = await api('auth/doctor-activate', { method: 'POST', body: { uid: 'HID-HTTPTEST-DOC-0001', password } });
    assert.equal(activation.status, 401); assert.equal(activation.body.code, 'AUTH_CREDENTIALS');
  });
  await check('HTTP Redis limits return safe 429 and unknown reset requests remain generic', async () => {
    let blocked;
    for (let attempt = 0; attempt < 6; attempt++) blocked = await api('auth/login', { method: 'POST', body: { email: 'rate-only@example.invalid', password: 'wrong' } });
    assert.equal(blocked.status, 429); assert.equal(blocked.body.code, 'AUTH_RATE_LIMIT');
    assert.deepEqual(Object.keys(blocked.body).sort(), ['code', 'message']); assert.ok(Number(blocked.headers.get('retry-after')) >= 1);
    const reset = await api('auth/forgot-password', { method: 'POST', body: { email: 'never-exists@example.invalid' } });
    assert.equal(reset.status, 200); assert.deepEqual(Object.keys(reset.body), ['message']);
  });
  await check('an unknown auth backend fails startup instead of falling back to Mongo', async () => {
    const result = spawnSync(process.execPath, [path.resolve('server.js')], {
      env: { ...env, AUTH_BACKEND: 'automatic', PORT: String(await port()) }, cwd: process.cwd(), encoding: 'utf8', windowsHide: true, timeout: 15000
    });
    assert.equal(result.status, 1, redact(result.stdout + result.stderr));
    assert.ok(result.stderr.includes('Authentication is unavailable.'));
    assert.ok(!result.stdout.includes('Server running on port'));
    for (const secret of secrets) assert.ok(!result.stderr.includes(secret));
  });
let mappedAdminToken;
  await check('explicitly reconciled Mongo identities retain owned profile reads while unreviewed clinical/admin routes fail closed', async () => {
    const original = await source.collection('users').findOne({ email: 'mongo-only@example.invalid' });
    const patientProfile = { _id: new mongoose.Types.ObjectId(), user: original._id, uid: 'MID-HTTPMAPPED',
      firstName: 'Synthetic', lastName: 'Mapped', qrCode: 'data:image/png;base64,SyntheticPreservedPatientQR', createdAt: original.createdAt };
    const adminMongoId = new mongoose.Types.ObjectId(), doctorMongoId = new mongoose.Types.ObjectId();
    const hospitalMongoId = new mongoose.Types.ObjectId(), doctorProfileId = new mongoose.Types.ObjectId(), createdAt = new Date();
    await source.collection('users').insertMany([
      { _id: adminMongoId, email: 'mapped-admin@example.invalid', password: hash, role: 'hospital_admin', isActive: true, createdAt },
      { _id: doctorMongoId, email: 'mapped-doctor@example.invalid', uid: 'HID-HTTPMAPPED-DOC-0001', password: hash, role: 'doctor', isActive: true, createdAt }
    ]);
    await source.collection('patients').insertOne(patientProfile);
    await source.collection('hospitals').insertOne({ _id: hospitalMongoId, user: adminMongoId, uid: 'HID-HTTPMAPPED',
      name: 'Synthetic Reconciled Hospital', qrCode: 'data:image/png;base64,SyntheticPreservedHospitalQR', isActive: true, createdAt });
    await source.collection('doctors').insertOne({ _id: doctorProfileId, user: doctorMongoId, hospital: hospitalMongoId,
      uid: 'HID-HTTPMAPPED-DOC-0001', firstName: 'Synthetic', lastName: 'MappedDoctor', specialization: 'Synthetic medicine',
      qrCode: 'data:image/png;base64,SyntheticPreservedDoctorQR', isActive: true, createdAt });
    const { PrismaClient } = require('@prisma/client');
    const { reconcileLegacyAuth } = require('../src/auth/migration');
    const { readLegacySnapshot } = require('../scripts/migrate-auth.cjs');
    const migrationClient = new PrismaClient({ datasources: { db: { url: migrationUrl } }, log: [] });
    try {
      const report = await reconcileLegacyAuth(migrationClient, await readLegacySnapshot(source), 'apply');
      assert.equal(report.status, 'applied', JSON.stringify(report)); assert.equal(report.applied, 3);
    } finally { await migrationClient.$disconnect(); }
    expectedMongoCount += 2;
    const patient = await api('auth/login', { method: 'POST', body: { email: 'mongo-only@example.invalid', password } });
    assert.equal(patient.status, 200); assert.equal(patient.body.user.id, String(original._id));
    const self = await api('patients/profile', { token: patient.body.token });
    assert.equal(self.status, 200); assert.equal(self.body.uid, patientProfile.uid);
    const qr = await api('patients/qr', { token: patient.body.token });
    assert.equal(qr.status, 200); assert.equal(qr.body.qrCode, patientProfile.qrCode);
    const admin = await api('auth/login', { method: 'POST', body: { email: 'mapped-admin@example.invalid', password } });
    assert.equal(admin.status, 200); mappedAdminToken = admin.body.token;
    const hospital = await api('hospitals/admin/profile', { token: mappedAdminToken });
    assert.equal(hospital.status, 200); assert.equal(hospital.body.uid, 'HID-HTTPMAPPED');
    const dangerous = [
      ['GET', 'doctor-portal/patient/MID-HTTPMAPPED', undefined],
      ['GET', 'staff', undefined],
      ['POST', 'hospital-admin/doctor-login', { doctorId: String(doctorProfileId) }],
      ['POST', 'reports/upload', {}],
      ['PUT', 'appointments/' + newPostgresId() + '/status', { status: 'completed' }]
    ];
    for (const [method, route, body] of dangerous) {
      const response = await api(route, { method, body, token: mappedAdminToken });
      assert.equal(response.status, 503, route + ': ' + JSON.stringify(response.body));
      assert.equal(response.body.code, 'AUTH_DOMAIN_NOT_MIGRATED');
    }
    const doctor = await api('auth/login', { method: 'POST', body: { email: 'mapped-doctor@example.invalid', password } });
    assert.equal(doctor.status, 200);
    const clinical = await api('doctor-portal/patient/MID-HTTPMAPPED', { token: doctor.body.token });
    assert.equal(clinical.status, 503); assert.equal(clinical.body.code, 'AUTH_DOMAIN_NOT_MIGRATED');
    // A mapping alone cannot override authoritative core ownership.
    await database.db.query('UPDATE auth_legacy_links SET patient_mongo_id=$1 WHERE user_id=$2', [String(doctorProfileId), patient.body.user.identityId]);
    assert.equal((await api('patients/profile', { token: patient.body.token })).status, 403);
    await database.db.query('UPDATE auth_legacy_links SET patient_mongo_id=$1 WHERE user_id=$2', [String(patientProfile._id), patient.body.user.identityId]);
  });
  await check('a real Redis outage returns safe HTTP 503 for every security-critical operation', async () => {
    await redis.stop();
    const protectedOperations = [
      ['auth/login', { email: 'outage-login@example.invalid', password }],
      ['auth/register', { email: 'outage-register@example.invalid', password, firstName: 'Synthetic', lastName: 'Outage' }],
      ['auth/refresh', {}],
      ['auth/forgot-password', { email: 'outage-reset@example.invalid' }],
      ['auth/reset-password', { token: 'synthetic-invalid-credential', newPassword: password }],
      ['auth/doctor-activate', { uid: 'DOC-SYNTHETIC', activationToken: randomBytes(32).toString('base64url'), password }],
      ['auth/provision/doctors', { hospitalId, firstName: 'Synthetic', lastName: 'Outage', specialization: 'Synthetic medicine' }]
    ];
    for (const [route, body] of protectedOperations) {
      const result = await api(route, { method: 'POST', body, token: mappedAdminToken });
      assert.equal(result.status, 503, route + ': ' + JSON.stringify(result.body));
      assert.equal(result.body.code, 'AUTH_UNAVAILABLE'); assert.deepEqual(Object.keys(result.body).sort(), ['code', 'message']);
    }
  });

  assert.equal(await source.collection('users').countDocuments(), expectedMongoCount);
  writeFileSync('.test-data/phase22b-http-results.json', JSON.stringify({ status: 'PASS', actualExpressServer: true, postgres: 'native', redis: 'real', mongo: 'disposable synthetic', passed: checks.length, checks }) + '\n');
  console.log('Phase 2.2B actual Express/PostgreSQL session checks passed: ' + checks.length);
} finally {
  if (secureServer) await new Promise(resolve => secureServer.close(resolve));
  if (child && child.exitCode === null) {
    const closed = new Promise(resolve => child.once('close', resolve)); child.kill();
    await Promise.race([closed, delay(5000)]);
    if (child.exitCode === null) { child.kill('SIGKILL'); await Promise.race([closed, delay(2000)]); }
  }
  await source?.close(); if (mongo) await mongo.stop();
  await redis?.stop(); await cluster.stop();
}
