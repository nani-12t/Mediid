import {Prisma, PrismaClient} from '@prisma/client';
import {PostgresInfrastructure} from '../../infrastructure/postgres/client';
import {newPostgresId} from '../../identifiers/uuid';
import {AuthError} from '../errors';
const userFields = {id: true, email: true, uid: true, role: true, passwordHash: true, isActive: true} as const;
export type Identity = Prisma.UserGetPayload<{select: typeof userFields}>;
export class IdentityRepository {
  constructor(private readonly infrastructure: PostgresInfrastructure) {}
  private get db(): PrismaClient { return this.infrastructure.client; }
  find(identity: {email: string} | {uid: string}): Promise<Identity | null> {
    return this.db.user.findUnique({where: identity, select: userFields});
  }
  byId(id: string): Promise<Identity | null> { return this.db.user.findUnique({where: {id}, select: userFields}); }
  async registerPatient(email: string, passwordHash: string): Promise<Identity> {
    try {
      // Explicit columns preserve database defaults without broader INSERT grants.
      const rows = await this.db.$queryRaw<Identity[]>`
        INSERT INTO public.users (id,email,password_hash,role,updated_at)
        VALUES (${newPostgresId()}::uuid, ${email}, ${passwordHash}, 'patient', now())
        RETURNING id,email,uid,role::text AS role,password_hash AS "passwordHash",is_active AS "isActive"
      `;
      if (rows.length !== 1) throw new AuthError('AUTH_UNAVAILABLE');
      return rows[0];
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && (error.code === 'P2002' || (error.code === 'P2010' && error.meta?.code === '23505'))) throw new AuthError('AUTH_CONFLICT');
      throw new AuthError('AUTH_UNAVAILABLE');
    }
  }
  async recordLogin(id: string): Promise<void> {
    await this.db.user.update({where: {id}, data: {lastLoginAt: new Date()}, select: {id: true}});
  }
  async saveReset(id: string, digest: string, expiresAt: Date): Promise<void> {
    await this.db.user.update({where: {id}, data: {resetPasswordToken: digest, resetPasswordExpiresAt: expiresAt}, select: {id: true}});
  }
  async consumeReset(digest: string, passwordHash: string, now: Date): Promise<boolean> {
    const result = await this.db.user.updateMany({where: {resetPasswordToken: digest, resetPasswordExpiresAt: {gt: now}, isActive: true},
      data: {passwordHash, resetPasswordToken: null, resetPasswordExpiresAt: null}});
    return result.count === 1;
  }
  patient(id: string) { return this.db.patient.findUnique({where: {id}, select: {id: true, userId: true}}); }
  doctor(id: string) { return this.db.doctor.findUnique({where: {id}, select: {id: true, userId: true, isActive: true, isPrivatePractice: true}}); }
  hospital(id: string) { return this.db.hospital.findUnique({where: {id}, select: {id: true, userId: true, isActive: true}}); }
  membership(doctorId: string, hospitalId: string) {
    return this.db.doctorHospitalMembership.findUnique({where: {doctorId_hospitalId: {doctorId, hospitalId}}, select: {doctorId: true, hospitalId: true}});
  }
  doctorForUser(userId: string) {
    return this.db.doctor.findUnique({where: {userId}, select: {id: true, userId: true, isActive: true, isPrivatePractice: true}});
  }
}
