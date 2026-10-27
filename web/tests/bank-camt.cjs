const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');
const Database = require('better-sqlite3');
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'erp-camt-'));
process.env.DATABASE_URL = 'file:' + path.join(temp, 'test.db');
const fixture = new Database(process.env.DATABASE_URL.slice(5));
fixture.exec(fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8'));
const company = fixture.prepare("INSERT INTO Company (id, name, code, currencyCode, isDefault, createdAt, updatedAt) VALUES (?, ?, ?, 'EUR', 0, datetime('now'), datetime('now'))");
company.run(1, 'Company A', '111');
company.run(2, 'Company B', '222');
fixture.close();
const jar = new Map();
const realLoad = Module._load;
Module._load = function(name, parent, isMain) {
  if (name === 'next/headers') return { cookies: async () => ({ get: key => jar.has(key) ? { value: jar.get(key) } : undefined }) };
  if (name === 'next/navigation') return { redirect: url => { throw new Error('redirect:' + url); } };
  if (name.startsWith('@/')) name = path.join(__dirname, '../src', name.slice(2));
  return realLoad.call(this, name, parent, isMain);
};
require.extensions['.ts'] = (mod, filename) => mod._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText, filename);
const auth = require('../src/lib/auth.ts');
const { getDb } = require('../src/lib/db.ts');
const { parseCamt053, looksLikeXml } = require('../src/lib/bank-camt.ts');
const db = getDb();
const request = (method, body) => new Request('http://localhost:3000/api/test', { method, headers: { 'Content-Type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}) });

const entry = (o) => `<Ntry><NtryRef>${o.ref}</NtryRef><Amt Ccy="${o.ccy || 'EUR'}">${o.amount}</Amt><CdtDbtInd>${o.dir}</CdtDbtInd>${o.rvsl ? '<RvslInd>true</RvslInd>' : ''}<Sts>${o.sts || 'BOOK'}</Sts><BookgDt><Dt>${o.date}</Dt></BookgDt><ValDt><Dt>${o.date}</Dt></ValDt><AcctSvcrRef>${o.ref}</AcctSvcrRef><NtryDtls><TxDtls><Refs><EndToEndId>${o.e2e || 'NOTPROVIDED'}</EndToEndId></Refs><RltdPties>${o.dir === 'CRDT' ? `<Dbtr><Nm>${o.name}</Nm></Dbtr>` : `<Cdtr><Nm>${o.name}</Nm></Cdtr>`}</RltdPties><RmtInf><Ustrd>${o.info}</Ustrd></RmtInf></TxDtls></NtryDtls></Ntry>`;
const bal = (code, amount, dir, date) => `<Bal><Tp><CdOrPrtry><Cd>${code}</Cd></CdOrPrtry></Tp><Amt Ccy="EUR">${amount}</Amt><CdtDbtInd>${dir}</CdtDbtInd><Dt><Dt>${date}</Dt></Dt></Bal>`;
const statement = (o = {}) => {
  const entries = o.entries || [
    entry({ ref: 'R1', amount: '121.00', dir: 'CRDT', date: '2026-10-05', name: 'UAB Klientas &amp; Ko', info: 'Apmokėjimas už SF 123' }),
    entry({ ref: 'R2', amount: '60.50', dir: 'DBIT', date: '2026-10-06', name: 'Tiekėjas', info: 'Sąskaita TIEK-7' }),
    entry({ ref: 'R3', amount: '1400.00', dir: 'DBIT', date: '2026-10-07', name: 'Fizinis asmuo', info: 'Išmoka' }),
  ];
  return `<Stmt><Id>S1</Id><Acct><Id><IBAN>${o.iban || 'LT12 3456 7890 1234 5678'}</IBAN></Id><Ccy>${o.ccy || 'EUR'}</Ccy></Acct>${o.balances === false ? '' : bal('OPBD', o.opening ?? '1000.00', 'CRDT', '2026-10-01') + bal('CLBD', o.closing ?? '339.50', o.closingDir || 'DBIT', '2026-10-31')}${entries.join('')}</Stmt>`;
};
const file = (stmts, ns = 'urn:iso:std:iso:20022:tech:xsd:camt.053.001.02') => `<?xml version="1.0" encoding="UTF-8"?><Document xmlns="${ns}"><BkToCstmrStmt><GrpHdr><MsgId>M1</MsgId></GrpHdr>${[].concat(stmts).join('')}</BkToCstmrStmt></Document>`;

test('camt.053 reader', () => {
  const ok = parseCamt053(file(statement()), 1);
  assert.deepEqual(ok.errors, []); assert.equal(ok.rows.length, 3);
  assert.deepEqual(ok.rows.map(r => [r.date, r.sum, r.account, r.reference]), [['2026-10-05', 121, 'LT123456789012345678', 'R1'], ['2026-10-06', -60.5, 'LT123456789012345678', 'R2'], ['2026-10-07', -1400, 'LT123456789012345678', 'R3']]);
  assert.equal(ok.rows[0].clientName, 'UAB Klientas & Ko'); assert.equal(ok.rows[0].details, 'Apmokėjimas už SF 123'); assert.equal(ok.rows[1].clientName, 'Tiekėjas');
  assert.equal(ok.statements[0].reconciled, true); assert.equal(ok.statements[0].opening, 1000); assert.equal(ok.statements[0].closing, -339.5);
  assert.equal(new Set(ok.rows.map(r => r.hash)).size, 3);
  // newer message version, other namespace, name under Pty
  const v8 = file(statement().replace('<Dbtr><Nm>UAB Klientas &amp; Ko</Nm></Dbtr>', '<Dbtr><Pty><Nm>UAB Klientas</Nm></Pty></Dbtr>'), 'urn:iso:std:iso:20022:tech:xsd:camt.053.001.08');
  assert.equal(parseCamt053(v8, 1).rows[0].clientName, 'UAB Klientas');
  assert.equal(looksLikeXml('﻿  <?xml'), true); assert.equal(looksLikeXml('Data;Suma'), false);
  // balance without a closing figure: warning only
  const noBal = parseCamt053(file(statement({ balances: false })), 1);
  assert.deepEqual(noBal.errors, []); assert.ok(noBal.warnings.some(w => /nėra pradžios\/pabaigos likučių/.test(w)));
  // pending entries are skipped and not counted
  const pending = parseCamt053(file(statement({ entries: [entry({ ref: 'R1', amount: '10.00', dir: 'CRDT', date: '2026-10-05', name: 'A', info: 'x' }), entry({ ref: 'P1', amount: '99.00', dir: 'CRDT', date: '2026-10-06', name: 'B', info: 'y', sts: 'PDNG' })], opening: '0.00', closing: '10.00', closingDir: 'CRDT' })), 1);
  assert.deepEqual(pending.errors, []); assert.equal(pending.rows.length, 1); assert.ok(pending.warnings.some(w => /kurių bankas nepatvirtino/.test(w)));
  // the same booking reference keeps its hash when the file differs (re-export with extra rows)
  const first = parseCamt053(file(statement({ entries: [entry({ ref: 'R1', amount: '10.00', dir: 'CRDT', date: '2026-10-05', name: 'A', info: 'x' })], opening: '0.00', closing: '10.00', closingDir: 'CRDT' })), 1);
  const wider = parseCamt053(file(statement({ entries: [entry({ ref: 'R1', amount: '10.00', dir: 'CRDT', date: '2026-10-05', name: 'A', info: 'x' }), entry({ ref: 'R9', amount: '5.00', dir: 'CRDT', date: '2026-10-06', name: 'C', info: 'z' })], opening: '0.00', closing: '15.00', closingDir: 'CRDT' })), 1);
  assert.equal(first.rows[0].hash, wider.rows[0].hash);
  assert.notEqual(parseCamt053(file(statement({ entries: [entry({ ref: 'R1', amount: '10.00', dir: 'CRDT', date: '2026-10-05', name: 'A', info: 'x' })], opening: '0.00', closing: '10.00', closingDir: 'CRDT' })), 2).rows[0].hash, first.rows[0].hash);
});

test('camt.053 reader: zero-amount entries and entry references', () => {
  const zero = parseCamt053(file(statement({ entries: [entry({ ref: 'Z', amount: '0.00', dir: 'DBIT', date: '2026-10-05', name: 'Bank', info: 'fee 0' }), entry({ ref: 'R1', amount: '5.00', dir: 'CRDT', date: '2026-10-06', name: 'A', info: 'x' })], opening: '0.00', closing: '5.00', closingDir: 'CRDT' })), 1);
  assert.deepEqual(zero.errors, []); assert.equal(zero.rows.length, 1); assert.ok(zero.warnings.some(w => /0,00/.test(w)));
  // NtryRef alone is a per-statement counter on many banks: the same sequence number in another statement must not collide
  const seq = (n, date, amount, info) => `<Ntry><NtryRef>${n}</NtryRef><Amt Ccy="EUR">${amount}</Amt><CdtDbtInd>CRDT</CdtDbtInd><Sts>BOOK</Sts><BookgDt><Dt>${date}</Dt></BookgDt><NtryDtls><TxDtls><RmtInf><Ustrd>${info}</Ustrd></RmtInf></TxDtls></NtryDtls></Ntry>`;
  const jan = parseCamt053(file(statement({ entries: [seq(3, '2026-01-10', '10.00', 'januar')], opening: '0.00', closing: '10.00', closingDir: 'CRDT' })), 1);
  const feb = parseCamt053(file(statement({ entries: [seq(3, '2026-02-10', '10.00', 'februar')], opening: '0.00', closing: '10.00', closingDir: 'CRDT' })), 1);
  assert.deepEqual([jan.errors, feb.errors], [[], []]); assert.notEqual(jan.rows[0].hash, feb.rows[0].hash); assert.equal(jan.rows[0].reference, '3');
  // the same booking numbered differently in two overlapping exports still gets one hash
  const renumbered = parseCamt053(file(statement({ entries: [seq(17, '2026-01-10', '10.00', 'januar')], opening: '0.00', closing: '10.00', closingDir: 'CRDT' })), 1);
  assert.equal(jan.rows[0].hash, renumbered.rows[0].hash);
  // the same content exported twice still matches itself
  assert.equal(jan.rows[0].hash, parseCamt053(file(statement({ entries: [seq(3, '2026-01-10', '10.00', 'januar')], opening: '0.00', closing: '10.00', closingDir: 'CRDT' })), 1).rows[0].hash);
});

test('camt.053 reader refuses files it cannot trust', () => {
  const refused = {
    'balances do not reconcile': file(statement({ closing: '300.00' })),
    'wrong currency': file(statement({ ccy: 'USD' })),
    'entry currency': file(statement({ entries: [entry({ ref: 'X', amount: '5.00', ccy: 'USD', dir: 'CRDT', date: '2026-10-05', name: 'A', info: 'x' })], opening: '0.00', closing: '5.00', closingDir: 'CRDT' })),
    'no direction': file(statement({ entries: ['<Ntry><Amt Ccy="EUR">5.00</Amt><BookgDt><Dt>2026-10-05</Dt></BookgDt></Ntry>'], opening: '0.00', closing: '5.00', closingDir: 'CRDT' })),
    'bad date': file(statement({ entries: [entry({ ref: 'X', amount: '5.00', dir: 'CRDT', date: '2026-02-30', name: 'A', info: 'x' })], opening: '0.00', closing: '5.00', closingDir: 'CRDT' })),
    'doctype': '<?xml version="1.0"?><!DOCTYPE foo [<!ENTITY x "y">]><Document><BkToCstmrStmt/></Document>',
    'camt.052 report': '<Document><BkToCstmrAcctRpt><Rpt/></BkToCstmrAcctRpt></Document>',
    'not xml': '<broken', 'empty document': '<Document/>',
    'no iban': file(statement().replace('<IBAN>LT12 3456 7890 1234 5678</IBAN>', '')),
  };
  for (const [label, xml] of Object.entries(refused)) { const r = parseCamt053(xml, 1); assert.ok(r.errors.length, label); assert.equal(r.errors.length > 0 && r.rows.length >= 0, true); }
  assert.match(parseCamt053(file(statement({ closing: '300.00' })), 1).errors.join(' '), /nelygu pabaigos likučiui/);
  // an edited amount is caught by the balance check
  assert.ok(parseCamt053(file(statement()).replace('121.00', '122.00'), 1).errors.length);
});

test('bank import route accepts camt.053 end to end', async t => {
  try {
    db.prepare("INSERT INTO User(id,email,name,passwordHash,role,createdAt) VALUES(1,'c@example.test','C','unused','admin',datetime('now'))").run();
    jar.set('auth_session', auth.createSessionToken({ id: 1 })); jar.set('active_company_id', '1');
    const route = require('../src/app/api/bank/import/route.ts');
    const post = body => route.POST(request('POST', body));
    const xml = file(statement());

    await t.test('preview shows the account, statements and reconciliation; nothing is stored', async () => {
      const r = await post({ csv: xml }); const body = await r.json();
      assert.equal(r.status, 200); assert.equal(body.format, 'camt.053'); assert.equal(body.new, 3); assert.equal(body.statements[0].iban, 'LT123456789012345678'); assert.equal(body.statements[0].reconciled, true);
      assert.equal(db.prepare('SELECT COUNT(*) n FROM BankTransaction').get().n, 0);
    });
    await t.test('commit stores rows with the IBAN as account and bank reference; journal follows direction', async () => {
      const r = await post({ csv: xml, commit: true, account: 'ignored label' }); assert.equal(r.status, 200);
      const rows = db.prepare('SELECT date,sum,number,accountingBankInternalName a,clientName FROM BankTransaction ORDER BY id').all();
      assert.deepEqual(rows.map(x => [x.date, x.sum, x.number, x.a]), [['2026-10-05', 121, 'R1', 'LT123456789012345678'], ['2026-10-06', -60.5, 'R2', 'LT123456789012345678'], ['2026-10-07', -1400, 'R3', 'LT123456789012345678']]);
      assert.equal(db.prepare("SELECT COUNT(*) n FROM GeneralEntry WHERE sourceType='BANK'").get().n, 3);
      assert.deepEqual(db.prepare("SELECT debitAccount d, creditAccount c FROM GeneralEntry WHERE sourceType='BANK' AND amount=121").get(), { d: '2710', c: '2410' });
    });
    await t.test('re-import and an overlapping later export add nothing twice', async () => {
      const again = await (await post({ csv: xml, commit: true })).json(); assert.equal(again.new, 0); assert.equal(again.duplicates, 3);
      const overlapping = file(statement({ opening: '1000.00', closing: '339.50' }).replace('</Stmt>', entry({ ref: 'R4', amount: '0.01', dir: 'CRDT', date: '2026-10-08', name: 'X', info: 'y' }) + '</Stmt>').replace('339.50', '339.49'));
      const part = await (await post({ csv: overlapping, commit: true })).json(); assert.equal(part.new, 1); assert.equal(db.prepare('SELECT COUNT(*) n FROM BankTransaction').get().n, 4);
    });
    await t.test('rows that look like earlier imports (same date and amount, other key) need confirmation', async () => {
      db.prepare("INSERT INTO BankTransaction(companyId,date,sum,clientName,notes,correspondenceAccountCode) VALUES(1,'2026-11-02',77,'Senas','csv','2711')").run();
      const other = file(statement({ entries: [entry({ ref: 'N1', amount: '77.00', dir: 'CRDT', date: '2026-11-02', name: 'Naujas', info: 'camt' })], opening: '0.00', closing: '77.00', closingDir: 'CRDT' }));
      const preview = await (await post({ csv: other })).json(); assert.equal(preview.overlap, 1);
      const blocked = await post({ csv: other, commit: true }); assert.equal(blocked.status, 422); assert.match((await blocked.json()).error, /sutampa pagal datą ir sumą/);
      const before = db.prepare('SELECT COUNT(*) n FROM BankTransaction').get().n;
      assert.equal(before, 5);
      const ok = await post({ csv: other, commit: true, acknowledgeOverlap: true }); assert.equal(ok.status, 200);
      assert.equal(db.prepare('SELECT COUNT(*) n FROM BankTransaction').get().n, 6);
    });
    await t.test('overlap is not reported for a new booking that merely shares date and amount with one already stored from the same file', async () => {
      const day = '2026-12-01';
      const a = file(statement({ entries: [entry({ ref: 'D1', amount: '10.00', dir: 'CRDT', date: day, name: 'A', info: 'one' })], opening: '0.00', closing: '10.00', closingDir: 'CRDT' }));
      assert.equal((await post({ csv: a, commit: true })).status, 200);
      const b = file(statement({ entries: [entry({ ref: 'D1', amount: '10.00', dir: 'CRDT', date: day, name: 'A', info: 'one' }), entry({ ref: 'D2', amount: '10.00', dir: 'CRDT', date: day, name: 'B', info: 'two' })], opening: '0.00', closing: '20.00', closingDir: 'CRDT' }));
      const preview = await (await post({ csv: b })).json();
      assert.equal(preview.new, 1); assert.equal(preview.overlap, 0);
      assert.equal((await post({ csv: b, commit: true })).status, 200);
      // a booking stored with a time of day on the last day of the range is still compared
      db.prepare("INSERT INTO BankTransaction(companyId,date,sum,clientName,correspondenceAccountCode) VALUES(1,'2026-12-05 08:30:00',33,'x','2711')").run();
      const c = file(statement({ entries: [entry({ ref: 'D5', amount: '33.00', dir: 'CRDT', date: '2026-12-05', name: 'C', info: 'three' })], opening: '0.00', closing: '33.00', closingDir: 'CRDT' }));
      assert.equal((await (await post({ csv: c })).json()).overlap, 1);
      db.prepare("DELETE FROM BankTransaction WHERE date LIKE '2026-12-05 %'").run();
    });
    await t.test('a tampered file and another company are handled separately', async () => {
      const bad = await post({ csv: file(statement({ closing: '1.00' })), commit: true }); assert.equal(bad.status, 422); assert.equal(db.prepare('SELECT COUNT(*) n FROM BankTransaction').get().n, 8);
      jar.set('active_company_id', '2'); const other = await (await post({ csv: xml, commit: true })).json(); assert.equal(other.new, 3); jar.set('active_company_id', '1');
    });
  } finally { db.close(); fs.rmSync(temp, { recursive: true, force: true }); }
});
