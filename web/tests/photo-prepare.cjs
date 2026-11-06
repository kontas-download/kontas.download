const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const sharp = require('sharp');
const env = require('./helpers/recognition-env.cjs')('erp-photo-prepare-');
const { db, rec, src, extracted } = env;
const photo = src('photo-prepare.ts');
after(() => { db.close(); fs.rmSync(env.temp, { recursive: true, force: true }); });

// 64x64 colour test picture, 499 bytes (HEVC in a HEIF container; from the libheif fuzzing corpus, used only as a decode fixture).
const HEIC = Buffer.from('AAAAGGZ0eXBoZWljAAAAAG1pZjFoZWljAAABLm1ldGEAAAAAAAAAIWhkbHIAAAAAAAAAAHBpY3QAAAAAAAAAAAAAAAAAAAAADnBpdG0AAAAAAAEAAAAiaWxvYwAAAABEQAABAAEAAAAAAU4AAQAAAAAAAAClAAAAI2lpbmYAAAAAAAEAAAAVaW5mZQIAAAAAAQAAaHZjMQAAAACuaXBycAAAAJFpcGNvAAAAdWh2Y0MBA3AAAAAAAAAAAAAe8AD8/fj4AAAPAyAAAQAYQAEMAf//A3AAAAMAkAAAAwAAAwAeugJAIQABAChCAQEDcAAAAwCQAAADAAADAB6gIIEFlupJKa5sCAAAAwAIAAADAAhAIgABAAdEAcFysCJAAAAAFGlzcGUAAAAAAAAAQAAAAEAAAAAVaXBtYQAAAAAAAAABAAECgQIAAACtbWRhdAAAAKEmAa8TgIGSEXXAGM2sfMMD8HKXsBNBYjkEW6//QKl1HfLCc/SN/bWOG2ARaa8rk4JsxRuKJFz/vIlnrSBv0Pk7pYMv503LniUfVt0RGOMyTBZVcbnDhlXs0nsTVObq7679Fh7MfXPARYndCrwpKWSNTQcCjNVYWPVOenDxU81lLBnE070xnN107IoLiTNywdiNWzedf/q6zzV3iwZflrO94A==', 'base64');
const sha = buffer => crypto.createHash('sha256').update(buffer).digest('hex');
const raw = (width, height, value, noise = 0) => {
  const data = Buffer.alloc(width * height * 3);
  for (let i = 0; i < data.length; i++) data[i] = value + (noise ? (i % 7) * noise : 0);
  return sharp(data, { raw: { width, height, channels: 3 } });
};
const provider = () => ({ calls: [], async recognize(file) { this.calls.push(file); return extracted(); } });

test('HEIC is recognized by its brand and decoded to a JPEG by the wasm decoder (sharp alone cannot)', async () => {
  assert.equal(photo.isHeic(HEIC), true);
  assert.equal(photo.isHeic(Buffer.from('%PDF-1.4 x')), false);
  const out = await photo.prepareImage(HEIC, 'image/heic');
  assert.equal(out.mimeType, 'image/jpeg');
  const meta = await sharp(out.data).metadata();
  assert.equal(meta.format, 'jpeg'); assert.equal(meta.width, 64); assert.equal(meta.height, 64);
  await assert.rejects(photo.prepareImage(Buffer.concat([Buffer.from([0, 0, 0, 24]), Buffer.from('ftypheic'), Buffer.alloc(60)]), 'image/heic'), e => e.status === 422);
});

test('prepareImage: EXIF orientation applied, long side limited to 2500 px, never enlarged, contrast stretched', async () => {
  const rotated = await raw(3000, 1500, 120, 3).jpeg().withMetadata({ orientation: 6 }).toBuffer();
  assert.equal((await sharp(rotated).metadata()).orientation, 6);
  const out = await photo.prepareImage(rotated, 'image/jpeg');
  const meta = await sharp(out.data).metadata();
  assert.equal(meta.height, 2500, 'long side is 2500');
  assert.equal(meta.width, 1250, 'orientation 6 turns the 3000x1500 landscape into a portrait');
  assert.ok(!meta.orientation || meta.orientation === 1, 'the copy carries no orientation tag any more');
  const small = await photo.prepareImage(await raw(400, 300, 128).png().toBuffer(), 'image/png');
  const smallMeta = await sharp(small.data).metadata();
  assert.equal(smallMeta.format, 'jpeg'); assert.equal(smallMeta.width, 400); assert.equal(smallMeta.height, 300);
  // A low-contrast page (values 100-130) is stretched.
  const flat = await sharp(Buffer.from(Array.from({ length: 100 * 100 }, (_, i) => (i % 2 ? 100 : 130))), { raw: { width: 100, height: 100, channels: 1 } }).png().toBuffer();
  const stats = await sharp((await photo.prepareImage(flat, 'image/png')).data).stats();
  assert.ok(stats.channels[0].max - stats.channels[0].min > 60, 'contrast was normalized');
  // Something that is not an image goes through unchanged (the provider then reports it).
  const junk = Buffer.from([0xff, 0xd8, 0xff, 1, 2, 3]);
  const same = await photo.prepareImage(junk, 'image/jpeg');
  assert.equal(same.converted, false); assert.ok(same.data.equals(junk)); assert.equal(same.mimeType, 'image/jpeg');
});

