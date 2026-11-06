import type Database from 'better-sqlite3';

// Euro reference rates of the European Central Bank (cache) and the original foreign currency amounts of a purchase created from a
// received document. Additive only. The purchase itself always holds the EUR amounts; PurchaseForeignAmount keeps what the document printed.
export function migrateExchangeRates(db: Database.Database) {
  db.transaction(() => {
    if (db.prepare('SELECT version FROM AppMigration WHERE version=?').get('2026-11-exchange-rates-v1')) return;
    db.exec(`CREATE TABLE IF NOT EXISTS ExchangeRate(
        date TEXT NOT NULL,
        currency TEXT NOT NULL,
        rate REAL NOT NULL CHECK(rate>0),
        source TEXT NOT NULL DEFAULT 'ECB',
        PRIMARY KEY(date,currency));
      CREATE TABLE IF NOT EXISTS ExchangeRateFeed(
        feed TEXT PRIMARY KEY,
        fromDate TEXT NOT NULL,
        toDate TEXT NOT NULL,
        fetchedAt TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS PurchaseForeignAmount(
        purchaseId INTEGER PRIMARY KEY REFERENCES Purchase(id) ON DELETE CASCADE,
        companyId INTEGER NOT NULL REFERENCES Company(id) ON DELETE CASCADE,
        currency TEXT NOT NULL,
        rate REAL NOT NULL CHECK(rate>0),
        rateDate TEXT,
        rateSource TEXT NOT NULL CHECK(rateSource IN ('ECB','MANUAL')),
        net REAL NOT NULL,
        vat REAL NOT NULL,
        gross REAL NOT NULL);`);
    db.prepare("INSERT INTO AppMigration VALUES(?,datetime('now'))").run('2026-11-exchange-rates-v1');
  })();
}
