import type Database from 'better-sqlite3';
import { todayVilnius } from './dates';
import { HttpError } from './errors';
import { cents } from './money';
import { rules } from './rules';
import { dateValue } from './validation';

// Fixed asset register and depreciation. Depreciation starts in the month after the asset is put into use and runs to the
// month of disposal inclusive. Straight-line is the default; double declining balance (factor from the rules registry) can be
// chosen per company and overridden per asset. Changes of method, useful life, residual value or factor are prospective: the
// remaining depreciable amount is spread over the remaining months, and every change is logged with a reason.
export const ASSET_CATEGORIES = ['BUILDING', 'MACHINERY', 'VEHICLE', 'COMPUTER', 'FURNITURE', 'INTANGIBLE', 'OTHER'] as const;
export type AssetCategory = typeof ASSET_CATEGORIES[number];
export const DEPRECIATION_METHODS = ['STRAIGHT_LINE', 'DECLINING_BALANCE'] as const;
export type DepreciationMethod = typeof DEPRECIATION_METHODS[number];
// Fields the accountant may override after depreciation has been posted (a reason is required).
const OVERRIDES = ['method', 'usefulLifeMonths', 'residualValue', 'decliningFactor'] as const;

const ASSET_ACCOUNT: Record<AssetCategory, string> = { BUILDING: '1202', MACHINERY: '1204', VEHICLE: '1205', COMPUTER: '1206', FURNITURE: '1206', INTANGIBLE: '1130', OTHER: '1206' };
export function defaultAccounts(category: AssetCategory) {
  return { assetAccount: ASSET_ACCOUNT[category], accumulatedAccount: category === 'INTANGIBLE' ? '1139' : '1209', expenseAccount: '6306', disposalAccount: '6810' };
}

// ---- Periods ('YYYY-MM') ----
export const monthOf = (date: string) => date.slice(0, 7);
export function addMonths(period: string, n: number) {
  const index = Number(period.slice(0, 4)) * 12 + Number(period.slice(5, 7)) - 1 + n;
  return `${String(Math.floor(index / 12)).padStart(4, '0')}-${String(index % 12 + 1).padStart(2, '0')}`;
}
export const monthsBetween = (from: string, to: string) => (Number(to.slice(0, 4)) * 12 + Number(to.slice(5, 7))) - (Number(from.slice(0, 4)) * 12 + Number(from.slice(5, 7)));
export function lastDay(period: string) {
  const [y, m] = period.split('-').map(Number);
  return `${period}-${String(new Date(Date.UTC(y, m, 0)).getUTCDate()).padStart(2, '0')}`;
}
export const firstPeriod = (commissioningDate: string) => addMonths(monthOf(commissioningDate), 1);
const PERIOD = /^\d{4}-(0[1-9]|1[0-2])$/;

// ---- Calculation (amounts in cents) ----
export interface DepreciationState { costC: number; residualC: number; accumulatedC: number; lifeMonths: number; monthIndex: number; method: DepreciationMethod; factor: number }
// Depreciation of the next month. monthIndex: months already elapsed since the first depreciation month (0 = first month).
export function monthlyDepreciationCents(s: DepreciationState): number {
  const remaining = s.costC - s.residualC - s.accumulatedC;
  if (remaining <= 0) return 0;
  const monthsLeft = s.lifeMonths - s.monthIndex;
  if (monthsLeft <= 1) return remaining;
  const straight = Math.round(remaining / monthsLeft);
  if (s.method === 'STRAIGHT_LINE') return Math.min(straight, remaining);
  // Declining balance on the book value; switches to straight-line once that is higher, so the asset is depreciated within its life.
  const declining = Math.round((s.costC - s.accumulatedC) * s.factor / s.lifeMonths);
  return Math.min(Math.max(declining, straight), remaining);
}
export interface ScheduleRow { period: string; amount: number; bookValueAfter: number }
// Remaining schedule from the given state, starting at `period` (for previews and tests).
export function projectSchedule(s: DepreciationState, period: string, maxMonths = 1200): ScheduleRow[] {
  const rows: ScheduleRow[] = [];
  let state = { ...s };
  for (let i = 0; i < maxMonths; i++) {
    const amount = monthlyDepreciationCents(state);
    if (amount <= 0) break;
    state = { ...state, accumulatedC: state.accumulatedC + amount, monthIndex: state.monthIndex + 1 };
    rows.push({ period: addMonths(period, i), amount: amount / 100, bookValueAfter: (state.costC - state.accumulatedC) / 100 });
  }
  return rows;
}

