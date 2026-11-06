const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const env = require('./helpers/recognition-env.cjs')('erp-exchange-rates-');
const { db, rec, src, CODE, extractedDoc, extracted, good, fieldsOf } = env;
const fx = src('exchange-rates.ts');
const form = src('purchase-document-form.ts');
const { translateServerError } = src('errors.ts');
after(() => { db.close(); fs.rmSync(env.temp, { recursive: true, force: true }); });

// A small copy of the bank feed: Friday 2026-10-16 and Monday 2026-10-19 (no weekend), a holiday gap and some currencies.
const feed = days => `<?xml version="1.0" encoding="UTF-8"?>
<gesmes:Envelope xmlns:gesmes="http://www.gesmes.org/xml/2002-08-01" xmlns="http://www.ecb.int/vocabulary/2002-08-01/eurofxref">
<gesmes:subject>Reference rates</gesmes:subject><gesmes:Sender><gesmes:name>European Central Bank</gesmes:name></gesmes:Sender>
<Cube>${Object.entries(days).map(([date, r]) => `<Cube time="${date}">${Object.entries(r).map(([c, v]) => `<Cube currency="${c}" rate="${v}"/>`).join('')}</Cube>`).join('')}</Cube></gesmes:Envelope>`;
const today = new Date().toISOString().slice(0, 10);
const shift = n => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);
const RECENT = { [shift(-9)]: { USD: 1.1, GBP: 0.85 }, [shift(-8)]: { USD: 1.2, GBP: 0.86 }, [shift(-5)]: { USD: 1.25, GBP: 0.87 } };
const mock = (xml) => { const calls = []; return { calls, fetchText: async url => { calls.push(url); if (xml instanceof Error) throw xml; return xml; } }; };

test('ECB feed: parsing, weekend and holiday fall back to the last earlier day, results are cached', async () => {
  const rows = fx.parseEcbRates(feed(RECENT));
  assert.equal(rows.length, 6);
  assert.deepEqual(rows[0], { date: shift(-9), currency: 'USD', rate: 1.1 });
  const m = mock(feed(RECENT));
  const exact = await fx.ecbRate(db, 'usd', shift(-8), m);
  assert.deepEqual(exact, { currency: 'USD', rate: 1.2, rateDate: shift(-8), source: 'ECB' });
  assert.deepEqual(m.calls, [fx.ECB_FEEDS.D90]);
  // A date without a published rate takes the last earlier one; nothing is fetched again.
  const gap = await fx.ecbRate(db, 'USD', shift(-6), m);
  assert.equal(gap.rate, 1.2); assert.equal(gap.rateDate, shift(-8));
  const gbp = await fx.ecbRate(db, 'GBP', shift(-5), m);
  assert.equal(gbp.rate, 0.87);
  assert.equal(m.calls.length, 1);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM ExchangeRate').get().n, 6);
  // Currency the bank does not publish and bad input.
  await assert.rejects(() => fx.ecbRate(db, 'XXX', shift(-5), m), e => e.status === 404 && /rankiniu būdu/.test(e.message));
  await assert.rejects(() => fx.ecbRate(db, 'EUR', shift(-5), m), e => e.status === 400);
  await assert.rejects(() => fx.ecbRate(db, 'US', shift(-5), m), e => e.status === 400);
  await assert.rejects(() => fx.ecbRate(db, 'USD', '2026-02-30', m), e => e.status === 400);
  assert.equal(m.calls.length, 1);
  assert.equal(fx.isPublishedRate(db, 'USD', shift(-8), 1.2), true);
  assert.equal(fx.isPublishedRate(db, 'USD', shift(-8), 1.21), false);
  assert.equal(translateServerError('Nepavyko gauti Europos centrinio banko kurso (nėra ryšio): įveskite kursą rankiniu būdu', 'en').includes('enter the rate by hand'), true);
  assert.match(translateServerError('Europos centrinis bankas nėra paskelbęs XXX kurso 2026-10-01 dienai ar ankstesnėms dienoms: įveskite kursą rankiniu būdu', 'ru'), /XXX/);
});

