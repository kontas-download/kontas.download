import type Database from 'better-sqlite3';
// Bank import dedup keys and payment allocations. Journal rows of existing transactions are untouched.
export function migratePayments(db: Database.Database) {
  db.transaction(() => {
    if (db.prepare('SELECT version FROM AppMigration WHERE version=?').get('2026-10-bank-payments-v1')) return;
    db.exec(`ALTER TABLE BankTransaction ADD COLUMN importHash TEXT;
      ALTER TABLE BankTransaction ADD COLUMN importBatch TEXT;
      CREATE UNIQUE INDEX idx_BankTransaction_import ON BankTransaction(companyId,importHash) WHERE importHash IS NOT NULL;
      CREATE TABLE PaymentAllocation(
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        companyId INTEGER NOT NULL,
        bankTransactionId INTEGER NOT NULL REFERENCES BankTransaction(id) ON DELETE CASCADE,
        saleId INTEGER REFERENCES Sale(id),
        purchaseId INTEGER REFERENCES Purchase(id),
        amount REAL NOT NULL CHECK(amount>0),
        createdAt INTEGER NOT NULL,
        CHECK((saleId IS NULL) <> (purchaseId IS NULL))
      );
      CREATE INDEX idx_PaymentAllocation_txn ON PaymentAllocation(bankTransactionId);
      CREATE INDEX idx_PaymentAllocation_sale ON PaymentAllocation(saleId);
      CREATE INDEX idx_PaymentAllocation_purchase ON PaymentAllocation(purchaseId);
      CREATE TRIGGER payment_allocation_rules BEFORE INSERT ON PaymentAllocation BEGIN
        SELECT RAISE(ABORT,'Payment company mismatch') WHERE NOT EXISTS(SELECT 1 FROM BankTransaction WHERE id=NEW.bankTransactionId AND companyId=NEW.companyId)
          OR (NEW.saleId IS NOT NULL AND NOT EXISTS(SELECT 1 FROM Sale WHERE id=NEW.saleId AND companyId=NEW.companyId))
          OR (NEW.purchaseId IS NOT NULL AND NOT EXISTS(SELECT 1 FROM Purchase WHERE id=NEW.purchaseId AND companyId=NEW.companyId));
        SELECT RAISE(ABORT,'Payment direction mismatch') WHERE (NEW.saleId IS NOT NULL AND (SELECT sum FROM BankTransaction WHERE id=NEW.bankTransactionId)<=0)
          OR (NEW.purchaseId IS NOT NULL AND (SELECT sum FROM BankTransaction WHERE id=NEW.bankTransactionId)>=0);
        SELECT RAISE(ABORT,'Payment exceeds bank transaction') WHERE ROUND(COALESCE((SELECT SUM(amount) FROM PaymentAllocation WHERE bankTransactionId=NEW.bankTransactionId),0)+NEW.amount,2) > ROUND(ABS((SELECT sum FROM BankTransaction WHERE id=NEW.bankTransactionId)),2);
        SELECT RAISE(ABORT,'Credit notes cannot be paid') WHERE NEW.saleId IS NOT NULL AND (SELECT COALESCE(docType,'SF') FROM Sale WHERE id=NEW.saleId)='KS';
        SELECT RAISE(ABORT,'Credit notes cannot be paid') WHERE NEW.purchaseId IS NOT NULL AND (SELECT COALESCE(docType,'SF') FROM Purchase WHERE id=NEW.purchaseId)='KS';
        SELECT RAISE(ABORT,'Payment exceeds invoice balance') WHERE NEW.saleId IS NOT NULL AND ROUND(COALESCE((SELECT SUM(amount) FROM PaymentAllocation WHERE saleId=NEW.saleId),0)+NEW.amount,2)
          > ROUND((SELECT sumWithVat FROM Sale WHERE id=NEW.saleId)+COALESCE((SELECT SUM(sumWithVat) FROM Sale WHERE originalSaleId=NEW.saleId),0),2);
        SELECT RAISE(ABORT,'Payment exceeds invoice balance') WHERE NEW.purchaseId IS NOT NULL AND ROUND(COALESCE((SELECT SUM(amount) FROM PaymentAllocation WHERE purchaseId=NEW.purchaseId),0)+NEW.amount,2) > ROUND((SELECT sumWithVat FROM Purchase WHERE id=NEW.purchaseId)+COALESCE((SELECT SUM(sumWithVat) FROM Purchase WHERE originalPurchaseId=NEW.purchaseId),0),2);
      END;
      CREATE TRIGGER payment_allocation_immutable BEFORE UPDATE ON PaymentAllocation BEGIN SELECT RAISE(ABORT,'Allocations cannot be edited: delete and recreate'); END;`);
    db.prepare("INSERT INTO AppMigration VALUES(?,datetime('now'))").run('2026-10-bank-payments-v1');
  }).immediate();
}

