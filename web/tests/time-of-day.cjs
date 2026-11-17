const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
require.extensions['.ts'] = (mod, filename) => mod._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, filename);
const { normalizeTimeOfDay } = require(path.join(__dirname, '../src/lib/time-of-day.ts'));

test('time of day: receipt formats are accepted and normalized, seconds kept', () => {
  // Seen live: a recognized receipt time "16:04:44" was refused because only HH:MM was accepted.
  assert.equal(normalizeTimeOfDay('16:04:44'), '16:04:44');
  assert.equal(normalizeTimeOfDay('16:04'), '16:04');
  assert.equal(normalizeTimeOfDay('16.04'), '16:04');
  assert.equal(normalizeTimeOfDay('9:5'), '09:05');
  assert.equal(normalizeTimeOfDay(' 09.05.07 '), '09:05:07');
  assert.equal(normalizeTimeOfDay('16 04'), '16:04');
});

test('time of day: invalid values are refused', () => {
  for (const bad of ['24:00', '12:60', '12:00:60', 'abc', '', null, undefined, '1604', '12:00:00:00']) assert.equal(normalizeTimeOfDay(bad), null, String(bad));
});
