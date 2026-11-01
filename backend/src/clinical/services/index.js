'use strict';
const {ClinicalRepository}=require('../repositories');
const {ClinicalError,databaseOperation}=require('../errors');
const {newPostgresId}=require('../../identifiers/uuid');
const {isInternalId}=require('../../auth/identity');
const v=require('../validation'),dto=require('../dto');
class Clinical{
 constructor(runtime){
  if(runtime?.mode!=='postgres'||!runtime.postgres||!runtime.sessions)throw new ClinicalError('CLINICAL_CONFIG');
  this.repository=new ClinicalRepository(runtime.postgres);
 }
 actor(actor){if(!actor||!isInternalId(actor.id))throw new ClinicalError('CLINICAL_ACCESS_DENIED');return actor.id;}
 async execute(kind,actor,operation,input={}){
  const result=await databaseOperation(()=>this.repository[kind](this.actor(actor),operation,{...input,auditId:newPostgresId()}));
  // This exception occurs after the autocommitted authorization/audit statement.
  if(result?.allowed===false)throw new ClinicalError(result.conflict===true?'CLINICAL_CONFLICT':'CLINICAL_ACCESS_DENIED',result);
  if(result?.allowed!==true)throw new ClinicalError('CLINICAL_UNAVAILABLE');
  return result.data;
 }
 async queue(actor,query={}){v.object(query,['limit']);return dto.queueDTO(await this.execute('read',actor,'queue',v.pagination(query)));}
 async ehr(actor,uid,query={}){return dto.bundle(await this.execute('read',actor,'ehr',{patientUid:v.patientUid(uid),...v.pagination(query)}));}
 async self(actor,query={}){return dto.bundle(await this.execute('read',actor,'self',v.pagination(query)));}
 async start(actor,input){
  v.object(input,['appointmentId']);
  return dto.encounter(await this.execute('command',actor,'start',{appointmentId:v.id(input.appointmentId),id:newPostgresId()}));
 }
 async complete(actor,encounterId,input={}){
  v.object(input,[]);return dto.encounter(await this.execute('command',actor,'complete',{encounterId:v.id(encounterId)}));
 }
 async add(actor,encounterId,input,operation,validate,kind){
  const body=validate(input);
  return dto.record(kind,await this.execute('command',actor,operation,{...body,encounterId:v.id(encounterId),id:newPostgresId()}));
 }
 recordVital(actor,id,input){return this.add(actor,id,input,'vitals',v.vitals,'vital');}
 recordNote(actor,id,input){return this.add(actor,id,input,'note',v.note,'note');}
 recordCondition(actor,id,input){return this.add(actor,id,input,'condition',v.condition,'condition');}
 recordAllergy(actor,id,input){return this.add(actor,id,input,'allergy',v.allergy,'allergy');}
 async prescribe(actor,input){
  const body=v.prescription(input);body.id=newPostgresId();body.items=body.items.map(item=>({...item,id:newPostgresId()}));
  return dto.record('prescription',await this.execute('command',actor,'prescription',body));
 }
 async registerDocument(actor,input){
  const body=v.document(input);return dto.record('document',await this.execute('command',actor,'register_document',{...body,id:newPostgresId()}));
 }
 async composeProfile(actor,profile){return dto.profileClinical(profile,await this.self(actor));}
}
module.exports={Clinical};
