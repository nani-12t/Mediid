const {readdirSync}=require('node:fs');
const path=require('node:path');
const {spawnSync}=require('node:child_process');
const backendRoot=path.resolve(__dirname,'..');
function files(directory) {
 return readdirSync(directory,{withFileTypes:true}).flatMap(entry=>{
  const file=path.join(directory,entry.name);
  return entry.isDirectory()?files(file):/\.(?:js|cjs|mjs)$/.test(entry.name)?[file]:[];
 });
}
const sources=['src','scripts'].flatMap(directory=>files(path.join(backendRoot,directory)));
for(const file of sources) {
 const result=spawnSync(process.execPath,['--check',file],{stdio:'inherit',windowsHide:true});
 if(result.error||result.status!==0){process.exitCode=1;break;}
}
if(!process.exitCode)console.log('JavaScript syntax checks passed for '+sources.length+' source/script files.');
