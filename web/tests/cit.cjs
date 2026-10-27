const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const ts = require('typescript');
const Database = require('better-sqlite3');
// Temporary database only: the project database is never opened by this test.
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'erp-cit-'));
process.env.DATABASE_URL = 'file:' + path.join(temp, 'test.db');
const fixture = new Database(process.env.DATABASE_URL.slice(5));
fixture.exec(fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8'));
fixture.close();
require.extensions['.ts'] = (mod, filename) => mod._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText, filename);
const { rules } = require('../src/lib/rules/index.ts');
const { computePnl } = require('../src/lib/financial-statements-calc.ts');
const nameOf = c => 'A' + c;
const entries = [{ date: '2026-01-01', debitAccount: '2410', creditAccount: '5001', amount: 1000 }];

test('cit: rate by year', () => {
  assert.equal(rules.at('cit.rate.standard', '2024-12-31'), 15);
  assert.equal(rules.at('cit.rate.standard', '2025-01-01'), 16);
  assert.equal(rules.at('cit.rate.standard', '2025-12-31'), 16);
  assert.equal(rules.at('cit.rate.standard', '2026-01-01'), 17);
  assert.equal(rules.entryAt('cit.rate.standard', '2026-06-30').status, 'provisional');
  for (const [year, rate] of [['2024', 0.15], ['2025', 0.16], ['2026', 0.17]]) {
    const pnl = computePnl(entries, nameOf, year);
    assert.equal(pnl.taxRate, rate);
    assert.equal(Math.round(pnl.estimatedTax * 100) / 100, Math.round(1000 * rate * 100) / 100);
  }
  const unknown = computePnl(entries, nameOf);
  assert.equal(unknown.taxRate, computePnl(entries, nameOf, 'ALL').taxRate);
  assert.equal(computePnl([{ ...entries[0], debitAccount: '5001', creditAccount: '2410' }], nameOf, '2026').estimatedTax, 0);
});
