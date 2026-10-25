'use strict';
const { OrganizationError } = require('../errors');
const { Organizations } = require('../services');
function organizationMode(env=process.env) {
  if(!['legacy','postgres'].includes(env.ORGANIZATION_BACKEND))throw new OrganizationError('ORG_CONFIG');
  return env.ORGANIZATION_BACKEND;
}
function createOrganizationRuntime(authRuntime,env=process.env) {
  const mode=organizationMode(env);
  if(mode==='legacy')return {mode};
  if(authRuntime?.mode!=='postgres')throw new OrganizationError('ORG_CONFIG');
  return {mode,service:new Organizations(authRuntime,{clientUrl:env.CLIENT_URL||authRuntime.http.origins[0]})};
}
module.exports={organizationMode,createOrganizationRuntime};
