import type Database from 'better-sqlite3';

// Several users per installation. Additive migration (the User table is not rebuilt):
// - User.disabledAt: a disabled user cannot sign in and loses existing sessions;
// - triggers allow only the roles 'admin' and 'accountant' in new or changed rows;
// - e-mail is unique ignoring case (the original column is only case-sensitive UNIQUE);
// - UserLog: append-only record of who changed which user and when (no passwords or hashes are stored).
export const USERS_MIGRATION = '2026-10-users-v1';

export function migrateUsers(db: Database.Database) {
  db.transaction(() => {
    if (db.prepare('SELECT version FROM AppMigration WHERE version=?').get(USERS_MIGRATION)) return;
    const columns = (db.prepare('PRAGMA table_info(User)').all() as { name: string }[]).map(c => c.name);
    if (!columns.includes('disabledAt')) db.exec('ALTER TABLE User ADD COLUMN disabledAt INTEGER');
    const roleGuard = `SELECT RAISE(ABORT,'USER_ROLE_INVALID') WHERE NEW.role IS NULL OR NEW.role NOT IN ('admin','accountant');`;
    db.exec(`CREATE TRIGGER user_role_INSERT BEFORE INSERT ON User BEGIN ${roleGuard} END;
      CREATE TRIGGER user_role_UPDATE BEFORE UPDATE OF role ON User BEGIN ${roleGuard} END;`);
    // Existing data decides whether the database can enforce it; the API checks case-insensitive duplicates in any case.
    const duplicate = db.prepare('SELECT LOWER(email) AS email FROM User GROUP BY LOWER(email) HAVING COUNT(*)>1 LIMIT 1').get();
    if (duplicate) console.error('User e-mails differ only in letter case; the case-insensitive unique index was not created.');
    else db.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_user_email_nocase ON User(LOWER(email))');
    db.exec(`CREATE TABLE UserLog(
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        createdAt TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
        actorId INTEGER,
        userId INTEGER NOT NULL,
        userEmail TEXT NOT NULL,
        action TEXT NOT NULL,
        detailsJson TEXT);
      CREATE INDEX idx_user_log_user ON UserLog(userId,id);
      CREATE TRIGGER user_log_UPDATE BEFORE UPDATE ON UserLog BEGIN SELECT RAISE(ABORT,'USER_LOG_IMMUTABLE'); END;
      CREATE TRIGGER user_log_DELETE BEFORE DELETE ON UserLog BEGIN SELECT RAISE(ABORT,'USER_LOG_IMMUTABLE'); END;`);
    db.prepare("INSERT INTO AppMigration VALUES(?,datetime('now'))").run(USERS_MIGRATION);
  }).immediate();
}
