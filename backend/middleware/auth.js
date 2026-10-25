'use strict';
const User=require('../models/User');
const {getAuthRuntime,verifyLegacyToken}=require('../src/auth/runtime');
const {mongoObjectIdToUuid}=require('../src/identifiers/uuid');
const {AuthError,authResponse}=require('../src/auth/errors');
const protect=async(req,res,next)=>{
 try{
  const authorization=req.headers.authorization;
  if(typeof authorization!=='string'||!/^Bearer [^ ]+$/.test(authorization))throw new AuthError('AUTH_TOKEN');
  const token=authorization.slice(7),runtime=getAuthRuntime();
  if(runtime.mode==='postgres'){
   const principal=await runtime.sessions.authenticate(token);
   // Only explicitly reconciled identities can access the still-Mongo business domain.
   // Mongo identity/password/role is never used to authenticate or override PG state.
   const rows=await runtime.postgres.client.$queryRaw`SELECT mongo_user_id,patient_mongo_id,hospital_mongo_id FROM public.auth_legacy_links WHERE user_id=${principal.id}::uuid`;
   if(rows.length!==1)throw new AuthError('AUTH_DOMAIN_NOT_MIGRATED');
   req.principal=principal;req.user={_id:rows[0].mongo_user_id,id:rows[0].mongo_user_id,role:principal.role};
   // Reviewed self-profile reads only. Legacy clinical/admin handlers still use
   // role-only Mongo authorization; do not transfer their authority to PG sessions.
   const pathname=req.originalUrl.split('?')[0].replace(/\/$/,'');
   if(req.method==='GET'&&['/api/patients/profile','/api/patients/qr'].includes(pathname)&&principal.role==='patient'&&rows[0].patient_mongo_id){
    await runtime.policies.patientSelf(principal,mongoObjectIdToUuid(rows[0].patient_mongo_id));
   }else if(req.method==='GET'&&pathname==='/api/hospitals/admin/profile'&&principal.role==='hospital_admin'&&rows[0].hospital_mongo_id){
    await runtime.policies.hospitalAdmin(principal,mongoObjectIdToUuid(rows[0].hospital_mongo_id));
   }else throw new AuthError('AUTH_DOMAIN_NOT_MIGRATED');
  }else{
   const principal=verifyLegacyToken(token);
   req.user=await User.findById(principal.mongoId).select('-password -resetPasswordToken -resetPasswordExpire');
   if(!req.user?.isActive||req.user.role!==principal.role)throw new AuthError('AUTH_TOKEN');
  }
  next();
 }catch(error){const result=authResponse(error);res.status(result.status).json(result.body);}
};
const authorize=(...roles)=>(req,res,next)=>{if(!roles.includes(req.user.role))return res.status(403).json({message:'Access denied.'});next();};
module.exports={protect,authorize};
