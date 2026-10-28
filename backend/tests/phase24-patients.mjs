import assert from 'node:assert/strict';
import {readFileSync,readdirSync,writeFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {createHmac,generateKeyPairSync,randomBytes,randomInt} from 'node:crypto';
import {createRequire} from 'node:module';
import http from 'node:http';
import path from 'node:path';
import {startNativeCluster} from './helpers/native-cluster.mjs';
import {startRedis} from './helpers/redis-instance.mjs';
import {insert} from './helpers/review-fixtures.mjs';
const require=createRequire(import.meta.url),express=require('express'),qr=require('qrcode');
const {newPostgresId,mongoObjectIdToUuid}=require('../src/identifiers/uuid');
const {startAuthRuntime}=require('../src/auth/runtime');
const {AuthLimits,limitConfig}=require('../src/auth/limits');
const {PostgresInfrastructure}=require('../src/infrastructure/postgres/client');
const {runtimeConfig}=require('../src/infrastructure/postgres/config');
const {Organizations}=require('../src/organizations/services');
const {Patients}=require('../src/patients/services');
const {createPatientRouter}=require('../src/patients/http');
const checks=[],servers=[],qrPayloads=[],originalQr=qr.toDataURL;
qr.toDataURL=function(payload,...options){qrPayloads.push(payload);return originalQr.call(this,payload,...options);};
const code=expected=>error=>error.code===expected;
const denied=operation=>assert.rejects(operation,error=>error.code==='42501');
async function check(name,operation){await operation();checks.push(name);console.log('PASS patients: '+name);}
let cluster,redis,runtime,first,second,limiterA,limiterB;
try{
 cluster=await startNativeCluster();redis=await startRedis();
 const database=await cluster.database();await database.db.exec('CREATE EXTENSION vector; CREATE EXTENSION btree_gist;');
 await database.db.exec(readFileSync('prisma/roles.sql','utf8'));
 const credentials=Object.fromEntries(['mediid_migrator','mediid_runtime','mediid_diagnostics'].map(role=>[role,randomBytes(32).toString('hex')]));
 for(const [role,credential]of Object.entries(credentials))await cluster.admin.query('ALTER ROLE '+role+" LOGIN PASSWORD '"+credential+"'");
 await check('all forward migrations deploy through the actual non-superuser migrator',async()=>{
  const result=spawnSync(process.execPath,['scripts/prisma.cjs','deploy'],{env:{...process.env,NODE_ENV:'test',PG_ENV_FILE:path.join(cluster.root,'absent.env'),PG_MIGRATION_URL:database.url('mediid_migrator',credentials.mediid_migrator)},encoding:'utf8',windowsHide:true,timeout:120000});
  assert.equal(result.status,0,'Synthetic patient migration failed.');
  const count=readdirSync('prisma/migrations',{withFileTypes:true}).filter(entry=>entry.isDirectory()).length;
  assert.equal((await database.db.query('SELECT count(*)::int n FROM _prisma_migrations WHERE finished_at IS NOT NULL')).rows[0].n,count);
  assert.equal((await database.db.query("SELECT count(*)::int n FROM _prisma_migrations WHERE migration_name='202610280002_phase24_patient_demographics_benefits' AND finished_at IS NOT NULL")).rows[0].n,1);
 });
 const pair=generateKeyPairSync('rsa',{modulusLength:2048}),origin='https://patients-synthetic.invalid',aadhaarHashKey=randomBytes(32).toString('hex');
 const env={NODE_ENV:'test',AUTH_BACKEND:'postgres',CLIENT_URL:origin,AUTH_ALLOWED_ORIGINS:origin,AUTH_JWT_ISSUER:'patients-synthetic',AUTH_JWT_AUDIENCE:'patients-synthetic-api',AUTH_JWT_KEY_ID:'patients-test-key',AUTH_JWT_TTL_SECONDS:'900',AUTH_BCRYPT_COST:'12',AUTH_RESET_TTL_SECONDS:'900',AUTH_JWT_PRIVATE_KEY:pair.privateKey.export({type:'pkcs8',format:'pem'}),AUTH_JWT_PUBLIC_KEY:pair.publicKey.export({type:'spki',format:'pem'}),AUTH_REDIS_URL:redis.url,AUTH_RATE_KEY_SECRET:randomBytes(32).toString('hex'),SMTP_HOST:'127.0.0.1',SMTP_PORT:'587',SMTP_USER:'synthetic',SMTP_PASS:randomBytes(32).toString('hex'),SMTP_FROM:'test@example.invalid'};
 process.env.NODE_ENV='test';process.env.PG_RUNTIME_URL=database.url('mediid_runtime',credentials.mediid_runtime);
 runtime=await startAuthRuntime(env);
 const organizations=new Organizations(runtime,{clientUrl:origin});
 const options={organizations,aadhaarHashKey,clientUrl:origin,scanPolicy:{windowMs:60000,sourceMax:1000,identityMax:1000}};
 const service=new Patients(runtime,options),password='SyntheticPatientPassword123!',hash=await runtime.provisioning.passwords.hash(password);
 const user=(role,email,uid=null,id=newPostgresId())=>insert(database.db,'users',{id,role,email,uid,password_hash:hash,is_active:true,updated_at:new Date()});
 const a=await user('patient','patient-a@example.invalid','MID-TESTA001'),b=await user('patient','patient-b@example.invalid','MID-TESTB001'),patientIds=new Map();
 for(const account of [a,b]){
  const id=newPostgresId();patientIds.set(account.id,id);
  await insert(database.db,'patients',{id,user_id:account.id,uid:account.uid,first_name:'Synthetic',last_name:account===a?'Patient A':'Patient B',phone:'+910000000001',updated_at:new Date()});
  await insert(database.db,'auth_profiles',{user_id:account.id,profile_kind:'patient',public_uid:account.uid,safe_profile:{_id:id,uid:account.uid,firstName:'Synthetic',lastName:account===a?'Patient A':'Patient B'}});
 }
 const doctorUser=await user('doctor','patient-doctor@example.invalid','DOC-PATIENT01'),admin=await user('hospital_admin','patient-admin@example.invalid');
 const staff=await user('hospital_staff','patient-staff@example.invalid'),support=await user('support_agent','patient-support@example.invalid'),buyer=await user('buyer','patient-buyer@example.invalid'),pharmacy=await user('pharmacy','patient-pharmacy@example.invalid');
 const ownId=patientIds.get(a.id),otherId=patientIds.get(b.id),doctor=newPostgresId(),hospital=newPostgresId(),inactiveDoctor=newPostgresId(),inactiveHospital=newPostgresId();
 await insert(database.db,'doctors',{id:doctor,user_id:doctorUser.id,uid:doctorUser.uid,first_name:'Synthetic',last_name:'Doctor',specialization:'Synthetic Medicine',phone:'+910000000002',email:doctorUser.email,is_private_practice:true,updated_at:new Date()});
 await insert(database.db,'doctors',{id:inactiveDoctor,uid:'DOC-INACTIVE1',first_name:'Inactive',last_name:'Doctor',specialization:'Synthetic',is_active:false,updated_at:new Date()});
 await insert(database.db,'hospitals',{id:hospital,user_id:admin.id,uid:'HID-PATIENT1',name:'Synthetic Patient Hospital',city:'Synthetic City',updated_at:new Date()});
 const inactiveAdmin=await user('hospital_admin','inactive-admin@example.invalid');
 await insert(database.db,'hospitals',{id:inactiveHospital,user_id:inactiveAdmin.id,uid:'HID-INACTIVE',name:'Synthetic Inactive Hospital',is_active:false,updated_at:new Date()});
 await database.db.query('UPDATE doctors SET primary_hospital_id=$1 WHERE id=$2',[hospital,doctor]);
 const clinic=await organizations.createClinic(doctorUser,{name:'Synthetic Trusted Clinic',type:'clinic'}),tokens=new Map();
 for(const actor of [a,b,doctorUser,admin,staff,support,buyer,pharmacy])tokens.set(actor.id,(await runtime.sessions.login(actor.email,password)).token);
 const nonpatients=[doctorUser,admin,staff,support,buyer,pharmacy];
 const app=express();app.use(express.json({limit:'256kb'}));app.use('/api/patients',createPatientRouter(runtime,service));
 const server=http.createServer(app);await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));servers.push(server);
 const base='http://127.0.0.1:'+server.address().port+'/api/patients';
 async function api(route,{method='GET',actor=a,body,token,requestOrigin=origin}={}){
  const response=await fetch(base+route,{method,headers:{...(body===undefined?{}:{'Content-Type':'application/json'}),...(requestOrigin?{Origin:requestOrigin}:{}),...((token||actor)?{Authorization:'Bearer '+(token||tokens.get(actor.id))}:{})},...(body===undefined?{}:{body:JSON.stringify(body)}),signal:AbortSignal.timeout(20000)});
  const raw=await response.text();let data;try{data=JSON.parse(raw);}catch{data=raw;}return{status:response.status,body:data,headers:response.headers};
 }
 await check('patient service uses restricted runtime credentials and reviewed current-state sessions',async()=>{
  assert.equal((await runtime.postgres.client.$queryRawUnsafe('SELECT current_user AS role'))[0].role,'mediid_runtime');assert.equal((await runtime.sessions.authenticate(tokens.get(a.id))).id,a.id);
 });
 await check('owner profile preserves legacy DTO fields and safe empty deferred arrays',async()=>{
  const result=await api('/profile');assert.equal(result.status,200);
  for(const key of ['_id','id','internalId','uid','firstName','lastName','dateOfBirth','gender','phone','address','profilePhoto','emergency','medicalBenefits','governmentBenefits','insurancePolicies','trustedDoctors','trustedHospitals','qrActive','documents','bills','medicalHistory','createdAt','updatedAt'])assert.ok(Object.hasOwn(result.body,key),key);
  assert.equal(result.body.uid,a.uid);assert.equal(result.body._id,ownId);
  for(const key of ['documents','bills','medicalHistory'])assert.deepEqual(result.body[key],[]);
  for(const key of ['allergies','chronicConditions','currentMedications'])assert.deepEqual(result.body.emergency[key],[]);
  assert.equal(result.headers.get('cache-control'),'no-store');
 });
 await check('valid profile patches preserve MID and correctly persist demographic emergency and address fields',async()=>{
  const result=await api('/profile',{method:'PUT',body:{firstName:'Updated',lastName:'Synthetic',dateOfBirth:'1990-02-28',gender:'other',phone:'+910000000003',address:{street:'Synthetic Street',city:'Synthetic City',state:'Synthetic State',pincode:'000000',country:'India'},profilePhoto:'https://synthetic.invalid/photo.png',emergency:{bloodGroup:'O+',emergencyContactName:'Synthetic Contact',emergencyContactPhone:'+910000000004',emergencyContactRelation:'Parent'},organDonor:true,qrActive:true}});
  assert.equal(result.status,200);assert.equal(result.body.dateOfBirth,'1990-02-28');assert.equal(result.body.emergency.bloodGroup,'O+');assert.equal(result.body.address.city,'Synthetic City');assert.equal(result.body.uid,a.uid);
  assert.equal((await database.db.query('SELECT uid FROM users WHERE id=$1',[a.id])).rows[0].uid,a.uid);
 });
 await check('profile allowlist rejects identity authority cross-patient provider clinical and billing injection',async()=>{
  for(const body of [{id:otherId},{_id:otherId},{internalId:otherId},{userId:b.id},{user:b.id},{uid:b.uid},{role:'doctor'},{email:'injected@example.invalid'},{authVersion:9},{password:'InjectedPassword123!'},{passwordHash:'fake'},{createdAt:'2000-01-01'},{medicalBenefits:[]},{trustedDoctors:[doctor]},{trustedHospitals:[hospital]},{rating:{average:5}},{doctorSequence:100},{documents:[]},{bills:[]},{medicalHistory:[]},{unknown:true}])assert.equal((await api('/profile',{method:'PUT',body})).status,400,Object.keys(body)[0]);
  assert.equal((await database.db.query('SELECT first_name FROM patients WHERE id=$1',[otherId])).rows[0].first_name,'Synthetic');
  assert.equal((await api('/profile?userId='+b.id)).status,400);assert.equal((await api('/profile?uid='+b.uid)).status,400);assert.equal((await api('/profile')).body.uid,a.uid);
 });
 await check('nonpatient roles and correctly signed forged patient claims grant no private profile access',async()=>{
  for(const actor of nonpatients)for(const method of ['GET','PUT'])assert.equal((await api('/profile',{actor,method,...(method==='PUT'?{body:{firstName:'Forbidden'}}:{})})).status,403,actor.role);
  const claim=runtime.tokens.verify(tokens.get(doctorUser.id)),forged=runtime.tokens.issue({...claim,role:'patient'},{sid:claim.sid,jti:newPostgresId(),ver:claim.ver});
  assert.equal((await api('/profile',{token:forged})).status,401);assert.equal((await api('/profile',{token:'unverified.claims.here'})).status,401);
  assert.equal((await api('/profile',{method:'PUT',body:{firstName:'Forbidden'},requestOrigin:'https://attacker.invalid'})).status,403);
 });
 await check('profile validation rejects invalid dates names nested keys blood groups and clinical writes',async()=>{
  for(const body of [{firstName:''},{lastName:' '},{firstName:'A\u0000B'},{firstName:'x'.repeat(101)},{dateOfBirth:'2001-02-29'},{dateOfBirth:'2999-01-01'},{gender:'unsupported'},{phone:'a'.repeat(33)},{address:{latitude:1}},{emergency:{bloodGroup:'X+'}},{emergency:{bloodGroup:['O_POS']}},{emergency:{bloodGroup:{value:'O_POS'}}},{emergency:{emergencyContactName:'x'.repeat(101)}},{emergency:{allergies:['Clinical']}},{emergency:{chronicConditions:[]}},{emergency:{currentMedications:[]}},{qrActive:'true'}])assert.equal((await api('/profile',{method:'PUT',body})).status,400);
 });
 const syntheticAadhaar=Array.from({length:12},()=>String(randomInt(0,10))).join(''),expectedDigest=createHmac('sha256',aadhaarHashKey).update('mediid:patient:aadhaar:v1:'+syntheticAadhaar).digest('hex');
 await check('synthetic Aadhaar persists only deterministic domain-separated HMAC and never private response or auth presentation',async()=>{
  const result=await api('/profile',{method:'PUT',body:{emergency:{aadhaarNumber:syntheticAadhaar}}});assert.equal(result.status,200);
  const stored=(await database.db.query('SELECT aadhaar_hash FROM patients WHERE id=$1',[ownId])).rows[0].aadhaar_hash;
  assert.equal(stored===expectedDigest,true,'Keyed digest must use documented domain separation.');assert.equal(stored===syntheticAadhaar,false);assert.equal(result.body.aadhaarPresent,true);assert.equal(result.body.emergency.aadhaarPresent,true);
  assert.equal((await api('/profile',{method:'PUT',body:{emergency:{aadhaarNumber:syntheticAadhaar}}})).status,200);
  assert.equal((await database.db.query('SELECT aadhaar_hash FROM patients WHERE id=$1',[ownId])).rows[0].aadhaar_hash===stored,true);
  for(const value of [JSON.stringify(result.body),JSON.stringify(await runtime.sessions.me(await runtime.sessions.authenticate(tokens.get(a.id))))])for(const secret of [syntheticAadhaar,stored])assert.equal(value.includes(secret),false,'Sensitive identifier absent.');
  for(const invalid of ['123','12345678901a',' '.repeat(12),'',42]){const rejected=await api('/profile',{method:'PUT',body:{emergency:{aadhaarNumber:invalid}}});assert.equal(rejected.status,400);assert.equal(JSON.stringify(rejected.body).includes(stored),false);}
 });
 await check('safe auth presentation synchronizes names and phone without emergency benefit Aadhaar or clinical data',async()=>{
  assert.equal((await api('/profile',{method:'PUT',body:{firstName:'Synchronized',phone:'+910000000005'}})).status,200);
  const metadata=await runtime.sessions.me(await runtime.sessions.authenticate(tokens.get(a.id)));assert.equal(metadata.profile.firstName,'Synchronized');assert.equal(metadata.profile.phone,'+910000000005');
  for(const key of ['aadhaarHash','aadhaarNumber','aadhaarPresent','bloodGroup','emergency','medicalBenefits','policyNumber','documents','bills','medicalHistory'])assert.equal(Object.hasOwn(metadata.profile,key),false,key);
 });
 await check('patient QR library receives only safe public routing identity and no private patient fields',async()=>{
  const result=await api('/qr');assert.equal(result.status,200);assert.equal(result.body.uid,a.uid);assert.equal(result.body.qrActive,true);assert.match(result.body.qrCode,/^data:image\/png;base64,/);
  const payload=JSON.parse(qrPayloads.at(-1));assert.equal(payload.uid,a.uid);assert.ok(typeof payload.type==='string');assert.ok(typeof payload.verifyUrl==='string');
  for(const key of Object.keys(payload))assert.ok(['uid','type','verifyUrl','generatedAt'].includes(key),key);
  for(const secret of [ownId,a.id,syntheticAadhaar,expectedDigest,'Synchronized','Synthetic Contact'])assert.equal(JSON.stringify(payload).includes(secret),false,'QR omits private data.');
  assert.equal((await api('/qr',{actor:doctorUser})).status,403);
  const columns=(await database.db.query("SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name='patients'")).rows.map(row=>row.column_name);assert.equal(columns.includes('qr_code'),false);
 });
 await check('public card exposes exactly MID name blood group contact relation and organ donor state',async()=>{
  const result=await api('/scan/'+a.uid,{actor:null});assert.equal(result.status,200);assert.deepEqual(Object.keys(result.body).sort(),['emergency','name','uid']);
  assert.deepEqual(Object.keys(result.body.emergency).sort(),['bloodGroup','emergencyContactName','emergencyContactPhone','emergencyContactRelation','organDonor']);
  assert.deepEqual(result.body.emergency,{bloodGroup:'O+',emergencyContactName:'Synthetic Contact',emergencyContactPhone:'+910000000004',emergencyContactRelation:'Parent',organDonor:true});
  for(const secret of [ownId,a.id,syntheticAadhaar,expectedDigest,'Synthetic Street','+910000000005',a.email])assert.equal(JSON.stringify(result.body).includes(secret),false,'Public card omits private data.');
  for(const key of ['dateOfBirth','address','phone','email','aadhaarPresent','aadhaarHash','medicalBenefits','insurancePolicies','governmentBenefits','documents','medicalHistory','allergies','bills','trustedDoctors','trustedHospitals','internalId','userId','token'])assert.equal(Object.hasOwn(result.body,key),false,key);
 });
 await check('disabled QR inactive users and missing MIDs have identical safe public not-found results',async()=>{
  const missing=await api('/scan/MID-MISSING1',{actor:null});assert.equal(missing.status,404);
  assert.equal((await api('/profile',{method:'PUT',body:{qrActive:false}})).status,200);
  const hidden=await api('/scan/'+a.uid,{actor:null});assert.equal(hidden.status,404);assert.deepEqual(hidden.body,missing.body);
  assert.equal((await api('/profile',{method:'PUT',body:{qrActive:true}})).status,200);
  await database.db.query('UPDATE users SET is_active=false WHERE id=$1',[a.id]);
  const inactive=await api('/scan/'+a.uid,{actor:null});assert.equal(inactive.status,404);assert.deepEqual(inactive.body,missing.body);assert.equal((await api('/profile')).status,401);
  await database.db.query('UPDATE users SET is_active=true WHERE id=$1',[a.id]);tokens.set(a.id,(await runtime.sessions.login(a.email,password)).token);
 });
 await check('malformed noncanonical MID and internal UUID public scans are safely rejected',async()=>{
  for(const uid of [ownId,'mid-testa001','MID-TESTA001x','MID-123','0123456789abcdef01234567']){const result=await api('/scan/'+uid,{actor:null});assert.equal(result.status,400);assert.equal(result.body.code,'PATIENT_INPUT');}
 });
 let government,employer,personal,benefitB;
 await check('government employer and personal benefits preserve exact PostgreSQL Decimal strings and new UUIDv7 IDs',async()=>{
  const drafts=[
   {source:'government',type:'ayushman',schemeName:'Synthetic Government Scheme',cardNumber:'SYNTHETIC-CARD-NOT-REAL',coverageAmount:'9999999999.99',roomRentLimit:'99999999.99',validFrom:'2026-01-01',validUntil:'2030-12-31',familyCovered:true,familyMembers:['Synthetic Dependent']},
   {source:'employer',type:'group_mediclaim',schemeName:'Synthetic Employer Plan',policyNumber:'SYNTHETIC-EMPLOYER-POLICY',employerName:'Synthetic Employer',employeeId:'SYNTHETIC-EMPLOYEE',insurerName:'Synthetic Insurer',tpaName:'Synthetic TPA',tpaPhone:'+910000000006',coverageAmount:'0.01',roomRentLimit:'0.10',hospitalNetwork:'Synthetic network',claimProcess:'Synthetic process',helplineNumber:'+910000000007',notes:'Synthetic test only'},
   {source:'personal',type:'individual_insurance',schemeName:'Synthetic Personal Plan',policyNumber:'SYNTHETIC-PERSONAL-POLICY',coverageAmount:'1234567890.12',familyCovered:false}
  ],results=[];
  for(const body of drafts){const result=await api('/medical-benefits',{method:'POST',body});assert.equal(result.status,201);assert.match(result.body.id,/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);assert.equal(result.body._id,result.body.id);results.push(result.body);}
  [government,employer,personal]=results;for(let i=0;i<results.length;i++)assert.equal(results[i].coverageAmount,drafts[i].coverageAmount);
  const stored=(await database.db.query('SELECT coverage_amount::text amount,room_rent_limit::text rent FROM patient_benefits WHERE id=$1',[government.id])).rows[0];assert.deepEqual(stored,{amount:'9999999999.99',rent:'99999999.99'});
  const other=await api('/medical-benefits',{method:'POST',actor:b,body:{source:'personal',type:'family_floater',schemeName:'Synthetic Patient B Plan',coverageAmount:'100.00'}});assert.equal(other.status,201);benefitB=other.body;
 });
 await check('profile benefits and compatibility government insurance arrays derive from canonical owner rows',async()=>{
  const profile=(await api('/profile')).body,list=(await api('/medical-benefits')).body;assert.equal(list.length,3);assert.deepEqual(profile.medicalBenefits.map(row=>row.id).sort(),list.map(row=>row.id).sort());
  assert.ok(profile.governmentBenefits.some(row=>row._id===government.id));assert.ok(profile.insurancePolicies.some(row=>row._id===personal.id));
  const scan=await api('/scan/'+a.uid,{actor:null});for(const item of ['medicalBenefits','governmentBenefits','insurancePolicies','cardNumber','policyNumber'])assert.equal(Object.hasOwn(scan.body,item),false,item);
  assert.equal(JSON.stringify(scan.body).includes('SYNTHETIC-PERSONAL-POLICY'),false);
 });
 await check('benefit mutations enforce patient ownership and deletion deactivates history instead of destroying it',async()=>{
  const update=await api('/medical-benefits/'+employer.id,{method:'PUT',body:{notes:'Synthetic owner update',coverageAmount:'101.23'}});assert.equal(update.status,200);assert.equal(update.body.coverageAmount,'101.23');
  for(const method of ['PUT','DELETE'])assert.ok([403,404].includes((await api('/medical-benefits/'+benefitB.id,{method,...(method==='PUT'?{body:{notes:'Forbidden'}}:{})})).status));
  assert.equal((await api('/medical-benefits',{actor:b})).body.length,1);
  assert.equal((await api('/medical-benefits/'+employer.id,{method:'DELETE'})).status,200);
  assert.equal((await database.db.query('SELECT is_active FROM patient_benefits WHERE id=$1',[employer.id])).rows[0].is_active,false);
  assert.ok(!(await api('/medical-benefits')).body.some(row=>row.id===employer.id));assert.ok(!(await api('/profile')).body.medicalBenefits.some(row=>row.id===employer.id));
 });
 await check('benefit validator rejects invalid sources type pairs money dates oversized text arrays and unknown properties',async()=>{
  const valid={source:'government',type:'ayushman',schemeName:'Synthetic Plan'};
  for(const patch of [{source:'clinical_admin'},{source:['government']},{source:{value:'government'}},{type:'admin'},{source:'personal',type:'ayushman'},{coverageAmount:'-0.01'},{roomRentLimit:'-1.00'},{coverageAmount:'1.001'},{coverageAmount:'NaN'},{coverageAmount:'1e4'},{coverageAmount:'10000000000.00'},{roomRentLimit:'100000000.00'},{validFrom:'2030-01-01',validUntil:'2029-12-31'},{validFrom:'2026-02-30'},{familyMembers:Array(51).fill('Synthetic')},{notes:'x'.repeat(10001)},{cardNumber:'x'.repeat(129)},{patientId:otherId},{isActive:false},{unknown:true}])assert.equal((await api('/medical-benefits',{method:'POST',body:{...valid,...patch}})).status,400,Object.keys(patch)[0]);
  for(const actor of nonpatients)assert.equal((await api('/medical-benefits',{actor})).status,403);
 });
 await check('legacy government adapter explicitly maps other and insurance without a second benefits table',async()=>{
  const govt=await api('/government-benefits',{method:'POST',body:{type:'other',schemeName:'Synthetic Legacy Government',cardNumber:'SYNTHETIC-LEGACY-CARD'}});assert.equal(govt.status,201);assert.ok(Array.isArray(govt.body));
  const insurance=await api('/government-benefits',{method:'POST',body:{type:'insurance',schemeName:'Synthetic Legacy Insurance',cardNumber:'SYNTHETIC-LEGACY-POLICY'}});assert.equal(insurance.status,201);
  const rows=(await database.db.query("SELECT source,type FROM patient_benefits WHERE patient_id=$1 AND scheme_name LIKE 'Synthetic Legacy%' ORDER BY source",[ownId])).rows;assert.deepEqual(rows,[{source:'government',type:'other_govt'},{source:'personal',type:'individual_insurance'}]);
  for(const body of [{type:'unsupported',schemeName:'Unsupported'},{type:'other',schemeName:'Unsupported',unknown:true}])assert.equal((await api('/government-benefits',{method:'POST',body})).status,400);
 });
 const runtimeConnection=await database.connect('mediid_runtime',credentials.mediid_runtime);
 try{
  await check('database mutation boundary independently rejects unsafe profile benefit and nonpatient payloads',async()=>{
   const mutate=patch=>runtimeConnection.query('SELECT public.mediid_update_patient_profile($1::uuid,$2::jsonb)',[a.id,JSON.stringify(patch)]);
   for(const patch of [{uid:b.uid},{userId:b.id},{aadhaarNumber:syntheticAadhaar},{aadhaarHash:'not-a-keyed-digest'},{firstName:''},{dateOfBirth:'2999-01-01'},{emergencyContactPhone:'x'.repeat(33)},{allergies:[]}])await assert.rejects(()=>mutate(patch));
   await assert.rejects(()=>runtimeConnection.query('SELECT public.mediid_update_patient_profile($1::uuid,$2::jsonb)',[doctorUser.id,JSON.stringify({firstName:'Forbidden'})]));
   const profile=(await runtimeConnection.query('SELECT public.mediid_get_patient_profile($1::uuid) profile',[a.id])).rows[0].profile;assert.equal(Object.hasOwn(profile,'aadhaar_hash'),false);assert.equal(profile.aadhaar_present,true);
   const save=patch=>runtimeConnection.query('SELECT public.mediid_save_patient_benefit($1::uuid,$2::uuid,$3::jsonb,true)',[a.id,newPostgresId(),JSON.stringify(patch)]);
   for(const patch of [{source:'unsupported',type:'admin'},{source:'personal',type:'individual_insurance',coverageAmount:'-1.00'},{source:'personal',type:'individual_insurance',coverageAmount:2},{source:'government',type:'ayushman',patientId:otherId}])await assert.rejects(()=>save(patch));
  });
  await check('native check constraints reject unsafe persisted source money and date ranges independently of functions',async()=>{
   const base={id:newPostgresId(),patient_id:ownId,source:'personal',type:'individual_insurance',family_members:[],coverage_amount:'1.00'};
   for(const patch of [{source:'unsupported'},{coverage_amount:'-0.01'},{room_rent_limit:'-0.01'},{coverage_amount:'NaN'},{room_rent_limit:'NaN'},{valid_from:'2030-01-01',valid_until:'2029-01-01'}])await assert.rejects(()=>insert(database.db,'patient_benefits',{...base,id:newPostgresId(),...patch}),error=>error.code==='23514');
  });
 }finally{await runtimeConnection.end();}
 await check('trusted doctor hospital and private clinic lists expose safe public provider summaries',async()=>{
  for(const [kind,target]of [['doctors',doctor],['hospitals',hospital],['hospitals',clinic.internalId]]){
   assert.ok([200,201].includes((await api('/trusted-'+kind+'/'+target,{method:'POST'})).status));assert.ok([200,201,409].includes((await api('/trusted-'+kind+'/'+target,{method:'POST'})).status));
  }
  const result=await api('/trusted-providers');assert.equal(result.status,200);assert.deepEqual(Object.keys(result.body).sort(),['doctors','hospitals']);assert.equal(result.body.doctors.length,1);assert.equal(result.body.hospitals.length,2);assert.equal(result.body.doctors[0].uid,doctorUser.uid);assert.ok(result.body.hospitals.some(row=>row.type==='clinic'));
  for(const row of result.body.doctors)for(const key of ['phone','email','registrationNumber','userId','activation','passwordHash'])assert.equal(Object.hasOwn(row,key),false,key);
  const counts=(await database.db.query('SELECT (SELECT count(*)::int FROM patient_trusted_doctors WHERE patient_id=$1) doctors,(SELECT count(*)::int FROM patient_trusted_hospitals WHERE patient_id=$1) hospitals',[ownId])).rows[0];assert.deepEqual(counts,{doctors:1,hospitals:2});
  assert.equal((await database.db.query('SELECT count(*)::int n FROM doctor_hospital_memberships WHERE doctor_id=$1 AND hospital_id=$2',[doctor,hospital])).rows[0].n,0);
 });
 await check('trust removal preserves other patient preferences clinic membership and ownership',async()=>{
  for(const [kind,target]of [['doctors',doctor],['hospitals',hospital]])assert.ok([200,201].includes((await api('/trusted-'+kind+'/'+target,{method:'POST',actor:b})).status));
  assert.equal((await api('/trusted-doctors/'+doctor,{method:'DELETE'})).status,200);assert.equal((await api('/trusted-hospitals/'+hospital,{method:'DELETE'})).status,200);
  const other=(await api('/trusted-providers',{actor:b})).body;assert.equal(other.doctors.length,1);assert.equal(other.hospitals.length,1);
  assert.equal((await database.db.query('SELECT clinic_owner_doctor_id FROM hospitals WHERE id=$1',[clinic.internalId])).rows[0].clinic_owner_doctor_id,doctor);
  assert.equal((await database.db.query('SELECT count(*)::int n FROM doctor_hospital_memberships WHERE doctor_id=$1 AND hospital_id=$2',[doctor,clinic.internalId])).rows[0].n,1);
 });
 await check('inactive invalid and unproven provider identities cannot be newly trusted by any unauthorized actor',async()=>{
  for(const [kind,target,status]of [['doctors',inactiveDoctor,404],['hospitals',inactiveHospital,404],['doctors',newPostgresId(),404],['hospitals',newPostgresId(),404],['doctors','not-an-id',400],['hospitals','HID-PATIENT1',400],['doctors','0123456789abcdef01234567',404]])assert.equal((await api('/trusted-'+kind+'/'+target,{method:'POST'})).status,status);
  await database.db.query('UPDATE users SET is_active=false WHERE id=$1',[doctorUser.id]);assert.equal((await api('/trusted-doctors/'+doctor,{method:'POST'})).status,404);await database.db.query('UPDATE users SET is_active=true WHERE id=$1',[doctorUser.id]);tokens.set(doctorUser.id,(await runtime.sessions.login(doctorUser.email,password)).token);
  for(const actor of nonpatients)assert.equal((await api('/trusted-hospitals/'+hospital,{method:'POST',actor})).status,403);
 });
 await check('legacy patient DTO and provider ObjectId resolution require recorded frozen namespace mappings',async()=>{
  const legacyPatient='1234567890abcdef12345670',legacyUser='1234567890abcdef12345671';
  const imported=await user('patient','patient-imported@example.invalid','MID-IMPORT01',mongoObjectIdToUuid(legacyUser)),importedId=mongoObjectIdToUuid(legacyPatient);
  await insert(database.db,'patients',{id:importedId,user_id:imported.id,uid:imported.uid,first_name:'Imported',last_name:'Synthetic',updated_at:new Date()});tokens.set(imported.id,(await runtime.sessions.login(imported.email,password)).token);
  assert.equal((await api('/profile',{actor:imported})).body._id,importedId);
  await insert(database.db,'auth_legacy_links',{user_id:imported.id,mongo_user_id:legacyUser,patient_mongo_id:legacyPatient,source_fingerprint:'a'.repeat(64)});
  const profile=(await api('/profile',{actor:imported})).body;assert.equal(profile._id,legacyPatient);assert.equal(profile.id,legacyPatient);assert.equal(profile.internalId,importedId);assert.equal(profile.uid,imported.uid);
  const legacyDoctor='1234567890abcdef12345672',legacyHospital='1234567890abcdef12345673';
  const importedDoctorUser=await user('doctor','patient-imported-doctor@example.invalid','DOC-IMPORTED1'),importedAdmin=await user('hospital_admin','patient-imported-admin@example.invalid');
  const mappedDoctor=mongoObjectIdToUuid(legacyDoctor),mappedHospital=mongoObjectIdToUuid(legacyHospital);
  await insert(database.db,'doctors',{id:mappedDoctor,user_id:importedDoctorUser.id,uid:importedDoctorUser.uid,first_name:'Mapped',last_name:'Synthetic',specialization:'Synthetic',updated_at:new Date()});
  await insert(database.db,'hospitals',{id:mappedHospital,user_id:importedAdmin.id,uid:'HID-IMPORTED',name:'Synthetic Mapped Hospital',updated_at:new Date()});
  assert.equal((await api('/trusted-doctors/'+legacyDoctor,{method:'POST'})).status,404);assert.equal((await api('/trusted-hospitals/'+legacyHospital,{method:'POST'})).status,404);
  await insert(database.db,'auth_legacy_links',{user_id:importedDoctorUser.id,mongo_user_id:'1234567890abcdef12345674',doctor_mongo_id:legacyDoctor,source_fingerprint:'b'.repeat(64)});
  await insert(database.db,'auth_legacy_links',{user_id:importedAdmin.id,mongo_user_id:'1234567890abcdef12345675',hospital_mongo_id:legacyHospital,source_fingerprint:'c'.repeat(64)});
  assert.ok([200,201].includes((await api('/trusted-doctors/'+legacyDoctor,{method:'POST'})).status));assert.ok([200,201].includes((await api('/trusted-hospitals/'+legacyHospital,{method:'POST'})).status));
  const trusted=(await api('/trusted-providers')).body;assert.ok(trusted.doctors.some(row=>row.id===legacyDoctor));assert.ok(trusted.hospitals.some(row=>row.id===legacyHospital));
 });
 await check('trust confers zero private profile EHR consent access-grant or unrestricted database authority',async()=>{
  for(const actor of [doctorUser,admin,support,staff])assert.equal((await api('/profile',{actor})).status,403);
  for(const table of ['consents','access_grants','break_glass_events','encounters','clinical_notes','prescriptions','medical_documents','billing_records'])assert.equal((await database.db.query('SELECT count(*)::int n FROM '+table)).rows[0].n,0,table);
  const connection=await database.connect('mediid_runtime',credentials.mediid_runtime);
  try{
   for(const table of ['patients','patient_benefits','patient_trusted_doctors','patient_trusted_hospitals','encounters','clinical_notes','conditions','allergies','prescriptions','medical_documents','billing_records','appointment_payments','appointment_refunds','appointment_financial_events','research_requirements','submission_documents'])await denied(()=>connection.query('SELECT * FROM public.'+table+' LIMIT 0'));
   for(const sql of ["UPDATE patients SET first_name='Forbidden' WHERE false","UPDATE patient_benefits SET is_active=false WHERE false","DELETE FROM patient_trusted_doctors WHERE false","DELETE FROM patient_trusted_hospitals WHERE false","DELETE FROM _prisma_migrations WHERE false","CREATE TABLE public.phase24_forbidden(id int)","CREATE ROLE phase24_forbidden","SET ROLE mediid_migrator"])await denied(()=>connection.query(sql));
   assert.deepEqual((await connection.query("SELECT rolsuper,rolcreatedb,rolcreaterole,pg_has_role(current_user,'mediid_migrator','MEMBER') migrator FROM pg_roles WHERE rolname=current_user")).rows[0],{rolsuper:false,rolcreatedb:false,rolcreaterole:false,migrator:false});
   for(const sql of ['SELECT public.mediid_patient_scope($1::uuid,false)',"SELECT public.mediid_patient_profile_patch('{}'::jsonb)","SELECT public.mediid_patient_benefit_patch('{}'::jsonb)"])await denied(()=>connection.query(sql,sql.includes('$1')?[a.id]:[]));
  }finally{await connection.end();}
 });
 first=new PostgresInfrastructure(runtimeConfig({NODE_ENV:'test',PG_RUNTIME_URL:process.env.PG_RUNTIME_URL,PG_POOL_SIZE:'1'}));second=new PostgresInfrastructure(runtimeConfig({NODE_ENV:'test',PG_RUNTIME_URL:process.env.PG_RUNTIME_URL,PG_POOL_SIZE:'1'}));
 await first.start();await second.start();
 const isolated=infrastructure=>new Patients({...runtime,postgres:infrastructure},{...options,organizations:new Organizations({...runtime,postgres:infrastructure},{clientUrl:origin})});
 const serviceA=isolated(first),serviceB=isolated(second);
 await check('four races use independent size-one native PostgreSQL pools and distinct runtime backend PIDs',async()=>{
  const left=(await first.client.$queryRawUnsafe('SELECT pg_backend_pid() pid,current_user role'))[0],right=(await second.client.$queryRawUnsafe('SELECT pg_backend_pid() pid,current_user role'))[0];assert.notEqual(left.pid,right.pid);assert.equal(left.role,'mediid_runtime');assert.equal(right.role,'mediid_runtime');
 });
 await check('concurrent disjoint demographic patches preserve both fields and safe auth presentation',async()=>{
  await Promise.all([serviceA.updateProfile(a,{phone:'+910000000008'}),serviceB.updateProfile(a,{emergency:{emergencyContactName:'Concurrent Synthetic Contact',emergencyContactPhone:'+910000000009'}})]);
  const row=(await database.db.query('SELECT phone,emergency_contact_name,emergency_contact_phone FROM patients WHERE id=$1',[ownId])).rows[0];assert.deepEqual(row,{phone:'+910000000008',emergency_contact_name:'Concurrent Synthetic Contact',emergency_contact_phone:'+910000000009'});
  assert.equal((await runtime.sessions.me(await runtime.sessions.authenticate(tokens.get(a.id)))).profile.phone,'+910000000008');
 });
 await check('concurrent duplicate doctor trust has one canonical relationship',async()=>{
  await Promise.all([serviceA.setTrusted(a,'doctor',doctor,true),serviceB.setTrusted(a,'doctor',doctor,true)]);
  assert.equal((await database.db.query('SELECT count(*)::int n FROM patient_trusted_doctors WHERE patient_id=$1 AND doctor_id=$2',[ownId,doctor])).rows[0].n,1);
 });
 await check('concurrent duplicate hospital trust has one canonical relationship',async()=>{
  await Promise.all([serviceA.setTrusted(a,'hospital',hospital,true),serviceB.setTrusted(a,'hospital',hospital,true)]);
  assert.equal((await database.db.query('SELECT count(*)::int n FROM patient_trusted_hospitals WHERE patient_id=$1 AND hospital_id=$2',[ownId,hospital])).rows[0].n,1);
 });
 await check('concurrent benefit changes enforce ownership for both update and deactivation',async()=>{
  const results=await Promise.allSettled([serviceA.saveBenefit(a,{notes:'Concurrent Own Note'},government.id),serviceB.saveBenefit(b,{notes:'Forbidden Cross Note'},government.id),serviceB.removeBenefit(b,government.id)]);
  assert.equal(results[0].status,'fulfilled');assert.equal(results[1].status,'rejected');assert.equal(results[2].status,'rejected');
  assert.deepEqual((await database.db.query('SELECT patient_id,notes,is_active FROM patient_benefits WHERE id=$1',[government.id])).rows[0],{patient_id:ownId,notes:'Concurrent Own Note',is_active:true});
 });
 limiterA=new AuthLimits(limitConfig(env));limiterB=new AuthLimits(limitConfig(env));await limiterA.start();await limiterB.start();
 await check('independent Redis limiter and service instances share distributed hashed MID budgets',async()=>{
  const ratePatient=await user('patient','patient-rate@example.invalid','MID-RATE0001');await insert(database.db,'patients',{id:newPostgresId(),user_id:ratePatient.id,uid:ratePatient.uid,first_name:'Synthetic',last_name:'Rate',updated_at:new Date()});
  const limited=limits=>new Patients({...runtime,limits},{...options,scanPolicy:{windowMs:60000,sourceMax:100,identityMax:2}}),left=limited(limiterA),right=limited(limiterB);
  assert.equal((await left.scan(ratePatient.uid,'198.51.100.10')).uid,ratePatient.uid);assert.equal((await right.scan(ratePatient.uid,'198.51.100.11')).uid,ratePatient.uid);
  await assert.rejects(()=>left.scan(ratePatient.uid,'198.51.100.12'),code('PATIENT_RATE_LIMIT'));
  const sourceLimited=limits=>new Patients({...runtime,limits},{...options,scanPolicy:{windowMs:60000,sourceMax:2,identityMax:1000}}),networkA=sourceLimited(limiterA),networkB=sourceLimited(limiterB);
  await networkA.scan(a.uid,'203.0.113.99');await networkB.scan(b.uid,'203.0.113.99');await assert.rejects(()=>networkA.scan(ratePatient.uid,'203.0.113.99'),code('PATIENT_RATE_LIMIT'));
  const keys=await redis.admin.keys('mediid:auth:patientScan:*');assert.ok(keys.length>=2);for(const key of keys){assert.equal(key.includes(ratePatient.uid),false);assert.equal(key.includes('198.51.100.'),false);assert.match(key,/:[a-f0-9]{64}$/);}
 });
 await check('patient work creates no booking consultation clinical document or billing records',async()=>{
  for(const table of ['appointments','hospital_appointments','private_clinic_appointments','materialized_appointment_slots','appointment_slot_reservations','consultation_sessions','encounters','clinical_notes','conditions','allergies','prescriptions','medical_documents','billing_records'])assert.equal((await database.db.query('SELECT count(*)::int n FROM '+table)).rows[0].n,0,table);
 });
 await check('actual Redis outage fails public scans safely instead of disabling protection',async()=>{
  await redis.stop();const result=await api('/scan/'+a.uid,{actor:null});assert.equal(result.status,503);assert.equal(result.body.code,'PATIENT_UNAVAILABLE');
  for(const secret of [syntheticAadhaar,expectedDigest,process.env.PG_RUNTIME_URL,redis.url])assert.equal(JSON.stringify(result.body).includes(secret),false,'Safe temporary unavailable response.');
 });
 writeFileSync('.test-data/phase24-patients-results.json',JSON.stringify({status:'PASS',nativePostgres:true,independentRuntimeConnections:2,realRedis:true,passed:checks.length,checks})+'\n');
 console.log(JSON.stringify({suite:'phase24-patients',nativePostgres:true,passed:true,checks:checks.length}));
}finally{
 qr.toDataURL=originalQr;await Promise.all(servers.map(server=>new Promise(resolve=>server.close(resolve))));
 await limiterA?.stop();await limiterB?.stop();await first?.stop();await second?.stop();await runtime?.stop();await redis?.stop();await cluster?.stop();
}
