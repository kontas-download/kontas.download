import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type Database from 'better-sqlite3';
import { getDb } from './db';
import { HttpError } from './errors';
import { documentsRootFor } from './document-files';
import { ensureLocalFile, remotePut, remoteRemove } from './document-remote';
import { isHeic, prepareImage } from './photo-prepare';
import { encryptSecret, decryptSecret } from './company-mail';
import { buyerMatchesCompany, findSupplierId, importXmlPurchase, previewXmlPurchase } from './purchase-import';
import { parseUblInvoice } from './ubl-invoice';
import { createPurchase } from './purchases';
import { companyTaxMode, purchaseDebitAccount } from './tax';
import { ASSET_CATEGORIES, FIXED_ASSET_ACCOUNTS, categoryForAccount, createAsset, isFixedAssetAccount, type AssetCategory } from './fixed-assets';
import { inventorySettings } from './inventory';
import { convertLine, validCurrencyCode, validRate } from './foreign-currency';
import { isPublishedRate } from './exchange-rates';
import { insertPurchaseCredit, planPurchaseCredit } from './purchase-credit';
import { addressToSuggest, findClientByEmail, senderContext } from './document-inbox-senders';
import { findRule, markRuleUsed, saveSupplierRule, type SupplierRule } from './supplier-rules';
import { codesFor } from './tax-codes';
import { setLineCodes } from './tax-line-codes';
import { dateValue } from './validation';
import { findDuplicates, type DuplicateHit } from './purchase-duplicates';
import { DEFAULT_USD_TO_EUR, estimateCostUsd } from './recognition/models';
import { RecognitionError, RecognizedDocumentSchema, type RecognitionProvider, type RecognizedDocument } from './recognition/types';

export type DocumentStatus = 'NEW' | 'EXTRACTED' | 'FAILED' | 'CONFIRMED' | 'REJECTED';
export interface PurchaseDocumentRow {
  id: number; companyId: number; purchaseId: number | null; fileName: string; mimeType: string; size: number; sha256: string; storagePath: string;
  source: 'UPLOAD' | 'EMAIL'; sender: string | null; receivedAt: string; status: DocumentStatus; extractedJson: string | null; error: string | null;
  model: string | null; createdAt: string; confirmedAt: string | null; confirmedBy: number | null; accountSource: AccountSource | null;
  visualName: string | null; visualSha256: string | null; uploadedBy: number | null; originalSender: string | null;
}
// Field name -> Lithuanian message. Keys: 'supplier.name', 'issueDate', 'number', 'lines.0.taxCode', 'totals.gross', ...
export type FieldErrors = Record<string, string>;
export class FieldErrorsError extends HttpError {
  constructor(public fields: FieldErrors, status = 400) { super(status, Object.values(fields)[0] || 'Neteisingi duomenys'); }
}

const MAX_SIZE = 20 * 1024 * 1024;
export const XML_MIME = 'application/xml';
const EXTENSIONS: Record<string, string> = { 'application/pdf': 'pdf', 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/heic': 'heic', [XML_MIME]: 'xml' };
const NOT_FINAL = ['NEW', 'EXTRACTED', 'FAILED'];

// ---------- settings ----------

export function getRecognitionSettings(companyId: number) {
  const row = getDb().prepare('SELECT enabled, apiKeyEncrypted, model, monthlyLimitEur FROM CompanyRecognitionSettings WHERE companyId=?').get(companyId) as { enabled: number; apiKeyEncrypted: string | null; model: string; monthlyLimitEur: number | null } | undefined;
  // The key itself never leaves the server: only whether one is stored.
  return { enabled: Boolean(row?.enabled), model: row?.model || '', hasKey: Boolean(row?.apiKeyEncrypted), monthlyLimitEur: row?.monthlyLimitEur ?? null };
}

// ---------- estimated cost and the monthly limit ----------

// Fixed factor for the displayed estimate and the limit; costs are stored in USD (the unit of the price table).
export function usdToEur(): number {
  const configured = Number(process.env.RECOGNITION_USD_TO_EUR);
  return Number.isFinite(configured) && configured > 0 ? configured : DEFAULT_USD_TO_EUR;
}
const toEur = (usd: number) => Math.round(usd * usdToEur() * 10000) / 10000;

export function recordRecognitionUsage(companyId: number, documentId: number | null, usage: { model: string; inputTokens: number; outputTokens: number }) {
  const input = Math.max(0, Math.round(Number(usage.inputTokens) || 0)), output = Math.max(0, Math.round(Number(usage.outputTokens) || 0));
  getDb().prepare('INSERT INTO RecognitionUsage(companyId,documentId,model,inputTokens,outputTokens,costUsd) VALUES(?,?,?,?,?,?)')
    .run(companyId, documentId, String(usage.model || '').slice(0, 100), input, output, estimateCostUsd(usage.model, input, output));
}

// Spend of the calendar month (UTC) of `now`: calls, tokens and the estimated cost in EUR, against the optional limit.
export function recognitionUsageSummary(companyId: number, now = new Date()) {
  const month = now.toISOString().slice(0, 7);
  const row = getDb().prepare('SELECT COUNT(*) AS calls, COALESCE(SUM(inputTokens),0) AS inputTokens, COALESCE(SUM(outputTokens),0) AS outputTokens, COALESCE(SUM(costUsd),0) AS costUsd FROM RecognitionUsage WHERE companyId=? AND substr(createdAt,1,7)=?')
    .get(companyId, month) as { calls: number; inputTokens: number; outputTokens: number; costUsd: number };
  const limitEur = getRecognitionSettings(companyId).monthlyLimitEur;
  const costEur = toEur(row.costUsd);
  return { month, calls: row.calls, inputTokens: row.inputTokens, outputTokens: row.outputTokens, costEur, limitEur, limitReached: limitEur !== null && costEur >= limitEur };
}

// Estimated cost (EUR) per document, summed over all its recognition calls.
function documentCosts(companyId: number, ids?: number[]): Map<number, number> {
  const rows = (ids
    ? getDb().prepare(`SELECT documentId, SUM(costUsd) AS costUsd FROM RecognitionUsage WHERE companyId=? AND documentId IN (${ids.map(() => '?').join(',') || 'NULL'}) GROUP BY documentId`).all(companyId, ...ids)
    : getDb().prepare('SELECT documentId, SUM(costUsd) AS costUsd FROM RecognitionUsage WHERE companyId=? AND documentId IS NOT NULL GROUP BY documentId').all(companyId)) as { documentId: number; costUsd: number }[];
  return new Map(rows.map(r => [r.documentId, toEur(r.costUsd)]));
}

export function saveRecognitionSettings(companyId: number, body: Record<string, unknown>) {
  const { enabled, apiKey, clearKey, model, monthlyLimitEur } = body;
  if (typeof enabled !== 'boolean') throw new HttpError(400, 'Nurodykite, ar atpažinimas įjungtas');
  if (model !== undefined && model !== null && (typeof model !== 'string' || (model !== '' && !/^[A-Za-z0-9._:-]{1,100}$/.test(model)))) throw new HttpError(400, 'Neteisingas modelio pavadinimas');
  if (apiKey !== undefined && apiKey !== null && (typeof apiKey !== 'string' || apiKey.length > 500 || /\s/.test(apiKey))) throw new HttpError(400, 'Neteisingas API raktas');
  // undefined = keep the stored limit; null or '' = no limit.
  if (monthlyLimitEur !== undefined && monthlyLimitEur !== null && monthlyLimitEur !== '' && (typeof monthlyLimitEur !== 'number' || !Number.isFinite(monthlyLimitEur) || monthlyLimitEur <= 0 || monthlyLimitEur > 100000)) throw new HttpError(400, 'Mėnesio limitas turi būti teigiamas skaičius eurais');
  const previous = getDb().prepare('SELECT apiKeyEncrypted, model, monthlyLimitEur FROM CompanyRecognitionSettings WHERE companyId=?').get(companyId) as { apiKeyEncrypted: string | null; model: string; monthlyLimitEur: number | null } | undefined;
  const limit = monthlyLimitEur === undefined ? previous?.monthlyLimitEur ?? null : typeof monthlyLimitEur === 'number' ? Math.round(monthlyLimitEur * 100) / 100 : null;
  const secret = clearKey === true ? '' : typeof apiKey === 'string' && apiKey ? encryptSecret(apiKey, companyId) : previous?.apiKeyEncrypted || '';
  if (enabled && !secret) throw new HttpError(400, 'Norėdami įjungti atpažinimą, įveskite API raktą.');
  getDb().prepare(`INSERT INTO CompanyRecognitionSettings(companyId,enabled,apiKeyEncrypted,model,monthlyLimitEur,updatedAt) VALUES(?,?,?,?,?,strftime('%Y-%m-%dT%H:%M:%fZ','now'))
    ON CONFLICT(companyId) DO UPDATE SET enabled=excluded.enabled,apiKeyEncrypted=excluded.apiKeyEncrypted,model=excluded.model,monthlyLimitEur=excluded.monthlyLimitEur,updatedAt=excluded.updatedAt`)
    .run(companyId, enabled ? 1 : 0, secret || null, typeof model === 'string' ? model : previous?.model || '', limit);
  return getRecognitionSettings(companyId);
}

// Checks the key (typed in the form, or the stored one) and the model with a tiny request. Provider failures come back as { ok:false, error }.
export async function testRecognitionKey(companyId: number, body: Record<string, unknown>, provider: RecognitionProvider): Promise<{ ok: true } | { ok: false; error: string }> {
  const stored = getDb().prepare('SELECT apiKeyEncrypted, model FROM CompanyRecognitionSettings WHERE companyId=?').get(companyId) as { apiKeyEncrypted: string | null; model: string } | undefined;
  const typed = typeof body.apiKey === 'string' ? body.apiKey.trim() : '';
  if (typed && (typed.length > 500 || /\s/.test(typed))) throw new HttpError(400, 'Neteisingas API raktas');
  if (!typed && !stored?.apiKeyEncrypted) throw new HttpError(400, 'Pirmiausia įveskite API raktą.');
  const model = typeof body.model === 'string' ? body.model : stored?.model || '';
  if (model && !/^[A-Za-z0-9._:-]{1,100}$/.test(model)) throw new HttpError(400, 'Neteisingas modelio pavadinimas');
  const apiKey = typed || decryptSecret(stored!.apiKeyEncrypted!, companyId, 'Nepavyko nuskaityti išsaugoto API rakto. Patikrinkite šifravimo raktą.');
  try {
    await provider.testKey(apiKey, model);
    return { ok: true };
  } catch (error) {
    if (error instanceof RecognitionError) return { ok: false, error: error.message };
    console.error('Recognition key test failed', error);
    return { ok: false, error: 'Nepavyko susisiekti su atpažinimo paslauga.' };
  }
}

// ---------- file storage ----------

export function documentsRoot() {
  return documentsRootFor(getDb().name);
}
export function absolutePath(storagePath: string) {
  const root = path.resolve(documentsRoot());
  const full = path.resolve(root, storagePath);
  if (!full.startsWith(root + path.sep)) throw new HttpError(400, 'Neteisingas failo kelias');
  return full;
}
// A stored file that may be missing from the local cache (Cloudflare Containers): fetched from R2 first. False when it exists nowhere.
export function ensureStoredFile(storagePath: string) {
  return ensureLocalFile(documentsRoot(), storagePath);
}
function readStored(storagePath: string) {
  ensureStoredFile(storagePath);
  return fs.readFileSync(absolutePath(storagePath));
}

// Magic check of an XML e-invoice: UBL Invoice / CreditNote root (the parser decides later whether the content can be mapped).
export function looksLikeUblInvoice(buffer: Buffer): boolean {
  const head = buffer.subarray(0, 4096).toString('utf8').replace(/^\uFEFF/, '');
  return /^\s*(<\?xml[^>]*\?>\s*)?(<!--[\s\S]*?-->\s*)*<(\w+:)?(Invoice|CreditNote)[\s>]/.test(head) || /urn:oasis:names:specification:ubl:schema:xsd:(Invoice|CreditNote)-2/.test(head);
}

export function detectMime(buffer: Buffer): string | null {
  if (buffer.length >= 5 && buffer.subarray(0, 5).toString('latin1') === '%PDF-') return 'application/pdf';
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return 'image/jpeg';
  if (buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image/png';
  if (buffer.length >= 12 && buffer.subarray(0, 4).toString('latin1') === 'RIFF' && buffer.subarray(8, 12).toString('latin1') === 'WEBP') return 'image/webp';
  if (isHeic(buffer)) return 'image/heic';
  if (looksLikeUblInvoice(buffer)) return XML_MIME;
  return null;
}
// `visual`: the PDF of the same invoice received beside an XML e-invoice, kept as its visual original (not a queue item of its own).
export function storeDocument(companyId: number, input: { buffer: Buffer; fileName: string; mimeType?: string; source?: 'UPLOAD' | 'EMAIL'; sender?: string | null; originalSender?: string | null; visual?: { buffer: Buffer; fileName: string } }): PurchaseDocumentRow {
  const db = getDb();
  const { buffer } = input;
  if (!buffer.length) throw new HttpError(400, 'Failas tuščias');
  if (buffer.length > MAX_SIZE) throw new HttpError(413, 'Failas per didelis: leidžiama iki 20 MB');
  const declared = (input.mimeType || '').toLowerCase().split(';')[0].trim().replace(/^text\/xml$/, XML_MIME).replace(/^image\/(heif|heic-sequence|heif-sequence)$/, 'image/heic');
  const detected = detectMime(buffer);
  if (!detected) throw new HttpError(415, 'Palaikomi tik PDF, JPEG, PNG, WebP, HEIC ir UBL XML e-sąskaitos failai.');
  if (declared && declared !== 'application/octet-stream' && declared !== detected && !(declared === 'image/jpg' && detected === 'image/jpeg')) throw new HttpError(415, 'Failo turinys neatitinka nurodyto tipo.');
  const sha256 = createHash('sha256').update(buffer).digest('hex');
  const existing = db.prepare('SELECT id, fileName FROM PurchaseDocument WHERE companyId=? AND sha256=?').get(companyId, sha256) as { id: number; fileName: string } | undefined;
  if (existing) throw Object.assign(new HttpError(409, `Šis dokumentas jau įkeltas (Nr. ${existing.id}, ${existing.fileName}).`), { existingId: existing.id });
  const source = input.source === 'EMAIL' ? 'EMAIL' : 'UPLOAD';
  const storagePath = `${companyId}/${new Date().getUTCFullYear()}/${sha256}.${EXTENSIONS[detected]}`;
  const full = absolutePath(storagePath);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  // The visual original (PDF only) of an XML e-invoice; skipped when that very file is already stored for the company.
  let visual: { sha: string; name: string; full: string; buffer: Buffer } | null = null;
  if (input.visual && detected === XML_MIME && detectMime(input.visual.buffer) === 'application/pdf' && input.visual.buffer.length <= MAX_SIZE) {
    const vsha = createHash('sha256').update(input.visual.buffer).digest('hex');
    if (!db.prepare('SELECT 1 FROM PurchaseDocument WHERE companyId=? AND (sha256=? OR visualSha256=?)').get(companyId, vsha, vsha)) {
      visual = { sha: vsha, name: (path.basename(input.visual.fileName || 'saskaita.pdf') || 'saskaita.pdf').slice(0, 200), full: absolutePath(`${companyId}/${new Date().getUTCFullYear()}/${vsha}.pdf`), buffer: input.visual.buffer };
    }
  }
  let created = false, visualCreated = false;
  // Write-once: the name is the content hash, an existing file is never rewritten.
  try { fs.writeFileSync(full, buffer, { flag: 'wx' }); created = true; } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error; }
  try {
    if (visual) { try { fs.writeFileSync(visual.full, visual.buffer, { flag: 'wx' }); visualCreated = true; } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error; } }
    // Cloudflare Containers: the originals reach R2 before the row is written; a failed upload fails the whole store.
    remotePut(storagePath, buffer);
    if (visual) remotePut(`${companyId}/${new Date().getUTCFullYear()}/${visual.sha}.pdf`, visual.buffer);
    // An XML e-invoice needs no recognition: its data is read from the file, so it waits in the queue as EXTRACTED.
    const res = db.prepare('INSERT INTO PurchaseDocument(companyId,fileName,mimeType,size,sha256,storagePath,source,sender,originalSender,status,visualName,visualSha256,uploadedBy) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)')
      .run(companyId, (path.basename(input.fileName || 'dokumentas') || 'dokumentas').slice(0, 200), detected, buffer.length, sha256, storagePath, source, input.sender ? String(input.sender).slice(0, 254) : null, input.originalSender ? String(input.originalSender).slice(0, 254).toLowerCase() : null, detected === XML_MIME ? 'EXTRACTED' : 'NEW', visual?.name ?? null, visual?.sha ?? null, currentActorId(db));
    return getDocument(companyId, Number(res.lastInsertRowid));
  } catch (error) {
    if (created) fs.rmSync(full, { force: true });
    if (visualCreated && visual) fs.rmSync(visual.full, { force: true });
    throw error;
  }
}

