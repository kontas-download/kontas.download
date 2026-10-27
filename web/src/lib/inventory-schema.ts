import type Database from 'better-sqlite3';
import { rebuildAuditTriggers } from './control-schema';

// Inventory movements and cost of goods sold. Additive only: new tables and triggers, existing rows are never touched.
// Movements are append-only; each one posts its own GeneralEntry row (sourceType 'INVENTORY') through a trigger,
// in the same transaction as the document that caused it. Settings default to OFF, so nothing changes until a company opts in.
// A company that has an InventorySettings row is "tracked": its posted documents, stock cards with movements and the movements
// themselves are protected. Deleting the whole company removes the settings row first (see DELETE /api/companies/{id}).
export function migrateInventory(db: Database.Database) {
  db.transaction(() => {
    if (db.prepare('SELECT version FROM AppMigration WHERE version=?').get('2026-10-inventory-v1')) return;
    db.exec(`CREATE TABLE InventorySettings(
        companyId INTEGER PRIMARY KEY REFERENCES Company(id) ON DELETE CASCADE,
        method TEXT NOT NULL DEFAULT 'OFF' CHECK(method IN ('OFF','AVERAGE','FIFO')),
        inventoryAccount TEXT NOT NULL DEFAULT '2040',
        cogsAccount TEXT NOT NULL DEFAULT '6000',
        startDate TEXT,
        updatedAt TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
        updatedBy INTEGER);
      CREATE TABLE InventoryMovement(
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        companyId INTEGER NOT NULL REFERENCES Company(id) ON DELETE CASCADE,
        stockItemId INTEGER NOT NULL REFERENCES StockItem(id) ON DELETE CASCADE,
        date TEXT NOT NULL,
        kind TEXT NOT NULL CHECK(kind IN ('OPENING','RECEIPT','ISSUE','ADJUST_QTY','ADJUST_COST')),
        method TEXT NOT NULL CHECK(method IN ('AVERAGE','FIFO')),
        quantity REAL NOT NULL,
        amount REAL NOT NULL,
        unitCost REAL NOT NULL,
        balanceQty REAL NOT NULL,
        balanceValue REAL NOT NULL,
        debitAccount TEXT,
        creditAccount TEXT,
        sourceType TEXT NOT NULL CHECK(sourceType IN ('OPENING','PURCHASE','SALE','MANUAL')),
        sourceId INTEGER,
        sourceLineId INTEGER,
        docNumber TEXT,
        reason TEXT,
        actorId INTEGER,
        createdAt TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')));
      CREATE INDEX idx_inventory_movement_item ON InventoryMovement(companyId,stockItemId,id);
      CREATE INDEX idx_inventory_movement_source ON InventoryMovement(companyId,sourceType,sourceId);
      CREATE TABLE InventoryLayer(
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        companyId INTEGER NOT NULL REFERENCES Company(id) ON DELETE CASCADE,
        stockItemId INTEGER NOT NULL REFERENCES StockItem(id) ON DELETE CASCADE,
        movementId INTEGER NOT NULL REFERENCES InventoryMovement(id) ON DELETE CASCADE,
        date TEXT NOT NULL,
        quantity REAL NOT NULL,
        remainingQty REAL NOT NULL,
        remainingValue REAL NOT NULL);
      CREATE INDEX idx_inventory_layer_open ON InventoryLayer(companyId,stockItemId,remainingQty);
      CREATE TRIGGER inventory_movement_immutable BEFORE UPDATE ON InventoryMovement BEGIN SELECT RAISE(ABORT,'INVENTORY_MOVEMENT_IMMUTABLE'); END;
      CREATE TRIGGER inventory_movement_nodelete BEFORE DELETE ON InventoryMovement WHEN EXISTS(SELECT 1 FROM InventorySettings WHERE companyId=OLD.companyId) BEGIN SELECT RAISE(ABORT,'INVENTORY_MOVEMENT_IMMUTABLE'); END;
      CREATE TRIGGER inventory_item_guard BEFORE DELETE ON StockItem WHEN EXISTS(SELECT 1 FROM InventoryMovement WHERE stockItemId=OLD.id) AND EXISTS(SELECT 1 FROM InventorySettings WHERE companyId=OLD.companyId) BEGIN SELECT RAISE(ABORT,'INVENTORY_ITEM_HAS_MOVEMENTS'); END;
      CREATE TRIGGER lock_InventoryMovement_INSERT BEFORE INSERT ON InventoryMovement WHEN EXISTS(SELECT 1 FROM AccountingLock WHERE companyId=NEW.companyId AND lockedThrough IS NOT NULL AND NEW.date<=lockedThrough) BEGIN SELECT RAISE(ABORT,'ACCOUNTING_PERIOD_LOCKED'); END;
      CREATE TRIGGER ledger_InventoryMovement_INSERT AFTER INSERT ON InventoryMovement BEGIN
        INSERT INTO GeneralEntry (companyId,date,docNumber,debitAccount,creditAccount,amount,clientId,clientName,description,sourceType,sourceId)
        SELECT NEW.companyId,NEW.date,NEW.docNumber,NEW.debitAccount,NEW.creditAccount,ROUND(ABS(NEW.amount),2),NULL,NULL,COALESCE(NEW.reason,'Inventory '||NEW.kind),'INVENTORY',NEW.id
        WHERE NEW.debitAccount IS NOT NULL AND NEW.creditAccount IS NOT NULL AND NEW.debitAccount<>NEW.creditAccount AND ROUND(ABS(NEW.amount),2)!=0;
      END;
      CREATE TRIGGER ledger_InventoryMovement_DELETE AFTER DELETE ON InventoryMovement BEGIN DELETE FROM GeneralEntry WHERE companyId=OLD.companyId AND sourceType='INVENTORY' AND sourceId=OLD.id; END;
      CREATE TRIGGER audit_InventoryMovement_INSERT AFTER INSERT ON InventoryMovement BEGIN
        INSERT INTO AccountingAudit(companyId,entity,recordId,action,beforeJson,afterJson,actorId)
        VALUES(NEW.companyId,'InventoryMovement',NEW.id,'INSERT',NULL,json_object('stockItemId',NEW.stockItemId,'date',NEW.date,'kind',NEW.kind,'method',NEW.method,'quantity',NEW.quantity,'amount',NEW.amount,'unitCost',NEW.unitCost,'balanceQty',NEW.balanceQty,'balanceValue',NEW.balanceValue,'debitAccount',NEW.debitAccount,'creditAccount',NEW.creditAccount,'sourceType',NEW.sourceType,'sourceId',NEW.sourceId,'reason',NEW.reason),NEW.actorId);
      END;
      CREATE TRIGGER audit_InventorySettings_INSERT AFTER INSERT ON InventorySettings BEGIN
        INSERT INTO AccountingAudit(companyId,entity,recordId,action,beforeJson,afterJson,actorId)
        VALUES(NEW.companyId,'InventorySettings',NEW.companyId,'INSERT',NULL,json_object('method',NEW.method,'inventoryAccount',NEW.inventoryAccount,'cogsAccount',NEW.cogsAccount,'startDate',NEW.startDate),NEW.updatedBy);
      END;
      CREATE TRIGGER audit_InventorySettings_UPDATE AFTER UPDATE ON InventorySettings BEGIN
        INSERT INTO AccountingAudit(companyId,entity,recordId,action,beforeJson,afterJson,actorId)
        VALUES(NEW.companyId,'InventorySettings',NEW.companyId,'UPDATE',json_object('method',OLD.method,'inventoryAccount',OLD.inventoryAccount,'cogsAccount',OLD.cogsAccount,'startDate',OLD.startDate),json_object('method',NEW.method,'inventoryAccount',NEW.inventoryAccount,'cogsAccount',NEW.cogsAccount,'startDate',NEW.startDate),NEW.updatedBy);
      END;`);
    // A document that already moved stock is corrected with a credit note, never edited or deleted (its cost is history).
    const posted = (type: string, id: string) => `EXISTS(SELECT 1 FROM InventoryMovement m JOIN InventorySettings s ON s.companyId=m.companyId WHERE m.sourceType='${type}' AND m.sourceId=${id})`;
    for (const [table, child, key, dateColumn, type] of [['Sale', 'SaleItem', 'saleId', 'saleDate', 'SALE'], ['Purchase', 'PurchaseItem', 'purchaseId', 'purchaseDate', 'PURCHASE']] as const) {
      db.exec(`CREATE TRIGGER inventory_posted_${table}_UPDATE BEFORE UPDATE ON ${table} WHEN (NEW.${dateColumn} IS NOT OLD.${dateColumn} OR NEW.companyId IS NOT OLD.companyId) AND ${posted(type, 'OLD.id')} BEGIN SELECT RAISE(ABORT,'INVENTORY_DOCUMENT_POSTED'); END;
        CREATE TRIGGER inventory_posted_${table}_DELETE BEFORE DELETE ON ${table} WHEN ${posted(type, 'OLD.id')} BEGIN SELECT RAISE(ABORT,'INVENTORY_DOCUMENT_POSTED'); END;
        CREATE TRIGGER inventory_posted_${child}_INSERT BEFORE INSERT ON ${child} WHEN ${posted(type, 'NEW.' + key)} BEGIN SELECT RAISE(ABORT,'INVENTORY_DOCUMENT_POSTED'); END;
        CREATE TRIGGER inventory_posted_${child}_UPDATE BEFORE UPDATE ON ${child} WHEN ${posted(type, 'OLD.' + key)} BEGIN SELECT RAISE(ABORT,'INVENTORY_DOCUMENT_POSTED'); END;
        CREATE TRIGGER inventory_posted_${child}_DELETE BEFORE DELETE ON ${child} WHEN ${posted(type, 'OLD.' + key)} BEGIN SELECT RAISE(ABORT,'INVENTORY_DOCUMENT_POSTED'); END;`);
    }
    // Default posting accounts (Lithuanian chart): goods for resale and cost of goods sold. Existing codes are left as they are.
    const account = db.prepare('INSERT OR IGNORE INTO ChartOfAccount (code, name) VALUES (?, ?)');
    account.run('2040', 'Pirktos prekės, skirtos perparduoti');
    account.run('6000', 'Parduotų prekių ir paslaugų savikaina');
    db.prepare("INSERT INTO AppMigration VALUES(?,datetime('now'))").run('2026-10-inventory-v1');
  }).immediate();
}

