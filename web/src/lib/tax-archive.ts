import type Database from 'better-sqlite3';
import { getDb } from './db';
import { HttpError } from './errors';
import { toCsv } from './csv';
import { dateValue } from './validation';
import { absolutePath, ensureStoredFile, visualStoragePath, type PurchaseDocumentRow } from './purchase-recognition';
import { zipStream, type ZipSource } from './zip-stream';

// "Archyvas patikrinimui": a ZIP of the stored originals of the purchases of a period, a register of them (CSV) and a README for the inspector.
// Files are streamed from disk; only the register (one line per document) is built in memory.

export const MISSING_ORIGINAL = 'originalas nepateiktas';
const MAX_PERIOD_DAYS = 366 * 5;

export interface RegisterRow {
  date: string; supplier: string; supplierCode: string; supplierVatCode: string; document: string; net: number; vat: number; gross: number; currency: string;
  evidence: string; taxCodes: string; debitAccount: string; paidBy: string; bankLink: string; originalName: string; sha256: string; zipFile: string;
  visualZipFile: string; visualSha256: string; uploadedAt: string; uploadedBy: string; confirmedBy: string; confirmedAt: string; note: string;
}
export const REGISTER_COLUMNS: [keyof RegisterRow, string][] = [
  ['date', 'Data'], ['supplier', 'Tiekėjas'], ['supplierCode', 'Tiekėjo kodas'], ['supplierVatCode', 'Tiekėjo PVM kodas'], ['document', 'Serija ir numeris'],
  ['net', 'Suma be PVM'], ['vat', 'PVM'], ['gross', 'Suma su PVM'], ['currency', 'Valiuta'], ['evidence', 'Dokumento rūšis'], ['taxCodes', 'PVM kodai'],
  ['debitAccount', 'Debeto sąskaita'], ['paidBy', 'Apmokėjo'], ['bankLink', 'Banko ryšys'], ['originalName', 'Originalo failo pavadinimas'], ['sha256', 'SHA-256'],
  ['zipFile', 'Failas archyve'], ['visualZipFile', 'Vaizdinis PDF archyve'], ['visualSha256', 'Vaizdinio PDF SHA-256'], ['uploadedAt', 'Įkelta'], ['uploadedBy', 'Įkėlė'],
  ['confirmedBy', 'Patvirtino'], ['confirmedAt', 'Patvirtinta'], ['note', 'Pastaba'],
];

interface PurchaseRow {
  id: number; series: string | null; number: string | null; purchaseDate: string; clientName: string | null; clientCode: string | null; sumWithoutVat: number; vat: number; sumWithVat: number;
  currencyCode: string | null; debitAccount: string | null; evidenceType: string | null; paidBy: string | null; paidByName: string | null; clientVatCode: string | null;
}
interface UserInfo { name: string | null; email: string }

export function validatePeriod(from: unknown, to: unknown): { from: string; to: string } {
  try { dateValue(from); dateValue(to); } catch { throw new HttpError(400, 'Nurodykite laikotarpį (data nuo ir data iki)'); }
  const start = from as string, end = to as string;
  if (start > end) throw new HttpError(400, 'Pradžios data negali būti vėlesnė už pabaigos datą');
  if ((Date.parse(end) - Date.parse(start)) / 86400000 > MAX_PERIOD_DAYS) throw new HttpError(400, 'Laikotarpis per ilgas: iki 5 metų');
  return { from: start, to: end };
}

// ASCII-safe file name part: diacritics folded, anything else outside [A-Za-z0-9._-] becomes "_".
function slug(value: string, max: number) {
  const cleaned = value.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z0-9._-]+/g, '_').replace(/^_+|_+$/g, '').replace(/\.{2,}/g, '.').slice(0, max).replace(/^[._-]+|[._-]+$/g, '');
  return cleaned || 'nezinoma';
}
const extensionOf = (storagePath: string) => (storagePath.match(/\.([A-Za-z0-9]+)$/)?.[1] || 'bin').toLowerCase();

export interface TaxArchivePlan { files: ZipSource[]; register: RegisterRow[]; period: { from: string; to: string }; company: { name: string; code: string | null }; missing: number }

