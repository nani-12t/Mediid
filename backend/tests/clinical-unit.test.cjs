'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const v=require('../src/clinical/validation');
const {clinicalMode,createClinicalRuntime}=require('../src/clinical/runtime');
const {ClinicalError,clinicalResponse,databaseOperation}=require('../src/clinical/errors');
const {newPostgresId}=require('../src/identifiers/uuid');
const inputError=error=>error instanceof ClinicalError&&error.code==='CLINICAL_INPUT';
const item=()=>({medicationName:'Synthetic Medicine',dosage:'Synthetic dose',form:'tablet',frequency:'Synthetic frequency',duration:'Synthetic duration',quantity:2,instructions:'Synthetic instructions'});
const rx=()=>({appointmentId:newPostgresId(),encounterId:newPostgresId(),items:[item()]});
const document=()=>({type:'other',title:'Synthetic document',fileUrl:'https://documents.example.invalid/synthetic.pdf',fileName:'synthetic.pdf',fileSizeBytes:100,mimeType:'application/pdf'});
test('clinical selection requires explicit supported mode and all PostgreSQL dependencies',()=>{
 for(const value of [undefined,'','auto','POSTGRES','mongo'])assert.throws(()=>clinicalMode({CLINICAL_BACKEND:value}),error=>error.code==='CLINICAL_CONFIG');
 for(const value of ['legacy','postgres'])assert.equal(clinicalMode({CLINICAL_BACKEND:value}),value);
 assert.deepEqual(createClinicalRuntime({mode:'legacy'},null,null,null,{CLINICAL_BACKEND:'legacy'}),{mode:'legacy'});
 assert.throws(()=>createClinicalRuntime({mode:'postgres'},null,null,null,{CLINICAL_BACKEND:'legacy'}),error=>error.code==='CLINICAL_CONFIG');
 for(const index of [0,1,2,3]){const dependencies=Array.from({length:4},()=>({mode:'postgres',service:{}}));dependencies[index]={mode:'legacy',service:{}};assert.throws(()=>createClinicalRuntime(...dependencies,{CLINICAL_BACKEND:'postgres'}),error=>error.code==='CLINICAL_CONFIG');}
});
test('clinical public patient identifiers and bounded pagination reject alternate identities',()=>{
 assert.equal(v.patientUid('MID-SYNTH000'),'MID-SYNTH000');const cursor=newPostgresId();assert.deepEqual(v.pagination({limit:'50',cursor}),{limit:50,cursor});
 for(const value of [newPostgresId(),'mid-synth000','MID-UNKNOWN00','../MID-SYNTH000',undefined])assert.throws(()=>v.patientUid(value),inputError);
 for(const input of [{limit:0},{limit:51},{limit:'1.5'},{limit:['20']},{limit:'020'},{cursor:'invalid'},{patientId:newPostgresId()},{cursor:{id:cursor}}])assert.throws(()=>v.pagination(input),inputError);
});
test('technical vital validation uses precise decimal strings and rejects client BMI and provenance',()=>{
 assert.deepEqual(v.vitals({heartRate:70,weightKg:'81',heightCm:'180.0',temperatureCelsius:'36.50'}),{heartRate:70,weightKg:'81.00',heightCm:'180.00',temperatureCelsius:'36.50'});
 for(const input of [{},{heartRate:'70'},{heartRate:-1},{heartRate:401},{heartRate:NaN},{spo2Percentage:101},{respiratoryRate:0},{weightKg:'NaN'},{weightKg:'1e2'},{weightKg:'0.00'},{heightCm:'180.001'},{temperatureCelsius:'Infinity'},{temperatureCelsius:'80.00'},{bmi:'25.00'},{patientId:newPostgresId(),heartRate:70},{encounterId:newPostgresId(),heartRate:70}])assert.throws(()=>v.vitals(input),inputError);
});
test('SOAP validation requires meaningful bounded text a reviewed type and derived author',()=>{
 assert.deepEqual(v.note({assessment:' Synthetic assessment '}),{noteType:'progress',assessment:'Synthetic assessment'});
 for(const type of ['progress','consultation','discharge','procedure'])assert.equal(v.note({noteType:type,plan:'Synthetic plan'}).noteType,type);
 for(const input of [{},{noteType:'progress',assessment:'  '},{noteType:'unsafe',assessment:'Synthetic'},{assessment:'x'.repeat(4001)},{assessment:'Synthetic\u0000control'},{assessment:'Synthetic',authorId:newPostgresId()},{assessment:'Synthetic',patientId:newPostgresId()}])assert.throws(()=>v.note(input),inputError);
});
test('condition validation retains explicit diagnosis data and rejects cross-patient identity injection',()=>{
 assert.deepEqual(v.condition({displayName:'Synthetic Condition',clinicalStatus:'active',diagnosedDate:'2028-02-29'}),{displayName:'Synthetic Condition',clinicalStatus:'active',diagnosedDate:'2028-02-29'});
 for(const input of [{displayName:''},{displayName:'Synthetic',clinicalStatus:'unsafe'},{displayName:'Synthetic',patientId:newPostgresId()},{displayName:'Synthetic',encounterId:newPostgresId()},{displayName:'Synthetic',diagnosedDate:'2026-02-29'},{displayName:'Synthetic',icd10Code:'x'.repeat(17)}])assert.throws(()=>v.condition(input),inputError);
});
test('allergy validation bounds severity reaction and encounter provenance',()=>{
 for(const severity of ['mild','moderate','severe','fatal'])assert.equal(v.allergy({substance:'Synthetic Allergy',severity}).severity,severity);
 for(const input of [{substance:' '},{substance:'Synthetic',severity:'unsafe'},{substance:'Synthetic',reaction:'x'.repeat(2001)},{substance:'Synthetic',patientId:newPostgresId()},{substance:'Synthetic',encounterId:newPostgresId()}])assert.throws(()=>v.allergy(input),inputError);
});
test('structured prescription requires one to fifty complete bounded items and exact context selectors',()=>{
 const valid=rx();assert.deepEqual(v.prescription(valid),valid);
 for(const input of [{...valid,prescriptionText:'Synthetic blob'},{...valid,items:[]},{...valid,items:Array.from({length:51},item)},{...valid,items:[{...item(),quantity:0}]},{...valid,items:[{...item(),quantity:1.5}]},{...valid,items:[{...item(),quantity:100001}]},{...valid,items:[{...item(),medicationName:''}]},{...valid,items:[{...item(),dosage:''}]},{...valid,items:[{...item(),instructions:'x'.repeat(2001)}]},{...valid,items:[{...item(),id:newPostgresId()}]},{...valid,patientId:newPostgresId()},{...valid,doctorId:newPostgresId()},{...valid,hospitalId:newPostgresId()},{...valid,status:'dispensed'},{...valid,issuedAt:'2030-01-01'}])assert.throws(()=>v.prescription(input),inputError);
});
test('patient documents accept only safe bounded HTTPS metadata without credentials or signed secrets',()=>{
 assert.deepEqual(v.document(document()),document());
 for(const fileUrl of ['data:application/pdf;base64,AA==','blob:https://example.invalid/a','file:///private','javascript:alert(1)','http://example.invalid/a','https://user:secret@example.invalid/a','https://example.invalid/a?signature=secret','https://example.invalid/a#secret','https://example.invalid/'+ 'x'.repeat(2048)])assert.throws(()=>v.document({...document(),fileUrl}),inputError);
 for(const patch of [{patientId:newPostgresId()},{uploadedByUserId:newPostgresId()},{encounterId:newPostgresId()},{type:'unsafe'},{title:''},{fileSizeBytes:-1},{fileSizeBytes:104857601},{mimeType:'bad mime type'}])assert.throws(()=>v.document({...document(),...patch}),inputError);
});
test('free text control characters and unbounded blobs are rejected across clinical payloads',()=>{
 for(const value of ['Synthetic\nline','Synthetic\rline','Synthetic\tline','Synthetic\u007fline'])assert.throws(()=>v.text(value,4000),inputError);
 for(const value of [null,{},[],42])assert.throws(()=>v.text(value,4000),inputError);
});
test('safe clinical denial reasons and time hints cannot disclose arbitrary private details',()=>{
 const result=clinicalResponse(new ClinicalError('CLINICAL_ACCESS_DENIED',{reason:'provider_membership_inactive',opensAt:'2030-01-01T10:00:00Z',expiresAt:'invalid',token:'Synthetic secret'}));assert.equal(result.status,403);assert.equal(result.body.reason,'provider_membership_inactive');assert.equal(result.body.opensAt,'2030-01-01T10:00:00Z');assert.equal(Object.hasOwn(result.body,'expiresAt'),false);assert.equal(Object.hasOwn(result.body,'token'),false);
 assert.equal(clinicalResponse(new ClinicalError('CLINICAL_ACCESS_DENIED',{reason:'Synthetic private SQL message'})).body.reason,'access_denied');
 const unavailable=clinicalResponse(new Error('Synthetic private credential'));assert.equal(unavailable.status,503);assert.equal(JSON.stringify(unavailable).includes('credential'),false);
});
test('database failures map validation conflict and unavailable errors without leaking SQL details',async()=>{
 for(const [code,message,expected]of [['23514','Synthetic constraint','CLINICAL_INPUT'],['23505','Synthetic duplicate','CLINICAL_CONFLICT'],['40P01','Synthetic deadlock','CLINICAL_CONFLICT'],['40001','Synthetic serialization','CLINICAL_CONFLICT'],['P0001','CLINICAL_NOT_FOUND','CLINICAL_NOT_FOUND'],['P0001','CLINICAL_CONFLICT','CLINICAL_CONFLICT'],['ECONNREFUSED','Synthetic private connection','CLINICAL_UNAVAILABLE']])await assert.rejects(()=>databaseOperation(async()=>{throw Object.assign(new Error(message),{code});}),error=>error.code===expected&&!error.message.includes('Synthetic'));
});