// The signed-in user of the running request (set by withActor for the duration of the write), if any.
function currentActorId(db: Database.Database): number | null {
  try { return (db.prepare('SELECT actorId FROM AuditContext LIMIT 1').get() as { actorId: number } | undefined)?.actorId ?? null; } catch { return null; }
}

export const isXmlDocument = (row: Pick<PurchaseDocumentRow, 'mimeType'>) => row.mimeType === XML_MIME;
// Path of the visual original: beside the XML, named by its own hash.
export const visualStoragePath = (row: PurchaseDocumentRow) => row.storagePath.replace(/[^/]+$/, `${row.visualSha256}.pdf`);
const xmlText = (row: PurchaseDocumentRow) => readStored(row.storagePath).toString('utf8').replace(/^\uFEFF/, '');

export function getDocument(companyId: number, id: number): PurchaseDocumentRow {
  const row = getDb().prepare('SELECT * FROM PurchaseDocument WHERE id=? AND companyId=?').get(id, companyId) as PurchaseDocumentRow | undefined;
  if (!row) throw new HttpError(404, 'Dokumentas nerastas');
  return row;
}
// variant 'visual': the PDF kept beside an XML e-invoice (served as application/pdf under its own name).
export function readDocumentFile(companyId: number, id: number, variant?: 'visual') {
  const row = getDocument(companyId, id);
  if (variant === 'visual') {
    if (!row.visualSha256) throw new HttpError(404, 'Dokumentas nerastas');
    return { row: { ...row, mimeType: 'application/pdf', fileName: row.visualName || 'saskaita.pdf' }, data: readStored(visualStoragePath(row)) };
  }
  return { row, data: readStored(row.storagePath) };
}

// ---------- prepared copy of a photo (derived, never replaces the original) ----------

export const isImageDocument = (row: Pick<PurchaseDocumentRow, 'mimeType'>) => row.mimeType.startsWith('image/');
// The derived copy sits beside the original: <hash>.prep.jpg. It can always be rebuilt from the original, so it is a cache, not evidence.
const preparedStoragePath = (row: PurchaseDocumentRow) => row.storagePath.replace(/\.[^./]+$/, '.prep.jpg');

// Recognition/preview copy of an image document (EXIF-rotated, at most 2500 px, mildly normalized, JPEG); created on first use.
export async function preparedImage(companyId: number, id: number): Promise<{ row: PurchaseDocumentRow; data: Buffer; mimeType: string }> {
  const row = getDocument(companyId, id);
  if (!isImageDocument(row)) throw new HttpError(404, 'Dokumentas nerastas');
  const full = absolutePath(preparedStoragePath(row));
  let cached = false;
  try { cached = ensureStoredFile(preparedStoragePath(row)); } catch { /* a bad copy in R2 is rebuilt from the original */ }
  if (cached) return { row, data: fs.readFileSync(full), mimeType: 'image/jpeg' };
  const prepared = await prepareImage(readStored(row.storagePath), row.mimeType);
  if (prepared.converted) {
    const temp = `${full}.${process.pid}.tmp`;
    fs.writeFileSync(temp, prepared.data);
    fs.renameSync(temp, full);
    try { remotePut(preparedStoragePath(row), prepared.data); } catch (error) { console.error('[documents] prepared copy not stored in R2', error instanceof Error ? error.message : error); }
  }
  return { row, data: prepared.data, mimeType: prepared.mimeType };
}

// Row for clients: no server file path and no raw extraction.
function publicRow(row: PurchaseDocumentRow, costEur?: number | null) {
  const cost = costEur !== undefined ? costEur : documentCosts(row.companyId, [row.id]).get(row.id) ?? null;
  const copy: Partial<PurchaseDocumentRow> = { ...row };
  delete copy.storagePath;
  delete copy.extractedJson;
  delete copy.visualSha256;
  return { ...copy, hasVisual: Boolean(row.visualSha256), costEur: cost };
}

export function listDocuments(companyId: number, status?: string) {
  const rows = (status
    ? getDb().prepare('SELECT * FROM PurchaseDocument WHERE companyId=? AND status=? ORDER BY id DESC LIMIT 500').all(companyId, status)
    : getDb().prepare('SELECT * FROM PurchaseDocument WHERE companyId=? ORDER BY id DESC LIMIT 500').all(companyId)) as PurchaseDocumentRow[];
  const costs = documentCosts(companyId);
  return rows.map(row => ({ ...publicRow(row, costs.get(row.id) ?? null), summary: documentSummary(row) }));
}

// Supplier, number, date and total of the extraction, for the inbox list (null until the document is recognized).
function documentSummary(row: PurchaseDocumentRow) {
  if (isXmlDocument(row)) {
    try {
      const inv = parseUblInvoice(xmlText(row)).invoice;
      return inv ? { supplier: inv.supplier.name, number: inv.number, issueDate: inv.issueDate, gross: inv.totals.gross, docKind: inv.kind === 'credit' ? 'CREDIT_NOTE' : 'INVOICE' } : null;
    } catch { return null; }
  }
  const x = parseExtracted(row);
  if (!x) return null;
  return { supplier: x.supplier.name, number: [x.series, x.number].filter(Boolean).join('') || x.receipt?.receiptNo || null, issueDate: x.issueDate, gross: x.totals.gross, docKind: x.docKind };
}

