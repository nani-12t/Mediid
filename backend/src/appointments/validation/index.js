'use strict';
const {AppointmentError}=require('../errors');
const {isInternalId}=require('../../auth/identity');
const fail=()=>{throw new AppointmentError('APPOINTMENT_INPUT');};
function object(input,allowed){
 if(!input||typeof input!=='object'||Array.isArray(input)||Object.keys(input).some(key=>!allowed.includes(key)))fail();
 return input;
}
function text(value,max=255,required=false){
 if(value===null&&!required)return null;
 if(typeof value!=='string'||value.length>max||/[\x00-\x1f\x7f]/.test(value))fail();
 const result=value.trim();if(required&&!result)fail();return result;
}
function id(value){if(!isInternalId(value))fail();return value;}
function identifier(value){
 if(typeof value!=='string'||!(/^[a-f0-9]{24}$/.test(value)||isInternalId(value)||/^(?:MID|HID|DOC)-[A-Z0-9-]{4,48}$/.test(value)))fail();
 return value;
}
function day(value){
 if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value)||!Number.isFinite(Date.parse(value))||new Date(value).toISOString().slice(0,10)!==value)fail();
 return value;
}
function instant(value){
 if(typeof value!=='string'||value.length>35||!/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,6})?(?:Z|[+-]\d\d:\d\d)$/.test(value)||!Number.isFinite(Date.parse(value)))fail();
 return value;
}
function enumeration(value,allowed){if(typeof value!=='string'||!allowed.includes(value))fail();return value;}
function integer(value,min,max){if(typeof value!=='number'||!Number.isInteger(value)||value<min||value>max)fail();return value;}
function amount(value,max=99999999.99){
 if(typeof value!=='string'||!/^\d{1,8}(?:\.\d{1,2})?$/.test(value)||Number(value)>max)fail();
 return value;
}
function booking(input,actor){
 object(input,['slotId','doctor','hospital','appointmentDate','timeSlot','patientId','patient','bookingChannel','appointmentChannel','preferredContactMethod','contactPhone','symptoms','notes']);
 const result={};
 if(input.slotId!==undefined){
  result.slotId=id(input.slotId);
  if(['doctor','hospital','appointmentDate','timeSlot'].some(key=>input[key]!==undefined))fail();
 }else{
  for(const key of ['doctor','hospital'])result[key]=identifier(input[key]);
  result.appointmentDate=day(input.appointmentDate);result.timeSlot=text(input.timeSlot,32,true);
 }
 if(actor?.role==='patient'&&(input.patientId!==undefined||input.patient!==undefined))fail();
 if(input.patientId!==undefined&&input.patient!==undefined)fail();
 if(input.patientId!==undefined||input.patient!==undefined)result.patientId=identifier(input.patientId??input.patient);
 if(actor?.role!=='patient'&&!result.patientId)fail();
 if(input.bookingChannel!==undefined)result.bookingChannel=enumeration(input.bookingChannel,['ONLINE_APP','WALK_IN','PHONE','SUPPORT_ASSISTED']);
 if(input.appointmentChannel!==undefined)result.appointmentChannel=enumeration(input.appointmentChannel,['ONLINE','OFFLINE']);
 if(input.preferredContactMethod!==undefined)result.preferredContactMethod=enumeration(input.preferredContactMethod,['sms','email','phone','whatsapp']);
 for(const [key,max]of [['contactPhone',32],['symptoms',2000],['notes',2000]])if(input[key]!==undefined)result[key]=text(input[key],max);
 return result;
}
function availability(input){
 object(input,['doctorId','hospitalId','date','channel']);
 const result={doctorId:identifier(input.doctorId),hospitalId:identifier(input.hospitalId),date:day(input.date)};
 if(input.channel!==undefined)result.channel=enumeration(input.channel,['ONLINE','OFFLINE']);
 return result;
}
function list(input){
 object(input,['status','since','limit','hospitalId','patientId']);
 const result={};
 if(input.status!==undefined)result.status=enumeration(input.status,['all','pending','reminder_sent','confirmed','checked_in','completed','cancelled','expired']);
 if(input.since!==undefined)result.since=instant(input.since);
 if(input.limit!==undefined){if(typeof input.limit!=='string'||!/^\d{1,3}$/.test(input.limit))fail();result.limit=integer(Number(input.limit),1,100);}
 for(const key of ['hospitalId','patientId'])if(input[key]!==undefined)result[key]=identifier(input[key]);
 return result;
}
function status(input){
 object(input,['status','staffNotes','reason']);
 const result={status:enumeration(input.status,['confirmed','cancelled','checked_in','completed'])};
 if(input.staffNotes!==undefined)result.staffNotes=text(input.staffNotes,1000);
 if(input.reason!==undefined)result.reason=text(input.reason,1000);
 return result;
}
function cancellation(input={}){
 object(input,['reason','refundResolution']);const result={};
 if(input.reason!==undefined)result.reason=text(input.reason,1000);
 if(input.refundResolution!==undefined)result.refundResolution=enumeration(input.refundResolution,['REFUND','PATIENT_APPROVED_TRANSFER']);
 return result;
}
function reschedule(input){object(input,['slotId']);return {slotId:id(input.slotId)};}
function override(input){
 object(input,['hospitalId','overrideType','startDateTime','endDateTime','reason']);
 const result={overrideType:enumeration(input.overrideType,['LEAVE','EMERGENCY_BLOCK','CUSTOM_HOURS','HOLIDAY']),startDateTime:instant(input.startDateTime),endDateTime:instant(input.endDateTime)};
 if(Date.parse(result.startDateTime)>=Date.parse(result.endDateTime)||Date.parse(result.endDateTime)-Date.parse(result.startDateTime)>366*86400000)fail();
 if(input.hospitalId!==undefined)result.hospitalId=identifier(input.hospitalId);
 if(input.reason!==undefined)result.reason=text(input.reason,1000);
 return result;
}
function idempotency(value){if(typeof value!=='string'||!/^[A-Za-z0-9_-]{8,128}$/.test(value))fail();return value;}
function token(value){if(typeof value!=='string'||!/^[A-Za-z0-9_-]{43}$/.test(value))fail();return value;}
module.exports={object,text,id,identifier,day,instant,enumeration,integer,amount,booking,availability,list,status,cancellation,reschedule,override,idempotency,token,fail};
