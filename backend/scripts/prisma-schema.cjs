const {spawnSync}=require('node:child_process');
const path=require('node:path');
const mode=process.argv[2];
if(!['validate','generate'].includes(mode)){console.error('Unsupported schema command');process.exit(1);}
// These commands do not connect; real runtime/migration credentials are never required.
const result=spawnSync(process.execPath,[require.resolve('prisma/build/index.js'),mode,'--schema',path.resolve(__dirname,'../prisma/schema.prisma')],{env:{...process.env,DATABASE_URL:'postgresql://validation:unused@127.0.0.1:55439/mediid_validation'},stdio:'inherit',windowsHide:true});
process.exitCode=result.status??1;
