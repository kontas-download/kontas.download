import type Database from 'better-sqlite3';
export function migrateTax(db:Database.Database) {
  db.transaction(()=>{
    if(db.prepare('SELECT version FROM AppMigration WHERE version=?').get('2026-10-tax-v1'))return;
    db.exec(`ALTER TABLE Company ADD COLUMN taxMode TEXT CHECK(taxMode IN ('NON_VAT','STANDARD_VAT','SVS_LT'));
      ALTER TABLE Sale ADD COLUMN sellerVatMode TEXT CHECK(sellerVatMode IN ('NON_VAT','STANDARD_VAT','SVS_LT'));
      ALTER TABLE Purchase ADD COLUMN buyerVatMode TEXT CHECK(buyerVatMode IN ('NON_VAT','STANDARD_VAT','SVS_LT'));
      ALTER TABLE Purchase ADD COLUMN deductionPercent REAL CHECK(deductionPercent BETWEEN 0 AND 100);
      ALTER TABLE Purchase ADD COLUMN deductibleVat REAL;
      ALTER TABLE PurchaseItem ADD COLUMN vatRate REAL;
      CREATE TABLE CompanyTaxPeriod(companyId INTEGER NOT NULL REFERENCES Company(id) ON DELETE CASCADE,effectiveFrom TEXT NOT NULL,mode TEXT NOT NULL CHECK(mode IN ('NON_VAT','STANDARD_VAT','SVS_LT')),PRIMARY KEY(companyId,effectiveFrom));`);
    // No historical journal is rewritten. NULL preserves legacy accounting until reviewed.
    for(const name of ['ledger_Purchase_INSERT','ledger_Purchase_UPDATE']) {
      const trigger=db.prepare("SELECT sql FROM sqlite_master WHERE type='trigger' AND name=?").get(name) as {sql:string}|undefined;
      if(!trigger)throw new Error('Missing accounting trigger: '+name);
      const sql=trigger.sql.replaceAll('ROUND(NEW.sumWithoutVat,2)','ROUND(NEW.sumWithVat-COALESCE(NEW.deductibleVat,NEW.vat),2)').replaceAll('ROUND(NEW.vat,2)','ROUND(COALESCE(NEW.deductibleVat,NEW.vat),2)');
      db.exec('DROP TRIGGER '+name);db.exec(sql);
    }
    db.prepare("INSERT INTO AppMigration VALUES(?,datetime('now'))").run('2026-10-tax-v1');
  }).immediate();
}
// Lets a purchase be posted to inventory or fixed-asset accounts instead of the default expense account.
export function migratePurchaseAccount(db:Database.Database) {
  db.transaction(()=>{
    if(db.prepare('SELECT version FROM AppMigration WHERE version=?').get('2026-10-purchase-account-v1'))return;
    db.exec('ALTER TABLE Purchase ADD COLUMN debitAccount TEXT');
    // Existing journal rows are not touched; NULL keeps the historical 6118 posting.
    for(const name of ['ledger_Purchase_INSERT','ledger_Purchase_UPDATE']) {
      const trigger=db.prepare("SELECT sql FROM sqlite_master WHERE type='trigger' AND name=?").get(name) as {sql:string}|undefined;
      if(!trigger)throw new Error('Missing accounting trigger: '+name);
      if(!trigger.sql.includes("'6118','4430'"))throw new Error('Unexpected accounting trigger: '+name);
      db.exec('DROP TRIGGER '+name);db.exec(trigger.sql.replaceAll("'6118','4430'","COALESCE(NEW.debitAccount,'6118'),'4430'"));
    }
    db.prepare("INSERT INTO AppMigration VALUES(?,datetime('now'))").run('2026-10-purchase-account-v1');
  }).immediate();
}
// Credit notes (KS) are stored as negative sales linked to the original invoice, so reports and the journal net out.
export function migrateSaleCorrections(db:Database.Database) {
  db.transaction(()=>{
    if(db.prepare('SELECT version FROM AppMigration WHERE version=?').get('2026-10-sale-correction-v1'))return;
    db.exec(`ALTER TABLE Sale ADD COLUMN docType TEXT CHECK(docType IN ('SF','KS'));
      ALTER TABLE Sale ADD COLUMN originalSaleId INTEGER REFERENCES Sale(id);
      ALTER TABLE Sale ADD COLUMN correctionReason TEXT;
      CREATE INDEX idx_Sale_original ON Sale(originalSaleId);
      CREATE TRIGGER correction_scope_Sale_INSERT BEFORE INSERT ON Sale WHEN NEW.originalSaleId IS NOT NULL AND NOT EXISTS(SELECT 1 FROM Sale WHERE id=NEW.originalSaleId AND companyId=NEW.companyId AND COALESCE(docType,'SF')='SF') BEGIN SELECT RAISE(ABORT,'Original invoice mismatch'); END;
      CREATE TRIGGER correction_keep_original_DELETE BEFORE DELETE ON Sale WHEN EXISTS(SELECT 1 FROM Sale WHERE originalSaleId=OLD.id) BEGIN SELECT RAISE(ABORT,'Invoice has credit notes'); END;`);
    db.prepare("INSERT INTO AppMigration VALUES(?,datetime('now'))").run('2026-10-sale-correction-v1');
  }).immediate();
}
// Exact PDF bytes of every emailed invoice plus the parties' details at that moment. Rows are append-only.
export function migrateInvoiceArchive(db:Database.Database) {
  db.transaction(()=>{
    if(db.prepare('SELECT version FROM AppMigration WHERE version=?').get('2026-10-invoice-archive-v1'))return;
    db.exec(`CREATE TABLE InvoiceArchive(id INTEGER PRIMARY KEY AUTOINCREMENT,companyId INTEGER NOT NULL,saleId INTEGER NOT NULL,requestId TEXT NOT NULL,docNumber TEXT NOT NULL,filename TEXT NOT NULL,sha256 TEXT NOT NULL,size INTEGER NOT NULL,pdf BLOB NOT NULL,snapshot TEXT NOT NULL,recipient TEXT,messageId TEXT,createdAt INTEGER NOT NULL,UNIQUE(companyId,requestId));
      CREATE INDEX idx_InvoiceArchive_sale ON InvoiceArchive(companyId,saleId);
      CREATE TRIGGER invoice_archive_no_update BEFORE UPDATE ON InvoiceArchive BEGIN SELECT RAISE(ABORT,'Invoice archive is immutable'); END;
      CREATE TRIGGER invoice_archive_no_delete BEFORE DELETE ON InvoiceArchive BEGIN SELECT RAISE(ABORT,'Invoice archive is immutable'); END;`);
    db.prepare("INSERT INTO AppMigration VALUES(?,datetime('now'))").run('2026-10-invoice-archive-v1');
  }).immediate();
}
