// Real Axios interceptors with a synthetic adapter: no backend or network is contacted.
const token = subject => `header.${btoa(JSON.stringify({ sub: subject, exp: Math.floor(Date.now() / 1000) + 600 }))}.signature`;
const reply = (config, data) => ({ config, data, status: 200, statusText: 'OK', headers: {} });
const deny = (config, status = 401) => Object.assign(new Error('Request denied'), { config, response: { status, data: {} } });
const tick = () => new Promise(resolve => setTimeout(resolve, 0));
const load = () => { let client; jest.isolateModules(() => { client = require('./api'); }); return client; };
const mock = (client, operation = config => reply(config, {}), backend = 'postgres') => {
  const requests = [];
  client.default.defaults.adapter = async config => {
    requests.push(config);
    if (config.url === '/auth/config') return reply(config, { backend });
    if (config.url === '/auth/csrf') return reply(config, { csrfToken: 'synthetic-csrf' });
    return operation(config);
  };
  return requests;
};
beforeEach(() => {
  localStorage.clear(); sessionStorage.clear();
  window.history.replaceState({}, '', '/');
  Object.defineProperty(navigator, 'locks', { configurable: true, value: undefined });
  global.BroadcastChannel = undefined;
});
afterEach(() => jest.restoreAllMocks());

test('Postgres caches its explicit mode, removes old legacy credentials and keeps access in memory', async () => {
  localStorage.setItem('mediid_token', 'old-legacy-token');
  const client = load(); const issued = token('patient');
  const payload = { token: issued, user: { id: 'synthetic-id' }, profile: { uid: 'MID-SYNTHETIC', qrCode: 'preserved-qr' } };
  const requests = mock(client, config => reply(config, config.url === '/auth/login' ? payload : {}));
  expect(await Promise.all([client.getAuthBackend(), client.getAuthBackend()])).toEqual(['postgres', 'postgres']);
  expect((await client.authAPI.login({ email: 'synthetic@example.test', password: 'synthetic-password' })).data).toEqual(payload);
  await client.default.get('/patients/profile');
  expect(requests.filter(request => request.url === '/auth/config')).toHaveLength(1);
  expect(localStorage.getItem('mediid_token')).toBeNull();
  expect(sessionStorage.getItem('mediid_token')).toBeNull();
  const login = requests.find(request => request.url === '/auth/login');
  expect(login.headers['X-Mediid-CSRF']).toBe('synthetic-csrf');
  expect(login.withCredentials).toBe(true);
  expect(requests.at(-1).headers.Authorization).toBe(`Bearer ${issued}`);
});

test('explicit legacy mode preserves local storage without CSRF or refresh requests', async () => {
  const client = load();
  const requests = mock(client, config => reply(config, { token: 'legacy-rs256-token' }), 'legacy');
  await client.authAPI.login({ email: 'legacy@example.test', password: 'synthetic-password' });
  await client.default.get('/patients/profile');
  await expect(client.refreshAuthSession()).rejects.toThrow('Refresh is unavailable');
  expect(localStorage.getItem('mediid_token')).toBe('legacy-rs256-token');
  expect(requests.at(-1).headers.Authorization).toBe('Bearer legacy-rs256-token');
  expect(requests.some(request => ['/auth/csrf', '/auth/refresh'].includes(request.url))).toBe(false);
});

test('invalid backend configuration fails closed before sending legacy credentials', async () => {
  localStorage.setItem('mediid_token', 'legacy-token');
  const client = load(); const requests = mock(client, undefined, 'unexpected');
  await expect(client.default.get('/patients/profile')).rejects.toThrow('Authentication configuration is unavailable');
  expect(requests.map(request => request.url)).toEqual(['/auth/config']);
});

test('concurrent business 401s rotate once and retry with the new access token', async () => {
  const client = load(); const next = token('after');
  const requests = mock(client, async config => {
    if (config.url === '/auth/refresh') { await tick(); return reply(config, { token: next, user: {}, profile: {} }); }
    if (config.headers.Authorization !== `Bearer ${next}`) throw deny(config);
    return reply(config, { ok: true });
  });
  await client.getAuthBackend(); client.saveAuthSession({ token: token('before') });
  const results = await Promise.all([client.default.get('/patients/profile'), client.default.get('/appointments/my')]);
  expect(results.map(result => result.data.ok)).toEqual([true, true]);
  expect(requests.filter(request => request.url === '/auth/refresh')).toHaveLength(1);
});

