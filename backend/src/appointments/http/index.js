'use strict';
const express=require('express');
const {AuthError}=require('../../auth/errors');
const {AppointmentError,appointmentResponse}=require('../errors');
const v=require('../validation');
const safe=fn=>(req,res,next)=>Promise.resolve().then(()=>fn(req,res,next)).catch(next);
function createAppointmentRouter(runtime,service){
 if(runtime?.mode!=='postgres'||!service)throw new AppointmentError('APPOINTMENT_CONFIG');
 const router=express.Router();
 router.use((req,res,next)=>{
  res.set({'Cache-Control':'no-store','Referrer-Policy':'no-referrer'});
  if(!['GET','HEAD','OPTIONS'].includes(req.method)&&req.headers.origin&&!runtime.http.origins.includes(req.headers.origin))return next(new AuthError('AUTH_FORBIDDEN'));
  next();
 });
 async function authenticate(req,optional=false){
  const authorization=req.headers.authorization;
  if(optional&&authorization===undefined)return;
  if(typeof authorization!=='string'||!/^Bearer [^ ]+$/.test(authorization))throw new AuthError('AUTH_TOKEN');
  req.principal=await runtime.sessions.authenticate(authorization.slice(7));
 }
 router.get('/confirm/:token',safe(async(req,res)=>{
  v.object(req.query,[]);
  res.json(await service.publicConfirm(req.params.token,req.socket.remoteAddress||'unknown'));
 }));
 router.get('/availability',safe(async(req,res)=>{
  await authenticate(req,true);res.json(await service.availability(req.query,req.principal));
 }));
 router.use(safe(async(req,res,next)=>{await authenticate(req);next();}));
 router.get('/my',safe(async(req,res)=>res.json(await service.list(req.principal,'my',req.query))));
 router.get('/hospital/count',safe(async(req,res)=>res.json(await service.count(req.principal,req.query))));
 router.get('/hospital',safe(async(req,res)=>res.json(await service.list(req.principal,'hospital',req.query))));
 router.get('/doctor',safe(async(req,res)=>res.json(await service.list(req.principal,'doctor',req.query))));
 router.get('/support',safe(async(req,res)=>res.json(await service.list(req.principal,'support',req.query))));
 router.get('/policies',safe(async(req,res)=>res.json(await service.policies(req.principal,req.query))));
 router.put('/policies',safe(async(req,res)=>{v.object(req.query,[]);res.json(await service.savePolicy(req.principal,req.body));}));
 router.get('/overrides',safe(async(req,res)=>res.json(await service.overrides(req.principal,req.query))));
 router.post('/overrides',safe(async(req,res)=>{v.object(req.query,[]);res.status(201).json(await service.saveOverride(req.principal,req.body));}));
 router.delete('/overrides/:id',safe(async(req,res)=>{v.object(req.query,[]);v.object(req.body||{},[]);res.json(await service.removeOverride(req.principal,req.params.id));}));
 router.post('/',safe(async(req,res)=>{v.object(req.query,[]);res.status(201).json(await service.book(req.principal,req.body));}));
 router.get('/:id',safe(async(req,res)=>{v.object(req.query,[]);res.json(await service.get(req.principal,req.params.id));}));
 for(const [method,path,operation]of [
  ['post','/:id/confirm','confirm'],['post','/:id/check-in','checkIn'],['post','/:id/transfer-approval','transferApproval']
 ])router[method](path,safe(async(req,res)=>{
  v.object(req.query,[]);v.object(req.body||{},[]);res.json(await service[operation](req.principal,req.params.id,req.body||{}));
 }));
 router.put('/:id/status',safe(async(req,res)=>{v.object(req.query,[]);res.json(await service.status(req.principal,req.params.id,req.body));}));
 router.put('/:id/pay',safe(async(req,res)=>{v.object(req.query,[]);res.json(await service.pay(req.principal,req.params.id,req.headers['idempotency-key'],req.body||{}));}));
 router.post('/:id/reschedule',safe(async(req,res)=>{v.object(req.query,[]);res.json(await service.reschedule(req.principal,req.params.id,req.body));}));
 router.delete('/:id',safe(async(req,res)=>{v.object(req.query,[]);res.json(await service.cancel(req.principal,req.params.id,req.body||{}));}));
 router.use((req,res,next)=>next(new AppointmentError('APPOINTMENT_NOT_FOUND')));
 router.use((error,req,res,next)=>{
  const result=appointmentResponse(error);if(error?.retryAfter)res.set('Retry-After',String(error.retryAfter));
  res.status(result.status).json(result.body);
 });
 return router;
}
module.exports={createAppointmentRouter};