// Counts for the inbox badge; `awaiting` = documents that still need a person (NEW, EXTRACTED, FAILED).
export function documentCounts(companyId: number) {
  const counts: Record<DocumentStatus, number> = { NEW: 0, EXTRACTED: 0, FAILED: 0, CONFIRMED: 0, REJECTED: 0 };
  for (const r of getDb().prepare('SELECT status, COUNT(*) AS n FROM PurchaseDocument WHERE companyId=? GROUP BY status').all(companyId) as { status: DocumentStatus; n: number }[]) counts[r.status] = r.n;
  return { ...counts, awaiting: counts.NEW + counts.EXTRACTED + counts.FAILED };
}

export function deleteDocument(companyId: number, id: number) {
  const row = getDocument(companyId, id);
  if (row.status === 'CONFIRMED' || row.purchaseId) throw new HttpError(409, 'Patvirtinto dokumento originalo ištrinti negalima: jis saugomas kaip pirkimo įrodymas.');
  getDb().prepare('DELETE FROM PurchaseDocument WHERE id=? AND companyId=?').run(id, companyId);
  fs.rmSync(absolutePath(row.storagePath), { force: true });
  if (isImageDocument(row)) fs.rmSync(absolutePath(preparedStoragePath(row)), { force: true });
  if (row.visualSha256) fs.rmSync(absolutePath(visualStoragePath(row)), { force: true });
  // The row is gone already: a failed R2 delete only leaves an unreferenced object behind.
  for (const rel of [row.storagePath, ...(isImageDocument(row) ? [preparedStoragePath(row)] : []), ...(row.visualSha256 ? [visualStoragePath(row)] : [])]) {
    try { remoteRemove(rel); } catch (error) { console.error('[documents] R2 delete failed', rel, error instanceof Error ? error.message : error); }
  }
}

export function rejectDocument(companyId: number, id: number) {
  const row = getDocument(companyId, id);
  if (!NOT_FINAL.includes(row.status)) throw new HttpError(409, 'Šio dokumento būsenos pakeisti negalima');
  getDb().prepare("UPDATE PurchaseDocument SET status='REJECTED' WHERE id=?").run(id);
  return publicRow(getDocument(companyId, id));
}

// ---------- recognition ----------

export const LIMIT_MESSAGE = 'Pasiektas mėnesio atpažinimo išlaidų limitas: automatinis atpažinimas sustabdytas iki kito mėnesio. Dokumentas išsaugotas, duomenis galite suvesti rankiniu būdu.';

export async function recognizeDocument(companyId: number, id: number, provider: RecognitionProvider) {
  const db = getDb();
  const row = getDocument(companyId, id);
  if (isXmlDocument(row)) throw new HttpError(409, 'XML e-sąskaitos duomenys imami tiesiai iš failo: atpažinimas nereikalingas');
  if (!NOT_FINAL.includes(row.status)) throw new HttpError(409, 'Šis dokumentas jau apdorotas');
  const settingsRow = db.prepare('SELECT enabled, apiKeyEncrypted, model FROM CompanyRecognitionSettings WHERE companyId=?').get(companyId) as { enabled: number; apiKeyEncrypted: string | null; model: string } | undefined;
  if (!settingsRow?.enabled || !settingsRow.apiKeyEncrypted) throw new HttpError(409, 'Dokumentų atpažinimas neįjungtas: nurodykite API raktą įmonės nustatymuose.');
  const apiKey = decryptSecret(settingsRow.apiKeyEncrypted, companyId, 'Nepavyko nuskaityti išsaugoto API rakto. Patikrinkite šifravimo raktą.');
  // Over the monthly limit the document stays as it is for manual entry; nothing is sent to the provider.
  if (recognitionUsageSummary(companyId).limitReached) throw new HttpError(409, LIMIT_MESSAGE);
  try {
    // A photo goes to the provider as the prepared copy (the stored original stays as it is); other files as they are.
    const file = isImageDocument(row) ? await preparedImage(companyId, id).then(p => ({ data: p.data, mimeType: p.mimeType }), error => { throw error instanceof HttpError ? new RecognitionError('API', error.message) : error; }) : { data: readDocumentFile(companyId, id).data, mimeType: row.mimeType };
    const result = await provider.recognize(file, { apiKey, model: settingsRow.model, accounts: purchaseAccountChoices(db), onUsage: usage => recordRecognitionUsage(companyId, id, usage) });
    const parsed = RecognizedDocumentSchema.safeParse(result);
    if (!parsed.success) throw new RecognitionError('EMPTY', 'Atpažinimo rezultatas neatitinka laukiamo formato.');
    // A suggested account that is not in the chart or not allowed as a purchase debit account is dropped before anything is stored.
    const stored = { ...parsed.data, suggestedAccount: sanitizeSuggestedAccount(db, parsed.data.suggestedAccount) };
    db.prepare("UPDATE PurchaseDocument SET status='EXTRACTED', extractedJson=?, error=NULL, model=? WHERE id=?").run(JSON.stringify(stored), settingsRow.model || null, id);
  } catch (error) {
    const message = error instanceof RecognitionError ? error.message : 'Atpažinimas nepavyko dėl netikėtos klaidos.';
    if (!(error instanceof RecognitionError)) console.error('Document recognition failed', error);
    db.prepare("UPDATE PurchaseDocument SET status='FAILED', error=? WHERE id=?").run(message.slice(0, 500), id);
  }
  return publicRow(getDocument(companyId, id));
}

// ---------- expense account: supplier history and recognition suggestion ----------

export type AccountSource = 'HISTORY' | 'MODEL' | 'USER';
// Classes that make sense as the debit of a purchase for a suggestion: fixed assets (1), inventory (20), expenses (6, 7).
const SUGGESTIBLE_ACCOUNT = /^(1|20|6|7)/;
function allowedDebit(db: Database.Database, code: string) {
  try { return purchaseDebitAccount(db, code) === code; } catch (error) { if (error instanceof HttpError) return false; throw error; }
}

// Compact chart (code + name) offered to the recognition provider: only accounts a purchase may be posted to.
export function purchaseAccountChoices(db: Database.Database): { code: string; name: string }[] {
  const rows = db.prepare('SELECT code,name FROM ChartOfAccount ORDER BY code').all() as { code: string; name: string }[];
  return rows.filter(r => SUGGESTIBLE_ACCOUNT.test(r.code) && allowedDebit(db, r.code));
}

// Provider output -> a suggestion the server stands behind (known, allowed code; short reason) or null.
export function sanitizeSuggestedAccount(db: Database.Database, value: { code: string | null; reason: string | null } | null | undefined): { code: string; reason: string } | null {
  const code = typeof value?.code === 'string' ? value.code.trim() : '';
  if (!code || !SUGGESTIBLE_ACCOUNT.test(code) || !allowedDebit(db, code)) return null;
  const reason = (typeof value?.reason === 'string' ? value.reason : '').replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 120);
  return { code, reason };
}

export interface AccountHistory { account: string; purchaseId: number; number: string; date: string }
// The debit account of the supplier's most recent purchase that has one (and that is still allowed), with the document it came from.
export function supplierAccountHistory(db: Database.Database, companyId: number, clientId: number | null): AccountHistory | null {
  if (clientId === null) return null;
  const rows = db.prepare("SELECT debitAccount AS account, id AS purchaseId, COALESCE(series,'') || number AS number, purchaseDate AS date FROM Purchase WHERE companyId=? AND clientId=? AND debitAccount IS NOT NULL AND debitAccount<>'' AND COALESCE(docType,'SF')='SF' ORDER BY purchaseDate DESC, id DESC LIMIT 5")
    .all(companyId, clientId) as AccountHistory[];
  return rows.find(r => allowedDebit(db, r.account)) || null;
}

// Audit value stored at confirmation. The client only claims a source; the server accepts HISTORY/MODEL when the value really matches
// the supplier's latest purchase / the validated suggestion, and records everything else that is non-empty as USER.
function resolveAccountSource(db: Database.Database, companyId: number, clientId: number | null, account: string | null, claimed: unknown, extracted: RecognizedDocument | null): AccountSource | null {
  if (!account) return null;
  if (claimed === 'HISTORY' && supplierAccountHistory(db, companyId, clientId)?.account === account) return 'HISTORY';
  if (claimed === 'MODEL' && sanitizeSuggestedAccount(db, extracted?.suggestedAccount)?.code === account) return 'MODEL';
  return 'USER';
}

// ---------- shared validation ----------

const EPS = 0.01 + 1e-9;
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const near = (a: number, b: number, tol = EPS) => Math.abs(a - b) <= tol;
const str = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
const r2 = (v: number) => Math.round(v * 100) / 100;
function validDate(v: unknown): v is string { try { dateValue(v); return true; } catch { return false; } }

export interface PurchaseExtras {
  paidBy: 'COMPANY' | 'PERSON' | null; paidByName: string | null; reimbursedAt: string | null; evidenceType: 'INVOICE' | 'RECEIPT' | null;
  paymentMethod: 'CARD' | 'CASH' | 'TRANSFER' | 'OTHER' | null; cardLast4: string | null; cashRegisterNo: string | null; receiptNo: string | null; documentTime: string | null;
}

// Own-funds and receipt fields of a purchase. paidBy PERSON = paid from the person's own funds (needs the name, may be reimbursed later);
// CARD with paidBy COMPANY (or empty) = company card. Returns normalized values and per-field errors.
export function normalizePurchaseExtras(input: Record<string, unknown>): { values: PurchaseExtras; errors: FieldErrors } {
  const errors: FieldErrors = {};
  const empty = (v: unknown) => v === undefined || v === null || v === '';
  const paidBy = empty(input.paidBy) ? null : input.paidBy;
  if (paidBy !== null && paidBy !== 'COMPANY' && paidBy !== 'PERSON') errors.paidBy = 'Mokėtojas turi būti įmonė arba asmuo';
  const paidByName = str(input.paidByName, 200) || null;
  if (paidBy === 'PERSON' && !paidByName) errors.paidByName = 'Nurodykite asmenį, kuris sumokėjo savo lėšomis';
  if (paidBy !== 'PERSON' && paidByName) errors.paidByName = 'Asmens vardas nurodomas tik kai mokėta asmens lėšomis';
  const reimbursedAt = empty(input.reimbursedAt) ? null : input.reimbursedAt;
  if (reimbursedAt !== null && !validDate(reimbursedAt)) errors.reimbursedAt = 'Neteisinga kompensavimo data';
  else if (reimbursedAt !== null && paidBy !== 'PERSON') errors.reimbursedAt = 'Kompensavimo data galima tik kai mokėta asmens lėšomis';
  const evidenceType = empty(input.evidenceType) ? null : input.evidenceType;
  if (evidenceType !== null && evidenceType !== 'INVOICE' && evidenceType !== 'RECEIPT') errors.evidenceType = 'Dokumento rūšis turi būti sąskaita arba kvitas';
  const paymentMethod = empty(input.paymentMethod) ? null : input.paymentMethod;
  if (paymentMethod !== null && !['CARD', 'CASH', 'TRANSFER', 'OTHER'].includes(paymentMethod as string)) errors.paymentMethod = 'Neteisingas mokėjimo būdas';
  const cardLast4 = empty(input.cardLast4) ? null : String(input.cardLast4).trim();
  if (cardLast4 !== null && (!/^\d{4}$/.test(cardLast4) || paymentMethod !== 'CARD')) errors.cardLast4 = 'Kortelės paskutiniai 4 skaitmenys nurodomi tik mokant kortele';
  const documentTime = empty(input.documentTime) ? null : String(input.documentTime).trim();
  if (documentTime !== null && !/^([01]\d|2[0-3]):[0-5]\d$/.test(documentTime)) errors.documentTime = 'Laikas turi būti HH:MM';
  return {
    errors,
    values: {
      paidBy: paidBy as PurchaseExtras['paidBy'], paidByName, reimbursedAt: reimbursedAt as string | null, evidenceType: evidenceType as PurchaseExtras['evidenceType'],
      paymentMethod: paymentMethod as PurchaseExtras['paymentMethod'], cardLast4, cashRegisterNo: str(input.cashRegisterNo, 100) || null, receiptNo: str(input.receiptNo, 100) || null, documentTime,
    },
  };
}

