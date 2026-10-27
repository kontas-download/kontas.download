import type Database from 'better-sqlite3';
import { HttpError } from './errors';
import { todayVilnius } from './dates';

// Perpetual inventory with weighted average or FIFO costing (schema in inventory-schema.ts).
// Movements are processed in posting order; each one stores the running balance after it. OFF (the default) changes nothing.
export type CostMethod = 'OFF' | 'AVERAGE' | 'FIFO';
export const COST_METHODS: CostMethod[] = ['OFF', 'AVERAGE', 'FIFO'];
export interface InventorySettingsRow { companyId: number; method: CostMethod; inventoryAccount: string; cogsAccount: string; startDate: string | null; updatedAt: string | null; updatedBy: number | null; }
interface Balance { qty: number; value: number; }
interface Layer { id: number; remainingQty: number; remainingValue: number; }
interface MovementInput {
  companyId: number; stockItemId: number; date: string; kind: 'OPENING' | 'RECEIPT' | 'ISSUE' | 'ADJUST_QTY' | 'ADJUST_COST';
  method: 'AVERAGE' | 'FIFO'; quantity: number; amount: number; debitAccount: string | null; creditAccount: string | null;
  sourceType: 'OPENING' | 'PURCHASE' | 'SALE' | 'MANUAL'; sourceId: number | null; sourceLineId: number | null; docNumber: string | null; reason: string | null; actorId: number | null;
}

const EPS = 1e-9;
const r2 = (n: number) => (n < 0 ? -1 : 1) * Math.round(Math.abs(n) * 100 + 1e-7) / 100;
const r6 = (n: number) => (n < 0 ? -1 : 1) * Math.round(Math.abs(n) * 1e6 + 1e-7) / 1e6;
const isDate = (value: unknown): value is string => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value + 'T00:00:00Z'));

export function inventorySettings(db: Database.Database, companyId: number): InventorySettingsRow {
  const row = db.prepare('SELECT companyId,method,inventoryAccount,cogsAccount,startDate,updatedAt,updatedBy FROM InventorySettings WHERE companyId=?').get(companyId) as InventorySettingsRow | undefined;
  return row || { companyId, method: 'OFF', inventoryAccount: '2040', cogsAccount: '6000', startDate: null, updatedAt: null, updatedBy: null };
}

function balance(db: Database.Database, stockItemId: number): Balance {
  const row = db.prepare('SELECT balanceQty qty, balanceValue value FROM InventoryMovement WHERE stockItemId=? ORDER BY id DESC LIMIT 1').get(stockItemId) as Balance | undefined;
  return row || { qty: 0, value: 0 };
}
const unitCostOf = (b: Balance) => (b.qty > EPS ? b.value / b.qty : 0);