// ---- Rules ----
export const taxLifeMonths = (category: AssetCategory, date: string) => rules.number(`assets.taxLife.${category.toLowerCase()}`, date) * 12;
export const capitalizationThreshold = (date: string) => rules.number('assets.capitalization.minCost', date);
export const decliningFactor = (date: string) => rules.number('assets.decliningBalance.factor', date);

// ---- Storage ----
export interface FixedAssetRow {
  id: number; companyId: number; code: string; name: string; category: AssetCategory; acquisitionDate: string; commissioningDate: string;
  cost: number; residualValue: number; usefulLifeMonths: number; method: DepreciationMethod; decliningFactor: number | null;
  assetAccount: string; accumulatedAccount: string; expenseAccount: string; disposalAccount: string;
  disposedAt: string | null; disposalProceeds: number | null; disposalReason: string | null; notes: string | null; updatedAt: string;
}
const assetRow = (db: Database.Database, companyId: number, id: number) => {
  const row = db.prepare('SELECT * FROM FixedAsset WHERE id=? AND companyId=?').get(id, companyId) as FixedAssetRow | undefined;
  if (!row) throw new HttpError(404, 'Ilgalaikis turtas nerastas');
  return row;
};
const toCents = (value: number) => Math.round(value * 100);
const postedDepreciation = (db: Database.Database, assetId: number) =>
  db.prepare("SELECT COALESCE(SUM(ROUND(amount*100)),0) c, MAX(period) last, COUNT(*) n FROM FixedAssetPosting WHERE assetId=? AND kind='DEPRECIATION'").get(assetId) as { c: number; last: string | null; n: number };
const hasPostings = (db: Database.Database, assetId: number) => !!db.prepare('SELECT 1 FROM FixedAssetPosting WHERE assetId=? LIMIT 1').get(assetId);

function state(asset: FixedAssetRow, accumulatedC: number, period: string): DepreciationState {
  return {
    costC: toCents(asset.cost), residualC: toCents(asset.residualValue), accumulatedC, lifeMonths: asset.usefulLifeMonths,
    monthIndex: monthsBetween(firstPeriod(asset.commissioningDate), period), method: asset.method,
    factor: asset.decliningFactor ?? decliningFactor(asset.commissioningDate),
  };
}

export function getSettings(db: Database.Database, companyId: number): { defaultMethod: DepreciationMethod } {
  const row = db.prepare('SELECT defaultMethod FROM FixedAssetSettings WHERE companyId=?').get(companyId) as { defaultMethod: DepreciationMethod } | undefined;
  return { defaultMethod: row?.defaultMethod ?? 'STRAIGHT_LINE' };
}
export function setSettings(db: Database.Database, companyId: number, body: unknown, actorId: number | null) {
  const method = (body as { defaultMethod?: unknown })?.defaultMethod;
  if (!DEPRECIATION_METHODS.includes(method as DepreciationMethod)) throw new HttpError(400, 'Neteisingas nusidėvėjimo metodas');
  db.prepare("INSERT INTO FixedAssetSettings(companyId,defaultMethod,updatedBy) VALUES(?,?,?) ON CONFLICT(companyId) DO UPDATE SET defaultMethod=excluded.defaultMethod,updatedBy=excluded.updatedBy,updatedAt=strftime('%Y-%m-%dT%H:%M:%fZ','now')")
    .run(companyId, method, actorId);
  return getSettings(db, companyId);
}

