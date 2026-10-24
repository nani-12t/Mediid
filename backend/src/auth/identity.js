'use strict';

const { UserRole } = require('@prisma/client');
const { AuthError } = require('./errors');

const roles = Object.freeze(Object.values(UserRole));
function canonicalEmail(value) {
    if (typeof value !== 'string') throw new AuthError('AUTH_INPUT');
    const trimmed = value.trim();
    if (!/^[!-~]+$/.test(trimmed)) throw new AuthError('AUTH_INPUT');
    const email = trimmed.toLowerCase();
    // No provider-specific dot/plus rewrites or Unicode address guessing.
    if (email.length > 255 || !/^[a-z0-9.!#$%&'*+\/=?^_\x60{|}~-]+@[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?\.[a-z]{2,63}$/.test(email)) throw new AuthError('AUTH_INPUT');
    return email;
}
function canonicalUid(value) {
    if (typeof value !== 'string') throw new AuthError('AUTH_INPUT');
    const trimmed = value.trim();
    if (!/^[a-zA-Z0-9]+(?:-[a-zA-Z0-9]+)+$/.test(trimmed) || trimmed.length > 64) throw new AuthError('AUTH_INPUT');
    return trimmed.toUpperCase();
}
function loginIdentity(value) {
    return typeof value === 'string' && value.includes('@') ? {
        email: canonicalEmail(value)
    } : {
        uid: canonicalUid(value)
    };
}
function isInternalId(value) {
    return typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(value);
}

module.exports = { roles, canonicalEmail, canonicalUid, loginIdentity, isInternalId };
