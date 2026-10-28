'use strict';
const camel=row=>Object.fromEntries(Object.entries(row).map(([key,value])=>[key.replace(/_([a-z])/g,(_,letter)=>letter.toUpperCase()),value]));
class PatientRepository {
 constructor(infrastructure){this.infrastructure=infrastructure;}
 get db(){return this.infrastructure.client;}
 async profile(actor){const rows=await this.db.$queryRaw`SELECT public.mediid_get_patient_profile(${actor}::uuid) AS data`;return rows[0]?.data?camel(rows[0].data):null;}
 async updateProfile(actor,patch){return this.db.$queryRaw`SELECT public.mediid_update_patient_profile(${actor}::uuid,${JSON.stringify(patch)}::jsonb)`;}
 async benefits(actor){const rows=await this.db.$queryRaw`SELECT public.mediid_list_patient_benefits(${actor}::uuid) AS data`;return (rows[0]?.data||[]).map(camel);}
 async saveBenefit(actor,id,patch,create){return this.db.$queryRaw`SELECT public.mediid_save_patient_benefit(${actor}::uuid,${id}::uuid,${JSON.stringify(patch)}::jsonb,${create}::boolean)`;}
 async removeBenefit(actor,id){return this.db.$queryRaw`SELECT public.mediid_deactivate_patient_benefit(${actor}::uuid,${id}::uuid)`;}
 async trusted(actor){const rows=await this.db.$queryRaw`SELECT public.mediid_patient_trusted_providers(${actor}::uuid) AS data`;return rows[0]?.data||{doctors:[],hospitals:[]};}
 async setTrusted(actor,kind,id,isAdd){return this.db.$queryRaw`SELECT public.mediid_set_patient_trusted_provider(${actor}::uuid,${kind}::text,${id}::uuid,${isAdd}::boolean)`;}
 async scan(uid){const rows=await this.db.$queryRaw`SELECT public.mediid_patient_emergency_card(${uid}::text) AS data`;return rows[0]?.data||null;}
}
module.exports={PatientRepository,camel};
