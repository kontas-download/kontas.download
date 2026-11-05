const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const Module = require('node:module');
const ts = require('typescript');
const Database = require('better-sqlite3');
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'erp-inbox-'));
process.env.DATABASE_URL = 'file:' + path.join(temp, 'test.db');
process.env.DOCUMENTS_DIR = path.join(temp, 'documents');
process.env.SMTP_ENCRYPTION_KEY = crypto.randomBytes(32).toString('hex');
const fixture = new Database(process.env.DATABASE_URL.slice(5));
fixture.exec(fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8'));
for (let id = 1; id <= 6; id++) fixture.prepare("INSERT INTO Company (id, name, code, vatCode, currencyCode, isDefault, createdAt, updatedAt) VALUES (?, ?, ?, ?, 'EUR', ?, datetime('now'), datetime('now'))").run(id, 'UAB Pirkėjas ' + id, '11111111' + id, 'LT11111111' + id, id === 1 ? 1 : 0);
fixture.close();
const realLoad = Module._load;
Module._load = function (name, parent, isMain) {
  if (name === 'next/headers') return { cookies: async () => ({ get: () => undefined }) };
  if (name === 'next/navigation') return { redirect: url => { throw new Error('redirect:' + url); } };
  if (name.startsWith('@/')) name = path.join(__dirname, '../src', name.slice(2));
  return realLoad.call(this, name, parent, isMain);
};
require.extensions['.ts'] = (mod, filename) => mod._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText, filename);
const inbox = require('../src/lib/document-inbox.ts');
const rec = require('../src/lib/purchase-recognition.ts');
const { getDb } = require('../src/lib/db.ts');
const { translateServerError } = require('../src/lib/errors.ts');

// ---------- helpers ----------
const uniq = tag => Buffer.from(`${tag} ${crypto.randomUUID()}`);
const pdf = () => Buffer.concat([Buffer.from('%PDF-1.4 '), uniq('pdf')]);
const png = (size = 60_000) => Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), uniq('png'), Buffer.alloc(size)]);
const jpg = () => Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), uniq('jpg'), Buffer.alloc(2000)]);
const heic = () => Buffer.concat([Buffer.from([0, 0, 0, 24]), Buffer.from('ftypheic'), Buffer.alloc(30000)]);
const ubl = () => Buffer.from('<?xml version="1.0"?><Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2"><ID>1</ID></Invoice>');

let counter = 0;
function mail({ from = 'tiekejas@example.com', subject = 'Saskaita', headers = [], atts = [], messageId } = {}) {
  const b = 'BOUNDARY' + counter++;
  const lines = [`From: Tiekejas <${from}>`, 'To: saskaitos@imone.lt', `Subject: ${subject}`, `Message-ID: <${messageId || crypto.randomUUID() + '@example.com'}>`, 'MIME-Version: 1.0', ...headers, `Content-Type: multipart/mixed; boundary="${b}"`, '', `--${b}`, 'Content-Type: text/plain; charset=utf-8', '', 'Sveiki, siunciu saskaita.'];
  for (const a of atts) {
    lines.push(`--${b}`, `Content-Type: ${a.type}; name="${a.name}"`, 'Content-Transfer-Encoding: base64', `Content-Disposition: ${a.inline ? 'inline' : 'attachment'}; filename="${a.name}"`);
    if (a.inline) lines.push(`Content-ID: <${crypto.randomUUID()}@cid>`);
    lines.push('', a.data.toString('base64').replace(/(.{76})/g, '$1\r\n'));
  }
  lines.push(`--${b}--`, '');
  return Buffer.from(lines.join('\r\n'));
}
const att = (name, type, data, extra = {}) => ({ name, type, data, ...extra });

