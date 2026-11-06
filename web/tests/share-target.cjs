const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const Module = require('node:module');
const ts = require('typescript');
const Database = require('better-sqlite3');
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'erp-share-'));
process.env.DATABASE_URL = 'file:' + path.join(temp, 'test.db');
process.env.DOCUMENTS_DIR = path.join(temp, 'documents');
process.env.SMTP_ENCRYPTION_KEY = crypto.randomBytes(32).toString('hex');
const fixture = new Database(process.env.DATABASE_URL.slice(5));
fixture.exec(fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8'));
fixture.prepare("INSERT INTO Company (id, name, code, vatCode, currencyCode, isDefault, createdAt, updatedAt) VALUES (1, 'UAB Pirkėjas', '111111111', 'LT111111119', 'EUR', 1, datetime('now'), datetime('now'))").run();
fixture.close();
const realLoad = Module._load;
Module._load = function (name, parent, isMain) {
  if (name === 'next/headers') return { cookies: async () => ({ get: () => undefined }) };
  if (name === 'next/navigation') return { redirect: url => { throw new Error('redirect:' + url); } };
  if (name.startsWith('@/')) name = path.join(__dirname, '../src', name.slice(2));
  return realLoad.call(this, name, parent, isMain);
};
require.extensions['.ts'] = (mod, filename) => mod._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText, filename);
const share = require('../src/lib/share-target.ts');
const rec = require('../src/lib/purchase-recognition.ts');

const pdf = () => new File([Buffer.from('%PDF-1.4 ' + crypto.randomUUID())], 'kvitas.pdf', { type: 'application/pdf' });
const realDeps = (recognized = []) => ({ store: input => rec.storeDocument(1, input), recognize: async id => { recognized.push(id); } });

test('one shared file is stored as an upload from the sender, recognised and opened on its review page', async () => {
  const recognized = [];
  const result = await share.processSharedFiles([pdf()], 'jonas@example.org', realDeps(recognized));
  assert.equal(result.stored.length, 1);
  assert.equal(result.location, `/purchase-documents/${result.stored[0]}`);
  assert.deepEqual(recognized, result.stored);
  const row = rec.getDocument(1, result.stored[0]);
  assert.equal(row.source, 'UPLOAD');
  assert.equal(row.sender, 'jonas@example.org');
  assert.equal(row.status, 'NEW');
});

test('several files go to the inbox; recognition is skipped when it is not enabled', async () => {
  const result = await share.processSharedFiles([pdf(), pdf()], 'jonas@example.org', { store: input => rec.storeDocument(1, input), recognize: null });
  assert.equal(result.stored.length, 2);
  assert.equal(result.location, '/purchase-documents');
  assert.deepEqual(result.errors, []);
});

test('a failing file does not stop the others and its message reaches the inbox; a failed recognition is not an error', async () => {
  const bad = new File([Buffer.from('MZ not a document')], 'tool.exe', { type: 'application/octet-stream' });
  const result = await share.processSharedFiles([bad, pdf()], null, { store: input => rec.storeDocument(1, input), recognize: async () => { throw new Error('boom'); } }, m => `[${m.slice(0, 4)}]`);
  assert.equal(result.stored.length, 1);
  assert.equal(result.errors.length, 1);
  assert.match(result.errors[0], /^tool\.exe: \[Pala\]/);
  assert.match(result.location, /^\/purchase-documents\?shareError=tool\.exe/);
  const only = await share.processSharedFiles([bad], null, realDeps());
  assert.match(only.location, /^\/purchase-documents\?shareError=/, 'a single failed file stays in the inbox');
});

test('a file that is already uploaded opens the existing document instead of creating a duplicate', async () => {
  const file = pdf();
  const first = await share.processSharedFiles([file], null, realDeps());
  const again = await share.processSharedFiles([file], null, realDeps());
  assert.equal(again.stored.length, 0);
  assert.equal(again.location, first.location);
});

