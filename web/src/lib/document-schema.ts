import type Database from 'better-sqlite3';
export function migrateDocuments(db: Database.Database) {
  db.transaction(() => {
    const has = (table: string, column: string) => (db.prepare('PRAGMA table_info(' + table + ')').all() as { name: string }[]).some(c => c.name === column);
    if (!has('Client','isVatPayer')) { db.exec('ALTER TABLE Client ADD COLUMN isVatPayer INTEGER NOT NULL DEFAULT 0 CHECK(isVatPayer IN (0,1))'); db.exec("UPDATE Client SET isVatPayer=1 WHERE TRIM(COALESCE(vatCode,''))<>''"); }
    if (!has('Company','isVatPayer')) { db.exec('ALTER TABLE Company ADD COLUMN isVatPayer INTEGER NOT NULL DEFAULT 0 CHECK(isVatPayer IN (0,1))'); db.exec("UPDATE Company SET isVatPayer=1 WHERE TRIM(COALESCE(vatCode,''))<>'' OR EXISTS(SELECT 1 FROM Sale WHERE Sale.companyId=Company.id AND vat<>0)"); }
    if (!has('Sale','sellerIsVatPayer')) {
      db.exec('ALTER TABLE Sale ADD COLUMN sellerIsVatPayer INTEGER CHECK(sellerIsVatPayer IN (0,1))');
      const trigger = db.prepare("SELECT sql FROM sqlite_master WHERE type='trigger' AND name='ledger_Sale_UPDATE'").get() as { sql: string } | undefined;
      if (trigger) db.exec('DROP TRIGGER ledger_Sale_UPDATE');
      db.exec('UPDATE Sale SET sellerIsVatPayer=CASE WHEN vat<>0 THEN 1 ELSE (SELECT isVatPayer FROM Company WHERE id=Sale.companyId) END');
      if (trigger) db.exec(trigger.sql);
    }
    db.exec("CREATE TABLE IF NOT EXISTS InvoiceDelivery (companyId INTEGER NOT NULL, saleId INTEGER NOT NULL, requestId TEXT NOT NULL, recipient TEXT NOT NULL, status TEXT NOT NULL, messageId TEXT, createdAt INTEGER NOT NULL, PRIMARY KEY(companyId,requestId))");
    db.exec("CREATE TABLE IF NOT EXISTS CompanyMailSettings (companyId INTEGER PRIMARY KEY REFERENCES Company(id) ON DELETE CASCADE, host TEXT NOT NULL, port INTEGER NOT NULL, secure INTEGER NOT NULL, sender TEXT NOT NULL, username TEXT NOT NULL, passwordEncrypted TEXT NOT NULL, enabled INTEGER NOT NULL DEFAULT 1)");
    db.prepare("INSERT OR IGNORE INTO AppMigration VALUES (?,datetime('now'))").run('2026-10-documents-v2');
  }).immediate();
}
