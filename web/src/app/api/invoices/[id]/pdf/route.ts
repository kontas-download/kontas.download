import { requireApiAccess } from '@/lib/access';
import { getActiveCompanyId } from '@/lib/company';
import { invoiceDocument, invoiceFilename } from '@/lib/invoice-document';
import { renderInvoicePdf } from '@/lib/invoice-pdf';
import { apiError } from '@/lib/errors';
export const runtime='nodejs';
export async function GET(request: Request, context:{params:Promise<{id:string}>}) {
  try {
    const denied=await requireApiAccess(); if(denied) return denied;
    const doc=invoiceDocument(Number((await context.params).id),await getActiveCompanyId(),new URL(request.url).searchParams.get('lang'));
    const pdf=await renderInvoicePdf(doc);
    return new Response(new Uint8Array(pdf),{headers:{'Content-Type':'application/pdf','Content-Disposition':(new URL(request.url).searchParams.has('download')?'attachment':'inline')+'; filename="'+invoiceFilename(doc)+'"','Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}});
  } catch(error){return apiError(error);}
}
