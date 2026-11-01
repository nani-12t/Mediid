'use strict';
const {AuthError,authResponse}=require('../../auth/errors');
const responses={
 CLINICAL_CONFIG:[503,'Clinical service configuration is unavailable.'],
 CLINICAL_INPUT:[400,'Invalid clinical input.'],
 CLINICAL_ACCESS_DENIED:[403,'Clinical access is denied.'],
 CLINICAL_NOT_FOUND:[404,'Clinical resource is unavailable.'],
 CLINICAL_CONFLICT:[409,'Clinical operation requires reconciliation with existing state.'],
 CLINICAL_UNAVAILABLE:[503,'Clinical service is temporarily unavailable.']
};
const reasons=new Set(['no_active_consultation','consultation_not_started','consultation_inactive','consultation_expired','provider_membership_inactive','wrong_practitioner','patient_unavailable','encounter_completed','invalid_context','access_denied']);
class ClinicalError extends Error{
 constructor(code,details={}){super(responses[code]?.[1]||responses.CLINICAL_UNAVAILABLE[1]);this.name='ClinicalError';this.code=responses[code]?code:'CLINICAL_UNAVAILABLE';
  if(this.code==='CLINICAL_ACCESS_DENIED'){
   this.reason=reasons.has(details.reason)?details.reason:'access_denied';
   for(const key of ['opensAt','expiresAt'])if(typeof details[key]==='string'&&details[key].length<=64&&Number.isFinite(Date.parse(details[key])))this[key]=details[key];
  }
 }
}
function clinicalResponse(error){
 if(error instanceof AuthError)return authResponse(error);
 const code=error instanceof ClinicalError?error.code:'CLINICAL_UNAVAILABLE';
 const body={code,message:responses[code][1]};
 if(code==='CLINICAL_ACCESS_DENIED')for(const key of ['reason','opensAt','expiresAt'])if(error[key]!==undefined)body[key]=error[key];
 return {status:responses[code][0],body};
}
function sqlCode(error){return error?.meta?.code||error?.code;}
async function databaseOperation(operation){
 try{return await operation();}catch(error){
  if(error instanceof ClinicalError||error instanceof AuthError)throw error;
  const code=sqlCode(error);
  if(code==='P0001'){
   const match=String(error?.meta?.message||error?.message||'').match(/\bCLINICAL_(INPUT|NOT_FOUND|CONFLICT)\b/);
   if(match)throw new ClinicalError('CLINICAL_'+match[1]);
  }
  if(['23505','23P01','P2002','40001','40P01'].includes(code))throw new ClinicalError('CLINICAL_CONFLICT');
  if(['22P02','22007','22008','22003','23514','23502','22001'].includes(code))throw new ClinicalError('CLINICAL_INPUT');
  throw new ClinicalError('CLINICAL_UNAVAILABLE');
 }
}
module.exports={ClinicalError,clinicalResponse,databaseOperation,sqlCode};
