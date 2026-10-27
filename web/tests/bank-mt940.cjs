const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');
const Database = require('better-sqlite3');
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'erp-mt940-'));
process.env.DATABASE_URL = 'file:' + path.join(temp, 'test.db');
const fixture = new Database(process.env.DATABASE_URL.slice(5));
fixture.exec(fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8'));
const company = fixture.prepare("INSERT INTO Company (id, name, code, currencyCode, isDefault, createdAt, updatedAt) VALUES (?, ?, ?, 'EUR', 0, datetime('now'), datetime('now'))");
company.run(1, 'Company A', '111');
company.run(2, 'Company B', '222');
fixture.close();
const jar = new Map();
const realLoad = Module._load;
Module._load = function (name, parent, isMain) {
  if (name === 'next/headers') return { cookies: async () => ({ get: key => jar.has(key) ? { value: jar.get(key) } : undefined }) };
  if (name === 'next/navigation') return { redirect: url => { throw new Error('redirect:' + url); } };
  if (name.startsWith('@/')) name = path.join(__dirname, '../src', name.slice(2));
  return realLoad.call(this, name, parent, isMain);
};
require.extensions['.ts'] = (mod, filename) => mod._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText, filename);
const auth = require('../src/lib/auth.ts');
const { getDb } = require('../src/lib/db.ts');
const { parseMt940, looksLikeMt940 } = require('../src/lib/bank-mt940.ts');
const db = getDb();
const request = (method, body) => new Request('http://localhost:3000/api/test', { method, headers: { 'Content-Type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}) });

const statement = (o = {}) => [
  ':20:STMT1', `:25:${o.account || 'LT123456789012345678'}/EUR`, ':28C:1/1', `:60F:${o.opening || 'C261001EUR1000,00'}`,
  ...(o.entries || [
    ':61:2610051005C121,00NTRFNONREF//BANK-1', ':86:?00Pavedimas?20Apmokėjimas už SF 123?32UAB Klientas ir Ko',
    ':61:2610061006D60,50NTRFNONREF//BANK-2', ':86:/NAME/Tiekėjas/REMI/Sąskaita TIEK-7/',
    ':61:261007D1400,00NMSCINV-7', ':86:Išmoka asmeniui',
  ]),
  `:62F:${o.closing || 'D261007EUR339,50'}`, '-',
].join('\r\n');

test('MT940 reader', () => {
  const ok = parseMt940(statement(), 1);
  assert.deepEqual(ok.errors, []); assert.equal(ok.rows.length, 3);
  assert.deepEqual(ok.rows.map(r => [r.date, r.sum, r.account, r.reference]), [['2026-10-05', 121, 'LT123456789012345678', 'BANK-1'], ['2026-10-06', -60.5, 'LT123456789012345678', 'BANK-2'], ['2026-10-07', -1400, 'LT123456789012345678', 'INV-7']]);
  assert.equal(ok.rows[0].clientName, 'UAB Klientas ir Ko'); assert.equal(ok.rows[0].details, 'Apmokėjimas už SF 123');
  assert.equal(ok.rows[1].clientName, 'Tiekėjas'); assert.equal(ok.rows[1].details, 'Sąskaita TIEK-7'); assert.equal(ok.rows[2].details, 'Išmoka asmeniui');
  assert.equal(ok.statements[0].reconciled, true); assert.equal(ok.statements[0].opening, 1000); assert.equal(ok.statements[0].closing, -339.5);
  assert.equal(new Set(ok.rows.map(r => r.hash)).size, 3);
  assert.equal(looksLikeMt940(statement()), true); assert.equal(looksLikeMt940('Data;Suma\n2026-01-01;5'), false); assert.equal(looksLikeMt940('<?xml ?>'), false);
  // the same booking in a later overlapping export keeps its hash (bank reference); a SWIFT envelope is tolerated
  const wrapped = '{1:F01BANKLT22AXXX0000000000}{2:O9401200261008BANKLT22AXXX00000000002610081200N}{4:\r\n' + statement().replace(/-$/, '-}');
  assert.deepEqual(parseMt940(wrapped, 1).errors, []);
  assert.equal(parseMt940(wrapped, 1).rows[0].hash, ok.rows[0].hash);
  assert.notEqual(parseMt940(statement(), 2).rows[0].hash, ok.rows[0].hash);
});

test('MT940 reader: reversals, year change, several statements, multi-line details', () => {
  const rev = parseMt940(statement({ entries: [':61:261010RC25,00NTRFNONREF//B1', ':86:Atšaukimas', ':61:261011RD10,00NTRFNONREF//B2', ':86:Atšaukimas 2'], opening: 'C261001EUR100,00', closing: 'C261011EUR85,00' }), 1);
  assert.deepEqual(rev.errors, []); assert.deepEqual(rev.rows.map(r => r.sum), [-25, 10]);
  const ny = parseMt940(statement({ entries: [':61:2601020101C5,00NTRFNONREF//N1', ':86:x', ':61:2601020103C1,00NTRFNONREF//N2', ':86:y'], opening: 'C251231EUR0,00', closing: 'C260102EUR6,00' }), 1);
  assert.deepEqual(ny.errors, []); assert.deepEqual(ny.rows.map(r => r.date), ['2026-01-01', '2026-01-03']); // MMDD entry date next to a value date
  const dec = parseMt940(statement({ entries: [':61:2601021231C5,00NTRFNONREF//N1', ':86:x'], opening: 'C251231EUR0,00', closing: 'C260102EUR5,00' }), 1);
  assert.equal(dec.rows[0].date, '2025-12-31'); // entry date 31 Dec belongs to the previous year
  const two = parseMt940(statement() + '\r\n' + statement({ account: 'LT999999999999999999', entries: [':61:261020C1,00NTRFNONREF//X1', ':86:z'], opening: 'C261019EUR0,00', closing: 'C261020EUR1,00' }), 1);
  assert.deepEqual(two.errors, []); assert.equal(two.statements.length, 2); assert.equal(two.rows.length, 4);
  const long = parseMt940(statement({ entries: [':61:261005C1,00NTRFNONREF//L1', ':86:?20Pirma dalis?21 antra dalis?32UAB', '?33 Ilgas Vardas?60 trečia'], opening: 'C261001EUR0,00', closing: 'C261005EUR1,00' }), 1);
  assert.equal(long.rows[0].details, 'Pirma dalis antra dalis trečia'); assert.equal(long.rows[0].clientName, 'UAB Ilgas Vardas');
});

test('MT940 reader refuses files it cannot trust', () => {
  const bad = (text, pattern) => { const r = parseMt940(text, 1); assert.ok(r.errors.some(e => pattern.test(e)), r.errors.join('|')); };
  bad(statement({ closing: 'C261007EUR1000,00' }), /nelygu pabaigos likučiui/); // entries missing or edited
  bad(statement({ opening: 'C261001USD1000,00' }), /priimamos tik EUR sąskaitos/);
  bad(statement({ entries: [':61:garbage', ':86:x'] }), /nepavyko išanalizuoti lauko :61:/);
  bad(statement({ entries: [':61:261340C1,00NTRFNONREF//B', ':86:x'] }), /neteisinga data/);
  bad(statement().replace(':25:LT123456789012345678/EUR', ':25:'), /nenurodyta sąskaita/);
  bad(statement({ opening: 'X261001EUR1000,00' }), /neteisingas likutis/);
  assert.ok(parseMt940('hello', 1).errors.length);
  assert.ok(parseMt940('x'.repeat(8_000_001), 1).errors.some(e => /per didelis/.test(e)));
  const noBalances = parseMt940(statement().replace(/:60F:.*\r\n/, '').replace(/:62F:.*\r\n/, ''), 1);
  assert.deepEqual(noBalances.errors, []); assert.ok(noBalances.warnings.some(w => /nėra pradžios\/pabaigos likučių/.test(w)));
});

test('bank import route accepts MT940 end to end', async t => {
  try {
    db.prepare("INSERT INTO User(id,email,name,passwordHash,role,createdAt) VALUES(1,'c@example.test','C','unused','admin',datetime('now'))").run();
    jar.set('auth_session', auth.createSessionToken({ id: 1 })); jar.set('active_company_id', '1');
    const route = require('../src/app/api/bank/import/route.ts');
    const post = body => route.POST(request('POST', body));
    const text = statement();
    await t.test('preview detects the format and stores nothing', async () => {
      const r = await post({ csv: text }); const body = await r.json();
      assert.equal(r.status, 200); assert.equal(body.format, 'mt940'); assert.equal(body.new, 3); assert.equal(body.statements[0].reconciled, true);
      assert.equal(db.prepare('SELECT COUNT(*) n FROM BankTransaction').get().n, 0);
    });
    await t.test('commit stores rows with the IBAN as account; journal follows direction; re-import adds nothing', async () => {
      assert.equal((await post({ csv: text, commit: true })).status, 200);
      assert.deepEqual(db.prepare('SELECT date,sum,number,accountingBankInternalName a FROM BankTransaction ORDER BY id').all().map(x => [x.date, x.sum, x.number, x.a]), [['2026-10-05', 121, 'BANK-1', 'LT123456789012345678'], ['2026-10-06', -60.5, 'BANK-2', 'LT123456789012345678'], ['2026-10-07', -1400, 'INV-7', 'LT123456789012345678']]);
      assert.equal(db.prepare("SELECT COUNT(*) n FROM GeneralEntry WHERE sourceType='BANK'").get().n, 3);
      const again = await (await post({ csv: text, commit: true })).json(); assert.equal(again.new, 0); assert.equal(again.duplicates, 3);
      assert.equal(db.prepare('SELECT COUNT(*) n FROM BankTransaction').get().n, 3);
    });
    await t.test('a file whose balances do not add up is refused whole', async () => {
      const r = await post({ csv: statement({ closing: 'C261007EUR5,00' }), commit: true }); assert.equal(r.status, 422);
      assert.equal(db.prepare('SELECT COUNT(*) n FROM BankTransaction').get().n, 3);
    });
  } finally { db.close(); fs.rmSync(temp, { recursive: true, force: true }); }
});