export type AssetWarning = 'belowThreshold' | 'lifeBelowTax';
export interface AssetView extends FixedAssetRow {
  accumulated: number; bookValue: number; lastPeriod: string | null; nextPeriod: string | null; nextAmount: number; warnings: AssetWarning[];
}
function view(db: Database.Database, asset: FixedAssetRow): AssetView {
  const posted = postedDepreciation(db, asset.id);
  const accumulatedC = posted.c;
  const disposed = !!db.prepare("SELECT 1 FROM FixedAssetPosting WHERE assetId=? AND kind<>'DEPRECIATION' LIMIT 1").get(asset.id);
  const next = posted.last ? addMonths(posted.last, 1) : firstPeriod(asset.commissioningDate);
  const nextAmount = disposed || (asset.disposedAt && next > monthOf(asset.disposedAt)) ? 0 : monthlyDepreciationCents(state(asset, accumulatedC, next));
  const warnings: AssetWarning[] = [];
  if (asset.cost < capitalizationThreshold(asset.acquisitionDate)) warnings.push('belowThreshold');
  if (asset.usefulLifeMonths < taxLifeMonths(asset.category, asset.commissioningDate)) warnings.push('lifeBelowTax');
  return {
    ...asset, accumulated: accumulatedC / 100, bookValue: disposed ? 0 : (toCents(asset.cost) - accumulatedC) / 100,
    lastPeriod: posted.last, nextPeriod: nextAmount > 0 ? next : null, nextAmount: nextAmount / 100, warnings,
  };
}
export function listAssets(db: Database.Database, companyId: number): AssetView[] {
  return (db.prepare('SELECT * FROM FixedAsset WHERE companyId=? ORDER BY code, id').all(companyId) as FixedAssetRow[]).map(a => view(db, a));
}
export function assetDetails(db: Database.Database, companyId: number, id: number) {
  const asset = view(db, assetRow(db, companyId, id));
  const postings = db.prepare('SELECT id,period,date,kind,method,amount,bookValueAfter,debitAccount,creditAccount,docNumber FROM FixedAssetPosting WHERE assetId=? ORDER BY period, id').all(id);
  const changes = db.prepare('SELECT c.id,c.field,c.oldValue,c.newValue,c.reason,c.createdAt,u.name actorName FROM FixedAssetChange c LEFT JOIN User u ON u.id=c.actorId WHERE c.assetId=? ORDER BY c.id').all(id);
  const accumulatedC = toCents(asset.accumulated);
  const schedule = asset.disposedAt || !asset.nextPeriod ? [] : projectSchedule(state(asset, accumulatedC, asset.nextPeriod), asset.nextPeriod);
  return { asset, postings, changes, schedule };
}

// ---- Validation ----
const text = (value: unknown, field: string, max: number, required = true) => {
  const s = typeof value === 'string' ? value.trim() : value == null ? '' : null;
  if (s === null || s.length > max || (required && !s)) throw new HttpError(400, `Neteisingas laukas: ${field}`);
  return s;
};
function account(db: Database.Database, value: unknown, field: string) {
  const code = text(value, field, 20);
  if (!db.prepare('SELECT 1 FROM ChartOfAccount WHERE code=?').get(code)) throw new HttpError(400, `Sąskaitos ${code} nėra sąskaitų plane (${field})`);
  return code;
}
const date = (value: unknown) => { dateValue(value); return value as string; };
function amount(value: unknown, field: string) {
  try { return Number(cents(value)) / 100; } catch { throw new HttpError(400, `Neteisinga suma: ${field}`); }
}

interface AssetInput {
  code: string; name: string; category: AssetCategory; acquisitionDate: string; commissioningDate: string; cost: number; residualValue: number;
  usefulLifeMonths: number; method: DepreciationMethod; decliningFactor: number | null;
  assetAccount: string; accumulatedAccount: string; expenseAccount: string; disposalAccount: string; notes: string | null;
}
function parseAsset(db: Database.Database, companyId: number, body: Record<string, unknown>, base?: FixedAssetRow): AssetInput {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new HttpError(400, 'Tikimasi objekto');
  const pick = <K extends keyof AssetInput>(key: K) => (key in body ? body[key] : base?.[key as keyof FixedAssetRow]);
  const category = pick('category') as AssetCategory;
  if (!ASSET_CATEGORIES.includes(category)) throw new HttpError(400, 'Neteisinga turto grupė');
  const acquisitionDate = date(pick('acquisitionDate'));
  const commissioningDate = date(pick('commissioningDate'));
  if (commissioningDate < acquisitionDate) throw new HttpError(400, 'Naudoti pradėta negali būti anksčiau nei įsigyta');
  const cost = amount(pick('cost'), 'cost');
  if (cost <= 0) throw new HttpError(400, 'Įsigijimo kaina turi būti teigiama');
  const residualValue = amount(pick('residualValue') ?? 0, 'residualValue');
  if (residualValue < 0 || residualValue >= cost) throw new HttpError(400, 'Likvidacinė vertė turi būti neneigiama ir mažesnė už įsigijimo kainą');
  const rawLife = pick('usefulLifeMonths');
  const usefulLifeMonths = rawLife == null || rawLife === '' ? taxLifeMonths(category, commissioningDate) : Number(rawLife);
  if (!Number.isInteger(usefulLifeMonths) || usefulLifeMonths < 1 || usefulLifeMonths > 1200) throw new HttpError(400, 'Naudingo tarnavimo laikas turi būti nuo 1 iki 1200 mėnesių');
  const method = (pick('method') ?? getSettings(db, companyId).defaultMethod) as DepreciationMethod;
  if (!DEPRECIATION_METHODS.includes(method)) throw new HttpError(400, 'Neteisingas nusidėvėjimo metodas');
  const rawFactor = pick('decliningFactor');
  let factor: number | null = null;
  if (method === 'DECLINING_BALANCE') {
    factor = rawFactor == null || rawFactor === '' ? decliningFactor(commissioningDate) : Number(rawFactor);
    if (!Number.isFinite(factor) || factor <= 0 || factor > 5) throw new HttpError(400, 'Koeficientas turi būti nuo 0 iki 5');
  }
  const defaults = defaultAccounts(category);
  const acc = (key: keyof ReturnType<typeof defaultAccounts>) => account(db, pick(key) || defaults[key], key);
  return {
    code: text(pick('code'), 'code', 40), name: text(pick('name'), 'name', 200), category, acquisitionDate, commissioningDate, cost, residualValue,
    usefulLifeMonths, method, decliningFactor: factor,
    assetAccount: acc('assetAccount'), accumulatedAccount: acc('accumulatedAccount'), expenseAccount: acc('expenseAccount'), disposalAccount: acc('disposalAccount'),
    notes: text(pick('notes'), 'notes', 1000, false) || null,
  };
}