export function writePurchaseExtras(db: Database.Database, companyId: number, purchaseId: number, v: PurchaseExtras) {
  db.prepare('UPDATE Purchase SET paidBy=?,paidByName=?,reimbursedAt=?,evidenceType=?,paymentMethod=?,cardLast4=?,cashRegisterNo=?,receiptNo=?,documentTime=? WHERE id=? AND companyId=?')
    .run(v.paidBy, v.paidByName, v.reimbursedAt, v.evidenceType, v.paymentMethod, v.cardLast4, v.cashRegisterNo, v.receiptNo, v.documentTime, purchaseId, companyId);
}

// Marks a purchase paid from a person's own funds as repaid to that person on `date`.
export function reimbursePurchase(companyId: number, purchaseId: number, date: unknown) {
  const db = getDb();
  const p = db.prepare('SELECT id, paidBy, reimbursedAt, purchaseDate FROM Purchase WHERE id=? AND companyId=?').get(purchaseId, companyId) as { id: number; paidBy: string | null; reimbursedAt: string | null; purchaseDate: string } | undefined;
  if (!p) throw new HttpError(404, 'Įrašas nerastas');
  if (p.paidBy !== 'PERSON') throw new HttpError(409, 'Kompensuoti galima tik pirkimą, apmokėtą asmens lėšomis');
  if (p.reimbursedAt) throw new HttpError(409, 'Šis pirkimas jau kompensuotas');
  if (!validDate(date)) throw new HttpError(400, 'Neteisinga kompensavimo data');
  if (date < p.purchaseDate) throw new HttpError(400, 'Kompensavimo data negali būti ankstesnė už pirkimo datą');
  db.prepare('UPDATE Purchase SET reimbursedAt=? WHERE id=? AND companyId=?').run(date, purchaseId, companyId);
  return db.prepare('SELECT * FROM Purchase WHERE id=?').get(purchaseId);
}

// Purchases paid from own funds and not yet repaid, with the amount owed per person.
export function unreimbursedPurchases(companyId: number) {
  const db = getDb();
  const purchases = db.prepare("SELECT id, series, number, purchaseDate, clientName, paidByName, sumWithVat FROM Purchase WHERE companyId=? AND paidBy='PERSON' AND reimbursedAt IS NULL ORDER BY purchaseDate, id").all(companyId) as { id: number; series: string | null; number: string; purchaseDate: string; clientName: string | null; paidByName: string; sumWithVat: number }[];
  const totals = new Map<string, number>();
  for (const p of purchases) totals.set(p.paidByName, Math.round(((totals.get(p.paidByName) || 0) + p.sumWithVat) * 100) / 100);
  return { people: [...totals].map(([name, owed]) => ({ name, owed })), purchases };
}

// ---------- edited values (confirmation) ----------

// stock: { itemId } books the line to an existing stock card, { create: true, code } creates a card first; asset: { create: true, category, ... } opens a fixed asset card.
export interface EditedLine { itemName?: unknown; quantity?: unknown; net?: unknown; vat?: unknown; gross?: unknown; vatRate?: unknown; taxCode?: unknown; stock?: unknown; asset?: unknown }
interface AssetRequest { index: number; name: string; category: AssetCategory; usefulLifeMonths: number | null; commissioningDate: string | null; code: string | null }
export interface ConfirmInput {
  supplier?: { clientId?: unknown; name?: unknown; code?: unknown; vatCode?: unknown; address?: unknown; create?: unknown };
  series?: unknown; number?: unknown; issueDate?: unknown; dueDate?: unknown;
  lines?: unknown; totals?: { net?: unknown; vat?: unknown; gross?: unknown };
  deductionPercent?: unknown; debitAccount?: unknown; amountsInEur?: unknown; notes?: unknown;
  // Document in a foreign currency: line and total amounts are in that currency, `rate` = units of it for 1 EUR (as the ECB quotes), converted on confirmation.
  foreign?: { currency?: unknown; rate?: unknown; rateDate?: unknown } | null;
  // 'CREDIT_NOTE' (or a recognized credit note when not stated): registered as a supplier credit of the chosen original purchase.
  docKind?: unknown; credit?: { originalPurchaseId?: unknown } | null;
  [extra: string]: unknown;
}
interface Normalized {
  clientId: number | null; supplier: { name: string; code: string; vatCode: string; address: string };
  body: { series: string; number: string; [key: string]: unknown }; taxCodes: string[]; extras: PurchaseExtras; declaredGross: number;
  stockCreates: { name: string; code: string; warehouseName: string }[]; assets: AssetRequest[];
  foreign: { currency: string; rate: number; rateDate: string | null; net: number; vat: number; gross: number } | null;
  credit: { originalId: number; reason: string; clientId: number | null; clientName: string | null } | null;
}

// A credit note is printed with negative amounts as often as with positive ones; the credit logic works with positive amounts and negates them itself.
function creditAmounts(input: ConfirmInput): ConfirmInput {
  const totals = input.totals || {};
  const lines = Array.isArray(input.lines) ? input.lines as EditedLine[] : [];
  const sumGross = lines.reduce((a, l) => a + (l && isNum(l.gross) ? l.gross : 0), 0);
  const negative = isNum(totals.gross) ? totals.gross < 0 : sumGross < 0;
  const flip = (v: unknown) => (negative && isNum(v) ? -v : v);
  return {
    ...input, totals: { net: flip(totals.net), vat: flip(totals.vat), gross: flip(totals.gross) },
    lines: lines.map(l => (l && typeof l === 'object' ? { ...l, net: flip(l.net), vat: flip(l.vat), gross: flip(l.gross), quantity: isNum(l.quantity) ? Math.abs(l.quantity) : l.quantity } : l)),
  };
}

