import { requireApiAccess } from '@/lib/access';
import { apiError } from '@/lib/errors';
import { getActiveCompanyId } from '@/lib/company';
import { filenameFor, planTaxArchive, taxArchiveStream } from '@/lib/tax-archive';

// GET ?from=YYYY-MM-DD&to=YYYY-MM-DD: ZIP of the originals of the period's purchases with a register and a README, streamed from disk.
export async function GET(request: Request) {
  try {
    const denied = await requireApiAccess();
    if (denied) return denied;
    const params = new URL(request.url).searchParams;
    const plan = planTaxArchive(await getActiveCompanyId(), params.get('from'), params.get('to'));
    return new Response(taxArchiveStream(plan), {
      headers: {
        'Content-Type': 'application/zip',
        'Content-Disposition': `attachment; filename="${filenameFor(plan)}"`,
        'X-Content-Type-Options': 'nosniff',
        'Cache-Control': 'private, no-store',
      },
    });
  } catch (err) {
    return apiError(err);
  }
}
