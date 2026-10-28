'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {randomBytes,randomInt,createHmac}=require('node:crypto');
const {patientMode,createPatientRuntime}=require('../src/patients/runtime');
const {PatientError,patientResponse,databaseOperation}=require('../src/patients/errors');
const {AuthError}=require('../src/auth/errors');
const v=require('../src/patients/validation');
const dto=require('../src/patients/dto');
const {newPostgresId,mongoObjectIdToUuid}=require('../src/identifiers/uuid');
const key=randomBytes(32).toString('hex');
const syntheticAadhaar=()=>String(randomInt(100000,999999))+String(randomInt(100000,999999));
const invalid=fn=>assert.throws(fn,error=>error.code==='PATIENT_INPUT');
test('patient mode is explicit and refuses incompatible auth/provider runtimes and invalid hashing config',()=>{
 assert.equal(patientMode({PATIENT_BACKEND:'legacy'}),'legacy');
 assert.deepEqual(createPatientRuntime(null,null,{PATIENT_BACKEND:'legacy'}),{mode:'legacy'});
 for(const value of [undefined,'','auto','POSTGRES'])assert.throws(()=>patientMode({PATIENT_BACKEND:value}),error=>error.code==='PATIENT_CONFIG');
 for(const [auth,org]of [[{mode:'legacy'},{mode:'postgres'}],[{mode:'postgres'},{mode:'legacy'}]])assert.throws(()=>createPatientRuntime(auth,org,{PATIENT_BACKEND:'postgres'}),error=>error.code==='PATIENT_CONFIG');
 for(const value of [undefined,'short','x'.repeat(513),'x'.repeat(40)+'\n'])assert.throws(()=>v.aadhaarKey(value),error=>error.code==='PATIENT_CONFIG');
});
test('patient UID and internal identifiers remain distinct and canonical',()=>{
 assert.equal(v.patientUid('MID-TEST0001'),'MID-TEST0001');assert.equal(v.internalId(newPostgresId()).length,36);
 for(const value of ['mid-test0001',' MID-TEST0001','MID-TOOLONG01',newPostgresId(),'507f1f77bcf86cd799439011'])invalid(()=>v.patientUid(value));
 invalid(()=>v.internalId('MID-TEST0001'));
});
test('profile allowlists reject identity authority clinical and unrelated nested fields',()=>{
 for(const name of ['id','_id','internalId','userId','user','uid','role','email','authVersion','password','passwordHash','createdAt','medicalBenefits','trustedDoctors','trustedHospitals','documents','bills','medicalHistory','rating','aadhaarHash'])invalid(()=>v.profileInput({[name]:'forged'},key));
 for(const name of ['allergies','chronicConditions','currentMedications','unknown'])invalid(()=>v.profileInput({emergency:{[name]:[]}},key));
 invalid(()=>v.profileInput({address:{coordinates:{lat:1}}},key));
 assert.deepEqual(v.profileInput({address:{city:' Synthetic '},emergency:{bloodGroup:'O_POS',organDonor:true},qrActive:false},key),{city:'Synthetic',bloodGroup:'O+',organDonor:true,qrActive:false});
});
test('demographic validation enforces real dates supported enums bounded strings and booleans',()=>{
 for(const patch of [{firstName:' '},{lastName:'Bad\nName'},{phone:'x'.repeat(33)},{dateOfBirth:'2030-02-30'},{dateOfBirth:'9999-01-01'},{gender:'administrator'},{qrActive:'true'},{emergency:{bloodGroup:'UNKNOWN'}},{emergency:{bloodGroup:['O_POS']}}])invalid(()=>v.profileInput(patch,key));
 const parsed=v.profileInput({firstName:' Synthetic ',lastName:'Patient',dateOfBirth:'2000-02-29',gender:'other',emergency:{emergencyContactName:'Synthetic contact',emergencyContactPhone:'synthetic-phone',emergencyContactRelation:'Friend'},organDonor:false},key);
 assert.equal(parsed.firstName,'Synthetic');assert.equal(parsed.dateOfBirth,'2000-02-29');assert.equal(parsed.organDonor,false);
});
test('Aadhaar accepts only explicit twelve-digit replacement or null and becomes a domain-separated keyed digest',()=>{
 const raw=syntheticAadhaar(),a=v.profileInput({emergency:{aadhaarNumber:raw}},key).aadhaarHash;
 assert.match(a,/^[a-f0-9]{64}$/);assert.notEqual(a,raw);
 assert.equal(a,v.aadhaarDigest(raw,key));assert.notEqual(a,v.aadhaarDigest(raw,randomBytes(32).toString('hex')));
 assert.equal(a,createHmac('sha256',key).update('mediid:patient:aadhaar:v1:'+raw).digest('hex'));
 assert.deepEqual(v.profileInput({emergency:{aadhaarNumber:null}},key),{aadhaarHash:null});
 assert.equal('aadhaarHash' in v.profileInput({emergency:{bloodGroup:'O+'}},key),false);
 for(const value of ['',raw+'0',raw.slice(1),' '+raw,Number(raw),'ABCDEFGHIJKL'])invalid(()=>v.aadhaarDigest(value,key));
});
test('benefit money remains exact bounded fixed-point text and rejects rounding exponent and negative inputs',()=>{
 assert.equal(v.money('9999999999.99',10),'9999999999.99');assert.equal(v.money('0.1',10),'0.10');assert.equal(v.money(100,10),'100.00');
 for(const value of ['-1','1.001','1e3','01.00','10000000000.00',Infinity,{},''])invalid(()=>v.money(value,10));
 invalid(()=>v.money('100000000.00',8));
});
test('benefit source/type boundaries reject smuggled ownership invalid ranges and oversized family data',()=>{
 for(const name of ['patientId','uid','id','_id','isActive','createdAt','role'])invalid(()=>v.benefitInput({source:'government',type:'ayushman',[name]:'forged'},true));
 for(const input of [{source:'unknown',type:'other_govt'},{source:['government'],type:'ayushman'},{source:{toString:{}},type:'ayushman'},{source:'government',type:'family_floater'},{source:'personal',type:'individual_insurance',validFrom:'2030-02-02',validUntil:'2030-01-01'},{source:'employer',type:'group_mediclaim',familyMembers:Array(51).fill('Synthetic')},{source:'personal',type:'individual_insurance',notes:'x'.repeat(4001)}])invalid(()=>v.benefitInput(input,true));
 assert.equal(v.benefitInput({source:'personal',type:'family_floater',coverageAmount:'10.50',familyCovered:true,familyMembers:['Synthetic dependent']},true).coverageAmount,'10.50');
});
test('legacy government adapter explicitly maps historical other and insurance without separate storage',()=>{
 assert.equal(v.governmentInput({type:'other',schemeName:'Synthetic scheme'}).type,'other_govt');
 const insurance=v.governmentInput({type:'insurance',cardNumber:'SYNTHETIC-POLICY'});
 assert.equal(insurance.source,'personal');assert.equal(insurance.type,'individual_insurance');assert.equal(insurance.policyNumber,'SYNTHETIC-POLICY');
 invalid(()=>v.governmentInput({type:'unverified_eligibility'}));invalid(()=>v.governmentInput({type:'esi',patientId:newPostgresId()}));
});
test('patient DTO preserves only proven legacy identifiers and keeps later-domain compatibility arrays empty',()=>{
 const legacy='507f1f77bcf86cd799439011',id=mongoObjectIdToUuid(legacy),raw=syntheticAadhaar();
 const row={id,legacyId:legacy,uid:'MID-TEST0001',firstName:'Synthetic',lastName:'Patient',bloodGroup:'O+',aadhaarHash:'digest',aadhaarNumber:raw,aadhaarPresent:true,userId:newPostgresId(),secret:raw,qrActive:false};
 const profile=dto.patientDTO(row);
 assert.equal(profile._id,legacy);assert.equal(profile.internalId,id);assert.equal(profile.uid,'MID-TEST0001');assert.equal(profile.aadhaarPresent,true);assert.equal(profile.emergency.aadhaarPresent,true);assert.equal(profile.qrActive,false);
 for(const field of ['documents','bills','medicalHistory','medicalBenefits','governmentBenefits','insurancePolicies','trustedDoctors','trustedHospitals'])assert.deepEqual(profile[field],[]);
 for(const field of ['allergies','chronicConditions','currentMedications'])assert.deepEqual(profile.emergency[field],[]);
 assert.ok(!JSON.stringify(profile).includes(raw));assert.ok(!JSON.stringify(profile).includes('aadhaarHash'));assert.equal('userId' in profile,false);
 assert.equal(dto.patientDTO({...row,id:newPostgresId()})._id.length,36);
});
test('public emergency and trusted provider DTOs exclude unrelated private attributes',()=>{
 const privateValue='SYNTHETIC-PRIVATE-SENTINEL';
 const card=dto.emergencyDTO({uid:'MID-TEST0001',name:'Synthetic Patient',email:privateValue,id:privateValue,emergency:{bloodGroup:'AB-',emergencyContactName:'Synthetic Contact',organDonor:true,aadhaarHash:privateValue,phone:privateValue}});
 assert.deepEqual(Object.keys(card).sort(),['emergency','name','uid']);assert.ok(!JSON.stringify(card).includes(privateValue));assert.equal(card.emergency.bloodGroup,'AB-');
 assert.ok(!JSON.stringify(dto.doctorSummary({uid:'DOC-TEST0001',phone:privateValue,email:privateValue})).includes(privateValue));
});
test('benefit compatibility derives government and personal arrays without inventing policy fields',()=>{
 const benefits=[dto.benefitDTO({id:newPostgresId(),source:'government',type:'other_govt',coverageAmount:'10.10',isActive:true}),dto.benefitDTO({id:newPostgresId(),source:'personal',type:'individual_insurance',policyNumber:'SYNTHETIC-POLICY',coverageAmount:'20.20',isActive:true})];
 assert.equal(dto.governmentBenefits(benefits)[0].type,'other');assert.equal(dto.insurancePolicies(benefits)[0].coverageAmount,'20.20');assert.equal(dto.insurancePolicies(benefits)[0].premium,null);
});
test('patient errors preserve session rejection and redact SQL Redis and private values',async()=>{
 const raw='SYNTHETIC-PRIVATE-SENTINEL';
 assert.equal(patientResponse(new AuthError('AUTH_TOKEN')).status,401);
 assert.deepEqual(patientResponse(new Error(raw)),{status:503,body:{code:'PATIENT_UNAVAILABLE',message:'Patient service is temporarily unavailable.'}});
 await assert.rejects(()=>databaseOperation(()=>Promise.reject({meta:{code:'P0001',message:'PATIENT_FORBIDDEN '+raw}})),error=>error.code==='PATIENT_FORBIDDEN'&&!error.message.includes(raw));
 await assert.rejects(()=>databaseOperation(()=>Promise.reject({code:'23514',message:raw})),error=>error.code==='PATIENT_INPUT');
 assert.equal(patientResponse(new PatientError('PATIENT_RATE_LIMIT')).status,429);
});