// A fake IMAP server: no network. `messages` are { uid, source, seen }; moves and flags are recorded.
function server({ uidValidity = '100', messages = [], missingFolder = false, failFetchUid = null, connectError = null } = {}) {
  const s = { uidValidity, messages, moved: [], seen: [], created: [], connects: 0, closes: 0, listCalls: [], connectError };
  s.deps = {
    recognize: null,
    connect: async connection => {
      s.connects++;
      s.lastConnection = connection;
      if (s.connectError) throw s.connectError;
      return {
        open: async folder => { if (missingFolder) throw new inbox.InboxError(`Aplankas "${folder}" nerastas pašto dėžutėje.`); return { uidValidity: s.uidValidity }; },
        listUids: async (after, unseenOnly) => { s.listCalls.push({ after, unseenOnly }); return s.messages.filter(m => m.uid > after && (!unseenOnly || !m.seen)).map(m => m.uid); },
        fetchSource: async uid => { if (uid === failFetchUid) throw new Error('connection reset'); return s.messages.find(m => m.uid === uid).source; },
        markDone: async (uid, folder) => { if (folder) s.moved.push([uid, folder]); else s.seen.push(uid); },
        close: async () => { s.closes++; },
      };
    },
  };
  return s;
}
function configure(companyId, overrides = {}) {
  return inbox.saveInboxSettings(companyId, { enabled: true, host: 'imap.example.com', port: 993, secure: true, username: 'saskaitos@imone.lt', password: 'slaptas-123', folder: 'INBOX', processedFolder: '', allowedSenders: 'tiekejas@example.com\n@Partneris.LT', ...overrides });
}
const logOf = companyId => getDb().prepare('SELECT * FROM DocumentInboxMessage WHERE companyId=? ORDER BY uid').all(companyId);
const docs = companyId => getDb().prepare('SELECT * FROM PurchaseDocument WHERE companyId=? ORDER BY id').all(companyId);

// ---------- tests ----------
test('allowed senders: exact address and @domain, case-insensitive; an empty list refuses everyone', async () => {
  configure(1);
  const s = server({ messages: [
    { uid: 1, source: mail({ from: 'Tiekejas@Example.com', atts: [att('a.pdf', 'application/pdf', pdf())] }) },
    { uid: 2, source: mail({ from: 'buhalterija@partneris.lt', atts: [att('b.pdf', 'application/pdf', pdf())] }) },
    { uid: 3, source: mail({ from: 'svetimas@kitas.lt', atts: [att('c.pdf', 'application/pdf', pdf())] }) },
    { uid: 4, source: mail({ from: 'x@sub.partneris.lt', atts: [att('d.pdf', 'application/pdf', pdf())] }) },
  ] });
  const result = await inbox.pollInbox(1, s.deps);
  assert.deepEqual(result, { messages: 4, imported: 2, skipped: 2 });
  assert.deepEqual(logOf(1).map(r => r.status), ['IMPORTED', 'IMPORTED', 'SKIPPED_SENDER', 'SKIPPED_SENDER']);
  assert.equal(docs(1).length, 2);
  assert.ok(inbox.senderAllowed('A@B.lt', ['a@b.lt']) && inbox.senderAllowed('a@b.lt', ['@b.lt']));
  assert.equal(inbox.senderAllowed('a@b.lt', []), false);
  assert.equal(inbox.senderAllowed('a@evilb.lt', ['@b.lt']), false);

  configure(2, { allowedSenders: '' });
  const s2 = server({ messages: [{ uid: 1, source: mail({ atts: [att('e.pdf', 'application/pdf', pdf())] }) }] });
  assert.deepEqual(await inbox.pollInbox(2, s2.deps), { messages: 1, imported: 0, skipped: 1 });
  assert.equal(docs(2).length, 0);
  assert.throws(() => inbox.saveInboxSettings(2, { enabled: false, host: 'h', port: 993, secure: true, username: '', folder: 'INBOX', allowedSenders: 'not an address' }), /Neteisingas siuntėjas/);
});

