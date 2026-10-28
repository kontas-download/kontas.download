const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');
const Database = require('better-sqlite3');

// Temporary database only; the working database is never opened.
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'erp-pln204-'));
process.env.DATABASE_URL = 'file:' + path.join(temp, 'test.db');
const fixture = new Database(process.env.DATABASE_URL.slice(5));
fixture.exec(fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8'));
fixture.close();

const realLoad = Module._load;
Module._load = function (name, parent, isMain) {
  if (name === 'next/headers') return { cookies: async () => ({ get: () => undefined }) };
  if (name === 'next/navigation')
    return {
      redirect: url => {
        throw new Error('redirect:' + url);
      },
    };
  if (name.startsWith('@/')) name = path.join(__dirname, '../src', name.slice(2));
  return realLoad.call(this, name, parent, isMain);
};
require.extensions['.ts'] = (mod, filename) =>
  mod._compile(
    ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
    }).outputText,
    filename,
  );

const { getDb } = require('../src/lib/db.ts');
const { pln204Draft, pln204DueDate } = require('../src/lib/pln204.ts');

const db = getDb();
after(() => {
  db.close();
  fs.rmSync(temp, { recursive: true, force: true });
});

db.prepare(
  "INSERT INTO Company (id, name, code, currencyCode, isDefault, createdAt, updatedAt) VALUES (1, 'UAB Pelnas', '111111111', 'EUR', 0, datetime('now'), datetime('now'))",
).run();

test('pln204: computes revenue (f18), profit before tax (f19), adjustments (f20, f26, f45) and 2026 standard CIT 17%', () => {
  db.prepare(
    "INSERT INTO GeneralEntry (companyId, date, description, debitAccount, creditAccount, amount, createdAt) VALUES (1, '2026-06-15', 'Pardavimo pajamos', '2410', '5000', 100000, datetime('now'))",
  ).run();
  db.prepare(
    "INSERT INTO GeneralEntry (companyId, date, description, debitAccount, creditAccount, amount, createdAt) VALUES (1, '2026-06-20', 'Veiklos sąnaudos', '6312', '2710', 40000, datetime('now'))",
  ).run();

  const d = pln204Draft(db, 1, 2026, { f20: 2000, f26: 1000, f45: 1000, tariffCode: '1' });
  assert.equal(d.fields.f18, 100000);
  assert.equal(d.fields.f19, 60000);
  assert.equal(d.fields.f20, 2000);
  assert.equal(d.fields.f26, 1000);
  assert.equal(d.fields.f37, 61000); // 60000 + 2000 - 1000
  assert.equal(d.fields.f40, 61000);
  assert.equal(d.fields.f45, 1000);
  assert.equal(d.fields.f48, 60000); // 61000 - 1000
  assert.equal(d.fields.f52, 60000);
  assert.equal(d.fields.f53a, '1');
  assert.equal(d.fields.f54a, 17); // 2026 standard CIT rate
  assert.equal(d.fields.f55, 10200); // 60000 * 17%
  assert.equal(d.fields.f62, 10200);
  assert.equal(d.fields.f64, -10200);
});

test('pln204: caps operating loss deduction (f45) at 70% of f43 for standard tariff and supports reduced tariffCode 2', () => {
  const std = pln204Draft(db, 1, 2026, { f45: 50000, tariffCode: '1' });
  // f43 = 60000 -> 70% cap is 42000
  assert.equal(std.fields.f45, 42000);
  assert.equal(std.fields.f48, 18000);
  assert.ok(std.notes.some(n => n.includes('70 %')));

  const small = pln204Draft(db, 1, 2026, { f45: 10000, tariffCode: '2' });
  assert.equal(small.fields.f45, 10000);
  assert.equal(small.fields.f48, 50000);
  assert.equal(small.fields.f53a, '2');
  assert.equal(small.fields.f54a, 7);
  assert.equal(small.fields.f55, 3500);
});

test('pln204: filing deadline is 15 June of the next year', () => {
  assert.equal(pln204DueDate(2026), '2027-06-15');
  assert.equal(pln204DueDate(2025), '2026-06-15');
});
