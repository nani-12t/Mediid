'use strict';
const camel=input=>{
 if(Array.isArray(input))return input.map(camel);
 if(input&&typeof input==='object'&&!(input instanceof Date))return Object.fromEntries(Object.entries(input).map(([key,value])=>[key.replace(/_([a-z])/g,(_,letter)=>letter.toUpperCase()),camel(value)]));
 return input;
};
function summary(input,kind){
 const row=camel(input||{}),fields=kind==='patient'?['id','uid','firstName','lastName','phone']:kind==='doctor'?['id','uid','firstName','lastName','specialization','consultationFee']:['id','uid','name','type','address','contact'];
 return {_id:row.id,...Object.fromEntries(fields.filter(key=>row[key]!==undefined).map(key=>[key,row[key]]))};
}
function appointmentDTO(input,{role='patient'}={}){
 const row=camel(input||{}),key=row.id,redacted=!['patient','doctor'].includes(role);
 const result={_id:key,id:key,patient:summary(row.patient||{id:row.patientId},'patient'),doctor:summary(row.doctor||{id:row.doctorId},'doctor'),hospital:summary(row.hospital||{id:row.hospitalId||row.clinicHospitalId},'hospital')};
 const fields=['slotId','appointmentDate','timeSlot','status','preferredContactMethod','contactPhone','confirmationMethod','confirmationMode','holdExpiresAt','paymentHoldStatus','depositAmount','depositRequired','depositPercentage','rescheduleCount','createdAt','updatedAt','patientConfirmedAt','confirmedAt','slotStartTime','slotEndTime','amountPaid','currency','refundStatus','refundAmount','appointmentChannel','bookingChannel'];
 for(const field of fields)if(row[field]!==undefined)result[field]=row[field];
 result.bookingMethod={ONLINE_APP:'app',WALK_IN:'walk_in',PHONE:'phone',SUPPORT_ASSISTED:'support_assisted'}[row.bookingChannel]||row.bookingMethod||'app';
 result.billAmount=row.totalFee??row.billAmount??'0.00';
 result.billStatus=row.billStatus||(Number(row.amountPaid)>=Number(result.billAmount)?'paid':Number(row.amountPaid)>0?'deposit_paid':'pending');
 result.confirmToken=null;result.symptoms=redacted?null:row.symptoms??null;result.notes=redacted?null:row.notes??null;
 if(['hospital_admin','hospital_staff'].includes(role))result.staffNotes=row.staffNotes??null;
 return result;
}
function availabilityDTO(input){
 const row=camel(input||{});
 return Object.fromEntries(['id','doctorId','hospitalId','slotStart','slotEnd','channel','capacity','remainingCapacity','timezone','timeSlot'].filter(key=>row[key]!==undefined).map(key=>[key,row[key]]));
}
module.exports={camel,appointmentDTO,availabilityDTO};