test('a message the receiving server marked dmarc=fail is refused', async () => {
  configure(3);
  const s = server({ messages: [
    { uid: 1, source: mail({ headers: ['Authentication-Results: mx.example.net; dkim=pass; dmarc=fail action=none header.from=example.com'], atts: [att('a.pdf', 'application/pdf', pdf())] }) },
    { uid: 2, source: mail({ headers: ['Authentication-Results: mx.example.net; dmarc=pass header.from=example.com'], atts: [att('b.pdf', 'application/pdf', pdf())] }) },
  ] });
  const result = await inbox.pollInbox(3, s.deps);
  assert.deepEqual(result, { messages: 2, imported: 1, skipped: 1 });
  const rows = logOf(3);
  assert.equal(rows[0].status, 'SKIPPED_SENDER');
  assert.match(rows[0].detail, /DMARC/);
  assert.equal(docs(3).length, 1);
});

test('PDF and images are stored with source EMAIL and the sender; small inline images, HEIC and XML are handled as specified', async () => {
  configure(4);
  const s = server({ messages: [
    { uid: 1, source: mail({ atts: [att('saskaita.pdf', 'application/pdf', pdf()), att('kvitas.png', 'image/png', png()), att('foto.jpg', 'image/jpeg', jpg()), att('logo.png', 'image/png', png(500), { inline: true })] }) },
    { uid: 2, source: mail({ atts: [att('IMG_1.heic', 'image/heic', heic())] }) },
    { uid: 3, source: mail({ atts: [att('inv.xml', 'application/xml', ubl()), att('irasas.pdf', 'application/pdf', pdf())] }) },
    { uid: 4, source: mail({ atts: [att('inv2.xml', 'application/xml', ubl())] }) },
    { uid: 5, source: mail({ atts: [att('notes.txt', 'text/plain', Buffer.from('nieko'))] }) },
  ] });
  const result = await inbox.pollInbox(4, s.deps);
  assert.equal(result.imported, 2);
  const stored = docs(4);
  assert.equal(stored.length, 4, 'pdf + png + jpg of message 1 and the pdf of message 3; the 500-byte inline logo is ignored');
  for (const d of stored) { assert.equal(d.source, 'EMAIL'); assert.equal(d.sender, 'tiekejas@example.com'); }
  assert.ok(!stored.some(d => d.fileName === 'logo.png'));
  const rows = logOf(4);
  assert.equal(rows[0].status, 'IMPORTED');
  assert.match(rows[1].detail, /HEIC formato nuotraukos nepalaikomos: IMG_1\.heic/);
  assert.equal(rows[1].status, 'NO_ATTACHMENTS');
  assert.match(rows[2].detail, /XML e-sąskaita: importuokite per XML importą/);
  assert.equal(rows[2].status, 'IMPORTED');
  assert.equal(rows[3].status, 'NO_ATTACHMENTS');
  assert.match(rows[3].detail, /XML e-sąskaita/);
  assert.equal(rows[4].status, 'NO_ATTACHMENTS');
  assert.match(translateServerError(rows[1].detail, 'ru'), /HEIC/);
  assert.match(translateServerError('Išsaugota dokumentų: 3', 'en'), /Documents stored: 3/);
});

test('a duplicate attachment is not an error; at most 10 attachments are read per message', async () => {
  configure(5);
  const same = pdf();
  const s = server({ messages: [
    { uid: 1, source: mail({ atts: [att('a.pdf', 'application/pdf', same)] }) },
    { uid: 2, source: mail({ atts: [att('a-again.pdf', 'application/pdf', same)] }) },
    { uid: 3, source: mail({ atts: Array.from({ length: 12 }, (_, i) => att(`f${i}.pdf`, 'application/pdf', pdf())) }) },
  ] });
  await inbox.pollInbox(5, s.deps);
  const rows = logOf(5);
  assert.equal(rows[1].status, 'IMPORTED');
  assert.match(rows[1].detail, /Dublikatas: a-again\.pdf/);
  assert.equal(docs(5).length, 1 + 10);
  assert.match(rows[2].detail, /Per daug priedų/);
});