test('HEIC upload: stored unchanged (write-once, sha256), recognition receives the prepared JPEG, the cache is rebuilt from the original', async () => {
  const row = rec.storeDocument(1, { buffer: HEIC, fileName: 'IMG_0001.HEIC', mimeType: 'image/heic', source: 'UPLOAD' });
  assert.equal(row.mimeType, 'image/heic'); assert.equal(row.sha256, sha(HEIC)); assert.match(row.storagePath, /\.heic$/);
  const stored = path.join(rec.documentsRoot(), row.storagePath);
  assert.ok(fs.readFileSync(stored).equals(HEIC));
  const fake = provider();
  const done = await rec.recognizeDocument(1, row.id, fake);
  assert.equal(done.status, 'EXTRACTED');
  assert.equal(fake.calls[0].mimeType, 'image/jpeg');
  assert.equal((await sharp(fake.calls[0].data).metadata()).format, 'jpeg');
  assert.ok(fs.readFileSync(stored).equals(HEIC), 'the original is untouched by recognition');
  const prepared = stored.replace(/\.heic$/, '.prep.jpg');
  assert.ok(fs.existsSync(prepared), 'the prepared copy is cached beside the original');
  assert.ok(fs.readFileSync(prepared).equals(fake.calls[0].data));
  fs.rmSync(prepared);
  const view = await rec.preparedImage(1, row.id);
  assert.equal(view.mimeType, 'image/jpeg'); assert.ok(fs.existsSync(prepared));
  assert.equal(rec.readDocumentFile(1, row.id).row.mimeType, 'image/heic', 'the plain file route still serves the original');
  await assert.rejects(rec.preparedImage(1, rec.storeDocument(1, { buffer: Buffer.from('%PDF-1.4 ' + crypto.randomUUID()), fileName: 'a.pdf' }).id), e => e.status === 404);
  // image/heif is the same container
  assert.equal(rec.storeDocument(1, { buffer: Buffer.concat([HEIC, Buffer.from([0])]), fileName: 'b.heif', mimeType: 'image/heif' }).mimeType, 'image/heic');
  rec.deleteDocument(1, row.id);
  assert.ok(!fs.existsSync(stored) && !fs.existsSync(prepared), 'deleting an unconfirmed document removes the derived copy too');
});

test('a photo the decoder cannot read fails recognition with a clear message instead of crashing', async () => {
  const broken = Buffer.concat([Buffer.from([0, 0, 0, 24]), Buffer.from('ftypheic'), Buffer.alloc(80)]);
  const row = rec.storeDocument(1, { buffer: broken, fileName: 'broken.heic', mimeType: 'image/heic' });
  const fake = provider();
  const done = await rec.recognizeDocument(1, row.id, fake);
  assert.equal(done.status, 'FAILED'); assert.match(done.error, /HEIC/); assert.equal(fake.calls.length, 0);
});

test('an ordinary JPEG is sent as the prepared copy and stored unchanged', async () => {
  const jpg = await raw(3200, 2400, 90, 2).jpeg().withMetadata({ orientation: 3 }).toBuffer();
  const row = rec.storeDocument(1, { buffer: jpg, fileName: 'foto.jpg', mimeType: 'image/jpeg' });
  const fake = provider();
  await rec.recognizeDocument(1, row.id, fake);
  const meta = await sharp(fake.calls[0].data).metadata();
  assert.equal(Math.max(meta.width, meta.height), 2500);
  assert.ok(fs.readFileSync(path.join(rec.documentsRoot(), row.storagePath)).equals(jpg));
  assert.equal(rec.getDocument(1, row.id).size, jpg.length);
});
