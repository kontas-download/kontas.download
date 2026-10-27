import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type Database from 'better-sqlite3';
import { codesFor } from './tax-codes';

// Company export package: one JSON file with everything that belongs to one company, so it can be restored as a NEW company.
// Deliberately excluded: SMTP settings (CompanyMailSettings, encrypted passwords), users, sessions, login attempts,
// the PDF invoice archive and supplier XML originals (evidence stays in the source database and its backups).
export const PACKAGE_FORMAT = 'kontas-company';
export const PACKAGE_VERSION = 1;
export const MAX_PACKAGE_BYTES = 50 * 1024 * 1024;
const MAX_ROWS = 500_000;
const MAX_TEXT = 1_000_000;

type Kind = 'i' | 'n' | 's';
type Spec = { columns: Record<string, Kind> };
const t = (cols: string): Record<string, Kind> => Object.fromEntries(cols.split(',').map(c => { const [name, kind] = c.split(':'); return [name, (kind || 's') as Kind]; }));

export const COMPANY_COLUMNS = t('id:i,name,code,vatCode,address,email,phone,bankName,bankIban,bankSwift,currencyCode,isVatPayer:i,taxMode,createdAt,updatedAt');
// Table name in the package -> database table, column kinds, and whether the rows are filtered by companyId directly.
export const TABLES: Record<string, Spec & { table: string; where: string; order: string }> = {
  taxPeriods: { table: 'CompanyTaxPeriod', where: 'companyId=?', order: 'effectiveFrom', columns: t('effectiveFrom,mode') },
  obligations: { table: 'CompanyObligation', where: 'companyId=?', order: 'code', columns: t('code,enabled:i,period') },
  obligationsDone: { table: 'ObligationDone', where: 'companyId=?', order: 'code,periodEnd', columns: t('code,periodEnd,doneAt:i,note') },
  chartOfAccounts: { table: 'ChartOfAccount', where: '1=1', order: 'code', columns: t('code,name') },
  clients: { table: 'Client', where: 'companyId=?', order: 'id', columns: t('id:i,externalId:i,name,code,vatCode,email,phone,address,city,countryName,createdAt,updatedAt,isVatPayer:i,documentLang') },
  stockItems: { table: 'StockItem', where: 'companyId=?', order: 'id', columns: t('id:i,externalId:i,name,code,barcode,warehouseName,stock:n,remainder:n,price:n,cost:n,purchaseDate,clientName') },
  sales: { table: 'Sale', where: 'companyId=?', order: 'id', columns: t('id:i,externalId:i,series,number,saleDate,payUntil,statusName,warehouseName,clientId:i,clientName,clientCode,clientVatCode,sumWithoutVat:n,vat:n,sumWithVat:n,currencyCode,operationTypeName,notes,createdAt,sellerIsVatPayer:i,sellerVatMode,docType,originalSaleId:i,correctionReason') },
  saleItems: { table: 'SaleItem', where: 'saleId IN (SELECT id FROM Sale WHERE companyId=?)', order: 'id', columns: t('id:i,saleId:i,itemName,itemCode,quantity:n,price:n,priceWithVat:n,vatRate:n,sumWithoutVat:n,sumWithVat:n,warehouseName') },
  purchases: { table: 'Purchase', where: 'companyId=?', order: 'id', columns: t('id:i,externalId:i,series,number,purchaseDate,clientId:i,clientName,clientCode,sumWithoutVat:n,vat:n,sumWithVat:n,currencyCode,notes,createdAt,buyerVatMode,deductionPercent:n,deductibleVat:n,debitAccount,docType,originalPurchaseId:i,correctionReason') },
  purchaseItems: { table: 'PurchaseItem', where: 'purchaseId IN (SELECT id FROM Purchase WHERE companyId=?)', order: 'id', columns: t('id:i,purchaseId:i,itemName,itemCode,quantity:n,price:n,sumWithoutVat:n,sumWithVat:n,vatRate:n') },
  bankTransactions: { table: 'BankTransaction', where: 'companyId=?', order: 'id', columns: t('id:i,externalId:i,date,number,clientName,clientCode,sum:n,correspondenceAccountCode,accountingBankInternalName,notes,importHash,importBatch') },
  paymentAllocations: { table: 'PaymentAllocation', where: 'companyId=?', order: 'id', columns: t('id:i,bankTransactionId:i,saleId:i,purchaseId:i,amount:n,createdAt:i') },
  manualSettlements: { table: 'ManualSettlement', where: 'companyId=?', order: 'id', columns: t('id:i,saleId:i,purchaseId:i,amount:n,date,method,note,createdAt:i') },
  payrolls: { table: 'Payroll', where: 'companyId=?', order: 'id', columns: t('id:i,externalId:i,year:i,month:i,sumWithVat:n,createdAt') },
  payrollEmployees: { table: 'PayrollEmployee', where: 'payrollId IN (SELECT id FROM Payroll WHERE companyId=?)', order: 'id', columns: t('id:i,payrollId:i,employeeName,employeeCode,grossSalary:n,netSalary:n,gpm:n,sodraEmployee:n,sodraEmployer:n') },
  generalEntries: { table: 'GeneralEntry', where: 'companyId=?', order: 'id', columns: t('id:i,date,docNumber,debitAccount,creditAccount,amount:n,clientId:i,clientName,description,sourceType,sourceId:i,createdAt,updatedAt') },
  recurringInvoices: { table: 'RecurringInvoice', where: 'companyId=?', order: 'id', columns: t('id:i,name,clientId:i,series,frequency,nextDate,anchorDay:i,endDate,payDays:i,notes,itemsJson,active:i,createdAt:i') },
  recurringRuns: { table: 'RecurringRun', where: 'recurringId IN (SELECT id FROM RecurringInvoice WHERE companyId=?)', order: 'recurringId,periodDate', columns: t('recurringId:i,periodDate,saleId:i,createdAt:i') },
  // Delivery and reminder logs keep the recipient address and status only; no credentials exist in these tables.
  invoiceDeliveries: { table: 'InvoiceDelivery', where: 'companyId=?', order: 'createdAt,requestId', columns: t('saleId:i,requestId,recipient,status,messageId,createdAt:i') },
  reminderLogs: { table: 'ReminderLog', where: 'companyId=?', order: 'createdAt,requestId', columns: t('saleId:i,requestId,recipient,status,messageId,balance:n,createdAt:i') },
  // i.SAF tax codes assigned to lines (itemId is a SaleItem id for SALE, a PurchaseItem id for PURCHASE).
  taxLineCodes: { table: 'TaxLineCode', where: 'companyId=?', order: 'kind,itemId', columns: t('kind,itemId:i,taxCode,note,updatedAt:i') },
  // Documents whose codes were dropped by an edit and still wait for the accountant's review.
  taxCodeReviews: { table: 'TaxCodeReview', where: 'companyId=?', order: 'kind,docId', columns: t('kind,docId:i,dropped,createdAt:i') },
  auditHistory: { table: 'AccountingAudit', where: 'companyId=?', order: 'id', columns: t('id:i,entity,recordId:i,action,beforeJson,afterJson,actorId:i,createdAt') },
};