test('idempotency: the same UID is not processed twice; a changed UIDVALIDITY restarts without duplicates; first run reads only unread mail', async () => {
  configure(6, { allowedSenders: '@example.com' });
  const old = { uid: 1, seen: true, source: mail({ atts: [att('old.pdf', 'application/pdf', pdf())] }) };
  const fresh = { uid: 2, seen: false, source: mail({ atts: [att('fresh.pdf', 'application/pdf', pdf())] }) };
  const s = server({ messages: [old, fresh] });
  await inbox.pollInbox(6, s.deps);
  assert.deepEqual(s.listCalls[0], { after: 0, unseenOnly: true });
  assert.equal(docs(6).length, 1, 'the already read old message is not pulled in on the first run');
  assert.equal(inbox.getInboxSettings(6).lastError, null);
  const row = () => getDb().prepare('SELECT lastUid, lastUidValidity FROM CompanyDocumentInbox WHERE companyId=6').get();
  assert.deepEqual({ ...row() }, { lastUid: 2, lastUidValidity: '100' });
  await inbox.pollInbox(6, s.deps);
  assert.deepEqual(s.listCalls[1], { after: 2, unseenOnly: false });
  assert.equal(logOf(6).length, 1);
  // the server renumbers the mailbox: the same messages come back under new UIDs and the same Message-ID / file hash
  s.uidValidity = '200';
  s.messages = [{ uid: 1, seen: false, source: fresh.source }, { uid: 2, seen: false, source: mail({ atts: [att('newer.pdf', 'application/pdf', pdf())] }) }];
  await inbox.pollInbox(6, s.deps);
  assert.deepEqual(s.listCalls[2], { after: 0, unseenOnly: true });
  assert.equal(docs(6).length, 2, 'only the genuinely new file is added');
  assert.deepEqual({ ...row() }, { lastUid: 2, lastUidValidity: '200' });
  // a message processed once under a UID is never handled again even if lastUid were lost
  getDb().prepare('UPDATE CompanyDocumentInbox SET lastUid=0 WHERE companyId=6').run();
  s.messages.push({ uid: 3, seen: false, source: mail({ atts: [att('third.pdf', 'application/pdf', pdf())] }) });
  await inbox.pollInbox(6, s.deps);
  assert.equal(docs(6).length, 3);
  assert.equal(logOf(6).filter(r => r.uidValidity === '200').length, 2, 'uid 1 is the same Message-ID as before and is skipped without a new log row');
});

test('processed messages are moved to the processed folder, otherwise flagged as seen', async () => {
  configure(1, { processedFolder: 'Apdorota' });
  const s = server({ messages: [{ uid: 7, source: mail({ atts: [att('m.pdf', 'application/pdf', pdf())] }) }, { uid: 8, source: mail({ from: 'svetimas@kitas.lt' }) }] });
  getDb().prepare('UPDATE CompanyDocumentInbox SET lastUid=0, lastUidValidity=NULL WHERE companyId=1').run();
  await inbox.pollInbox(1, s.deps);
  assert.deepEqual(s.moved, [[7, 'Apdorota'], [8, 'Apdorota']]);
  assert.deepEqual(s.seen, []);
  configure(1, { processedFolder: '' });
  s.messages.push({ uid: 9, source: mail({ atts: [att('n.pdf', 'application/pdf', pdf())] }) });
  await inbox.pollInbox(1, s.deps);
  assert.deepEqual(s.seen, [9]);
});

test('recognition runs for stored documents when it is enabled, and its failure is not an error', async () => {
  configure(2, { allowedSenders: '@example.com' });
  getDb().prepare("INSERT INTO CompanyRecognitionSettings(companyId,enabled,apiKeyEncrypted,model) VALUES(2,1,'x','')").run();
  const calls = [];
  const s = server({ messages: [{ uid: 50, source: mail({ atts: [att('r.pdf', 'application/pdf', pdf())] }) }] });
  s.deps.recognize = async (companyId, id) => { calls.push([companyId, id]); throw new Error('boom'); };
  await inbox.pollInbox(2, s.deps);
  assert.equal(calls.length, 1);
  assert.equal(calls[0][0], 2);
  assert.equal(inbox.getInboxSettings(2).lastError, null);
  getDb().prepare('DELETE FROM CompanyRecognitionSettings WHERE companyId=2').run();
  s.messages.push({ uid: 51, source: mail({ atts: [att('r2.pdf', 'application/pdf', pdf())] }) });
  await inbox.pollInbox(2, s.deps);
  assert.equal(calls.length, 1, 'recognition disabled: not called');
});

