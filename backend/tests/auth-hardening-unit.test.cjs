'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const { generateKeyPairSync } = require('node:crypto');
const jwt = require('jsonwebtoken');
const { authConfig } = require('../src/auth/config');
const { authenticationMode, httpConfig, startAuthRuntime, issueLegacyToken, verifyLegacyToken } = require('../src/auth/runtime');
const { AccessTokens } = require('../src/auth/tokens');
const { Sessions } = require('../src/auth/sessions');
const { AuthLimits, limitConfig, OPERATIONS } = require('../src/auth/limits');
const { createAuthRouter, cookies, bearerToken } = require('../src/auth/http');
const { authResponse, AuthError } = require('../src/auth/errors');
const { mongoObjectIdToUuid, newPostgresId } = require('../src/identifiers/uuid');
const keys = generateKeyPairSync('rsa', { modulusLength: 2048 });
const previous = generateKeyPairSync('rsa', { modulusLength: 2048 });
const weak = generateKeyPairSync('rsa', { modulusLength: 1024 });
const publicPem = pair => pair.publicKey.export({ type: 'spki', format: 'pem' });
const privatePem = pair => pair.privateKey.export({ type: 'pkcs8', format: 'pem' });
const env = {
  AUTH_JWT_ISSUER: 'mediid-unit', AUTH_JWT_AUDIENCE: 'mediid-unit-api', AUTH_JWT_KEY_ID: 'current', AUTH_JWT_TTL_SECONDS: '900', AUTH_BCRYPT_COST: '12', AUTH_RESET_TTL_SECONDS: '900',
  AUTH_JWT_PRIVATE_KEY: privatePem(keys), AUTH_JWT_PUBLIC_KEY: publicPem(keys)
};
const config = authConfig(env), tokens = new AccessTokens(config), principal = { id: newPostgresId(), role: 'patient' };
const code = expected => error => error instanceof AuthError && error.code === expected;
const redisEnv = { NODE_ENV: 'test', AUTH_REDIS_URL: 'redis://127.0.0.1:6379/0', AUTH_RATE_KEY_SECRET: 'synthetic-unit-hmac-secret-at-least-32-bytes' };

test('authentication mode is explicit and missing or invalid production configuration fails closed', async () => {
  for (const mode of ['legacy', 'postgres']) assert.equal(authenticationMode({ AUTH_BACKEND: mode, NODE_ENV: 'production' }), mode);
  for (const value of [undefined, '', 'mongo', 'POSTGRES', ' postgres', 'postgres ', null, true]) {
    assert.throws(() => authenticationMode({ AUTH_BACKEND: value, NODE_ENV: 'production' }), code('AUTH_CONFIG'));
    await assert.rejects(() => startAuthRuntime({ ...env, AUTH_BACKEND: value, NODE_ENV: 'production' }), code('AUTH_CONFIG'));
  }
});

test('legacy mode also issues only configured RS256 and has no HS256 or default-secret fallback', async () => {
  await startAuthRuntime({ ...env, AUTH_BACKEND: 'legacy', NODE_ENV: 'test' });
  const mongoId = '507f1f77bcf86cd799439011', token = issueLegacyToken(mongoId, 'patient');
  assert.equal(jwt.decode(token, { complete: true }).header.alg, 'RS256');
  assert.equal(verifyLegacyToken(token).id, mongoObjectIdToUuid(mongoId));
  assert.equal(verifyLegacyToken(token).mongoId, mongoId);
  assert.throws(() => verifyLegacyToken(jwt.sign({ id: mongoId, role: 'patient' }, 'mediid_secret', { algorithm: 'HS256' })), code('AUTH_TOKEN'));
  await assert.rejects(() => startAuthRuntime({ AUTH_BACKEND: 'legacy', NODE_ENV: 'production' }), code('AUTH_CONFIG'));
});

