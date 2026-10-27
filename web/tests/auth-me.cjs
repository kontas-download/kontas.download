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
const realMailer = require('nodemailer');
const messages = [];
const realLoad = Module._load;
Module._load = function (name, parent, isMain) {
  if (name === 'nodemailer') return { createTransport: () => { const stream = realMailer.createTransport({ streamTransport: true, buffer: true }); return { close: () => stream.close(), sendMail: async mail => { messages.push(mail); return { accepted: [mail.to], rejected: [], messageId: '<test@local>' }; } }; } };
  if (name === 'next/headers') return { cookies: async () => ({ get: key => jar.has(key) ? { value: jar.get(key) } : undefined }) };
  if (name === 'next/navigation') return { redirect: url => { throw new Error('redirect:' + url); } };
  if (name.startsWith('@/')) name = path.join(__dirname, '../src', name.slice(2));
  return realLoad.call(this, name, parent, isMain);
};
require.extensions['.ts'] = (mod, filename) => mod._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText, filename);
const auth = require('../src/lib/auth.ts');
const { getDb } = require('../src/lib/db.ts');
const db = getDb();
const request = (method, body, query = '') => new Request('http://localhost:3000/api/test' + query, { method, headers: { 'Content-Type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}) });
const context = id => ({ params: Promise.resolve({ id: String(id) }) });

const me = require('../src/app/api/auth/me/route.ts');

test('the sidebar profile endpoint returns the signed-in user only', async () => {
  try {
    assert.equal((await me.GET()).status, 401);
    db.prepare("INSERT INTO User(id,email,name,passwordHash,role,createdAt) VALUES(1,'accountant@example.test','Chief Accountant','unused','admin',datetime('now'))").run();
    jar.set('auth_session', auth.createSessionToken({ id: 1 }));
    const response = await me.GET(); assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { name: 'Chief Accountant', email: 'accountant@example.test', role: 'admin' });
    assert.equal(response.headers.get('cache-control'), 'no-store');
    jar.set('auth_session', 'f'.repeat(64)); assert.equal((await me.GET()).status, 401);
  } finally { db.close(); fs.rmSync(temp, { recursive: true, force: true }); }
});
