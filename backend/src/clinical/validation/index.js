'use strict';
const {ClinicalError}=require('../errors');
const {isInternalId}=require('../../auth/identity');
const fail=()=>{throw new ClinicalError('CLINICAL_INPUT');};
function object(value,keys){if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).some(key=>!keys.includes(key)))fail();}
function id(value){if(!isInternalId(value))fail();return value;}
function patientUid(value){if(typeof value!=='string'||!/^MID-[A-Z0-9]{8}$/.test(value))fail();return value;}
function text(value,max,required=false){
 if(typeof value!=='string'||value.length>max||/[\x00-\x1f\x7f]/.test(value))fail();
 const clean=value.trim();if(required&&!clean)fail();return clean;
}
function date(value){
 if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value)||value.startsWith('0000')||!Number.isFinite(Date.parse(value))||new Date(value).toISOString().slice(0,10)!==value)fail();return value;
}
function integer(value,min,max){if(typeof value!=='number'||!Number.isSafeInteger(value)||value<min||value>max)fail();return value;}
function decimal(value,min,max){
 if(typeof value==='number'&&Number.isFinite(value))value=String(value);
 if(typeof value!=='string'||!/^(?:0|[1-9]\d{0,2})(?:\.\d{1,2})?$/.test(value)||Number(value)<min||Number(value)>max)fail();
 const [whole,fraction='']=value.split('.');return whole+'.'+fraction.padEnd(2,'0');
}
function pagination(query={}){
 object(query,['limit','cursor']);const result={limit:20};
 if(query.limit!==undefined){const n=typeof query.limit==='string'&&/^[1-9]\d?$/.test(query.limit)?+query.limit:query.limit;result.limit=integer(n,1,50);}
 if(query.cursor!==undefined)result.cursor=id(query.cursor);return result;
}
const vitalIntegers={systolicBp:[1,400],diastolicBp:[1,300],heartRate:[1,400],respiratoryRate:[1,150],spo2Percentage:[0,100]};
const vitalDecimals={temperatureCelsius:[20,50],weightKg:[0.01,999.99],heightCm:[0.01,999.99]};
function vitals(input){
 object(input,[...Object.keys(vitalIntegers),...Object.keys(vitalDecimals)]);const result={};
 for(const [key,[min,max]]of Object.entries(vitalIntegers))if(input[key]!==undefined)result[key]=integer(input[key],min,max);
 for(const [key,[min,max]]of Object.entries(vitalDecimals))if(input[key]!==undefined)result[key]=decimal(input[key],min,max);
 if(!Object.keys(result).length)fail();return result;
}
function note(input){
 object(input,['noteType','subjective','objective','assessment','plan']);
 const result={noteType:input.noteType===undefined?'progress':input.noteType};
 if(!['progress','consultation','discharge','procedure'].includes(result.noteType))fail();
 for(const key of ['subjective','objective','assessment','plan'])if(input[key]!==undefined)result[key]=text(input[key],4000);
 if(!['subjective','objective','assessment','plan'].some(key=>result[key]))fail();return result;
}
function condition(input){
 object(input,['icd10Code','displayName','clinicalStatus','verificationStatus','diagnosedDate']);
 const result={displayName:text(input.displayName,255,true),clinicalStatus:input.clinicalStatus===undefined?'active':input.clinicalStatus};
 if(!['active','resolved'].includes(result.clinicalStatus))fail();
 if(input.icd10Code!==undefined)result.icd10Code=text(input.icd10Code,16);
 if(input.verificationStatus!==undefined)result.verificationStatus=text(input.verificationStatus,32,true);
 if(input.diagnosedDate!==undefined)result.diagnosedDate=date(input.diagnosedDate);
 return result;
}
function allergy(input){
 object(input,['substance','reaction','severity']);const result={substance:text(input.substance,255,true)};
 if(input.reaction!==undefined)result.reaction=text(input.reaction,2000);
 if(input.severity!==undefined){if(!['mild','moderate','severe','fatal'].includes(input.severity))fail();result.severity=input.severity;}return result;
}
function prescription(input){
 object(input,['appointmentId','encounterId','notes','items']);
 const result={appointmentId:id(input.appointmentId),encounterId:id(input.encounterId)};
 if(input.notes!==undefined)result.notes=text(input.notes,4000);
 if(!Array.isArray(input.items)||input.items.length<1||input.items.length>50)fail();
 result.items=input.items.map(item=>{
  object(item,['medicationName','dosage','form','frequency','duration','quantity','instructions']);
  const row={medicationName:text(item.medicationName,255,true),dosage:text(item.dosage,100,true),quantity:integer(item.quantity,1,100000)};
  for(const [key,max]of [['form',50],['frequency',100],['duration',50],['instructions',2000]])if(item[key]!==undefined)row[key]=text(item[key],max);
  return row;
 });return result;
}
function documentUrl(value){
 const original=text(value,2048,true);let url;try{url=new URL(original);}catch{fail();}
 if(url.protocol!=='https:'||!url.hostname||url.username||url.password||url.search||url.hash)fail();return url.toString();
}
function document(input){
 object(input,['type','title','fileUrl','fileName','fileSizeBytes','mimeType','notes']);
 if(!['prescription','scan','bill','lab_report','discharge_summary','other'].includes(input.type))fail();
 const result={type:input.type,title:text(input.title,255,true),fileUrl:documentUrl(input.fileUrl)};
 for(const [key,max]of [['fileName',255],['mimeType',100],['notes',4000]])if(input[key]!==undefined)result[key]=text(input[key],max);
 if(result.mimeType&&!/^[a-zA-Z0-9][a-zA-Z0-9.+-]*\/[a-zA-Z0-9][a-zA-Z0-9.+-]*$/.test(result.mimeType))fail();
 if(input.fileSizeBytes!==undefined)result.fileSizeBytes=integer(input.fileSizeBytes,0,104857600);
 return result;
}
module.exports={object,id,patientUid,text,date,integer,decimal,pagination,vitals,note,condition,allergy,prescription,document,documentUrl};
