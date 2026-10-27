import { requireApiAccess, checkOrigin } from '@/lib/access';
import { apiError, HttpError } from '@/lib/errors';
import { getDb } from '@/lib/db';
import { getActiveCompanyId } from '@/lib/company';
import { parseBankCsv } from '@/lib/bank-import';
import { looksLikeXml, parseCamt053 } from '@/lib/bank-camt';
import { looksLikeMt940, parseMt940 } from '@/lib/bank-mt940';
import { randomUUID } from 'node:crypto';
import { NextResponse } from 'next/server';

// body: { csv: string, account?: string, commit?: boolean }. Without commit it only reports what would happen.
export async function POST(request: Request) {
  try {
    const denied = await requireApiAccess();
    if (denied) return denied;
    const forbidden = await checkOrigin(request);
    if (forbidden) return forbidden;
    const companyId = await getActiveCompanyId();
    const body = await request.json();
    if (typeof body?.csv !== 'string' || !body.csv.trim() || body.csv.length > 8_000_000) throw new HttpError(400, 'Pateikite CSV tekstą (iki 8 MB)');
    const account = typeof body.account === 'string' && body.account.trim() ? body.account.trim().slice(0, 100) : 'Bank';
    // camt.053 (XML), MT940 (SWIFT text) or a delimited CSV statement; the format is detected from the content.
    const format = looksLikeXml(body.csv) ? 'camt.053' : looksLikeMt940(body.csv) ? 'mt940' : 'csv';
    const parsed = format === 'camt.053' ? parseCamt053(body.csv, companyId) : format === 'mt940' ? parseMt940(body.csv, companyId) : { ...parseBankCsv(body.csv, companyId, account), statements: undefined as undefined, warnings: [] as string[] };
    const db = getDb();
    const existing = new Set((db.prepare('SELECT importHash FROM BankTransaction WHERE companyId=? AND importHash IS NOT NULL').all(companyId) as { importHash: string }[]).map(r => r.importHash));
    const fresh = parsed.rows.filter(r => !existing.has(r.hash));
    // Rows that match an existing bank transaction by date and amount but have a different key (earlier CSV import, legacy data) are probably the same booking.
    let overlap = 0;
    if (fresh.length) {
      const dates = fresh.map(r => r.date).sort();
      const known = new Map<string, number>();
      const query = db.prepare('SELECT date(date) d, ROUND(sum*100) c, COUNT(*) n FROM BankTransaction WHERE companyId=? AND date(date)>=? AND date(date)<=? GROUP BY d, c');
      for (const r of query.all(companyId, dates[0], dates[dates.length - 1]) as { d: string; c: number; n: number }[]) known.set(`${r.d}|${r.c}`, r.n);
      // rows of this file that are already stored (same key) explain existing rows and must not be reported as overlap
      for (const r of parsed.rows) if (existing.has(r.hash)) { const key = `${r.date}|${Math.round(r.sum * 100)}`; known.set(key, Math.max(0, (known.get(key) || 0) - 1)); }
      for (const r of fresh) { const key = `${r.date}|${Math.round(r.sum * 100)}`; const left = known.get(key) || 0; if (left > 0) { overlap++; known.set(key, left - 1); } }
    }
    const summary = {
      overlap,
      format,
      statements: parsed.statements,
      warnings: parsed.warnings,
      columns: parsed.columns,
      ambiguousDirection: parsed.ambiguousDirection,
      total: parsed.rows.length,
      new: fresh.length,
      duplicates: parsed.rows.length - fresh.length,
      incoming: fresh.filter(r => r.sum > 0).length,
      outgoing: fresh.filter(r => r.sum < 0).length,
      preview: fresh.slice(0, 20).map(({ date, sum, clientName, details }) => ({ date, sum, clientName, details })),
    };
    if (parsed.errors.length) return NextResponse.json({ error: 'Faile yra klaidų; nieko neimportuota', errors: parsed.errors.slice(0, 50), ...summary }, { status: 422 });
    if (body.commit !== true) return NextResponse.json({ committed: false, ...summary });
    if (parsed.ambiguousDirection && body.acknowledgeDirection !== true) return NextResponse.json({ error: 'Visos sumos teigiamos ir nėra krypties stulpelio (D/K): išeinantys mokėjimai gali būti įrašyti kaip gaunami. Patvirtinkite, kad faile yra tik įplaukos.', ...summary }, { status: 422 });
    if (overlap > 0 && body.acknowledgeOverlap !== true) return NextResponse.json({ error: `${overlap} operacijų sutampa pagal datą ir sumą su jau esamomis duomenų bazėje (galbūt išrašas jau buvo įkeltas kitu būdu). Patikrinkite ir patvirtinkite importą.`, ...summary }, { status: 422 });
    const batch = randomUUID();
    const insert = db.prepare("INSERT INTO BankTransaction(companyId,date,number,clientName,sum,correspondenceAccountCode,accountingBankInternalName,notes,importHash,importBatch) VALUES(?,?,?,?,?,'2710',?,?,?,?)");
    db.transaction(() => { for (const r of fresh) insert.run(companyId, r.date, r.reference || null, r.clientName || null, r.sum, r.account || account, r.details || null, r.hash, batch); })();
    return NextResponse.json({ committed: true, batch, ...summary });
  } catch (err) {
    return apiError(err);
  }
}
