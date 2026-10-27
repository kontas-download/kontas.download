import type Database from 'better-sqlite3';

// Fixed asset register and depreciation. Additive only: new tables and triggers, existing rows are never touched.
// Every posting (monthly depreciation, disposal write-off) is one FixedAssetPosting row that posts its own GeneralEntry row
// (sourceType 'FIXED_ASSET') through a trigger, in the same transaction. Closed periods (AccountingLock) reject postings.
// Changes of method, useful life, residual value and factor are logged in FixedAssetChange (append-only, with a reason).
export function migrateFixedAssets(db: Database.Database) {
  db.transaction(() => {
    if (db.prepare('SELECT version FROM AppMigration WHERE version=?').get('2026-10-fixed-assets-v1')) return;
    db.exec(`CREATE TABLE FixedAssetSettings(
        companyId INTEGER PRIMARY KEY REFERENCES Company(id) ON DELETE CASCADE,
        defaultMethod TEXT NOT NULL DEFAULT 'STRAIGHT_LINE' CHECK(defaultMethod IN ('STRAIGHT_LINE','DECLINING_BALANCE')),
        updatedAt TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
        updatedBy INTEGER);
      CREATE TABLE FixedAsset(
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        companyId INTEGER NOT NULL REFERENCES Company(id) ON DELETE CASCADE,
        code TEXT NOT NULL,
        name TEXT NOT NULL,
        category TEXT NOT NULL CHECK(category IN ('BUILDING','MACHINERY','VEHICLE','COMPUTER','FURNITURE','INTANGIBLE','OTHER')),
        acquisitionDate TEXT NOT NULL,
        commissioningDate TEXT NOT NULL,
        cost REAL NOT NULL CHECK(cost > 0),
        residualValue REAL NOT NULL DEFAULT 0 CHECK(residualValue >= 0),
        usefulLifeMonths INTEGER NOT NULL CHECK(usefulLifeMonths > 0),
        method TEXT NOT NULL CHECK(method IN ('STRAIGHT_LINE','DECLINING_BALANCE')),
        decliningFactor REAL,
        assetAccount TEXT NOT NULL,
        accumulatedAccount TEXT NOT NULL,
        expenseAccount TEXT NOT NULL,
        disposalAccount TEXT NOT NULL,
        disposedAt TEXT,
        disposalProceeds REAL,
        disposalReason TEXT,
        notes TEXT,
        createdAt TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
        updatedAt TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
        updatedBy INTEGER,
        UNIQUE(companyId, code));
      CREATE TABLE FixedAssetPosting(
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        companyId INTEGER NOT NULL REFERENCES Company(id) ON DELETE CASCADE,
        assetId INTEGER NOT NULL REFERENCES FixedAsset(id) ON DELETE CASCADE,
        period TEXT NOT NULL,
        date TEXT NOT NULL,
        kind TEXT NOT NULL CHECK(kind IN ('DEPRECIATION','DISPOSAL_ACCUMULATED','DISPOSAL_BOOK_VALUE')),
        method TEXT,
        amount REAL NOT NULL CHECK(amount >= 0),
        bookValueAfter REAL NOT NULL,
        debitAccount TEXT NOT NULL,
        creditAccount TEXT NOT NULL,
        docNumber TEXT NOT NULL,
        description TEXT,
        actorId INTEGER,
        createdAt TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
        UNIQUE(assetId, period, kind));
      CREATE INDEX idx_fixed_asset_posting_company ON FixedAssetPosting(companyId, period);
      CREATE TABLE FixedAssetChange(
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        companyId INTEGER NOT NULL REFERENCES Company(id) ON DELETE CASCADE,
        assetId INTEGER NOT NULL REFERENCES FixedAsset(id) ON DELETE CASCADE,
        field TEXT NOT NULL,
        oldValue TEXT,
        newValue TEXT,
        reason TEXT NOT NULL,
        actorId INTEGER,
        createdAt TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')));
      CREATE INDEX idx_fixed_asset_change ON FixedAssetChange(assetId, id);
      CREATE TRIGGER fixed_asset_change_immutable BEFORE UPDATE ON FixedAssetChange BEGIN SELECT RAISE(ABORT,'FIXED_ASSET_CHANGE_IMMUTABLE'); END;
      CREATE TRIGGER fixed_asset_change_nodelete BEFORE DELETE ON FixedAssetChange WHEN EXISTS(SELECT 1 FROM FixedAsset WHERE id=OLD.assetId) BEGIN SELECT RAISE(ABORT,'FIXED_ASSET_CHANGE_IMMUTABLE'); END;
      CREATE TRIGGER fixed_asset_posting_immutable BEFORE UPDATE ON FixedAssetPosting BEGIN SELECT RAISE(ABORT,'FIXED_ASSET_POSTING_IMMUTABLE'); END;
      CREATE TRIGGER lock_FixedAssetPosting_INSERT BEFORE INSERT ON FixedAssetPosting WHEN EXISTS(SELECT 1 FROM AccountingLock WHERE companyId=NEW.companyId AND lockedThrough IS NOT NULL AND NEW.date<=lockedThrough) BEGIN SELECT RAISE(ABORT,'ACCOUNTING_PERIOD_LOCKED'); END;
      CREATE TRIGGER lock_FixedAssetPosting_DELETE BEFORE DELETE ON FixedAssetPosting WHEN EXISTS(SELECT 1 FROM AccountingLock WHERE companyId=OLD.companyId AND lockedThrough IS NOT NULL AND OLD.date<=lockedThrough) BEGIN SELECT RAISE(ABORT,'ACCOUNTING_PERIOD_LOCKED'); END;
      CREATE TRIGGER ledger_FixedAssetPosting_INSERT AFTER INSERT ON FixedAssetPosting BEGIN
        INSERT INTO GeneralEntry (companyId,date,docNumber,debitAccount,creditAccount,amount,clientId,clientName,description,sourceType,sourceId)
        SELECT NEW.companyId,NEW.date,NEW.docNumber,NEW.debitAccount,NEW.creditAccount,ROUND(NEW.amount,2),NULL,NULL,NEW.description,'FIXED_ASSET',NEW.id
        WHERE NEW.debitAccount<>NEW.creditAccount AND ROUND(NEW.amount,2)!=0;
      END;
      CREATE TRIGGER ledger_FixedAssetPosting_DELETE AFTER DELETE ON FixedAssetPosting BEGIN DELETE FROM GeneralEntry WHERE companyId=OLD.companyId AND sourceType='FIXED_ASSET' AND sourceId=OLD.id; END;
      CREATE TRIGGER audit_FixedAssetPosting_INSERT AFTER INSERT ON FixedAssetPosting BEGIN
        INSERT INTO AccountingAudit(companyId,entity,recordId,action,beforeJson,afterJson,actorId)
        VALUES(NEW.companyId,'FixedAssetPosting',NEW.id,'INSERT',NULL,json_object('assetId',NEW.assetId,'period',NEW.period,'date',NEW.date,'kind',NEW.kind,'method',NEW.method,'amount',NEW.amount,'bookValueAfter',NEW.bookValueAfter,'debitAccount',NEW.debitAccount,'creditAccount',NEW.creditAccount),NEW.actorId);
      END;
      CREATE TRIGGER audit_FixedAssetPosting_DELETE AFTER DELETE ON FixedAssetPosting BEGIN
        INSERT INTO AccountingAudit(companyId,entity,recordId,action,beforeJson,afterJson,actorId)
        VALUES(OLD.companyId,'FixedAssetPosting',OLD.id,'DELETE',json_object('assetId',OLD.assetId,'period',OLD.period,'date',OLD.date,'kind',OLD.kind,'amount',OLD.amount),NULL,NULL);
      END;`);
    const json = (row: string) => `json_object('code',${row}.code,'name',${row}.name,'category',${row}.category,'acquisitionDate',${row}.acquisitionDate,'commissioningDate',${row}.commissioningDate,'cost',${row}.cost,'residualValue',${row}.residualValue,'usefulLifeMonths',${row}.usefulLifeMonths,'method',${row}.method,'decliningFactor',${row}.decliningFactor,'assetAccount',${row}.assetAccount,'accumulatedAccount',${row}.accumulatedAccount,'expenseAccount',${row}.expenseAccount,'disposalAccount',${row}.disposalAccount,'disposedAt',${row}.disposedAt,'disposalProceeds',${row}.disposalProceeds,'disposalReason',${row}.disposalReason)`;
    db.exec(`CREATE TRIGGER audit_FixedAsset_INSERT AFTER INSERT ON FixedAsset BEGIN INSERT INTO AccountingAudit(companyId,entity,recordId,action,beforeJson,afterJson,actorId) VALUES(NEW.companyId,'FixedAsset',NEW.id,'INSERT',NULL,${json('NEW')},NEW.updatedBy); END;
      CREATE TRIGGER audit_FixedAsset_UPDATE AFTER UPDATE ON FixedAsset BEGIN INSERT INTO AccountingAudit(companyId,entity,recordId,action,beforeJson,afterJson,actorId) VALUES(NEW.companyId,'FixedAsset',NEW.id,'UPDATE',${json('OLD')},${json('NEW')},NEW.updatedBy); END;
      CREATE TRIGGER audit_FixedAsset_DELETE AFTER DELETE ON FixedAsset BEGIN INSERT INTO AccountingAudit(companyId,entity,recordId,action,beforeJson,afterJson,actorId) VALUES(OLD.companyId,'FixedAsset',OLD.id,'DELETE',${json('OLD')},NULL,NULL); END;`);
    // Default posting accounts (Lithuanian chart). Existing codes are left as they are; every account can be changed per asset.
    const account = db.prepare('INSERT OR IGNORE INTO ChartOfAccount (code, name) VALUES (?, ?)');
    account.run('1130', 'Programinė įranga');
    account.run('1139', 'Nematerialiojo turto sukaupta amortizacija');
    account.run('1202', 'Pastatai ir statiniai');
    account.run('1204', 'Mašinos ir įrengimai');
    account.run('1205', 'Transporto priemonės');
    account.run('1206', 'Kita įranga, prietaisai, įrankiai ir įrenginiai');
    account.run('1209', 'Ilgalaikio materialiojo turto sukauptas nusidėvėjimas');
    account.run('6306', 'Ilgalaikio turto nusidėvėjimo ir amortizacijos sąnaudos');
    account.run('6810', 'Ilgalaikio turto perleidimo ir nurašymo nuostoliai');
    db.prepare("INSERT INTO AppMigration VALUES(?,datetime('now'))").run('2026-10-fixed-assets-v1');
  }).immediate();
}
