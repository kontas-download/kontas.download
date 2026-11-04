const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
const Module = require('node:module');

const file = require.resolve('../src/lib/theme.ts');
const mod = new Module(file);
mod.filename = file;
mod.paths = Module._nodeModulePaths(__dirname);
mod._compile(ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, file);
const { parseTheme, THEMES, DEFAULT_THEME } = mod.exports;

test('theme cookie: known values pass, anything else falls back to dark', () => {
  for (const theme of THEMES) assert.equal(parseTheme(theme), theme);
  for (const bad of [undefined, null, '', 'Light', 'blue', 'dark; x=1', 42]) assert.equal(parseTheme(bad), DEFAULT_THEME);
  assert.equal(DEFAULT_THEME, 'dark');
});
