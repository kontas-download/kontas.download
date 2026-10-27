import type Database from 'better-sqlite3';
import { HttpError } from './errors';
import { autoTaxCode } from './isaf';
import { codesFor, droppedText, type TaxKind } from './tax-codes';
import { loadTaxDocuments } from './tax-documents';

export interface LineCodeRow {
  kind: TaxKind; itemId: number; docId: number; document: string; date: string; docType: string | null;
  counterparty: string; vatCode: string; itemName: string; rate: number | null; net: number; vat: number;
  taxCode: string | null; autoCode: string | null; note: string;
  // Codes dropped by an edit of the document (text), until the accountant assigns or confirms them.
  review: string | null;
}

// Lines of the period that have no automatic code (domestic taxed rate, Lithuanian counterparty) or already have an explicit code.
export function listLineCodes(db: Database.Database, companyId: number, start: string, end: string): LineCodeRow[] {
  const { sales, purchases } = loadTaxDocuments(db, companyId, start, end);
  const rows: LineCodeRow[] = [];
  for (const [kind, docs] of [['SALE', sales], ['PURCHASE', purchases]] as const) for (const doc of docs) for (const line of doc.lines) {
    const autoCode = autoTaxCode(doc, line);
    if (!line.taxCode && autoCode && !doc.codesDropped) continue;
    const net = Math.round(line.net * 100);
    rows.push({ kind, itemId: line.id as number, docId: doc.id, document: doc.number, date: doc.date.slice(0, 10), docType: doc.docType ?? null, counterparty: doc.name, vatCode: doc.vatCode, itemName: line.name ?? '', rate: line.rate, net: net / 100, vat: (Math.round(line.gross * 100) - net) / 100, taxCode: line.taxCode ?? null, autoCode, note: line.note ?? '', review: doc.codesDropped ? droppedText(doc.codesDropped) : null });
  }
  return rows;
}

export interface LineCodeChange { kind: TaxKind; itemId: number; taxCode: string | null; note: string }
export interface DocumentRef { kind: TaxKind; docId: number }

// Validates a PUT body: { items: [{ kind, itemId, taxCode (null or '' clears), note? }], confirm?: [{ kind, docId }] }.
// `confirm` accepts the codes of documents whose codes were dropped by an edit, without changing a line.
export function parseLineCodeRequest(body: unknown): { changes: LineCodeChange[]; confirm: DocumentRef[] } {
  const raw = body as { items?: unknown; confirm?: unknown } | null;
  const items = raw?.items ?? [];
  const confirmRaw = raw?.confirm ?? [];
  if (!Array.isArray(items) || !Array.isArray(confirmRaw) || !(items.length + confirmRaw.length) || items.length > 2000 || confirmRaw.length > 2000) throw new HttpError(400, 'Tikimasi netuščio eilučių sąrašo (ne daugiau kaip 2000)');
  const changes = items.map((value, index): LineCodeChange => {
    const item = value as Record<string, unknown> | null;
    const kind = item?.kind;
    if (kind !== 'SALE' && kind !== 'PURCHASE') throw new HttpError(400, `Eilutė ${index + 1}: rūšis turi būti SALE arba PURCHASE`);
    const itemId = item?.itemId;
    if (!Number.isSafeInteger(itemId) || (itemId as number) <= 0) throw new HttpError(400, `Eilutė ${index + 1}: neteisingas eilutės identifikatorius`);
    const code = item?.taxCode;
    if (code !== null && code !== undefined && code !== '' && (typeof code !== 'string' || !codesFor(kind).includes(code))) throw new HttpError(400, `Eilutė ${index + 1}: kodas ${String(code)} netaikomas ${kind === 'SALE' ? 'pardavimams' : 'pirkimams'}`);
    const note = item?.note ?? '';
    if (typeof note !== 'string' || note.length > 500) throw new HttpError(400, `Eilutė ${index + 1}: pastaba — tekstas iki 500 simbolių`);
    return { kind: kind as TaxKind, itemId: itemId as number, taxCode: code ? code as string : null, note: note.trim() };
  });
  const confirm = confirmRaw.map((value, index) => {
    const ref = value as Record<string, unknown> | null;
    if ((ref?.kind !== 'SALE' && ref?.kind !== 'PURCHASE') || !Number.isSafeInteger(ref?.docId) || (ref.docId as number) <= 0) throw new HttpError(400, `Patvirtinimas ${index + 1}: neteisingas dokumentas`);
    return { kind: ref.kind as TaxKind, docId: ref.docId as number };
  });
  return { changes, confirm };
}

const DOC = { SALE: { table: 'Sale', items: 'SaleItem', fk: 'saleId' }, PURCHASE: { table: 'Purchase', items: 'PurchaseItem', fk: 'purchaseId' } } as const;
const reviewEntity = (kind: TaxKind) => (kind === 'SALE' ? 'SaleTaxCodeReview' : 'PurchaseTaxCodeReview');

