const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..', '..');
// base path without extension; required = always, otherwise required once the Lithuanian file has the language switcher line
const sets = [
  { base: 'web/ACCOUNTING', required: true },
  { base: 'deploy/README', required: false },
  { base: 'README', required: false },
  { base: 'web/SECURITY', required: false },
  { base: 'web/DOCUMENTS', required: false },
  { base: 'docs/VMI-EDS-AUTOMATION', required: false },
];

const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const exists = file => fs.existsSync(path.join(root, file));
const headingCount = text => {
  let fenced = false;
  let count = 0;
  for (const line of text.split(/\r?\n/)) {
    if (/^\s*(```|~~~)/.test(line)) fenced = !fenced;
    else if (!fenced && /^## /.test(line)) count += 1;
  }
  return count;
};
const hasSwitcher = text => text.split(/\r?\n/).slice(0, 5).some(line => /\.ru\.md/.test(line) && /\.en\.md/.test(line));

for (const { base, required } of sets) {
  test(`languages: ${base}`, t => {
    const lt = base + '.md';
    const ru = base + '.ru.md';
    const en = base + '.en.md';
    if (!exists(lt)) {
      if (required) assert.fail(`${lt} is missing`);
      return t.skip(`${lt} does not exist yet`);
    }
    const ltText = read(lt);
    if (!required && !hasSwitcher(ltText)) return t.skip(`${lt} has no language switcher line yet`);
    assert.ok(exists(ru), `${ru} is missing`);
    assert.ok(exists(en), `${en} is missing`);
    assert.ok(hasSwitcher(ltText), `${lt} must start with the language switcher line`);
    const ltHeadings = headingCount(ltText);
    assert.equal(headingCount(read(ru)), ltHeadings, `${ru} has a different number of "## " headings`);
    assert.equal(headingCount(read(en)), ltHeadings, `${en} has a different number of "## " headings`);
    assert.match(ltText, /[ąčęėįšųūž]/i, `${lt} has no Lithuanian letters`);
    assert.match(read(ru), /[Ѐ-ӿ]/, `${ru} has no Cyrillic`);
  });
}

test('README and ACCOUNTING files reflect current capabilities and limitations across lt, ru and en', () => {
  for (const file of ['README.md', 'README.ru.md', 'README.en.md']) {
    const text = read(file);
    for (const token of ['FR0564', 'GPM313', 'GPM312', 'PLN204', 'FIFO', 'NPD', 'PVM15', '1-SD']) {
      assert.ok(text.includes(token), `${file} must mention ${token}`);
    }
    assert.doesNotMatch(text, /be NPD|без NPD|no NPD/i, `${file} must not claim NPD is not calculated`);
  }
  for (const file of ['web/ACCOUNTING.md', 'web/ACCOUNTING.ru.md', 'web/ACCOUNTING.en.md']) {
    const text = read(file);
    assert.ok(text.includes('translateServerError'), `${file} must document translateServerError`);
    assert.ok(text.includes('2026-10-payroll-payout-v1'), `${file} must document payroll payoutDate migration`);
    assert.ok(text.includes('ffdata.ts'), `${file} must document ffdata export`);
  }
});
