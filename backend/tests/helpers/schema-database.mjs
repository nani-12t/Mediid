import {PGlite} from '@electric-sql/pglite';
import {vector} from '@electric-sql/pglite/vector';
import {btree_gist} from '@electric-sql/pglite/contrib/btree_gist';
let cluster;
// Only an in-process, newly provisioned test cluster can redirect these regressions.
export function useNativeSchemaCluster(value){cluster=value;}
export async function createSchemaDatabase(){return cluster?(await cluster.database()).db:new PGlite({extensions:{vector,btree_gist}});}
export function schemaReportUrl(file){return new URL('../../test-results/'+(cluster?'phase21-native-':'')+file,import.meta.url);}
