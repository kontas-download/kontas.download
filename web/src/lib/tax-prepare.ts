import type Database from 'better-sqlite3';
import { HttpError } from './errors';
import { buildFr0564Ffdata, buildFr0600Ffdata, buildGpm312Ffdata, buildGpm313Ffdata, buildPln204Ffdata } from './ffdata';
import { fr0564Draft } from './fr0564';
import { fr0600Draft } from './fr0600';
import { gpm312Draft } from './gpm312';
import { gpm313Draft } from './gpm313';
import { buildIsaf } from './isaf';
import { pln204Draft } from './pln204';
import { loadTaxDocuments, standardVatIssues } from './tax-documents';
import { calendarEvents, type ObligationCode } from './tax-calendar';
import { todayVilnius } from './dates';

// Prepares the file of a tax calendar entry for its period from the existing generators and runs their checks. Nothing is sent anywhere:
// the person downloads the file and submits it in the system named in `submit`.
export interface PreparedFile { name: string; mime: string; content: string }
export interface PrepareIssue { level: 'error' | 'warning'; text: string }
export interface PreparedObligation {
  code: ObligationCode; title: string; periodStart: string; periodEnd: string; dueNominal: string;
  files: PreparedFile[]; issues: PrepareIssue[]; submit: { system: 'EDS' | 'EDAS'; url: string };
  done: boolean; submittedDate: string | null; registrationNo: string | null; note: string | null;
}

export const SUBMIT_SYSTEMS = { EDS: 'https://deklaravimas.vmi.lt', EDAS: 'https://draudejai.sodra.lt' } as const;
// Every form the program generates goes to VMI EDS. No Sodra (EDAS) form is generated yet.
const SYSTEM_OF: Record<ObligationCode, keyof typeof SUBMIT_SYSTEMS> = { FR0600: 'EDS', FR0564: 'EDS', GPM313: 'EDS', GPM312: 'EDS', PLN204: 'EDS' };
export const submitTarget = (code: ObligationCode) => ({ system: SYSTEM_OF[code], url: SUBMIT_SYSTEMS[SYSTEM_OF[code]] });

const addDays = (date: string, n: number) => new Date(Date.parse(date + 'T00:00:00Z') + n * 86_400_000).toISOString().slice(0, 10);
const XML = 'application/xml';

export function prepareObligation(db: Database.Database, companyId: number, code: ObligationCode, periodEnd: string, today: string = todayVilnius()): PreparedObligation {
  const event = calendarEvents(db, companyId, periodEnd, addDays(periodEnd, 400), today).find(e => e.code === code && e.periodEnd === periodEnd);
  if (!event) throw new HttpError(404, 'Šis terminas kalendoriuje nerastas arba prievolė šiai įmonei netaikoma');
  const { periodStart } = event;
  const company = db.prepare('SELECT name, code, vatCode FROM Company WHERE id=?').get(companyId) as { name: string; code: string | null; vatCode: string | null };
  const header = { name: company.name || '', code: company.code || '' };
  const vatCode = (company.vatCode || '').replace(/\s+/g, '').toUpperCase();
  const year = Number(periodStart.slice(0, 4)), month = Number(periodStart.slice(5, 7));
  const files: PreparedFile[] = [];
  const issues: PrepareIssue[] = [];
  const warn = (list: string[] | undefined) => { for (const text of list || []) issues.push({ level: 'warning', text }); };
  const fail = (list: string[]) => { for (const text of list) issues.push({ level: 'error', text }); };
  const stem = `${code}_${periodStart}_${periodEnd}`;

  if (code === 'FR0600' || code === 'FR0564') {
    const blocked = standardVatIssues(db, companyId, periodStart, periodEnd);
    if (blocked.length) fail(blocked);
    else {
      const { sales, purchases } = loadTaxDocuments(db, companyId, periodStart, periodEnd);
      const vatHeader = { ...header, vatCode: vatCode.startsWith('LT') ? vatCode.slice(2) : vatCode };
      if (code === 'FR0600') {
        const draft = fr0600Draft(sales, purchases);
        if (!draft.complete) issues.push({ level: 'warning', text: 'FR0600 juodraštis neišsamus: patikrinkite laukus EDS' });
        warn(draft.manual); warn(draft.unreviewed); warn(draft.notes);
        files.push({ name: `${stem}.ffdata`, mime: XML, content: buildFr0600Ffdata({ header: vatHeader, period: { start: periodStart, end: periodEnd }, fields: draft.fields, extended: draft.extended, createdOn: today }) });
        // The i.SAF register is submitted together with FR0600.
        const isaf = buildIsaf({ company: { name: company.name, code: company.code, vatCode: company.vatCode }, period: { start: periodStart, end: periodEnd }, sales, purchases, software: { company: 'kontas.download', name: 'kontas.download', version: '0.2.2' } });
        if (isaf.xml) files.push({ name: `iSAF_${periodStart}_${periodEnd}.xml`, mime: XML, content: isaf.xml });
        else { issues.push({ level: 'error', text: 'i.SAF nesudarytas: reikalingas rankinis dokumentų patikrinimas' }); fail(isaf.issues); }
      } else {
        const draft = fr0564Draft(sales);
        if (!draft.complete) issues.push({ level: 'warning', text: 'FR0564 juodraštis neišsamus: patikrinkite eilutes EDS' });
        warn(draft.manual); warn(draft.notes); warn(draft.notFilled);
        files.push({ name: `${stem}.ffdata`, mime: XML, content: buildFr0564Ffdata({ header: { ...vatHeader, year, month }, rows: draft.rows, totals: draft.totals, createdOn: today }) });
      }
    }
  } else if (code === 'GPM313') {
    const draft = gpm313Draft(db, companyId, year, month);
    warn(draft.notes); warn(draft.notFilled);
    files.push({ name: `${stem}.ffdata`, mime: XML, content: buildGpm313Ffdata({ header: { ...header, year, month }, f5: draft.totals.f5, f6: draft.f6, f7: draft.f7, createdOn: today }) });
  } else if (code === 'GPM312') {
    const draft = gpm312Draft(db, companyId, year);
    warn(draft.notes); warn(draft.notFilled);
    files.push({ name: `${stem}.ffdata`, mime: XML, content: buildGpm312Ffdata({ header: { ...header, year }, totals: draft.totals, rows: draft.rows.map(r => ({ ...r, gpmRate: 20 })), createdOn: today }) });
  } else {
    const draft = pln204Draft(db, companyId, year, {});
    warn(draft.notes); warn(draft.notFilled);
    issues.push({ level: 'warning', text: 'Neleidžiami atskaitymai, neapmokestinamosios pajamos ir perkeliami nuostoliai (20, 26, 45 laukai) nenurodyti: įveskite juos PLN204 puslapyje arba EDS' });
    files.push({ name: `${stem}.ffdata`, mime: XML, content: buildPln204Ffdata({ header: { ...header, year }, period: { start: draft.periodStart, end: draft.periodEnd }, employees: draft.employees, fields: { ...draft.fields, f54a: draft.mxfdRate }, createdOn: today }) });
  }
  return { code, title: event.title, periodStart, periodEnd, dueNominal: event.dueNominal, files, issues, submit: submitTarget(code), done: event.done, submittedDate: event.submittedDate, registrationNo: event.registrationNo, note: event.note };
}
