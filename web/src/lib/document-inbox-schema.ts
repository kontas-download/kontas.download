import type Database from 'better-sqlite3';

// Purchase documents received by e-mail (IMAP): per-company mailbox settings and the processing log, which also guards against
// handling the same message twice. Additive only.
export function migrateDocumentInbox(db: Database.Database) {
  db.transaction(() => {
    if (db.prepare('SELECT version FROM AppMigration WHERE version=?').get('2026-11-document-inbox-v1')) return;
    db.exec(`CREATE TABLE IF NOT EXISTS CompanyDocumentInbox(
        companyId INTEGER PRIMARY KEY REFERENCES Company(id) ON DELETE CASCADE,
        enabled INTEGER NOT NULL DEFAULT 0,
        host TEXT NOT NULL DEFAULT '',
        port INTEGER NOT NULL DEFAULT 993,
        secure INTEGER NOT NULL DEFAULT 1,
        username TEXT NOT NULL DEFAULT '',
        passwordEncrypted TEXT NOT NULL DEFAULT '',
        folder TEXT NOT NULL DEFAULT 'INBOX',
        processedFolder TEXT NOT NULL DEFAULT '',
        allowedSenders TEXT NOT NULL DEFAULT '',
        lastUidValidity TEXT,
        lastUid INTEGER NOT NULL DEFAULT 0,
        lastRunAt TEXT,
        lastError TEXT,
        updatedAt TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')));
      CREATE TABLE IF NOT EXISTS DocumentInboxMessage(
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        companyId INTEGER NOT NULL REFERENCES Company(id) ON DELETE CASCADE,
        uidValidity TEXT NOT NULL,
        uid INTEGER NOT NULL,
        messageId TEXT,
        sender TEXT,
        subject TEXT,
        receivedAt TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
        status TEXT NOT NULL CHECK(status IN ('IMPORTED','SKIPPED_SENDER','NO_ATTACHMENTS','FAILED')),
        detail TEXT NOT NULL DEFAULT '',
        UNIQUE(companyId,uidValidity,uid));
      CREATE INDEX IF NOT EXISTS idx_document_inbox_message_company ON DocumentInboxMessage(companyId,id DESC);
      CREATE INDEX IF NOT EXISTS idx_document_inbox_message_msgid ON DocumentInboxMessage(companyId,messageId);`);
    db.prepare("INSERT INTO AppMigration VALUES(?,datetime('now'))").run('2026-11-document-inbox-v1');
  })();
}
