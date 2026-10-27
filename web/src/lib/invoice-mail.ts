import nodemailer from 'nodemailer';
import { HttpError } from './errors';
import { invoiceFilename, type InvoiceDocument } from './invoice-document';
import { companyMail, decryptPassword, validEmail } from './company-mail';
export { validEmail } from './company-mail';
export function mailConfiguration(companyId:number) {
  const settings=companyMail(companyId);
  if(!settings?.enabled)throw new HttpError(503,'Nustatykite SMTP pardavėjo įmonės kortelėje.');
  const {host,port,sender:from,username:user}=settings;
  const pass=decryptPassword(settings);
  if (Boolean(user)!==Boolean(pass)) throw new HttpError(503,'Nepilni SMTP nustatymai');
  return { from, transport:{host,port,secure:Boolean(settings.secure),requireTLS:!settings.secure,auth:user?{user,pass}:undefined,connectionTimeout:15000,greetingTimeout:15000,socketTimeout:30000,disableFileAccess:true,disableUrlAccess:true} };
}
export async function sendInvoiceEmail(doc: InvoiceDocument, pdf: Buffer, to: string, subject: string, text: string) {
  const config=mailConfiguration(doc.companyId);
  const transport=nodemailer.createTransport(config.transport);
  try {
    const result=await transport.sendMail({from:{name:doc.seller.name,address:config.from},to,replyTo:validEmail(doc.seller.email)?doc.seller.email:undefined,subject,text,attachments:[{filename:invoiceFilename(doc),content:pdf,contentType:'application/pdf'}],disableFileAccess:true,disableUrlAccess:true});
    if (!result.accepted?.length || result.rejected?.length) throw new Error('Recipient rejected');
    return result.messageId;
  } finally { transport.close(); }
}
