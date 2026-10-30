'use strict';
class AppointmentRepository{
 constructor(infrastructure){this.infrastructure=infrastructure;}
 get db(){return this.infrastructure.client;}
 async read(actor,operation,input={}){
  const rows=await this.db.$queryRaw`SELECT public.mediid_appointment_read(${actor}::uuid,${operation}::text,${JSON.stringify(input)}::jsonb) AS data`;
  return rows[0]?.data;
 }
 async command(actor,operation,input={}){
  const rows=await this.db.$queryRaw`SELECT public.mediid_appointment_command(${actor}::uuid,${operation}::text,${JSON.stringify(input)}::jsonb) AS data`;
  return rows[0]?.data;
 }
 async confirm(digest){const rows=await this.db.$queryRaw`SELECT public.mediid_appointment_public_confirm(${digest}::text) AS data`;return rows[0]?.data;}
 async materialize(days){const rows=await this.db.$queryRaw`SELECT public.mediid_appointment_materialize(${days}::integer) AS data`;return rows[0]?.data;}
 async tick(){const rows=await this.db.$queryRaw`SELECT public.mediid_appointment_tick() AS data`;return rows[0]?.data;}
 async reminders(){const rows=await this.db.$queryRaw`SELECT public.mediid_appointment_reminders() AS data`;return rows[0]?.data||[];}
 async refunds(){const rows=await this.db.$queryRaw`SELECT public.mediid_appointment_refunds() AS data`;return rows[0]?.data||[];}
 async payments(){const rows=await this.db.$queryRaw`SELECT public.mediid_appointment_payments() AS data`;return rows[0]?.data||[];}
}
module.exports={AppointmentRepository};
