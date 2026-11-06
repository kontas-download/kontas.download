// Child process of tests/document-remote.cjs: runs the real bridge client (which itself spawns a node child) against the test server.
const assert = require('node:assert/strict');
const Module = require('node:module');

const mod = new Module('document-remote.js');
mod._compile(process.env.DOCUMENT_REMOTE_JS, 'document-remote.js');
const { bridgeClient } = mod.exports;
assert.equal(bridgeClient.get('documents/none'), null);
bridgeClient.put('documents/1/2026/a.pdf', Buffer.from('hello'));
assert.deepEqual(bridgeClient.get('documents/1/2026/a.pdf'), Buffer.from('hello'));
assert.equal(bridgeClient.size('documents/1/2026/a.pdf'), 5);
assert.equal(bridgeClient.size('documents/1/2026/b.pdf'), null);
assert.deepEqual(bridgeClient.list('documents/'), [{ key: 'documents/1/2026/a.pdf', size: 5 }]);
bridgeClient.remove('documents/1/2026/a.pdf');
assert.equal(bridgeClient.get('documents/1/2026/a.pdf'), null);
console.log('ok');
