'use strict';
const {mongoObjectIdToUuid}=require('../../identifiers/uuid');
const {benefitStrings}=require('../validation');
function identity(row){
 let id=row.id;
 if(typeof row.legacyId==='string'&&/^[a-f0-9]{24}$/.test(row.legacyId)&&mongoObjectIdToUuid(row.legacyId)===row.id)id=row.legacyId;
 return {_id:id,id,internalId:row.id,uid:row.uid};
}
const calendarDate=value=>value==null?null:value instanceof Date?value.toISOString().slice(0,10):String(value).slice(0,10);
function benefitDTO(row){
 return {_id:row.id,id:row.id,source:row.source,type:row.type,
  ...Object.fromEntries(Object.keys(benefitStrings).map(key=>[key,row[key]??''])),
  coverageAmount:row.coverageAmount==null?null:String(row.coverageAmount),roomRentLimit:row.roomRentLimit==null?null:String(row.roomRentLimit),
  familyCovered:row.familyCovered===true,familyMembers:row.familyMembers||[],
  validFrom:calendarDate(row.validFrom),validUntil:calendarDate(row.validUntil),isActive:row.isActive===true,addedAt:row.createdAt,createdAt:row.createdAt};
}
function governmentBenefits(benefits){return benefits.filter(row=>row.source==='government').map(row=>({...row,type:row.type==='other_govt'?'other':row.type}));}
function insurancePolicies(benefits){
 return benefits.filter(row=>row.source==='personal').map(row=>({_id:row.id,id:row.id,policyNumber:row.policyNumber,agencyName:row.insurerName,
  planName:row.schemeName,coverageAmount:row.coverageAmount,validUntil:row.validUntil,premium:null,agentName:null,agentPhone:null}));
}
function patientDTO(row,{benefits=[],trusted={doctors:[],hospitals:[]},qrCode=''}={}){
 return {...identity(row),firstName:row.firstName,lastName:row.lastName,fullName:row.firstName+' '+row.lastName,
  dateOfBirth:calendarDate(row.dateOfBirth),gender:row.gender||null,phone:row.phone||'',email:row.email||'',
  profilePhoto:row.profilePhotoUrl||'',address:{street:row.street||'',city:row.city||'',state:row.state||'',pincode:row.pincode||'',country:row.country||'India'},
  emergency:{bloodGroup:row.bloodGroup||null,emergencyContactName:row.emergencyContactName||'',emergencyContactPhone:row.emergencyContactPhone||'',
   emergencyContactRelation:row.emergencyContactRelation||'',organDonor:row.organDonor===true,aadhaarPresent:row.aadhaarPresent===true,
   allergies:[],chronicConditions:[],currentMedications:[]},
  organDonor:row.organDonor===true,aadhaarPresent:row.aadhaarPresent===true,qrActive:row.qrActive===true,qrCode,
  medicalBenefits:benefits,governmentBenefits:governmentBenefits(benefits),insurancePolicies:insurancePolicies(benefits),
  trustedDoctors:trusted.doctors,trustedHospitals:trusted.hospitals,documents:[],bills:[],medicalHistory:[],createdAt:row.createdAt,updatedAt:row.updatedAt};
}
function emergencyDTO(row){
 const emergency=row.emergency||{};
 return {uid:row.uid,name:row.name,emergency:{bloodGroup:emergency.bloodGroup??null,
  emergencyContactName:emergency.emergencyContactName||'',emergencyContactPhone:emergency.emergencyContactPhone||'',
  emergencyContactRelation:emergency.emergencyContactRelation||'',organDonor:emergency.organDonor===true}};
}
function doctorSummary(row){return {_id:row._id,id:row.id,internalId:row.internalId,uid:row.uid,firstName:row.firstName,lastName:row.lastName,
 fullName:row.fullName,specialization:row.specialization,photo:row.photo,rating:row.rating};}
function hospitalSummary(row){return {_id:row._id,id:row.id,internalId:row.internalId,uid:row.uid,name:row.name,type:row.type,city:row.address?.city||'',rating:row.rating};}
module.exports={patientDTO,benefitDTO,governmentBenefits,insurancePolicies,emergencyDTO,doctorSummary,hospitalSummary,identity};