test('previous verification keys reject malformed maps, active-kid collisions, weak keys and private key material', () => {
  const invalid = ['{', 'null', '[]', '1', 'true', '"string"', JSON.stringify({ current: publicPem(previous) }), JSON.stringify({ 'bad kid': publicPem(previous) }), JSON.stringify({ previous: privatePem(previous) }), JSON.stringify({ previous: publicPem(weak) }), JSON.stringify({ previous: 'not-a-PEM' }), JSON.stringify({ previous: null }), JSON.stringify(Object.fromEntries(Array.from({ length: 6 }, (_, index) => ['previous-' + index, publicPem(previous)])))];
  for (const value of invalid) assert.throws(() => authConfig({ ...env, AUTH_JWT_PREVIOUS_PUBLIC_KEYS: value }), code('AUTH_CONFIG'));
  const approved = authConfig({ ...env, AUTH_JWT_PREVIOUS_PUBLIC_KEYS: JSON.stringify({ previous: publicPem(previous) }) });
  assert.equal(Object.getPrototypeOf(approved.previousPublicKeys), null);
  assert.equal(Object.isFrozen(approved.previousPublicKeys), true);
  assert.equal(approved.previousPublicKeys.previous.asymmetricKeyType, 'rsa');
  assert.throws(() => authConfig({ ...env, AUTH_JWT_PRIVATE_KEY: privatePem(weak), AUTH_JWT_PUBLIC_KEY: publicPem(weak) }), code('AUTH_CONFIG'));
});

test('session claim projection cannot leak secrets or override the authoritative principal role', () => {
  const session = { sid: newPostgresId(), jti: newPostgresId(), ver: 7, role: 'hospital_admin', secret: 'refresh-secret-sentinel', password: 'password-sentinel', resetToken: 'reset-sentinel', email: 'private@example.invalid', profile: { diagnosis: 'medical-sentinel' } };
  const token = tokens.issue({ ...principal, passwordHash: 'hash-sentinel', patient: { diagnosis: 'medical-sentinel' } }, session);
  const decoded = jwt.decode(token, { complete: true });
  assert.deepEqual(Object.keys(decoded.payload).sort(), ['aud', 'exp', 'iat', 'iss', 'jti', 'nbf', 'role', 'sid', 'sub', 'ver']);
  assert.equal(decoded.payload.role, 'patient'); assert.equal(decoded.payload.sid, session.sid); assert.equal(decoded.payload.ver, 7);
  assert.deepEqual(tokens.verify(token), { ...principal, sid: session.sid, jti: session.jti, ver: 7 });
  assert.ok(!JSON.stringify(decoded).includes('sentinel')); assert.ok(!JSON.stringify(decoded).includes('private@example.invalid'));
});

test('partial, non-UUID, negative and noninteger session claims are rejected', () => {
  const valid = { sid: newPostgresId(), jti: newPostgresId(), ver: 0 };
  for (const session of [{}, { sid: valid.sid }, { ...valid, sid: 'MID-PUBLIC' }, { ...valid, jti: 'not-a-uuid' }, { ...valid, ver: -1 }, { ...valid, ver: 0.5 }, { ...valid, ver: Number.MAX_SAFE_INTEGER + 1 }]) assert.throws(() => tokens.issue(principal, session), code('AUTH_TOKEN'));
  const signed = payload => jwt.sign({ role: 'patient', sub: principal.id, ...payload }, keys.privateKey, { algorithm: 'RS256', keyid: config.keyId, issuer: config.issuer, audience: config.audience, expiresIn: 900, notBefore: 0 });
  for (const payload of [{ sid: valid.sid }, { ...valid, ver: -1 }, { ...valid, sid: 'MID-PUBLIC' }]) assert.throws(() => tokens.verify(signed(payload)), code('AUTH_TOKEN'));
});

