const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const ts = require('typescript');
const Database = require('better-sqlite3');
// Temporary database only: the project database is never opened by this test.
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'erp-assets-'));
process.env.DATABASE_URL = 'file:' + path.join(temp, 'test.db');
const fixture = new Database(process.env.DATABASE_URL.slice(5));
fixture.exec(fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8'));
fixture.close();
const options = { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true };
require.extensions['.ts'] = (mod, filename) => mod._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: options }).outputText, filename);
const fa = require('../src/lib/fixed-assets.ts');
const { rules } = require('../src/lib/rules');
const { getDb } = require('../src/lib/db.ts');
const db = getDb();
after(() => { db.close(); fs.rmSync(temp, { recursive: true, force: true }); });
const addCompany = db.prepare("INSERT INTO Company (id, name, code, currencyCode, isDefault, createdAt, updatedAt) VALUES (?, ?, ?, 'EUR', 0, datetime('now'), datetime('now'))");
addCompany.run(1, 'A', '1');
addCompany.run(2, 'B', '2');
const base = { code: 'A1', name: 'Staklės', category: 'MACHINERY', acquisitionDate: '2025-01-10', commissioningDate: '2025-01-15', cost: 1200, usefulLifeMonths: 12 };
const entries = (id) => db.prepare("SELECT * FROM GeneralEntry WHERE sourceType='FIXED_ASSET' AND sourceId IN (SELECT id FROM FixedAssetPosting WHERE assetId=?) ORDER BY date,id").all(id);

test('fixed assets: depreciation schedule and rules', () => {
  // Parameters come from the rules registry, with provenance.
  assert.equal(fa.capitalizationThreshold('2025-01-15'), rules.number('assets.capitalization.minCost', '2025-01-15'));
  assert.equal(fa.decliningFactor('2025-01-15'), 2);
  assert.equal(fa.taxLifeMonths('COMPUTER', '2025-01-15'), 36);
  // Depreciation starts the month after commissioning.
  assert.equal(fa.firstPeriod('2025-01-15'), '2025-02');
  assert.equal(fa.firstPeriod('2025-12-31'), '2026-01');
  const id = fa.createAsset(db, 1, { ...base, residualValue: 0 }, null);
  assert.deepEqual(fa.postDepreciation(db, 1, '2025-04', null), { posted: 3, total: 300 });
  const ledger = entries(id);
  assert.deepEqual(ledger.map(e => e.date), ['2025-02-28', '2025-03-31', '2025-04-30']);
  assert.ok(ledger.every(e => e.amount === 100 && e.debitAccount === '6306' && e.creditAccount === '1209'));
  // Idempotent: a second run posts nothing new.
  assert.equal(fa.postDepreciation(db, 1, '2025-04', null).posted, 0);
  assert.equal(entries(id).length, 3);
  // The full life sums exactly to cost minus residual.
  fa.postDepreciation(db, 1, '2026-10', null);
  const card = fa.assetDetails(db, 1, id).asset;
  assert.equal(card.accumulated, 1200);
  assert.equal(card.bookValue, 0);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM FixedAssetPosting WHERE assetId=?').get(id).n, 12);
});

test('fixed assets: residual value, rounding and declining balance', () => {
  const sl = fa.projectSchedule({ costC: 100000, residualC: 10000, accumulatedC: 0, lifeMonths: 7, monthIndex: 0, method: 'STRAIGHT_LINE', factor: 2 }, '2025-02');
  assert.equal(sl.length, 7);
  assert.equal(Math.round(sl.reduce((s, r) => s + r.amount, 0) * 100), 90000);
  assert.equal(sl.at(-1).bookValueAfter, 100);
  const dbm = fa.projectSchedule({ costC: 120000, residualC: 0, accumulatedC: 0, lifeMonths: 36, monthIndex: 0, method: 'DECLINING_BALANCE', factor: 2 }, '2025-02');
  assert.ok(dbm[0].amount > 1200 / 36);
  assert.ok(dbm[0].amount > dbm.at(-1).amount);
  assert.equal(dbm.length, 36);
  assert.equal(dbm.at(-1).bookValueAfter, 0);
});

test('fixed assets: settings default, override with audit trail, lock and disposal', () => {
  assert.equal(fa.getSettings(db, 1).defaultMethod, 'STRAIGHT_LINE');
  fa.setSettings(db, 1, { defaultMethod: 'DECLINING_BALANCE' }, null);
  const id = fa.createAsset(db, 1, { ...base, code: 'B1', category: 'COMPUTER', cost: 3600, usefulLifeMonths: undefined }, null);
  const card = fa.assetDetails(db, 1, id).asset;
  assert.equal(card.method, 'DECLINING_BALANCE');
  assert.equal(card.usefulLifeMonths, 36);
  assert.equal(card.decliningFactor, 2);
  assert.throws(() => fa.assetDetails(db, 2, id), /nerastas/);
  fa.postDepreciation(db, 1, '2025-03', null, id);
  // An override needs a reason and is logged; the posted history is kept.
  assert.throws(() => fa.updateAsset(db, 1, id, { method: 'STRAIGHT_LINE' }, 7), /priežast/);
  assert.throws(() => fa.updateAsset(db, 1, id, { cost: 5000 }, 7), /keisti negalima/);
  assert.deepEqual(fa.updateAsset(db, 1, id, { method: 'STRAIGHT_LINE', usefulLifeMonths: 24, reason: 'Apskaitos politika' }, 7), ['method', 'usefulLifeMonths', 'decliningFactor']);
  const log = fa.assetDetails(db, 1, id).changes;
  assert.deepEqual(log.map(c => [c.field, c.oldValue, c.newValue, c.reason]), [['method', 'DECLINING_BALANCE', 'STRAIGHT_LINE', 'Apskaitos politika'], ['usefulLifeMonths', '36', '24', 'Apskaitos politika'], ['decliningFactor', '2', null, 'Apskaitos politika']]);
  assert.throws(() => db.prepare('UPDATE FixedAssetChange SET reason=? WHERE assetId=?').run('x', id), /FIXED_ASSET_CHANGE_IMMUTABLE/);
  assert.ok(fa.assetDetails(db, 1, id).asset.warnings.includes('lifeBelowTax'));
  // A closed period rejects postings.
  db.prepare("INSERT INTO AccountingLock(companyId,lockedThrough) VALUES(1,'2025-04-30') ON CONFLICT(companyId) DO UPDATE SET lockedThrough='2025-04-30'").run();
  assert.throws(() => fa.postDepreciation(db, 1, '2025-04', null, id), /ACCOUNTING_PERIOD_LOCKED/);
  db.prepare('UPDATE AccountingLock SET lockedThrough=NULL WHERE companyId=1').run();
  // Disposal: depreciation up to the disposal month, then write-off of the book value.
  const out = fa.disposeAsset(db, 1, id, { date: '2025-05-20', reason: 'Sugedo', proceeds: 100 }, null);
  const postings = fa.assetDetails(db, 1, id).postings;
  assert.equal(postings.filter(p => p.kind === 'DEPRECIATION').length, 4);
  assert.equal(Math.round((out.accumulated + out.bookValue) * 100), 360000);
  assert.equal(out.gain, Math.round((100 - out.bookValue) * 100) / 100);
  assert.equal(fa.postDepreciation(db, 1, '2026-10', null, id).posted, 0);
  assert.throws(() => fa.deleteAsset(db, 1, id), /ištrinti negalima/);
  fa.cancelDisposal(db, 1, id, null);
  assert.equal(fa.assetDetails(db, 1, id).asset.disposedAt, null);
});
