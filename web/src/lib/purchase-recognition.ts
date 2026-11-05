import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type Database from 'better-sqlite3';
import { getDb } from './db';
import { HttpError } from './errors';
import { documentsRootFor } from './document-files';
import { encryptSecret, decryptSecret } from './company-mail';
import { buyerMatchesCompany, findSupplierId } from './purchase-import';
import { createPurchase } from './purchases';
import { companyTaxMode, purchaseDebitAccount } from './tax';
import { codesFor } from './tax-codes';
import { setLineCodes } from './tax-line-codes';
import { dateValue } from './validation';
import { RecognitionError, RecognizedDocumentSchema, type RecognitionProvider, type RecognizedDocument } from './recognition/types';

export type DocumentStatus = 'NEW' | 'EXTRACTED' | 'FAILED' | 'CONFIRMED' | 'REJECTED';
export interface PurchaseDocumentRow {
  id: number; companyId: number; purchaseId: number | null; fileName: string; mimeType: string; size: number; sha256: string; storagePath: string;
  source: 'UPLOAD' | 'EMAIL'; sender: string | null; receivedAt: string; status: DocumentStatus; extractedJson: string | null; error: string | null;
  model: string | null; createdAt: string; confirmedAt: string | null; confirmedBy: number | null;
}
// Field name -> Lithuanian message. Keys: 'supplier.name', 'issueDate', 'number', 'lines.0.taxCode', 'totals.gross', ...
export type FieldErrors = Record<string, string>;
export class FieldErrorsError extends HttpError {
  constructor(public fields: FieldErrors) { super(400, Object.values(fields)[0] || 'Neteisingi duomenys'); }
}

const MAX_SIZE = 20 * 1024 * 1024;
const EXTENSIONS: Record<string, string> = { 'application/pdf': 'pdf', 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };
const NOT_FINAL = ['NEW', 'EXTRACTED', 'FAILED'];

// ---------- settings ----------

export function getRecognitionSettings(companyId: number) {
  const row = getDb().prepare('SELECT enabled, apiKeyEncrypted, model FROM CompanyRecognitionSettings WHERE companyId=?').get(companyId) as { enabled: number; apiKeyEncrypted: string | null; model: string } | undefined;
  // The key itself never leaves the server: only whether one is stored.
  return { enabled: Boolean(row?.enabled), model: row?.model || '', hasKey: Boolean(row?.apiKeyEncrypted) };
}

