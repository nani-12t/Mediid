import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { generateKeyPairSync, randomBytes } from 'node:crypto';
import { createRequire } from 'node:module';
import http from 'node:http';
import path from 'node:path';
import { startNativeCluster } from './helpers/native-cluster.mjs';
import { startRedis } from './helpers/redis-instance.mjs';
import { insert } from './helpers/review-fixtures.mjs';
const require = createRequire(import.meta.url);
const express = require('express');
const { newPostgresId, mongoObjectIdToUuid } = require('../src/identifiers/uuid');
const { startAuthRuntime } = require('../src/auth/runtime');
const { PostgresInfrastructure } = require('../src/infrastructure/postgres/client');
const { runtimeConfig } = require('../src/infrastructure/postgres/config');
const { Organizations } = require('../src/organizations/services');
const { createOrganizationRouter } = require('../src/organizations/http');
const checks = [];
const code = expected => error => error.code === expected;
const denied = fn => assert.rejects(fn, error => error.code === '42501');
async function check(name, fn) { await fn(); checks.push(name); console.log('PASS group clinic: ' + name); }
let cluster, redis, runtime, first, second, server;
try {
  cluster = await startNativeCluster(); redis = await startRedis();
  const database = await cluster.database();
  await database.db.exec('CREATE EXTENSION vector; CREATE EXTENSION btree_gist;');
  await database.db.exec(readFileSync('prisma/roles.sql', 'utf8'));
  const credentials = Object.fromEntries(['mediid_migrator','mediid_runtime','mediid_diagnostics'].map(role => [role,randomBytes(32).toString('hex')]));
  for (const [role, credential] of Object.entries(credentials)) await cluster.admin.query('ALTER ROLE ' + role + " LOGIN PASSWORD '" + credential + "'");
  await check('new forward migration deploys with the actual non-superuser migrator', async () => {
    const deployed = spawnSync(process.execPath,['scripts/prisma.cjs','deploy'],{
      env:{...process.env,NODE_ENV:'test',PG_ENV_FILE:path.join(cluster.root,'absent.env'),PG_MIGRATION_URL:database.url('mediid_migrator',credentials.mediid_migrator)},
      encoding:'utf8',windowsHide:true,timeout:120000
    });
    assert.equal(deployed.status,0,deployed.stdout+deployed.stderr);
    const expected=readdirSync('prisma/migrations',{withFileTypes:true}).filter(entry=>entry.isDirectory()).length;
    assert.equal((await database.db.query('SELECT count(*)::int n FROM _prisma_migrations WHERE finished_at IS NOT NULL')).rows[0].n,expected);
    assert.equal((await database.db.query("SELECT count(*)::int n FROM _prisma_migrations WHERE migration_name='202610280001_phase23_group_clinic_membership' AND finished_at IS NOT NULL")).rows[0].n,1);
  });
  const pair=generateKeyPairSync('rsa',{modulusLength:2048}),origin='https://synthetic-group-clinic.invalid';
  process.env.NODE_ENV='test';process.env.PG_RUNTIME_URL=database.url('mediid_runtime',credentials.mediid_runtime);
  runtime=await startAuthRuntime({
    NODE_ENV:'test',AUTH_BACKEND:'postgres',CLIENT_URL:origin,AUTH_ALLOWED_ORIGINS:origin,
    AUTH_JWT_ISSUER:'mediid-group-clinic-synthetic',AUTH_JWT_AUDIENCE:'mediid-group-clinic-synthetic-api',
    AUTH_JWT_KEY_ID:'synthetic-group-clinic-key',AUTH_JWT_TTL_SECONDS:'900',AUTH_BCRYPT_COST:'12',AUTH_RESET_TTL_SECONDS:'900',
    AUTH_JWT_PRIVATE_KEY:pair.privateKey.export({type:'pkcs8',format:'pem'}),AUTH_JWT_PUBLIC_KEY:pair.publicKey.export({type:'spki',format:'pem'}),
    AUTH_REDIS_URL:redis.url,AUTH_RATE_KEY_SECRET:randomBytes(32).toString('hex'),
    SMTP_HOST:'127.0.0.1',SMTP_PORT:'587',SMTP_USER:'synthetic',SMTP_PASS:randomBytes(32).toString('hex'),SMTP_FROM:'synthetic@example.invalid'
  });
  const service=new Organizations(runtime,{clientUrl:origin}),password='SyntheticGroupClinicPassword123!';
  const hash=await runtime.provisioning.passwords.hash(password);
  const user=(role,email,uid=null)=>insert(database.db,'users',{id:newPostgresId(),role,email,uid,password_hash:hash,is_active:true,updated_at:new Date()});
  const owner=await user('doctor','group-owner@example.invalid','DOC-GROUPA01');
  const member=await user('doctor','group-member@example.invalid','DOC-GROUPB01');
  const unrelated=await user('doctor','group-unrelated@example.invalid','DOC-GROUPC01');
  const admin=await user('hospital_admin','group-admin@example.invalid');
  const staff=await user('hospital_staff','group-staff@example.invalid');
  const support=await user('support_agent','group-support@example.invalid');
  const patient=await user('patient','group-patient@example.invalid');
  const ownerDoctor=newPostgresId(),memberDoctor=newPostgresId(),unrelatedDoctor=newPostgresId(),hospital=newPostgresId();
  await insert(database.db,'hospitals',{id:hospital,user_id:admin.id,uid:'HID-GROUPH01',name:'Synthetic Unrelated Hospital',type:'private',updated_at:new Date()});
  for(const [id,account,isPrivate]of [[ownerDoctor,owner,true],[memberDoctor,member,false],[unrelatedDoctor,unrelated,true]]) {
    await insert(database.db,'doctors',{id,user_id:account.id,uid:account.uid,first_name:'Synthetic',last_name:account===owner?'Owner':account===member?'Member':'Unrelated',specialization:'Synthetic Medicine',email:account.email,phone:'+910000000001',registration_number:'PRIVATE-DOCTOR-REGISTRATION',is_private_practice:isPrivate,updated_at:new Date()});
  }
  await insert(database.db,'doctor_hospital_memberships',{id:newPostgresId(),doctor_id:memberDoctor,hospital_id:hospital,is_primary:true});
  await database.db.query('UPDATE doctors SET primary_hospital_id=$1 WHERE id=$2',[hospital,memberDoctor]);
  await insert(database.db,'auth_profiles',{user_id:member.id,profile_kind:'doctor',public_uid:member.uid,safe_profile:{_id:memberDoctor,id:memberDoctor,uid:member.uid,firstName:'Synthetic',lastName:'Member',specialization:'Synthetic Medicine'}});
  const concurrentDoctor=newPostgresId(),unlinkedDoctor=newPostgresId(),inactiveDoctor=newPostgresId();
  for(const [id,uid,isActive]of [[concurrentDoctor,'DOC-CONCUR01',true],[unlinkedDoctor,'DOC-UNLINKED1',true],[inactiveDoctor,'DOC-INACTIVE1',false]]) {
    await insert(database.db,'doctors',{id,uid,first_name:'Synthetic',last_name:'Unlinked',specialization:'Synthetic Medicine',is_active:isActive,updated_at:new Date()});
  }
  const badUser=await user('doctor','group-inactive-target@example.invalid','DOC-BADUSER1'),badDoctor=newPostgresId();
  await insert(database.db,'doctors',{id:badDoctor,user_id:badUser.id,uid:badUser.uid,first_name:'Inactive',last_name:'Identity',specialization:'Synthetic Medicine',updated_at:new Date()});
  const app=express();app.use(express.json());app.use('/api',createOrganizationRouter(runtime,service));
  server=http.createServer(app);await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const base='http://127.0.0.1:'+server.address().port,tokens=new Map();
  for(const actor of [owner,member,unrelated,admin,staff,support,patient]) tokens.set(actor.id,(await runtime.sessions.login(actor.email,password)).token);
  async function api(route,{method='GET',actor,body,token,requestOrigin=origin}={}) {
    const response=await fetch(base+route,{method,headers:{...(body===undefined?{}:{'Content-Type':'application/json'}),...(requestOrigin?{Origin:requestOrigin}:{}),...((token||actor)?{Authorization:'Bearer '+(token||tokens.get(actor.id))}:{})},...(body===undefined?{}:{body:JSON.stringify(body)}),signal:AbortSignal.timeout(15000)});
    const raw=await response.text();let result;try{result=JSON.parse(raw);}catch{result=raw;}
    return {status:response.status,body:result};
  }
  const created=await api('/api/hospitals',{method:'POST',actor:owner,body:{name:'Synthetic Group Private Clinic',type:'clinic'}});
  assert.equal(created.status,201);const clinic=created.body.internalId;
  const membersPath='/api/hospitals/'+clinic+'/doctor-memberships';
  const calendarPath='/api/doctor-portal/availability-templates';
  const calendarDraft={hospitalId:clinic,dayOfWeek:'MONDAY',startTime:'09:00',endTime:'11:00',slotDuration:30,capacityPerSlot:1,channel:'OFFLINE',timezone:'Asia/Kolkata',effectiveFrom:'2030-01-01'};
  const clinicRows=async doctor=>(await database.db.query('SELECT * FROM doctor_hospital_memberships WHERE doctor_id=$1 AND hospital_id=$2',[doctor,clinic])).rows;
  const auditRows=async doctor=>(await database.db.query('SELECT * FROM auth_provisioning_audit WHERE doctor_id=$1 AND hospital_id=$2 AND action=ANY($3::text[]) ORDER BY occurred_at,id',[doctor,clinic,['clinic_membership_added','clinic_membership_removed']])).rows;
  await check('normal provider runtime uses restricted mediid_runtime PostgreSQL credentials and real sessions',async()=>{
    assert.equal((await runtime.postgres.client.$queryRawUnsafe('SELECT current_user AS role'))[0].role,'mediid_runtime');
    assert.equal((await runtime.sessions.authenticate(tokens.get(owner.id))).id,owner.id);
    assert.equal((await runtime.sessions.authenticate(tokens.get(member.id))).role,'doctor');
  });
  let membership;
  await check('clinic owner adds active Doctor B through the existing authenticated provider API',async()=>{
    const result=await api(membersPath,{method:'POST',actor:owner,body:{doctorId:memberDoctor}});
    assert.equal(result.status,201);membership=result.body;
    assert.deepEqual(Object.keys(membership).sort(),['doctorId','hospitalId','id','isPrimary']);
    assert.equal(membership.doctorId,memberDoctor);assert.equal(membership.hospitalId,clinic);assert.equal(membership.isPrimary,false);
  });
  await check('Doctor B receives exactly one membership and an attributable nonsecret audit entry',async()=>{
    const rows=await clinicRows(memberDoctor);assert.equal(rows.length,1);assert.equal(rows[0].id,membership.id);
    const audit=await auditRows(memberDoctor);assert.equal(audit.length,1);assert.equal(audit[0].action,'clinic_membership_added');assert.equal(audit[0].actor_user_id,owner.id);assert.equal(audit[0].hospital_id,clinic);
    assert.ok(!JSON.stringify(audit).includes(password));assert.ok(!JSON.stringify(audit).includes(hash));
    assert.equal((await database.db.query('SELECT primary_hospital_id FROM doctors WHERE id=$1',[memberDoctor])).rows[0].primary_hospital_id,hospital);
  });
  await check('owner and member remain doctors without hospital admin receptionist or new user authority',async()=>{
    for(const actor of [owner,member]) {
      assert.equal((await database.db.query('SELECT role::text role FROM users WHERE id=$1',[actor.id])).rows[0].role,'doctor');
      assert.equal((await runtime.sessions.authenticate(tokens.get(actor.id))).role,'doctor');
      assert.equal((await api('/api/hospitals/admin/profile',{actor})).status,403);
      assert.equal((await api('/api/staff',{actor})).status,403);
      assert.equal((await api('/api/staff',{method:'POST',actor,body:{hospitalId:clinic,firstName:'Forbidden',lastName:'Reception',role:'receptionist'}})).status,403);
    }
    assert.equal((await database.db.query('SELECT count(*)::int n FROM hospital_memberships WHERE hospital_id=$1',[clinic])).rows[0].n,0);
    assert.equal((await database.db.query('SELECT user_id,clinic_owner_doctor_id FROM hospitals WHERE id=$1',[clinic])).rows[0].user_id,null);
    assert.equal((await database.db.query('SELECT clinic_owner_doctor_id FROM hospitals WHERE id=$1',[clinic])).rows[0].clinic_owner_doctor_id,ownerDoctor);
  });
  await check('public clinic search and detail reflect owner plus explicit member without private doctor contacts',async()=>{
    const list=await api('/api/doctors?hospital='+clinic),detail=await api('/api/hospitals/'+clinic);
    assert.equal(list.status,200);assert.equal(detail.status,200);
    for(const rows of [list.body,detail.body.doctors]) {
      assert.deepEqual(rows.map(row=>row.internalId).sort(),[ownerDoctor,memberDoctor].sort());
      for(const row of rows) {
        assert.ok([owner.uid,member.uid].includes(row.uid));
        assert.ok(row.memberships.some(item=>item.hospital.internalId===clinic));
        for(const field of ['email','phone','registrationNumber','userId','passwordHash','activation'])assert.equal(field in row,false,field);
      }
    }
  });
  let ownerTemplate,memberTemplate;
  await check('group-clinic member manages only their own clinic-context recurring availability',async()=>{
    const a=await api(calendarPath,{method:'POST',actor:owner,body:calendarDraft});
    const b=await api(calendarPath,{method:'POST',actor:member,body:{...calendarDraft,dayOfWeek:'TUESDAY'}});
    assert.equal(a.status,201);assert.equal(b.status,201);ownerTemplate=a.body;memberTemplate=b.body;
    assert.equal(memberTemplate.doctorId,memberDoctor);assert.equal(memberTemplate.hospitalId,clinic);
    const changed=await api(calendarPath+'/'+memberTemplate.id,{method:'PUT',actor:member,body:{endTime:'12:00'}});
    assert.equal(changed.status,200);assert.equal(changed.body.endTime,'12:00');
    assert.ok((await api(calendarPath,{actor:member})).body.some(row=>row.id===memberTemplate.id));
  });
  await check('Doctor B cannot modify or delete Doctor A availability',async()=>{
    for(const mutation of [{method:'PUT',body:{endTime:'13:00'}},{method:'DELETE'}])assert.equal((await api(calendarPath+'/'+ownerTemplate.id,{actor:member,...mutation})).status,403);
    assert.equal((await api(calendarPath,{method:'POST',actor:member,body:{...calendarDraft,doctorId:ownerDoctor}})).status,403);
    assert.ok(!(await api(calendarPath,{actor:member})).body.some(row=>row.doctorId===ownerDoctor));
  });
  await check('clinic ownership never permits rewriting another member calendar',async()=>{
    for(const mutation of [{method:'PUT',body:{endTime:'13:00'}},{method:'DELETE'}])assert.equal((await api(calendarPath+'/'+memberTemplate.id,{actor:owner,...mutation})).status,403);
    assert.equal((await api(calendarPath,{method:'POST',actor:owner,body:{...calendarDraft,doctorId:memberDoctor}})).status,403);
  });
  for(const [label,actor]of [['unrelated private doctor',unrelated],['unrelated hospital admin',admin],['hospital staff',staff],['support agent',support],['patient',patient]]) {
    await check(label+' cannot add or remove clinic members',async()=>{
      assert.equal((await api(membersPath,{method:'POST',actor,body:{doctorId:unlinkedDoctor}})).status,403);
      assert.equal((await api(membersPath+'/'+memberDoctor,{method:'DELETE',actor})).status,403);
      assert.equal((await clinicRows(memberDoctor)).length,1);
      if(actor!==unrelated)assert.equal((await api(calendarPath+'/'+memberTemplate.id,{method:'PUT',actor,body:{endTime:'13:00'}})).status,403);
    });
  }
  await check('membership requests reject missing sessions forged tokens malicious fields and implicit public UID identifiers',async()=>{
    assert.equal((await api(membersPath,{method:'POST',body:{doctorId:unlinkedDoctor}})).status,401);
    assert.equal((await api(membersPath,{method:'POST',token:'unverified.claims.here',body:{doctorId:unlinkedDoctor}})).status,401);
    for(const body of [null,[],{}, {doctorId:member.uid},{doctorId:'not-an-id'},{doctorId:unlinkedDoctor,role:'hospital_admin'},{doctorId:unlinkedDoctor,isPrimary:true},{doctorId:unlinkedDoctor,actorId:owner.id},{doctorId:unlinkedDoctor,hospitalId:hospital},{doctorId:unlinkedDoctor,uid:'DOC-FORGED01'}]) {
      assert.equal((await api(membersPath,{method:'POST',actor:owner,body})).status,400);
    }
    assert.equal((await api(membersPath,{method:'POST',actor:owner,body:{doctorId:unlinkedDoctor},requestOrigin:'https://attacker.invalid'})).status,403);
    assert.equal((await clinicRows(unlinkedDoctor)).length,0);
    await assert.rejects(()=>service.addClinicDoctorMembership({...support,role:'doctor'},clinic,{doctorId:unlinkedDoctor}),code('ORG_FORBIDDEN'));
  });
  await check('target must be an active doctor with an active doctor-role user when linked',async()=>{
    assert.ok([403,404].includes((await api(membersPath,{method:'POST',actor:owner,body:{doctorId:inactiveDoctor}})).status));
    await database.db.query('UPDATE users SET is_active=false WHERE id=$1',[badUser.id]);
    assert.equal((await api(membersPath,{method:'POST',actor:owner,body:{doctorId:badDoctor}})).status,403);
    await database.db.query("UPDATE users SET is_active=true,role='patient' WHERE id=$1",[badUser.id]);
    assert.equal((await api(membersPath,{method:'POST',actor:owner,body:{doctorId:badDoctor}})).status,403);
    await database.db.query("UPDATE users SET role='doctor' WHERE id=$1",[badUser.id]);
    const result=await api(membersPath,{method:'POST',actor:owner,body:{doctorId:unlinkedDoctor}});
    assert.equal(result.status,201);assert.equal((await clinicRows(unlinkedDoctor)).length,1);
    assert.equal((await database.db.query('SELECT user_id FROM doctors WHERE id=$1',[unlinkedDoctor])).rows[0].user_id,null);
  });
  await check('owner identity doctor profile and clinic must remain active and owned by the authenticated doctor',async()=>{
    await database.db.query('UPDATE users SET is_active=false WHERE id=$1',[owner.id]);
    assert.ok([401,403].includes((await api(membersPath,{method:'POST',actor:owner,body:{doctorId:badDoctor}})).status));
    await database.db.query("UPDATE users SET is_active=true,role='hospital_admin' WHERE id=$1",[owner.id]);
    assert.ok([401,403].includes((await api(membersPath,{method:'POST',actor:owner,body:{doctorId:badDoctor}})).status));
    await database.db.query("UPDATE users SET role='doctor' WHERE id=$1",[owner.id]);
    tokens.set(owner.id,(await runtime.sessions.login(owner.email,password)).token);
    await database.db.query('UPDATE doctors SET is_active=false WHERE id=$1',[ownerDoctor]);
    assert.ok([401,403].includes((await api(membersPath,{method:'POST',actor:owner,body:{doctorId:badDoctor}})).status));
    await database.db.query('UPDATE doctors SET is_active=true WHERE id=$1',[ownerDoctor]);
    await database.db.query('UPDATE hospitals SET is_active=false WHERE id=$1',[clinic]);
    assert.ok([403,404].includes((await api(membersPath,{method:'POST',actor:owner,body:{doctorId:badDoctor}})).status));
    await database.db.query('UPDATE hospitals SET is_active=true WHERE id=$1',[clinic]);
    assert.equal((await api('/api/hospitals/'+hospital+'/doctor-memberships',{method:'POST',actor:owner,body:{doctorId:badDoctor}})).status,403);
    assert.equal((await clinicRows(badDoctor)).length,0);
  });
  await check('mapped legacy doctor IDs resolve through recorded frozen mapping and unrecorded guesses fail closed',async()=>{
    const mongoUser='1234567890abcdef123456a0',mongoDoctor='1234567890abcdef123456a1',unmappedMongo='1234567890abcdef123456a2';
    const importedUser=await insert(database.db,'users',{id:mongoObjectIdToUuid(mongoUser),role:'doctor',email:'group-imported@example.invalid',uid:'DOC-IMPORTED1',password_hash:hash,updated_at:new Date()});
    const importedDoctor=mongoObjectIdToUuid(mongoDoctor);
    for(const [id,uid,linked]of [[importedDoctor,'DOC-IMPORTED1',importedUser.id],[mongoObjectIdToUuid(unmappedMongo),'DOC-UNMAPPED1',null]])await insert(database.db,'doctors',{id,user_id:linked,uid,first_name:'Imported',last_name:'Synthetic',specialization:'Synthetic Medicine',updated_at:new Date()});
    await insert(database.db,'auth_legacy_links',{user_id:importedUser.id,mongo_user_id:mongoUser,doctor_mongo_id:mongoDoctor,source_fingerprint:'a'.repeat(64)});
    assert.equal((await api(membersPath,{method:'POST',actor:owner,body:{doctorId:unmappedMongo}})).status,404);
    const added=await api(membersPath,{method:'POST',actor:owner,body:{doctorId:mongoDoctor}});
    assert.equal(added.status,201);assert.equal(added.body.doctorId,importedDoctor);
    assert.equal((await api(membersPath+'/'+mongoDoctor,{method:'DELETE',actor:owner})).status,200);
    assert.equal((await clinicRows(importedDoctor)).length,0);
    assert.equal((await api('/api/hospitals/'+created.body.uid+'/doctor-memberships',{method:'POST',actor:owner,body:{doctorId:importedDoctor}})).status,400);
  });
  await check('sequential duplicates preserve exactly one membership and one add audit',async()=>{
    const before=await auditRows(memberDoctor);
    assert.equal((await api(membersPath,{method:'POST',actor:owner,body:{doctorId:memberDoctor}})).status,409);
    assert.equal((await clinicRows(memberDoctor)).length,1);assert.equal((await auditRows(memberDoctor)).length,before.length);
  });
  first=new PostgresInfrastructure(runtimeConfig({NODE_ENV:'test',PG_RUNTIME_URL:process.env.PG_RUNTIME_URL,PG_POOL_SIZE:'1'}));
  second=new PostgresInfrastructure(runtimeConfig({NODE_ENV:'test',PG_RUNTIME_URL:process.env.PG_RUNTIME_URL,PG_POOL_SIZE:'1'}));
  await first.start();await second.start();
  await first.client.$executeRawUnsafe("SET statement_timeout = '10s'");
  await second.client.$executeRawUnsafe("SET statement_timeout = '10s'");
  const serviceA=new Organizations({...runtime,postgres:first},{clientUrl:origin}),serviceB=new Organizations({...runtime,postgres:second},{clientUrl:origin});
  await check('native concurrent duplicate creation on independent restricted connections produces one membership and audit',async()=>{
    const a=(await first.client.$queryRawUnsafe('SELECT pg_backend_pid() AS pid,current_user AS role'))[0];
    const b=(await second.client.$queryRawUnsafe('SELECT pg_backend_pid() AS pid,current_user AS role'))[0];
    assert.notEqual(a.pid,b.pid);assert.equal(a.role,'mediid_runtime');assert.equal(b.role,'mediid_runtime');
    const outcomes=await Promise.allSettled([serviceA.addClinicDoctorMembership(owner,clinic,{doctorId:concurrentDoctor}),serviceB.addClinicDoctorMembership(owner,clinic,{doctorId:concurrentDoctor})]);
    assert.equal(outcomes.filter(result=>result.status==='fulfilled').length,1);
    assert.equal(outcomes.find(result=>result.status==='rejected').reason.code,'ORG_CONFLICT');
    assert.equal((await clinicRows(concurrentDoctor)).length,1);
    const audit=await auditRows(concurrentDoctor);assert.equal(audit.length,1);assert.equal(audit[0].action,'clinic_membership_added');assert.equal(audit[0].actor_user_id,owner.id);
  });
  await check('template creation racing member removal completes without deadlock and preserves membership authorization',async()=>{
    const added=await service.addClinicDoctorMembership(owner,clinic,{doctorId:badDoctor});
    assert.equal(added.doctorId,badDoctor);
    let timer;
    const started=Date.now();
    const operations=Promise.allSettled([
      serviceA.createTemplate(badUser,{...calendarDraft,dayOfWeek:'THURSDAY'}),
      serviceB.removeClinicDoctorMembership(owner,clinic,badDoctor)
    ]);
    let results;
    try{results=await Promise.race([operations,new Promise((resolve,reject)=>{timer=setTimeout(()=>reject(new Error('Concurrent template creation and membership removal exceeded 15 seconds.')),15000);})]);}
    finally{clearTimeout(timer);}
    assert.ok(Date.now()-started<15000);
    assert.equal(results[1].status,'fulfilled');
    if(results[0].status==='rejected')assert.equal(results[0].reason.code,'ORG_FORBIDDEN');
    assert.equal((await clinicRows(badDoctor)).length,0);
    await assert.rejects(()=>serviceA.createTemplate(badUser,{...calendarDraft,dayOfWeek:'FRIDAY'}),code('ORG_FORBIDDEN'));
    if(results[0].status==='fulfilled')await assert.rejects(()=>serviceA.updateTemplate(badUser,results[0].value.id,{endTime:'13:00'}),code('ORG_FORBIDDEN'));
  });
  await check('primary hospital metadata alone grants neither clinic membership nor calendar or member-management authority',async()=>{
    await database.db.query('UPDATE doctors SET primary_hospital_id=$1 WHERE id=$2',[clinic,unrelatedDoctor]);
    assert.equal((await clinicRows(unrelatedDoctor)).length,0);
    assert.equal((await api(calendarPath,{method:'POST',actor:unrelated,body:calendarDraft})).status,403);
    assert.equal((await api(membersPath,{method:'POST',actor:unrelated,body:{doctorId:badDoctor}})).status,403);
    assert.ok(!(await api('/api/doctors?hospital='+clinic)).body.some(row=>row.internalId===unrelatedDoctor));
    await database.db.query('UPDATE doctors SET primary_hospital_id=NULL WHERE id=$1',[unrelatedDoctor]);
  });
  let preservedUser,preservedProfile,preservedDoctor,preservedOtherMemberships;
  await check('owner removal repairs primary metadata while preserving doctor user profile and every other membership',async()=>{
    await database.db.query('UPDATE doctor_hospital_memberships SET is_primary=false WHERE doctor_id=$1',[memberDoctor]);
    await database.db.query('UPDATE doctor_hospital_memberships SET is_primary=true WHERE doctor_id=$1 AND hospital_id=$2',[memberDoctor,clinic]);
    await database.db.query('UPDATE doctors SET primary_hospital_id=$1 WHERE id=$2',[clinic,memberDoctor]);
    preservedUser=(await database.db.query('SELECT * FROM users WHERE id=$1',[member.id])).rows[0];
    preservedProfile=(await database.db.query('SELECT * FROM auth_profiles WHERE user_id=$1',[member.id])).rows[0];
    preservedDoctor=(await database.db.query('SELECT id,user_id,uid,first_name,last_name,email,phone,is_private_practice,is_active FROM doctors WHERE id=$1',[memberDoctor])).rows[0];
    preservedOtherMemberships=(await database.db.query('SELECT * FROM doctor_hospital_memberships WHERE doctor_id=$1 AND hospital_id<>$2 ORDER BY id',[memberDoctor,clinic])).rows;
    const result=await api(membersPath+'/'+memberDoctor,{method:'DELETE',actor:owner});
    assert.equal(result.status,200);assert.deepEqual(result.body,{message:'Doctor removed from clinic'});
    assert.equal((await clinicRows(memberDoctor)).length,0);
    assert.deepEqual((await database.db.query('SELECT * FROM users WHERE id=$1',[member.id])).rows[0],preservedUser);
    assert.deepEqual((await database.db.query('SELECT * FROM auth_profiles WHERE user_id=$1',[member.id])).rows[0],preservedProfile);
    assert.deepEqual((await database.db.query('SELECT id,user_id,uid,first_name,last_name,email,phone,is_private_practice,is_active FROM doctors WHERE id=$1',[memberDoctor])).rows[0],preservedDoctor);
    assert.deepEqual((await database.db.query('SELECT * FROM doctor_hospital_memberships WHERE doctor_id=$1 AND hospital_id<>$2 ORDER BY id',[memberDoctor,clinic])).rows,preservedOtherMemberships);
    assert.equal((await database.db.query('SELECT primary_hospital_id FROM doctors WHERE id=$1',[memberDoctor])).rows[0].primary_hospital_id,null);
    const audit=await auditRows(memberDoctor);assert.equal(audit.length,2);assert.deepEqual(audit.map(row=>row.action),['clinic_membership_added','clinic_membership_removed']);assert.ok(audit.every(row=>row.actor_user_id===owner.id));
    assert.equal((await runtime.sessions.authenticate(tokens.get(member.id))).role,'doctor');
  });
  await check('removed member cannot create or update clinic-context calendars and disappears from provider affiliation',async()=>{
    assert.equal((await api(calendarPath,{method:'POST',actor:member,body:{...calendarDraft,dayOfWeek:'WEDNESDAY'}})).status,403);
    assert.equal((await api(calendarPath+'/'+memberTemplate.id,{method:'PUT',actor:member,body:{endTime:'14:00'}})).status,403);
    assert.ok(!(await api('/api/doctors?hospital='+clinic)).body.some(row=>row.internalId===memberDoctor));
    assert.ok(!(await api('/api/hospitals/'+clinic)).body.doctors.some(row=>row.internalId===memberDoctor));
    assert.equal((await database.db.query('SELECT count(*)::int n FROM recurring_availability_templates WHERE id=$1',[memberTemplate.id])).rows[0].n,1);
    assert.equal((await api(membersPath+'/'+memberDoctor,{method:'DELETE',actor:owner})).status,403);
  });
  await check('generic removal can never remove the clinic owner ownership membership or alter unrelated organizations',async()=>{
    assert.equal((await api(membersPath+'/'+ownerDoctor,{method:'DELETE',actor:owner})).status,403);
    assert.equal((await clinicRows(ownerDoctor)).length,1);
    assert.equal((await database.db.query('SELECT clinic_owner_doctor_id FROM hospitals WHERE id=$1',[clinic])).rows[0].clinic_owner_doctor_id,ownerDoctor);
    assert.equal((await api('/api/hospitals/'+hospital+'/doctor-memberships/'+memberDoctor,{method:'DELETE',actor:owner})).status,403);
    assert.deepEqual((await database.db.query('SELECT * FROM doctor_hospital_memberships WHERE doctor_id=$1 AND hospital_id<>$2 ORDER BY id',[memberDoctor,clinic])).rows,preservedOtherMemberships);
  });
  await check('owner may remove an inactive non-owner without destroying historical identity',async()=>{
    await database.db.query('UPDATE doctors SET is_active=false WHERE id=$1',[unlinkedDoctor]);
    assert.equal((await api(membersPath+'/'+unlinkedDoctor,{method:'DELETE',actor:owner})).status,200);
    assert.equal((await clinicRows(unlinkedDoctor)).length,0);
    assert.equal((await database.db.query('SELECT is_active FROM doctors WHERE id=$1',[unlinkedDoctor])).rows[0].is_active,false);
  });
  await check('database functions independently enforce current actor ownership while runtime retains no clinical or privilege escalation access',async()=>{
    const connection=await database.connect('mediid_runtime',credentials.mediid_runtime);
    try {
      for(const actor of [unrelated,admin,staff,support,patient]) {
        await assert.rejects(()=>connection.query('SELECT public.mediid_add_clinic_doctor_membership($1,$2,$3,$4,$5)',[actor.id,clinic,badDoctor,newPostgresId(),newPostgresId()]),error=>error.code==='P0001'&&/AUTH_FORBIDDEN/.test(error.message));
        await assert.rejects(()=>connection.query('SELECT public.mediid_remove_clinic_doctor_membership($1,$2,$3,$4)',[actor.id,clinic,concurrentDoctor,newPostgresId()]),error=>error.code==='P0001'&&/AUTH_FORBIDDEN/.test(error.message));
      }
      await assert.rejects(()=>connection.query('SELECT public.mediid_remove_clinic_doctor_membership($1,$2,$3,$4)',[owner.id,clinic,ownerDoctor,newPostgresId()]),error=>error.code==='P0001'&&/AUTH_FORBIDDEN/.test(error.message));
      for(const table of ['encounters','clinical_notes','prescriptions','medical_documents','patients','research_requirements','submission_documents','appointment_payments','appointments','hospital_appointments','private_clinic_appointments','materialized_appointment_slots','appointment_slot_reservations'])await denied(()=>connection.query('SELECT * FROM public.'+table+' LIMIT 0'));
      for(const sql of ["INSERT INTO doctor_hospital_memberships(id,doctor_id,hospital_id) VALUES(gen_random_uuid(),NULL,NULL)","DELETE FROM doctor_hospital_memberships WHERE false","CREATE TABLE public.group_clinic_forbidden(id int)","CREATE ROLE group_clinic_forbidden","SET ROLE mediid_migrator","DELETE FROM _prisma_migrations WHERE false"])await denied(()=>connection.query(sql));
      assert.equal((await clinicRows(badDoctor)).length,0);assert.equal((await clinicRows(concurrentDoctor)).length,1);
    }finally{await connection.end();}
  });
  await check('group hierarchy and own-calendar operations create no booking clinical payment slot or reservation records',async()=>{
    for(const table of ['appointments','hospital_appointments','private_clinic_appointments','appointment_payments','materialized_appointment_slots','appointment_slot_reservations','encounters','clinical_notes','prescriptions','medical_documents'])assert.equal((await database.db.query('SELECT count(*)::int n FROM '+table)).rows[0].n,0,table);
  });
  console.log(JSON.stringify({suite:'phase23-group-clinic',nativePostgres:true,checks:checks.length,passed:true}));
}finally{
  if(server)await new Promise(resolve=>server.close(resolve));
  if(first)await first.stop();if(second)await second.stop();
  if(runtime)await runtime.stop();if(redis)await redis.stop();if(cluster)await cluster.stop();
}
