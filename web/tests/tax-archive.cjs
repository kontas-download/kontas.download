const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const zlib = require('node:zlib');
const env = require('./helpers/recognition-env.cjs')('erp-tax-archive-');
const ubl = require('./helpers/ubl-fixture.cjs');
const { db, rec, src, pdf, good, extractedDoc, CODE } = env;
const archive = src('tax-archive.ts');
const zip = src('zip-stream.ts');
const { withActor } = src('audit-actor.ts');
after(() => { db.close(); fs.rmSync(env.temp, { recursive: true, force: true }); });

const sha = buffer => crypto.createHash('sha256').update(buffer).digest('hex');
const EXPENSE = db.prepare("SELECT code FROM ChartOfAccount WHERE code GLOB '[6-7]*' AND code NOT LIKE '27%' ORDER BY code LIMIT 1").get().code;
db.prepare("INSERT INTO User(id,email,name,passwordHash,role) VALUES(7,'jonas@example.com','Jonas Jonaitis','x','admin')").run();

// Reads a "stored" ZIP the way an unzip tool would: end record -> central directory -> local headers; verifies CRC and sizes.
function readZip(buffer) {
  let end = buffer.length - 22;
  while (end >= 0 && buffer.readUInt32LE(end) !== 0x06054b50) end--;
  assert.ok(end >= 0, 'end of central directory record');
  const count = buffer.readUInt16LE(end + 10);
  let pos = buffer.readUInt32LE(end + 16);
  const entries = new Map();
  for (let i = 0; i < count; i++) {
    assert.equal(buffer.readUInt32LE(pos), 0x02014b50);
    const flags = buffer.readUInt16LE(pos + 8), method = buffer.readUInt16LE(pos + 10), crc = buffer.readUInt32LE(pos + 16), size = buffer.readUInt32LE(pos + 24);
    const nameLength = buffer.readUInt16LE(pos + 28), offset = buffer.readUInt32LE(pos + 42);
    const name = buffer.subarray(pos + 46, pos + 46 + nameLength).toString('utf8');
    assert.equal(flags & 0x0800, 0x0800); assert.equal(method, 0);
    assert.equal(buffer.readUInt32LE(offset), 0x04034b50);
    const start = offset + 30 + buffer.readUInt16LE(offset + 26) + buffer.readUInt16LE(offset + 28);
    const data = buffer.subarray(start, start + size);
    assert.equal(zlib.crc32(data) >>> 0, crc, `crc of ${name}`);
    assert.equal(buffer.readUInt32LE(offset + 18), size);
    entries.set(name, data);
    pos += 46 + nameLength + buffer.readUInt16LE(pos + 30) + buffer.readUInt16LE(pos + 32);
  }
  return entries;
}
const collect = async stream => Buffer.from(await new Response(stream).arrayBuffer());
const purchase = (companyId, fields) => Number(db.prepare('INSERT INTO Purchase(companyId,purchaseDate,series,number,clientName,clientCode,sumWithoutVat,vat,sumWithVat,currencyCode,debitAccount) VALUES(?,?,?,?,?,?,?,?,?,?,?)')
  .run(companyId, fields.date, fields.series ?? null, fields.number, fields.supplier, fields.code ?? null, fields.net ?? 10, fields.vat ?? 2.1, fields.gross ?? 12.1, 'EUR', fields.account ?? null).lastInsertRowid);

test('period validation', () => {
  assert.throws(() => archive.validatePeriod('2026-13-01', '2026-12-31'), e => e.status === 400);
  assert.throws(() => archive.validatePeriod('2026-10-31', '2026-10-01'), e => e.status === 400);
  assert.throws(() => archive.validatePeriod('2015-01-01', '2026-12-31'), e => e.status === 400 && /ilgas/.test(e.message));
  assert.deepEqual(archive.validatePeriod('2026-01-01', '2026-12-31'), { from: '2026-01-01', to: '2026-12-31' });
});

