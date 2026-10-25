import { startNativeCluster } from './helpers/native-cluster.mjs';
import { insert } from './helpers/review-fixtures.mjs';
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { randomBytes, generateKeyPairSync } from 'node:crypto';
import { createRequire } from 'node:module';
import path from 'node:path';
import assert from 'node:assert/strict';
const require = createRequire(import.meta.url), jwt = require('jsonwebtoken');
const { PostgresInfrastructure } = require('../src/infrastructure/postgres/client');
const { runtimeConfig } = require('../src/infrastructure/postgres/config');
const { PasswordHasher } = require('../src/auth/crypto/password');
const { Sessions, refreshDigest } = require('../src/auth/sessions');
const { authConfig } = require('../src/auth/config');
const { AccessTokens } = require('../src/auth/tokens');
const { newPostgresId } = require('../src/identifiers/uuid');
const cluster = await startNativeCluster(), checks = [], infrastructures = [];
const authError = code => error => error.code === code;
const denied = fn => assert.rejects(fn, error => error.code === '42501');
async function check(name, fn) { await fn(); checks.push(name); console.log('PASS sessions native: ' + name); }
try {
  const database = await cluster.database();
  await database.db.exec('CREATE EXTENSION vector; CREATE EXTENSION btree_gist;');
  await database.db.exec(readFileSync('prisma/roles.sql', 'utf8'));
  const credentials = Object.fromEntries(['mediid_migrator', 'mediid_runtime', 'mediid_diagnostics'].map(role => [role, randomBytes(32).toString('hex')]));
  for (const role of Object.keys(credentials)) await cluster.admin.query('ALTER ROLE ' + role + " LOGIN PASSWORD '" + credentials[role] + "'");
  await check('all forward migrations deploy with real non-superuser credentials', async () => {
    const result = spawnSync(process.execPath, ['scripts/prisma.cjs', 'deploy'], {
      env: { ...process.env, NODE_ENV: 'test', PG_ENV_FILE: path.join(cluster.root, 'absent.env'), PG_MIGRATION_URL: database.url('mediid_migrator', credentials.mediid_migrator) },
      encoding: 'utf8', windowsHide: true, timeout: 120000
    });
    assert.equal(result.status, 0, result.stdout + result.stderr);
    assert.equal((await database.db.query('SELECT count(*)::int n FROM _prisma_migrations WHERE finished_at IS NOT NULL')).rows[0].n, readdirSync('prisma/migrations', { withFileTypes: true }).filter(entry => entry.isDirectory()).length);
  });
  for (let index = 0; index < 2; index++) {
    const infrastructure = new PostgresInfrastructure(runtimeConfig({ NODE_ENV: 'test', PG_RUNTIME_URL: database.url('mediid_runtime', credentials.mediid_runtime) }));
    infrastructures.push(infrastructure); await infrastructure.start();
  }
  await check('two independent Prisma pools use different native runtime connections', async () => {
    assert.notEqual(infrastructures[0].prisma, infrastructures[1].prisma);
    const pids = await Promise.all(infrastructures.map(infrastructure => infrastructure.client.$queryRaw`SELECT pg_backend_pid() AS pid,current_user AS role`));
    assert.notEqual(pids[0][0].pid, pids[1][0].pid); assert.equal(pids[0][0].role, 'mediid_runtime'); assert.equal(pids[1][0].role, 'mediid_runtime');
  });
  const keyA = generateKeyPairSync('rsa', { modulusLength: 2048 }), keyB = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const pem = pair => ({ private: pair.privateKey.export({ type: 'pkcs8', format: 'pem' }), public: pair.publicKey.export({ type: 'spki', format: 'pem' }) });
  const pemA = pem(keyA), pemB = pem(keyB);
  const environment = (kid, keys, previous = {}) => ({ AUTH_JWT_ISSUER: 'mediid-synthetic', AUTH_JWT_AUDIENCE: 'mediid-synthetic-api', AUTH_JWT_KEY_ID: kid, AUTH_JWT_TTL_SECONDS: '900', AUTH_BCRYPT_COST: '12', AUTH_RESET_TTL_SECONDS: '900', AUTH_JWT_PRIVATE_KEY: keys.private, AUTH_JWT_PUBLIC_KEY: keys.public, AUTH_JWT_PREVIOUS_PUBLIC_KEYS: JSON.stringify(previous) });
  const config = authConfig(environment('active-a', pemA)), passwords = await PasswordHasher.create(12), tokens = new AccessTokens(config);
  const services = infrastructures.map(infrastructure => new Sessions(config, infrastructure, passwords, tokens, { refreshSeconds: 3600, clientUrl: 'http://localhost:3000' }));
  const [serviceA, serviceB] = services, password = 'SyntheticSessionsPassword123!', hash = await passwords.hash(password);
  async function user(label, role = 'patient') { return insert(database.db, 'users', { id: newPostgresId(), role, email: label + '@example.invalid', password_hash: hash, updated_at: new Date() }); }
  const login = (service, account) => service.login(account.email, password);
  let registered;
  await check('registration creates a minimal identity profile and UUIDv7 session without medical fields', async () => {
    registered = await serviceA.register({ email: ' REGISTERED@Example.Invalid ', password, firstName: 'Synthetic', lastName: 'Patient', role: 'patient' });
    assert.equal(registered.user.email, 'registered@example.invalid'); assert.equal(registered.user.role, 'patient'); assert.equal(registered.user.identityId[14], '7');
    assert.match(registered.profile.uid, /^MID-[A-F0-9]{8}$/); assert.equal(registered.profile._id[14], '7');
    assert.deepEqual(Object.keys(registered.profile).sort(), ['_id','firstName','lastName','qrCode','uid']);
    const qr = JSON.parse(registered.profile.qrCode); assert.equal(qr.uid, registered.profile.uid); assert.equal(qr.type, 'mediid_patient');
    const principal = await serviceB.authenticate(registered.token); assert.equal(principal.id, registered.user.identityId);
    const me = await serviceB.me(principal); assert.deepEqual(me.profile, registered.profile);
    await assert.rejects(() => serviceB.register({ email: 'registered@example.invalid', password, firstName: 'Synthetic', lastName: 'Duplicate' }), authError('AUTH_CONFLICT'));
    for (const extra of [{ role: 'hospital_admin' }, { uid: 'MID-FORGED' }, { diagnosis: 'forbidden' }]) await assert.rejects(() => serviceB.register({ email: 'forged@example.invalid', password, firstName: 'A', lastName: 'B', ...extra }), authError('AUTH_INPUT'));
  });
  await check('short lived RS256 claims contain only identity and session metadata; refresh is digest-only', async () => {
    const decoded = jwt.decode(registered.token, { complete: true });
    assert.equal(decoded.header.alg, 'RS256'); assert.equal(decoded.header.kid, 'active-a');
    assert.deepEqual(Object.keys(decoded.payload).sort(), ['aud','exp','iat','iss','jti','nbf','role','sid','sub','ver']);
    assert.equal(decoded.payload.exp - decoded.payload.iat, 900); assert.equal(decoded.payload.sub, registered.user.identityId);
    assert.equal(decoded.payload.sid[14], '7'); assert.equal(decoded.payload.jti[14], '7');
    assert.match(registered.refreshSecret, /^[A-Za-z0-9_-]{43}$/);
    const row = (await database.db.query('SELECT * FROM auth_sessions WHERE id=$1', [registered.id])).rows[0];
    assert.equal(row.id[14], '7'); assert.equal(row.family_id, decoded.payload.sid); assert.equal(row.refresh_digest, refreshDigest(registered.refreshSecret));
    assert.equal(row.refresh_digest.length, 64); assert.notEqual(row.refresh_digest, registered.refreshSecret); assert.equal(row.revoked_at, null);
    assert.ok(!JSON.stringify(row).includes(registered.refreshSecret));
  });
  await check('expired PostgreSQL session rejects still-valid RS256 access and refresh credentials', async () => {
    const account = await user('expired-session'), issued = await login(serviceA, account);
    assert.equal(tokens.verify(issued.token).id, account.id);
    await database.db.query("UPDATE auth_sessions SET issued_at=clock_timestamp()-interval '2 hours',expires_at=clock_timestamp()-interval '1 hour' WHERE id=$1", [issued.id]);
    assert.equal(tokens.verify(issued.token).id, account.id);
    await assert.rejects(() => serviceB.authenticate(issued.token), authError('AUTH_TOKEN'));
    await assert.rejects(() => serviceA.refresh(issued.refreshSecret), authError('AUTH_TOKEN'));
    assert.equal((await database.db.query('SELECT count(*)::int n FROM auth_sessions WHERE user_id=$1', [account.id])).rows[0].n, 1);
  });
  await check('rotation links one continuation and old-secret replay revokes the entire family', async () => {
    const account = await user('rotation'), first = await login(serviceA, account), next = await serviceB.refresh(first.refreshSecret);
    assert.notEqual(first.refreshSecret, next.refreshSecret); assert.notEqual(first.id, next.id); assert.equal(+first.expiresAt, +next.expiresAt);
    const rows = (await database.db.query('SELECT * FROM auth_sessions WHERE user_id=$1 ORDER BY issued_at', [account.id])).rows;
    assert.equal(rows.length, 2); assert.equal(rows[0].family_id, rows[1].family_id); assert.equal(rows[0].replacement_id, next.id); assert.ok(rows[0].consumed_at); assert.ok(rows[0].last_used_at);
    await serviceA.authenticate(next.token);
    await assert.rejects(() => serviceA.refresh(first.refreshSecret), authError('AUTH_TOKEN'));
    await assert.rejects(() => serviceB.refresh(next.refreshSecret), authError('AUTH_TOKEN'));
    await assert.rejects(() => serviceA.authenticate(next.token), authError('AUTH_TOKEN'));
    assert.equal((await database.db.query("SELECT count(*)::int n FROM auth_sessions WHERE user_id=$1 AND revoked_at IS NOT NULL AND revoke_reason='refresh_reuse'", [account.id])).rows[0].n, 2);
  });
  await check('independent concurrent refresh has exactly one winner and detected replay revokes its continuation', async () => {
    const account = await user('concurrent-refresh'), first = await login(serviceA, account);
    const outcomes = await Promise.allSettled([serviceA.refresh(first.refreshSecret), serviceB.refresh(first.refreshSecret)]);
    assert.equal(outcomes.filter(outcome => outcome.status === 'fulfilled').length, 1);
    assert.equal(outcomes.find(outcome => outcome.status === 'rejected').reason.code, 'AUTH_TOKEN');
    const winner = outcomes.find(outcome => outcome.status === 'fulfilled').value;
    await assert.rejects(() => serviceB.authenticate(winner.token), authError('AUTH_TOKEN'));
    await assert.rejects(() => serviceA.refresh(winner.refreshSecret), authError('AUTH_TOKEN'));
    const rows = (await database.db.query('SELECT * FROM auth_sessions WHERE user_id=$1', [account.id])).rows;
    assert.equal(rows.length, 2); assert.equal(rows.filter(row => row.consumed_at).length, 1); assert.ok(rows.every(row => row.revoked_at));
  });
  await check('logout revokes the current family and preserves a separately logged-in family', async () => {
    const account = await user('logout'), first = await login(serviceA, account), second = await login(serviceB, account);
    await serviceB.logout(first.refreshSecret); await serviceB.logout(first.refreshSecret);
    await assert.rejects(() => serviceA.authenticate(first.token), authError('AUTH_TOKEN'));
    await assert.rejects(() => serviceA.refresh(first.refreshSecret), authError('AUTH_TOKEN'));
    await serviceA.authenticate(second.token); const next = await serviceA.refresh(second.refreshSecret); await serviceB.authenticate(next.token);
    assert.equal((await database.db.query('SELECT count(*)::int n FROM auth_sessions WHERE user_id=$1 AND revoked_at IS NULL AND consumed_at IS NULL', [account.id])).rows[0].n, 1);
  });
  await check('two independent password resets consume one credential, clear reset state and revoke every session atomically', async () => {
    const account = await user('reset'), first = await login(serviceA, account), second = await login(serviceB, account); let delivered;
    const delivery = { send: async (email, value) => { assert.equal(email, account.email); delivered = value; } };
    const known = await serviceA.requestReset(account.email, delivery), unknown = await serviceB.requestReset('unknown@example.invalid', delivery);
    assert.deepEqual(known, unknown); assert.deepEqual(Object.keys(known), ['message']); assert.equal(delivered.secret.length, 43);
    const before = (await database.db.query('SELECT reset_password_token,reset_password_expires_at,auth_version FROM users WHERE id=$1', [account.id])).rows[0];
    assert.match(before.reset_password_token, /^[0-9a-f]{64}$/); assert.notEqual(before.reset_password_token, delivered.secret);
    const nextPassword = 'SyntheticResetPassword123!';
    const outcomes = await Promise.allSettled([serviceA.resetPassword(delivered.secret, nextPassword), serviceB.resetPassword(delivered.secret, nextPassword)]);
    assert.equal(outcomes.filter(outcome => outcome.status === 'fulfilled').length, 1); assert.equal(outcomes.find(outcome => outcome.status === 'rejected').reason.code, 'AUTH_RESET');
    const after = (await database.db.query('SELECT password_hash,reset_password_token,reset_password_expires_at,auth_version FROM users WHERE id=$1', [account.id])).rows[0];
    assert.equal(after.reset_password_token, null); assert.equal(after.reset_password_expires_at, null); assert.equal(after.auth_version, before.auth_version + 1); assert.equal(await passwords.verify(nextPassword, after.password_hash), true);
    assert.equal((await database.db.query('SELECT count(*)::int n FROM auth_sessions WHERE user_id=$1 AND revoked_at IS NULL', [account.id])).rows[0].n, 0);
    for (const session of [first, second]) { await assert.rejects(() => serviceB.authenticate(session.token), authError('AUTH_TOKEN')); await assert.rejects(() => serviceA.refresh(session.refreshSecret), authError('AUTH_TOKEN')); }
    await assert.rejects(() => login(serviceA, account), authError('AUTH_CREDENTIALS')); await serviceB.login(account.email, nextPassword);
    await assert.rejects(() => serviceA.resetPassword(delivered.secret, nextPassword), authError('AUTH_RESET'));
  });
  await check('revocation racing refresh on independent pools leaves no active continuation', async () => {
    const account = await user('revoke-race'), first = await login(serviceA, account);
    const outcomes = await Promise.allSettled([serviceA.revokeAll(account.id, 'synthetic_administrative'), serviceB.refresh(first.refreshSecret)]);
    assert.equal(outcomes[0].status, 'fulfilled');
    if (outcomes[1].status === 'fulfilled') await assert.rejects(() => serviceA.authenticate(outcomes[1].value.token), authError('AUTH_TOKEN'));
    else assert.equal(outcomes[1].reason.code, 'AUTH_TOKEN');
    assert.equal((await database.db.query('SELECT count(*)::int n FROM auth_sessions WHERE user_id=$1 AND consumed_at IS NULL AND revoked_at IS NULL', [account.id])).rows[0].n, 0);
    await assert.rejects(() => serviceB.authenticate(first.token), authError('AUTH_TOKEN'));
  });
  await check('account active state, role and password changes immediately invalidate access and refresh', async () => {
    for (const kind of ['active', 'role', 'password']) {
      const account = await user('change-' + kind), first = await login(serviceA, account);
      const before = (await database.db.query('SELECT auth_version FROM users WHERE id=$1', [account.id])).rows[0].auth_version;
      if (kind === 'active') await database.db.query('UPDATE users SET is_active=false WHERE id=$1', [account.id]);
      if (kind === 'role') await database.db.query("UPDATE users SET role='support_agent' WHERE id=$1", [account.id]);
      if (kind === 'password') {
        const nextHash = await passwords.hash('DifferentSyntheticPassword123!');
        await infrastructures[1].client.$executeRaw`UPDATE public.users SET password_hash=${nextHash} WHERE id=${account.id}::uuid`;
      }
      assert.equal((await database.db.query('SELECT auth_version FROM users WHERE id=$1', [account.id])).rows[0].auth_version, before + 1);
      await assert.rejects(() => serviceB.authenticate(first.token), authError('AUTH_TOKEN')); await assert.rejects(() => serviceA.refresh(first.refreshSecret), authError('AUTH_TOKEN'));
      if (kind === 'active') await assert.rejects(() => login(serviceA, account), authError('AUTH_CREDENTIALS'));
    }
  });
  await check('RS256 rotation accepts approved previous kid, signs only active kid and rejects removed or untrusted headers', async () => {
    const account = await user('key-rotation'), oldSession = await login(serviceA, account);
    const rotatedConfig = authConfig(environment('active-b', pemB, { 'active-a': pemA.public })), rotatedTokens = new AccessTokens(rotatedConfig), rotatedSessions = new Sessions(rotatedConfig, infrastructures[1], passwords, rotatedTokens);
    assert.equal(rotatedTokens.verify(oldSession.token).id, account.id); await rotatedSessions.authenticate(oldSession.token);
    const current = await login(rotatedSessions, account); assert.equal(jwt.decode(current.token, { complete: true }).header.kid, 'active-b');
    const removed = new AccessTokens(authConfig(environment('active-b', pemB)));
    assert.throws(() => removed.verify(oldSession.token), authError('AUTH_TOKEN'));
    const payload = { sub: account.id, role: 'patient', sid: newPostgresId(), jti: newPostgresId(), ver: 0 };
    const signed = header => jwt.sign(payload, keyA.privateKey, { algorithm: 'RS256', keyid: 'active-a', issuer: config.issuer, audience: config.audience, expiresIn: 900, notBefore: 0, header });
    for (const token of [signed({ kid: 'unknown' }), signed({ jku: 'https://example.invalid/jwks' }), signed({ x5u: 'https://example.invalid/certificate' }), jwt.sign(payload, 'synthetic-only', { algorithm: 'HS256' })]) assert.throws(() => rotatedTokens.verify(token), authError('AUTH_TOKEN'));
    assert.throws(() => authConfig(environment('active-b', pemB, { 'active-b': pemA.public })), authError('AUTH_CONFIG'));
    assert.throws(() => authConfig(environment('active-b', pemB, { 'previous': pemA.private })), authError('AUTH_CONFIG'));
  });
  await check('actual runtime cannot mint privileged users, alter auth version or gain schema/clinical privileges', async () => {
    const runtime = await database.connect('mediid_runtime', credentials.mediid_runtime);
    for (const role of ['hospital_admin', 'doctor', 'support_agent', 'hospital_staff']) await denied(() => runtime.query('INSERT INTO users(id,email,password_hash,role,updated_at) VALUES($1,$2,$3,$4,now())', [newPostgresId(), 'privileged-' + role + '@example.invalid', hash, role]));
    for (const sql of ['UPDATE users SET auth_version=0', "UPDATE users SET role='hospital_admin'", 'SELECT * FROM encounters', 'SELECT * FROM prescriptions', 'SELECT * FROM hospital_appointments', 'CREATE TABLE public.forbidden(id int)', 'CREATE SCHEMA forbidden', 'ALTER TABLE auth_sessions ADD COLUMN forbidden int', "UPDATE _prisma_migrations SET checksum='forged'", 'SET ROLE mediid_migrator']) await denied(() => runtime.query(sql));
    const diagnostic = await database.connect('mediid_diagnostics', credentials.mediid_diagnostics); await denied(() => diagnostic.query('SELECT * FROM auth_sessions'));
  });
  writeFileSync('.test-data/phase22b-sessions-results.json', JSON.stringify({ status: 'PASS', passed: checks.length, checks, nativeIndependentPrismaPools: true, actualRuntimeCredential: true, synthetic: true, productionAccess: false }, null, 2) + '\n');
  console.log(checks.length + ' PostgreSQL session checks passed.');
} finally { await Promise.allSettled(infrastructures.map(infrastructure => infrastructure.stop())); await cluster.stop(); }