import assert from 'node:assert/strict';
import {writeFileSync} from 'node:fs';
import {spawn} from 'node:child_process';
import {randomBytes,generateKeyPairSync} from 'node:crypto';
import {createRequire} from 'node:module';
import net from 'node:net';
import path from 'node:path';
import {appointmentFixture,delay,digest} from './helpers/phase25-fixtures.mjs';
const require=createRequire(import.meta.url),mongoose=require('mongoose'),{MongoMemoryServer}=require('mongodb-memory-server');
const checks=[],processes=new Set(),secrets=[],tokens=new Map();
const redact=value=>secrets.reduce((text,secret)=>text.replaceAll(secret,'[redacted]'),String(value));
const check=async(name,operation)=>{await operation();checks.push(name);console.log('PASS appointment server: '+name);};
async function freePort(){const lease=net.createServer();await new Promise(resolve=>lease.listen(0,'127.0.0.1',resolve));const port=lease.address().port;await new Promise(resolve=>lease.close(resolve));return port;}
function launch(env){
 const record={child:spawn(process.execPath,[path.resolve('server.js')],{env,cwd:process.cwd(),stdio:['ignore','pipe','pipe'],windowsHide:true}),output:''};
 const append=value=>{record.output=redact((record.output+value).slice(-40000));};record.child.stdout.on('data',append);record.child.stderr.on('data',append);processes.add(record);return record;
}
async function ready(record){const end=Date.now()+60000;while(!record.output.includes('Server running on port')){if(record.child.exitCode!==null||Date.now()>end)throw new Error('Synthetic appointment server failed: '+redact(record.output));await delay(100);}}
async function stop(record){
 if(!record||record.child.exitCode!==null||record.child.signalCode!==null)return;const closed=new Promise(resolve=>record.child.once('close',resolve));record.child.kill();await Promise.race([closed,delay(5000)]);
 if(record.child.exitCode===null&&record.child.signalCode===null){record.child.kill('SIGKILL');await Promise.race([closed,delay(2000)]);}
}
const f=await appointmentFixture({redis:true}),{users:u,patients:p,doctors:d,hospitals:h,database:db}=f;
let mongo,source;
try{
 mongo=await MongoMemoryServer.create({binary:{version:'7.0.30',downloadDir:path.resolve('.test-data/mongodb-binaries')},instance:{ip:'127.0.0.1'}});
 source=await mongoose.createConnection(mongo.getUri('phase25_http_synthetic'),{autoIndex:false}).asPromise();
 const mongoId=new mongoose.Types.ObjectId();await source.collection('appointments').insertOne({_id:mongoId,status:'confirmed',notes:'Synthetic Mongo Only Appointment'});
 const pair=generateKeyPairSync('rsa',{modulusLength:2048}),origin='https://appointments-http-synthetic.invalid',env={};
 for(const key of ['PATH','Path','SystemRoot','WINDIR','TEMP','TMP','USERPROFILE'])if(process.env[key])env[key]=process.env[key];
 Object.assign(env,{
  NODE_ENV:'test',HOST:'127.0.0.1',PORT:String(await freePort()),AUTH_BACKEND:'postgres',ORGANIZATION_BACKEND:'postgres',PATIENT_BACKEND:'postgres',APPOINTMENT_BACKEND:'postgres',
  APPOINTMENT_PAYMENT_PROVIDER:'test',APPOINTMENT_NOTIFICATION_DELIVERY:'disabled',APPOINTMENT_REDIS_URL:f.redis.url,APPOINTMENT_SCHEDULER_INTERVAL_MS:'250',APPOINTMENT_MATERIALIZE_DAYS_AHEAD:'7',APPOINTMENT_CONFIRM_SOURCE_MAX:'1000',APPOINTMENT_CONFIRM_IDENTITY_MAX:'1000',APPOINTMENT_QUEUE_NAMESPACE:'phase25-http-'+randomBytes(6).toString('hex'),
  PATIENT_AADHAAR_HASH_KEY:randomBytes(32).toString('hex'),PATIENT_SCAN_SOURCE_MAX:'1000',PATIENT_SCAN_IDENTITY_MAX:'1000',
  MONGO_URI:mongo.getUri('phase25_http_synthetic'),MARKETPLACE_URI:mongo.getUri('phase25_marketplace_synthetic'),DOTENV_CONFIG_PATH:path.join(f.cluster.root,'absent.env'),PG_ENV_FILE:path.join(f.cluster.root,'absent.env'),
  PG_RUNTIME_URL:db.url('mediid_runtime',f.credentials.mediid_runtime),AUTH_REDIS_URL:f.redis.url,AUTH_RATE_KEY_SECRET:randomBytes(32).toString('hex'),
  AUTH_RATE_LOGIN_SOURCE_MAX:'1000',AUTH_RATE_LOGIN_IDENTITY_MAX:'100',AUTH_ALLOWED_ORIGINS:origin,CLIENT_URL:origin,AUTH_COOKIE_SAME_SITE:'lax',AUTH_JWT_ISSUER:'phase25-http-synthetic',AUTH_JWT_AUDIENCE:'phase25-http-api',AUTH_JWT_KEY_ID:'phase25-http-key',AUTH_JWT_TTL_SECONDS:'900',AUTH_BCRYPT_COST:'12',AUTH_RESET_TTL_SECONDS:'900',
  AUTH_JWT_PRIVATE_KEY:pair.privateKey.export({type:'pkcs8',format:'pem'}),AUTH_JWT_PUBLIC_KEY:pair.publicKey.export({type:'spki',format:'pem'}),
  SMTP_HOST:'127.0.0.1',SMTP_PORT:'587',SMTP_USER:'synthetic',SMTP_PASS:randomBytes(32).toString('hex'),SMTP_FROM:'synthetic@example.invalid',REDIS_HOST:'127.0.0.1',REDIS_PORT:'1'
 });
 secrets.push(f.password,f.hash,env.PG_RUNTIME_URL,f.redis.url,env.AUTH_JWT_PRIVATE_KEY,env.SMTP_PASS,env.AUTH_RATE_KEY_SECRET,env.PATIENT_AADHAAR_HASH_KEY,...Object.values(f.credentials));
 const main=launch(env);await ready(main);const base='http://127.0.0.1:'+env.PORT+'/api/',jar=new Map();
 async function api(route,{method='GET',body,actor='patient0',token,baseUrl=base,originValue=origin,key,withCookies=true}={}){
  const auth=token??tokens.get(actor),headers={...(originValue?{Origin:originValue}:{}),...(body===undefined?{}:{'Content-Type':'application/json'}),...(auth?{Authorization:'Bearer '+auth}:{}),...(key?{'Idempotency-Key':key}:{}),...(withCookies&&jar.size?{Cookie:[...jar].map(([name,value])=>name+'='+value).join('; ')}:{})};
  if(method!=='GET'&&jar.has('mediid_csrf'))headers['X-Mediid-CSRF']=decodeURIComponent(jar.get('mediid_csrf'));
  const response=await fetch(baseUrl+route,{method,headers,...(body===undefined?{}:{body:JSON.stringify(body)}),signal:AbortSignal.timeout(20000)});
  for(const cookie of response.headers.getSetCookie()){const[entry]=cookie.split(';'),separator=entry.indexOf('=');jar.set(entry.slice(0,separator),entry.slice(separator+1));}
  const raw=await response.text();let data;try{data=JSON.parse(raw);}catch{data=raw;}if(typeof data?.token==='string')secrets.push(data.token);
  return{status:response.status,body:data,headers:response.headers};
 }
 const ok=(result,status=200)=>assert.equal(result.status,status,'Unexpected HTTP status: '+JSON.stringify(result.body));
 await check('actual server selects one PostgreSQL appointment backend and authenticates current reviewed sessions',async()=>{
  ok(await api('health'));const config=await api('appointments/config',{actor:null,withCookies:false});ok(config);assert.deepEqual(config.body,{backend:'postgres'});assert.equal(config.headers.get('cache-control'),'no-store');
  ok(await api('auth/csrf',{actor:null}));for(const name of ['patient0','patient1','doctor','member','admin','otherAdmin','receptionist','otherReceptionist','nurse','lab','pharmacist','support','unlinked']){
   const login=await api('auth/login',{method:'POST',actor:null,body:{email:u[name].email,password:f.password}});ok(login);tokens.set(name,login.body.token);
  }
  assert.equal((await api('appointments/my',{actor:null,withCookies:false})).status,401);
 });
 await check('mounted availability supports public discovery and exposes only online bookable remaining seats',async()=>{
  const slot=await f.materializedSlot({capacity:2}),offline=await f.materializedSlot({time:'16:30',channel:'OFFLINE'}),date=(await db.db.query("SELECT ($1::timestamptz AT TIME ZONE 'Asia/Kolkata')::date::text date",[slot.slot_start])).rows[0].date;
  const result=await api('appointments/availability?'+new URLSearchParams({doctorId:d.doctor.uid,hospitalId:h.hospital.uid,date}),{actor:null,withCookies:false});ok(result);assert.equal(result.body.find(item=>item.id===slot.id).remainingCapacity,2);assert.equal(result.body.find(item=>item.id===slot.id).timezone,'Asia/Kolkata');assert.equal(result.body.find(item=>item.id===slot.id).timeSlot,'16:00');assert.ok(!result.body.some(item=>item.id===offline.id));
  for(const item of result.body)for(const field of ['patient','actorUserId','reservations','payments','confirmToken','symptoms'])assert.equal(Object.hasOwn(item,field),false,field);
 });
 await check('actual HTTP availability uses New York 23:00 provider date and rejects a client timezone override',async()=>{
  const slot=await f.materializedSlot({timezone:'America/New_York',time:'23:00',dayOffset:2,doctor_id:d.member.id,hospital_id:h.other.id});
  assert.notEqual(slot.local_date,slot.india_date,'Actual HTTP fixture must cross provider/India calendar dates.');
  const input={doctorId:d.member.uid,hospitalId:h.other.uid,date:slot.local_date},route=values=>'appointments/availability?'+new URLSearchParams(values);
  const result=await api(route(input),{actor:null,withCookies:false});ok(result);const selected=result.body.find(item=>item.id===slot.id);
  assert.ok(selected,'HTTP provider-local date must return the New York slot.');assert.equal(selected.timezone,'America/New_York');assert.equal(selected.timeSlot,'23:00');
  assert.equal(+new Date(selected.slotStart),+slot.slot_start);assert.equal(+new Date(selected.slotEnd),+slot.slot_end);assert.equal(selected.remainingCapacity,1);
  assert.deepEqual(Object.keys(selected).sort(),['id','doctorId','hospitalId','slotStart','slotEnd','channel','capacity','remainingCapacity','timezone','timeSlot'].sort());
  const adjacent=await api(route({...input,date:slot.india_date}),{actor:null,withCookies:false});ok(adjacent);assert.ok(!adjacent.body.some(item=>item.id===slot.id));
  for(const timezone of ['Asia/Kolkata','America/New_York'])assert.equal((await api(route({...input,timezone}),{actor:null,withCookies:false})).status,400);
 });
 let clinicBooking,manualBooking,clinicPaymentKey;
 await check('mounted patient clinic booking and secure payment retain legacy DTO compatibility and deposit accounting',async()=>{
  const slot=await f.slot({hospital_id:h.clinic.id}),created=await api('appointments',{method:'POST',body:{slotId:slot.id,symptoms:'Synthetic Private Appointment Symptom',notes:'Synthetic Private Appointment Note'}});ok(created,201);clinicBooking=created.body;
  for(const field of ['_id','id','patient','doctor','hospital','appointmentDate','timeSlot','status','bookingMethod','preferredContactMethod','contactPhone','symptoms','notes','confirmationMethod','billAmount','billStatus','holdExpiresAt','paymentHoldStatus','depositAmount','rescheduleCount','createdAt','updatedAt'])assert.ok(Object.hasOwn(clinicBooking,field),field);
  assert.equal(Number(clinicBooking.depositAmount),250.55);assert.equal(clinicBooking.confirmToken,null);assert.equal(clinicBooking.status,'pending');
  const stored=(await db.db.query('SELECT confirm_token FROM private_clinic_appointments WHERE id=$1',[clinicBooking.id])).rows[0];assert.match(stored.confirm_token,/^[0-9a-f]{64}$/);assert.equal(JSON.stringify(clinicBooking).includes(stored.confirm_token),false);
  const key='http-pay-'+f.newId();clinicPaymentKey=key;const first=await api('appointments/'+clinicBooking.id+'/pay',{method:'PUT',key,body:{}});ok(first);const repeated=await api('appointments/'+clinicBooking.id+'/pay',{method:'PUT',key,body:{}});ok(repeated);assert.equal(first.body.appointment.status,'confirmed');assert.equal(first.body.appointment.billStatus,'deposit_paid');assert.equal(Number(first.body.appointment.amountPaid),250.55);
  assert.equal((await db.db.query('SELECT count(*)::int n FROM appointment_payments WHERE private_clinic_appointment_id=$1',[clinicBooking.id])).rows[0].n,1);
  for(const request of [{body:{}},{key:'another-'+f.newId(),body:{succeeded:true}},{key:'another-'+f.newId(),body:{billStatus:'paid'}}])assert.equal((await api('appointments/'+clinicBooking.id+'/pay',{method:'PUT',...request})).status,400);
 });
 await check('mounted patients own their unified lists and cannot inject patient actor money status or policy',async()=>{
  const mine=await api('appointments/my'),other=await api('appointments/my',{actor:'patient1'});ok(mine);ok(other);assert.ok(mine.body.some(item=>item.id===clinicBooking.id));assert.ok(!other.body.some(item=>item.id===clinicBooking.id));
  assert.equal((await api('appointments/'+clinicBooking.id,{actor:'patient1'})).status,403);
  const slot=await f.slot();for(const patch of [{patientId:p.patient1.id},{totalFee:'0.01'},{depositAmount:'0.00'},{status:'confirmed'},{policySnapshot:{}},{bookedByUserId:u.admin.id},{seatNumber:1}])assert.equal((await api('appointments',{method:'POST',body:{slotId:slot.id,...patch}})).status,400);
 });
 await check('MANUAL hospital confirmation requires same-hospital front desk despite patient acknowledgement and payment',async()=>{
  ok(await api('appointments/policies',{method:'PUT',actor:'admin',body:{hospitalId:h.hospital.id,confirmationMode:'MANUAL',depositRequired:true,depositPercentage:'25.00'}}));
  const slot=await f.slot(),created=await api('appointments',{method:'POST',body:{slotId:slot.id}});ok(created,201);manualBooking=created.body;
  const ack=await api('appointments/'+manualBooking.id+'/confirm',{method:'POST',body:{}});ok(ack);assert.equal(ack.body.status,'pending');
  const payment=await api('appointments/'+manualBooking.id+'/pay',{method:'PUT',key:'manual-'+f.newId(),body:{}});ok(payment);assert.equal(payment.body.appointment.status,'pending');
  for(const name of ['otherAdmin','otherReceptionist','nurse','lab','pharmacist','support','unlinked'])assert.equal((await api('appointments/'+manualBooking.id+'/status',{method:'PUT',actor:name,body:{status:'confirmed'}})).status,403,name);
  ok(await api('appointments/'+manualBooking.id+'/status',{method:'PUT',actor:'receptionist',body:{status:'confirmed'}}));ok(await api('appointments/'+manualBooking.id+'/check-in',{method:'POST',actor:'doctor',body:{}}));assert.equal((await api('doctors/'+d.doctor.id,{method:'DELETE',actor:'admin',body:{}})).status,409);
  assert.equal((await api('appointments/'+manualBooking.id+'/status',{method:'PUT',actor:'admin',body:{status:'confirmed',timeSlot:'12:00'}})).status,400);
  const count=await api('appointments/hospital/count',{actor:'receptionist'});ok(count);assert.equal(typeof count.body.pending,'number');
  assert.equal((await api('appointments/hospital?hospitalId='+h.other.id,{actor:'receptionist'})).status,403);
 });
 await check('group clinic owner and hospital receptionist cannot operate member practitioner appointments',async()=>{
  const slot=await f.slot({doctor_id:d.member.id,hospital_id:h.clinic.id}),created=await api('appointments',{method:'POST',body:{slotId:slot.id}});ok(created,201);const booking=created.body;
  assert.equal(booking.doctor._id,d.member.id);for(const name of ['doctor','receptionist','admin'])assert.equal((await api('appointments/'+booking.id,{actor:name})).status,403,name);
  const doctors=await api('appointments/doctor',{actor:'member'});ok(doctors);assert.ok(doctors.body.some(item=>item.id===booking.id));
  assert.equal((await api('appointments',{method:'POST',actor:'doctor',body:{slotId:slot.id,patientId:p.patient0.id,appointmentChannel:'OFFLINE',bookingChannel:'WALK_IN'}})).status,403);
  assert.equal((await api('hospitals/'+h.clinic.id+'/doctor-memberships/'+d.member.id,{method:'DELETE',actor:'doctor',body:{}})).status,409);ok(await api('appointments/'+booking.id,{method:'DELETE',actor:'member',body:{reason:'Synthetic provider cancellation'}}));
 });
 await check('support-assisted scheduling is attributable and returns scheduling-only metadata',async()=>{
  const slot=await f.slot(),created=await api('appointments',{method:'POST',actor:'support',body:{slotId:slot.id,patientId:p.patient1.uid,bookingChannel:'SUPPORT_ASSISTED',appointmentChannel:'ONLINE',symptoms:'Synthetic Support Private Symptom',notes:'Synthetic Support Private Note'}});ok(created,201);
  assert.equal(created.body.bookingChannel,'SUPPORT_ASSISTED');assert.equal(created.body.symptoms,null);assert.equal(created.body.notes,null);
  const read=await api('appointments/'+created.body.id,{actor:'support'});ok(read);for(const field of ['symptoms','notes'])assert.equal(read.body[field],null);
  const view=await api('appointments/support?patientId='+p.patient1.uid,{actor:'support'});ok(view);assert.ok(view.body.some(item=>item.id===created.body.id));
  assert.equal((await api('appointments/policies',{method:'PUT',actor:'support',body:{hospitalId:h.hospital.id,confirmationMode:'MANUAL'}})).status,403);
  assert.equal((await api('appointments/'+created.body.id+'/transfer-approval',{method:'POST',actor:'support',body:{}})).status,403);
  assert.equal((await api('appointments/'+created.body.id+'/status',{method:'PUT',actor:'support',body:{status:'confirmed'}})).status,403);
  ok(await api('appointments/'+created.body.id,{method:'DELETE',actor:'support',body:{reason:'Synthetic assisted cancellation'}}));
 });
 await check('public confirmation hashes secrets is single use and never bypasses MANUAL confirmation',async()=>{
  const raw=randomBytes(32).toString('base64url'),slot=await f.slot(),booking=await f.book(u.patient0,slot,{confirmationDigest:digest(raw)});secrets.push(raw);
  const first=await api('appointments/confirm/'+raw,{actor:null,withCookies:false});ok(first);assert.equal((await db.db.query('SELECT status FROM hospital_appointments WHERE id=$1',[booking.id])).rows[0].status,'pending');
  const replay=await api('appointments/confirm/'+raw,{actor:null,withCookies:false}),unknown=await api('appointments/confirm/'+randomBytes(32).toString('base64url'),{actor:null,withCookies:false});assert.equal(replay.status,404);assert.deepEqual(replay.body,unknown.body);
  const list=await api('appointments/my');assert.equal(JSON.stringify(list.body).includes(raw),false);assert.equal(JSON.stringify(list.body).includes(digest(raw)),false);
 });
 await check('mounted rescheduling preserves one active reservation and safe token handling',async()=>{
  const slot=await f.slot({hospital_id:h.clinic.id}),result=await api('appointments/'+clinicBooking.id+'/reschedule',{method:'POST',body:{slotId:slot.id}});ok(result);assert.equal(result.body.rescheduleCount,1);assert.ok(['pending','confirmed'].includes(result.body.status));assert.equal(result.body.confirmToken,null);assert.equal((await api('appointments/'+clinicBooking.id+'/pay',{method:'PUT',key:clinicPaymentKey,body:{}})).status,409);
  const rows=(await db.db.query('SELECT status FROM appointment_slot_reservations WHERE private_clinic_appointment_id=$1',[clinicBooking.id])).rows;assert.equal(rows.filter(item=>['HELD','CONFIRMED'].includes(item.status)).length,1);assert.equal(rows.filter(item=>item.status==='RELEASED').length,1);
 });
 await check('origin payload and deferred clinical boundaries remain closed in actual PostgreSQL server',async()=>{
  assert.equal((await api('appointments/'+clinicBooking.id+'/confirm',{method:'POST',originValue:'https://attacker.invalid',body:{}})).status,403);
  assert.equal((await api('appointments',{method:'POST',body:{notes:'x'.repeat(34000)}})).status,413);
  for(const route of ['doctor-portal/patient/MID-SYNTH000','doctor-portal/prescription','patients/bills']){
   const result=await api(route,{actor:route.startsWith('doctor')?'doctor':'patient0',method:route.endsWith('prescription')?'POST':'GET',...(route.endsWith('prescription')?{body:{}}:{})});assert.equal(result.status,503,route);assert.equal(result.body.code,'AUTH_DOMAIN_NOT_MIGRATED');
  }
  const socket=await fetch(base.replace('/api/','')+'/socket.io/?EIO=4&transport=polling',{signal:AbortSignal.timeout(10000)});assert.equal(socket.status,404);
 });
 await check('missing auto incompatible Redis and payment provider configurations fail actual server startup',async()=>{
  for(const settings of [{APPOINTMENT_BACKEND:undefined},{APPOINTMENT_BACKEND:'auto'},{PATIENT_BACKEND:'legacy'},{ORGANIZATION_BACKEND:'legacy',PATIENT_BACKEND:'legacy'},{APPOINTMENT_REDIS_URL:undefined},{APPOINTMENT_REDIS_URL:'redis://127.0.0.1:1/0'},{APPOINTMENT_PAYMENT_PROVIDER:'imaginary'},{APPOINTMENT_MATERIALIZE_DAYS_AHEAD:'6'}]){
   const candidate={...env,...settings,PORT:String(await freePort())};for(const key of Object.keys(candidate))if(candidate[key]===undefined)delete candidate[key];
   const invalid=launch(candidate),end=Date.now()+45000;while(invalid.child.exitCode===null&&Date.now()<end)await delay(100);
   assert.equal(invalid.child.exitCode,1,'Invalid appointment configuration must exit: '+redact(invalid.output));assert.equal(invalid.output.includes('Server running on port'),false);await stop(invalid);
  }
 });
 await check('two actual servers share hashed source and confirmation token rate limits',async()=>{
  const lowEnv={...env,PORT:String(await freePort()),APPOINTMENT_CONFIRM_IDENTITY_MAX:'2'},low=launch(lowEnv);await ready(low);
  const raw=randomBytes(32).toString('base64url');secrets.push(raw);assert.equal((await api('appointments/confirm/'+raw,{actor:null,withCookies:false})).status,404);
  const lowBase='http://127.0.0.1:'+lowEnv.PORT+'/api/';assert.equal((await api('appointments/confirm/'+raw,{actor:null,withCookies:false,baseUrl:lowBase})).status,404);
  const limited=await api('appointments/confirm/'+raw,{actor:null,withCookies:false,baseUrl:lowBase});assert.equal(limited.status,429);assert.ok(Number(limited.headers.get('retry-after'))>=1);
  for(const key of await f.redis.admin.keys('mediid:auth:appointmentConfirm:*')){assert.equal(key.includes(raw),false);assert.equal(key.includes(digest(raw)),false);assert.match(key,/:[a-f0-9]{64}$/);}
  await stop(low);
 });
 await check('explicit legacy mode remains mounted while PostgreSQL work leaves synthetic Mongo unchanged',async()=>{
  const candidate={...env,PORT:String(await freePort()),AUTH_BACKEND:'legacy',ORGANIZATION_BACKEND:'legacy',PATIENT_BACKEND:'legacy',APPOINTMENT_BACKEND:'legacy'};delete candidate.APPOINTMENT_REDIS_URL;delete candidate.APPOINTMENT_PAYMENT_PROVIDER;
  const legacy=launch(candidate);await ready(legacy);const legacyBase='http://127.0.0.1:'+candidate.PORT+'/api/';
  const config=await api('appointments/config',{baseUrl:legacyBase,actor:null,withCookies:false});ok(config);assert.deepEqual(config.body,{backend:'legacy'});
  assert.equal((await api('appointments/my',{baseUrl:legacyBase,actor:null,withCookies:false})).status,401);await stop(legacy);
  assert.equal(await source.collection('appointments').countDocuments(),1);assert.equal((await source.collection('appointments').findOne()).notes,'Synthetic Mongo Only Appointment');
  for(const table of ['appointments','billing_records','encounters','prescriptions','access_grants'])assert.equal((await db.db.query('SELECT count(*)::int n FROM '+table)).rows[0].n,0,table);
  for(const record of processes)for(const secret of ['Synthetic Private Appointment Symptom','Synthetic Private Appointment Note','Synthetic Support Private Symptom','Synthetic Support Private Note'])assert.equal(record.output.includes(secret),false);
 });
 await check('actual Redis outage fails confirmation and actual PostgreSQL outage has no Mongo appointment fallback',async()=>{
  await f.redis.stop();const confirm=await api('appointments/confirm/'+randomBytes(32).toString('base64url'),{actor:null,withCookies:false});assert.equal(confirm.status,503);assert.equal(confirm.body.code,'APPOINTMENT_UNAVAILABLE');
  await f.cluster.stop();const result=await api('appointments/my');assert.equal(result.status,503);assert.ok(['APPOINTMENT_UNAVAILABLE','AUTH_UNAVAILABLE'].includes(result.body.code));assert.equal(JSON.stringify(result.body).includes('Mongo Only'),false);
 });
 writeFileSync('.test-data/phase25-server-result.json',JSON.stringify({status:'PASS',actualServer:true,checks,postgres:'native',redis:'real',mongo:'disposable synthetic'},null,2)+'\n');console.log('PASS Phase 2.5 actual server: '+checks.length+' checks.');
}finally{await Promise.allSettled([...processes].map(stop));await source?.close();await mongo?.stop();await f.close();}
