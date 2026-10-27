#!/usr/bin/env node
// Audit of the legislation rules registry (src/lib/rules): prints every entry with its status, check and review dates and flags
// (overdue = review date passed, provisional, old = verified more than 180 days ago). Exits with 1 when an entry in force is
// overdue, unless --warn-only is given. --today=YYYY-MM-DD replaces today's date in Lithuania (for checks and tests).
// Usage: npm run rules:audit [-- --warn-only] [-- --today=2027-01-15]
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

const compile = (mod, filename) => mod._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText, filename);
if (!require.extensions['.ts']) require.extensions['.ts'] = compile;

function loadRules() {
  return require(path.join(__dirname, '..', 'src', 'lib', 'rules', 'index.ts'));
}

function run(argv = process.argv.slice(2), out = console.log) {
  const { auditRules } = loadRules();
  const { todayVilnius } = require(path.join(__dirname, '..', 'src', 'lib', 'dates.ts'));
  const warnOnly = argv.includes('--warn-only');
  const todayArg = argv.find(a => a.startsWith('--today='));
  const today = todayArg ? todayArg.slice('--today='.length) : todayVilnius();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(today)) throw new Error(`Neteisinga data: ${today}`);
  const { rows, failed } = auditRules(today);
  const table = rows.map(({ entry, flags }) => [entry.id, String(entry.value), entry.effectiveFrom + '..' + (entry.effectiveTo || ''), entry.status, entry.verifiedOn, entry.reviewBy, flags.join(',') || '-']);
  const head = ['id', 'value', 'valid', 'status', 'verifiedOn', 'reviewBy', 'flags'];
  const widths = head.map((h, i) => Math.max(h.length, ...table.map(r => r[i].length)));
  const line = cells => cells.map((c, i) => c.padEnd(widths[i])).join('  ').trimEnd();
  out(`Taisyklių registro patikra, data ${today}`);
  out(line(head));
  out(line(widths.map(w => '-'.repeat(w))));
  for (const r of table) out(line(r));
  const count = flag => rows.filter(r => r.flags.includes(flag)).length;
  out(`Iš viso: ${rows.length}; praėjęs patikros terminas: ${count('overdue')}; laikinos: ${count('provisional')}; patikrintos seniau nei prieš 180 d.: ${count('old')}`);
  if (failed) out(warnOnly ? 'ĮSPĖJIMAS: yra taisyklių su praėjusiu patikros terminu (--warn-only).' : 'KLAIDA: yra taisyklių su praėjusiu patikros terminu.');
  return failed && !warnOnly ? 1 : 0;
}

module.exports = { run, loadRules };

if (require.main === module) process.exitCode = run();
