const { test, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const env = require('./helpers/recognition-env.cjs')('erp-recognition-gateway-');
const { db, rec, src, extracted } = env;
const models = src('recognition/pollinations-models.ts');
const pollinations = src('recognition/provider-pollinations.ts');
const { provider } = pollinations;
// Retries of transient upstream errors run without the real pauses in tests.
pollinations.RETRY_DELAYS_MS.splice(0, pollinations.RETRY_DELAYS_MS.length, 0, 0);
const { defaultRecognitionProvider } = src('recognition/factory.ts');
const { RecognitionError } = src('recognition/types.ts');
const [GLM, , , KIMI] = models.POLLINATIONS_MODELS.map(m => m.id);
const realFetch = global.fetch;
after(() => { global.fetch = realFetch; db.close(); fs.rmSync(env.temp, { recursive: true, force: true }); });

// A minimal one-page PDF (the cross-reference table is rebuilt by the reader).
const PDF = Buffer.from('%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 200 200]/Contents 4 0 R/Resources<<>>>>endobj\n4 0 obj<</Length 0>>stream\n\nendstream\nendobj\ntrailer<</Root 1 0 R/Size 5>>\n%%EOF');
const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xd9]);
// The strict request form of the extraction (all fields present, nullable instead of optional).
const full = () => ({ ...extracted(), suggestedAccount: null, referencedDocument: null });
const reply = (content, usage = { prompt_tokens: 1000, completion_tokens: 200 }, finish = 'stop') => ({ choices: [{ message: { content: typeof content === 'string' ? content : JSON.stringify(content) }, finish_reason: finish }], usage });
let calls;
function mockFetch(...responses) {
  calls = [];
  global.fetch = async (url, init) => {
    calls.push({ url: String(url), init, body: init && init.body ? JSON.parse(init.body) : null });
    const r = responses.length > 1 ? responses.shift() : responses[0];
    const status = r.status ?? 200;
    return { ok: status < 400, status, json: async () => r.json ?? r, text: async () => r.text ?? JSON.stringify(r.json ?? r) };
  };
}
beforeEach(() => { calls = []; });

test('request: Bearer key, model, image data URI, strict json_schema, temperature 0', async () => {
  mockFetch(reply(full()));
  const usage = [];
  const out = await provider.recognize({ data: JPEG, mimeType: 'image/jpeg' }, { apiKey: 'sk_test', model: GLM, accounts: [{ code: '6001', name: 'Kuras' }], onUsage: u => usage.push(u) });
  assert.equal(out.number, 'TIEK-1');
  assert.equal(calls.length, 1);
  const [{ url, init, body }] = calls;
  assert.equal(url, `${models.POLLINATIONS_API_BASE}/chat/completions`);
  assert.equal(init.headers.Authorization, 'Bearer sk_test');
  assert.equal(body.model, GLM);
  assert.equal(body.temperature, 0);
  assert.ok(body.max_tokens >= 8000);
  assert.equal(body.messages[0].role, 'system');
  assert.match(body.messages[0].content, /untrusted/);
  assert.match(body.messages[0].content, /6001 - Kuras/);
  const user = body.messages[1].content;
  assert.equal(user[0].type, 'image_url', 'the image comes first');
  assert.match(user[0].image_url.url, /^data:image\/jpeg;base64,/);
  assert.equal(user[user.length - 1].type, 'text');
  assert.equal(body.response_format.type, 'json_schema');
  const schema = body.response_format.json_schema.schema;
  assert.equal(body.response_format.json_schema.strict, true);
  assert.equal(schema.additionalProperties, false);
  assert.equal(schema.$schema, undefined);
  assert.ok(schema.required.includes('suggestedAccount') && schema.required.includes('referencedDocument'), 'every property is required');
  assert.deepEqual(usage, [{ model: GLM, inputTokens: 1000, outputTokens: 200, provider: 'POLLINATIONS' }]);
});

test('temperature is not sent to a model that does not take it or to an unknown id', async () => {
  mockFetch(reply(full()));
  await provider.recognize({ data: JPEG, mimeType: 'image/jpeg' }, { apiKey: 'k', model: KIMI });
  await provider.recognize({ data: JPEG, mimeType: 'image/jpeg' }, { apiKey: 'k', model: 'vendor/custom-model' });
  assert.equal(calls[0].body.temperature, undefined);
  assert.equal(calls[1].body.temperature, undefined);
  assert.equal(calls[1].body.model, 'vendor/custom-model');
});

