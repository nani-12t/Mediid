'use strict';
const v=require('../validation');
const numeric={
 paymentHoldWindowMinutes:[1,1440],safetyCutoffMinutes:[1,1440],fastConfirmThresholdMinutes:[1,1440],
 fastConfirmWindowMinutes:[1,1440],minimumOnlineLeadMinutes:[1,1440],confirmationLeadMinutes:[0,1440],
 cancellationCutoffHours:[0,8760],rescheduleCutoffHours:[0,8760],maxRescheduleCount:[0,20]
};
const percentages=['depositPercentage','patientRefundPercentage','lateRefundPercentage','providerRefundPercentage','noShowRefundPercentage','noShowFeeDeduction'];
function policyInput(input){
 v.object(input,['hospitalId','doctorId','confirmationMode','depositRequired','depositFixedAmount','allowWalkIns','allowPhoneBookings','allowPatientApprovedTransfer','refundPolicyNotes',...Object.keys(numeric),...percentages]);
 const result={};
 for(const key of ['hospitalId','doctorId'])if(input[key]!==undefined)result[key]=v.identifier(input[key]);
 if(input.confirmationMode!==undefined)result.confirmationMode=v.enumeration(input.confirmationMode,['DEPOSIT','TIME_BASED','MANUAL']);
 for(const key of ['depositRequired','allowWalkIns','allowPhoneBookings','allowPatientApprovedTransfer'])if(input[key]!==undefined){
  if(typeof input[key]!=='boolean')v.fail();result[key]=input[key];
 }
 for(const [key,[min,max]]of Object.entries(numeric))if(input[key]!==undefined)result[key]=v.integer(input[key],min,max);
 for(const key of percentages)if(input[key]!==undefined)result[key]=v.amount(input[key],100);
 if(input.depositFixedAmount!==undefined)result.depositFixedAmount=input.depositFixedAmount===null?null:v.amount(input.depositFixedAmount);
 if(input.refundPolicyNotes!==undefined)result.refundPolicyNotes=v.text(input.refundPolicyNotes,2000);
 // PostgreSQL schema defaults are the only default policy source.
 return result;
}
module.exports={policyInput};
