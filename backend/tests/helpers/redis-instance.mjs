import { spawn, execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import path from 'node:path';
import net from 'node:net';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url), Redis = require('ioredis');

export async function startRedis() {
  const fallback = path.resolve('.test-data/redis-build/portable/Redis-8.10.2-Windows-x64-msys2/redis-server.exe');
  const binary = process.env.MEDIID_TEST_REDIS_BIN || (process.platform === 'win32' ? fallback : 'redis-server');
  if (process.platform === 'win32' && !existsSync(binary)) throw new Error('Real Redis required: set MEDIID_TEST_REDIS_BIN or run scripts/setup-test-redis.ps1');
  const version = execFileSync(binary, ['--version'], { encoding: 'utf8', windowsHide: true, timeout: 10000, maxBuffer: 8192 });
  const lease = net.createServer();
  await new Promise(resolve => lease.listen(0, '127.0.0.1', resolve));
  const port = lease.address().port;
  await new Promise(resolve => lease.close(resolve));
  mkdirSync('.test-data', { recursive: true });
  const root = mkdtempSync(path.resolve('.test-data/redis-synthetic-'));
  const password = randomBytes(32).toString('hex');
  writeFileSync(path.join(root, 'redis.conf'), [
    'bind 127.0.0.1', 'protected-mode yes', 'port ' + port, 'requirepass ' + password,
    'save ""', 'appendonly no', 'logfile ""', 'databases 1'
  ].join('\n') + '\n', { mode: 0o600 });
  // A relative config works for native Redis and MSYS2 Redis on Windows.
  // Passing C:\... to an MSYS2 program is interpreted as an unsupported POSIX path.
  const child = spawn(binary, ['redis.conf'], { cwd: root, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
  let exited = false, output = '';
  const append = value => { output = (output + String(value).replaceAll(password, '[redacted]')).slice(-4096); };
  child.stdout.on('data', append); child.stderr.on('data', append);
  child.on('exit', () => { exited = true; });
  child.on('error', error => { exited = true; append(error.code || 'REDIS_PROCESS_ERROR'); });
  const url = 'redis://:' + password + '@127.0.0.1:' + port + '/0';
  let admin;
  for (let attempt = 0; attempt < 50; attempt++) {
    admin = new Redis(url, { lazyConnect: true, enableOfflineQueue: false, maxRetriesPerRequest: 0, retryStrategy: () => null, connectTimeout: 250 });
    admin.on('error', () => {});
    try { await admin.connect(); await admin.ping(); break; }
    catch {
      admin.disconnect(); admin = null;
      if (exited) break;
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  }
  if (!admin) {
    if (!exited) child.kill();
    throw new Error('Disposable Redis failed to start: ' + output.replaceAll(password, '[redacted]'));
  }
  let stopped = false;
  return { url, version, admin, root, stop: async () => {
    if (stopped) return;
    stopped = true;
    await admin.call('SHUTDOWN', 'NOSAVE').catch(() => {});
    admin.disconnect();
    if (!exited) child.kill();
    await new Promise(resolve => {
      if (exited) return resolve();
      const timer = setTimeout(resolve, 2000);
      child.once('exit', () => { clearTimeout(timer); resolve(); });
    });
  } };
}
