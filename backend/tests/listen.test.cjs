const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const listen = require('../config/listen');
const close = server => new Promise(resolve => server.close(resolve));

test('listener serves HTTP on its configured port', async () => {
    const server = http.createServer((req, res) => res.end('ready'));
    try {
        const address = await listen(server, 0, '127.0.0.1');
        const response = await fetch('http://127.0.0.1:' + address.port);
        assert.equal(await response.text(), 'ready');
    } finally { await close(server); }
});

test('occupied port rejects clearly and releases startup listeners', async () => {
    const owner = http.createServer((req, res) => res.end('existing app'));
    const duplicate = http.createServer();
    const listenersBefore = { listening: duplicate.listenerCount('listening'), error: duplicate.listenerCount('error') };
    try {
        const { port } = await listen(owner, 0, '127.0.0.1');
        await assert.rejects(listen(duplicate, port, '127.0.0.1'), error => {
            assert.equal(error.code, 'EADDRINUSE');
            assert.match(error.message, /already in use.*backend\/\.env/);
            return true;
        });
        assert.equal(duplicate.listening, false);
        assert.equal(duplicate.listenerCount('listening'), listenersBefore.listening);
        assert.equal(duplicate.listenerCount('error'), listenersBefore.error);
        const response = await fetch('http://127.0.0.1:' + port);
        assert.equal(await response.text(), 'existing app');
    } finally { await close(owner); }
});
