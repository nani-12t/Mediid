'use strict';
const {AppointmentError}=require('../errors');
const {Appointments}=require('../services');
const {createPaymentProvider}=require('../payments');
const {createDelivery}=require('../notifications');
const {AppointmentScheduler}=require('../scheduler');
function appointmentMode(env=process.env){
 if(!['legacy','postgres'].includes(env.APPOINTMENT_BACKEND))throw new AppointmentError('APPOINTMENT_CONFIG');
 return env.APPOINTMENT_BACKEND;
}
function appointmentConfig(env=process.env){
 const number=(name,fallback,min,max)=>{
  const value=env[name]??String(fallback);
  if(typeof value!=='string'||!/^\d+$/.test(value)||+value<min||+value>max)throw new AppointmentError('APPOINTMENT_CONFIG');return +value;
 };
 let url;try{url=new URL(env.APPOINTMENT_REDIS_URL);}catch{throw new AppointmentError('APPOINTMENT_CONFIG');}
 if(!['redis:','rediss:'].includes(url.protocol)||!url.hostname||url.hash||url.search||env.NODE_ENV==='production'&&url.protocol!=='rediss:')throw new AppointmentError('APPOINTMENT_CONFIG');
 const namespace=env.APPOINTMENT_QUEUE_NAMESPACE||'mediid-appointments-v25';
 if(!/^[a-zA-Z0-9_-]{1,64}$/.test(namespace))throw new AppointmentError('APPOINTMENT_CONFIG');
 return {url:url.toString(),namespace,horizonDays:number('APPOINTMENT_MATERIALIZE_DAYS_AHEAD',30,7,90),
  intervalMs:number('APPOINTMENT_SCHEDULER_INTERVAL_MS',5000,250,60000),
  materializeIntervalMs:number('APPOINTMENT_MATERIALIZE_INTERVAL_MS',900000,1000,86400000),
  confirmPolicy:{windowMs:number('APPOINTMENT_CONFIRM_WINDOW_MS',60000,100,3600000),sourceMax:number('APPOINTMENT_CONFIRM_SOURCE_MAX',60,1,10000),identityMax:number('APPOINTMENT_CONFIRM_IDENTITY_MAX',10,1,10000)}};
}
function createAppointmentRuntime(authRuntime,organizationRuntime,patientRuntime,env=process.env){
 const mode=appointmentMode(env);
 if(mode==='legacy')return {mode,start:async()=>{},stop:async()=>{}};
 if(authRuntime?.mode!=='postgres'||organizationRuntime?.mode!=='postgres'||patientRuntime?.mode!=='postgres'||!organizationRuntime.service||!patientRuntime.service)throw new AppointmentError('APPOINTMENT_CONFIG');
 const config=appointmentConfig(env);
 const service=new Appointments(authRuntime,{organizations:organizationRuntime.service,paymentProvider:createPaymentProvider(env),delivery:createDelivery(env),clientUrl:env.CLIENT_URL||authRuntime.http.origins[0],confirmPolicy:config.confirmPolicy});
 const scheduler=new AppointmentScheduler(service,config);
 return {mode,service,scheduler,start:()=>scheduler.start(),stop:()=>scheduler.stop()};
}
module.exports={appointmentMode,appointmentConfig,createAppointmentRuntime};
