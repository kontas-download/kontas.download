import { requirePageAccess } from '@/lib/access';
import { getDb } from '@/lib/db';
import { getActiveCompanyId } from '@/lib/company';
import { companyMail } from '@/lib/company-mail';
import { getAutomationSettings, listAutomationRuns } from '@/lib/automation';
import { listMailTemplates } from '@/lib/mail';
import { pageTitle } from '@/lib/i18n/page-title';
import { AutomationClient } from './AutomationClient';

export async function generateMetadata() { return { title: await pageTitle('nav.automation') }; }
export const dynamic = 'force-dynamic';

export default async function AutomationPage() {
  const user = await requirePageAccess();
  const db = getDb();
  const companyId = await getActiveCompanyId();
  const company = db.prepare('SELECT email FROM Company WHERE id=?').get(companyId) as { email: string | null };
  const autoTemplates = (db.prepare("SELECT COUNT(*) n FROM RecurringInvoice WHERE companyId=? AND active=1 AND autoMode<>'MANUAL'").get(companyId) as { n: number }).n;
  return <AutomationClient
    settings={getAutomationSettings(db, companyId)}
    runs={listAutomationRuns(db, companyId) as never}
    templates={listMailTemplates(db, companyId).map(t => ({ id: t.id, name: t.name }))}
    smtpReady={Boolean(companyMail(companyId)?.enabled)}
    companyEmail={company?.email || ''}
    autoTemplates={autoTemplates}
    admin={user.role === 'admin'}
  />;
}