test('postgres sessions reject sessionless foundation tokens before querying the database', async () => {
  let calls = 0;
  const infrastructure = { client: { $queryRaw: async () => { calls++; throw new Error('unexpected lookup'); } } };
  const service = new Sessions(config, infrastructure, {}, tokens);
  await assert.rejects(() => service.authenticate(tokens.issue(principal)), code('AUTH_TOKEN')); assert.equal(calls, 0);
  for (const refreshSeconds of [0, 899, 2592001, 3600.5, NaN]) assert.throws(() => new Sessions(config, infrastructure, {}, tokens, { refreshSeconds }), code('AUTH_CONFIG'));
});

test('HTTP origins are exact and production cookies require HTTPS with safe SameSite policy', () => {
  assert.deepEqual(httpConfig({ NODE_ENV: 'production', AUTH_ALLOWED_ORIGINS: 'https://app.example.invalid,https://second.example.invalid', AUTH_COOKIE_SAME_SITE: 'none' }), { origins: ['https://app.example.invalid', 'https://second.example.invalid'], secure: true, sameSite: 'none' });
  assert.equal(httpConfig({ NODE_ENV: 'production', CLIENT_URL: 'https://app.example.invalid' }).sameSite, 'lax');
  assert.equal(httpConfig({ NODE_ENV: 'test', CLIENT_URL: 'http://localhost:3000', AUTH_COOKIE_SAME_SITE: 'strict' }).secure, false);
  for (const origins of [undefined, '', '*', 'https://*.example.invalid', 'null', 'https://app.example.invalid/', 'https://app.example.invalid/path', 'https://user:password@app.example.invalid', 'javascript:alert(1)', 'http://app.example.invalid', 'https://app.example.invalid,']) assert.throws(() => httpConfig({ NODE_ENV: 'production', AUTH_ALLOWED_ORIGINS: origins }), code('AUTH_CONFIG'));
  for (const sameSite of ['None', 'invalid', 'false']) assert.throws(() => httpConfig({ NODE_ENV: 'production', CLIENT_URL: 'https://app.example.invalid', AUTH_COOKIE_SAME_SITE: sameSite }), code('AUTH_CONFIG'));
  assert.throws(() => httpConfig({ NODE_ENV: 'test', CLIENT_URL: 'http://localhost:3000', AUTH_COOKIE_SAME_SITE: 'none' }), code('AUTH_CONFIG'));
});

test('distributed limiter configuration requires strong key separation, bounded policies and TLS Redis in production', () => {
  const parsed = limitConfig(redisEnv); assert.deepEqual(Object.keys(parsed.policies), OPERATIONS);
  assert.equal(limitConfig({ ...redisEnv, NODE_ENV: 'production', AUTH_REDIS_URL: 'rediss://redis.example.invalid:6379/0' }).url.startsWith('rediss:'), true);
  for (const AUTH_REDIS_URL of [undefined, 'not-a-url', 'http://redis.example.invalid', 'redis://redis.example.invalid/0?tls=false', 'redis://redis.example.invalid/0#secret']) assert.throws(() => limitConfig({ ...redisEnv, AUTH_REDIS_URL }), code('AUTH_CONFIG'));
  assert.throws(() => limitConfig({ ...redisEnv, NODE_ENV: 'production' }), code('AUTH_CONFIG'));
  for (const AUTH_RATE_KEY_SECRET of [undefined, '', 'short', 'x'.repeat(513)]) assert.throws(() => limitConfig({ ...redisEnv, AUTH_RATE_KEY_SECRET }), code('AUTH_CONFIG'));
  for (const overrides of [{ AUTH_RATE_LOGIN_WINDOW_MS: '99' }, { AUTH_RATE_LOGIN_WINDOW_MS: '3600001' }, { AUTH_RATE_LOGIN_SOURCE_MAX: '0' }, { AUTH_RATE_LOGIN_IDENTITY_MAX: '1.2' }]) assert.throws(() => limitConfig({ ...redisEnv, ...overrides }), code('AUTH_CONFIG'));
});