test('one failing company does not stop the others; the error is stored and cleared on success', async () => {
  configure(3);
  configure(4);
  const good = server({ messages: [{ uid: 90, source: mail({ atts: [att('g.pdf', 'application/pdf', pdf())] }) }] });
  const bad = server({ connectError: new inbox.InboxError('Prisijungti nepavyko: neteisingas naudotojo vardas ar slaptažodis. Gmail atveju naudokite programos slaptažodį ir įjunkite IMAP.') });
  const deps = { connect: connection => (connection.username === 'bloga@imone.lt' ? bad : good).deps.connect(connection), recognize: null };
  getDb().prepare("UPDATE CompanyDocumentInbox SET username='bloga@imone.lt' WHERE companyId=3").run();
  const before = docs(4).length;
  const out = await inbox.pollAllInboxes(deps);
  const byId = Object.fromEntries(out.map(o => [o.companyId, o.ok]));
  assert.equal(byId[3], false);
  assert.equal(byId[4], true);
  assert.equal(docs(4).length, before + 1);
  assert.match(inbox.getInboxSettings(3).lastError, /neteisingas naudotojo vardas/);
  assert.equal(inbox.getInboxSettings(4).lastError, null);
  assert.ok(inbox.getInboxSettings(4).lastRunAt);
  assert.equal(bad.closes, 0);
  assert.equal(good.closes, good.connects, 'every opened session is closed');
  getDb().prepare("UPDATE CompanyDocumentInbox SET username='saskaitos@imone.lt' WHERE companyId=3").run();
  await inbox.pollInbox(3, good.deps);
  assert.equal(inbox.getInboxSettings(3).lastError, null);
});

test('a failure while reading a message keeps lastUid before it so the message is retried', async () => {
  configure(5, { allowedSenders: '@example.com' });
  const s = server({ failFetchUid: 120, messages: [{ uid: 119, source: mail({ atts: [att('p1.pdf', 'application/pdf', pdf())] }) }, { uid: 120, source: mail({ atts: [att('p2.pdf', 'application/pdf', pdf())] }) }] });
  await assert.rejects(inbox.pollInbox(5, s.deps));
  assert.equal(getDb().prepare('SELECT lastUid FROM CompanyDocumentInbox WHERE companyId=5').get().lastUid, 119);
  assert.equal(s.closes, 1);
  assert.ok(inbox.getInboxSettings(5).lastError);
});

test('two polls of the same company never overlap', async () => {
  configure(6, { allowedSenders: '@example.com' });
  let release;
  const gate = new Promise(r => { release = r; });
  const s = server({ messages: [] });
  const inner = s.deps.connect;
  s.deps.connect = async c => { await gate; return inner(c); };
  const first = inbox.pollInbox(6, s.deps);
  assert.equal(inbox.pollInProgress(6), true);
  await assert.rejects(inbox.pollInbox(6, s.deps), /jau tikrinama/);
  release();
  await first;
  assert.equal(inbox.pollInProgress(6), false);
  assert.equal(s.connects, 1);
  await inbox.pollInbox(6, s.deps);
  assert.equal(s.connects, 2);
});

