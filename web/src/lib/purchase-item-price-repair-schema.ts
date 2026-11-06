import type Database from 'better-sqlite3';

const VERSION = '2026-11-repair-purchase-item-prices';
const TOLERANCE = 0.01;

// One-time repair of imported purchase lines that lost their price (price=0, sumWithoutVat=0, but sumWithVat set), on a zero-VAT purchase.
// Price = sumWithVat / quantity, sumWithoutVat = sumWithVat, vatRate = 0. Purchase headers, ledger and tax codes are not touched.
// Lines of locked periods and of documents that already moved stock are left alone (their triggers forbid edits).
// All-or-nothing: when any affected purchase would not add up to its header, nothing is changed and the migration stays unrecorded.
// Never throws, so a failed repair cannot block start-up.
export function migratePurchaseItemPrices(db: Database.Database) {
  try {
    db.transaction(() => {
      if (db.prepare('SELECT version FROM AppMigration WHERE version=?').get(VERSION)) return;
      const candidates = db.prepare(`SELECT i.id, i.purchaseId, i.quantity, i.sumWithVat FROM PurchaseItem i JOIN Purchase p ON p.id=i.purchaseId
        WHERE i.price=0 AND i.sumWithoutVat=0 AND i.sumWithVat<>0 AND COALESCE(i.vatRate,0)=0 AND i.quantity<>0 AND COALESCE(p.vat,0)=0
        AND NOT EXISTS(SELECT 1 FROM AccountingLock l WHERE l.companyId=p.companyId AND l.lockedThrough IS NOT NULL AND p.purchaseDate<=l.lockedThrough)
        AND NOT EXISTS(SELECT 1 FROM InventoryMovement m WHERE m.sourceType='PURCHASE' AND m.sourceId=p.id)`).all() as { id: number; purchaseId: number; quantity: number; sumWithVat: number }[];
      const update = db.prepare('UPDATE PurchaseItem SET price=?, sumWithoutVat=sumWithVat, vatRate=0 WHERE id=?');
      for (const row of candidates) update.run(Math.round(row.sumWithVat / row.quantity * 1e6) / 1e6, row.id);
      const purchases = [...new Set(candidates.map(r => r.purchaseId))];
      const totals = db.prepare(`SELECT p.sumWithoutVat AS headNet, p.sumWithVat AS headGross, (SELECT COALESCE(SUM(sumWithoutVat),0) FROM PurchaseItem WHERE purchaseId=p.id) AS itemNet,
        (SELECT COALESCE(SUM(sumWithVat),0) FROM PurchaseItem WHERE purchaseId=p.id) AS itemGross FROM Purchase p WHERE p.id=?`);
      const bad = purchases.filter(id => {
        const t = totals.get(id) as { headNet: number; headGross: number; itemNet: number; itemGross: number };
        return Math.abs(t.itemNet - t.headNet) > TOLERANCE || Math.abs(t.itemGross - t.headGross) > TOLERANCE;
      });
      if (bad.length) throw new Error(`totals would not match the document header for purchases ${bad.slice(0, 20).join(', ')}${bad.length > 20 ? ' ...' : ''}`);
      db.prepare("INSERT INTO AppMigration VALUES(?,datetime('now'))").run(VERSION);
      if (candidates.length) console.log(`Migration ${VERSION}: repaired ${candidates.length} purchase lines in ${purchases.length} purchases (audited in AccountingAudit).`);
    }).immediate();
  } catch (error) {
    console.error(`Migration ${VERSION} was rolled back and will be retried on the next start:`, error);
  }
}