test('limiter hashes both dimensions, normalizes identity and safely fails closed for Redis errors', async () => {
  const limiter = Object.create(AuthLimits.prototype); limiter.config = limitConfig(redisEnv);
  let argumentsA, argumentsB; limiter.redis = { eval: async (...args) => { argumentsA = args; return [0, 0]; } };
  await limiter.consume('login', '192.0.2.1', ' PATIENT@Example.Invalid ');
  limiter.redis.eval = async (...args) => { argumentsB = args; return [0, 0]; };
  await limiter.consume('login', '192.0.2.1', 'patient@example.invalid');
  assert.deepEqual(argumentsA, argumentsB); assert.equal(argumentsA[1], 2);
  for (const key of argumentsA.slice(2, 4)) { assert.match(key, /^mediid:auth:login:(source|identity):[0-9a-f]{64}$/); assert.ok(!key.includes('patient')); assert.ok(!key.includes('192.0.2.1')); }
  limiter.redis.eval = async () => [1, 1201];
  await assert.rejects(() => limiter.consume('login', '192.0.2.1', 'patient@example.invalid'), error => { assert.equal(error.code, 'AUTH_RATE_LIMIT'); assert.equal(error.retryAfter, 2); assert.equal(authResponse(error).status, 429); return true; });
  limiter.redis.eval = async () => { throw new Error('redis://username:password@private.invalid credential-sentinel'); };
  await assert.rejects(() => limiter.consume('login', '192.0.2.1', 'patient@example.invalid'), error => { assert.deepEqual(authResponse(error), { status: 503, body: { code: 'AUTH_UNAVAILABLE', message: 'Authentication is unavailable.' } }); return true; });
  await assert.rejects(() => limiter.consume('unknown-operation', '192.0.2.1', 'patient@example.invalid'), code('AUTH_CONFIG'));
});

test('safe error responses preserve 429 and 503 without serializing exception properties', () => {
  const raw = Object.assign(new Error('postgresql://secret redis://secret private key token password'), { stack: 'credential-sentinel', code: 'AUTH_RATE_LIMIT', connection: 'private-sentinel' });
  assert.deepEqual(authResponse(raw), { status: 503, body: { code: 'AUTH_UNAVAILABLE', message: 'Authentication is unavailable.' } });
  const limited = new AuthError('AUTH_RATE_LIMIT'); limited.secret = 'credential-sentinel'; limited.retryAfter = 3;
  assert.deepEqual(authResponse(limited), { status: 429, body: { code: 'AUTH_RATE_LIMIT', message: 'Too many authentication attempts. Try again later.' } });
  assert.deepEqual(authResponse(new AuthError('AUTH_DOMAIN_NOT_MIGRATED')), { status: 503, body: { code: 'AUTH_DOMAIN_NOT_MIGRATED', message: 'This account is not available in this service yet.' } });
});

test('cookie and bearer parsers reject ambiguous or malformed credentials', () => {
  assert.deepEqual(cookies({ headers: { cookie: 'mediid_refresh=opaque; mediid_csrf=proof' } }), { mediid_refresh: 'opaque', mediid_csrf: 'proof' });
  for (const cookie of ['mediid_refresh=one; mediid_refresh=two', 'mediid_refresh=%ZZ']) assert.throws(() => cookies({ headers: { cookie } }), code('AUTH_INPUT'));
  for (const authorization of [undefined, 'bearer token', 'Bearer token more', 'Basic token', 'Bearer ']) assert.throws(() => bearerToken({ headers: { authorization } }), code('AUTH_TOKEN'));
});

