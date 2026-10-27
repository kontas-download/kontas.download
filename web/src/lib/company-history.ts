import type Database from 'better-sqlite3';
import { todayVilnius } from './dates';

// Company change history over AccountingAudit with a short readable description of each change.
export interface HistoryFilter { from?: string | null; to?: string | null; entity?: string | null; limit: number; offset: number }
export interface Change { field: string; before: unknown; after: unknown }
export interface HistoryEvent { id: number; createdAt: string; entity: string; recordId: number; action: string; actorId: number | null; actorName: string | null; label: string; summary: string; changes: Change[]; before: unknown; after: unknown }

const LABEL_FIELDS = ['docType', 'series', 'number', 'docNumber', 'name', 'itemName', 'employeeName', 'saleDate', 'purchaseDate', 'date', 'year', 'month', 'clientName', 'debitAccount', 'creditAccount', 'sumWithVat', 'sum', 'amount', 'lockedThrough', 'method'];
const parse = (text: string | null): Record<string, unknown> | null => { if (!text) return null; try { const v = JSON.parse(text); return v && typeof v === 'object' ? v : { value: v }; } catch { return { value: text }; } };
const show = (v: unknown) => (v === null || v === undefined || v === '' ? '∅' : typeof v === 'string' ? v : JSON.stringify(v));

export function describe(action: string, before: Record<string, unknown> | null, after: Record<string, unknown> | null) {
  const row = after || before || {};
  const label = LABEL_FIELDS.filter(f => row[f] !== undefined && row[f] !== null && row[f] !== '').map(f => show(row[f])).join(' ').slice(0, 200);
  const changes: Change[] = [];
  if (before && after) for (const field of new Set([...Object.keys(before), ...Object.keys(after)])) {
    if (JSON.stringify(before[field] ?? null) !== JSON.stringify(after[field] ?? null)) changes.push({ field, before: before[field] ?? null, after: after[field] ?? null });
  }
  const summary = action === 'INSERT' ? '+ ' + label : action === 'DELETE' ? '− ' + label
    : changes.length ? changes.map(c => `${c.field}: ${show(c.before)} → ${show(c.after)}`).join('; ') : label;
  return { label, changes, summary };
}

// createdAt is stored in UTC, the user enters dates of the Vilnius calendar: a day starts at the UTC instant of Vilnius midnight (UTC+2 or UTC+3).
function vilniusDayStartUtc(date: string): string {
  const [y, m, d] = date.split('-').map(Number);
  for (const offset of [2, 3]) {
    const start = Date.UTC(y, m - 1, d, -offset);
    if (todayVilnius(new Date(start)) === date && todayVilnius(new Date(start - 1)) !== date) return new Date(start).toISOString().slice(0, 19).replace('T', ' ');
  }
  return `${date} 00:00:00`;
}

function where(companyId: number, filter: HistoryFilter) {
  const parts = ['a.companyId=?'], args: unknown[] = [companyId];
  if (filter.from) { parts.push('a.createdAt>=?'); args.push(vilniusDayStartUtc(filter.from)); }
  if (filter.to) { const next = new Date(Date.UTC(Number(filter.to.slice(0, 4)), Number(filter.to.slice(5, 7)) - 1, Number(filter.to.slice(8, 10)) + 1)).toISOString().slice(0, 10); parts.push('a.createdAt<?'); args.push(vilniusDayStartUtc(next)); }
  if (filter.entity) { parts.push('a.entity=?'); args.push(filter.entity); }
  return { sql: parts.join(' AND '), args };
}

export function companyHistory(db: Database.Database, companyId: number, filter: HistoryFilter) {
  const w = where(companyId, filter);
  const total = (db.prepare(`SELECT COUNT(*) AS n FROM AccountingAudit a WHERE ${w.sql}`).get(...w.args) as { n: number }).n;
  const rows = db.prepare(`SELECT a.id,a.createdAt,a.entity,a.recordId,a.action,a.actorId,u.name AS actorName,a.beforeJson,a.afterJson FROM AccountingAudit a LEFT JOIN User u ON u.id=a.actorId WHERE ${w.sql} ORDER BY a.id DESC LIMIT ? OFFSET ?`)
    .all(...w.args, filter.limit, filter.offset) as { id: number; createdAt: string; entity: string; recordId: number; action: string; actorId: number | null; actorName: string | null; beforeJson: string | null; afterJson: string | null }[];
  const entities = (db.prepare('SELECT DISTINCT entity FROM AccountingAudit WHERE companyId=? ORDER BY entity').all(companyId) as { entity: string }[]).map(r => r.entity);
  const events: HistoryEvent[] = rows.map(r => {
    const before = parse(r.beforeJson), after = parse(r.afterJson);
    return { id: r.id, createdAt: r.createdAt, entity: r.entity, recordId: r.recordId, action: r.action, actorId: r.actorId, actorName: r.actorName, ...describe(r.action, before, after), before, after };
  });
  return { total, events, entities };
}

const DATE = /^\d{4}-\d{2}-\d{2}$/;
// Parses query parameters; returns an error text for invalid values.
export function historyFilter(params: URLSearchParams, maxLimit: number): HistoryFilter | string {
  const from = params.get('from') || null, to = params.get('to') || null, entity = params.get('entity') || null;
  if ((from && !DATE.test(from)) || (to && !DATE.test(to))) return 'Neteisinga data (tikimasi MMMM-MM-DD)';
  if (entity && !/^[A-Za-z]{1,40}$/.test(entity)) return 'Neteisingas įrašo tipas';
  const limit = Number(params.get('limit') || 100), offset = Number(params.get('offset') || 0);
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > maxLimit || !Number.isSafeInteger(offset) || offset < 0) return 'Neteisingi limit arba offset';
  return { from, to, entity, limit, offset };
}