// Log of payment reminders sent to customers. Rows are append-only apart from the delivery status.
export function migrateReminders(db: Database.Database) {
  db.transaction(() => {
    if (db.prepare('SELECT version FROM AppMigration WHERE version=?').get('2026-10-reminders-v1')) return;
    db.exec(`CREATE TABLE ReminderLog(companyId INTEGER NOT NULL, saleId INTEGER NOT NULL, requestId TEXT NOT NULL, recipient TEXT NOT NULL, status TEXT NOT NULL, messageId TEXT, balance REAL NOT NULL, createdAt INTEGER NOT NULL, PRIMARY KEY(companyId,requestId));
      CREATE INDEX idx_ReminderLog_sale ON ReminderLog(companyId,saleId);
      CREATE TRIGGER reminder_log_no_delete BEFORE DELETE ON ReminderLog BEGIN SELECT RAISE(ABORT,'Reminder log is append-only'); END;`);
    db.prepare("INSERT INTO AppMigration VALUES(?,datetime('now'))").run('2026-10-reminders-v1');
  }).immediate();
}

// Which tax obligations apply to a company (FR0600 is derived from the tax mode) and manual "filed" marks.
export function migrateTaxCalendar(db: Database.Database) {
  db.transaction(() => {
    if (db.prepare('SELECT version FROM AppMigration WHERE version=?').get('2026-10-tax-calendar-v1')) return;
    db.exec(`CREATE TABLE CompanyObligation(companyId INTEGER NOT NULL REFERENCES Company(id) ON DELETE CASCADE, code TEXT NOT NULL CHECK(code IN ('FR0600','FR0564','GPM313','GPM312','PLN204')), enabled INTEGER NOT NULL DEFAULT 0, period TEXT CHECK(period IN ('MONTH','QUARTER','HALF')), PRIMARY KEY(companyId,code));
      CREATE TABLE ObligationDone(companyId INTEGER NOT NULL REFERENCES Company(id) ON DELETE CASCADE, code TEXT NOT NULL, periodEnd TEXT NOT NULL, doneAt INTEGER NOT NULL, note TEXT, PRIMARY KEY(companyId,code,periodEnd));`);
    db.prepare("INSERT INTO AppMigration VALUES(?,datetime('now'))").run('2026-10-tax-calendar-v1');
  }).immediate();
}

// Recurring invoice templates. Nothing is issued automatically: a person issues each period.
export function migrateRecurring(db: Database.Database) {
  db.transaction(() => {
    if (db.prepare('SELECT version FROM AppMigration WHERE version=?').get('2026-10-recurring-v1')) return;
    db.exec(`CREATE TABLE RecurringInvoice(
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        companyId INTEGER NOT NULL REFERENCES Company(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        clientId INTEGER NOT NULL REFERENCES Client(id),
        series TEXT NOT NULL DEFAULT 'SF',
        frequency TEXT NOT NULL CHECK(frequency IN ('MONTH','QUARTER','YEAR')),
        nextDate TEXT NOT NULL,
        anchorDay INTEGER NOT NULL CHECK(anchorDay BETWEEN 1 AND 31),
        endDate TEXT,
        payDays INTEGER NOT NULL DEFAULT 14 CHECK(payDays BETWEEN 0 AND 365),
        notes TEXT,
        itemsJson TEXT NOT NULL,
        active INTEGER NOT NULL DEFAULT 1,
        createdAt INTEGER NOT NULL
      );
      CREATE INDEX idx_RecurringInvoice_company ON RecurringInvoice(companyId);
      CREATE TABLE RecurringRun(
        recurringId INTEGER NOT NULL REFERENCES RecurringInvoice(id) ON DELETE CASCADE,
        periodDate TEXT NOT NULL,
        saleId INTEGER NOT NULL REFERENCES Sale(id) ON DELETE CASCADE,
        createdAt INTEGER NOT NULL,
        PRIMARY KEY(recurringId,periodDate)
      );
      CREATE TRIGGER recurring_client_scope_INSERT BEFORE INSERT ON RecurringInvoice WHEN NOT EXISTS(SELECT 1 FROM Client WHERE id=NEW.clientId AND companyId=NEW.companyId) BEGIN SELECT RAISE(ABORT,'Client company mismatch'); END;
      CREATE TRIGGER recurring_client_scope_UPDATE BEFORE UPDATE OF clientId,companyId ON RecurringInvoice WHEN NOT EXISTS(SELECT 1 FROM Client WHERE id=NEW.clientId AND companyId=NEW.companyId) BEGIN SELECT RAISE(ABORT,'Client company mismatch'); END;`);
    db.prepare("INSERT INTO AppMigration VALUES(?,datetime('now'))").run('2026-10-recurring-v1');
  }).immediate();
}

