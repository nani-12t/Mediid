import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { spawn, spawnSync } from 'node:child_process';
import { generateKeyPairSync, randomBytes } from 'node:crypto';
import { createRequire } from 'node:module';
import net from 'node:net';
import path from 'node:path';
import { startNativeCluster } from './helpers/native-cluster.mjs';
import { startRedis } from './helpers/redis-instance.mjs';
const require = createRequire(import.meta.url);
const mongoose = require('mongoose'), bcrypt = require('bcryptjs');
const { MongoMemoryServer } = require('mongodb-memory-server');
const { newPostgresId } = require('../src/identifiers/uuid');
const checks = [], processes = new Set(), secrets = [];
const delay = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));
const redact = value => secrets.reduce((result, secret) => result.replaceAll(secret, '[redacted]'), String(value));
async function check(name, operation) { await operation(); checks.push(name); console.log('PASS provider server: ' + name); }
async function freePort() {
  const lease = net.createServer(); await new Promise(resolve => lease.listen(0, '127.0.0.1', resolve));
  const number = lease.address().port; await new Promise(resolve => lease.close(resolve)); return number;
}
async function stopProcess(record) {
  if (!record || record.child.exitCode !== null || record.child.signalCode !== null) return;
  const closed = new Promise(resolve => record.child.once('close', resolve)); record.child.kill();
  await Promise.race([closed, delay(5000)]);
  if (record.child.exitCode === null && record.child.signalCode === null) { record.child.kill('SIGKILL'); await Promise.race([closed, delay(2000)]); }
}
function launch(env) {
  const record = { child: spawn(process.execPath, [path.resolve('server.js')], { cwd: process.cwd(), env, stdio: ['ignore','pipe','pipe'], windowsHide: true }), output: '' };
  const append = value => { record.output = redact((record.output + value).slice(-24000)); };
  record.child.stdout.on('data', append); record.child.stderr.on('data', append); processes.add(record); return record;
}
const cluster = await startNativeCluster();
let redis, mongo, source;
try {
  redis = await startRedis();
  const database = await cluster.database();
  await database.db.exec('CREATE EXTENSION vector; CREATE EXTENSION btree_gist;');
  await database.db.exec(readFileSync('prisma/roles.sql', 'utf8'));
  const credentials = Object.fromEntries(['mediid_migrator','mediid_runtime','mediid_diagnostics'].map(role => [role, randomBytes(32).toString('hex')]));
  for (const [role, credential] of Object.entries(credentials)) await cluster.admin.query('ALTER ROLE ' + role + " LOGIN PASSWORD '" + credential + "'");
  const migrationUrl = database.url('mediid_migrator', credentials.mediid_migrator);
  const deployed = spawnSync(process.execPath, ['scripts/prisma.cjs','deploy'], { env: { ...process.env, NODE_ENV: 'test', PG_ENV_FILE: path.join(cluster.root,'absent.env'), PG_MIGRATION_URL: migrationUrl }, encoding: 'utf8', windowsHide: true, timeout: 120000 });
  assert.equal(deployed.status, 0, 'Disposable provider database migration failed.');
  mongo = await MongoMemoryServer.create({ binary: { version: '7.0.30', downloadDir: path.resolve('.test-data/mongodb-binaries') }, instance: { ip: '127.0.0.1' } });
  source = await mongoose.createConnection(mongo.getUri('phase23_http_synthetic'), { autoIndex: false }).asPromise();
  const mongoHospitalId = new mongoose.Types.ObjectId();
  await source.collection('hospitals').insertOne({ _id: mongoHospitalId, uid: 'HID-MONGO123', name: 'Mongo only synthetic hospital', isActive: true, type: 'private', address: { city: 'Synthetic City' } });
  const password = 'SyntheticProviderHttp123!', hash = await bcrypt.hash(password, 12);
  const admin = newPostgresId(), doctorUser = newPostgresId(), doctor = newPostgresId(), hospital = newPostgresId();
  await database.db.query("INSERT INTO users(id,email,password_hash,role,updated_at) VALUES($1,'pg-admin@example.invalid',$2,'hospital_admin',now()),($3,'pg-private@example.invalid',$2,'doctor',now())", [admin,hash,doctorUser]);
  await database.db.query("INSERT INTO hospitals(id,user_id,uid,name,city,specialties,facilities,photos,updated_at) VALUES($1,$2,'HID-PGHTTP23','PostgreSQL synthetic hospital','Synthetic City','{}','{}','{}',now())", [hospital,admin]);
  await database.db.query("INSERT INTO doctors(id,user_id,uid,first_name,last_name,specialization,is_private_practice,sub_specialties,qualifications,expertise,languages,updated_at) VALUES($1,$2,'DOC-HTTPPVT1','Synthetic','Private','General medicine',true,'{}','{}','{}','{}',now())", [doctor,doctorUser]);
  const pair = generateKeyPairSync('rsa', { modulusLength: 2048 }), origin = 'https://provider-synthetic.invalid';
  const env = {};
  for (const key of ['PATH','Path','SystemRoot','WINDIR','TEMP','TMP','USERPROFILE']) if (process.env[key]) env[key] = process.env[key];
  Object.assign(env, {
    NODE_ENV:'test', HOST:'127.0.0.1', PORT:String(await freePort()), AUTH_BACKEND:'postgres', ORGANIZATION_BACKEND:'postgres', PATIENT_BACKEND:'legacy',APPOINTMENT_BACKEND:'legacy',
    MONGO_URI:mongo.getUri('phase23_http_synthetic'), MARKETPLACE_URI:mongo.getUri('phase23_marketplace_synthetic'),
    DOTENV_CONFIG_PATH:path.join(cluster.root,'absent.env'), PG_ENV_FILE:path.join(cluster.root,'absent.env'),
    PG_RUNTIME_URL:database.url('mediid_runtime',credentials.mediid_runtime), AUTH_REDIS_URL:redis.url,
    AUTH_RATE_KEY_SECRET:randomBytes(32).toString('hex'), AUTH_RATE_LOGIN_SOURCE_MAX:'100', AUTH_RATE_PROVISION_SOURCE_MAX:'100',
    AUTH_ALLOWED_ORIGINS:origin, CLIENT_URL:origin, AUTH_COOKIE_SAME_SITE:'lax', AUTH_JWT_ISSUER:'phase23-http-synthetic',
    AUTH_JWT_AUDIENCE:'phase23-http-synthetic-api', AUTH_JWT_KEY_ID:'phase23-http-key', AUTH_JWT_TTL_SECONDS:'900',
    AUTH_BCRYPT_COST:'12', AUTH_RESET_TTL_SECONDS:'900', AUTH_JWT_PRIVATE_KEY:pair.privateKey.export({type:'pkcs8',format:'pem'}),
    AUTH_JWT_PUBLIC_KEY:pair.publicKey.export({type:'spki',format:'pem'}), SMTP_HOST:'127.0.0.1', SMTP_PORT:'587',
    SMTP_USER:'synthetic', SMTP_PASS:randomBytes(32).toString('hex'), SMTP_FROM:'synthetic@example.invalid', REDIS_HOST:'127.0.0.1', REDIS_PORT:'1'
  });
  secrets.push(password, hash, migrationUrl, env.PG_RUNTIME_URL, redis.url, env.AUTH_JWT_PRIVATE_KEY, env.SMTP_PASS, env.AUTH_RATE_KEY_SECRET, ...Object.values(credentials));
  const server = launch(env), deadline = Date.now() + 60000;
  while (!server.output.includes('Server running on port')) {
    if (server.child.exitCode !== null || Date.now() > deadline) throw new Error('Synthetic provider server startup failed: ' + redact(server.output));
    await delay(100);
  }
  const base = 'http://127.0.0.1:' + env.PORT + '/api/', jar = new Map();
  async function api(route, { method='GET', body, token } = {}) {
    const headers = { Origin:origin, ...(body===undefined?{}:{'Content-Type':'application/json'}), ...(token?{Authorization:'Bearer '+token}:{}), ...(jar.size?{Cookie:[...jar].map(([key,value])=>key+'='+value).join('; ')}:{}) };
    if (method !== 'GET' && jar.has('mediid_csrf')) headers['X-Mediid-CSRF'] = decodeURIComponent(jar.get('mediid_csrf'));
    const response = await fetch(base + route, { method, headers, ...(body===undefined?{}:{body:JSON.stringify(body)}), signal:AbortSignal.timeout(20000) });
    for (const cookie of response.headers.getSetCookie()) { const [entry] = cookie.split(';'), separator = entry.indexOf('='); jar.set(entry.slice(0,separator),entry.slice(separator+1)); }
    const text = await response.text(); let data; try { data=JSON.parse(text); } catch { data=text; }
    if (typeof data?.token === 'string') secrets.push(data.token);
    if (typeof data?.activation?.secret === 'string') secrets.push(data.activation.secret);
    return { status:response.status, body:data, headers:response.headers };
  }
  const ok = (result,status=200) => assert.equal(result.status,status,redact(JSON.stringify(result.body)));
  let adminToken, doctorToken, recruited, staff, clinic;
  await check('actual server selects PostgreSQL providers and keeps public search independent of Mongo', async () => {
    ok(await api('health')); assert.deepEqual((await api('organizations/config')).body,{backend:'postgres'});
    const result=await api('hospitals'); ok(result); assert.equal(result.body.length,1); assert.equal(result.body[0].uid,'HID-PGHTTP23');
    assert.deepEqual((await api('hospitals?q=Mongo')).body,[]);
  });
  await check('PostgreSQL-only admin session reads and updates profile without legacy mapping', async () => {
    ok(await api('auth/csrf')); const login=await api('auth/login',{method:'POST',body:{email:'pg-admin@example.invalid',password}}); ok(login); adminToken=login.body.token;
    assert.equal((await database.db.query('SELECT count(*)::int n FROM auth_legacy_links')).rows[0].n,0);
    ok(await api('hospitals/admin/profile',{token:adminToken}));
    const updated=await api('hospitals/admin/profile',{method:'PUT',token:adminToken,body:{name:'PostgreSQL provider updated',address:{city:'Updated Synthetic City'}}}); ok(updated); assert.equal(updated.body.name,'PostgreSQL provider updated');
    assert.equal((await api('hospitals/admin/profile')).status,401);
  });
  await check('mounted recruitment returns hierarchical doctor UID, activation and public QR', async () => {
    const result=await api('doctors',{method:'POST',token:adminToken,body:{firstName:'Synthetic',lastName:'Recruited',specialization:'General medicine',consultationFee:600}}); ok(result,201); recruited=result.body;
    assert.match(recruited.uid,/^HID-PGHTTP23-DOC-0001$/); assert.match(recruited.qrCode,/^data:image\/png;base64,/); assert.ok(typeof recruited.activation?.secret === 'string' && /^[A-Za-z0-9_-]{43}$/.test(recruited.activation.secret),'Activation credential must have the reviewed random format.');
    secrets.push(recruited.activation.secret); assert.equal(recruited.memberships.length,1);
  });
  await check('mounted staff roster recruitment exposes only safe public badge fields', async () => {
    const result=await api('staff',{method:'POST',token:adminToken,body:{firstName:'Synthetic',lastName:'Nurse',role:'nurse',phone:'0000000000',email:'staff-private@example.invalid'}}); ok(result,201); staff=result.body; assert.match(staff.uid,/^HID-PGHTTP23-NUR-0001$/);
    const badge=await api('staff/uid/'+staff.uid); ok(badge); for(const field of ['phone','email','userId','passwordHash','activation'])assert.equal(Object.hasOwn(badge.body,field),false,field);
    assert.equal((await api('staff',{token:adminToken})).body.length,1); assert.equal((await api('staff')).status,401);
  });
  await check('private doctor creates one atomic doctor-owned clinic without hospital-admin authority', async () => {
    const login=await api('auth/login',{method:'POST',body:{email:'pg-private@example.invalid',password}}); ok(login); doctorToken=login.body.token;
    const result=await api('hospitals',{method:'POST',token:doctorToken,body:{name:'Synthetic private clinic',type:'clinic'}}); ok(result,201); clinic=result.body;
    assert.equal(clinic.type,'clinic'); assert.match(clinic.uid,/^HID-[A-F0-9]{8}$/);
    const record=(await database.db.query('SELECT h.user_id,h.clinic_owner_doctor_id,u.role::text role,(SELECT count(*)::int FROM doctor_hospital_memberships m WHERE m.hospital_id=h.id AND m.doctor_id=$2) memberships,(SELECT count(*)::int FROM hospital_memberships s WHERE s.hospital_id=h.id) staff FROM hospitals h JOIN doctors d ON d.id=h.clinic_owner_doctor_id JOIN users u ON u.id=d.user_id WHERE h.id=$1',[clinic.internalId,doctor])).rows[0];
    assert.equal(record.user_id,null); assert.equal(record.clinic_owner_doctor_id,doctor); assert.equal(record.role,'doctor'); assert.equal(record.memberships,1); assert.equal(record.staff,0);
    assert.equal((await api('hospitals',{method:'POST',token:doctorToken,body:{name:'Duplicate synthetic clinic'}})).status,409);
    assert.equal((await api('hospitals/admin/profile',{token:doctorToken})).status,403);
  });
  await check('mounted clinic owner adds an existing doctor with safe group search and preserved roles', async () => {
    const path='hospitals/'+clinic.internalId+'/doctor-memberships';
    assert.equal((await api(path,{method:'POST',token:adminToken,body:{doctorId:recruited.internalId}})).status,403);
    const result=await api(path,{method:'POST',token:doctorToken,body:{doctorId:recruited.internalId}}); ok(result,201);
    assert.equal(result.body.doctorId,recruited.internalId); assert.equal(result.body.hospitalId,clinic.internalId); assert.equal(result.body.isPrimary,false);
    const search=await api('doctors?hospital='+clinic.internalId); ok(search); assert.equal(search.body.length,2);
    const detail=await api('hospitals/'+clinic.internalId); ok(detail); assert.equal(detail.body.doctors.length,2);
    for(const row of search.body)for(const key of ['phone','email','registrationNumber','activation'])assert.equal(Object.hasOwn(row,key),false,key);
    assert.equal((await database.db.query('SELECT role::text role FROM users WHERE id=$1',[doctorUser])).rows[0].role,'doctor');
    assert.equal((await database.db.query('SELECT user_id FROM doctors WHERE id=$1',[recruited.internalId])).rows[0].user_id,null);
  });
  await check('mounted clinic removal preserves the doctor and other hospital membership', async () => {
    const path='hospitals/'+clinic.internalId+'/doctor-memberships/';
    assert.equal((await api(path+doctor,{method:'DELETE',token:doctorToken})).status,403);
    ok(await api(path+recruited.internalId,{method:'DELETE',token:doctorToken}));
    const memberships=(await database.db.query('SELECT hospital_id FROM doctor_hospital_memberships WHERE doctor_id=$1',[recruited.internalId])).rows;
    assert.deepEqual(memberships.map(row=>row.hospital_id),[hospital]);
    assert.equal((await database.db.query('SELECT count(*)::int n FROM doctors WHERE id=$1',[recruited.internalId])).rows[0].n,1);
    const search=await api('doctors?hospital='+clinic.internalId); ok(search); assert.equal(search.body.length,1);
  });
  await check('provider ownership rejects cross-role mutations and immutable identity changes', async () => {
    assert.equal((await api('hospitals/'+clinic.internalId,{method:'PUT',token:adminToken,body:{name:'Forbidden'}})).status,403);
    assert.equal((await api('doctors/'+recruited.internalId,{method:'PUT',token:doctorToken,body:{firstName:'Forbidden'}})).status,403);
    assert.equal((await api('hospitals/admin/profile',{method:'PUT',token:adminToken,body:{uid:'HID-OVERRIDE'}})).status,400);
  });
  await check('missing PostgreSQL provider records never fall back to Mongo fixtures', async () => {
    const result=await api('hospitals/'+mongoHospitalId.toHexString()); assert.equal(result.status,404); assert.equal(result.body.code,'ORG_NOT_FOUND');
    assert.equal((await api('hospitals/'+newPostgresId())).status,404);
  });
  await check('unmigrated schedule, clinical and patient mutation routes remain closed', async () => {
    for(const route of ['doctor-portal/slots/available','doctor-portal/queue']) { const result=await api(route,{token:doctorToken}); assert.equal(result.status,503); assert.equal(result.body.code,'AUTH_DOMAIN_NOT_MIGRATED'); }
    const result=await api('patients/profile',{method:'PUT',token:adminToken,body:{firstName:'Forbidden'}}); assert.equal(result.status,503); assert.equal(result.body.code,'AUTH_DOMAIN_NOT_MIGRATED');
  });
  await check('provider request limits cover both JSON and URL-encoded body formats', async () => {
    const json=await api('hospitals/admin/profile',{method:'PUT',token:adminToken,body:{name:'x'.repeat(270000)}}); assert.equal(json.status,413);
    const form=await fetch(base+'hospitals/admin/profile',{method:'PUT',headers:{Origin:origin,Authorization:'Bearer '+adminToken,'Content-Type':'application/x-www-form-urlencoded'},body:'name='+ 'x'.repeat(270000),signal:AbortSignal.timeout(10000)}); assert.equal(form.status,413);
  });
  await check('missing, auto and incompatible organization configurations fail actual server startup', async () => {
    for(const settings of [{ORGANIZATION_BACKEND:undefined},{ORGANIZATION_BACKEND:'auto'},{AUTH_BACKEND:'legacy',ORGANIZATION_BACKEND:'postgres'}]) {
      const candidate={...env,...settings,PORT:String(await freePort())}; for(const key of Object.keys(candidate))if(candidate[key]===undefined)delete candidate[key];
      const invalid=launch(candidate), deadline=Date.now()+45000;
      while(invalid.child.exitCode===null&&Date.now()<deadline)await delay(100);
      assert.equal(invalid.child.exitCode,1,'Invalid provider configuration must stop the actual server: '+redact(invalid.output)); assert.equal(invalid.output.includes('Server running on port'),false);
    }
  });
  await check('provider operations leave the synthetic Mongo provider store untouched', async () => {
    assert.equal(await source.collection('hospitals').countDocuments(),1); assert.equal((await source.collection('hospitals').findOne()).name,'Mongo only synthetic hospital');
    for(const collection of ['users','doctors','staff'])assert.equal(await source.collection(collection).countDocuments(),0,collection);
  });
  await check('a real PostgreSQL outage fails public provider reads instead of returning Mongo data', async () => {
    await cluster.stop(); const result=await api('hospitals'); assert.equal(result.status,503); assert.equal(result.body.code,'ORG_UNAVAILABLE'); assert.equal(JSON.stringify(result.body).includes('Mongo'),false);
  });
  writeFileSync('.test-data/phase23-server-results.json',JSON.stringify({status:'PASS',actualExpressServer:true,postgres:'native',redis:'real',mongo:'disposable synthetic',passed:checks.length,checks})+'\n');
  console.log('Phase 2.3 actual server integration checks passed: '+checks.length);
} finally {
  await Promise.all([...processes].map(stopProcess)); await source?.close(); await mongo?.stop(); await redis?.stop(); await cluster.stop();
}
