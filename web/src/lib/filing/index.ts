import type Database from 'better-sqlite3';
import { HttpError } from '../errors';
import { prepareObligation } from '../tax-prepare';
import type { ObligationCode } from '../tax-calendar';
import { FORM_PROVIDER, PROVIDERS } from './providers';
import type { FilingProvider, FilingResult } from './types';

export { FORM_PROVIDER, PROVIDERS } from './providers';
export type { FilingProvider, FilingProviderId, FilingResult, FilingResultCode } from './types';

export function providerForForm(formCode: string): FilingProvider | null {
  const id = FORM_PROVIDER[formCode];
  return id ? PROVIDERS[id] : null;
}

export interface FilingAttempt { id: number; provider: string; formCode: string; periodEnd: string; at: string; actorId: number | null; action: 'SUBMIT' | 'CHECK'; result: string; message: string; ref: string | null }

export function listAttempts(db: Database.Database, companyId: number, formCode: string, periodEnd: string): FilingAttempt[] {
  return db.prepare('SELECT id,provider,formCode,periodEnd,at,actorId,action,result,message,ref FROM FilingAttempt WHERE companyId=? AND formCode=? AND periodEnd=? ORDER BY id DESC LIMIT 50').all(companyId, formCode, periodEnd) as FilingAttempt[];
}

function log(db: Database.Database, companyId: number, providerId: string, formCode: string, periodEnd: string, actorId: number | null, action: 'SUBMIT' | 'CHECK', r: FilingResult) {
  db.prepare('INSERT INTO FilingAttempt(companyId,provider,formCode,periodEnd,actorId,action,result,message,ref) VALUES(?,?,?,?,?,?,?,?,?)').run(companyId, providerId, formCode, periodEnd, actorId, action, r.result, r.message, r.ref);
}

function target(formCode: string) {
  const provider = providerForForm(formCode);
  if (!provider) throw new HttpError(400, 'Šiai formai pateikimo sąsajos nėra');
  return provider;
}

/** Prepares the entry and hands it to its provider; every attempt is logged, including the ones that send nothing. */
export async function submitFiling(db: Database.Database, companyId: number, actorId: number | null, code: ObligationCode, periodEnd: string) {
  const provider = target(code);
  const doc = prepareObligation(db, companyId, code, periodEnd);
  if (doc.issues.some(i => i.level === 'error')) throw new HttpError(400, 'Failas neparuoštas: pirmiausia ištaisykite patikrinimų klaidas');
  let result: FilingResult;
  try { result = await provider.submit(db, companyId, doc); } catch (error) { result = { result: 'ERROR', message: error instanceof Error ? error.message : 'Nežinoma klaida', ref: null }; }
  log(db, companyId, provider.id, code, periodEnd, actorId, 'SUBMIT', result);
  return result;
}

/** Asks the provider about the last submission of the entry (its reference, when one exists). */
export async function checkFiling(db: Database.Database, companyId: number, actorId: number | null, code: ObligationCode, periodEnd: string) {
  const provider = target(code);
  const last = db.prepare("SELECT ref FROM FilingAttempt WHERE companyId=? AND formCode=? AND periodEnd=? AND action='SUBMIT' AND ref IS NOT NULL ORDER BY id DESC LIMIT 1").get(companyId, code, periodEnd) as { ref: string } | undefined;
  let result: FilingResult;
  try { result = await provider.checkStatus(db, companyId, last?.ref ?? null); } catch (error) { result = { result: 'ERROR', message: error instanceof Error ? error.message : 'Nežinoma klaida', ref: last?.ref ?? null }; }
  log(db, companyId, provider.id, code, periodEnd, actorId, 'CHECK', result);
  return result;
}
