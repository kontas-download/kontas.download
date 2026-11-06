import type Database from 'better-sqlite3';
import { getDb } from './db';
import { HttpError } from './errors';
import { validEmail } from './company-mail';
import { companyTaxMode, purchaseDebitAccount } from './tax';
import { codesFor } from './tax-codes';
import { domainOf } from './document-inbox-senders';

// Per-supplier rules of the received purchase documents: values the review form is pre-filled with (expense account, VAT code, document kind,
// payment). A rule belongs to a supplier (clientId) and/or to a sender pattern (exact address or @domain). The person creates it explicitly,
// so unlike history hints its VAT code is pre-filled; every value stays editable on the review screen.

export interface SupplierRuleRow {
  id: number; companyId: number; clientId: number | null; senderPattern: string | null; debitAccount: string | null; taxCode: string | null;
  evidenceType: 'INVOICE' | 'RECEIPT' | null; paymentMethod: 'CARD' | 'CASH' | 'TRANSFER' | 'OTHER' | null; paidBy: 'COMPANY' | 'PERSON' | null;
  deductionPercent: number | null; notes: string | null; createdAt: string; updatedAt: string; lastUsedAt: string | null;
}
export type SupplierRule = SupplierRuleRow & { name: string };

const PAYMENT = ['CARD', 'CASH', 'TRANSFER', 'OTHER'];
const empty = (v: unknown) => v === undefined || v === null || v === '';
const DOMAIN_PATTERN = /^@[^\s@,;<>]+\.[^\s@,;<>]+$/;

const withName = (db: Database.Database, row: SupplierRuleRow): SupplierRule => {
  const client = row.clientId === null ? undefined : db.prepare('SELECT name FROM Client WHERE id=?').get(row.clientId) as { name: string } | undefined;
  return { ...row, name: client?.name || row.senderPattern || `#${row.id}` };
};

export type RuleValues = Pick<SupplierRuleRow, 'clientId' | 'senderPattern' | 'debitAccount' | 'taxCode' | 'evidenceType' | 'paymentMethod' | 'paidBy' | 'deductionPercent' | 'notes'>;

// Request body -> checked values. Throws HttpError(400) with a Lithuanian message.
export function normalizeRule(db: Database.Database, companyId: number, body: Record<string, unknown>): RuleValues {
  let clientId: number | null = null;
  if (!empty(body.clientId)) {
    const id = Number(body.clientId);
    if (!Number.isSafeInteger(id) || !db.prepare('SELECT 1 FROM Client WHERE id=? AND companyId=?').get(id, companyId)) throw new HttpError(400, 'Pasirinktas tiekėjas nerastas šioje įmonėje');
    clientId = id;
  }
  let senderPattern: string | null = null;
  if (!empty(body.senderPattern)) {
    const pattern = typeof body.senderPattern === 'string' ? body.senderPattern.trim().toLowerCase() : '';
    if (!(validEmail(pattern) || DOMAIN_PATTERN.test(pattern))) throw new HttpError(400, 'Neteisingas siuntėjo šablonas: nurodykite el. pašto adresą arba @domeną');
    senderPattern = pattern;
  }
  if (clientId === null && senderPattern === null) throw new HttpError(400, 'Nurodykite tiekėją arba siuntėją, kuriam taikoma taisyklė');
  let debitAccount: string | null = null;
  if (!empty(body.debitAccount)) debitAccount = purchaseDebitAccount(db, body.debitAccount); // throws HttpError for an account a purchase may not be posted to
  let taxCode: string | null = null;
  if (!empty(body.taxCode)) {
    if (typeof body.taxCode !== 'string' || !codesFor('PURCHASE').includes(body.taxCode)) throw new HttpError(400, 'Neteisingas PVM klasifikatoriaus kodas');
    taxCode = body.taxCode;
  }
  const evidenceType = empty(body.evidenceType) ? null : body.evidenceType;
  if (evidenceType !== null && evidenceType !== 'INVOICE' && evidenceType !== 'RECEIPT') throw new HttpError(400, 'Dokumento rūšis turi būti sąskaita arba kvitas');
  const paymentMethod = empty(body.paymentMethod) ? null : body.paymentMethod;
  if (paymentMethod !== null && !PAYMENT.includes(paymentMethod as string)) throw new HttpError(400, 'Neteisingas mokėjimo būdas');
  const paidBy = empty(body.paidBy) ? null : body.paidBy;
  if (paidBy !== null && paidBy !== 'COMPANY' && paidBy !== 'PERSON') throw new HttpError(400, 'Mokėtojas turi būti įmonė arba asmuo');
  let deductionPercent: number | null = null;
  if (!empty(body.deductionPercent)) {
    const d = typeof body.deductionPercent === 'string' ? Number(body.deductionPercent.replace(',', '.')) : body.deductionPercent;
    if (typeof d !== 'number' || !Number.isFinite(d) || d < 0 || d > 100) throw new HttpError(400, 'Neteisinga PVM atskaitos dalis');
    deductionPercent = d;
  }
  // A company that is not a standard VAT payer never deducts VAT.
  let payer = true;
  try { payer = companyTaxMode(companyId, undefined) === 'STANDARD_VAT'; } catch (error) { if (!(error instanceof HttpError)) throw error; }
  if (!payer && deductionPercent !== null) deductionPercent = 0;
  const notes = typeof body.notes === 'string' && body.notes.trim() ? body.notes.trim().slice(0, 300) : null;
  return { clientId, senderPattern, debitAccount, taxCode, evidenceType: evidenceType as RuleValues['evidenceType'], paymentMethod: paymentMethod as RuleValues['paymentMethod'], paidBy: paidBy as RuleValues['paidBy'], deductionPercent, notes };
}