test('JSON wrapped in a code fence or in text is still read', async () => {
  mockFetch(reply('Here it is:\n```json\n' + JSON.stringify(full()) + '\n```'));
  assert.equal((await provider.recognize({ data: JPEG, mimeType: 'image/jpeg' }, { apiKey: 'k', model: GLM })).number, 'TIEK-1');
  mockFetch(reply('Result: ' + JSON.stringify(full()) + ' done'));
  assert.equal((await provider.recognize({ data: JPEG, mimeType: 'image/jpeg' }, { apiKey: 'k', model: GLM })).number, 'TIEK-1');
});

test('an answer that fails the schema is retried once with the validation error; usage of both calls is summed', async () => {
  mockFetch(reply({ docKind: 'INVOICE' }, { prompt_tokens: 100, completion_tokens: 10 }), reply(full(), { prompt_tokens: 150, completion_tokens: 20 }));
  const usage = [];
  const out = await provider.recognize({ data: JPEG, mimeType: 'image/jpeg' }, { apiKey: 'k', model: GLM, onUsage: u => usage.push(u) });
  assert.equal(out.number, 'TIEK-1');
  assert.equal(calls.length, 2);
  const retry = calls[1].body.messages;
  assert.equal(retry[retry.length - 2].role, 'assistant');
  assert.match(retry[retry.length - 1].content, /did not match the schema/);
  assert.match(retry[retry.length - 1].content, /supplier/);
  assert.deepEqual(usage, [{ model: GLM, inputTokens: 250, outputTokens: 30, provider: 'POLLINATIONS' }]);
});

test('two invalid answers end with an error (no third call) and the usage is still reported', async () => {
  mockFetch(reply('not json at all'));
  const usage = [];
  await assert.rejects(provider.recognize({ data: JPEG, mimeType: 'image/jpeg' }, { apiKey: 'k', model: GLM, onUsage: u => usage.push(u) }), e => e instanceof RecognitionError && e.code === 'EMPTY');
  assert.equal(calls.length, 2);
  assert.equal(usage.length, 1);
  assert.equal(usage[0].inputTokens, 2000);
});

test('HTTP failures map to typed errors', async () => {
  const cases = [[401, 'AUTH'], [403, 'AUTH'], [429, 'RATE_LIMIT'], [402, 'API'], [404, 'API'], [422, 'REFUSED'], [503, 'API']];
  for (const [status, code] of cases) {
    mockFetch({ status, text: '{}' });
    await assert.rejects(provider.recognize({ data: JPEG, mimeType: 'image/jpeg' }, { apiKey: 'k', model: GLM }), e => e.code === code, String(status));
  }
  mockFetch({ status: 400, text: '{"error":{"code":"output_token_limit_exceeded"}}' });
  await assert.rejects(provider.recognize({ data: JPEG, mimeType: 'image/jpeg' }, { apiKey: 'k', model: GLM }), e => e.code === 'TRUNCATED');
  mockFetch(reply(full(), undefined, 'length'));
  await assert.rejects(provider.recognize({ data: JPEG, mimeType: 'image/jpeg' }, { apiKey: 'k', model: GLM }), e => e.code === 'TRUNCATED');
  global.fetch = async () => { throw new TypeError('network'); };
  await assert.rejects(provider.recognize({ data: JPEG, mimeType: 'image/jpeg' }, { apiKey: 'k', model: GLM }), e => e.code === 'API');
});

test('testKey sends a tiny text request', async () => {
  mockFetch(reply('pong'));
  await provider.testKey('sk_x', GLM);
  assert.equal(calls[0].body.messages.length, 1);
  assert.ok(calls[0].body.max_tokens <= 512);
  assert.equal(calls[0].init.headers.Authorization, 'Bearer sk_x');
  mockFetch({ status: 401, text: '{}' });
  await assert.rejects(provider.testKey('bad', GLM), e => e.code === 'AUTH');
});

test('testKey: a reasoning model that runs out of tokens still proves the key works', async () => {
  // Seen live: glm spends its tokens thinking and the service answers 400 output_token_limit_exceeded.
  mockFetch({ status: 400, text: '{"success":false,"error":{"code":"output_token_limit_exceeded","message":"x"}}' });
  await provider.testKey('sk_x', GLM);
  mockFetch({ status: 402, text: '{}' });
  await assert.rejects(provider.testKey('sk_x', GLM), e => e.code === 'API');
});

