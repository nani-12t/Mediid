'use strict';

const { resetCredential, resetDigest } = require('../crypto/reset');
const { safeUser } = require('../dto/user');
const { AuthError } = require('../errors');
const { canonicalEmail, loginIdentity } = require('../identity');

const resetResponse = ()=>({
        message: 'If that identity is eligible, reset instructions will be sent.'
    });
class Authentication {
    config;
    repository;
    passwords;
    tokens;
    constructor(config, repository, passwords, tokens){
        this.config = config;
        this.repository = repository;
        this.passwords = passwords;
        this.tokens = tokens;
    }
    async register(input) {
        if (Object.keys(input).some((key)=>![
                'email',
                'password'
            ].includes(key))) throw new AuthError('AUTH_INPUT');
        const email = canonicalEmail(input.email), passwordHash = await this.passwords.hash(input.password);
        const user = await this.repository.registerPatient(email, passwordHash);
        return {
            token: this.tokens.issue(user),
            user: safeUser(user)
        };
    }
    async login(identity, password) {
        let lookup;
        try {
            lookup = loginIdentity(identity);
        } catch {
            // Malformed identities use the same bcrypt/error path as unknown identities.
        }
        const user = lookup ? await this.repository.find(lookup) : null;
        const match = await this.passwords.verify(password, user?.passwordHash ?? null);
        if (!user || !user.isActive || !match) throw new AuthError('AUTH_CREDENTIALS');
        await this.repository.recordLogin(user.id);
        return {
            token: this.tokens.issue(user),
            user: safeUser(user)
        };
    }
    async authenticate(token) {
        const principal = this.tokens.verify(token), current = await this.repository.byId(principal.id);
        if (!current || !current.isActive || current.role !== principal.role) throw new AuthError('AUTH_TOKEN');
        return principal;
    }
    async me(principal) {
        const current = await this.repository.byId(principal.id);
        if (!current || !current.isActive || current.role !== principal.role) throw new AuthError('AUTH_TOKEN');
        return safeUser(current);
    }
    async requestReset(identity, delivery) {
        let email;
        try {
            email = canonicalEmail(identity);
        } catch  {
            return resetResponse();
        }
        const user = await this.repository.find({
            email
        });
        if (user?.isActive && user.email) {
            const reset = resetCredential(this.config.resetSeconds);
            await this.repository.saveReset(user.id, reset.digest, reset.expiresAt);
            // Only the explicit delivery adapter receives the secret; never log or return it.
            await delivery.send(user.email, {
                secret: reset.secret,
                expiresAt: reset.expiresAt
            }).catch(()=>undefined);
        }
        return resetResponse();
    }
    async resetPassword(secret, newPassword) {
        const digest = resetDigest(secret), hash = await this.passwords.hash(newPassword);
        if (!await this.repository.consumeReset(digest, hash, new Date())) throw new AuthError('AUTH_RESET');
        return {
            message: 'Password has been reset.'
        };
    }
}

module.exports = { Authentication };
