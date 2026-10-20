import {createServer, Server} from 'node:http';
import {Authentication} from '../services/authentication';
import {AuthorizationPolicies} from '../policies/ownership';
import {AuthError, authResponse} from '../errors';
export function createAuthTestServer(auth: Authentication, policies: AuthorizationPolicies): Server {
  if (process.env.NODE_ENV !== 'test') throw new AuthError('AUTH_CONFIG');
  return createServer(async (request, response) => {
    response.setHeader('Content-Type', 'application/json');
    response.setHeader('Cache-Control', 'no-store');
    const send = (status: number, body: unknown) => { response.writeHead(status); response.end(JSON.stringify(body)); };
    try {
      let body: Record<string, unknown> = {};
      if (request.method === 'POST') {
        const chunks: Buffer[] = []; let bytes = 0;
        for await (const chunk of request) { bytes += chunk.length; if (bytes > 4096) throw new AuthError('AUTH_INPUT'); chunks.push(chunk); }
        try { body = JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { throw new AuthError('AUTH_INPUT'); }
        if (!body || Array.isArray(body) || typeof body !== 'object') throw new AuthError('AUTH_INPUT');
      }
      if (request.method === 'POST' && request.url === '/register') { send(201, await auth.register(body)); return; }
      if (request.method === 'POST' && request.url === '/login') { send(200, await auth.login(body.identity, body.password)); return; }
      const authorization = request.headers.authorization;
      if (!authorization?.startsWith('Bearer ')) throw new AuthError('AUTH_TOKEN');
      const principal = await auth.authenticate(authorization.slice(7));
      if (request.method === 'GET' && request.url === '/me') { send(200, {user: await auth.me(principal)}); return; }
      const match = /^\/(patient|doctor|hospital|membership|clinic)\/([0-9a-f-]+)$/.exec(request.url ?? '');
      if (request.method !== 'GET' || !match) { send(404, {message: 'Not found.'}); return; }
      const checks = {patient: policies.patientSelf.bind(policies), doctor: policies.doctorIdentity.bind(policies), hospital: policies.hospitalScope.bind(policies), membership: policies.doctorHospital.bind(policies), clinic: policies.privateClinic.bind(policies)};
      await checks[match[1] as keyof typeof checks](principal, match[2]);
      send(200, {allowed: true});
    } catch (error) { const safe = authResponse(error); send(safe.status, safe.body); }
  });
}
