'use strict';
const {sqlCode}=require('../errors');
class ClinicalRepository{
 constructor(infrastructure){this.infrastructure=infrastructure;}
 get db(){return this.infrastructure.client;}
 async execute(kind,actor,operation,input){
  // Each call is one autocommitted statement. Authorization denials are returned,
  // never thrown in a surrounding transaction that would discard the audit row.
  for(let attempt=0;attempt<3;attempt++){
   try{
    const rows=kind==='read'
     ?await this.db.$queryRaw`SELECT public.mediid_clinical_read(${actor}::uuid,${operation}::text,${JSON.stringify(input)}::jsonb) AS data`
     :await this.db.$queryRaw`SELECT public.mediid_clinical_command(${actor}::uuid,${operation}::text,${JSON.stringify(input)}::jsonb) AS data`;
    return rows[0]?.data;
   }catch(error){if(attempt===2||!['40P01','40001'].includes(sqlCode(error)))throw error;}
  }
 }
 read(actor,operation,input={}){return this.execute('read',actor,operation,input);}
 command(actor,operation,input={}){return this.execute('command',actor,operation,input);}
}
module.exports={ClinicalRepository};
