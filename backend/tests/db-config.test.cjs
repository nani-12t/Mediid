const test = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const path = require('node:path');
const { connectDB, getMarketplaceConn } = require('../config/db');

test('missing primary URI gives an actionable error for both databases', async () => {
  const previous = { MONGO_URI: process.env.MONGO_URI, MARKETPLACE_URI: process.env.MARKETPLACE_URI };
  delete process.env.MONGO_URI;
  delete process.env.MARKETPLACE_URI;
  try {
    await assert.rejects(connectDB(), /MONGO_URI is required.*backend\/\.env/);
    assert.throws(getMarketplaceConn, /MONGO_URI is required/);
    process.env.MONGO_URI = 'https://invalid.example';
    await assert.rejects(connectDB(), /must start with mongodb/);
    process.env.MARKETPLACE_URI = 'invalid';
    assert.throws(getMarketplaceConn, /MARKETPLACE_URI must start with mongodb/);
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
});

test('server exits before listening when primary URI is absent', () => {
  const result = spawnSync(process.execPath, ['server.js'], {
    cwd: path.resolve(__dirname, '..'),
    env: { ...process.env, MONGO_URI: '', MARKETPLACE_URI: '' },
    encoding: 'utf8', timeout: 10000,
  });
  assert.ifError(result.error);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /MediID startup failed: MONGO_URI is required/);
  assert.doesNotMatch(result.stdout + result.stderr, /Server running|TypeError|UnhandledPromiseRejection/);
});

test('server never reports readiness when MongoDB is unreachable', () => {
  const result = spawnSync(process.execPath, ['server.js'], {
    cwd: path.resolve(__dirname, '..'),
    env: { ...process.env, MONGO_URI: 'mongodb://127.0.0.1:1/mediid', MARKETPLACE_URI: '' },
    encoding: 'utf8', timeout: 15000,
  });
  assert.ifError(result.error);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /MediID startup failed:/);
  assert.doesNotMatch(result.stdout + result.stderr, /Server running|TypeError|UnhandledPromiseRejection/);
});
