import type Database from 'better-sqlite3';
// Payment links (bank allocations) and settlements outside the bank were not recorded in AccountingAudit. Additive: only new triggers.
// Both tables are immutable (delete and recreate), so INSERT and DELETE are the only changes to record.
export function migratePaymentAudit(db: Database.Database) {
  db.transaction(() => {
    if (db.prepare('SELECT version FROM AppMigration WHERE version=?').get('2026-10-audit-payments-v1')) return;
    for (const table of ['PaymentAllocation', 'ManualSettlement']) {
      const columns = db.prepare('PRAGMA table_info(' + table + ')').all() as { name: string }[];
      const json = (row: string) => 'json_object(' + columns.flatMap(c => ["'" + c.name + "'", row + '."' + c.name + '"']).join(',') + ')';
      for (const action of ['INSERT', 'DELETE']) {
        const row = action === 'DELETE' ? 'OLD' : 'NEW';
        db.exec(`CREATE TRIGGER audit_${table}_${action} AFTER ${action} ON ${table} BEGIN INSERT INTO AccountingAudit(companyId,entity,recordId,action,beforeJson,afterJson) VALUES(${row}.companyId,'${table}',${row}.id,'${action}',${action === 'INSERT' ? 'NULL' : json('OLD')},${action === 'DELETE' ? 'NULL' : json('NEW')}); END;`);
      }
    }
    db.exec('CREATE INDEX IF NOT EXISTS idx_audit_company_entity ON AccountingAudit(companyId,entity,id)');
    db.prepare("INSERT INTO AppMigration VALUES(?,datetime('now'))").run('2026-10-audit-payments-v1');
  }).immediate();
}
