const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const Module = require('node:module');
const ts = require('typescript');
const Database = require('better-sqlite3');
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'erp-senders-'));
process.env.DATABASE_URL = 'file:' + path.join(temp, 'test.db');
process.env.DOCUMENTS_DIR = path.join(temp, 'documents');
process.env.SMTP_ENCRYPTION_KEY = crypto.randomBytes(32).toString('hex');
const fixture = new Database(process.env.DATABASE_URL.slice(5));
fixture.exec(fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8'));
const company = fixture.prepare("INSERT INTO Company (id, name, code, vatCode, email, currencyCode, isDefault, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, 'EUR', ?, datetime('now'), datetime('now'))");
company.run(1, 'UAB Pirkėjas', '111111111', 'LT111111119', 'info@imone.lt', 1);
company.run(2, 'UAB Kita', '222222222', 'LT222222229', null, 0);
company.run(3, 'MB Be PVM', '333333333', null, null, 0);
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
const senders = require('../src/lib/document-inbox-senders.ts');
const forward = require('../src/lib/document-inbox-forward.ts');
const rec = require('../src/lib/purchase-recognition.ts');
const { getDb } = require('../src/lib/db.ts');
const { codesFor } = require('../src/lib/tax-codes.ts');
const { translateServerError } = require('../src/lib/errors.ts');
const { migrateDocumentInbox } = require('../src/lib/document-inbox-schema.ts');
const db = getDb();
db.prepare('UPDATE Company SET isVatPayer=1 WHERE id IN (1,2)').run();
db.prepare('UPDATE Company SET isVatPayer=0 WHERE id=3').run();
const [CODE] = codesFor('PURCHASE');
const user = (email, disabled = false) => db.prepare("INSERT INTO User(email,name,passwordHash,role,createdAt,disabledAt) VALUES(?,?,?,?,datetime('now'),?)").run(email, 'Naudotojas', 'x', 'accountant', disabled ? 1 : null);
const client = (companyId, name, over = {}) => Number(db.prepare("INSERT INTO Client(companyId,name,code,vatCode,email,correspondenceEmail,createdAt,updatedAt) VALUES(?,?,?,?,?,?,datetime('now'),datetime('now'))").run(companyId, name, over.code ?? null, over.vatCode ?? null, over.email ?? null, over.correspondenceEmail ?? null).lastInsertRowid);

// ---------- mail helpers ----------
const uniq = tag => Buffer.from(`${tag} ${crypto.randomUUID()}`);
const pdf = () => Buffer.concat([Buffer.from('%PDF-1.4 '), uniq('pdf')]);
let counter = 0;
function raw({ from = 'tiekejas@example.com', subject = 'Saskaita', text, html, atts = [], rfc822 = [], headers = [] }) {
  const b = 'BOUND' + counter++;
  const lines = [`From: <${from}>`, 'To: saskaitos@imone.lt', `Subject: ${subject}`, `Message-ID: <${crypto.randomUUID()}@example.com>`, 'MIME-Version: 1.0', ...headers, `Content-Type: multipart/mixed; boundary="${b}"`, ''];
  if (text !== undefined) lines.push(`--${b}`, 'Content-Type: text/plain; charset=utf-8', '', text);
  if (html !== undefined) lines.push(`--${b}`, 'Content-Type: text/html; charset=utf-8', '', html);
  for (const a of atts) lines.push(`--${b}`, `Content-Type: ${a.type}; name="${a.name}"`, 'Content-Transfer-Encoding: base64', `Content-Disposition: attachment; filename="${a.name}"`, '', a.data.toString('base64').replace(/(.{76})/g, '$1\r\n'));
  for (const r of rfc822) lines.push(`--${b}`, 'Content-Type: message/rfc822', 'Content-Disposition: attachment; filename="forward.eml"', '', r.toString('utf8'));
  lines.push(`--${b}--`, '');
  return Buffer.from(lines.join('\r\n'));
}
const att = (name, data = pdf()) => ({ name, type: 'application/pdf', data });
function server(messages) {
  const s = { messages };
  s.deps = {
    recognize: null,
    connect: async () => ({
      open: async () => ({ uidValidity: '1' }),
      listUids: async after => s.messages.filter(m => m.uid > after).map(m => m.uid),
      fetchSource: async uid => s.messages.find(m => m.uid === uid).source,
      markDone: async () => undefined,
      close: async () => undefined,
    }),
  };
  return s;
}
const configure = (companyId, overrides = {}) => inbox.saveInboxSettings(companyId, { enabled: true, host: 'imap.example.com', port: 993, secure: true, username: 'dezute@imone.lt', password: 'slaptas-123', folder: 'INBOX', processedFolder: '', allowedSenders: '', ...overrides });
const logOf = companyId => db.prepare('SELECT * FROM DocumentInboxMessage WHERE companyId=? ORDER BY uid').all(companyId);
const docs = companyId => db.prepare('SELECT * FROM PurchaseDocument WHERE companyId=? ORDER BY id').all(companyId);
let uidSeq = 0;
async function poll(companyId, messages) { messages.forEach(m => { m.uid = ++uidSeq; }); return inbox.pollInbox(companyId, server(messages).deps); }

// ---------- sender rules ----------
test('migration: existing mailboxes keep their behaviour (known contractors off), new ones start with it on', () => {
  const old = new Database(':memory:');
  old.exec("CREATE TABLE AppMigration(version TEXT PRIMARY KEY, appliedAt TEXT); CREATE TABLE Company(id INTEGER PRIMARY KEY);");
  old.exec(`CREATE TABLE CompanyDocumentInbox(companyId INTEGER PRIMARY KEY, enabled INTEGER NOT NULL DEFAULT 0, allowedSenders TEXT NOT NULL DEFAULT '');
    INSERT INTO CompanyDocumentInbox(companyId) VALUES(1); INSERT INTO AppMigration VALUES('2026-11-document-inbox-v1', 'x');`);
  migrateDocumentInbox(old);
  assert.equal(old.prepare('SELECT acceptKnownContacts v FROM CompanyDocumentInbox WHERE companyId=1').get().v, 0);
  old.prepare('INSERT INTO CompanyDocumentInbox(companyId) VALUES(2)').run();
  assert.equal(old.prepare('SELECT acceptKnownContacts v FROM CompanyDocumentInbox WHERE companyId=2').get().v, 1);
  migrateDocumentInbox(old); // idempotent
  assert.equal(inbox.getInboxSettings(2).acceptKnownContacts, true, 'no row yet: the default is on');
});

test('known contractors: exact address and non-public domain accepted, public domains only exactly, switch off, own people always', async () => {
  client(1, 'UAB Tiekėjas', { email: 'Info@Tiekejas.lt', correspondenceEmail: 'buh@korespondencija.lt' });
  client(1, 'Jonas IĮ', { email: 'jonas@gmail.com' });
  client(2, 'Kitos įmonės tiekėjas', { email: 'info@kita-tiekejas.lt' });
  user('buhalteris@imone.lt'); user('atleistas@imone.lt', true);
  configure(1, { acceptKnownContacts: true });
  const m = (from, atts = [att('a.pdf')]) => ({ source: raw({ from, atts }) });
  const result = await poll(1, [
    m('info@tiekejas.lt'), m('BUH@korespondencija.lt'), m('kitas.zmogus@tiekejas.lt'), m('jonas@gmail.com'), m('visai.kitas@gmail.com'), m('svetimas@kitas.lt'),
    m('info@kita-tiekejas.lt'), m('buhalteris@imone.lt'), m('info@imone.lt'), m('atleistas@imone.lt'), m('dezute@imone.lt'),
  ]);
  assert.deepEqual(logOf(1).map(r => r.status === 'IMPORTED'), [true, true, true, true, false, false, false, true, true, false, true]);
  assert.equal(result.imported, 7);
  // Turned off: the contacts are no longer accepted, own people and the explicit list still are.
  configure(1, { acceptKnownContacts: false, allowedSenders: '@kitas.lt' });
  const off = await poll(1, [m('info@tiekejas.lt'), m('buhalteris@imone.lt'), m('svetimas@kitas.lt')]);
  assert.equal(off.imported, 2); assert.equal(off.skipped, 1);
  // The same address of another company is not a contact of this company.
  const ctx2 = senders.senderContext(db, 2);
  assert.equal(senders.classifySender(ctx2, 'info@kita-tiekejas.lt'), 'KNOWN');
  assert.equal(senders.classifySender(ctx2, 'info@tiekejas.lt'), null);
  assert.equal(senders.classifySender(senders.senderContext(db, 1), 'info@imone.lt'), 'OWN');
  for (const d of ['gmail.com', 'outlook.com', 'hotmail.com', 'yahoo.com', 'icloud.com', 'inbox.lt', 'one.lt', 'mail.ru', 'yandex.ru', 'yandex.com', 'proton.me', 'protonmail.com', 'gmx.de', 'gmx.net', 'live.com']) assert.ok(senders.isPublicMailDomain(d), d);
  assert.equal(senders.isPublicMailDomain('tiekejas.lt'), false);
});

test('DMARC failure refuses even a known contractor and an own person, and the log does not offer to allow it', async () => {
  configure(2, { acceptKnownContacts: true });
  const result = await poll(2, [{ source: raw({ from: 'info@kita-tiekejas.lt', headers: ['Authentication-Results: mx.example.net; dmarc=fail header.from=kita-tiekejas.lt'], atts: [att('a.pdf')] }) }, { source: raw({ from: 'svetimas@kitas.lt', atts: [att('b.pdf')] }) }]);
  assert.deepEqual(result, { messages: 2, imported: 0, skipped: 2 });
  const log = inbox.inboxLog(2);
  assert.deepEqual(log.map(r => r.canAllow).reverse(), [false, true]);
  assert.match(translateServerError(log.find(r => r.sender === 'svetimas@kitas.lt').detail.split('\n')[0], 'en'), /not on the allowed list/);
});

test('allowSender adds the address once, keeps the list valid and creates the settings when missing', () => {
  const settings = inbox.allowSender(3, 'Nauja@Tiekejas.lt');
  assert.equal(settings.allowedSenders, 'nauja@tiekejas.lt');
  assert.equal(inbox.allowSender(3, 'nauja@tiekejas.lt').allowedSenders, 'nauja@tiekejas.lt');
  assert.equal(inbox.allowSender(3, 'kita@tiekejas.lt').allowedSenders, 'nauja@tiekejas.lt\nkita@tiekejas.lt');
  assert.equal(settings.enabled, false);
  assert.throws(() => inbox.allowSender(3, 'ne adresas'), e => e.status === 400);
  assert.throws(() => inbox.allowSender(3, undefined), e => e.status === 400);
  assert.throws(() => inbox.saveInboxSettings(3, { enabled: false, host: '', port: 993, secure: true, username: '', folder: 'INBOX', allowedSenders: '', acceptKnownContacts: 'yes' }), e => e.status === 400);
});

// ---------- forwarded mail ----------
test('inline forwarded headers: Lithuanian, English, Russian, German, header-only block and HTML', () => {
  const own = new Set(['buhalteris@imone.lt']);
  const o = forward.originalSenderFromText;
  assert.equal(o('Sveiki, persiunčiu.\n\n---------- Persiųstas laiškas ----------\nNuo: UAB Tiekėjas <Saskaitos@Tiekejas.lt>\nData: 2026-10-20\nTema: Sąskaita\n', own), 'saskaitos@tiekejas.lt');
  assert.equal(o('FYI\n---------- Forwarded message ---------\nFrom: Supplier <billing@supplier.com>\nDate: Mon\nSubject: Invoice\nTo: me@imone.lt', own), 'billing@supplier.com');
  assert.equal(o('Привет\n\n-------- Пересланное сообщение --------\nОт: ООО Поставщик <office@postavshik.ru>\nТема: Счёт', own), 'office@postavshik.ru');
  assert.equal(o('Hallo\n\n-------- Weitergeleitete Nachricht --------\nVon: Lieferant <rechnung@lieferant.de>\nBetreff: Rechnung', own), 'rechnung@lieferant.de');
  assert.equal(o('Hi\n\nFrom: Jonas <jonas@tiekejas.lt>\nSent: Monday\nTo: Buh <buhalteris@imone.lt>\nSubject: Sąskaita', own), 'jonas@tiekejas.lt');
  assert.equal(o('> ---------- Forwarded message ---------\n> From: <a@b.lt>\n> Subject: x', own), 'a@b.lt');
  assert.equal(o('---------- Forwarded message ---------\nFrom: Buh <buhalteris@imone.lt>\nSubject: x', own), null, 'the forwarder is never its own original sender');
  assert.equal(o('Tik laiškas be persiuntimo.\nFrom the desk of nobody', own), null);
  assert.equal(o('', own), null);
});

test('a forwarded message: body headers and attached message/rfc822 give the original sender; the forwarder is the sender', async () => {
  configure(1, { acceptKnownContacts: false, allowedSenders: '' });
  const inner = raw({ from: 'Original <saskaitos@pirmas-tiekejas.lt>', subject: 'Sąskaita 1', text: 'Žiūrėkite priedą', atts: [att('prisegta.pdf')] });
  const result = await poll(1, [
    { source: raw({ from: 'buhalteris@imone.lt', text: 'Persiunčiu\r\n\r\n---------- Persiųstas laiškas ----------\r\nNuo: UAB Pirmas <saskaitos@tiekejas-lt.lt>\r\nTema: Sąskaita', atts: [att('inline.pdf')] }) },
    { source: raw({ from: 'buhalteris@imone.lt', text: 'Žr. priedą', rfc822: [inner] }) },
    { source: raw({ from: 'buhalteris@imone.lt', html: '<div>---------- Forwarded message ---------<br>From: <b>Supplier</b> &lt;<a href="mailto:billing@sup.com">billing@sup.com</a>&gt;<br>Subject: Invoice</div>', atts: [att('html.pdf')] }) },
    { source: raw({ from: 'buhalteris@imone.lt', text: 'Be originalo', atts: [att('plain.pdf')] }) },
    { source: raw({ from: 'svetimas@kitas.lt', text: '---------- Forwarded message ---------\r\nFrom: <x@y.lt>\r\n', atts: [att('refused.pdf')] }) },
  ]);
  assert.equal(result.imported, 4);
  const byName = Object.fromEntries(docs(1).filter(d => d.source === 'EMAIL').map(d => [d.fileName, d]));
  assert.equal(byName['inline.pdf'].sender, 'buhalteris@imone.lt');
  assert.equal(byName['inline.pdf'].originalSender, 'saskaitos@tiekejas-lt.lt');
  assert.equal(byName['prisegta.pdf'].sender, 'buhalteris@imone.lt');
  assert.equal(byName['prisegta.pdf'].originalSender, 'saskaitos@pirmas-tiekejas.lt', 'the attached message supplies the document and the original sender');
  assert.equal(byName['html.pdf'].originalSender, 'billing@sup.com');
  assert.equal(byName['plain.pdf'].originalSender, null);
  assert.ok(!byName['refused.pdf'], 'a stranger is refused, forwarded or not');
  const logged = logOf(1).find(r => r.detail.includes('pradinis siuntėjas saskaitos@tiekejas-lt.lt'));
  assert.ok(logged);
  assert.match(translateServerError(logged.detail.split('\n').find(l => l.startsWith('Persiųsta')), 'ru'), /исходный отправитель/);
  assert.equal(rec.getDocument(1, byName['html.pdf'].id).originalSender, 'billing@sup.com');
});

// ---------- previews, learning and rules ----------
const extracted = (over = {}) => ({
  docKind: 'INVOICE',
  supplier: { name: 'UAB Tiekėjas', code: '300000001', vatCode: 'LT100000000011', address: 'Vilnius' },
  buyer: { name: 'UAB Pirkėjas', code: '111111111', vatCode: 'LT111111119' },
  series: null, number: 'N-' + ++counter, issueDate: '2026-10-20', dueDate: '2026-11-03', currency: 'EUR',
  lines: [{ name: 'Popierius', quantity: 2, unitPrice: 10, net: 20, vatRate: 21, vat: 4.2, gross: 24.2 }],
  totals: { net: 20, vat: 4.2, gross: 24.2 }, vatBreakdown: [{ rate: 21, net: 20, vat: 4.2 }],
  receipt: null, payment: { method: null, cardLast4: null }, uncertainFields: [], notes: null, ...over,
});
function doc(companyId, { source = 'UPLOAD', sender = null, originalSender = null, data = extracted() } = {}) {
  const row = rec.storeDocument(companyId, { buffer: pdf(), fileName: 'd.pdf', mimeType: 'application/pdf', source, sender, originalSender });
  db.prepare("UPDATE PurchaseDocument SET status='EXTRACTED', extractedJson=? WHERE id=?").run(JSON.stringify(data), row.id);
  return row.id;
}
const nameless = { name: 'Neaiškus tiekėjas', code: null, vatCode: null, address: null };
const confirmInput = (over = {}) => {
  const n = ++counter;
  return { supplier: { name: 'UAB Tiekėjas', code: '300000001', vatCode: 'LT100000000011', address: 'Vilnius', create: true }, series: '', number: 'C-' + n, issueDate: '2026-10-20',
    lines: [{ itemName: 'Popierius', quantity: 2, net: 20, vat: 4.2, gross: 24.2, vatRate: 21, taxCode: CODE }], totals: { net: 20, vat: 4.2, gross: 24.2 }, ...over };
};

test('the original sender finds the supplier by e-mail when the document has no company or VAT code', () => {
  const supplierId = client(1, 'UAB El. paštu rastas', { code: '500000005', vatCode: 'LT500000000051', email: 'sask@elpastas.lt' });
  const forwarded = doc(1, { source: 'EMAIL', sender: 'buhalteris@imone.lt', originalSender: 'sask@elpastas.lt', data: extracted({ supplier: nameless }) });
  const p = rec.previewDocument(1, forwarded);
  assert.equal(p.supplier.clientId, supplierId);
  assert.equal(p.supplierFromEmail, 'sask@elpastas.lt');
  assert.equal(p.draft.supplier.clientId, supplierId);
  assert.equal(p.draft.supplier.code, '500000005');
  assert.equal(p.needsSupplier, false);
  // A colleague of the same (non-public) domain finds it as well; a forwarder without an original and a code on the document do not.
  assert.equal(rec.previewDocument(1, doc(1, { source: 'EMAIL', sender: 'buhalteris@imone.lt', originalSender: 'kitas@elpastas.lt', data: extracted({ supplier: nameless }) })).supplier.clientId, supplierId);
  assert.equal(rec.previewDocument(1, doc(1, { source: 'EMAIL', sender: 'buhalteris@imone.lt', data: extracted({ supplier: nameless }) })).supplier.clientId, null);
  assert.equal(rec.previewDocument(1, doc(1, { source: 'EMAIL', sender: 'buhalteris@imone.lt', originalSender: 'sask@elpastas.lt' })).supplier.clientId, null, 'the document shows its own supplier code');
  // Direct mail from the contact (not a forward) is matched by the sender itself; a public domain never matches by domain.
  assert.equal(rec.previewDocument(1, doc(1, { source: 'EMAIL', sender: 'sask@elpastas.lt', data: extracted({ supplier: nameless }) })).supplier.clientId, supplierId);
  assert.equal(rec.previewDocument(1, doc(1, { source: 'EMAIL', sender: 'nezinomas@gmail.com', data: extracted({ supplier: nameless }) })).supplier.clientId, null);
});

test('suggestAllowSender: offered once for a confirmed document whose (original) sender no rule accepts', () => {
  configure(1, { acceptKnownContacts: true, allowedSenders: '' });
  const a = doc(1, { source: 'EMAIL', sender: 'buhalteris@imone.lt', originalSender: 'naujas@nezinomas.lt' });
  assert.equal(rec.confirmDocument(1, a, 7, confirmInput({ supplier: { name: 'UAB Tiekėjas', code: '300000001', create: true } })).suggestAllowSender, 'naujas@nezinomas.lt');
  inbox.allowSender(1, 'naujas@nezinomas.lt');
  const b = doc(1, { source: 'EMAIL', sender: 'buhalteris@imone.lt', originalSender: 'naujas@nezinomas.lt' });
  assert.equal(rec.confirmDocument(1, b, 7, confirmInput({ supplier: { name: 'UAB Tiekėjas', code: '300000001', create: true } })).suggestAllowSender, null, 'now allowed');
  const known = doc(1, { source: 'EMAIL', sender: 'buhalteris@imone.lt', originalSender: 'sask@elpastas.lt' });
  assert.equal(rec.confirmDocument(1, known, 7, confirmInput({ supplier: { name: 'UAB Tiekėjas', code: '300000001', create: true } })).suggestAllowSender, null, 'a known contractor');
  const own = doc(1, { source: 'EMAIL', sender: 'buhalteris@imone.lt' });
  assert.equal(rec.confirmDocument(1, own, 7, confirmInput({ supplier: { name: 'UAB Tiekėjas', code: '300000001', create: true } })).suggestAllowSender, null, 'a forward without a detected original');
  const upload = doc(1);
  assert.equal(rec.confirmDocument(1, upload, 7, confirmInput({ supplier: { name: 'UAB Tiekėjas', code: '300000001', create: true } })).suggestAllowSender, null, 'an upload has no sender');
  const gmail = doc(1, { source: 'EMAIL', sender: 'buhalteris@imone.lt', originalSender: 'atsitiktinis@gmail.com' });
  assert.equal(rec.confirmDocument(1, gmail, 7, confirmInput({ supplier: { name: 'UAB Tiekėjas', code: '300000001', create: true } })).suggestAllowSender, 'atsitiktinis@gmail.com', 'only the exact address is ever suggested');
});
