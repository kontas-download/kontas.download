import Link from 'next/link';
import { getT } from '@/lib/i18n/server';

export default async function NotFound() {
  const { t } = await getT();
  return (
    <div className="p-8 max-w-xl">
      <p className="text-sm font-semibold text-emerald-400 font-mono">404</p>
      <h1 className="mt-2 text-2xl font-semibold tracking-tight text-white">{t('common.notFoundTitle')}</h1>
      <p className="mt-2 text-slate-400">{t('common.notFoundText')}</p>
      <Link href="/" className="mt-6 inline-flex rounded-lg bg-emerald-600 px-3 py-2 text-sm font-semibold text-white hover:bg-emerald-500 transition-colors">
        {t('common.backHome')}
      </Link>
    </div>
  );
}
