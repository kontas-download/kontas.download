import { NextResponse } from 'next/server';
import { requireApiAccess, checkOrigin } from '@/lib/access';
import { getActiveCompanyId } from '@/lib/company';
import { getDb } from '@/lib/db';
import { invoiceDocument, invoiceEmailDraft } from '@/lib/invoice-document';
import { renderInvoicePdf } from '@/lib/invoice-pdf';
import { validEmail, mailConfiguration, sendInvoiceEmail } from '@/lib/invoice-mail';
import { apiError, HttpError } from '@/lib/errors';
import { archiveInvoicePdf } from '@/lib/invoice-archive';
export const runtime='nodejs';
type Context={params:Promise<{id:string}>};
export async function GET(request:Request,context:Context) {
  try { const denied=await requireApiAccess();if(denied)return denied;
    const doc=invoiceDocument(Number((await context.params).id),await getActiveCompanyId(),new URL(request.url).searchParams.get('lang'));
    let configured=true;try{mailConfiguration(doc.companyId);}catch{configured=false;}
    return NextResponse.json({...invoiceEmailDraft(doc),configured,invoiceNumber:doc.number},{headers:{'Cache-Control':'no-store'}});
  }catch(error){return apiError(error);}
}
export async function POST(request:Request,context:Context) {
  try {
    const denied=await requireApiAccess();if(denied)return denied;
    const forbidden=await checkOrigin(request);if(forbidden)return forbidden;
    const companyId=await getActiveCompanyId();
    const body=await request.json();
    const doc=invoiceDocument(Number((await context.params).id),companyId,body?.lang);
    if(!body || !validEmail(body.to) || typeof body.subject!=='string' || !body.subject.trim() || body.subject.length>200 || /[\r\n]/.test(body.subject) || typeof body.text!=='string' || !body.text.trim() || body.text.length>10000 || typeof body.requestId!=='string' || !/^[a-f0-9-]{36}$/.test(body.requestId)) throw new HttpError(400,'Patikrinkite adresą, temą ir laiško tekstą');
    const db=getDb();
    const previous=db.prepare('SELECT saleId,status,messageId FROM InvoiceDelivery WHERE companyId=? AND requestId=?').get(companyId,body.requestId) as {saleId:number;status:string;messageId:string}|undefined;
    if(previous){if(previous.saleId!==doc.id)throw new HttpError(409,'Siuntimo identifikatorius jau naudojamas');if(previous.status==='sent')return NextResponse.json({success:true,messageId:previous.messageId,duplicate:true});throw new HttpError(409,'Šis siuntimas jau buvo vykdytas. Prieš siųsdami pakartotinai patikrinkite rezultatą.');}
    mailConfiguration(doc.companyId);
    const pdf=await renderInvoicePdf(doc);
    const reserved=db.prepare("INSERT OR IGNORE INTO InvoiceDelivery(companyId,saleId,requestId,recipient,status,createdAt) VALUES(?,?,?,?,'sending',?)").run(companyId,doc.id,body.requestId,body.to,Date.now());
    if(!reserved.changes)throw new HttpError(409,'Siuntimas jau vykdomas');
    try {
      const messageId=await sendInvoiceEmail(doc,pdf,body.to,body.subject.trim(),body.text);
      db.prepare("UPDATE InvoiceDelivery SET status='sent',messageId=? WHERE companyId=? AND requestId=?").run(messageId,companyId,body.requestId);
      try{archiveInvoicePdf(doc,pdf,{requestId:body.requestId,recipient:body.to,messageId});}catch(archiveError){console.error('Invoice archive failed',archiveError);}
      return NextResponse.json({success:true,messageId});
    } catch {
      db.prepare("UPDATE InvoiceDelivery SET status='uncertain' WHERE companyId=? AND requestId=?").run(companyId,body.requestId);
      throw new HttpError(502,'Nepavyko patvirtinti siuntimo. Prieš kartodami patikrinkite paštą, kad išvengtumėte dublikato.');
    }
  } catch(error){return apiError(error);}
}
