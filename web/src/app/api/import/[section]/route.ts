import { NextResponse } from 'next/server';
import { requireApiAccess, checkOrigin } from '@/lib/access';
import { getDb } from '@/lib/db';
import { getActiveCompanyId } from '@/lib/company';
import { apiError, HttpError } from '@/lib/errors';
import { importSectionCsv, MAX_CSV_BYTES } from '@/lib/section-transfer';
import { readLimitedText } from '@/lib/request-body';
type Context = { params: Promise<{ section: string }> };

// CSV import of clients or stock items into the active company (or body.companyId). Body: { csv, commit }. Without commit it is a
// preview. Rows whose code / VAT code (or name) already exist are skipped and reported; existing rows are never changed.
// Bank statements and supplier invoices have their own importers (/api/bank/import, /api/purchases/import-xml).
export async function POST(request: Request, context: Context) {
  try {
    const denied = await requireApiAccess();
    if (denied) return denied;
    const forbidden = await checkOrigin(request);
    if (forbidden) return forbidden;
    const { section } = await context.params;
    if (section !== 'clients' && section !== 'stock') throw new HttpError(404, 'Šio skyriaus importas nepalaikomas');
    const body = JSON.parse(await readLimitedText(request, 2 * MAX_CSV_BYTES + 1024)) as { csv?: unknown; commit?: unknown; companyId?: unknown };
    if (typeof body?.csv !== 'string') throw new HttpError(400, 'Nėra CSV turinio');
    if (Buffer.byteLength(body.csv) > MAX_CSV_BYTES) throw new HttpError(413, 'CSV failas per didelis (daugiausia 5 MB)');
    const db = getDb();
    let companyId = await getActiveCompanyId();
    if (body.companyId !== undefined && body.companyId !== null) {
      companyId = Number(body.companyId);
      if (!Number.isSafeInteger(companyId) || !db.prepare('SELECT id FROM Company WHERE id=?').get(companyId)) throw new HttpError(404, 'Įmonė nerasta');
    }
    const result = importSectionCsv(db, section, companyId, body.csv, body.commit === true);
    return NextResponse.json(result, { status: body.commit === true && !result.committed ? 422 : 200 });
  } catch (error) { return apiError(error); }
}
