'use strict';
const {AuthError,authResponse}=require('../../auth/errors');
const responses={
 PATIENT_CONFIG:[503,'Patient service configuration is unavailable.'],
 PATIENT_INPUT:[400,'Invalid patient input.'],
 PATIENT_FORBIDDEN:[403,'Access denied.'],
 PATIENT_NOT_FOUND:[404,'Patient record is unavailable.'],
 PATIENT_CONFLICT:[409,'Patient operation conflicts with existing state.'],
 PATIENT_RATE_LIMIT:[429,'Too many emergency-card requests. Try again later.'],
 PATIENT_UNAVAILABLE:[503,'Patient service is temporarily unavailable.']
};
class PatientError extends Error {
 constructor(code){super(responses[code][1]);this.name='PatientError';this.code=code;}
}
function patientResponse(error){
 if(error instanceof AuthError)return authResponse(error);
 const code=error instanceof PatientError?error.code:'PATIENT_UNAVAILABLE';
 return {status:responses[code][0],body:{code,message:responses[code][1]}};
}
async function databaseOperation(operation){
 try{return await operation();}catch(error){
  if(error instanceof PatientError||error instanceof AuthError)throw error;
  const code=error?.meta?.code||error?.code;
  if(code==='P0001'){
   const match=String(error?.meta?.message||error?.message||'').match(/\b(?:PATIENT|AUTH)_(INPUT|FORBIDDEN|NOT_FOUND|CONFLICT)\b/);
   if(match)throw new PatientError('PATIENT_'+match[1]);
  }
  if(['23505','P2002'].includes(code))throw new PatientError('PATIENT_CONFLICT');
  if(['22P02','22007','22008','22003','23514'].includes(code))throw new PatientError('PATIENT_INPUT');
  throw new PatientError('PATIENT_UNAVAILABLE');
 }
}
module.exports={PatientError,patientResponse,databaseOperation};
