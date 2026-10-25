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
        return id === this.config.keyId ? this.config.publicKey : this.config.previousPublicKeys?.[id];
    }
}
class AccessTokens {
    config;
    keys;
    constructor(config, keys = new ActiveSigningKey(config)){
        this.config = config;
        this.keys = keys;
    }
    issue(principal, session) {
        if (!isInternalId(principal.id) || !roles.includes(principal.role)) throw new AuthError('AUTH_TOKEN');
        if (session && (!isInternalId(session.sid) || !isInternalId(session.jti) || !Number.isSafeInteger(session.ver) || session.ver < 0)) throw new AuthError('AUTH_TOKEN');
        const key = this.keys.active();
        return jwt.sign({
            role: principal.role, ...(session ? {sid:session.sid,jti:session.jti,ver:session.ver} : {})
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
            const session = ['sid','jti','ver'].some(key => key in claims);
            if (session && (!isInternalId(claims.sid) || !isInternalId(claims.jti) || !Number.isSafeInteger(claims.ver) || claims.ver < 0)) throw new Error();
            return Object.freeze({
                ...(session ? {sid:claims.sid,jti:claims.jti,ver:claims.ver} : {}),
                id: claims.sub,
                role: claims.role
            });
        } catch  {
            throw new AuthError('AUTH_TOKEN');
        }
    }
}

module.exports = { ActiveSigningKey, AccessTokens };
