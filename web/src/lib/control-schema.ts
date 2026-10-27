import type Database from 'better-sqlite3';
export function migrateControls(db:Database.Database) {
  db.transaction(()=>{
    if(db.prepare('SELECT version FROM AppMigration WHERE version=?').get('2026-10-controls-v1'))return;
    db.exec(`CREATE TABLE AccountingLock(companyId INTEGER PRIMARY KEY REFERENCES Company(id) ON DELETE CASCADE,lockedThrough TEXT,reason TEXT NOT NULL DEFAULT '');
      CREATE TABLE AccountingAudit(id INTEGER PRIMARY KEY AUTOINCREMENT,companyId INTEGER NOT NULL,entity TEXT NOT NULL,recordId INTEGER NOT NULL,action TEXT NOT NULL,beforeJson TEXT,afterJson TEXT,actorId INTEGER,createdAt TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')));
      CREATE INDEX idx_audit_company ON AccountingAudit(companyId,id);`);
    const tables=[['Sale','saleDate'],['Purchase','purchaseDate'],['BankTransaction','date'],['GeneralEntry','date'],['Payroll',null]] as const;
    for(const [table,dateColumn] of tables) {
      const columns=db.prepare('PRAGMA table_info('+table+')').all() as {name:string}[];
      const json=(row:string)=>'json_object('+columns.flatMap(c=>["'"+c.name+"'",row+'."'+c.name+'"']).join(',')+')';
      const locked=(row:string)=>`EXISTS(SELECT 1 FROM AccountingLock WHERE companyId=${row}.companyId AND lockedThrough IS NOT NULL AND ${dateColumn?row+'.'+dateColumn:`date(printf('%04d-%02d-01',${row}.year,${row}.month),'+1 month','-1 day')`}<=lockedThrough)`;
      for(const action of ['INSERT','UPDATE','DELETE']) {
        const condition=action==='INSERT'?locked('NEW'):action==='DELETE'?locked('OLD'):locked('OLD')+' OR '+locked('NEW');
        db.exec(`CREATE TRIGGER lock_${table}_${action} BEFORE ${action} ON ${table} WHEN ${condition} BEGIN SELECT RAISE(ABORT,'ACCOUNTING_PERIOD_LOCKED'); END;`);
        const row=action==='DELETE'?'OLD':'NEW';
        db.exec(`CREATE TRIGGER audit_${table}_${action} AFTER ${action} ON ${table} BEGIN INSERT INTO AccountingAudit(companyId,entity,recordId,action,beforeJson,afterJson) VALUES(${row}.companyId,'${table}',${row}.id,'${action}',${action==='INSERT'?'NULL':json('OLD')},${action==='DELETE'?'NULL':json('NEW')}); END;`);
      }
    }
    // Protect line-level mutations too, including direct imports and replacements.
    for(const [child,parent,key,dateColumn] of [['SaleItem','Sale','saleId','saleDate'],['PurchaseItem','Purchase','purchaseId','purchaseDate'],['PayrollEmployee','Payroll','payrollId',null]] as const) {
      const columns=db.prepare('PRAGMA table_info('+child+')').all() as {name:string}[];
      const json=(row:string)=>'json_object('+columns.flatMap(c=>["'"+c.name+"'",row+'."'+c.name+'"']).join(',')+')';
      const parentDate=dateColumn?'p.'+dateColumn:"date(printf('%04d-%02d-01',p.year,p.month),'+1 month','-1 day')";
      const locked=(row:string)=>`EXISTS(SELECT 1 FROM ${parent} p JOIN AccountingLock l ON l.companyId=p.companyId WHERE p.id=${row}.${key} AND ${parentDate}<=l.lockedThrough)`;
      for(const action of ['INSERT','UPDATE','DELETE']) {
        const condition=action==='INSERT'?locked('NEW'):action==='DELETE'?locked('OLD'):locked('OLD')+' OR '+locked('NEW');
        db.exec(`CREATE TRIGGER lock_${child}_${action} BEFORE ${action} ON ${child} WHEN ${condition} BEGIN SELECT RAISE(ABORT,'ACCOUNTING_PERIOD_LOCKED'); END;`);
        const row=action==='DELETE'?'OLD':'NEW';
        db.exec(`CREATE TRIGGER audit_${child}_${action} AFTER ${action} ON ${child} BEGIN INSERT INTO AccountingAudit(companyId,entity,recordId,action,beforeJson,afterJson) SELECT p.companyId,'${child}',${row}.id,'${action}',${action==='INSERT'?'NULL':json('OLD')},${action==='DELETE'?'NULL':json('NEW')} FROM ${parent} p WHERE p.id=${row}.${key}; END;`);
      }
    }
    // Existing duplicate numbers remain visible; only newly introduced duplicates are rejected.
    for(const table of ['Sale','Purchase']) {
      const supplier=table==='Purchase'?" AND COALESCE(NULLIF(p.clientCode,''),CAST(p.clientId AS TEXT),p.clientName,'')=COALESCE(NULLIF(NEW.clientCode,''),CAST(NEW.clientId AS TEXT),NEW.clientName,'')":'';
      const duplicate=`EXISTS(SELECT 1 FROM ${table} p WHERE p.companyId=NEW.companyId AND p.id<>NEW.id AND TRIM(COALESCE(p.series,''))=TRIM(COALESCE(NEW.series,'')) AND TRIM(p.number)=TRIM(NEW.number)${supplier})`;
      db.exec(`CREATE TRIGGER number_${table}_INSERT BEFORE INSERT ON ${table} WHEN ${duplicate} BEGIN SELECT RAISE(ABORT,'DUPLICATE_DOCUMENT_NUMBER'); END;
        CREATE TRIGGER number_${table}_UPDATE BEFORE UPDATE ON ${table} WHEN (NEW.number IS NOT OLD.number OR NEW.series IS NOT OLD.series OR NEW.companyId<>OLD.companyId) AND ${duplicate} BEGIN SELECT RAISE(ABORT,'DUPLICATE_DOCUMENT_NUMBER'); END;`);
    }
    db.prepare("INSERT INTO AppMigration VALUES(?,datetime('now'))").run('2026-10-controls-v1');
  }).immediate();
}