test('the password is write-only and stored encrypted; the connection test reports Lithuanian errors', async () => {
  const saved = configure(1, { password: 'labai-slaptas-77' });
  assert.equal(saved.hasPassword, true);
  assert.ok(!JSON.stringify(saved).includes('labai-slaptas-77'));
  assert.ok(!('password' in saved) && !('passwordEncrypted' in saved));
  const stored = getDb().prepare('SELECT passwordEncrypted FROM CompanyDocumentInbox WHERE companyId=1').get().passwordEncrypted;
  assert.ok(stored && !stored.includes('labai-slaptas-77'));
  const { decryptSecret } = require('../src/lib/company-mail.ts');
  assert.equal(decryptSecret(stored, 1), 'labai-slaptas-77');
  assert.throws(() => decryptSecret(stored, 2), /Nepavyko/, 'bound to the company');
  // saving without a password keeps the stored one
  inbox.saveInboxSettings(1, { enabled: true, host: 'imap.example.com', port: 993, secure: true, username: 'saskaitos@imone.lt', folder: 'INBOX', allowedSenders: '' });
  assert.equal(getDb().prepare('SELECT passwordEncrypted FROM CompanyDocumentInbox WHERE companyId=1').get().passwordEncrypted, stored);
  assert.throws(() => inbox.saveInboxSettings(1, { enabled: true, host: 'imap.example.com', port: 993, secure: true, username: 'kitas@imone.lt', folder: 'INBOX', allowedSenders: '' }), /naują slaptažodį/);

  const ok = server({});
  assert.deepEqual(await inbox.testConnection(1, {}, ok.deps), { ok: true });
  assert.equal(ok.lastConnection.password, 'labai-slaptas-77', 'the stored password is used when none is typed');
  assert.equal(ok.closes, 1);
  const typed = server({});
  await inbox.testConnection(1, { password: 'naujas', host: 'imap.gmail.com' }, typed.deps);
  assert.equal(typed.lastConnection.password, 'naujas');
  assert.equal(typed.lastConnection.host, 'imap.gmail.com');
  const folder = server({ missingFolder: true });
  const missing = await inbox.testConnection(1, { folder: 'Nera' }, folder.deps);
  assert.equal(missing.ok, false);
  assert.match(missing.error, /Aplankas "Nera" nerastas/);
  assert.match(translateServerError(missing.error, 'en'), /was not found in the mailbox/);
  const unknown = await inbox.testConnection(1, {}, server({ connectError: new Error('kaboom') }).deps);
  assert.deepEqual(unknown, { ok: false, error: 'Nepavyko prisijungti prie pašto dėžutės.' });
  assert.equal(inbox.getInboxSettings(1).hasPassword, true);
  assert.equal(inbox.saveInboxSettings(1, { enabled: false, host: 'imap.example.com', port: 993, secure: true, username: 'saskaitos@imone.lt', folder: 'INBOX', allowedSenders: '', clearPassword: true }).hasPassword, false);
});

test('the scheduler registers a 5 minute mailbox poll, and nothing when AUTOMATION=off', () => {
  const scheduler = require('../src/lib/automation-scheduler.ts');
  const realSet = { i: global.setInterval, t: global.setTimeout };
  const intervals = [];
  global.setInterval = (fn, ms) => { intervals.push(ms); return { unref() {} }; };
  global.setTimeout = () => ({ unref() {} });
  try {
    process.env.AUTOMATION = 'off';
    scheduler.startAutomationScheduler();
    assert.deepEqual(intervals, []);
    delete process.env.AUTOMATION;
    scheduler.startAutomationScheduler();
    assert.ok(intervals.includes(5 * 60_000));
    assert.ok(intervals.includes(30 * 60_000), 'the existing automation clock is untouched');
  } finally {
    global.setInterval = realSet.i; global.setTimeout = realSet.t;
  }
});

test('the migration is recorded and the tables exist; the company export package leaves the mailbox settings out', () => {
  assert.ok(getDb().prepare("SELECT 1 FROM AppMigration WHERE version='2026-11-document-inbox-v1'").get());
  assert.ok(getDb().prepare("SELECT 1 FROM sqlite_master WHERE name='DocumentInboxMessage'").get());
  const pkg = fs.readFileSync(path.join(__dirname, '../src/lib/company-package.ts'), 'utf8');
  assert.ok(!/table: 'CompanyDocumentInbox'/.test(pkg) && !/table: 'CompanyMailSettings'/.test(pkg));
});
