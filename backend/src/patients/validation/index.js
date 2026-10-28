'use strict';
const {createHmac}=require('node:crypto');
const {PatientError}=require('../errors');
const {isInternalId}=require('../../auth/identity');
const fail=()=>{throw new PatientError('PATIENT_INPUT');};
function object(value,allowed){
 if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).some(key=>!allowed.includes(key)))fail();
}
function text(value,max,required=false){
 if(value===null&&!required)return null;
 if(typeof value!=='string'||value.length>max||/[\x00-\x1f\x7f]/.test(value))fail();
 const result=value.trim();if(required&&!result)fail();return result;
}
function boolean(value){if(typeof value!=='boolean')fail();return value;}
function date(value,{past=false}={}){
 if(value===null)return null;
 if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value)||value.startsWith('0000')||
  !Number.isFinite(Date.parse(value))||new Date(value).toISOString().slice(0,10)!==value||
  past&&value>new Date().toISOString().slice(0,10))fail();
 return value;
}
function internalId(value){if(!isInternalId(value))fail();return value;}
function patientUid(value){if(typeof value!=='string'||!/^MID-[A-Z0-9]{8}$/.test(value))fail();return value;}
const bloodGroups={A_POS:'A+',A_NEG:'A-',B_POS:'B+',B_NEG:'B-',AB_POS:'AB+',AB_NEG:'AB-',O_POS:'O+',O_NEG:'O-'};
function bloodGroup(value){
 if(value===null)return null;
 if(typeof value!=='string')fail();
 const result=bloodGroups[value]||value;if(!Object.values(bloodGroups).includes(result))fail();return result;
}
function aadhaarKey(value){
 if(typeof value!=='string'||Buffer.byteLength(value)<32||value.length>512||/[\x00-\x1f\x7f]/.test(value))throw new PatientError('PATIENT_CONFIG');
 return value;
}
function aadhaarDigest(value,key){
 if(value===null)return null;
 if(typeof value!=='string'||!/^\d{12}$/.test(value))fail();
 return createHmac('sha256',aadhaarKey(key)).update('mediid:patient:aadhaar:v1:'+value).digest('hex');
}
const patientStrings={firstName:[100,true],lastName:[100,true],phone:[32],profilePhoto:[200000]};
const addressFields={street:255,city:100,state:100,pincode:20,country:100};
const emergencyFields={emergencyContactName:100,emergencyContactPhone:32,emergencyContactRelation:50};
function profileInput(input,key){
 object(input,[...Object.keys(patientStrings),'dateOfBirth','gender','address','emergency','organDonor','qrActive']);
 const result={};
 for(const [name,[max,required]]of Object.entries(patientStrings))if(input[name]!==undefined)result[name==='profilePhoto'?'profilePhotoUrl':name]=text(input[name],max,required);
 if(input.dateOfBirth!==undefined)result.dateOfBirth=date(input.dateOfBirth,{past:true});
 if(input.gender!==undefined){if(input.gender!==null&&!['male','female','other'].includes(input.gender))fail();result.gender=input.gender;}
 if(input.address!==undefined){object(input.address,Object.keys(addressFields));for(const [name,value]of Object.entries(input.address))result[name]=text(value,addressFields[name]);}
 if(input.emergency!==undefined){
  object(input.emergency,[...Object.keys(emergencyFields),'bloodGroup','organDonor','aadhaarNumber']);
  for(const [name,max]of Object.entries(emergencyFields))if(input.emergency[name]!==undefined)result[name]=text(input.emergency[name],max);
  if(input.emergency.bloodGroup!==undefined)result.bloodGroup=bloodGroup(input.emergency.bloodGroup);
  if(input.emergency.organDonor!==undefined)result.organDonor=boolean(input.emergency.organDonor);
  if(input.emergency.aadhaarNumber!==undefined)result.aadhaarHash=aadhaarDigest(input.emergency.aadhaarNumber,key);
 }
 if(input.organDonor!==undefined){if(result.organDonor!==undefined&&result.organDonor!==input.organDonor)fail();result.organDonor=boolean(input.organDonor);}
 if(input.qrActive!==undefined)result.qrActive=boolean(input.qrActive);
 return result;
}
const benefitTypes={
 government:['ayushman','esi','cghs','state','other_govt'],
 employer:['group_mediclaim','corporate_insurance','esic_employer','other_employer'],
 personal:['individual_insurance','family_floater','top_up','other_personal']
};
const benefitStrings={schemeName:255,cardNumber:128,policyNumber:128,beneficiaryName:255,employerName:255,employeeId:64,designation:100,insurerName:255,tpaName:255,tpaPhone:32,hospitalNetwork:4000,claimProcess:4000,helplineNumber:32,notes:4000};
function money(value,digits){
 if(value===null)return null;
 // Legacy JSON numbers are accepted only when their canonical text is exact fixed-point;
 // no arithmetic or numeric conversion is used to persist the decimal.
 if(typeof value==='number'&&Number.isFinite(value))value=String(value);
 if(typeof value!=='string'||!(new RegExp('^(?:0|[1-9][0-9]{0,'+(digits-1)+'})(?:\\.[0-9]{1,2})?$')).test(value))fail();
 const [whole,fraction='']=value.split('.');return whole+'.'+fraction.padEnd(2,'0');
}
function benefitInput(input,create=false){
 object(input,[...Object.keys(benefitStrings),'source','type','coverageAmount','roomRentLimit','familyCovered','familyMembers','validFrom','validUntil']);
 const result={};
 for(const [name,max]of Object.entries(benefitStrings))if(input[name]!==undefined)result[name]=text(input[name],max);
 if(input.source!==undefined){if(typeof input.source!=='string'||!Object.hasOwn(benefitTypes,input.source))fail();result.source=input.source;}
 if(input.type!==undefined){if(typeof input.type!=='string'||!Object.values(benefitTypes).flat().includes(input.type))fail();result.type=input.type;}
 if(create&&(!result.source||!result.type))fail();
 if(result.source&&result.type&&!benefitTypes[result.source].includes(result.type))fail();
 for(const [name,digits]of [['coverageAmount',10],['roomRentLimit',8]])if(input[name]!==undefined)result[name]=money(input[name],digits);
 if(input.familyCovered!==undefined)result.familyCovered=boolean(input.familyCovered);
 if(input.familyMembers!==undefined){
  if(!Array.isArray(input.familyMembers)||input.familyMembers.length>50)fail();
  result.familyMembers=input.familyMembers.map(value=>text(value,100,true));
 }
 for(const name of ['validFrom','validUntil'])if(input[name]!==undefined)result[name]=date(input[name]);
 if(result.validFrom&&result.validUntil&&result.validUntil<result.validFrom)fail();
 return result;
}
function governmentInput(input){
 object(input,['type','schemeName','cardNumber','beneficiaryName','coverageAmount','validFrom','validUntil','isActive']);
 if(input.isActive!==undefined&&input.isActive!==true)fail();
 const {isActive,...fields}=input;
 const type=fields.type==='other'?'other_govt':fields.type;
 if(type==='insurance')return benefitInput({...fields,source:'personal',type:'individual_insurance',policyNumber:fields.cardNumber},true);
 if(!benefitTypes.government.includes(type))fail();
 return benefitInput({...fields,type,source:'government'},true);
}
module.exports={object,text,boolean,date,internalId,patientUid,bloodGroup,aadhaarKey,aadhaarDigest,profileInput,benefitInput,governmentInput,money,benefitTypes,benefitStrings};
