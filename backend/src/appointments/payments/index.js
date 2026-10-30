'use strict';
const {createHash}=require('node:crypto');
const {AppointmentError}=require('../errors');
function reference(kind,intent){
 return 'test_'+kind+'_'+createHash('sha256').update(String(intent.idempotencyKey)+'|'+String(intent.id)+'|'+String(intent.amount)+'|'+String(intent.currency)).digest('hex').slice(0,48);
}
class TestPaymentProvider{
 constructor(){this.name='test';}
 async capture(intent){
  if(intent.provider!==this.name||typeof intent.amount!=='string'||!/^\d+\.\d{2}$/.test(intent.amount)||Number(intent.amount)<=0)throw new AppointmentError('APPOINTMENT_PAYMENT_UNAVAILABLE');
  return {provider:this.name,transactionRef:reference('capture',intent),amount:intent.amount,currency:intent.currency,status:'CAPTURED'};
 }
 async refund(intent){
  if(intent.provider!==this.name||!intent.idempotencyKey||Number(intent.amount)<=0)throw new AppointmentError('APPOINTMENT_PAYMENT_UNAVAILABLE');
  return {provider:this.name,transactionRef:reference('refund',intent),amount:intent.amount,currency:intent.currency,status:'SUCCEEDED'};
 }
}
class DisabledPaymentProvider{
 constructor(){this.name='disabled';}
 async capture(){throw new AppointmentError('APPOINTMENT_PAYMENT_UNAVAILABLE');}
 async refund(){throw new AppointmentError('APPOINTMENT_PAYMENT_UNAVAILABLE');}
}
function createPaymentProvider(env=process.env){
 const name=env.APPOINTMENT_PAYMENT_PROVIDER||'disabled';
 if(!['disabled','test'].includes(name)||name==='test'&&env.NODE_ENV==='production')throw new AppointmentError('APPOINTMENT_CONFIG');
 return name==='test'?new TestPaymentProvider():new DisabledPaymentProvider();
}
function verifiedResult(result,intent,status){
 if(!result||result.provider!==intent.provider||result.status!==status||String(result.amount)!==String(intent.amount)||result.currency!==intent.currency||
  typeof result.transactionRef!=='string'||result.transactionRef.length>128||!result.transactionRef||/[\x00-\x1f\x7f]/.test(result.transactionRef))throw new AppointmentError('APPOINTMENT_PAYMENT_UNAVAILABLE');
 return result;
}
module.exports={TestPaymentProvider,DisabledPaymentProvider,createPaymentProvider,verifiedResult};
