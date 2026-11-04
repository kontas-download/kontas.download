import type Database from 'better-sqlite3';

// Automation: per-company switches, the run log and the dedupe keys of letters already sent. Additive only; every job is off
// until the company turns it on.
export function migrateAutomation(db: Database.Database) {
  db.transaction(() => {
    if (db.prepare('SELECT version FROM AppMigration WHERE version=?').get('2026-11-automation-v1')) return;
    db.exec(`CREATE TABLE IF NOT EXISTS AutomationSettings(
        companyId INTEGER PRIMARY KEY REFERENCES Company(id) ON DELETE CASCADE,
        recurringEnabled INTEGER NOT NULL DEFAULT 0 CHECK(recurringEnabled IN (0,1)),
        remindersEnabled INTEGER NOT NULL DEFAULT 0 CHECK(remindersEnabled IN (0,1)),
        reminderDays TEXT NOT NULL DEFAULT '3,14,30',
        reminderTemplateId INTEGER REFERENCES MailTemplate(id) ON DELETE SET NULL,
        bankMatchEnabled INTEGER NOT NULL DEFAULT 0 CHECK(bankMatchEnabled IN (0,1)),
        digestEnabled INTEGER NOT NULL DEFAULT 0 CHECK(digestEnabled IN (0,1)),
        digestWeekday INTEGER NOT NULL DEFAULT 1 CHECK(digestWeekday BETWEEN 1 AND 7),
        taxEnabled INTEGER NOT NULL DEFAULT 0 CHECK(taxEnabled IN (0,1)),
        taxDaysBefore INTEGER NOT NULL DEFAULT 5 CHECK(taxDaysBefore BETWEEN 1 AND 30),
        notifyEmail TEXT,
        updatedAt TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')));
      CREATE TABLE IF NOT EXISTS AutomationRun(
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        companyId INTEGER NOT NULL REFERENCES Company(id) ON DELETE CASCADE,
        job TEXT NOT NULL,
        runDate TEXT NOT NULL,
        status TEXT NOT NULL CHECK(status IN ('OK','ERROR')),
        message TEXT,
        detailsJson TEXT NOT NULL DEFAULT '[]',
        trigger TEXT NOT NULL DEFAULT 'schedule',
        createdAt TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')));
      CREATE INDEX IF NOT EXISTS idx_automation_run ON AutomationRun(companyId, job, runDate);
      CREATE TABLE IF NOT EXISTS AutomationSent(
        companyId INTEGER NOT NULL REFERENCES Company(id) ON DELETE CASCADE,
        key TEXT NOT NULL,
        createdAt TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
        PRIMARY KEY(companyId, key));`);
    const has = (column: string) => (db.prepare('PRAGMA table_info(RecurringInvoice)').all() as { name: string }[]).some(c => c.name === column);
    if (!has('autoMode')) db.exec("ALTER TABLE RecurringInvoice ADD COLUMN autoMode TEXT NOT NULL DEFAULT 'MANUAL' CHECK(autoMode IN ('MANUAL','ISSUE','ISSUE_SEND'))");
    db.prepare("INSERT INTO AppMigration VALUES(?,datetime('now'))").run('2026-11-automation-v1');
  })();
}
