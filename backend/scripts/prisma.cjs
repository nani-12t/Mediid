const {spawnSync}=require('node:child_process');
const path=require('node:path');
const {migrationUrl}=require('../src/infrastructure/postgres/config');
const {safeFailure}=require('../src/infrastructure/postgres/errors');
require('dotenv').config({path:process.env.PG_ENV_FILE||path.resolve(__dirname,'../.env.postgres.local')});
const mode=process.argv[2];
try{
 if(!['deploy','status'].includes(mode))throw new Error('Unsupported migration command');
 const url=migrationUrl(process.env);
 const result=spawnSync(process.execPath,[require.resolve('prisma/build/index.js'),'migrate',mode,'--schema',path.resolve(__dirname,'../prisma/schema.prisma')],{env:{...process.env,DATABASE_URL:url},encoding:'utf8',windowsHide:true,timeout:120000});
 if(result.error||result.status!==0){console.error(JSON.stringify({status:'failed',code:'PG_MIGRATION_COMMAND',message:'Prisma migration command failed. Check migration credentials, extension setup and reviewed migration status.'}));process.exitCode=1;}
 else console.log(JSON.stringify({status:'ok',command:'migrate '+mode}));
}catch(error){const safe=safeFailure(error);console.error(JSON.stringify({status:'failed',code:safe.code,message:safe.message}));process.exitCode=1;}
