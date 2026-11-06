import Link from 'next/link';
import { Settings } from '@/components/icons';
import { requirePageAccess } from '@/lib/access';
import { getT } from '@/lib/i18n/server';
import { pageTitle } from '@/lib/i18n/page-title';
import { ApiSettingsClient } from './ApiSettingsClient';

export async function generateMetadata() { return { title: await pageTitle('api.title') }; }

export const dynamic = 'force-dynamic';

export default async function ApiSettingsPage() {
  await requirePageAccess();
  const { t } = await getT();
  return (
    <div className="p-8 max-w-3xl space-y-6">
      <header>
        <p className="text-sm"><Link href="/settings" className="text-slate-400 hover:text-slate-200">{t('settings.title')}</Link></p>
        <h1 className="mt-1 flex items-center gap-3 text-2xl font-semibold tracking-tight text-white"><Settings size={24} className="text-emerald-400" aria-hidden />{t('api.title')}</h1>
        <p className="mt-1 text-slate-400">{t('api.subtitle')}</p>
      </header>
      <ApiSettingsClient />
    </div>
  );
}
