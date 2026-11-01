'use strict';
const express=require('express');
const {AuthError}=require('../../auth/errors');
const {ClinicalError,clinicalResponse}=require('../errors');
const v=require('../validation');
const safe=fn=>(req,res,next)=>Promise.resolve().then(()=>fn(req,res,next)).catch(next);
function authenticated(runtime){
 return safe(async(req,res,next)=>{
  res.set({'Cache-Control':'no-store','Referrer-Policy':'no-referrer'});
  if(!['GET','HEAD','OPTIONS'].includes(req.method)&&req.headers.origin&&!runtime.http.origins.includes(req.headers.origin))throw new AuthError('AUTH_FORBIDDEN');
  const authorization=req.headers.authorization;
  if(typeof authorization!=='string'||!/^Bearer [^ ]+$/.test(authorization))throw new AuthError('AUTH_TOKEN');
  req.principal=await runtime.sessions.authenticate(authorization.slice(7));next();
 });
}
function errors(error,req,res,next){const result=clinicalResponse(error);res.status(result.status).json(result.body);}
function createDoctorClinicalRouter(runtime,service){
 if(runtime?.mode!=='postgres'||!service)throw new ClinicalError('CLINICAL_CONFIG');
 const router=express.Router();router.use(authenticated(runtime));
 router.get('/queue',safe(async(req,res)=>res.json(await service.queue(req.principal,req.query))));
 router.get('/patient/:uid',safe(async(req,res)=>res.json(await service.ehr(req.principal,req.params.uid,req.query))));
 router.post('/encounters/start',safe(async(req,res)=>{v.object(req.query,[]);res.json(await service.start(req.principal,req.body));}));
 router.post('/encounters/:id/complete',safe(async(req,res)=>{v.object(req.query,[]);res.json(await service.complete(req.principal,req.params.id,req.body||{}));}));
 for(const [path,operation]of [['vitals','recordVital'],['notes','recordNote'],['conditions','recordCondition'],['allergies','recordAllergy']]){
  router.post('/encounters/:id/'+path,safe(async(req,res)=>{v.object(req.query,[]);res.status(201).json(await service[operation](req.principal,req.params.id,req.body));}));
 }
 router.post('/prescription',safe(async(req,res)=>{v.object(req.query,[]);res.status(201).json(await service.prescribe(req.principal,req.body));}));
 router.use((req,res,next)=>next(new ClinicalError('CLINICAL_NOT_FOUND')));router.use(errors);return router;
}
function createClinicalRouter(runtime,service){
 if(runtime?.mode!=='postgres'||!service)throw new ClinicalError('CLINICAL_CONFIG');
 const router=express.Router();router.use(authenticated(runtime));
 router.get('/me/encounters',safe(async(req,res)=>res.json(await service.self(req.principal,req.query))));
 router.use((req,res,next)=>next(new ClinicalError('CLINICAL_NOT_FOUND')));router.use(errors);return router;
}
module.exports={createDoctorClinicalRouter,createClinicalRouter};
