import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {randomBytes,createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import path from 'node:path';
import {startNativeCluster} from './native-cluster.mjs';
import {startRedis} from './redis-instance.mjs';
import {insert} from './review-fixtures.mjs';
const require=createRequire(import.meta.url),bcrypt=require('bcryptjs');
const {newPostgresId}=require('../../src/identifiers/uuid');
export const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
export const digest=token=>createHash('sha256').update(token).digest('hex');
export async function appointmentFixture({redis:withRedis=false}={}){
 const cluster=await startNativeCluster();let redis;
 try{
  if(withRedis)redis=await startRedis();
  const database=await cluster.database();await database.db.exec('CREATE EXTENSION vector; CREATE EXTENSION btree_gist;');await database.db.exec(readFileSync('prisma/roles.sql','utf8'));
  const credentials=Object.fromEntries(['mediid_migrator','mediid_runtime','mediid_diagnostics'].map(role=>[role,randomBytes(32).toString('hex')]));
  for(const [role,credential]of Object.entries(credentials))await cluster.admin.query('ALTER ROLE '+role+" LOGIN PASSWORD '"+credential+"'");
  const migrationUrl=database.url('mediid_migrator',credentials.mediid_migrator);
  const deployed=spawnSync(process.execPath,['scripts/prisma.cjs','deploy'],{env:{...process.env,NODE_ENV:'test',PG_ENV_FILE:path.join(cluster.root,'absent.env'),PG_MIGRATION_URL:migrationUrl},encoding:'utf8',windowsHide:true,timeout:120000});
  assert.equal(deployed.status,0,'Disposable appointment migration failed: '+(deployed.stderr||deployed.stdout||'').replaceAll(migrationUrl,'[redacted]').slice(-4000));
  const count=readdirSync('prisma/migrations',{withFileTypes:true}).filter(entry=>entry.isDirectory()).length;
  assert.equal((await database.db.query('SELECT count(*)::int n FROM _prisma_migrations WHERE finished_at IS NOT NULL')).rows[0].n,count);
  const password='SyntheticAppointmentPassword123!',hash=await bcrypt.hash(password,12),users={},patients={},doctors={},hospitals={};
  async function account(name,role,uid=null){
   const row=await insert(database.db,'users',{id:newPostgresId(),email:name.toLowerCase()+'@appointments-synthetic.invalid',password_hash:hash,role,uid,is_active:true,updated_at:new Date()});users[name]=row;return row;
  }
  for(let i=0;i<12;i++){
   const name='patient'+i,uid='MID-SYNTH'+String(i).padStart(3,'0'),actor=await account(name,'patient',uid);
   patients[name]=await insert(database.db,'patients',{id:newPostgresId(),user_id:actor.id,uid,first_name:'Synthetic',last_name:'Patient '+i,phone:'+910000000001',updated_at:new Date()});
   await insert(database.db,'auth_profiles',{user_id:actor.id,profile_kind:'patient',public_uid:uid,safe_profile:{_id:patients[name].id,uid,firstName:'Synthetic',lastName:'Patient '+i}});
  }
  for(const [name,role]of [['admin','hospital_admin'],['otherAdmin','hospital_admin'],['support','support_agent'],['unlinked','hospital_staff']])await account(name,role);
  for(const [name,uid]of [['doctor','DOC-SYNTH001'],['member','DOC-SYNTH002']]){
   const actor=await account(name,'doctor',uid);
   doctors[name]=await insert(database.db,'doctors',{id:newPostgresId(),user_id:actor.id,uid,first_name:'Synthetic',last_name:name,specialization:'Synthetic Medicine',consultation_fee:'501.10',is_private_practice:true,updated_at:new Date()});
   await insert(database.db,'auth_profiles',{user_id:actor.id,profile_kind:'doctor',public_uid:uid,safe_profile:{_id:doctors[name].id,uid,firstName:'Synthetic',lastName:name}});
  }
  for(const [name,admin,uid]of [['hospital','admin','HID-SYNTH001'],['other','otherAdmin','HID-SYNTH002']])hospitals[name]=await insert(database.db,'hospitals',{id:newPostgresId(),user_id:users[admin].id,uid,name:'Synthetic '+name,type:'private',updated_at:new Date()});
  hospitals.clinic=await insert(database.db,'hospitals',{id:newPostgresId(),uid:'HID-SYNTH003',name:'Synthetic Group Clinic',type:'clinic',clinic_owner_doctor_id:doctors.doctor.id,updated_at:new Date()});
  for(const doctor of Object.values(doctors))for(const hospital of Object.values(hospitals))await insert(database.db,'doctor_hospital_memberships',{id:newPostgresId(),doctor_id:doctor.id,hospital_id:hospital.id});
  for(const [name,role,organization,active]of [['receptionist','receptionist','hospital',true],['otherReceptionist','receptionist','other',true],['nurse','nurse','hospital',true],['lab','lab_technician','hospital',true],['pharmacist','pharmacist','hospital',true],['inactive','receptionist','hospital',false]]){
   const actor=await account(name,'hospital_staff','HID-SYNTH001-STF-'+name.toUpperCase());
   await insert(database.db,'hospital_memberships',{id:newPostgresId(),user_id:actor.id,hospital_id:hospitals[organization].id,uid:actor.uid,first_name:'Synthetic',last_name:name,role,is_active:active});
  }
  const connections=await Promise.all(Array.from({length:4},()=>database.connect('mediid_runtime',credentials.mediid_runtime)));
  assert.equal(new Set(await Promise.all(connections.map(async client=>(await client.query('SELECT pg_backend_pid() pid')).rows[0].pid))).size,4,'Independent native PostgreSQL sessions required.');
  let sequence=0;
  async function slot(extra={}){
   const start=new Date(Date.now()+40*86400000+(sequence++)*1800000);
   return insert(database.db,'materialized_appointment_slots',{id:newPostgresId(),doctor_id:doctors.doctor.id,hospital_id:hospitals.hospital.id,slot_start:start,slot_end:new Date(+start+900000),channel:'FLEXIBLE',capacity:1,updated_at:new Date(),...extra});
  }
  const command=async(actor,op,input,connection=connections[0])=>(await connection.query('SELECT public.mediid_appointment_command($1::uuid,$2::text,$3::jsonb) data',[typeof actor==='string'?actor:actor.id,op,JSON.stringify(input||{})])).rows[0].data;
  const read=async(actor,op,input={},connection=connections[0])=>(await connection.query('SELECT public.mediid_appointment_read($1::uuid,$2::text,$3::jsonb) data',[actor?(typeof actor==='string'?actor:actor.id):null,op,JSON.stringify(input)])).rows[0].data;
  const book=async(actor,selected,input={},connection=connections[0])=>command(actor,'book',{id:newPostgresId(),reservationId:newPostgresId(),slotId:selected.id,confirmationDigest:digest(randomBytes(32).toString('base64url')),...input},connection);
  const tick=async(connection=connections[0])=>(await connection.query('SELECT public.mediid_appointment_tick() data')).rows[0].data;
  const materialize=async(days=7,connection=connections[0])=>(await connection.query('SELECT public.mediid_appointment_materialize($1::integer) data',[days])).rows[0].data;
  async function materializedSlot({timezone='Asia/Kolkata',time='16:00',dayOffset=3,doctor_id=doctors.doctor.id,hospital_id=hospitals.hospital.id,capacity=1,channel='FLEXIBLE'}={}){
   const coordinates=(await database.db.query("SELECT ((clock_timestamp() AT TIME ZONE $1)::date+$2::int)::text date,to_char(((clock_timestamp() AT TIME ZONE $1)::date+$2::int),'FMDAY') weekday,to_char(date '2000-01-01'+$3::time+interval '15 minutes','HH24:MI') finish",[timezone,dayOffset,time])).rows[0];
   const template=await insert(database.db,'recurring_availability_templates',{id:newPostgresId(),doctor_id,hospital_id,day_of_week:coordinates.weekday.toUpperCase(),start_time:time,end_time:coordinates.finish,slot_duration:15,capacity_per_slot:capacity,channel,timezone,effective_from:coordinates.date,effective_until:coordinates.date,updated_at:new Date()});
   await materialize(7);
   const selected=(await database.db.query("SELECT s.*,($1::date)::text local_date,(s.slot_start AT TIME ZONE 'Asia/Kolkata')::date::text india_date FROM materialized_appointment_slots s WHERE doctor_id=$2 AND hospital_id=$3 AND slot_start=($1::date+$4::time) AT TIME ZONE $5 AND state='AVAILABLE'",[coordinates.date,doctor_id,hospital_id,time,timezone])).rows;
   assert.equal(selected.length,1,'A real recurring template must materialize exactly one fixture slot.');
   return {...selected[0],template};
  }
  const result={cluster,redis,database,credentials,password,hash,users,patients,doctors,hospitals,connections,slot,materializedSlot,command,read,book,tick,materialize,newId:newPostgresId,close:async()=>{await redis?.stop();await cluster.stop();}};
  return result;
 }catch(error){await redis?.stop();await cluster.stop();throw error;}
}
