const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
require.extensions['.ts'] = (mod, filename) => mod._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText, filename);
const { helpSources } = require('../src/lib/help/sources.ts');
const { helpPages } = require('../src/lib/help/pages.ts');
const { HELP_GROUPS } = require('../src/lib/help/types.ts');
const { namespaces } = require('../src/lib/i18n/messages/index.ts');

const LANGS = ['lt', 'ru', 'en'];
const nonEmpty = value => typeof value === 'string' && value.trim().length > 0;

test('every source has a unique id, an https url, titles in all languages and a verification date', () => {
  const ids = new Set();
  for (const source of helpSources) {
    assert.ok(/^[a-z0-9-]+$/.test(source.id), `bad source id ${source.id}`);
    assert.ok(!ids.has(source.id), `duplicate source id ${source.id}`);
    ids.add(source.id);
    const url = new URL(source.url);
    assert.equal(url.protocol, 'https:', `${source.id}: url must be https`);
    for (const lang of LANGS) assert.ok(nonEmpty(source.title[lang]), `${source.id}: title ${lang} missing`);
    assert.ok(nonEmpty(source.issuer), `${source.id}: issuer missing`);
    assert.match(source.verifiedOn, /^\d{4}-\d{2}-\d{2}$/);
    assert.equal(typeof source.portal, 'boolean');
  }
});

test('help pages have unique slugs, known groups and reference only existing sources', () => {
  const ids = new Set(helpSources.map(s => s.id));
  const slugs = new Set();
  for (const page of helpPages) {
    assert.match(page.slug, /^[a-z0-9-]+$/);
    assert.ok(!slugs.has(page.slug), `duplicate slug ${page.slug}`);
    slugs.add(page.slug);
    assert.ok(HELP_GROUPS.includes(page.group), `${page.slug}: unknown group ${page.group}`);
    assert.equal(new Set(page.sources).size, page.sources.length, `${page.slug}: duplicate source reference`);
    for (const id of page.sources) assert.ok(ids.has(id), `${page.slug}: unknown source ${id}`);
    if (page.appHref) assert.match(page.appHref, /^\/[a-z0-9-]*$/);
  }
  for (const group of HELP_GROUPS) assert.ok(helpPages.some(p => p.group === group), `group ${group} has no pages`);
});

test('every help page exists in lt, ru and en with all sections filled and the same structure', () => {
  for (const page of helpPages) {
    const base = page.text.lt;
    for (const lang of LANGS) {
      const text = page.text[lang];
      assert.ok(text, `${page.slug}: ${lang} missing`);
      assert.ok(nonEmpty(text.title) && nonEmpty(text.summary), `${page.slug} (${lang}): title/summary missing`);
      for (const key of ['purpose', 'steps', 'rules', 'mistakes']) {
        assert.ok(Array.isArray(text[key]) && text[key].length > 0 && text[key].every(nonEmpty), `${page.slug} (${lang}): ${key} empty`);
        assert.equal(text[key].length, base[key].length, `${page.slug} (${lang}): ${key} count differs from lt`);
      }
      assert.equal((text.notes || []).length, (base.notes || []).length, `${page.slug} (${lang}): notes differ from lt`);
      for (const note of text.notes || []) assert.ok(nonEmpty(note.title) && note.items.length && note.items.every(nonEmpty));
    }
  }
});

test('every source is cited by at least one page', () => {
  const used = new Set(helpPages.flatMap(p => p.sources));
  for (const source of helpSources) assert.ok(used.has(source.id), `source ${source.id} is not used`);
});

test('help states that nothing is submitted to VMI automatically, in every language', () => {
  for (const lang of LANGS) assert.match(namespaces.help[lang].vmiNotice, /VMI/);
  for (const slug of ['isaf', 'fr0600', 'limitations']) {
    const page = helpPages.find(p => p.slug === slug);
    assert.ok(page, `missing page ${slug}`);
  }
});

test('VAT rates in the help match the i.SAF classifier', () => {
  const { domesticTaxCode } = require('../src/lib/isaf.ts');
  assert.equal(domesticTaxCode(21, '2026-01-01'), 'PVM1');
  assert.equal(domesticTaxCode(9, '2026-01-01'), 'PVM2');
  assert.equal(domesticTaxCode(5, '2026-01-01'), 'PVM3');
  assert.equal(domesticTaxCode(12, '2026-01-01'), 'PVM58');
  assert.equal(domesticTaxCode(12, '2025-12-31'), null);
  const isaf = helpPages.find(p => p.slug === 'isaf').text;
  for (const lang of LANGS) {
    const rules = isaf[lang].rules.join(' ');
    for (const code of ['PVM1', 'PVM2', 'PVM3', 'PVM58', '2026-01-01']) assert.ok(rules.includes(code), `isaf (${lang}) must mention ${code}`);
  }
});

test('the help route files exist', () => {
  for (const file of ['page.tsx', path.join('[slug]', 'page.tsx')]) assert.ok(fs.existsSync(path.join(__dirname, '..', 'src', 'app', 'help', file)), file);
});

test('help limitations, gpm313 and sales-invoices pages reflect current features in lt, ru and en', () => {
  const lim = helpPages.find(p => p.slug === 'limitations').text;
  const gpm = helpPages.find(p => p.slug === 'gpm313').text;
  const inv = helpPages.find(p => p.slug === 'sales-invoices').text;
  for (const lang of LANGS) {
    const limRules = lim[lang].rules.join(' ');
    for (const token of ['FR0564R/T/TP', 'GPM312U', 'PLN204', 'FIFO', '1-SD']) {
      assert.ok(limRules.includes(token), `limitations (${lang}) must mention ${token}`);
    }
    const gpmRules = gpm[lang].rules.join(' ');
    assert.ok(gpmRules.includes('15'), `gpm313 (${lang}) must describe the 15th day split`);
    assert.doesNotMatch(gpmRules, /todėl 6 ir 7 laukų neskirsto|поэтому поля 6 и 7 не разделяет|so it does not split fields 6 and 7/, `gpm313 (${lang}) must not claim fields 6 and 7 are never split`);
    const invRules = inv[lang].rules.join(' ');
    assert.ok(invRules.includes('PVM15') && invRules.includes('PVM34'), `sales-invoices (${lang}) must mention reverse-charge codes PVM15 and PVM34`);
  }
});
