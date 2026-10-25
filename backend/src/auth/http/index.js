'use strict';
const express=require('express');
const {randomBytes,timingSafeEqual}=require('node:crypto');
const {AuthError,authResponse}=require('../errors');
function cookies(req){const result={};for(const part of String(req.headers.cookie||'').split(';')){const index=part.indexOf('=');if(index<1)continue;const key=part.slice(0,index).trim();if(key in result)throw new AuthError('AUTH_INPUT');try{result[key]=decodeURIComponent(part.slice(index+1).trim());}catch{throw new AuthError('AUTH_INPUT');}}return result;}
function token(req){const value=req.headers.authorization;if(typeof value!=='string'||!/^Bearer [^ ]+$/.test(value))throw new AuthError('AUTH_TOKEN');return value.slice(7);}
const safe=fn=>(req,res,next)=>Promise.resolve().then(()=>fn(req,res,next)).catch(next);
function createAuthRouter(runtime){
 const router=express.Router(),{sessions,limits,provisioning,http}=runtime;
 const options={httpOnly:true,secure:http.secure,sameSite:http.sameSite,path:'/api/auth'};
 const refresh=(res,result,issue=true)=>{if(issue)res.cookie('mediid_refresh',result.refreshSecret,{...options,expires:result.expiresAt});res.set('Cache-Control','no-store');return {token:result.token,user:result.user,profile:result.profile};};
 const csrf=req=>{
  if(!http.origins.includes(req.headers.origin))throw new AuthError('AUTH_FORBIDDEN');
  const header=req.headers['x-mediid-csrf'],cookie=cookies(req).mediid_csrf;
  if(typeof header!=='string'||typeof cookie!=='string'||!/^[A-Za-z0-9_-]{43}$/.test(header)||header.length!==cookie.length||!timingSafeEqual(Buffer.from(header),Buffer.from(cookie)))throw new AuthError('AUTH_FORBIDDEN');
 };
 const limited=(operation,identity)=>safe(async(req,res,next)=>{await limits.consume(operation,req.socket.remoteAddress||'unknown',identity(req));next();});
 const protectedRoute=safe(async(req,res,next)=>{req.principal=await sessions.authenticate(token(req));next();});
 router.use((req,res,next)=>{
  res.set('Cache-Control','no-store');
  if(!['GET','HEAD','OPTIONS'].includes(req.method)&&(!req.body||typeof req.body!=='object'||Array.isArray(req.body)))return next(new AuthError('AUTH_INPUT'));
  next();
 });
 router.get('/config',(req,res)=>res.json({backend:'postgres'}));
 router.get('/csrf',safe(async(req,res)=>{
  if(req.headers.origin&&!http.origins.includes(req.headers.origin))throw new AuthError('AUTH_FORBIDDEN');
  const existing=cookies(req).mediid_csrf,value=typeof existing==='string'&&/^[A-Za-z0-9_-]{43}$/.test(existing)?existing:randomBytes(32).toString('base64url');
  res.cookie('mediid_csrf',value,{...options,httpOnly:false,maxAge:86400000});res.json({csrfToken:value});
 }));
 router.use((req,res,next)=>{try{if(!['GET','HEAD','OPTIONS'].includes(req.method))csrf(req);next();}catch(error){next(error);}});
 router.post('/login',limited('login',r=>r.body.email||r.body.identity),safe(async(req,res)=>{
  let actor;if(req.body.refresh===false){actor=await sessions.authenticate(token(req));if(actor.role!=='hospital_admin')throw new AuthError('AUTH_FORBIDDEN');}
  const result=await sessions.login(req.body.identity||req.body.email,req.body.password);
  if(actor){
   try{
    const hospitals=await runtime.postgres.client.$queryRaw`SELECT h.id,l.hospital_mongo_id FROM public.hospitals h LEFT JOIN public.auth_legacy_links l ON l.user_id=h.user_id WHERE h.user_id=${actor.id}::uuid`;
    if(hospitals.length!==1)throw new AuthError('AUTH_FORBIDDEN');
    await runtime.policies.hospitalAdmin(actor,hospitals[0].id);
    const doctor=await sessions.authenticate(result.token);await runtime.policies.doctorHospital(doctor,hospitals[0].id);
    result.profile={...result.profile,authorizedHospitalId:hospitals[0].hospital_mongo_id||hospitals[0].id};
   }catch(error){await sessions.logout(result.refreshSecret);throw error;}
  }
  res.json(refresh(res,result,!actor));
 }));
 router.post('/register',limited('register',r=>r.body.email),safe(async(req,res)=>{res.status(201).json(refresh(res,await sessions.register(req.body)));}));
 router.post('/refresh',limited('refresh',r=>cookies(r).mediid_refresh),safe(async(req,res)=>{try{res.json(refresh(res,await sessions.refresh(cookies(req).mediid_refresh)));}catch(error){if(error instanceof AuthError&&error.code==='AUTH_TOKEN')res.clearCookie('mediid_refresh',options);throw error;}}));
 router.post('/logout',safe(async(req,res)=>{
  if(req.body.sessionOnly===true){await sessions.revokeCurrent(await sessions.authenticate(token(req)));}
  else {await sessions.logout(cookies(req).mediid_refresh);res.clearCookie('mediid_refresh',options);}
  res.json({message:'Signed out.'});
 }));
 router.get('/me',protectedRoute,safe(async(req,res)=>res.json(await sessions.me(req.principal))));
 router.post('/forgot-password',limited('resetRequest',r=>r.body.email),safe(async(req,res)=>res.json(await sessions.requestReset(req.body.email,runtime.delivery))));
 router.post('/reset-password',limited('resetComplete',r=>r.body.token),safe(async(req,res)=>{const result=await sessions.resetPassword(req.body.token,req.body.newPassword);res.clearCookie('mediid_refresh',options);res.json(result);}));
 router.post('/doctor-activate',limited('activate',r=>r.body.uid),safe(async(req,res)=>res.status(201).json(await provisioning.activateDoctor(req.body))));
 router.post('/provision/doctors',protectedRoute,limited('provision',r=>r.principal.id),safe(async(req,res)=>res.status(201).json(await provisioning.createDoctor(req.principal,req.body))));
 router.post('/provision/memberships',protectedRoute,limited('provision',r=>r.principal.id),safe(async(req,res)=>res.status(201).json(await provisioning.addMembership(req.principal,req.body))));
 router.delete('/provision/memberships/:id',protectedRoute,limited('provision',r=>r.principal.id),safe(async(req,res)=>res.json(await provisioning.removeMembership(req.principal,req.params.id))));
 router.post('/provision/staff-links',protectedRoute,limited('provision',r=>r.principal.id),safe(async(req,res)=>res.json(await provisioning.linkStaff(req.principal,req.body))));
 router.use((error,req,res,next)=>{const result=authResponse(error);if(error?.retryAfter)res.set('Retry-After',String(error.retryAfter));res.status(result.status).json(result.body);});
 return router;
}
module.exports={createAuthRouter,cookies,bearerToken:token};