// v2 (additive): a movement and a layer must reference a stock card of the same company, and a stock card with movements can never
// be deleted, even when the company has no InventorySettings row (v1 guard was bypassed that way). Deleting a whole company removes
// the settings row and the movements first (see DELETE /api/companies/{id}).
export function migrateInventoryGuards(db: Database.Database) {
  db.transaction(() => {
    if (db.prepare('SELECT version FROM AppMigration WHERE version=?').get('2026-10-inventory-v2')) return;
    db.exec(`DROP TRIGGER IF EXISTS inventory_item_guard;
      CREATE TRIGGER inventory_item_guard BEFORE DELETE ON StockItem WHEN EXISTS(SELECT 1 FROM InventoryMovement WHERE stockItemId=OLD.id) BEGIN SELECT RAISE(ABORT,'INVENTORY_ITEM_HAS_MOVEMENTS'); END;
      CREATE TRIGGER inventory_movement_company_INSERT BEFORE INSERT ON InventoryMovement WHEN NOT EXISTS(SELECT 1 FROM StockItem WHERE id=NEW.stockItemId AND companyId=NEW.companyId) BEGIN SELECT RAISE(ABORT,'INVENTORY_ITEM_COMPANY_MISMATCH'); END;
      CREATE TRIGGER inventory_layer_company_INSERT BEFORE INSERT ON InventoryLayer WHEN NOT EXISTS(SELECT 1 FROM StockItem WHERE id=NEW.stockItemId AND companyId=NEW.companyId) BEGIN SELECT RAISE(ABORT,'INVENTORY_ITEM_COMPANY_MISMATCH'); END;`);
    db.prepare("INSERT INTO AppMigration VALUES(?,datetime('now'))").run('2026-10-inventory-v2');
  }).immediate();
  db.transaction(() => {
    if (db.prepare('SELECT version FROM AppMigration WHERE version=?').get('2026-10-inventory-v3')) return;
    db.exec(`CREATE TRIGGER inventory_layer_nonnegative_UPDATE BEFORE UPDATE ON InventoryLayer WHEN NEW.remainingValue < -0.005 OR NEW.remainingQty < -0.000001 BEGIN SELECT RAISE(ABORT,'INVENTORY_LAYER_NEGATIVE'); END;`);
    db.prepare("INSERT INTO AppMigration VALUES(?,datetime('now'))").run('2026-10-inventory-v3');
  }).immediate();
}

// The warehouse a purchase receives into. NULL = 'Pagrindinis', so every purchase made before this column existed behaves as before.
export function migratePurchaseWarehouse(db: Database.Database) {
  db.transaction(() => {
    if (db.prepare('SELECT version FROM AppMigration WHERE version=?').get('2026-10-purchase-warehouse-v1')) return;
    db.exec('ALTER TABLE Purchase ADD COLUMN warehouseName TEXT');
    rebuildAuditTriggers(db, ['Purchase']);
    db.prepare("INSERT INTO AppMigration VALUES(?,datetime('now'))").run('2026-10-purchase-warehouse-v1');
  }).immediate();
}
