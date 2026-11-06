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
  // Where the confirmed debit account came from (audit): history of the supplier, the recognition suggestion or the person.
  db.transaction(() => {
    if (db.prepare('SELECT version FROM AppMigration WHERE version=?').get('2026-11-purchase-documents-v2')) return;
    const have = new Set((db.prepare('PRAGMA table_info(PurchaseDocument)').all() as { name: string }[]).map(c => c.name));
    if (!have.has('accountSource')) db.exec("ALTER TABLE PurchaseDocument ADD COLUMN accountSource TEXT CHECK(accountSource IN ('HISTORY','MODEL','USER'))");
    db.prepare("INSERT INTO AppMigration VALUES(?,datetime('now'))").run('2026-11-purchase-documents-v2');
  })();
  // An XML e-invoice received with a PDF of the same invoice keeps the PDF as its visual original (one queue item); the file sits beside
  // the XML under <companyId>/<year>/<visualSha256>.pdf.
  db.transaction(() => {
    if (db.prepare('SELECT version FROM AppMigration WHERE version=?').get('2026-11-purchase-documents-v3')) return;
    const have = new Set((db.prepare('PRAGMA table_info(PurchaseDocument)').all() as { name: string }[]).map(c => c.name));
    if (!have.has('visualName')) db.exec('ALTER TABLE PurchaseDocument ADD COLUMN visualName TEXT');
    if (!have.has('visualSha256')) db.exec('ALTER TABLE PurchaseDocument ADD COLUMN visualSha256 TEXT');
    db.prepare("INSERT INTO AppMigration VALUES(?,datetime('now'))").run('2026-11-purchase-documents-v3');
  })();
  // Estimated cost of recognition calls (tokens reported by the provider, cost in USD from the price table) and the optional monthly limit in EUR.
  db.transaction(() => {
    if (db.prepare('SELECT version FROM AppMigration WHERE version=?').get('2026-11-purchase-documents-v4')) return;
    db.exec(`CREATE TABLE IF NOT EXISTS RecognitionUsage(
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        companyId INTEGER NOT NULL REFERENCES Company(id) ON DELETE CASCADE,
        documentId INTEGER REFERENCES PurchaseDocument(id) ON DELETE SET NULL,
        model TEXT NOT NULL,
        inputTokens INTEGER NOT NULL DEFAULT 0,
        outputTokens INTEGER NOT NULL DEFAULT 0,
        costUsd REAL NOT NULL DEFAULT 0,
        createdAt TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')));
      CREATE INDEX IF NOT EXISTS idx_recognition_usage_company ON RecognitionUsage(companyId,createdAt);
      CREATE INDEX IF NOT EXISTS idx_recognition_usage_document ON RecognitionUsage(documentId);`);
    const have = new Set((db.prepare('PRAGMA table_info(CompanyRecognitionSettings)').all() as { name: string }[]).map(c => c.name));
    if (!have.has('monthlyLimitEur')) db.exec('ALTER TABLE CompanyRecognitionSettings ADD COLUMN monthlyLimitEur REAL');
    db.prepare("INSERT INTO AppMigration VALUES(?,datetime('now'))").run('2026-11-purchase-documents-v4');
  })();
  // Who uploaded the file (signed-in user at the time; null for mail and phone-less paths where only `sender` is known).
  db.transaction(() => {
    if (db.prepare('SELECT version FROM AppMigration WHERE version=?').get('2026-11-purchase-documents-v5')) return;
    const have = new Set((db.prepare('PRAGMA table_info(PurchaseDocument)').all() as { name: string }[]).map(c => c.name));
    if (!have.has('uploadedBy')) db.exec('ALTER TABLE PurchaseDocument ADD COLUMN uploadedBy INTEGER');
    db.prepare("INSERT INTO AppMigration VALUES(?,datetime('now'))").run('2026-11-purchase-documents-v5');
  })();
  // Forwarded mail: `sender` is the person who forwarded it, `originalSender` the address found in the forwarded message.
  db.transaction(() => {
    if (db.prepare('SELECT version FROM AppMigration WHERE version=?').get('2026-11-purchase-documents-v6')) return;
    const have = new Set((db.prepare('PRAGMA table_info(PurchaseDocument)').all() as { name: string }[]).map(c => c.name));
    if (!have.has('originalSender')) db.exec('ALTER TABLE PurchaseDocument ADD COLUMN originalSender TEXT');
    db.prepare("INSERT INTO AppMigration VALUES(?,datetime('now'))").run('2026-11-purchase-documents-v6');
  })();
  // Per-supplier rules pre-fill the review form (expense account, VAT code, document kind, payment).
  db.transaction(() => {
    if (db.prepare('SELECT version FROM AppMigration WHERE version=?').get('2026-11-purchase-documents-v7')) return;
    db.exec(`CREATE TABLE IF NOT EXISTS SupplierDocumentRule(
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        companyId INTEGER NOT NULL REFERENCES Company(id) ON DELETE CASCADE,
        clientId INTEGER REFERENCES Client(id) ON DELETE CASCADE,
        senderPattern TEXT,
        debitAccount TEXT,
        taxCode TEXT,
        evidenceType TEXT CHECK(evidenceType IN ('INVOICE','RECEIPT')),
        paymentMethod TEXT CHECK(paymentMethod IN ('CARD','CASH','TRANSFER','OTHER')),
        paidBy TEXT CHECK(paidBy IN ('COMPANY','PERSON')),
        deductionPercent REAL,
        notes TEXT,
        createdAt TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
        updatedAt TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
        lastUsedAt TEXT,
        CHECK(clientId IS NOT NULL OR senderPattern IS NOT NULL));
      CREATE INDEX IF NOT EXISTS idx_supplier_rule_company ON SupplierDocumentRule(companyId,clientId);`);
    db.prepare("INSERT INTO AppMigration VALUES(?,datetime('now'))").run('2026-11-purchase-documents-v7');
  })();
}