test('only the files field is used and empty parts are ignored; at most ten files are stored', async () => {
  const form = new FormData();
  form.append('files', pdf()); form.append('files', new File([], 'empty.pdf')); form.append('title', 'x'); form.append('other', pdf());
  assert.equal(share.sharedFilesFrom(form).length, 1);
  const many = Array.from({ length: 12 }, pdf);
  const result = await share.processSharedFiles(many, null, realDeps());
  assert.equal(result.stored.length, share.SHARE_MAX_FILES);
  assert.equal(result.errors.length, 1);
});

test('the manifest declares the share target for the same files the upload accepts', () => {
  const manifest = require('../src/app/manifest.ts').default();
  assert.equal(manifest.display, 'standalone');
  assert.deepEqual(manifest.share_target, { action: '/purchase-documents/share', method: 'POST', enctype: 'multipart/form-data', params: { files: [{ name: 'files', accept: ['application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'] }] } });
  for (const icon of manifest.icons) assert.ok(fs.existsSync(path.join(__dirname, '../public', icon.src)), icon.src);
  assert.ok(manifest.icons.some(i => i.sizes === '192x192') && manifest.icons.some(i => i.sizes === '512x512'));
});

test('the share route answers a request without a session with 303 to the login page and stores nothing', async () => {
  const route = require('../src/app/purchase-documents/share/route.ts');
  const form = new FormData();
  form.append('files', pdf());
  const before = rec.listDocuments(1).length;
  const response = await route.POST(new Request('http://localhost:3200/purchase-documents/share', { method: 'POST', body: form }));
  assert.equal(response.status, 303);
  assert.equal(response.headers.get('location'), '/login?shared=1');
  assert.equal(rec.listDocuments(1).length, before);
  const cross = await route.POST(new Request('http://localhost:3200/purchase-documents/share', { method: 'POST', body: form, headers: { Origin: 'http://evil.example' } }));
  assert.equal(cross.status, 403, 'a cross-origin form post is refused before anything else');
  assert.equal((await route.GET(new Request('http://localhost:3200/purchase-documents/share'))).status, 303);
});

test('the proxy lets only the share POST, the manifest and the icons through without a cookie', () => {
  const { proxy } = require('../src/proxy.ts');
  const { NextRequest } = require('next/server');
  const location = pathname => proxy(new NextRequest('http://localhost:3200' + pathname, { method: 'POST' })).headers.get('location');
  for (const open of ['/purchase-documents/share', '/manifest.webmanifest', '/icons/icon-192.png']) assert.equal(location(open), null, open);
  for (const closed of ['/purchase-documents', '/purchase-documents/share/x', '/purchases', '/']) assert.match(location(closed), /\/login$/, closed);
});

test('the recognition help page exists in every language, is linked from purchases, the inbox and the settings', () => {
  const { helpPages } = require('../src/lib/help/pages.ts');
  const page = helpPages.find(p => p.slug === 'document-recognition');
  assert.ok(page);
  assert.ok(helpPages.find(p => p.slug === 'purchases').related.includes('document-recognition'));
  for (const lang of ['lt', 'ru', 'en']) {
    const text = JSON.stringify(page.text[lang]);
    for (const token of [['console.anthro', 'pic.com'].join(''), 'VE-73', 'e-tar.lt', 'HEIC', '5.5', 'Android']) assert.ok(text.includes(token), `${lang}: ${token}`);
    assert.doesNotMatch(text, new RegExp('dirbtin|искусственн|\\bAI\\b|нейро' + 'сет', 'i'), `${lang}: forbidden wording`);
  }
  assert.match(fs.readFileSync(path.join(__dirname, '../src/app/purchase-documents/DocumentsClient.tsx'), 'utf8'), /help\/document-recognition/);
  assert.match(fs.readFileSync(path.join(__dirname, '../src/components/RecognitionSettingsSection.tsx'), 'utf8'), /help\/document-recognition/);
});
