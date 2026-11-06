const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const setup = require('./helpers/recognition-env.cjs');
const env = setup('erp-inbox-cron-');
const { db } = env;
const inbox = env.src('document-inbox.ts');
const route = require(path.join(__dirname, '../src/app/api/internal/document-inbox/poll/route.ts'));

test('poll endpoint refuses calls without the right bridge key', async () => {
  process.env.INTERNAL_BRIDGE_KEY = 'k'.repeat(32);
  const call = headers => route.POST(new Request('http://x/api/internal/document-inbox/poll', { method: 'POST', headers }));
  assert.equal((await call({})).status, 401);
  assert.equal((await call({ 'x-d1-bridge-key': 'wrong' })).status, 401);
  assert.equal((await call({ 'x-d1-bridge-key': 'x'.repeat(32) })).status, 401);
  const ok = await call({ 'x-d1-bridge-key': 'k'.repeat(32) });
  assert.equal(ok.status, 200);
  assert.deepEqual(await ok.json(), { mailboxes: 0, failed: 0 });
  delete process.env.INTERNAL_BRIDGE_KEY;
  assert.equal((await call({ 'x-d1-bridge-key': '' })).status, 401);
});

test('the enabled-mailbox marker is published to R2 only on Cloudflare Containers', async () => {
  const realFetch = global.fetch;
  const sent = [];
  global.fetch = async (url, init) => { sent.push({ url: String(url), init }); return new Response('{}', { status: 200 }); };
  try {
    delete process.env.APP_ENV; process.env.R2_BRIDGE_URL = 'https://bridge.test/r2';
    await inbox.publishInboxMarker();
    assert.equal(sent.length, 0);
    process.env.APP_ENV = 'cloudflare-containers'; process.env.INTERNAL_BRIDGE_KEY = 'secret';
    db.prepare("INSERT INTO CompanyDocumentInbox(companyId,enabled,host,port,secure,username,passwordEncrypted,folder,processedFolder,allowedSenders) VALUES(1,1,'imap.test',993,1,'u','x','INBOX','done','')").run();
    await inbox.publishInboxMarker();
    assert.equal(sent.length, 1);
    assert.match(sent[0].url, /key=db%2Fdocument-inbox\.json$/);
    assert.equal(sent[0].init.method, 'PUT');
    assert.equal(sent[0].init.headers['x-d1-bridge-key'], 'secret');
    assert.equal(JSON.parse(sent[0].init.body).enabled, 1);
  } finally {
    global.fetch = realFetch; delete process.env.APP_ENV; delete process.env.R2_BRIDGE_URL; delete process.env.INTERNAL_BRIDGE_KEY;
  }
});
