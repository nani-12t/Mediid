import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import {appointmentFixture,delay} from './phase25-fixtures.mjs';
import {insert} from './review-fixtures.mjs';
export {delay,insert};
export const uuid7=value=>assert.match(value,/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
export const allowed=result=>{assert.equal(result?.allowed,true,JSON.stringify(result));return result.data;};
export const denied=(result,reason)=>{assert.equal(result?.allowed,false,JSON.stringify(result));if(reason)assert.equal(result.reason,reason);return result;};
export const syntheticItems=()=>[
 {medicationName:'Synthetic Medicine Alpha',dosage:'Synthetic dose A',form:'tablet',frequency:'Synthetic frequency',duration:'Synthetic duration',quantity:2,instructions:'Synthetic instructions A'},
 {medicationName:'Synthetic Medicine Beta',dosage:'Synthetic dose B',form:'capsule',frequency:'Synthetic frequency',duration:'Synthetic duration',quantity:3,instructions:'Synthetic instructions B'}
];
export const documentInput=()=>({type:'other',title:'Synthetic Document Reference',fileUrl:'https://documents.example.invalid/secure/synthetic.pdf',fileName:'synthetic.pdf',fileSizeBytes:1200,mimeType:'application/pdf',notes:'Synthetic document metadata only'});
export async function clinicalFixture(options={}){
 const f=await appointmentFixture(options),{users:u,patients:p,doctors:d,hospitals:h,database:db,connections:c}=f;
 const query=(sql,args=[])=>db.db.query(sql,args);
 for(const [name,role]of [['buyer','buyer'],['pharmacy','pharmacy']])u[name]=await insert(db.db,'users',{id:f.newId(),email:name+'@clinical-synthetic.invalid',password_hash:f.hash,role,is_active:true,updated_at:new Date()});
 await f.command(u.admin,'policy',{hospitalId:h.hospital.id,confirmationMode:'MANUAL',depositRequired:false});
 await f.command(u.otherAdmin,'policy',{hospitalId:h.other.id,confirmationMode:'MANUAL',depositRequired:false});
 const read=async(actor,op,input={},connection=c[0])=>(await connection.query('SELECT public.mediid_clinical_read($1::uuid,$2::text,$3::jsonb) data',[actor?.id||actor,op,JSON.stringify({auditId:f.newId(),...input})])).rows[0].data;
 const command=async(actor,op,input={},connection=c[0])=>(await connection.query('SELECT public.mediid_clinical_command($1::uuid,$2::text,$3::jsonb) data',[actor?.id||actor,op,JSON.stringify({auditId:f.newId(),id:f.newId(),...input,...(op==='prescription'?{items:(input.items||syntheticItems()).map(item=>({id:f.newId(),...item}))}:{})})])).rows[0].data;
 let sequence=0;
 async function care({patient='patient0',doctor='doctor',organization='hospital',offsetMs,checkIn=true}={}){
  // Seed a complete operational context through all real constraints. Most care
  // windows started earlier today; distinct slots obey doctor overlap exclusion.
  // No retained slot or reservation timestamp is rewritten to simulate DB time.
  const start=new Date(Date.now()+(offsetMs??(-5400000+(sequence++)*180000))),end=new Date(+start+60000),table=organization==='clinic'?'private_clinic_appointments':'hospital_appointments',reference=organization==='clinic'?'private_clinic_appointment_id':'hospital_appointment_id';
  const result=await db.db.transaction(async tx=>{
   const slot=await insert(tx,'materialized_appointment_slots',{id:f.newId(),doctor_id:d[doctor].id,hospital_id:h[organization].id,slot_start:start,slot_end:end,channel:'FLEXIBLE',capacity:1,updated_at:new Date()});
   const coordinates=(await tx.query("SELECT ($1::timestamptz AT TIME ZONE 'Asia/Kolkata')::date::text date,to_char($1::timestamptz AT TIME ZONE 'Asia/Kolkata','HH24:MI') time",[start])).rows[0];
   const booking=await insert(tx,table,{id:f.newId(),patient_id:p[patient].id,doctor_id:d[doctor].id,[organization==='clinic'?'clinic_hospital_id':'hospital_id']:h[organization].id,slot_id:slot.id,appointment_date:coordinates.date,time_slot:coordinates.time,slot_start_time:start,slot_end_time:end,status:checkIn?'checked_in':'confirmed',appointment_channel:'OFFLINE',booking_channel:'WALK_IN',booked_by_user_id:u[doctor].id,handled_by_user_id:u[doctor].id,deposit_amount:'0.00',total_fee:'501.10',amount_paid:'0.00',payment_hold_status:'NONE',policy_snapshot:{},confirm_token:randomBytes(32).toString('hex'),updated_at:new Date()});
   await insert(tx,'appointment_slot_reservations',{id:f.newId(),slot_id:slot.id,[reference]:booking.id,actor_user_id:u[doctor].id,seat_number:1,status:'CONFIRMED'});
   const session=await insert(tx,'consultation_sessions',{id:f.newId(),patient_id:p[patient].id,doctor_id:d[doctor].id,hospital_id:h[organization].id,[reference]:booking.id,token:randomBytes(48).toString('hex'),status:'active',starts_at:new Date(+start-600000),expires_at:new Date(+start+7200000)});
   return{slot,booking,session};
  });
  return{...result,patient:p[patient],doctor:d[doctor],actor:u[doctor],organization:h[organization],table,reference};
 }
 const start=async(record,connection=c[0])=>allowed(await command(record.actor,'start',{appointmentId:record.booking.id},connection));
 const logs=async({actor,patient,status,action}={})=>(await query('SELECT * FROM access_logs WHERE ($1::uuid IS NULL OR accessed_by_id=$1) AND ($2::uuid IS NULL OR patient_id=$2) AND ($3::text IS NULL OR status=$3) AND ($4::text IS NULL OR action=$4) ORDER BY accessed_at,id',[actor?.id||actor||null,patient?.id||patient||null,status||null,action||null])).rows;
 const migrationChecksum=(await query("SELECT checksum FROM _prisma_migrations WHERE migration_name='202611010001_phase26_clinical_records' AND finished_at IS NOT NULL")).rows[0].checksum;
 return{...f,read,clinicalCommand:command,care,start,logs,query,migrationChecksum};
}
