import type Database from 'better-sqlite3';
import { parseCsv, uncsvCell } from './csv';
import { parseAmount } from './bank-import';

// Section exports of one company (CSV for spreadsheets, JSON for machines). Sales and purchases carry their lines in JSON.
export const SECTIONS: Record<string, { sql: string; columns: string[] }> = {
  clients: { sql: 'SELECT id,name,code,vatCode,isVatPayer,email,phone,address,city,countryName FROM Client WHERE companyId=? ORDER BY name,id', columns: ['id', 'name', 'code', 'vatCode', 'isVatPayer', 'email', 'phone', 'address', 'city', 'countryName'] },
  stock: { sql: 'SELECT id,name,code,barcode,warehouseName,stock,remainder,price,cost,purchaseDate,clientName FROM StockItem WHERE companyId=? ORDER BY name,id', columns: ['id', 'name', 'code', 'barcode', 'warehouseName', 'stock', 'remainder', 'price', 'cost', 'purchaseDate', 'clientName'] },
  sales: { sql: "SELECT id,COALESCE(docType,'SF') AS docType,series,number,saleDate,payUntil,statusName,clientName,clientCode,clientVatCode,sumWithoutVat,vat,sumWithVat,currencyCode,sellerVatMode,originalSaleId,correctionReason,notes FROM Sale WHERE companyId=? ORDER BY saleDate,id", columns: ['id', 'docType', 'series', 'number', 'saleDate', 'payUntil', 'statusName', 'clientName', 'clientCode', 'clientVatCode', 'sumWithoutVat', 'vat', 'sumWithVat', 'currencyCode', 'sellerVatMode', 'originalSaleId', 'correctionReason', 'notes'] },
  purchases: { sql: "SELECT id,COALESCE(docType,'SF') AS docType,series,number,purchaseDate,clientName,clientCode,sumWithoutVat,vat,sumWithVat,deductibleVat,deductionPercent,buyerVatMode,debitAccount,warehouseName,currencyCode,originalPurchaseId,correctionReason,notes FROM Purchase WHERE companyId=? ORDER BY purchaseDate,id", columns: ['id', 'docType', 'series', 'number', 'purchaseDate', 'clientName', 'clientCode', 'sumWithoutVat', 'vat', 'sumWithVat', 'deductibleVat', 'deductionPercent', 'buyerVatMode', 'debitAccount', 'warehouseName', 'currencyCode', 'originalPurchaseId', 'correctionReason', 'notes'] },
  journal: { sql: 'SELECT id,date,docNumber,debitAccount,creditAccount,amount,clientName,description,sourceType,sourceId FROM GeneralEntry WHERE companyId=? ORDER BY date,id', columns: ['id', 'date', 'docNumber', 'debitAccount', 'creditAccount', 'amount', 'clientName', 'description', 'sourceType', 'sourceId'] },
  bank: { sql: 'SELECT id,date,number,clientName,clientCode,sum,correspondenceAccountCode,accountingBankInternalName,notes FROM BankTransaction WHERE companyId=? ORDER BY date,id', columns: ['id', 'date', 'number', 'clientName', 'clientCode', 'sum', 'correspondenceAccountCode', 'accountingBankInternalName', 'notes'] },
};

export function sectionRows(db: Database.Database, section: string, companyId: number, withLines: boolean) {
  const rows = db.prepare(SECTIONS[section].sql).all(companyId) as Record<string, unknown>[];
  if (withLines && (section === 'sales' || section === 'purchases')) {
    const lines = db.prepare(section === 'sales' ? 'SELECT id,itemName,itemCode,quantity,price,vatRate,sumWithoutVat,sumWithVat FROM SaleItem WHERE saleId=? ORDER BY id' : 'SELECT id,itemName,itemCode,quantity,price,vatRate,sumWithoutVat,sumWithVat FROM PurchaseItem WHERE purchaseId=? ORDER BY id');
    for (const row of rows) row.items = lines.all(row.id);
  }
  return rows;
}

// CSV import of clients or stock items. Existing rows are never changed: a row whose key already exists in the company
// (or earlier in the same file) is skipped and reported. Any invalid row rejects the whole file.
export const MAX_CSV_BYTES = 5 * 1024 * 1024;
const FIELDS: Record<'clients' | 'stock', Record<string, 'text' | 'number' | 'flag' | 'date'>> = {
  clients: { name: 'text', code: 'text', vatCode: 'text', isVatPayer: 'flag', email: 'text', phone: 'text', address: 'text', city: 'text', countryName: 'text' },
  stock: { name: 'text', code: 'text', barcode: 'text', warehouseName: 'text', stock: 'number', remainder: 'number', price: 'number', cost: 'number', purchaseDate: 'date', clientName: 'text' },
};
export interface CsvImportResult { ok: boolean; committed: boolean; total: number; toInsert: number; inserted: number; skipped: { line: number; key: string; reason: 'exists' | 'repeated' }[]; errors: { line: number; message: string }[] }

