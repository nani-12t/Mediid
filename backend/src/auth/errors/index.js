'use strict';

const responses = {
    AUTH_RATE_LIMIT: {status:429,message:'Too many authentication attempts. Try again later.'},
    AUTH_DOMAIN_NOT_MIGRATED: {status:503,message:'This account is not available in this service yet.'},
    AUTH_CONFIG: {
        status: 503,
        message: 'Authentication is unavailable.'
    },
    AUTH_INPUT: {
        status: 400,
        message: 'Invalid authentication input.'
    },
    AUTH_CREDENTIALS: {
        status: 401,
        message: 'Invalid credentials.'
    },
    AUTH_TOKEN: {
        status: 401,
        message: 'Invalid or expired authentication token.'
    },
    AUTH_CONFLICT: {
        status: 409,
        message: 'Identity cannot be registered.'
    },
    AUTH_FORBIDDEN: {
        status: 403,
        message: 'Access denied.'
    },
    AUTH_UNAVAILABLE: {
        status: 503,
        message: 'Authentication is unavailable.'
    },
    AUTH_RESET: {
        status: 400,
        message: 'Invalid or expired reset credential.'
    }
};
class AuthError extends Error {
    code;
    constructor(code){
        super(responses[code].message);
        this.code = code;
        this.name = 'AuthError';
    }
}
function authResponse(error) {
    const code = error instanceof AuthError ? error.code : 'AUTH_UNAVAILABLE';
    return {
        status: responses[code].status,
        body: {
            code,
            message: responses[code].message
        }
    };
}

module.exports = { AuthError, authResponse };
