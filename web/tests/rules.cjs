const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');
const Database = require('better-sqlite3');
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'erp-rules-'));
process.env.DATABASE_URL = 'file:' + path.join(temp, 'test.db');
const fixture = new Database(process.env.DATABASE_URL.slice(5));
fixture.exec(fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8'));
fixture.prepare("INSERT INTO Company (id, name, code, currencyCode, isDefault, createdAt, updatedAt) VALUES (1, 'Company A', '111', 'EUR', 0, datetime('now'), datetime('now'))").run();
fixture.close();
const jar = new Map();
const realLoad = Module._load;
Module._load = function (name, parent, isMain) {
  if (name === 'next/headers') return { cookies: async () => ({ get: key => jar.has(key) ? { value: jar.get(key) } : undefined }), headers: async () => new Headers() };
  if (name === 'next/navigation') return { redirect: url => { throw new Error('redirect:' + url); } };
  if (name.startsWith('@/')) name = path.join(__dirname, '../src', name.slice(2));
  return realLoad.call(this, name, parent, isMain);
};
const options = { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true, jsx: ts.JsxEmit.ReactJSX };
require.extensions['.ts'] = (mod, filename) => mod._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: options }).outputText, filename);
require.extensions['.tsx'] = (mod, filename) => mod._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: options, fileName: filename }).outputText, filename);

const { rules, rulesFreshness, auditRules, TAX_RULES_AS_OF, REGISTRY_FROM } = require('../src/lib/rules/index.ts');
const { domesticTaxCode } = require('../src/lib/isaf.ts');
const { monthlyDueDate } = require('../src/lib/fr0600.ts');
const { TAX_CODES } = require('../src/lib/tax-codes.ts');
const { helpSourceById } = require('../src/lib/help/sources.ts');
const auth = require('../src/lib/auth.ts');
const { getDb } = require('../src/lib/db.ts');
const db = getDb();
after(() => { db.close(); fs.rmSync(temp, { recursive: true, force: true }); });

const ISO = /^\d{4}-\d{2}-\d{2}$/;
const entry = (id, date = '2026-06-01') => rules.entryAt(id, date);

// Control examples: the title of each test below is the `example` of a registry entry.
test('rules: vat.rate.standard', () => {
  assert.equal(rules.at('vat.rate.standard', '2026-06-01'), 21);
  assert.equal(domesticTaxCode(21, '2026-06-01'), 'PVM1');
  assert.equal(domesticTaxCode(21, '2017-01-01'), 'PVM1');
});
test('rules: vat.rate.reduced9', () => {
  assert.equal(rules.at('vat.rate.reduced9', '2026-06-01'), 9);
  assert.equal(domesticTaxCode(9, '2026-06-01'), 'PVM2');
});
test('rules: vat.rate.reduced5', () => {
  assert.equal(rules.at('vat.rate.reduced5', '2026-06-01'), 5);
  assert.equal(domesticTaxCode(5, '2026-06-01'), 'PVM3');
});
test('rules: vat.rate.reduced12 is valid from 2026-01-01, not on 2025-12-31', () => {
  assert.throws(() => rules.at('vat.rate.reduced12', '2025-12-31'), /vat\.rate\.reduced12.*2025-12-31.*negalioja/);
  assert.equal(rules.at('vat.rate.reduced12', '2026-01-01'), 12);
  assert.equal(domesticTaxCode(12, '2025-12-31'), null);
  assert.equal(domesticTaxCode(12, '2026-01-01'), 'PVM58');
  // A Date is read as the calendar date in Vilnius: 2025-12-31 22:30 UTC is already 2026-01-01 there.
  assert.equal(rules.at('vat.rate.reduced12', new Date('2025-12-31T22:30:00Z')), 12);
  assert.throws(() => rules.at('vat.rate.reduced12', new Date('2025-12-31T21:30:00Z')), /negalioja/);
});
test('rules: vat.return.dueDay', () => {
  assert.equal(rules.at('vat.return.dueDay', '2026-01-31'), 25);
  assert.equal(monthlyDueDate('2026-01-01', '2026-01-31'), '2026-02-25');
  assert.equal(monthlyDueDate('2026-12-01', '2026-12-31'), '2027-01-25');
  assert.equal(monthlyDueDate('2026-01-01', '2026-03-31'), null);
});
test('rules: isaf.taxCodes.catalogue matches the registry rates of the automatic domestic codes', () => {
  assert.equal(rules.at('isaf.taxCodes.catalogue', '2026-06-01'), 'lib/tax-codes.ts TAX_CODES');
  const byCode = new Map(TAX_CODES.map(d => [d.code, d]));
  for (const [id, code] of [['vat.rate.standard', 'PVM1'], ['vat.rate.reduced9', 'PVM2'], ['vat.rate.reduced5', 'PVM3'], ['vat.rate.reduced12', 'PVM58']]) {
    const e = entry(id);
    assert.equal(byCode.get(code).sale.rate, e.value, code);
    assert.equal(byCode.get(code).purchase.rate, e.value, code);
    assert.equal(byCode.get(code).sale.from || REGISTRY_FROM, e.effectiveFrom, code);
  }
});