const COLUMNS = 'clientId,senderPattern,debitAccount,taxCode,evidenceType,paymentMethod,paidBy,deductionPercent,notes';
const valuesOf = (v: RuleValues) => [v.clientId, v.senderPattern, v.debitAccount, v.taxCode, v.evidenceType, v.paymentMethod, v.paidBy, v.deductionPercent, v.notes];

export function listRules(companyId: number): SupplierRule[] {
  const db = getDb();
  return (db.prepare('SELECT * FROM SupplierDocumentRule WHERE companyId=? ORDER BY id DESC').all(companyId) as SupplierRuleRow[]).map(r => withName(db, r));
}
function ruleRow(db: Database.Database, companyId: number, id: number): SupplierRuleRow {
  const row = db.prepare('SELECT * FROM SupplierDocumentRule WHERE id=? AND companyId=?').get(id, companyId) as SupplierRuleRow | undefined;
  if (!row) throw new HttpError(404, 'Taisyklė nerasta');
  return row;
}
// One rule per supplier and one per sender pattern.
function ensureUnique(db: Database.Database, companyId: number, v: RuleValues, exceptId: number | null) {
  const clash = (v.clientId !== null && db.prepare('SELECT id FROM SupplierDocumentRule WHERE companyId=? AND clientId=? AND id IS NOT ?').get(companyId, v.clientId, exceptId))
    || (v.senderPattern !== null && db.prepare('SELECT id FROM SupplierDocumentRule WHERE companyId=? AND senderPattern=? AND id IS NOT ?').get(companyId, v.senderPattern, exceptId));
  if (clash) throw new HttpError(409, 'Šiam tiekėjui arba siuntėjui taisyklė jau yra');
}
export function createRule(companyId: number, body: Record<string, unknown>): SupplierRule {
  const db = getDb();
  const v = normalizeRule(db, companyId, body);
  ensureUnique(db, companyId, v, null);
  const id = Number(db.prepare(`INSERT INTO SupplierDocumentRule(companyId,${COLUMNS}) VALUES(?,?,?,?,?,?,?,?,?,?)`).run(companyId, ...valuesOf(v)).lastInsertRowid);
  return withName(db, ruleRow(db, companyId, id));
}
export function updateRule(companyId: number, id: number, body: Record<string, unknown>): SupplierRule {
  const db = getDb();
  ruleRow(db, companyId, id);
  const v = normalizeRule(db, companyId, body);
  ensureUnique(db, companyId, v, id);
  db.prepare(`UPDATE SupplierDocumentRule SET clientId=?,senderPattern=?,debitAccount=?,taxCode=?,evidenceType=?,paymentMethod=?,paidBy=?,deductionPercent=?,notes=?,updatedAt=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=? AND companyId=?`)
    .run(...valuesOf(v), id, companyId);
  return withName(db, ruleRow(db, companyId, id));
}
export function deleteRule(companyId: number, id: number) {
  const db = getDb();
  ruleRow(db, companyId, id);
  db.prepare('DELETE FROM SupplierDocumentRule WHERE id=? AND companyId=?').run(id, companyId);
}

// The rule of the matched supplier, else the rule of the sender patterns (exact address before @domain; the original sender before the forwarder).
export function findRule(db: Database.Database, companyId: number, clientId: number | null, senders: (string | null | undefined)[]): SupplierRule | null {
  let row: SupplierRuleRow | undefined;
  if (clientId !== null) row = db.prepare('SELECT * FROM SupplierDocumentRule WHERE companyId=? AND clientId=?').get(companyId, clientId) as SupplierRuleRow | undefined;
  for (const raw of senders) {
    if (row) break;
    const a = (raw ?? '').trim().toLowerCase();
    if (!a.includes('@')) continue;
    row = db.prepare('SELECT * FROM SupplierDocumentRule WHERE companyId=? AND senderPattern=?').get(companyId, a) as SupplierRuleRow | undefined
      || db.prepare('SELECT * FROM SupplierDocumentRule WHERE companyId=? AND senderPattern=?').get(companyId, '@' + domainOf(a)) as SupplierRuleRow | undefined;
  }
  return row ? withName(db, row) : null;
}
export function markRuleUsed(db: Database.Database, id: number) {
  db.prepare("UPDATE SupplierDocumentRule SET lastUsedAt=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=?").run(id);
}

// Creates or updates the rule of a supplier from the values of a confirmed document ("save as rule for this supplier"). Empty values keep the stored ones.
export function saveSupplierRule(db: Database.Database, companyId: number, clientId: number, body: Record<string, unknown>): { id: number; created: boolean } {
  const existing = db.prepare('SELECT * FROM SupplierDocumentRule WHERE companyId=? AND clientId=?').get(companyId, clientId) as SupplierRuleRow | undefined;
  const v = normalizeRule(db, companyId, { clientId, senderPattern: existing?.senderPattern, notes: existing?.notes, ...body });
  if (!existing) {
    const id = Number(db.prepare(`INSERT INTO SupplierDocumentRule(companyId,${COLUMNS}) VALUES(?,?,?,?,?,?,?,?,?,?)`).run(companyId, ...valuesOf(v)).lastInsertRowid);
    return { id, created: true };
  }
  db.prepare(`UPDATE SupplierDocumentRule SET senderPattern=?,debitAccount=?,taxCode=?,evidenceType=?,paymentMethod=?,paidBy=?,deductionPercent=?,notes=?,updatedAt=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=?`)
    .run(v.senderPattern, v.debitAccount, v.taxCode, v.evidenceType, v.paymentMethod, v.paidBy, v.deductionPercent, v.notes, existing.id);
  return { id: existing.id, created: false };
}
