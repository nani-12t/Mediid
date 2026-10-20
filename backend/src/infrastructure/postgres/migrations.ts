import {readdirSync,readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {join} from 'node:path';
import {PrismaClient} from '@prisma/client';
import {PostgresError} from './errors';
export function expectedMigrations(directory: string): Map<string,readonly string[]> {
  try { return new Map(readdirSync(directory,{withFileTypes:true}).filter(x=>x.isDirectory()).map(x=>{const source=readFileSync(join(directory,x.name,'migration.sql'),'utf8');const lf=source.replace(/\r\n/g,'\n');return [x.name,[source,lf,lf.replace(/\n/g,'\r\n')].map(text=>createHash('sha256').update(text).digest('hex'))] as const;})); }
  catch { throw new PostgresError('PG_MIGRATION_FILES','Local migration files are unavailable.'); }
}
export async function verifyMigrations(client: PrismaClient, directory: string): Promise<number> {
  const expected=expectedMigrations(directory);
  if (!expected.size) throw new PostgresError('PG_MIGRATION_FILES','No local migrations were found.');
  let rows: {migration_name: string;checksum: string;finished_at: Date|null;rolled_back_at: Date|null}[];
  try { rows=await client.$queryRaw`SELECT migration_name, checksum, finished_at, rolled_back_at FROM public._prisma_migrations`; }
  catch { throw new PostgresError('PG_MIGRATIONS_MISSING','PostgreSQL migration history is unavailable. Deploy reviewed migrations first.'); }
  const applied=new Map<string,string>();
  for(const row of rows) {
    if(row.rolled_back_at) continue;
    if(!row.finished_at) throw new PostgresError('PG_MIGRATIONS_INCOMPLETE','PostgreSQL has an incomplete migration.');
    if(applied.has(row.migration_name)) throw new PostgresError('PG_MIGRATIONS_DRIFT','PostgreSQL migration history is inconsistent.');
    applied.set(row.migration_name,row.checksum);
  }
  if(applied.size!==expected.size) throw new PostgresError('PG_MIGRATIONS_PENDING','PostgreSQL migrations are missing or unexpected.');
  for(const [name,checksums]of expected) if(!checksums.includes(applied.get(name)||'')) throw new PostgresError('PG_MIGRATIONS_DRIFT','PostgreSQL migration checksum does not match the reviewed files.');
  return applied.size;
}