test('rules: payroll rates reach the payroll form from the server page (payroll.gpm.rate, payroll.sodra.employee, payroll.sodra.employer)', async () => {
  assert.equal(rules.at('payroll.gpm.rate', '2026-06-01'), 20);
  assert.equal(rules.at('payroll.sodra.employee', '2026-06-01'), 19.5);
  assert.equal(rules.at('payroll.sodra.employer', '2026-06-01'), 1.77);
  // The client divides by 100: the result must be the same numbers the form used before the registry.
  assert.equal(20 / 100, 0.2); assert.equal(19.5 / 100, 0.195); assert.equal(1.77 / 100, 0.0177);
  db.prepare("INSERT OR IGNORE INTO User(id,email,name,passwordHash,role,createdAt) VALUES(2,'acc@example.test','A','unused','accountant',datetime('now'))").run();
  jar.set('auth_session', auth.createSessionToken({ id: 2 })); jar.set('active_company_id', '1');
  const page = require('../src/app/payrolls/page.tsx').default;
  const element = await page();
  assert.deepEqual(element.props.payrollRules, { gpm: 20, sodraEmployee: 19.5, sodraEmployer: 1.77 });
  jar.clear();
});

test('rules: calendar deadlines in the tax calendar (calendar.fr0564.dueDay, calendar.gpm313.dueDay, calendar.gpm312.due, calendar.pln204.due)', async () => {
  db.prepare("INSERT OR IGNORE INTO User(id,email,name,passwordHash,role,createdAt) VALUES(1,'adm@example.test','C','unused','admin',datetime('now'))").run();
  jar.set('auth_session', auth.createSessionToken({ id: 1 })); jar.set('active_company_id', '1');
  const route = require('../src/app/api/tax-calendar/route.ts');
  const put = body => route.PUT(new Request('http://localhost:3000/api/tax-calendar', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }));
  for (const code of ['FR0564', 'GPM313', 'GPM312', 'PLN204']) assert.equal((await put({ code, enabled: true })).status, 200, code);
  const { calendarEvents } = require('../src/lib/tax-calendar.ts');
  const events = calendarEvents(db, 1, '2026-01-01', '2026-12-31');
  const due = code => events.filter(e => e.code === code).map(e => e.dueNominal);
  assert.equal(due('FR0564')[0], '2026-01-25');
  assert.equal(events.find(e => e.code === 'FR0564').source, 'VMI lentelė FR0600 + i.SAF: iki kito mėnesio 25 d.');
  assert.deepEqual(due('GPM313').slice(0, 2), ['2026-01-15', '2026-02-15']);
  assert.deepEqual(due('GPM312'), ['2026-02-15']);
  assert.deepEqual(due('PLN204'), ['2026-06-15']);
  jar.clear();
});