export function createAsset(db: Database.Database, companyId: number, body: Record<string, unknown>, actorId: number | null) {
  const a = parseAsset(db, companyId, body);
  const res = db.prepare(`INSERT INTO FixedAsset(companyId,code,name,category,acquisitionDate,commissioningDate,cost,residualValue,usefulLifeMonths,method,decliningFactor,assetAccount,accumulatedAccount,expenseAccount,disposalAccount,notes,updatedBy)
    VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(companyId, a.code, a.name, a.category, a.acquisitionDate, a.commissioningDate, a.cost, a.residualValue, a.usefulLifeMonths, a.method, a.decliningFactor, a.assetAccount, a.accumulatedAccount, a.expenseAccount, a.disposalAccount, a.notes, actorId);
  return Number(res.lastInsertRowid);
}

// Update of an asset. Once depreciation is posted, the cost, dates, group and accounts are fixed (correct them by undoing the
// postings); method, useful life, residual value and factor remain open to the accountant with a mandatory reason.
export function updateAsset(db: Database.Database, companyId: number, id: number, body: Record<string, unknown>, actorId: number | null) {
  return db.transaction(() => {
    const old = assetRow(db, companyId, id);
    if (old.disposedAt) throw new HttpError(409, 'Nurašyto ar perleisto turto keisti negalima. Pirmiausia atšaukite nurašymą.');
    const a = parseAsset(db, companyId, body, old);
    const posted = hasPostings(db, id);
    const fixed = ['category', 'acquisitionDate', 'commissioningDate', 'cost', 'assetAccount', 'accumulatedAccount', 'expenseAccount', 'disposalAccount'] as const;
    if (posted && fixed.some(k => a[k] !== old[k])) throw new HttpError(409, 'Nusidėvėjimas jau užregistruotas: įsigijimo kainos, datų, grupės ir sąskaitų keisti negalima. Pirmiausia atšaukite nusidėvėjimo įrašus.');
    const changed = OVERRIDES.filter(k => a[k] !== old[k]);
    const reason = typeof body.reason === 'string' ? body.reason.trim() : '';
    if (changed.length && !reason) throw new HttpError(400, 'Nurodykite metodo, naudingo tarnavimo laiko, likvidacinės vertės ar koeficiento keitimo priežastį');
    if (reason.length > 500) throw new HttpError(400, 'Priežastis per ilga');
    if (posted && a.residualValue > old.cost - postedDepreciation(db, id).c / 100) throw new HttpError(400, 'Likvidacinė vertė negali viršyti likutinės vertės');
    db.prepare(`UPDATE FixedAsset SET code=?,name=?,category=?,acquisitionDate=?,commissioningDate=?,cost=?,residualValue=?,usefulLifeMonths=?,method=?,decliningFactor=?,assetAccount=?,accumulatedAccount=?,expenseAccount=?,disposalAccount=?,notes=?,updatedBy=?,updatedAt=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=? AND companyId=?`)
      .run(a.code, a.name, a.category, a.acquisitionDate, a.commissioningDate, a.cost, a.residualValue, a.usefulLifeMonths, a.method, a.decliningFactor, a.assetAccount, a.accumulatedAccount, a.expenseAccount, a.disposalAccount, a.notes, actorId, id, companyId);
    const log = db.prepare('INSERT INTO FixedAssetChange(companyId,assetId,field,oldValue,newValue,reason,actorId) VALUES(?,?,?,?,?,?,?)');
    for (const k of changed) log.run(companyId, id, k, old[k] == null ? null : String(old[k]), a[k] == null ? null : String(a[k]), reason, actorId);
    return changed;
  }).immediate();
}

export function deleteAsset(db: Database.Database, companyId: number, id: number) {
  return db.transaction(() => {
    assetRow(db, companyId, id);
    if (hasPostings(db, id)) throw new HttpError(409, 'Turtui jau užregistruotas nusidėvėjimas: ištrinti negalima. Nurašykite turtą arba atšaukite įrašus.');
    db.prepare('DELETE FROM FixedAsset WHERE id=? AND companyId=?').run(id, companyId);
  }).immediate();
}

// ---- Posting ----
const currentPeriod = () => monthOf(todayVilnius());
const insertPosting = (db: Database.Database) => db.prepare(`INSERT INTO FixedAssetPosting(companyId,assetId,period,date,kind,method,amount,bookValueAfter,debitAccount,creditAccount,docNumber,description,actorId)
  VALUES(@companyId,@assetId,@period,@date,@kind,@method,@amount,@bookValueAfter,@debitAccount,@creditAccount,@docNumber,@description,@actorId)`);

function postAsset(db: Database.Database, asset: FixedAssetRow, through: string, actorId: number | null) {
  const posted = postedDepreciation(db, asset.id);
  let accumulatedC = posted.c;
  let period = posted.last ? addMonths(posted.last, 1) : firstPeriod(asset.commissioningDate);
  const end = asset.disposedAt && monthOf(asset.disposedAt) < through ? monthOf(asset.disposedAt) : through;
  const insert = insertPosting(db);
  let count = 0, totalC = 0;
  for (; period <= end; period = addMonths(period, 1)) {
    const s = state(asset, accumulatedC, period);
    const c = monthlyDepreciationCents(s);
    if (c <= 0) break;
    accumulatedC += c; count++; totalC += c;
    const date = asset.disposedAt && monthOf(asset.disposedAt) === period ? asset.disposedAt : lastDay(period);
    insert.run({
      companyId: asset.companyId, assetId: asset.id, period, date, kind: 'DEPRECIATION', method: asset.method, amount: c / 100,
      bookValueAfter: (s.costC - accumulatedC) / 100, debitAccount: asset.expenseAccount, creditAccount: asset.accumulatedAccount,
      docNumber: `NUS-${period}`, description: `Nusidėvėjimas ${period}: ${asset.code} ${asset.name}`, actorId,
    });
  }
  return { count, totalC };
}

// Posts monthly depreciation of every asset (or one) for all unposted months up to and including `through` ('YYYY-MM').
export function postDepreciation(db: Database.Database, companyId: number, through: unknown, actorId: number | null, assetId?: number) {
  if (typeof through !== 'string' || !PERIOD.test(through)) throw new HttpError(400, 'Neteisingas laikotarpis (YYYY-MM)');
  if (through > currentPeriod()) throw new HttpError(400, 'Būsimų mėnesių nusidėvėjimo registruoti negalima');
  return db.transaction(() => {
    const assets = (assetId ? [assetRow(db, companyId, assetId)] : db.prepare('SELECT * FROM FixedAsset WHERE companyId=? ORDER BY code, id').all(companyId) as FixedAssetRow[])
      .filter(a => !db.prepare("SELECT 1 FROM FixedAssetPosting WHERE assetId=? AND kind<>'DEPRECIATION'").get(a.id));
    let posted = 0, totalC = 0;
    for (const asset of assets) { const r = postAsset(db, asset, through, actorId); posted += r.count; totalC += r.totalC; }
    return { posted, total: totalC / 100 };
  }).immediate();
}

// Undoes the latest depreciation month of the company (all assets posted in it). Disposed assets must be restored first.
export function undoDepreciation(db: Database.Database, companyId: number, period: unknown) {
  if (typeof period !== 'string' || !PERIOD.test(period)) throw new HttpError(400, 'Neteisingas laikotarpis (YYYY-MM)');
  return db.transaction(() => {
    const latest = (db.prepare("SELECT MAX(period) p FROM FixedAssetPosting WHERE companyId=? AND kind='DEPRECIATION'").get(companyId) as { p: string | null }).p;
    if (!latest || latest !== period) throw new HttpError(409, latest ? `Atšaukti galima tik paskutinį užregistruotą mėnesį (${latest})` : 'Nusidėvėjimo įrašų nėra');
    if (db.prepare("SELECT 1 FROM FixedAssetPosting d JOIN FixedAssetPosting x ON x.assetId=d.assetId AND x.kind<>'DEPRECIATION' WHERE d.companyId=? AND d.period=? AND d.kind='DEPRECIATION'").get(companyId, period)) {
      throw new HttpError(409, 'Šį mėnesį yra nurašyto turto: pirmiausia atšaukite nurašymą');
    }
    return db.prepare("DELETE FROM FixedAssetPosting WHERE companyId=? AND period=? AND kind='DEPRECIATION'").run(companyId, period).changes;
  }).immediate();
}

// Disposal (sale or write-off) on `date`: depreciation is posted up to and including the disposal month, then the accumulated
// depreciation is closed against the asset account and the remaining book value is written off to the disposal account.
// Proceeds of a sale are invoiced through Sales; they are only recorded here for the gain/loss overview.
export function disposeAsset(db: Database.Database, companyId: number, id: number, body: Record<string, unknown>, actorId: number | null) {
  const when = date(body?.date);
  if (monthOf(when) > currentPeriod()) throw new HttpError(400, 'Būsima nurašymo data negalima');
  const reason = text(body?.reason, 'reason', 500);
  const proceeds = body?.proceeds == null || body.proceeds === '' ? null : amount(body.proceeds, 'proceeds');
  if (proceeds !== null && proceeds < 0) throw new HttpError(400, 'Pardavimo kaina negali būti neigiama');
  return db.transaction(() => {
    const asset = assetRow(db, companyId, id);
    if (asset.disposedAt) throw new HttpError(409, 'Turtas jau nurašytas');
    if (when < asset.commissioningDate) throw new HttpError(400, 'Nurašymo data negali būti ankstesnė už naudojimo pradžią');
    const last = postedDepreciation(db, id).last;
    if (last && last > monthOf(when)) throw new HttpError(409, `Nusidėvėjimas užregistruotas iki ${last}: pirmiausia atšaukite vėlesnius mėnesius`);
    db.prepare("UPDATE FixedAsset SET disposedAt=?,disposalProceeds=?,disposalReason=?,updatedBy=?,updatedAt=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=?").run(when, proceeds, reason, actorId, id);
    const disposed = assetRow(db, companyId, id);
    postAsset(db, disposed, monthOf(when), actorId);
    const accumulatedC = postedDepreciation(db, id).c;
    const bookC = toCents(asset.cost) - accumulatedC;
    const insert = insertPosting(db);
    const base = { companyId, assetId: id, period: monthOf(when), date: when, method: null, bookValueAfter: 0, docNumber: `NUR-${asset.code}`, actorId };
    insert.run({ ...base, kind: 'DISPOSAL_ACCUMULATED', amount: accumulatedC / 100, debitAccount: asset.accumulatedAccount, creditAccount: asset.assetAccount, description: `Nurašymas: sukauptas nusidėvėjimas ${asset.code} ${asset.name}` });
    insert.run({ ...base, kind: 'DISPOSAL_BOOK_VALUE', amount: bookC / 100, debitAccount: asset.disposalAccount, creditAccount: asset.assetAccount, description: `Nurašymas: likutinė vertė ${asset.code} ${asset.name}` });
    return { accumulated: accumulatedC / 100, bookValue: bookC / 100, gain: proceeds === null ? null : (toCents(proceeds) - bookC) / 100 };
  }).immediate();
}

// Cancels a disposal: removes the write-off postings and reopens the asset. Depreciation already posted is kept.
export function cancelDisposal(db: Database.Database, companyId: number, id: number, actorId: number | null) {
  return db.transaction(() => {
    const asset = assetRow(db, companyId, id);
    if (!asset.disposedAt) throw new HttpError(409, 'Turtas nenurašytas');
    db.prepare("DELETE FROM FixedAssetPosting WHERE assetId=? AND kind<>'DEPRECIATION'").run(id);
    db.prepare("UPDATE FixedAsset SET disposedAt=NULL,disposalProceeds=NULL,disposalReason=NULL,updatedBy=?,updatedAt=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=?").run(actorId, id);
  }).immediate();
}
