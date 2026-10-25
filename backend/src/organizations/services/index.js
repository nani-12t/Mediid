'use strict';
const { randomBytes } = require('node:crypto');
const QRCode = require('qrcode');
const { OrganizationRepository } = require('../repositories');
const { OrganizationError, databaseOperation } = require('../errors');
const v = require('../validation');
const { hospitalDTO, doctorDTO, staffDTO } = require('../dto');
const { newPostgresId } = require('../../identifiers/uuid');
const { isInternalId } = require('../../auth/identity');
const { Provisioning } = require('../../auth/provisioning');

class Organizations {
  constructor(runtime, { clientUrl = 'http://localhost:3000' } = {}) {
    if (!runtime || runtime.mode !== 'postgres' || !runtime.postgres || !runtime.sessions || !runtime.provisioning) throw new OrganizationError('ORG_CONFIG');
    Object.assign(this, { runtime, clientUrl: clientUrl.replace(/\/$/, '') });
    this.repository = new OrganizationRepository(runtime.postgres);
    this.qrCache = new Map();
  }
  get db() { return this.repository.db; }
  async actor(principal, role) {
    if (!principal || !isInternalId(principal.id) || principal.role !== role) throw new OrganizationError('ORG_FORBIDDEN');
    const current = await this.runtime.sessions.repository.byId(principal.id);
    if (!current?.isActive || current.role !== role) throw new OrganizationError('ORG_FORBIDDEN');
    return current;
  }
  async adminScope(principal) {
    await this.actor(principal, 'hospital_admin');
    const rows = await this.repository.hospitals({ userId: principal.id }, { limit: 1 });
    if (rows.length !== 1) throw new OrganizationError('ORG_FORBIDDEN');
    await this.runtime.policies.hospitalAdmin(principal, rows[0].id);
    return rows[0];
  }
  async requireHospital(value, options = {}) {
    const rows = await this.repository.hospitals(v.identifier(value, { ...options, kind: 'hospital' }), { limit: 1 });
    if (rows.length !== 1) throw new OrganizationError('ORG_NOT_FOUND');
    return rows[0];
  }
  async requireDoctor(value, options = {}) {
    const rows = await this.repository.doctors(v.identifier(value, { ...options, kind: 'doctor' }), { limit: 1 });
    if (rows.length !== 1) throw new OrganizationError('ORG_NOT_FOUND');
    return rows[0];
  }
  async qr(type, row) {
    if (row.userId) {
      const profiles = await this.db.$queryRaw`SELECT safe_profile->>'qrCode' AS qr FROM public.auth_profiles WHERE user_id=${row.userId}::uuid AND profile_kind IN ('doctor','hospital_admin')`;
      if (profiles[0]?.qr) return profiles[0].qr;
    }
    const key = type + ':' + row.uid;
    if (this.qrCache.has(key)) return this.qrCache.get(key);
    const promise = QRCode.toDataURL(JSON.stringify({
      uid: row.uid, type: 'mediid_' + type, generatedAt: new Date().toISOString(),
      verifyUrl: this.clientUrl + '/verify/' + type + '/' + row.uid
    }), { width: 400, margin: 2, errorCorrectionLevel: 'H' });
    this.qrCache.set(key, promise);
    if (this.qrCache.size > 500) this.qrCache.delete(this.qrCache.keys().next().value);
    try { return await promise; } catch (error) { this.qrCache.delete(key); throw error; }
  }
  async presentDoctor(row, privateProfile = false) {
    const memberships = [];
    for (const membership of await this.repository.memberships(row.id)) {
      const hospitals = await this.repository.hospitals({ id: membership.hospitalId }, { limit: 1 });
      if (hospitals.length) memberships.push({ ...membership, hospital: hospitals[0] });
    }
    return doctorDTO({
      ...row, memberships, hospital: memberships.find(item => item.isPrimary)?.hospital || memberships[0]?.hospital || null,
      qrCode: await this.qr('doctor', row)
    }, { privateProfile });
  }
  async presentHospital(row, privateProfile = false) {
    const doctors = await this.repository.doctors({ hospitalId: row.id });
    return hospitalDTO({
      ...row, doctors: await Promise.all(doctors.map(doctor => this.presentDoctor(doctor))),
      ...(privateProfile ? { qrCode: await this.qr('hospital', row) } : {})
    }, { privateProfile });
  }
  async searchHospitals(query = {}, { top = false } = {}) {
    const paging = v.pagination(query, ['q','city','specialty','rating','type']);
    const filters = {};
    for (const key of ['q','city','specialty']) if (query[key] !== undefined) filters[key] = v.text(query[key],150);
    if (query.type !== undefined) {
      if (!['government','private','trust','clinic'].includes(query.type)) throw new OrganizationError('ORG_INPUT');
      filters.type = query.type;
    }
    if (query.rating !== undefined) {
      if (typeof query.rating !== 'string' || !/^[0-5](?:\.[0-9]{1,2})?$/.test(query.rating)) throw new OrganizationError('ORG_INPUT');
      filters.rating = v.number(Number(query.rating),0,5);
    }
    const rows = await this.repository.hospitals(filters, top ? { limit: 3, offset: 0 } : paging);
    return Promise.all(rows.map(row => this.presentHospital(row)));
  }
  async hospital(id, options = {}) { return this.presentHospital(await this.requireHospital(id, options)); }
  async adminHospital(actor) { return this.presentHospital(await this.adminScope(actor), true); }
  async updateHospital(actor, input) {
    const patch = v.hospitalInput(input), hospital = await this.adminScope(actor);
    await databaseOperation(() => this.db.$queryRaw`SELECT public.mediid_update_hospital(${actor.id}::uuid,${hospital.id}::uuid,${newPostgresId()}::uuid,${JSON.stringify(patch)}::jsonb)`);
    return this.adminHospital(actor);
  }
  async createClinic(actor, input) {
    await this.actor(actor, 'doctor');
    const payload = v.hospitalInput(input, true), id = newPostgresId(), uid = 'HID-' + randomBytes(4).toString('hex').toUpperCase();
    await databaseOperation(() => this.db.$queryRaw`SELECT public.mediid_create_private_clinic(${actor.id}::uuid,${id}::uuid,${newPostgresId()}::uuid,${newPostgresId()}::uuid,${uid}::text,${JSON.stringify(payload)}::jsonb)`);
    return this.presentHospital(await this.requireHospital(id), true);
  }
  async updateClinic(actor, id, input) {
    await this.actor(actor, 'doctor');
    const row = await this.requireHospital(id), payload = v.hospitalInput(input);
    await databaseOperation(() => this.db.$queryRaw`SELECT public.mediid_update_hospital(${actor.id}::uuid,${row.id}::uuid,${newPostgresId()}::uuid,${JSON.stringify(payload)}::jsonb)`);
    return this.presentHospital(await this.requireHospital(row.id), true);
  }
  async searchDoctors(query = {}, actor) {
    const paging = v.pagination(query,['q','specialization','hospital','available']), filters = {};
    for (const key of ['q','specialization']) if(query[key]!==undefined) filters[key]=v.text(query[key],150);
    if(query.available!==undefined){if(!['true','false'].includes(query.available))throw new OrganizationError('ORG_INPUT');filters.available=query.available==='true';}
    if(query.hospital!==undefined)filters.hospitalId=(await this.requireHospital(query.hospital)).id;
    let privateProfile=false;
    if(actor?.role==='hospital_admin'&&filters.hospitalId) {
      const owned=await this.adminScope(actor);privateProfile=owned.id===filters.hospitalId;
    }
    return Promise.all((await this.repository.doctors(filters,paging)).map(row=>this.presentDoctor(row,privateProfile)));
  }
  async doctor(id, options = {}) { return this.presentDoctor(await this.requireDoctor(id,options)); }
  async managedDoctor(actor,id) {
    const hospital=await this.adminScope(actor),doctor=await this.requireDoctor(id);
    if(!(await this.repository.memberships(doctor.id)).some(item=>item.hospitalId===hospital.id))throw new OrganizationError('ORG_FORBIDDEN');
    return this.presentDoctor(doctor,true);
  }
  async recruitDoctor(actor, input) {
    const payload = v.doctorInput(input,true), hospital = await this.adminScope(actor);
    if(input.hospitalId!==undefined&&(await this.requireHospital(input.hospitalId)).id!==hospital.id)throw new OrganizationError('ORG_FORBIDDEN');
    if(input.isPrimary!==undefined&&typeof input.isPrimary!=='boolean')throw new OrganizationError('ORG_INPUT');
    const result = await databaseOperation(() => this.db.$transaction(async tx => {
      // The reviewed provisioning function owns sequence, membership, credential and audit creation.
      const provisioning = new Provisioning({client:tx},this.runtime.provisioning.passwords,{activationSeconds:this.runtime.provisioning.activationSeconds});
      const created = await provisioning.createDoctor(actor,{
        hospitalId:hospital.id,firstName:payload.firstName,lastName:payload.lastName,specialization:payload.specialization,
        ...(payload.email?{email:payload.email}:{}),isPrimary:input.isPrimary!==false
      });
      const patch={...payload};delete patch.email;
      await tx.$queryRaw`SELECT public.mediid_update_doctor(${actor.id}::uuid,${hospital.id}::uuid,${created.doctor.id}::uuid,${newPostgresId()}::uuid,${JSON.stringify(patch)}::jsonb)`;
      return created;
    },{timeout:15000}));
    return {...await this.presentDoctor(await this.requireDoctor(result.doctor.id),true),activation:result.activation};
  }
  async updateDoctor(actor,id,input) {
    const patch=v.doctorInput(input), hospital=await this.adminScope(actor),doctor=await this.requireDoctor(id);
    await databaseOperation(()=>this.db.$queryRaw`SELECT public.mediid_update_doctor(${actor.id}::uuid,${hospital.id}::uuid,${doctor.id}::uuid,${newPostgresId()}::uuid,${JSON.stringify(patch)}::jsonb)`);
    return this.presentDoctor(await this.requireDoctor(doctor.id),true);
  }
  async removeDoctor(actor,id) {
    const hospital=await this.adminScope(actor),doctor=await this.requireDoctor(id);
    const membership=(await this.repository.memberships(doctor.id)).find(item=>item.hospitalId===hospital.id);
    if(!membership)throw new OrganizationError('ORG_FORBIDDEN');
    await this.runtime.provisioning.removeMembership(actor,membership.id);
    return {message:'Doctor removed'};
  }
  async presentStaff(row,badge=false) {
    const hospital=await this.requireHospital(row.hospitalId);
    return staffDTO({...row,hospital,qrCode:await this.qr('staff',row)},{badge});
  }
  async staffRows(actor) {
    const hospital=await this.adminScope(actor);
    return databaseOperation(()=>this.repository.staff(actor.id,hospital.id));
  }
  async staffList(actor,query={}) {
    const paging=v.pagination(query,['role','status']),rows=await this.staffRows(actor);
    if(query.role!==undefined&&!v.staffRoles.includes(query.role))throw new OrganizationError('ORG_INPUT');
    if(query.status!==undefined)v.text(query.status,20,true);
    return Promise.all(rows.filter(row=>row.isActive&&(!query.role||row.role===query.role)&&(!query.status||row.status===query.status)).slice(paging.offset,paging.offset+paging.limit).map(row=>this.presentStaff(row)));
  }
  async staff(actor,id) {
    const key=v.identifier(id,{kind:'staff'}),hospital=await this.adminScope(actor);
    if(key.legacyId)throw new OrganizationError('ORG_NOT_FOUND');
    const row=(await databaseOperation(()=>this.repository.staffById(actor.id,hospital.id,key.id)))[0];
    if(!row)throw new OrganizationError('ORG_NOT_FOUND');
    return this.presentStaff(row);
  }
  async staffBadge(uid) {
    const key=v.identifier(uid,{uid:true,kind:'staff'}), rows=await databaseOperation(()=>this.repository.badge(key.uid));
    if(rows.length!==1)throw new OrganizationError('ORG_NOT_FOUND');
    return this.presentStaff(rows[0],true);
  }
  async recruitStaff(actor,input) {
    const payload=v.staffInput(input,true),hospital=await this.adminScope(actor),id=newPostgresId();
    if(input.hospitalId!==undefined&&(await this.requireHospital(input.hospitalId)).id!==hospital.id)throw new OrganizationError('ORG_FORBIDDEN');
    await databaseOperation(()=>this.db.$queryRaw`SELECT * FROM public.mediid_recruit_staff(${actor.id}::uuid,${hospital.id}::uuid,${id}::uuid,${newPostgresId()}::uuid,${JSON.stringify(payload)}::jsonb)`);
    return this.staff(actor,id);
  }
  async updateStaff(actor,id,input) {
    const payload=v.staffInput(input),hospital=await this.adminScope(actor),key=v.identifier(id,{kind:'staff'});
    if(key.legacyId)throw new OrganizationError('ORG_NOT_FOUND');
    await databaseOperation(()=>this.db.$queryRaw`SELECT public.mediid_update_staff(${actor.id}::uuid,${hospital.id}::uuid,${key.id}::uuid,${newPostgresId()}::uuid,${JSON.stringify(payload)}::jsonb)`);
    return this.staff(actor,key.id);
  }
  async removeStaff(actor,id) {
    const hospital=await this.adminScope(actor),key=v.identifier(id,{kind:'staff'});
    if(key.legacyId)throw new OrganizationError('ORG_NOT_FOUND');
    await databaseOperation(()=>this.db.$queryRaw`SELECT public.mediid_deactivate_staff(${actor.id}::uuid,${hospital.id}::uuid,${key.id}::uuid,${newPostgresId()}::uuid)`);
    return {message:'Staff member removed'};
  }
  templateDTO(row) {
    return Object.fromEntries(['id','doctorId','hospitalId','dayOfWeek','startTime','endTime','slotDuration','channel','capacityPerSlot','timezone','effectiveFrom','effectiveUntil','isActive','createdAt','updatedAt'].map(key=>[key,row[key]]));
  }
  async templates(actor,query={}) {
    v.object(query,['doctorId','hospitalId']);
    await this.actor(actor,'doctor');
    let rows=(await databaseOperation(()=>this.repository.templates(actor.id))).filter(row=>row.isActive);
    if(query.doctorId!==undefined){const doctor=await this.requireDoctor(query.doctorId);rows=rows.filter(row=>row.doctorId===doctor.id);}
    if(query.hospitalId!==undefined){const hospital=await this.requireHospital(query.hospitalId);rows=rows.filter(row=>row.hospitalId===hospital.id);}
    return rows.slice(0,100).map(row=>this.templateDTO(row));
  }
  async saveTemplate(actor,input,id,create) {
    await this.actor(actor,'doctor');
    const payload=v.templateInput(input,create);
    if(payload.doctorId)payload.doctorId=(await this.requireDoctor(input.doctorId)).id;
    if(payload.hospitalId)payload.hospitalId=(await this.requireHospital(input.hospitalId)).id;
    await databaseOperation(()=>this.db.$queryRaw`SELECT public.mediid_save_availability_template(${actor.id}::uuid,${id}::uuid,${newPostgresId()}::uuid,${JSON.stringify(payload)}::jsonb,${create}::boolean)`);
    const row=(await databaseOperation(()=>this.repository.templateById(actor.id,id)))[0];
    if(!row)throw new OrganizationError('ORG_UNAVAILABLE');
    return this.templateDTO(row);
  }
  createTemplate(actor,input){return this.saveTemplate(actor,input,newPostgresId(),true);}
  updateTemplate(actor,id,input){const key=v.identifier(id);if(key.legacyId)throw new OrganizationError('ORG_NOT_FOUND');return this.saveTemplate(actor,input,key.id,false);}
  async removeTemplate(actor,id) {
    await this.actor(actor,'doctor');const key=v.identifier(id);
    if(key.legacyId)throw new OrganizationError('ORG_NOT_FOUND');
    await databaseOperation(()=>this.db.$queryRaw`SELECT public.mediid_deactivate_availability_template(${actor.id}::uuid,${key.id}::uuid,${newPostgresId()}::uuid)`);
    return {message:'Availability template removed'};
  }
}
module.exports={Organizations};
