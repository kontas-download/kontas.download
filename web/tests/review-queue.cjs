const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const file = path.join(__dirname, '../src/lib/review-queue.ts');
const mod = { exports: {} };
new Function('module', 'exports', ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText)(mod, mod.exports);
const { waitingIds, neighbourId, reviewShortcut } = mod.exports;

test('waitingIds: only documents that need a person, oldest first', () => {
  assert.deepEqual(waitingIds([{ id: 9, status: 'CONFIRMED' }, { id: 7, status: 'FAILED' }, { id: 3, status: 'NEW' }, { id: 5, status: 'REJECTED' }, { id: 4, status: 'EXTRACTED' }]), [3, 4, 7]);
  assert.deepEqual(waitingIds([]), []);
});

test('neighbourId: next and previous wrap around and never return the current document', () => {
  const ids = [3, 4, 7];
  assert.equal(neighbourId(ids, 3, 1), 4);
  assert.equal(neighbourId(ids, 7, 1), 3, 'wraps to the oldest');
  assert.equal(neighbourId(ids, 3, -1), 7, 'wraps to the newest');
  assert.equal(neighbourId(ids, 7, -1), 4);
  assert.equal(neighbourId(ids, 5, 1), 7, 'the current document may already be out of the queue (just confirmed)');
  assert.equal(neighbourId(ids, 5, -1), 4);
  assert.equal(neighbourId([5], 5, 1), null);
  assert.equal(neighbourId([], 5, -1), null);
});

test('reviewShortcut: modifier combinations everywhere, single keys never inside fields', () => {
  assert.equal(reviewShortcut({ key: 'Enter', ctrlKey: true, targetTag: 'INPUT' }), 'confirm');
  assert.equal(reviewShortcut({ key: 'Enter', metaKey: true, targetTag: 'TEXTAREA' }), 'confirm');
  assert.equal(reviewShortcut({ key: 'Enter', targetTag: 'BODY' }), null, 'plain Enter is left to the form');
  assert.equal(reviewShortcut({ key: 'ArrowRight', altKey: true, targetTag: 'INPUT' }), 'next');
  assert.equal(reviewShortcut({ key: 'ArrowLeft', altKey: true, targetTag: 'SELECT' }), 'previous');
  assert.equal(reviewShortcut({ key: 'ArrowRight', targetTag: 'BODY' }), null, 'arrows alone move the cursor/scroll');
  assert.equal(reviewShortcut({ key: 'ArrowRight', altKey: true, ctrlKey: true }), null);
  for (const [key, action] of [['Escape', 'back'], ['r', 'rotate'], ['R', 'rotate'], ['+', 'zoomIn'], ['=', 'zoomIn'], ['-', 'zoomOut']]) {
    assert.equal(reviewShortcut({ key, targetTag: 'BODY' }), action, key);
    assert.equal(reviewShortcut({ key, targetTag: 'INPUT' }), null, key + ' must not hijack typing');
    assert.equal(reviewShortcut({ key, targetTag: 'textarea' }), null);
    assert.equal(reviewShortcut({ key, targetTag: 'SELECT' }), null);
    assert.equal(reviewShortcut({ key, targetTag: 'DIV', editable: true }), null);
  }
  assert.equal(reviewShortcut({ key: 'r', ctrlKey: true, targetTag: 'BODY' }), null, 'Ctrl+R stays the browser reload');
  assert.equal(reviewShortcut({ key: 'x', targetTag: 'BODY' }), null);
});
