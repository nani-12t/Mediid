'use strict';
const {authConfig}=require('../config');
const {AuthError}=require('../errors');
const {AccessTokens}=require('../tokens');
const {PasswordHasher}=require('../crypto/password');
const {Sessions}=require('../sessions');
const {Provisioning}=require('../provisioning');
const {AuthorizationPolicies}=require('../policies/ownership');
const {AuthLimits,limitConfig}=require('../limits');
const {postgresInfrastructure}=require('../../infrastructure/postgres/client');
const jwt=require('jsonwebtoken');
const {mongoObjectIdToUuid}=require('../../identifiers/uuid');
function authenticationMode(env=process.env){if(!['legacy','postgres'].includes(env.AUTH_BACKEND))throw new AuthError('AUTH_CONFIG');return env.AUTH_BACKEND;}
function httpConfig(env=process.env){
 const origins=(env.AUTH_ALLOWED_ORIGINS||env.CLIENT_URL||'').split(',').map(s=>s.trim());
 if(!origins.length||origins.some(s=>{try{const u=new URL(s);return u.origin!==s||u.hostname.includes('*')||!['http:','https:'].includes(u.protocol)||env.NODE_ENV==='production'&&u.protocol!=='https:';}catch{return true;}}))throw new AuthError('AUTH_CONFIG');
 const sameSite=env.AUTH_COOKIE_SAME_SITE||'lax';if(!['lax','strict','none'].includes(sameSite)||sameSite==='none'&&env.NODE_ENV!=='production')throw new AuthError('AUTH_CONFIG');
 return {origins,secure:env.NODE_ENV==='production',sameSite};
}
let runtime;
async function startAuthRuntime(env=process.env){
 const mode=authenticationMode(env),config=authConfig(env),tokens=new AccessTokens(config);
 if(mode==='legacy'){runtime={mode,config,tokens,stop:async()=>{}};return runtime;}
 const http=httpConfig(env),postgres=postgresInfrastructure(),limits=new AuthLimits(limitConfig(env));
 try{
  await postgres.start();await limits.start();
  const passwords=await PasswordHasher.create(config.bcryptCost);
  const seconds=env.AUTH_REFRESH_TTL_SECONDS===undefined?604800:Number(env.AUTH_REFRESH_TTL_SECONDS);
  const sessions=new Sessions(config,postgres,passwords,tokens,{refreshSeconds:seconds,clientUrl:env.CLIENT_URL||http.origins[0]});
  runtime={mode,config,tokens,http,postgres,limits,sessions,policies:new AuthorizationPolicies(sessions.repository),provisioning:new Provisioning(postgres,passwords),delivery:resetDelivery(env),stop:async()=>{await Promise.allSettled([limits.stop(),postgres.stop()]);}};
  return runtime;
 }catch{await Promise.allSettled([limits.stop(),postgres.stop()]);throw new AuthError('AUTH_UNAVAILABLE');}
}
function getAuthRuntime(){if(!runtime)throw new AuthError('AUTH_UNAVAILABLE');return runtime;}
function issueLegacyToken(id,role){
 const current=getAuthRuntime();if(current.mode!=='legacy')throw new AuthError('AUTH_FORBIDDEN');
 return jwt.sign({id:String(id),role},current.config.privateKey,{algorithm:'RS256',keyid:current.config.keyId,subject:mongoObjectIdToUuid(String(id)),issuer:current.config.issuer,audience:current.config.audience,expiresIn:current.config.tokenSeconds,notBefore:0});
}
function verifyLegacyToken(token){
 const current=getAuthRuntime();if(current.mode!=='legacy')throw new AuthError('AUTH_TOKEN');
 const verified=current.tokens.verify(token),claims=jwt.decode(token);
 if(typeof claims.id!=='string'||!/^[a-f0-9]{24}$/.test(claims.id)||mongoObjectIdToUuid(claims.id)!==verified.id)throw new AuthError('AUTH_TOKEN');
 return {...verified,mongoId:claims.id};
}
function resetDelivery(env){
 const keys=['SMTP_HOST','SMTP_PORT','SMTP_USER','SMTP_PASS','SMTP_FROM'];
 if(keys.some(k=>typeof env[k]!=='string'||!env[k]))throw new AuthError('AUTH_CONFIG');
 const port=Number(env.SMTP_PORT);if(![465,587].includes(port)||/[\r\n]/.test(env.SMTP_FROM))throw new AuthError('AUTH_CONFIG');
 const transport=require('nodemailer').createTransport({host:env.SMTP_HOST,port,secure:port===465,requireTLS:true,auth:{user:env.SMTP_USER,pass:env.SMTP_PASS},logger:false,debug:false,connectionTimeout:5000,socketTimeout:10000});
 return {send:async(email,credential)=>{await transport.sendMail({from:env.SMTP_FROM,to:email,subject:'MEDIID password reset',text:'Your one-use password reset credential is '+credential.secret+'. It expires at '+credential.expiresAt.toISOString()+'.'});}};
}
module.exports={authenticationMode,httpConfig,startAuthRuntime,getAuthRuntime,issueLegacyToken,verifyLegacyToken};