type Row = Record<string, unknown>;
export interface PackageData { company: Row; accountingLock: { lockedThrough: string | null; reason: string } | null; [table: string]: unknown }
export interface CompanyPackage { format: string; version: number; exportedAt: string; appVersion: string; checksum: string; data: PackageData }

// Keys sorted at every level; arrays keep their order. The checksum is the SHA-256 of this text.
export function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return '[' + value.map(canonicalJson).join(',') + ']';
  if (value && typeof value === 'object') return '{' + Object.keys(value).sort().map(k => JSON.stringify(k) + ':' + canonicalJson((value as Row)[k])).join(',') + '}';
  return JSON.stringify(value === undefined ? null : value);
}
export const packageChecksum = (data: unknown) => crypto.createHash('sha256').update(canonicalJson(data)).digest('hex');

export function appVersion(): string {
  try { return String(JSON.parse(fs.readFileSync(path.join(process.cwd(), 'package.json'), 'utf8')).version || 'unknown'); } catch { return 'unknown'; }
}

export function exportCompany(db: Database.Database, companyId: number): CompanyPackage {
  const read = () => {
    const company = db.prepare(`SELECT ${Object.keys(COMPANY_COLUMNS).join(',')} FROM Company WHERE id=?`).get(companyId) as Row | undefined;
    if (!company) throw new Error('COMPANY_NOT_FOUND');
    const data: PackageData = { company, accountingLock: (db.prepare('SELECT lockedThrough,reason FROM AccountingLock WHERE companyId=?').get(companyId) as PackageData['accountingLock']) || null };
    for (const [key, spec] of Object.entries(TABLES)) {
      const sql = `SELECT ${Object.keys(spec.columns).map(c => '"' + c + '"').join(',')} FROM ${spec.table} WHERE ${spec.where} ORDER BY ${spec.order}`;
      data[key] = spec.where.includes('?') ? db.prepare(sql).all(companyId) : db.prepare(sql).all();
    }
    return data;
  };
  // A read transaction gives one consistent snapshot even while others write.
  const data = db.transaction(read).deferred();
  return { format: PACKAGE_FORMAT, version: PACKAGE_VERSION, exportedAt: new Date().toISOString(), appVersion: appVersion(), checksum: packageChecksum(data), data };
}

