'use strict';
const {AuthError,authResponse}=require('../../auth/errors');
const responses={
 APPOINTMENT_CONFIG:[503,'Appointment service configuration is unavailable.'],
 APPOINTMENT_INPUT:[400,'Invalid appointment input.'],
 APPOINTMENT_FORBIDDEN:[403,'Access denied.'],
 APPOINTMENT_NOT_FOUND:[404,'Appointment or confirmation link is unavailable.'],
 APPOINTMENT_CONFLICT:[409,'Appointment operation conflicts with existing scheduling state.'],
 APPOINTMENT_RATE_LIMIT:[429,'Too many confirmation requests. Try again later.'],
 APPOINTMENT_PAYMENT_UNAVAILABLE:[503,'Appointment payment provider is unavailable.'],
 APPOINTMENT_UNAVAILABLE:[503,'Appointment service is temporarily unavailable.']
};
class AppointmentError extends Error{
 constructor(code){super(responses[code]?.[1]||responses.APPOINTMENT_UNAVAILABLE[1]);this.name='AppointmentError';this.code=responses[code]?code:'APPOINTMENT_UNAVAILABLE';}
}
function appointmentResponse(error){
 if(error instanceof AuthError)return authResponse(error);
 const code=error instanceof AppointmentError?error.code:'APPOINTMENT_UNAVAILABLE';
 return {status:responses[code][0],body:{code,message:responses[code][1]}};
}
async function databaseOperation(operation){
 try{return await operation();}catch(error){
  if(error instanceof AppointmentError||error instanceof AuthError)throw error;
  const code=error?.meta?.code||error?.code;
  if(code==='P0001'){
   const message=String(error?.meta?.message||error?.message||'');
   const match=message.match(/\b(?:APPOINTMENT|AUTH)_(INPUT|FORBIDDEN|NOT_FOUND|CONFLICT)\b/);
   if(match)throw new AppointmentError('APPOINTMENT_'+match[1]);
   if(/\bAPPOINTMENT_CONFIRM_INVALID\b/.test(message))throw new AppointmentError('APPOINTMENT_NOT_FOUND');
   if(/\bAPPOINTMENT_(?:[A-Z_]*CONFLICT|SLOT_CLOSED|HOLD_EXPIRED|TRANSITION|PAYMENT_REQUIRED)\b/.test(message))throw new AppointmentError('APPOINTMENT_CONFLICT');
   if(/\bAPPOINTMENT_TEMPLATE_INVALID\b/.test(message))throw new AppointmentError('APPOINTMENT_INPUT');
  }
  if(['23505','23P01','P2002','40001','40P01'].includes(code))throw new AppointmentError('APPOINTMENT_CONFLICT');
  if(['22P02','22007','22008','22003','23514'].includes(code))throw new AppointmentError('APPOINTMENT_INPUT');
  throw new AppointmentError('APPOINTMENT_UNAVAILABLE');
 }
}
module.exports={AppointmentError,appointmentResponse,databaseOperation};
