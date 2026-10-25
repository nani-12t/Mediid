'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {organizationMode,createOrganizationRuntime}=require('../src/organizations/runtime');
const {OrganizationError,organizationResponse}=require('../src/organizations/errors');
const {AuthError}=require('../src/auth/errors');
const v=require('../src/organizations/validation');
const {hospitalDTO,doctorDTO,staffDTO}=require('../src/organizations/dto');
const {newPostgresId,mongoObjectIdToUuid}=require('../src/identifiers/uuid');
const invalid=operation=>assert.throws(operation,error=>error.code==='ORG_INPUT');
test('organization mode is explicit and cannot couple postgres providers to legacy authentication',()=>{
  assert.equal(organizationMode({ORGANIZATION_BACKEND:'legacy'}),'legacy');
  assert.deepEqual(createOrganizationRuntime(null,{ORGANIZATION_BACKEND:'legacy'}),{mode:'legacy'});
  for(const value of [undefined,'','auto','POSTGRES'])assert.throws(()=>organizationMode({ORGANIZATION_BACKEND:value}),error=>error.code==='ORG_CONFIG');
  assert.throws(()=>createOrganizationRuntime({mode:'legacy'},{ORGANIZATION_BACKEND:'postgres'}),error=>error.code==='ORG_CONFIG');
});
test('provider ID parsing distinguishes UUID, proven import candidates and explicit public UIDs',()=>{
  const id=newPostgresId(),mongo='507f1f77bcf86cd799439011';
  assert.deepEqual(v.identifier(id),{id});
  assert.deepEqual(v.identifier(mongo),{id:mongoObjectIdToUuid(mongo),legacyId:mongo});
  assert.deepEqual(v.identifier(' hid-public01 ',{uid:true,kind:'hospital'}),{uid:'HID-PUBLIC01'});
  for(const value of ['HID-PUBLIC01',mongo.toUpperCase(),'invalid',{},'x'.repeat(1000)])invalid(()=>v.identifier(value));
  invalid(()=>v.identifier('MID-PATIENT1',{uid:true,kind:'hospital'}));
});
test('public searches reject nested query objects, excessive pages and unbounded results',()=>{
  assert.deepEqual(v.pagination({q:'safe'},['q']),{limit:100,offset:0});
  for(const query of [{limit:'101'},{limit:'0'},{page:'1000'},{limit:'1.5'},{unknown:'field'},[]])invalid(()=>v.pagination(query,['q']));
  invalid(()=>v.text({injection:'query'},150));
  invalid(()=>v.text('x'.repeat(151),150));
});
test('hospital edits reject ownership, identity, type, sequence and rating changes while keeping legacy nested hours',()=>{
  for(const key of ['uid','id','userId','user','clinicOwnerDoctorId','doctorSequence','staffSequence','rating','isVerified','isActive','type'])invalid(()=>v.hospitalInput({[key]:'forged'}));
  const result=v.hospitalInput({name:' Example ',address:{street:'Main',city:'Pune'},contact:{phone:'123',email:'public@example.invalid'},
    operatingHours:{weekdays:{open:'09:00',close:'17:00'},weekends:{open:'10:00',close:'14:00'},is24x7:false}});
  assert.equal(result.name,'Example');assert.equal(result.city,'Pune');assert.equal(result.contactPhone,'123');
  assert.deepEqual(result.operatingHours.weekdays,{open:'09:00',close:'17:00'});
  invalid(()=>v.hospitalInput({operatingHours:{weekdays:{open:'25:00'}}}));
  invalid(()=>v.hospitalInput({operatingHours:{is24x7:'true'}}));
  invalid(()=>v.hospitalInput({name:'Patient\nRecord'}));
});
test('doctor and roster mutations cannot alter authorization or silently copy arbitrary DTO properties',()=>{
  for(const key of ['uid','userId','password','role','rating','primaryHospitalId','isPrivatePractice','isActive'])invalid(()=>v.doctorInput({[key]:'forged'}));
  assert.deepEqual(v.doctorInput({experience:12,qualifications:['MD'],consultationFee:750}),{experienceYears:12,qualifications:['MD'],consultationFee:750});
  invalid(()=>v.doctorInput({consultationFee:Infinity}));
  invalid(()=>v.staffInput({role:'hospital_admin'},true));
  invalid(()=>v.staffInput({userId:newPostgresId()}));
  invalid(()=>v.staffInput({role:'receptionist'}));
  assert.equal(v.staffInput({firstName:'Synthetic',lastName:'Staff',role:'receptionist',dateOfJoining:''},true).role,'receptionist');
});
test('recurring templates validate real dates/timezones and bounds without accepting booking fields',()=>{
  const valid={dayOfWeek:'Monday',startTime:'09:00',endTime:'12:00',effectiveFrom:'2026-10-25',timezone:'Asia/Kolkata',slotDuration:15,capacityPerSlot:1};
  assert.equal(v.templateInput(valid,true).dayOfWeek,'MONDAY');
  for(const patch of [{endTime:'08:00'},{startTime:'24:00'},{effectiveFrom:'2026-02-30'},{timezone:'not/a/timezone'},{capacityPerSlot:0},{slotDuration:0},{dayOfWeek:'Other'}])invalid(()=>v.templateInput({...valid,...patch},true));
  for(const key of ['booked','remaining','paymentHold','slotState','reservationId'])invalid(()=>v.templateInput({...valid,[key]:true},true));
});
test('compatibility DTOs preserve public UID and imported IDs while excluding all administrative/credential fields',()=>{
  const id=newPostgresId(),legacy='507f1f77bcf86cd799439011',uid='HID-PUBLIC01';
  const hospital={id,legacyId:legacy,uid,name:'Synthetic',city:'Pune',userId:newPostgresId(),clinicOwnerDoctorId:newPostgresId(),doctorSequence:5,
    ratingAverage:'4.50',ratingCount:100,isActive:true,secret:'sentinel',passwordHash:'hash'};
  const dto=hospitalDTO(hospital);assert.equal(dto._id,legacy);assert.equal(dto.internalId,id);assert.equal(dto.uid,uid);assert.deepEqual(dto.rating,{average:4.5,count:100});assert.equal(dto.address.city,'Pune');
  for(const key of ['userId','user','clinicOwnerDoctorId','doctorSequence','secret','passwordHash','registrationNumber'])assert.equal(Object.hasOwn(dto,key),false);
  const doctor={id,uid:uid+'-DOC-0001',firstName:'Synthetic',lastName:'Doctor',phone:'private-phone-sentinel',email:'private-email-sentinel',userId:id,ratingAverage:'5',ratingCount:1};
  assert.equal(doctorDTO(doctor).phone,undefined);assert.equal(doctorDTO(doctor).email,undefined);
  assert.equal(doctorDTO(doctor,{privateProfile:true}).email,'private-email-sentinel');
  const badge=staffDTO({id,uid:uid+'-REC-0001',firstName:'Synthetic',lastName:'Staff',role:'receptionist',phone:'private',email:'private',userId:id,employeeId:'private',hospital},{badge:true});
  for(const key of ['phone','email','userId','employeeId','createdAt','passwordHash'])assert.equal(Object.hasOwn(badge,key),false);
});
test('provider errors preserve authentication rejection and never serialize database exceptions',()=>{
  assert.deepEqual(organizationResponse(new OrganizationError('ORG_CONFLICT')),{status:409,body:{code:'ORG_CONFLICT',message:'Provider operation conflicts with existing state.'}});
  assert.equal(organizationResponse(new AuthError('AUTH_TOKEN')).status,401);
  const raw=Object.assign(new Error('postgresql://credential password private key activation'),{code:'23505',stack:'secret'});
  assert.deepEqual(organizationResponse(raw),{status:503,body:{code:'ORG_UNAVAILABLE',message:'Provider service is unavailable.'}});
});
