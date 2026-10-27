const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
require.extensions['.ts'] = (mod, filename) => mod._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText, filename);
const { namespaces } = require('../src/lib/i18n/messages/index.ts');
const { translate } = require('../src/lib/i18n/translate.ts');
const { pickLang } = require('../src/lib/i18n/config.ts');

const placeholders = text => [...text.matchAll(/\{(\w+)\}/g)].map(m => m[1]).sort().join(',');

test('every namespace has the same keys and placeholders in lt, ru and en, and no empty text', () => {
  for (const [ns, dict] of Object.entries(namespaces)) {
    const keys = Object.keys(dict.lt).sort();
    for (const lang of ['ru', 'en']) assert.deepEqual(Object.keys(dict[lang]).sort(), keys, `${ns}: ${lang} keys differ from lt`);
    for (const key of keys) {
      for (const lang of ['lt', 'ru', 'en']) {
        assert.ok(String(dict[lang][key]).trim(), `${ns}.${key} (${lang}) is empty`);
        assert.equal(placeholders(dict[lang][key]), placeholders(dict.lt[key]), `${ns}.${key} (${lang}) placeholders differ`);
      }
    }
  }
});

test('translate fills placeholders and falls back to the key for unknown texts', () => {
  assert.equal(translate('en', 'common.save'), 'Save');
  assert.equal(translate('ru', 'common.save'), 'Сохранить');
  assert.equal(translate('lt', 'unknown.key'), 'unknown.key');
});

test('language comes from the cookie, then Accept-Language, then Lithuanian', () => {
  assert.equal(pickLang('en', 'ru'), 'en');
  assert.equal(pickLang(undefined, 'ru-RU,ru;q=0.9,en;q=0.8'), 'ru');
  assert.equal(pickLang('xx', 'de,en;q=0.5'), 'en');
  assert.equal(pickLang(undefined, 'de'), 'lt');
  assert.equal(pickLang(undefined, null), 'lt');
});
