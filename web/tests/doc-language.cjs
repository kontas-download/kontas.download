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
fixture.prepare("INSERT INTO Company (id, name, code, currencyCode, isDefault, createdAt, updatedAt) VALUES (1, 'UAB Pavyzdys', 'A', 'EUR', 0, datetime('now'), datetime('now'))").run();
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

test('customer documents are issued in the customer language or the language chosen per document', async t => {
  try {
    db.prepare("INSERT INTO User(id,email,name,passwordHash,role,createdAt) VALUES(1,'test@example.test','Tester','unused','admin',datetime('now'))").run();
    jar.set('auth_session', auth.createSessionToken({ id: 1 })); jar.set('active_company_id', '1');
    db.prepare("UPDATE Company SET address='Vilniaus g. 1',bankIban='LT123456789012345678',email='seller@example.test',isVatPayer=1,vatCode='LT100000000011' WHERE id=1").run();
    const clients = require('../src/app/api/clients/route.ts');
    const oneClient = require('../src/app/api/clients/[id]/route.ts');
    const invoices = require('../src/app/api/invoices/route.ts');
    const pdfRoute = require('../src/app/api/invoices/[id]/pdf/route.ts');
    const mailRoute = require('../src/app/api/invoices/[id]/email/route.ts');
    const reminder = require('../src/app/api/invoices/[id]/reminder/route.ts');
    const { invoiceDocument } = require('../src/lib/invoice-document.ts');
    const { invoiceDefinition, renderInvoicePdf } = require('../src/lib/invoice-pdf.ts');
    const { resolveDocLang, formatDocNumber, DOC_LANGS, docTexts } = require('../src/lib/doc-language.ts');
    const text = definition => JSON.stringify(definition);
    let ruClient, plainClient, sale;

    await t.test('language of the customer is validated, stored and kept when a form does not send it', async () => {
      const bad = await clients.POST(request('POST', { name: 'Bad', documentLang: 'de' })); assert.equal(bad.status, 400);
      const created = await clients.POST(request('POST', { name: 'Клиент Иванов', code: 'RU1', email: 'ivanov@example.test', documentLang: 'ru' })); assert.equal(created.status, 200);
      ruClient = (await created.json()).client; assert.equal(ruClient.documentLang, 'ru');
      plainClient = (await (await clients.POST(request('POST', { name: 'Klientas Žąsinas', code: 'LT1', email: 'zasinas@example.test' }))).json()).client; assert.equal(plainClient.documentLang, null);
      const edit = { name: 'Клиент Иванов', code: 'RU1', email: 'ivanov@example.test' };
      assert.equal((await oneClient.PUT(request('PUT', edit), context(ruClient.id))).status, 200);
      assert.equal(db.prepare('SELECT documentLang d FROM Client WHERE id=?').get(ruClient.id).d, 'ru'); // omitted = unchanged
      assert.equal((await oneClient.PUT(request('PUT', { ...edit, documentLang: 'zz' }), context(ruClient.id))).status, 400);
      assert.equal((await oneClient.PUT(request('PUT', { ...edit, documentLang: 'en' }), context(ruClient.id))).status, 200);
      assert.equal((await oneClient.PUT(request('PUT', { ...edit, documentLang: '' }), context(ruClient.id))).status, 200);
      assert.equal(db.prepare('SELECT documentLang d FROM Client WHERE id=?').get(ruClient.id).d, null);
      assert.equal((await oneClient.PUT(request('PUT', { ...edit, documentLang: 'ru' }), context(ruClient.id))).status, 200);
    });

    await t.test('document language: chosen > customer > Lithuanian; unknown values are refused', async () => {
      const make = async (client, number) => (await (await invoices.POST(request('POST', { number, saleDate: '2026-10-26', payUntil: '2026-11-10', clientId: client.id, clientName: client.name, clientCode: client.code, statusName: 'Neapmokėta', items: [{ itemName: 'Paslauga', quantity: 2, price: 1234.5, vatRate: 21 }] }))).json()).sale;
      sale = await make(ruClient, 'RU-001'); const lt = await make(plainClient, 'LT-001');
      assert.equal(invoiceDocument(sale.id, 1).lang, 'ru');
      assert.equal(invoiceDocument(sale.id, 1, 'en').lang, 'en');
      assert.throws(() => invoiceDocument(sale.id, 1, 'xx'), /Nežinoma dokumento kalba/);
      assert.equal(invoiceDocument(sale.id, 1, '').lang, 'ru');
      assert.equal((await mailRoute.GET(request('GET', null, '?lang=de'), context(sale.id))).status, 400);
      assert.equal((await pdfRoute.GET(request('GET', null, '?lang=de'), context(sale.id))).status, 400);
      assert.equal(invoiceDocument(lt.id, 1).lang, 'lt');
      assert.equal(invoiceDocument(lt.id, 1, 'ru').lang, 'ru');
      assert.equal(resolveDocLang(undefined, null), 'lt');
      assert.deepEqual(DOC_LANGS, ['lt', 'ru', 'en']);
    });

    await t.test('PDF labels come from the document language only, numbers use its format', async () => {
      const doc = invoiceDocument(sale.id, 1);
      const ru = text(invoiceDefinition(doc));
      assert(ru.includes('СЧЁТ-ФАКТУРА PVM') && ru.includes('ПРОДАВЕЦ') && ru.includes('Сумма без PVM') && ru.includes('Оплатить до'));
      assert(!ru.includes('PARDAVĖJAS') && !ru.includes('IŠ VISO') && !ru.includes('Apmokėti iki'));
      const en = text(invoiceDefinition({ ...doc, lang: 'en' }));
      assert(en.includes('VAT INVOICE') && en.includes('SELLER') && en.includes('Total excl. VAT') && en.includes('2,469.00') && !en.includes('ПРОДАВЕЦ'));
      const lt = text(invoiceDefinition({ ...doc, lang: 'lt' }));
      assert(lt.includes('PVM SĄSKAITA FAKTŪRA') && lt.includes('PARDAVĖJAS') && lt.includes('IŠ VISO') && !lt.includes('ПРОДАВЕЦ'));
      assert(!/[  ]/.test(ru + en + lt));
      assert.equal(formatDocNumber('en', 1234.5), '1,234.50'); assert.equal(formatDocNumber('ru', 1234.5), '1 234,50');
      for (const lang of DOC_LANGS) { // every label exists and is non-empty in every language
        for (const [key, value] of Object.entries(docTexts(lang))) assert.ok(String(value).trim(), `${lang}.${key}`);
        assert.deepEqual(Object.keys(docTexts(lang)).sort(), Object.keys(docTexts('lt')).sort());
      }
      const credit = text(invoiceDefinition({ ...doc, lang: 'en', correction: { originalNumber: 'SF 1', originalDate: '2026-10-01', reason: 'Error' } }));
      assert(credit.includes('CREDIT VAT INVOICE') && credit.includes('Corrected invoice: SF 1 (2026-10-01). Reason: Error'));
      const output = path.resolve('../output/pdf'); fs.mkdirSync(output, { recursive: true });
      for (const lang of DOC_LANGS) { const bytes = await renderInvoicePdf({ ...doc, lang }); assert.equal(bytes.subarray(0, 5).toString(), '%PDF-'); fs.writeFileSync(path.join(output, `invoice-${lang}.pdf`), bytes); }
      const viaRoute = await pdfRoute.GET(request('GET', null, '?lang=en'), context(sale.id)); assert.equal(viaRoute.status, 200);
    });

    await t.test('email and reminder drafts are in the document language; sending with another language is archived as such', async () => {
      const ruDraft = await (await mailRoute.GET(request('GET'), context(sale.id))).json();
      assert.equal(ruDraft.lang, 'ru'); assert.match(ruDraft.subject, /^Счёт-фактура .*RU-001/); assert.match(ruDraft.text, /Добрый день/); assert(ruDraft.text.includes('2987.49'));
      const enDraft = await (await mailRoute.GET(request('GET', null, '?lang=en'), context(sale.id))).json();
      assert.equal(enDraft.lang, 'en'); assert.match(enDraft.subject, /^Invoice .*RU-001/); assert.match(enDraft.text, /Kind regards/);
      const ltDraft = await (await mailRoute.GET(request('GET', null, '?lang=lt'), context(sale.id))).json(); assert.match(ltDraft.text, /Laba diena/);
      process.env.SMTP_ENCRYPTION_KEY = 'ab'.repeat(32);
      require('../src/lib/company-mail.ts').saveMailSettings(1, { host: 'smtp.example.test', port: 587, secure: false, sender: 'sender@example.test', username: 'seller1', password: 'test-password', enabled: true });
      const sent = await mailRoute.POST(request('POST', { to: 'ivanov@example.test', subject: enDraft.subject, text: enDraft.text, lang: 'en', requestId: require('node:crypto').randomUUID() }), context(sale.id));
      assert.equal(sent.status, 200, JSON.stringify(await sent.clone().json()));
      assert.equal(JSON.parse(db.prepare('SELECT snapshot FROM InvoiceArchive WHERE saleId=?').get(sale.id).snapshot).lang, 'en');
      assert.equal(messages.at(-1).attachments[0].content.subarray(0, 5).toString(), '%PDF-');

      const remind = await reminder.GET(request('GET'), context(sale.id)); assert.equal(remind.status, 200);
      const ruRemind = await remind.json(); assert.equal(ruRemind.lang, 'ru'); assert.match(ruRemind.subject, /Напоминание о неоплаченном счёте .*RU-001/); assert(ruRemind.text.includes('2987.49')); assert(ruRemind.text.includes('Срок оплаты был 2026-11-10.'));
      const enRemind = await (await reminder.GET(request('GET', null, '?lang=en'), context(sale.id))).json(); assert.match(enRemind.subject, /Reminder: unpaid invoice/); assert(enRemind.text.includes('The payment due date was 2026-11-10.'));
      const ltRemind = await (await reminder.GET(request('GET', null, '?lang=lt'), context(sale.id))).json(); assert.match(ltRemind.subject, /Priminimas apie neapmokėtą sąskaitą/);
    });
  } finally { db.close(); assert.equal(path.dirname(path.resolve(temp)), path.resolve(os.tmpdir())); assert(path.basename(temp).startsWith('erp-test-')); fs.rmSync(temp, { recursive: true, force: true }); }
});
