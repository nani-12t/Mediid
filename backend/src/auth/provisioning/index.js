'use strict';

const { createHash, randomBytes } = require('node:crypto');
const { newPostgresId } = require('../../identifiers/uuid');
const { AuthError } = require('../errors');
const { canonicalEmail, canonicalUid, isInternalId } = require('../identity');

function inputObject(input, allowed) {
  if (!input || typeof input !== 'object' || Array.isArray(input) ||
      Object.keys(input).some(key => !allowed.includes(key))) throw new AuthError('AUTH_INPUT');
}
function internalId(value) {
  if (!isInternalId(value)) throw new AuthError('AUTH_INPUT');
  return value;
}
function actorId(actor) {
  if (!actor || !isInternalId(actor.id)) throw new AuthError('AUTH_FORBIDDEN');
  // Role and ownership are checked authoritatively inside each SQL operation.
  return actor.id;
}
function text(value, maximum) {
  if (typeof value !== 'string' || !value.trim() || value.length > maximum || /[\x00-\x1f\x7f]/.test(value)) throw new AuthError('AUTH_INPUT');
  return value.trim();
}
function primary(value) {
  if (value !== undefined && typeof value !== 'boolean') throw new AuthError('AUTH_INPUT');
  return value === true;
}
function activationDigest(secret) {
  if (typeof secret !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(secret)) throw new AuthError('AUTH_CREDENTIALS');
  return createHash('sha256').update(secret, 'utf8').digest('hex');
}
async function safeOperation(operation) {
  try { return await operation(); }
  catch (error) {
    if (error instanceof AuthError) throw error;
    const code = error?.meta?.code || error?.code;
    if (code === '23505' || code === 'P2002') throw new AuthError('AUTH_CONFLICT');
    if (code === 'P0001') {
      const match = String(error?.meta?.message || error?.message || '').match(/\bAUTH_(FORBIDDEN|INPUT|CONFLICT|CREDENTIALS)\b/);
      if (match) throw new AuthError(match[0]);
    }
    throw new AuthError('AUTH_UNAVAILABLE');
  }
}

class Provisioning {
  constructor(infrastructure, passwords, { activationSeconds = 86400 } = {}) {
    if (!Number.isInteger(activationSeconds) || activationSeconds < 300 || activationSeconds > 604800 || !passwords || typeof passwords.hash !== 'function') throw new AuthError('AUTH_CONFIG');
    this.infrastructure = infrastructure;
    this.passwords = passwords;
    this.activationSeconds = activationSeconds;
  }

  async createDoctor(actor, input) {
    inputObject(input, ['hospitalId', 'email', 'firstName', 'lastName', 'specialization', 'isPrimary']);
    const issuer = actorId(actor), hospital = internalId(input.hospitalId);
    const email = input.email == null ? null : canonicalEmail(input.email);
    const first = text(input.firstName, 100), last = text(input.lastName, 100), specialization = text(input.specialization, 150), isPrimary = primary(input.isPrimary);
    const secret = randomBytes(32).toString('base64url'), digest = activationDigest(secret), expiresAt = new Date(Date.now() + this.activationSeconds * 1000);
    const doctor = newPostgresId(), membership = newPostgresId(), credential = newPostgresId(), audit = newPostgresId();
    return safeOperation(async () => {
      const rows = await this.infrastructure.client.$queryRaw`
        SELECT * FROM public.mediid_provision_doctor(${issuer}::uuid,${hospital}::uuid,${doctor}::uuid,
          ${membership}::uuid,${credential}::uuid,${audit}::uuid,${email}::text,${first}::text,${last}::text,
          ${specialization}::text,${isPrimary}::boolean,${digest}::text,${expiresAt}::timestamptz)`;
      if (rows.length !== 1) throw new AuthError('AUTH_UNAVAILABLE');
      // Only the authenticated and database-authorized issuer receives this secret.
      // Store/deliver it securely; never log this response or expose it via /me.
      return { doctor: { id: rows[0].doctor_id, uid: rows[0].uid, hospitalId: rows[0].hospital_id }, activation: { secret, expiresAt } };
    });
  }

  async addMembership(actor, input) {
    inputObject(input, ['doctorId', 'hospitalId', 'isPrimary']);
    const issuer = actorId(actor), doctor = internalId(input.doctorId), hospital = internalId(input.hospitalId), isPrimary = primary(input.isPrimary);
    return safeOperation(async () => {
      const rows = await this.infrastructure.client.$queryRaw`
        SELECT * FROM public.mediid_add_doctor_membership(${issuer}::uuid,${hospital}::uuid,${doctor}::uuid,
          ${newPostgresId()}::uuid,${newPostgresId()}::uuid,${isPrimary}::boolean)`;
      if (rows.length !== 1) throw new AuthError('AUTH_UNAVAILABLE');
      return { membership: { id: rows[0].id, doctorId: rows[0].doctor_id, hospitalId: rows[0].hospital_id, isPrimary: rows[0].is_primary } };
    });
  }

  async removeMembership(actor, membershipId) {
    const issuer = actorId(actor), membership = internalId(membershipId);
    return safeOperation(async () => {
      const rows = await this.infrastructure.client.$queryRaw`
        SELECT public.mediid_remove_doctor_membership(${issuer}::uuid,${membership}::uuid,${newPostgresId()}::uuid) AS removed`;
      if (rows[0]?.removed !== true) throw new AuthError('AUTH_UNAVAILABLE');
      return { removed: true };
    });
  }

  async activateDoctor(input) {
    inputObject(input, ['uid', 'password', 'activationToken']);
    let uid;
    try { uid = canonicalUid(input.uid); } catch { throw new AuthError('AUTH_CREDENTIALS'); }
    const digest = activationDigest(input.activationToken);
    const hash = await this.passwords.hash(input.password);
    return safeOperation(async () => {
      const rows = await this.infrastructure.client.$queryRaw`
        SELECT public.mediid_activate_doctor(${uid}::text,${digest}::text,${hash}::text,
          ${newPostgresId()}::uuid,${newPostgresId()}::uuid) AS activated`;
      if (rows[0]?.activated !== true) throw new AuthError('AUTH_CREDENTIALS');
      return { message: 'Doctor activated.' };
    });
  }

  async linkStaff(actor, input) {
    inputObject(input, ['staffId', 'userId', 'hospitalId']);
    const issuer = actorId(actor), staff = internalId(input.staffId), user = internalId(input.userId), hospital = internalId(input.hospitalId);
    return safeOperation(async () => {
      const rows = await this.infrastructure.client.$queryRaw`
        SELECT * FROM public.mediid_link_hospital_staff(${issuer}::uuid,${hospital}::uuid,${staff}::uuid,
          ${user}::uuid,${newPostgresId()}::uuid)`;
      if (rows.length !== 1) throw new AuthError('AUTH_UNAVAILABLE');
      return { staff: { id: rows[0].id, userId: rows[0].user_id, hospitalId: rows[0].hospital_id } };
    });
  }
}

module.exports = { Provisioning, activationDigest };
