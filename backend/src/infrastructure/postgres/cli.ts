import dotenv from 'dotenv';
import path from 'node:path';
import {PostgresInfrastructure} from './client';
import {runtimeConfig,diagnosticsConfig} from './config';
import {PostgresError,safeFailure} from './errors';
async function main(): Promise<void> {
 const mode=process.argv[2]||'check';
 if(!['check','readonly','watch'].includes(mode))throw new PostgresError('PG_CONFIG','Unsupported PostgreSQL diagnostic command.');
 const service=new PostgresInfrastructure(mode==='readonly'?diagnosticsConfig():runtimeConfig());
 let timer: ReturnType<typeof setInterval>|undefined;
 let finishing: Promise<void>|undefined;
 const shutdown=()=>finishing??=(async()=>{if(timer)clearInterval(timer);await service.stop();console.log(JSON.stringify(service.status()));process.disconnect?.();})();
 process.once('SIGINT',()=>void shutdown());process.once('SIGTERM',()=>void shutdown());
 process.on('message',message=>{if((message as {action?:string})?.action==='shutdown')void shutdown();});
 try {await service.start();console.log(JSON.stringify(service.status()));if(mode==='watch')timer=setInterval(()=>undefined,1000);else await shutdown();}
 catch(error){await service.stop();if(finishing){await finishing;return;}throw error;}
}
if(require.main===module){dotenv.config({path:process.env.PG_ENV_FILE||path.resolve(__dirname,'../../../.env.postgres.local')});void main().catch(error=>{const safe=safeFailure(error);console.error(JSON.stringify({status:'unavailable',code:safe.code,message:safe.message}));process.exitCode=1;process.disconnect?.();});

}
