import { requireApiAccess } from '@/lib/access';
import { apiError, HttpError } from '@/lib/errors';
import { getActiveCompanyId } from '@/lib/company';
import { listInvoiceArchive, readInvoiceArchive } from '@/lib/invoice-archive';
import { NextResponse } from 'next/server';
export const runtime = 'nodejs';

// Without ?version: list of archived copies. With ?version=<id>: the stored PDF exactly as it was sent.
export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const denied = await requireApiAccess();
    if (denied) return denied;
    const saleId = Number((await context.params).id);
    if (!Number.isSafeInteger(saleId) || saleId <= 0) throw new HttpError(400, 'Neteisingas ID');
    const companyId = await getActiveCompanyId();
    // Archived copies stay available even if the sale itself was deleted later.
    const version = new URL(request.url).searchParams.get('version');
    if (version === null) return NextResponse.json({ archive: listInvoiceArchive(companyId, saleId) }, { headers: { 'Cache-Control': 'no-store' } });
    const versionId = Number(version);
    if (!Number.isSafeInteger(versionId) || versionId <= 0) throw new HttpError(400, 'Neteisinga versija');
    const row = readInvoiceArchive(companyId, saleId, versionId);
    return new Response(new Uint8Array(row.pdf), { headers: { 'Content-Type': 'application/pdf', 'Content-Disposition': `attachment; filename="${row.filename}"`, 'X-Content-Type-Options': 'nosniff', 'Cache-Control': 'private, no-store', ETag: `"${row.sha256}"` } });
  } catch (error) {
    return apiError(error);
  }
}