// Audit triggers list the columns that existed when they were created. Columns added later (purchase debit account,
// credit-note links, bank import keys) would otherwise be missing from AccountingAudit on databases that already ran the controls migration.
// Rebuilds the audit triggers of the given tables from their current columns. Add-ons that add a column to an audited table call this
// after their migration so changes to the new column are recorded.
export function rebuildAuditTriggers(db:Database.Database,tables:string[]) {
  for(const table of tables) {
    const columns=db.prepare('PRAGMA table_info('+table+')').all() as {name:string}[];
    const json=(row:string)=>'json_object('+columns.flatMap(c=>["'"+c.name+"'",row+'."'+c.name+'"']).join(',')+')';
    for(const action of ['INSERT','UPDATE','DELETE']) {
      const row=action==='DELETE'?'OLD':'NEW';
      db.exec(`DROP TRIGGER IF EXISTS audit_${table}_${action}`);
      db.exec(`CREATE TRIGGER audit_${table}_${action} AFTER ${action} ON ${table} BEGIN INSERT INTO AccountingAudit(companyId,entity,recordId,action,beforeJson,afterJson) VALUES(${row}.companyId,'${table}',${row}.id,'${action}',${action==='INSERT'?'NULL':json('OLD')},${action==='DELETE'?'NULL':json('NEW')}); END;`);
    }
  }
}

export function migrateAuditColumns(db:Database.Database) {
  db.transaction(()=>{
    if(db.prepare('SELECT version FROM AppMigration WHERE version=?').get('2026-10-audit-columns-v1'))return;
    rebuildAuditTriggers(db,['Sale','Purchase','BankTransaction']);
    db.prepare("INSERT INTO AppMigration VALUES(?,datetime('now'))").run('2026-10-audit-columns-v1');
  }).immediate();
}

// Fills AccountingAudit.actorId from AuditContext (see audit-actor.ts) for every audit trigger, present and future, without rewriting them.
// Rows that already carry an explicit actorId are left alone.
export function migrateAuditActor(db:Database.Database) {
  db.transaction(()=>{
    if(db.prepare('SELECT version FROM AppMigration WHERE version=?').get('2026-10-audit-actor-v1'))return;
    db.exec(`CREATE TABLE IF NOT EXISTS AuditContext(actorId INTEGER);
      CREATE TRIGGER audit_actor_fill AFTER INSERT ON AccountingAudit WHEN NEW.actorId IS NULL AND EXISTS(SELECT 1 FROM AuditContext) BEGIN UPDATE AccountingAudit SET actorId=(SELECT actorId FROM AuditContext LIMIT 1) WHERE id=NEW.id; END;`);
    db.prepare("INSERT INTO AppMigration VALUES(?,datetime('now'))").run('2026-10-audit-actor-v1');
  }).immediate();
}
