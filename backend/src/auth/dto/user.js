'use strict';

function safeUser(user) {
    // Explicit allowlist: never spread Prisma records or relations into responses.
    return {
        id: user.id,
        email: user.email,
        uid: user.uid,
        role: user.role
    };
}

module.exports = { safeUser };
