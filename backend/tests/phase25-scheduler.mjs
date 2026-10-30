import assert from 'node:assert/strict';
import {writeFileSync} from 'node:fs';
import {randomBytes,generateKeyPairSync} from 'node:crypto';
import {createRequire} from 'node:module';
import {appointmentFixture,delay} from './helpers/phase25-fixtures.mjs';
import {insert} from './helpers/review-fixtures.mjs';
const require=createRequire(import.meta.url);
const {startAuthRuntime}=require('../src/auth/runtime');
const {Organizations}=require('../src/organizations/services');
const {Appointments}=require('../src/appointments/services');
const {TestPaymentProvider}=require('../src/appointments/payments');
const {AppointmentScheduler,JOBS}=require('../src/appointments/scheduler');
const checks=[],notifications=[],schedulers=[];
let runtime;
const f=await appointmentFixture({redis:true}),{users:u,patients:p,doctors:d,hospitals:h,database:db}=f;
const query=(sql,args=[])=>db.db.query(sql,args),check=async(name,operation)=>{await operation();checks.push(name);console.log('PASS appointment scheduler: '+name);};
async function eventually(operation,message,timeout=15000){const end=Date.now()+timeout;let value;while(Date.now()<end){value=await operation();if(value)return value;await delay(100);}assert.fail(message);}
try{
 const keypair=generateKeyPairSync('rsa',{modulusLength:2048}),origin='https://scheduler-synthetic.invalid';
 const env={NODE_ENV:'test',AUTH_BACKEND:'postgres',CLIENT_URL:origin,AUTH_ALLOWED_ORIGINS:origin,AUTH_JWT_ISSUER:'scheduler-synthetic',AUTH_JWT_AUDIENCE:'scheduler-synthetic-api',AUTH_JWT_KEY_ID:'scheduler-test-key',AUTH_JWT_TTL_SECONDS:'900',AUTH_BCRYPT_COST:'12',AUTH_RESET_TTL_SECONDS:'900',AUTH_JWT_PRIVATE_KEY:keypair.privateKey.export({type:'pkcs8',format:'pem'}),AUTH_JWT_PUBLIC_KEY:keypair.publicKey.export({type:'spki',format:'pem'}),AUTH_REDIS_URL:f.redis.url,AUTH_RATE_KEY_SECRET:randomBytes(32).toString('hex'),SMTP_HOST:'127.0.0.1',SMTP_PORT:'587',SMTP_USER:'synthetic',SMTP_PASS:randomBytes(32).toString('hex'),SMTP_FROM:'test@example.invalid'};
 process.env.NODE_ENV='test';process.env.PG_RUNTIME_URL=db.url('mediid_runtime',f.credentials.mediid_runtime);
 runtime=await startAuthRuntime(env);
 const service=new Appointments(runtime,{organizations:new Organizations(runtime,{clientUrl:origin}),paymentProvider:new TestPaymentProvider(),delivery:{send:async message=>{notifications.push(message);return true;}},clientUrl:origin});
 const config={url:f.redis.url,namespace:'phase25-synthetic-'+randomBytes(6).toString('hex'),horizonDays:7,intervalMs:250,materializeIntervalMs:1000};
 const first=new AppointmentScheduler(service,config),second=new AppointmentScheduler(service,config);schedulers.push(first,second);
 await check('two BullMQ schedulers share real Redis readiness and deterministic repeat jobs',async()=>{
  await Promise.all([first.start(),second.start()]);assert.equal(first.state,'ready');assert.equal(second.state,'ready');
  const schedules=await first.queue.getJobSchedulers();assert.equal(schedules.length,JOBS.length);assert.equal(new Set(schedules.map(item=>item.key)).size,JOBS.length);
  await first.start();assert.equal((await first.queue.getJobSchedulers()).length,JOBS.length);
 });
 await check('real recurring BullMQ materialization creates one bounded canonical timezone-aware slot set',async()=>{
  const date=(await query("SELECT ((clock_timestamp() AT TIME ZONE 'Asia/Kolkata')::date+1)::text date")).rows[0].date,day=(await query("SELECT trim(to_char($1::date,'DAY')) weekday",[date])).rows[0].weekday;
  await insert(db.db,'recurring_availability_templates',{id:f.newId(),doctor_id:d.member.id,hospital_id:h.other.id,day_of_week:day,start_time:'08:00',end_time:'09:00',slot_duration:15,capacity_per_slot:2,channel:'ONLINE',timezone:'Asia/Kolkata',effective_from:date,effective_until:date,updated_at:new Date()});
  await eventually(async()=>(await query('SELECT count(*)::int n FROM materialized_appointment_slots WHERE doctor_id=$1 AND hospital_id=$2',[d.member.id,h.other.id])).rows[0].n===4,'BullMQ materializer did not generate the template.');
  await delay(1200);assert.equal((await query('SELECT count(*)::int n FROM materialized_appointment_slots WHERE doctor_id=$1 AND hospital_id=$2',[d.member.id,h.other.id])).rows[0].n,4);
 });
 let timeBased;
 await check('distributed TIME_BASED tick confirms once and creates exactly one future consultation window',async()=>{
  await f.command(u.admin,'policy',{hospitalId:h.hospital.id,confirmationMode:'TIME_BASED',depositRequired:false,confirmationLeadMinutes:40});
  const start=new Date(Date.now()+38*60000),slot=await f.slot({slot_start:start,slot_end:new Date(+start+900000)});timeBased=await f.book(u.patient0,slot);
  await eventually(async()=>(await query('SELECT status FROM hospital_appointments WHERE id=$1',[timeBased.id])).rows[0].status==='confirmed','BullMQ time confirmation did not finalize booking.');
  await Promise.all([first.queue.add('tick',{}, {jobId:'synthetic-tick-a'}),second.queue.add('tick',{}, {jobId:'synthetic-tick-b'})]);await delay(500);
  const windows=(await query('SELECT * FROM consultation_sessions WHERE hospital_appointment_id=$1',[timeBased.id])).rows;assert.equal(windows.length,1);assert.equal(windows[0].status,'scheduled');assert.equal(+windows[0].starts_at,+start-600000);
 });
 await check('hold expiry runs through BullMQ and reopens retained reservation capacity',async()=>{
  await f.command(u.admin,'policy',{hospitalId:h.hospital.id,confirmationMode:'DEPOSIT',depositRequired:true,depositPercentage:'50.00'});
  const start=new Date(Date.now()+602000),slot=await f.slot({slot_start:start,slot_end:new Date(+start+900000)}),booking=await f.book(u.patient0,slot);
  await eventually(async()=>(await query('SELECT status FROM hospital_appointments WHERE id=$1',[booking.id])).rows[0].status==='expired','BullMQ did not expire the held reservation.');
  const reservations=(await query('SELECT * FROM appointment_slot_reservations WHERE hospital_appointment_id=$1',[booking.id])).rows;assert.equal(reservations.length,1);assert.equal(reservations[0].status,'EXPIRED');
  const reopened=(await query('SELECT * FROM materialized_appointment_slots WHERE id=$1',[slot.id])).rows[0];assert.equal(reopened.state,'AVAILABLE');assert.equal(reopened.reopened_count,1);assert.ok(reopened.last_reopened_at);
 });
 await check('two real workers cannot duplicate an appointment reminder claim or leak patient metadata into queue jobs',async()=>{
  await Promise.all([first.queue.add('reminders',{}, {jobId:'synthetic-reminder-a'}),second.queue.add('reminders',{}, {jobId:'synthetic-reminder-b'})]);
  try{await eventually(()=>notifications.filter(item=>item.kind==='reminder'&&item.appointment.id===timeBased.id).length===1,'BullMQ reminder not delivered.');}catch(error){throw new Error(error.message+' Failed jobs: '+JSON.stringify((await first.queue.getFailed()).map(job=>({name:job.name,reason:job.failedReason})))+' Notifications: '+JSON.stringify(notifications.map(item=>({kind:item.kind,id:item.appointment.id}))));}
  await first.queue.add('reminders',{}, {jobId:'synthetic-reminder-c'});await delay(500);assert.equal(notifications.filter(item=>item.kind==='reminder'&&item.appointment.id===timeBased.id).length,1);
  const claims=(await query("SELECT count(*)::int n FROM appointment_notification_claims WHERE hospital_appointment_id=$1 AND kind='reminder'",[timeBased.id])).rows[0].n;assert.equal(claims,1);
  const keys=await f.redis.admin.keys('*');for(const key of keys)for(const secret of [timeBased.id,u.patient0.id,p.patient0.id,p.patient0.uid])assert.equal(key.includes(secret),false,'Redis key cannot contain unnecessary scheduling identity.');
  for(const job of await first.queue.getJobs(['wait','active','delayed','completed','failed'],0,100))assert.deepEqual(job.data,{});
 });
 await check('payment reconciliation and refunds are idempotent real BullMQ ledger operations',async()=>{
  const slot=await f.slot({hospital_id:h.clinic.id}),booking=await f.book(u.patient0,slot);
  const payment=await f.command(u.patient0,'paymentCreate',{id:booking.id,paymentId:f.newId(),idempotencyKey:'scheduler_'+f.newId(),provider:'test'});
  await eventually(async()=>(await query('SELECT status FROM appointment_payments WHERE id=$1',[payment.id])).rows[0].status==='CAPTURED','BullMQ reconciliation did not capture test payment.');
  assert.equal((await query('SELECT status FROM private_clinic_appointments WHERE id=$1',[booking.id])).rows[0].status,'confirmed');
  await f.command(u.doctor,'cancel',{id:booking.id});await eventually(async()=>(await query('SELECT status FROM appointment_refunds WHERE payment_id=$1',[payment.id])).rows[0]?.status==='SUCCEEDED','BullMQ refund did not settle provider cancellation.');
  await Promise.all([first.queue.add('refunds',{}, {jobId:'synthetic-refund-a'}),second.queue.add('refunds',{}, {jobId:'synthetic-refund-b'})]);await delay(500);
  const refunds=(await query('SELECT * FROM appointment_refunds WHERE payment_id=$1',[payment.id])).rows;assert.equal(refunds.length,1);assert.equal(refunds[0].amount,'250.55');assert.match(refunds[0].provider_transaction_ref,/^test_refund_/);
  assert.equal((await query('SELECT refund_allocated FROM appointment_payments WHERE id=$1',[payment.id])).rows[0].refund_allocated,'250.55');
 });
 await check('consultation window activates only at its start and cancellation invalidates the active window',async()=>{
  const start=new Date(Date.now()+8*60000),slot=await f.slot({doctor_id:d.member.id,hospital_id:h.clinic.id,slot_start:start,slot_end:new Date(+start+900000)}),booking=await f.book(u.member,slot,{patientId:p.patient1.id,appointmentChannel:'OFFLINE',bookingChannel:'PHONE'});
  await eventually(async()=>(await query('SELECT status FROM consultation_sessions WHERE private_clinic_appointment_id=$1',[booking.id])).rows[0]?.status==='active','Due consultation window never activated.');
  await f.command(u.member,'cancel',{id:booking.id});assert.equal((await query('SELECT status FROM consultation_sessions WHERE private_clinic_appointment_id=$1',[booking.id])).rows[0].status,'expired');
 });
 await check('real BullMQ consultation expiry closes the exact elapsed window',async()=>{
  const start=new Date(Date.now()-7200000+1000),booking=await insert(db.db,'hospital_appointments',{id:f.newId(),patient_id:p.patient2.id,doctor_id:d.member.id,hospital_id:h.other.id,appointment_date:start.toISOString().slice(0,10),time_slot:'synthetic historical window',slot_start_time:start,slot_end_time:new Date(+start+900000),legacy_source_id:f.newId().replaceAll('-','').slice(0,24),legacy_imported_at:new Date(),confirm_token:randomBytes(32).toString('hex'),status:'confirmed',updated_at:new Date()});
  const session=await insert(db.db,'consultation_sessions',{id:f.newId(),patient_id:p.patient2.id,doctor_id:d.member.id,hospital_id:h.other.id,hospital_appointment_id:booking.id,token:randomBytes(48).toString('hex'),status:'active',starts_at:new Date(+start-600000),expires_at:new Date(+start+7200000)});
  await eventually(async()=>(await query('SELECT status FROM consultation_sessions WHERE id=$1',[session.id])).rows[0].status==='expired','Elapsed consultation window never expired.');
 });
 await check('Redis outage marks both schedulers unavailable and public confirmation fails closed',async()=>{
  await f.redis.stop();await eventually(()=>first.state==='unavailable'&&second.state==='unavailable','Schedulers did not report Redis outage.',10000);
  await assert.rejects(()=>service.publicConfirm(randomBytes(32).toString('base64url'),'synthetic-source'),error=>error.code==='APPOINTMENT_UNAVAILABLE');
 });
 await check('scheduler shutdown closes workers queues and connections without memory fallback',async()=>{
  await Promise.all([first.stop(),second.stop()]);assert.equal(first.state,'stopped');assert.equal(second.state,'stopped');assert.equal(first.redis.status,'end');assert.equal(first.workerRedis.status,'end');
  const unavailable=new AppointmentScheduler(service,{...config,url:'redis://127.0.0.1:1/0'});schedulers.push(unavailable);
  await assert.rejects(()=>unavailable.start(),error=>error.code==='APPOINTMENT_UNAVAILABLE');assert.equal(unavailable.state,'stopped');assert.equal(Object.hasOwn(unavailable,'timers'),false);
 });
 writeFileSync('.test-data/phase25-scheduler-result.json',JSON.stringify({status:'PASS',checks,synthetic:true,redis:true,bullmq:true},null,2)+'\n');console.log('PASS Phase 2.5 BullMQ scheduler: '+checks.length+' checks.');
}finally{await Promise.allSettled(schedulers.map(scheduler=>scheduler.stop()));await runtime?.stop();await f.close();}
