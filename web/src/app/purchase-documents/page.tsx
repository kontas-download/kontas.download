import { requirePageAccess } from '@/lib/access';
import { getActiveCompanyId } from '@/lib/company';
import { getRecognitionSettings } from '@/lib/purchase-recognition';
import { pageTitle } from '@/lib/i18n/page-title';
import { DocumentsClient } from './DocumentsClient';

export async function generateMetadata() { return { title: await pageTitle('docs.navTitle') }; }
export const dynamic = 'force-dynamic';

export default async function PurchaseDocumentsPage({ searchParams }: { searchParams: Promise<{ shareError?: string | string[] }> }) {
  await requirePageAccess();
  const shareError = (await searchParams).shareError;
  const shareErrors = (Array.isArray(shareError) ? shareError : shareError ? [shareError] : []).slice(0, 5).map(e => e.slice(0, 300));
  const companyId = await getActiveCompanyId();
  const settings = getRecognitionSettings(companyId);
  return <DocumentsClient companyId={companyId} recognitionReady={settings.enabled && settings.hasKey} shareErrors={shareErrors} />;
}
