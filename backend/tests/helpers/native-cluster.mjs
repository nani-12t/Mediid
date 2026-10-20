import {execFileSync} from 'node:child_process';
import {existsSync,mkdirSync,mkdtempSync,writeFileSync,appendFileSync} from 'node:fs';
import path from 'node:path';
import net from 'node:net';
import {randomBytes} from 'node:crypto';
import pg from 'pg';
export async function startNativeCluster(){
 const binary=process.env.MEDIID_TEST_PG_BIN||(process.platform==='win32'?'C:/Program Files/PostgreSQL/18/bin':null);
 if(!binary)throw new Error('Native PostgreSQL required: set MEDIID_TEST_PG_BIN');
 const exe=n=>path.join(binary,n+(process.platform==='win32'?'.exe':''));
 if(!existsSync(exe('initdb')))throw new Error('Native initdb is unavailable');
 const testRoot=path.resolve('.test-data');mkdirSync(testRoot,{recursive:true});const root=mkdtempSync(path.join(testRoot,'pg-exact-')),data=path.join(root,'data');
 const password=randomBytes(32).toString('hex'),pwfile=path.join(root,'password');writeFileSync(pwfile,password+'\n',{mode:0o600});
 const lease=net.createServer();await new Promise(r=>lease.listen(0,'127.0.0.1',r));const port=lease.address().port;await new Promise(r=>lease.close(r));
 const env={...process.env};for(const key of Object.keys(env))if(key.startsWith('PG'))delete env[key];
 const command=(name,args)=>execFileSync(exe(name),args,{env,stdio:'ignore',windowsHide:true,timeout:60000});
 let started=false;const clients=new Set();
 const connect=async(database='postgres',user='synthetic_native',credential=password)=>{const c=new pg.Client({host:'127.0.0.1',port,user,password:credential,database,ssl:false,connectionTimeoutMillis:4000,statement_timeout:15000});await c.connect();clients.add(c);return c;};
 const stop=async()=>{await Promise.allSettled([...clients].map(c=>c.end()));if(started){command('pg_ctl',['-D',data,'-m','fast','-w','stop']);started=false;}};
 try{
  command('initdb',['-D',data,'-U','synthetic_native','-A','scram-sha-256','--pwfile='+pwfile,'--encoding=UTF8','--no-locale']);
  const ext=process.env.MEDIID_TEST_EXTENSION_ROOT||path.resolve('.test-data/pgvector-build/staged');
  if(existsSync(path.join(ext,'extension/vector.control')))appendFileSync(path.join(data,'postgresql.conf'),"\nextension_control_path = '"+ext.replaceAll('\\','/').replaceAll("'","''")+";$system'\n");
  started=true;command('pg_ctl',['-D',data,'-l',path.join(root,'server.log'),'-o','-h 127.0.0.1 -p '+port,'-w','start']);
  const admin=await connect();
  const database=async()=>{
   const name='synthetic_'+randomBytes(8).toString('hex');await admin.query('CREATE DATABASE "'+name+'"');const c=await connect(name);
   const adapter={query:(sql,args=[])=>c.query(sql,args),exec:sql=>c.query(sql),transaction:async fn=>{await c.query('BEGIN');try{const r=await fn(adapter);await c.query('COMMIT');return r;}catch(e){await c.query('ROLLBACK');throw e;}},close:async()=>{clients.delete(c);await c.end();}};
   return {name,db:adapter,client:c,url:(user='synthetic_native',credential=password)=>'postgresql://'+encodeURIComponent(user)+':'+encodeURIComponent(credential)+'@127.0.0.1:'+port+'/'+name+'?schema=public',connect:(user,credential)=>connect(name,user,credential)};
  };
  return {admin,database,connect,stop,port,root};
 }catch(e){await stop();throw e;}
}
