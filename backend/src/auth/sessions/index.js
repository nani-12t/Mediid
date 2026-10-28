'use strict';
const {randomBytes,createHash}=require('node:crypto');
const {newPostgresId}=require('../../identifiers/uuid');
const {generatePatientUID}=require('../../../utils/idGenerator');
const {IdentityRepository}=require('../repositories/identity');
const {Authentication}=require('../services/authentication');
const {loginIdentity,canonicalEmail}=require('../identity');
const {resetDigest}=require('../crypto/reset');
const {AuthError}=require('../errors');
const digest=secret=>{if(typeof secret!=='string'||!/^[A-Za-z0-9_-]{43}$/.test(secret))throw new AuthError('AUTH_TOKEN');return createHash('sha256').update(secret).digest('hex');};
// Every credential-changing transaction locks the user before any session row.
// This order serializes rotation, reset and administrative revocation across connections.
class Sessions {
 constructor(config,infrastructure,passwords,tokens,{refreshSeconds=604800,clientUrl='http://localhost:3000'}={}) {
  if(!Number.isInteger(refreshSeconds)||refreshSeconds<900||refreshSeconds>2592000)throw new AuthError('AUTH_CONFIG');
  Object.assign(this,{config,infrastructure,passwords,tokens,refreshSeconds,clientUrl});
  this.repository=new IdentityRepository(infrastructure);
  this.foundation=new Authentication(config,this.repository,passwords,tokens);
 }
 get db(){return this.infrastructure.client;}
 async lockUser(tx,id){return (await tx.$queryRaw`SELECT id,email,uid,role::text role,password_hash,is_active,auth_version,reset_password_token,reset_password_expires_at FROM public.users WHERE id=${id}::uuid FOR UPDATE`)[0];}
 async metadata(user) {
  const rows=await this.db.$queryRaw`SELECT l.mongo_user_id,p.safe_profile FROM public.users u LEFT JOIN public.auth_legacy_links l ON l.user_id=u.id LEFT JOIN public.auth_profiles p ON p.user_id=u.id WHERE u.id=${user.id}::uuid`;
  const row=rows[0];return {user:{id:row?.mongo_user_id||user.id,identityId:user.id,email:user.email,uid:user.uid,role:user.role},profile:row?.safe_profile||null};
 }
 async create(tx,user,family=newPostgresId(),expiresAt=new Date(Date.now()+this.refreshSeconds*1000)) {
  const secret=randomBytes(32).toString('base64url'),id=newPostgresId(),hash=digest(secret);
  await tx.$executeRaw`INSERT INTO public.auth_sessions(id,user_id,family_id,refresh_digest,expires_at,auth_version) VALUES(${id}::uuid,${user.id}::uuid,${family}::uuid,${hash},${expiresAt},${user.auth_version})`;
  return {token:this.tokens.issue(user,{sid:family,jti:newPostgresId(),ver:user.auth_version}),refreshSecret:secret,expiresAt,id};
 }
 async login(identity,password) {
  let lookup;try{lookup=loginIdentity(identity);}catch{}
  const candidate=lookup?await this.repository.find(lookup):null;
  const match=await this.passwords.verify(password,candidate?.passwordHash);
  if(!match||!candidate?.isActive)throw new AuthError('AUTH_CREDENTIALS');
  const result=await this.db.$transaction(async tx=>{
   const user=await this.lockUser(tx,candidate.id);
   if(!user?.is_active||user.password_hash!==candidate.passwordHash)throw new AuthError('AUTH_CREDENTIALS');
   const issued=await this.create(tx,user);
   await tx.$executeRaw`UPDATE public.users SET last_login_at=clock_timestamp(),updated_at=clock_timestamp() WHERE id=${user.id}::uuid`;
   return {...issued,current:user};
  });
  return {...result,...await this.metadata(result.current),current:undefined};
 }
 async register(input) {
  if(!input||Object.keys(input).some(k=>!['email','password','role','firstName','lastName','phone','refresh'].includes(k))||input.role&&input.role!=='patient')throw new AuthError('AUTH_INPUT');
  const email=canonicalEmail(input.email),hash=await this.passwords.hash(input.password);
  const firstName=typeof input.firstName==='string'?input.firstName.trim():'',lastName=typeof input.lastName==='string'?input.lastName.trim():'';
  if(!firstName||!lastName||firstName.length>100||lastName.length>100||/[\x00-\x1f\x7f]/.test(firstName+lastName))throw new AuthError('AUTH_INPUT');
  if(input.phone!==undefined&&(typeof input.phone!=='string'||input.phone.length>32||/[\x00-\x1f\x7f]/.test(input.phone)))throw new AuthError('AUTH_INPUT');
  const id=newPostgresId(),patientId=newPostgresId(),uid=generatePatientUID();
  const profile={_id:patientId,uid,firstName,lastName,...(input.phone?{phone:input.phone}:{}),qrCode:JSON.stringify({type:'mediid_patient',uid,verifyUrl:this.clientUrl+'/verify/'+uid})};
  let result;
  try{result=await this.db.$transaction(async tx=>{
   await tx.$executeRaw`INSERT INTO public.users(id,email,uid,password_hash,role,updated_at) VALUES(${id}::uuid,${email},${uid},${hash},'patient',now())`;
   await tx.$executeRaw`INSERT INTO public.patients(id,user_id,uid,first_name,last_name,updated_at) VALUES(${patientId}::uuid,${id}::uuid,${uid},${firstName},${lastName},now())`;
   await tx.$executeRaw`INSERT INTO public.auth_profiles(user_id,profile_kind,public_uid,safe_profile) VALUES(${id}::uuid,'patient',${uid},${JSON.stringify(profile)}::jsonb)`;
   if(input.phone!==undefined)await tx.$queryRaw`SELECT public.mediid_update_patient_profile(${id}::uuid,${JSON.stringify({phone:input.phone})}::jsonb)`;
   const user=await this.lockUser(tx,id);return {...await this.create(tx,user),current:user};
  });}catch(error){if(error?.meta?.code==='23505'||error?.code==='P2002')throw new AuthError('AUTH_CONFLICT');throw error;}
  return {...result,...await this.metadata(result.current),current:undefined};
 }
 async refresh(secret) {
  const hash=digest(secret),candidate=(await this.db.$queryRaw`SELECT user_id FROM public.auth_sessions WHERE refresh_digest=${hash}`)[0];
  if(!candidate)throw new AuthError('AUTH_TOKEN');
  const result=await this.db.$transaction(async tx=>{
   const user=await this.lockUser(tx,candidate.user_id);
   const row=(await tx.$queryRaw`SELECT * FROM public.auth_sessions WHERE refresh_digest=${hash} FOR UPDATE`)[0];
   if(!row||!user?.is_active||row.auth_version!==user.auth_version||row.revoked_at||row.expires_at<=new Date())return null;
   if(row.consumed_at){
    await tx.$executeRaw`UPDATE public.auth_sessions SET revoked_at=COALESCE(revoked_at,clock_timestamp()),revoke_reason=COALESCE(revoke_reason,'refresh_reuse') WHERE family_id=${row.family_id}::uuid`;
    return null; // Commit family revocation before reporting rejected replay.
   }
   await tx.$executeRaw`UPDATE public.auth_sessions SET consumed_at=clock_timestamp(),last_used_at=clock_timestamp() WHERE id=${row.id}::uuid`;
   const next=await this.create(tx,user,row.family_id,row.expires_at);
   await tx.$executeRaw`UPDATE public.auth_sessions SET replacement_id=${next.id}::uuid WHERE id=${row.id}::uuid`;
   return {...next,current:user};
  });
  if(!result)throw new AuthError('AUTH_TOKEN');
  return {...result,...await this.metadata(result.current),current:undefined};
 }
 async authenticate(token) {
  const claim=this.tokens.verify(token);if(!claim.sid||!claim.jti||!Number.isSafeInteger(claim.ver))throw new AuthError('AUTH_TOKEN');
  const rows=await this.db.$queryRaw`SELECT u.id,u.role::text role FROM public.users u JOIN public.auth_sessions s ON s.user_id=u.id WHERE u.id=${claim.id}::uuid AND u.is_active AND u.role::text=${claim.role} AND u.auth_version=${claim.ver} AND s.family_id=${claim.sid}::uuid AND s.auth_version=u.auth_version AND s.consumed_at IS NULL AND s.revoked_at IS NULL AND s.expires_at>clock_timestamp() LIMIT 1`;
  if(rows.length!==1)throw new AuthError('AUTH_TOKEN');return claim;
 }
 async me(principal){const user=await this.repository.byId(principal.id);if(!user?.isActive||user.role!==principal.role)throw new AuthError('AUTH_TOKEN');return this.metadata(user);}
 async revokeAll(userId,reason='administrative') {
  await this.db.$transaction(async tx=>{await this.lockUser(tx,userId);await tx.$executeRaw`UPDATE public.auth_sessions SET revoked_at=COALESCE(revoked_at,clock_timestamp()),revoke_reason=COALESCE(revoke_reason,${reason}) WHERE user_id=${userId}::uuid`;});
 }
 async revokeCurrent(principal) {
  if(!principal?.sid)throw new AuthError('AUTH_TOKEN');
  await this.db.$transaction(async tx=>{await this.lockUser(tx,principal.id);await tx.$executeRaw`UPDATE public.auth_sessions SET revoked_at=COALESCE(revoked_at,clock_timestamp()),revoke_reason=COALESCE(revoke_reason,'logout') WHERE user_id=${principal.id}::uuid AND family_id=${principal.sid}::uuid`;});
 }
 async logout(secret) {
  let hash;try{hash=digest(secret);}catch{return;}
  const candidate=(await this.db.$queryRaw`SELECT user_id,family_id FROM public.auth_sessions WHERE refresh_digest=${hash}`)[0];
  if(!candidate)return;
  await this.db.$transaction(async tx=>{await this.lockUser(tx,candidate.user_id);await tx.$executeRaw`UPDATE public.auth_sessions SET revoked_at=COALESCE(revoked_at,clock_timestamp()),revoke_reason=COALESCE(revoke_reason,'logout') WHERE family_id=${candidate.family_id}::uuid`;});
 }
 requestReset(identity,delivery){return this.foundation.requestReset(identity,delivery);}
 async resetPassword(secret,newPassword){
  const hash=resetDigest(secret),passwordHash=await this.passwords.hash(newPassword);
  const candidate=(await this.db.$queryRaw`SELECT id FROM public.users WHERE reset_password_token=${hash}`)[0];
  if(!candidate)throw new AuthError('AUTH_RESET');
  await this.db.$transaction(async tx=>{
   const user=await this.lockUser(tx,candidate.id);
   if(!user?.is_active||user.reset_password_token!==hash||!user.reset_password_expires_at||user.reset_password_expires_at<=new Date())throw new AuthError('AUTH_RESET');
   await tx.$executeRaw`UPDATE public.users SET password_hash=${passwordHash},reset_password_token=NULL,reset_password_expires_at=NULL,updated_at=clock_timestamp() WHERE id=${user.id}::uuid`;
   await tx.$executeRaw`UPDATE public.auth_sessions SET revoked_at=COALESCE(revoked_at,clock_timestamp()),revoke_reason=COALESCE(revoke_reason,'password_reset') WHERE user_id=${user.id}::uuid`;
  });return {message:'Password has been reset.'};
 }
}
module.exports={Sessions,refreshDigest:digest};
