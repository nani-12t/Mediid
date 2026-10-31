'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {randomBytes,createHash}=require('node:crypto');
const {appointmentMode,appointmentConfig,createAppointmentRuntime}=require('../src/appointments/runtime');
const v=require('../src/appointments/validation');
const {policyInput}=require('../src/appointments/policies');
const {credential}=require('../src/appointments/services');
const {TestPaymentProvider,createPaymentProvider,verifiedResult}=require('../src/appointments/payments');
const {appointmentDTO,availabilityDTO}=require('../src/appointments/dto');
const {AppointmentNotifications,createDelivery}=require('../src/appointments/notifications');
const {AppointmentError,databaseOperation,appointmentResponse}=require('../src/appointments/errors');
const {newPostgresId}=require('../src/identifiers/uuid');
const inputError=error=>error instanceof AppointmentError&&error.code==='APPOINTMENT_INPUT';
test('appointment mode must be explicitly supported and PostgreSQL dependencies all match',()=>{
 for(const value of [undefined,'','auto','POSTGRES','mongo'])assert.throws(()=>appointmentMode({APPOINTMENT_BACKEND:value}));
 for(const value of ['legacy','postgres'])assert.equal(appointmentMode({APPOINTMENT_BACKEND:value}),value);
 assert.equal(createAppointmentRuntime(null,null,null,{APPOINTMENT_BACKEND:'legacy'}).mode,'legacy');
 for(const [auth,org,patient]of [[null,{mode:'postgres'},{mode:'postgres'}],[{mode:'postgres'},{mode:'legacy'},{mode:'postgres'}],[{mode:'postgres'},{mode:'postgres',service:{}},{mode:'legacy'}]])assert.throws(()=>createAppointmentRuntime(auth,org,patient,{APPOINTMENT_BACKEND:'postgres'}));
});
test('appointment Redis configuration has bounded horizon intervals namespace and production TLS',()=>{
 const env={NODE_ENV:'test',APPOINTMENT_REDIS_URL:'redis://:synthetic@127.0.0.1:12345/0'},config=appointmentConfig(env);
 assert.equal(config.horizonDays,30);assert.equal(config.namespace,'mediid-appointments-v25');
 for(const patch of [{APPOINTMENT_REDIS_URL:undefined},{APPOINTMENT_REDIS_URL:'http://127.0.0.1'},{APPOINTMENT_REDIS_URL:'redis://localhost?secret=x'},{APPOINTMENT_MATERIALIZE_DAYS_AHEAD:'6'},{APPOINTMENT_MATERIALIZE_DAYS_AHEAD:'91'},{APPOINTMENT_MATERIALIZE_DAYS_AHEAD:'30.1'},{APPOINTMENT_SCHEDULER_INTERVAL_MS:'0'},{APPOINTMENT_QUEUE_NAMESPACE:'patient:MID-SYNTH000'},{NODE_ENV:'production'}])assert.throws(()=>appointmentConfig({...env,...patch}));
 assert.equal(appointmentConfig({...env,NODE_ENV:'production',APPOINTMENT_REDIS_URL:'rediss://synthetic.invalid/0'}).horizonDays,30);
});
test('booking allowlist prevents identity finance status and provenance injection',()=>{
 const slotId=newPostgresId();assert.deepEqual(v.booking({slotId},{role:'patient'}),{slotId});
 for(const patch of [{patientId:newPostgresId()},{patient:'MID-SYNTH000'},{status:'confirmed'},{totalFee:'0.01'},{depositPercentage:'0'},{depositAmount:'0'},{holdExpiresAt:'2099-01-01'},{paymentHoldStatus:'PAID'},{policySnapshot:{}},{seatNumber:1},{bookedByUserId:newPostgresId()},{handledByUserId:newPostgresId()},{legacySourceId:'a'.repeat(24)},{amountPaid:'1.00'},{doctor:newPostgresId()}])assert.throws(()=>v.booking({slotId,...patch},{role:'patient'}),inputError);
 assert.throws(()=>v.booking({slotId},{role:'support_agent'}),inputError);
 assert.deepEqual(v.booking({slotId,patientId:'MID-SYNTH000',appointmentChannel:'ONLINE',bookingChannel:'SUPPORT_ASSISTED'},{role:'support_agent'}),{slotId,patientId:'MID-SYNTH000',appointmentChannel:'ONLINE',bookingChannel:'SUPPORT_ASSISTED'});
});
test('legacy booking selection is bounded and requires complete exact slot coordinates',()=>{
 const doctor=newPostgresId(),hospital=newPostgresId(),base={doctor,hospital,appointmentDate:'2031-01-01',timeSlot:'14:00'};
 assert.deepEqual(v.booking(base,{role:'patient'}),base);
 for(const input of [{...base,appointmentDate:'2031-02-29'},{...base,doctor:'invalid'},{...base,timeSlot:'x'.repeat(33)},{...base,hospital:undefined},{...base,appointmentDate:['2031-01-01']}])assert.throws(()=>v.booking(input,{role:'patient'}),inputError);
});
test('availability and appointment state inputs reject unbounded or ambiguous values',()=>{
 const base={doctorId:newPostgresId(),hospitalId:newPostgresId(),date:'2031-02-28'};assert.deepEqual(v.availability(base),base);
 for(const input of [{...base,date:'2031-02-29'},{...base,date:['2031-02-28']},{...base,patientId:newPostgresId()},{...base,channel:'FLEXIBLE'},{...base,timezone:'America/New_York'},{...base,timezone:'Asia/Kolkata'}])assert.throws(()=>v.availability(input),inputError);
 for(const input of [{status:'pending'},{status:'rescheduled'},{status:'confirmed',timeSlot:'14:00'},{status:'confirmed',appointmentDate:'2031-01-01'},{status:['confirmed']}])assert.throws(()=>v.status(input),inputError);
 assert.deepEqual(v.status({status:'checked_in'}),{status:'checked_in'});
});
test('policy validation never manufactures defaults or accepts invalid money and channels',()=>{
 assert.deepEqual(policyInput({}),{});assert.deepEqual(policyInput({depositPercentage:'50.00',confirmationMode:'MANUAL'}),{depositPercentage:'50.00',confirmationMode:'MANUAL'});
 for(const input of [{depositPercentage:50},{depositPercentage:'NaN'},{depositPercentage:'100.01'},{depositFixedAmount:'-1.00'},{confirmationMode:'AUTO'},{paymentHoldWindowMinutes:0},{confirmationLeadMinutes:-1},{maxRescheduleCount:21},{doctorId:{}},{policySnapshot:{}}])assert.throws(()=>policyInput(input),inputError);
});
test('confirmation credentials use 256 random bits and a distinct SHA256 digest',()=>{
 const first=credential(),second=credential();assert.match(first.secret,/^[A-Za-z0-9_-]{43}$/);assert.match(first.digest,/^[0-9a-f]{64}$/);assert.notEqual(first.secret,second.secret);assert.notEqual(first.secret,first.digest);assert.equal(first.digest,createHash('sha256').update(first.secret).digest('hex'));
 assert.equal(v.token(first.secret),first.secret);for(const value of [first.digest,'../'+first.secret,undefined,'x'.repeat(44)])assert.throws(()=>v.token(value),inputError);
});
test('test payment adapter is deterministic and rejects production or unconfigured providers',async()=>{
 const adapter=createPaymentProvider({NODE_ENV:'test',APPOINTMENT_PAYMENT_PROVIDER:'test'}),intent={id:newPostgresId(),idempotencyKey:'synthetic-key',provider:'test',amount:'250.55',currency:'INR'};
 assert.deepEqual(await adapter.capture(intent),await adapter.capture(intent));assert.match((await adapter.capture(intent)).transactionRef,/^test_capture_/);
 assert.notEqual((await adapter.capture({...intent,idempotencyKey:'different-key'})).transactionRef,(await adapter.capture(intent)).transactionRef);
 assert.deepEqual(await adapter.refund(intent),await adapter.refund(intent));assert.throws(()=>createPaymentProvider({NODE_ENV:'production',APPOINTMENT_PAYMENT_PROVIDER:'test'}));assert.throws(()=>createPaymentProvider({APPOINTMENT_PAYMENT_PROVIDER:'imaginary'}));
 await assert.rejects(()=>createPaymentProvider({}).capture(intent));await assert.rejects(()=>new TestPaymentProvider().capture({...intent,amount:'NaN'}));await assert.rejects(()=>adapter.capture({...intent,provider:'disabled'}));
});
test('gateway response verification cannot accept client success with wrong amount currency provider or reference',()=>{
 const intent={provider:'test',amount:'250.55',currency:'INR'},valid={...intent,status:'CAPTURED',transactionRef:'test_synthetic_capture'};
 assert.deepEqual(verifiedResult(valid,intent,'CAPTURED'),valid);
 for(const patch of [{amount:'1.00'},{currency:'USD'},{provider:'other'},{status:'CREATED'},{transactionRef:''},{transactionRef:'bad\nreference'},{transactionRef:'x'.repeat(129)}])assert.throws(()=>verifiedResult({...valid,...patch},intent,'CAPTURED'));
});
test('stable idempotency keys are bounded and cannot contain command or HTTP injection',()=>{
 assert.equal(v.idempotency('synthetic-key-001'),'synthetic-key-001');for(const value of [undefined,'short','x'.repeat(129),'synthetic\nkey','synthetic/key','patient:key'])assert.throws(()=>v.idempotency(value),inputError);
});
test('compatibility DTO differentiates partial deposit and preserves only scheduling data',()=>{
 const raw={id:newPostgresId(),patient_id:newPostgresId(),doctor_id:newPostgresId(),hospital_id:newPostgresId(),total_fee:'501.10',amount_paid:'250.55',deposit_amount:'250.55',booking_channel:'SUPPORT_ASSISTED',appointment_channel:'ONLINE',status:'pending',symptoms:'Synthetic sensitive symptom',notes:'Synthetic sensitive note',confirm_token:randomBytes(32).toString('hex'),policy_snapshot:{private:true},payments:[{secret:true}],token:'internal-session-token'};
 const patient=appointmentDTO(raw);assert.equal(patient._id,raw.id);assert.equal(patient.billStatus,'deposit_paid');assert.equal(patient.billAmount,'501.10');assert.equal(patient.confirmToken,null);assert.equal(patient.symptoms,raw.symptoms);assert.equal(patient.bookingMethod,'support_assisted');
 for(const role of ['support_agent','hospital_admin','hospital_staff']){const dto=appointmentDTO(raw,{role});assert.equal(dto.symptoms,null);assert.equal(dto.notes,null);for(const key of ['confirm_token','policySnapshot','payments','token','bookedByUserId'])assert.equal(Object.hasOwn(dto,key),false,key);}
});
test('availability DTO never forwards actors patients finance or reservation history',()=>{
 const raw={id:newPostgresId(),remaining_capacity:2,capacity:3,channel:'FLEXIBLE',patient_id:newPostgresId(),actor_user_id:newPostgresId(),reservations:[{private:true}],payments:[{private:true}]},dto=availabilityDTO(raw);assert.equal(dto.remainingCapacity,2);assert.deepEqual(Object.keys(dto).sort(),['capacity','channel','id','remainingCapacity']);
});
test('availability DTO preserves authoritative provider timezone and local time without process conversion',()=>{
 const raw={id:newPostgresId(),doctor_id:newPostgresId(),hospital_id:newPostgresId(),slot_start:'2031-11-01T03:00:00.000Z',slot_end:'2031-11-01T03:15:00.000Z',channel:'FLEXIBLE',capacity:1,remaining_capacity:1,timezone:'America/New_York',time_slot:'23:00',reservations:[{private:true}]};
 assert.deepEqual(availabilityDTO(raw),{id:raw.id,doctorId:raw.doctor_id,hospitalId:raw.hospital_id,slotStart:raw.slot_start,slotEnd:raw.slot_end,channel:'FLEXIBLE',capacity:1,remainingCapacity:1,timezone:'America/New_York',timeSlot:'23:00'});
});
test('notification delivery alone receives secret and errors cannot roll back committed booking',async()=>{
 const delivered=[],secret=randomBytes(32).toString('base64url'),notifications=new AppointmentNotifications({send:async message=>{delivered.push(message);return true;}},'https://synthetic.invalid/');
 assert.equal(await notifications.send('booked',{id:newPostgresId()},secret),true);assert.equal(delivered[0].confirmationUrl,'https://synthetic.invalid/confirm-appointment/'+secret);
 assert.equal(await new AppointmentNotifications({send:async()=>{throw new Error('synthetic failure');}},'https://synthetic.invalid').send('booked',{},secret),false);
 assert.equal(await createDelivery({APPOINTMENT_NOTIFICATION_DELIVERY:'disabled'}).send({}),false);assert.throws(()=>createDelivery({APPOINTMENT_NOTIFICATION_DELIVERY:'legacy-debug'}));
});
test('database failures are safe and preserve bounded authorization validation and conflict categories',async()=>{
 const cases=[['42501','APPOINTMENT_UNAVAILABLE'],['23514','APPOINTMENT_INPUT'],['23505','APPOINTMENT_CONFLICT'],['40P01','APPOINTMENT_CONFLICT'],['P0001','APPOINTMENT_FORBIDDEN','APPOINTMENT_FORBIDDEN']];
 for(const [code,expected,message='Synthetic database private error']of cases)await assert.rejects(()=>databaseOperation(async()=>{throw Object.assign(new Error(message),{code});}),error=>error.code===expected);
 const response=appointmentResponse(new Error('privatepostgrescredential'));assert.equal(response.status,503);assert.equal(JSON.stringify(response).includes('privatepostgrescredential'),false);
});
