'use strict';
const { OrganizationError } = require('../errors');
const { isInternalId, canonicalUid } = require('../../auth/identity');
const { mongoObjectIdToUuid } = require('../../identifiers/uuid');
const fail = () => { throw new OrganizationError('ORG_INPUT'); };
function object(input, allowed) {
  if (!input || typeof input !== 'object' || Array.isArray(input) ||
      Object.keys(input).some(key => !allowed.includes(key))) fail();
}
function text(value, max = 255, required = false) {
  if (value === null && !required) return null;
  if (typeof value !== 'string' || value.length > max || /[\x00-\x1f\x7f]/.test(value)) fail();
  const result = value.trim();
  if (required && !result) fail();
  return result;
}
function number(value, min, max, integer = false) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max ||
      integer && !Number.isInteger(value)) fail();
  return value;
}
function list(value) {
  if (!Array.isArray(value) || value.length > 30) fail();
  return value.map(entry => text(entry, 150, true));
}
function identifier(value, { uid = false, kind } = {}) {
  if (typeof value !== 'string' || value.length > 64) fail();
  if (uid) {
    let normalized; try { normalized = canonicalUid(value); } catch { fail(); }
    const prefix = kind === 'hospital' ? /^HID-/ : kind === 'doctor' ? /^(?:HID-|DOC-)/ : /^HID-/;
    if (!prefix.test(normalized)) fail();
    return { uid: normalized };
  }
  if (isInternalId(value)) return { id: value };
  if (/^[a-f0-9]{24}$/.test(value)) return { id: mongoObjectIdToUuid(value), legacyId: value };
  fail();
}
function pagination(query, allowed) {
  object(query, [...allowed, 'limit', 'page']);
  const parse = (value, fallback, max) => {
    if (value === undefined) return fallback;
    if (typeof value !== 'string' || !/^(?:0|[1-9][0-9]{0,4})$/.test(value) || Number(value) > max) fail();
    return Number(value);
  };
  const limit = parse(query.limit, 100, 100), page = parse(query.page, 0, 100);
  if (limit < 1) fail();
  return { limit, offset: limit * page };
}
const hospitalScalars = {
  name: [255,true], street:[255], city:[100], state:[100], pincode:[20], country:[100],
  contactPhone:[32], contactEmail:[255], website:[255], emergencyPhone:[32], logoUrl:[200000]
};
function hospitalInput(input, create = false) {
  object(input, [...Object.keys(hospitalScalars), 'address','contact','specialties','facilities','operatingHours','totalBeds','icuBeds','photos','latitude','longitude','logo', ...(create?['type','registrationNumber']:[])]);
  const result = {};
  for (const [key,[max,required]] of Object.entries(hospitalScalars)) if (input[key] !== undefined) result[key] = text(input[key],max,required);
  if (input.address !== undefined) {
    object(input.address,['street','city','state','pincode','country']);
    for (const [key,value] of Object.entries(input.address)) result[key]=text(value,hospitalScalars[key][0]);
  }
  if (input.contact !== undefined) {
    object(input.contact,['phone','email','website','emergencyPhone']);
    for (const [key,value] of Object.entries(input.contact)) {
      const field={phone:'contactPhone',email:'contactEmail',website:'website',emergencyPhone:'emergencyPhone'}[key];
      result[field]=text(value,hospitalScalars[field][0]);
    }
  }
  if (input.logo !== undefined) result.logoUrl=text(input.logo,200000);
  for (const key of ['specialties','facilities','photos']) if (input[key] !== undefined) result[key]=list(input[key]);
  for (const key of ['totalBeds','icuBeds']) if (input[key] !== undefined) result[key]=number(input[key],0,100000,true);
  for (const key of ['latitude','longitude']) if (input[key] !== undefined) result[key]=input[key]===null?null:number(input[key],key==='latitude'?-90:-180,key==='latitude'?90:180);
  if (input.operatingHours !== undefined) {
    object(input.operatingHours,['weekdays','weekends','is24x7']);
    result.operatingHours={};
    for (const key of ['weekdays','weekends']) if(input.operatingHours[key]!==undefined) {
      const day=input.operatingHours[key]; object(day,['open','close']);
      result.operatingHours[key]={};
      for(const field of ['open','close'])if(day[field]!==undefined) {
        if(typeof day[field]!=='string'||day[field]!==''&&!/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(day[field]))fail();
        result.operatingHours[key][field]=day[field];
      }
    }
    if(input.operatingHours.is24x7!==undefined) {
      if(typeof input.operatingHours.is24x7!=='boolean')fail();
      result.operatingHours.is24x7=input.operatingHours.is24x7;
    }
  }
  if (create) {
    if (input.type !== undefined && input.type !== 'clinic') fail();
    result.name=text(input.name,255,true);
    if(input.registrationNumber!==undefined) result.registrationNumber=text(input.registrationNumber,128);
  }
  return result;
}
const doctorScalars = {firstName:[100,true],lastName:[100,true],specialization:[150,true],registrationNumber:[100],phone:[32],email:[255],photoUrl:[200000]};
function doctorInput(input, create = false) {
  object(input,[...Object.keys(doctorScalars),'subSpecialties','qualifications','experienceYears','experience','photo','consultationFee','expertise','languages','status','doctorType',...(create?['hospitalId','isPrimary']:[])]);
  const result={};
  for(const [key,[max,required]] of Object.entries(doctorScalars)) if(input[key]!==undefined) result[key]=text(input[key],max,required);
  for(const key of ['subSpecialties','qualifications','expertise','languages']) if(input[key]!==undefined) result[key]=list(input[key]);
  if(input.photo!==undefined)result.photoUrl=text(input.photo,200000);
  if(input.experience!==undefined||input.experienceYears!==undefined)result.experienceYears=number(input.experienceYears??input.experience,0,100,true);
  if(input.consultationFee!==undefined)result.consultationFee=number(input.consultationFee,0,10000000);
  if(input.status!==undefined){if(!['available','busy','on_leave','offline'].includes(input.status))fail();result.status=input.status;}
  if(input.doctorType!==undefined)text(input.doctorType,40); // Legacy presentation hint, never authority or UID input.
  if(create)for(const key of ['firstName','lastName','specialization'])result[key]=text(input[key],doctorScalars[key][0],true);
  return result;
}
const staffRoles=['nurse','receptionist','lab_technician','pharmacist','ward_boy','security','administrator','radiologist','physiotherapist','other'];
function staffInput(input, create = false) {
  object(input,['firstName','lastName','department','employeeId','qualifications','experience','phone','email','photo','photoUrl','dateOfJoining','shift','status',...(create?['role','hospitalId']:[])]);
  const result={};
  for(const [key,max] of Object.entries({firstName:100,lastName:100,department:100,employeeId:64,phone:32,email:255,photoUrl:200000,shift:20,status:20}))if(input[key]!==undefined)result[key]=text(input[key],max,['firstName','lastName'].includes(key));
  if(input.photo!==undefined)result.photoUrl=text(input.photo,200000);
  if(input.qualifications!==undefined)result.qualifications=list(input.qualifications);
  if(input.experience!==undefined)result.experience=number(input.experience,0,100,true);
  if(input.dateOfJoining!==undefined&&input.dateOfJoining!=='')result.dateOfJoining=date(input.dateOfJoining);
  if(create){for(const key of ['firstName','lastName'])result[key]=text(input[key],100,true);if(!staffRoles.includes(input.role))fail();result.role=input.role;}
  return result;
}
function date(value) {
  if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value)||!Number.isFinite(Date.parse(value))||new Date(value).toISOString().slice(0,10)!==value)fail();
  return value;
}
function templateInput(input, create=false) {
  object(input,['doctorId','hospitalId','dayOfWeek','startTime','endTime','slotDuration','channel','capacityPerSlot','timezone','effectiveFrom','effectiveUntil','isActive']);
  const result={...input};
  for(const key of ['doctorId','hospitalId'])if(result[key]!==undefined&&result[key]!==null)result[key]=identifier(result[key],{kind:key==='doctorId'?'doctor':'hospital'});
  if(result.dayOfWeek!==undefined){result.dayOfWeek=text(result.dayOfWeek,16,true).toUpperCase();if(!['MONDAY','TUESDAY','WEDNESDAY','THURSDAY','FRIDAY','SATURDAY','SUNDAY'].includes(result.dayOfWeek))fail();}
  for(const key of ['startTime','endTime'])if(result[key]!==undefined&&!(typeof result[key]==='string'&&/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(result[key])))fail();
  if(result.startTime&&result.endTime&&result.startTime>=result.endTime)fail();
  for(const [key,min,max]of [['slotDuration',1,1440],['capacityPerSlot',1,1000]])if(result[key]!==undefined)number(result[key],min,max,true);
  if(result.channel!==undefined&&!['ONLINE','OFFLINE','FLEXIBLE'].includes(result.channel))fail();
  if(result.timezone!==undefined){text(result.timezone,64,true);try{new Intl.DateTimeFormat('en',{timeZone:result.timezone});}catch{fail();}}
  for(const key of ['effectiveFrom','effectiveUntil'])if(result[key]!==undefined&&result[key]!==null)date(result[key]);
  if(result.isActive!==undefined&&typeof result.isActive!=='boolean')fail();
  if(create)for(const key of ['dayOfWeek','startTime','endTime','effectiveFrom'])if(result[key]===undefined)fail();
  return result;
}
module.exports={object,text,number,list,identifier,pagination,hospitalInput,doctorInput,staffInput,templateInput,staffRoles};
