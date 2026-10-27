import { requirePageAccess } from '@/lib/access';
import { getDb } from '@/lib/db';
import { getActiveCompanyId } from '@/lib/company';
import { getSettings, listAssets } from '@/lib/fixed-assets';
import { AssetsClient, type AssetDto } from './AssetsClient';

export const dynamic = 'force-dynamic';

// Fixed assets register, monthly depreciation and disposal; available to administrators and accountants.
export default async function AssetsPage() {
  await requirePageAccess();
  const db = getDb();
  const companyId = await getActiveCompanyId();
  return <AssetsClient initialAssets={listAssets(db, companyId) as AssetDto[]} initialDefaultMethod={getSettings(db, companyId).defaultMethod} companyId={companyId} />;
}