export function saveRecognitionSettings(companyId: number, body: Record<string, unknown>) {
  const { enabled, apiKey, clearKey, model } = body;
  if (typeof enabled !== 'boolean') throw new HttpError(400, 'Nurodykite, ar atpažinimas įjungtas');
  if (model !== undefined && model !== null && (typeof model !== 'string' || (model !== '' && !/^[A-Za-z0-9._:-]{1,100}$/.test(model)))) throw new HttpError(400, 'Neteisingas modelio pavadinimas');
  if (apiKey !== undefined && apiKey !== null && (typeof apiKey !== 'string' || apiKey.length > 500 || /\s/.test(apiKey))) throw new HttpError(400, 'Neteisingas API raktas');
  const previous = getDb().prepare('SELECT apiKeyEncrypted, model FROM CompanyRecognitionSettings WHERE companyId=?').get(companyId) as { apiKeyEncrypted: string | null; model: string } | undefined;
  const secret = clearKey === true ? '' : typeof apiKey === 'string' && apiKey ? encryptSecret(apiKey, companyId) : previous?.apiKeyEncrypted || '';
  if (enabled && !secret) throw new HttpError(400, 'Norėdami įjungti atpažinimą, įveskite API raktą.');
  getDb().prepare(`INSERT INTO CompanyRecognitionSettings(companyId,enabled,apiKeyEncrypted,model,updatedAt) VALUES(?,?,?,?,strftime('%Y-%m-%dT%H:%M:%fZ','now'))
    ON CONFLICT(companyId) DO UPDATE SET enabled=excluded.enabled,apiKeyEncrypted=excluded.apiKeyEncrypted,model=excluded.model,updatedAt=excluded.updatedAt`)
    .run(companyId, enabled ? 1 : 0, secret || null, typeof model === 'string' ? model : previous?.model || '');
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
function absolutePath(storagePath: string) {
  const root = path.resolve(documentsRoot());
  const full = path.resolve(root, storagePath);
  if (!full.startsWith(root + path.sep)) throw new HttpError(400, 'Neteisingas failo kelias');
  return full;
}

export function detectMime(buffer: Buffer): string | null {
  if (buffer.length >= 5 && buffer.subarray(0, 5).toString('latin1') === '%PDF-') return 'application/pdf';
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return 'image/jpeg';
  if (buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image/png';
  if (buffer.length >= 12 && buffer.subarray(0, 4).toString('latin1') === 'RIFF' && buffer.subarray(8, 12).toString('latin1') === 'WEBP') return 'image/webp';
  return null;
}
const isHeic = (buffer: Buffer) => buffer.length >= 12 && buffer.subarray(4, 8).toString('latin1') === 'ftyp' && /^(heic|heix|hevc|hevx|heim|heis|mif1|msf1)/.test(buffer.subarray(8, 12).toString('latin1'));
const HEIC_MESSAGE = 'HEIC formato nuotraukos nepalaikomos. Telefone pasirinkite JPEG formatą (nustatymai: Fotoaparatas > Formatai > Maksimalus suderinamumas) arba nuotrauką išsaugokite kaip JPEG.';

export function storeDocument(companyId: number, input: { buffer: Buffer; fileName: string; mimeType?: string; source?: 'UPLOAD' | 'EMAIL'; sender?: string | null }): PurchaseDocumentRow {
  const db = getDb();
  const { buffer } = input;
  if (!buffer.length) throw new HttpError(400, 'Failas tuščias');
  if (buffer.length > MAX_SIZE) throw new HttpError(413, 'Failas per didelis: leidžiama iki 20 MB');
  const declared = (input.mimeType || '').toLowerCase().split(';')[0].trim();
  if (isHeic(buffer) || declared === 'image/heic' || declared === 'image/heif') throw new HttpError(415, HEIC_MESSAGE);
  const detected = detectMime(buffer);
  if (!detected) throw new HttpError(415, 'Palaikomi tik PDF, JPEG, PNG ir WebP failai.');
  if (declared && declared !== 'application/octet-stream' && declared !== detected && !(declared === 'image/jpg' && detected === 'image/jpeg')) throw new HttpError(415, 'Failo turinys neatitinka nurodyto tipo.');
  const sha256 = createHash('sha256').update(buffer).digest('hex');
  const existing = db.prepare('SELECT id, fileName FROM PurchaseDocument WHERE companyId=? AND sha256=?').get(companyId, sha256) as { id: number; fileName: string } | undefined;
  if (existing) throw Object.assign(new HttpError(409, `Šis dokumentas jau įkeltas (Nr. ${existing.id}, ${existing.fileName}).`), { existingId: existing.id });
  const source = input.source === 'EMAIL' ? 'EMAIL' : 'UPLOAD';
  const storagePath = `${companyId}/${new Date().getUTCFullYear()}/${sha256}.${EXTENSIONS[detected]}`;
  const full = absolutePath(storagePath);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  let created = false;
  // Write-once: the name is the content hash, an existing file is never rewritten.
  try { fs.writeFileSync(full, buffer, { flag: 'wx' }); created = true; } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error; }
  try {
    const res = db.prepare('INSERT INTO PurchaseDocument(companyId,fileName,mimeType,size,sha256,storagePath,source,sender) VALUES(?,?,?,?,?,?,?,?)')
      .run(companyId, (path.basename(input.fileName || 'dokumentas') || 'dokumentas').slice(0, 200), detected, buffer.length, sha256, storagePath, source, input.sender ? String(input.sender).slice(0, 254) : null);
    return getDocument(companyId, Number(res.lastInsertRowid));
  } catch (error) {
    if (created) fs.rmSync(full, { force: true });
    throw error;
  }
}

export function getDocument(companyId: number, id: number): PurchaseDocumentRow {
  const row = getDb().prepare('SELECT * FROM PurchaseDocument WHERE id=? AND companyId=?').get(id, companyId) as PurchaseDocumentRow | undefined;
  if (!row) throw new HttpError(404, 'Dokumentas nerastas');
  return row;
}
export function readDocumentFile(companyId: number, id: number) {
  const row = getDocument(companyId, id);
  return { row, data: fs.readFileSync(absolutePath(row.storagePath)) };
}

// Row for clients: no server file path and no raw extraction.
function publicRow(row: PurchaseDocumentRow) {
  const copy: Partial<PurchaseDocumentRow> = { ...row };
  delete copy.storagePath;
  delete copy.extractedJson;
  return copy;
}

export function listDocuments(companyId: number, status?: string) {
  const rows = (status
    ? getDb().prepare('SELECT * FROM PurchaseDocument WHERE companyId=? AND status=? ORDER BY id DESC LIMIT 500').all(companyId, status)
    : getDb().prepare('SELECT * FROM PurchaseDocument WHERE companyId=? ORDER BY id DESC LIMIT 500').all(companyId)) as PurchaseDocumentRow[];
  return rows.map(row => ({ ...publicRow(row), summary: documentSummary(row) }));
}

// Supplier, number, date and total of the extraction, for the inbox list (null until the document is recognized).
function documentSummary(row: PurchaseDocumentRow) {
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
}

export function rejectDocument(companyId: number, id: number) {
  const row = getDocument(companyId, id);
  if (!NOT_FINAL.includes(row.status)) throw new HttpError(409, 'Šio dokumento būsenos pakeisti negalima');
  getDb().prepare("UPDATE PurchaseDocument SET status='REJECTED' WHERE id=?").run(id);
  return publicRow(getDocument(companyId, id));
}

// ---------- recognition ----------

export async function recognizeDocument(companyId: number, id: number, provider: RecognitionProvider) {
  const db = getDb();
  const row = getDocument(companyId, id);
  if (!NOT_FINAL.includes(row.status)) throw new HttpError(409, 'Šis dokumentas jau apdorotas');
  const settingsRow = db.prepare('SELECT enabled, apiKeyEncrypted, model FROM CompanyRecognitionSettings WHERE companyId=?').get(companyId) as { enabled: number; apiKeyEncrypted: string | null; model: string } | undefined;
  if (!settingsRow?.enabled || !settingsRow.apiKeyEncrypted) throw new HttpError(409, 'Dokumentų atpažinimas neįjungtas: nurodykite API raktą įmonės nustatymuose.');
  const apiKey = decryptSecret(settingsRow.apiKeyEncrypted, companyId, 'Nepavyko nuskaityti išsaugoto API rakto. Patikrinkite šifravimo raktą.');
  const { data } = readDocumentFile(companyId, id);
  try {
    const result = await provider.recognize({ data, mimeType: row.mimeType }, { apiKey, model: settingsRow.model });
    const parsed = RecognizedDocumentSchema.safeParse(result);
    if (!parsed.success) throw new RecognitionError('EMPTY', 'Atpažinimo rezultatas neatitinka laukiamo formato.');
    db.prepare("UPDATE PurchaseDocument SET status='EXTRACTED', extractedJson=?, error=NULL, model=? WHERE id=?").run(JSON.stringify(parsed.data), settingsRow.model || null, id);
  } catch (error) {
    const message = error instanceof RecognitionError ? error.message : 'Atpažinimas nepavyko dėl netikėtos klaidos.';
    if (!(error instanceof RecognitionError)) console.error('Document recognition failed', error);
    db.prepare("UPDATE PurchaseDocument SET status='FAILED', error=? WHERE id=?").run(message.slice(0, 500), id);
  }
  return publicRow(getDocument(companyId, id));
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

export interface EditedLine { itemName?: unknown; quantity?: unknown; net?: unknown; vat?: unknown; gross?: unknown; vatRate?: unknown; taxCode?: unknown }
export interface ConfirmInput {
  supplier?: { clientId?: unknown; name?: unknown; code?: unknown; vatCode?: unknown; address?: unknown; create?: unknown };
  series?: unknown; number?: unknown; issueDate?: unknown; dueDate?: unknown;
  lines?: unknown; totals?: { net?: unknown; vat?: unknown; gross?: unknown };
  deductionPercent?: unknown; debitAccount?: unknown; amountsInEur?: unknown; notes?: unknown;
  [extra: string]: unknown;
}
interface Normalized {
  clientId: number | null; supplier: { name: string; code: string; vatCode: string; address: string };
  body: { series: string; number: string; [key: string]: unknown }; taxCodes: string[]; extras: PurchaseExtras; declaredGross: number;
}

function validateEdit(db: Database.Database, companyId: number, input: ConfirmInput, extracted: RecognizedDocument | null): { errors: FieldErrors; normalized: Normalized | null } {
  const errors: FieldErrors = {};
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
  if (extracted?.docKind === 'CREDIT_NOTE') errors.docKind = 'Kreditinių dokumentų čia registruoti negalima: naudokite kreditinį pirkimą';
  if (extracted?.currency && extracted.currency.toUpperCase() !== 'EUR' && input.amountsInEur !== true) errors.currency = `Dokumento valiuta ${extracted.currency}: įveskite sumas eurais ir patvirtinkite`;

  const { values: extras, errors: extraErrors } = normalizePurchaseExtras(input);
  Object.assign(errors, extraErrors);
  // A receipt without a printed series/number is filed under its receipt number (series = cash register number), but only
  // when the user left the series/number fields empty; typed values always win.
  let series = str(input.series, 50), number = str(input.number, 100);
  if (!number && extras.receiptNo) { number = extras.receiptNo; if (!series) series = extras.cashRegisterNo || ''; }
  if (!number) errors.number = 'Nurodykite dokumento numerį (kvitui — kvito numerį)';

  const rawLines = Array.isArray(input.lines) ? input.lines as EditedLine[] : [];
  const items: { itemName: string; quantity: number; price: number; vatRate: number }[] = [];
  const taxCodes: string[] = [];
  let sumNet = 0, sumVat = 0, sumGross = 0;
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
    if (isNum(line.net) && isNum(line.vatRate) && isNum(quantity) && quantity > 0) {
      const q = Number(quantity.toFixed(6));
      items.push({ itemName, quantity: q, price: Number((line.net / q).toFixed(6)), vatRate: line.vatRate });
    }
    taxCodes.push(typeof line.taxCode === 'string' ? line.taxCode : '');
  });
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
  if (Object.keys(errors).length) return { errors, normalized: null };

  const notes = [str(input.notes, 400), 'Sukurta iš įkelto dokumento'].filter(Boolean).join('; ');
  return {
    errors,
    normalized: {
      clientId, supplier: { name, code, vatCode, address }, taxCodes, extras: { ...extras, evidenceType: extras.evidenceType || 'INVOICE' }, declaredGross: totals.gross as number,
      body: {
        series, number, purchaseDate: issueDate, clientName: name, clientCode: code || null, notes, items,
        ...(deductionPercent !== undefined ? { deductionPercent } : {}), ...(debitAccount ? { debitAccount } : {}),
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
  if (clientId === null) return { taxCodes: rates.map((): Hit | null => null), debitAccount: null as { account: string; purchaseId: number } | null };
  const byRate = db.prepare(`SELECT t.taxCode, p.id AS purchaseId FROM PurchaseItem i JOIN Purchase p ON p.id=i.purchaseId JOIN TaxLineCode t ON t.kind='PURCHASE' AND t.itemId=i.id
    WHERE p.companyId=? AND p.clientId=? AND COALESCE(p.docType,'SF')='SF' AND i.vatRate=? ORDER BY p.purchaseDate DESC, p.id DESC, i.id LIMIT 1`);
  const account = db.prepare("SELECT debitAccount AS account, id AS purchaseId FROM Purchase WHERE companyId=? AND clientId=? AND debitAccount IS NOT NULL AND COALESCE(docType,'SF')='SF' ORDER BY purchaseDate DESC, id DESC LIMIT 1");
  return {
    taxCodes: rates.map((rate): Hit | null => (rate === null ? null : (byRate.get(companyId, clientId, rate) as Hit | undefined) || null)),
    debitAccount: (account.get(companyId, clientId) as { account: string; purchaseId: number } | undefined) || null,
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
    paidBy: 'COMPANY', debitAccount: null, amountsInEur: true,
  };
  const { errors: missing } = validateEdit(db, companyId, draft, null);
  return {
    document: publicRow(row), extracted: { docKind: 'INVOICE', currency: 'EUR', supplier: { code: null, name: null, vatCode: null }, totals: { net: null, vat: null, gross: null } } as unknown as RecognizedDocument,
    recognized: false, draft, missing, warnings: [] as string[],
    supplier: { clientId: null as number | null, name: null as string | null, code: null as string | null, vatCode: null as string | null },
    needsSupplier: true, buyerMatches: null as boolean | null, duplicatePurchaseId: null as number | null,
    suggestedEvidenceType: 'INVOICE' as const, suggestedDeductionPercent: null as number | null, companyVatPayer,
    suggestions: { debitAccount: null as string | null, debitAccountFromPurchaseId: null as number | null, lineTaxCodes: [] as (string | null)[] },
    uncertainFields: [] as string[],
  };
}

// Existing supplier for a typed company code / VAT code (manual entry must not create a duplicate).
export function lookupSupplier(companyId: number, code: string, vatCode: string) {
  const db = getDb();
  const id = findSupplierId(db, companyId, { regNumber: code, vatCode });
  if (id === null) return null;
  return db.prepare('SELECT id, name, code, vatCode, address FROM Client WHERE id=? AND companyId=?').get(id, companyId) as { id: number; name: string; code: string | null; vatCode: string | null; address: string | null };
}

export function previewDocument(companyId: number, id: number) {
  const db = getDb();
  const row = getDocument(companyId, id);
  const x = parseExtracted(row);
  if (!x) return emptyPreview(db, companyId, row);
  const warnings: string[] = [];
  const supplierId = findSupplierId(db, companyId, { regNumber: x.supplier.code, vatCode: x.supplier.vatCode });
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
  if (suggestedEvidenceType === 'RECEIPT') suggestedDeductionPercent = 0;
  const date = x.issueDate && validDate(x.issueDate) ? x.issueDate : undefined;
  let companyVatPayer = true;
  try { companyVatPayer = companyTaxMode(companyId, date) === 'STANDARD_VAT'; } catch { companyVatPayer = true; }
  if (!companyVatPayer) { warnings.push('Įmonė nėra PVM mokėtoja: šio pirkimo PVM neatskaitomas.'); suggestedDeductionPercent = 0; }
  if (x.uncertainFields.length) warnings.push(`Nepatikimai atpažinti laukai: ${x.uncertainFields.join(', ')}.`);

  const suggestions = suggestFor(db, companyId, supplierId, x.lines.map(l => l.vatRate));
  const draftLines = x.lines.map((l, i) => {
    const rate = l.vatRate;
    const quantity = l.quantity ?? 1;
    const net = l.net ?? (l.gross !== null && rate !== null ? r2(l.gross / (1 + rate / 100)) : l.unitPrice !== null ? r2(l.unitPrice * quantity) : null);
    const gross = l.gross ?? (net !== null && l.vat !== null ? r2(net + l.vat) : net !== null && rate !== null ? r2(net * (1 + rate / 100)) : null);
    const vat = l.vat ?? (net !== null && gross !== null ? r2(gross - net) : null);
    // taxCode stays empty: a suggested code only becomes real when the reviewer picks it.
    return { itemName: l.name || '', quantity, net, vat, gross, vatRate: rate, taxCode: null as string | null, suggestedTaxCode: suggestions.taxCodes[i]?.taxCode ?? null, suggestedFromPurchaseId: suggestions.taxCodes[i]?.purchaseId ?? null };
  });
  const draft: ConfirmInput = {
    supplier: { clientId: supplierId, name: x.supplier.name || '', code: x.supplier.code || '', vatCode: x.supplier.vatCode || '', address: x.supplier.address || '', create: supplierId === null },
    series, number, issueDate: x.issueDate || '', dueDate: x.dueDate || '', lines: draftLines,
    totals: { net: t.net ?? undefined, vat: t.vat ?? undefined, gross: t.gross ?? undefined },
    evidenceType: suggestedEvidenceType, ...(suggestedDeductionPercent !== null ? { deductionPercent: suggestedDeductionPercent } : {}),
    paymentMethod: x.payment.method, cardLast4: x.payment.cardLast4, cashRegisterNo: x.receipt?.cashRegisterNo ?? null, receiptNo: x.receipt?.receiptNo ?? null, documentTime: x.receipt?.time ?? null,
    paidBy: x.payment.method === 'CARD' ? 'COMPANY' : null, debitAccount: null, amountsInEur: !x.currency || x.currency.toUpperCase() === 'EUR',
  };
  // `missing` is the confirmation validation run on the draft: the UI blocks submit until every field in it is filled.
  const { errors: missing } = validateEdit(db, companyId, draft, x);
  return {
    document: publicRow(row), extracted: x, recognized: true, draft, missing, warnings,
    supplier: { clientId: supplierId, name: x.supplier.name, code: x.supplier.code, vatCode: x.supplier.vatCode },
    needsSupplier: supplierId === null, buyerMatches: buyerOk, duplicatePurchaseId,
    suggestedEvidenceType, suggestedDeductionPercent, companyVatPayer,
    suggestions: { debitAccount: suggestions.debitAccount?.account ?? null, debitAccountFromPurchaseId: suggestions.debitAccount?.purchaseId ?? null, lineTaxCodes: suggestions.taxCodes.map(s => s?.taxCode ?? null) },
    uncertainFields: x.uncertainFields,
  };
}

// ---------- confirmation ----------

// The user's edited values are authoritative; the extraction is only used to ask for fields the document had (supplier code, currency).
export function confirmDocument(companyId: number, id: number, userId: number | null, input: ConfirmInput) {
  const db = getDb();
  return db.transaction(() => {
    const row = getDocument(companyId, id);
    if (!NOT_FINAL.includes(row.status)) throw new HttpError(409, 'Šis dokumentas jau patvirtintas arba atmestas');
    if (!input || typeof input !== 'object' || Array.isArray(input)) throw new HttpError(400, 'Tikimasi objekto');
    const { errors, normalized: n } = validateEdit(db, companyId, input, parseExtracted(row));
    if (!n) throw new FieldErrorsError(errors);
    const existingId = n.clientId ?? findSupplierId(db, companyId, { regNumber: n.supplier.code, vatCode: n.supplier.vatCode });
    if (db.prepare(duplicateSql).get(companyId, n.body.number, n.body.series, existingId, n.supplier.name)) throw new FieldErrorsError({ number: `Šio tiekėjo dokumentas ${n.body.series}${n.body.number} jau yra pirkimuose` });
    let supplierId = existingId;
    let createdSupplier = false;
    if (supplierId === null) {
      const res = db.prepare("INSERT INTO Client(companyId,name,code,vatCode,address,createdAt,updatedAt) VALUES(?,?,?,?,?,datetime('now'),datetime('now'))")
        .run(companyId, n.supplier.name, n.supplier.code || null, n.supplier.vatCode || null, n.supplier.address || null);
      supplierId = Number(res.lastInsertRowid);
      createdSupplier = true;
    }
    const { purchase, items, purchaseId } = createPurchase(companyId, { ...n.body, clientId: supplierId });
    const stored = purchase as { sumWithVat: number };
    if (!near(stored.sumWithVat, n.declaredGross, 0.01 * Math.max(1, items.length) + 1e-9)) throw new FieldErrorsError({ 'totals.gross': 'Perskaičiuota suma pagal eilutes nesutampa su bendra suma' });
    writePurchaseExtras(db, companyId, purchaseId, n.extras);
    setLineCodes(db, companyId, (items as { id: number }[]).map((it, i) => ({ kind: 'PURCHASE' as const, itemId: it.id, taxCode: n.taxCodes[i], note: row.extractedJson ? 'Pagal atpažintą dokumentą' : 'Pagal gautą dokumentą (įvesta rankiniu būdu)' })), userId);
    db.prepare("UPDATE PurchaseDocument SET status='CONFIRMED', purchaseId=?, confirmedAt=strftime('%Y-%m-%dT%H:%M:%fZ','now'), confirmedBy=?, error=NULL WHERE id=?").run(purchaseId, userId, id);
    return { purchase: db.prepare('SELECT * FROM Purchase WHERE id=?').get(purchaseId), items, createdSupplier, document: publicRow(getDocument(companyId, id)) };
  })();
}