function validateEdit(db: Database.Database, companyId: number, rawInput: ConfirmInput, extracted: RecognizedDocument | null): { errors: FieldErrors; normalized: Normalized | null } {
  const errors: FieldErrors = {};
  const isCredit = rawInput.docKind === 'CREDIT_NOTE' || (rawInput.docKind === undefined && extracted?.docKind === 'CREDIT_NOTE');
  const input = isCredit ? creditAmounts(rawInput) : rawInput;
  const sup = input.supplier || {};
  let clientId: number | null = null;
  let existingName = '';
  if (sup.clientId !== undefined && sup.clientId !== null && sup.clientId !== '') {
    const id = Number(sup.clientId);
    const client = Number.isSafeInteger(id) ? db.prepare('SELECT id, name FROM Client WHERE id=? AND companyId=?').get(id, companyId) as { id: number; name: string } | undefined : undefined;
    if (!client) errors.supplier = 'Pasirinktas tiekėjas nerastas šioje įmonėje';
    else { clientId = client.id; existingName = client.name; }
  }
  const name = str(sup.name, 256) || existingName;
  const code = str(sup.code, 50), vatCode = str(sup.vatCode, 50), address = str(sup.address, 300);
  if (!name) errors['supplier.name'] = 'Nurodykite tiekėjo pavadinimą';
  if (clientId === null && !errors.supplier) {
    if (sup.create !== true) errors.supplier = 'Pasirinkite tiekėją iš žinyno arba patvirtinkite naujo tiekėjo sukūrimą';
    if (extracted?.supplier.code?.trim() && !code) errors['supplier.code'] = 'Nurodykite tiekėjo įmonės kodą (jis nurodytas dokumente)';
  }
  const issueDate = input.issueDate;
  if (!validDate(issueDate)) errors.issueDate = 'Nurodykite teisingą dokumento datą';
  if (input.dueDate !== undefined && input.dueDate !== null && input.dueDate !== '' && !validDate(input.dueDate)) errors.dueDate = 'Neteisinga apmokėjimo data';
  // Foreign currency: either the person typed the amounts in EUR already (amountsInEur), or the amounts are in the document currency and a rate converts them.
  let foreign: { currency: string; rate: number; rateDate: string | null } | null = null;
  const foreignInput = input.foreign && typeof input.foreign === 'object' && !Array.isArray(input.foreign) ? input.foreign : null;
  if (foreignInput && input.amountsInEur !== true) {
    const currency = typeof foreignInput.currency === 'string' ? foreignInput.currency.trim().toUpperCase() : '';
    const hasDate = foreignInput.rateDate !== undefined && foreignInput.rateDate !== null && foreignInput.rateDate !== '';
    if (!validCurrencyCode(currency) || currency === 'EUR') errors['foreign.currency'] = 'Neteisinga valiutos santrumpa';
    else if (!validRate(foreignInput.rate)) errors['foreign.rate'] = 'Nurodykite valiutos kursą (valiutos vienetų už 1 EUR)';
    else if (hasDate && !validDate(foreignInput.rateDate)) errors['foreign.rateDate'] = 'Neteisinga kurso data';
    else foreign = { currency, rate: foreignInput.rate, rateDate: hasDate ? foreignInput.rateDate as string : null };
  } else if (extracted?.currency && extracted.currency.toUpperCase() !== 'EUR' && input.amountsInEur !== true) errors.currency = `Dokumento valiuta ${extracted.currency}: įveskite sumas eurais ir patvirtinkite`;

  const { values: extras, errors: extraErrors } = normalizePurchaseExtras(input);
  Object.assign(errors, extraErrors);
  // A receipt without a printed series/number is filed under its receipt number (series = cash register number), but only
  // when the user left the series/number fields empty; typed values always win.
  let series = str(input.series, 50), number = str(input.number, 100);
  if (!number && extras.receiptNo) { number = extras.receiptNo; if (!series) series = extras.cashRegisterNo || ''; }
  if (!number) errors.number = 'Nurodykite dokumento numerį (kvitui — kvito numerį)';

  const rawLines = Array.isArray(input.lines) ? input.lines as EditedLine[] : [];
  const items: { itemName: string; itemCode?: string; quantity: number; price: number; vatRate: number }[] = [];
  const inventory = inventorySettings(db, companyId);
  const stockCreates: { name: string; code: string; warehouseName: string }[] = [];
  const stockWarehouses = new Set<string>();
  const taxCodes: string[] = [];
  let sumNet = 0, sumVat = 0, sumGross = 0, eurGross = 0;
  if (!rawLines.length || rawLines.length > 1000) errors.lines = 'Dokumentą turi sudaryti nuo 1 iki 1000 eilučių';
  const allowed = codesFor('PURCHASE');
  rawLines.slice(0, 1000).forEach((l, i) => {
    const k = (f: string) => `lines.${i}.${f}`;
    const line = (l && typeof l === 'object' ? l : {}) as EditedLine;
    const itemName = str(line.itemName, 300);
    if (!itemName) errors[k('itemName')] = `Eilutė ${i + 1}: nurodykite pavadinimą`;
    const quantity = line.quantity === undefined || line.quantity === null || line.quantity === '' ? 1 : line.quantity;
    if (!isNum(quantity) || quantity <= 0) errors[k('quantity')] = `Eilutė ${i + 1}: kiekis turi būti teigiamas`;
    for (const f of ['net', 'vat', 'gross'] as const) if (!isNum(line[f])) errors[k(f)] = `Eilutė ${i + 1}: nurodykite sumą (${f === 'net' ? 'be PVM' : f === 'vat' ? 'PVM' : 'su PVM'})`;
    if (!isNum(line.vatRate) || line.vatRate < 0 || line.vatRate > 100) errors[k('vatRate')] = `Eilutė ${i + 1}: nurodykite PVM tarifą`;
    if (typeof line.taxCode !== 'string' || !allowed.includes(line.taxCode)) errors[k('taxCode')] = `Eilutė ${i + 1}: pasirinkite PVM klasifikatoriaus kodą`;
    if (isNum(line.net) && isNum(line.vat) && isNum(line.gross)) {
      if (!near(line.net + line.vat, line.gross)) errors[k('gross')] = `Eilutė ${i + 1}: suma be PVM ir PVM nesudaro sumos su PVM`;
      else if (isNum(line.vatRate) && !near(line.vat, r2(line.net * line.vatRate / 100))) errors[k('vat')] = `Eilutė ${i + 1}: PVM nesutampa su tarifu ${line.vatRate}%`;
      sumNet += line.net; sumVat += line.vat; sumGross += line.gross;
    }
    // Optional stock mapping: the line gets the stock card's code, so the purchase posts the stock receipt like any other purchase.
    let itemCode: string | undefined;
    const stock = line.stock && typeof line.stock === 'object' ? line.stock as { itemId?: unknown; create?: unknown; code?: unknown } : null;
    if (stock) {
      const sk = k('stock');
      if (inventory.method === 'OFF') errors[sk] = `Eilutė ${i + 1}: atsargų apskaita išjungta`;
      else if (stock.create === true) {
        const code = str(stock.code, 50);
        if (!code) errors[sk] = `Eilutė ${i + 1}: nurodykite naujos atsargų kortelės kodą`;
        else if (db.prepare('SELECT 1 FROM StockItem WHERE companyId=? AND (TRIM(code)=? OR TRIM(barcode)=?)').get(companyId, code, code)) errors[sk] = `Eilutė ${i + 1}: kodas „${code}“ jau yra atsargų kortelėje: pasirinkite esamą kortelę`;
        else {
          itemCode = code;
          if (!stockCreates.some(c => c.code === code)) stockCreates.push({ name: itemName.slice(0, 200), code, warehouseName: 'Pagrindinis' });
        }
      } else {
        const id = Number(stock.itemId);
        const card = Number.isSafeInteger(id) ? db.prepare('SELECT code, barcode, warehouseName FROM StockItem WHERE id=? AND companyId=?').get(id, companyId) as { code: string | null; barcode: string | null; warehouseName: string | null } | undefined : undefined;
        const code = (card?.code || card?.barcode || '').trim();
        if (!card) errors[sk] = `Eilutė ${i + 1}: atsargų kortelė nerasta`;
        else if (!code) errors[sk] = `Eilutė ${i + 1}: atsargų kortelė neturi kodo`;
        else { itemCode = code; stockWarehouses.add(card.warehouseName || 'Pagrindinis'); }
      }
    }
    if (isNum(line.net) && isNum(line.vatRate) && isNum(quantity) && quantity > 0) {
      const q = Number(quantity.toFixed(6));
      const converted = foreign ? convertLine({ net: line.net, vatRate: line.vatRate }, foreign.rate) : null;
      if (converted) eurGross += converted.gross;
      items.push({ itemName, ...(itemCode ? { itemCode } : {}), quantity: q, price: Number(((converted ? converted.net : line.net) / q).toFixed(6)), vatRate: line.vatRate });
    }
    taxCodes.push(typeof line.taxCode === 'string' ? line.taxCode : '');
  });
  if (stockWarehouses.size > 1) errors.lines = 'Atsargų kortelės yra skirtinguose sandėliuose: vienas dokumentas pajamuojamas tik į vieną sandėlį';
  const warehouse = [...stockWarehouses][0] || 'Pagrindinis';
  for (const c of stockCreates) c.warehouseName = warehouse;
  const totals = input.totals || {};
  for (const f of ['net', 'vat', 'gross'] as const) if (!isNum(totals[f])) errors[`totals.${f}`] = f === 'gross' ? 'Nurodykite bendrą sumą su PVM' : `Nurodykite bendrą sumą (${f === 'net' ? 'be PVM' : 'PVM'})`;
  if (isNum(totals.gross) && totals.gross <= 0) errors['totals.gross'] = 'Bendra suma turi būti teigiama';
  // Each line is rounded on its own, so the sum of n lines may differ from the printed total by up to a cent per line.
  const tol = 0.01 * Math.max(1, rawLines.length) + 1e-9;
  if (rawLines.length && !Object.keys(errors).some(k => k.startsWith('lines.') || k.startsWith('totals.'))) {
    if (!near(sumNet, totals.net as number, tol)) errors['totals.net'] = 'Eilučių sumos be PVM suma nesutampa su bendra suma be PVM';
    if (!near(sumVat, totals.vat as number, tol)) errors['totals.vat'] = 'Eilučių PVM suma nesutampa su bendru PVM';
    if (!near(sumGross, totals.gross as number, tol)) errors['totals.gross'] = 'Eilučių sumos su PVM suma nesutampa su bendra suma';
    if (!near((totals.net as number) + (totals.vat as number), totals.gross as number)) errors['totals.gross'] = 'Suma be PVM ir PVM nesudaro bendros sumos';
  }

  let deductionPercent: number | undefined;
  if (input.deductionPercent !== undefined && input.deductionPercent !== null && input.deductionPercent !== '') {
    if (!isNum(input.deductionPercent) || input.deductionPercent < 0 || input.deductionPercent > 100) errors.deductionPercent = 'Neteisinga PVM atskaitos dalis';
    else deductionPercent = input.deductionPercent;
  } else if (extras.evidenceType === 'RECEIPT') deductionPercent = 0;
  if (validDate(issueDate) && deductionPercent !== undefined && deductionPercent !== 0 && !errors.deductionPercent) {
    // Historical tax status: a buyer that is not a standard VAT payer never gets deductible VAT.
    try { if (companyTaxMode(companyId, issueDate) !== 'STANDARD_VAT') errors.deductionPercent = 'Įmonė nėra PVM mokėtoja šiuo laikotarpiu: įeinantis PVM neatskaitomas'; } catch (error) { if (!(error instanceof HttpError)) throw error; }
  }
  let debitAccount: string | null = null;
  if (input.debitAccount !== undefined && input.debitAccount !== null && input.debitAccount !== '') {
    try { debitAccount = purchaseDebitAccount(db, input.debitAccount); } catch (error) { if (error instanceof HttpError) errors.debitAccount = error.message; else throw error; }
  }
  // Optional fixed asset cards: only when the debit account is a fixed asset account; the cost is known after the purchase is posted.
  const assets: AssetRequest[] = [];
  rawLines.slice(0, 1000).forEach((l, i) => {
    const a = l && typeof l === 'object' && l.asset && typeof l.asset === 'object' ? l.asset as { create?: unknown; category?: unknown; usefulLifeMonths?: unknown; commissioningDate?: unknown; code?: unknown } : null;
    if (!a || a.create !== true) return;
    const ak = `lines.${i}.asset`;
    const code = str(a.code, 40);
    const life = a.usefulLifeMonths === undefined || a.usefulLifeMonths === null || a.usefulLifeMonths === '' ? null : a.usefulLifeMonths;
    if (!debitAccount || !isFixedAssetAccount(debitAccount)) errors[ak] = `Eilutė ${i + 1}: ilgalaikio turto kortelę galima sukurti tik pasirinkus ilgalaikio turto sąskaitą`;
    else if (l.stock) errors[ak] = `Eilutė ${i + 1}: eilutė negali būti ir ilgalaikis turtas, ir atsargos`;
    else if (typeof a.category !== 'string' || !ASSET_CATEGORIES.includes(a.category as AssetCategory)) errors[ak] = `Eilutė ${i + 1}: pasirinkite turto grupę`;
    else if (life !== null && (!Number.isInteger(life) || (life as number) < 1 || (life as number) > 1200)) errors[ak] = `Eilutė ${i + 1}: naudingo tarnavimo laikas turi būti nuo 1 iki 1200 mėnesių`;
    else if (a.commissioningDate !== undefined && a.commissioningDate !== null && a.commissioningDate !== '' && (!validDate(a.commissioningDate) || (validDate(issueDate) && a.commissioningDate < issueDate))) errors[ak] = `Eilutė ${i + 1}: neteisinga naudojimo pradžios data`;
    else if (code && db.prepare('SELECT 1 FROM FixedAsset WHERE companyId=? AND code=?').get(companyId, code)) errors[ak] = `Eilutė ${i + 1}: turto kodas „${code}“ jau naudojamas`;
    else assets.push({ index: i, name: str(l.itemName, 200), category: a.category as AssetCategory, usefulLifeMonths: life as number | null, commissioningDate: typeof a.commissioningDate === 'string' && a.commissioningDate ? a.commissioningDate : null, code: code || null });
  });
  // Credit note: the chosen original purchase decides supplier, accounts and limits; the shared credit rules run here so nothing is half-checked.
  let credit: Normalized['credit'] = null;
  if (isCredit) {
    const originalId = Number(rawInput.credit?.originalPurchaseId);
    if (foreign) errors.currency = 'Užsienio valiutos kreditinio dokumento čia registruoti negalima: įveskite sumas eurais ir pažymėkite, kad jos eurais';
    if (stockCreates.length || assets.length) errors.credit = 'Kreditiniam dokumentui galima susieti tik esamą atsargų kortelę; ilgalaikio turto kortelė nekuriama';
    if (!Number.isSafeInteger(originalId) || originalId <= 0) errors['credit.original'] = 'Pasirinkite pradinį pirkimą, kurį koreguoja kreditinis dokumentas';
    else if (!Object.keys(errors).length) {
      const reason = `Kreditinis dokumentas ${series}${number}`.slice(0, 500);
      try {
        const plan = planPurchaseCredit(db, companyId, originalId, { number, series, purchaseDate: issueDate as string, reason, items });
        if (plan.original.currencyCode && plan.original.currencyCode !== 'EUR') errors['credit.original'] = `Pradinio dokumento valiuta ${plan.original.currencyCode}: kreditinio dokumento čia registruoti negalima`;
        else credit = { originalId, reason: [reason, str(input.notes, 300), 'Sukurta iš gauto dokumento'].filter(Boolean).join('; ').slice(0, 500), clientId: plan.original.clientId, clientName: plan.original.clientName };
      } catch (error) {
        if (error instanceof HttpError) errors.credit = error.message; else throw error;
      }
    }
  }
  if (Object.keys(errors).length) return { errors, normalized: null };

  const foreignNote = foreign ? `Dokumento valiuta ${foreign.currency}: ${(totals.gross as number).toFixed(2)}, kursas ${foreign.rate}${foreign.rateDate ? ` (${foreign.rateDate})` : ''}` : '';
  const notes = [str(input.notes, 400), foreignNote, 'Sukurta iš įkelto dokumento'].filter(Boolean).join('; ');
  return {
    errors,
    normalized: {
      clientId, supplier: { name, code, vatCode, address }, taxCodes, extras: { ...extras, evidenceType: extras.evidenceType || 'INVOICE' }, declaredGross: foreign ? r2(eurGross) : totals.gross as number, stockCreates, assets, credit,
      foreign: foreign ? { ...foreign, net: totals.net as number, vat: totals.vat as number, gross: totals.gross as number } : null,
      body: {
        series, number, purchaseDate: issueDate, clientName: name, clientCode: code || null, notes, items,
        ...(deductionPercent !== undefined ? { deductionPercent } : {}), ...(debitAccount ? { debitAccount } : {}), ...(stockWarehouses.size && warehouse !== 'Pagrindinis' ? { warehouseName: warehouse } : {}),
      },
    },
  };
}

