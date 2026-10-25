import { startNativeCluster } from './helpers/native-cluster.mjs';
import { insert } from './helpers/review-fixtures.mjs';
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { createRequire } from 'node:module';
import path from 'node:path';
import assert from 'node:assert/strict';
const require = createRequire(import.meta.url);
const { PostgresInfrastructure } = require('../src/infrastructure/postgres/client');
const { runtimeConfig } = require('../src/infrastructure/postgres/config');
const { PasswordHasher } = require('../src/auth/crypto/password');
const { Provisioning, activationDigest } = require('../src/auth/provisioning');
const { newPostgresId } = require('../src/identifiers/uuid');
const cluster = await startNativeCluster(), checks = [];
let infrastructure;
const denied = fn => assert.rejects(fn, error => error.code === '42501');
const authError = code => error => error.code === code;
async function check(name, fn) { await fn(); checks.push(name); console.log('PASS provisioning native: ' + name); }
try {
  const database = await cluster.database();
  await database.db.exec('CREATE EXTENSION vector; CREATE EXTENSION btree_gist;');
  await database.db.exec(readFileSync('prisma/roles.sql', 'utf8'));
  const credentials = Object.fromEntries(['mediid_migrator', 'mediid_runtime', 'mediid_diagnostics'].map(role => [role, randomBytes(32).toString('hex')]));
  for (const role of Object.keys(credentials)) await cluster.admin.query('ALTER ROLE ' + role + " LOGIN PASSWORD '" + credentials[role] + "'");
  await check('all forward migrations deploy as actual non-superuser migrator', async () => {
    const result = spawnSync(process.execPath, ['scripts/prisma.cjs', 'deploy'], {
      env: { ...process.env, NODE_ENV: 'test', PG_ENV_FILE: path.join(cluster.root, 'absent.env'), PG_MIGRATION_URL: database.url('mediid_migrator', credentials.mediid_migrator) },
      encoding: 'utf8', windowsHide: true, timeout: 120000
    });
    assert.equal(result.status, 0, result.stdout + result.stderr);
    const expected = readdirSync('prisma/migrations', { withFileTypes: true }).filter(entry => entry.isDirectory()).length;
    assert.equal((await database.db.query('SELECT count(*)::int n FROM _prisma_migrations WHERE finished_at IS NOT NULL')).rows[0].n, expected);
  });
  infrastructure = new PostgresInfrastructure(runtimeConfig({ NODE_ENV: 'test', PG_RUNTIME_URL: database.url('mediid_runtime', credentials.mediid_runtime) }));
  await infrastructure.start();
  const passwords = await PasswordHasher.create(12), provisioning = new Provisioning(infrastructure, passwords, { activationSeconds: 900 });
  const password = 'SyntheticDoctorPassword123!', hash = await passwords.hash(password);
  const user = (role, email, uid = null, active = true) => insert(database.db, 'users', { id: newPostgresId(), role, email, uid, password_hash: hash, is_active: active, updated_at: new Date() });
  const adminA = await user('hospital_admin', 'admin-a@example.invalid'), adminB = await user('hospital_admin', 'admin-b@example.invalid');
  const support = await user('support_agent', 'support@example.invalid'), privateUser = await user('doctor', 'private@example.invalid', 'DOC-PRIVATE01');
  const hospitalA = newPostgresId(), hospitalB = newPostgresId();
  for (const [id, owner, uid] of [[hospitalA, adminA, 'HID-12345678'], [hospitalB, adminB, 'HID-87654321']]) await insert(database.db, 'hospitals', { id, user_id: owner.id, uid, name: 'Synthetic only hospital', updated_at: new Date() });
  const privateDoctor = newPostgresId();
  await insert(database.db, 'doctors', { id: privateDoctor, user_id: privateUser.id, uid: privateUser.uid, first_name: 'Private', last_name: 'Doctor', specialization: 'Synthetic', is_private_practice: true, updated_at: new Date() });
  const draft = { hospitalId: hospitalA, email: ' NEW-Doctor@Example.Invalid ', firstName: 'Synthetic', lastName: 'Doctor', specialization: 'Test', isPrimary: true };
  let created;
  await check('same-hospital admin creates pending doctor, attributed membership and digest-only activation', async () => {
    created = await provisioning.createDoctor(adminA, draft);
    assert.equal(created.doctor.uid, 'HID-12345678-DOC-0001');
    assert.equal(created.doctor.id[14], '7');
    assert.equal(created.activation.secret.length, 43);
    const row = (await database.db.query('SELECT d.*,c.token_digest,c.issued_by_user_id,c.expires_at,c.consumed_at FROM doctors d JOIN doctor_activation_credentials c ON c.doctor_id=d.id WHERE d.id=$1', [created.doctor.id])).rows[0];
    assert.equal(row.user_id, null); assert.equal(row.email, 'new-doctor@example.invalid');
    assert.equal(row.token_digest, activationDigest(created.activation.secret)); assert.notEqual(row.token_digest, created.activation.secret);
    assert.equal(row.issued_by_user_id, adminA.id); assert.equal(row.consumed_at, null); assert.ok(row.expires_at > new Date());
    const audit = (await database.db.query('SELECT * FROM auth_provisioning_audit WHERE doctor_id=$1', [created.doctor.id])).rows[0];
    assert.equal(audit.actor_user_id, adminA.id); assert.equal(audit.action, 'doctor_provisioned');
    assert.ok(!JSON.stringify(audit).includes(created.activation.secret));
  });
  await check('unknown fields, cross-hospital admin, support and forged principal role fail closed', async () => {
    await assert.rejects(() => provisioning.createDoctor(adminA, { ...draft, actorId: adminB.id }), authError('AUTH_INPUT'));
    await assert.rejects(() => provisioning.createDoctor(adminB, draft), authError('AUTH_FORBIDDEN'));
    await assert.rejects(() => provisioning.createDoctor({ id: support.id, role: 'hospital_admin' }, draft), authError('AUTH_FORBIDDEN'));
    await assert.rejects(() => provisioning.createDoctor(privateUser, draft), authError('AUTH_FORBIDDEN'));
    assert.equal((await database.db.query('SELECT count(*)::int n FROM doctors')).rows[0].n, 2);
  });
  await check('doctor UID alone, wrong UID and wrong activation secret cannot activate', async () => {
    for (const input of [
      { uid: created.doctor.uid, password },
      { uid: privateUser.uid, password, activationToken: created.activation.secret },
      { uid: created.doctor.uid, password, activationToken: randomBytes(32).toString('base64url') }
    ]) await assert.rejects(() => provisioning.activateDoctor(input), authError('AUTH_CREDENTIALS'));
    assert.equal((await database.db.query('SELECT user_id FROM doctors WHERE id=$1', [created.doctor.id])).rows[0].user_id, null);
  });
  const runtimeA = await database.connect('mediid_runtime', credentials.mediid_runtime), runtimeB = await database.connect('mediid_runtime', credentials.mediid_runtime);
  const nativeActivate = (connection, value) => connection.query('SELECT public.mediid_activate_doctor($1,$2,$3,$4,$5)', [value.doctor.uid, activationDigest(value.activation.secret), hash, newPostgresId(), newPostgresId()]);
  await check('independent native runtime connections consume one activation exactly once', async () => {
    const outcomes = await Promise.allSettled([nativeActivate(runtimeA, created), nativeActivate(runtimeB, created)]);
    assert.equal(outcomes.filter(outcome => outcome.status === 'fulfilled').length, 1);
    const failure = outcomes.find(outcome => outcome.status === 'rejected').reason; assert.equal(failure.code, 'P0001'); assert.match(failure.message, /AUTH_CREDENTIALS/);
    await assert.rejects(() => nativeActivate(runtimeB, created), error => error.code === 'P0001');
    const doctor = (await database.db.query('SELECT d.uid,d.user_id,u.password_hash,u.role,u.uid user_uid FROM doctors d JOIN users u ON u.id=d.user_id WHERE d.id=$1', [created.doctor.id])).rows[0];
    assert.equal(doctor.uid, created.doctor.uid); assert.equal(doctor.user_uid, created.doctor.uid); assert.equal(doctor.role, 'doctor'); assert.equal(doctor.password_hash, hash);
    const profile = (await database.db.query('SELECT profile_kind,public_uid,safe_profile FROM auth_profiles WHERE user_id=$1', [doctor.user_id])).rows[0];
    assert.equal(profile.profile_kind, 'doctor'); assert.equal(profile.public_uid, created.doctor.uid);
    assert.deepEqual(Object.keys(profile.safe_profile).sort(), ['_id','firstName','id','lastName','specialization','uid']);
    assert.equal((await database.db.query("SELECT count(*)::int n FROM auth_provisioning_audit WHERE doctor_id=$1 AND action='doctor_activated'", [created.doctor.id])).rows[0].n, 1);
    assert.ok((await database.db.query('SELECT consumed_at FROM doctor_activation_credentials WHERE doctor_id=$1', [created.doctor.id])).rows[0].consumed_at);
  });
  await check('service activation uses injected PasswordHasher and returns only safe completion message', async () => {
    const value = await provisioning.createDoctor(adminA, { ...draft, email: 'service-doctor@example.invalid', isPrimary: false });
    assert.deepEqual(await provisioning.activateDoctor({ uid: value.doctor.uid.toLowerCase(), activationToken: value.activation.secret, password }), { message: 'Doctor activated.' });
    const stored = (await database.db.query('SELECT u.password_hash FROM users u JOIN doctors d ON d.user_id=u.id WHERE d.id=$1', [value.doctor.id])).rows[0].password_hash;
    assert.equal(await passwords.verify(password, stored), true);
  });
  await check('independent private doctor remains independent until an explicit membership is added', async () => {
    const row = (await database.db.query('SELECT primary_hospital_id,is_private_practice FROM doctors WHERE id=$1', [privateDoctor])).rows[0];
    assert.equal(row.primary_hospital_id, null); assert.equal(row.is_private_practice, true);
    assert.equal((await database.db.query('SELECT count(*)::int n FROM doctor_hospital_memberships WHERE doctor_id=$1', [privateDoctor])).rows[0].n, 0);
  });
  await check('independent native connections reject duplicate membership provisioning atomically and audit one winner', async () => {
    const add = connection => connection.query('SELECT * FROM public.mediid_add_doctor_membership($1,$2,$3,$4,$5,$6)', [adminA.id, hospitalA, privateDoctor, newPostgresId(), newPostgresId(), false]);
    const outcomes = await Promise.allSettled([add(runtimeA), add(runtimeB)]);
    assert.equal(outcomes.filter(outcome => outcome.status === 'fulfilled').length, 1);
    assert.equal(outcomes.find(outcome => outcome.status === 'rejected').reason.code, 'P0001');
    assert.equal((await database.db.query('SELECT count(*)::int n FROM doctor_hospital_memberships WHERE doctor_id=$1 AND hospital_id=$2', [privateDoctor, hospitalA])).rows[0].n, 1);
    assert.equal((await database.db.query("SELECT count(*)::int n FROM auth_provisioning_audit WHERE doctor_id=$1 AND action='membership_added'", [privateDoctor])).rows[0].n, 1);
  });
  await check('multiple explicit memberships permit one primary and no implicit authority from primary metadata', async () => {
    const linked = await provisioning.addMembership(adminB, { doctorId: privateDoctor, hospitalId: hospitalB, isPrimary: true });
    assert.equal(linked.membership.hospitalId, hospitalB); assert.equal(linked.membership.isPrimary, true);
    assert.equal((await database.db.query('SELECT count(*)::int n FROM doctor_hospital_memberships WHERE doctor_id=$1', [privateDoctor])).rows[0].n, 2);
    await assert.rejects(() => provisioning.addMembership(adminB, { doctorId: created.doctor.id, hospitalId: hospitalB, isPrimary: true }), authError('AUTH_CONFLICT'));
    await assert.rejects(() => provisioning.addMembership(adminB, { doctorId: privateDoctor, hospitalId: hospitalA }), authError('AUTH_FORBIDDEN'));
    await assert.rejects(() => provisioning.removeMembership(adminA, linked.membership.id), authError('AUTH_FORBIDDEN'));
    assert.deepEqual(await provisioning.removeMembership(adminB, linked.membership.id), { removed: true });
    assert.equal((await database.db.query('SELECT count(*)::int n FROM doctor_hospital_memberships WHERE doctor_id=$1 AND hospital_id=$2', [privateDoctor, hospitalB])).rows[0].n, 0);
    assert.equal((await database.db.query('SELECT primary_hospital_id FROM doctors WHERE id=$1', [privateDoctor])).rows[0].primary_hospital_id, null);
    const audit = (await database.db.query("SELECT actor_user_id FROM auth_provisioning_audit WHERE doctor_id=$1 AND action='membership_removed'", [privateDoctor])).rows[0]; assert.equal(audit.actor_user_id, adminB.id);
  });
  await check('expired activation and removed hospital authority reject credentials without consuming them', async () => {
    const expired = await provisioning.createDoctor(adminA, { ...draft, email: 'expired@example.invalid', isPrimary: false });
    await database.db.query("UPDATE doctor_activation_credentials SET created_at=now()-interval '2 hours',expires_at=now()-interval '1 hour' WHERE doctor_id=$1", [expired.doctor.id]);
    await assert.rejects(() => provisioning.activateDoctor({ uid: expired.doctor.uid, activationToken: expired.activation.secret, password }), authError('AUTH_CREDENTIALS'));
    const removed = await provisioning.createDoctor(adminA, { ...draft, email: 'removed@example.invalid', isPrimary: false });
    const membership = (await database.db.query('SELECT id FROM doctor_hospital_memberships WHERE doctor_id=$1', [removed.doctor.id])).rows[0];
    await provisioning.removeMembership(adminA, membership.id);
    await assert.rejects(() => provisioning.activateDoctor({ uid: removed.doctor.uid, activationToken: removed.activation.secret, password }), authError('AUTH_CREDENTIALS'));
    assert.equal((await database.db.query('SELECT consumed_at FROM doctor_activation_credentials WHERE doctor_id=$1', [removed.doctor.id])).rows[0].consumed_at, null);
  });
  await check('current database actor role, active state and hospital active state are rechecked', async () => {
    await database.db.query('UPDATE users SET is_active=false WHERE id=$1', [adminA.id]);
    await assert.rejects(() => provisioning.addMembership(adminA, { doctorId: privateDoctor, hospitalId: hospitalA }), authError('AUTH_FORBIDDEN'));
    await database.db.query("UPDATE users SET is_active=true,role='support_agent' WHERE id=$1", [adminA.id]);
    await assert.rejects(() => provisioning.createDoctor(adminA, draft), authError('AUTH_FORBIDDEN'));
    await database.db.query("UPDATE users SET role='hospital_admin' WHERE id=$1", [adminA.id]);
    await database.db.query('UPDATE hospitals SET is_active=false WHERE id=$1', [hospitalA]);
    await assert.rejects(() => provisioning.createDoctor(adminA, draft), authError('AUTH_FORBIDDEN'));
    await database.db.query('UPDATE hospitals SET is_active=true WHERE id=$1', [hospitalA]);
  });
  await check('hospital staff identity has explicit hospital scope and never promotes reception to admin', async () => {
    const staffUser = await user('hospital_staff', 'staff@example.invalid'), secondUser = await user('hospital_staff', 'staff-two@example.invalid');
    const staffA = newPostgresId(), staffB = newPostgresId();
    for (const [id, hospital, uid] of [[staffA, hospitalA, 'HID-12345678-STF-0001'], [staffB, hospitalB, 'HID-87654321-STF-0001']]) await insert(database.db, 'hospital_memberships', { id, hospital_id: hospital, uid, first_name: 'Synthetic', last_name: 'Reception', role: 'receptionist' });
    await assert.rejects(() => provisioning.linkStaff(adminA, { staffId: staffB, userId: secondUser.id, hospitalId: hospitalA }), authError('AUTH_FORBIDDEN'));
    await assert.rejects(() => provisioning.linkStaff(adminA, { staffId: staffA, userId: support.id, hospitalId: hospitalA }), authError('AUTH_FORBIDDEN'));
    const linked = await provisioning.linkStaff(adminA, { staffId: staffA, userId: staffUser.id, hospitalId: hospitalA });
    assert.deepEqual(linked.staff, { id: staffA, userId: staffUser.id, hospitalId: hospitalA });
    await assert.rejects(() => provisioning.linkStaff(adminB, { staffId: staffB, userId: staffUser.id, hospitalId: hospitalB }), authError('AUTH_CONFLICT'));
    assert.equal((await database.db.query('SELECT role FROM users WHERE id=$1', [staffUser.id])).rows[0].role, 'hospital_staff');
    await assert.rejects(() => provisioning.createDoctor(staffUser, draft), authError('AUTH_FORBIDDEN'));
  });
  await check('actual runtime cannot forge audits, read activation secrets or bypass scoped membership functions', async () => {
    for (const sql of [
      'SELECT * FROM doctor_activation_credentials', 'SELECT * FROM auth_provisioning_audit', 'DELETE FROM doctor_activation_credentials',
      'UPDATE doctors SET primary_hospital_id=NULL', 'DELETE FROM doctor_hospital_memberships',
      "INSERT INTO auth_provisioning_audit(id,actor_user_id,action) VALUES('" + newPostgresId() + "','" + adminA.id + "','forged')",
      'SELECT public.mediid_provisioning_hospital(NULL,NULL)', 'SELECT * FROM encounters', 'SELECT * FROM prescriptions',
      'CREATE TABLE public.forbidden(id integer)', 'SET ROLE mediid_migrator'
    ]) await denied(() => runtimeA.query(sql));
    const diagnostic = await database.connect('mediid_diagnostics', credentials.mediid_diagnostics);
    await denied(() => diagnostic.query('SELECT * FROM public.mediid_add_doctor_membership($1,$2,$3,$4,$5,false)', [adminA.id, hospitalA, privateDoctor, newPostgresId(), newPostgresId()]));
    const routines = (await database.db.query("SELECT proname,prosecdef,proconfig,has_function_privilege('public',p.oid,'EXECUTE') public_execute FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname IN ('mediid_provision_doctor','mediid_add_doctor_membership','mediid_remove_doctor_membership','mediid_activate_doctor','mediid_link_hospital_staff')")).rows;
    assert.equal(routines.length, 5);
    for (const row of routines) { assert.equal(row.prosecdef, true); assert.equal(row.public_execute, false); assert.ok(row.proconfig.some(value => value.startsWith('search_path=pg_catalog, public'))); }
  });
  writeFileSync('.test-data/phase22b-provisioning-results.json', JSON.stringify({ status: 'PASS', passed: checks.length, checks, nativeIndependentConnections: true, actualRuntimeCredential: true, synthetic: true, productionAccess: false }, null, 2) + '\n');
  console.log(checks.length + ' PostgreSQL provisioning checks passed.');
} finally { await infrastructure?.stop(); await cluster.stop(); }
