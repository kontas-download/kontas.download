const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const env = require('./helpers/recognition-env.cjs')('erp-recognition-cost-');
const { db, rec, src, pdf, extracted } = env;
const models = src('recognition/models.ts');
// Model ids come from the model list itself (vendor names may appear only in the allowlisted modules, not in tests).
const [OPUS, SONNET, HAIKU] = models.RECOGNITION_MODELS.map((m) => m.id);
const { translateServerError } = src('errors.ts');
after(() => { db.close(); fs.rmSync(env.temp, { recursive: true, force: true }); });

// A provider that reports usage the way the real adapter does.
const metered = (model, inputTokens, outputTokens, result = extracted()) => ({ async recognize(_file, opts) { opts.onUsage?.({ model, inputTokens, outputTokens }); if (result instanceof Error) throw result; return result; } });
const newDoc = () => rec.storeDocument(1, { buffer: pdf(), fileName: 'a.pdf', mimeType: 'application/pdf' });

test('price table: cost per 1M tokens, unknown model priced as the default one', () => {
  assert.equal(models.estimateCostUsd(OPUS, 1_000_000, 1_000_000), 24);
  assert.equal(models.estimateCostUsd(SONNET, 1_000_000, 0), 2);
  assert.ok(Math.abs(models.estimateCostUsd(HAIKU, 2_000_000, 2_000_000) - 1.2) < 1e-9);
  assert.equal(models.estimateCostUsd(SONNET + '-20261101', 1_000_000, 0), 2, 'dated model ids use the base price');
  assert.equal(models.estimateCostUsd('custom-model', 1_000_000, 0), 4);
  assert.equal(models.estimateCostUsd(OPUS, -5, -5), 0);
});

test('usage is recorded per call, also for failures, and summed per document', async () => {
  const row = newDoc();
  const done = await rec.recognizeDocument(1, row.id, metered(OPUS, 10000, 2000));
  assert.equal(done.status, 'EXTRACTED');
  const usd = (10000 * 4 + 2000 * 20) / 1e6;
  assert.ok(Math.abs(done.costEur - usd * rec.usdToEur()) < 1e-4);
  const again = await rec.recognizeDocument(1, row.id, metered(OPUS, 10000, 2000, new (src('recognition/types.ts').RecognitionError)('TRUNCATED', 'x')));
  assert.equal(again.status, 'FAILED');
  assert.ok(Math.abs(again.costEur - 2 * usd * rec.usdToEur()) < 1e-4, 'a failed call that reached the provider is still counted');
  assert.equal(rec.listDocuments(1).find(d => d.id === row.id).costEur, again.costEur);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM RecognitionUsage WHERE documentId=?').get(row.id).n, 2);
  const plain = newDoc();
  assert.equal((await rec.recognizeDocument(1, plain.id, { async recognize() { return extracted(); } })).costEur, null, 'a provider without usage leaves no cost');
});

test('monthly limit: validation, summary, and recognition stops at the limit', async () => {
  for (const bad of [0, -1, 'abc', 1e7, NaN]) assert.throws(() => rec.saveRecognitionSettings(1, { enabled: true, monthlyLimitEur: bad }), e => e.status === 400);
  assert.equal(rec.saveRecognitionSettings(1, { enabled: true }).monthlyLimitEur, null);
  const before = rec.recognitionUsageSummary(1);
  assert.equal(before.limitReached, false);
  assert.equal(rec.saveRecognitionSettings(1, { enabled: true, monthlyLimitEur: 1.005 }).monthlyLimitEur, 1);
  assert.equal(rec.saveRecognitionSettings(1, { enabled: true }).monthlyLimitEur, 1, 'omitted = keep');
  // Spend a bit over the limit: 1 EUR / 0.92 ~ 1.09 USD -> 100k opus output tokens = 2 USD.
  const doc = newDoc();
  const calls = { n: 0 };
  const counting = { async recognize(_f, o) { calls.n++; o.onUsage({ model: OPUS, inputTokens: 0, outputTokens: 100000 }); return extracted(); } };
  assert.equal((await rec.recognizeDocument(1, doc.id, counting)).status, 'EXTRACTED');
  const s = rec.recognitionUsageSummary(1);
  assert.equal(s.limitReached, true); assert.equal(s.calls, before.calls + 1); assert.equal(s.outputTokens, before.outputTokens + 100000);
  const blocked = newDoc();
  await assert.rejects(rec.recognizeDocument(1, blocked.id, counting), e => e.status === 409 && /limitas/.test(e.message));
  assert.equal(calls.n, 1, 'the provider is not called over the limit');
  assert.equal(rec.getDocument(1, blocked.id).status, 'NEW', 'the document is stored and waits for manual entry');
  assert.match(translateServerError(rec.LIMIT_MESSAGE, 'en'), /limit has been reached/);
  // Next month the counter starts again; raising or removing the limit re-enables recognition.
  const nextMonth = new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth() + 1, 5));
  assert.equal(rec.recognitionUsageSummary(1, nextMonth).limitReached, false);
  rec.saveRecognitionSettings(1, { enabled: true, monthlyLimitEur: null });
  assert.equal((await rec.recognizeDocument(1, blocked.id, counting)).status, 'EXTRACTED');
});