const fold = (s: string) => s.trim().toLowerCase();
const keysFor = (kind: 'clients' | 'stock', r: Record<string, unknown>) => {
  const k: string[] = [];
  const v = (f: string) => fold(String(r[f] ?? ''));
  if (kind === 'clients') { if (v('code')) k.push('code:' + v('code')); if (v('vatCode')) k.push('vat:' + v('vatCode').replace(/\s/g, '')); if (!k.length) k.push('name:' + v('name')); }
  else { if (v('code')) k.push('code:' + v('code')); if (v('barcode')) k.push('barcode:' + v('barcode')); if (!k.length) k.push('name:' + v('name') + '@' + fold(String(r.warehouseName || 'Pagrindinis'))); }
  return k;
};

export function importSectionCsv(db: Database.Database, kind: 'clients' | 'stock', companyId: number, text: string, commit: boolean): CsvImportResult {
  const result: CsvImportResult = { ok: false, committed: false, total: 0, toInsert: 0, inserted: 0, skipped: [], errors: [] };
  const table = parseCsv(text);
  if (table.length < 2) { result.errors.push({ line: 1, message: 'Failas tuščias arba jame nėra duomenų eilučių' }); return result; }
  if (table.length > 20001) { result.errors.push({ line: 1, message: 'Per daug eilučių: daugiausia 20000' }); return result; }
  const fields = FIELDS[kind];
  const header = table[0].map(h => Object.keys(fields).find(f => f.toLowerCase() === fold(uncsvCell(h))) || null);
  if (!header.includes('name')) { result.errors.push({ line: 1, message: 'Nėra privalomo stulpelio name' }); return result; }
  const existing = new Set<string>();
  const current = db.prepare(kind === 'clients' ? 'SELECT name,code,vatCode FROM Client WHERE companyId=?' : 'SELECT name,code,barcode,warehouseName FROM StockItem WHERE companyId=?').all(companyId) as Record<string, unknown>[];
  for (const r of current) for (const k of keysFor(kind, r)) existing.add(k);
  const seen = new Set<string>();
  const rows: Record<string, unknown>[] = [];
  table.slice(1).forEach((cells, i) => {
    const line = i + 2;
    const row: Record<string, unknown> = {};
    header.forEach((field, c) => {
      if (!field) return;
      const raw = uncsvCell((cells[c] ?? '').trim());
      const type = fields[field];
      if (raw === '') { row[field] = null; return; }
      if (raw.length > 1000) { result.errors.push({ line, message: `${field}: per ilga reikšmė` }); return; }
      if (type === 'number') {
        const n = /^-?\d+(\.\d+)?$/.test(raw) ? Number(raw) : /^[-+]?[\d\s.,]+$/.test(raw) ? parseAmount(raw) : null;
        if (n === null || !Number.isFinite(n)) result.errors.push({ line, message: `${field}: neteisingas skaičius` }); else row[field] = n;
      }
      else if (type === 'flag') { const f = fold(raw); if (['1', 'true', 'taip', 'yes', 'да'].includes(f)) row[field] = 1; else if (['0', 'false', 'ne', 'no', 'нет'].includes(f)) row[field] = 0; else result.errors.push({ line, message: `${field}: tikimasi 1 arba 0` }); }
      else if (type === 'date') { if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) result.errors.push({ line, message: `${field}: data formatu MMMM-MM-DD` }); else row[field] = raw; }
      else row[field] = raw;
    });
    if (!row.name) { result.errors.push({ line, message: 'name: privalomas laukas' }); return; }
    result.total++;
    const keys = keysFor(kind, row);
    if (keys.some(k => existing.has(k))) { result.skipped.push({ line, key: keys.join(', '), reason: 'exists' }); return; }
    if (keys.some(k => seen.has(k))) { result.skipped.push({ line, key: keys.join(', '), reason: 'repeated' }); return; }
    keys.forEach(k => seen.add(k));
    rows.push(row);
  });
  result.toInsert = rows.length;
  if (result.errors.length) return result;
  result.ok = true;
  if (!commit) return result;
  db.transaction(() => {
    const insert = kind === 'clients'
      ? db.prepare("INSERT INTO Client(companyId,name,code,vatCode,isVatPayer,email,phone,address,city,countryName,createdAt,updatedAt) VALUES(?,?,?,?,?,?,?,?,?,?,datetime('now'),datetime('now'))")
      : db.prepare('INSERT INTO StockItem(companyId,name,code,barcode,warehouseName,stock,remainder,price,cost,purchaseDate,clientName) VALUES(?,?,?,?,?,?,?,?,?,?,?)');
    for (const r of rows) {
      if (kind === 'clients') insert.run(companyId, r.name, r.code ?? null, r.vatCode ?? null, r.isVatPayer ?? (r.vatCode ? 1 : 0), r.email ?? null, r.phone ?? null, r.address ?? null, r.city ?? null, r.countryName ?? 'Lietuva');
      else insert.run(companyId, r.name, r.code ?? null, r.barcode ?? null, r.warehouseName ?? 'Pagrindinis', r.stock ?? r.remainder ?? 0, r.remainder ?? r.stock ?? 0, r.price ?? 0, r.cost ?? 0, r.purchaseDate ?? null, r.clientName ?? null);
      result.inserted++;
    }
  }).immediate();
  result.committed = true;
  return result;
}
