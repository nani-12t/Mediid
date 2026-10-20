import {PrismaClient} from '@prisma/client';
import {PostgresConfig,runtimeConfig} from './config';
import {PostgresError,safeFailure} from './errors';
import {verifyMigrations} from './migrations';
export class PostgresInfrastructure {
  private readonly prisma: PrismaClient;
  private connecting?: Promise<void>;
  private stopping?: Promise<void>;
  private stopRequested=false;
  private state='idle';
  private migrationCount=0;
  private attempts=0;
  constructor(private readonly config: PostgresConfig) {
    this.prisma=new PrismaClient({datasources:{db:{url:config.url}},log:[],errorFormat:'minimal'});
  }
  get client(): PrismaClient {if(this.state!=='ready'||this.stopRequested)throw new PostgresError('PG_NOT_READY','PostgreSQL is not ready.');return this.prisma;}
  status(): {status:string;ready:boolean;migrations:number;attempts:number;capability:string} {
    return {status:this.state,ready:this.state==='ready',migrations:this.migrationCount,attempts:this.attempts,capability:'isolated-postgres-infrastructure'};
  }
  start(): Promise<void> {
    if(this.stopRequested)return Promise.reject(new PostgresError('PG_STOPPED','PostgreSQL infrastructure has been stopped.'));
    if(this.state==='ready')return Promise.resolve();
    if(!this.connecting)this.connecting=this.initialize().finally(()=>{this.connecting=undefined;});
    return this.connecting;
  }
  private async initialize(): Promise<void> {
    this.state='connecting';
    for(let attempt=1;attempt<=this.config.retries;attempt++) {
      this.attempts=attempt;
      try {
        await this.prisma.$connect();
        if(this.stopRequested)throw new PostgresError('PG_STOPPED','PostgreSQL infrastructure has been stopped.');
        const roles=await this.prisma.$queryRaw<{unsafe:boolean}[]>`SELECT
          (r.rolsuper OR r.rolcreatedb OR r.rolcreaterole OR r.rolbypassrls OR pg_has_role(current_user,'mediid_migrator','MEMBER') OR
           has_schema_privilege(current_user,'public','CREATE') OR has_database_privilege(current_user,current_database(),'CREATE')) AS unsafe
          FROM pg_roles r WHERE r.rolname=current_user`;
        if(roles.length!==1||roles[0].unsafe)throw new PostgresError('PG_ROLE_UNSAFE','PostgreSQL runtime role has unsafe privileges.');
        this.migrationCount=await verifyMigrations(this.prisma,this.config.migrationsDirectory);
        const grants=await this.prisma.$queryRaw<{unsafe:boolean}[]>`SELECT has_table_privilege(current_user,'public._prisma_migrations','INSERT,UPDATE,DELETE,TRUNCATE') AS unsafe`;
        if(grants[0]?.unsafe)throw new PostgresError('PG_ROLE_UNSAFE','PostgreSQL runtime role can modify migration history.');
        if(this.stopRequested)throw new PostgresError('PG_STOPPED','PostgreSQL infrastructure has been stopped.');
        this.state='ready';return;
      } catch(error) {
        await this.prisma.$disconnect().catch(()=>undefined);
        const safe=safeFailure(error);
        if(this.stopRequested||safe.code!=='PG_UNAVAILABLE'||attempt===this.config.retries){this.state=this.stopRequested?'stopped':'failed';throw safe;}
        await new Promise(resolve=>setTimeout(resolve,this.config.retryDelayMs));
      }
    }
  }
  stop(): Promise<void> {
    if(!this.stopping){this.stopRequested=true;this.state='stopping';this.stopping=(async()=>{await this.connecting?.catch(()=>undefined);await this.prisma.$disconnect();this.state='stopped';})();}
    return this.stopping;
  }
}
let shared: PostgresInfrastructure|undefined;
export function postgresInfrastructure(): PostgresInfrastructure {
  if(!shared)shared=new PostgresInfrastructure(runtimeConfig());return shared;
}
