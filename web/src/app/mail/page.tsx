import { requirePageAccess } from '@/lib/access';
import { getDb } from '@/lib/db';
import { getActiveCompanyId } from '@/lib/company';
import { companyMail } from '@/lib/company-mail';
import { listMailMessages, listMailTemplates } from '@/lib/mail';
import { receivables } from '@/lib/receivables';
import { todayVilnius } from '@/lib/dates';
import { pageTitle } from '@/lib/i18n/page-title';
import { signaturePreview } from '@/lib/mail-signature';
import { MailClient, type MailClientRow } from './MailClient';

export async function generateMetadata() { return { title: await pageTitle('nav.mail') }; }
export const dynamic = 'force-dynamic';

export default async function MailPage() {
  await requirePageAccess();
  const db = getDb();
  const companyId = await getActiveCompanyId();
  const debt = new Map<number, number>();
  for (const r of receivables(db, companyId, todayVilnius())) if (r.clientId) debt.set(r.clientId, Math.round(((debt.get(r.clientId) || 0) + r.balance) * 100) / 100);
  const clients = (db.prepare("SELECT id, name, COALESCE(email,'') AS email FROM Client WHERE companyId=? ORDER BY name COLLATE NOCASE").all(companyId) as { id: number; name: string; email: string }[])
    .map(c => ({ ...c, balance: debt.get(c.id) || 0 })) as MailClientRow[];
  return <MailClient clients={clients} templates={listMailTemplates(db, companyId)} messages={listMailMessages(db, companyId) as never} smtpReady={Boolean(companyMail(companyId)?.enabled)} signature={signaturePreview(db, companyId)} />;
}
