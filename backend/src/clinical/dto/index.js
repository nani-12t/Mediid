'use strict';
const {documentUrl}=require('../validation');
const pick=(row,keys)=>Object.fromEntries(keys.filter(key=>row?.[key]!==undefined).map(key=>[key,row[key]]));
const fields={
 vital:['id','encounterId','recordedAt','systolicBp','diastolicBp','heartRate','respiratoryRate','temperatureCelsius','spo2Percentage','weightKg','heightCm','bmi'],
 note:['id','encounterId','authorId','noteType','subjective','objective','assessment','plan','createdAt'],
 condition:['id','patientId','encounterId','icd10Code','displayName','clinicalStatus','verificationStatus','diagnosedDate','resolvedDate','createdAt'],
 allergy:['id','patientId','encounterId','substance','reaction','severity','createdAt'],
 item:['id','prescriptionId','medicationName','dosage','form','frequency','duration','quantity','instructions'],
 prescription:['id','encounterId','patientId','doctorId','hospitalId','notes','status','issuedAt'],
 document:['id','type','title','fileName','fileSizeBytes','mimeType','notes','hospitalName','doctorName','uploadedAt','encounterId'],
 encounter:['id','appointmentId','hospitalAppointmentId','privateClinicAppointmentId','patientId','doctorId','hospitalId','encounterType','status','startTime','endTime','chiefComplaint','createdAt','doctorName','hospitalName']
};
function record(kind,row){
 if(!row||typeof row!=='object')return null;
 const result=pick(row,fields[kind]||[]);
 if(kind==='prescription')result.items=(Array.isArray(row.items)?row.items:[]).map(item=>record('item',item));
 if(kind==='document'){
  // Historical metadata may predate URL validation; never expose embedded or signed secrets.
  try{result.fileUrl=documentUrl(row.fileUrl);}catch{result.fileUrl=null;}
 }
 return result;
}
function encounter(row){
 const result=record('encounter',row);if(!result)return null;
 if(row.doctor)result.doctor=pick(row.doctor,['id','uid','firstName','lastName','name','specialization']);
 if(row.hospital)result.hospital=pick(row.hospital,['id','uid','name','type']);
 for(const [key,kind]of [['vitals','vital'],['notes','note'],['conditions','condition'],['allergies','allergy'],['prescriptions','prescription'],['documents','document']])result[key]=(Array.isArray(row[key])?row[key]:[]).map(item=>record(kind,item));
 return result;
}
function bundle(row={}){
 const result={patient:pick(row.patient,['id','uid','firstName','lastName','dateOfBirth','gender','bloodGroup'])};
 if(row.consultation)result.consultation=pick(row.consultation,['sessionId','appointmentId','domain','organizationId','startsAt','expiresAt']);
 for(const [key,kind]of [['conditions','condition'],['allergies','allergy'],['prescriptions','prescription'],['documents','document']])result[key]=(Array.isArray(row[key])?row[key]:[]).map(item=>record(kind,item));
 result.encounters=(Array.isArray(row.encounters)?row.encounters:[]).map(encounter);
 result.pagination=pick(row.pagination,['limit','nextCursor','hasMore','relatedRecordLimit','artifactLimit','encounterArtifactLimit']);
 return result;
}
function queue(row){
 return pick(row,['appointmentId','domain','patientUid','organizationId','organizationName','appointmentDate','timeSlot','slotStartTime','status','symptoms','notes','opensAt','expiresAt','ehrAccess']);
}
function queueDTO(rows){
 return {appointments:(Array.isArray(rows)?rows:rows?.appointments||[]).map(row=>({...queue(row),patient:pick(row.patient,['uid','firstName','lastName'])}))};
}
function profileClinical(profile,ehr){
 const medicalHistory=ehr.encounters.map(row=>{
  const notes=row.notes||[],prescriptions=row.prescriptions||[];
  return {_id:row.id,id:row.id,date:row.startTime,
   diagnosis:(row.conditions||[]).map(item=>item.displayName).join('; ')||row.chiefComplaint||'Clinical encounter',
   treatment:prescriptions.flatMap(item=>(item.items||[]).map(medicine=>medicine.medicationName+' '+medicine.dosage)).join('; '),
   hospital:row.hospital?.name||row.hospitalName||'',doctor:row.doctor?.name||[row.doctor?.firstName,row.doctor?.lastName].filter(Boolean).join(' ')||row.doctorName||'',
   notes:notes.map(item=>[item.subjective,item.objective,item.assessment,item.plan].filter(Boolean).join(' / ')).join('; ')};
 });
 return {...profile,medicalHistory,documents:ehr.documents.map(row=>({...row,_id:row.id,fileSize:row.fileSizeBytes})),bills:[],
  clinicalHistoryPagination:ehr.pagination,
  emergency:{...profile.emergency,
   allergies:ehr.allergies.map(row=>row.substance),
   // The legacy key presents active conditions; it makes no chronicity inference.
   chronicConditions:ehr.conditions.filter(row=>row.clinicalStatus==='active').map(row=>row.displayName),
   currentMedications:ehr.prescriptions.filter(row=>row.status==='active').flatMap(row=>row.items.map(item=>item.medicationName+' '+item.dosage))}};
}
module.exports={record,encounter,bundle,queueDTO,profileClinical};
