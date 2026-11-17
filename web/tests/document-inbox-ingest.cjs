// Direct mail receiving: the Worker stores the raw message in R2 and calls the ingest endpoint, which runs the same pipeline as the IMAP poll.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const path = require('node:path');
const setup = require('./helpers/recognition-env.cjs');
const env = setup('erp-inbox-ingest-');
const { db, pdf } = env;
const inbox = env.src('document-inbox.ts');
const remote = env.src('document-remote.ts');
const route = require(path.join(__dirname, '../src/app/api/internal/document-inbox/ingest/route.ts'));
const KEY = 'k'.repeat(32);
process.env.INTERNAL_BRIDGE_KEY = KEY;

const store = new Map();
remote.setDocumentR2({
  get: key => store.get(key) ?? null, put: (key, data) => { store.set(key, data); }, remove: key => { store.delete(key); },
  size: key => store.get(key)?.length ?? null, list: prefix => [...store].filter(([k]) => k.startsWith(prefix)).map(([key, v]) => ({ key, size: v.length })),
});
const newKey = () => `inbound/2026/11/${crypto.randomUUID()}.eml`;
function mail({ from = 'tiekejas@example.com', headers = [], attachment = true, messageId = crypto.randomUUID() + '@example.com' } = {}) {
  const b = 'B' + crypto.randomUUID().slice(0, 8);
  const lines = [`From: Tiekejas <${from}>`, 'To: saskaitos@apskaita.bugzag.lt', 'Subject: Saskaita', `Message-ID: <${messageId}>`, 'MIME-Version: 1.0', ...headers, `Content-Type: multipart/mixed; boundary="${b}"`, '', `--${b}`, 'Content-Type: text/plain', '', 'Sveiki.'];
  if (attachment) lines.push(`--${b}`, 'Content-Type: application/pdf; name="s.pdf"', 'Content-Transfer-Encoding: base64', 'Content-Disposition: attachment; filename="s.pdf"', '', pdf().toString('base64'));
  lines.push(`--${b}--`, '');
  return Buffer.from(lines.join('\r\n'));
}
const call = (body, headers = { 'x-d1-bridge-key': KEY }) => route.POST(new Request('http://x/api/internal/document-inbox/ingest', { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body) }));
const logOf = companyId => db.prepare('SELECT * FROM DocumentInboxMessage WHERE companyId=? ORDER BY id').all(companyId);
const docs = companyId => db.prepare('SELECT * FROM PurchaseDocument WHERE companyId=?').all(companyId);
const deps = { recognize: null };

test('the ingest endpoint fails closed without the right bridge key', async () => {
  const key = newKey();
  store.set(key, mail());
  assert.equal((await call({ companyId: 1, r2Key: key }, {})).status, 401);
  assert.equal((await call({ companyId: 1, r2Key: key }, { 'x-d1-bridge-key': 'x'.repeat(32) })).status, 401);
  assert.ok(store.has(key));
  const saved = process.env.INTERNAL_BRIDGE_KEY;
  delete process.env.INTERNAL_BRIDGE_KEY;
  assert.equal((await call({ companyId: 1, r2Key: key }, { 'x-d1-bridge-key': '' })).status, 401);
  process.env.INTERNAL_BRIDGE_KEY = saved;
  assert.equal(docs(1).length, 0);
});

test('a message from an allowed sender is processed like an IMAP one, logged as CLOUDFLARE and moved to inbound/processed', async () => {
  inbox.saveInboxSettings(1, { enabled: false, host: '', port: 993, secure: true, username: '', folder: 'INBOX', allowedSenders: 'tiekejas@example.com' });
  const key = newKey();
  store.set(key, mail());
  const res = await call({ companyId: 1, r2Key: key, envelopeFrom: 'tiekejas@example.com', to: 'saskaitos@apskaita.bugzag.lt', receivedAt: new Date().toISOString() });
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { status: 'PROCESSED', outcome: 'IMPORTED' });
  const rows = logOf(1);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].source, 'CLOUDFLARE');
  assert.equal(rows[0].status, 'IMPORTED');
  assert.equal(docs(1).length, 1);
  assert.equal(docs(1)[0].source, 'EMAIL');
  assert.equal(docs(1)[0].sender, 'tiekejas@example.com');
  assert.equal(store.has(key), false);
  assert.ok(store.has(key.replace('inbound/', 'inbound/processed/')));
  // The IMAP path writes the same kind of row with source IMAP (same function).
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM DocumentInboxMessage WHERE source='IMAP'").get().n, 0);
});

