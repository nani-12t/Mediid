const test = require('node:test');
const assert = require('node:assert/strict');
const {generateKeyPairSync} = require('node:crypto');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const {authConfig} = require('../dist/auth/config');
const {PasswordHasher} = require('../dist/auth/crypto/password');
const {resetCredential,resetDigest} = require('../dist/auth/crypto/reset');
const {safeUser} = require('../dist/auth/dto/user');
const {authResponse,AuthError} = require('../dist/auth/errors');
const {canonicalEmail,canonicalUid} = require('../dist/auth/identity');
const {AccessTokens} = require('../dist/auth/tokens');
const {Authentication} = require('../dist/auth/services/authentication');
const {createAuthTestServer} = require('../dist/auth/testing/harness');
const {mongoObjectIdToUuid,newPostgresId} = require('../dist/identifiers/uuid');
const keys = generateKeyPairSync('rsa',{modulusLength:2048});
const env = {AUTH_JWT_ISSUER:'mediid-test',AUTH_JWT_AUDIENCE:'mediid-test-api',AUTH_JWT_KEY_ID:'synthetic-key',AUTH_JWT_TTL_SECONDS:'900',AUTH_BCRYPT_COST:'12',AUTH_RESET_TTL_SECONDS:'900',AUTH_JWT_PRIVATE_KEY:keys.privateKey.export({type:'pkcs8',format:'pem'}),AUTH_JWT_PUBLIC_KEY:keys.publicKey.export({type:'spki',format:'pem'})};
const config=authConfig(env), tokens=new AccessTokens(config), principal={id:newPostgresId(),role:'patient'};
const hasher=PasswordHasher.create(12);
const password='SyntheticOnlyPassword123!';
const rejected=fn=>assert.throws(fn,error=>error.code==='AUTH_TOKEN');
function signed(payload={},options={}) {
 return jwt.sign({role:'patient',sub:principal.id,...payload},keys.privateKey,{algorithm:'RS256',keyid:config.keyId,issuer:config.issuer,audience:config.audience,expiresIn:900,notBefore:0,...options});
}
test('RSA configuration accepts separate matching multiline PEMs and literal escaped newlines',()=>{
 assert.equal(config.bcryptCost,12);
 const slash=String.fromCharCode(92),newline=String.fromCharCode(10);
 const escaped={...env,AUTH_JWT_PRIVATE_KEY:env.AUTH_JWT_PRIVATE_KEY.split(newline).join(slash+'n'),AUTH_JWT_PUBLIC_KEY:env.AUTH_JWT_PUBLIC_KEY.split(newline).join(slash+'n')};
 assert.equal(authConfig(escaped).keyId,config.keyId);
});
test('configuration has no secret fallback and rejects weak/mismatched keys and unsafe work factors',()=>{
 for(const key of Object.keys(env))assert.throws(()=>authConfig({...env,[key]:undefined}),error=>error.code==='AUTH_CONFIG');
 for(const value of ['0','10','15','twelve'])assert.throws(()=>authConfig({...env,AUTH_BCRYPT_COST:value}));
 const weak=generateKeyPairSync('rsa',{modulusLength:1024});
 assert.throws(()=>authConfig({...env,AUTH_JWT_PRIVATE_KEY:weak.privateKey.export({type:'pkcs8',format:'pem'}),AUTH_JWT_PUBLIC_KEY:weak.publicKey.export({type:'spki',format:'pem'})}));
 const other=generateKeyPairSync('rsa',{modulusLength:2048});
 assert.throws(()=>authConfig({...env,AUTH_JWT_PUBLIC_KEY:other.publicKey.export({type:'spki',format:'pem'})}));
});
test('RS256 tokens carry explicit bounded subject/role/issuer/audience/iat/nbf/expiry claims',()=>{
 const token=tokens.issue(principal),decoded=jwt.decode(token,{complete:true});
 assert.equal(decoded.header.alg,'RS256');assert.equal(decoded.payload.exp-decoded.payload.iat,900);
 assert.equal(decoded.payload.nbf,decoded.payload.iat);assert.deepEqual(tokens.verify(token),principal);
 assert.deepEqual(Object.keys(decoded.payload).sort(),['aud','exp','iat','iss','nbf','role','sub']);
});
test('malformed and tampered signatures are rejected',()=>{
 for(const token of ['',null,'not-a-jwt',tokens.issue(principal).slice(0,-20)+'invalidsignature'])rejected(()=>tokens.verify(token));
});
test('HS256, unsigned and unsupported algorithms cannot choose verification behavior',()=>{
 for(const token of [jwt.sign({sub:principal.id,role:'patient'},'synthetic-secret',{algorithm:'HS256'}),jwt.sign({sub:principal.id,role:'patient'},'',{algorithm:'none'}),signed({},{algorithm:'RS384'})])rejected(()=>tokens.verify(token));
});
test('wrong issuer, audience, key id and untrusted key URL headers are rejected',()=>{
 for(const options of [{issuer:'other'},{audience:'other'},{keyid:'unknown'},{header:{alg:'RS256',typ:'JWT',kid:config.keyId,jku:'https://untrusted.invalid/key'}}])rejected(()=>tokens.verify(signed({},options)));
});
test('expiration and not-before are enforced with no clock bypass',()=>{
 const now=Math.floor(Date.now()/1000);
 rejected(()=>tokens.verify(signed({iat:now-901},{expiresIn:900})));
 rejected(()=>tokens.verify(signed({},{notBefore:30})));
 rejected(()=>tokens.verify(signed({iat:now+20})));
});
test('required claims and bounded lifetime reject otherwise valid signatures',()=>{
 const now=Math.floor(Date.now()/1000);
 for(const payload of [{sub:'MID-12345678'},{role:'clinic_receptionist'},{iat:now,exp:now+900,nbf:now,sub:principal.id,role:'patient'}]){
  if(payload.exp){const token=jwt.sign(payload,keys.privateKey,{algorithm:'RS256',keyid:config.keyId,issuer:config.issuer,audience:config.audience});assert.deepEqual(tokens.verify(token),principal);}
  else rejected(()=>tokens.verify(signed(payload)));
 }
 const noExp=jwt.sign({sub:principal.id,role:'patient'},keys.privateKey,{algorithm:'RS256',keyid:config.keyId,issuer:config.issuer,audience:config.audience});rejected(()=>tokens.verify(noExp));
 rejected(()=>tokens.verify(signed({},{expiresIn:901})));
});
test('bcrypt writes reviewed cost and verifies legacy bcrypt without rehashing',async()=>{
 const h=await hasher,hash=await h.hash(password);assert.equal(bcrypt.getRounds(hash),12);assert.equal(await h.verify(password,hash),true);
 const legacy=await bcrypt.hash('legacy-six',10);assert.equal(await h.verify('legacy-six',legacy),true);assert.equal(bcrypt.getRounds(legacy),10);
 assert.equal(await h.verify('wrong',legacy),false);assert.equal(await h.verify(password,null),false);
});
test('new passwords reject bcrypt byte truncation, NULs and short inputs',async()=>{
 const h=await hasher;for(const value of ['short','x'.repeat(73),String.fromCodePoint(0x754c).repeat(25),'valid-password'+String.fromCharCode(0)])await assert.rejects(()=>h.hash(value),error=>error.code==='AUTH_INPUT');
});
test('unknown/wrong/inactive/malformed login uses one comparison and the same API response',async()=>{
 const h=await hasher,hash=await h.hash(password),original=bcrypt.compare;let comparisons=0;
 bcrypt.compare=(...args)=>{comparisons++;return original(...args);};
 try{
  const outputs=[];
  for(const user of [null,{...principal,email:'known@example.invalid',uid:null,isActive:true,passwordHash:hash},{...principal,email:'known@example.invalid',uid:null,isActive:false,passwordHash:hash}]){
   const repo={find:async()=>user};const service=new Authentication(config,repo,h,tokens);const before=comparisons;
   try{await service.login('known@example.invalid',user?.isActive?'wrong':password);assert.fail('login accepted');}catch(error){outputs.push(authResponse(error));}
   assert.equal(comparisons-before,1);
  }
  const service=new Authentication(config,{find:async()=>{assert.fail('malformed identity looked up');}},h,tokens);
  try{await service.login(null,password);}catch(error){outputs.push(authResponse(error));}
  assert.equal(comparisons,4);for(const output of outputs)assert.deepEqual(output,outputs[0]);
 }finally{bcrypt.compare=original;}
});
test('identity canonicalization preserves public-ID characters without provider rewrites',()=>{
 assert.equal(canonicalEmail('  Alice+Care@Example.Invalid  '),'alice+care@example.invalid');
 assert.throws(()=>canonicalEmail(String.fromCodePoint(0x212a)+'@example.invalid'));
 assert.equal(canonicalUid(' hid-1234-srdoc-0001 '),'HID-1234-SRDOC-0001');
 for(const uid of ['HID/1234','HID--1234','507f1f77bcf86cd799439011'])assert.throws(()=>canonicalUid(uid));
});
test('internal v5/v7 identity never substitutes for public UID',()=>{
 assert.equal(mongoObjectIdToUuid('507f1f77bcf86cd799439011'),'8f3448ec-faf1-5ce5-a1e4-d78f6fa0c1f9');
 const dto=safeUser({id:newPostgresId(),uid:'MID-12345678',email:null,role:'patient'});assert.equal(dto.uid,'MID-12345678');assert.notEqual(dto.id,dto.uid);
});
test('safe DTO allowlist excludes arbitrary secrets, relations and security metadata',()=>{
 const value=safeUser({...principal,email:'safe@example.invalid',uid:null,passwordHash:'do-not-serialize',resetPasswordToken:'secret',resetPasswordExpiresAt:new Date(),isActive:true,lastLoginAt:new Date(),privateKey:'secret-key',patient:{health:'sensitive'}});
 assert.deepEqual(Object.keys(value).sort(),['email','id','role','uid']);assert.ok(!JSON.stringify(value).includes('secret'));
});
test('reset credentials contain entropy and persist only SHA-256 digests with bounded expiry',()=>{
 const now=new Date(),a=resetCredential(900,now),b=resetCredential(900,now);assert.notEqual(a.secret,b.secret);assert.equal(a.secret.length,43);assert.equal(a.digest.length,64);assert.equal(resetDigest(a.secret),a.digest);assert.notEqual(a.secret,a.digest);assert.equal(a.expiresAt-now,900000);
 assert.throws(()=>resetDigest('123456'),error=>error.code==='AUTH_RESET');
});
test('API errors never serialize raw exception, Prisma, token, password or private-key details',()=>{
 const result=authResponse(new Error('password secret JWT private key postgresql://credential'));
 assert.deepEqual(result,{status:503,body:{code:'AUTH_UNAVAILABLE',message:'Authentication is unavailable.'}});
 assert.deepEqual(authResponse(new AuthError('AUTH_FORBIDDEN')).status,403);
});
test('test harness cannot be created outside the explicit test environment',()=>{
 const old=process.env.NODE_ENV;
 try{for(const value of ['production','development',undefined]){if(value===undefined)delete process.env.NODE_ENV;else process.env.NODE_ENV=value;assert.throws(()=>createAuthTestServer({},{}),error=>error.code==='AUTH_CONFIG');}}
 finally{if(old===undefined)delete process.env.NODE_ENV;else process.env.NODE_ENV=old;}
});