test('ECB feed: older dates use the full history feed; a gap too long and offline give a message, not a guess', async () => {
  const hist = mock(feed({ '2025-03-03': { USD: 1.05 }, '2025-03-04': { USD: 1.06 } }));
  const r = await fx.ecbRate(db, 'USD', '2025-03-05', hist);
  assert.equal(r.rateDate, '2025-03-04');
  assert.deepEqual(hist.calls, [fx.ECB_FEEDS.HIST]);
  // Ten days after the last published day is too old to use silently.
  await assert.rejects(() => fx.ecbRate(db, 'USD', '2025-03-30', hist), e => e.status === 404);
  // Offline for a date nothing covers.
  const offline = mock(new Error('ENOTFOUND'));
  await assert.rejects(() => fx.ecbRate(db, 'USD', '2024-06-03', offline), e => e.status === 503 && /rankiniu būdu/.test(e.message));
  await assert.rejects(() => fx.ecbRate(db, 'USD', '2024-06-03', mock('<html>not xml feed</html>')), e => e.status === 503);
  assert.equal(offline.calls.length, 1);
});

test('foreign currency document: amounts convert to EUR on confirm, originals and rate are kept, the source is labelled', async () => {
  await fx.ecbRate(db, 'USD', shift(-8), mock(feed(RECENT)));
  const rateDate = shift(-8);
  const id = await extractedDoc(1, extracted({ currency: 'USD', number: 'USD-10', lines: [{ name: 'Licencija', quantity: 1, unitPrice: 120, net: 120, vatRate: 21, vat: 25.2, gross: 145.2 }], totals: { net: 120, vat: 25.2, gross: 145.2 } }));
  const preview = rec.previewDocument(1, id);
  assert.equal(preview.draft.currency, 'USD'); assert.equal(preview.draft.amountsInEur, false);
  assert.deepEqual(preview.draft.foreign, { currency: 'USD', rate: null, rateDate: null });
  assert.ok(preview.missing['foreign.rate']);
  const body = foreign => good({ number: 'USD-10', lines: [{ itemName: 'Licencija', quantity: 1, net: 120, vat: 25.2, gross: 145.2, vatRate: 21, taxCode: CODE }], totals: { net: 120, vat: 25.2, gross: 145.2 }, foreign });
  assert.ok(fieldsOf(() => rec.confirmDocument(1, id, 5, body(undefined))).currency);
  assert.ok(fieldsOf(() => rec.confirmDocument(1, id, 5, body({ currency: 'USD', rate: 0 })))['foreign.rate']);
  assert.ok(fieldsOf(() => rec.confirmDocument(1, id, 5, body({ currency: 'EUR', rate: 1.2 })))['foreign.currency']);
  assert.ok(fieldsOf(() => rec.confirmDocument(1, id, 5, body({ currency: 'USD', rate: 1.2, rateDate: 'x' })))['foreign.rateDate']);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM Purchase').get().n, 0);
  const out = rec.confirmDocument(1, id, 5, body({ currency: 'USD', rate: 1.2, rateDate }));
  // 120 USD / 1.2 = 100 EUR net, VAT 21 % of it.
  assert.equal(out.purchase.sumWithoutVat, 100); assert.equal(out.purchase.vat, 21); assert.equal(out.purchase.sumWithVat, 121);
  assert.equal(out.purchase.currencyCode, 'USD');
  assert.match(out.purchase.notes, /USD 145\.20|Dokumento valiuta USD: 145\.20, kursas 1\.2/);
  const kept = db.prepare('SELECT * FROM PurchaseForeignAmount WHERE purchaseId=?').get(out.purchase.id);
  assert.deepEqual({ ...kept }, { purchaseId: out.purchase.id, companyId: 1, currency: 'USD', rate: 1.2, rateDate, rateSource: 'ECB', net: 120, vat: 25.2, gross: 145.2 });
  assert.equal(db.prepare('SELECT SUM(amount) s FROM GeneralEntry WHERE sourceType=? AND sourceId=? AND debitAccount=?').get('PURCHASE', out.purchase.id, '2444').s, 21);
  // A rate that differs from the published one is labelled MANUAL, also without a rate date.
  const id2 = await extractedDoc(1, extracted({ currency: 'USD', number: 'USD-11', lines: [{ name: 'Licencija', quantity: 1, unitPrice: 120, net: 120, vatRate: 21, vat: 25.2, gross: 145.2 }], totals: { net: 120, vat: 25.2, gross: 145.2 } }));
  const out2 = rec.confirmDocument(1, id2, 5, { ...body({ currency: 'USD', rate: 1.3, rateDate }), number: 'USD-11' });
  assert.equal(db.prepare('SELECT rateSource FROM PurchaseForeignAmount WHERE purchaseId=?').get(out2.purchase.id).rateSource, 'MANUAL');
  assert.equal(out2.purchase.sumWithoutVat, 92.31);
  const id3 = await extractedDoc(1, extracted({ currency: 'USD', number: 'USD-12', lines: [{ name: 'Licencija', quantity: 1, unitPrice: 120, net: 120, vatRate: 21, vat: 25.2, gross: 145.2 }], totals: { net: 120, vat: 25.2, gross: 145.2 } }));
  const out3 = rec.confirmDocument(1, id3, 5, { ...body({ currency: 'USD', rate: 1.2 }), number: 'USD-12' });
  assert.equal(db.prepare('SELECT rateSource, rateDate FROM PurchaseForeignAmount WHERE purchaseId=?').get(out3.purchase.id).rateSource, 'MANUAL');
  // The legacy way still works: amounts typed in EUR and confirmed.
  const id4 = await extractedDoc(1, extracted({ currency: 'USD', number: 'USD-13' }));
  const out4 = rec.confirmDocument(1, id4, 5, good({ number: 'USD-13', amountsInEur: true }));
  assert.equal(out4.purchase.currencyCode, 'EUR');
  assert.equal(db.prepare('SELECT COUNT(*) n FROM PurchaseForeignAmount WHERE purchaseId=?').get(out4.purchase.id).n, 0);
  // Manual entry (no recognition) in a foreign currency works the same way.
  const row = rec.storeDocument(1, { buffer: env.pdf(), fileName: 'm.pdf', mimeType: 'application/pdf' });
  const manual = rec.confirmDocument(1, row.id, 5, { ...body({ currency: 'GBP', rate: 0.85 }), number: 'GBP-1' });
  assert.equal(manual.purchase.currencyCode, 'GBP'); assert.equal(manual.purchase.sumWithoutVat, 141.18);
});