test('a re-delivery of the same key or the same Message-ID never duplicates', async () => {
  const messageId = crypto.randomUUID() + '@example.com';
  const raw = mail({ messageId });
  const key = newKey();
  store.set(key, raw);
  const before = docs(1).length;
  assert.equal((await inbox.ingestInbound(1, key, remote.rawR2(), deps)).status, 'PROCESSED');
  assert.equal(docs(1).length, before + 1);
  // the same key again (processed copy exists, original gone)
  assert.equal((await inbox.ingestInbound(1, key, remote.rawR2(), deps)).status, 'DUPLICATE');
  // the original still in R2 after a failed move: the log row already exists, nothing is processed twice
  store.set(key, raw);
  assert.equal((await inbox.ingestInbound(1, key, remote.rawR2(), deps)).status, 'DUPLICATE');
  assert.equal(store.has(key), false);
  // the same message under a new key (re-sent by the sender's server)
  const second = newKey();
  store.set(second, raw);
  await inbox.ingestInbound(1, second, remote.rawR2(), deps);
  assert.equal(docs(1).length, before + 1);
  assert.equal((await inbox.ingestInbound(1, newKey(), remote.rawR2(), deps)).status, 'MISSING');
});

test('an unknown sender is refused and logged; a failed DMARC check is refused', async () => {
  const unknown = newKey();
  store.set(unknown, mail({ from: 'nezinomas@evil.example' }));
  const before = docs(1).length;
  assert.deepEqual(await (await call({ companyId: 1, r2Key: unknown })).json(), { status: 'PROCESSED', outcome: 'SKIPPED' });
  const bad = newKey();
  store.set(bad, mail({ headers: ['Authentication-Results: mx.cloudflare.net; dkim=pass; dmarc=fail action=none header.from=example.com'] }));
  assert.deepEqual(await (await call({ companyId: 1, r2Key: bad })).json(), { status: 'PROCESSED', outcome: 'SKIPPED' });
  const good = newKey();
  store.set(good, mail({ headers: ['Authentication-Results: mx.cloudflare.net; dmarc=pass header.from=example.com'] }));
  assert.equal((await (await call({ companyId: 1, r2Key: good })).json()).outcome, 'IMPORTED');
  const rows = logOf(1).filter(r => r.uidValidity === unknown || r.uidValidity === bad);
  assert.equal(rows.length, 2);
  assert.ok(rows.every(r => r.status === 'SKIPPED_SENDER' && r.source === 'CLOUDFLARE'));
  assert.match(rows.find(r => r.uidValidity === unknown).detail, /nežinomas|nevalid|evil\.example|leidžiam/i);
  assert.match(rows.find(r => r.uidValidity === bad).detail, /DMARC/);
  assert.equal(docs(1).length, before + 1);
});

test('bad requests are refused: key outside inbound/, unknown company, wrong body', async () => {
  assert.equal((await call({ companyId: 1, r2Key: 'documents/1/2026/a.pdf' })).status, 400);
  assert.equal((await call({ companyId: 1, r2Key: 'inbound/../db/x.eml' })).status, 400);
  assert.equal((await call({ companyId: 99, r2Key: newKey() })).status, 404);
  assert.equal((await call({ r2Key: newKey() })).status, 400);
});

test('the inbound address of a company comes from INBOUND_ADDRESSES', () => {
  process.env.INBOUND_ADDRESSES = '{"Saskaitos@Apskaita.bugzag.lt": 1, "bad": "x"}';
  assert.equal(inbox.inboundAddressFor(1), 'saskaitos@apskaita.bugzag.lt');
  assert.equal(inbox.inboundAddressFor(2), null);
  assert.ok(inbox.lastInboundAt(1));
  assert.equal(inbox.lastInboundAt(2), null);
  process.env.INBOUND_ADDRESSES = 'not json';
  assert.equal(inbox.inboundAddressFor(1), null);
  delete process.env.INBOUND_ADDRESSES;
});
