'use strict';

const { createHash, randomBytes } = require('node:crypto');
const { AuthError } = require('../errors');

function resetDigest(secret) {
    if (typeof secret !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(secret)) throw new AuthError('AUTH_RESET');
    return createHash('sha256').update(secret, 'utf8').digest('hex');
}
function resetCredential(seconds, now = new Date()) {
    const secret = randomBytes(32).toString('base64url');
    return {
        secret,
        digest: resetDigest(secret),
        expiresAt: new Date(now.getTime() + seconds * 1000)
    };
}

module.exports = { resetDigest, resetCredential };
