import type Database from 'better-sqlite3';

// Language in which customer-facing documents are issued to this customer (NULL = Lithuanian).
export function migrateDocumentLanguage(db: Database.Database) {
  db.transaction(() => {
    if (db.prepare('SELECT version FROM AppMigration WHERE version=?').get('2026-10-document-language-v1')) return;
    db.exec("ALTER TABLE Client ADD COLUMN documentLang TEXT CHECK(documentLang IN ('lt','ru','en'))");
    db.prepare("INSERT INTO AppMigration VALUES(?,datetime('now'))").run('2026-10-document-language-v1');
  }).immediate();
}
