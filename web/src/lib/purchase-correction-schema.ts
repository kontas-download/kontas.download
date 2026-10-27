import type Database from 'better-sqlite3';

// Supplier credit notes are stored as negative purchases linked to the original purchase, exactly like sales credit notes,
// so VAT, the journal and the payables balance net out without special cases.
export function migratePurchaseCorrections(db: Database.Database) {
  db.transaction(() => {
    if (db.prepare('SELECT version FROM AppMigration WHERE version=?').get('2026-10-purchase-correction-v1')) return;
    db.exec(`ALTER TABLE Purchase ADD COLUMN docType TEXT CHECK(docType IN ('SF','KS'));
      ALTER TABLE Purchase ADD COLUMN originalPurchaseId INTEGER REFERENCES Purchase(id);
      ALTER TABLE Purchase ADD COLUMN correctionReason TEXT;
      CREATE INDEX idx_Purchase_original ON Purchase(originalPurchaseId);
      CREATE TRIGGER correction_scope_Purchase_INSERT BEFORE INSERT ON Purchase WHEN NEW.originalPurchaseId IS NOT NULL AND NOT EXISTS(SELECT 1 FROM Purchase WHERE id=NEW.originalPurchaseId AND companyId=NEW.companyId AND COALESCE(docType,'SF')='SF') BEGIN SELECT RAISE(ABORT,'Original invoice mismatch'); END;
      CREATE TRIGGER correction_keep_original_Purchase_DELETE BEFORE DELETE ON Purchase WHEN EXISTS(SELECT 1 FROM Purchase WHERE originalPurchaseId=OLD.id) BEGIN SELECT RAISE(ABORT,'Invoice has credit notes'); END;`);
    db.prepare("INSERT INTO AppMigration VALUES(?,datetime('now'))").run('2026-10-purchase-correction-v1');
  }).immediate();
}
