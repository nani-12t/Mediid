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
const { Provisioning } = require('../src/auth/provisioning');
const { Organizations } = require('../src/organizations/services');
const { createOrganizationRouter } = require('../src/organizations/http');
const { protect } = require('../middleware/auth');
const checks = [];
const code = expected => error => error.code === expected;
const denied = fn => assert.rejects(fn, error => error.code === '42501');
async function check(name, fn) { await fn(); checks.push(name); console.log('PASS organizations: ' + name); }
let cluster, redis, runtime, first, second, server;
try {
  cluster = await startNativeCluster(); redis = await startRedis();
  const database = await cluster.database();
  await database.db.exec('CREATE EXTENSION vector; CREATE EXTENSION btree_gist;');
  await database.db.exec(readFileSync('prisma/roles.sql', 'utf8'));
  const credentials = Object.fromEntries(['mediid_migrator','mediid_runtime','mediid_diagnostics'].map(role => [role,randomBytes(32).toString('hex')]));
  for (const [role, credential] of Object.entries(credentials)) await cluster.admin.query('ALTER ROLE ' + role + " LOGIN PASSWORD '" + credential + "'");
  await check('all forward migrations deploy with actual non-superuser migrator', async () => {
    const result = spawnSync(process.execPath,['scripts/prisma.cjs','deploy'],{
      env:{...process.env,NODE_ENV:'test',PG_ENV_FILE:path.join(cluster.root,'absent.env'),PG_MIGRATION_URL:database.url('mediid_migrator',credentials.mediid_migrator)},
      encoding:'utf8',windowsHide:true,timeout:120000
    });
    assert.equal(result.status,0,result.stdout+result.stderr);
    const count = readdirSync('prisma/migrations',{withFileTypes:true}).filter(entry=>entry.isDirectory()).length;
    assert.equal((await database.db.query('SELECT count(*)::int n FROM _prisma_migrations WHERE finished_at IS NOT NULL')).rows[0].n,count);
  });
  const pair = generateKeyPairSync('rsa',{modulusLength:2048}), origin='https://synthetic-organizations.invalid';
  process.env.NODE_ENV='test'; process.env.PG_RUNTIME_URL=database.url('mediid_runtime',credentials.mediid_runtime);
  runtime=await startAuthRuntime({
    NODE_ENV:'test',AUTH_BACKEND:'postgres',CLIENT_URL:origin,AUTH_ALLOWED_ORIGINS:origin,
    AUTH_JWT_ISSUER:'mediid-organizations-synthetic',AUTH_JWT_AUDIENCE:'mediid-organizations-synthetic-api',
    AUTH_JWT_KEY_ID:'synthetic-organizations-key',AUTH_JWT_TTL_SECONDS:'900',AUTH_BCRYPT_COST:'12',AUTH_RESET_TTL_SECONDS:'900',
    AUTH_JWT_PRIVATE_KEY:pair.privateKey.export({type:'pkcs8',format:'pem'}),AUTH_JWT_PUBLIC_KEY:pair.publicKey.export({type:'spki',format:'pem'}),
    AUTH_REDIS_URL:redis.url,AUTH_RATE_KEY_SECRET:randomBytes(32).toString('hex'),
    SMTP_HOST:'127.0.0.1',SMTP_PORT:'587',SMTP_USER:'synthetic',SMTP_PASS:randomBytes(32).toString('hex'),SMTP_FROM:'synthetic@example.invalid'
  });
  const service = new Organizations(runtime,{clientUrl:origin}), password='SyntheticOrganizationsPassword123!';
  const hash=await runtime.provisioning.passwords.hash(password);
  const user=(role,email,uid=null)=>insert(database.db,'users',{id:newPostgresId(),role,email,uid,password_hash:hash,is_active:true,updated_at:new Date()});
  const adminA=await user('hospital_admin','org-admin-a@example.invalid'), adminB=await user('hospital_admin','org-admin-b@example.invalid');
  const patient=await user('patient','org-patient@example.invalid'), staffUser=await user('hospital_staff','org-staff@example.invalid');
  const support=await user('support_agent','org-support@example.invalid');
  const privateUser=await user('doctor','org-private@example.invalid','DOC-PRIVATE01'), otherPrivateUser=await user('doctor','org-private2@example.invalid','DOC-PRIVATE02');
  const employedUser=await user('doctor','org-employed@example.invalid','DOC-EMPLOYED1');
  const hospitalA=newPostgresId(), hospitalB=newPostgresId(), inactiveHospital=newPostgresId();
  for(const data of [
    {id:hospitalA,user_id:adminA.id,uid:'HID-12345678',name:'Synthetic Popular Heart Hospital',city:'Pune',type:'private',rating_average:4.5,rating_count:99,specialties:['Cardiology']},
    {id:hospitalB,user_id:adminB.id,uid:'HID-87654321',name:'Synthetic Perfect Eye Hospital',city:'Delhi',type:'government',rating_average:5,rating_count:1,specialties:['Ophthalmology']},
    {id:inactiveHospital,user_id:(await user('hospital_admin','org-inactive@example.invalid')).id,uid:'HID-00000000',name:'Synthetic Inactive Hospital',is_active:false,rating_average:5,rating_count:10000}
  ]) await insert(database.db,'hospitals',{...data,contact_email:'public-hospital@example.invalid',registration_number:'PRIVATE-REGISTRATION',updated_at:new Date()});
  const privateDoctor=newPostgresId(), otherPrivateDoctor=newPostgresId(), employedDoctor=newPostgresId(), metadataDoctor=newPostgresId();
  for(const [id,account,privatePractice] of [[privateDoctor,privateUser,true],[otherPrivateDoctor,otherPrivateUser,true],[employedDoctor,employedUser,false]]) {
    await insert(database.db,'doctors',{id,user_id:account.id,uid:account.uid,first_name:'Synthetic',last_name:'Practitioner',specialization:'Cardiology',is_private_practice:privatePractice,phone:'+910000000001',email:account.email,status:'available',rating_average:id===privateDoctor?4.5:5,rating_count:id===otherPrivateDoctor?2:id===privateDoctor?99:1,experience_years:12,qualifications:['Synthetic MBBS'],expertise:['Synthetic Heart'],languages:['English'],updated_at:new Date()});
  }
  const inactiveDoctor=newPostgresId();
  await insert(database.db,'doctors',{id:inactiveDoctor,uid:'DOC-INACTIVE1',first_name:'Inactive',last_name:'Synthetic',specialization:'Cardiology',is_active:false,rating_average:5,rating_count:10000,updated_at:new Date()});
  await insert(database.db,'doctors',{id:metadataDoctor,uid:'DOC-METADATA1',primary_hospital_id:hospitalA,first_name:'Metadata',last_name:'Only',specialization:'Synthetic',updated_at:new Date()});
  await insert(database.db,'doctor_hospital_memberships',{id:newPostgresId(),doctor_id:privateDoctor,hospital_id:hospitalA,is_primary:true});
  await insert(database.db,'doctor_hospital_memberships',{id:newPostgresId(),doctor_id:privateDoctor,hospital_id:hospitalB});
  const app=express(); app.use(express.json());
  app.use('/api',createOrganizationRouter(runtime,service));
  app.get('/unmigrated',protect,(req,res)=>res.json({unexpected:true}));
  server=http.createServer(app);await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const base='http://127.0.0.1:'+server.address().port;
  const login=async actor=>(await runtime.sessions.login(actor.email,password)).token;
  const tokens=new Map();
  for(const actor of [adminA,adminB,privateUser,otherPrivateUser,employedUser,staffUser,support,patient])tokens.set(actor.id,await login(actor));
  async function api(route,{method='GET',actor,body,token,requestOrigin=origin}={}) {
    const response=await fetch(base+route,{method,headers:{...(body===undefined?{}:{'Content-Type':'application/json'}),...(requestOrigin?{Origin:requestOrigin}:{}),...((token||actor)?{Authorization:'Bearer '+(token||tokens.get(actor.id))}:{})},...(body===undefined?{}:{body:JSON.stringify(body)}),signal:AbortSignal.timeout(15000)});
    return {status:response.status,body:await response.json(),headers:response.headers};
  }
  await check('restricted runtime credential is used by normal organization service',async()=>{
    assert.equal((await runtime.postgres.client.$queryRawUnsafe('SELECT current_user AS role'))[0].role,'mediid_runtime');
    assert.equal(runtime.mode,'postgres');
  });
  await check('public hospital ranking uses rating average times log10(review count plus one)',async()=>{
    const result=await api('/api/hospitals');
    assert.equal(result.status,200);assert.deepEqual(result.body.map(item=>item.uid),['HID-12345678','HID-87654321']);
    assert.equal(4.5*Math.log10(100),9);assert.ok(9>5*Math.log10(2));
    assert.equal(result.body[0].rating.average,4.5);assert.equal(result.body[0].rating.count,99);
    assert.equal(result.body[0].address.city,'Pune');assert.equal(result.body[0].contact.email,'public-hospital@example.invalid');
    for(const field of ['userId','clinicOwnerDoctorId','doctorSequence','staffSequence','registrationNumber','passwordHash','password_hash'])assert.equal(field in result.body[0],false,field);
    assert.equal((await api('/api/hospitals/top')).body[0].uid,'HID-12345678');
  });
  await check('hospital city specialty type rating text and bounded pagination filters remain compatible',async()=>{
    for(const query of ['city=pune','specialty=cardio','type=private','q=heart'])assert.deepEqual((await api('/api/hospitals?'+query)).body.map(row=>row.id),[hospitalA]);
    assert.deepEqual((await api('/api/hospitals?rating=4.9')).body.map(row=>row.id),[hospitalB]);
    assert.equal((await api('/api/hospitals?limit=1')).body.length,1);
    assert.equal((await api('/api/hospitals?limit=1&page=1')).body[0].id,hospitalB);
    for(const query of ['limit=101','limit=0','q='+encodeURIComponent('x'.repeat(151)),'rating=6','type=invalid','q[$ne]=x'])assert.equal((await api('/api/hospitals?'+query)).status,400);
    assert.deepEqual((await api('/api/hospitals?q='+encodeURIComponent("' OR true; --"))).body,[]);
    assert.equal((await api('/api/hospitals/'+inactiveHospital)).status,404);
  });
  await check('hospital UUID and explicit public UID resolve but guessed Mongo mapping does not',async()=>{
    assert.equal((await api('/api/hospitals/'+hospitalA)).body.uid,'HID-12345678');
    assert.equal((await api('/api/hospitals/uid/hid-12345678')).body.id,hospitalA);
    assert.equal((await api('/api/hospitals/HID-12345678')).status,400);
    assert.equal((await api('/api/hospitals/0123456789abcdef01234567')).status,404);
    assert.equal((await api('/api/hospitals/not-an-id')).status,400);
  });
  await check('imported hospital and doctor IDs require recorded frozen UUIDv5 mapping and retain legacy DTO IDs',async()=>{
    const mongoUser='1234567890abcdef12345670',mongoHospital='1234567890abcdef12345671',mongoDoctor='1234567890abcdef12345672';
    const importedUser=await insert(database.db,'users',{id:mongoObjectIdToUuid(mongoUser),role:'hospital_admin',email:'org-imported@example.invalid',password_hash:hash,updated_at:new Date()});
    const importedHospital=mongoObjectIdToUuid(mongoHospital);
    await insert(database.db,'hospitals',{id:importedHospital,user_id:importedUser.id,uid:'HID-IMPORT01',name:'Synthetic Imported Hospital',updated_at:new Date()});
    await insert(database.db,'auth_legacy_links',{user_id:importedUser.id,mongo_user_id:mongoUser,hospital_mongo_id:mongoHospital,source_fingerprint:'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'});
    const hospital=await api('/api/hospitals/'+mongoHospital);
    assert.equal(hospital.status,200);assert.equal(hospital.body.id,mongoHospital);assert.equal(hospital.body._id,mongoHospital);assert.equal(hospital.body.internalId,importedHospital);assert.equal(hospital.body.uid,'HID-IMPORT01');
    const importedDoctorUser=await user('doctor','org-imported-doctor@example.invalid','DOC-IMPORTED1');
    const importedDoctor=mongoObjectIdToUuid(mongoDoctor);
    await insert(database.db,'doctors',{id:importedDoctor,user_id:importedDoctorUser.id,uid:importedDoctorUser.uid,first_name:'Imported',last_name:'Synthetic',specialization:'Synthetic',updated_at:new Date()});
    await insert(database.db,'auth_legacy_links',{user_id:importedDoctorUser.id,mongo_user_id:'1234567890abcdef12345673',doctor_mongo_id:mongoDoctor,source_fingerprint:'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb'});
    const doctor=await api('/api/doctors/'+mongoDoctor);
    assert.equal(doctor.status,200);assert.equal(doctor.body.id,mongoDoctor);assert.equal(doctor.body.internalId,importedDoctor);assert.equal(doctor.body.uid,'DOC-IMPORTED1');
  });
  await check('admin hospital profile updates own allowlisted fields and rejects immutable authority or ratings',async()=>{
    assert.equal((await api('/api/hospitals/admin/profile',{actor:adminA})).body.id,hospitalA);
    const updated=await api('/api/hospitals/admin/profile',{method:'PUT',actor:adminA,body:{name:'Synthetic Updated Heart Hospital',address:{city:'Pune'},contact:{phone:'+910000000002'},operatingHours:{weekdays:{open:'09:00',close:'17:00'},is24x7:false}}});
    assert.equal(updated.status,200);assert.equal(updated.body.name,'Synthetic Updated Heart Hospital');assert.equal(updated.body.contact.phone,'+910000000002');assert.equal(updated.body.rating.average,4.5);
    for(const body of [{uid:'HID-FORGED01'},{userId:adminB.id},{hospitalId:hospitalB},{doctorSequence:500},{rating:{average:5}},{role:'hospital_admin'}])assert.equal((await api('/api/hospitals/admin/profile',{method:'PUT',actor:adminA,body})).status,400);
    for(const actor of [privateUser,staffUser,support,patient])assert.equal((await api('/api/hospitals/admin/profile',{actor})).status,403);
    assert.equal((await api('/api/hospitals/'+hospitalB,{method:'PUT',actor:adminA,body:{name:'Forbidden'}})).status,403);
    assert.equal((await api('/api/hospitals/admin/profile',{method:'PUT',actor:adminA,body:{name:'Forbidden'},requestOrigin:'https://attacker.invalid'})).status,403);
  });
  await check('doctor search uses all explicit memberships and exposes public-safe compatibility fields',async()=>{
    for(const hospital of [hospitalA,hospitalB]){
      const result=await api('/api/doctors?hospital='+hospital);
      assert.equal(result.status,200);assert.ok(result.body.some(row=>row.id===privateDoctor));assert.ok(!result.body.some(row=>row.id===metadataDoctor));
    }
    assert.deepEqual((await api('/api/doctors')).body.slice(0,3).map(row=>row.id),[otherPrivateDoctor,employedDoctor,privateDoctor]);
    assert.equal((await api('/api/doctors/'+inactiveDoctor)).status,404);
    assert.ok(!(await api('/api/doctors')).body.some(row=>row.id===inactiveDoctor));
    const result=await api('/api/doctors/'+privateDoctor);
    assert.equal(result.body.memberships.length,2);assert.equal(result.body.uid,'DOC-PRIVATE01');assert.equal(result.body.experience,12);
    assert.deepEqual(result.body.qualifications,['Synthetic MBBS']);assert.equal(result.body.phone,undefined);assert.equal(result.body.email,undefined);assert.equal(result.body.userId,undefined);
    assert.match(result.body.qrCode,/^data:image\/png;base64,/);
    assert.equal((await api('/api/doctors/uid/doc-private01')).body.id,privateDoctor);
    for(const query of ['specialization=cardio','q=heart','available=true'])assert.ok((await api('/api/doctors?'+query)).body.some(row=>row.id===privateDoctor));
    assert.equal((await api('/api/doctors?hospital='+hospitalA,{actor:adminA})).body.find(row=>row.id===privateDoctor).email,privateUser.email);
    assert.equal((await api('/api/doctors?hospital='+hospitalB,{actor:adminA})).body.find(row=>row.id===privateDoctor).email,undefined);
  });
  await check('explicit membership alone authorizes doctor management; primary metadata grants none',async()=>{
    assert.equal((await api('/api/doctors/'+privateDoctor+'/manage',{actor:adminA})).body.email,privateUser.email);
    assert.equal((await api('/api/doctors/'+metadataDoctor,{method:'PUT',actor:adminA,body:{firstName:'Forbidden'}})).status,403);
    assert.equal((await api('/api/doctors/'+employedDoctor,{method:'PUT',actor:adminB,body:{firstName:'Forbidden'}})).status,403);
    const result=await api('/api/doctors/'+privateDoctor,{method:'PUT',actor:adminB,body:{consultationFee:900,experience:13,languages:['English','Hindi']}});
    assert.equal(result.status,200);assert.equal(result.body.consultationFee,900);assert.equal(result.body.experience,13);
    for(const body of [{uid:'DOC-FORGED01'},{userId:adminB.id},{password:'Forbidden'},{role:'hospital_admin'},{ratingAverage:5},{isPrivatePractice:false},{hospitalId:hospitalB}])assert.equal((await api('/api/doctors/'+privateDoctor,{method:'PUT',actor:adminA,body})).status,400);
  });
  let recruited;
  await check('HTTP doctor recruitment reuses secure sequence membership activation audit and QR DTO',async()=>{
    const result=await api('/api/doctors',{method:'POST',actor:adminA,body:{firstName:'Recruited',lastName:'Synthetic',specialization:'Cardiology',email:'org-recruited@example.invalid',experience:5,qualifications:['Synthetic MBBS']}});
    assert.equal(result.status,201);recruited=result.body;assert.match(recruited.uid,/^HID-12345678-DOC-\d{4}$/);assert.equal(recruited.experience,5);
    assert.equal(recruited.activation.secret.length,43);assert.match(recruited.qrCode,/^data:image\/png;base64,/);
    const rows=(await database.db.query('SELECT d.user_id,c.token_digest,c.issued_by_user_id FROM doctors d JOIN doctor_activation_credentials c ON c.doctor_id=d.id WHERE d.id=$1',[recruited.internalId])).rows;
    assert.equal(rows[0].user_id,null);assert.notEqual(rows[0].token_digest,recruited.activation.secret);assert.equal(rows[0].issued_by_user_id,adminA.id);
    assert.equal((await database.db.query('SELECT count(*)::int n FROM doctor_hospital_memberships WHERE doctor_id=$1 AND hospital_id=$2',[recruited.internalId,hospitalA])).rows[0].n,1);
    assert.equal((await database.db.query("SELECT count(*)::int n FROM auth_provisioning_audit WHERE doctor_id=$1 AND action='doctor_provisioned'",[recruited.internalId])).rows[0].n,1);
    assert.equal((await api('/api/doctors/'+recruited.id)).body.activation,undefined);
    assert.equal((await api('/api/doctors',{method:'POST',actor:adminB,body:{firstName:'Cross',lastName:'Hospital',specialization:'Synthetic',hospitalId:hospitalA}})).status,403);
    for(const actor of [privateUser,staffUser,support,patient])assert.equal((await api('/api/doctors',{method:'POST',actor,body:{firstName:'Forbidden',lastName:'Actor',specialization:'Synthetic'}})).status,403);
  });
  let clinic;
  await check('private doctor creates audited doctor-owned clinic plus membership atomically without admin or receptionist authority',async()=>{
    const usersBefore=(await database.db.query('SELECT count(*)::int n FROM users')).rows[0].n;
    const staffBefore=(await database.db.query('SELECT count(*)::int n FROM hospital_memberships')).rows[0].n;
    const result=await api('/api/hospitals',{method:'POST',actor:privateUser,body:{name:'Synthetic Private Clinic',type:'clinic',address:{city:'Pune'},specialties:['Cardiology']}});
    assert.equal(result.status,201);clinic=result.body;assert.equal(clinic.type,'clinic');assert.match(clinic.uid,/^HID-[A-F0-9]{8}$/);
    const row=(await database.db.query('SELECT * FROM hospitals WHERE id=$1',[clinic.internalId])).rows[0];
    assert.equal(row.user_id,null);assert.equal(row.clinic_owner_doctor_id,privateDoctor);
    assert.equal((await database.db.query('SELECT role::text role FROM users WHERE id=$1',[privateUser.id])).rows[0].role,'doctor');
    assert.equal((await database.db.query('SELECT count(*)::int n FROM doctor_hospital_memberships WHERE doctor_id=$1 AND hospital_id=$2',[privateDoctor,clinic.internalId])).rows[0].n,1);
    assert.equal((await database.db.query('SELECT count(*)::int n FROM users')).rows[0].n,usersBefore);
    assert.equal((await database.db.query('SELECT count(*)::int n FROM hospital_memberships')).rows[0].n,staffBefore);
    assert.ok((await database.db.query('SELECT count(*)::int n FROM auth_provisioning_audit WHERE hospital_id=$1',[clinic.internalId])).rows[0].n>0);
    assert.ok((await api('/api/hospitals?type=clinic')).body.some(row=>row.id===clinic.id));
    assert.equal((await api('/api/hospitals/admin/profile',{actor:privateUser})).status,403);
    assert.equal((await api('/api/hospitals',{method:'POST',actor:privateUser,body:{name:'Duplicate'}})).status,409);
  });
  await check('clinic ownership denies every non-private actor and unrelated doctor/admin mutation',async()=>{
    await database.db.query('UPDATE doctors SET is_active=false WHERE id=$1',[otherPrivateDoctor]);
    assert.equal((await api('/api/hospitals',{method:'POST',actor:otherPrivateUser,body:{name:'Inactive Doctor Forbidden'}})).status,403);
    await database.db.query('UPDATE doctors SET is_active=true WHERE id=$1',[otherPrivateDoctor]);
    for(const actor of [employedUser,patient,staffUser,support,adminA])assert.equal((await api('/api/hospitals',{method:'POST',actor,body:{name:'Forbidden clinic'}})).status,403);
    for(const actor of [otherPrivateUser,adminA,staffUser,support])assert.equal((await api('/api/hospitals/'+clinic.id,{method:'PUT',actor,body:{name:'Forbidden'}})).status,403);
    assert.equal((await api('/api/hospitals/'+clinic.id,{method:'PUT',actor:privateUser,body:{name:'Synthetic Owner Updated Clinic'}})).status,200);
    assert.equal((await api('/api/staff',{method:'POST',actor:privateUser,body:{firstName:'Forbidden',lastName:'Reception',role:'receptionist',hospitalId:clinic.id}})).status,403);
    await denied(()=>database.connect('mediid_runtime',credentials.mediid_runtime).then(async connection=>{try{await connection.query("INSERT INTO hospital_memberships(id,hospital_id,uid,first_name,last_name,role) VALUES($1,$2,'HID-INVALID-REC-0001','Forbidden','Staff','receptionist')",[newPostgresId(),clinic.internalId]);}finally{await connection.end();}}));
  });
  let nurse;
  await check('staff recruitment allocates hierarchical roster identity without creating authenticated user',async()=>{
    const usersBefore=(await database.db.query('SELECT count(*)::int n FROM users')).rows[0].n;
    const result=await api('/api/staff',{method:'POST',actor:adminA,body:{firstName:'Synthetic',lastName:'Nurse',role:'nurse',phone:'+910000000003',email:'org-nurse@example.invalid',department:'Cardiology'}});
    assert.equal(result.status,201);nurse=result.body;assert.match(nurse.uid,/^HID-12345678-NUR-\d{4}$/);assert.equal(nurse.phone,'+910000000003');
    assert.equal((await database.db.query('SELECT user_id FROM hospital_memberships WHERE id=$1',[nurse.internalId])).rows[0].user_id,null);
    assert.equal((await database.db.query('SELECT count(*)::int n FROM users')).rows[0].n,usersBefore);
    assert.equal((await api('/api/staff',{actor:adminA})).body.length,1);
    assert.equal((await api('/api/staff/'+nurse.id,{actor:adminA})).status,200);
    assert.equal((await api('/api/staff?role=nurse',{actor:adminA})).body.length,1);
  });
  await check('public staff UID badge strips private contacts credentials employment and audit fields',async()=>{
    const result=await api('/api/staff/uid/'+nurse.uid);
    assert.equal(result.status,200);assert.equal(result.body.uid,nurse.uid);assert.equal(result.body.hospital.uid,'HID-12345678');
    for(const key of ['email','phone','userId','passwordHash','employeeId','qualifications','dateOfJoining','audit','isActive'])assert.equal(key in result.body,false,key);
    assert.match(result.body.qrCode,/^data:image\/png;base64,/);
    assert.equal((await api('/api/staff')).status,401);
  });
  await check('staff management is admin-own-hospital scoped with linked identity preserved on deactivation',async()=>{
    for(const operation of [{method:'GET'},{method:'PUT',body:{department:'Forbidden'}},{method:'DELETE'}])assert.ok([403,404].includes((await api('/api/staff/'+nurse.id,{actor:adminB,...operation})).status));
    for(const actor of [staffUser,support,patient,privateUser])assert.equal((await api('/api/staff',{actor})).status,403);
    assert.equal((await api('/api/staff',{method:'POST',actor:adminB,body:{firstName:'Cross',lastName:'Hospital',role:'receptionist',hospitalId:hospitalA}})).status,403);
    await runtime.provisioning.linkStaff(adminA,{staffId:nurse.internalId,userId:staffUser.id,hospitalId:hospitalA});
    assert.equal((await api('/api/staff/'+nurse.id,{method:'PUT',actor:adminA,body:{department:'Synthetic ICU'}})).status,200);
    assert.equal((await api('/api/staff/'+nurse.id,{method:'PUT',actor:adminA,body:{role:'administrator'}})).status,400);
    assert.equal((await api('/api/staff/'+nurse.id,{method:'DELETE',actor:adminA})).status,200);
    assert.equal((await api('/api/staff',{actor:adminA})).body.length,0);
    assert.equal((await api('/api/staff/uid/'+nurse.uid)).status,404);
    const row=(await database.db.query('SELECT is_active,user_id FROM hospital_memberships WHERE id=$1',[nurse.internalId])).rows[0];
    assert.equal(row.is_active,false);assert.equal(row.user_id,staffUser.id);
    assert.equal((await database.db.query('SELECT role::text role FROM users WHERE id=$1',[staffUser.id])).rows[0].role,'hospital_staff');
  });
  let template;
  await check('doctor manages own authoritative recurring template in explicit hospital and clinic contexts',async()=>{
    const draft={doctorId:privateDoctor,hospitalId:hospitalA,dayOfWeek:'monday',startTime:'09:00',endTime:'12:00',slotDuration:30,capacityPerSlot:1,channel:'OFFLINE',timezone:'Asia/Kolkata',effectiveFrom:'2030-01-01'};
    const result=await api('/api/doctor-portal/availability-templates',{method:'POST',actor:privateUser,body:draft});
    assert.equal(result.status,201);template=result.body;assert.equal(template.doctorId,privateDoctor);assert.equal(template.hospitalId,hospitalA);assert.equal(template.dayOfWeek,'MONDAY');
    assert.equal((await api('/api/doctor-portal/availability-templates',{actor:privateUser})).body.length,1);
    assert.equal((await api('/api/doctor-portal/availability-templates/'+template.id,{method:'PUT',actor:privateUser,body:{endTime:'13:00'}})).status,200);
    const clinicTemplate=await api('/api/doctor-portal/availability-templates',{method:'POST',actor:privateUser,body:{...draft,hospitalId:clinic.id,dayOfWeek:'TUESDAY'}});
    assert.equal(clinicTemplate.status,201);assert.equal(clinicTemplate.body.hospitalId,clinic.internalId);
    const independent=await api('/api/doctor-portal/availability-templates',{method:'POST',actor:otherPrivateUser,body:{...draft,doctorId:otherPrivateDoctor,hospitalId:null}});
    assert.equal(independent.status,201);assert.equal(independent.body.hospitalId,null);
    assert.equal((await api('/api/doctor-portal/availability-templates/'+template.id,{method:'DELETE',actor:privateUser})).status,200);
    assert.ok(!(await api('/api/doctor-portal/availability-templates',{actor:privateUser})).body.some(row=>row.id===template.id));
  });
  await check('cross-doctor and nonmember template changes fail; admins staff and support gain no scheduling authority',async()=>{
    const draft={dayOfWeek:'WEDNESDAY',startTime:'09:00',endTime:'10:00',effectiveFrom:'2030-01-01'};
    for(const actor of [adminA,staffUser,support,patient])assert.equal((await api('/api/doctor-portal/availability-templates',{method:'POST',actor,body:draft})).status,403);
    assert.equal((await api('/api/doctor-portal/availability-templates',{method:'POST',actor:privateUser,body:{...draft,doctorId:otherPrivateDoctor}})).status,403);
    assert.equal((await api('/api/doctor-portal/availability-templates',{method:'POST',actor:otherPrivateUser,body:{...draft,hospitalId:hospitalA}})).status,403);
    assert.ok([403,404].includes((await api('/api/doctor-portal/availability-templates/'+template.id,{method:'PUT',actor:otherPrivateUser,body:{endTime:'14:00'}})).status));
    assert.ok([403,404].includes((await api('/api/doctor-portal/availability-templates/'+template.id,{method:'DELETE',actor:otherPrivateUser})).status));
    assert.equal((await api('/api/doctor-portal/availability-templates',{method:'POST',actor:privateUser,body:{...draft,capacityPerSlot:0}})).status,400);
  });
  const connectionUrl=database.url('mediid_runtime',credentials.mediid_runtime);
  const isolatedUrl=connectionUrl;
  first=new PostgresInfrastructure(runtimeConfig({NODE_ENV:'test',PG_RUNTIME_URL:isolatedUrl,PG_POOL_SIZE:'1'}));
  second=new PostgresInfrastructure(runtimeConfig({NODE_ENV:'test',PG_RUNTIME_URL:isolatedUrl,PG_POOL_SIZE:'1'}));
  await first.start();await second.start();
  const independentService=infrastructure=>new Organizations({...runtime,postgres:infrastructure,provisioning:new Provisioning(infrastructure,runtime.provisioning.passwords)},{clientUrl:origin});
  const serviceA=independentService(first),serviceB=independentService(second);
  await check('concurrency uses distinct native PostgreSQL backend connections and actual runtime credentials',async()=>{
    const a=(await first.client.$queryRawUnsafe('SELECT pg_backend_pid() AS pid,current_user AS role'))[0];
    const b=(await second.client.$queryRawUnsafe('SELECT pg_backend_pid() AS pid,current_user AS role'))[0];
    assert.notEqual(a.pid,b.pid);assert.equal(a.role,'mediid_runtime');assert.equal(b.role,'mediid_runtime');
  });
  await check('concurrent doctor recruitment allocates distinct sequence UIDs and complete memberships credentials audits',async()=>{
    const before=(await database.db.query('SELECT doctor_sequence FROM hospitals WHERE id=$1',[hospitalA])).rows[0].doctor_sequence;
    const doctors=await Promise.all([serviceA.recruitDoctor(adminA,{firstName:'Concurrent',lastName:'First',specialization:'Synthetic',email:'org-concurrent1@example.invalid'}),serviceB.recruitDoctor(adminA,{firstName:'Concurrent',lastName:'Second',specialization:'Synthetic',email:'org-concurrent2@example.invalid'})]);
    assert.equal(new Set(doctors.map(row=>row.uid)).size,2);
    assert.deepEqual(doctors.map(row=>Number(row.uid.slice(-4))).sort((a,b)=>a-b),[before+1,before+2]);
    assert.equal((await database.db.query('SELECT doctor_sequence FROM hospitals WHERE id=$1',[hospitalA])).rows[0].doctor_sequence,before+2);
    for(const doctor of doctors){
      assert.equal((await database.db.query('SELECT count(*)::int n FROM doctor_hospital_memberships WHERE doctor_id=$1 AND hospital_id=$2',[doctor.internalId,hospitalA])).rows[0].n,1);
      assert.equal((await database.db.query('SELECT count(*)::int n FROM doctor_activation_credentials WHERE doctor_id=$1',[doctor.internalId])).rows[0].n,1);
    }
  });
  await check('concurrent staff recruitment preserves unique hierarchical UIDs and every sequence increment',async()=>{
    const before=(await database.db.query('SELECT staff_sequence FROM hospitals WHERE id=$1',[hospitalA])).rows[0].staff_sequence;
    const roster=await Promise.all([serviceA.recruitStaff(adminA,{firstName:'Concurrent',lastName:'Nurse',role:'nurse'}),serviceB.recruitStaff(adminA,{firstName:'Concurrent',lastName:'Reception',role:'receptionist'})]);
    assert.equal(new Set(roster.map(row=>row.uid)).size,2);assert.match(roster[0].uid,/^HID-12345678-NUR-/);assert.match(roster[1].uid,/^HID-12345678-REC-/);
    assert.deepEqual(roster.map(row=>Number(row.uid.slice(-4))).sort((a,b)=>a-b),[before+1,before+2]);
    assert.equal((await database.db.query('SELECT staff_sequence FROM hospitals WHERE id=$1',[hospitalA])).rows[0].staff_sequence,before+2);
  });
  await check('concurrent duplicate clinic creation permits one atomic owner organization and membership',async()=>{
    const results=await Promise.allSettled([serviceA.createClinic(otherPrivateUser,{name:'Synthetic Concurrent Clinic A'}),serviceB.createClinic(otherPrivateUser,{name:'Synthetic Concurrent Clinic B'})]);
    assert.equal(results.filter(row=>row.status==='fulfilled').length,1);
    assert.equal(results.find(row=>row.status==='rejected').reason.code,'ORG_CONFLICT');
    const rows=(await database.db.query('SELECT id FROM hospitals WHERE clinic_owner_doctor_id=$1',[otherPrivateDoctor])).rows;
    assert.equal(rows.length,1);
    assert.equal((await database.db.query('SELECT count(*)::int n FROM doctor_hospital_memberships WHERE doctor_id=$1 AND hospital_id=$2',[otherPrivateDoctor,rows[0].id])).rows[0].n,1);
  });
  await check('concurrent duplicate explicit membership has one relationship and one provisioning audit winner',async()=>{
    const add=(infrastructure)=>infrastructure.client.$queryRawUnsafe('SELECT * FROM public.mediid_add_doctor_membership($1::uuid,$2::uuid,$3::uuid,$4::uuid,$5::uuid,$6::boolean)',adminA.id,hospitalA,employedDoctor,newPostgresId(),newPostgresId(),false);
    const results=await Promise.allSettled([add(first),add(second)]);
    assert.equal(results.filter(row=>row.status==='fulfilled').length,1);
    assert.equal((await database.db.query('SELECT count(*)::int n FROM doctor_hospital_memberships WHERE doctor_id=$1 AND hospital_id=$2',[employedDoctor,hospitalA])).rows[0].n,1);
    assert.equal((await database.db.query("SELECT count(*)::int n FROM auth_provisioning_audit WHERE doctor_id=$1 AND action='membership_added'",[employedDoctor])).rows[0].n,1);
  });
  await check('removal deletes only actor membership and preserves other affiliation doctor account private practice and audit',async()=>{
    assert.equal((await api('/api/doctors/'+privateDoctor,{method:'DELETE',actor:adminA})).status,200);
    const row=(await database.db.query('SELECT user_id,is_private_practice,primary_hospital_id FROM doctors WHERE id=$1',[privateDoctor])).rows[0];
    assert.equal(row.user_id,privateUser.id);assert.equal(row.is_private_practice,true);assert.notEqual(row.primary_hospital_id,hospitalA);
    assert.equal((await database.db.query('SELECT count(*)::int n FROM doctor_hospital_memberships WHERE doctor_id=$1 AND hospital_id=$2',[privateDoctor,hospitalA])).rows[0].n,0);
    for(const organization of [hospitalB,clinic.internalId])assert.equal((await database.db.query('SELECT count(*)::int n FROM doctor_hospital_memberships WHERE doctor_id=$1 AND hospital_id=$2',[privateDoctor,organization])).rows[0].n,1);
    assert.equal((await api('/api/doctors/'+privateDoctor,{method:'DELETE',actor:adminA})).status,403);
    assert.equal((await api('/api/doctors/'+privateDoctor,{method:'PUT',actor:adminA,body:{firstName:'Forbidden'}})).status,403);
    assert.equal((await database.db.query("SELECT count(*)::int n FROM auth_provisioning_audit WHERE doctor_id=$1 AND action='membership_removed'",[privateDoctor])).rows[0].n,1);
  });
  await check('runtime denies clinical tables direct provider writes DDL migration history and role escalation',async()=>{
    const connection=await database.connect('mediid_runtime',credentials.mediid_runtime);
    try {
      for(const table of ['encounters','clinical_notes','prescriptions','medical_documents','research_requirements','submission_documents','appointment_payments','patients','appointments','hospital_appointments','private_clinic_appointments','materialized_appointment_slots','appointment_slot_reservations'])await denied(()=>connection.query('SELECT * FROM public.'+table+' LIMIT 0'));
      for(const sql of ["UPDATE hospitals SET name='Forbidden' WHERE false","UPDATE doctors SET first_name='Forbidden' WHERE false","UPDATE hospital_memberships SET first_name='Forbidden' WHERE false","DELETE FROM doctor_hospital_memberships WHERE false","DELETE FROM _prisma_migrations WHERE false","CREATE TABLE public.phase23_forbidden(id int)","CREATE ROLE phase23_forbidden","SET ROLE mediid_migrator"])await denied(()=>connection.query(sql));
      const privilege=(await connection.query("SELECT rolcreaterole,rolcreatedb,rolsuper,pg_has_role(current_user,'mediid_migrator','MEMBER') AS migrator FROM pg_roles WHERE rolname=current_user")).rows[0];
      assert.deepEqual(privilege,{rolcreaterole:false,rolcreatedb:false,rolsuper:false,migrator:false});
    }finally{await connection.end();}
  });
  await check('current-state sessions reject deactivated actors forged roles and stale tokens with no Mongo fallback',async()=>{
    await assert.rejects(()=>service.updateHospital({...support,role:'hospital_admin'},{name:'Forbidden'}),code('ORG_FORBIDDEN'));
    await database.db.query('UPDATE users SET is_active=false WHERE id=$1',[adminB.id]);
    assert.equal((await api('/api/hospitals/admin/profile',{actor:adminB})).status,401);
    await assert.rejects(()=>service.updateHospital(adminB,{name:'Forbidden'}),code('ORG_FORBIDDEN'));
    assert.equal((await api('/api/hospitals/admin/profile',{token:'unverified.claims.here'})).status,401);
    assert.equal((await api('/unmigrated',{actor:privateUser})).body.code,'AUTH_DOMAIN_NOT_MIGRATED');
    assert.equal((await api('/api/hospitals/0123456789abcdef01234567')).status,404);
  });
  await check('provider templates create no booking materialized slot reservation or clinical records',async()=>{
    for(const table of ['appointments','hospital_appointments','private_clinic_appointments','materialized_appointment_slots','appointment_slot_reservations','encounters','clinical_notes','prescriptions','medical_documents'])assert.equal((await database.db.query('SELECT count(*)::int n FROM '+table)).rows[0].n,0,table);
  });
  console.log(JSON.stringify({suite:'phase23-organizations',nativePostgres:true,checks:checks.length,passed:true}));
} finally {
  if(server)await new Promise(resolve=>server.close(resolve));
  if(first)await first.stop();if(second)await second.stop();
  if(runtime)await runtime.stop();if(redis)await redis.stop();if(cluster)await cluster.stop();
}
