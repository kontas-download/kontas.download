import { migrateDocuments } from './document-schema';
import { migratePurchaseCorrections } from './purchase-correction-schema';
import { migrateTax, migratePurchaseAccount, migrateSaleCorrections, migrateInvoiceArchive } from './tax-schema';
import { migrateControls, migrateAuditColumns } from './control-schema';
import { extensions } from '../extensions/registry';
import { migratePayments, migrateManualSettlements, migratePaymentGuards, migrateReminders, migrateTaxCalendar, migrateRecurring, migratePurchaseSources } from './payment-schema';
import { migrateAccounting } from './accounting-schema';
import { migrateDocumentLanguage } from './document-language-schema';
import { migratePaymentAudit } from './data-transfer-schema';
import { migrateTaxCodes, migrateTaxCodeReview } from './tax-code-schema';
import { migrateUsers } from './user-schema';
import Database from 'better-sqlite3';
import path from 'node:path';
let dbInstance: Database.Database | null = null;
export function getDb() {
  if (!dbInstance) {
    const configured = process.env.DATABASE_URL;
    const dbPath = configured?.startsWith('file:') ? configured.slice(5) : path.join(process.cwd(), 'prisma', 'dev.db');
    const db = new Database(dbPath);
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');
    db.pragma('busy_timeout = 5000');
    db.exec('CREATE TABLE IF NOT EXISTS AuthSession (tokenHash TEXT PRIMARY KEY, userId INTEGER NOT NULL REFERENCES User(id) ON DELETE CASCADE, expiresAt INTEGER NOT NULL); CREATE INDEX IF NOT EXISTS idx_session_expiry ON AuthSession(expiresAt); CREATE TABLE IF NOT EXISTS LoginAttempt (email TEXT PRIMARY KEY, attempts INTEGER NOT NULL, resetAt INTEGER NOT NULL);');
    migrateAccounting(db);
    migrateDocuments(db);
    migrateTax(db);
    migratePurchaseAccount(db);
    migrateSaleCorrections(db);
    migratePurchaseCorrections(db);
    migrateInvoiceArchive(db);
    migratePayments(db);
    migrateManualSettlements(db);
    migratePaymentGuards(db);
    migrateReminders(db);
    migrateTaxCalendar(db);
    migrateRecurring(db);
    migratePurchaseSources(db);
    migrateControls(db);
    migrateDocumentLanguage(db);
    for (const extension of extensions) {
      try { extension.migrate?.(db); } catch (error) { console.error(`Extension "${extension.id}" migration failed and the extension is not usable until fixed:`, error); }
    }
    migrateAuditColumns(db);
    migratePaymentAudit(db);
    migrateTaxCodes(db);
    migrateTaxCodeReview(db);
    migrateUsers(db);
    dbInstance = db;
  }
  return dbInstance;
}
