'use strict';
const Redis=require('ioredis');
const {Queue,Worker}=require('bullmq');
const {AppointmentError}=require('../errors');
const JOBS=['materialize','tick','reminders','refunds','payments'];
class AppointmentScheduler{
 constructor(service,config){
  Object.assign(this,{service,config});this.state='stopped';
 }
 async start(){
  if(this.state==='ready')return;
  if(this.starting)return this.starting;
  this.stopping=undefined;
  this.starting=this.initialize();
  try{return await this.starting;}finally{this.starting=undefined;}
 }
 async initialize(){
  this.state='starting';
  const common={lazyConnect:true,enableOfflineQueue:false,retryStrategy:()=>null,connectTimeout:3000};
  this.redis=new Redis(this.config.url,{...common,maxRetriesPerRequest:1,commandTimeout:3000});
  this.workerRedis=new Redis(this.config.url,{...common,maxRetriesPerRequest:null});
  for(const connection of [this.redis,this.workerRedis]){
   connection.on('error',()=>{if(this.state==='ready')this.state='unavailable';});
   connection.on('end',()=>{if(this.state==='ready')this.state='unavailable';});
  }
  try{
   await Promise.all([this.redis.connect(),this.workerRedis.connect()]);
   await Promise.all([this.redis.ping(),this.workerRedis.ping()]);
   this.queue=new Queue(this.config.namespace,{connection:this.redis,defaultJobOptions:{removeOnComplete:100,removeOnFail:100,attempts:3,backoff:{type:'exponential',delay:1000}}});
   this.worker=new Worker(this.config.namespace,job=>this.process(job),{connection:this.workerRedis,concurrency:2,autorun:true});
   this.worker.on('error',()=>{if(this.state==='ready')this.state='unavailable';});
   // Errors and job payloads are deliberately not logged.
   this.worker.on('failed',()=>{});
   await Promise.all([this.queue.waitUntilReady(),this.worker.waitUntilReady()]);
   await this.service.materialize(this.config.horizonDays);
   await this.service.tick();
   for(const name of JOBS){
    const every=name==='materialize'?this.config.materializeIntervalMs:name==='reminders'?Math.max(this.config.intervalMs,10000):this.config.intervalMs;
    await this.queue.upsertJobScheduler('phase25-'+name,{every},{name,data:{},opts:{removeOnComplete:100,removeOnFail:100}});
   }
   this.state='ready';
  }catch{
   await this.stop();throw new AppointmentError('APPOINTMENT_UNAVAILABLE');
  }
 }
 async process(job){
  switch(job.name){
   case 'materialize':return this.service.materialize(this.config.horizonDays);
   case 'tick':return this.service.tick();
   case 'reminders':return this.service.reminders();
   case 'refunds':return this.service.refunds();
   case 'payments':return this.service.reconcilePayments();
   default:throw new AppointmentError('APPOINTMENT_CONFIG');
  }
 }
 async stop(){
  if(this.stopping)return this.stopping;
  this.stopping=(async()=>{
   this.state='stopping';
   // Closing a disconnected worker must not wait indefinitely for Redis.
   await this.worker?.close(true).catch(()=>{});
   await this.queue?.close().catch(()=>{});
   this.workerRedis?.disconnect();this.redis?.disconnect();
   this.state='stopped';
  })();
  return this.stopping;
 }
}
module.exports={AppointmentScheduler,JOBS};
