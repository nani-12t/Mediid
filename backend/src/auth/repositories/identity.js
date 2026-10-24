'use strict';

const { Prisma } = require('@prisma/client');
const { newPostgresId } = require('../../identifiers/uuid');
const { AuthError } = require('../errors');

const userFields = {
    id: true,
    email: true,
    uid: true,
    role: true,
    passwordHash: true,
    isActive: true
};
class IdentityRepository {
    infrastructure;
    constructor(infrastructure){
        this.infrastructure = infrastructure;
    }
    get db() {
        return this.infrastructure.client;
    }
    find(identity) {
        return this.db.user.findUnique({
            where: identity,
            select: userFields
        });
    }
    byId(id) {
        return this.db.user.findUnique({
            where: {
                id
            },
            select: userFields
        });
    }
    async registerPatient(email, passwordHash) {
        try {
            // Explicit columns preserve database defaults and narrow INSERT grants.
            const rows = await this.db.$queryRaw`
        INSERT INTO public.users (id,email,password_hash,role,updated_at)
        VALUES (${newPostgresId()}::uuid, ${email}, ${passwordHash}, 'patient', now())
        RETURNING id,email,uid,role::text AS role,password_hash AS "passwordHash",is_active AS "isActive"
      `;
            if (rows.length !== 1) throw new AuthError('AUTH_UNAVAILABLE');
            return rows[0];
        } catch (error) {
            if (error instanceof Prisma.PrismaClientKnownRequestError && (error.code === 'P2002' || error.code === 'P2010' && error.meta?.code === '23505')) throw new AuthError('AUTH_CONFLICT');
            throw new AuthError('AUTH_UNAVAILABLE');
        }
    }
    async recordLogin(id) {
        await this.db.user.update({
            where: {
                id
            },
            data: {
                lastLoginAt: new Date()
            },
            select: {
                id: true
            }
        });
    }
    async saveReset(id, digest, expiresAt) {
        await this.db.user.update({
            where: {
                id
            },
            data: {
                resetPasswordToken: digest,
                resetPasswordExpiresAt: expiresAt
            },
            select: {
                id: true
            }
        });
    }
    async consumeReset(digest, passwordHash, now) {
        const result = await this.db.user.updateMany({
            where: {
                resetPasswordToken: digest,
                resetPasswordExpiresAt: {
                    gt: now
                },
                isActive: true
            },
            data: {
                passwordHash,
                resetPasswordToken: null,
                resetPasswordExpiresAt: null
            }
        });
        return result.count === 1;
    }
    patient(id) {
        return this.db.patient.findUnique({
            where: {
                id
            },
            select: {
                id: true,
                userId: true
            }
        });
    }
    doctor(id) {
        return this.db.doctor.findUnique({
            where: {
                id
            },
            select: {
                id: true,
                userId: true,
                isActive: true,
                isPrivatePractice: true
            }
        });
    }
    hospital(id) {
        return this.db.hospital.findUnique({
            where: {
                id
            },
            select: {
                id: true,
                userId: true,
                isActive: true
            }
        });
    }
    membership(doctorId, hospitalId) {
        return this.db.doctorHospitalMembership.findUnique({
            where: {
                doctorId_hospitalId: {
                    doctorId,
                    hospitalId
                }
            },
            select: {
                doctorId: true,
                hospitalId: true
            }
        });
    }
    doctorForUser(userId) {
        return this.db.doctor.findUnique({
            where: {
                userId
            },
            select: {
                id: true,
                userId: true,
                isActive: true,
                isPrivatePractice: true
            }
        });
    }
}

module.exports = { IdentityRepository };
