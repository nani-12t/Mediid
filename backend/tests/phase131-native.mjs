import pg from 'pg';
import {execFileSync} from 'node:child_process';
import {existsSync,mkdirSync,mkdtempSync,readFileSync,writeFileSync} from 'node:fs';
import path from 'node:path';
import net from 'node:net';
import assert from 'node:assert/strict';
import {fixtures,insert,id,originals,corrective} from './helpers/review-fixtures.mjs';
const {Client}=pg;
const results=[];
const binary=process.env.MEDIID_TEST_PG_BIN || (process.platform==='win32'?path.join(process.env.ProgramFiles||'C:/Program Files','PostgreSQL','18','bin'):null);
const exe=name=>path.join(binary,name+(process.platform==='win32'?'.exe':''));
const report=new URL('../test-results/phase131-review-native.json',import.meta.url);
if(!binary||!existsSync(exe('initdb'))){writeFileSync(report,JSON.stringify({status:'NOT EXECUTED',reason:'Native initdb/pg_ctl unavailable; set MEDIID_TEST_PG_BIN.',phase21Gate:true},null,2)+'\n');console.log('NOT EXECUTED: native PostgreSQL unavailable; Phase 2.1 gate retained.');process.exit(0);}
const testRoot=path.resolve('.test-data');mkdirSync(testRoot,{recursive:true});const cluster=mkdtempSync(path.join(testRoot,'pg-review-'));const data=path.join(cluster,'data');
const lease=net.createServer();await new Promise(resolve=>lease.listen(0,'127.0.0.1',resolve));const port=lease.address().port;await new Promise(resolve=>lease.close(resolve));
let started=false;const clients=[];let vectorOmitted=false;
const env={...process.env};for(const k of Object.keys(env))if(k.startsWith('PG'))delete env[k];
const command=(name,args)=>execFileSync(exe(name),args,{env,encoding:'utf8',windowsHide:true,timeout:60000,stdio:'ignore'});
async function client(){const c=new Client({host:'127.0.0.1',port,user:'synthetic_review',database:'postgres',connectionTimeoutMillis:5000,statement_timeout:15000});await c.connect();clients.push(c);return c;}
async function blocked(observer,pid,by){const until=Date.now()+8000;while(Date.now()<until){const r=await observer.query('SELECT $1::int=ANY(pg_blocking_pids($2::int)) blocked',[by,pid]);if(r.rows[0].blocked)return;await new Promise(resolve=>setTimeout(resolve,25));}throw new Error('Expected independent connection lock was not observed');}
async function check(name,fn){await fn();results.push(name);console.log('PASS native: '+name);}
try{
 command('initdb',['-D',data,'-U','synthetic_review','-A','trust','--encoding=UTF8','--no-locale']);
 started=true;command('pg_ctl',['-D',data,'-l',path.join(cluster,'server.log'),'-o','-h 127.0.0.1 -p '+port,'-w','start']);started=true;
 const observer=await client(),a=await client(),b=await client();
 const pida=(await a.query('SELECT pg_backend_pid() pid')).rows[0].pid,pidb=(await b.query('SELECT pg_backend_pid() pid')).rows[0].pid;assert.notEqual(pida,pidb);
 const vector=(await observer.query("SELECT name FROM pg_available_extensions WHERE name='vector'")).rows.length>0;
 for(const name of [...originals,corrective]){
  let sql=readFileSync(new URL('../prisma/migrations/'+name+'/migration.sql',import.meta.url),'utf8');
  if(!vector && name===originals[0]){
   // Only an unused extension declaration is omitted; every table/index/trigger stays exact.
   assert.equal((sql.match(/vector/g)||[]).length,1,'Vector is now used by schema: run with pgvector installed');
   sql=sql.replace(/^CREATE EXTENSION IF NOT EXISTS "vector";\r?$/m,'-- Native environment lacks unused pgvector extension.');vectorOmitted=true;
  }
  await observer.query(sql);
 }
 const db={query:(s,args)=>observer.query(s,args),transaction:async fn=>{await observer.query('BEGIN');try{const r=await fn(observer);await observer.query('COMMIT');return r;}catch(error){await observer.query('ROLLBACK');throw error;}}};
 const f=await fixtures(db);let winner;
 await check('competing hospital/clinic connections cannot acquire the same seat',async()=>{
  const slot=await f.slot();await a.query('BEGIN');await b.query('BEGIN');
  const make=(c,domain)=>insert(c,f.table(domain),{id:id(),patient_id:f.patient,doctor_id:f.doctor,[domain==='hospital'?'hospital_id':'clinic_hospital_id']:f.hospital,slot_id:slot.id,slot_start_time:slot.slot_start,slot_end_time:slot.slot_end,appointment_date:new Date(slot.slot_start).toISOString().slice(0,10),time_slot:'synthetic',booking_channel:'WALK_IN',appointment_channel:'OFFLINE',payment_hold_status:'NONE',policy_snapshot:{},confirm_token:id(),updated_at:new Date(),...(domain==='clinic'?{deposit_amount:0}:{})});
  winner=await make(a,'hospital');
  await f.reserve(a,winner,'hospital',slot,'CONFIRMED');
  const second=(async()=>{const other=await make(b,'clinic');return f.reserve(b,other,'clinic',slot,'CONFIRMED');})().then(()=>({accepted:true}),error=>({error}));
  await blocked(observer,pidb,pida);await a.query('COMMIT');const outcome=await second;assert.equal(outcome.error?.code,'23505');await b.query('ROLLBACK');
  assert.equal((await observer.query("SELECT count(*)::int n FROM appointment_slot_reservations WHERE slot_id=$1 AND status IN ('HELD','CONFIRMED')",[slot.id])).rows[0].n,1);
 });
 for(const isolation of ['READ COMMITTED','REPEATABLE READ'])await check('competing refunds cannot exceed capture under '+isolation,async()=>{
  const payment=await insert(observer,'appointment_payments',{id:id(),hospital_appointment_id:winner.id,actor_user_id:f.actor,amount:100,currency:'INR',provider:'synthetic',provider_transaction_ref:id(),idempotency_key:id(),status:'CAPTURED',captured_at:new Date()});
  await a.query('BEGIN');await b.query('BEGIN ISOLATION LEVEL '+isolation);
  await b.query('SELECT refund_allocated FROM appointment_payments WHERE id=$1',[payment.id]);
  const refund=c=>insert(c,'appointment_refunds',{id:id(),payment_id:payment.id,hospital_appointment_id:winner.id,actor_user_id:f.actor,amount:70,currency:'INR',provider:'synthetic',idempotency_key:id()});
  await refund(a);const second=refund(b).then(()=>({accepted:true}),error=>({error}));await blocked(observer,pidb,pida);await a.query('COMMIT');const outcome=await second;assert.equal(outcome.error?.code,isolation==='READ COMMITTED'?'23514':'40001');await b.query('ROLLBACK');
  const sum=(await observer.query('SELECT COALESCE(sum(amount),0)::text n FROM appointment_refunds WHERE payment_id=$1',[payment.id])).rows[0].n;assert.equal(Number(sum),70);assert.equal(Number((await observer.query('SELECT refund_allocated FROM appointment_payments WHERE id=$1',[payment.id])).rows[0].refund_allocated),70);
 });
 await check('independent parent edit cannot race a clinical link at REPEATABLE READ',async()=>{
  const parent=await f.historical('legacy');await b.query('BEGIN ISOLATION LEVEL REPEATABLE READ');await b.query('SELECT patient_id FROM appointments WHERE id=$1',[parent.id]);await a.query('BEGIN');await f.clinical(a,'encounters','legacy',parent);
  const edit=b.query('UPDATE appointments SET patient_id=$1 WHERE id=$2',[f.patient2,parent.id]).then(()=>({accepted:true}),error=>({error}));await blocked(observer,pidb,pida);await a.query('COMMIT');const outcome=await edit;assert.equal(outcome.error?.code,'40001');await b.query('ROLLBACK');
  assert.equal((await observer.query('SELECT patient_id FROM appointments WHERE id=$1',[parent.id])).rows[0].patient_id,f.patient);
 });
 writeFileSync(report,JSON.stringify({status:'PASS',engine:(await observer.query('SELECT version()')).rows[0].version,independentBackendPids:[pida,pidb],passed:results.length,checks:results,synthetic:true,productionAccess:false,unusedVectorDeclarationOmitted:vectorOmitted,fullUnmodifiedNativeMigrationGate:vectorOmitted?'NOT EXECUTED: install pgvector before Phase 2.1':'PASS'},null,2)+'\n');
}catch(error){console.error('FAIL native:',error.message,error.code||'');process.exitCode=1;writeFileSync(report,JSON.stringify({status:'FAILED',error:error.message,checks:results},null,2)+'\n');}
finally{await Promise.allSettled(clients.map(c=>c.end()));if(started)command('pg_ctl',['-D',data,'-m','immediate','-w','stop']);}
