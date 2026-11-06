import { notFound } from 'next/navigation';
import { requirePageAccess } from '@/lib/access';
import { getDb } from '@/lib/db';
import { getActiveCompanyId } from '@/lib/company';
import { getRecognitionSettings } from '@/lib/purchase-recognition';
import { pageTitle } from '@/lib/i18n/page-title';
import { ReviewClient } from './ReviewClient';

export async function generateMetadata() { return { title: await pageTitle('docs.reviewTitle') }; }
export const dynamic = 'force-dynamic';

export default async function ReviewPage({ params }: { params: Promise<{ id: string }> }) {
  await requirePageAccess();
  const id = Number((await params).id);
  if (!Number.isSafeInteger(id) || id <= 0) notFound();
  const db = getDb();
  const companyId = await getActiveCompanyId();
  const clients = db.prepare('SELECT id, name, code, vatCode FROM Client WHERE companyId = ? ORDER BY name COLLATE NOCASE').all(companyId) as { id: number; name: string; code: string | null; vatCode: string | null }[];
  // Same list of expense/asset accounts as the purchase form.
  const accounts = db.prepare("SELECT code,name FROM ChartOfAccount WHERE code NOT LIKE '44%' AND code NOT IN ('2410','2444') ORDER BY code").all() as { code: string; name: string }[];
  // Stock cards with a code can be picked for a line (the code is what links a purchase line to its card).
  const stockItems = db.prepare("SELECT id, name, TRIM(COALESCE(NULLIF(code,''),barcode,'')) AS code, COALESCE(warehouseName,'Pagrindinis') AS warehouseName FROM StockItem WHERE companyId = ? AND TRIM(COALESCE(NULLIF(code,''),barcode,''))<>'' ORDER BY name COLLATE NOCASE LIMIT 2000").all(companyId) as { id: number; name: string; code: string; warehouseName: string }[];
  const settings = getRecognitionSettings(companyId);
  return <ReviewClient documentId={id} companyId={companyId} clients={clients} accounts={accounts} stockItems={stockItems} recognitionReady={settings.enabled && settings.hasKey} />;
}
