'use strict';
const Redis=require('ioredis');
const {createHmac}=require('node:crypto');
const {AuthError}=require('../errors');
const OPERATIONS=['login','register','resetRequest','resetComplete','refresh','activate','provision'];
const SCRIPT=`
local blocked=0
local wait=0
for i,key in ipairs(KEYS) do
 local count=redis.call('INCR',key)
 if count==1 then redis.call('PEXPIRE',key,ARGV[1]) end
 local ttl=redis.call('PTTL',key)
 if count>tonumber(ARGV[i+1]) then blocked=1; if ttl>wait then wait=ttl end end
end
return {blocked,wait}`;
function limitConfig(env=process.env){
 let url;try{url=new URL(env.AUTH_REDIS_URL);}catch{throw new AuthError('AUTH_CONFIG');}
 if(!['redis:','rediss:'].includes(url.protocol)||!url.hostname||url.hash||url.search||env.NODE_ENV==='production'&&url.protocol!=='rediss:')throw new AuthError('AUTH_CONFIG');
 const secret=env.AUTH_RATE_KEY_SECRET;
 if(typeof secret!=='string'||Buffer.byteLength(secret)<32||secret.length>512)throw new AuthError('AUTH_CONFIG');
 const number=(name,fallback,min,max)=>{const text=env[name]??String(fallback);if(!/^\d+$/.test(text)||+text<min||+text>max)throw new AuthError('AUTH_CONFIG');return +text;};
 const policies=Object.fromEntries(OPERATIONS.map(operation=>{
  const tag=operation.replace(/[A-Z]/g,c=>'_'+c).toUpperCase();
  return [operation,{windowMs:number('AUTH_RATE_'+tag+'_WINDOW_MS',60000,100,3600000),sourceMax:number('AUTH_RATE_'+tag+'_SOURCE_MAX',operation==='login'?30:20,1,10000),identityMax:number('AUTH_RATE_'+tag+'_IDENTITY_MAX',operation==='login'?10:5,1,10000)}];
 }));return {url:url.toString(),secret,policies};
}
class AuthLimits {
 constructor(config){this.config=config;this.redis=new Redis(config.url,{lazyConnect:true,enableOfflineQueue:false,maxRetriesPerRequest:0,retryStrategy:()=>null,connectTimeout:3000,commandTimeout:3000});this.redis.on('error',()=>{});}
 async start(){try{await this.redis.connect();await this.redis.ping();}catch{throw new AuthError('AUTH_UNAVAILABLE');}}
 key(operation,dimension,value){return 'mediid:auth:'+operation+':'+dimension+':'+createHmac('sha256',this.config.secret).update(String(value)).digest('hex');}
 async consume(operation,source,identity){
  const rule=this.config.policies[operation];if(!rule)throw new AuthError('AUTH_CONFIG');
  const normalized=typeof identity==='string'?identity.trim().toLowerCase().slice(0,1024):'invalid';
  const keys=[this.key(operation,'source',source),this.key(operation,'identity',normalized)];
  let result;try{result=await this.redis.eval(SCRIPT,2,...keys,rule.windowMs,rule.sourceMax,rule.identityMax);}catch{throw new AuthError('AUTH_UNAVAILABLE');}
  if(Number(result[0])===1){const error=new AuthError('AUTH_RATE_LIMIT');error.retryAfter=Math.max(1,Math.ceil(Number(result[1])/1000));throw error;}
 }
 async stop(){this.redis.disconnect();}
}
module.exports={AuthLimits,limitConfig,OPERATIONS};
