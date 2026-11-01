import assert from 'node:assert/strict';
import {writeFileSync,readFileSync,readdirSync} from 'node:fs';
import {clinicalFixture,allowed,denied,uuid7,syntheticItems,documentInput,insert,delay} from './helpers/phase26-fixtures.mjs';
const checks=[],f=await clinicalFixture(),{users:u,patients:p,doctors:d,hospitals:h,connections:c,database:db}=f;
const check=async(name,operation)=>{await operation();checks.push(name);console.log('PASS clinical: '+name);};
const query=f.query,command=f.clinicalCommand;
const safety=async operation=>{try{const result=await operation();assert.equal(result.allowed,false,JSON.stringify(result));}catch(error){if(error.code)assert.ok(['P0001','23514','23505','42501','22023','22P02'].includes(error.code),error.code);else throw error;}};
let care,encounter,prescription;
try{
 await check('all forward migrations deploy with narrow clinical permissions and private helpers',async()=>{
  assert.equal((await c[0].query('SELECT current_user role')).rows[0].role,'mediid_runtime');
  for(const table of ['encounters','vitals','clinical_notes','conditions','allergies','prescriptions','prescription_items','medical_documents','access_logs','billing_records','appointment_payments','appointment_refunds','appointment_financial_events','research_requirements','dataset_submissions','dataset_consents','approved_datasets','dataset_access_grants','dataset_access_logs']){
   assert.equal((await c[0].query("SELECT has_table_privilege(current_user,$1,'INSERT,UPDATE,DELETE,TRUNCATE') unsafe",[table])).rows[0].unsafe,false,table);
  }
  const functions=(await query("SELECT p.oid::regprocedure::text name,p.prosecdef,p.proconfig,has_function_privilege('mediid_runtime',p.oid,'EXECUTE') runtime,has_function_privilege('mediid_diagnostics',p.oid,'EXECUTE') diagnostics FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname LIKE 'mediid_clinical_%'")).rows;
  assert.ok(functions.length>=5);for(const item of functions){assert.ok(item.proconfig.some(value=>value==='search_path=pg_catalog, public'||value==='search_path=pg_catalog,public'));assert.equal(item.runtime,/mediid_clinical_(read|command)\(/.test(item.name),item.name);assert.equal(item.diagnostics,false,item.name);}
  await assert.rejects(()=>c[0].query('SELECT public.mediid_clinical_encounter_dto($1)',[f.newId()]),error=>error.code==='42501');
 });
 await check('reviewed booking confirmation check-in and tick flow opens real operational clinical care',async()=>{
  const start=new Date(Date.now()+300000),slot=await f.slot({slot_start:start,slot_end:new Date(+start+60000)});
  const booking=await f.book(u.receptionist,slot,{patientId:p.patient7.uid,appointmentChannel:'OFFLINE',bookingChannel:'WALK_IN'});
  await f.command(u.receptionist,'status',{id:booking.id,status:'confirmed'});await f.command(u.doctor,'status',{id:booking.id,status:'checked_in'});await f.tick();
  const session=(await query('SELECT * FROM consultation_sessions WHERE hospital_appointment_id=$1',[booking.id])).rows[0];assert.equal(session.status,'active');assert.equal(+session.starts_at,+start-600000);assert.equal(+session.expires_at,+start+7200000);
  const episode=allowed(await command(u.doctor,'start',{appointmentId:booking.id}));assert.equal(episode.hospitalAppointmentId,booking.id);assert.equal(allowed(await f.read(u.doctor,'ehr',{patientUid:p.patient7.uid})).consultation.sessionId,session.id);
  allowed(await command(u.doctor,'complete',{encounterId:episode.id}));assert.equal((await query('SELECT status FROM hospital_appointments WHERE id=$1',[booking.id])).rows[0].status,'completed');
 });
 await check('denied doctor EHR produces a durable bounded append-only audit decision',async()=>{
  const auditId=f.newId();denied(await f.read(u.doctor,'ehr',{patientUid:p.patient10.uid,auditId}));
  const log=(await query('SELECT * FROM access_logs WHERE id=$1',[auditId])).rows[0];assert.ok(log);assert.equal(log.status,'denied');assert.equal(log.access_basis,'NONE');assert.equal(log.accessed_by_id,u.doctor.id);assert.equal(log.patient_id,p.patient10.id);assert.ok(log.reason.length<100);uuid7(log.id);
  for(const sql of ['UPDATE access_logs SET reason=\'tampered\' WHERE id=$1','DELETE FROM access_logs WHERE id=$1','TRUNCATE access_logs'])await assert.rejects(()=>c[0].query(sql,sql.includes('$1')?[auditId]:[]),error=>error.code==='42501');
  assert.equal((await query('SELECT reason FROM access_logs WHERE id=$1',[auditId])).rows[0].reason,log.reason);
 });
 await check('unknown public patient denial persists without fabricating a patient audit identity',async()=>{
  const auditId=f.newId();denied(await f.read(u.doctor,'ehr',{patientUid:'MID-UNKNOWN0',auditId}));const log=(await query('SELECT * FROM access_logs WHERE id=$1',[auditId])).rows[0];assert.ok(log);assert.equal(log.patient_id,null);assert.equal(log.doctor_id,d.doctor.id);assert.equal(log.status,'denied');assert.equal(log.access_basis,'NONE');assert.equal(log.accessed_by_id,u.doctor.id);
 });
 await check('trust consent access grant and break-glass rows are not activated authority',async()=>{
  await insert(db.db,'patient_trusted_doctors',{patient_id:p.patient10.id,doctor_id:d.doctor.id});
  await insert(db.db,'patient_trusted_hospitals',{patient_id:p.patient10.id,hospital_id:h.hospital.id});
  await insert(db.db,'consents',{id:f.newId(),patient_id:p.patient10.id,grantee_type:'doctor',grantee_id:d.doctor.id,scopes:['vitals','prescriptions','documents'],purpose:'clinical_care',status:'active'});
  await insert(db.db,'access_grants',{id:f.newId(),patient_id:p.patient10.id,doctor_id:d.doctor.id,hospital_id:h.hospital.id,purpose:'clinical_care',valid_until:new Date(Date.now()+3600000)});
  await insert(db.db,'break_glass_events',{id:f.newId(),patient_id:p.patient10.id,triggered_by_id:u.doctor.id,doctor_id:d.doctor.id,hospital_id:h.hospital.id,emergency_reason:'Synthetic future workflow is not active'});
  denied(await f.read(u.doctor,'ehr',{patientUid:p.patient10.uid}));assert.equal((await f.logs({actor:u.doctor,patient:p.patient10,status:'denied'})).length,2);
 });
 await check('current non-doctor roles have zero EHR or mutation authority',async()=>{
  for(const name of ['admin','otherAdmin','receptionist','otherReceptionist','nurse','lab','pharmacist','support','buyer','pharmacy','patient0']){
   denied(await f.read(u[name],'ehr',{patientUid:p.patient10.uid}));
   denied(await command(u[name],'start',{appointmentId:f.newId()}));
  }
 });
 await check('real operational consultation enforces early inactive null-start active and exact-expired DB windows',async()=>{
  const earlyCare=await f.care({offsetMs:660000});
  const early=denied(await f.read(u.doctor,'ehr',{patientUid:p.patient0.uid}));assert.ok(['consultation_not_started','consultation_inactive','no_active_consultation'].includes(early.reason));
  await f.command(u.receptionist,'cancel',{id:earlyCare.booking.id});care=await f.care();assert.ok(allowed(await f.read(u.doctor,'ehr',{patientUid:p.patient0.uid})).patient);
  for(const status of ['scheduled','completed','expired']){await query('UPDATE consultation_sessions SET status=$2 WHERE id=$1',[care.session.id,status]);denied(await f.read(u.doctor,'ehr',{patientUid:p.patient0.uid}));}
  await query("UPDATE consultation_sessions SET status='active',starts_at=NULL WHERE id=$1",[care.session.id]);denied(await f.read(u.doctor,'ehr',{patientUid:p.patient0.uid}));
  const expired=await f.care({patient:'patient9',offsetMs:-7200000});denied(await f.read(u.doctor,'ehr',{patientUid:p.patient9.uid}));
  await query("UPDATE consultation_sessions SET status='active',starts_at=$2,expires_at=$3 WHERE id=$1",[care.session.id,care.session.starts_at,care.session.expires_at]);
  const bounds=(await query('SELECT starts_at<=$2::timestamptz AND $2::timestamptz<expires_at valid FROM consultation_sessions WHERE id=$1',[care.session.id,care.session.expires_at])).rows[0];assert.equal(bounds.valid,false);
 });
 await check('guard rejects a time-extended session even when its status remains active',async()=>{
  await query("UPDATE consultation_sessions SET expires_at=expires_at+interval '1 hour' WHERE id=$1",[care.session.id]);denied(await f.read(u.doctor,'ehr',{patientUid:p.patient0.uid}));await query('UPDATE consultation_sessions SET expires_at=$2 WHERE id=$1',[care.session.id,care.session.expires_at]);
 });
 await check('active EHR is scoped to current exact linked doctor user and current explicit membership',async()=>{
  const unrelatedDenial=denied(await f.read(u.member,'ehr',{patientUid:p.patient0.uid}));assert.equal(Object.hasOwn(unrelatedDenial,'opensAt'),false);assert.equal(Object.hasOwn(unrelatedDenial,'expiresAt'),false);
  const auditId=f.newId(),bundle=allowed(await f.read(u.doctor,'ehr',{patientUid:p.patient0.uid,auditId}));
  assert.equal(bundle.patient.uid,p.patient0.uid);assert.equal(bundle.consultation.sessionId,care.session.id);assert.equal(bundle.consultation.appointmentId,care.booking.id);assert.equal(bundle.consultation.organizationId,h.hospital.id);
  const log=(await query('SELECT * FROM access_logs WHERE id=$1',[auditId])).rows[0];assert.equal(log.status,'allowed');assert.equal(log.access_basis,'ACTIVE_CONSULTATION');assert.equal(log.session_id,care.session.id);assert.equal(log.hospital_appointment_id,care.booking.id);
  const text=JSON.stringify(bundle);for(const secret of [f.hash,care.session.token])assert.equal(text.includes(secret),false);for(const key of ['aadhaar','password','billingRecords','refreshDigest','token'])assert.equal(text.includes('"'+key+'"'),false);
  await query('UPDATE users SET is_active=false WHERE id=$1',[u.doctor.id]);denied(await f.read(u.doctor,'ehr',{patientUid:p.patient0.uid}));await query('UPDATE users SET is_active=true,role=\'support_agent\' WHERE id=$1',[u.doctor.id]);denied(await f.read(u.doctor,'ehr',{patientUid:p.patient0.uid}));await query('UPDATE users SET role=\'doctor\' WHERE id=$1',[u.doctor.id]);
  await query('UPDATE doctors SET is_active=false WHERE id=$1',[d.doctor.id]);denied(await f.read(u.doctor,'ehr',{patientUid:p.patient0.uid}));await query('UPDATE doctors SET is_active=true WHERE id=$1',[d.doctor.id]);
  await query('UPDATE hospitals SET is_active=false WHERE id=$1',[h.hospital.id]);denied(await f.read(u.doctor,'ehr',{patientUid:p.patient0.uid}));await query('UPDATE hospitals SET is_active=true WHERE id=$1',[h.hospital.id]);
  const membership=(await query('DELETE FROM doctor_hospital_memberships WHERE doctor_id=$1 AND hospital_id=$2 RETURNING *',[d.doctor.id,h.hospital.id])).rows[0];denied(await f.read(u.doctor,'ehr',{patientUid:p.patient0.uid}));await insert(db.db,'doctor_hospital_memberships',membership);await query('UPDATE consultation_sessions SET expires_at=$2 WHERE id=$1',[care.session.id,care.session.expires_at]);
 });
 await check('group-clinic member may access care while owner has no practitioner bypass',async()=>{
  const memberCare=await f.care({patient:'patient1',doctor:'member',organization:'clinic'});assert.ok(allowed(await f.read(u.member,'ehr',{patientUid:p.patient1.uid})).patient);denied(await f.read(u.doctor,'ehr',{patientUid:p.patient1.uid}));
  const own=await f.start(memberCare);assert.equal(own.doctorId,d.member.id);assert.equal(own.hospitalId,h.clinic.id);assert.equal(own.privateClinicAppointmentId,memberCare.booking.id);
 });
 await check('encounter start creates ambulatory in-progress care and idempotently reuses parent-linked record',async()=>{
  encounter=await f.start(care);uuid7(encounter.id);assert.equal(encounter.patientId,p.patient0.id);assert.equal(encounter.doctorId,d.doctor.id);assert.equal(encounter.hospitalId,h.hospital.id);assert.equal(encounter.hospitalAppointmentId,care.booking.id);assert.equal(encounter.encounterType,'ambulatory');assert.equal(encounter.status,'in_progress');
  assert.equal((await f.start(care)).id,encounter.id);assert.equal((await query('SELECT count(*)::int n FROM encounters WHERE hospital_appointment_id=$1',[care.booking.id])).rows[0].n,1);
 });
 await check('vitals derive precise BMI and retain server-selected encounter provenance',async()=>{
  const result=allowed(await command(u.doctor,'vitals',{encounterId:encounter.id,systolicBp:120,diastolicBp:80,heartRate:70,respiratoryRate:16,temperatureCelsius:'36.50',spo2Percentage:98,weightKg:'81.00',heightCm:'180.00'}));uuid7(result.id);
  const stored=(await query('SELECT * FROM vitals WHERE id=$1',[result.id])).rows[0];assert.equal(stored.encounter_id,encounter.id);assert.equal(stored.weight_kg,'81.00');assert.equal(stored.height_cm,'180.00');assert.equal(stored.bmi,'25.00');assert.equal(stored.temperature_celsius,'36.50');
  denied(await command(u.member,'vitals',{encounterId:encounter.id,heartRate:60}));assert.ok((await f.logs({actor:u.doctor,action:'record_vitals',status:'allowed'})).length);
 });
 await check('SOAP note author is current user and structured condition and allergy retain encounter patient',async()=>{
  const note=allowed(await command(u.doctor,'note',{encounterId:encounter.id,noteType:'consultation',subjective:'Synthetic subjective',objective:'Synthetic objective',assessment:'Synthetic assessment',plan:'Synthetic plan'}));uuid7(note.id);assert.equal((await query('SELECT author_id FROM clinical_notes WHERE id=$1',[note.id])).rows[0].author_id,u.doctor.id);
  const condition=allowed(await command(u.doctor,'condition',{encounterId:encounter.id,displayName:'Synthetic Condition',clinicalStatus:'active',verificationStatus:'confirmed',diagnosedDate:'2026-01-01'}));uuid7(condition.id);
  const allergy=allowed(await command(u.doctor,'allergy',{encounterId:encounter.id,substance:'Synthetic Allergy',reaction:'Synthetic reaction',severity:'mild'}));uuid7(allergy.id);
  for(const [table,id]of [['conditions',condition.id],['allergies',allergy.id]]){const record=(await query('SELECT * FROM '+table+' WHERE id=$1',[id])).rows[0];assert.equal(record.encounter_id,encounter.id);assert.equal(record.patient_id,p.patient0.id);}
  const historical=await insert(db.db,'allergies',{id:f.newId(),patient_id:p.patient0.id,substance:'Synthetic Historical Allergy'});assert.equal(historical.encounter_id,null);
 });
 await check('new resolved conditions receive database resolution date and future diagnosis dates are rejected',async()=>{
  const dates=(await query("SELECT CURRENT_DATE::text today,(CURRENT_DATE+1)::text tomorrow")).rows[0],resolved=allowed(await command(u.doctor,'condition',{encounterId:encounter.id,displayName:'Synthetic Resolved Condition',clinicalStatus:'resolved',diagnosedDate:'2026-01-01'}));assert.equal(resolved.resolvedDate,dates.today);
  await assert.rejects(()=>command(u.doctor,'condition',{encounterId:encounter.id,displayName:'Synthetic Future Condition',diagnosedDate:dates.tomorrow}),error=>error.code==='P0001'&&error.message==='CLINICAL_INPUT');
 });
 await check('structured prescriptions atomically retain exact context and all items without pharmacy or billing',async()=>{
  prescription=allowed(await command(u.doctor,'prescription',{encounterId:encounter.id,appointmentId:care.booking.id,notes:'Synthetic prescription notes',items:syntheticItems()}));uuid7(prescription.id);
  const row=(await query('SELECT * FROM prescriptions WHERE id=$1',[prescription.id])).rows[0];assert.equal(row.encounter_id,encounter.id);assert.equal(row.patient_id,p.patient0.id);assert.equal(row.doctor_id,d.doctor.id);assert.equal(row.hospital_id,h.hospital.id);assert.equal(row.status,'active');
  const items=(await query('SELECT * FROM prescription_items WHERE prescription_id=$1 ORDER BY medication_name',[prescription.id])).rows;assert.equal(items.length,2);for(const item of items)uuid7(item.id);
  const badId=f.newId(),itemId=f.newId();await safety(()=>command(u.doctor,'prescription',{id:badId,encounterId:encounter.id,appointmentId:care.booking.id,items:[{id:itemId,...syntheticItems()[0]},{id:itemId,...syntheticItems()[1]}]}));assert.equal((await query('SELECT count(*)::int n FROM prescriptions WHERE id=$1',[badId])).rows[0].n,0);assert.equal((await query('SELECT count(*)::int n FROM prescription_items WHERE prescription_id=$1',[badId])).rows[0].n,0);
  for(const table of ['billing_records','pharmacy_dispenses'])assert.equal((await query('SELECT count(*)::int n FROM '+table)).rows[0].n,0);
 });
 await check('prescription expiring during item insertion rolls back every item and retains denial audit',async()=>{
  const record=await f.care({patient:'patient8',doctor:'member',organization:'other',offsetMs:-7200000+1500}),episode=await f.start(record),id=f.newId(),auditId=f.newId();
  await query('CREATE SEQUENCE public.phase26_test_pause_count');await query('GRANT USAGE ON SEQUENCE public.phase26_test_pause_count TO mediid_migrator');await query("CREATE FUNCTION public.phase26_test_pause_item() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$ BEGIN PERFORM nextval('public.phase26_test_pause_count'); PERFORM pg_sleep(0.9); RETURN NEW; END $$");
  await query('CREATE TRIGGER phase26_test_pause_item BEFORE INSERT ON prescription_items FOR EACH ROW EXECUTE FUNCTION public.phase26_test_pause_item()');
  try{
   denied(await command(u.member,'prescription',{id,auditId,encounterId:episode.id,appointmentId:record.booking.id,items:syntheticItems()}),'consultation_expired');
   assert.equal((await query('SELECT count(*)::int n FROM prescriptions WHERE id=$1',[id])).rows[0].n,0);assert.equal((await query('SELECT count(*)::int n FROM prescription_items WHERE prescription_id=$1',[id])).rows[0].n,0);
   const log=(await query('SELECT * FROM access_logs WHERE id=$1',[auditId])).rows[0];assert.equal(log.status,'denied');assert.equal(log.reason,'consultation_expired');assert.equal(Number((await query('SELECT last_value FROM public.phase26_test_pause_count')).rows[0].last_value),2,'Both item triggers must run inside the transaction before expiry rollback.');
  }finally{await query('DROP TRIGGER phase26_test_pause_item ON prescription_items');await query('DROP FUNCTION public.phase26_test_pause_item()');await query('DROP SEQUENCE public.phase26_test_pause_count');}
 });
 await check('cross-patient and unrelated same-patient encounter writes deny despite other active care',async()=>{
  const other=await f.care({patient:'patient2',doctor:'member',organization:'other'}),otherEncounter=await f.start(other);
  denied(await command(u.doctor,'vitals',{encounterId:otherEncounter.id,heartRate:70}));denied(await command(u.doctor,'prescription',{encounterId:otherEncounter.id,appointmentId:other.booking.id,items:syntheticItems()}));
  const unrelated=await f.care({patient:'patient0',doctor:'member',organization:'clinic'}),unrelatedEncounter=await f.start(unrelated);denied(await command(u.doctor,'note',{encounterId:unrelatedEncounter.id,noteType:'progress',assessment:'Synthetic forbidden'}));
 });
 await check('patient self longitudinal read is audited safe and supports bounded deterministic encounter pagination',async()=>{
  const auditId=f.newId(),bundle=allowed(await f.read(u.patient0,'self',{auditId,limit:1}));assert.equal(bundle.patient.uid,p.patient0.uid);assert.equal(bundle.encounters.length,1);assert.ok(bundle.pagination);assert.ok(Array.isArray(bundle.prescriptions));assert.ok(bundle.prescriptions.some(item=>item.id===prescription.id));assert.ok(bundle.allergies.some(item=>item.substance==='Synthetic Allergy'));
  const next=allowed(await f.read(u.patient0,'self',{limit:1,cursor:bundle.encounters[0].id}));assert.ok(next.encounters.every(item=>item.id!==bundle.encounters[0].id));
  const audit=(await query('SELECT * FROM access_logs WHERE id=$1',[auditId])).rows[0];assert.equal(audit.access_basis,'PATIENT_SELF');assert.equal(audit.status,'allowed');assert.equal(audit.doctor_id,null);
  denied(await f.read(u.patient0,'ehr',{patientUid:p.patient1.uid}));denied(await command(u.patient0,'note',{encounterId:encounter.id,noteType:'progress',assessment:'Synthetic patient forbidden'}));
 });
 await check('historically mismatched clinical child FKs are excluded from both patient views without history deletion',async()=>{
  const condition=await insert(db.db,'conditions',{id:f.newId(),patient_id:p.patient1.id,encounter_id:encounter.id,display_name:'Synthetic mismatched history Condition'});
  const prescription=await insert(db.db,'prescriptions',{id:f.newId(),patient_id:p.patient1.id,doctor_id:d.doctor.id,hospital_id:h.hospital.id,encounter_id:encounter.id,notes:'Synthetic mismatched history Prescription'});
  await insert(db.db,'prescription_items',{id:f.newId(),prescription_id:prescription.id,medication_name:'Synthetic mismatched history Medicine',dosage:'Synthetic dose',quantity:1});
  const document=await insert(db.db,'medical_documents',{id:f.newId(),patient_id:p.patient1.id,encounter_id:encounter.id,uploaded_by_user_id:u.patient1.id,type:'other',title:'Synthetic mismatched history Document',file_url:'https://documents.example.invalid/mismatched.pdf'});
  for(const bundle of [allowed(await f.read(u.patient0,'self')),allowed(await f.read(u.patient1,'self')),allowed(await f.read(u.doctor,'ehr',{patientUid:p.patient0.uid}))])assert.equal(JSON.stringify(bundle).includes('Synthetic mismatched history'),false);
  for(const [table,id]of [['conditions',condition.id],['prescriptions',prescription.id],['medical_documents',document.id]])assert.equal((await query('SELECT count(*)::int n FROM '+table+' WHERE id=$1',[id])).rows[0].n,1);
 });
 await check('patient document metadata is self-owned and is available to active clinician without fetching reference',async()=>{
  const result=allowed(await command(u.patient0,'register_document',documentInput()));uuid7(result.id);
  const stored=(await query('SELECT * FROM medical_documents WHERE id=$1',[result.id])).rows[0];assert.equal(stored.patient_id,p.patient0.id);assert.equal(stored.uploaded_by_user_id,u.patient0.id);assert.equal(stored.encounter_id,null);assert.equal(stored.file_url,documentInput().fileUrl);
  const own=allowed(await f.read(u.patient0,'self'));assert.ok(own.documents.some(item=>item.id===result.id));const other=allowed(await f.read(u.patient1,'self'));assert.ok(!other.documents.some(item=>item.id===result.id));const clinician=allowed(await f.read(u.doctor,'ehr',{patientUid:p.patient0.uid}));assert.ok(clinician.documents.some(item=>item.id===result.id));
  await assert.rejects(()=>c[0].query('DELETE FROM medical_documents WHERE id=$1',[result.id]),error=>error.code==='42501');
 });
 await check('operational multiplicity conflicts preserve historical multiple-encounter contract',async()=>{
  const record=await f.care({patient:'patient3'}),first=await f.start(record);
  const second=await insert(db.db,'encounters',{id:f.newId(),patient_id:record.patient.id,doctor_id:record.doctor.id,hospital_id:record.organization.id,hospital_appointment_id:record.booking.id,encounter_type:'ambulatory',status:'in_progress'});
  assert.notEqual(first.id,second.id);await safety(()=>command(u.doctor,'start',{appointmentId:record.booking.id}));assert.equal((await query('SELECT count(*)::int n FROM encounters WHERE hospital_appointment_id=$1',[record.booking.id])).rows[0].n,2);
 });
 await check('inconsistent completed encounter and appointment session states return retained reconciliation conflicts',async()=>{
  const record=await f.care({patient:'patient4'}),episode=await f.start(record);
  await query("UPDATE encounters SET status='completed',end_time=clock_timestamp() WHERE id=$1",[episode.id]);let result=denied(await command(u.doctor,'complete',{encounterId:episode.id}),'encounter_reconciliation_required');assert.equal(result.conflict,true);
  await query("UPDATE encounters SET status='in_progress',end_time=NULL WHERE id=$1",[episode.id]);allowed(await command(u.doctor,'complete',{encounterId:episode.id}));await query("UPDATE encounters SET status='in_progress',end_time=NULL WHERE id=$1",[episode.id]);
  const auditId=f.newId();result=denied(await command(u.doctor,'complete',{encounterId:episode.id,auditId}),'encounter_reconciliation_required');assert.equal(result.conflict,true);const log=(await query('SELECT * FROM access_logs WHERE id=$1',[auditId])).rows[0];assert.equal(log.status,'denied');assert.equal(log.resource_type,'encounter');assert.equal(log.resource_id,episode.id);assert.equal((await query('SELECT status FROM encounters WHERE id=$1',[episode.id])).rows[0].status,'in_progress');
 });
 await check('scheduling cannot strand active care and clinical completion atomically closes all three records',async()=>{
  await assert.rejects(()=>f.command(u.receptionist,'status',{id:care.booking.id,status:'completed'}),error=>['P0001','23514'].includes(error.code));
  assert.equal((await query('SELECT status FROM encounters WHERE id=$1',[encounter.id])).rows[0].status,'in_progress');
  const completed=allowed(await command(u.doctor,'complete',{encounterId:encounter.id}));assert.equal(completed.status,'completed');assert.equal(JSON.stringify(completed).includes('Synthetic mismatched history'),false);
  const states=(await query('SELECT e.status encounter,e.end_time,a.status appointment,s.status consultation,s.completed_at FROM encounters e JOIN hospital_appointments a ON a.id=e.hospital_appointment_id JOIN consultation_sessions s ON s.hospital_appointment_id=a.id WHERE e.id=$1',[encounter.id])).rows[0];assert.equal(states.encounter,'completed');assert.equal(states.appointment,'completed');assert.equal(states.consultation,'completed');assert.ok(states.end_time);assert.ok(states.completed_at);
  const again=allowed(await command(u.doctor,'complete',{encounterId:encounter.id}));assert.equal(+new Date(again.endTime),+states.end_time);
  for(const [op,input]of [['vitals',{heartRate:70}],['note',{noteType:'progress',assessment:'Synthetic late'}],['condition',{displayName:'Synthetic late',clinicalStatus:'active'}],['allergy',{substance:'Synthetic late'}],['prescription',{appointmentId:care.booking.id,items:syntheticItems()}]])denied(await command(u.doctor,op,{encounterId:encounter.id,...input}));
  const deniedVital=(await f.logs({actor:u.doctor,patient:p.patient0,status:'denied',action:'record_vitals'})).at(-1);assert.equal(deniedVital.resource_type,'vital');assert.equal(deniedVital.resource_id,null);assert.ok(allowed(await f.read(u.patient0,'self')).encounters.some(item=>item.id===encounter.id));for(const table of ['billing_records','pharmacy_dispenses'])assert.equal((await query('SELECT count(*)::int n FROM '+table)).rows[0].n,0);
 });
 await check('forward clinical integrity checks reject incompatible history without deleting retained facts',async()=>{
  for(const [table,fields]of [['encounters',{id:f.newId(),patient_id:p.patient9.id,doctor_id:d.doctor.id,start_time:'2030-01-02',end_time:'2030-01-01'}],['clinical_notes',{id:f.newId(),encounter_id:encounter.id,author_id:u.doctor.id,note_type:'unsafe'}],['conditions',{id:f.newId(),patient_id:p.patient9.id,display_name:'Synthetic invalid',clinical_status:'unsafe'}],['allergies',{id:f.newId(),patient_id:p.patient9.id,substance:'Synthetic invalid',severity:'unsafe'}],['prescriptions',{id:f.newId(),patient_id:p.patient9.id,doctor_id:d.doctor.id,status:'unsafe'}],['prescription_items',{id:f.newId(),prescription_id:prescription.id,medication_name:'Synthetic invalid',dosage:'Synthetic',quantity:0}]])await assert.rejects(()=>insert(db.db,table,fields),error=>error.code==='23514');
 });
 await check('allergy encounter provenance cannot cross patients or be invalidated by a parent rewrite',async()=>{
  await assert.rejects(()=>insert(db.db,'allergies',{id:f.newId(),patient_id:p.patient1.id,encounter_id:encounter.id,substance:'Synthetic mismatched allergy'}),error=>error.code==='23514');
  const direct=await insert(db.db,'encounters',{id:f.newId(),patient_id:p.patient9.id,doctor_id:d.doctor.id,encounter_type:'emergency',status:'in_progress'});await insert(db.db,'allergies',{id:f.newId(),patient_id:p.patient9.id,encounter_id:direct.id,substance:'Synthetic provenance retained'});
  await assert.rejects(()=>query('UPDATE encounters SET patient_id=$2 WHERE id=$1',[direct.id,p.patient8.id]),error=>error.code==='23514');assert.equal((await query('SELECT patient_id FROM encounters WHERE id=$1',[direct.id])).rows[0].patient_id,p.patient9.id);
 });
 await check('forward migration stops on incompatible historical clinical data and retains it unchanged',async()=>{
  const isolated=await f.cluster.database();
  try{
   await isolated.db.exec('CREATE EXTENSION vector; CREATE EXTENSION btree_gist;');await isolated.db.exec(readFileSync('prisma/roles.sql','utf8'));await isolated.db.exec('SET ROLE mediid_migrator');await isolated.db.exec('CREATE TABLE public._prisma_migrations(id varchar(36) PRIMARY KEY,checksum varchar(64) NOT NULL,finished_at timestamptz,migration_name varchar(255) NOT NULL,logs text,rolled_back_at timestamptz,started_at timestamptz NOT NULL DEFAULT now(),applied_steps_count integer NOT NULL DEFAULT 0)');
   const directories=readdirSync('prisma/migrations',{withFileTypes:true}).filter(entry=>entry.isDirectory()).map(entry=>entry.name).sort();
   for(const directory of directories.filter(name=>name<'202611010001_phase26_clinical_records'))await isolated.db.exec(readFileSync('prisma/migrations/'+directory+'/migration.sql','utf8'));
   await isolated.db.exec('RESET ROLE');await insert(isolated.db,'users',u.patient0);await insert(isolated.db,'patients',p.patient0);const id=f.newId();await insert(isolated.db,'allergies',{id,patient_id:p.patient0.id,substance:'Synthetic retained incompatible historical allergy',severity:'unsupported-historical'});
   await isolated.db.exec('SET ROLE mediid_migrator');await assert.rejects(()=>isolated.db.exec(readFileSync('prisma/migrations/202611010001_phase26_clinical_records/migration.sql','utf8')),error=>error.code==='23514');await isolated.db.exec('ROLLBACK');await isolated.db.exec('RESET ROLE');
   const retained=(await isolated.db.query('SELECT substance,severity FROM allergies WHERE id=$1',[id])).rows[0];assert.equal(retained.severity,'unsupported-historical');assert.equal(retained.substance,'Synthetic retained incompatible historical allergy');
  }finally{await isolated.db.close();}
 });
 writeFileSync('.test-data/phase26-clinical-result.json',JSON.stringify({status:'PASS',checks,synthetic:true,nativePostgres:true,migrationChecksum:f.migrationChecksum},null,2)+'\n');console.log('PASS Phase 2.6 clinical: '+checks.length+' checks.');
}finally{await f.close();}
