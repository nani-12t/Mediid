'use strict';
const {randomBytes,createHash}=require('node:crypto');
const {AppointmentRepository}=require('../repositories');
const {AppointmentError,databaseOperation}=require('../errors');
const {newPostgresId}=require('../../identifiers/uuid');
const {isInternalId}=require('../../auth/identity');
const {AppointmentNotifications}=require('../notifications');
const {verifiedResult}=require('../payments');
const {policyInput}=require('../policies');
const {materializeAppointments}=require('../materializer');
const v=require('../validation');
const {camel,appointmentDTO,availabilityDTO}=require('../dto');
function credential(){const secret=randomBytes(32).toString('base64url');return {secret,digest:createHash('sha256').update(secret).digest('hex')};}
class Appointments{
 constructor(runtime,{organizations,paymentProvider,delivery,clientUrl='http://localhost:3000',confirmPolicy={windowMs:60000,sourceMax:60,identityMax:10}}={}){
  if(runtime?.mode!=='postgres'||!runtime.postgres||!runtime.sessions||!runtime.limits||!organizations||!paymentProvider||!delivery)throw new AppointmentError('APPOINTMENT_CONFIG');
  Object.assign(this,{runtime,organizations,paymentProvider,confirmPolicy});
  this.repository=new AppointmentRepository(runtime.postgres);
  this.notifications=new AppointmentNotifications(delivery,clientUrl);
 }
 async actor(actor){
  if(!actor||!isInternalId(actor.id)||!['patient','doctor','hospital_admin','hospital_staff','support_agent'].includes(actor.role))throw new AppointmentError('APPOINTMENT_FORBIDDEN');
  const current=await this.runtime.sessions.repository.byId(actor.id);
  if(!current?.isActive||current.role!==actor.role)throw new AppointmentError('APPOINTMENT_FORBIDDEN');
 }
 async read(actor,operation,input={}){
  await this.actor(actor);return databaseOperation(()=>this.repository.read(actor.id,operation,input));
 }
 async command(actor,operation,input={}){
  await this.actor(actor);return databaseOperation(()=>this.repository.command(actor.id,operation,input));
 }
 async provider(kind,value){
  try{return (await this.organizations[kind==='doctor'?'requireDoctor':'requireHospital'](value,{uid:/^(?:HID|DOC)-/.test(value)})).id;}
  catch(error){throw new AppointmentError(error?.code==='ORG_INPUT'?'APPOINTMENT_INPUT':error?.code==='ORG_NOT_FOUND'?'APPOINTMENT_NOT_FOUND':'APPOINTMENT_UNAVAILABLE');}
 }
 async resolveProviders(input){
  const result={...input};
  for(const [field,kind]of [['doctor','doctor'],['doctorId','doctor'],['hospital','hospital'],['hospitalId','hospital']])if(result[field]!==undefined)result[field]=await this.provider(kind,result[field]);
  return result;
 }
 async availability(input,actor){
  const query=await this.resolveProviders(v.availability(input));
  // Public discovery is online only. Offline availability requires current scheduling authorization in SQL.
  if(query.channel==='OFFLINE'&&!actor)throw new AppointmentError('APPOINTMENT_FORBIDDEN');
  if(actor)await this.actor(actor);
  return (await databaseOperation(()=>this.repository.read(actor?.id||null,'availability',query))||[]).map(availabilityDTO);
 }
 async notify(actor,data,secret,kind='booked'){
  try{
   const contact=camel(await this.repository.read(actor.id,'notification',{id:data.id}));
   return this.notifications.send(kind,{...data,...contact},secret);
  }catch{return false;}
 }
 async book(actor,input){
  await this.actor(actor);const payload=await this.resolveProviders(v.booking(input,actor)),token=credential();
  const row=await this.command(actor,'book',{...payload,id:newPostgresId(),reservationId:newPostgresId(),confirmationDigest:token.digest});
  const data=camel(row);await this.notify(actor,data,token.secret);
  return appointmentDTO(data,{role:actor.role});
 }
 async list(actor,kind,input={}){
  const allowed={my:['patient'],hospital:['hospital_admin','hospital_staff'],doctor:['doctor'],support:['support_agent']};
  if(!allowed[kind]?.includes(actor?.role))throw new AppointmentError('APPOINTMENT_FORBIDDEN');
  const fields=kind==='hospital'?['status','since','limit','hospitalId']:kind==='support'?['status','since','limit','patientId']:['status','since','limit'];
  v.object(input,fields);const query=await this.resolveProviders(v.list(input));
  if(query.status==='all')delete query.status;
  if(kind==='support'&&!query.patientId)throw new AppointmentError('APPOINTMENT_INPUT');
  return (await this.read(actor,kind,query)||[]).map(row=>appointmentDTO(row,{role:actor.role}));
 }
 async count(actor,input={}){
  v.object(input,['hospitalId']);const query={};
  if(input.hospitalId!==undefined)query.hospitalId=await this.provider('hospital',v.identifier(input.hospitalId));
  return this.read(actor,'count',query);
 }
 async get(actor,id){
  const row=await this.read(actor,'get',{id:v.id(id)});
  if(!row)throw new AppointmentError('APPOINTMENT_NOT_FOUND');
  return appointmentDTO(row,{role:actor.role});
 }
 async confirm(actor,id){
  const row=await this.command(actor,'confirm',{id:v.id(id)});
  return appointmentDTO(row,{role:actor.role});
 }
 async publicConfirm(secret,source){
  let digest=createHash('sha256').update(typeof secret==='string'?secret.slice(0,1024):'invalid').digest('hex');
  try{await this.runtime.limits.consume('appointmentConfirm',source,digest,this.confirmPolicy);}
  catch(error){
   const result=new AppointmentError(error?.code==='AUTH_RATE_LIMIT'?'APPOINTMENT_RATE_LIMIT':'APPOINTMENT_UNAVAILABLE');
   if(error?.retryAfter)result.retryAfter=error.retryAfter;throw result;
  }
  try{v.token(secret);}catch{throw new AppointmentError('APPOINTMENT_NOT_FOUND');}
  const row=await databaseOperation(()=>this.repository.confirm(digest));
  if(!row)throw new AppointmentError('APPOINTMENT_NOT_FOUND');
  return {message:'Patient acknowledgement recorded. Payment and provider confirmation requirements still apply.',status:camel(row).status};
 }
 async status(actor,id,input){
  const patch=v.status(input);
  if(!['doctor','hospital_admin','hospital_staff'].includes(actor?.role))throw new AppointmentError('APPOINTMENT_FORBIDDEN');
  const row=await this.command(actor,patch.status==='cancelled'?'cancel':'status',{...patch,id:v.id(id)});
  return appointmentDTO(row,{role:actor.role});
 }
 async checkIn(actor,id){return this.status(actor,id,{status:'checked_in'});}
 async cancel(actor,id,input={}){
  const row=await this.command(actor,'cancel',{...v.cancellation(input),id:v.id(id)});
  return appointmentDTO(row,{role:actor.role});
 }
 async transferApproval(actor,id,input={}){
  v.object(input,[]);return appointmentDTO(await this.command(actor,'transferApproval',{id:v.id(id),approved:true}),{role:actor.role});
 }
 async reschedule(actor,id,input){
  const token=credential(),row=await this.command(actor,'reschedule',{...v.reschedule(input),id:v.id(id),reservationId:newPostgresId(),confirmationDigest:token.digest});
  const data=camel(row);await this.notify(actor,data,token.secret);
  return appointmentDTO(data,{role:actor.role});
 }
 async pay(actor,id,key,input={}){
  v.object(input,[]);const idempotencyKey=v.idempotency(key);
  await this.actor(actor);
  if(this.paymentProvider.name==='disabled')throw new AppointmentError('APPOINTMENT_PAYMENT_UNAVAILABLE');
  const intent=camel(await this.command(actor,'paymentCreate',{id:v.id(id),paymentId:newPostgresId(),idempotencyKey,provider:this.paymentProvider.name}));
  if(intent.status!=='CAPTURED')await this.capture(intent,null);
  return {message:'Appointment payment processed.',appointment:await this.get(actor,id)};
 }
 async capture(input,actorId){
  const intent=camel(input),response=verifiedResult(await this.paymentProvider.capture(intent),intent,'CAPTURED');
  return databaseOperation(()=>this.repository.command(actorId??null,'paymentCapture',{paymentId:intent.id,provider:response.provider,transactionRef:response.transactionRef,amount:response.amount,currency:response.currency,status:response.status}));
 }
 async policies(actor,input={}){
  v.object(input,['hospitalId','doctorId']);const query={};
  for(const key of ['hospitalId','doctorId'])if(input[key]!==undefined)query[key]=v.identifier(input[key]);
  return camel(await this.read(actor,'policies',await this.resolveProviders(query)));
 }
 async savePolicy(actor,input){return camel(await this.command(actor,'policy',await this.resolveProviders(policyInput(input))));}
 async overrides(actor,input={}){
  v.object(input,['hospitalId']);const query={};
  if(input.hospitalId!==undefined)query.hospitalId=v.identifier(input.hospitalId);
  return camel(await this.read(actor,'overrides',await this.resolveProviders(query)));
 }
 async saveOverride(actor,input){return camel(await this.command(actor,'override',{...await this.resolveProviders(v.override(input)),id:newPostgresId()}));}
 async removeOverride(actor,id){return this.command(actor,'deleteOverride',{id:v.id(id)});}
 materialize(days){return databaseOperation(()=>materializeAppointments(this.repository,days));}
 tick(){return databaseOperation(()=>this.repository.tick());}
 async reminders(){
  const rows=camel(await databaseOperation(()=>this.repository.reminders()));
  for(const row of rows)await this.notifications.send(row.notificationKind||'reminder',row);
  return {claimed:rows.length};
 }
 async refunds(){
  const rows=camel(await databaseOperation(()=>this.repository.refunds()));
  let processed=0;
  for(const intent of rows){
   if(intent.provider!==this.paymentProvider.name||this.paymentProvider.name==='disabled')continue;
   const response=verifiedResult(await this.paymentProvider.refund(intent),intent,'SUCCEEDED');
   await databaseOperation(()=>this.repository.command(null,'refundUpdate',{refundId:intent.id,provider:response.provider,transactionRef:response.transactionRef,status:response.status}));
   processed++;
  }
  return {processed};
 }
 async reconcilePayments(){
  const rows=camel(await databaseOperation(()=>this.repository.payments()));let processed=0;
  for(const intent of rows){
   if(intent.provider!==this.paymentProvider.name||this.paymentProvider.name==='disabled')continue;
   await this.capture(intent,null);processed++;
  }
  return {processed};
 }
}
module.exports={Appointments,credential};
