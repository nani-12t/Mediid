'use strict';

const jwt = require('jsonwebtoken');
const { AuthError } = require('../errors');
const { isInternalId, roles } = require('../identity');

class ActiveSigningKey {
    config;
    constructor(config){
        this.config = config;
    }
    active() {
        return {
            id: this.config.keyId,
            privateKey: this.config.privateKey
        };
    }
    verificationKey(id) {
        return id === this.config.keyId ? this.config.publicKey : undefined;
    }
}
class AccessTokens {
    config;
    keys;
    constructor(config, keys = new ActiveSigningKey(config)){
        this.config = config;
        this.keys = keys;
    }
    issue(principal) {
        if (!isInternalId(principal.id) || !roles.includes(principal.role)) throw new AuthError('AUTH_TOKEN');
        const key = this.keys.active();
        return jwt.sign({
            role: principal.role
        }, key.privateKey, {
            algorithm: 'RS256',
            keyid: key.id,
            subject: principal.id,
            issuer: this.config.issuer,
            audience: this.config.audience,
            expiresIn: this.config.tokenSeconds,
            notBefore: 0
        });
    }
    verify(token) {
        try {
            if (typeof token !== 'string' || token.length > 4096) throw new Error();
            const decoded = jwt.decode(token, {
                complete: true
            });
            if (!decoded || decoded.header.alg !== 'RS256' || decoded.header.typ !== 'JWT' || typeof decoded.header.kid !== 'string' || Object.keys(decoded.header).some((key)=>![
                    'alg',
                    'typ',
                    'kid'
                ].includes(key))) throw new Error();
            const key = this.keys.verificationKey(decoded.header.kid);
            if (!key) throw new Error();
            const claims = jwt.verify(token, key, {
                algorithms: [
                    'RS256'
                ],
                issuer: this.config.issuer,
                audience: this.config.audience,
                clockTolerance: 0,
                maxAge: this.config.tokenSeconds
            });
            if (typeof claims === 'string' || !isInternalId(claims.sub) || !roles.includes(claims.role) || !Number.isInteger(claims.iat) || !Number.isInteger(claims.exp) || !Number.isInteger(claims.nbf) || claims.iat > Math.floor(Date.now() / 1000) || claims.exp <= claims.iat || claims.exp - claims.iat > this.config.tokenSeconds) throw new Error();
            return Object.freeze({
                id: claims.sub,
                role: claims.role
            });
        } catch  {
            throw new AuthError('AUTH_TOKEN');
        }
    }
}

module.exports = { ActiveSigningKey, AccessTokens };