test('HTTP auth uses CSRF-bound secure HttpOnly refresh cookies and safe limiter failure responses', async () => {
  const csrfToken = 'c'.repeat(43), refreshSecret = 'r'.repeat(43), origin = 'https://app.example.invalid'; let loginCalls = 0, failure = null;
  const runtime = {
    http: { origins: [origin], secure: true, sameSite: 'none' },
    sessions: { login: async () => { loginCalls++; if (failure === 'service') throw new Error('Prisma credential-sentinel postgresql://password'); return { token: 'short-access', refreshSecret, expiresAt: new Date(Date.now() + 3600000), user: { id: principal.id, role: 'patient' }, profile: null }; } },
    limits: { consume: async () => { if (failure === 'rate') { const error = new AuthError('AUTH_RATE_LIMIT'); error.retryAfter = 4; throw error; } if (failure === 'redis') throw new AuthError('AUTH_UNAVAILABLE'); } }, provisioning: {}
  };
  const app = express(); app.use(express.json()); app.use('/api/auth', createAuthRouter(runtime));
  const server = app.listen(0, '127.0.0.1'); await new Promise(resolve => server.once('listening', resolve));
  const request = (extra = {}) => fetch('http://127.0.0.1:' + server.address().port + '/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: origin, Cookie: 'mediid_csrf=' + csrfToken, 'X-Mediid-CSRF': csrfToken, ...extra }, body: JSON.stringify({ email: 'patient@example.invalid', password: 'password-sentinel' }), signal: AbortSignal.timeout(5000) });
  try {
    let response = await request(); assert.equal(response.status, 200); const body = await response.json(); assert.equal(body.token, 'short-access'); assert.equal('refreshSecret' in body, false); assert.ok(!JSON.stringify(body).includes(refreshSecret));
    const cookie = response.headers.get('set-cookie'); for (const flag of ['HttpOnly', 'Secure', 'SameSite=None', 'Path=/api/auth']) assert.ok(cookie.includes(flag)); assert.equal(response.headers.get('cache-control'), 'no-store');
    response = await request({ Origin: 'https://evil.example.invalid' }); assert.equal(response.status, 403);
    response = await request({ 'X-Mediid-CSRF': 'wrong' }); assert.equal(response.status, 403); assert.equal(loginCalls, 1);
    failure = 'rate'; response = await request(); assert.equal(response.status, 429); assert.equal(response.headers.get('retry-after'), '4'); assert.equal((await response.json()).code, 'AUTH_RATE_LIMIT');
    failure = 'redis'; response = await request(); assert.equal(response.status, 503); assert.equal((await response.json()).code, 'AUTH_UNAVAILABLE');
    failure = 'service'; response = await request(); assert.equal(response.status, 503); assert.deepEqual(await response.json(), { code: 'AUTH_UNAVAILABLE', message: 'Authentication is unavailable.' });
  } finally { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
});

test('mapped PostgreSQL middleware authenticates only PG state and blocks unsafe unmigrated clinical authority', async () => {
  const runtimeModule = require('../src/auth/runtime'), User = require('../models/User');
  const originalRuntime = runtimeModule.getAuthRuntime, originalFind = User.findById;
  let authenticationFailure = false, mapping = true, mongoLookups = 0;
  const runtime = { mode: 'postgres', sessions: { authenticate: async () => { if (authenticationFailure) throw new AuthError('AUTH_TOKEN'); return { id: principal.id, role: 'hospital_admin' }; } }, postgres: { client: { $queryRaw: async () => mapping ? [{ mongo_user_id: '507f1f77bcf86cd799439011' }] : [] } } };
  const modulePath = require.resolve('../middleware/auth');
  runtimeModule.getAuthRuntime = () => runtime; delete require.cache[modulePath];
  const { protect } = require('../middleware/auth'); runtimeModule.getAuthRuntime = originalRuntime;
  User.findById = () => { mongoLookups++; throw new Error('Mongo authentication fallback attempted'); };
  const invoke = async (url, method = 'GET') => {
    const req = { headers: { authorization: 'Bearer synthetic-access' }, originalUrl: url, method }; let status, body, next = false;
    const res = { status(value) { status = value; return this; }, json(value) { body = value; return this; } };
    await protect(req, res, () => { next = true; }); return { req, status, body, next };
  };
  try {
    authenticationFailure = true; assert.equal((await invoke('/api/patients/profile')).status, 401); assert.equal(mongoLookups, 0);
    authenticationFailure = false; mapping = false; assert.equal((await invoke('/api/patients/profile')).status, 503); assert.equal(mongoLookups, 0);
    mapping = true;
    for (const [url, method] of [['/api/hospital-admin/doctor-login', 'POST'], ['/api/doctor-portal/patient/MID-PUBLIC', 'GET'], ['/api/reports/upload', 'POST'], ['/api/appointments/507f1f77bcf86cd799439011/status', 'PUT'], ['/api/staff/507f1f77bcf86cd799439011', 'GET']]) {
      const response = await invoke(url, method); assert.equal(response.next, false, url); assert.equal(response.status, 503, url); assert.equal(response.body.code, 'AUTH_DOMAIN_NOT_MIGRATED', url);
    }
    assert.equal(mongoLookups, 0);
  } finally { User.findById = originalFind; runtimeModule.getAuthRuntime = originalRuntime; delete require.cache[modulePath]; }
});
test('mapped self-profile reads require canonical PostgreSQL ownership policies and never give staff or support access', async () => {
  const runtimeModule = require('../src/auth/runtime'), original = runtimeModule.getAuthRuntime, modulePath = require.resolve('../middleware/auth');
  const mongoUser = '507f1f77bcf86cd799439011', patientMongo = '507f191e810c19729de860ea', hospitalMongo = '507f191e810c19729de860eb';
  let role = 'patient', policyFailure = false; const calls = [];
  const runtime = {
    mode: 'postgres', sessions: { authenticate: async () => ({ id: mongoObjectIdToUuid(mongoUser), role }) },
    postgres: { client: { $queryRaw: async () => [{ mongo_user_id: mongoUser, patient_mongo_id: patientMongo, hospital_mongo_id: hospitalMongo }] } },
    policies: {
      patientSelf: async (actor, id) => { calls.push(['patient', actor.id, id]); if (policyFailure) throw new AuthError('AUTH_FORBIDDEN'); },
      hospitalAdmin: async (actor, id) => { calls.push(['hospital', actor.id, id]); if (policyFailure) throw new AuthError('AUTH_FORBIDDEN'); }
    }
  };
  runtimeModule.getAuthRuntime = () => runtime; delete require.cache[modulePath]; const { protect } = require('../middleware/auth'); runtimeModule.getAuthRuntime = original;
  const invoke = async (originalUrl, method = 'GET') => {
    const req = { originalUrl, method, headers: { authorization: 'Bearer synthetic-session' } }; let status, next = false;
    const res = { status(value) { status = value; return this; }, json() { return this; } };
    await protect(req, res, () => { next = true; }); return { req, status, next };
  };
  try {
    for (const url of ['/api/patients/profile?compatibility=true', '/api/patients/qr']) { const result = await invoke(url); assert.equal(result.next, true); assert.equal(result.req.user._id, mongoUser); assert.equal(result.req.user.role, 'patient'); }
    assert.deepEqual(calls, [['patient', mongoObjectIdToUuid(mongoUser), mongoObjectIdToUuid(patientMongo)], ['patient', mongoObjectIdToUuid(mongoUser), mongoObjectIdToUuid(patientMongo)]]);
    assert.equal((await invoke('/api/patients/profile', 'PUT')).status, 503);
    role = 'hospital_admin'; assert.equal((await invoke('/api/hospitals/admin/profile')).next, true);
    assert.deepEqual(calls.at(-1), ['hospital', mongoObjectIdToUuid(mongoUser), mongoObjectIdToUuid(hospitalMongo)]);
    policyFailure = true; assert.equal((await invoke('/api/hospitals/admin/profile')).status, 403); policyFailure = false;
    const before = calls.length;
    for (const value of ['hospital_staff', 'support_agent', 'doctor']) { role = value; for (const path of ['/api/patients/profile', '/api/patients/qr', '/api/hospitals/admin/profile']) assert.equal((await invoke(path)).status, 503); }
    assert.equal(calls.length, before);
  } finally { runtimeModule.getAuthRuntime = original; delete require.cache[modulePath]; }
});