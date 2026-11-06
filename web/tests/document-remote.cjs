const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const http = require('node:http');
const { spawn } = require('node:child_process');
const ts = require('typescript');
const setup = require('./helpers/recognition-env.cjs');
const env = setup('erp-doc-r2-');
process.env.DOCUMENTS_DIR = path.join(env.temp, 'documents');
const { rec, db, pdf } = env;
const remote = env.src('document-remote.ts');
const { listDocumentFiles } = env.src('document-files.ts');
const sha = buf => crypto.createHash('sha256').update(buf).digest('hex');
const year = new Date().getUTCFullYear();

// Synchronous in-memory stand-in for the R2 bridge.
function fakeR2() {
  const objects = new Map();
  const calls = [];
  const client = {
    objects, calls, failPut: false,
    size: key => objects.has(key) ? objects.get(key).length : null,
    put(key, data) { calls.push(['put', key]); if (client.failPut) throw new Error('R2 down'); objects.set(key, Buffer.from(data)); },
    get: key => objects.has(key) ? Buffer.from(objects.get(key)) : null,
    remove(key) { calls.push(['remove', key]); objects.delete(key); },
    list: prefix => [...objects].filter(([k]) => k.startsWith(prefix)).map(([key, v]) => ({ key, size: v.length })),
  };
  return client;
}
const wipeLocal = () => fs.rmSync(process.env.DOCUMENTS_DIR, { recursive: true, force: true });

test('store uploads the original to R2 before the row is committed', () => {
  const r2 = fakeR2(); remote.setDocumentR2(r2);
  const buf = pdf('store');
  const row = rec.storeDocument(1, { buffer: buf, fileName: 'a.pdf' });
  assert.equal(row.storagePath, `1/${year}/${sha(buf)}.pdf`);
  assert.deepEqual(r2.get(`documents/${row.storagePath}`), buf);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM PurchaseDocument WHERE id=?').get(row.id).n, 1);
});

test('a failed upload fails the store cleanly: no row, no local file', () => {
  const r2 = fakeR2(); r2.failPut = true; remote.setDocumentR2(r2);
  const buf = pdf('fail');
  assert.throws(() => rec.storeDocument(1, { buffer: buf, fileName: 'b.pdf' }), /R2 down/);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM PurchaseDocument WHERE sha256=?').get(sha(buf)).n, 0);
  assert.equal(fs.existsSync(path.join(process.env.DOCUMENTS_DIR, '1', String(year), `${sha(buf)}.pdf`)), false);
});

test('a missing local file is fetched from R2 and verified', () => {
  const r2 = fakeR2(); remote.setDocumentR2(r2);
  const buf = pdf('lazy');
  const row = rec.storeDocument(1, { buffer: buf, fileName: 'c.pdf' });
  wipeLocal();
  const read = rec.readDocumentFile(1, row.id);
  assert.deepEqual(read.data, buf);
  assert.ok(fs.existsSync(rec.absolutePath(row.storagePath)));
});

test('an object whose SHA-256 does not match is refused and not cached', () => {
  const r2 = fakeR2(); remote.setDocumentR2(r2);
  const buf = pdf('tamper');
  const row = rec.storeDocument(1, { buffer: buf, fileName: 'd.pdf' });
  wipeLocal();
  r2.objects.set(`documents/${row.storagePath}`, Buffer.from('%PDF-1.4 changed'));
  assert.throws(() => rec.readDocumentFile(1, row.id), /SHA-256/);
  assert.equal(fs.existsSync(rec.absolutePath(row.storagePath)), false);
});

test('write-once: an existing R2 object is never overwritten with other content', () => {
  const r2 = fakeR2(); remote.setDocumentR2(r2);
  const rel = `1/${year}/${'a'.repeat(64)}.pdf`;
  r2.objects.set(`documents/${rel}`, Buffer.from('original'));
  remote.remotePut(rel, Buffer.from('original'));
  assert.equal(r2.calls.filter(c => c[0] === 'put').length, 0);
  assert.throws(() => remote.remotePut(rel, Buffer.from('different content')), /different content/);
  assert.deepEqual(r2.objects.get(`documents/${rel}`), Buffer.from('original'));
});

