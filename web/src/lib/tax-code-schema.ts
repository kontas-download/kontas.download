import type Database from 'better-sqlite3';
import { codesFor } from './tax-codes';

// i.SAF tax codes assigned by the accountant to individual sale/purchase lines after the fact. The issued document (and its PDF)
// is never changed. Additive migration: one new table with scope/allowed-code triggers, audit triggers into AccountingAudit
// (entity SaleTaxCode / PurchaseTaxCode, recordId = line id) and clean-up when a line is deleted (an edited document needs its codes again).
export const TAX_CODES_MIGRATION = '2026-10-tax-codes-v1';

export function migrateTaxCodes(db: Database.Database) {
  db.transaction(() => {
    if (db.prepare('SELECT version FROM AppMigration WHERE version=?').get(TAX_CODES_MIGRATION)) return;
    const list = (kind: 'SALE' | 'PURCHASE') => codesFor(kind).map(c => `'${c}'`).join(',');
    db.exec(`CREATE TABLE TaxLineCode(
        companyId INTEGER NOT NULL REFERENCES Company(id) ON DELETE CASCADE,
        kind TEXT NOT NULL CHECK(kind IN ('SALE','PURCHASE')),
        itemId INTEGER NOT NULL,
        taxCode TEXT NOT NULL,
        note TEXT NOT NULL DEFAULT '',
        updatedAt INTEGER NOT NULL,
        PRIMARY KEY(kind,itemId));
      CREATE INDEX idx_tax_line_code_company ON TaxLineCode(companyId);`);
    const guard = (row: string) => `
      SELECT RAISE(ABORT,'TAX_CODE_ITEM_SCOPE') WHERE NOT (CASE ${row}.kind
        WHEN 'SALE' THEN EXISTS(SELECT 1 FROM SaleItem i JOIN Sale s ON s.id=i.saleId WHERE i.id=${row}.itemId AND s.companyId=${row}.companyId)
        ELSE EXISTS(SELECT 1 FROM PurchaseItem i JOIN Purchase p ON p.id=i.purchaseId WHERE i.id=${row}.itemId AND p.companyId=${row}.companyId) END);
      SELECT RAISE(ABORT,'TAX_CODE_NOT_ALLOWED') WHERE NOT (CASE ${row}.kind WHEN 'SALE' THEN ${row}.taxCode IN (${list('SALE')}) ELSE ${row}.taxCode IN (${list('PURCHASE')}) END);`;
    db.exec(`CREATE TRIGGER tax_code_INSERT BEFORE INSERT ON TaxLineCode BEGIN ${guard('NEW')} END;
      CREATE TRIGGER tax_code_UPDATE BEFORE UPDATE ON TaxLineCode BEGIN
        SELECT RAISE(ABORT,'TAX_CODE_KEY_IMMUTABLE') WHERE NEW.kind IS NOT OLD.kind OR NEW.itemId IS NOT OLD.itemId OR NEW.companyId IS NOT OLD.companyId;
        ${guard('NEW')} END;
      CREATE TRIGGER tax_code_SaleItem_DELETE AFTER DELETE ON SaleItem BEGIN DELETE FROM TaxLineCode WHERE kind='SALE' AND itemId=OLD.id; END;
      CREATE TRIGGER tax_code_PurchaseItem_DELETE AFTER DELETE ON PurchaseItem BEGIN DELETE FROM TaxLineCode WHERE kind='PURCHASE' AND itemId=OLD.id; END;`);
    const json = (row: string) => `json_object('companyId',${row}.companyId,'kind',${row}.kind,'itemId',${row}.itemId,'taxCode',${row}.taxCode,'note',${row}.note,'updatedAt',${row}.updatedAt)`;
    for (const action of ['INSERT', 'UPDATE', 'DELETE']) {
      const row = action === 'DELETE' ? 'OLD' : 'NEW';
      db.exec(`CREATE TRIGGER audit_TaxLineCode_${action} AFTER ${action} ON TaxLineCode BEGIN INSERT INTO AccountingAudit(companyId,entity,recordId,action,beforeJson,afterJson) VALUES(${row}.companyId,CASE ${row}.kind WHEN 'SALE' THEN 'SaleTaxCode' ELSE 'PurchaseTaxCode' END,${row}.itemId,'${action}',${action === 'INSERT' ? 'NULL' : json('OLD')},${action === 'DELETE' ? 'NULL' : json('NEW')}); END;`);
    }
    db.prepare("INSERT INTO AppMigration VALUES(?,datetime('now'))").run(TAX_CODES_MIGRATION);
  }).immediate();
}

// Second, additive step: codes follow the accounting lock of their document, and a document whose codes were dropped by an edit
// (lines replaced, a line could not be matched) is marked for review until the accountant assigns or confirms its codes.
export const TAX_CODES_REVIEW_MIGRATION = '2026-10-tax-codes-v2';
export function migrateTaxCodeReview(db: Database.Database) {
  db.transaction(() => {
    if (db.prepare('SELECT version FROM AppMigration WHERE version=?').get(TAX_CODES_REVIEW_MIGRATION)) return;
    db.exec(`CREATE TABLE TaxCodeReview(
        companyId INTEGER NOT NULL REFERENCES Company(id) ON DELETE CASCADE,
        kind TEXT NOT NULL CHECK(kind IN ('SALE','PURCHASE')),
        docId INTEGER NOT NULL,
        dropped TEXT NOT NULL,
        createdAt INTEGER NOT NULL,
        PRIMARY KEY(kind,docId));
      CREATE TRIGGER tax_review_Sale_DELETE AFTER DELETE ON Sale BEGIN DELETE FROM TaxCodeReview WHERE kind='SALE' AND docId=OLD.id; END;
      CREATE TRIGGER tax_review_Purchase_DELETE AFTER DELETE ON Purchase BEGIN DELETE FROM TaxCodeReview WHERE kind='PURCHASE' AND docId=OLD.id; END;`);
    const locked = (row: string) => `CASE ${row}.kind
      WHEN 'SALE' THEN EXISTS(SELECT 1 FROM SaleItem i JOIN Sale s ON s.id=i.saleId JOIN AccountingLock l ON l.companyId=s.companyId WHERE i.id=${row}.itemId AND l.lockedThrough IS NOT NULL AND s.saleDate<=l.lockedThrough)
      ELSE EXISTS(SELECT 1 FROM PurchaseItem i JOIN Purchase p ON p.id=i.purchaseId JOIN AccountingLock l ON l.companyId=p.companyId WHERE i.id=${row}.itemId AND l.lockedThrough IS NOT NULL AND p.purchaseDate<=l.lockedThrough) END`;
    db.exec(`CREATE TRIGGER lock_TaxLineCode_INSERT BEFORE INSERT ON TaxLineCode WHEN ${locked('NEW')} BEGIN SELECT RAISE(ABORT,'ACCOUNTING_PERIOD_LOCKED'); END;
      CREATE TRIGGER lock_TaxLineCode_UPDATE BEFORE UPDATE ON TaxLineCode WHEN ${locked('OLD')} BEGIN SELECT RAISE(ABORT,'ACCOUNTING_PERIOD_LOCKED'); END;
      CREATE TRIGGER lock_TaxLineCode_DELETE BEFORE DELETE ON TaxLineCode WHEN ${locked('OLD')} BEGIN SELECT RAISE(ABORT,'ACCOUNTING_PERIOD_LOCKED'); END;`);
    db.prepare("INSERT INTO AppMigration VALUES(?,datetime('now'))").run(TAX_CODES_REVIEW_MIGRATION);
  }).immediate();
}
