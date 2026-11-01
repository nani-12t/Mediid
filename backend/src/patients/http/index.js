'use strict';
const express=require('express');
const {AuthError}=require('../../auth/errors');
const {PatientError,patientResponse}=require('../errors');
const {ClinicalError,clinicalResponse}=require('../../clinical/errors');
const v=require('../validation');
const safe=fn=>(req,res,next)=>Promise.resolve().then(()=>fn(req,res,next)).catch(next);
function createPatientRouter(runtime,service,{clinical}={}){
 if(runtime?.mode!=='postgres'||!service)throw new PatientError('PATIENT_CONFIG');
 const router=express.Router();
 router.use((req,res,next)=>{
  res.set('Cache-Control','no-store');
  if(!['GET','HEAD','OPTIONS'].includes(req.method)&&req.headers.origin&&!runtime.http.origins.includes(req.headers.origin))return next(new AuthError('AUTH_FORBIDDEN'));
  next();
 });
 router.get('/scan/:uid',safe(async(req,res)=>res.json(await service.scan(req.params.uid,req.socket.remoteAddress||'unknown'))));
 router.use(safe(async(req,res,next)=>{
  const authorization=req.headers.authorization;
  if(typeof authorization!=='string'||!/^Bearer [^ ]+$/.test(authorization))throw new AuthError('AUTH_TOKEN');
  req.principal=await runtime.sessions.authenticate(authorization.slice(7));
  v.object(req.query,[]);next();
 }));
 router.get('/profile',safe(async(req,res)=>{const profile=await service.profile(req.principal);res.json(clinical?await clinical.composeProfile(req.principal,profile):profile);}));
 router.put('/profile',safe(async(req,res)=>{const profile=await service.updateProfile(req.principal,req.body);res.json(clinical?await clinical.composeProfile(req.principal,profile):profile);}));
 if(clinical)router.post('/documents',safe(async(req,res)=>res.status(201).json(await clinical.registerDocument(req.principal,req.body))));
 router.get('/qr',safe(async(req,res)=>res.json(await service.qr(req.principal))));
 router.get('/medical-benefits',safe(async(req,res)=>res.json(await service.benefits(req.principal))));
 router.post('/medical-benefits',safe(async(req,res)=>res.status(201).json(await service.saveBenefit(req.principal,req.body))));
 router.put('/medical-benefits/:id',safe(async(req,res)=>res.json(await service.saveBenefit(req.principal,req.body,req.params.id))));
 router.delete('/medical-benefits/:id',safe(async(req,res)=>res.json(await service.removeBenefit(req.principal,req.params.id))));
 router.post('/government-benefits',safe(async(req,res)=>res.status(201).json(await service.governmentBenefit(req.principal,req.body))));
 router.get('/trusted-providers',safe(async(req,res)=>res.json(await service.trustedProviders(req.principal))));
 for(const [kind,plural]of [['doctor','doctors'],['hospital','hospitals']]){
  router.post('/trusted-'+plural+'/:id',safe(async(req,res)=>(v.object(req.body===undefined?{}:req.body,[]),res.json(await service.setTrusted(req.principal,kind,req.params.id,true)))));
  router.delete('/trusted-'+plural+'/:id',safe(async(req,res)=>(v.object(req.body===undefined?{}:req.body,[]),res.json(await service.setTrusted(req.principal,kind,req.params.id,false)))));
 }
 router.use((req,res,next)=>next(new AuthError('AUTH_DOMAIN_NOT_MIGRATED')));
 router.use((error,req,res,next)=>{
  const result=error instanceof ClinicalError?clinicalResponse(error):patientResponse(error);if(error?.retryAfter)res.set('Retry-After',String(error.retryAfter));
  res.status(result.status).json(result.body);
 });
 return router;
}
module.exports={createPatientRouter};
