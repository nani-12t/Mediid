import { PGlite } from '@electric-sql/pglite';
import { vector } from '@electric-sql/pglite/vector';
import { btree_gist } from '@electric-sql/pglite/contrib/btree_gist';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import assert from 'node:assert/strict';
const db = new PGlite({ extensions: { vector, btree_gist } });
const results=[];
async function check(name,fn){ await fn(); results.push(name); console.log('PASS: '+name); }
const id=()=>randomUUID();
const q=(sql,args=[])=>db.query(sql,args);
async function insert(table, data) {
 const keys=Object.keys(data);
 const rows=await q('INSERT INTO '+table+' ('+keys.map(k=>'"'+k+'"').join(',')+') VALUES ('+keys.map((_,i)=>'$'+(i+1)).join(',')+') RETURNING *',Object.values(data));
 return rows.rows[0];
}
async function fail(fn,code='23514'){ await assert.rejects(fn, error=>{ assert.equal(error.code,code,error.message); return true; }); }
const plus=(date,minutes)=>new Date(+date+minutes*60000).toISOString();
const start=new Date(Date.now()+24*60*60000);
let doctor,otherDoctor,hospital,otherHospital,patient,actor;
async function slot(extra={}){ return insert('materialized_appointment_slots',{id:id(),doctor_id:doctor,hospital_id:hospital,slot_start:plus(start,0),slot_end:plus(start,30),updated_at:new Date(),...extra}); }
async function booking(s,domain='hospital',extra={},seat=1,reservationState='CONFIRMED'){
 const table=domain==='hospital'?'hospital_appointments':'private_clinic_appointments';
 return db.transaction(async tx=>{
  const query=(sql,args=[])=>tx.query(sql,args);
  const data={id:id(),patient_id:patient,doctor_id:s.doctor_id,[domain==='hospital'?'hospital_id':'clinic_hospital_id']:s.hospital_id,
   slot_id:s.id,appointment_date:plus(start,0).slice(0,10),time_slot:'synthetic',slot_start_time:s.slot_start,slot_end_time:s.slot_end,
   booking_channel:'WALK_IN',appointment_channel:'OFFLINE',policy_snapshot:{},confirm_token:id(),updated_at:new Date(),...(domain==='clinic'?{deposit_amount:'250.00'}:{}),...extra};
  const keys=Object.keys(data);
  const b=(await query('INSERT INTO '+table+' ('+keys.map(k=>'"'+k+'"').join(',')+') VALUES ('+keys.map((_,i)=>'$'+(i+1)).join(',')+') RETURNING *',Object.values(data))).rows[0];
  await query('INSERT INTO appointment_slot_reservations(id,slot_id,'+(domain==='hospital'?'hospital_appointment_id':'private_clinic_appointment_id')+',actor_user_id,seat_number,status,expires_at) VALUES($1,$2,$3,$4,$5,$6,$7)',[id(),s.id,b.id,actor,seat,reservationState,reservationState==='HELD'?b.hold_expires_at:null]);
  return b;
 });
}
async function payment(b,extra={}) {return insert('appointment_payments',{id:id(),hospital_appointment_id:b.id,actor_user_id:actor,amount:'100.00',currency:'INR',provider:'synthetic',provider_transaction_ref:id(),idempotency_key:id(),status:'CAPTURED',captured_at:new Date(),...extra});}
async function refund(p,extra={}) {return insert('appointment_refunds',{id:id(),payment_id:p.id,hospital_appointment_id:p.hospital_appointment_id,private_clinic_appointment_id:p.private_clinic_appointment_id,actor_user_id:actor,amount:'25.00',currency:'INR',provider:'synthetic',idempotency_key:id(),...extra});}
try {
 for(const file of ['../prisma/migrations/202610190001_phase131_baseline/migration.sql','../prisma/migrations/202610190002_phase131_constraints/migration.sql','../prisma/migrations/202610200001_phase131_review/migration.sql']) await db.exec(readFileSync(new URL(file,import.meta.url),'utf8'));
 assert.equal(readFileSync(new URL('../prisma/constraints.sql',import.meta.url),'utf8'),readFileSync(new URL('../prisma/migrations/202610190002_phase131_constraints/migration.sql',import.meta.url),'utf8'));
 actor=id();await insert('users',{id:actor,email:'synthetic@example.invalid',password_hash:'not-a-real-credential',role:'patient',updated_at:new Date()});
 const admin=id();await insert('users',{id:admin,email:'admin@example.invalid',password_hash:'synthetic',role:'hospital_admin',updated_at:new Date()});
 hospital=id();await insert('hospitals',{id:hospital,user_id:admin,uid:'HID-SYNTHETIC',name:'Synthetic hospital',updated_at:new Date()});
 const admin2=id();await insert('users',{id:admin2,email:'admin2@example.invalid',password_hash:'synthetic',role:'hospital_admin',updated_at:new Date()});
 otherHospital=id();await insert('hospitals',{id:otherHospital,user_id:admin2,uid:'HID-SYNTHETIC2',name:'Synthetic hospital2',updated_at:new Date()});
 doctor=id();otherDoctor=id();
 for(const d of [doctor,otherDoctor]) await insert('doctors',{id:d,uid:'DOC-'+d,first_name:'Synthetic',last_name:'Doctor',specialization:'Test',updated_at:new Date()});
 patient=id();await insert('patients',{id:patient,user_id:actor,uid:'MID-SYNTHETIC',first_name:'Synthetic',last_name:'Patient',updated_at:new Date()});
 let s,b1,b2,p;
 await check('overlapping active doctor slots rejected across provider contexts',async()=>{s=await slot({capacity:2});await fail(()=>slot({hospital_id:null,slot_start:plus(start,10),slot_end:plus(start,40)}),'23P01');});
 await check('adjacent slots accepted with half-open ranges',async()=>{await slot({slot_start:plus(start,30),slot_end:plus(start,60)});});
 await check('invalid slot ranges and capacity rejected',async()=>{await fail(()=>slot({doctor_id:otherDoctor,slot_start:plus(start,30),slot_end:plus(start,0)}));await fail(()=>slot({doctor_id:otherDoctor,capacity:0}));});
 await check('hospital and clinic share capacity without exceeding it',async()=>{b1=await booking(s);b2=await booking(s,'clinic',{},2);await fail(()=>booking(s,'clinic',{},3));await fail(()=>booking(s,'clinic',{},2),'23505');});
 await check('wrong doctor, hospital context, and slot times rejected',async()=>{await fail(()=>booking(s,'hospital',{doctor_id:otherDoctor}));await fail(()=>booking(s,'hospital',{hospital_id:otherHospital}));await fail(()=>booking(s,'clinic',{clinic_hospital_id:null}));await fail(()=>booking(s,'hospital',{slot_end_time:plus(start,90)}));});
 await check('operational booking without reservation rejected at commit',async()=>{await fail(()=>insert('hospital_appointments',{id:id(),patient_id:patient,doctor_id:doctor,hospital_id:hospital,slot_id:s.id,appointment_date:'2030-01-01',time_slot:'test',slot_start_time:s.slot_start,slot_end_time:s.slot_end,booking_channel:'WALK_IN',appointment_channel:'OFFLINE',policy_snapshot:{},confirm_token:id(),updated_at:new Date()}));});
 await check('support-assisted actions require attributable actors',async()=>{await fail(()=>booking(s,'hospital',{booking_channel:'SUPPORT_ASSISTED'}));});
 await check('encounters allow direct care but never multiple domains',async()=>{const data={id:id(),patient_id:patient,doctor_id:doctor};await insert('encounters',data);await fail(()=>insert('encounters',{...data,id:id(),hospital_appointment_id:b1.id,private_clinic_appointment_id:b2.id}));});
 await check('payment idempotency and multiple attempts',async()=>{p=await payment(b1);await fail(()=>payment(b1,{idempotency_key:p.idempotency_key}),'23505');await payment(b1,{status:'FAILED',captured_at:null});});
 await check('refund idempotency and partial refunds',async()=>{const r=await refund(p);await fail(()=>refund(p,{idempotency_key:r.idempotency_key}),'23505');await refund(p,{amount:'20.00'});});
 await check('pending refunds reserve budget and cannot exceed capture',async()=>{await fail(()=>refund(p,{amount:'55.01'}));await refund(p,{amount:'55.00'});await fail(()=>refund(p,{amount:'0.01'}));});
 await check('refund ownership, currency and successful capture required',async()=>{await fail(()=>refund(p,{hospital_appointment_id:null,private_clinic_appointment_id:b2.id}));await fail(()=>refund(p,{currency:'USD'}));const pending=await payment(b1,{status:'CREATED',captured_at:null});await fail(()=>refund(pending));});
 await check('immutable financial identity, retained events and history',async()=>{await fail(()=>q('UPDATE appointment_payments SET amount=1 WHERE id=$1',[p.id]));await fail(()=>q('DELETE FROM appointment_payments WHERE id=$1',[p.id]));await fail(()=>q('UPDATE appointment_payments SET refund_allocated=0 WHERE id=$1',[p.id]));await fail(()=>q('DELETE FROM appointment_financial_events'));assert.ok((await q('SELECT count(*)::int AS n FROM appointment_financial_events')).rows[0].n>=5);});
 await check('cancellation releases only its reservation while refunds stay pending',async()=>{await q("UPDATE hospital_appointments SET status='cancelled' WHERE id=$1",[b1.id]);const rows=(await q('SELECT status::text AS status FROM appointment_slot_reservations WHERE slot_id=$1 ORDER BY seat_number',[s.id])).rows;assert.deepEqual(rows.map(x=>x.status),['RELEASED','CONFIRMED']);assert.equal((await q("SELECT count(*)::int n FROM appointment_refunds WHERE status='REQUESTED'")).rows[0].n,3);});
 await check('late payment does not reclaim capacity reassigned to another booking',async()=>{const replacement=await booking(s,'hospital',{},1);const late=await payment(b1);assert.equal(late.status,'CAPTURED');await fail(()=>q("UPDATE appointment_slot_reservations SET status='CONFIRMED',released_at=NULL WHERE hospital_appointment_id=$1",[b1.id]));assert.equal((await q("SELECT hospital_appointment_id FROM appointment_slot_reservations WHERE slot_id=$1 AND seat_number=1 AND status='CONFIRMED'",[s.id])).rows[0].hospital_appointment_id,replacement.id);});
 await check('deadline boundary examples and positive holds',async()=>{for(const [bookingTime,wanted] of [['13:20','13:50'],['13:43','13:48'],['13:48','13:50'],['13:50',null]]) {const r=(await q('SELECT appointment_payment_deadline($1::timestamptz,$2::timestamptz) AS deadline',['2030-01-01T14:00:00Z','2030-01-01T'+bookingTime+':00Z'])).rows[0].deadline;assert.equal(r?new Date(r).toISOString().slice(11,16):null,wanted);}await fail(()=>q('SELECT appointment_payment_deadline(now(),now(),0)'));});
 await check('provider policy defaults and numeric bounds',async()=>{const policy=await insert('hospital_scheduling_rules',{id:id(),hospital_id:hospital,updated_at:new Date()});assert.equal(policy.payment_hold_window_minutes,60);assert.equal(policy.safety_cutoff_minutes,10);assert.equal(policy.fast_confirm_threshold_minutes,20);assert.equal(policy.fast_confirm_window_minutes,5);assert.equal(policy.minimum_online_lead_minutes,10);assert.equal(policy.confirmation_lead_minutes,40);await fail(()=>q('UPDATE hospital_scheduling_rules SET provider_refund_percentage=50 WHERE id=$1',[policy.id]));});
 await check('occupied slots retain context and capacity',async()=>{await fail(()=>q('UPDATE materialized_appointment_slots SET capacity=1 WHERE id=$1',[s.id]));await fail(()=>q('UPDATE materialized_appointment_slots SET doctor_id=$1 WHERE id=$2',[otherDoctor,s.id]));});
 await check('explicit online/offline channel is independent from booking source',async()=>{
  const online=await slot({doctor_id:otherDoctor,slot_start:plus(start,90),slot_end:plus(start,120),channel:'ONLINE'});
  await fail(()=>booking(online,'hospital',{},1));
  await booking(online,'hospital',{booking_channel:'SUPPORT_ASSISTED',appointment_channel:'ONLINE',booked_by_user_id:actor,handled_by_user_id:actor},1);
 });
 await check('real online booking uses authoritative deadline and prevents late booking',async()=>{
  const online=await slot({doctor_id:otherDoctor,slot_start:plus(start,120),slot_end:plus(start,150)});
  const b=await booking(online,'hospital',{appointment_channel:'ONLINE',payment_hold_status:'HELD'});
  const computed=(await q('SELECT appointment_payment_deadline($1::timestamptz,$2::timestamptz) d',[online.slot_start,b.booked_at])).rows[0].d;
  assert.equal(new Date(b.hold_expires_at).toISOString(),new Date(computed).toISOString());
  const late=await slot({doctor_id:otherDoctor,slot_start:plus(new Date(),5),slot_end:plus(new Date(),10)});
  await fail(()=>booking(late,'hospital',{appointment_channel:'ONLINE'}));
 });
 await check('online clinic deposit is exactly 50 percent',async()=>{
  const online=await slot({doctor_id:otherDoctor,slot_start:plus(start,150),slot_end:plus(start,180)});
  await fail(()=>booking(online,'clinic',{appointment_channel:'ONLINE',deposit_amount:'100.00'}));
  await booking(online,'clinic',{appointment_channel:'ONLINE',deposit_amount:'250.00'});
 });
 await check('patient consent required for transfer and refund is default',async()=>{
  await fail(()=>q("UPDATE private_clinic_appointments SET refund_resolution='PATIENT_APPROVED_TRANSFER' WHERE id=$1",[b2.id]));
  assert.equal(b2.refund_resolution,'REFUND');
  await q("UPDATE private_clinic_appointments SET refund_resolution='PATIENT_APPROVED_TRANSFER',transfer_approved_by_user_id=$1,transfer_approved_at=now() WHERE id=$2",[actor,b2.id]);
 });
 await check('refund failures release budget without losing immutable event history',async()=>{
  const p2=await payment(b1);
  const r=await refund(p2,{amount:'100.00'});
  await q("UPDATE appointment_refunds SET status='FAILED' WHERE id=$1",[r.id]);
  await refund(p2,{amount:'100.00'});
  await fail(()=>q("UPDATE appointment_refunds SET status='REQUESTED' WHERE id=$1",[r.id]));
 });
 await check('retention blocks bulk deletion and forged financial audit inserts',async()=>{
  await fail(()=>q('TRUNCATE appointment_financial_events'));
  await fail(()=>insert('appointment_financial_events',{payment_id:p.id,after:{synthetic:'forged'}}));
 });
 await check('migration provenance cannot be partially supplied',async()=>{
  await fail(()=>booking(s,'hospital',{legacy_imported_at:new Date()},1));
 });
 await check('expired payment hold cannot confirm or reclaim a reassigned seat',async()=>{
  const heldSlot=await slot({doctor_id:otherDoctor,slot_start:plus(start,180),slot_end:plus(start,210)});
  const held=await booking(heldSlot,'hospital',{payment_hold_status:'HELD',hold_expires_at:new Date(Date.now()+2500)},1,'HELD');
  await new Promise(resolve=>setTimeout(resolve,Math.max(0,+new Date(held.hold_expires_at)-Date.now()+50)));
  await fail(()=>q("UPDATE appointment_slot_reservations SET status='CONFIRMED' WHERE hospital_appointment_id=$1",[held.id]));
  await q("UPDATE hospital_appointments SET status='expired' WHERE id=$1",[held.id]);
  const assigned=await booking(heldSlot);
  await payment(held);
  await fail(()=>q("UPDATE appointment_slot_reservations SET status='CONFIRMED',released_at=NULL WHERE hospital_appointment_id=$1",[held.id]));
  assert.equal((await q("SELECT hospital_appointment_id FROM appointment_slot_reservations WHERE slot_id=$1 AND status='CONFIRMED'",[heldSlot.id])).rows[0].hospital_appointment_id,assigned.id);
 });
 await check('financial numeric bounds and single-domain ownership',async()=>{
  await fail(()=>payment(b1,{amount:'NaN'}));
  await fail(()=>payment(b1,{amount:'0.00'}));
  await fail(()=>payment(b1,{private_clinic_appointment_id:b2.id}));
  await fail(()=>payment(b1,{provider_transaction_ref:null}));
 });
 mkdirSync(new URL('../test-results/',import.meta.url),{recursive:true});
 writeFileSync(new URL('../test-results/phase131-postgres.json',import.meta.url),JSON.stringify({engine:(await q('SELECT version()')).rows[0].version,passed:results.length,checks:results,synthetic:true,productionAccess:false},null,2)+'\n');
 console.log(results.length+' PostgreSQL checks passed.');
} catch(error) { console.error('FAIL:', error.message, error.code || '', error.where || ''); process.exitCode=1; } finally { await db.close(); }
