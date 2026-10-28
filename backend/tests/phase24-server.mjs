import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {spawn,spawnSync} from 'node:child_process';
import {createHmac,generateKeyPairSync,randomBytes,randomInt} from 'node:crypto';
import {createRequire} from 'node:module';
import net from 'node:net';
import path from 'node:path';
import {startNativeCluster} from './helpers/native-cluster.mjs';
import {startRedis} from './helpers/redis-instance.mjs';
const require=createRequire(import.meta.url),mongoose=require('mongoose'),bcrypt=require('bcryptjs');
const {MongoMemoryServer}=require('mongodb-memory-server');
const {newPostgresId,mongoObjectIdToUuid}=require('../src/identifiers/uuid');
const checks=[],processes=new Set(),secrets=[];
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const redact=value=>secrets.reduce((text,secret)=>text.replaceAll(secret,'[redacted]'),String(value));
async function check(name,operation){await operation();checks.push(name);console.log('PASS patient server: '+name);}
async function freePort(){const lease=net.createServer();await new Promise(resolve=>lease.listen(0,'127.0.0.1',resolve));const port=lease.address().port;await new Promise(resolve=>lease.close(resolve));return port;}
async function stop(record){
 if(!record||record.child.exitCode!==null||record.child.signalCode!==null)return;
 const closed=new Promise(resolve=>record.child.once('close',resolve));record.child.kill();await Promise.race([closed,delay(5000)]);
 if(record.child.exitCode===null&&record.child.signalCode===null){record.child.kill('SIGKILL');await Promise.race([closed,delay(2000)]);}
}
function launch(env){
 const record={child:spawn(process.execPath,[path.resolve('server.js')],{cwd:process.cwd(),env,stdio:['ignore','pipe','pipe'],windowsHide:true}),output:''};
 const append=value=>{record.output=redact((record.output+value).slice(-40000));};record.child.stdout.on('data',append);record.child.stderr.on('data',append);processes.add(record);return record;
}
async function ready(record){const deadline=Date.now()+60000;while(!record.output.includes('Server running on port')){if(record.child.exitCode!==null||Date.now()>deadline)throw new Error('Synthetic patient server failed: '+redact(record.output));await delay(100);}}
const cluster=await startNativeCluster();let redis,mongo,source;
try{
 redis=await startRedis();const database=await cluster.database();
 await database.db.exec('CREATE EXTENSION vector; CREATE EXTENSION btree_gist;');await database.db.exec(readFileSync('prisma/roles.sql','utf8'));
 const credentials=Object.fromEntries(['mediid_migrator','mediid_runtime','mediid_diagnostics'].map(role=>[role,randomBytes(32).toString('hex')]));
 for(const [role,credential]of Object.entries(credentials))await cluster.admin.query('ALTER ROLE '+role+" LOGIN PASSWORD '"+credential+"'");
 const migrationUrl=database.url('mediid_migrator',credentials.mediid_migrator);
 const deployed=spawnSync(process.execPath,['scripts/prisma.cjs','deploy'],{env:{...process.env,NODE_ENV:'test',PG_ENV_FILE:path.join(cluster.root,'absent.env'),PG_MIGRATION_URL:migrationUrl},encoding:'utf8',windowsHide:true,timeout:120000});assert.equal(deployed.status,0,'Disposable patient server migration failed.');
 mongo=await MongoMemoryServer.create({binary:{version:'7.0.30',downloadDir:path.resolve('.test-data/mongodb-binaries')},instance:{ip:'127.0.0.1'}});
 source=await mongoose.createConnection(mongo.getUri('phase24_http_synthetic'),{autoIndex:false}).asPromise();
 const password='SyntheticPatientHttp123!',hash=await bcrypt.hash(password,12),mongoUserId=new mongoose.Types.ObjectId(),mongoPatientId=new mongoose.Types.ObjectId();
 await source.collection('users').insertOne({_id:mongoUserId,email:'patient-missing@example.invalid',password:hash,role:'patient',isActive:true});
 await source.collection('patients').insertOne({_id:mongoPatientId,user:mongoUserId,uid:'MID-MONGO001',firstName:'Mongo Only',lastName:'Synthetic',emergency:{bloodGroup:'AB+',emergencyContactName:'Mongo Contact'}});
 const missingUser=mongoObjectIdToUuid(mongoUserId.toHexString()),doctorUser=newPostgresId(),doctor=newPostgresId(),admin=newPostgresId(),hospital=newPostgresId();
 await database.db.query("INSERT INTO users(id,email,uid,password_hash,role,updated_at) VALUES($1,'patient-missing@example.invalid','MID-MONGO001',$2,'patient',now()),($3,'patient-doctor@example.invalid','DOC-HTTP2401',$2,'doctor',now()),($4,'patient-admin@example.invalid',NULL,$2,'hospital_admin',now())",[missingUser,hash,doctorUser,admin]);
 await database.db.query("INSERT INTO auth_legacy_links(user_id,mongo_user_id,patient_mongo_id,source_fingerprint) VALUES($1,$2,$3,$4)",[missingUser,mongoUserId.toHexString(),mongoPatientId.toHexString(),'a'.repeat(64)]);
 await database.db.query("INSERT INTO doctors(id,user_id,uid,first_name,last_name,specialization,updated_at) VALUES($1,$2,'DOC-HTTP2401','Synthetic','Doctor','Synthetic Medicine',now())",[doctor,doctorUser]);
 await database.db.query("INSERT INTO hospitals(id,user_id,uid,name,updated_at) VALUES($1,$2,'HID-HTTP2401','Synthetic Patient Hospital',now())",[hospital,admin]);
 const pair=generateKeyPairSync('rsa',{modulusLength:2048}),origin='https://patient-http-synthetic.invalid',env={};
 for(const key of ['PATH','Path','SystemRoot','WINDIR','TEMP','TMP','USERPROFILE'])if(process.env[key])env[key]=process.env[key];
 Object.assign(env,{
  NODE_ENV:'test',HOST:'127.0.0.1',PORT:String(await freePort()),AUTH_BACKEND:'postgres',ORGANIZATION_BACKEND:'postgres',PATIENT_BACKEND:'postgres',
  PATIENT_AADHAAR_HASH_KEY:randomBytes(32).toString('hex'),PATIENT_SCAN_WINDOW_MS:'60000',PATIENT_SCAN_SOURCE_MAX:'1000',PATIENT_SCAN_IDENTITY_MAX:'1000',
  MONGO_URI:mongo.getUri('phase24_http_synthetic'),MARKETPLACE_URI:mongo.getUri('phase24_marketplace_synthetic'),DOTENV_CONFIG_PATH:path.join(cluster.root,'absent.env'),PG_ENV_FILE:path.join(cluster.root,'absent.env'),
  PG_RUNTIME_URL:database.url('mediid_runtime',credentials.mediid_runtime),AUTH_REDIS_URL:redis.url,AUTH_RATE_KEY_SECRET:randomBytes(32).toString('hex'),
  AUTH_RATE_LOGIN_SOURCE_MAX:'1000',AUTH_RATE_LOGIN_IDENTITY_MAX:'100',AUTH_RATE_REGISTER_SOURCE_MAX:'100',AUTH_RATE_REGISTER_IDENTITY_MAX:'100',
  AUTH_ALLOWED_ORIGINS:origin,CLIENT_URL:origin,AUTH_COOKIE_SAME_SITE:'lax',AUTH_JWT_ISSUER:'phase24-http-synthetic',AUTH_JWT_AUDIENCE:'phase24-http-api',AUTH_JWT_KEY_ID:'phase24-http-key',AUTH_JWT_TTL_SECONDS:'900',AUTH_BCRYPT_COST:'12',AUTH_RESET_TTL_SECONDS:'900',
  AUTH_JWT_PRIVATE_KEY:pair.privateKey.export({type:'pkcs8',format:'pem'}),AUTH_JWT_PUBLIC_KEY:pair.publicKey.export({type:'spki',format:'pem'}),
  SMTP_HOST:'127.0.0.1',SMTP_PORT:'587',SMTP_USER:'synthetic',SMTP_PASS:randomBytes(32).toString('hex'),SMTP_FROM:'synthetic@example.invalid',REDIS_HOST:'127.0.0.1',REDIS_PORT:'1'
 });
 secrets.push(password,hash,migrationUrl,env.PG_RUNTIME_URL,redis.url,env.AUTH_JWT_PRIVATE_KEY,env.SMTP_PASS,env.AUTH_RATE_KEY_SECRET,env.PATIENT_AADHAAR_HASH_KEY,...Object.values(credentials));
 const main=launch(env);await ready(main);const base='http://127.0.0.1:'+env.PORT+'/api/',jar=new Map();
 async function api(route,{method='GET',body,token,baseUrl=base,originValue=origin,withCookies=true}={}){
  const headers={...(originValue?{Origin:originValue}:{}),...(body===undefined?{}:{'Content-Type':'application/json'}),...(token?{Authorization:'Bearer '+token}:{}),...(withCookies&&jar.size?{Cookie:[...jar].map(([key,value])=>key+'='+value).join('; ')}:{})};
  if(method!=='GET'&&jar.has('mediid_csrf'))headers['X-Mediid-CSRF']=decodeURIComponent(jar.get('mediid_csrf'));
  const response=await fetch(baseUrl+route,{method,headers,...(body===undefined?{}:{body:JSON.stringify(body)}),signal:AbortSignal.timeout(20000)});
  for(const cookie of response.headers.getSetCookie()){const[entry]=cookie.split(';'),separator=entry.indexOf('=');jar.set(entry.slice(0,separator),entry.slice(separator+1));}
  const raw=await response.text();let data;try{data=JSON.parse(raw);}catch{data=raw;}
  if(typeof data?.token==='string')secrets.push(data.token);return{status:response.status,body:data,headers:response.headers};
 }
 const ok=(result,status=200)=>assert.equal(result.status,status,'Unexpected HTTP status; safe code: '+(typeof result.body?.code==='string'?result.body.code:'none'));
 let token,uid,patientId,benefit,syntheticAadhaar,digest;
 await check('actual server explicitly selects PostgreSQL patients and exposes only backend configuration',async()=>{
  ok(await api('health'));const result=await api('patients/config');ok(result);assert.deepEqual(result.body,{backend:'postgres'});
 });
 await check('existing reviewed registration immediately creates one usable patient with matching public MID identity',async()=>{
  ok(await api('auth/csrf'));const result=await api('auth/register',{method:'POST',body:{email:'registered-patient@example.invalid',password,firstName:'Registered',lastName:'Synthetic',phone:'+910000000001'}});ok(result,201);token=result.body.token;
  const profile=await api('patients/profile',{token});ok(profile);uid=profile.body.uid;patientId=profile.body.internalId;assert.match(uid,/^MID-[A-Z0-9]{8}$/);
  const row=(await database.db.query('SELECT p.uid,u.uid user_uid FROM patients p JOIN users u ON u.id=p.user_id WHERE p.id=$1',[patientId])).rows[0];assert.equal(row.uid,uid);assert.equal(row.user_uid,uid);
  for(const key of ['documents','bills','medicalHistory'])assert.deepEqual(profile.body[key],[]);assert.equal(await source.collection('patients').countDocuments(),1);
 });
 await check('mounted profile patches synchronize safe auth me and persist only keyed synthetic Aadhaar',async()=>{
  syntheticAadhaar=Array.from({length:12},()=>String(randomInt(0,10))).join('');digest=createHmac('sha256',env.PATIENT_AADHAAR_HASH_KEY).update('mediid:patient:aadhaar:v1:'+syntheticAadhaar).digest('hex');
  const result=await api('patients/profile',{method:'PUT',token,body:{firstName:'Synchronized',dateOfBirth:'1990-01-01',phone:'+910000000002',address:{street:'Synthetic Private Address'},emergency:{bloodGroup:'O+',emergencyContactName:'Synthetic Emergency Contact',emergencyContactPhone:'+910000000003',emergencyContactRelation:'Parent',aadhaarNumber:syntheticAadhaar},organDonor:true}});ok(result);assert.equal(result.body.aadhaarPresent,true);
  const stored=(await database.db.query('SELECT aadhaar_hash FROM patients WHERE id=$1',[patientId])).rows[0].aadhaar_hash;assert.equal(stored===digest,true,'Only documented HMAC is persisted.');
  const me=await api('auth/me',{token});ok(me);assert.equal(me.body.profile.firstName,'Synchronized');assert.equal(me.body.profile.phone,'+910000000002');
  for(const body of [result.body,me.body])for(const secret of [syntheticAadhaar,digest])assert.equal(JSON.stringify(body).includes(secret),false,'Private identifier omitted.');
  for(const field of ['emergency','medicalBenefits','aadhaarHash','aadhaarNumber','bloodGroup'])assert.equal(Object.hasOwn(me.body.profile,field),false);
 });
 await check('patient dashboard QR and public emergency card work without revealing private profile information',async()=>{
  const result=await api('patients/qr',{token});ok(result);assert.equal(result.body.uid,uid);assert.equal(result.body.qrActive,true);assert.match(result.body.qrCode,/^data:image\/png;base64,/);
  const card=await api('patients/scan/'+uid,{withCookies:false});ok(card);assert.deepEqual(Object.keys(card.body).sort(),['emergency','name','uid']);assert.equal(card.body.emergency.bloodGroup,'O+');assert.equal(card.body.emergency.organDonor,true);
  for(const secret of [patientId,syntheticAadhaar,digest,'Synthetic Private Address','+910000000002','registered-patient@example.invalid'])assert.equal(JSON.stringify(card.body).includes(secret),false,'Public card remains safe.');
  assert.equal(card.headers.get('cache-control'),'no-store');
 });
 await check('qrActive gates mounted public cards with the same response as an unknown patient',async()=>{
  ok(await api('patients/profile',{method:'PUT',token,body:{qrActive:false}}));const hidden=await api('patients/scan/'+uid,{withCookies:false}),missing=await api('patients/scan/MID-UNKNOWN1',{withCookies:false});assert.equal(hidden.status,404);assert.deepEqual(hidden.body,missing.body);ok(await api('patients/profile',{method:'PUT',token,body:{qrActive:true}}));
 });
 await check('mounted benefits support exact amounts create update deactivate and legacy government adapter',async()=>{
  const result=await api('patients/medical-benefits',{method:'POST',token,body:{source:'personal',type:'individual_insurance',schemeName:'Synthetic HTTP Insurance',policyNumber:'SYNTHETIC-HTTP-POLICY',coverageAmount:'1234567890.12'}});ok(result,201);benefit=result.body;assert.equal(benefit.coverageAmount,'1234567890.12');
  const updated=await api('patients/medical-benefits/'+benefit.id,{method:'PUT',token,body:{notes:'Synthetic HTTP update'}});ok(updated);
  const legacy=await api('patients/government-benefits',{method:'POST',token,body:{type:'other',schemeName:'Synthetic HTTP Legacy Scheme',cardNumber:'SYNTHETIC-HTTP-CARD'}});ok(legacy,201);assert.ok(Array.isArray(legacy.body));
  const profile=await api('patients/profile',{token});ok(profile);assert.ok(profile.body.insurancePolicies.some(row=>row._id===benefit.id));
  ok(await api('patients/medical-benefits/'+benefit.id,{method:'DELETE',token}));assert.ok(!(await api('patients/medical-benefits',{token})).body.some(row=>row.id===benefit.id));
  assert.equal((await database.db.query('SELECT is_active FROM patient_benefits WHERE id=$1',[benefit.id])).rows[0].is_active,false);
 });
 await check('mounted patient trust works while trusted doctor and administrator retain zero patient profile authority',async()=>{
  for(const [kind,id]of [['doctors',doctor],['hospitals',hospital]])ok(await api('patients/trusted-'+kind+'/'+id,{method:'POST',token}));
  const trusted=await api('patients/trusted-providers',{token});ok(trusted);assert.equal(trusted.body.doctors.length,1);assert.equal(trusted.body.hospitals.length,1);assert.equal(Object.hasOwn(trusted.body.doctors[0],'email'),false);
  for(const email of ['patient-doctor@example.invalid','patient-admin@example.invalid']){
   const login=await api('auth/login',{method:'POST',body:{email,password}});ok(login);const providerToken=login.body.token;
   assert.equal((await api('patients/profile',{token:providerToken})).status,403);assert.equal((await api('patients/profile',{method:'PUT',token:providerToken,body:{firstName:'Forbidden'}})).status,403);
  }
  for(const table of ['consents','access_grants','encounters'])assert.equal((await database.db.query('SELECT count(*)::int n FROM '+table)).rows[0].n,0);
 });
 await check('all deferred document bill clinical and appointment routes explicitly fail closed without Mongo fallback',async()=>{
  const requests=[['POST','patients/documents'],['DELETE','patients/documents/'+mongoPatientId],['GET','patients/bills'],['POST','patients/bills'],['PUT','patients/bills/SYNTHETIC-BILL/pay'],['GET','appointments/my']];
  for(const [method,route]of requests){const result=await api(route,{method,token,...(method==='POST'||method==='PUT'?{body:{synthetic:true}}:{})});assert.equal(result.status,503,route);assert.equal(result.body.code,'AUTH_DOMAIN_NOT_MIGRATED',route);}
 });
 await check('mounted patient routes reject authority injection wrong origins unauthenticated and oversize JSON or form payloads',async()=>{
  assert.equal((await api('patients/profile',{method:'PUT',token,body:{uid:'MID-FORGED01'}})).status,400);
  assert.equal((await api('patients/profile',{method:'PUT',token,body:{firstName:'Forbidden'},originValue:'https://attacker.invalid'})).status,403);
  assert.equal((await api('patients/profile',{withCookies:false})).status,401);
  assert.equal((await api('patients/profile',{method:'PUT',token,body:{firstName:'x'.repeat(270000)}})).status,413);
  const form=await fetch(base+'patients/profile',{method:'PUT',headers:{Origin:origin,Authorization:'Bearer '+token,'Content-Type':'application/x-www-form-urlencoded'},body:'firstName='+'x'.repeat(270000),signal:AbortSignal.timeout(10000)});assert.equal(form.status,413);
 });
 await check('missing PostgreSQL profile and Mongo-only MID never read existing synthetic Mongo records',async()=>{
  const login=await api('auth/login',{method:'POST',body:{email:'patient-missing@example.invalid',password}});ok(login);
  const result=await api('patients/profile',{token:login.body.token});assert.equal(result.status,403);assert.equal(result.body.code,'PATIENT_FORBIDDEN');
  const scan=await api('patients/scan/MID-MONGO001',{withCookies:false});assert.equal(scan.status,404);assert.equal(scan.body.code,'PATIENT_NOT_FOUND');
 });
 await check('explicit legacy combination still mounts the existing Mongo patient route',async()=>{
  const candidate={...env,PORT:String(await freePort()),AUTH_BACKEND:'legacy',ORGANIZATION_BACKEND:'legacy',PATIENT_BACKEND:'legacy'};delete candidate.PATIENT_AADHAAR_HASH_KEY;
  const legacy=launch(candidate);await ready(legacy);const legacyBase='http://127.0.0.1:'+candidate.PORT+'/api/';
  const config=await api('patients/config',{baseUrl:legacyBase,withCookies:false});ok(config);assert.deepEqual(config.body,{backend:'legacy'});
  const result=await api('patients/scan/MID-MONGO001',{baseUrl:legacyBase,withCookies:false});ok(result);assert.equal(result.body.name,'Mongo Only Synthetic');await stop(legacy);
 });
 await check('missing auto incompatible and weak-secret patient configurations fail actual server startup',async()=>{
  for(const settings of [{PATIENT_BACKEND:undefined},{PATIENT_BACKEND:'auto'},{AUTH_BACKEND:'legacy',ORGANIZATION_BACKEND:'legacy'},{ORGANIZATION_BACKEND:'legacy'},{PATIENT_AADHAAR_HASH_KEY:undefined},{PATIENT_AADHAAR_HASH_KEY:'weak'},{PATIENT_SCAN_SOURCE_MAX:'0'}]){
   const candidate={...env,...settings,PORT:String(await freePort())};for(const key of Object.keys(candidate))if(candidate[key]===undefined)delete candidate[key];
   const invalid=launch(candidate),deadline=Date.now()+45000;while(invalid.child.exitCode===null&&Date.now()<deadline)await delay(100);
   assert.equal(invalid.child.exitCode,1,'Invalid patient configuration must stop server: '+redact(invalid.output));assert.equal(invalid.output.includes('Server running on port'),false);
  }
 });
 await check('two independently launched actual servers enforce one shared Redis MID scan budget',async()=>{
  const rateUser=newPostgresId();await database.db.query("INSERT INTO users(id,email,uid,password_hash,role,updated_at) VALUES($1,'rate-http@example.invalid','MID-RATEHTTP',$2,'patient',now())",[rateUser,hash]);
  await database.db.query("INSERT INTO patients(id,user_id,uid,first_name,last_name,updated_at) VALUES($1,$2,'MID-RATEHTTP','Synthetic','Rate',now())",[newPostgresId(),rateUser]);
  const firstEnv={...env,PORT:String(await freePort()),PATIENT_SCAN_IDENTITY_MAX:'2'},secondEnv={...env,PORT:String(await freePort()),PATIENT_SCAN_IDENTITY_MAX:'2'};
  const first=launch(firstEnv),second=launch(secondEnv);await Promise.all([ready(first),ready(second)]);
  const scan=recordEnv=>api('patients/scan/MID-RATEHTTP',{baseUrl:'http://127.0.0.1:'+recordEnv.PORT+'/api/',withCookies:false});
  ok(await scan(firstEnv));ok(await scan(secondEnv));const limited=await scan(firstEnv);assert.equal(limited.status,429);assert.equal(limited.body.code,'PATIENT_RATE_LIMIT');assert.ok(Number(limited.headers.get('retry-after'))>=1);
  const keys=await redis.admin.keys('mediid:auth:patientScan:*');for(const key of keys){assert.equal(key.includes('MID-RATEHTTP'),false);assert.match(key,/:[a-f0-9]{64}$/);}await Promise.all([stop(first),stop(second)]);
 });
 await check('PostgreSQL patient operations leave the synthetic Mongo patient and user stores untouched and emit no sensitive logs',async()=>{
  assert.equal(await source.collection('patients').countDocuments(),1);assert.equal(await source.collection('users').countDocuments(),1);assert.equal((await source.collection('patients').findOne()).firstName,'Mongo Only');
  for(const record of processes)for(const secret of [syntheticAadhaar,digest,'SYNTHETIC-HTTP-POLICY','SYNTHETIC-HTTP-CARD','Synthetic Emergency Contact','+910000000003'])assert.equal(record.output.includes(secret),false,'Sensitive patient information must not be logged.');
 });
 await check('actual Redis outage returns patient temporary unavailable without exposing emergency data',async()=>{
  await redis.stop();const result=await api('patients/scan/'+uid,{withCookies:false});assert.equal(result.status,503);assert.equal(result.body.code,'PATIENT_UNAVAILABLE');assert.equal(Object.hasOwn(result.body,'emergency'),false);
 });
 await check('actual PostgreSQL outage never returns Mongo fallback for an authenticated patient profile',async()=>{
  await cluster.stop();const result=await api('patients/profile',{token});assert.equal(result.status,503);assert.ok(['PATIENT_UNAVAILABLE','AUTH_UNAVAILABLE'].includes(result.body.code));assert.equal(JSON.stringify(result.body).includes('Mongo Only'),false);
 });
 writeFileSync('.test-data/phase24-server-results.json',JSON.stringify({status:'PASS',actualExpressServer:true,postgres:'native',redis:'real',mongo:'disposable synthetic',passed:checks.length,checks})+'\n');console.log('Phase 2.4 actual server checks passed: '+checks.length);
}finally{
 await Promise.all([...processes].map(stop));await source?.close();await mongo?.stop();await redis?.stop();await cluster.stop();
}
