import type Database from 'better-sqlite3';
// Audit triggers cannot see the signed-in user. withActor stores the user in the one-row AuditContext table for the duration of one
// synchronous transaction; the trigger on AccountingAudit copies it into actorId. The row is removed (or rolled back) afterwards.
export function withActor<T>(db: Database.Database, actorId: number | null | undefined, fn: () => T): T {
  return db.transaction(() => {
    db.prepare('DELETE FROM AuditContext').run();
    if (actorId != null) db.prepare('INSERT INTO AuditContext(actorId) VALUES(?)').run(actorId);
    try { return fn(); } finally { db.prepare('DELETE FROM AuditContext').run(); }
  }).immediate();
}
