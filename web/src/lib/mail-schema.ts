import type Database from 'better-sqlite3';

// Letters module: reusable templates and the log of every letter sent (recipient, text, status). Additive only.
export function migrateMail(db: Database.Database) {
  db.transaction(() => {
    if (db.prepare('SELECT version FROM AppMigration WHERE version=?').get('2026-11-mail-v1')) return;
    db.exec(`CREATE TABLE IF NOT EXISTS MailTemplate(
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        companyId INTEGER NOT NULL REFERENCES Company(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        subject TEXT NOT NULL,
        body TEXT NOT NULL,
        createdAt TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
        updatedAt TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
        UNIQUE(companyId,name));
      CREATE TABLE IF NOT EXISTS MailMessage(
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        companyId INTEGER NOT NULL REFERENCES Company(id) ON DELETE CASCADE,
        batchId TEXT NOT NULL,
        templateId INTEGER REFERENCES MailTemplate(id) ON DELETE SET NULL,
        clientId INTEGER REFERENCES Client(id) ON DELETE SET NULL,
        recipient TEXT NOT NULL,
        recipientName TEXT,
        subject TEXT NOT NULL,
        body TEXT NOT NULL,
        status TEXT NOT NULL CHECK(status IN ('SENT','FAILED')),
        error TEXT,
        messageId TEXT,
        actorId INTEGER,
        createdAt TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')));
      CREATE INDEX IF NOT EXISTS idx_mail_message ON MailMessage(companyId,createdAt DESC);
      CREATE INDEX IF NOT EXISTS idx_mail_message_client ON MailMessage(companyId,clientId);`);
    db.prepare("INSERT INTO AppMigration VALUES(?,datetime('now'))").run('2026-11-mail-v1');
  })();
}
