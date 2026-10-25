'use strict';

const { AuthError, authResponse } = require('../../auth/errors');
const responses = {
  ORG_CONFIG: [503, 'Provider service configuration is unavailable.'],
  ORG_INPUT: [400, 'Invalid provider input.'],
  ORG_FORBIDDEN: [403, 'Access denied.'],
  ORG_NOT_FOUND: [404, 'Provider record not found.'],
  ORG_CONFLICT: [409, 'Provider operation conflicts with existing state.'],
  ORG_UNAVAILABLE: [503, 'Provider service is unavailable.']
};
class OrganizationError extends Error {
  constructor(code) { super(responses[code][1]); this.code = code; this.name = 'OrganizationError'; }
}
function organizationResponse(error) {
  if (error instanceof AuthError) return authResponse(error);
  const code = error instanceof OrganizationError ? error.code : 'ORG_UNAVAILABLE';
  return { status: responses[code][0], body: { code, message: responses[code][1] } };
}
async function databaseOperation(operation) {
  try { return await operation(); }
  catch (error) {
    if (error instanceof OrganizationError || error instanceof AuthError) throw error;
    const code = error?.meta?.code || error?.code;
    if (code === '23505' || code === 'P2002') throw new OrganizationError('ORG_CONFLICT');
    if (code === 'P0001') {
      const match = String(error?.meta?.message || error?.message || '').match(/\bAUTH_(FORBIDDEN|INPUT|CONFLICT)\b/);
      if (match) throw new OrganizationError('ORG_' + match[1]);
    }
    if (['22P02','22007','22008','22003','23514'].includes(code)) throw new OrganizationError('ORG_INPUT');
    throw new OrganizationError('ORG_UNAVAILABLE');
  }
}
module.exports = { OrganizationError, organizationResponse, databaseOperation };
