'use strict';
const {Patients}=require('../services');
const {PatientError}=require('../errors');
const {aadhaarKey}=require('../validation');
function patientMode(env=process.env){
 if(!['legacy','postgres'].includes(env.PATIENT_BACKEND))throw new PatientError('PATIENT_CONFIG');
 return env.PATIENT_BACKEND;
}
function createPatientRuntime(authRuntime,organizationRuntime,env=process.env){
 const mode=patientMode(env);if(mode==='legacy')return {mode};
 if(authRuntime?.mode!=='postgres'||organizationRuntime?.mode!=='postgres'||!organizationRuntime.service)throw new PatientError('PATIENT_CONFIG');
 const number=(name,fallback,min,max)=>{
  const value=env[name]??String(fallback);
  if(typeof value!=='string'||!/^\d+$/.test(value)||+value<min||+value>max)throw new PatientError('PATIENT_CONFIG');return +value;
 };
 const service=new Patients(authRuntime,{organizations:organizationRuntime.service,aadhaarHashKey:aadhaarKey(env.PATIENT_AADHAAR_HASH_KEY),
  clientUrl:env.CLIENT_URL||authRuntime.http.origins[0],
  scanPolicy:{windowMs:number('PATIENT_SCAN_WINDOW_MS',60000,100,3600000),sourceMax:number('PATIENT_SCAN_SOURCE_MAX',60,1,10000),identityMax:number('PATIENT_SCAN_IDENTITY_MAX',120,1,10000)}});
 return {mode,service};
}
module.exports={patientMode,createPatientRuntime};
