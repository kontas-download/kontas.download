const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');
const Database = require('better-sqlite3');
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'erp-test-'));
process.env.DATABASE_URL = 'file:' + path.join(temp, 'test.db');
const fixture = new Database(process.env.DATABASE_URL.slice(5));
fixture.exec(fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8'));
fixture.close();
const jar = new Map();
const realLoad = Module._load;
Module._load = function (name, parent, isMain) {
  if (name === 'next/headers') return { cookies: async () => ({ get: key => jar.has(key) ? { value: jar.get(key) } : undefined }) };
  if (name === 'next/navigation') return { redirect: url => { throw new Error('redirect:' + url); } };
  if (name.startsWith('@/')) name = path.join(__dirname, '../src', name.slice(2));
  return realLoad.call(this, name, parent, isMain);
};
require.extensions['.ts'] = (mod, filename) => mod._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true, resolveJsonModule: true } }).outputText, filename);
const auth = require('../src/lib/auth.ts');
const { getDb } = require('../src/lib/db.ts');
const update = require('../src/lib/update-check.ts');
const route = require('../src/app/api/system/update/route.ts');
const version = require('../package.json').version;

const realFetch = global.fetch;
let calls = 0;
const feed = body => { global.fetch = async () => { calls++; return new Response(typeof body === 'string' ? body : JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } }); }; };
const bump = v => v.split('.').map((n, i) => (i === 1 ? Number(n) + 1 : i === 2 ? 0 : Number(n))).join('.');

test('compareVersions orders x.y.z numerically', () => {
  assert.ok(update.compareVersions('0.10.0', '0.9.9') > 0);
  assert.ok(update.compareVersions('1.0.0', '0.99.99') > 0);
  assert.equal(update.compareVersions('0.3.0', '0.3.0'), 0);
  assert.ok(update.compareVersions('0.3.0', '0.3.1') < 0);
});

test('update check: newer version reported, links validated, result cached, force re-checks', async () => {
  process.env.UPDATE_FEED_URL = 'https://kontas.download/latest.json';
  delete process.env.UPDATE_CHECK;
  update.resetUpdateCache(); calls = 0;
  const next = bump(version);
  feed({ version: next, url: 'files/kontas-download-' + next + '.zip', sha256: 'a'.repeat(64), notes: 'javascript:alert(1)' });
  const status = await update.checkForUpdate();
  assert.equal(status.current, version);
  assert.equal(status.latest, next);
  assert.equal(status.available, true);
  assert.equal(status.downloadUrl, `https://kontas.download/files/kontas-download-${next}.zip`, 'relative url resolved against the feed');
  assert.equal(status.notesUrl, null, 'non-https links are dropped');
  await update.checkForUpdate();
  assert.equal(calls, 1, 'second call served from cache');
  feed({ version });
  const same = await update.checkForUpdate({ force: true });
  assert.equal(calls, 2);
  assert.equal(same.available, false);
  assert.equal(same.error, null);
});

test('update check: broken feed, network error and UPDATE_CHECK=off never throw', async () => {
  update.resetUpdateCache();
  feed('{"version":"latest"}');
  assert.equal((await update.checkForUpdate()).error, 'invalid feed');
  update.resetUpdateCache();
  global.fetch = async () => { throw new Error('offline'); };
  const offline = await update.checkForUpdate();
  assert.equal(offline.available, false);
  assert.equal(offline.error, 'offline');
  process.env.UPDATE_CHECK = 'off';
  calls = 0; feed({ version: '99.0.0' });
  const off = await update.checkForUpdate({ force: true });
  assert.equal(off.disabled, true);
  assert.equal(calls, 0, 'disabled: nothing is fetched');
  delete process.env.UPDATE_CHECK;
});

test('update API is for administrators only', async () => {
  const db = getDb();
  db.prepare("INSERT INTO User(id,email,name,passwordHash,role,createdAt) VALUES(1,'admin@example.test','A','x','admin',datetime('now')),(2,'acc@example.test','B','x','accountant',datetime('now'))").run();
  update.resetUpdateCache();
  feed({ version: bump(version) });
  assert.equal((await route.GET(new Request('http://localhost:3000/api/system/update'))).status, 401);
  jar.set('auth_session', auth.createSessionToken({ id: 2 }));
  assert.equal((await route.GET(new Request('http://localhost:3000/api/system/update'))).status, 403);
  jar.set('auth_session', auth.createSessionToken({ id: 1 }));
  const res = await route.GET(new Request('http://localhost:3000/api/system/update?force=1'));
  assert.equal(res.status, 200);
  assert.equal((await res.json()).available, true);
  global.fetch = realFetch;
});
