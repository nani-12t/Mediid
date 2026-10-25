'use strict';

// Explicit operator-only reconciliation. This module is never loaded at startup.
const { createHash } = require('node:crypto');
const { v5 } = require('uuid');
const { canonicalEmail, canonicalUid, roles } = require('../identity');
const { mongoObjectIdToUuid, MEDIID_MIGRATION_NAMESPACE } = require('../../identifiers/uuid');

class ReconciliationConflict extends Error {
  constructor(code) { super(code); this.code = code; }
}
const reject = code => { throw new ReconciliationConflict(code); };
function objectId(value) {
  if (typeof value !== 'string' || !/^[a-f0-9]{24}$/.test(value)) reject('INVALID_MONGO_ID');
  return value;
}
function publicUid(value, kind) {
  try {
    if (canonicalUid(value) !== value) reject('NONCANONICAL_PUBLIC_UID');
  } catch (error) {
    if (error instanceof ReconciliationConflict) throw error;
    reject('UNSUPPORTED_PUBLIC_UID');
  }
  const patterns = {
    patient: /^MID-[A-Z0-9]+(?:-[A-Z0-9]+)*$/,
    hospital_admin: /^HID-[A-Z0-9]+(?:-[A-Z0-9]+)*$/,
    doctor: /^(?:HID-[A-Z0-9]+(?:-[A-Z0-9]+)*-(?:DOC|SRDOC|JRDOC)-[0-9]+|DOC-[A-Z0-9]+(?:-[A-Z0-9]+)*)$/
  };
  if (patterns[kind] && !patterns[kind].test(value)) reject('UNSUPPORTED_PUBLIC_UID');
  if (value.length > (kind === 'doctor' ? 64 : 32)) reject('UNSUPPORTED_PUBLIC_UID');
  return value;
}
function text(value, maximum) {
  if (typeof value !== 'string' || !value.length || value.length > maximum || value.includes('\0')) reject('INVALID_PROFILE');
  return value;
}
function date(value) {
  const result = value instanceof Date ? value : new Date(value);
  if (value == null || !Number.isFinite(result.getTime())) reject('MISSING_SOURCE_TIME');
  return result;
}
function sequence(value) {
  if (!Number.isInteger(value) || value < 0 || value > 2147483646) reject('INVALID_SOURCE_SEQUENCE');
  return value;
}
function flag(value) {
  if (typeof value !== 'boolean') reject('MISSING_SOURCE_ACTIVE_STATE');
  return value;
}
function stable(value) {
  if (value instanceof Date) return JSON.stringify(value.toISOString());
  if (Array.isArray(value)) return '[' + value.map(stable).join(',') + ']';
  if (value && typeof value === 'object') return '{' + Object.keys(value).sort().map(key => JSON.stringify(key) + ':' + stable(value[key])).join(',') + '}';
  return JSON.stringify(value);
}
const fingerprint = value => createHash('sha256').update(stable(value)).digest('hex');
const relatedId = (kind, ...ids) => v5('auth-migration:' + kind + ':' + ids.join(':'), MEDIID_MIGRATION_NAMESPACE);
function issue(report, code, mongoUserId) {
  const entry = { code };
  if (typeof mongoUserId === 'string' && /^[a-f0-9]{24}$/.test(mongoUserId)) entry.mongoUserId = mongoUserId;
  if (!report.conflicts.some(existing => existing.code === entry.code && existing.mongoUserId === entry.mongoUserId)) report.conflicts.push(entry);
}
function makePlans(snapshot, report) {
  if (!snapshot || ['users', 'patients', 'hospitals', 'doctors'].some(key => !Array.isArray(snapshot[key]))) {
    issue(report, 'INVALID_SNAPSHOT'); return [];
  }
  const profiles = new Map(), sourceIds = new Set();
  for (const [key, kind] of [['patients', 'patient'], ['hospitals', 'hospital_admin'], ['doctors', 'doctor']]) {
    for (const profile of snapshot[key]) {
      try {
        const id = objectId(profile._id), owner = objectId(profile.user);
        if (sourceIds.has(id)) reject('DUPLICATE_SOURCE_ID');
        sourceIds.add(id);
        if (profiles.has(owner)) reject('MULTIPLE_OWNED_PROFILES');
        profiles.set(owner, { source: profile, kind, id });
      } catch (error) { issue(report, error.code || 'INVALID_PROFILE', profile?.user); }
    }
  }
  const plans = [], users = new Set();
  for (const source of snapshot.users) {
    let mongoUserId;
    try {
      mongoUserId = objectId(source._id);
      if (sourceIds.has(mongoUserId) || users.has(mongoUserId)) reject('DUPLICATE_SOURCE_ID');
      users.add(mongoUserId);
      if (!roles.includes(source.role)) reject('UNSUPPORTED_ROLE');
      const email = source.email == null ? null : canonicalEmail(source.email);
      const uid = source.uid == null ? null : publicUid(source.uid, source.role);
      if (!email && !uid) reject('MISSING_LOGIN_IDENTITY');
      if (typeof source.password !== 'string' || !/^\$2[aby]\$(?:0[4-9]|1[0-6])\$[./A-Za-z0-9]{53}$/.test(source.password)) reject('UNSUPPORTED_PASSWORD_HASH');
      if (source.resetPasswordToken != null || source.resetPasswordExpire != null) reject('OUTSTANDING_LEGACY_RESET');
      const owned = profiles.get(mongoUserId);
      if (['patient', 'hospital_admin', 'doctor'].includes(source.role) && (!owned || owned.kind !== source.role)) reject('MISSING_OR_CONFLICTING_PROFILE');
      if (owned && owned.kind !== source.role) reject('PROFILE_ROLE_CONFLICT');
      const user = { id: mongoObjectIdToUuid(mongoUserId), email, uid, passwordHash: source.password,
        role: source.role, isActive: flag(source.isActive), createdAt: date(source.createdAt),
        updatedAt: source.updatedAt == null ? date(source.createdAt) : date(source.updatedAt),
        lastLoginAt: source.lastLogin == null ? null : date(source.lastLogin) };
      let profile = null, safeProfile = {}, hospitalMongoId = null;
      if (owned) {
        const original = owned.source, profileUid = publicUid(original.uid, source.role);
        if (uid && uid !== profileUid) reject('OWNED_PUBLIC_UID_MISMATCH');
        const createdAt = date(original.createdAt);
        profile = { id: mongoObjectIdToUuid(owned.id), userId: user.id, uid: profileUid, createdAt,
          updatedAt: original.updatedAt == null ? createdAt : date(original.updatedAt) };
        safeProfile = { _id: owned.id, legacy_profile_id: owned.id, uid: original.uid };
        if (original.qrCode != null) {
          if (typeof original.qrCode !== 'string') reject('INVALID_QR_REQUIRES_RECONCILIATION');
          safeProfile.qrCode = original.qrCode;
        }
        if (source.role === 'hospital_admin') {
          Object.assign(profile, { name: text(original.name, 255), isActive: flag(original.isActive), doctorSequence: sequence(original.doctorSequence), staffSequence: sequence(original.staffSequence), specialties: [], facilities: [], photos: [] });
          safeProfile.name = original.name;
          safeProfile.isActive = original.isActive;
        } else {
          Object.assign(profile, { firstName: text(original.firstName, 100), lastName: text(original.lastName, 100) });
          Object.assign(safeProfile, { firstName: original.firstName, lastName: original.lastName });
          if (source.role === 'patient') {
            if (original.qrActive != null) profile.qrActive = flag(original.qrActive);
          } else {
            hospitalMongoId = original.hospital == null ? null : objectId(original.hospital);
            if (original.isPrivatePractice != null && typeof original.isPrivatePractice !== 'boolean') reject('INVALID_PRIVATE_PRACTICE_STATE');
            if (!hospitalMongoId && original.isPrivatePractice !== true) reject('INDEPENDENT_DOCTOR_REQUIRES_EXPLICIT_PRACTICE');
            Object.assign(profile, { specialization: text(original.specialization, 150), isActive: flag(original.isActive),
              isPrivatePractice: original.isPrivatePractice === true, primaryHospitalId: hospitalMongoId ? mongoObjectIdToUuid(hospitalMongoId) : null,
              subSpecialties: [], qualifications: [], expertise: [], languages: [] });
            Object.assign(safeProfile, { specialization: original.specialization, isActive: original.isActive,
              isPrivatePractice: profile.isPrivatePractice, hospital: hospitalMongoId });
          }
        }
      }
      const plan = { mongoUserId, user, profile, safeProfile, hospitalMongoId,
        profileMongoId: owned?.id ?? null, fingerprint: null };
      plans.push(plan);
    } catch (error) {
      issue(report, error instanceof ReconciliationConflict ? error.code : 'INVALID_IDENTITY', mongoUserId);
    }
  }
  for (const [owner] of profiles) if (!users.has(owner)) issue(report, 'ORPHAN_PROFILE', owner);
  for (const field of ['email', 'uid']) {
    const values = new Map();
    for (const plan of plans) {
      const value = plan.user[field]; if (!value) continue;
      if (values.has(value)) {
        issue(report, 'SOURCE_' + field.toUpperCase() + '_COLLISION', plan.mongoUserId);
        issue(report, 'SOURCE_' + field.toUpperCase() + '_COLLISION', values.get(value));
      } else values.set(value, plan.mongoUserId);
    }
  }
  const publicIds = new Map();
  for (const plan of plans) {
    if (plan.profile) {
      if (publicIds.has(plan.profile.uid)) {
        issue(report, 'SOURCE_PUBLIC_UID_COLLISION', plan.mongoUserId);
        issue(report, 'SOURCE_PUBLIC_UID_COLLISION', publicIds.get(plan.profile.uid));
      } else publicIds.set(plan.profile.uid, plan.mongoUserId);
    }
    if (plan.hospitalMongoId) {
      const hospital = plans.find(candidate => candidate.user.role === 'hospital_admin' && candidate.profileMongoId === plan.hospitalMongoId);
      if (!hospital) issue(report, 'UNRESOLVED_HOSPITAL_OWNER', plan.mongoUserId);
      else plan.hospitalOwner = { userId: hospital.user.id, mongoUserId: hospital.mongoUserId, profileId: hospital.profile.id };
    }
    plan.fingerprint = fingerprint({ user: plan.user, profile: plan.profile, safeProfile: plan.safeProfile,
      hospitalMongoId: plan.hospitalMongoId, hospitalOwner: plan.hospitalOwner ?? null });
  }
  return plans.sort((a, b) => (a.user.role === 'hospital_admin' ? 0 : 1) - (b.user.role === 'hospital_admin' ? 0 : 1) || a.mongoUserId.localeCompare(b.mongoUserId));
}
async function inspectTarget(db, plan) {
  const links = await db.$queryRaw`
    SELECT user_id::text, mongo_user_id, source_fingerprint
    FROM public.auth_legacy_links WHERE user_id = ${plan.user.id}::uuid OR mongo_user_id = ${plan.mongoUserId}`;
  if (links.length) {
    if (links.length !== 1 || links[0].user_id !== plan.user.id || links[0].mongo_user_id !== plan.mongoUserId) reject('TARGET_LINK_COLLISION');
    if (links[0].source_fingerprint !== plan.fingerprint) reject('SOURCE_CHANGED_REQUIRES_RECONCILIATION');
    return 'skip';
  }
  const conditions = [{ id: plan.user.id }];
  if (plan.user.email) conditions.push({ email: plan.user.email });
  if (plan.user.uid) conditions.push({ uid: plan.user.uid });
  if (await db.user.findFirst({ where: { OR: conditions }, select: { id: true } })) reject('TARGET_IDENTITY_COLLISION');
  if (plan.profile) {
    const repository = { patient: 'patient', hospital_admin: 'hospital', doctor: 'doctor' }[plan.user.role];
    if (await db[repository].findFirst({ where: { OR: [{ id: plan.profile.id }, { uid: plan.profile.uid }, { userId: plan.user.id }] }, select: { id: true } })) reject('TARGET_PROFILE_COLLISION');
  }
  return 'ready';
}
async function commitPlan(db, plan) {
  await db.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${plan.mongoUserId}, 0))::text AS locked`;
  if (await inspectTarget(db, plan) === 'skip') return 'skip';
  if (plan.hospitalOwner) {
    const owner = await db.$queryRaw`
      SELECT u.id FROM public.auth_legacy_links l
      JOIN public.users u ON u.id = l.user_id
      JOIN public.hospitals h ON h.user_id = u.id
      WHERE l.mongo_user_id = ${plan.hospitalOwner.mongoUserId} AND u.id = ${plan.hospitalOwner.userId}::uuid
      AND u.role = 'hospital_admin' AND h.id = ${plan.hospitalOwner.profileId}::uuid`;
    if (owner.length !== 1) reject('UNRESOLVED_HOSPITAL_OWNER');
  }
  await db.user.create({ data: plan.user, select: { id: true } });
  if (plan.profile) {
    const repository = { patient: 'patient', hospital_admin: 'hospital', doctor: 'doctor' }[plan.user.role];
    await db[repository].create({ data: plan.profile, select: { id: true } });
  }
  if (plan.profile) await db.$executeRaw`
    INSERT INTO public.auth_profiles(user_id,profile_kind,public_uid,legacy_profile_id,safe_profile)
    VALUES (${plan.user.id}::uuid,${plan.user.role},${plan.profile?.uid ?? plan.user.uid},
      ${plan.profileMongoId},${JSON.stringify(plan.safeProfile)}::jsonb)`;
  if (plan.hospitalOwner) {
    await db.doctorHospitalMembership.create({ data: { id: relatedId('membership', plan.profileMongoId, plan.hospitalMongoId), doctorId: plan.profile.id,
      hospitalId: plan.hospitalOwner.profileId, isPrimary: true }, select: { id: true } });
    await db.$executeRaw`
      INSERT INTO public.auth_provisioning_audit(id,actor_user_id,action,doctor_id,hospital_id,details)
      VALUES (${relatedId('membership-audit', plan.profileMongoId, plan.hospitalMongoId)}::uuid,
        ${plan.hospitalOwner.userId}::uuid,'legacy_membership_import',${plan.profile.id}::uuid,
        ${plan.hospitalOwner.profileId}::uuid,'{"source":"explicit_legacy_auth_reconciliation","joinedAtBasis":"import_time"}'::jsonb)`;
  }
  await db.$executeRaw`
    INSERT INTO public.auth_legacy_links(user_id,mongo_user_id,patient_mongo_id,doctor_mongo_id,hospital_mongo_id,source_fingerprint)
    VALUES (${plan.user.id}::uuid,${plan.mongoUserId},${plan.user.role === 'patient' ? plan.profileMongoId : null},
      ${plan.user.role === 'doctor' ? plan.profileMongoId : null},
      ${plan.user.role === 'hospital_admin' ? plan.profileMongoId : plan.hospitalMongoId},${plan.fingerprint})`;
  return 'applied';
}
async function reconcileLegacyAuth(prismaClient, snapshot, mode = 'dry-run', options = {}) {
  const report = { mode, status: 'invalid', total: 0, ready: 0, applied: 0, skipped: 0, conflicts: [] };
  if (!['dry-run', 'validate', 'apply'].includes(mode)) { issue(report, 'INVALID_MODE'); return report; }
  const plans = makePlans(snapshot, report); report.total = snapshot?.users?.length ?? 0;
  if (report.conflicts.length) { report.status = 'conflict'; return report; }
  try {
    const credentials = await prismaClient.$queryRaw`SELECT current_user::text AS role`;
    if (credentials.length !== 1 || credentials[0].role !== 'mediid_migrator') {
      issue(report, 'MIGRATOR_CREDENTIAL_REQUIRED'); report.status = 'refused'; return report;
    }
    for (const plan of plans) {
      try {
        const result = await inspectTarget(prismaClient, plan);
        if (result === 'skip') report.skipped++; else report.ready++;
      } catch (error) {
        if (!(error instanceof ReconciliationConflict)) throw error;
        issue(report, error.code, plan.mongoUserId);
      }
    }
    if (report.conflicts.length) { report.status = 'conflict'; return report; }
    if (mode !== 'apply') { report.status = mode === 'validate' ? 'validated' : 'dry-run'; return report; }
    report.skipped = 0;
    for (const plan of plans) {
      try {
        const result = await prismaClient.$transaction(db => commitPlan(db, plan), { timeout: 15000 });
        if (result === 'skip') report.skipped++; else report.applied++;
      } catch (error) {
        issue(report, error instanceof ReconciliationConflict ? error.code : 'APPLY_TRANSACTION_CONFLICT', plan.mongoUserId);
        report.status = 'interrupted'; return report;
      }
      if (options.onCommitted) {
        try { await options.onCommitted({ mongoUserId: plan.mongoUserId, applied: report.applied, skipped: report.skipped }); }
        catch { issue(report, 'OPERATOR_INTERRUPTED'); report.status = 'interrupted'; return report; }
      }
    }
    report.status = 'applied';
    return report;
  } catch {
    issue(report, 'MIGRATION_UNAVAILABLE'); report.status = 'unavailable'; return report;
  }
}

module.exports = { reconcileLegacyAuth };
