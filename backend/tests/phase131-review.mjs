import {createSchemaDatabase,schemaReportUrl} from './helpers/schema-database.mjs';
import {readFileSync,writeFileSync} from 'node:fs';
import assert from 'node:assert/strict';
import {fixtures,insert,id,originals,corrective} from './helpers/review-fixtures.mjs';
const baseline=process.argv.includes('--reproduce');
const db=await createSchemaDatabase();
const results=[];
const sql=name=>readFileSync(new URL('../prisma/migrations/'+name+'/migration.sql',import.meta.url),'utf8');
async function check(name,fn){await fn();results.push(name);console.log((baseline?'REPRODUCED invalid write accepted: ':'PASS: ')+name);}
async function probe(name,fn){await check(name,async()=>{const marker=new Error('rollback reproduction');let accepted=false;try{await db.transaction(async tx=>{await fn(tx);accepted=true;throw marker;});assert.fail('Expected rollback');}catch(error){if(baseline){assert.equal(error,marker,error.message);assert.ok(accepted);}else assert.equal(error.code,'23514',error.message);}});}
try{
 for(const m of originals)await db.exec(sql(m));
 const f=await fixtures(db);
 const parents={};for(const d of ['legacy','hospital','clinic'])parents[d]=await f.historical(d);
 // Valid old rows with incomplete organization context are deterministically backfilled.
 const oldEncounter=await f.clinical(db,'encounters','legacy',parents.legacy,{hospital_id:null});
 const oldSession=await f.clinical(db,'consultation_sessions','hospital',parents.hospital,{},false);
 if(!baseline)await db.exec(sql(corrective));
 for(const domain of ['legacy','hospital','clinic']){
  const b=parents[domain];
  for(const kind of ['encounters','consultation_sessions']){
   for(const [field,value]of [['patient_id',f.patient2],['doctor_id',f.doctor2],...((kind==='encounters'||!baseline)?[['hospital_id',f.hospital2]]:[])]){
    await probe(kind+' '+domain+' INSERT rejects mismatched '+field,tx=>f.clinical(tx,kind,domain,b,{[field]:value},!baseline));
    const child=await f.clinical(db,kind,domain,b,{},!baseline);
    await probe(kind+' '+domain+' UPDATE rejects mismatched '+field,tx=>tx.query('UPDATE '+kind+' SET '+field+'=$1 WHERE id=$2',[value,child.id]));
   }
  }
  for(const [field,value]of [['patient_id',f.patient2],['doctor_id',f.doctor2],[domain==='clinic'?'clinic_hospital_id':'hospital_id',f.hospital2]])await probe(domain+' parent UPDATE preserves linked clinical context '+field,tx=>tx.query('UPDATE '+f.table(domain)+' SET '+field+'=$1 WHERE id=$2',[value,b.id]));
 }
 for(const domain of ['legacy','hospital','clinic']){
  const other=await f.historical(domain,{patient_id:f.patient2,doctor_id:f.doctor2});
  for(const kind of ['encounters','consultation_sessions']){
   const child=await f.clinical(db,kind,domain,parents[domain],{},!baseline);
   await probe(kind+' '+domain+' reference UPDATE cannot select a different patient/doctor parent',tx=>tx.query('UPDATE '+kind+' SET '+f.reference(domain)+'=$1 WHERE id=$2',[other.id,child.id]));
  }
  const sessionOnly=await f.historical(domain);await f.clinical(db,'consultation_sessions',domain,sessionOnly,{},!baseline);
  await probe(domain+' parent with only consultation links cannot change patient',tx=>tx.query('UPDATE '+f.table(domain)+' SET patient_id=$1 WHERE id=$2',[f.patient2,sessionOnly.id]));
 }
 const s=await f.slot();const online=await f.booking(s);
 await probe('same-slot ONLINE deposit cannot drop below 50 percent',tx=>tx.query('UPDATE private_clinic_appointments SET deposit_amount=0 WHERE id=$1',[online.id]));
 await probe('same-slot fee/deposit inconsistency rejected',tx=>tx.query('UPDATE private_clinic_appointments SET total_fee=600 WHERE id=$1',[online.id]));
 await probe('same-slot hold cannot extend beyond frozen deadline',tx=>tx.query("UPDATE private_clinic_appointments SET hold_expires_at=hold_expires_at+interval '2 hours' WHERE id=$1",[online.id]));
 await probe('same-slot channel/source change cannot bypass deposit policy',tx=>tx.query("UPDATE private_clinic_appointments SET appointment_channel='OFFLINE',booking_channel='PHONE',deposit_amount=0 WHERE id=$1",[online.id]));
 const near=await f.slot({slot_start:new Date(Date.now()+604000),slot_end:new Date(Date.now()+904000)});
 const held=await f.booking(near);
 await new Promise(resolve=>setTimeout(resolve,Math.max(0,+new Date(held.hold_expires_at)-Date.now()+50)));
 await probe('expired same-slot hold cannot be replaced with a fresh deadline',async tx=>{
  await tx.query("UPDATE appointment_slot_reservations SET status='RELEASED',released_at=now() WHERE private_clinic_appointment_id=$1",[held.id]);
  const renewed=(await tx.query("UPDATE private_clinic_appointments SET hold_expires_at=now()+interval '5 minutes' WHERE id=$1 RETURNING *",[held.id])).rows[0];
  await f.reserve(tx,renewed,'clinic',near);
 });
 await probe('expired same-slot hold cannot be replaced directly by a confirmed reservation',async tx=>{
  await tx.query("UPDATE appointment_slot_reservations SET status='RELEASED',released_at=now() WHERE private_clinic_appointment_id=$1",[held.id]);
  await f.reserve(tx,held,'clinic',near,'CONFIRMED');
 });
 if(!baseline){
  await check('migration backfills only authoritative organization context',async()=>{assert.equal((await db.query('SELECT hospital_id FROM encounters WHERE id=$1',[oldEncounter.id])).rows[0].hospital_id,f.hospital);assert.equal((await db.query('SELECT hospital_id FROM consultation_sessions WHERE id=$1',[oldSession.id])).rows[0].hospital_id,f.hospital);});
  await check('zero-reference direct encounters and multiple encounters per appointment remain valid',async()=>{await insert(db,'encounters',{id:id(),patient_id:f.patient,doctor_id:f.doctor});await f.clinical(db,'encounters','hospital',parents.hospital);await f.clinical(db,'encounters','hospital',parents.hospital);});
  await check('independent-clinic null organization is preserved exactly',async()=>{const b=await f.historical('clinic',{clinic_hospital_id:null});await f.clinical(db,'encounters','clinic',b);await f.clinical(db,'consultation_sessions','clinic',b);await assert.rejects(()=>f.clinical(db,'encounters','clinic',b,{hospital_id:f.hospital}),e=>e.code==='23514');});
  await check('consistent paired fee/deposit update retains original snapshot and deadline',async()=>{const b=(await db.query('UPDATE private_clinic_appointments SET total_fee=600,deposit_amount=300 WHERE id=$1 RETURNING *',[online.id])).rows[0];assert.equal(Number(b.deposit_amount),300);assert.deepEqual(b.policy_snapshot,online.policy_snapshot);assert.equal(+new Date(b.booked_at),+new Date(online.booked_at));assert.equal(+new Date(b.hold_expires_at),+new Date(online.hold_expires_at));});
  await check('offline bookings retain valid non-deposit updates',async()=>{const off=await f.booking(await f.slot(),'clinic',{appointment_channel:'OFFLINE',booking_channel:'WALK_IN',payment_hold_status:'NONE',deposit_amount:0},'CONFIRMED');await db.query('UPDATE private_clinic_appointments SET total_fee=100,deposit_amount=0 WHERE id=$1',[off.id]);});
  await check('final schema includes session organization FK and all parent context counters',async()=>{
   const columns=(await db.query("SELECT table_name,column_name FROM information_schema.columns WHERE table_schema='public' AND (column_name='clinical_context_version' OR (table_name='consultation_sessions' AND column_name='hospital_id'))")).rows;
   assert.equal(columns.length,4);
   assert.equal((await db.query("SELECT count(*)::int n FROM pg_constraint WHERE conname='consultation_sessions_hospital_id_fkey'")).rows[0].n,1);
  });
  await check('legacy missing time labels remain unknown without invented clinical times',async()=>{const legacy=await f.historical('legacy',{time_slot:'unknown'});await f.clinical(db,'encounters','legacy',legacy);assert.equal((await db.query('SELECT time_slot FROM appointments WHERE id=$1',[legacy.id])).rows[0].time_slot,'unknown');});
  await check('genuine slot reschedule takes a new snapshot and deadline atomically',async()=>{const next=await f.slot();await db.transaction(async tx=>{await tx.query("UPDATE appointment_slot_reservations SET status='RELEASED',released_at=now() WHERE private_clinic_appointment_id=$1",[online.id]);const b=(await tx.query('UPDATE private_clinic_appointments SET slot_id=$1,slot_start_time=$2,slot_end_time=$3,policy_snapshot=$4 WHERE id=$5 RETURNING *',[next.id,next.slot_start,next.slot_end,{paymentHoldWindowMinutes:30},online.id])).rows[0];await f.reserve(tx,b,'clinic',next);assert.notEqual(+new Date(b.booked_at),+new Date(online.booked_at));assert.equal(+new Date(b.hold_expires_at)-+new Date(b.booked_at),1800000);});});
 }
 if(!baseline){
  const dirty=await createSchemaDatabase();
  try{
   for(const m of originals)await dirty.exec(sql(m));
   const g=await fixtures(dirty);const parent=await g.historical('legacy');
   const invalid=await g.clinical(dirty,'encounters','legacy',parent,{patient_id:g.patient2});
   await check('corrective migration rejects inconsistent existing clinical links atomically',async()=>{
    await assert.rejects(()=>dirty.exec(sql(corrective)),error=>error.code==='23514');await dirty.exec('ROLLBACK');
    assert.equal((await dirty.query("SELECT count(*)::int n FROM information_schema.columns WHERE table_name='consultation_sessions' AND column_name='hospital_id'")).rows[0].n,0);
    assert.equal((await dirty.query('SELECT patient_id FROM encounters WHERE id=$1',[invalid.id])).rows[0].patient_id,g.patient2);
   });
   await dirty.query('DELETE FROM encounters WHERE id=$1',[invalid.id]);const old=await g.booking(await g.slot());await dirty.query('UPDATE private_clinic_appointments SET deposit_amount=0 WHERE id=$1',[old.id]);
   await check('corrective migration rejects existing policy violations without changing money',async()=>{
    await assert.rejects(()=>dirty.exec(sql(corrective)),error=>error.code==='23514');await dirty.exec('ROLLBACK');
    assert.equal(Number((await dirty.query('SELECT deposit_amount FROM private_clinic_appointments WHERE id=$1',[old.id])).rows[0].deposit_amount),0);
   });
  }finally{await dirty.close();}
 }
 writeFileSync(schemaReportUrl('phase131-review-'+(baseline?'reproduction':'postgres')+'.json'),JSON.stringify({mode:baseline?'original migrations: reproduced accepted invalid writes':'all three migrations: corrective checks',engine:(await db.query('SELECT version()')).rows[0].version,passed:results.length,checks:results,multiSession:false,synthetic:true},null,2)+'\n');
 console.log(results.length+' '+(baseline?'defects reproduced':'review checks passed'));
}catch(error){console.error('FAIL:',error.message,error.code||'',error.where||'');process.exitCode=1;}finally{await db.close();}