// Original XML of every imported supplier invoice, kept unchanged next to the purchase it created.
export function migratePurchaseSources(db: Database.Database) {
  db.transaction(() => {
    if (db.prepare('SELECT version FROM AppMigration WHERE version=?').get('2026-10-purchase-sources-v1')) return;
    db.exec(`CREATE TABLE PurchaseSource(
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        companyId INTEGER NOT NULL,
        purchaseId INTEGER NOT NULL,
        sha256 TEXT NOT NULL,
        filename TEXT,
        docNumber TEXT NOT NULL,
        supplierName TEXT NOT NULL,
        xml TEXT NOT NULL,
        importedAt INTEGER NOT NULL,
        UNIQUE(companyId,sha256)
      );
      CREATE INDEX idx_PurchaseSource_purchase ON PurchaseSource(companyId,purchaseId);
      CREATE TRIGGER purchase_source_no_update BEFORE UPDATE ON PurchaseSource BEGIN SELECT RAISE(ABORT,'Purchase source is immutable'); END;
      CREATE TRIGGER purchase_source_no_delete BEFORE DELETE ON PurchaseSource BEGIN SELECT RAISE(ABORT,'Purchase source is immutable'); END;`);
    db.prepare("INSERT INTO AppMigration VALUES(?,datetime('now'))").run('2026-10-purchase-sources-v1');
  }).immediate();
}

// Guards against lowering a sale or purchase total below the money already linked to it. Kept separate from the payments
// migration so it also reaches databases where that migration already ran. A credit note on a fully paid invoice is allowed:
// the overpayment is reported on the receivables screen instead of forcing the user to delete real bank links.
export function migratePaymentGuards(db: Database.Database) {
  db.transaction(() => {
    if (db.prepare('SELECT version FROM AppMigration WHERE version=?').get('2026-10-payment-guards-v1')) return;
    db.exec(`CREATE TRIGGER sale_total_below_payments BEFORE UPDATE OF sumWithVat ON Sale
        WHEN ROUND(COALESCE((SELECT SUM(amount) FROM PaymentAllocation WHERE saleId=NEW.id),0)+COALESCE((SELECT SUM(amount) FROM ManualSettlement WHERE saleId=NEW.id),0),2) > ROUND(NEW.sumWithVat+COALESCE((SELECT SUM(sumWithVat) FROM Sale WHERE originalSaleId=NEW.id),0),2)
        BEGIN SELECT RAISE(ABORT,'Allocated payments exceed document total'); END;
      CREATE TRIGGER purchase_total_below_payments BEFORE UPDATE OF sumWithVat ON Purchase
        WHEN ROUND(COALESCE((SELECT SUM(amount) FROM PaymentAllocation WHERE purchaseId=NEW.id),0)+COALESCE((SELECT SUM(amount) FROM ManualSettlement WHERE purchaseId=NEW.id),0),2) > ROUND(NEW.sumWithVat+COALESCE((SELECT SUM(sumWithVat) FROM Purchase WHERE originalPurchaseId=NEW.id),0),2)
        BEGIN SELECT RAISE(ABORT,'Allocated payments exceed document total'); END;`);
    db.prepare("INSERT INTO AppMigration VALUES(?,datetime('now'))").run('2026-10-payment-guards-v1');
  }).immediate();
}

