import {startNativeCluster} from './helpers/native-cluster.mjs';
import {insert} from './helpers/review-fixtures.mjs';
import {readFileSync,writeFileSync,readdirSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {randomBytes,generateKeyPairSync} from 'node:crypto';
import {createRequire} from 'node:module';
import path from 'node:path';
import assert from 'node:assert/strict';
const require=createRequire(import.meta.url), jwt=require('jsonwebtoken'),bcrypt=require('bcryptjs');
const {PostgresInfrastructure}=require('../dist/infrastructure/postgres/client');
const {runtimeConfig}=require('../dist/infrastructure/postgres/config');
const {authConfig}=require('../dist/auth/config');
const {PasswordHasher}=require('../dist/auth/crypto/password');
const {AccessTokens}=require('../dist/auth/tokens');
const {IdentityRepository}=require('../dist/auth/repositories/identity');
const {Authentication}=require('../dist/auth/services/authentication');
const {AuthorizationPolicies}=require('../dist/auth/policies/ownership');
const {createAuthTestServer}=require('../dist/auth/testing/harness');
const {newPostgresId}=require('../dist/identifiers/uuid');
const cluster=await startNativeCluster(),checks=[];
let infrastructure,server;const previousNodeEnv=process.env.NODE_ENV;
const migration='202610200003_phase22a_auth_identity';
const correctiveSql=readFileSync('prisma/migrations/'+migration+'/migration.sql','utf8');
const baselineSql=readFileSync('prisma/migrations/202610190001_phase131_baseline/migration.sql','utf8');
const denied=fn=>assert.rejects(fn,error=>['42501','25006'].includes(error.code));
async function check(name,fn){await fn();checks.push(name);console.log('PASS auth native: '+name);}
try {
 const database=await cluster.database();await database.db.exec('CREATE EXTENSION vector; CREATE EXTENSION btree_gist;');
 await database.db.exec(readFileSync('prisma/roles.sql','utf8'));
 const passwords=Object.fromEntries(['mediid_migrator','mediid_runtime','mediid_diagnostics'].map(role=>[role,randomBytes(32).toString('hex')]));
 for(const role of Object.keys(passwords))await cluster.admin.query('ALTER ROLE '+role+" LOGIN PASSWORD '"+passwords[role]+"'");
 const migrationEnv={...process.env,NODE_ENV:'test',PG_ENV_FILE:path.join(cluster.root,'absent.env'),PG_MIGRATION_URL:database.url('mediid_migrator',passwords.mediid_migrator)};
 await check('all five historical/forward migrations deploy through real non-superuser Prisma credentials',async()=>{
  const result=spawnSync(process.execPath,['scripts/prisma.cjs','deploy'],{env:migrationEnv,encoding:'utf8',windowsHide:true,timeout:120000});
  assert.equal(result.status,0,result.stdout+result.stderr);assert.equal((await database.db.query('SELECT count(*)::int n FROM _prisma_migrations WHERE finished_at IS NOT NULL')).rows[0].n,5);
 });
 infrastructure=new PostgresInfrastructure(runtimeConfig({NODE_ENV:'test',PG_RUNTIME_URL:database.url('mediid_runtime',passwords.mediid_runtime)}));await infrastructure.start();
 const repository=new IdentityRepository(infrastructure);
 const pair=generateKeyPairSync('rsa',{modulusLength:2048});
 const config=authConfig({AUTH_JWT_ISSUER:'mediid-synthetic',AUTH_JWT_AUDIENCE:'mediid-synthetic-api',AUTH_JWT_KEY_ID:'synthetic-key',AUTH_JWT_TTL_SECONDS:'900',AUTH_BCRYPT_COST:'12',AUTH_RESET_TTL_SECONDS:'900',AUTH_JWT_PRIVATE_KEY:pair.privateKey.export({type:'pkcs8',format:'pem'}),AUTH_JWT_PUBLIC_KEY:pair.publicKey.export({type:'spki',format:'pem'})});
 const hasher=await PasswordHasher.create(config.bcryptCost),tokens=new AccessTokens(config),auth=new Authentication(config,repository,hasher,tokens),policies=new AuthorizationPolicies(repository);
 process.env.NODE_ENV='test';server=createAuthTestServer(auth,policies);await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const api=async(route,body,token)=>{const response=await fetch('http://127.0.0.1:'+server.address().port+route,{method:body===undefined?'GET':'POST',headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},...(body===undefined?{}:{body:JSON.stringify(body)}),signal:AbortSignal.timeout(10000)});return {status:response.status,body:await response.json()};};
 const password='SyntheticOnlyPassword123!';let registered;
 await check('synthetic registration normalizes email, uses v7 and cannot mint or replace a public UID',async()=>{
  registered=await api('/register',{email:'  Patient@Example.Invalid  ',password});assert.equal(registered.status,201,JSON.stringify(registered.body));
  assert.equal(registered.body.user.email,'patient@example.invalid');assert.equal(registered.body.user.uid,null);assert.equal(registered.body.user.id[14],'7');
  const row=(await database.db.query('SELECT password_hash FROM users WHERE id=$1',[registered.body.user.id])).rows[0];assert.notEqual(row.password_hash,password);assert.equal(bcrypt.getRounds(row.password_hash),12);
 });
 await check('registration cannot request privileged roles, existing UID assignment or arbitrary account flags',async()=>{
  for(const extra of [{role:'hospital_admin'},{role:'support_agent'},{uid:'HID-CLAIMED'},{isActive:true}])assert.equal((await api('/register',{email:'privileged@example.invalid',password,...extra})).status,400);
 });
 await check('duplicate canonical email registration is rejected without raw database details',async()=>{
  const duplicate=await api('/register',{email:' PATIENT@EXAMPLE.INVALID ',password});assert.equal(duplicate.status,409);assert.deepEqual(Object.keys(duplicate.body).sort(),['code','message']);
 });
 await check('login and authenticated me use safe explicit DTOs',async()=>{
  const result=await api('/login',{identity:' PATIENT@EXAMPLE.INVALID ',password});assert.equal(result.status,200,JSON.stringify(result.body));
  const me=await api('/me',undefined,result.body.token);assert.equal(me.status,200);assert.deepEqual(Object.keys(me.body.user).sort(),['email','id','role','uid']);
  assert.ok((await database.db.query('SELECT last_login_at FROM users WHERE id=$1',[registered.body.user.id])).rows[0].last_login_at);
 });
 await check('wrong, unknown, malformed and inactive credentials share identical HTTP responses',async()=>{
  const wrong=await api('/login',{identity:'patient@example.invalid',password:'wrong'}),unknown=await api('/login',{identity:'unknown@example.invalid',password}),malformed=await api('/login',{identity:null,password});
  await database.db.query('UPDATE users SET is_active=false WHERE id=$1',[registered.body.user.id]);
  const inactive=await api('/login',{identity:'patient@example.invalid',password});
  for(const result of [wrong,unknown,malformed,inactive])assert.deepEqual(result,wrong);assert.equal(wrong.status,401);
  assert.equal((await api('/me',undefined,registered.body.token)).status,401);
  await database.db.query('UPDATE users SET is_active=true WHERE id=$1',[registered.body.user.id]);
 });
 const now=Math.floor(Date.now()/1000);
 const signed=(payload={},options={})=>jwt.sign({sub:registered.body.user.id,role:'patient',...payload},pair.privateKey,{algorithm:'RS256',keyid:config.keyId,issuer:config.issuer,audience:config.audience,expiresIn:900,notBefore:0,...options});
 const invalidTokens=[['malformed','bad.jwt'],['expired',signed({iat:now-901})],['wrong issuer',signed({},{issuer:'wrong'})],['wrong audience',signed({},{audience:'wrong'})],['wrong algorithm',jwt.sign({sub:registered.body.user.id},'synthetic',{algorithm:'HS256'})],['tampered signature',signed().slice(0,-24)+'notavalidsignature'],['future not-before',signed({},{notBefore:60})],['unknown key',signed({},{keyid:'unknown'})]];
 for(const [name,token]of invalidTokens)await check(name+' JWT is rejected through the test HTTP boundary',async()=>{const result=await api('/me',undefined,token);assert.equal(result.status,401);assert.deepEqual(result.body,{code:'AUTH_TOKEN',message:'Invalid or expired authentication token.'});});
 const hash=await hasher.hash(password);
 async function user(role,email,uid=null){return insert(database.db,'users',{id:newPostgresId(),role,email,uid,password_hash:hash,updated_at:new Date()});}
 const patient2=await user('patient','other@example.invalid'),adminA=await user('hospital_admin','admin-a@example.invalid'),adminB=await user('hospital_admin','admin-b@example.invalid');
 const doctorUser=await user('doctor','doctor@example.invalid','HID-12345678-SRDOC-0001'),privateUser=await user('doctor','private@example.invalid','DOC-12345678');
 const otherDoctorUser=await user('doctor','other-doctor@example.invalid','DOC-87654321'),support=await user('support_agent','support@example.invalid');
 const patientId=newPostgresId(),patient2Id=newPostgresId(),hospitalA=newPostgresId(),hospitalB=newPostgresId(),doctorId=newPostgresId(),privateId=newPostgresId(),otherDoctorId=newPostgresId();
 for(const [id,userId,uid]of [[patientId,registered.body.user.id,'MID-12345678'],[patient2Id,patient2.id,'MID-87654321']])await insert(database.db,'patients',{id,user_id:userId,uid,first_name:'Synthetic',last_name:'Patient',updated_at:new Date()});
 for(const [id,userId,uid]of [[hospitalA,adminA.id,'HID-12345678'],[hospitalB,adminB.id,'HID-87654321']])await insert(database.db,'hospitals',{id,user_id:userId,uid,name:'Synthetic hospital',updated_at:new Date()});
 for(const [id,owner,primary,isPrivate]of [[doctorId,doctorUser,hospitalB,false],[privateId,privateUser,null,true],[otherDoctorId,otherDoctorUser,null,true]])await insert(database.db,'doctors',{id,user_id:owner.id,uid:owner.uid,first_name:'Synthetic',last_name:'Doctor',specialization:'Test',primary_hospital_id:primary,is_private_practice:isPrivate,updated_at:new Date()});
 await insert(database.db,'doctor_hospital_memberships',{id:newPostgresId(),doctor_id:doctorId,hospital_id:hospitalA,is_primary:false});
 const tokenFor=user=>tokens.issue({id:user.id,role:user.role});
 await check('lowercase/trimmed doctor UID login resolves the existing public UID unchanged',async()=>{const result=await api('/login',{identity:' hid-12345678-srdoc-0001 ',password});assert.equal(result.status,200);assert.equal(result.body.user.uid,'HID-12345678-SRDOC-0001');assert.notEqual(result.body.user.id,result.body.user.uid);});
 await check('legacy bcrypt hashes remain verifiable without rewriting the existing hash',async()=>{const legacy=await bcrypt.hash('LegacyPassword123',10);await database.db.query('UPDATE users SET password_hash=$1 WHERE id=$2',[legacy,privateUser.id]);assert.equal((await api('/login',{identity:privateUser.email,password:'LegacyPassword123'})).status,200);assert.equal((await database.db.query('SELECT password_hash FROM users WHERE id=$1',[privateUser.id])).rows[0].password_hash,legacy);});
 await check('patient self-ownership allows own profile and denies another patient with a valid JWT',async()=>{assert.equal((await api('/patient/'+patientId,undefined,registered.body.token)).status,200);assert.equal((await api('/patient/'+patient2Id,undefined,registered.body.token)).status,403);});
 await check('doctor identity policy rejects a different doctor',async()=>{assert.equal((await api('/doctor/'+doctorId,undefined,tokenFor(doctorUser))).status,200);assert.equal((await api('/doctor/'+otherDoctorId,undefined,tokenFor(doctorUser))).status,403);});
 await check('doctor membership grants Hospital A and denies primary Hospital B without a membership',async()=>{assert.equal((await api('/membership/'+hospitalA,undefined,tokenFor(doctorUser))).status,200);assert.equal((await api('/membership/'+hospitalB,undefined,tokenFor(doctorUser))).status,403);});
 await check('multiple explicit hospital memberships remain valid',async()=>{const membership=await insert(database.db,'doctor_hospital_memberships',{id:newPostgresId(),doctor_id:doctorId,hospital_id:hospitalB,is_primary:true});assert.equal((await api('/membership/'+hospitalB,undefined,tokenFor(doctorUser))).status,200);await database.db.query('DELETE FROM doctor_hospital_memberships WHERE id=$1',[membership.id]);assert.equal((await api('/membership/'+hospitalB,undefined,tokenFor(doctorUser))).status,403);});
 await check('hospital administrator scope permits own hospital and rejects another hospital',async()=>{assert.equal((await api('/hospital/'+hospitalA,undefined,tokenFor(adminA))).status,200);assert.equal((await api('/hospital/'+hospitalB,undefined,tokenFor(adminA))).status,403);});
 await check('private-practice doctor owns scheduling without a primary hospital',async()=>{assert.equal((await api('/clinic/'+privateId,undefined,tokenFor(privateUser))).status,200);assert.equal((await api('/clinic/'+otherDoctorId,undefined,tokenFor(privateUser))).status,403);assert.equal((await api('/clinic/'+doctorId,undefined,tokenFor(doctorUser))).status,403);});
 await check('support JWT grants no implied clinical or hospital authority',async()=>{for(const resource of ['/patient/'+patientId,'/hospital/'+hospitalA,'/clinic/'+privateId])assert.equal((await api(resource,undefined,tokenFor(support))).status,403);});
 await check('inactive doctors and hospitals fail closed',async()=>{await database.db.query('UPDATE doctors SET is_active=false WHERE id=$1',[doctorId]);assert.equal((await api('/membership/'+hospitalA,undefined,tokenFor(doctorUser))).status,403);await database.db.query('UPDATE doctors SET is_active=true WHERE id=$1',[doctorId]);await database.db.query('UPDATE hospitals SET is_active=false WHERE id=$1',[hospitalA]);assert.equal((await api('/hospital/'+hospitalA,undefined,tokenFor(adminA))).status,403);await database.db.query('UPDATE hospitals SET is_active=true WHERE id=$1',[hospitalA]);});
 await check('stale token role claims and nonexistent resources cannot imply access',async()=>{assert.equal((await api('/me',undefined,tokens.issue({id:patient2.id,role:'hospital_admin'}))).status,401);assert.equal((await api('/patient/'+newPostgresId(),undefined,registered.body.token)).status,403);});
 const runtime=await database.connect('mediid_runtime',passwords.mediid_runtime),diagnostic=await database.connect('mediid_diagnostics',passwords.mediid_diagnostics);
 await check('runtime has exact ownership/membership reads and no broad patient or clinical access',async()=>{assert.equal((await runtime.query('SELECT id,user_id FROM patients')).rows.length,2);assert.equal((await runtime.query('SELECT doctor_id,hospital_id FROM doctor_hospital_memberships')).rows.length,1);for(const table of ['patients','doctors','hospitals','encounters','consultation_sessions','appointment_payments','hospital_appointments'])await denied(()=>runtime.query('SELECT * FROM '+table));});
 await check('runtime cannot modify ownership, membership, roles, active state or public UID',async()=>{for(const sql of ["UPDATE users SET role='hospital_admin'","UPDATE users SET is_active=false","UPDATE users SET uid='MID-FORGED'",'UPDATE patients SET user_id=user_id','DELETE FROM doctor_hospital_memberships','DELETE FROM users'])await denied(()=>runtime.query(sql));});
 await check('runtime cannot alter/create schema, forge migration history or assume migrator',async()=>{for(const sql of ['CREATE TABLE public.forbidden(id int)','CREATE SCHEMA forbidden','ALTER TABLE users ADD COLUMN forbidden int',"UPDATE _prisma_migrations SET checksum='forged'",'DELETE FROM _prisma_migrations','TRUNCATE _prisma_migrations','SET ROLE mediid_migrator'])await denied(()=>runtime.query(sql));});
 await check('diagnostic credential still cannot read identity hashes or ownership records',async()=>{for(const sql of ['SELECT password_hash FROM users','SELECT id,user_id FROM patients','SELECT doctor_id,hospital_id FROM doctor_hospital_memberships'])await denied(()=>diagnostic.query(sql));});
 await check('database rejects noncanonical email/UID inserts and updates, including direct runtime paths',async()=>{
  await assert.rejects(()=>runtime.query('INSERT INTO users(id,email,password_hash,role,updated_at) VALUES($1,$2,$3,$4,now())',[newPostgresId(),' PATIENT@Example.Invalid ',hash,'patient']),error=>error.code==='23514');
  await assert.rejects(()=>database.db.query('UPDATE users SET email=$1 WHERE id=$2',['PATIENT@EXAMPLE.INVALID',patient2.id]),error=>error.code==='23514');
  await assert.rejects(()=>database.db.query('UPDATE users SET uid=$1 WHERE id=$2',[' hid-12345678-srdoc-0001 ',otherDoctorUser.id]),error=>error.code==='23514');
  await assert.rejects(()=>database.db.query('UPDATE users SET uid=$1 WHERE id=$2',[doctorUser.uid,otherDoctorUser.id]),error=>error.code==='23505');
 });
 let delivered;
 await check('password-reset request returns generic metadata and stores only a digest and expiry',async()=>{const delivery={send:async(email,value)=>{assert.equal(email,'patient@example.invalid');delivered=value;}};const known=await auth.requestReset('PATIENT@EXAMPLE.INVALID',delivery),unknown=await auth.requestReset('missing@example.invalid',delivery);assert.deepEqual(known,unknown);assert.deepEqual(Object.keys(known),['message']);const row=(await database.db.query('SELECT reset_password_token,reset_password_expires_at FROM users WHERE id=$1',[registered.body.user.id])).rows[0];assert.equal(row.reset_password_token.length,64);assert.notEqual(row.reset_password_token,delivered.secret);assert.ok(row.reset_password_expires_at>new Date());});
 await check('reset secret is consumed atomically once and old password stops working',async()=>{const next='SyntheticNewPassword123!';const outcomes=await Promise.allSettled([auth.resetPassword(delivered.secret,next),auth.resetPassword(delivered.secret,next)]);assert.equal(outcomes.filter(x=>x.status==='fulfilled').length,1);assert.equal((await api('/login',{identity:'patient@example.invalid',password})).status,401);assert.equal((await api('/login',{identity:'patient@example.invalid',password:next})).status,200);const row=(await database.db.query('SELECT reset_password_token,reset_password_expires_at FROM users WHERE id=$1',[registered.body.user.id])).rows[0];assert.equal(row.reset_password_token,null);assert.equal(row.reset_password_expires_at,null);});
 await check('expired and unknown reset secrets cannot change a password',async()=>{await auth.requestReset('patient@example.invalid',{send:async(email,value)=>{delivered=value;}});await database.db.query("UPDATE users SET reset_password_expires_at=now()-interval '1 second' WHERE id=$1",[registered.body.user.id]);await assert.rejects(()=>auth.resetPassword(delivered.secret,'AnotherSynthetic123!'),error=>error.code==='AUTH_RESET');await assert.rejects(()=>auth.resetPassword(randomBytes(32).toString('base64url'),'AnotherSynthetic123!'),error=>error.code==='AUTH_RESET');});
 await check('database refuses plaintext reset credentials and incomplete expiry pairs',async()=>{await assert.rejects(()=>runtime.query('UPDATE users SET reset_password_token=$1,reset_password_expires_at=now() WHERE id=$2',['123456',registered.body.user.id]),error=>error.code==='23514');await assert.rejects(()=>runtime.query('UPDATE users SET reset_password_expires_at=NULL WHERE id=$1',[registered.body.user.id]),error=>error.code==='23514');});
 await check('unexpected repository exceptions are mapped to credential-free HTTP errors',async()=>{const original=repository.find;try{repository.find=async()=>{throw new Error('Prisma error postgresql://secret password token private key');};const result=await api('/login',{identity:'patient@example.invalid',password});assert.deepEqual(result,{status:503,body:{code:'AUTH_UNAVAILABLE',message:'Authentication is unavailable.'}});}finally{repository.find=original;}});
 for(const kind of ['email','uid','legacy reset'])await check('forward migration aborts atomically on unresolved '+kind+' conflict',async()=>{
  const legacy=await cluster.database();await legacy.db.exec(baselineSql);
  if(kind==='email')for(const email of ['Conflict@Example.Invalid',' conflict@example.invalid '])await insert(legacy.db,'users',{id:newPostgresId(),email,password_hash:hash,role:'patient',updated_at:new Date()});
  if(kind==='uid')for(const uid of ['DOC-ABCD1234',' doc-abcd1234 '])await insert(legacy.db,'users',{id:newPostgresId(),uid,password_hash:hash,role:'doctor',updated_at:new Date()});
  if(kind==='legacy reset')await insert(legacy.db,'users',{id:newPostgresId(),email:'reset@example.invalid',password_hash:hash,role:'patient',reset_password_token:'123456',reset_password_expires_at:new Date(Date.now()+60000),updated_at:new Date()});
  await assert.rejects(()=>legacy.db.exec(correctiveSql),error=>error.code==='P0001');await legacy.db.exec('ROLLBACK');
  const width=(await legacy.db.query("SELECT character_maximum_length n FROM information_schema.columns WHERE table_name='users' AND column_name='reset_password_token'")).rows[0].n;assert.equal(width,32);
  if(kind==='email')assert.equal((await legacy.db.query("SELECT count(*)::int n FROM users WHERE email='Conflict@Example.Invalid'")).rows[0].n,1);
  await legacy.db.close();
 });
 await check('forward migration canonicalizes unambiguous legacy aliases without changing internal IDs or issuing new public IDs',async()=>{
  const legacy=await cluster.database();await legacy.db.exec(baselineSql);const old=await insert(legacy.db,'users',{id:newPostgresId(),email:' Legacy@Example.Invalid ',uid:' doc-abcdef12 ',password_hash:hash,role:'doctor',updated_at:new Date()});await legacy.db.exec(correctiveSql);
  const row=(await legacy.db.query('SELECT id,email,uid,password_hash FROM users WHERE id=$1',[old.id])).rows[0];assert.equal(row.id,old.id);assert.equal(row.email,'legacy@example.invalid');assert.equal(row.uid,'DOC-ABCDEF12');assert.equal(row.password_hash,hash);await legacy.db.close();
 });
 writeFileSync('.test-data/phase22a-auth-results.json',JSON.stringify({status:'PASS',engine:(await cluster.admin.query('SELECT version()')).rows[0].version,migrations:5,passed:checks.length,checks,synthetic:true,productionAccess:false},null,2)+'\n');
 console.log(checks.length+' PostgreSQL authentication checks passed.');
} finally {
 if(previousNodeEnv===undefined)delete process.env.NODE_ENV;else process.env.NODE_ENV=previousNodeEnv;
 if(server){server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
 await infrastructure?.stop();await cluster.stop();
}
