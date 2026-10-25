import assert from 'node:assert/strict';import {createRequire} from 'node:module';import {writeFileSync} from 'node:fs';import {startRedis} from './helpers/redis-instance.mjs';
const require=createRequire(import.meta.url),{AuthLimits,limitConfig,OPERATIONS}=require('../src/auth/limits');
const instance=await startRedis(),checks=[];let a,b;
async function check(name,fn){await fn();checks.push(name);console.log('PASS real Redis: '+name);}
try{
 const env={AUTH_REDIS_URL:instance.url,AUTH_RATE_KEY_SECRET:'synthetic-only-shared-hmac-secret-32bytes',...Object.fromEntries(OPERATIONS.flatMap(op=>{const tag=op.replace(/[A-Z]/g,c=>'_'+c).toUpperCase();return [['AUTH_RATE_'+tag+'_WINDOW_MS','2000'],['AUTH_RATE_'+tag+'_SOURCE_MAX','4'],['AUTH_RATE_'+tag+'_IDENTITY_MAX','2']];}))};
 a=new AuthLimits(limitConfig(env));b=new AuthLimits(limitConfig(env));await Promise.all([a.start(),b.start()]);
 await check('two independent limiter instances share an atomic budget for every protected operation',async()=>{for(const operation of OPERATIONS){const outcomes=await Promise.allSettled([a,b,a,b].map((limiter,i)=>limiter.consume(operation,'synthetic-source-'+i,' Sensitive@Example.Invalid ')));assert.equal(outcomes.filter(x=>x.status==='fulfilled').length,2);for(const r of outcomes.filter(x=>x.status==='rejected'))assert.equal(r.reason.code,'AUTH_RATE_LIMIT');}});
 await check('keys hash normalized identities and network sources; bounded expiries are set',async()=>{const keys=await instance.admin.keys('mediid:auth:*');assert.equal(keys.length,35);for(const key of keys){assert.match(key,/^mediid:auth:[a-zA-Z]+:(source|identity):[a-f0-9]{64}$/);assert.ok(!key.includes('Sensitive'));assert.ok(await instance.admin.pttl(key)>0);}});
 await check('the source dimension prevents rotating identities from bypassing a network budget',async()=>{await instance.admin.flushdb();for(let i=0;i<4;i++)await a.consume('login','one-source','identity-'+i);await assert.rejects(()=>b.consume('login','one-source','another'),e=>e.code==='AUTH_RATE_LIMIT');});
 await check('Redis TTL expiration restores the budget across instances',async()=>{await new Promise(r=>setTimeout(r,2100));await b.consume('login','one-source','another');});
 await check('Redis outage fails closed as safe 503 instead of a process-local fallback',async()=>{await instance.stop();await assert.rejects(()=>a.consume('login','source','identity'),e=>e.code==='AUTH_UNAVAILABLE');});
 writeFileSync('.test-data/phase22b-redis-results.json',JSON.stringify({status:'PASS',engine:instance.version.trim(),checks,passed:checks.length,synthetic:true})+'\n');
}finally{await a?.stop();await b?.stop();await instance.stop();}
