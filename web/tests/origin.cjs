const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');

const realLoad = Module._load;
Module._load = function (name, parent, isMain) {
  if (name === 'next/headers') return { cookies: async () => ({ get: () => undefined }) };
  if (name === 'next/navigation') return { redirect: url => { throw new Error('redirect:' + url); } };
  if (name.startsWith('@/')) name = path.join(__dirname, '../src', name.slice(2));
  return realLoad.call(this, name, parent, isMain);
};
require.extensions['.ts'] = (mod, filename) => mod._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText, filename);
const { checkOrigin } = require('../src/lib/access.ts');

const post = (origin, extra = {}) => checkOrigin(new Request('http://0.0.0.0:3000/api/x', { method: 'POST', headers: { ...(origin ? { Origin: origin } : {}), ...extra } }));
const status = async result => (result ? result.status : 200);

test('the origin check accepts the loopback spellings of the configured address and nothing else', async () => {
  const saved = process.env.APP_ORIGIN;
  try {
    process.env.APP_ORIGIN = 'http://localhost:3200';
    assert.equal(await status(await post('http://localhost:3200')), 200);
    assert.equal(await status(await post('http://127.0.0.1:3200')), 200);
    assert.equal(await status(await post('http://[::1]:3200')), 200);
    assert.equal(await status(await post(null)), 200, 'no Origin header (same-origin tools)');
    assert.equal(await status(await post('http://127.0.0.1:3201')), 403, 'another port');
    assert.equal(await status(await post('https://127.0.0.1:3200')), 403, 'another scheme');
    assert.equal(await status(await post('http://evil.example')), 403);
    assert.equal(await status(await post('http://localhost.evil.example:3200')), 403);
    assert.equal(await status(await post('http://127.0.0.1:3200', { 'Sec-Fetch-Site': 'cross-site' })), 403);
    assert.equal(await status(await post('not a url')), 403);
    assert.equal(await status(await checkOrigin(new Request('http://0.0.0.0:3000/api/x', { method: 'GET', headers: { Origin: 'http://evil.example' } }))), 200, 'reads are not checked');
    // a public address accepts exactly itself
    process.env.APP_ORIGIN = 'https://kontas.example.org';
    assert.equal(await status(await post('https://kontas.example.org')), 200);
    assert.equal(await status(await post('http://127.0.0.1:3200')), 403);
    assert.equal(await status(await post('https://other.example.org')), 403);
  } finally { if (saved === undefined) delete process.env.APP_ORIGIN; else process.env.APP_ORIGIN = saved; }
});