// Settlement of a sale or purchase that did not pass through the bank (cash at the till, offset against another debt).
// It counts as paid exactly like a linked bank payment and is capped by the same document balance.
export function migrateManualSettlements(db: Database.Database) {
  db.transaction(() => {
    if (db.prepare('SELECT version FROM AppMigration WHERE version=?').get('2026-10-manual-settlements-v1')) return;
    db.exec(`CREATE TABLE ManualSettlement(
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        companyId INTEGER NOT NULL REFERENCES Company(id) ON DELETE CASCADE,
        saleId INTEGER REFERENCES Sale(id),
        purchaseId INTEGER REFERENCES Purchase(id),
        amount REAL NOT NULL CHECK(amount>0),
        date TEXT NOT NULL,
        method TEXT NOT NULL CHECK(method IN ('CASH','OFFSET','OTHER')),
        note TEXT,
        createdAt INTEGER NOT NULL,
        CHECK((saleId IS NULL) <> (purchaseId IS NULL))
      );
      CREATE INDEX idx_ManualSettlement_sale ON ManualSettlement(saleId);
      CREATE INDEX idx_ManualSettlement_purchase ON ManualSettlement(purchaseId);
      CREATE TRIGGER manual_settlement_rules BEFORE INSERT ON ManualSettlement BEGIN
        SELECT RAISE(ABORT,'Payment company mismatch') WHERE (NEW.saleId IS NOT NULL AND NOT EXISTS(SELECT 1 FROM Sale WHERE id=NEW.saleId AND companyId=NEW.companyId))
          OR (NEW.purchaseId IS NOT NULL AND NOT EXISTS(SELECT 1 FROM Purchase WHERE id=NEW.purchaseId AND companyId=NEW.companyId));
        SELECT RAISE(ABORT,'Credit notes cannot be paid') WHERE NEW.saleId IS NOT NULL AND (SELECT COALESCE(docType,'SF') FROM Sale WHERE id=NEW.saleId)='KS';
        SELECT RAISE(ABORT,'Credit notes cannot be paid') WHERE NEW.purchaseId IS NOT NULL AND (SELECT COALESCE(docType,'SF') FROM Purchase WHERE id=NEW.purchaseId)='KS';
        SELECT RAISE(ABORT,'Payment exceeds invoice balance') WHERE NEW.saleId IS NOT NULL AND ROUND(COALESCE((SELECT SUM(amount) FROM PaymentAllocation WHERE saleId=NEW.saleId),0)+COALESCE((SELECT SUM(amount) FROM ManualSettlement WHERE saleId=NEW.saleId),0)+NEW.amount,2)
          > ROUND((SELECT sumWithVat FROM Sale WHERE id=NEW.saleId)+COALESCE((SELECT SUM(sumWithVat) FROM Sale WHERE originalSaleId=NEW.saleId),0),2);
        SELECT RAISE(ABORT,'Payment exceeds invoice balance') WHERE NEW.purchaseId IS NOT NULL AND ROUND(COALESCE((SELECT SUM(amount) FROM PaymentAllocation WHERE purchaseId=NEW.purchaseId),0)+COALESCE((SELECT SUM(amount) FROM ManualSettlement WHERE purchaseId=NEW.purchaseId),0)+NEW.amount,2) > ROUND((SELECT sumWithVat FROM Purchase WHERE id=NEW.purchaseId)+COALESCE((SELECT SUM(sumWithVat) FROM Purchase WHERE originalPurchaseId=NEW.purchaseId),0),2);
      END;
      CREATE TRIGGER manual_settlement_immutable BEFORE UPDATE ON ManualSettlement BEGIN SELECT RAISE(ABORT,'Settlements cannot be edited: delete and recreate'); END;
      CREATE TRIGGER payment_allocation_with_manual BEFORE INSERT ON PaymentAllocation
        WHEN (NEW.saleId IS NOT NULL AND ROUND(COALESCE((SELECT SUM(amount) FROM PaymentAllocation WHERE saleId=NEW.saleId),0)+COALESCE((SELECT SUM(amount) FROM ManualSettlement WHERE saleId=NEW.saleId),0)+NEW.amount,2) > ROUND((SELECT sumWithVat FROM Sale WHERE id=NEW.saleId)+COALESCE((SELECT SUM(sumWithVat) FROM Sale WHERE originalSaleId=NEW.saleId),0),2))
          OR (NEW.purchaseId IS NOT NULL AND ROUND(COALESCE((SELECT SUM(amount) FROM PaymentAllocation WHERE purchaseId=NEW.purchaseId),0)+COALESCE((SELECT SUM(amount) FROM ManualSettlement WHERE purchaseId=NEW.purchaseId),0)+NEW.amount,2) > ROUND((SELECT sumWithVat FROM Purchase WHERE id=NEW.purchaseId)+COALESCE((SELECT SUM(sumWithVat) FROM Purchase WHERE originalPurchaseId=NEW.purchaseId),0),2))
        BEGIN SELECT RAISE(ABORT,'Payment exceeds invoice balance'); END;`);
    db.prepare("INSERT INTO AppMigration VALUES(?,datetime('now'))").run('2026-10-manual-settlements-v1');
  }).immediate();
}
