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
 let child;
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
  fs.mkdirSync('test-results',{recursive:true});fs.writeFileSync('test-results/phase131-mongo.json',JSON.stringify({synthetic:true,mongodb:'7.0.30',expressChecks:6,productionAccess:false},null,2)+'\n');
 }finally{
  if(child&&child.exitCode===null){const closed=new Promise(resolve=>child.once('close',resolve));child.kill();await closed;}
  await mongo.stop();
 }
});