export interface Problem { code: string; message: string; params?: Record<string, string | number> }
export interface ImportOptions { commit: boolean; name?: string; allowDuplicateCode?: boolean; actorId?: number | null }
export interface ImportResult { ok: boolean; committed: boolean; companyId: number | null; companyName: string; counts: Record<string, number>; problems: Problem[]; warnings: Problem[]; accountsAdded: number }

const problem = (code: string, message: string, params?: Problem['params']): Problem => ({ code, message, params });
class Rollback extends Error {}

function checkRows(key: string, rows: unknown, columns: Record<string, Kind>, problems: Problem[]): Row[] {
  if (!Array.isArray(rows)) { problems.push(problem('badTable', `Skyrius ${key} turi būti masyvas`, { table: key })); return []; }
  if (rows.length > MAX_ROWS) { problems.push(problem('tooManyRows', `Skyrius ${key}: per daug eilučių`, { table: key })); return []; }
  rows.forEach((row, index) => {
    if (problems.length > 50) return;
    if (!row || typeof row !== 'object' || Array.isArray(row)) { problems.push(problem('badRow', `${key}[${index}]: tikimasi objekto`, { table: key, index })); return; }
    for (const [field, value] of Object.entries(row as Row)) {
      const kind = Object.hasOwn(columns, field) ? columns[field] : undefined;
      if (!kind) { problems.push(problem('unknownField', `${key}[${index}]: nežinomas laukas ${field}`, { table: key, index, field })); continue; }
      if (value === null) continue;
      const fits = kind === 's' ? typeof value === 'string' && value.length <= MAX_TEXT : kind === 'i' ? Number.isSafeInteger(value) : typeof value === 'number' && Number.isFinite(value);
      if (!fits) problems.push(problem('badValue', `${key}[${index}].${field}: neteisinga reikšmė`, { table: key, index, field }));
    }
  });
  return rows as Row[];
}

