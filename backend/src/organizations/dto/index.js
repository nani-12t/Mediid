'use strict';
const numeric = value => value == null ? 0 : Number(value);
const identity = row => ({_id:row.legacyId||row.id,id:row.legacyId||row.id,internalId:row.id,uid:row.uid});
function hospitalSummary(row) {
  if(!row)return null;
  return {...identity(row),name:row.name,type:row.type,
    address:{street:row.street||'',city:row.city||'',state:row.state||'',pincode:row.pincode||'',country:row.country||'India',
      coordinates:{lat:row.latitude==null?null:Number(row.latitude),lng:row.longitude==null?null:Number(row.longitude)}},
    contact:{phone:row.contactPhone||'',email:row.contactEmail||'',website:row.website||'',emergencyPhone:row.emergencyPhone||''}};
}
function hospitalDTO(row,{doctors=row.doctors||[],privateProfile=false}={}) {
  return {...hospitalSummary(row),specialties:row.specialties||[],facilities:row.facilities||[],
    operatingHours:row.operatingHours||{weekdays:{open:'',close:''},weekends:{open:'',close:''},is24x7:false},
    totalBeds:numeric(row.totalBeds),icuBeds:numeric(row.icuBeds),logo:row.logoUrl||'',photos:row.photos||[],
    rating:{average:numeric(row.ratingAverage),count:numeric(row.ratingCount)},isVerified:row.isVerified===true,isActive:row.isActive===true,
    doctors,createdAt:row.createdAt,
    ...(privateProfile?{registrationNumber:row.registrationNumber||'',qrCode:row.qrCode||''}:{})};
}
function doctorDTO(row,{privateProfile=false}={}) {
  const memberships=(row.memberships||[]).map(item=>({
    id:item.id,isPrimary:item.isPrimary===true,roleTitle:item.roleTitle,
    hospital:hospitalSummary(item.hospital)
  }));
  return {...identity(row),firstName:row.firstName,lastName:row.lastName,
    fullName:'Dr. '+row.firstName+' '+row.lastName,specialization:row.specialization,
    subSpecialties:row.subSpecialties||[],qualifications:row.qualifications||[],experience:numeric(row.experienceYears),
    expertise:row.expertise||[],languages:row.languages||[],consultationFee:numeric(row.consultationFee),
    rating:{average:numeric(row.ratingAverage),count:numeric(row.ratingCount)},photo:row.photoUrl||'',
    status:row.status,isActive:row.isActive===true,isPrivatePractice:row.isPrivatePractice===true,
    doctorType:row.uid?.includes('-SRDOC-')?'Senior Doctor':row.uid?.includes('-JRDOC-')?'Junior Doctor':'Clinical Doctor',
    dutyStatus:{available:'Available',busy:'Busy',on_leave:'On Leave',offline:'Offline'}[row.status]||'Offline',
    hospital:hospitalSummary(row.hospital),memberships,qrCode:row.qrCode||'',createdAt:row.createdAt,
    ...(privateProfile?{phone:row.phone||'',email:row.email||'',registrationNumber:row.registrationNumber||''}:{})};
}
function staffDTO(row,{badge=false}={}) {
  const safe={...identity(row),firstName:row.firstName,lastName:row.lastName,fullName:row.firstName+' '+row.lastName,
    role:row.role,department:row.department||'',photo:row.photoUrl||'',hospital:hospitalSummary(row.hospital),qrCode:row.qrCode||''};
  if(badge)return safe;
  return {...safe,employeeId:row.employeeId||'',qualifications:row.qualifications||[],experience:numeric(row.experience),
    phone:row.phone||'',email:row.email||'',dateOfJoining:row.dateOfJoining,shift:row.shift||'morning',
    status:row.status||'active',isActive:row.isActive===true,createdAt:row.createdAt};
}
module.exports={hospitalDTO,doctorDTO,staffDTO,hospitalSummary};