// True when at least as many lines received a code AFTER the mark was set as codes were dropped by the edit
// (codes restored by the edit itself carry the time of the mark and do not count).
function reviewResolved(db: Database.Database, companyId: number, kind: TaxKind, docId: number, markedAt: number, droppedCount: number) {
  const items = DOC[kind];
  const row = db.prepare(`SELECT COUNT(*) AS n FROM TaxLineCode t WHERE t.kind=? AND t.companyId=? AND t.updatedAt>? AND t.itemId IN (SELECT id FROM ${items.items} WHERE ${items.fk}=?)`).get(kind, companyId, markedAt, docId) as { n: number };
  return row.n >= droppedCount;
}

// Removes the review mark of a document (codes assigned again or confirmed) and records it in the history.
function clearReview(db: Database.Database, companyId: number, kind: TaxKind, docId: number, actorId: number | null, onlyIfResolved = false) {
  const row = db.prepare('SELECT dropped, createdAt FROM TaxCodeReview WHERE kind=? AND docId=? AND companyId=?').get(kind, docId, companyId) as { dropped: string; createdAt: number } | undefined;
  if (!row) return 0;
  if (onlyIfResolved && !reviewResolved(db, companyId, kind, docId, row.createdAt, (JSON.parse(row.dropped) as unknown[]).length)) return 0;
  db.prepare('DELETE FROM TaxCodeReview WHERE kind=? AND docId=? AND companyId=?').run(kind, docId, companyId);
  db.prepare("INSERT INTO AccountingAudit(companyId,entity,recordId,action,beforeJson,afterJson,actorId) VALUES(?,?,?,'DELETE',?,NULL,?)").run(companyId, reviewEntity(kind), docId, JSON.stringify({ dropped: JSON.parse(row.dropped) }), actorId);
  return 1;
}

// Sets or clears the codes in one transaction; every line must belong to the company. Unchanged rows are not rewritten,
// so the history only records real changes. Touching a line of a document marked for review, or confirming it, clears the mark.
// Returns the number of changed lines plus confirmed documents.
export function setLineCodes(db: Database.Database, companyId: number, changes: LineCodeChange[], actorId: number | null, confirm: DocumentRef[] = []): number {
  const owner = {
    SALE: db.prepare('SELECT i.saleId AS docId FROM SaleItem i JOIN Sale s ON s.id=i.saleId WHERE i.id=? AND s.companyId=?'),
    PURCHASE: db.prepare('SELECT i.purchaseId AS docId FROM PurchaseItem i JOIN Purchase p ON p.id=i.purchaseId WHERE i.id=? AND p.companyId=?'),
  };
  const upsert = db.prepare(`INSERT INTO TaxLineCode(companyId,kind,itemId,taxCode,note,updatedAt) VALUES(?,?,?,?,?,?)
    ON CONFLICT(kind,itemId) DO UPDATE SET taxCode=excluded.taxCode,note=excluded.note,updatedAt=excluded.updatedAt WHERE TaxLineCode.taxCode IS NOT excluded.taxCode OR TaxLineCode.note IS NOT excluded.note`);
  const clear = db.prepare('DELETE FROM TaxLineCode WHERE kind=? AND itemId=? AND companyId=?');
  return db.transaction(() => {
    const auditStart = (db.prepare('SELECT COALESCE(MAX(id),0) AS id FROM AccountingAudit').get() as { id: number }).id;
    let changed = 0;
    const now = Date.now();
    const docs = new Map<string, DocumentRef>();
    const confirmed = new Map<string, DocumentRef>();
    for (const c of changes) {
      const own = owner[c.kind].get(c.itemId, companyId) as { docId: number } | undefined;
      if (!own) throw new HttpError(404, `Eilutė ${c.itemId} nerasta aktyvios įmonės dokumentuose`);
      docs.set(c.kind + own.docId, { kind: c.kind, docId: own.docId });
      changed += c.taxCode ? upsert.run(companyId, c.kind, c.itemId, c.taxCode, c.note, now).changes : clear.run(c.kind, c.itemId, companyId).changes;
    }
    for (const ref of confirm) {
      if (!db.prepare(`SELECT 1 FROM ${DOC[ref.kind].table} WHERE id=? AND companyId=?`).get(ref.docId, companyId)) throw new HttpError(404, `Dokumentas ${ref.docId} nerastas aktyvioje įmonėje`);
      confirmed.set(ref.kind + ref.docId, ref);
    }
    // Assigning codes clears the mark only when every dropped code is covered again; an explicit confirmation always clears it.
    for (const [key, ref] of docs) if (!confirmed.has(key)) changed += clearReview(db, companyId, ref.kind, ref.docId, actorId, true);
    for (const ref of confirmed.values()) changed += clearReview(db, companyId, ref.kind, ref.docId, actorId);
    if (actorId != null) db.prepare("UPDATE AccountingAudit SET actorId=? WHERE id>? AND companyId=? AND entity IN ('SaleTaxCode','PurchaseTaxCode')").run(actorId, auditStart, companyId);
    return changed;
  }).immediate();
}