test('a PDF is rendered to JPEG page images; an unreadable PDF gives a clear error', async () => {
  mockFetch(reply(full()));
  await provider.recognize({ data: PDF, mimeType: 'application/pdf' }, { apiKey: 'k', model: GLM });
  const parts = calls[0].body.messages[1].content.filter(p => p.type === 'image_url');
  assert.ok(parts.length >= 1 && parts.length <= 3);
  assert.match(parts[0].image_url.url, /^data:image\/jpeg;base64,/);
  const jpeg = Buffer.from(parts[0].image_url.url.split(',')[1], 'base64');
  assert.deepEqual([...jpeg.subarray(0, 2)], [0xff, 0xd8], 'a real JPEG');
  mockFetch(reply(full()));
  await assert.rejects(provider.recognize({ data: Buffer.from('%PDF-1.4 garbage'), mimeType: 'application/pdf' }, { apiKey: 'k', model: GLM }), e => e instanceof RecognitionError && /PDF/.test(e.message));
  assert.equal(calls.length, 0, 'nothing is sent when the PDF cannot be read');
});

test('price table: catalog prices, unknown model priced as the default', () => {
  assert.ok(Math.abs(models.estimatePollinationsCostUsd(GLM, 1_000_000, 1_000_000) - 0.65) < 1e-9);
  assert.ok(Math.abs(models.estimatePollinationsCostUsd(KIMI, 1_000_000, 1_000_000) - 10.35) < 1e-9);
  assert.equal(models.estimatePollinationsCostUsd('vendor/unknown', 1000, 1000), models.estimatePollinationsCostUsd(GLM, 1000, 1000));
  assert.equal(models.estimatePollinationsCostUsd(GLM, -5, -5), 0);
  assert.equal(models.DEFAULT_POLLINATIONS_MODEL, GLM);
});

test('settings keep one key and one model per provider; switching loses nothing', () => {
  const first = rec.getRecognitionSettings(1);
  assert.equal(first.provider, 'PRIMARY');
  assert.equal(first.providers.PRIMARY.hasKey, true);
  assert.equal(first.providers.POLLINATIONS.hasKey, false);
  assert.throws(() => rec.saveRecognitionSettings(1, { enabled: true, provider: 'POLLINATIONS' }), e => e.status === 400, 'no key for the chosen provider');
  assert.throws(() => rec.saveRecognitionSettings(1, { enabled: true, provider: 'OTHER' }), e => e.status === 400);
  const second = rec.saveRecognitionSettings(1, { enabled: true, provider: 'POLLINATIONS', apiKey: 'sk_gateway', model: KIMI });
  assert.equal(second.provider, 'POLLINATIONS');
  assert.equal(second.model, KIMI);
  assert.equal(second.hasKey, true);
  assert.deepEqual(second.providers.PRIMARY, first.providers.PRIMARY, 'the first provider key and model are untouched');
  const back = rec.saveRecognitionSettings(1, { enabled: true, provider: 'PRIMARY' });
  assert.equal(back.provider, 'PRIMARY');
  assert.equal(back.hasKey, true);
  assert.equal(back.providers.POLLINATIONS.hasKey, true);
  assert.equal(back.providers.POLLINATIONS.model, KIMI);
  const raw = db.prepare('SELECT apiKeyEncrypted, pollinationsKeyEncrypted FROM CompanyRecognitionSettings WHERE companyId=1').get();
  assert.ok(raw.apiKeyEncrypted && raw.pollinationsKeyEncrypted && raw.apiKeyEncrypted !== raw.pollinationsKeyEncrypted);
  assert.ok(!raw.pollinationsKeyEncrypted.includes('sk_gateway'), 'stored encrypted');
  // Clearing the key clears only the selected provider's key.
  const cleared = rec.saveRecognitionSettings(1, { enabled: false, provider: 'POLLINATIONS', clearKey: true });
  assert.equal(cleared.providers.POLLINATIONS.hasKey, false);
  assert.equal(cleared.providers.PRIMARY.hasKey, true);
  assert.equal(rec.saveRecognitionSettings(1, { enabled: true, provider: 'PRIMARY' }).provider, 'PRIMARY');
  assert.equal(rec.saveRecognitionSettings(1, { enabled: true, provider: 'POLLINATIONS', apiKey: 'sk_gateway', model: 'vendor/custom-model' }).model, 'vendor/custom-model', 'a model id with a slash is accepted');
});

