import type Database from 'better-sqlite3';

// Purchase document recognition: stored originals (write-once files, rows survive deletion of the purchase), per-company
// provider settings and the extra purchase columns for own-funds payments and cash receipts. Additive only.
export function migratePurchaseDocuments(db: Database.Database) {
  db.transaction(() => {
    if (db.prepare('SELECT version FROM AppMigration WHERE version=?').get('2026-11-purchase-documents-v1')) return;
    db.exec(`CREATE TABLE IF NOT EXISTS PurchaseDocument(
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        companyId INTEGER NOT NULL REFERENCES Company(id) ON DELETE CASCADE,
        purchaseId INTEGER REFERENCES Purchase(id) ON DELETE SET NULL,
        fileName TEXT NOT NULL,
        mimeType TEXT NOT NULL,
        size INTEGER NOT NULL,
        sha256 TEXT NOT NULL,
        storagePath TEXT NOT NULL,
        source TEXT NOT NULL DEFAULT 'UPLOAD' CHECK(source IN ('UPLOAD','EMAIL')),
        sender TEXT,
        receivedAt TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
        status TEXT NOT NULL DEFAULT 'NEW' CHECK(status IN ('NEW','EXTRACTED','FAILED','CONFIRMED','REJECTED')),
        extractedJson TEXT,
        error TEXT,
        model TEXT,
        createdAt TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
        confirmedAt TEXT,
        confirmedBy INTEGER,
        UNIQUE(companyId,sha256));
      CREATE INDEX IF NOT EXISTS idx_purchase_document_company ON PurchaseDocument(companyId,status,createdAt DESC);
      CREATE INDEX IF NOT EXISTS idx_purchase_document_purchase ON PurchaseDocument(purchaseId);
      CREATE TABLE IF NOT EXISTS CompanyRecognitionSettings(
        companyId INTEGER PRIMARY KEY REFERENCES Company(id) ON DELETE CASCADE,
        enabled INTEGER NOT NULL DEFAULT 0,
        apiKeyEncrypted TEXT,
        model TEXT NOT NULL DEFAULT '',
        updatedAt TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')));`);
    // model '' = the provider's default model (it is named only inside the provider adapter).
    const have = new Set((db.prepare('PRAGMA table_info(Purchase)').all() as { name: string }[]).map(c => c.name));
    const columns: [string, string][] = [
      ['paidBy', "TEXT CHECK(paidBy IN ('COMPANY','PERSON'))"],
      ['paidByName', 'TEXT'],
      ['reimbursedAt', 'TEXT'],
      ['evidenceType', "TEXT CHECK(evidenceType IN ('INVOICE','RECEIPT'))"],
      ['paymentMethod', "TEXT CHECK(paymentMethod IN ('CARD','CASH','TRANSFER','OTHER'))"],
      ['cardLast4', 'TEXT'],
      ['cashRegisterNo', 'TEXT'],
      ['receiptNo', 'TEXT'],
      ['documentTime', 'TEXT'],
    ];
    for (const [name, definition] of columns) if (!have.has(name)) db.exec(`ALTER TABLE Purchase ADD COLUMN ${name} ${definition}`);
    db.prepare("INSERT INTO AppMigration VALUES(?,datetime('now'))").run('2026-11-purchase-documents-v1');
  })();
}