function insertMovement(db: Database.Database, m: MovementInput, after: Balance, unitCost: number) {
  const res = db.prepare(`INSERT INTO InventoryMovement(companyId,stockItemId,date,kind,method,quantity,amount,unitCost,balanceQty,balanceValue,debitAccount,creditAccount,sourceType,sourceId,sourceLineId,docNumber,reason,actorId)
    VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(m.companyId, m.stockItemId, m.date, m.kind, m.method, r6(m.quantity), r2(m.amount), r6(unitCost), r6(after.qty), r2(after.value),
    m.debitAccount, m.creditAccount, m.sourceType, m.sourceId, m.sourceLineId, m.docNumber, m.reason, m.actorId);
  // The stock card shows the tracked balance once the item is under inventory accounting.
  db.prepare('UPDATE StockItem SET stock=?, remainder=?, cost=? WHERE id=?').run(r6(after.qty), r6(after.qty), after.qty > EPS ? r6(after.value / after.qty) : 0, m.stockItemId);
  return Number(res.lastInsertRowid);
}

// Adds quantity at a known value (opening balance, purchase, sales return, positive count difference).
function receive(db: Database.Database, m: MovementInput) {
  const before = balance(db, m.stockItemId);
  const after = { qty: before.qty + m.quantity, value: r2(before.value + m.amount) };
  const id = insertMovement(db, m, after, m.quantity > EPS ? m.amount / m.quantity : 0);
  if (m.method === 'FIFO') db.prepare('INSERT INTO InventoryLayer(companyId,stockItemId,movementId,date,quantity,remainingQty,remainingValue) VALUES(?,?,?,?,?,?,?)').run(m.companyId, m.stockItemId, id, m.date, r6(m.quantity), r6(m.quantity), r2(m.amount));
  return id;
}

// Removes quantity at the method's cost. Throws (and so rolls back the whole document) when there is not enough stock.
// preferLayers: FIFO layers to consume first (a purchase return takes back the goods of the original receipt).
function issue(db: Database.Database, m: Omit<MovementInput, 'amount'>, itemName: string, preferLayers: number[] = []) {
  const before = balance(db, m.stockItemId);
  if (m.quantity > before.qty + EPS) throw new HttpError(409, `Nepakanka atsargų: „${itemName}“ likutis ${r6(before.qty)}, reikia ${r6(m.quantity)}`);
  let cost: number;
  if (m.method === 'AVERAGE') {
    cost = Math.abs(m.quantity - before.qty) < EPS ? before.value : r2(m.quantity * unitCostOf(before));
  } else {
    const layers = db.prepare('SELECT id,remainingQty,remainingValue,movementId FROM InventoryLayer WHERE stockItemId=? AND remainingQty>? ORDER BY id').all(m.stockItemId, EPS) as (Layer & { movementId: number })[];
    layers.sort((a, b) => Number(preferLayers.includes(b.movementId)) - Number(preferLayers.includes(a.movementId)) || a.id - b.id);
    let left = m.quantity; cost = 0;
    const update = db.prepare('UPDATE InventoryLayer SET remainingQty=?, remainingValue=? WHERE id=?');
    for (const layer of layers) {
      if (left <= EPS) break;
      const take = Math.min(left, layer.remainingQty);
      const value = Math.abs(take - layer.remainingQty) < EPS ? layer.remainingValue : r2(take * layer.remainingValue / layer.remainingQty);
      update.run(r6(layer.remainingQty - take), r2(layer.remainingValue - value), layer.id);
      cost += value; left -= take;
    }
    cost = r2(cost);
    if (Math.abs(m.quantity - before.qty) < EPS) cost = before.value;
  }
  const after = { qty: before.qty - m.quantity, value: r2(before.value - cost) };
  if (Math.abs(after.qty) < EPS) { after.qty = 0; after.value = 0; }
  const id = insertMovement(db, { ...m, amount: cost }, after, m.quantity > EPS ? cost / m.quantity : 0);
  return { id, cost };
}

// The stock card is the opening balance the first time an item takes part in inventory accounting.
function ensureOpening(db: Database.Database, companyId: number, method: 'AVERAGE' | 'FIFO', item: { id: number; remainder: number | null; cost: number | null }, date: string, actorId: number | null) {
  if (db.prepare('SELECT 1 FROM InventoryMovement WHERE stockItemId=? LIMIT 1').get(item.id)) return;
  const qty = r6(Number(item.remainder) || 0);
  if (qty <= EPS) return;
  receive(db, { companyId, stockItemId: item.id, date, kind: 'OPENING', method, quantity: qty, amount: r2(qty * (Number(item.cost) || 0)), debitAccount: null, creditAccount: null, sourceType: 'OPENING', sourceId: null, sourceLineId: null, docNumber: null, reason: 'Pradinis likutis iš atsargų kortelės', actorId });
}

interface StockRow { id: number; name: string; remainder: number | null; cost: number | null; warehouseName: string | null; }
export function findItem(db: Database.Database, companyId: number, code: string | null, warehouse: string | null): StockRow | undefined {
  const key = (code || '').trim();
  if (!key) return undefined;
  const cards = db.prepare('SELECT id,name,remainder,cost,warehouseName FROM StockItem WHERE companyId=? AND (TRIM(code)=? OR TRIM(barcode)=?) ORDER BY id').all(companyId, key, key) as StockRow[];
  const docWarehouse = warehouse || 'Pagrindinis';
  if (cards.length === 1 && (cards[0].warehouseName || 'Pagrindinis') !== docWarehouse) throw new HttpError(409, `Kodas „${key}“ yra sandėlyje „${cards[0].warehouseName || 'Pagrindinis'}“, o dokumente nurodytas kitas sandėlys „${docWarehouse}“: pasirinkite arba pataisykite sandėlį`);
  if (cards.length <= 1) return cards[0];
  const matching = cards.filter(c => (c.warehouseName || 'Pagrindinis') === docWarehouse);
  if (matching.length === 1) return matching[0];
  throw new HttpError(409, matching.length ? `Kodas „${key}“ kartojasi sandėlyje „${warehouse || 'Pagrindinis'}“: sutvarkykite atsargų korteles` : `Kodas „${key}“ yra keliuose sandėliuose, o dokumente nurodytas sandėlys „${warehouse || 'Pagrindinis'}“ neatitinka nė vienos kortelės: pasirinkite arba pataisykite sandėlį`);
}

// Creates the inventory movements of a sales invoice or purchase that was just inserted (same transaction).
// Lines are linked to stock cards by item code (or barcode); lines without a matching card are services and are skipped.
// Sale -> issue at cost (Dr COGS / Cr inventory); purchase -> receipt (Dr inventory / Cr the purchase's debit account).
// Credit notes: a sales credit note returns goods at the cost they were issued at; a supplier credit note issues the goods back.
export function postDocumentInventory(db: Database.Database, companyId: number, sourceType: 'SALE' | 'PURCHASE', docId: number, actorId: number | null = null) {
  const settings = inventorySettings(db, companyId);
  if (settings.method === 'OFF') return 0;
  const method = settings.method;
  const doc = (sourceType === 'SALE'
    ? db.prepare("SELECT id, saleDate date, TRIM(COALESCE(series,'')||' '||COALESCE(number,'')) docNumber, docType, originalSaleId originalId, warehouseName, NULL debitAccount FROM Sale WHERE id=? AND companyId=?").get(docId, companyId)
    : db.prepare("SELECT id, purchaseDate date, TRIM(COALESCE(series,'')||' '||COALESCE(number,'')) docNumber, docType, originalPurchaseId originalId, warehouseName, debitAccount FROM Purchase WHERE id=? AND companyId=?").get(docId, companyId)) as
    { id: number; date: string; docNumber: string; docType: string | null; originalId: number | null; warehouseName: string | null; debitAccount: string | null } | undefined;
  if (!doc) return 0;
  if (settings.startDate && doc.date < settings.startDate) return 0;
  const lines = db.prepare(sourceType === 'SALE' ? 'SELECT id,itemName,itemCode,quantity,sumWithoutVat,sumWithVat FROM SaleItem WHERE saleId=? ORDER BY id' : 'SELECT id,itemName,itemCode,quantity,sumWithoutVat,sumWithVat FROM PurchaseItem WHERE purchaseId=? ORDER BY id').all(docId) as { id: number; itemName: string; itemCode: string | null; quantity: number; sumWithoutVat: number; sumWithVat: number }[];
  const credit = doc.docType === 'KS';
  const purchaseAccount = doc.debitAccount || '6118';
  let count = 0;
  // The purchase ledger debits net + non-deductible VAT to the inventory account, so the receipt takes the same basis (spread by each line's own VAT).
  const taxRow = sourceType === 'PURCHASE' ? db.prepare('SELECT vat, deductibleVat FROM Purchase WHERE id=?').get(docId) as { vat: number; deductibleVat: number | null } : undefined;
  const extraTotal = taxRow ? Math.abs(r2(taxRow.vat - (taxRow.deductibleVat ?? taxRow.vat))) : 0;
  const lineVat = (l: { sumWithoutVat: number; sumWithVat: number }) => Math.abs(Math.abs(l.sumWithVat) - Math.abs(l.sumWithoutVat));
  const vatTotal = lines.reduce((sum, l) => sum + lineVat(l), 0);
  const lastVatLine = lines.reduce((last, l, i) => (lineVat(l) > EPS ? i : last), -1);
  let vatSoFar = 0, extraSoFar = 0;
  for (const [index, line] of lines.entries()) {
    let extra = 0;
    if (extraTotal > 0 && vatTotal > EPS && lineVat(line) > EPS) {
      vatSoFar += lineVat(line);
      extra = r2((index === lastVatLine ? extraTotal : r2(extraTotal * vatSoFar / vatTotal)) - extraSoFar);
      extraSoFar = r2(extraSoFar + extra);
    }
    const item = findItem(db, companyId, line.itemCode, doc.warehouseName);
    const qty = r6(Math.abs(Number(line.quantity) || 0));
    if (!item || qty <= EPS) continue;
    ensureOpening(db, companyId, method, item, doc.date, actorId);
    const base = { companyId, stockItemId: item.id, date: doc.date, method, quantity: qty, sourceType, sourceId: doc.id, sourceLineId: line.id, docNumber: doc.docNumber, actorId } as const;
    if (sourceType === 'SALE' && !credit) {
      issue(db, { ...base, kind: 'ISSUE', debitAccount: settings.cogsAccount, creditAccount: settings.inventoryAccount, reason: 'Parduotų prekių savikaina' }, item.name);
    } else if (sourceType === 'SALE') {
      // Return from a customer: back into stock at the cost of the original issue (current cost when the original was not tracked).
      const original = doc.originalId ? db.prepare("SELECT SUM(quantity) q, SUM(amount) a FROM InventoryMovement WHERE companyId=? AND sourceType='SALE' AND sourceId=? AND stockItemId=? AND kind='ISSUE'").get(companyId, doc.originalId, item.id) as { q: number | null; a: number | null } : undefined;
      const unit = original?.q ? (original.a || 0) / original.q : unitCostOf(balance(db, item.id)) || Number(item.cost) || 0;
      receive(db, { ...base, kind: 'RECEIPT', amount: r2(qty * unit), debitAccount: settings.inventoryAccount, creditAccount: settings.cogsAccount, reason: 'Prekių grąžinimas iš pirkėjo' });
    } else if (!credit) {
      receive(db, { ...base, kind: 'RECEIPT', amount: r2(Math.abs(line.sumWithoutVat) + extra), debitAccount: settings.inventoryAccount, creditAccount: purchaseAccount, reason: 'Prekių pajamavimas' });
    } else {
      const receipts = doc.originalId ? (db.prepare("SELECT id FROM InventoryMovement WHERE companyId=? AND sourceType='PURCHASE' AND sourceId=? AND stockItemId=? AND kind='RECEIPT'").all(companyId, doc.originalId, item.id) as { id: number }[]).map(r => r.id) : [];
      issue(db, { ...base, kind: 'ISSUE', debitAccount: purchaseAccount, creditAccount: settings.inventoryAccount, reason: 'Prekių grąžinimas tiekėjui' }, item.name, receipts);
    }
    count++;
  }
  return count;
}

function checkAccount(db: Database.Database, value: unknown, label: string): string {
  if (typeof value !== 'string' || !/^\d{3,6}$/.test(value)) throw new HttpError(400, `Neteisinga ${label} sąskaita`);
  if (value.startsWith('44') || value === '2444' || value === '2410' || value.startsWith('27')) throw new HttpError(400, 'Atsiskaitymų, PVM ir pinigų sąskaitų atsargų apskaitai naudoti negalima');
  if (!db.prepare('SELECT 1 FROM ChartOfAccount WHERE code=?').get(value)) throw new HttpError(400, `Sąskaita ${value} nerasta sąskaitų plane`);
  return value;
}

// Once movements exist the method can only be switched OFF and back to the same method: mixing methods would break the cost history.
export function saveInventorySettings(db: Database.Database, companyId: number, body: any, actorId: number | null) {
  const current = inventorySettings(db, companyId);
  const method = body?.method;
  if (!COST_METHODS.includes(method)) throw new HttpError(400, 'Neteisingas savikainos metodas');
  const inventoryAccount = checkAccount(db, body?.inventoryAccount ?? current.inventoryAccount, 'atsargų');
  const cogsAccount = checkAccount(db, body?.cogsAccount ?? current.cogsAccount, 'savikainos');
  if (inventoryAccount === cogsAccount) throw new HttpError(400, 'Atsargų ir savikainos sąskaitos turi skirtis');
  const used = db.prepare('SELECT method FROM InventoryMovement WHERE companyId=? ORDER BY id LIMIT 1').get(companyId) as { method: string } | undefined;
  if (used && method !== 'OFF' && method !== used.method) throw new HttpError(409, 'Savikainos metodo keisti negalima: įmonė jau turi atsargų judėjimų kitu metodu');
  let startDate = current.startDate;
  if (!used && body?.startDate !== undefined && body.startDate !== null && body.startDate !== '') {
    if (!isDate(body.startDate)) throw new HttpError(400, 'Neteisinga apskaitos pradžios data');
    startDate = body.startDate;
  }
  if (!startDate && method !== 'OFF') startDate = todayVilnius();
  db.prepare(`INSERT INTO InventorySettings(companyId,method,inventoryAccount,cogsAccount,startDate,updatedAt,updatedBy) VALUES(?,?,?,?,?,strftime('%Y-%m-%dT%H:%M:%fZ','now'),?)
    ON CONFLICT(companyId) DO UPDATE SET method=excluded.method,inventoryAccount=excluded.inventoryAccount,cogsAccount=excluded.cogsAccount,startDate=excluded.startDate,updatedAt=excluded.updatedAt,updatedBy=excluded.updatedBy`)
    .run(companyId, method, inventoryAccount, cogsAccount, startDate, actorId);
  return inventorySettings(db, companyId);
}

// Accountant's last word: a manual quantity or value correction with a mandatory reason. It is a new movement (with its journal
// entry and audit row); earlier movements are never changed.
export function adjustInventory(db: Database.Database, companyId: number, body: any, actorId: number | null) {
  const settings = inventorySettings(db, companyId);
  if (settings.method === 'OFF') throw new HttpError(409, 'Atsargų apskaita išjungta: pirmiausia pasirinkite savikainos metodą');
  const method = settings.method;
  const stockItemId = Number(body?.stockItemId);
  const item = Number.isSafeInteger(stockItemId) ? db.prepare('SELECT id,name,remainder,cost,warehouseName FROM StockItem WHERE id=? AND companyId=?').get(stockItemId, companyId) as StockRow | undefined : undefined;
  if (!item) throw new HttpError(404, 'Atsargų kortelė nerasta');
  const date = body?.date || todayVilnius();
  if (!isDate(date)) throw new HttpError(400, 'Neteisinga data');
  const reason = typeof body?.reason === 'string' ? body.reason.trim() : '';
  if (!reason || reason.length > 500) throw new HttpError(400, 'Nurodykite koregavimo priežastį (iki 500 simbolių)');
  const account = checkAccount(db, body?.account || settings.cogsAccount, 'koresponduojanti');
  if (account === settings.inventoryAccount) throw new HttpError(400, 'Koresponduojanti sąskaita turi skirtis nuo atsargų sąskaitos');
  const kind = body?.kind;
  const num = (value: unknown) => (typeof value === 'number' || (typeof value === 'string' && value.trim() !== '')) && Number.isFinite(Number(value)) ? Number(value) : NaN;
  return db.transaction(() => {
    ensureOpening(db, companyId, method, item, date, actorId);
    const base = { companyId, stockItemId: item.id, date, method, sourceType: 'MANUAL' as const, sourceId: null, sourceLineId: null, docNumber: null, reason, actorId };
    if (kind === 'ADJUST_QTY') {
      const delta = r6(num(body?.quantity));
      if (!Number.isFinite(delta) || Math.abs(delta) <= EPS) throw new HttpError(400, 'Nurodykite kiekio pokytį (teigiamą arba neigiamą)');
      if (delta < 0) return issue(db, { ...base, kind: 'ADJUST_QTY', quantity: -delta, debitAccount: account, creditAccount: settings.inventoryAccount }, item.name).id;
      const given = body?.unitCost === undefined || body?.unitCost === '' || body?.unitCost === null ? NaN : num(body.unitCost);
      const unit = Number.isFinite(given) ? given : unitCostOf(balance(db, item.id)) || Number(item.cost) || 0;
      if (unit < 0) throw new HttpError(400, 'Vieneto savikaina negali būti neigiama');
      return receive(db, { ...base, kind: 'ADJUST_QTY', quantity: delta, amount: r2(delta * unit), debitAccount: settings.inventoryAccount, creditAccount: account });
    }
    if (kind === 'ADJUST_COST') {
      const delta = r2(num(body?.amount));
      if (!Number.isFinite(delta) || delta === 0) throw new HttpError(400, 'Nurodykite vertės pokytį eurais (teigiamą arba neigiamą)');
      const before = balance(db, item.id);
      if (before.qty <= EPS) throw new HttpError(409, 'Vertę galima koreguoti tik turint likutį');
      if (before.value + delta < -0.005) throw new HttpError(409, 'Atsargų vertė negali tapti neigiama');
      const after = { qty: before.qty, value: r2(before.value + delta) };
      const id = insertMovement(db, { ...base, kind: 'ADJUST_COST', quantity: 0, amount: delta, debitAccount: delta > 0 ? settings.inventoryAccount : account, creditAccount: delta > 0 ? account : settings.inventoryAccount }, after, after.value / after.qty);
      if (method === 'FIFO') {
        // Spread the change by quantity; a write-down is capped so no layer goes below 0 and the excess moves to the other layers.
        const layers = db.prepare('SELECT id,remainingQty,remainingValue FROM InventoryLayer WHERE stockItemId=? AND remainingQty>? ORDER BY id').all(item.id, EPS) as Layer[];
        const parts = layers.map(() => 0);
        let left = delta;
        let open = layers.map((_, i) => i);
        while (Math.abs(left) >= 0.005 && open.length) {
          const qtyLeft = open.reduce((sum, i) => sum + layers[i].remainingQty, 0);
          const next: number[] = [];
          let given = 0;
          open.forEach((i, n) => {
            let part = n === open.length - 1 ? r2(left - given) : r2(left * layers[i].remainingQty / qtyLeft);
            const room = layers[i].remainingValue + parts[i];
            if (part < 0 && -part > room) part = -room;
            else next.push(i);
            parts[i] = r2(parts[i] + part); given = r2(given + part);
          });
          left = r2(left - given);
          open = left < 0 ? next : open;
          if (left > 0) break;
        }
        const update = db.prepare('UPDATE InventoryLayer SET remainingValue=? WHERE id=?');
        layers.forEach((layer, i) => update.run(r2(layer.remainingValue + parts[i]), layer.id));
      }
      return id;
    }
    throw new HttpError(400, 'Neteisingas koregavimo tipas');
  })();
}

export function inventoryOverview(db: Database.Database, companyId: number) {
  return db.prepare(`SELECT s.id, s.name, s.code, s.warehouseName,
      (SELECT balanceQty FROM InventoryMovement m WHERE m.stockItemId=s.id ORDER BY m.id DESC LIMIT 1) balanceQty,
      (SELECT balanceValue FROM InventoryMovement m WHERE m.stockItemId=s.id ORDER BY m.id DESC LIMIT 1) balanceValue,
      (SELECT COUNT(*) FROM InventoryMovement m WHERE m.stockItemId=s.id) movements,
      (SELECT COALESCE(SUM(amount),0) FROM InventoryMovement m WHERE m.stockItemId=s.id AND m.kind='ISSUE' AND m.sourceType='SALE') cogs
    FROM StockItem s WHERE s.companyId=? ORDER BY s.name, s.id`).all(companyId);
}

export function itemMovements(db: Database.Database, companyId: number, stockItemId: number) {
  return db.prepare('SELECT id,date,kind,method,quantity,amount,unitCost,balanceQty,balanceValue,debitAccount,creditAccount,sourceType,sourceId,docNumber,reason,actorId,createdAt FROM InventoryMovement WHERE companyId=? AND stockItemId=? ORDER BY id').all(companyId, stockItemId);
}