test('auth failures cannot recurse into refresh and replay rejection clears the primary token', async () => {
  const client = load(); const requests = mock(client, config => { throw deny(config); });
  await client.getAuthBackend(); client.saveAuthSession({ token: token('patient') });
  await expect(client.authAPI.login({ email: 'wrong@example.test', password: 'synthetic-password' })).rejects.toMatchObject({ response: { status: 401 } });
  expect(requests.some(request => request.url === '/auth/refresh')).toBe(false);
  await expect(client.default.get('/patients/profile')).rejects.toMatchObject({ response: { status: 401 } });
  expect(requests.filter(request => request.url === '/auth/refresh')).toHaveLength(1);
  const observer = mock(client); await client.default.get('/patients/profile');
  expect(observer.at(-1).headers.Authorization).toBeUndefined();
});

test('temporary refresh unavailability reports the error without losing the memory token', async () => {
  const client = load(); const current = token('patient');
  mock(client, config => { throw deny(config, config.url === '/auth/refresh' ? 503 : 401); });
  await client.getAuthBackend(); client.saveAuthSession({ token: current });
  await expect(client.default.get('/patients/profile')).rejects.toMatchObject({ response: { status: 503 } });
  const requests = mock(client); await client.default.get('/patients/profile');
  expect(requests.at(-1).headers.Authorization).toBe(`Bearer ${current}`);
});

test('secondary doctor login leaves the admin token intact and cannot refresh the admin cookie', async () => {
  const client = load(); const admin = token('admin'); const doctor = token('doctor');
  const requests = mock(client, config => {
    if (config.url === '/auth/login') return reply(config, { token: doctor, user: { role: 'doctor' }, profile: {} });
    if (config.url.includes('/doctor-portal')) throw deny(config);
    return reply(config, {});
  });
  await client.getAuthBackend(); client.saveAuthSession({ token: admin });
  await client.authAPI.login({ email: 'doctor@example.test', password: 'synthetic-password', refresh: false });
  window.history.replaceState({}, '', '/hospital/doctor-portal'); sessionStorage.setItem('hospital_doctor_token', doctor);
  jest.spyOn(console, 'error').mockImplementation(() => {}); // jsdom has no real navigation.
  await expect(client.default.get('/doctor-portal/queue')).rejects.toMatchObject({ response: { status: 401 } });
  await client.default.get('/hospitals/admin/profile');
  expect(requests.at(-1).headers.Authorization).toBe(`Bearer ${admin}`);
  expect(sessionStorage.getItem('hospital_doctor_token')).toBeNull();
  expect(requests.some(request => request.url === '/auth/refresh')).toBe(false);
  expect(JSON.parse(requests.find(request => request.url === '/auth/login').data).refresh).toBe(false);
  expect(requests.find(request => request.url === '/auth/login').headers.Authorization).toBe(`Bearer ${admin}`);
});

test('logout uses a protected cookie request after local state is cleared', async () => {
  const client = load(); const requests = mock(client);
  await client.getAuthBackend(); client.saveAuthSession({ token: token('patient') });
  const listener = jest.fn(); client.subscribeAuthSession(listener);
  client.clearAuthSession(); await client.authAPI.logout();
  const logout = requests.find(request => request.url === '/auth/logout');
  expect(logout.headers['X-Mediid-CSRF']).toBe('synthetic-csrf');
  expect(logout.headers.Authorization).toBeUndefined(); expect(logout.withCredentials).toBe(true);
  expect(JSON.parse(logout.data)).toEqual({}); expect(listener).toHaveBeenCalledTimes(1);
});