// Everything the archive holds, without reading any file content.
export function planTaxArchive(companyId: number, fromInput: unknown, toInput: unknown, db: Database.Database = getDb()): TaxArchivePlan {
  const period = validatePeriod(fromInput, toInput);
  const company = db.prepare('SELECT name, code FROM Company WHERE id=?').get(companyId) as { name: string; code: string | null } | undefined;
  if (!company) throw new HttpError(404, 'Įmonė nerasta');
  const purchases = db.prepare(`SELECT p.id, p.series, p.number, p.purchaseDate, COALESCE(p.clientName, c.name) AS clientName, COALESCE(p.clientCode, c.code) AS clientCode, p.sumWithoutVat, p.vat, p.sumWithVat,
      p.currencyCode, p.debitAccount, p.evidenceType, p.paidBy, p.paidByName, c.vatCode AS clientVatCode
    FROM Purchase p LEFT JOIN Client c ON c.id=p.clientId WHERE p.companyId=? AND substr(p.purchaseDate,1,10) BETWEEN ? AND ? ORDER BY p.purchaseDate, p.id`).all(companyId, period.from, period.to) as PurchaseRow[];
  const users = new Map((db.prepare('SELECT id, name, email FROM User').all() as (UserInfo & { id: number })[]).map(u => [u.id, u]));
  const person = (id: number | null) => { const u = id === null ? undefined : users.get(id); return u ? (u.name || u.email) : ''; };

  const docsByPurchase = new Map<number, PurchaseDocumentRow[]>();
  const taxCodes = new Map<number, Set<string>>();
  const banks = new Map<number, string[]>();
  const bucket = <T>(map: Map<number, T>, key: number, make: () => T) => map.get(key) ?? map.set(key, make()).get(key)!;
  for (let i = 0; i < purchases.length; i += 400) {
    const ids = purchases.slice(i, i + 400).map(p => p.id), marks = ids.map(() => '?').join(',');
    for (const d of db.prepare(`SELECT * FROM PurchaseDocument WHERE companyId=? AND purchaseId IN (${marks}) ORDER BY id`).all(companyId, ...ids) as PurchaseDocumentRow[]) bucket(docsByPurchase, d.purchaseId as number, () => []).push(d);
    for (const r of db.prepare(`SELECT i.purchaseId, t.taxCode FROM PurchaseItem i JOIN TaxLineCode t ON t.kind='PURCHASE' AND t.itemId=i.id AND t.companyId=? WHERE i.purchaseId IN (${marks}) AND t.taxCode IS NOT NULL`).all(companyId, ...ids) as { purchaseId: number; taxCode: string }[]) bucket(taxCodes, r.purchaseId, () => new Set<string>()).add(r.taxCode);
    for (const r of db.prepare(`SELECT a.purchaseId, b.date, b.number, a.amount FROM PaymentAllocation a JOIN BankTransaction b ON b.id=a.bankTransactionId WHERE a.companyId=? AND a.purchaseId IN (${marks}) ORDER BY b.date, b.id`).all(companyId, ...ids) as { purchaseId: number; date: string; number: string | null; amount: number }[]) bucket(banks, r.purchaseId, () => [] as string[]).push(`${String(r.date).slice(0, 10)} ${r.number || ''} ${r.amount.toFixed(2)}`.replace(/\s+/g, ' ').trim());
  }

  const used = new Set<string>();
  const uniqueName = (stem: string, ext: string) => {
    let name = `${stem}.${ext}`, n = 1;
    while (used.has(name.toLowerCase())) name = `${stem}_${++n}.${ext}`;
    used.add(name.toLowerCase());
    return name;
  };
  const files: ZipSource[] = [];
  const register: RegisterRow[] = [];
  let missing = 0;
  for (const p of purchases) {
    const documentNumber = `${p.series || ''}${p.number || ''}`;
    const base = {
      date: p.purchaseDate.slice(0, 10), supplier: p.clientName || '', supplierCode: p.clientCode || '', supplierVatCode: p.clientVatCode || '', document: documentNumber,
      net: p.sumWithoutVat, vat: p.vat, gross: p.sumWithVat, currency: p.currencyCode || 'EUR',
      evidence: p.evidenceType === 'RECEIPT' ? 'kvitas' : p.evidenceType === 'INVOICE' ? 'sąskaita faktūra' : '',
      taxCodes: [...(taxCodes.get(p.id) || [])].sort().join(' '), debitAccount: p.debitAccount || '',
      paidBy: p.paidBy === 'PERSON' ? `asmens lėšomis${p.paidByName ? `: ${p.paidByName}` : ''}` : p.paidBy === 'COMPANY' ? 'įmonė' : '', bankLink: (banks.get(p.id) || []).join(' | '),
    };
    const stem = `${p.purchaseDate.slice(0, 10)}_${slug(p.clientName || '', 40)}_${slug(documentNumber || `pirkimas${p.id}`, 40)}`;
    const docs = docsByPurchase.get(p.id) || [];
    if (!docs.length) {
      missing++;
      register.push({ ...base, originalName: '', sha256: '', zipFile: '', visualZipFile: '', visualSha256: '', uploadedAt: '', uploadedBy: '', confirmedBy: '', confirmedAt: '', note: MISSING_ORIGINAL });
      continue;
    }
    for (const d of docs) {
      const path = absolutePath(d.storagePath);
      const exists = ensureStoredFile(d.storagePath);
      const zipFile = exists ? `originalai/${uniqueName(stem, extensionOf(d.storagePath))}` : '';
      if (exists) files.push({ name: zipFile, path, modified: new Date(d.createdAt) });
      let visualZipFile = '';
      if (d.visualSha256) {
        const visualPath = absolutePath(visualStoragePath(d));
        if (ensureStoredFile(visualStoragePath(d))) { visualZipFile = `originalai/${uniqueName(stem, 'pdf')}`; files.push({ name: visualZipFile, path: visualPath, modified: new Date(d.createdAt) }); }
      }
      if (!exists) missing++;
      register.push({
        ...base, originalName: d.fileName, sha256: d.sha256, zipFile, visualZipFile, visualSha256: d.visualSha256 || '', uploadedAt: d.receivedAt,
        uploadedBy: person(d.uploadedBy) || d.sender || (d.source === 'UPLOAD' ? 'įkelta programoje' : ''), confirmedBy: person(d.confirmedBy), confirmedAt: d.confirmedAt || '',
        note: exists ? '' : 'failas nerastas saugykloje',
      });
    }
  }
  return { files, register, period, company, missing };
}

