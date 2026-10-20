import {randomUUID} from 'node:crypto';
export const id=()=>randomUUID();
export const corrective='202610200001_phase131_review';
export const originals=['202610190001_phase131_baseline','202610190002_phase131_constraints'];
export async function insert(db,table,data){const keys=Object.keys(data);return (await db.query('INSERT INTO '+table+' ('+keys.map(k=>'"'+k+'"').join(',')+') VALUES ('+keys.map((_,i)=>'$'+(i+1)).join(',')+') RETURNING *',Object.values(data))).rows[0];}
export async function fixtures(db){
 const actor=id(),actor2=id(),admin=id(),admin2=id(),patient=id(),patient2=id(),doctor=id(),doctor2=id(),hospital=id(),hospital2=id();
 for(const [user,email,role] of [[actor,'patient','patient'],[actor2,'patient2','patient'],[admin,'admin','hospital_admin'],[admin2,'admin2','hospital_admin']])await insert(db,'users',{id:user,email:email+'@synthetic.invalid',password_hash:'synthetic-only',role,updated_at:new Date()});
 for(const [org,user]of [[hospital,admin],[hospital2,admin2]])await insert(db,'hospitals',{id:org,user_id:user,uid:'HID-'+org.slice(0,8),name:'Synthetic hospital',updated_at:new Date()});
 for(const d of [doctor,doctor2])await insert(db,'doctors',{id:d,uid:'DOC-'+d,first_name:'Synthetic',last_name:'Doctor',specialization:'Test',updated_at:new Date()});
 for(const [p,u]of [[patient,actor],[patient2,actor2]])await insert(db,'patients',{id:p,user_id:u,uid:'MID-'+p.slice(0,8),first_name:'Synthetic',last_name:'Patient',updated_at:new Date()});
 let sequence=0;
 async function slot(extra={}){const start=new Date(Date.now()+86400000+(sequence++)*3600000);return insert(db,'materialized_appointment_slots',{id:id(),doctor_id:doctor,hospital_id:hospital,slot_start:start,slot_end:new Date(+start+1800000),updated_at:new Date(),...extra});}
 const table=d=>d==='legacy'?'appointments':d==='hospital'?'hospital_appointments':'private_clinic_appointments';
 const reference=d=>d==='legacy'?'appointment_id':d==='hospital'?'hospital_appointment_id':'private_clinic_appointment_id';
 async function historical(domain,extra={}){
  return insert(db,table(domain),{id:id(),patient_id:patient,doctor_id:doctor,[domain==='clinic'?'clinic_hospital_id':'hospital_id']:hospital,appointment_date:'2030-01-01',time_slot:'known synthetic historical time',confirm_token:id(),updated_at:new Date(),...(domain==='legacy'?{}:{legacy_source_id:id().replaceAll('-','').slice(0,24),legacy_imported_at:new Date(),slot_start_time:'2030-01-01T10:00:00Z',slot_end_time:'2030-01-01T10:30:00Z',deposit_amount:'250.00'}),...extra});
 }
 async function reserve(tx,b,domain,s,status='HELD',seat=1){return (await tx.query('INSERT INTO appointment_slot_reservations(id,slot_id,'+reference(domain)+',actor_user_id,seat_number,status,expires_at) VALUES($1,$2,$3,$4,$5,$6::\"ReservationStatus\",CASE WHEN $6::\"ReservationStatus\"=\'HELD\' THEN (SELECT hold_expires_at FROM '+table(domain)+' WHERE id=$3) ELSE NULL END) RETURNING *',[id(),s.id,b.id,actor,seat,status])).rows[0];}
 async function booking(s,domain='clinic',extra={},state='HELD'){
  return db.transaction(async tx=>{const b=await insert(tx,table(domain),{id:id(),patient_id:patient,doctor_id:s.doctor_id,[domain==='clinic'?'clinic_hospital_id':'hospital_id']:s.hospital_id,slot_id:s.id,appointment_date:new Date(s.slot_start).toISOString().slice(0,10),time_slot:'synthetic',slot_start_time:s.slot_start,slot_end_time:s.slot_end,booking_channel:'ONLINE_APP',appointment_channel:'ONLINE',payment_hold_status:'HELD',policy_snapshot:{},confirm_token:id(),updated_at:new Date(),...(domain==='clinic'?{deposit_amount:'250.00'}:{}),...extra});await reserve(tx,b,domain,s,state);return b;});
 }
 async function clinical(tx,kind,domain,b,extra={},org=true){return insert(tx,kind,{id:id(),patient_id:patient,doctor_id:doctor,[reference(domain)]:b.id,...(kind==='encounters'||org?{hospital_id:domain==='clinic'?b.clinic_hospital_id:b.hospital_id}:{}),...(kind==='consultation_sessions'?{token:id(),expires_at:new Date(Date.now()+3600000)}:{}),...extra});}
 return {actor,patient,patient2,doctor,doctor2,hospital,hospital2,slot,historical,booking,reserve,clinical,table,reference};
}
