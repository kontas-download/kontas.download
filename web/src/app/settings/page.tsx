import Link from 'next/link';
import { cookies } from 'next/headers';
import { Settings } from '@/components/icons';
import { requirePageAccess } from '@/lib/access';
import { getT } from '@/lib/i18n/server';
import { THEME_COOKIE, parseTheme } from '@/lib/theme';
import { SettingsClient } from './SettingsClient';
import pkg from '../../../package.json';
import { pageTitle } from '@/lib/i18n/page-title';

export async function generateMetadata() { return { title: await pageTitle('nav.settings') }; }

export const dynamic = 'force-dynamic';

export default async function SettingsPage() {
  const user = await requirePageAccess();
  const { t } = await getT();
  const admin = user.role === 'admin';
  const theme = parseTheme((await cookies()).get(THEME_COOKIE)?.value);
  const shortcuts = [
    { href: '/companies', label: t('settings.shortcutCompanies') },
    ...(admin ? [{ href: '/users', label: t('settings.shortcutUsers') }] : []),
    { href: '/accounts', label: t('settings.shortcutAccounts') },
    { href: '/rules', label: t('settings.shortcutRules') },
  ];
  return (
    <div className="p-8 max-w-3xl space-y-8">
      <header>
        <h1 className="flex items-center gap-3 text-2xl font-semibold tracking-tight text-white"><Settings size={24} className="text-emerald-400" aria-hidden />{t('settings.title')}</h1>
        <p className="mt-1 text-slate-400">{t('settings.subtitle')}</p>
      </header>
      <SettingsClient theme={theme} name={user.name || user.email} email={user.email} role={user.role} admin={admin} />
      <section aria-labelledby="more" className="rounded-xl border border-slate-800 bg-slate-900 p-6">
        <h2 id="more" className="text-lg font-semibold text-white">{t('settings.shortcuts')}</h2>
        <ul className="mt-4 grid gap-2 sm:grid-cols-2">
          {shortcuts.map(s => (
            <li key={s.href}><Link href={s.href} className="block rounded-lg border border-slate-800 px-3 py-2 text-sm font-medium text-slate-200 hover:bg-slate-800 transition-colors">{s.label}</Link></li>
          ))}
        </ul>
      </section>
      <p className="text-xs text-slate-500">kontas.download · {t('settings.version')} {pkg.version}</p>
    </div>
  );
}
