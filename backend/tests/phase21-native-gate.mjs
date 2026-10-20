import {startNativeCluster} from './helpers/native-cluster.mjs';
import {useNativeSchemaCluster} from './helpers/schema-database.mjs';
import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import {originals,corrective} from './helpers/review-fixtures.mjs';
const cluster=await startNativeCluster();
try{
 const {db}=await cluster.database();const hashes={};
 for(const name of [...originals,corrective]){const sql=readFileSync(new URL('../prisma/migrations/'+name+'/migration.sql',import.meta.url));hashes[name]=createHash('sha256').update(sql).digest('hex');await db.exec(sql.toString());console.log('PASS exact migration: '+name);}
 const ext=(await db.query("SELECT extname,extversion FROM pg_extension WHERE extname IN ('vector','btree_gist') ORDER BY extname")).rows;assert.equal(ext.length,2);
 assert.equal(Number((await db.query("SELECT '[1,2,3]'::vector <-> '[1,2,4]'::vector AS distance")).rows[0].distance),1);
 useNativeSchemaCluster(cluster);
 await import('./schema-hardening.mjs');if(process.exitCode)throw new Error('Native schema regressions failed');
 await import('./phase131-review.mjs');if(process.exitCode)throw new Error('Native corrective regressions failed');
 writeFileSync(new URL('../test-results/phase21-exact-native-gate.json',import.meta.url),JSON.stringify({status:'PASS',engine:(await db.query('SELECT version()')).rows[0].version,extensions:ext,migrationHashes:hashes,exactUnmodifiedMigrations:true,schemaChecks:27,reviewChecks:70,synthetic:true},null,2)+'\n');console.log('PASS: exact native migration and Phase 1.3.1 regression gate.');
}finally{useNativeSchemaCluster(undefined);await cluster.stop();}