test('two tabs serialize cookie rotation and exchange only short access tokens', async () => {
  const channels = []; const messages = [];
  global.BroadcastChannel = class {
    constructor(name) { this.name = name; channels.push(this); }
    postMessage(data) {
      messages.push(data);
      channels.filter(channel => channel !== this && channel.name === this.name).forEach(channel => setTimeout(() => channel.onmessage?.({ data }), 0));
    }
  };
  let lock = Promise.resolve();
  Object.defineProperty(navigator, 'locks', { configurable: true, value: { request: (_name, operation) => {
    const next = lock.then(operation); lock = next.catch(() => {}); return next;
  } } });
  const first = load(); const second = load(); const issued = token('shared-patient'); let rotations = 0;
  const adapter = config => {
    if (config.url === '/auth/refresh') { rotations += 1; return reply(config, { token: issued, user: {}, profile: { uid: 'MID-SYNTHETIC' } }); }
    if (config.url === '/auth/me') return reply(config, { user: {}, profile: { uid: 'MID-SYNTHETIC' } });
    return reply(config, {});
  };
  mock(first, adapter); mock(second, adapter);
  await Promise.all([first.getAuthBackend(), second.getAuthBackend()]);
  const sessions = await Promise.all([first.refreshAuthSession(), second.refreshAuthSession()]);
  expect(rotations).toBe(1); expect(sessions.map(session => session.data.token)).toEqual([issued, issued]);
  expect(messages.filter(message => message.type === 'access').every(message => Object.keys(message).sort().join(',') === 'token,type')).toBe(true);
  expect(JSON.stringify(messages)).not.toContain('MID-SYNTHETIC');
  first.clearAuthSession(); await tick();
  const requests = mock(second, adapter); await second.default.get('/patients/profile');
  expect(requests.at(-1).headers.Authorization).toBeUndefined();
});

test('logout racing an in-flight sign-in cannot restore memory and waits to revoke its cookie', async () => {
  const client = load(); let completeLogin;
  const requests = mock(client, config => {
    if (config.url === '/auth/login') return new Promise(resolve => { completeLogin = () => resolve(reply(config, { token: token('patient'), user: {}, profile: {} })); });
    return reply(config, {});
  });
  await client.getAuthBackend();
  const login = client.authAPI.login({ email: 'synthetic@example.test', password: 'synthetic-password' });
  const rejectedLogin = expect(login).rejects.toThrow('The authentication session has ended');
  while (!completeLogin) await tick();
  client.clearAuthSession();
  const logout = client.authAPI.logout();
  expect(requests.some(request => request.url === '/auth/logout')).toBe(false);
  completeLogin();
  await rejectedLogin; await logout;
  await client.default.get('/patients/profile');
  expect(requests.at(-1).headers.Authorization).toBeUndefined();
  expect(requests.filter(request => request.url === '/auth/logout')).toHaveLength(1);
});

test('logout racing refresh cannot repopulate memory from a late response', async () => {
  const client = load(); let completeRefresh;
  const requests = mock(client, config => {
    if (config.url === '/auth/refresh') return new Promise(resolve => { completeRefresh = () => resolve(reply(config, { token: token('patient'), user: {}, profile: {} })); });
    return reply(config, {});
  });
  await client.getAuthBackend();
  const refresh = client.refreshAuthSession();
  const rejectedRefresh = expect(refresh).rejects.toThrow('The authentication session has ended');
  while (!completeRefresh) await tick();
  client.clearAuthSession(); const logout = client.authAPI.logout(); completeRefresh();
  await rejectedRefresh; await logout;
  await client.default.get('/patients/profile');
  expect(requests.at(-1).headers.Authorization).toBeUndefined();
});

test('all unsafe auth methods require CSRF, including membership removal', async () => {
  const client = load(); const requests = mock(client);
  await client.default.delete('/auth/provision/memberships/synthetic-id');
  expect(requests.at(-1).headers['X-Mediid-CSRF']).toBe('synthetic-csrf');
});

test('secondary logout revokes only its explicit doctor session and preserves the admin token', async () => {
  const client = load(); const admin = token('admin'); const doctor = token('doctor');
  const requests = mock(client);
  await client.getAuthBackend(); client.saveAuthSession({ token: admin });
  await client.authAPI.logoutSecondary(doctor);
  const logout = requests.find(request => request.url === '/auth/logout');
  expect(JSON.parse(logout.data)).toEqual({ sessionOnly: true });
  expect(logout.headers.Authorization).toBe(`Bearer ${doctor}`);
  expect(logout.headers['X-Mediid-CSRF']).toBe('synthetic-csrf');
  await client.default.get('/hospitals/admin/profile', { _mediidExplicitToken: doctor });
  expect(requests.at(-1).headers.Authorization).toBe(`Bearer ${admin}`);
  expect(requests.some(request => request.url === '/auth/refresh')).toBe(false);
});
