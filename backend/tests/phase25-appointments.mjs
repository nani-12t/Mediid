import assert from 'node:assert/strict';
import {writeFileSync} from 'node:fs';
import {randomBytes} from 'node:crypto';
import {appointmentFixture,delay,digest} from './helpers/phase25-fixtures.mjs';
import {insert} from './helpers/review-fixtures.mjs';
const checks=[],races=[];
const check=async(name,operation)=>{await operation();checks.push(name);console.log('PASS appointments: '+name);};
const rejected=operation=>assert.rejects(operation,error=>error.code==='P0001'||['23514','23505','23P01','42501'].includes(error.code));
const f=await appointmentFixture(),{database:db,users:u,patients:p,doctors:d,hospitals:h,connections:c}=f;
const query=(sql,args=[])=>db.db.query(sql,args);
const row=async id=>(await query('SELECT to_jsonb(a) data FROM hospital_appointments a WHERE id=$1 UNION ALL SELECT to_jsonb(a) FROM private_clinic_appointments a WHERE id=$1',[id])).rows[0]?.data;
const reservations=async id=>(await query('SELECT * FROM appointment_slot_reservations WHERE hospital_appointment_id=$1 OR private_clinic_appointment_id=$1 ORDER BY created_at,id',[id])).rows;
const active=rows=>rows.filter(item=>['HELD','CONFIRMED'].includes(item.status));
const policy=patch=>f.command(u.admin,'policy',{hospitalId:h.hospital.id,...patch});
const createPay=(actor,b,key='idem_'+f.newId(),client=c[0],extra={})=>f.command(actor,'paymentCreate',{id:b.id,paymentId:f.newId(),idempotencyKey:key,provider:'test',...extra},client);
const capture=(actor,payment,client=c[0])=>f.command(actor,'paymentCapture',{paymentId:payment.id,transactionRef:'test_capture_'+payment.id,provider:'test'},client);
const paid=async(actor,b)=>{const payment=await createPay(actor,b);await capture(actor,payment);return payment;};
async function race(name,operations){const outcomes=await Promise.allSettled(operations.map(operation=>operation()));races.push({name,pids:await Promise.all(c.slice(0,operations.length).map(async client=>(await client.query('SELECT pg_backend_pid() pid')).rows[0].pid)),fulfilled:outcomes.filter(item=>item.status==='fulfilled').length});return outcomes;}
try{
 await check('all forward migrations deploy and runtime has only restricted scheduling entry points',async()=>{
  assert.equal((await c[0].query('SELECT current_user role')).rows[0].role,'mediid_runtime');
  for(const table of ['appointment_slot_reservations','appointment_payments','appointment_refunds','appointment_financial_events','consultation_sessions','_prisma_migrations']){
   const result=(await c[0].query("SELECT has_table_privilege(current_user,$1,'INSERT,UPDATE,DELETE,TRUNCATE') unsafe",[table])).rows[0];assert.equal(result.unsafe,false,table);
  }
  assert.equal((await c[0].query("SELECT has_schema_privilege(current_user,'public','CREATE') unsafe")).rows[0].unsafe,false);
  await assert.rejects(()=>c[0].query('SELECT public.mediid_appointment_row($1)',[f.newId()]),error=>error.code==='42501');
  await assert.rejects(()=>c[0].query('DELETE FROM appointment_financial_events'),error=>error.code==='42501');
 });
 await check('authoritative SQL deadline matches frozen exact boundaries',async()=>{
  for(const [booking,expected]of [['13:20','13:50'],['13:43','13:48'],['13:48','13:50'],['13:50',null],['13:51',null]]){
   const result=(await query("SELECT appointment_payment_deadline('2031-01-01 14:00Z'::timestamptz,$1::timestamptz,60,10,20,5,10) deadline",['2031-01-01 '+booking+'Z'])).rows[0].deadline;
   assert.equal(result?.toISOString()??null,expected?'2031-01-01T'+expected+':00.000Z':null);
  }
 });
 await policy({confirmationMode:'MANUAL',depositRequired:false});
 await check('independent native sessions competing for last seat yield exactly one booking',async()=>{
  const slot=await f.slot(),outcomes=await race('last-seat',[()=>f.book(u.patient0,slot,{},c[0]),()=>f.book(u.patient1,slot,{},c[1])]);
  assert.equal(outcomes.filter(item=>item.status==='fulfilled').length,1);assert.equal(outcomes.filter(item=>item.status==='rejected').length,1);
  assert.equal((await query("SELECT count(*)::int n FROM appointment_slot_reservations WHERE slot_id=$1 AND status IN ('HELD','CONFIRMED')",[slot.id])).rows[0].n,1);
  assert.equal((await query('SELECT capacity FROM materialized_appointment_slots WHERE id=$1',[slot.id])).rows[0].capacity,1);
 });
 await check('multi-seat racing assigns unique seats and cancellation retains historical released seat',async()=>{
  const slot=await f.slot({capacity:2}),outcomes=await race('multi-seat',[()=>f.book(u.patient0,slot,{},c[0]),()=>f.book(u.patient1,slot,{},c[1]),()=>f.book(u.patient2,slot,{},c[2])]),bookings=outcomes.filter(item=>item.status==='fulfilled').map(item=>item.value);
  assert.equal(bookings.length,2);let seats=(await query('SELECT * FROM appointment_slot_reservations WHERE slot_id=$1',[slot.id])).rows;assert.equal(new Set(seats.map(item=>item.seat_number)).size,2);
  const owner=Object.values(u).find(item=>item.id===(bookings[0].booked_by_user_id));await f.command(owner,'cancel',{id:bookings[0].id});
  const reopened=(await query('SELECT * FROM materialized_appointment_slots WHERE id=$1',[slot.id])).rows[0];assert.equal(reopened.state,'AVAILABLE');assert.equal(reopened.reopened_count,1);assert.ok(reopened.last_reopened_at);
  await f.book(u.patient3,slot);seats=(await query('SELECT * FROM appointment_slot_reservations WHERE slot_id=$1',[slot.id])).rows;assert.equal(seats.length,3);assert.equal(active(seats).length,2);assert.equal(new Set(active(seats).map(item=>item.seat_number)).size,2);assert.equal(seats.filter(item=>item.status==='RELEASED').length,1);
 });
 await check('patient cannot inject another identity finance policy provenance seat or status',async()=>{
  const slot=await f.slot();
  for(const extra of [{patientId:p.patient1.id},{totalFee:'0.01'},{depositPercentage:'0'},{depositAmount:'0'},{holdExpiresAt:'2099-01-01'},{paymentHoldStatus:'PAID'},{seatNumber:2},{status:'confirmed'},{policySnapshot:{}},{bookedByUserId:u.admin.id},{handledByUserId:u.admin.id}])await rejected(()=>f.book(u.patient0,slot,extra));
  assert.equal((await query('SELECT count(*)::int n FROM appointments')).rows[0].n,0);
 });
 await check('channels remain separate from booking source and private clinics require organization membership',async()=>{
  const offline=await f.slot({channel:'OFFLINE'}),online=await f.slot({channel:'ONLINE'}),flexible=await f.slot({capacity:2});
  await rejected(()=>f.book(u.patient0,offline));await rejected(()=>f.book(u.receptionist,online,{patientId:p.patient0.id,appointmentChannel:'OFFLINE',bookingChannel:'WALK_IN'}));
  const assisted=await f.book(u.support,flexible,{patientId:p.patient0.uid,appointmentChannel:'ONLINE',bookingChannel:'SUPPORT_ASSISTED'});
  assert.equal(assisted.booking_channel,'SUPPORT_ASSISTED');assert.equal(assisted.appointment_channel,'ONLINE');assert.equal(assisted.booked_by_user_id,u.support.id);assert.equal(assisted.handled_by_user_id,u.support.id);
  const walkin=await f.book(u.receptionist,flexible,{patientId:p.patient1.id,appointmentChannel:'OFFLINE',bookingChannel:'WALK_IN'});assert.equal(walkin.appointment_channel,'OFFLINE');assert.equal((await reservations(walkin.id))[0].expires_at,null);
  const missingSlot=await f.slot();await rejected(()=>f.book(u.support,missingSlot,{patientId:'MID-UNKNOWN0'}));
 });
 await check('front desk restricts every operation to active linked same-hospital receptionist or owner',async()=>{
  for(const name of ['otherReceptionist','nurse','lab','pharmacist','unlinked','inactive','support'])await rejected(()=>f.read(u[name],'hospital',{hospitalId:h.hospital.id}));
  const slot=await f.slot(),booking=await f.book(u.receptionist,slot,{patientId:p.patient0.uid,appointmentChannel:'OFFLINE',bookingChannel:'PHONE'});
  assert.equal(booking.hospital_id,h.hospital.id);assert.ok((await f.read(u.admin,'hospital')).some(item=>item.id===booking.id));assert.ok((await f.read(u.receptionist,'hospital')).some(item=>item.id===booking.id));
  await rejected(()=>f.command(u.otherAdmin,'status',{id:booking.id,status:'confirmed'}));
  await rejected(()=>f.command(u.nurse,'status',{id:booking.id,status:'confirmed'}));
  await f.command(u.receptionist,'status',{id:booking.id,status:'confirmed'});await f.command(u.doctor,'status',{id:booking.id,status:'checked_in'});await f.command(u.receptionist,'status',{id:booking.id,status:'completed'});
  await rejected(()=>f.command(u.admin,'status',{id:booking.id,status:'confirmed'}));assert.equal((await row(booking.id)).status,'completed');
 });
 await check('only hospital administrator and exact private doctor may edit policy',async()=>{
  for(const name of ['receptionist','support','doctor'])await rejected(()=>f.command(u[name],'policy',{hospitalId:h.hospital.id,depositRequired:true}));
  await rejected(()=>f.command(u.member,'policy',{doctorId:d.doctor.id,depositPercentage:'49.99'}));
  await rejected(()=>f.command(u.doctor,'policy',{depositPercentage:'49.99'}));
  await f.command(u.doctor,'policy',{depositPercentage:'50.00'});
 });
 await policy({confirmationMode:'DEPOSIT',depositRequired:true,depositPercentage:'25.00',patientRefundPercentage:'75.00',lateRefundPercentage:'10.00'});
 await check('hospital DEPOSIT capture preserves ledger and alone finalizes one scheduled consultation',async()=>{
  const slot=await f.slot(),booking=await f.book(u.patient0,slot);assert.equal(booking.status,'pending');assert.equal(Number(booking.deposit_amount),125.28);assert.equal(booking.payment_hold_status,'HELD');
  await f.command(u.patient0,'confirm',{id:booking.id});assert.equal((await row(booking.id)).status,'pending');await paid(u.patient0,booking);
  const stored=await row(booking.id);assert.equal(stored.status,'confirmed');assert.equal(Number(stored.amount_paid),125.28);assert.equal(stored.payment_hold_status,'PAID');assert.equal((await reservations(booking.id))[0].status,'CONFIRMED');
  const sessions=(await query('SELECT * FROM consultation_sessions WHERE hospital_appointment_id=$1',[booking.id])).rows;assert.equal(sessions.length,1);assert.equal(sessions[0].status,'scheduled');assert.equal(+sessions[0].starts_at,+new Date(slot.slot_start)-600000);assert.equal(+sessions[0].expires_at,+new Date(slot.slot_start)+7200000);
  assert.equal((await query('SELECT count(*)::int n FROM appointment_financial_events WHERE payment_id IN (SELECT id FROM appointment_payments WHERE hospital_appointment_id=$1)',[booking.id])).rows[0].n,2);
  await assert.rejects(()=>query('DELETE FROM appointment_payments WHERE hospital_appointment_id=$1',[booking.id]),error=>['23514','23503'].includes(error.code));
 });
 await check('private member online booking has exact mandatory 50 percent deposit and member-owned scheduling',async()=>{
  const slot=await f.slot({doctor_id:d.member.id,hospital_id:h.clinic.id}),booking=await f.book(u.patient0,slot);assert.equal(booking.domain,'clinic');assert.equal(booking.doctor_id,d.member.id);assert.equal(booking.clinic_hospital_id,h.clinic.id);assert.equal(Number(booking.deposit_amount),250.55);
  await rejected(()=>f.command(u.doctor,'cancel',{id:booking.id}));await rejected(()=>f.command(u.receptionist,'cancel',{id:booking.id}));await rejected(()=>f.read(u.doctor,'get',{id:booking.id}));
  await paid(u.patient0,booking);assert.equal((await row(booking.id)).status,'confirmed');await f.command(u.member,'cancel',{id:booking.id});assert.equal(Number((await row(booking.id)).refund_amount),250.55);
  const walkslot=await f.slot({doctor_id:d.member.id,hospital_id:h.clinic.id}),walkin=await f.book(u.member,walkslot,{patientId:p.patient0.uid,bookingChannel:'WALK_IN',appointmentChannel:'OFFLINE'});
  assert.equal(walkin.status,'confirmed');assert.equal((await reservations(walkin.id))[0].expires_at,null);
 });
 await check('patient normal cancellation uses frozen snapshot and provider cancellation always refunds full capture',async()=>{
  const booking=await f.book(u.patient0,await f.slot());await paid(u.patient0,booking);await policy({patientRefundPercentage:'20.00'});await f.command(u.patient0,'cancel',{id:booking.id});assert.equal(Number((await row(booking.id)).refund_amount),93.96);
  const provider=await f.book(u.patient1,await f.slot());await paid(u.patient1,provider);await f.command(u.receptionist,'cancel',{id:provider.id});assert.equal(Number((await row(provider.id)).refund_amount),125.28);
  const refs=(await query('SELECT * FROM appointment_refunds WHERE hospital_appointment_id=$1',[provider.id])).rows;assert.equal(refs.length,1);assert.equal(refs[0].amount,'125.28');
  await rejected(()=>f.command(u.patient1,'status',{id:provider.id,status:'confirmed'}));assert.equal(active(await reservations(provider.id)).length,0);
 });
 await check('late patient and support cancellations respect frozen late percentages',async()=>{
  for(const actor of [u.patient0,u.support]){
   const start=new Date(Date.now()+90*60000+(actor===u.support?1800000:0)),slot=await f.slot({slot_start:start,slot_end:new Date(+start+900000)}),booking=await f.book(actor,slot,actor===u.support?{patientId:p.patient0.id,bookingChannel:'SUPPORT_ASSISTED'}:{});
   await paid(actor,booking);await f.command(actor,'cancel',{id:booking.id});assert.equal(Number((await row(booking.id)).refund_amount),12.53);assert.equal((await row(booking.id)).cancellation_initiator,actor===u.support?'SUPPORT_AGENT':'PATIENT');
  }
 });
 await check('support cancellation records the current handler while preserving original booking attribution',async()=>{
  const booking=await f.book(u.patient0,await f.slot());await paid(u.patient0,booking);
  await f.command(u.support,'cancel',{id:booking.id,reason:'Synthetic support cancellation assistance'});
  const stored=await row(booking.id);assert.equal(stored.booked_by_user_id,u.patient0.id);assert.equal(stored.handled_by_user_id,u.support.id);assert.equal(stored.cancellation_initiator,'SUPPORT_AGENT');
  assert.equal(active(await reservations(booking.id)).length,0);
 });
 await check('opaque cancellation rules fail closed for hospital and clinic without a JSON policy interpreter',async()=>{
  const hospitalSlot=await f.slot(),clinicSlot=await f.slot({hospital_id:h.clinic.id});
  for(const [table,column,target,selected]of [['hospital_scheduling_rules','hospital_id',h.hospital.id,hospitalSlot],['doctor_clinic_policies','doctor_id',d.doctor.id,clinicSlot]]){
   await query('UPDATE '+table+' SET cancellation_rules=$1::jsonb WHERE '+column+'=$2',[JSON.stringify({unsupportedSyntheticRule:true}),target]);
   try{await assert.rejects(()=>f.book(u.patient0,selected),error=>error.code==='P0001'&&/APPOINTMENT_POLICY_CONFLICT/.test(error.message));}
   finally{await query('UPDATE '+table+" SET cancellation_rules='{}'::jsonb WHERE "+column+'=$1',[target]);}
  }
 });
 await check('transfer credit requires explicit current patient approval and cannot be provider-approved',async()=>{
  const booking=await f.book(u.patient0,await f.slot());await paid(u.patient0,booking);
  await rejected(()=>f.command(u.support,'transferApproval',{id:booking.id,approved:true}));await rejected(()=>f.command(u.admin,'transferApproval',{id:booking.id,approved:true}));
  await f.command(u.patient0,'transferApproval',{id:booking.id,approved:true});await f.command(u.admin,'cancel',{id:booking.id});
  const stored=await row(booking.id);assert.equal(stored.refund_resolution,'PATIENT_APPROVED_TRANSFER');assert.equal(stored.transfer_approved_by_user_id,u.patient0.id);assert.ok(stored.transfer_approved_at);assert.equal(stored.refund_status,'TRANSFER_CREDIT_OFFERED');
  assert.equal((await query('SELECT count(*)::int n FROM appointment_refunds WHERE hospital_appointment_id=$1',[booking.id])).rows[0].n,0);
 });
 await check('two identical payment requests share one operation and conflicting key reuse is rejected',async()=>{
  const booking=await f.book(u.patient0,await f.slot()),key='same_'+f.newId(),outcomes=await race('payment-idempotency',[()=>createPay(u.patient0,booking,key,c[0]),()=>createPay(u.patient0,booking,key,c[1])]);
  assert.equal(outcomes.filter(item=>item.status==='fulfilled').length,2);assert.equal(outcomes[0].value.id,outcomes[1].value.id);const payment=outcomes[0].value;
  await race('capture-idempotency',[()=>capture(u.patient0,payment,c[0]),()=>capture(u.patient0,payment,c[1])]);assert.equal(Number((await row(booking.id)).amount_paid),125.28);
  const other=await f.book(u.patient0,await f.slot());await rejected(()=>createPay(u.patient0,other,key));await rejected(()=>createPay(u.patient0,booking,key,c[0],{amount:'1.00'}));
  assert.equal((await query('SELECT count(*)::int n FROM appointment_payments WHERE idempotency_key=$1',[key])).rows[0].n,1);
 });
 await check('payment-vs-expiry races retain real capture without reclaiming released capacity',async()=>{
  const start=new Date(Date.now()+601400),slot=await f.slot({slot_start:start,slot_end:new Date(+start+900000)}),booking=await f.book(u.patient0,slot),payment=await createPay(u.patient0,booking);
  const expires=+(new Date((await row(booking.id)).hold_expires_at));await delay(Math.max(0,expires-Date.now()+25));
  const result=await race('payment-vs-expiry',[()=>capture(u.patient0,payment,c[0]),()=>f.tick(c[1])]);for(const item of result)assert.equal(item.status,'fulfilled',item.reason?.message);
  assert.equal((await row(booking.id)).status,'expired');assert.equal(Number((await row(booking.id)).amount_paid),125.28);assert.equal(active(await reservations(booking.id)).length,0);
  assert.equal((await query('SELECT status FROM appointment_payments WHERE id=$1',[payment.id])).rows[0].status,'CAPTURED');assert.equal((await query('SELECT sum(amount)::text amount FROM appointment_refunds WHERE payment_id=$1',[payment.id])).rows[0].amount,'125.28');
  const replacement=await f.book(u.receptionist,slot,{patientId:p.patient1.id,appointmentChannel:'OFFLINE',bookingChannel:'WALK_IN'});assert.equal(active(await reservations(replacement.id)).length,1);await capture(u.patient0,payment);assert.equal(active(await reservations(booking.id)).length,0);assert.equal(active(await reservations(replacement.id)).length,1);
  const state=(await query('SELECT * FROM materialized_appointment_slots WHERE id=$1',[slot.id])).rows[0];assert.ok(state.reopened_count>=1);assert.ok(state.last_reopened_at);
 });
 await check('cancellation-vs-payment races preserve capture once and allocate no duplicate refund',async()=>{
  const booking=await f.book(u.patient0,await f.slot()),payment=await createPay(u.patient0,booking);
  const result=await race('cancellation-vs-payment',[()=>f.command(u.patient0,'cancel',{id:booking.id},c[0]),()=>capture(u.patient0,payment,c[1])]);for(const item of result)assert.equal(item.status,'fulfilled',item.reason?.message);
  assert.equal((await row(booking.id)).status,'cancelled');assert.equal(Number((await row(booking.id)).amount_paid),125.28);assert.equal(active(await reservations(booking.id)).length,0);
  const allocation=(await query('SELECT refund_allocated,amount FROM appointment_payments WHERE id=$1',[payment.id])).rows[0];assert.ok(Number(allocation.refund_allocated)<=Number(allocation.amount));assert.equal((await query('SELECT sum(amount)::text amount FROM appointment_refunds WHERE payment_id=$1',[payment.id])).rows[0].amount,'25.06');
 });
 await policy({confirmationMode:'TIME_BASED',depositRequired:true,confirmationLeadMinutes:40});
 await check('TIME_BASED payment and patient acknowledgement cannot confirm early',async()=>{
  const booking=await f.book(u.patient0,await f.slot());await paid(u.patient0,booking);await f.command(u.patient0,'confirm',{id:booking.id});await f.tick();assert.equal((await row(booking.id)).status,'pending');
  assert.equal((await query('SELECT count(*)::int n FROM consultation_sessions WHERE hospital_appointment_id=$1',[booking.id])).rows[0].n,0);
 });
 await check('two independent TIME_BASED workers make one transition and one consultation session',async()=>{
  const start=new Date(Date.now()+39*60000),slot=await f.slot({slot_start:start,slot_end:new Date(+start+900000)}),booking=await f.book(u.patient1,slot);await paid(u.patient1,booking);
  const results=await race('time-confirmation',[()=>f.tick(c[0]),()=>f.tick(c[1])]);for(const item of results)assert.equal(item.status,'fulfilled',item.reason?.message);
  assert.equal((await row(booking.id)).status,'confirmed');assert.equal((await query('SELECT count(*)::int n FROM consultation_sessions WHERE hospital_appointment_id=$1',[booking.id])).rows[0].n,1);
 });
 await policy({confirmationMode:'MANUAL',depositRequired:true});
 await check('MANUAL payment and links never bypass authorized provider final confirmation',async()=>{
  const secret=randomBytes(32).toString('base64url'),booking=await f.book(u.patient0,await f.slot(),{confirmationDigest:digest(secret)});await paid(u.patient0,booking);
  await c[0].query('SELECT mediid_appointment_public_confirm($1)',[digest(secret)]);assert.equal((await row(booking.id)).status,'pending');
  await rejected(()=>f.command(u.support,'status',{id:booking.id,status:'confirmed'}));await f.command(u.receptionist,'status',{id:booking.id,status:'confirmed'});await f.command(u.receptionist,'status',{id:booking.id,status:'confirmed'});
  assert.equal((await query('SELECT count(*)::int n FROM consultation_sessions WHERE hospital_appointment_id=$1',[booking.id])).rows[0].n,1);
 });
 await check('concurrent public token consumption is single use digest-only and creates no session early',async()=>{
  const secret=randomBytes(32).toString('base64url'),booking=await f.book(u.patient0,await f.slot(),{confirmationDigest:digest(secret)});
  const result=await race('token-replay',[()=>c[0].query('SELECT mediid_appointment_public_confirm($1)',[digest(secret)]),()=>c[1].query('SELECT mediid_appointment_public_confirm($1)',[digest(secret)])]);assert.equal(result.filter(item=>item.status==='fulfilled').length,1);
  const stored=await row(booking.id);assert.equal(stored.confirm_token,digest(secret));assert.equal(stored.confirm_token.includes(secret),false);assert.equal(stored.confirm_token_used,true);assert.equal(stored.status,'pending');
  assert.equal((await query('SELECT count(*)::int n FROM consultation_sessions WHERE hospital_appointment_id=$1',[booking.id])).rows[0].n,0);
 });
 await policy({confirmationMode:'MANUAL',depositRequired:false,maxRescheduleCount:1,rescheduleCutoffHours:2});
 await check('concurrent reschedules retain exactly one active new reservation and preserve old history',async()=>{
  const old=await f.slot(),first=await f.slot(),second=await f.slot(),booking=await f.book(u.patient0,old);
  const result=await race('reschedule',[()=>f.command(u.patient0,'reschedule',{id:booking.id,slotId:first.id,reservationId:f.newId(),confirmationDigest:digest(randomBytes(32).toString('base64url')),expectedSlotId:old.id},c[0]),()=>f.command(u.patient0,'reschedule',{id:booking.id,slotId:second.id,reservationId:f.newId(),confirmationDigest:digest(randomBytes(32).toString('base64url')),expectedSlotId:old.id},c[1])]);
  assert.equal(result.filter(item=>item.status==='fulfilled').length,1);const stored=await row(booking.id);assert.equal(stored.reschedule_count,1);assert.ok(['pending','confirmed'].includes(stored.status));const history=await reservations(booking.id);assert.equal(history.length,2);assert.equal(active(history).length,1);assert.equal(active(history)[0].slot_id,stored.slot_id);assert.equal(history.filter(item=>item.slot_id===old.id)[0].status,'RELEASED');
 });
 await check('paid hospital DEPOSIT reschedule stays confirmed and retains one recalculated consultation',async()=>{
  await policy({confirmationMode:'DEPOSIT',depositRequired:true,depositPercentage:'25.00',maxRescheduleCount:2});
  const previous=await f.slot(),next=await f.slot(),booking=await f.book(u.patient0,previous),initialPayment=await paid(u.patient0,booking);
  await f.command(u.patient0,'reschedule',{id:booking.id,slotId:next.id,reservationId:f.newId(),confirmationDigest:digest(randomBytes(32).toString('base64url'))});
  const stored=await row(booking.id);assert.equal(stored.status,'confirmed');assert.equal(stored.payment_hold_status,'PAID');assert.equal(active(await reservations(booking.id)).length,1);
  const sessions=(await query('SELECT * FROM consultation_sessions WHERE hospital_appointment_id=$1',[booking.id])).rows;assert.equal(sessions.length,1);assert.equal(+sessions[0].starts_at,+new Date(next.slot_start)-600000);assert.equal(sessions[0].status,'scheduled');
  const later=await f.slot();await query('UPDATE doctors SET consultation_fee=600.00 WHERE id=$1',[d.doctor.id]);
  await f.command(u.patient0,'reschedule',{id:booking.id,slotId:later.id,reservationId:f.newId(),confirmationDigest:digest(randomBytes(32).toString('base64url'))});
  assert.equal((await row(booking.id)).status,'pending');assert.equal((await row(booking.id)).payment_hold_status,'HELD');await rejected(()=>createPay(u.patient0,booking,initialPayment.idempotencyKey));const remainder=await createPay(u.patient0,booking);assert.equal(remainder.amount,'24.72');await capture(u.patient0,remainder);
  assert.equal((await row(booking.id)).status,'confirmed');assert.equal(Number((await row(booking.id)).amount_paid),150);assert.equal((await query('SELECT count(*)::int n FROM consultation_sessions WHERE hospital_appointment_id=$1',[booking.id])).rows[0].n,1);
  await query('UPDATE doctors SET consultation_fee=501.10 WHERE id=$1',[d.doctor.id]);await policy({confirmationMode:'MANUAL',depositRequired:false,maxRescheduleCount:1});
 });
 await check('rescheduling obtains fresh policy and moves one consultation window atomically',async()=>{
  const old=await f.slot({hospital_id:h.clinic.id}),next=await f.slot({hospital_id:h.clinic.id}),booking=await f.book(u.doctor,old,{patientId:p.patient0.id,appointmentChannel:'OFFLINE',bookingChannel:'PHONE'});
  await f.command(u.doctor,'policy',{patientRefundPercentage:'60.00'});await f.command(u.doctor,'reschedule',{id:booking.id,slotId:next.id,reservationId:f.newId(),confirmationDigest:digest(randomBytes(32).toString('base64url'))});
  const stored=await row(booking.id);assert.equal(stored.policy_snapshot.patientRefundPercentage,60);assert.equal(stored.status,'confirmed');
  const session=(await query('SELECT * FROM consultation_sessions WHERE private_clinic_appointment_id=$1',[booking.id])).rows;assert.equal(session.length,1);assert.equal(+session[0].starts_at,+new Date(next.slot_start)-600000);
 });
 await check('consultation window exactly excludes early access and expires at two hours',async()=>{
  const slot=await f.slot({hospital_id:h.clinic.id}),booking=await f.book(u.doctor,slot,{patientId:p.patient0.id,appointmentChannel:'OFFLINE',bookingChannel:'WALK_IN'}),session=(await query('SELECT * FROM consultation_sessions WHERE private_clinic_appointment_id=$1',[booking.id])).rows[0];
  for(const [offset,expected]of [[-600001,false],[-600000,true],[7199999,true],[7200000,false]]){
   const instant=new Date(+new Date(slot.slot_start)+offset);const allowed=(await query('SELECT starts_at<=$2::timestamptz AND $2::timestamptz<expires_at valid FROM consultation_sessions WHERE id=$1',[session.id,instant])).rows[0].valid;assert.equal(allowed,expected);
  }
  assert.equal(session.status,'scheduled');assert.equal(session.token.length>=64,true);const list=await f.read(u.patient0,'my');assert.equal(JSON.stringify(list).includes(session.token),false);
  await f.command(u.doctor,'cancel',{id:booking.id});assert.equal((await query('SELECT status FROM consultation_sessions WHERE id=$1',[session.id])).rows[0].status,'expired');
 });
 await check('doctor overrides block unused slots while active bookings cause conflict and preserve appointments',async()=>{
  const slot=await f.slot(),booking=await f.book(u.patient0,slot),input={id:f.newId(),hospitalId:h.hospital.id,overrideType:'LEAVE',startDateTime:slot.slot_start.toISOString(),endDateTime:slot.slot_end.toISOString()};
  await rejected(()=>f.command(u.admin,'override',input));await rejected(()=>f.command(u.support,'override',input));await rejected(()=>f.command(u.doctor,'override',input));assert.equal(active(await reservations(booking.id)).length,1);
  await f.command(u.patient0,'cancel',{id:booking.id});await f.command(u.doctor,'override',input);assert.equal((await query('SELECT state FROM materialized_appointment_slots WHERE id=$1',[slot.id])).rows[0].state,'BLOCKED');await rejected(()=>f.book(u.patient1,slot));await f.command(u.doctor,'deleteOverride',{id:input.id});assert.equal((await query('SELECT state FROM materialized_appointment_slots WHERE id=$1',[slot.id])).rows[0].state,'EXPIRED');assert.equal((await reservations(booking.id)).length,1);
 });
 await check('public availability lists online-compatible remaining capacity without private reservation data',async()=>{
  const slot=await f.slot({capacity:2}),offline=await f.slot({channel:'OFFLINE'});await f.book(u.patient0,slot);
  const date=(await query("SELECT ($1::timestamptz AT TIME ZONE 'Asia/Kolkata')::date::text date",[slot.slot_start])).rows[0].date;
  const available=await f.read(null,'availability',{doctorId:d.doctor.id,hospitalId:h.hospital.id,date}),selected=available.find(item=>item.id===slot.id);assert.equal(Number(selected.remainingCapacity),1);assert.ok(!available.some(item=>item.id===offline.id));
  for(const record of available)for(const key of ['patientId','actorUserId','confirm_token','payments','reservations','history'])assert.equal(Object.hasOwn(record,key),false,key);
 });
 await check('role-specific lists isolate patients doctors and redact support symptoms and notes',async()=>{
  const booking=await f.book(u.patient0,await f.slot(),{symptoms:'Synthetic private symptom',notes:'Synthetic private note'});
  assert.ok((await f.read(u.patient0,'my')).some(item=>item.id===booking.id));assert.ok(!(await f.read(u.patient1,'my')).some(item=>item.id===booking.id));
  await rejected(()=>f.read(u.patient1,'get',{id:booking.id}));await rejected(()=>f.read(u.member,'get',{id:booking.id}));
  const support=await f.read(u.support,'get',{id:booking.id});assert.equal(Object.hasOwn(support,'symptoms'),false);assert.equal(Object.hasOwn(support,'notes'),false);
  for(const key of ['confirm_token','policy_snapshot','payments','refunds','medicalBenefits','aadhaar_hash','documents','medicalHistory'])assert.equal(Object.hasOwn(support,key),false);
 });
 let template;
 await check('idempotent concurrent materializers copy template capacity channel and IANA timezone exactly',async()=>{
  const date=(await query("SELECT ((clock_timestamp() AT TIME ZONE 'America/New_York')::date+1)::text date")).rows[0].date,day=(await query("SELECT trim(to_char($1::date,'DAY')) weekday",[date])).rows[0].weekday;
  template=await insert(db.db,'recurring_availability_templates',{id:f.newId(),doctor_id:d.member.id,hospital_id:h.other.id,day_of_week:day,start_time:'09:00',end_time:'10:00',slot_duration:15,capacity_per_slot:3,channel:'FLEXIBLE',timezone:'America/New_York',effective_from:date,effective_until:date,updated_at:new Date()});
  const result=await race('materializer',[()=>f.materialize(7,c[0]),()=>f.materialize(7,c[1])]);for(const item of result)assert.equal(item.status,'fulfilled',item.reason?.message);
  const slots=(await query("SELECT * FROM materialized_appointment_slots WHERE doctor_id=$1 AND hospital_id=$2 AND (slot_start AT TIME ZONE 'America/New_York')::date=$3::date",[d.member.id,h.other.id,date])).rows;assert.equal(slots.length,4);
  for(const item of slots){assert.equal(item.capacity,3);assert.equal(item.channel,'FLEXIBLE');assert.equal(item.id[14],'7');}
  assert.equal(+slots[0].slot_start,+(await query("SELECT ($1::date+time '09:00') AT TIME ZONE 'America/New_York' value",[date])).rows[0].value);await f.materialize(7);assert.equal((await query('SELECT count(*)::int n FROM materialized_appointment_slots WHERE doctor_id=$1 AND hospital_id=$2 AND slot_start=$3',[d.member.id,h.other.id,slots[0].slot_start])).rows[0].n,1);
 });
 await check('materialization requires active template doctor organization and explicit current membership',async()=>{
  const date=template.effective_from,day=template.day_of_week;
  const orphanDoctor=await insert(db.db,'doctors',{id:f.newId(),uid:'DOC-ORPHAN25',first_name:'Synthetic',last_name:'Orphan',specialization:'Synthetic',primary_hospital_id:h.hospital.id,updated_at:new Date()});
  const pattern={doctor_id:orphanDoctor.id,hospital_id:h.hospital.id,day_of_week:day,start_time:'15:00',end_time:'16:00',slot_duration:15,capacity_per_slot:1,timezone:'America/New_York',effective_from:date,effective_until:date,updated_at:new Date()};
  await insert(db.db,'recurring_availability_templates',{id:f.newId(),...pattern});await f.materialize(7);assert.equal((await query('SELECT count(*)::int n FROM materialized_appointment_slots WHERE doctor_id=$1',[orphanDoctor.id])).rows[0].n,0);
  await insert(db.db,'doctor_hospital_memberships',{id:f.newId(),doctor_id:orphanDoctor.id,hospital_id:h.hospital.id});await query('UPDATE doctors SET is_active=false WHERE id=$1',[orphanDoctor.id]);await f.materialize(7);assert.equal((await query('SELECT count(*)::int n FROM materialized_appointment_slots WHERE doctor_id=$1',[orphanDoctor.id])).rows[0].n,0);
  await query('UPDATE doctors SET is_active=true WHERE id=$1',[orphanDoctor.id]);await query('UPDATE recurring_availability_templates SET is_active=false WHERE doctor_id=$1',[orphanDoctor.id]);await f.materialize(7);assert.equal((await query('SELECT count(*)::int n FROM materialized_appointment_slots WHERE doctor_id=$1',[orphanDoctor.id])).rows[0].n,0);
 });
 await check('CUSTOM_HOURS narrows underlying template capacity and never invents standalone slots',async()=>{
  const localDate=(await query('SELECT effective_from::text value FROM recurring_availability_templates WHERE id=$1',[template.id])).rows[0].value,bounds=(await query("SELECT ($1::date+time '09:15') AT TIME ZONE 'America/New_York' start,($1::date+time '09:45') AT TIME ZONE 'America/New_York' finish",[localDate])).rows[0];
  const changed=await f.command(u.member,'override',{id:f.newId(),hospitalId:h.other.id,overrideType:'CUSTOM_HOURS',startDateTime:bounds.start.toISOString(),endDateTime:bounds.finish.toISOString()});
  await f.materialize(7);
  const counts=(await query("SELECT state,count(*)::int n FROM materialized_appointment_slots WHERE doctor_id=$1 AND hospital_id=$2 AND (slot_start AT TIME ZONE 'America/New_York')::date=$3::date GROUP BY state",[d.member.id,h.other.id,localDate])).rows;
  assert.equal(counts.find(item=>item.state==='BLOCKED')?.n,2);assert.equal(counts.find(item=>item.state==='AVAILABLE')?.n,2);
  await f.command(u.member,'deleteOverride',{id:changed.id});await f.materialize(7);
  assert.equal((await query("SELECT count(*)::int n FROM materialized_appointment_slots WHERE doctor_id=$1 AND hospital_id=$2 AND state<>'EXPIRED' AND (slot_start AT TIME ZONE 'America/New_York')::date=$3::date",[d.member.id,h.other.id,localDate])).rows[0].n,4);
  const before=(await query('SELECT count(*)::int n FROM materialized_appointment_slots WHERE doctor_id=$1 AND hospital_id=$2',[d.member.id,h.clinic.id])).rows[0].n;
  const standalone=await f.command(u.member,'override',{id:f.newId(),hospitalId:h.clinic.id,overrideType:'CUSTOM_HOURS',startDateTime:new Date(+bounds.start+6*3600000).toISOString(),endDateTime:new Date(+bounds.finish+6*3600000).toISOString()});await f.materialize(7);
  assert.equal((await query('SELECT count(*)::int n FROM materialized_appointment_slots WHERE doctor_id=$1 AND hospital_id=$2',[d.member.id,h.clinic.id])).rows[0].n,before);await f.command(u.member,'deleteOverride',{id:standalone.id});
 });
 await check('CUSTOM_HOURS unions preserve active earlier windows and rematerialize newly allowed capacity',async()=>{
  const date=(await query('SELECT effective_from::text value FROM recurring_availability_templates WHERE id=$1',[template.id])).rows[0].value;
  await insert(db.db,'recurring_availability_templates',{id:f.newId(),doctor_id:d.member.id,hospital_id:h.clinic.id,day_of_week:template.day_of_week,start_time:'15:00',end_time:'17:00',slot_duration:30,capacity_per_slot:1,timezone:'America/New_York',effective_from:date,effective_until:date,updated_at:new Date()});await f.materialize(7);
  const moments=(await query("SELECT ($1::date+time '15:00') AT TIME ZONE 'America/New_York' first_start,($1::date+time '15:30') AT TIME ZONE 'America/New_York' first_end,($1::date+time '16:00') AT TIME ZONE 'America/New_York' second_start,($1::date+time '16:30') AT TIME ZONE 'America/New_York' second_end",[date])).rows[0];
  await f.command(u.member,'override',{id:f.newId(),hospitalId:h.clinic.id,overrideType:'CUSTOM_HOURS',startDateTime:moments.first_start.toISOString(),endDateTime:moments.first_end.toISOString()});
  const original=(await query('SELECT * FROM materialized_appointment_slots WHERE doctor_id=$1 AND hospital_id=$2 AND slot_start=$3',[d.member.id,h.clinic.id,moments.first_start])).rows[0],booking=await f.book(u.patient0,original);
  const formerlyBlocked=(await query('SELECT * FROM materialized_appointment_slots WHERE doctor_id=$1 AND hospital_id=$2 AND slot_start=$3',[d.member.id,h.clinic.id,moments.second_start])).rows[0];assert.equal(formerlyBlocked.state,'BLOCKED');
  await f.command(u.member,'override',{id:f.newId(),hospitalId:h.clinic.id,overrideType:'CUSTOM_HOURS',startDateTime:moments.second_start.toISOString(),endDateTime:moments.second_end.toISOString()});await f.materialize(7);
  assert.equal(active(await reservations(booking.id)).length,1);assert.equal(active(await reservations(booking.id))[0].slot_id,original.id);
  const canonical=(await query("SELECT * FROM materialized_appointment_slots WHERE doctor_id=$1 AND hospital_id=$2 AND slot_start=$3 AND state NOT IN ('BLOCKED','EXPIRED')",[d.member.id,h.clinic.id,moments.second_start])).rows;assert.equal(canonical.length,1);assert.notEqual(canonical[0].id,formerlyBlocked.id);assert.equal((await query('SELECT state FROM materialized_appointment_slots WHERE id=$1',[formerlyBlocked.id])).rows[0].state,'EXPIRED');
  await f.command(u.patient0,'cancel',{id:booking.id});
 });
 await check('inactive organizations and deactivated current actors never gain bookable capacity',async()=>{
  const inactiveAdmin=await insert(db.db,'users',{id:f.newId(),email:'inactive-organization25@synthetic.invalid',password_hash:f.hash,role:'hospital_admin',updated_at:new Date()}),inactiveOrg=await insert(db.db,'hospitals',{id:f.newId(),user_id:inactiveAdmin.id,uid:'HID-INACTIVE25',name:'Synthetic Inactive Organization',is_active:false,updated_at:new Date()});
  await insert(db.db,'doctor_hospital_memberships',{id:f.newId(),doctor_id:d.member.id,hospital_id:inactiveOrg.id});
  await insert(db.db,'recurring_availability_templates',{id:f.newId(),doctor_id:d.member.id,hospital_id:inactiveOrg.id,day_of_week:template.day_of_week,start_time:'19:00',end_time:'20:00',slot_duration:15,capacity_per_slot:1,timezone:'America/New_York',effective_from:template.effective_from,effective_until:template.effective_until,updated_at:new Date()});
  await f.materialize(7);assert.equal((await query('SELECT count(*)::int n FROM materialized_appointment_slots WHERE hospital_id=$1',[inactiveOrg.id])).rows[0].n,0);
  const selected=await f.slot();await query('UPDATE users SET is_active=false WHERE id=$1',[u.patient11.id]);await rejected(()=>f.book(u.patient11,selected));await query('UPDATE users SET is_active=true WHERE id=$1',[u.patient11.id]);
 });
 await check('legacy compatibility resolves exactly one slot and rejects missing coordinates',async()=>{
  const selected=await f.slot(),coordinates=(await query("SELECT ($1::timestamptz AT TIME ZONE 'Asia/Kolkata')::date::text day_value,to_char($1::timestamptz AT TIME ZONE 'Asia/Kolkata','HH24:MI') clock_value",[selected.slot_start])).rows[0];
  const input={id:f.newId(),reservationId:f.newId(),doctor:d.doctor.id,hospital:h.hospital.id,appointmentDate:coordinates.day_value,timeSlot:coordinates.clock_value,confirmationDigest:digest(randomBytes(32).toString('base64url'))};
  const booking=await f.command(u.patient0,'book',input);assert.equal(booking.slot_id,selected.id);
  await rejected(()=>f.command(u.patient0,'book',{...input,id:f.newId(),timeSlot:'00:01'}));
  const zoned=(await query("SELECT q.*,to_char(slot_start AT TIME ZONE 'America/New_York','YYYY-MM-DD') local_date,to_char(slot_start AT TIME ZONE 'America/New_York','HH24:MI') local_time FROM materialized_appointment_slots q WHERE doctor_id=$1 AND hospital_id=$2 AND state='AVAILABLE' ORDER BY slot_start LIMIT 1",[d.member.id,h.other.id])).rows[0];
  const zonedBooking=await f.command(u.patient0,'book',{...input,id:f.newId(),reservationId:f.newId(),doctor:d.member.id,hospital:h.other.id,appointmentDate:zoned.local_date,timeSlot:zoned.local_time,confirmationDigest:digest(randomBytes(32).toString('base64url'))});
  assert.equal(zonedBooking.slot_id,zoned.id);await f.command(u.patient0,'cancel',{id:zonedBooking.id});
 });
 await check('membership removal racing materialization leaves no bookable orphan slots',async()=>{
  const membership=(await query('SELECT id FROM doctor_hospital_memberships WHERE doctor_id=$1 AND hospital_id=$2',[d.member.id,h.other.id])).rows[0].id;
  const result=await race('membership-vs-materializer',[()=>f.materialize(7,c[0]),()=>c[1].query('SELECT mediid_remove_doctor_membership($1,$2,$3)',[u.otherAdmin.id,membership,f.newId()])]);for(const item of result)assert.equal(item.status,'fulfilled',item.reason?.message);
  assert.equal((await query("SELECT count(*)::int n FROM materialized_appointment_slots WHERE doctor_id=$1 AND hospital_id=$2 AND state NOT IN ('BLOCKED','EXPIRED')",[d.member.id,h.other.id])).rows[0].n,0);
 });
 await check('hospital and group clinic membership removals conflict with future operational bookings',async()=>{
  const hospitalMembership=(await query('SELECT id FROM doctor_hospital_memberships WHERE doctor_id=$1 AND hospital_id=$2',[d.doctor.id,h.hospital.id])).rows[0].id;
  await rejected(()=>c[0].query('SELECT mediid_remove_doctor_membership($1,$2,$3)',[u.admin.id,hospitalMembership,f.newId()]));
  const clinicSlot=await f.slot({doctor_id:d.member.id,hospital_id:h.clinic.id});await f.book(u.patient0,clinicSlot);
  const membership=(await query('SELECT id FROM doctor_hospital_memberships WHERE doctor_id=$1 AND hospital_id=$2',[d.member.id,h.clinic.id])).rows[0].id;
  await rejected(()=>c[0].query('SELECT mediid_remove_clinic_doctor_membership($1,$2,$3,$4)',[u.doctor.id,h.clinic.id,d.member.id,f.newId()]));
 });
 await check('appointment finance never creates unified billing or clinical records',async()=>{
  for(const table of ['appointments','billing_records','encounters','prescriptions','clinical_notes','access_grants','consents'])assert.equal((await query('SELECT count(*)::int n FROM '+table)).rows[0].n,0,table);
 });
 writeFileSync('.test-data/phase25-appointments-result.json',JSON.stringify({status:'PASS',checks,races,synthetic:true,native:true},null,2)+'\n');console.log('PASS Phase 2.5 native appointments: '+checks.length+' checks; '+races.length+' independent-session races.');
}finally{await f.close();}
