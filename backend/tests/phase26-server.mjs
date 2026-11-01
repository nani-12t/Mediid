import assert from 'node:assert/strict';
import {writeFileSync} from 'node:fs';
import {spawn} from 'node:child_process';
import {randomBytes,generateKeyPairSync} from 'node:crypto';
import {createRequire} from 'node:module';
import net from 'node:net';
import path from 'node:path';
import {clinicalFixture,delay,documentInput,syntheticItems,allowed} from './helpers/phase26-fixtures.mjs';
const require=createRequire(import.meta.url),mongoose=require('mongoose'),{MongoMemoryServer}=require('mongodb-memory-server');
const checks=[],processes=new Set(),secrets=[],tokens=new Map();
const redact=value=>secrets.reduce((text,secret)=>text.replaceAll(secret,'[redacted]'),String(value));
const check=async(name,operation)=>{await operation();checks.push(name);console.log('PASS clinical server: '+name);};
async function freePort(){const lease=net.createServer();await new Promise(resolve=>lease.listen(0,'127.0.0.1',resolve));const port=lease.address().port;await new Promise(resolve=>lease.close(resolve));return port;}
function launch(env){const record={child:spawn(process.execPath,[path.resolve('server.js')],{env,cwd:process.cwd(),stdio:['ignore','pipe','pipe'],windowsHide:true}),output:''};const append=value=>{record.output=redact((record.output+value).slice(-50000));};record.child.stdout.on('data',append);record.child.stderr.on('data',append);processes.add(record);return record;}
async function ready(record){const end=Date.now()+60000;while(!record.output.includes('Server running on port')){if(record.child.exitCode!==null||Date.now()>end)throw new Error('Synthetic clinical server failed: '+redact(record.output));await delay(100);}}
async function stop(record){if(!record||record.child.exitCode!==null||record.child.signalCode!==null)return;const closed=new Promise(resolve=>record.child.once('close',resolve));record.child.kill();await Promise.race([closed,delay(5000)]);if(record.child.exitCode===null&&record.child.signalCode===null){record.child.kill('SIGKILL');await Promise.race([closed,delay(2000)]);}}
const f=await clinicalFixture({redis:true}),{users:u,patients:p,doctors:d,hospitals:h,database:db}=f;
let mongo,source;
try{
 mongo=await MongoMemoryServer.create({binary:{version:'7.0.30',downloadDir:path.resolve('.test-data/mongodb-binaries')},instance:{ip:'127.0.0.1'}});
 source=await mongoose.createConnection(mongo.getUri('phase26_http_synthetic'),{autoIndex:false}).asPromise();
 await source.collection('patients').insertOne({uid:p.patient0.uid,firstName:'Synthetic Mongo Only',medicalHistory:[{diagnosis:'Synthetic Mongo Clinical Sentinel'}],documents:[{title:'Synthetic Mongo Document Sentinel'}]});
 const pair=generateKeyPairSync('rsa',{modulusLength:2048}),origin='https://clinical-http-synthetic.invalid',env={};
 for(const key of ['PATH','Path','SystemRoot','WINDIR','TEMP','TMP','USERPROFILE'])if(process.env[key])env[key]=process.env[key];
 Object.assign(env,{
  NODE_ENV:'test',HOST:'127.0.0.1',PORT:String(await freePort()),AUTH_BACKEND:'postgres',ORGANIZATION_BACKEND:'postgres',PATIENT_BACKEND:'postgres',APPOINTMENT_BACKEND:'postgres',CLINICAL_BACKEND:'postgres',
  APPOINTMENT_PAYMENT_PROVIDER:'test',APPOINTMENT_NOTIFICATION_DELIVERY:'disabled',APPOINTMENT_REDIS_URL:f.redis.url,APPOINTMENT_SCHEDULER_INTERVAL_MS:'250',APPOINTMENT_MATERIALIZE_DAYS_AHEAD:'7',APPOINTMENT_CONFIRM_SOURCE_MAX:'1000',APPOINTMENT_CONFIRM_IDENTITY_MAX:'1000',APPOINTMENT_QUEUE_NAMESPACE:'phase26-http-'+randomBytes(6).toString('hex'),
  PATIENT_AADHAAR_HASH_KEY:randomBytes(32).toString('hex'),PATIENT_SCAN_SOURCE_MAX:'1000',PATIENT_SCAN_IDENTITY_MAX:'1000',
  MONGO_URI:mongo.getUri('phase26_http_synthetic'),MARKETPLACE_URI:mongo.getUri('phase26_marketplace_synthetic'),DOTENV_CONFIG_PATH:path.join(f.cluster.root,'absent.env'),PG_ENV_FILE:path.join(f.cluster.root,'absent.env'),
  PG_RUNTIME_URL:db.url('mediid_runtime',f.credentials.mediid_runtime),AUTH_REDIS_URL:f.redis.url,AUTH_RATE_KEY_SECRET:randomBytes(32).toString('hex'),
  AUTH_RATE_LOGIN_SOURCE_MAX:'1000',AUTH_RATE_LOGIN_IDENTITY_MAX:'100',AUTH_ALLOWED_ORIGINS:origin,CLIENT_URL:origin,AUTH_COOKIE_SAME_SITE:'lax',AUTH_JWT_ISSUER:'phase26-http-synthetic',AUTH_JWT_AUDIENCE:'phase26-http-api',AUTH_JWT_KEY_ID:'phase26-http-key',AUTH_JWT_TTL_SECONDS:'900',AUTH_BCRYPT_COST:'12',AUTH_RESET_TTL_SECONDS:'900',
  AUTH_JWT_PRIVATE_KEY:pair.privateKey.export({type:'pkcs8',format:'pem'}),AUTH_JWT_PUBLIC_KEY:pair.publicKey.export({type:'spki',format:'pem'}),
  SMTP_HOST:'127.0.0.1',SMTP_PORT:'587',SMTP_USER:'synthetic',SMTP_PASS:randomBytes(32).toString('hex'),SMTP_FROM:'synthetic@example.invalid',REDIS_HOST:'127.0.0.1',REDIS_PORT:'1'
 });
 secrets.push(f.password,f.hash,env.PG_RUNTIME_URL,f.redis.url,env.AUTH_JWT_PRIVATE_KEY,env.SMTP_PASS,env.AUTH_RATE_KEY_SECRET,env.PATIENT_AADHAAR_HASH_KEY,...Object.values(f.credentials));
 const main=launch(env);await ready(main);const base='http://127.0.0.1:'+env.PORT+'/api/',jar=new Map();
 async function api(route,{method='GET',body,actor='patient0',token,baseUrl=base,originValue=origin,withCookies=true}={}){
  const auth=token??tokens.get(actor),headers={...(originValue?{Origin:originValue}:{}),...(body===undefined?{}:{'Content-Type':'application/json'}),...(auth?{Authorization:'Bearer '+auth}:{}),...(withCookies&&jar.size?{Cookie:[...jar].map(([name,value])=>name+'='+value).join('; ')}:{})};
  if(method!=='GET'&&jar.has('mediid_csrf'))headers['X-Mediid-CSRF']=decodeURIComponent(jar.get('mediid_csrf'));
  const response=await fetch(baseUrl+route,{method,headers,...(body===undefined?{}:{body:JSON.stringify(body)}),signal:AbortSignal.timeout(20000)});
  for(const cookie of response.headers.getSetCookie()){const[entry]=cookie.split(';'),separator=entry.indexOf('=');jar.set(entry.slice(0,separator),entry.slice(separator+1));}
  const raw=await response.text();let data;try{data=JSON.parse(raw);}catch{data=raw;}if(typeof data?.token==='string')secrets.push(data.token);return{status:response.status,body:data,headers:response.headers};
 }
 const ok=(result,status=200)=>assert.equal(result.status,status,'Unexpected HTTP status: '+JSON.stringify(result.body));
 let care,encounter,rx,document;
 await check('actual server mounts one explicit PostgreSQL clinical stack and reviewed current sessions',async()=>{
  const config=await api('clinical/config',{actor:null,withCookies:false});ok(config);assert.deepEqual(config.body,{backend:'postgres'});assert.equal(config.headers.get('cache-control'),'no-store');
  ok(await api('auth/csrf',{actor:null}));for(const name of ['patient0','patient1','doctor','member','admin','otherAdmin','receptionist','otherReceptionist','nurse','lab','pharmacist','support','buyer','pharmacy']){const login=await api('auth/login',{method:'POST',actor:null,body:{email:u[name].email,password:f.password}});ok(login);tokens.set(name,login.body.token);}
  assert.equal((await api('doctor-portal/queue',{actor:null,withCookies:false})).status,401);
 });
 await check('real denied HTTP 403 leaves persisted denial audit after response completes',async()=>{
  const before=(await f.logs({actor:u.doctor,patient:p.patient10,status:'denied'})).length;
  const result=await api('doctor-portal/patient/'+p.patient10.uid,{actor:'doctor'});assert.equal(result.status,403);assert.equal(result.body.code,'CLINICAL_ACCESS_DENIED');assert.equal((await f.logs({actor:u.doctor,patient:p.patient10,status:'denied'})).length,before+1);
  assert.equal(JSON.stringify(result.body).includes(p.patient10.id),false);
 });
 await check('trusted consent grant and break-glass rows still deny actual doctor EHR HTTP access',async()=>{
  await db.db.query('INSERT INTO patient_trusted_doctors(patient_id,doctor_id) VALUES($1,$2)',[p.patient10.id,d.doctor.id]);
  await db.db.query("INSERT INTO consents(id,patient_id,grantee_type,grantee_id,scopes,purpose,status) VALUES($1,$2,'doctor',$3,ARRAY['vitals','prescriptions','documents'],'clinical_care','active')",[f.newId(),p.patient10.id,d.doctor.id]);
  await db.db.query("INSERT INTO access_grants(id,patient_id,doctor_id,hospital_id,purpose) VALUES($1,$2,$3,$4,'clinical_care')",[f.newId(),p.patient10.id,d.doctor.id,h.hospital.id]);
  await db.db.query("INSERT INTO break_glass_events(id,patient_id,triggered_by_id,doctor_id,emergency_reason) VALUES($1,$2,$3,$4,'Synthetic future workflow is inactive')",[f.newId(),p.patient10.id,u.doctor.id,d.doctor.id]);
  const before=(await f.logs({actor:u.doctor,patient:p.patient10,status:'denied'})).length,result=await api('doctor-portal/patient/'+p.patient10.uid,{actor:'doctor'});assert.equal(result.status,403);assert.equal(result.body.code,'CLINICAL_ACCESS_DENIED');assert.equal((await f.logs({actor:u.doctor,patient:p.patient10,status:'denied'})).length,before+1);
 });
 await check('unknown canonical patient UID returns safe HTTP403 and retains attributed patient-null audit',async()=>{
  const before=(await db.db.query("SELECT count(*)::int n FROM access_logs WHERE patient_id IS NULL AND accessed_by_id=$1",[u.doctor.id])).rows[0].n;
  const result=await api('doctor-portal/patient/MID-UNKNOWN0',{actor:'doctor'});assert.equal(result.status,403);assert.equal(result.body.code,'CLINICAL_ACCESS_DENIED');
  const rows=(await db.db.query("SELECT * FROM access_logs WHERE patient_id IS NULL AND accessed_by_id=$1 ORDER BY accessed_at DESC,id DESC",[u.doctor.id])).rows;assert.equal(rows.length,before+1);assert.equal(rows[0].doctor_id,d.doctor.id);assert.equal(rows[0].status,'denied');assert.equal(rows[0].access_basis,'NONE');
 });
 await check('doctor queue is scheduling-only and does not unlock early longitudinal EHR',async()=>{
  care=await f.care({offsetMs:660000});const queue=await api('doctor-portal/queue',{actor:'doctor'});ok(queue);
  const entries=Array.isArray(queue.body)?queue.body:queue.body.appointments||queue.body.items;assert.ok(Array.isArray(entries));assert.ok(entries.some(item=>item.appointmentId===care.booking.id||item.id===care.booking.id));
  const text=JSON.stringify(queue.body);for(const field of ['clinicalNotes','prescriptions','allergies','vitals'])assert.equal(text.includes('"'+field+'"'),false);assert.equal(text.includes(care.session.token),false);
  const locked=await api('doctor-portal/patient/'+p.patient0.uid,{actor:'doctor'});assert.equal(locked.status,403);assert.equal(locked.body.code,'CLINICAL_ACCESS_DENIED');
 });
 await check('hospital staff support buyer pharmacy and patient roles cannot impersonate doctor',async()=>{
  for(const name of ['admin','otherAdmin','receptionist','otherReceptionist','nurse','lab','pharmacist','support','buyer','pharmacy','patient0']){
   assert.equal((await api('doctor-portal/patient/'+p.patient0.uid,{actor:name})).status,403,name);
   assert.equal((await api('doctor-portal/encounters/start',{actor:name,method:'POST',body:{appointmentId:care.booking.id}})).status,403,name);
  }
 });
 await check('active HTTP consultation opens EHR and encounter start derives canonical context',async()=>{
  await f.command(u.receptionist,'cancel',{id:care.booking.id});care=await f.care();const ehr=await api('doctor-portal/patient/'+p.patient0.uid,{actor:'doctor'});ok(ehr);assert.equal(ehr.body.patient.uid,p.patient0.uid);assert.equal(ehr.body.consultation.appointmentId,care.booking.id);
  const started=await api('doctor-portal/encounters/start',{actor:'doctor',method:'POST',body:{appointmentId:care.booking.id}});assert.ok([200,201].includes(started.status),JSON.stringify(started.body));encounter=started.body;assert.ok(encounter.id);
  const repeat=await api('doctor-portal/encounters/start',{actor:'doctor',method:'POST',body:{appointmentId:care.booking.id}});assert.ok([200,201].includes(repeat.status));assert.equal(repeat.body.id,encounter.id);
  for(const field of ['patientId','doctorId','hospitalId','authorId','accessedById','sessionId'])assert.equal((await api('doctor-portal/encounters/start',{actor:'doctor',method:'POST',body:{appointmentId:care.booking.id,[field]:f.newId()}})).status,400,field);
 });
 await check('HTTP vitals SOAP conditions allergies and prescriptions are structured and validated',async()=>{
  const root='doctor-portal/encounters/'+encounter.id+'/';
  for(const [route,body]of [['vitals',{weightKg:'81.00',heightCm:'180.00',heartRate:70}],['notes',{noteType:'consultation',assessment:'Synthetic HTTP assessment',plan:'Synthetic HTTP plan'}],['conditions',{displayName:'Synthetic HTTP Condition',clinicalStatus:'active',verificationStatus:'confirmed'}],['allergies',{substance:'Synthetic HTTP Allergy',reaction:'Synthetic HTTP reaction',severity:'mild'}]]){
   const response=await api(root+route,{actor:'doctor',method:'POST',body});ok(response,201);assert.ok(response.body.id);
   assert.equal((await api(root+route,{actor:'doctor',method:'POST',body:{...body,patientId:p.patient1.id}})).status,400);
  }
  for(const body of [{heartRate:'fast'},{heartRate:-1},{spo2Percentage:101},{bmi:'1.00'},{temperatureCelsius:'Infinity'}])assert.equal((await api(root+'vitals',{actor:'doctor',method:'POST',body})).status,400);
  for(const body of [{noteType:'unsafe',assessment:'Synthetic'},{noteType:'progress'},{noteType:'progress',assessment:'x'.repeat(20001)},{noteType:'progress',assessment:'Synthetic',authorId:u.member.id}])assert.equal((await api(root+'notes',{actor:'doctor',method:'POST',body})).status,400);
  const dates=(await db.db.query("SELECT CURRENT_DATE::text today,(CURRENT_DATE+1)::text tomorrow")).rows[0],resolved=await api(root+'conditions',{actor:'doctor',method:'POST',body:{displayName:'Synthetic HTTP Resolved Condition',clinicalStatus:'resolved',diagnosedDate:'2026-01-01'}});ok(resolved,201);assert.equal(resolved.body.resolvedDate,dates.today);assert.equal((await api(root+'conditions',{actor:'doctor',method:'POST',body:{displayName:'Synthetic HTTP Future Condition',diagnosedDate:dates.tomorrow}})).status,400);
  const prescription=await api('doctor-portal/prescription',{actor:'doctor',method:'POST',body:{appointmentId:care.booking.id,encounterId:encounter.id,notes:'Synthetic HTTP prescription',items:syntheticItems()}});ok(prescription,201);rx=prescription.body;
  for(const body of [{appointmentId:care.booking.id,prescriptionText:'Synthetic free text only'},{appointmentId:care.booking.id,encounterId:encounter.id,items:[]},{appointmentId:care.booking.id,encounterId:encounter.id,items:[{...syntheticItems()[0],quantity:0}]},{appointmentId:care.booking.id,encounterId:encounter.id,items:syntheticItems(),doctorId:d.member.id}])assert.equal((await api('doctor-portal/prescription',{actor:'doctor',method:'POST',body})).status,400);
 });
 await check('cross-doctor group ownership and cross-patient identifiers fail through actual EHR routes',async()=>{
  const member=await f.care({patient:'patient1',doctor:'member',organization:'clinic'});ok(await api('doctor-portal/patient/'+p.patient1.uid,{actor:'member'}));assert.equal((await api('doctor-portal/patient/'+p.patient1.uid,{actor:'doctor'})).status,403);
  assert.equal((await api('doctor-portal/encounters/'+encounter.id+'/vitals',{actor:'member',method:'POST',body:{heartRate:70}})).status,403);
  assert.equal((await api('doctor-portal/patient/'+p.patient0.uid,{actor:'member'})).status,403);
  assert.equal((await api('clinical/me/encounters?patientId='+p.patient1.id)).status,400);
  assert.equal((await api('doctor-portal/patient/'+p.patient1.uid,{actor:'patient0'})).status,403);
  assert.equal(JSON.stringify(member).includes('Synthetic HTTP assessment'),false);
 });
 await check('patient self history and profile derive canonical clinical history while preserving demographic security',async()=>{
  const history=await api('clinical/me/encounters');ok(history);assert.equal(history.body.patient.uid,p.patient0.uid);assert.ok(history.body.encounters.some(item=>item.id===encounter.id));assert.ok(history.body.prescriptions.some(item=>item.id===rx.id));assert.ok(history.body.pagination);
  const profile=await api('patients/profile');ok(profile);assert.ok(profile.body.medicalHistory.length);assert.ok(JSON.stringify(profile.body.medicalHistory).includes('Synthetic HTTP Condition'));assert.deepEqual(profile.body.bills,[]);
  const text=JSON.stringify(profile.body);for(const forbidden of [f.hash,care.session.token,'Synthetic Mongo Clinical Sentinel','Synthetic Mongo Document Sentinel'])assert.equal(text.includes(forbidden),false);
  for(const key of ['aadhaarHash','aadhaar_hash','authVersion','password','refreshDigest','accessLogs'])assert.equal(text.includes('"'+key+'"'),false);
  const updated=await api('patients/profile',{method:'PUT',body:{emergency:{allergies:['Synthetic client mutation']}}});assert.equal(updated.status,400);
  const other=await api('clinical/me/encounters',{actor:'patient1'});ok(other);assert.ok(!other.body.encounters.some(item=>item.id===encounter.id));
 });
 await check('inconsistent historical patient and encounter foreign keys never leak through actual clinical reads',async()=>{
  const conditionId=f.newId(),prescriptionId=f.newId(),documentId=f.newId();
  await db.db.query("INSERT INTO conditions(id,patient_id,encounter_id,display_name) VALUES($1,$2,$3,'Synthetic mismatched HTTP Condition')",[conditionId,p.patient1.id,encounter.id]);
  await db.db.query("INSERT INTO prescriptions(id,patient_id,doctor_id,hospital_id,encounter_id,notes) VALUES($1,$2,$3,$4,$5,'Synthetic mismatched HTTP Prescription')",[prescriptionId,p.patient1.id,d.doctor.id,h.hospital.id,encounter.id]);
  await db.db.query("INSERT INTO prescription_items(id,prescription_id,medication_name,dosage,quantity) VALUES($1,$2,'Synthetic mismatched HTTP Medicine','Synthetic dose',1)",[f.newId(),prescriptionId]);
  await db.db.query("INSERT INTO medical_documents(id,patient_id,encounter_id,uploaded_by_user_id,type,title,file_url) VALUES($1,$2,$3,$4,'other','Synthetic mismatched HTTP Document','https://documents.example.invalid/mismatched.pdf')",[documentId,p.patient1.id,encounter.id,u.patient1.id]);
  for(const result of [await api('clinical/me/encounters'),await api('clinical/me/encounters',{actor:'patient1'}),await api('doctor-portal/patient/'+p.patient0.uid,{actor:'doctor'})]){ok(result);assert.equal(JSON.stringify(result.body).includes('Synthetic mismatched HTTP'),false);}
  for(const [table,id]of [['conditions',conditionId],['prescriptions',prescriptionId],['medical_documents',documentId]])assert.equal((await db.db.query('SELECT count(*)::int n FROM '+table+' WHERE id=$1',[id])).rows[0].n,1);
 });
 await check('patient HTTPS document metadata registration is safe self-owned and retained',async()=>{
  const result=await api('patients/documents',{method:'POST',body:documentInput()});ok(result,201);document=result.body;
  for(const fileUrl of ['data:application/pdf;base64,AA==','blob:https://example.invalid/file','file:///secret','javascript:alert(1)','http://example.invalid/file','https://user:pass@example.invalid/file'])assert.equal((await api('patients/documents',{method:'POST',body:{...documentInput(),fileUrl}})).status,400,fileUrl);
  for(const patch of [{encounterId:encounter.id},{patientId:p.patient1.id},{uploadedByUserId:u.patient1.id}])assert.equal((await api('patients/documents',{method:'POST',body:{...documentInput(),...patch}})).status,400);
  const ehr=await api('doctor-portal/patient/'+p.patient0.uid,{actor:'doctor'});ok(ehr);assert.ok(ehr.body.documents.some(item=>item.id===document.id));
  const other=await api('clinical/me/encounters',{actor:'patient1'});ok(other);assert.ok(!other.body.documents.some(item=>item.id===document.id));
  const removal=await api('patients/documents/'+document.id,{method:'DELETE',body:{}});assert.ok([404,405,503].includes(removal.status));assert.equal((await db.db.query('SELECT count(*)::int n FROM medical_documents WHERE id=$1',[document.id])).rows[0].n,1);
 });
 await check('public emergency scan does not expand to new clinical rows and later-phase boundaries remain closed',async()=>{
  const scan=await api('patients/scan/'+p.patient0.uid,{actor:null,withCookies:false});ok(scan);const text=JSON.stringify(scan.body);
  for(const marker of ['Synthetic HTTP Condition','Synthetic HTTP Allergy','Synthetic Medicine','Synthetic HTTP assessment',documentInput().title])assert.equal(text.includes(marker),false,marker);
  for(const key of ['allergies','conditions','prescriptions','documents','medicalHistory','clinicalNotes','vitals'])assert.equal(text.includes('"'+key+'"'),false,key);
  for(const [route,method]of [['patients/bills','GET'],['pharmacy-portal/prescription/'+p.patient0.uid,'GET'],['pharmacy-portal/dispense','POST']]){const result=await api(route,{actor:route.startsWith('patients')?'patient0':'pharmacy',method,...(method==='POST'?{body:{}}:{})});assert.equal(result.status,503);assert.equal(result.body.code,'AUTH_DOMAIN_NOT_MIGRATED');}
 });
 await check('operational encounter multiplicity returns actual HTTP409 while preserving denied audit and both retained records',async()=>{
  const record=await f.care({patient:'patient3'}),started=await api('doctor-portal/encounters/start',{actor:'doctor',method:'POST',body:{appointmentId:record.booking.id}});ok(started);
  await db.db.query("INSERT INTO encounters(id,patient_id,doctor_id,hospital_id,hospital_appointment_id,status) VALUES($1,$2,$3,$4,$5,'in_progress')",[f.newId(),record.patient.id,record.doctor.id,record.organization.id,record.booking.id]);
  const before=(await f.logs({actor:u.doctor,patient:p.patient3,status:'denied',action:'start_encounter'})).length,result=await api('doctor-portal/encounters/start',{actor:'doctor',method:'POST',body:{appointmentId:record.booking.id}});assert.equal(result.status,409);assert.equal(result.body.code,'CLINICAL_CONFLICT');
  const logs=await f.logs({actor:u.doctor,patient:p.patient3,status:'denied',action:'start_encounter'});assert.equal(logs.length,before+1);assert.equal(logs.at(-1).reason,'encounter_reconciliation_required');assert.equal((await db.db.query('SELECT count(*)::int n FROM encounters WHERE hospital_appointment_id=$1',[record.booking.id])).rows[0].n,2);
 });
 await check('inconsistent retained encounter lifecycle returns HTTP409 without silently repairing clinical history',async()=>{
  const record=await f.care({patient:'patient4'}),started=await api('doctor-portal/encounters/start',{actor:'doctor',method:'POST',body:{appointmentId:record.booking.id}});ok(started);const id=started.body.id;
  await db.db.query("UPDATE encounters SET status='completed',end_time=clock_timestamp() WHERE id=$1",[id]);let result=await api('doctor-portal/encounters/'+id+'/complete',{actor:'doctor',method:'POST',body:{}});assert.equal(result.status,409);assert.equal(result.body.code,'CLINICAL_CONFLICT');
  await db.db.query("UPDATE encounters SET status='in_progress',end_time=NULL WHERE id=$1",[id]);ok(await api('doctor-portal/encounters/'+id+'/complete',{actor:'doctor',method:'POST',body:{}}));await db.db.query("UPDATE encounters SET status='in_progress',end_time=NULL WHERE id=$1",[id]);
  result=await api('doctor-portal/encounters/'+id+'/complete',{actor:'doctor',method:'POST',body:{}});assert.equal(result.status,409);assert.equal(result.body.code,'CLINICAL_CONFLICT');const logs=await f.logs({actor:u.doctor,patient:p.patient4,status:'denied',action:'complete_encounter'});assert.equal(logs.length,2);assert.equal(logs.at(-1).resource_id,id);assert.equal((await db.db.query('SELECT status FROM encounters WHERE id=$1',[id])).rows[0].status,'in_progress');
 });
 await check('appointment completion is blocked during care and clinical completion preserves retained facts',async()=>{
  const scheduling=await api('appointments/'+care.booking.id+'/status',{actor:'receptionist',method:'PUT',body:{status:'completed'}});assert.equal(scheduling.status,409);
  const completed=await api('doctor-portal/encounters/'+encounter.id+'/complete',{actor:'doctor',method:'POST',body:{}});ok(completed);assert.equal(completed.body.status,'completed');assert.equal(JSON.stringify(completed.body).includes('Synthetic mismatched HTTP'),false);
  assert.equal((await api('doctor-portal/encounters/'+encounter.id+'/vitals',{actor:'doctor',method:'POST',body:{heartRate:70}})).status,403);
  const states=(await db.db.query('SELECT a.status appointment,s.status consultation FROM hospital_appointments a JOIN consultation_sessions s ON s.hospital_appointment_id=a.id WHERE a.id=$1',[care.booking.id])).rows[0];assert.equal(states.appointment,'completed');assert.equal(states.consultation,'completed');
  for(const table of ['billing_records','pharmacy_dispenses'])assert.equal((await db.db.query('SELECT count(*)::int n FROM '+table)).rows[0].n,0);
 });
 await check('current database role changes revoke stale signed doctor authority',async()=>{
  await db.db.query("UPDATE users SET role='support_agent' WHERE id=$1",[u.doctor.id]);const result=await api('doctor-portal/patient/'+p.patient1.uid,{actor:'doctor'});assert.ok([401,403].includes(result.status));await db.db.query("UPDATE users SET role='doctor' WHERE id=$1",[u.doctor.id]);
 });
 await check('invalid clinical backend and incompatible stack combinations fail real startup without fallback',async()=>{
  for(const settings of [{CLINICAL_BACKEND:undefined},{CLINICAL_BACKEND:'auto'},{CLINICAL_BACKEND:'POSTGRES'},{CLINICAL_BACKEND:'legacy'},{APPOINTMENT_BACKEND:'legacy'},{PATIENT_BACKEND:'legacy'},{AUTH_BACKEND:'legacy',ORGANIZATION_BACKEND:'legacy',PATIENT_BACKEND:'legacy',APPOINTMENT_BACKEND:'legacy'}]){
   const candidate={...env,...settings,PORT:String(await freePort())};for(const key of Object.keys(candidate))if(candidate[key]===undefined)delete candidate[key];const invalid=launch(candidate),end=Date.now()+45000;while(invalid.child.exitCode===null&&Date.now()<end)await delay(100);assert.equal(invalid.child.exitCode,1,'Invalid clinical configuration must exit: '+redact(invalid.output));assert.equal(invalid.output.includes('Server running on port'),false);await stop(invalid);
  }
 });
 await check('full explicit legacy stack remains isolated and PostgreSQL clinical operations never touch Mongo history',async()=>{
  const candidate={...env,PORT:String(await freePort()),AUTH_BACKEND:'legacy',ORGANIZATION_BACKEND:'legacy',PATIENT_BACKEND:'legacy',APPOINTMENT_BACKEND:'legacy',CLINICAL_BACKEND:'legacy'};const legacy=launch(candidate);await ready(legacy);const baseUrl='http://127.0.0.1:'+candidate.PORT+'/api/';const config=await api('clinical/config',{baseUrl,actor:null,withCookies:false});ok(config);assert.deepEqual(config.body,{backend:'legacy'});assert.equal((await api('doctor-portal/queue',{baseUrl,actor:null,withCookies:false})).status,401);await stop(legacy);
  const sourcePatient=await source.collection('patients').findOne({uid:p.patient0.uid});assert.equal(sourcePatient.medicalHistory[0].diagnosis,'Synthetic Mongo Clinical Sentinel');assert.equal(sourcePatient.documents.length,1);
 });
 await check('Redis outage cannot extend stale active consultation past authoritative database expiry',async()=>{
  const expired=await f.care({patient:'patient2',doctor:'member',organization:'other',offsetMs:-7200000});await db.db.query("UPDATE consultation_sessions SET status='active' WHERE id=$1",[expired.session.id]);await f.redis.stop();
  const decision=await f.read(u.member,'ehr',{patientUid:p.patient2.uid});assert.equal(decision.allowed,false);assert.ok(['consultation_expired','consultation_inactive','no_active_consultation'].includes(decision.reason));
  const result=await api('doctor-portal/patient/'+p.patient2.uid,{actor:'member'});assert.equal(result.status,403);assert.equal(result.body.code,'CLINICAL_ACCESS_DENIED');assert.equal(JSON.stringify(result.body).includes('Synthetic Mongo'),false);
 });
 await check('PostgreSQL outage returns safe unavailable errors without Mongo clinical fallback or payload logs',async()=>{
  await f.cluster.stop();const result=await api('doctor-portal/patient/'+p.patient0.uid,{actor:'doctor'});assert.equal(result.status,503);assert.equal(JSON.stringify(result.body).includes('Synthetic Mongo'),false);
  for(const secret of [...secrets,'Synthetic HTTP assessment','Synthetic HTTP plan','Synthetic HTTP Condition','Synthetic HTTP prescription']){assert.equal(JSON.stringify(result.body).includes(secret),false);for(const record of processes)assert.equal(record.output.includes(secret),false);}
 });
 writeFileSync('.test-data/phase26-server-result.json',JSON.stringify({status:'PASS',checks,synthetic:true,nativePostgres:true,actualServer:true,migrationChecksum:f.migrationChecksum},null,2)+'\n');console.log('PASS Phase 2.6 actual server: '+checks.length+' checks.');
}finally{await Promise.allSettled([...processes].map(stop));await source?.close();await mongo?.stop();await f.close();}