test('the archive holds originals, a register and a README; missing originals are listed; other periods and companies are left out', async () => {
  // Purchase A: a recognized PDF confirmed by user 7, uploaded by user 7 (the actor of the request).
  const pdfA = pdf('A');
  const rowA = withActor(db, 7, () => rec.storeDocument(1, { buffer: pdfA, fileName: 'tiekejas A.pdf', mimeType: 'application/pdf' }));
  assert.equal(rowA.uploadedBy, 7);
  await rec.recognizeDocument(1, rowA.id, { async recognize() { return env.extracted({ number: 'A-1' }); } });
  const confirmed = rec.confirmDocument(1, rowA.id, 7, good({ number: 'A-1', issueDate: '2026-10-20', debitAccount: EXPENSE }));
  const purchaseA = confirmed.purchase.id;
  db.prepare("INSERT INTO BankTransaction(date,number,sum,companyId) VALUES('2026-10-25','PAY-9',-24.2,1)").run();
  const bankId = db.prepare('SELECT MAX(id) AS id FROM BankTransaction').get().id;
  db.prepare("INSERT INTO PaymentAllocation(companyId,bankTransactionId,purchaseId,amount,createdAt) VALUES(1,?,?,24.2,0)").run(bankId, purchaseA);
  // Purchase B: an XML e-invoice with its PDF image.
  const xmlB = Buffer.from(ubl.invoice({ number: 'IM-1' })), visualB = pdf('visual B');
  const rowB = rec.storeDocument(1, { buffer: xmlB, fileName: 'IM-1.xml', mimeType: 'application/xml', source: 'EMAIL', sender: 'tiekejas@example.com', visual: { buffer: visualB, fileName: 'IM-1.pdf' } });
  const purchaseB = purchase(1, { date: '2026-10-21', series: 'IM', number: '-1', supplier: 'UAB Žalgiris & Ko', code: '300000009' });
  db.prepare("UPDATE PurchaseDocument SET purchaseId=?, status='CONFIRMED', confirmedBy=7, confirmedAt='2026-10-22T08:00:00.000Z' WHERE id=?").run(purchaseB, rowB.id);
  // Purchase C: no original. D: another period. E: another company.
  purchase(1, { date: '2026-10-05', number: 'MAN-1', supplier: 'UAB Be Originalo' });
  purchase(1, { date: '2025-10-05', number: 'OLD-1', supplier: 'UAB Senas' });
  purchase(2, { date: '2026-10-06', number: 'KITA-1', supplier: 'UAB Kitos Imones' });

  const plan = archive.planTaxArchive(1, '2026-10-01', '2026-10-31');
  assert.equal(plan.register.length, 3);
  assert.equal(plan.missing, 1);
  assert.deepEqual(plan.register.map(r => r.document), ['MAN-1', 'A-1', 'IM-1']);
  const byDoc = Object.fromEntries(plan.register.map(r => [r.document, r]));
  assert.equal(byDoc['MAN-1'].note, 'originalas nepateiktas'); assert.equal(byDoc['MAN-1'].sha256, ''); assert.equal(byDoc['MAN-1'].zipFile, '');
  assert.equal(byDoc['A-1'].sha256, sha(pdfA)); assert.equal(byDoc['A-1'].originalName, 'tiekejas A.pdf');
  assert.equal(byDoc['A-1'].zipFile, 'originalai/2026-10-20_UAB_Tiekejas_A-1.pdf');
  assert.equal(byDoc['A-1'].uploadedBy, 'Jonas Jonaitis'); assert.equal(byDoc['A-1'].confirmedBy, 'Jonas Jonaitis');
  assert.match(byDoc['A-1'].bankLink, /2026-10-25 PAY-9 24\.20/);
  assert.equal(byDoc['A-1'].debitAccount, EXPENSE);
  assert.ok(byDoc['A-1'].taxCodes.includes(CODE), 'PVM codes of the lines');
  assert.equal(byDoc['IM-1'].zipFile, 'originalai/2026-10-21_UAB_Zalgiris_Ko_IM-1.xml');
  assert.equal(byDoc['IM-1'].visualZipFile, 'originalai/2026-10-21_UAB_Zalgiris_Ko_IM-1.pdf');
  assert.equal(byDoc['IM-1'].uploadedBy, 'tiekejas@example.com');
  assert.equal(plan.files.length, 3);

  const bytes = await collect(archive.taxArchiveStream(plan, new Date('2026-11-06T10:00:00Z')));
  const entries = readZip(bytes);
  assert.deepEqual([...entries.keys()].sort(), ['README.txt', 'originalai/2026-10-20_UAB_Tiekejas_A-1.pdf', 'originalai/2026-10-21_UAB_Zalgiris_Ko_IM-1.pdf', 'originalai/2026-10-21_UAB_Zalgiris_Ko_IM-1.xml', 'registras.csv'].sort());
  assert.ok(entries.get(byDoc['A-1'].zipFile).equals(pdfA), 'original bytes are unchanged');
  assert.ok(entries.get(byDoc['IM-1'].zipFile).equals(xmlB)); assert.ok(entries.get(byDoc['IM-1'].visualZipFile).equals(visualB));
  const csv = entries.get('registras.csv').toString('utf8');
  assert.ok(csv.startsWith('\uFEFFData;Tiekėjas;'));
  assert.ok(csv.includes('originalas nepateiktas') && csv.includes(sha(pdfA)) && csv.includes(sha(visualB)));
  assert.ok(!csv.includes('UAB Senas') && !csv.includes('Kitos Imones'));
  const readme = entries.get('README.txt').toString('utf8');
  assert.ok(readme.includes('SHA-256') && readme.includes('2026-10-01') && readme.includes('Get-FileHash') && readme.includes('originalas nepateiktas'));
  // Every original in the archive matches the SHA-256 in the register.
  for (const r of plan.register.filter(x => x.zipFile)) assert.equal(sha(entries.get(r.zipFile)), r.sha256);
});

