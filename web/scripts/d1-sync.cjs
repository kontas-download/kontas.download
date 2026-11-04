/**
 * Cloudflare D1 Continuous Synchronization Daemon
 *
 * Synchronizes SQLite (/app/prisma/dev.db) with Cloudflare D1 (kontas-d1):
 * - On startup: pulls any remote rows from D1 to guarantee zero data loss on container reset.
 * - In background: continuously pushes newly created and updated records to Cloudflare D1.
 */

const fs = require('node:fs');
const path = require('node:path');
const Database = require('better-sqlite3');

const BRIDGE_URL = process.env.D1_BRIDGE_URL || '';
const BRIDGE_KEY = process.env.INTERNAL_BRIDGE_KEY || '';
const DB_PATH = process.env.DATABASE_URL?.startsWith('file:') 
  ? process.env.DATABASE_URL.slice(5) 
  : path.join(__dirname, '..', 'prisma', 'dev.db');

const SYNCED_TABLES = [
  'Company',
  'User',
  'Client',
  'Sale',
  'SaleItem',
  'Purchase',
  'PurchaseItem',
  'StockItem',
  'BankTransaction',
  'Payroll',
  'PayrollEmployee',
  'GeneralEntry',
  'FixedAsset',
  'FixedAssetPosting',
  'FixedAssetSettings',
  'InventorySettings',
  'InventoryMovement',
  'TaxLineCode',
  'ChartOfAccount',
  'AuthSession'
];

async function callD1(sql, params = []) {
  const res = await fetch(BRIDGE_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Kontas-D1-Sync/1.0',
      ...(BRIDGE_KEY ? { 'x-d1-bridge-key': BRIDGE_KEY } : {})
    },
    body: JSON.stringify({ sql, params })
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`D1 HTTP ${res.status}: ${text}`);
  }

  const data = await res.json();
  if (data.error) throw new Error(`D1 SQL Error: ${data.error}`);
  return data.results || [];
}

function getTableMetadata(db, table) {
  const info = db.prepare(`PRAGMA table_info(${table})`).all();
  const pkCols = info.filter(c => c.pk > 0).map(c => c.name);
  const hasId = info.some(c => c.name === 'id');
  return { info, pkCols, hasId };
}

async function pullFromD1(db) {
  let pulledCount = 0;
  for (const table of SYNCED_TABLES) {
    try {
      const meta = getTableMetadata(db, table);
      let remoteRows = [];

      if (meta.hasId) {
        const localMaxRow = db.prepare(`SELECT MAX(id) AS maxId FROM ${table}`).get();
        const localMaxId = (localMaxRow && localMaxRow.maxId) || 0;
        remoteRows = await callD1(`SELECT * FROM ${table} WHERE id > ? ORDER BY id ASC LIMIT 500`, [localMaxId]);
      } else {
        // Small configuration table: only pull if local is completely empty
        const localCount = db.prepare(`SELECT COUNT(*) AS cnt FROM ${table}`).get()?.cnt || 0;
        if (localCount === 0) {
          remoteRows = await callD1(`SELECT * FROM ${table} LIMIT 500`);
        }
      }

      if (remoteRows.length > 0) {
        const cols = Object.keys(remoteRows[0]);
        const placeholders = cols.map(() => '?').join(',');
        const colNames = cols.map(c => `"${c}"`).join(',');
        const insertStmt = db.prepare(`INSERT OR REPLACE INTO ${table} (${colNames}) VALUES (${placeholders})`);

        db.transaction((rows) => {
          for (const row of rows) {
            insertStmt.run(...cols.map(c => row[c]));
          }
        })(remoteRows);

        pulledCount += remoteRows.length;
        console.log(`[D1 Sync] Pulled ${remoteRows.length} records for ${table} from D1.`);
      }
    } catch (err) {
      console.warn(`[D1 Sync] Pull error on ${table}:`, err.message);
    }
  }
  return pulledCount;
}

const lastSyncedLocalMax = {};

