'use strict';
const {ClinicalError}=require('../errors');
const {Clinical}=require('../services');
function clinicalMode(env=process.env){
 if(!['legacy','postgres'].includes(env.CLINICAL_BACKEND))throw new ClinicalError('CLINICAL_CONFIG');return env.CLINICAL_BACKEND;
}
function createClinicalRuntime(auth,organizations,patients,appointments,env=process.env){
 const mode=clinicalMode(env);
 if(mode==='legacy'){
  if(auth?.mode!=='legacy')throw new ClinicalError('CLINICAL_CONFIG');
  return {mode};
 }
 if([auth,organizations,patients,appointments].some(runtime=>runtime?.mode!=='postgres')||!organizations.service||!patients.service||!appointments.service)throw new ClinicalError('CLINICAL_CONFIG');
 return {mode,service:new Clinical(auth)};
}
module.exports={clinicalMode,createClinicalRuntime};