const duplicateSql = "SELECT id FROM Purchase WHERE companyId=? AND number=? AND COALESCE(series,'')=? AND (clientId=? OR (clientId IS NULL AND clientName=?)) LIMIT 1";

// ---------- preview ----------

function parseExtracted(row: PurchaseDocumentRow): RecognizedDocument | null {
  if (!row.extractedJson) return null;
  const parsed = RecognizedDocumentSchema.safeParse(JSON.parse(row.extractedJson));
  return parsed.success ? parsed.data : null;
}

// Per line: the code (and the expense account) of the same supplier's most recent purchase with the same VAT rate. Suggestions only.
function suggestFor(db: Database.Database, companyId: number, clientId: number | null, rates: (number | null)[]) {
  type Hit = { taxCode: string; purchaseId: number };
  if (clientId === null) return { taxCodes: rates.map((): Hit | null => null), debitAccount: null as AccountHistory | null };
  const byRate = db.prepare(`SELECT t.taxCode, p.id AS purchaseId FROM PurchaseItem i JOIN Purchase p ON p.id=i.purchaseId JOIN TaxLineCode t ON t.kind='PURCHASE' AND t.itemId=i.id
    WHERE p.companyId=? AND p.clientId=? AND COALESCE(p.docType,'SF')='SF' AND i.vatRate=? ORDER BY p.purchaseDate DESC, p.id DESC, i.id LIMIT 1`);
  return {
    taxCodes: rates.map((rate): Hit | null => (rate === null ? null : (byRate.get(companyId, clientId, rate) as Hit | undefined) || null)),
    debitAccount: supplierAccountHistory(db, companyId, clientId),
  };
}

// A document without extraction (NEW, FAILED, recognition off): an empty draft the person fills in by hand. `missing` lists
// what the confirmation would still refuse, so the review screen works exactly as for a recognized document.
function emptyPreview(db: Database.Database, companyId: number, row: PurchaseDocumentRow) {
  let companyVatPayer = true;
  try { companyVatPayer = companyTaxMode(companyId, undefined) === 'STANDARD_VAT'; } catch { companyVatPayer = true; }
  const draft: ConfirmInput = {
    supplier: { clientId: null, name: '', code: '', vatCode: '', address: '', create: true },
    series: '', number: '', issueDate: '', dueDate: '',
    lines: [{ itemName: '', quantity: 1, net: null, vat: null, gross: null, vatRate: 21, taxCode: null, suggestedTaxCode: null, suggestedFromPurchaseId: null }],
    totals: {}, evidenceType: 'INVOICE', paymentMethod: null, cardLast4: null, cashRegisterNo: null, receiptNo: null, documentTime: null,
    // amountsInEur stays false: with EUR it changes nothing, and when the person switches the currency to e.g. USD the rate block
    // (ECB rate, conversion) must show instead of a pre-ticked "the amounts are already in euro".
    paidBy: 'COMPANY', debitAccount: null, accountSource: null, accountInfo: null, amountsInEur: false, currency: 'EUR', docKind: 'INVOICE',
  };
  const { errors: missing } = validateEdit(db, companyId, draft, null);
  return {
    document: publicRow(row), extracted: { docKind: 'INVOICE', currency: 'EUR', supplier: { code: null, name: null, vatCode: null }, totals: { net: null, vat: null, gross: null } } as unknown as RecognizedDocument,
    recognized: false, draft, missing, warnings: [] as string[],
    supplier: { clientId: null as number | null, name: null as string | null, code: null as string | null, vatCode: null as string | null },
    supplierFromEmail: null as string | null, rule: null as ReturnType<typeof ruleSummary>,
    needsSupplier: true, buyerMatches: null as boolean | null, duplicatePurchaseId: null as number | null, duplicates: [] as DuplicateHit[],
    suggestedEvidenceType: 'INVOICE' as const, suggestedDeductionPercent: null as number | null, companyVatPayer,
    suggestions: { debitAccount: null as string | null, debitAccountFromPurchaseId: null as number | null, accountHistory: null as AccountHistory | null, modelAccount: null as { code: string; reason: string } | null, lineTaxCodes: [] as (string | null)[] },
    ...reviewExtras(db, companyId, []),
    uncertainFields: [] as string[],
  };
}

// Stock and fixed asset helpers of the review screen: whether stock receipts are on, which accounts open an asset card, and the stock card
// whose name equals each line's name (a suggestion only; the person maps lines explicitly).
function reviewExtras(db: Database.Database, companyId: number, names: string[]) {
  const inventoryActive = inventorySettings(db, companyId).method !== 'OFF';
  const cards = inventoryActive ? db.prepare("SELECT id, name FROM StockItem WHERE companyId=? AND TRIM(COALESCE(NULLIF(code,''),barcode,''))<>'' ORDER BY id").all(companyId) as { id: number; name: string }[] : [];
  const key = (v: string) => v.trim().toLowerCase();
  const fixedAssetAccounts = FIXED_ASSET_ACCOUNTS.map(code => ({ code, category: categoryForAccount(code) }));
  return { inventoryActive, fixedAssetAccounts, lineStockItems: names.map(name => (name.trim() ? cards.find(c => key(c.name) === key(name))?.id ?? null : null)) };
}

// Existing supplier for a typed company code / VAT code (manual entry must not create a duplicate).
export function lookupSupplier(companyId: number, code: string, vatCode: string) {
  const db = getDb();
  const id = findSupplierId(db, companyId, { regNumber: code, vatCode });
  if (id === null) return null;
  const client = db.prepare('SELECT id, name, code, vatCode, address FROM Client WHERE id=? AND companyId=?').get(id, companyId) as { id: number; name: string; code: string | null; vatCode: string | null; address: string | null };
  return { ...client, accountHistory: supplierAccountHistory(db, companyId, client.id), rule: ruleSummary(findRule(db, companyId, client.id, [])) };
}

// XML e-invoice from the queue: the file is read by the UBL reader (no recognition) and checked by the same preview as the XML import.
export function previewXmlDocument(companyId: number, id: number, options: { originalPurchaseId?: number; warehouseName?: string } = {}) {
  const db = getDb();
  const row = getDocument(companyId, id);
  if (!isXmlDocument(row)) throw new HttpError(409, 'Dokumentas nėra XML e-sąskaita');
  const xml = previewXmlPurchase(db, companyId, xmlText(row), options);
  let companyVatPayer = true;
  try { companyVatPayer = companyTaxMode(companyId, xml.invoice?.issueDate) === 'STANDARD_VAT'; } catch { companyVatPayer = true; }
  const history = xml.kind === 'invoice' ? supplierAccountHistory(db, companyId, xml.supplier?.clientId ?? null) : null;
  return { kind: 'xml' as const, document: publicRow(row), xml, accountHistory: history, companyVatPayer, warnings: [] as string[], missing: {} as Record<string, string> };
}

// What the review screen shows about the rule that pre-filled the form.
export function ruleSummary(rule: SupplierRule | null) {
  return rule ? { id: rule.id, name: rule.name, debitAccount: rule.debitAccount, taxCode: rule.taxCode, evidenceType: rule.evidenceType, paymentMethod: rule.paymentMethod, paidBy: rule.paidBy, deductionPercent: rule.deductionPercent } : null;
}

// Addresses a document came from, most specific first: the original sender of a forwarded message, then the sender unless it is the company's own person.
function documentSenders(db: Database.Database, companyId: number, row: PurchaseDocumentRow): string[] {
  if (row.source !== 'EMAIL') return [];
  const out: string[] = [];
  if (row.originalSender) out.push(row.originalSender);
  if (row.sender && !senderContext(db, companyId).own.has(row.sender.toLowerCase())) out.push(row.sender.toLowerCase());
  return out;
}

