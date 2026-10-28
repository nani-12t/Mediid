'use strict';
const QRCode=require('qrcode');
const {PatientRepository}=require('../repositories');
const {PatientError,databaseOperation}=require('../errors');
const {AuthError}=require('../../auth/errors');
const {newPostgresId}=require('../../identifiers/uuid');
const {isInternalId}=require('../../auth/identity');
const {OrganizationError}=require('../../organizations/errors');
const providerValidation=require('../../organizations/validation');
const v=require('../validation');
const dto=require('../dto');
class Patients {
 constructor(runtime,{organizations,aadhaarHashKey,clientUrl='http://localhost:3000',scanPolicy={windowMs:60000,sourceMax:60,identityMax:120}}={}){
  if(runtime?.mode!=='postgres'||!runtime.postgres||!runtime.sessions||!runtime.limits||!organizations)throw new PatientError('PATIENT_CONFIG');
  v.aadhaarKey(aadhaarHashKey);
  if(!Number.isInteger(scanPolicy.windowMs)||scanPolicy.windowMs<100||scanPolicy.windowMs>3600000||
   !Number.isInteger(scanPolicy.sourceMax)||scanPolicy.sourceMax<1||scanPolicy.sourceMax>10000||
   !Number.isInteger(scanPolicy.identityMax)||scanPolicy.identityMax<1||scanPolicy.identityMax>10000)throw new PatientError('PATIENT_CONFIG');
  Object.assign(this,{runtime,organizations,aadhaarHashKey,clientUrl:clientUrl.replace(/\/$/,''),scanPolicy});
  this.repository=new PatientRepository(runtime.postgres);this.qrCache=new Map();
 }
 async actor(actor){
  if(!actor||!isInternalId(actor.id)||actor.role!=='patient')throw new PatientError('PATIENT_FORBIDDEN');
  const current=await this.runtime.sessions.repository.byId(actor.id);
  if(!current?.isActive||current.role!=='patient')throw new PatientError('PATIENT_FORBIDDEN');
 }
 async qrFor(uid){
  if(!this.qrCache.has(uid)){
   const data=JSON.stringify({uid,type:'mediid_patient',verifyUrl:this.clientUrl+'/verify/patient/'+uid});
   const promise=QRCode.toDataURL(data,{width:400,margin:2,errorCorrectionLevel:'H'});
   this.qrCache.set(uid,promise);if(this.qrCache.size>500)this.qrCache.delete(this.qrCache.keys().next().value);
   promise.catch(()=>this.qrCache.delete(uid));
  }
  return this.qrCache.get(uid);
 }
 async profile(actor){
  await this.actor(actor);
  const row=await databaseOperation(()=>this.repository.profile(actor.id));
  if(!row)throw new PatientError('PATIENT_NOT_FOUND');
  const [benefits,trusted,qrCode]=await Promise.all([this.benefits(actor),this.trustedProviders(actor),this.qrFor(row.uid)]);
  return dto.patientDTO(row,{benefits,trusted,qrCode});
 }
 async updateProfile(actor,input){
  await this.actor(actor);const patch=v.profileInput(input,this.aadhaarHashKey);
  await databaseOperation(()=>this.repository.updateProfile(actor.id,patch));return this.profile(actor);
 }
 async qr(actor){
  await this.actor(actor);const row=await databaseOperation(()=>this.repository.profile(actor.id));
  if(!row)throw new PatientError('PATIENT_NOT_FOUND');
  return {uid:row.uid,qrCode:await this.qrFor(row.uid),qrActive:row.qrActive===true};
 }
 async scan(uid,source){
  try{await this.runtime.limits.consume('patientScan',source,uid,this.scanPolicy);}
  catch(error){
   const result=new PatientError(error instanceof AuthError&&error.code==='AUTH_RATE_LIMIT'?'PATIENT_RATE_LIMIT':'PATIENT_UNAVAILABLE');
   if(error?.retryAfter)result.retryAfter=error.retryAfter;throw result;
  }
  v.patientUid(uid);
  const row=await databaseOperation(()=>this.repository.scan(uid));
  if(!row)throw new PatientError('PATIENT_NOT_FOUND');
  return dto.emergencyDTO(row);
 }
 async benefits(actor){await this.actor(actor);return (await databaseOperation(()=>this.repository.benefits(actor.id))).map(dto.benefitDTO);}
 async saveBenefit(actor,input,id){
  await this.actor(actor);const create=id===undefined,patch=v.benefitInput(input,create),key=create?newPostgresId():v.internalId(id);
  await databaseOperation(()=>this.repository.saveBenefit(actor.id,key,patch,create));
  const row=(await this.benefits(actor)).find(item=>item.id===key);
  if(!row)throw new PatientError('PATIENT_UNAVAILABLE');return row;
 }
 async removeBenefit(actor,id){
  await this.actor(actor);await databaseOperation(()=>this.repository.removeBenefit(actor.id,v.internalId(id)));
  return {message:'Benefit removed'};
 }
 async governmentBenefit(actor,input){
  const patch=v.governmentInput(input);const created=await this.saveBenefit(actor,patch);
  // The legacy endpoint returned an array; insurance is an explicit legacy alias for personal coverage.
  return created.source==='government'?dto.governmentBenefits(await this.benefits(actor)):[created];
 }
 async trustedProviders(actor){
  await this.actor(actor);const rows=await databaseOperation(()=>this.repository.trusted(actor.id));
  const doctors=[],hospitals=[];
  for(const id of rows.doctors||[]) {
   try{doctors.push(dto.doctorSummary(await this.organizations.doctor(id)));}
   catch(error){if(!(error instanceof OrganizationError&&error.code==='ORG_NOT_FOUND'))throw new PatientError('PATIENT_UNAVAILABLE');}
  }
  for(const id of rows.hospitals||[]) {
   try{hospitals.push(dto.hospitalSummary(await this.organizations.hospital(id)));}
   catch(error){if(!(error instanceof OrganizationError&&error.code==='ORG_NOT_FOUND'))throw new PatientError('PATIENT_UNAVAILABLE');}
  }
  return {doctors,hospitals};
 }
 async providerId(kind,value,isAdd){
  try{
   const key=providerValidation.identifier(value,{kind});
   const rows=await this.organizations.repository[kind==='doctor'?'doctors':'hospitals'](key,{limit:1,active:isAdd});
   if(rows.length!==1)throw new PatientError('PATIENT_NOT_FOUND');
   return rows[0].id;
  }catch(error){
   if(error instanceof PatientError)throw error;
   throw new PatientError(error instanceof OrganizationError&&error.code==='ORG_INPUT'?'PATIENT_INPUT':'PATIENT_UNAVAILABLE');
  }
 }
 async setTrusted(actor,kind,id,isAdd){
  await this.actor(actor);if(!['doctor','hospital'].includes(kind)||typeof isAdd!=='boolean')throw new PatientError('PATIENT_INPUT');
  const provider=await this.providerId(kind,id,isAdd);
  await databaseOperation(()=>this.repository.setTrusted(actor.id,kind,provider,isAdd));
  return {message:isAdd?'Provider trusted':'Trusted provider removed'};
 }
}
module.exports={Patients};