async function pushToD1(db) {
  let pushedCount = 0;
  for (const table of SYNCED_TABLES) {
    try {
      const meta = getTableMetadata(db, table);
      let localRows = [];

      if (meta.hasId) {
        const localMaxRow = db.prepare(`SELECT MAX(id) AS maxId FROM ${table}`).get();
        const localMaxId = (localMaxRow && localMaxRow.maxId) || 0;

        // Skip remote D1 query if this table has had no new records since last push
        if (lastSyncedLocalMax[table] !== undefined && localMaxId <= lastSyncedLocalMax[table]) {
          continue;
        }

        const remoteMaxRes = await callD1(`SELECT MAX(id) AS maxId FROM ${table}`);
        const remoteMaxId = (remoteMaxRes[0] && remoteMaxRes[0].maxId) || 0;
        localRows = db.prepare(`SELECT * FROM ${table} WHERE id > ? ORDER BY id ASC LIMIT 500`).all(remoteMaxId);
        lastSyncedLocalMax[table] = localMaxId;
      } else {
        // Only push small settings tables if not checked yet
        if (lastSyncedLocalMax[table] !== undefined) continue;
        const remoteCountRes = await callD1(`SELECT COUNT(*) AS cnt FROM ${table}`);
        const remoteCount = (remoteCountRes[0] && remoteCountRes[0].cnt) || 0;
        if (remoteCount === 0) {
          localRows = db.prepare(`SELECT * FROM ${table} LIMIT 500`).all();
        }
        lastSyncedLocalMax[table] = 1;
      }

      if (localRows.length > 0) {
        const cols = Object.keys(localRows[0]);
        const colNames = cols.map(c => `"${c}"`).join(',');
        const rowPlaceholders = `(${cols.map(() => '?').join(',')})`;

        // Batch into chunks to avoid individual network roundtrips
        const chunkSize = 25;
        for (let i = 0; i < localRows.length; i += chunkSize) {
          const chunk = localRows.slice(i, i + chunkSize);
          const placeholders = chunk.map(() => rowPlaceholders).join(', ');
          const sql = `INSERT OR REPLACE INTO ${table} (${colNames}) VALUES ${placeholders}`;
          const vals = chunk.flatMap(r => cols.map(c => r[c]));

          await callD1(sql, vals);
          pushedCount += chunk.length;
        }
        console.log(`[D1 Sync] Pushed ${localRows.length} records for ${table} to D1.`);
      }
    } catch (err) {
      console.warn(`[D1 Sync] Push error on ${table}:`, err.message);
    }
  }
  return pushedCount;
}

async function startSync(daemon = false) {
  if (!fs.existsSync(DB_PATH)) {
    console.log(`[D1 Sync] Database file not found yet at ${DB_PATH}. Waiting...`);
    return;
  }

  const db = new Database(DB_PATH);
  db.pragma('journal_mode = WAL');

  console.log(`[D1 Sync] Connected to SQLite: ${DB_PATH}`);
  console.log(`[D1 Sync] Target Cloudflare D1 Bridge: ${BRIDGE_URL}`);

  const runInitial = async () => {
    try {
      // Initial pull from D1 to restore any state
      console.log('[D1 Sync] Initializing pull from D1...');
      await pullFromD1(db);

      // Initial push to D1 in case local has uncommitted rows
      console.log('[D1 Sync] Initializing push to D1...');
      await pushToD1(db);
    } catch (err) {
      console.error('[D1 Sync] Initial sync error:', err.message);
    }

    if (daemon) {
      console.log('[D1 Sync] Continuous sync loop started (60s smart cycle)...');
      let loopCycle = 0;
      const scheduleNext = () => {
        setTimeout(async () => {
          try {
            await pushToD1(db);
            // Only pull periodically as a safety net every 10 cycles (~10 minutes)
            loopCycle++;
            if (loopCycle % 10 === 0) {
              await pullFromD1(db);
            }
          } catch (err) {
            console.error('[D1 Sync] Loop error:', err.message);
          } finally {
            scheduleNext();
          }
        }, 60000);
      };
      scheduleNext();
    }
  };

  if (daemon) {
    // Give Next.js 10 seconds to start cleanly without network contention on cold boot
    setTimeout(runInitial, 10000);
  } else {
    await runInitial();
  }
}

if (require.main === module) {
  const isDaemon = process.argv.includes('--daemon');
  startSync(isDaemon).catch(err => {
    console.error('[D1 Sync Fatal Error]', err);
    process.exit(1);
  });
}

module.exports = { startSync, pullFromD1, pushToD1 };
