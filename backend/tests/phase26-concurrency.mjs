import assert from 'node:assert/strict';
import {writeFileSync} from 'node:fs';
import {clinicalFixture,allowed,denied,delay,syntheticItems} from './helpers/phase26-fixtures.mjs';
const f=await clinicalFixture(),{users:u,patients:p,doctors:d,hospitals:h,connections:c,database:db}=f,races=[];
const command=f.clinicalCommand,query=f.query;let blockedPids=[];
async function race(name,operations){const pids=await Promise.all(c.slice(0,operations.length).map(async client=>(await client.query('SELECT pg_backend_pid() pid')).rows[0].pid));assert.equal(new Set(pids).size,operations.length);const result=await Promise.all(operations.map(operation=>operation()));races.push({name,pids,status:'PASS'});console.log('PASS clinical race: '+name);return result;}
async function heldByAdmin(sql,args,operation,waitMs=150){
 const administrator=await db.connect();blockedPids=await Promise.all([administrator,c[0]].map(async client=>(await client.query('SELECT pg_backend_pid() pid')).rows[0].pid));assert.equal(new Set(blockedPids).size,2);await administrator.query('BEGIN');let pending;
 try{await administrator.query(sql,args);pending=operation();await delay(waitMs);await administrator.query('COMMIT');return await pending;}catch(error){await administrator.query('ROLLBACK').catch(()=>{});await pending?.catch(()=>{});throw error;}finally{await administrator.end();}
}
try{
 const first=await f.care();
 const started=await race('independent simultaneous encounter starts return one canonical encounter',[()=>f.start(first,c[0]),()=>f.start(first,c[1])]);
 assert.equal(started[0].id,started[1].id);assert.equal((await query('SELECT count(*)::int n FROM encounters WHERE hospital_appointment_id=$1',[first.booking.id])).rows[0].n,1);
 allowed(await command(u.doctor,'complete',{encounterId:started[0].id}));
 const expiry=await f.care({patient:'patient1',offsetMs:-7200000+650}),expiryEncounter=await f.start(expiry);
 const before=(await query('SELECT count(*)::int n FROM prescriptions')).rows[0].n;
 const expired=await heldByAdmin('SELECT id FROM hospital_appointments WHERE id=$1 FOR UPDATE',[expiry.booking.id],()=>command(u.doctor,'prescription',{encounterId:expiryEncounter.id,appointmentId:expiry.booking.id,items:syntheticItems()},c[0]),950);
 denied(expired);assert.equal((await query('SELECT count(*)::int n FROM prescriptions')).rows[0].n,before);races.push({name:'prescription queued before DB expiry reauthorizes after authoritative parent lock wait',pids:blockedPids,status:'PASS'});console.log('PASS clinical race: prescription versus exact database expiry');
 const active=await f.care({patient:'patient2'}),aEncounter=await f.start(active),other=await f.care({patient:'patient3',doctor:'member',organization:'clinic'}),bEncounter=await f.start(other);
 const cross=await race('valid Patient A write races cross-patient B attack without B mutation',[()=>command(u.doctor,'note',{encounterId:aEncounter.id,noteType:'progress',assessment:'Synthetic authorized race'},c[0]),()=>command(u.doctor,'note',{encounterId:bEncounter.id,noteType:'progress',assessment:'Synthetic cross-patient forbidden race'},c[1])]);allowed(cross[0]);denied(cross[1]);assert.equal((await query('SELECT count(*)::int n FROM clinical_notes WHERE encounter_id=$1',[bEncounter.id])).rows[0].n,0);
 const membership=await f.care({patient:'patient4',organization:'other'}),memberEncounter=await f.start(membership);
 const removal=await heldByAdmin('DELETE FROM doctor_hospital_memberships WHERE doctor_id=$1 AND hospital_id=$2 RETURNING id',[d.doctor.id,h.other.id],()=>command(u.doctor,'vitals',{encounterId:memberEncounter.id,heartRate:70},c[0]),200);denied(removal);assert.equal((await query('SELECT count(*)::int n FROM vitals WHERE encounter_id=$1',[memberEncounter.id])).rows[0].n,0);races.push({name:'membership removal wins while blocked clinical write reevaluates current membership',pids:blockedPids,status:'PASS'});console.log('PASS clinical race: membership removal versus write');
 const finish=await f.care({patient:'patient5'}),finishEncounter=await f.start(finish);
 const completed=await race('simultaneous completion preserves stable one logical completion',[()=>command(u.doctor,'complete',{encounterId:finishEncounter.id},c[0]),()=>command(u.doctor,'complete',{encounterId:finishEncounter.id},c[1])]);const one=allowed(completed[0]),two=allowed(completed[1]);assert.equal(one.id,two.id);assert.equal(one.endTime,two.endTime);
 const state=(await query('SELECT e.status,e.end_time,a.status appointment,s.status consultation,s.completed_at FROM encounters e JOIN hospital_appointments a ON a.id=e.hospital_appointment_id JOIN consultation_sessions s ON s.hospital_appointment_id=a.id WHERE e.id=$1',[finishEncounter.id])).rows[0];assert.equal(state.status,'completed');assert.equal(state.appointment,'completed');assert.equal(state.consultation,'completed');assert.equal(+new Date(one.endTime),+state.end_time);
 const logsBefore=(await f.logs({actor:u.member,patient:p.patient11,status:'denied'})).length;
 const denials=await race('four independent denied EHR requests each retain their own immutable audit',[0,1,2,3].map(index=>()=>f.read(u.member,'ehr',{patientUid:p.patient11.uid},c[index])));denials.forEach(value=>denied(value));const logs=await f.logs({actor:u.member,patient:p.patient11,status:'denied'});assert.equal(logs.length,logsBefore+4);assert.equal(new Set(logs.map(log=>log.id)).size,logs.length);
 const final=await f.care({patient:'patient6'}),finalEncounter=await f.start(final);
 const endRace=await race('clinical write versus completion serializes to retained history or denial',[()=>command(u.doctor,'note',{encounterId:finalEncounter.id,noteType:'progress',assessment:'Synthetic final concurrent note'},c[0]),()=>command(u.doctor,'complete',{encounterId:finalEncounter.id},c[1])]);allowed(endRace[1]);assert.ok(endRace[0].allowed===true||endRace[0].allowed===false);assert.equal((await query('SELECT count(*)::int n FROM clinical_notes WHERE encounter_id=$1',[finalEncounter.id])).rows[0].n,endRace[0].allowed?1:0);
 writeFileSync('.test-data/phase26-clinical-concurrency.json',JSON.stringify({status:'PASS',synthetic:true,nativePostgres:true,races,migrationChecksum:f.migrationChecksum},null,2)+'\n');console.log('PASS Phase 2.6 clinical concurrency: '+races.length+' independent races.');
}finally{await f.close();}