test('review form: currency, rate and EUR totals', () => {
  const draft = { currency: 'USD', foreign: { currency: 'USD', rate: null, rateDate: null }, amountsInEur: false, issueDate: '2026-10-20', number: 'A', supplier: { name: 'T' }, lines: [{ itemName: 'x', quantity: 1, net: 120, vat: 25.2, gross: 145.2, vatRate: 21, taxCode: CODE }], totals: { net: 120, vat: 25.2, gross: 145.2 } };
  const f = form.draftToForm(draft);
  assert.equal(f.currency, 'USD'); assert.equal(f.rate, ''); assert.equal(form.isForeign(f), true);
  const ctx = { extractedSupplierCode: null, docKind: 'INVOICE', currency: 'USD', allowedTaxCodes: [CODE], companyVatPayer: true };
  assert.equal(form.validateForm(f, ctx)['foreign.rate'].key, 'docs.v_rate');
  assert.equal(form.validateForm(f, ctx).currency, undefined);
  const withRate = { ...f, rate: '1,2', rateDate: '2026-10-20', rateSource: 'ECB' };
  assert.deepEqual(Object.keys(form.validateForm(withRate, ctx)).filter(k => k.startsWith('foreign')), []);
  assert.deepEqual(form.eurTotals(withRate), { net: 100, vat: 21, gross: 121 });
  assert.equal(form.eurTotals(f), null);
  assert.deepEqual(form.formToPayload(withRate).foreign, { currency: 'USD', rate: 1.2, rateDate: '2026-10-20' });
  assert.equal(form.formToPayload({ ...withRate, amountsInEur: true }).foreign, undefined);
  assert.equal(form.formToPayload(form.draftToForm({ ...draft, currency: undefined, foreign: undefined, amountsInEur: true })).foreign, undefined);
  // EUR document: nothing foreign.
  assert.equal(form.isForeign({ ...f, currency: 'EUR' }), false);
  assert.equal(form.validateForm({ ...f, currency: 'US' }, ctx)['foreign.currency'].key, 'docs.v_currencyCode');
});