test('clinical compatibility derives active facts while retaining history and excluding private DTO fields',()=>{
 const dto=require('../src/clinical/dto'),id=newPostgresId(),active={id:newPostgresId(),status:'active',items:[{medicationName:'Synthetic Active Medicine',dosage:'Synthetic dose'}]},cancelled={id:newPostgresId(),status:'cancelled',items:[{medicationName:'Synthetic Cancelled Medicine',dosage:'Synthetic dose'}]};
 const canonical={patient:{uid:'MID-SYNTH000',password:'Synthetic password',aadhaarHash:'Synthetic identifier'},consultation:{sessionId:newPostgresId(),token:'Synthetic internal token'},encounters:[{id,startTime:'2030-01-01T10:00:00Z',conditions:[{displayName:'Synthetic Condition'}],notes:[{assessment:'Synthetic assessment'}],prescriptions:[active,cancelled],doctor:{firstName:'Synthetic',lastName:'Doctor'},hospital:{name:'Synthetic Hospital'}}],conditions:[{displayName:'Synthetic Active Condition',clinicalStatus:'active'},{displayName:'Synthetic Resolved Condition',clinicalStatus:'resolved'}],allergies:[{substance:'Synthetic Allergy'}],prescriptions:[active,cancelled],documents:[],pagination:{limit:20,hasMore:false}};
 const profile=dto.profileClinical({firstName:'Synthetic',emergency:{contactName:'Synthetic contact'},bills:[{private:true}]},canonical);assert.deepEqual(profile.emergency.currentMedications,['Synthetic Active Medicine Synthetic dose']);assert.deepEqual(profile.emergency.chronicConditions,['Synthetic Active Condition']);assert.deepEqual(profile.emergency.allergies,['Synthetic Allergy']);assert.equal(profile.emergency.contactName,'Synthetic contact');assert.deepEqual(profile.bills,[]);assert.equal(profile.medicalHistory[0]._id,id);assert.equal(profile.medicalHistory[0].diagnosis,'Synthetic Condition');
 const safe=dto.bundle(canonical);assert.equal(safe.prescriptions.length,2);const text=JSON.stringify(safe);for(const secret of ['Synthetic password','Synthetic identifier','Synthetic internal token'])assert.equal(text.includes(secret),false);
 const document=dto.record('document',{id:newPostgresId(),title:'Synthetic historical metadata',fileUrl:'https://user:secret@example.invalid/file?signature=secret',uploadedByUserId:newPostgresId()});assert.equal(document.fileUrl,null);assert.equal(Object.hasOwn(document,'uploadedByUserId'),false);
});