test('recognition through the active provider records usage and cost with provider POLLINATIONS', async () => {
  rec.saveRecognitionSettings(1, { enabled: true, provider: 'POLLINATIONS', apiKey: 'sk_gateway', model: GLM });
  mockFetch(reply(full(), { prompt_tokens: 20000, completion_tokens: 1000 }));
  const row = rec.storeDocument(1, { buffer: PDF, fileName: 'a.pdf', mimeType: 'application/pdf' });
  const done = await rec.recognizeDocument(1, row.id, defaultRecognitionProvider);
  assert.equal(done.status, 'EXTRACTED', done.error);
  assert.equal(done.model, GLM);
  assert.equal(calls[0].init.headers.Authorization, 'Bearer sk_gateway', 'the stored key of the active provider is used');
  const usage = db.prepare('SELECT provider, model, inputTokens, outputTokens, costUsd FROM RecognitionUsage WHERE documentId=?').get(row.id);
  assert.equal(usage.provider, 'POLLINATIONS');
  assert.equal(usage.model, GLM);
  assert.equal(usage.inputTokens, 20000);
  assert.ok(Math.abs(usage.costUsd - (20000 * 0.00000015 + 1000 * 0.0000005)) < 1e-9);
  assert.ok(done.costEur > 0);
  rec.saveRecognitionSettings(1, { enabled: true, provider: 'PRIMARY' });
});

test('factory routes by provider: the gateway adapter calls the gateway, the other one does not', async () => {
  mockFetch(reply('pong'));
  await defaultRecognitionProvider.testKey('sk_x', GLM, 'POLLINATIONS');
  assert.ok(calls[0].url.startsWith(models.POLLINATIONS_API_BASE));
  mockFetch({ status: 401, text: '{}' });
  await assert.rejects(defaultRecognitionProvider.testKey('bad', '', 'PRIMARY'), e => e instanceof RecognitionError);
  assert.ok(!calls.some(c => c.url.startsWith(models.POLLINATIONS_API_BASE)), 'the first provider never talks to the gateway');
});

test('the key test endpoint logic uses the chosen provider key and model', async () => {
  rec.saveRecognitionSettings(1, { enabled: true, provider: 'POLLINATIONS', apiKey: 'sk_gateway', model: KIMI });
  const seen = [];
  const fake = { async recognize() {}, async testKey(key, model, kind) { seen.push({ key, model, kind }); } };
  assert.deepEqual(await rec.testRecognitionKey(1, {}, fake), { ok: true });
  assert.deepEqual(await rec.testRecognitionKey(1, { provider: 'PRIMARY' }, fake), { ok: true });
  assert.equal(seen[0].kind, 'POLLINATIONS'); assert.equal(seen[0].key, 'sk_gateway'); assert.equal(seen[0].model, KIMI);
  assert.equal(seen[1].kind, 'PRIMARY'); assert.equal(seen[1].key, 'sk-test-secret-key');
  rec.saveRecognitionSettings(1, { enabled: true, provider: 'PRIMARY' });
});

test('transient upstream errors (502/503/504, dropped connection) are retried; other errors are not', async () => {
  // Seen live: "Atpazinimo paslaugos klaida (502)" on one of two receipts sent together.
  mockFetch({ status: 502, text: 'bad gateway' }, { status: 503, text: 'busy' }, reply(JSON.stringify(full())));
  const out = await provider.recognize({ data: JPEG, mimeType: 'image/jpeg' }, { apiKey: 'k', model: GLM });
  assert.equal(out.supplier.name, full().supplier.name);
  assert.equal(calls.length, 3);
  mockFetch({ status: 502, text: 'x' }, { status: 502, text: 'x' }, { status: 502, text: 'x' }, reply(JSON.stringify(full())));
  await assert.rejects(provider.recognize({ data: JPEG, mimeType: 'image/jpeg' }, { apiKey: 'k', model: GLM }), e => e.code === 'API' && /502/.test(e.message));
  assert.equal(calls.length, 3, 'two retries, then the error');
  mockFetch({ status: 401, text: '{}' }, reply(JSON.stringify(full())));
  await assert.rejects(provider.recognize({ data: JPEG, mimeType: 'image/jpeg' }, { apiKey: 'k', model: GLM }), e => e.code === 'AUTH');
  assert.equal(calls.length, 1, 'an auth error is final');
});

test('a final service error keeps the service explanation, so the stored error shows the real cause', async () => {
  mockFetch({ status: 502, text: '{"success":false,"error":{"code":"UPSTREAM_ERROR","message":"Model returned malformed output"}}' });
  await assert.rejects(provider.recognize({ data: JPEG, mimeType: 'image/jpeg' }, { apiKey: 'k', model: GLM }), e => /\(502\): UPSTREAM_ERROR: Model returned malformed output\./.test(e.message));
  mockFetch({ status: 500, text: '<html><body>Internal <b>error</b></body></html>' });
  await assert.rejects(provider.recognize({ data: JPEG, mimeType: 'image/jpeg' }, { apiKey: 'k', model: GLM }), e => /\(500\): Internal error\./.test(e.message));
});
