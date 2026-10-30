'use strict';
const {AppointmentError}=require('../errors');
function createDelivery(env=process.env){
 const mode=env.APPOINTMENT_NOTIFICATION_DELIVERY||'disabled';
 if(!['disabled','smtp','twilio'].includes(mode))throw new AppointmentError('APPOINTMENT_CONFIG');
 if(mode==='disabled')return {send:async()=>false};
 if(mode==='smtp'){
  const port=Number(env.SMTP_PORT);
  if(!env.SMTP_HOST||![465,587].includes(port)||!env.SMTP_USER||!env.SMTP_PASS||typeof env.SMTP_FROM!=='string'||/[\r\n]/.test(env.SMTP_FROM))throw new AppointmentError('APPOINTMENT_CONFIG');
  const transport=require('nodemailer').createTransport({host:env.SMTP_HOST,port,secure:port===465,requireTLS:true,auth:{user:env.SMTP_USER,pass:env.SMTP_PASS},logger:false,debug:false,connectionTimeout:3000,socketTimeout:5000});
  return {send:async message=>{
   const email=message.appointment.patient?.email||message.appointment.email;
   if(typeof email!=='string'||email.length>255||/[\r\n]/.test(email))return false;
   await transport.sendMail({from:env.SMTP_FROM,to:email,subject:'MEDIID appointment update',text:messageText(message)});return true;
  }};
 }
 if(!/^AC[a-f0-9]{32}$/i.test(env.TWILIO_ACCOUNT_SID||'')||!env.TWILIO_AUTH_TOKEN||!/^\+[1-9]\d{7,14}$/.test(env.TWILIO_PHONE_NUMBER||''))throw new AppointmentError('APPOINTMENT_CONFIG');
 const client=require('twilio')(env.TWILIO_ACCOUNT_SID,env.TWILIO_AUTH_TOKEN,{logLevel:'silent',timeout:5000});
 return {send:async message=>{
  const phone=message.appointment.contactPhone||message.appointment.patient?.phone;
  if(typeof phone!=='string'||!/^\+[1-9]\d{7,14}$/.test(phone))return false;
  await client.messages.create({to:phone,from:env.TWILIO_PHONE_NUMBER,body:messageText(message)});return true;
 }};
}
function messageText({kind,confirmationUrl}){
 return 'MEDIID: '+(kind==='booked'?'Your appointment request was received. Patient acknowledgement does not replace payment or provider confirmation.':kind==='reminder'?'You have an upcoming appointment.':'Your appointment status has changed.')+' View your appointment: '+confirmationUrl;
}
// No legacy development logger is used: links and contact details stay in delivery only.
class AppointmentNotifications{
 constructor(delivery,clientUrl){this.delivery=delivery;this.clientUrl=clientUrl.replace(/\/$/,'');}
 async send(kind,appointment,secret){
  try{return await this.delivery.send({kind,appointment:{id:appointment.id||appointment.appointmentId,contactPhone:appointment.contactPhone||appointment.patient?.phone,email:appointment.email||appointment.patient?.email},confirmationUrl:secret?this.clientUrl+'/confirm-appointment/'+secret:this.clientUrl+'/appointments'});}
  catch{return false;} // Committed scheduling and capacity never depend on delivery success.
 }
}
module.exports={createDelivery,AppointmentNotifications,messageText};
