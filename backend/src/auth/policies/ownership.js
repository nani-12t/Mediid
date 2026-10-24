'use strict';

const { AuthError } = require('../errors');
const { isInternalId } = require('../identity');

class AuthorizationPolicies {
    identities;
    constructor(identities){
        this.identities = identities;
    }
    async actor(principal, resourceId) {
        if (!principal || !isInternalId(principal.id) || !isInternalId(resourceId)) throw new AuthError('AUTH_FORBIDDEN');
        const current = await this.identities.byId(principal.id);
        if (!current?.isActive || current.role !== principal.role) throw new AuthError('AUTH_FORBIDDEN');
    }
    async patientSelf(principal, patientId) {
        await this.actor(principal, patientId);
        const patient = principal.role === 'patient' ? await this.identities.patient(patientId) : null;
        if (!patient || patient.userId !== principal.id) throw new AuthError('AUTH_FORBIDDEN');
    }
    async doctorIdentity(principal, doctorId) {
        await this.actor(principal, doctorId);
        const doctor = principal.role === 'doctor' ? await this.identities.doctor(doctorId) : null;
        if (!doctor?.isActive || doctor.userId !== principal.id) throw new AuthError('AUTH_FORBIDDEN');
    }
    async hospitalAdmin(principal, hospitalId) {
        await this.actor(principal, hospitalId);
        const hospital = principal.role === 'hospital_admin' ? await this.identities.hospital(hospitalId) : null;
        if (!hospital?.isActive || hospital.userId !== principal.id) throw new AuthError('AUTH_FORBIDDEN');
    }
    async doctorHospital(principal, hospitalId) {
        await this.actor(principal, hospitalId);
        const doctor = principal.role === 'doctor' ? await this.identities.doctorForUser(principal.id) : null;
        const hospital = doctor?.isActive ? await this.identities.hospital(hospitalId) : null;
        if (!doctor?.isActive || !hospital?.isActive || !await this.identities.membership(doctor.id, hospitalId)) throw new AuthError('AUTH_FORBIDDEN');
    }
    async hospitalScope(principal, hospitalId) {
        if (principal?.role === 'hospital_admin') return this.hospitalAdmin(principal, hospitalId);
        if (principal?.role === 'doctor') return this.doctorHospital(principal, hospitalId);
        throw new AuthError('AUTH_FORBIDDEN');
    }
    async privateClinic(principal, doctorId) {
        await this.doctorIdentity(principal, doctorId);
        if (!(await this.identities.doctor(doctorId))?.isPrivatePractice) throw new AuthError('AUTH_FORBIDDEN');
    }
}

// Support/unprovisioned staff gain no clinical authority from a hospital context.
module.exports = { AuthorizationPolicies };
