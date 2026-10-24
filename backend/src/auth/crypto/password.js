'use strict';

const bcrypt = require('bcryptjs');
const { randomBytes } = require('node:crypto');
const { AuthError } = require('../errors');

class PasswordHasher {
    cost;
    dummy;
    constructor(cost, dummy){
        this.cost = cost;
        this.dummy = dummy;
    }
    static async create(cost) {
        if (!Number.isInteger(cost) || cost < 12 || cost > 14) throw new AuthError('AUTH_CONFIG');
        return new PasswordHasher(cost, await bcrypt.hash(randomBytes(32).toString('hex'), cost));
    }
    async hash(password) {
        if (typeof password !== 'string' || password.length < 12 || Buffer.byteLength(password, 'utf8') > 72 || password.includes('\0')) throw new AuthError('AUTH_INPUT');
        return bcrypt.hash(password, this.cost);
    }
    async verify(password, storedHash) {
        const usable = typeof password === 'string' && Buffer.byteLength(password, 'utf8') <= 1024;
        const validHash = typeof storedHash === 'string' && /^\$2[aby]\$\d{2}\$[./A-Za-z0-9]{53}$/.test(storedHash) && bcrypt.getRounds(storedHash) >= 4 && bcrypt.getRounds(storedHash) <= 16;
        // Unknown, inactive and wrong-password paths each perform one comparison.
        const match = await bcrypt.compare(usable ? password : 'invalid-input', validHash ? storedHash : this.dummy);
        return usable && validHash && match;
    }
}

module.exports = { PasswordHasher };