// Codes of a document's lines before its lines are replaced by an edit (in line order).
export interface LineSnapshot { itemName: string; rate: number | null; net: number; gross: number; taxCode: string | null; note: string }
const lineRows = (db: Database.Database, kind: TaxKind, docId: number) => db.prepare(`SELECT i.id, i.itemName, i.vatRate AS rate, i.sumWithoutVat AS net, i.sumWithVat AS gross, t.taxCode, t.note FROM ${DOC[kind].items} i LEFT JOIN TaxLineCode t ON t.kind=? AND t.itemId=i.id WHERE i.${DOC[kind].fk}=? ORDER BY i.id`).all(kind, docId) as { id: number; itemName: string; rate: number | null; net: number; gross: number; taxCode: string | null; note: string | null }[];
const signature = (l: { itemName: string; rate: number | null; net: number; gross: number }) => [String(l.itemName ?? '').trim(), l.rate ?? '', Math.round(l.net * 100), Math.round(l.gross * 100)].join('|');

export function snapshotLineCodes(db: Database.Database, kind: TaxKind, docId: number): LineSnapshot[] {
  return lineRows(db, kind, docId).map(r => ({ itemName: r.itemName, rate: r.rate, net: r.net, gross: r.gross, taxCode: r.taxCode, note: r.note ?? '' }));
}

// After an edit replaced the lines: a code goes back to the new line at the same position with the same name, rate and amounts,
// otherwise to any unused new line with the same name, rate and amounts. A code that fits no line is not lost silently: it is
// returned (shown to the user), recorded in the history and the document is marked for review, so the i.SAF export and the
// FR0600 draft refuse the document until the accountant assigns the codes again or confirms it.
export function restoreLineCodes(db: Database.Database, companyId: number, kind: TaxKind, docId: number, before: LineSnapshot[]): { itemName: string; taxCode: string }[] {
  if (!before.some(l => l.taxCode)) return [];
  const after = lineRows(db, kind, docId);
  const taken = new Set<number>();
  const insert = db.prepare('INSERT INTO TaxLineCode(companyId,kind,itemId,taxCode,note,updatedAt) VALUES(?,?,?,?,?,?)');
  const now = Date.now();
  const pending: LineSnapshot[] = [];
  before.forEach((old, index) => {
    if (!old.taxCode) return;
    const same = after[index];
    if (same && !taken.has(same.id) && signature(same) === signature(old)) { taken.add(same.id); insert.run(companyId, kind, same.id, old.taxCode, old.note, now); }
    else pending.push(old);
  });
  const dropped: { itemName: string; taxCode: string }[] = [];
  for (const old of pending) {
    const match = after.find(l => !taken.has(l.id) && signature(l) === signature(old));
    if (match) { taken.add(match.id); insert.run(companyId, kind, match.id, old.taxCode, old.note, now); }
    else dropped.push({ itemName: old.itemName, taxCode: old.taxCode as string });
  }
  if (dropped.length) {
    const existing = db.prepare('SELECT dropped FROM TaxCodeReview WHERE kind=? AND docId=?').get(kind, docId) as { dropped: string } | undefined;
    const all = [...(existing ? JSON.parse(existing.dropped) as typeof dropped : []), ...dropped];
    db.prepare('INSERT INTO TaxCodeReview(companyId,kind,docId,dropped,createdAt) VALUES(?,?,?,?,?) ON CONFLICT(kind,docId) DO UPDATE SET dropped=excluded.dropped,createdAt=excluded.createdAt').run(companyId, kind, docId, JSON.stringify(all), now);
    db.prepare("INSERT INTO AccountingAudit(companyId,entity,recordId,action,beforeJson,afterJson) VALUES(?,?,?,'INSERT',NULL,?)").run(companyId, reviewEntity(kind), docId, JSON.stringify({ dropped }));
  }
  return dropped;
}

// A credit note inherits the codes of its original: for each credit line the original lines with the same VAT rate (and the same
// name, when there are such) are taken; when they share one code, the credit line gets it. Lines whose code cannot be told
// (different codes, mixed coded and automatic lines) are returned so the user is told to assign them. Already coded lines are
// left as they are, so calling it again only reports what is still missing.
export function inheritCreditCodes(db: Database.Database, companyId: number, kind: TaxKind, originalId: number, creditId: number): string[] {
  const original = lineRows(db, kind, originalId);
  if (!original.some(l => l.taxCode)) return [];
  const insert = db.prepare('INSERT INTO TaxLineCode(companyId,kind,itemId,taxCode,note,updatedAt) VALUES(?,?,?,?,?,?)');
  const missing: string[] = [];
  for (const line of lineRows(db, kind, creditId)) {
    if (line.taxCode) continue;
    const sameRate = original.filter(o => (o.rate ?? 0) === (line.rate ?? 0));
    const byName = sameRate.filter(o => o.itemName.trim() === line.itemName.trim());
    const pool = byName.length ? byName : sameRate;
    const codes = new Set(pool.map(o => o.taxCode ?? ''));
    if (pool.length && codes.size === 1) { const code = [...codes][0]; if (code) insert.run(companyId, kind, line.id, code, 'KS', Date.now()); }
    else missing.push(line.itemName);
  }
  return missing;
}
