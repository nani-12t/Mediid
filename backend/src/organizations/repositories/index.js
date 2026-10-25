'use strict';
const { Prisma } = require('@prisma/client');
const HOSPITAL = Prisma.raw(`h.id,h.user_id AS "userId",h.clinic_owner_doctor_id AS "clinicOwnerDoctorId",h.uid,h.name,
 h.registration_number AS "registrationNumber",h.type,h.street,h.city,h.state,h.pincode,h.country,h.latitude,h.longitude,
 h.contact_phone AS "contactPhone",h.contact_email AS "contactEmail",h.website,h.emergency_phone AS "emergencyPhone",
 h.specialties,h.facilities,h.operating_hours AS "operatingHours",h.total_beds AS "totalBeds",h.icu_beds AS "icuBeds",
 h.logo_url AS "logoUrl",h.photos,h.rating_average AS "ratingAverage",h.rating_count AS "ratingCount",
 h.is_verified AS "isVerified",h.is_active AS "isActive",h.created_at AS "createdAt",h.updated_at AS "updatedAt",
 l.hospital_mongo_id AS "legacyId"`);
const DOCTOR = Prisma.raw(`d.id,d.user_id AS "userId",d.primary_hospital_id AS "primaryHospitalId",d.uid,d.first_name AS "firstName",
 d.last_name AS "lastName",d.specialization,d.sub_specialties AS "subSpecialties",d.qualifications,d.experience_years AS "experienceYears",
 d.registration_number AS "registrationNumber",d.phone,d.email,d.photo_url AS "photoUrl",d.consultation_fee AS "consultationFee",
 d.expertise,d.languages,d.rating_average AS "ratingAverage",d.rating_count AS "ratingCount",d.status,
 d.is_private_practice AS "isPrivatePractice",d.is_active AS "isActive",d.created_at AS "createdAt",d.updated_at AS "updatedAt",l.doctor_mongo_id AS "legacyId"`);
const camel = row => Object.fromEntries(Object.entries(row).map(([key,value])=>[key.replace(/_([a-z])/g,(_,c)=>c.toUpperCase()),value]));
class OrganizationRepository {
  constructor(infrastructure) { this.infrastructure=infrastructure; }
  get db(){return this.infrastructure.client;}
  async hospitals(filters={}, {limit=100,offset=0,active=true}={}) {
    const conditions=[];
    if(active)conditions.push(Prisma.sql`h.is_active`);
    if(filters.id)conditions.push(Prisma.sql`h.id=${filters.id}::uuid`);
    if(filters.legacyId)conditions.push(Prisma.sql`l.hospital_mongo_id=${filters.legacyId}`);
    if(filters.uid)conditions.push(Prisma.sql`h.uid=${filters.uid}`);
    if(filters.userId)conditions.push(Prisma.sql`h.user_id=${filters.userId}::uuid AND h.type<>'clinic'`);
    if(filters.clinicOwnerDoctorId)conditions.push(Prisma.sql`h.clinic_owner_doctor_id=${filters.clinicOwnerDoctorId}::uuid`);
    if(filters.city)conditions.push(Prisma.sql`strpos(lower(COALESCE(h.city,'')),lower(${filters.city}))>0`);
    if(filters.type)conditions.push(Prisma.sql`h.type::text=${filters.type}`);
    if(filters.rating!==undefined)conditions.push(Prisma.sql`h.rating_average>=${filters.rating}`);
    if(filters.specialty)conditions.push(Prisma.sql`EXISTS(SELECT 1 FROM unnest(h.specialties) s WHERE strpos(lower(s),lower(${filters.specialty}))>0)`);
    if(filters.q)conditions.push(Prisma.sql`(strpos(lower(h.name),lower(${filters.q}))>0 OR strpos(lower(COALESCE(h.city,'')),lower(${filters.q}))>0 OR EXISTS(SELECT 1 FROM unnest(h.specialties) s WHERE strpos(lower(s),lower(${filters.q}))>0))`);
    return this.db.$queryRaw(Prisma.sql`SELECT ${HOSPITAL} FROM public.hospitals h LEFT JOIN public.auth_legacy_links l ON l.user_id=h.user_id WHERE ${conditions.length?Prisma.join(conditions,' AND '):Prisma.sql`true`} ORDER BY h.rating_average*log(10,(h.rating_count+1)::numeric) DESC,h.uid,h.id LIMIT ${limit} OFFSET ${offset}`);
  }
  async doctors(filters={}, {limit=100,offset=0,active=true}={}) {
    const conditions=[];
    if(active)conditions.push(Prisma.sql`d.is_active`);
    if(filters.id)conditions.push(Prisma.sql`d.id=${filters.id}::uuid`);
    if(filters.legacyId)conditions.push(Prisma.sql`l.doctor_mongo_id=${filters.legacyId}`);
    if(filters.uid)conditions.push(Prisma.sql`d.uid=${filters.uid}`);
    if(filters.userId)conditions.push(Prisma.sql`d.user_id=${filters.userId}::uuid`);
    if(filters.hospitalId)conditions.push(Prisma.sql`EXISTS(SELECT 1 FROM public.doctor_hospital_memberships m JOIN public.hospitals h ON h.id=m.hospital_id WHERE m.doctor_id=d.id AND m.hospital_id=${filters.hospitalId}::uuid AND h.is_active)`);
    if(filters.available)conditions.push(Prisma.sql`d.status='available'`);
    if(filters.specialization)conditions.push(Prisma.sql`strpos(lower(d.specialization),lower(${filters.specialization}))>0`);
    if(filters.q)conditions.push(Prisma.sql`(strpos(lower(d.first_name||' '||d.last_name||' '||d.specialization),lower(${filters.q}))>0 OR EXISTS(SELECT 1 FROM unnest(d.expertise) e WHERE strpos(lower(e),lower(${filters.q}))>0))`);
    return this.db.$queryRaw(Prisma.sql`SELECT ${DOCTOR} FROM public.doctors d LEFT JOIN public.auth_legacy_links l ON l.user_id=d.user_id WHERE ${conditions.length?Prisma.join(conditions,' AND '):Prisma.sql`true`} ORDER BY d.rating_average DESC,d.rating_count DESC,d.uid,d.id LIMIT ${limit} OFFSET ${offset}`);
  }
  async memberships(doctorId) {
    return this.db.$queryRaw`SELECT id,doctor_id AS "doctorId",hospital_id AS "hospitalId",is_primary AS "isPrimary",role_title AS "roleTitle" FROM public.doctor_hospital_memberships WHERE doctor_id=${doctorId}::uuid ORDER BY is_primary DESC,hospital_id`;
  }
  async staff(actor,hospitalId) {
    return (await this.db.$queryRaw`SELECT * FROM public.mediid_list_staff(${actor}::uuid,${hospitalId}::uuid)`).map(camel);
  }
  async staffById(actor,hospitalId,id) {
    return (await this.db.$queryRaw`SELECT * FROM public.mediid_get_staff(${actor}::uuid,${hospitalId}::uuid,${id}::uuid)`).map(camel);
  }
  async templateById(actor,id) {
    return (await this.db.$queryRaw`SELECT * FROM public.mediid_get_availability_template(${actor}::uuid,${id}::uuid)`).map(camel);
  }
  async badge(uid) {
    return (await this.db.$queryRaw`SELECT * FROM public.mediid_staff_badge(${uid}::text)`).map(camel);
  }
  async templates(actor) {
    return (await this.db.$queryRaw`SELECT * FROM public.mediid_list_availability_templates(${actor}::uuid)`).map(camel);
  }
}
module.exports={OrganizationRepository,camel};