test('every entry has a title, basis, status, check and review dates and an example; periods of one id do not overlap', () => {
  const list = rules.list();
  assert.ok(list.length >= 13);
  for (const e of list) {
    assert.match(e.id, /^[a-z]+(\.[a-zA-Z0-9]+)+$/, e.id);
    for (const lang of ['lt', 'ru', 'en']) assert.ok(e.title[lang]?.trim(), `${e.id}: title ${lang}`);
    assert.ok(['percent', 'dayOfMonth', 'nextYearDate', 'reference', 'eur', 'factor', 'years'].includes(e.unit), e.id);
    assert.ok(e.basis && e.basis.actTitle.trim(), `${e.id}: basis`);
    if (e.basis.sourceId) assert.ok(helpSourceById.has(e.basis.sourceId), `${e.id}: unknown source ${e.basis.sourceId}`);
    if (e.basis.url) assert.match(e.basis.url, /^https:\/\//);
    assert.ok(['verified', 'provisional'].includes(e.status), e.id);
    for (const key of ['effectiveFrom', 'verifiedOn', 'reviewBy']) assert.match(e[key], ISO, `${e.id}: ${key}`);
    if (e.effectiveTo !== null) { assert.match(e.effectiveTo, ISO); assert.ok(e.effectiveTo >= e.effectiveFrom, e.id); }
    assert.ok(e.verifiedBy.trim(), `${e.id}: verifiedBy`);
    assert.ok(e.reviewBy >= e.verifiedOn, `${e.id}: reviewBy before verifiedOn`);
    assert.ok(e.example.trim(), `${e.id}: example`);
    if (['percent', 'dayOfMonth', 'eur', 'factor', 'years'].includes(e.unit)) assert.equal(typeof e.value, 'number', e.id);
    if (e.unit === 'nextYearDate') assert.match(String(e.value), /^\d{2}-\d{2}$/, e.id);
  }
  for (const id of rules.ids()) {
    const history = rules.history(id);
    for (let i = 1; i < history.length; i++) {
      const prev = history[i - 1];
      assert.ok(prev.effectiveTo !== null && prev.effectiveTo < history[i].effectiveFrom, `${id}: periods overlap`);
    }
  }
  // Statuses of the initial registry: VAT rates and the catalogue verified, deadlines and payroll rates provisional.
  for (const id of ['vat.rate.standard', 'vat.rate.reduced9', 'vat.rate.reduced5', 'vat.rate.reduced12', 'isaf.taxCodes.catalogue']) assert.equal(entry(id).status, 'verified', id);
  for (const id of ['payroll.gpm.rate', 'payroll.sodra.employee', 'payroll.sodra.employer', 'vat.return.dueDay']) assert.equal(entry(id).status, 'provisional', id);
});

test('every example is the title of a test in tests/*.cjs', () => {
  const titles = [];
  for (const file of fs.readdirSync(__dirname).filter(f => f.endsWith('.cjs'))) {
    const text = fs.readFileSync(path.join(__dirname, file), 'utf8');
    for (const m of text.matchAll(/\b(?:test|t\.test)\(\s*(['"`])(.*?)\1/g)) titles.push(m[2]);
  }
  for (const e of rules.list()) {
    assert.ok(titles.some(title => title.includes(e.example)), `${e.id}: no test titled "${e.example}"`);
  }
});

test('at() throws clear errors for an unknown id, a bad date and a date without a valid entry', () => {
  assert.throws(() => rules.at('vat.rate.unknown', '2026-01-01'), /nežinoma taisyklė „vat\.rate\.unknown“/);
  assert.throws(() => rules.at('vat.rate.standard', '2026-02-30'), /neteisinga data/);
  assert.throws(() => rules.at('vat.rate.standard', ''), /neteisinga data/);
  assert.throws(() => rules.at('payroll.gpm.rate', '2018-12-31'), /payroll\.gpm\.rate.*negalioja/);
  assert.throws(() => rules.number('calendar.gpm312.due', '2026-01-01'), /nėra skaičius/);
  // Before the start of the registry a date is answered as of REGISTRY_FROM (the behaviour of the calculators before the registry).
  assert.equal(rules.at('vat.rate.standard', '2010-01-01'), 21);
  assert.equal(rules.at('vat.rate.standard', '2026-06-01T10:00:00'), 21);
  assert.equal(domesticTaxCode(21, ''), 'PVM1');
  assert.equal(domesticTaxCode(12, ''), null);
});

test('domesticTaxCode reads the registry: changing a registry value changes the result', () => {
  const e = rules.history('vat.rate.reduced12')[0];
  const original = e.value;
  try {
    e.value = 13;
    assert.equal(domesticTaxCode(12, '2026-06-01'), null);
    assert.equal(domesticTaxCode(13, '2026-06-01'), 'PVM58');
  } finally { e.value = original; }
  assert.equal(domesticTaxCode(12, '2026-06-01'), 'PVM58');
  const due = rules.history('vat.return.dueDay')[0];
  try { due.value = 20; assert.equal(monthlyDueDate('2026-01-01', '2026-01-31'), '2026-02-20'); } finally { due.value = 25; }
});

test('freshness: as-of date, overdue reviews and provisional count with injected dates', () => {
  assert.equal(TAX_RULES_AS_OF, '2026-10-27');
  const now = rulesFreshness('2026-10-27');
  assert.equal(now.asOf, '2026-10-27'); assert.equal(now.daysOld, 0); assert.equal(now.stale, false);
  assert.equal(now.overdue.length, 0);
  assert.equal(now.provisional, rules.list().filter(e => e.status === 'provisional' && (e.effectiveTo === null || e.effectiveTo >= '2026-10-27')).length);
  assert.ok(now.provisional > 0);
  const late = rulesFreshness('2027-01-01');
  assert.equal(late.daysOld, 66);
  assert.equal(late.overdue.length, rules.list().filter(e => e.effectiveTo === null || e.effectiveTo >= '2027-01-01').length);
  const base = { topic: 'vat', title: { lt: 'x', ru: 'x', en: 'x' }, unit: 'percent', value: 1, basis: { actTitle: 'x' }, verifiedBy: 'x', example: 'x' };
  const injected = [
    { ...base, id: 'a.one', effectiveFrom: '2020-01-01', effectiveTo: null, status: 'verified', verifiedOn: '2024-01-01', reviewBy: '2025-06-01' },
    { ...base, id: 'a.two', effectiveFrom: '2020-01-01', effectiveTo: '2023-12-31', status: 'verified', verifiedOn: '2023-06-01', reviewBy: '2024-01-01' },
    { ...base, id: 'a.three', effectiveFrom: '2020-01-01', effectiveTo: null, status: 'provisional', verifiedOn: '2025-01-01', reviewBy: '2026-01-01' },
  ];
  const f = rulesFreshness('2025-03-01', injected);
  assert.equal(f.asOf, '2024-01-01'); assert.equal(f.daysOld, 425); assert.equal(f.stale, true);
  assert.deepEqual(f.overdue.map(e => e.id), []); // a.two is closed (historical), so its passed review date does not count
  assert.equal(f.provisional, 1);
  assert.deepEqual(rulesFreshness('2025-07-01', injected).overdue.map(e => e.id), ['a.one']);
  assert.equal(rulesFreshness('2025-07-01', []).asOf, null);
  const audit = auditRules('2025-07-01', injected);
  assert.equal(audit.failed, true);
  assert.deepEqual(audit.rows.map(r => r.flags), [['overdue', 'old'], ['old'], ['provisional']]);
  assert.equal(auditRules('2026-10-27').failed, false);
});

test('rules-audit script prints the table and exits 1 only for overdue entries (unless --warn-only)', () => {
  const { run } = require('../scripts/rules-audit.cjs');
  const lines = [];
  assert.equal(run(['--today=2026-10-27'], l => lines.push(l)), 0);
  const text = lines.join('\n');
  for (const e of rules.list()) assert.ok(text.includes(e.id), e.id);
  assert.match(text, /provisional/);
  assert.equal(run(['--today=2027-01-15'], () => {}), 1);
  assert.equal(run(['--today=2027-01-15', '--warn-only'], () => {}), 0);
  const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'package.json'), 'utf8'));
  assert.equal(pkg.scripts['rules:audit'], 'node scripts/rules-audit.cjs');
});

// Guard: legal rates and deadlines of tax, payroll and calendar code must come from the registry. Patterns are precise on purpose
// (UI form suggestions and fixed demo data are justified in comments where they are and are not matched here).
test('no hard-coded legal literals outside the rules registry', () => {
  const src = path.join(__dirname, '..', 'src');
  const skip = ['lib/rules/', 'lib/i18n/', 'lib/help/'].map(p => path.join(src, p));
  const patterns = [
    /\b0\.195\b/, /\b0\.0177\b/, /\b19\.5\b/, /\b1\.77\b/, /\b0\.21\b/, /\*\s*0\.20?\b/,
    /rate\s*===?\s*(21|12|9|5)\b/, /date\s*>=?\s*'2026-01-01'/,
    /Date\.UTC\(.*,\s*25\)/, /monthsAfter\(.*,\s*(25|15)\)/, /-02-15`/, /-06-15`/,
  ];
  const problems = [];
  const walk = dir => {
    for (const name of fs.readdirSync(dir)) {
      const full = path.join(dir, name);
      if (fs.statSync(full).isDirectory()) { if (!skip.some(s => (full + path.sep).startsWith(s))) walk(full); continue; }
      if (!/\.(ts|tsx)$/.test(name) || skip.some(s => full.startsWith(s))) continue;
      fs.readFileSync(full, 'utf8').split(/\r?\n/).forEach((line, i) => {
        if (/^\s*\/\//.test(line)) return;
        for (const p of patterns) if (p.test(line)) problems.push(`${path.relative(src, full)}:${i + 1}: ${p}`);
      });
    }
  };
  walk(src);
  assert.deepEqual(problems, []);
});

test('/rules page: anonymous users are redirected, an accountant sees the list', async () => {
  const page = require('../src/app/rules/page.tsx').default;
  jar.clear();
  await assert.rejects(page(), /redirect:\/login/);
  db.prepare("INSERT OR IGNORE INTO User(id,email,name,passwordHash,role,createdAt) VALUES(2,'acc@example.test','A','unused','accountant',datetime('now'))").run();
  jar.set('auth_session', auth.createSessionToken({ id: 2 }));
  const element = await page();
  assert.ok(element && element.type === 'div');
  const texts = [];
  const collect = node => {
    if (Array.isArray(node)) node.forEach(collect);
    else if (typeof node === 'string' || typeof node === 'number') texts.push(String(node));
    else if (node && node.props) collect(node.props.children);
  };
  collect(element);
  for (const id of rules.ids()) assert.ok(texts.includes(id), id);
  jar.clear();
});
