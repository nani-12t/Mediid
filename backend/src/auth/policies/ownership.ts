import {IdentityRepository} from '../repositories/identity';
import {AuthError} from '../errors';
import {isInternalId} from '../identity';
import {Principal} from '../tokens';
export class AuthorizationPolicies {
  constructor(private readonly identities: IdentityRepository) {}
  private async actor(principal: Principal, resourceId: string): Promise<void> {
    if (!principal || !isInternalId(principal.id) || !isInternalId(resourceId)) throw new AuthError('AUTH_FORBIDDEN');
    const current = await this.identities.byId(principal.id);
    if (!current?.isActive || current.role !== principal.role) throw new AuthError('AUTH_FORBIDDEN');
  }
  async patientSelf(principal: Principal, patientId: string): Promise<void> {
    await this.actor(principal, patientId);
    const patient = principal.role === 'patient' ? await this.identities.patient(patientId) : null;
    if (!patient || patient.userId !== principal.id) throw new AuthError('AUTH_FORBIDDEN');
  }
  async doctorIdentity(principal: Principal, doctorId: string): Promise<void> {
    await this.actor(principal, doctorId);
    const doctor = principal.role === 'doctor' ? await this.identities.doctor(doctorId) : null;
    if (!doctor?.isActive || doctor.userId !== principal.id) throw new AuthError('AUTH_FORBIDDEN');
  }
  async hospitalAdmin(principal: Principal, hospitalId: string): Promise<void> {
    await this.actor(principal, hospitalId);
    const hospital = principal.role === 'hospital_admin' ? await this.identities.hospital(hospitalId) : null;
    if (!hospital?.isActive || hospital.userId !== principal.id) throw new AuthError('AUTH_FORBIDDEN');
  }
  async doctorHospital(principal: Principal, hospitalId: string): Promise<void> {
    await this.actor(principal, hospitalId);
    const doctor = principal.role === 'doctor' ? await this.identities.doctorForUser(principal.id) : null;
    const hospital = doctor?.isActive ? await this.identities.hospital(hospitalId) : null;
    if (!doctor?.isActive || !hospital?.isActive || !await this.identities.membership(doctor.id, hospitalId)) throw new AuthError('AUTH_FORBIDDEN');
  }
  async hospitalScope(principal: Principal, hospitalId: string): Promise<void> {
    if (principal?.role === 'hospital_admin') return this.hospitalAdmin(principal, hospitalId);
    if (principal?.role === 'doctor') return this.doctorHospital(principal, hospitalId);
    throw new AuthError('AUTH_FORBIDDEN');
  }
  async privateClinic(principal: Principal, doctorId: string): Promise<void> {
    await this.doctorIdentity(principal, doctorId);
    if (!(await this.identities.doctor(doctorId))?.isPrivatePractice) throw new AuthError('AUTH_FORBIDDEN');
  }
  // Support and unprovisioned front-desk identities receive no implied clinical authority.
  // Hospital context checks do not themselves grant permission to read/write EHR records.
}