test('deleting an unconfirmed document deletes its R2 objects too', () => {
  const r2 = fakeR2(); remote.setDocumentR2(r2);
  const row = rec.storeDocument(1, { buffer: pdf('del'), fileName: 'e.pdf' });
  assert.equal(r2.objects.has(`documents/${row.storagePath}`), true);
  rec.deleteDocument(1, row.id);
  assert.equal(r2.objects.has(`documents/${row.storagePath}`), false);
});

test('a visual PDF beside an XML e-invoice is uploaded as well', () => {
  const r2 = fakeR2(); remote.setDocumentR2(r2);
  const xml = Buffer.from(`<?xml version="1.0"?><Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2"><ID>${crypto.randomUUID()}</ID></Invoice>`);
  const visual = pdf('visual');
  const row = rec.storeDocument(1, { buffer: xml, fileName: 'x.xml', visual: { buffer: visual, fileName: 'x.pdf' } });
  assert.equal(r2.objects.has(`documents/${row.storagePath}`), true);
  assert.equal(r2.objects.has(`documents/1/${year}/${sha(visual)}.pdf`), true);
});

test('startup sync uploads local files missing in R2; hydrate fetches files missing locally', async () => {
  const r2 = fakeR2(); remote.setDocumentR2(null);
  const row = rec.storeDocument(1, { buffer: pdf('sync'), fileName: 'f.pdf' });
  remote.setDocumentR2(r2);
  const result = await remote.syncLocalDocumentsToR2(process.env.DOCUMENTS_DIR, listDocumentFiles(process.env.DOCUMENTS_DIR));
  assert.ok(result.uploaded >= 1 && result.failed === 0);
  assert.equal(r2.objects.has(`documents/${row.storagePath}`), true);
  wipeLocal();
  assert.ok(remote.hydrateDocuments(process.env.DOCUMENTS_DIR) >= 1);
  assert.ok(fs.existsSync(rec.absolutePath(row.storagePath)));
});

test('disabled: nothing is uploaded and missing files stay missing', () => {
  remote.setDocumentR2(null);
  assert.equal(remote.documentR2Enabled(), false);
  const row = rec.storeDocument(1, { buffer: pdf('off'), fileName: 'g.pdf' });
  fs.rmSync(rec.absolutePath(row.storagePath));
  assert.equal(remote.ensureLocalFile(process.env.DOCUMENTS_DIR, row.storagePath), false);
  assert.throws(() => rec.readDocumentFile(1, row.id), /ENOENT/);
  delete process.env.APP_ENV; remote.setDocumentR2(undefined);
  assert.equal(remote.documentR2Enabled(), false);
});

test('the bridge client talks to the Worker R2 bridge (get, put, list, delete, 404)', async () => {
  const store = new Map();
  const keys = [];
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://x');
    keys.push(req.headers['x-d1-bridge-key']);
    const chunks = [];
    req.on('data', c => chunks.push(c)).on('end', () => {
      const key = url.searchParams.get('key');
      if (req.method === 'GET' && url.searchParams.has('list')) {
        const prefix = url.searchParams.get('prefix') || '';
        return res.end(JSON.stringify({ objects: [...store].filter(([k]) => k.startsWith(prefix)).map(([k, v]) => ({ key: k, size: v.length })), truncated: false }));
      }
      if (req.method === 'PUT') { store.set(key, Buffer.concat(chunks)); return res.end('{"success":true}'); }
      if (req.method === 'DELETE') { store.delete(key); return res.end('{"success":true}'); }
      if (!store.has(key)) { res.statusCode = 404; return res.end('{}'); }
      res.end(store.get(key));
    });
  });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  // The client blocks on a child process, so it runs in another process while this event loop serves the requests.
  const source = ts.transpileModule(fs.readFileSync(path.join(__dirname, '../src/lib/document-remote.ts'), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
  const child = spawn(process.execPath, [path.join(__dirname, 'helpers', 'bridge-client-run.cjs')], { env: { ...process.env, R2_BRIDGE_URL: `http://127.0.0.1:${server.address().port}/bridge`, INTERNAL_BRIDGE_KEY: 'secret-key', DOCUMENT_REMOTE_JS: source } });
  let out = '', err = '';
  child.stdout.on('data', d => out += d); child.stderr.on('data', d => err += d);
  const code = await new Promise(r => child.on('close', r));
  server.close();
  assert.equal(code, 0, err);
  assert.equal(out.trim(), 'ok');
  assert.ok(keys.length > 0 && keys.every(k => k === 'secret-key'));
});