export function previewDocument(companyId: number, id: number, options: { originalPurchaseId?: number } = {}) {
  const db = getDb();
  const row = getDocument(companyId, id);
  if (isXmlDocument(row)) return previewXmlDocument(companyId, id, options);
  const x = parseExtracted(row);
  if (!x) return emptyPreview(db, companyId, row);
  const warnings: string[] = [];
  let supplierId = findSupplierId(db, companyId, { regNumber: x.supplier.code, vatCode: x.supplier.vatCode });
  // No usable code on the document: the supplier may be known by the e-mail address the document came from.
  const senders = documentSenders(db, companyId, row);
  let supplierFromEmail: string | null = null;
  let supplier = x.supplier;
  if (supplierId === null && !x.supplier.code?.trim() && !x.supplier.vatCode?.trim()) {
    for (const address of senders) {
      const found = findClientByEmail(db, companyId, address);
      if (found === null) continue;
      const c = db.prepare('SELECT name, code, vatCode, address FROM Client WHERE id=?').get(found) as { name: string; code: string | null; vatCode: string | null; address: string | null };
      supplierId = found; supplierFromEmail = address;
      supplier = { ...x.supplier, name: x.supplier.name || c.name, code: c.code, vatCode: c.vatCode, address: x.supplier.address || c.address };
      break;
    }
  }
  const rule: SupplierRule | null = findRule(db, companyId, supplierId, senders);
  const buyerOk = buyerMatchesCompany(db, companyId, { regNumber: x.buyer.code, vatCode: x.buyer.vatCode });
  if (buyerOk === false) warnings.push('Pirkėjo kodas arba PVM kodas dokumente nesutampa su įmonės duomenimis: dokumentas gali būti išrašytas kitam asmeniui.');
  if (buyerOk === null) warnings.push('Nepavyko palyginti pirkėjo: dokumente arba įmonės duomenyse nėra juridinio asmens kodo ir PVM kodo.');

  const number = x.number?.trim() || x.receipt?.receiptNo?.trim() || '';
  const series = x.series?.trim() || (!x.number?.trim() && x.receipt?.receiptNo ? x.receipt.cashRegisterNo?.trim() || '' : '');
  let duplicatePurchaseId: number | null = null;
  if (number) {
    const dup = db.prepare(duplicateSql).get(companyId, number, series, supplierId, x.supplier.name || '') as { id: number } | undefined;
    if (dup) { duplicatePurchaseId = dup.id; warnings.push(`Šio tiekėjo dokumentas ${series}${number} jau yra pirkimuose (Nr. ${dup.id}).`); }
  }

  const duplicates = findDuplicates(db, companyId, {
    clientId: supplierId, supplierCode: x.supplier.code || '', supplierVatCode: x.supplier.vatCode || '', supplierName: x.supplier.name || '',
    series, number, receiptNo: x.receipt?.receiptNo?.trim() || '', cashRegisterNo: x.receipt?.cashRegisterNo?.trim() || '', date: x.issueDate || '', gross: x.totals.gross,
  }, id);

  // Arithmetic checks, tolerance 0.01.
  const sum = (f: 'net' | 'vat' | 'gross') => x.lines.reduce((a, l) => a + (l[f] ?? 0), 0);
  const t = x.totals;
  if (t.net !== null && x.lines.length && x.lines.every(l => l.net !== null) && !near(sum('net'), t.net)) warnings.push(`Eilučių sumų be PVM suma (${r2(sum('net')).toFixed(2)}) nesutampa su bendra suma be PVM (${t.net.toFixed(2)}).`);
  if (t.vat !== null && x.lines.length && x.lines.every(l => l.vat !== null) && !near(sum('vat'), t.vat)) warnings.push(`Eilučių PVM suma (${r2(sum('vat')).toFixed(2)}) nesutampa su bendru PVM (${t.vat.toFixed(2)}).`);
  if (t.gross !== null && x.lines.length && x.lines.every(l => l.gross !== null) && !near(sum('gross'), t.gross)) warnings.push(`Eilučių sumų su PVM suma (${r2(sum('gross')).toFixed(2)}) nesutampa su bendra suma (${t.gross.toFixed(2)}).`);
  if (t.net !== null && t.vat !== null && t.gross !== null && !near(t.net + t.vat, t.gross)) warnings.push('Suma be PVM ir PVM nesudaro sumos su PVM.');
  for (const b of x.vatBreakdown) if (b.rate !== null && b.net !== null && b.vat !== null && !near(b.vat, r2(b.net * b.rate / 100))) warnings.push(`PVM suma ${b.vat.toFixed(2)} neatitinka ${b.rate}% tarifo nuo ${b.net.toFixed(2)}.`);

  const suggestedEvidenceType: 'INVOICE' | 'RECEIPT' = x.docKind === 'RECEIPT' || !x.buyer.vatCode?.trim() ? 'RECEIPT' : 'INVOICE';
  let suggestedDeductionPercent: number | null = null;
  if (x.docKind === 'RECEIPT') warnings.push('Tai kasos kvitas: PVM sąskaitos faktūros nėra, todėl siūloma registruoti kaip kvitą be PVM atskaitos.');
  else if (!x.buyer.vatCode?.trim()) warnings.push('Dokumente nenurodytas pirkėjo PVM kodas: siūloma registruoti kaip kvitą be PVM atskaitos.');
  // A rule's document kind replaces the guess from the buyer's VAT code; its deduction share replaces the company default (never for a non-payer, below).
  const evidenceType = rule?.evidenceType ?? suggestedEvidenceType;
  if (evidenceType === 'RECEIPT') suggestedDeductionPercent = 0;
  if (rule?.deductionPercent != null) suggestedDeductionPercent = rule.deductionPercent;
  const date = x.issueDate && validDate(x.issueDate) ? x.issueDate : undefined;
  let companyVatPayer = true;
  try { companyVatPayer = companyTaxMode(companyId, date) === 'STANDARD_VAT'; } catch { companyVatPayer = true; }
  if (!companyVatPayer) { warnings.push('Įmonė nėra PVM mokėtoja: šio pirkimo PVM neatskaitomas.'); suggestedDeductionPercent = 0; }
  if (x.uncertainFields.length) warnings.push(`Nepatikimai atpažinti laukai: ${x.uncertainFields.join(', ')}.`);

  const suggestions = suggestFor(db, companyId, supplierId, x.lines.map(l => l.vatRate));
  // A credit note is shown with positive amounts (the credit logic negates them); printed minus signs are dropped.
  const abs = <T extends number | null>(v: T): T => (x.docKind === 'CREDIT_NOTE' && typeof v === 'number' ? Math.abs(v) as T : v);
  const ruleTaxCode: string | null = rule?.taxCode && codesFor('PURCHASE').includes(rule.taxCode) ? rule.taxCode : null;
  const draftLines = x.lines.map((l, i) => {
    const rate = l.vatRate;
    const quantity = l.quantity ?? 1;
    const net = l.net ?? (l.gross !== null && rate !== null ? r2(l.gross / (1 + rate / 100)) : l.unitPrice !== null ? r2(l.unitPrice * quantity) : null);
    const gross = l.gross ?? (net !== null && l.vat !== null ? r2(net + l.vat) : net !== null && rate !== null ? r2(net * (1 + rate / 100)) : null);
    const vat = l.vat ?? (net !== null && gross !== null ? r2(gross - net) : null);
    // A code from history stays a suggestion until the reviewer picks it; the code of the person's own rule is pre-filled.
    return { itemName: l.name || '', quantity: abs(quantity), net: abs(net), vat: abs(vat), gross: abs(gross), vatRate: rate, taxCode: ruleTaxCode, suggestedTaxCode: suggestions.taxCodes[i]?.taxCode ?? null, suggestedFromPurchaseId: suggestions.taxCodes[i]?.purchaseId ?? null };
  });
  // Pre-fill of the expense account: the supplier's history first, else the validated suggestion from the document content. Never a guess.
  const modelAccount = sanitizeSuggestedAccount(db, x.suggestedAccount);
  const history = suggestions.debitAccount;
  // The person's rule beats the supplier's history, which beats the suggestion from the document.
  const ruleAccount = rule?.debitAccount && allowedDebit(db, rule.debitAccount) ? rule.debitAccount : null;
  const prefill = ruleAccount
    ? { account: ruleAccount, source: 'RULE' as const, info: { ruleId: rule!.id, ruleName: rule!.name } }
    : history
    ? { account: history.account, source: 'HISTORY' as const, info: { purchaseId: history.purchaseId, number: history.number, date: history.date } }
    : modelAccount ? { account: modelAccount.code, source: 'MODEL' as const, info: { reason: modelAccount.reason } } : null;
  const draft: ConfirmInput = {
    supplier: { clientId: supplierId, name: supplier.name || '', code: supplier.code || '', vatCode: supplier.vatCode || '', address: supplier.address || '', create: supplierId === null },
    series, number, issueDate: x.issueDate || '', dueDate: x.dueDate || '', lines: draftLines,
    totals: { net: abs(t.net) ?? undefined, vat: abs(t.vat) ?? undefined, gross: abs(t.gross) ?? undefined },
    evidenceType, ...(suggestedDeductionPercent !== null ? { deductionPercent: suggestedDeductionPercent } : {}),
    paymentMethod: x.payment.method ?? rule?.paymentMethod ?? null, cardLast4: x.payment.cardLast4, cashRegisterNo: x.receipt?.cashRegisterNo ?? null, receiptNo: x.receipt?.receiptNo ?? null, documentTime: x.receipt?.time ?? null,
    paidBy: rule?.paidBy ?? (x.payment.method === 'CARD' ? 'COMPANY' : null), debitAccount: prefill?.account ?? null, accountSource: prefill?.source ?? null, accountInfo: prefill?.info ?? null, amountsInEur: !x.currency || x.currency.toUpperCase() === 'EUR',
    currency: x.currency?.trim().toUpperCase() || 'EUR', docKind: x.docKind === 'CREDIT_NOTE' ? 'CREDIT_NOTE' : 'INVOICE', referencedDocument: x.referencedDocument ?? null,
    ...(x.currency && x.currency.trim().toUpperCase() !== 'EUR' ? { foreign: { currency: x.currency.trim().toUpperCase(), rate: null, rateDate: null } } : {}),
  };
  // `missing` is the confirmation validation run on the draft: the UI blocks submit until every field in it is filled.
  const { errors: missing } = validateEdit(db, companyId, draft, x);
  return {
    document: publicRow(row), extracted: x, recognized: true, draft, missing, warnings,
    supplier: { clientId: supplierId, name: supplier.name, code: supplier.code, vatCode: supplier.vatCode }, supplierFromEmail,
    rule: ruleSummary(rule),
    needsSupplier: supplierId === null, buyerMatches: buyerOk, duplicatePurchaseId, duplicates,
    suggestedEvidenceType, suggestedDeductionPercent, companyVatPayer,
    suggestions: { debitAccount: suggestions.debitAccount?.account ?? null, debitAccountFromPurchaseId: suggestions.debitAccount?.purchaseId ?? null, accountHistory: history, modelAccount, lineTaxCodes: suggestions.taxCodes.map(s => s?.taxCode ?? null) },
    uncertainFields: x.uncertainFields,
    ...reviewExtras(db, companyId, x.lines.map(l => l.name || '')),
  };
}

// ---------- confirmation ----------

// XML e-invoice: confirmed through the XML import itself (supplier creation, credit notes, stock, source XML kept), then linked to the document.
function confirmXmlDocument(db: Database.Database, companyId: number, id: number, userId: number | null, input: ConfirmInput, row: PurchaseDocumentRow) {
  const deduction = input.deductionPercent === undefined || input.deductionPercent === null || input.deductionPercent === '' ? undefined : input.deductionPercent;
  if (deduction !== undefined && (!isNum(deduction) || deduction < 0 || deduction > 100)) throw new FieldErrorsError({ deductionPercent: 'Neteisinga PVM atskaitos dalis' });
  const debitAccount = typeof input.debitAccount === 'string' && input.debitAccount.trim() ? input.debitAccount.trim() : undefined;
  const originalPurchaseId = input.originalPurchaseId === undefined || input.originalPurchaseId === null || input.originalPurchaseId === '' ? undefined : Number(input.originalPurchaseId);
  if (originalPurchaseId !== undefined && !Number.isSafeInteger(originalPurchaseId)) throw new FieldErrorsError({ 'credit.original': 'Neteisingas pradinio pirkimo numeris' });
  const result = importXmlPurchase(companyId, xmlText(row), { filename: row.fileName, createSupplier: input.createSupplier === true, originalPurchaseId, deductionPercent: deduction, debitAccount, warehouseName: typeof input.warehouseName === 'string' ? input.warehouseName : undefined });
  const purchaseId = (result.purchase as { id: number }).id;
  const clientId = (result.purchase as { clientId: number | null }).clientId;
  const accountSource = resolveAccountSource(db, companyId, clientId, debitAccount ?? null, input.accountSource, null);
  db.prepare("UPDATE PurchaseDocument SET status='CONFIRMED', purchaseId=?, confirmedAt=strftime('%Y-%m-%dT%H:%M:%fZ','now'), confirmedBy=?, error=NULL, accountSource=? WHERE id=?").run(purchaseId, userId, accountSource, id);
  return { purchase: result.purchase, items: result.items, createdSupplier: result.createdSupplier, assets: [], document: publicRow(getDocument(companyId, id)) };
}

