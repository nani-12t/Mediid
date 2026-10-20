const test=require('node:test');
const assert=require('node:assert/strict');
const {MongoMemoryServer}=require('mongodb-memory-server');
const {spawn}=require('node:child_process');
const {randomBytes}=require('node:crypto');
const net=require('node:net');
const path=require('node:path');
const fs=require('node:fs');

test('legacy Express/MongoDB registration, login and protected routes remain compatible',{timeout:600000},async t=>{
 const secret=randomBytes(32).toString('hex');
 const emptyCwd=fs.mkdtempSync(path.join(require('node:os').tmpdir(),'mediid-mongo-test-'));
 const serverPath=path.resolve('server.js');
 const mongo=await MongoMemoryServer.create({binary:{version:'7.0.30',downloadDir:path.resolve('.test-data/mongodb-binaries')},instance:{ip:'127.0.0.1'}});
 let child,fixtureConnection;
 try{
  const lease=net.createServer();await new Promise(resolve=>lease.listen(0,'127.0.0.1',resolve));const port=lease.address().port;await new Promise(resolve=>lease.close(resolve));
  const env={};for(const key of ['PATH','Path','SystemRoot','WINDIR','TEMP','TMP','USERPROFILE'])if(process.env[key])env[key]=process.env[key];
  Object.assign(env,{NODE_ENV:'test',PORT:String(port),HOST:'127.0.0.1',MONGO_URI:mongo.getUri('mediid_synthetic'),MARKETPLACE_URI:mongo.getUri('marketplace_synthetic'),JWT_SECRET:secret,DOTENV_CONFIG_PATH:path.join(emptyCwd,'absent.env'),REDIS_HOST:'127.0.0.1',REDIS_PORT:'1'});
  child=spawn(process.execPath,[serverPath],{cwd:emptyCwd,env,stdio:['ignore','pipe','pipe']});
  let output='';child.stdout.on('data',x=>output+=x);child.stderr.on('data',x=>output+=x);
  const deadline=Date.now()+90000;
  while(!output.includes('Server running on port')){
   if(child.exitCode!==null||Date.now()>deadline)throw new Error('Synthetic server failed: '+output);
   await new Promise(resolve=>setTimeout(resolve,150));
  }
  const api=async(route,body,token)=>{
   const response=await fetch('http://127.0.0.1:'+port+'/api/'+route,{method:body?'POST':'GET',headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(10000)});
   return {status:response.status,data:await response.json()};
  };
  await t.test('database-ready health endpoint',async()=>assert.equal((await api('health')).status,200));
  const account={email:'patient@example.invalid',password:'SyntheticOnly123!',role:'patient',firstName:'Synthetic',lastName:'Patient'};
  let registered,login;
  await t.test('registration retains public MEDIID UID and response shape',async()=>{registered=await api('auth/register',account);assert.equal(registered.status,201,JSON.stringify(registered.data));assert.ok(registered.data.token);assert.match(registered.data.profile.uid,/^MID-/);});
  await t.test('existing email registration conflicts',async()=>assert.equal((await api('auth/register',account)).status,409));
  await t.test('login and authenticated profile',async()=>{login=await api('auth/login',{email:account.email,password:account.password});assert.equal(login.status,200);assert.equal((await api('auth/me',null,login.data.token)).status,200);});
  await t.test('invalid password rejected',async()=>assert.equal((await api('auth/login',{email:account.email,password:'wrong'})).status,401));
  await t.test('unauthenticated protected profile rejected',async()=>assert.equal((await api('auth/me')).status,401));
  await t.test('patient profile lookup, public UID scan and QR remain compatible',async()=>{
   const profile=await api('patients/profile',null,login.data.token);assert.equal(profile.status,200);assert.equal(profile.data.uid,registered.data.profile.uid);
   const qr=await api('patients/qr',null,login.data.token);assert.equal(qr.status,200);assert.equal(qr.data.uid,profile.data.uid);assert.match(qr.data.qrCode,/^data:image/);
   assert.equal((await api('patients/scan/'+profile.data.uid)).data.uid,profile.data.uid);
  });
  let hospital;
  await t.test('hospital registration preserves HID and response contracts',async()=>{
   hospital=await api('auth/register',{email:'hospital@example.invalid',password:account.password,role:'hospital_admin',hospitalName:'Synthetic Hospital',registrationNumber:'SYNTHETIC001'});
   assert.equal(hospital.status,201,JSON.stringify(hospital.data));assert.equal(hospital.data.profile.uid,'HID-SYNTHETIC001');
  });
  await t.test('hospital login, me and owned profile lookup remain compatible',async()=>{
   const signedIn=await api('auth/login',{email:'hospital@example.invalid',password:account.password});assert.equal(signedIn.status,200);
   const me=await api('auth/me',null,signedIn.data.token),profile=await api('hospitals/admin/profile',null,signedIn.data.token);assert.equal(me.status,200);assert.equal(profile.status,200);assert.equal(me.data.profile.uid,hospital.data.profile.uid);assert.equal(profile.data.uid,hospital.data.profile.uid);
  });
  await t.test('existing role middleware rejects patient/hospital cross-role routes',async()=>{
   assert.equal((await api('hospitals/admin/profile',null,login.data.token)).status,403);assert.equal((await api('patients/profile',null,hospital.data.token)).status,403);
  });
  fixtureConnection=await require('mongoose').createConnection(mongo.getUri('mediid_synthetic')).asPromise();
  const doctorUid='HID-SYNTHETIC001-SRDOC-0001';
  await fixtureConnection.collection('doctors').insertOne({hospital:new (require('mongoose').Types.ObjectId)(hospital.data.profile._id),uid:doctorUid,email:'doctor@example.invalid',firstName:'Synthetic',lastName:'Doctor',specialization:'General Medicine',isActive:true,status:'available'});
  let activated;
  await t.test('existing doctor activation accepts canonicalized UID and links its Mongo profile',async()=>{
   activated=await api('auth/doctor-activate',{uid:' '+doctorUid.toLowerCase()+' ',password:account.password});assert.equal(activated.status,201,JSON.stringify(activated.data));assert.equal(activated.data.user.uid,doctorUid);assert.equal(activated.data.profile.uid,doctorUid);
   assert.equal((await api('auth/doctor-activate',{uid:doctorUid,password:account.password})).status,400);
  });
  await t.test('doctor email/UID login and populated me profile remain compatible',async()=>{
   for(const identity of ['doctor@example.invalid',doctorUid]){const result=await api('auth/login',{email:identity,password:account.password});assert.equal(result.status,200);assert.equal(result.data.profile.uid,doctorUid);assert.equal(result.data.profile.hospital.name,'Synthetic Hospital');const me=await api('auth/me',null,result.data.token);assert.equal(me.status,200);assert.equal(me.data.profile.uid,doctorUid);}
  });
  await t.test('legacy auth middleware rejects malformed and tampered bearer tokens',async()=>{
   assert.equal((await api('auth/me',null,'malformed')).status,401);assert.equal((await api('auth/me',null,login.data.token.slice(0,-20)+'invalidsignature')).status,401);
  });
  await t.test('existing synthetic Mongo password-reset flow remains functional',async()=>{
   const known=await api('auth/forgot-password',{email:account.email}),unknown=await api('auth/forgot-password',{email:'unknown@example.invalid'});assert.equal(known.status,200);assert.deepEqual(known.data,unknown.data);
   const record=await fixtureConnection.collection('users').findOne({email:account.email});assert.ok(record.resetPasswordToken);assert.ok(record.resetPasswordExpire>new Date());
   const newPassword='NewSyntheticPassword123!';assert.equal((await api('auth/reset-password',{email:account.email,otp:record.resetPasswordToken,newPassword})).status,200);
   assert.equal((await api('auth/login',{email:account.email,password:newPassword})).status,200);assert.equal((await api('auth/login',{email:account.email,password:account.password})).status,401);
  });
  fs.mkdirSync('test-results',{recursive:true});fs.writeFileSync('test-results/phase131-mongo.json',JSON.stringify({synthetic:true,mongodb:'7.0.30',expressChecks:14,productionAccess:false},null,2)+'\n');
 }finally{
  if(child&&child.exitCode===null){const closed=new Promise(resolve=>child.once('close',resolve));child.kill();await closed;}
  await fixtureConnection?.close();
  await mongo.stop();
 }
});
