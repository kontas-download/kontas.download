import type Database from 'better-sqlite3';

// Access data for state systems (VMI EDS, Sodra EDAS, ...), the log of filing attempts and installation-wide settings. Additive only.
export function migrateApiAccess(db: Database.Database) {
  db.transaction(() => {
    if (db.prepare('SELECT version FROM AppMigration WHERE version=?').get('2026-11-api-access-v1')) return;
    db.exec(`CREATE TABLE IF NOT EXISTS CompanyApiCredential(
        companyId INTEGER NOT NULL REFERENCES Company(id) ON DELETE CASCADE,
        provider TEXT NOT NULL CHECK(provider IN ('VMI_EDS','SODRA_EDAS','RC','BANK')),
        username TEXT NOT NULL DEFAULT '',
        secretEncrypted TEXT NOT NULL DEFAULT '',
        environment TEXT NOT NULL DEFAULT 'TEST' CHECK(environment IN ('TEST','PRODUCTION')),
        status TEXT NOT NULL DEFAULT 'NOT_CONNECTED' CHECK(status IN ('NOT_CONNECTED','CONFIGURED','CONNECTED')),
        lastCheckedAt TEXT,
        lastError TEXT,
        updatedAt TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
        PRIMARY KEY(companyId,provider));
      CREATE TABLE IF NOT EXISTS FilingAttempt(
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        companyId INTEGER NOT NULL REFERENCES Company(id) ON DELETE CASCADE,
        provider TEXT NOT NULL,
        formCode TEXT NOT NULL,
        periodEnd TEXT NOT NULL,
        at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
        actorId INTEGER,
        action TEXT NOT NULL DEFAULT 'SUBMIT' CHECK(action IN ('SUBMIT','CHECK')),
        result TEXT NOT NULL,
        message TEXT NOT NULL DEFAULT '',
        ref TEXT);
      CREATE INDEX IF NOT EXISTS idx_filing_attempt_entry ON FilingAttempt(companyId,formCode,periodEnd,at);
      CREATE TABLE IF NOT EXISTS AppSetting(
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        updatedAt TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')));`);
    db.prepare("INSERT INTO AppMigration VALUES(?,datetime('now'))").run('2026-11-api-access-v1');
  }).immediate();
}