// Supplier credit note from a received document: the shared credit path (limits, deduction reversal, stock return, i.SAF codes) as for the XML import.
function confirmCredit(db: Database.Database, companyId: number, id: number, userId: number | null, n: Normalized, supplierId: number | null, row: PurchaseDocumentRow) {
  const c = n.credit!;
  const sameSupplier = c.clientId !== null ? supplierId === c.clientId : supplierId === null && c.clientName === n.supplier.name;
  if (!sameSupplier) throw new FieldErrorsError({ supplier: 'Kreditinio dokumento tiekėjas turi sutapti su pradinio pirkimo tiekėju' });
  const purchaseId = insertPurchaseCredit(db, companyId, c.originalId, { number: n.body.number, series: n.body.series, purchaseDate: String(n.body.purchaseDate), reason: c.reason, items: n.body.items as never[] });
  const items = db.prepare('SELECT * FROM PurchaseItem WHERE purchaseId=? ORDER BY id').all(purchaseId) as { id: number }[];
  setLineCodes(db, companyId, items.map((it, i) => ({ kind: 'PURCHASE' as const, itemId: it.id, taxCode: n.taxCodes[i], note: row.extractedJson ? 'Pagal atpažintą kreditinį dokumentą' : 'Pagal gautą kreditinį dokumentą (įvesta rankiniu būdu)' })), userId);
  db.prepare("UPDATE PurchaseDocument SET status='CONFIRMED', purchaseId=?, confirmedAt=strftime('%Y-%m-%dT%H:%M:%fZ','now'), confirmedBy=?, error=NULL, accountSource=NULL WHERE id=?").run(purchaseId, userId, id);
  return { purchase: db.prepare('SELECT * FROM Purchase WHERE id=?').get(purchaseId), items, assets: [], createdSupplier: false, credit: { originalPurchaseId: c.originalId }, document: publicRow(getDocument(companyId, id)) };
}

// Purchases of the supplier a credit note can refer to (newest first) and the one whose number equals the number printed on the credit note.
export function creditCandidates(companyId: number, clientId: number | null, reference: string | null) {
  const db = getDb();
  if (clientId === null) return { suggestedId: null as number | null, candidates: [] as { id: number; number: string; date: string; gross: number }[] };
  const candidates = db.prepare("SELECT id, COALESCE(series,'') || number AS number, purchaseDate AS date, sumWithVat AS gross FROM Purchase WHERE companyId=? AND clientId=? AND COALESCE(docType,'SF')='SF' ORDER BY purchaseDate DESC, id DESC LIMIT 100")
    .all(companyId, clientId) as { id: number; number: string; date: string; gross: number }[];
  const key = (reference || '').replace(/\s+/g, '').toUpperCase();
  const hits = key ? candidates.filter(c => c.number.replace(/\s+/g, '').toUpperCase() === key) : [];
  return { suggestedId: hits.length === 1 ? hits[0].id : null, candidates };
}

// Fixed asset cards the person asked for: cost = line net + the non-deductible share of the line's VAT (the purchase debits the same amount
// to the asset account), linked to the purchase and its line. A refusal by the asset rules rolls the whole confirmation back.
function createAssetCards(db: Database.Database, companyId: number, userId: number | null, purchaseId: number, n: Normalized, items: { id: number; sumWithoutVat: number; sumWithVat: number }[]) {
  const created: { id: number; code: string; name: string }[] = [];
  if (!n.assets.length) return created;
  const tax = db.prepare('SELECT vat, deductibleVat FROM Purchase WHERE id=?').get(purchaseId) as { vat: number; deductibleVat: number | null };
  const nonDeductibleShare = tax.vat > 0 ? Math.max(0, tax.vat - (tax.deductibleVat ?? tax.vat)) / tax.vat : 0;
  const exists = db.prepare('SELECT 1 FROM FixedAsset WHERE companyId=? AND code=?');
  for (const request of n.assets) {
    const item = items[request.index];
    const cost = r2(item.sumWithoutVat + (item.sumWithVat - item.sumWithoutVat) * nonDeductibleShare);
    let code = request.code || `IT-${purchaseId}-${request.index + 1}`;
    for (let suffix = 2; !request.code && exists.get(companyId, code); suffix++) code = `IT-${purchaseId}-${request.index + 1}-${suffix}`;
    const date = String(n.body.purchaseDate);
    try {
      const id = createAsset(db, companyId, {
        code, name: request.name, category: request.category, acquisitionDate: date, commissioningDate: request.commissioningDate || date, cost, residualValue: 0,
        ...(request.usefulLifeMonths ? { usefulLifeMonths: request.usefulLifeMonths } : {}), assetAccount: n.body.debitAccount, notes: `Sukurta iš gauto dokumento ${n.body.series}${n.body.number}`,
      }, userId, { purchaseId, purchaseItemId: item.id });
      created.push({ id, code, name: request.name });
    } catch (error) {
      if (error instanceof HttpError) throw new FieldErrorsError({ [`lines.${request.index}.asset`]: `Eilutė ${request.index + 1}: ${error.message}` });
      throw error;
    }
  }
  return created;
}

// The user's edited values are authoritative; the extraction is only used to ask for fields the document had (supplier code, currency).
export function confirmDocument(companyId: number, id: number, userId: number | null, input: ConfirmInput) {
  const result = confirmDocumentInner(companyId, id, userId, input);
  // Learning: a document received by e-mail from an address that no rule accepts (typically a forwarded one) offers to allow that address.
  const row = getDocument(companyId, id);
  return { ...result, suggestAllowSender: row.source === 'EMAIL' ? addressToSuggest(companyId, row.sender, row.originalSender) : null };
}

function confirmDocumentInner(companyId: number, id: number, userId: number | null, input: ConfirmInput) {
  const db = getDb();
  return db.transaction(() => {
    const row = getDocument(companyId, id);
    if (!NOT_FINAL.includes(row.status)) throw new HttpError(409, 'Šis dokumentas jau patvirtintas arba atmestas');
    if (!input || typeof input !== 'object' || Array.isArray(input)) throw new HttpError(400, 'Tikimasi objekto');
    if (isXmlDocument(row)) return confirmXmlDocument(db, companyId, id, userId, input, row);
    const { errors, normalized: n } = validateEdit(db, companyId, input, parseExtracted(row));
    if (!n) throw new FieldErrorsError(errors);
    const existingId = n.clientId ?? findSupplierId(db, companyId, { regNumber: n.supplier.code, vatCode: n.supplier.vatCode });
    if (db.prepare(duplicateSql).get(companyId, n.body.number, n.body.series, existingId, n.supplier.name)) throw new FieldErrorsError({ number: `Šio tiekėjo dokumentas ${n.body.series}${n.body.number} jau yra pirkimuose` });
    // Content duplicate (same supplier and number / receipt, also another open document of the queue): the person must say it is not one.
    const duplicates = findDuplicates(db, companyId, {
      clientId: existingId, supplierCode: n.supplier.code, supplierVatCode: n.supplier.vatCode, supplierName: n.supplier.name,
      series: n.body.series, number: n.body.number, receiptNo: n.extras.receiptNo || '', cashRegisterNo: n.extras.cashRegisterNo || '', date: String(n.body.purchaseDate), gross: n.declaredGross,
    }, id);
    if (duplicates.some(d => d.strength === 'strong')) {
      if (input.confirmDuplicate !== true) throw new FieldErrorsError({ confirmDuplicate: 'Dokumentas atrodo kaip jau užregistruoto dublikatas. Pažymėkite „Tai ne dublikatas, vis tiek patvirtinti“.' }, 409);
      n.body.notes = [n.body.notes, 'Patvirtinta nepaisant galimo dublikato'].filter(Boolean).join('; ');
    }
    if (n.credit) return confirmCredit(db, companyId, id, userId, n, existingId, row);
    let supplierId = existingId;
    let createdSupplier = false;
    if (supplierId === null) {
      const res = db.prepare("INSERT INTO Client(companyId,name,code,vatCode,address,createdAt,updatedAt) VALUES(?,?,?,?,?,datetime('now'),datetime('now'))")
        .run(companyId, n.supplier.name, n.supplier.code || null, n.supplier.vatCode || null, n.supplier.address || null);
      supplierId = Number(res.lastInsertRowid);
      createdSupplier = true;
    }
    const accountSource = resolveAccountSource(db, companyId, existingId, (n.body.debitAccount as string | undefined) ?? null, input.accountSource, parseExtracted(row));
    // New stock cards come first so the purchase finds them by code and posts the stock receipt.
    for (const c of n.stockCreates) db.prepare('INSERT INTO StockItem(companyId,name,code,warehouseName,stock,remainder,price,cost) VALUES(?,?,?,?,0,0,0,0)').run(companyId, c.name, c.code, c.warehouseName);
    const { purchase, items, purchaseId } = createPurchase(companyId, { ...n.body, clientId: supplierId }, { currencyCode: n.foreign?.currency });
    const stored = purchase as { sumWithVat: number };
    if (!near(stored.sumWithVat, n.declaredGross, 0.01 * Math.max(1, items.length) + 1e-9)) throw new FieldErrorsError({ 'totals.gross': 'Perskaičiuota suma pagal eilutes nesutampa su bendra suma' });
    writePurchaseExtras(db, companyId, purchaseId, n.extras);
    const used = findRule(db, companyId, supplierId, documentSenders(db, companyId, row));
    if (used) markRuleUsed(db, used.id);
    // "Save as the rule of this supplier": the confirmed values become (or replace) the supplier's rule.
    const codes = [...new Set(n.taxCodes)];
    const rule = input.saveRule === true
      ? saveSupplierRule(db, companyId, supplierId, { debitAccount: n.body.debitAccount, taxCode: codes.length === 1 ? codes[0] : null, evidenceType: n.extras.evidenceType, paymentMethod: n.extras.paymentMethod, paidBy: n.extras.paidBy, deductionPercent: n.body.deductionPercent })
      : null;
    setLineCodes(db, companyId, (items as { id: number }[]).map((it, i) => ({ kind: 'PURCHASE' as const, itemId: it.id, taxCode: n.taxCodes[i], note: row.extractedJson ? 'Pagal atpažintą dokumentą' : 'Pagal gautą dokumentą (įvesta rankiniu būdu)' })), userId);
    if (n.foreign) {
      const f = n.foreign;
      const source = f.rateDate && isPublishedRate(db, f.currency, f.rateDate, f.rate) ? 'ECB' : 'MANUAL';
      db.prepare('INSERT INTO PurchaseForeignAmount(purchaseId,companyId,currency,rate,rateDate,rateSource,net,vat,gross) VALUES(?,?,?,?,?,?,?,?,?)').run(purchaseId, companyId, f.currency, f.rate, f.rateDate, source, f.net, f.vat, f.gross);
    }
    const assets = createAssetCards(db, companyId, userId, purchaseId, n, items as { id: number; sumWithoutVat: number; sumWithVat: number }[]);
    db.prepare("UPDATE PurchaseDocument SET status='CONFIRMED', purchaseId=?, confirmedAt=strftime('%Y-%m-%dT%H:%M:%fZ','now'), confirmedBy=?, error=NULL, accountSource=? WHERE id=?").run(purchaseId, userId, accountSource, id);
    return { purchase: db.prepare('SELECT * FROM Purchase WHERE id=?').get(purchaseId), items, assets, createdSupplier, rule, document: publicRow(getDocument(companyId, id)) };
  })();
}