export function registerCsv(register: RegisterRow[]): string {
  return toCsv(REGISTER_COLUMNS.map(c => c[0]), register as unknown as Record<string, unknown>[], REGISTER_COLUMNS.map(c => c[1]));
}

export function readmeText(plan: TaxArchivePlan, generatedAt: Date): string {
  return [
    'ARCHYVAS PATIKRINIMUI',
    '=====================',
    '',
    `Įmonė: ${plan.company.name}${plan.company.code ? ` (kodas ${plan.company.code})` : ''}`,
    `Laikotarpis (pirkimo data): ${plan.period.from} – ${plan.period.to}`,
    `Sudaryta: ${generatedAt.toISOString().slice(0, 19).replace('T', ' ')} UTC`,
    `Registre įrašų: ${plan.register.length}; failų archyve: ${plan.files.length}; be originalo: ${plan.missing}`,
    '',
    'KAS YRA ARCHYVE',
    '- registras.csv – pirkimų registras (vienas įrašas kiekvienam dokumentui; UTF-8, skirtukas „;“, atidaroma Excel). Stulpeliai: data, tiekėjas ir jo kodai, serija ir numeris, sumos, valiuta, dokumento rūšis, PVM kodai, debeto sąskaita, kas apmokėjo, banko ryšys, originalo failo pavadinimas, SHA-256, failas archyve, įkėlimo ir patvirtinimo duomenys.',
    '- originalai/ – gauti dokumentai tokie, kokie buvo įkelti ar gauti (PDF, nuotraukos, XML e-sąskaitos). Failų pavadinimai: <data>_<tiekėjas>_<numeris>.<plėtinys>. XML e-sąskaitos vaizdinis PDF (jei buvo) yra atskiras failas tuo pačiu pavadinimu.',
    `- Pirkimai, kuriems originalas nepateiktas (pvz., importuoti ar suvesti rankiniu būdu), registre pažymėti žodžiais „${MISSING_ORIGINAL}“.`,
    '',
    'KAIP PATIKRINTI, KAD FAILAI NEPAKEISTI',
    'Įkeliant dokumentą programa apskaičiuoja jo SHA-256 kontrolinę sumą ir išsaugo failą tik vieną kartą: jis niekada neperrašomas. Ta pati suma įrašyta registro stulpelyje „SHA-256“. Pakeitus nors vieną failo baitą, suma pasikeistų, todėl sutampanti suma įrodo, kad failas nepakeistas.',
    'Patikra: apskaičiuokite failo sumą ir palyginkite su registru.',
    '  Windows (PowerShell):  Get-FileHash -Algorithm SHA256 originalai\\<failas>',
    '  Linux / macOS:         sha256sum originalai/<failas>',
    '',
    'PASTABOS',
    '- Sumos registre nurodytos pirkimo valiuta, kaip jos įrašytos apskaitoje.',
    '- „Įkėlė“ – naudotojas, įkėlęs failą programoje, arba siuntėjas, jei dokumentas gautas el. paštu.',
    '- Šis archyvas yra duomenų kopija; programos duomenys nekeičiami.',
    '',
  ].join('\r\n');
}

export function filenameFor(plan: TaxArchivePlan) {
  return `archyvas-patikrinimui_${slug(plan.company.name, 30)}_${plan.period.from}_${plan.period.to}.zip`;
}

// ZIP stream in the order: README, register, then the originals.
export function taxArchiveStream(plan: TaxArchivePlan, generatedAt = new Date()): ReadableStream<Uint8Array> {
  const entries: ZipSource[] = [
    { name: 'README.txt', data: Buffer.from('﻿' + readmeText(plan, generatedAt), 'utf8'), modified: generatedAt },
    { name: 'registras.csv', data: Buffer.from(registerCsv(plan.register), 'utf8'), modified: generatedAt },
    ...plan.files,
  ];
  return zipStream(entries);
}