// Validates the package and imports it as a NEW company inside one transaction. Without commit the transaction is rolled back,
// so the preview runs every database rule (triggers, constraints) exactly as the real import would.
export function importCompanyPackage(db: Database.Database, input: unknown, options: ImportOptions): ImportResult {
  const problems: Problem[] = [], warnings: Problem[] = [];
  const result = (extra: Partial<ImportResult> = {}): ImportResult => ({ ok: problems.length === 0, committed: false, companyId: null, companyName: '', counts: {}, problems, warnings, accountsAdded: 0, ...extra });
  const pkg = input as Partial<CompanyPackage> | null;
  if (!pkg || typeof pkg !== 'object' || Array.isArray(pkg) || pkg.format !== PACKAGE_FORMAT) { problems.push(problem('badFormat', 'Tai nėra kontas.download įmonės paketas')); return result(); }
  if (pkg.version !== PACKAGE_VERSION) { problems.push(problem('badVersion', `Nepalaikoma paketo versija: ${String(pkg.version)}`, { version: String(pkg.version) })); return result(); }
  const data = pkg.data as PackageData | undefined;
  if (!data || typeof data !== 'object' || Array.isArray(data)) { problems.push(problem('badFormat', 'Pakete nėra duomenų')); return result(); }
  if (typeof pkg.checksum !== 'string' || pkg.checksum !== packageChecksum(data)) { problems.push(problem('badChecksum', 'Kontrolinė suma nesutampa: failas pažeistas (kontrolinė suma saugo nuo failo gedimo, o ne nuo tyčinio klastojimo)')); return result(); }

  for (const key of Object.keys(data)) if (key !== 'company' && key !== 'accountingLock' && !Object.hasOwn(TABLES, key)) problems.push(problem('unknownTable', `Nežinomas skyrius ${key}`, { table: key }));
  const company = data.company;
  if (!company || typeof company !== 'object' || Array.isArray(company)) problems.push(problem('badFormat', 'Pakete nėra įmonės'));
  else checkRows('company', [company], COMPANY_COLUMNS, problems);
  const lock = data.accountingLock;
  if (lock !== null && lock !== undefined && (typeof lock !== 'object' || (lock.lockedThrough !== null && typeof lock.lockedThrough !== 'string') || typeof lock.reason !== 'string')) problems.push(problem('badValue', 'accountingLock: neteisinga reikšmė', { table: 'accountingLock', index: 0, field: 'lockedThrough' }));
  if (lock && typeof lock === 'object' && typeof lock.lockedThrough === 'string' && !/^\d{4}-\d{2}-\d{2}$/.test(lock.lockedThrough)) problems.push(problem('badValue', 'accountingLock: neteisinga data', { table: 'accountingLock', index: 0, field: 'lockedThrough' }));
  const rows: Record<string, Row[]> = {};
  for (const [key, spec] of Object.entries(TABLES)) rows[key] = checkRows(key, data[key] ?? [], spec.columns, problems);
  if (problems.length) return result();

  const newName = (options.name?.trim() || String(company.name || '').trim()).slice(0, 200);
  if (!newName) problems.push(problem('nameRequired', 'Nurodykite naujos įmonės pavadinimą'));
  else if (db.prepare('SELECT 1 FROM Company WHERE LOWER(TRIM(name))=LOWER(?)').get(newName)) problems.push(problem('nameTaken', `Įmonė „${newName}“ jau egzistuoja: nurodykite kitą pavadinimą`, { name: newName }));
  const code = typeof company.code === 'string' ? company.code.trim() : '', vatCode = typeof company.vatCode === 'string' ? company.vatCode.trim() : '';
  const twin = (code || vatCode) && db.prepare("SELECT name FROM Company WHERE (?<>'' AND TRIM(COALESCE(code,''))=?) OR (?<>'' AND UPPER(TRIM(COALESCE(vatCode,'')))=UPPER(?)) LIMIT 1").get(code, code, vatCode, vatCode) as { name: string } | undefined;
  if (twin && !options.allowDuplicateCode) problems.push(problem('codeTaken', `Įmonė su tuo pačiu kodu arba PVM kodu jau yra („${twin.name}“). Importas sukurs kopiją tik aiškiai patvirtinus`, { name: twin.name }));
  else if (twin) warnings.push(problem('codeDuplicate', `Kodas arba PVM kodas sutampa su įmone „${twin.name}“`, { name: twin.name }));

  // Referential integrity inside the package.
  const ids = (key: string) => new Set(rows[key].map(r => r.id as number));
  const unique = (key: string) => { const s = ids(key); if (s.size !== rows[key].length || s.has(undefined as unknown as number) || s.has(null as unknown as number)) problems.push(problem('duplicateId', `Skyrius ${key}: identifikatorių nėra arba jie kartojasi`, { table: key })); return s; };
  const clientIds = unique('clients'), saleIds = unique('sales'), purchaseIds = unique('purchases'), bankIds = unique('bankTransactions'), payrollIds = unique('payrolls'), recurringIds = unique('recurringInvoices');
  unique('saleItems'); unique('purchaseItems'); unique('payrollEmployees'); unique('generalEntries'); unique('paymentAllocations'); unique('manualSettlements'); unique('stockItems');
  const saleById = new Map(rows.sales.map(s => [s.id, s])), purchaseById = new Map(rows.purchases.map(p => [p.id, p]));
  const broken = (table: string, index: number, field: string) => problems.push(problem('brokenLink', `${table}[${index}].${field}: nuoroda į neegzistuojantį įrašą`, { table, index, field }));
  rows.sales.forEach((s, i) => { if (s.originalSaleId != null && (!saleById.has(s.originalSaleId) || (saleById.get(s.originalSaleId)!.docType ?? 'SF') !== 'SF' || s.docType !== 'KS')) broken('sales', i, 'originalSaleId'); });
  rows.purchases.forEach((p, i) => { if (p.originalPurchaseId != null && (!purchaseById.has(p.originalPurchaseId) || (purchaseById.get(p.originalPurchaseId)!.docType ?? 'SF') !== 'SF' || p.docType !== 'KS')) broken('purchases', i, 'originalPurchaseId'); });
  rows.saleItems.forEach((r, i) => { if (!saleIds.has(r.saleId as number)) broken('saleItems', i, 'saleId'); });
  rows.purchaseItems.forEach((r, i) => { if (!purchaseIds.has(r.purchaseId as number)) broken('purchaseItems', i, 'purchaseId'); });
  rows.payrollEmployees.forEach((r, i) => { if (!payrollIds.has(r.payrollId as number)) broken('payrollEmployees', i, 'payrollId'); });
  for (const key of ['paymentAllocations', 'manualSettlements']) rows[key].forEach((r, i) => {
    if (key === 'paymentAllocations' && !bankIds.has(r.bankTransactionId as number)) broken(key, i, 'bankTransactionId');
    if ((r.saleId == null) === (r.purchaseId == null)) broken(key, i, 'saleId');
    else if (r.saleId != null && !saleIds.has(r.saleId as number)) broken(key, i, 'saleId');
    else if (r.purchaseId != null && !purchaseIds.has(r.purchaseId as number)) broken(key, i, 'purchaseId');
  });
  const saleItemIds = new Set(rows.saleItems.map(r => r.id)), purchaseItemIds = new Set(rows.purchaseItems.map(r => r.id));
  const codeKeys = new Set<string>();
  rows.taxLineCodes.forEach((r, i) => {
    if (r.kind !== 'SALE' && r.kind !== 'PURCHASE') { problems.push(problem('badValue', `taxLineCodes[${i}].kind: tikimasi SALE arba PURCHASE`, { table: 'taxLineCodes', index: i, field: 'kind' })); return; }
    if (!(r.kind === 'SALE' ? saleItemIds : purchaseItemIds).has(r.itemId)) broken('taxLineCodes', i, 'itemId');
    if (typeof r.taxCode !== 'string' || !codesFor(r.kind).includes(r.taxCode)) problems.push(problem('badTaxCode', `taxLineCodes[${i}]: kodas ${String(r.taxCode)} netaikomas ${r.kind === 'SALE' ? 'pardavimams' : 'pirkimams'}`, { table: 'taxLineCodes', index: i, field: 'taxCode' }));
    const key = `${r.kind}|${r.itemId}`;
    if (codeKeys.has(key)) problems.push(problem('duplicateTaxCode', `taxLineCodes[${i}]: eilutė pakete jau turi kodą`, { table: 'taxLineCodes', index: i, field: 'itemId' }));
    codeKeys.add(key);
  });
  rows.taxCodeReviews.forEach((r, i) => { if ((r.kind === 'SALE' ? saleIds : r.kind === 'PURCHASE' ? purchaseIds : new Set()).has(r.docId as number) === false) broken('taxCodeReviews', i, 'docId'); });
  rows.recurringInvoices.forEach((r, i) => { if (!clientIds.has(r.clientId as number)) broken('recurringInvoices', i, 'clientId'); });
  rows.recurringRuns.forEach((r, i) => { if (!recurringIds.has(r.recurringId as number) || !saleIds.has(r.saleId as number)) broken('recurringRuns', i, 'saleId'); });
  for (const key of ['sales', 'purchases', 'generalEntries']) {
    const dangling = rows[key].filter(r => r.clientId != null && !clientIds.has(r.clientId as number)).length;
    if (dangling) warnings.push(problem('clientDropped', `${key}: ${dangling} nuorodų į paketo neįtrauktus kontrahentus bus išvalyta (dokumento rekvizitai išsaugomi)`, { table: key, count: dangling }));
  }
  if (problems.length) return result({ companyName: newName });

  const counts: Record<string, number> = Object.fromEntries(Object.entries(rows).map(([k, v]) => [k, v.length]));
  let companyId = 0, accountsAdded = 0;
  try {
    db.transaction(() => {
      const auditStart = (db.prepare('SELECT COALESCE(MAX(id),0) AS id FROM AccountingAudit').get() as { id: number }).id;
      // Older data may contain repeated document numbers (they stay visible, they were never blocked). The guard on the NEW company is
      // lifted for this import only and restored in the same transaction, so the copy matches the source and later entries are checked again.
      const guards = ['number_Sale_INSERT', 'number_Purchase_INSERT'].map(name => db.prepare("SELECT name,sql FROM sqlite_master WHERE type='trigger' AND name=?").get(name) as { name: string; sql: string } | undefined).filter((g): g is { name: string; sql: string } => Boolean(g));
      for (const guard of guards) db.exec('DROP TRIGGER ' + guard.name);
      const repeated = (list: Row[]) => list.length - new Set(list.filter(r => r.docType !== 'KS' || true).map(r => [r.series ?? '', r.number].join('|'))).size;
      const repeatedNumbers = repeated(rows.sales) + repeated(rows.purchases);
      if (repeatedNumbers > 0) warnings.push(problem('duplicateNumbers', `Pakete kartojasi dokumentų numeriai (${repeatedNumbers}): jie perkelti nepakeisti`, { count: repeatedNumbers }));
      const statements = new Map<string, Database.Statement>();
      const insert = (table: string, values: Row) => {
        const cols = Object.keys(values).sort();
        const sql = `INSERT INTO ${table}(${cols.map(c => '"' + c + '"').join(',')}) VALUES(${cols.map(() => '?').join(',')})`;
        let statement = statements.get(sql);
        if (!statement) { statement = db.prepare(sql); statements.set(sql, statement); }
        return Number(statement.run(...cols.map(c => values[c] as never)).lastInsertRowid);
      };
      const pick = (row: Row, skip: string[] = []) => Object.fromEntries(Object.entries(row).filter(([k]) => !skip.includes(k)));
      const { id: _sourceId, ...companyRow } = company; void _sourceId;
      companyId = insert('Company', { ...companyRow, name: newName, isDefault: 0 });
      for (const r of rows.taxPeriods) insert('CompanyTaxPeriod', { ...r, companyId });
      for (const r of rows.obligations) insert('CompanyObligation', { ...r, companyId });
      for (const r of rows.obligationsDone) insert('ObligationDone', { ...r, companyId });
      // The chart of accounts is shared by all companies: only codes that do not exist yet are added; names are never changed.
      const addAccount = db.prepare('INSERT OR IGNORE INTO ChartOfAccount(code,name) VALUES(?,?)');
      for (const r of rows.chartOfAccounts) accountsAdded += addAccount.run(r.code, r.name).changes;

      const map = { client: new Map<unknown, number>(), sale: new Map<unknown, number>(), purchase: new Map<unknown, number>(), bank: new Map<unknown, number>(), payroll: new Map<unknown, number>(), allocation: new Map<unknown, number>(), settlement: new Map<unknown, number>(), recurring: new Map<unknown, number>(), saleItem: new Map<unknown, number>(), purchaseItem: new Map<unknown, number>(), payrollEmployee: new Map<unknown, number>(), entry: new Map<unknown, number>() };
      const client = (id: unknown) => (id == null ? null : map.client.get(id) ?? null);
      // externalId is unique across the whole database (ids of the legacy source system), so the copy does not keep it.
      for (const r of rows.clients) map.client.set(r.id, insert('Client', { ...pick(r, ['id']), externalId: null, companyId }));
      for (const r of rows.stockItems) insert('StockItem', { ...pick(r, ['id']), externalId: null, companyId });
      const isCredit = (r: Row) => r.docType === 'KS';
      for (const r of rows.sales.filter(r => !isCredit(r))) map.sale.set(r.id, insert('Sale', { ...pick(r, ['id']), externalId: null, clientId: client(r.clientId), companyId }));
      for (const r of rows.purchases.filter(r => !isCredit(r))) map.purchase.set(r.id, insert('Purchase', { ...pick(r, ['id']), externalId: null, clientId: client(r.clientId), companyId }));
      for (const r of rows.bankTransactions) map.bank.set(r.id, insert('BankTransaction', { ...pick(r, ['id']), externalId: null, companyId }));
      for (const r of rows.payrolls) map.payroll.set(r.id, insert('Payroll', { ...pick(r, ['id']), externalId: null, companyId }));
      for (const r of rows.payrollEmployees) map.payrollEmployee.set(r.id, insert('PayrollEmployee', { ...pick(r, ['id']), payrollId: map.payroll.get(r.payrollId) }));
      // Payments are restored before credit notes: the database caps payments by the balance (total + credit notes), and a credit
      // note issued after a payment (an overpayment) would otherwise make a historically valid payment look too large.
      for (const r of rows.paymentAllocations) map.allocation.set(r.id, insert('PaymentAllocation', { ...pick(r, ['id']), companyId, bankTransactionId: map.bank.get(r.bankTransactionId), saleId: r.saleId == null ? null : map.sale.get(r.saleId), purchaseId: r.purchaseId == null ? null : map.purchase.get(r.purchaseId) }));
      for (const r of rows.manualSettlements) map.settlement.set(r.id, insert('ManualSettlement', { ...pick(r, ['id']), companyId, saleId: r.saleId == null ? null : map.sale.get(r.saleId), purchaseId: r.purchaseId == null ? null : map.purchase.get(r.purchaseId) }));
      for (const r of rows.sales.filter(isCredit)) map.sale.set(r.id, insert('Sale', { ...pick(r, ['id']), externalId: null, clientId: client(r.clientId), originalSaleId: r.originalSaleId == null ? null : map.sale.get(r.originalSaleId), companyId }));
      for (const r of rows.purchases.filter(isCredit)) map.purchase.set(r.id, insert('Purchase', { ...pick(r, ['id']), externalId: null, clientId: client(r.clientId), originalPurchaseId: r.originalPurchaseId == null ? null : map.purchase.get(r.originalPurchaseId), companyId }));
      for (const r of rows.saleItems) map.saleItem.set(r.id, insert('SaleItem', { ...pick(r, ['id']), saleId: map.sale.get(r.saleId) }));
      for (const r of rows.purchaseItems) map.purchaseItem.set(r.id, insert('PurchaseItem', { ...pick(r, ['id']), purchaseId: map.purchase.get(r.purchaseId) }));
      for (const r of rows.taxLineCodes) insert('TaxLineCode', { ...r, companyId, itemId: (r.kind === 'SALE' ? map.saleItem : map.purchaseItem).get(r.itemId) });
      for (const r of rows.taxCodeReviews) insert('TaxCodeReview', { ...r, companyId, docId: (r.kind === 'SALE' ? map.sale : map.purchase).get(r.docId) });
      for (const r of rows.recurringInvoices) map.recurring.set(r.id, insert('RecurringInvoice', { ...pick(r, ['id']), clientId: map.client.get(r.clientId), companyId }));
      for (const r of rows.recurringRuns) insert('RecurringRun', { ...r, recurringId: map.recurring.get(r.recurringId), saleId: map.sale.get(r.saleId) });
      let skippedLogs = 0;
      for (const [key, table] of [['invoiceDeliveries', 'InvoiceDelivery'], ['reminderLogs', 'ReminderLog']] as const) for (const r of rows[key]) {
        // Logs outlive deleted invoices; a log of an invoice that is not in the package cannot point at anything in the copy.
        if (!map.sale.has(r.saleId)) { skippedLogs++; continue; }
        insert(table, { ...r, saleId: map.sale.get(r.saleId), companyId });
      }
      if (skippedLogs) warnings.push(problem('logsSkipped', `${skippedLogs} siuntimo žurnalo įrašų priklauso ištrintoms sąskaitoms ir neperkelti`, { count: skippedLogs }));

      // Journal: the triggers have just posted every document by today's rules. The source journal is restored instead, row for
      // row, so historical postings (manual entries, legacy imports, rows posted under older rules) are identical in the copy.
      const sourceMap: Record<string, Map<unknown, number>> = { SALE: map.sale, PURCHASE: map.purchase, BANK: map.bank, PAYROLL: map.payroll, SETTLEMENT: map.settlement };
      const key = (r: Row) => [r.sourceType, r.sourceId, r.debitAccount, r.creditAccount, Math.round(Number(r.amount) * 100)].join('|');
      const generated = (db.prepare("SELECT sourceType,sourceId,debitAccount,creditAccount,amount FROM GeneralEntry WHERE companyId=? AND sourceType IN ('SALE','PURCHASE','BANK','PAYROLL')").all(companyId) as Row[]).map(key).sort();
      db.prepare('DELETE FROM GeneralEntry WHERE companyId=?').run(companyId);
      let unlinked = 0;
      const restored: Row[] = [];
      for (const r of rows.generalEntries) {
        let sourceId: number | null = null;
        if (r.sourceId != null) {
          const target = sourceMap[String(r.sourceType)]?.get(r.sourceId);
          if (target === undefined) unlinked++; else sourceId = target;
        }
        const row = { ...pick(r, ['id']), companyId, clientId: client(r.clientId), sourceId };
        map.entry.set(r.id, insert('GeneralEntry', row));
        restored.push(row);
      }
      if (unlinked) warnings.push(problem('entriesUnlinked', `${unlinked} įrašų rodė į paketo neįtrauktus dokumentus; nuoroda išvalyta, sumos išsaugotos`, { count: unlinked }));
      const expected = restored.filter(r => ['SALE', 'PURCHASE', 'BANK', 'PAYROLL'].includes(String(r.sourceType))).map(key).sort();
      if (generated.join('\n') !== expected.join('\n')) warnings.push(problem('ledgerDiffers', 'Dalis šaltinio įrašų skiriasi nuo to, ką sudarytų dabartinės taisyklės; įrašai perkelti nepakeisti'));
      const totals = (sql: string, ...args: unknown[]) => db.prepare(sql).get(...args) as { n: number; c: number };
      const copy = totals('SELECT COUNT(*) AS n,COALESCE(SUM(ROUND(amount*100)),0) AS c FROM GeneralEntry WHERE companyId=?', companyId);
      const sourceCents = rows.generalEntries.reduce((s, r) => s + Math.round(Number(r.amount) * 100), 0);
      if (copy.n !== rows.generalEntries.length || copy.c !== sourceCents) throw new Error('LEDGER_MISMATCH');

      // History: the rows written by the triggers during this import are replaced by the source history (ids remapped where the
      // record exists in the copy) and one IMPORT record. JSON snapshots keep the source ids as they were.
      db.prepare('DELETE FROM AccountingAudit WHERE companyId=? AND id>?').run(companyId, auditStart);
      const auditMap: Record<string, Map<unknown, number>> = { Sale: map.sale, Purchase: map.purchase, BankTransaction: map.bank, Payroll: map.payroll, GeneralEntry: map.entry, SaleItem: map.saleItem, PurchaseItem: map.purchaseItem, PayrollEmployee: map.payrollEmployee, PaymentAllocation: map.allocation, ManualSettlement: map.settlement, SaleTaxCode: map.saleItem, PurchaseTaxCode: map.purchaseItem, SaleTaxCodeReview: map.sale, PurchaseTaxCodeReview: map.purchase };
      for (const r of rows.auditHistory) insert('AccountingAudit', { ...pick(r, ['id']), companyId, recordId: r.entity === 'AccountingLock' ? companyId : auditMap[String(r.entity)]?.get(r.recordId) ?? r.recordId, actorId: null });
      if (lock) db.prepare('INSERT INTO AccountingLock(companyId,lockedThrough,reason) VALUES(?,?,?)').run(companyId, lock.lockedThrough, lock.reason);
      db.prepare("INSERT INTO AccountingAudit(companyId,entity,recordId,action,beforeJson,afterJson,actorId) VALUES(?,'Company',?,'IMPORT',NULL,?,?)")
        .run(companyId, companyId, JSON.stringify({ sourceCompanyId: company.id, sourceName: company.name, exportedAt: String(pkg.exportedAt).slice(0, 40), appVersion: String(pkg.appVersion).slice(0, 40), checksum: String(pkg.checksum).slice(0, 64), counts }), options.actorId ?? null);
      for (const guard of guards) db.exec(guard.sql);
      if (!options.commit) throw new Rollback();
    }).immediate();
  } catch (error) {
    if (!(error instanceof Rollback)) {
      problems.push(problem('database', 'Duomenų bazė atmetė importą: ' + (error instanceof Error ? error.message : String(error)), { detail: error instanceof Error ? error.message : String(error) }));
      return result({ companyName: newName, counts });
    }
    return result({ companyName: newName, counts, accountsAdded });
  }
  return result({ committed: true, companyId, companyName: newName, counts, accountsAdded });
}