test('equal names get a numeric suffix and unreadable file names are made safe', () => {
  const a = pdf('same 1'), b = pdf('same 2');
  for (const [buffer, n] of [[a, 1], [b, 2]]) {
    const row = rec.storeDocument(1, { buffer, fileName: `x${n}.pdf`, mimeType: 'application/pdf' });
    const id = purchase(1, { date: '2026-11-02', number: n === 1 ? '../ev<il>*?|' : '../ev<il>*?/', supplier: 'Šilas "Ąžuolas" / Ū' });
    db.prepare("UPDATE PurchaseDocument SET purchaseId=?, status='CONFIRMED' WHERE id=?").run(id, row.id);
  }
  const plan = archive.planTaxArchive(1, '2026-11-01', '2026-11-30');
  const names = plan.files.map(f => f.name);
  assert.deepEqual(names, ['originalai/2026-11-02_Silas_Azuolas_U_ev_il.pdf', 'originalai/2026-11-02_Silas_Azuolas_U_ev_il_2.pdf']);
  for (const name of names) assert.doesNotMatch(name, /[<>:"\\|?*]|\.\./);
});

test('zipStream writes a valid archive in chunks without holding a large file in memory', async () => {
  const big = path.join(env.temp, 'big.bin');
  const block = crypto.randomBytes(1024 * 1024);
  const fd = fs.openSync(big, 'w');
  for (let i = 0; i < 12; i++) fs.writeSync(fd, block);
  fs.closeSync(fd);
  const stream = zip.zipStream([{ name: 'a/b.txt', data: Buffer.from('labas'), modified: new Date() }, { name: 'didelis.bin', path: big, modified: new Date() }, { name: 'tuscias.txt', data: Buffer.alloc(0), modified: new Date() }]);
  const reader = stream.getReader();
  const chunks = [];
  let largest = 0;
  for (;;) { const { done, value } = await reader.read(); if (done) break; chunks.push(Buffer.from(value)); largest = Math.max(largest, value.length); }
  assert.ok(chunks.length > 12, 'streamed in many chunks');
  assert.ok(largest <= 1024 * 1024, 'no chunk holds the whole file');
  const entries = readZip(Buffer.concat(chunks));
  assert.equal(entries.get('a/b.txt').toString(), 'labas'); assert.equal(entries.get('didelis.bin').length, 12 * 1024 * 1024); assert.equal(entries.get('tuscias.txt').length, 0);
  await assert.rejects(collect(zip.zipStream([{ name: 'x', data: Buffer.from('1'), modified: new Date() }, { name: 'X', data: Buffer.from('2'), modified: new Date() }])));
});

test('the route needs a session and the page offers the download', () => {
  const route = fs.readFileSync(path.join(__dirname, '../src/app/api/purchase-documents/archive/route.ts'), 'utf8');
  assert.match(route, /requireApiAccess/); assert.match(route, /application\/zip/);
  assert.match(fs.readFileSync(path.join(__dirname, '../src/app/purchase-documents/DocumentsClient.tsx'), 'utf8'), /purchase-documents\/archive\?from=/);
});
