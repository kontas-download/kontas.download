const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
require.extensions['.ts'] = (mod, filename) => mod._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, filename);
const { displayPrice, typedPrice, editablePrice, lineSum } = require(path.join(__dirname, '../src/lib/line-price.ts'));

test('price is displayed with up to 4 decimals', () => {
  assert.equal(displayPrice(1.482685), 1.4827);
  assert.equal(displayPrice(50), 50);
  assert.equal(displayPrice(2.5), 2.5);
  assert.equal(displayPrice(undefined), 0);
});

test('displaying does not change the stored price or the line sum', () => {
  const stored = { price: 1.482685, quantity: 20, sumWithoutVat: 29.65 };
  const price = editablePrice(stored);
  assert.equal(price, 1.482685);
  displayPrice(price);
  assert.equal(price, 1.482685);
  assert.equal(Math.round(lineSum(stored.quantity, price) * 100) / 100, 29.65);
});

test('legacy line with price 0 derives the price from the stored sum', () => {
  const price = editablePrice({ price: 0, quantity: 3, sumWithoutVat: 4.448055 });
  assert.equal(price, 1.482685);
  assert.equal(displayPrice(price), 1.4827);
});

test('a price typed by the user is stored as typed, up to 4 decimals', () => {
  assert.equal(typedPrice('1.4827'), 1.4827);
  assert.equal(typedPrice('1.48273'), 1.4827);
  assert.equal(typedPrice(''), 0);
  assert.equal(typedPrice('-3'), 0);
});
