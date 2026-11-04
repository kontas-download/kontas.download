'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Check, Download, KeyRound, LogOut } from '@/components/icons';
import { ChangePasswordDialog } from '@/components/ChangePasswordDialog';
import { LANGS, LANG_NAMES, type Lang } from '@/lib/i18n/config';
import { storeLang } from '@/lib/i18n/cookie';
import { useI18n } from '@/lib/i18n/client';
import { THEMES, storeTheme, type Theme } from '@/lib/theme';

const card = 'rounded-xl border border-slate-800 bg-slate-900 p-6';
const choice = (on: boolean) => `flex items-center justify-between gap-3 rounded-lg border px-4 py-3 text-sm font-semibold transition-colors ${on ? 'border-emerald-500 bg-emerald-500/10 text-white' : 'border-slate-700 text-slate-300 hover:bg-slate-800'}`;
const secondary = 'inline-flex items-center gap-2 rounded-lg border border-slate-700 px-3 py-2 text-sm font-semibold text-slate-200 hover:bg-slate-800 transition-colors';

export function SettingsClient({ theme: initialTheme, name, email, role, admin }: { theme: Theme; name: string; email: string; role: string; admin: boolean }) {
  const { lang, t } = useI18n();
  const router = useRouter();
  const [theme, setTheme] = useState<Theme>(initialTheme);
  const [changingPassword, setChangingPassword] = useState(false);
  const themeLabel: Record<Theme, string> = { dark: t('settings.themeDark'), light: t('settings.themeLight'), system: t('settings.themeSystem') };

  const chooseLang = (next: Lang) => { storeLang(next); router.refresh(); };
  const chooseTheme = (next: Theme) => { storeTheme(next); setTheme(next); };
  const logout = async () => {
    try { await fetch('/api/auth/logout', { method: 'POST' }); } finally { window.location.href = '/login'; }
  };

  return (
    <>
      <section aria-labelledby="lang" className={card}>
        <h2 id="lang" className="text-lg font-semibold text-white">{t('settings.language')}</h2>
        <p className="mt-1 text-sm text-slate-400">{t('settings.languageHint')}</p>
        <div className="mt-4 grid gap-2 sm:grid-cols-3" role="radiogroup" aria-labelledby="lang">
          {LANGS.map(code => (
            <button key={code} type="button" role="radio" aria-checked={code === lang} onClick={() => chooseLang(code)} className={choice(code === lang)}>
              <span>{LANG_NAMES[code]}</span>{code === lang && <Check size={16} className="text-emerald-400" aria-hidden />}
            </button>
          ))}
        </div>
      </section>

      <section aria-labelledby="theme" className={card}>
        <h2 id="theme" className="text-lg font-semibold text-white">{t('settings.theme')}</h2>
        <p className="mt-1 text-sm text-slate-400">{t('settings.themeHint')}</p>
        <div className="mt-4 grid gap-2 sm:grid-cols-3" role="radiogroup" aria-labelledby="theme">
          {THEMES.map(code => (
            <button key={code} type="button" role="radio" aria-checked={code === theme} onClick={() => chooseTheme(code)} className={choice(code === theme)}>
              <span>{themeLabel[code]}</span>{code === theme && <Check size={16} className="text-emerald-400" aria-hidden />}
            </button>
          ))}
        </div>
      </section>

      <section aria-labelledby="account" className={card}>
        <h2 id="account" className="text-lg font-semibold text-white">{t('settings.account')}</h2>
        <dl className="mt-4 grid gap-1 text-sm">
          <div className="flex gap-2"><dt className="text-slate-400">{t('settings.signedInAs')}:</dt><dd className="font-semibold text-white">{name} <span className="font-normal text-slate-400">({email})</span></dd></div>
          <div className="flex gap-2"><dt className="text-slate-400">{t('settings.role')}:</dt><dd className="text-slate-200">{t(role === 'admin' ? 'nav.roleAdmin' : 'nav.roleAccountant')}</dd></div>
        </dl>
        <div className="mt-4 flex flex-wrap gap-2">
          <button type="button" onClick={() => setChangingPassword(true)} className={secondary}><KeyRound size={16} aria-hidden />{t('settings.changePassword')}</button>
          <button type="button" onClick={logout} className={secondary}><LogOut size={16} aria-hidden />{t('settings.logout')}</button>
        </div>
      </section>

      <section aria-labelledby="data" className={card}>
        <h2 id="data" className="text-lg font-semibold text-white">{t('settings.data')}</h2>
        <p className="mt-1 text-sm text-slate-400">{t('settings.backupHint')}</p>
        <div className="mt-4">
          {admin
            ? <a href="/api/admin/backup" className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-3 py-2 text-sm font-semibold text-white hover:bg-emerald-500 transition-colors"><Download size={16} aria-hidden />{t('settings.backupDownload')}</a>
            : <p className="text-sm text-slate-500">{t('settings.adminOnly')}</p>}
        </div>
      </section>
      {changingPassword && <ChangePasswordDialog onClose={() => setChangingPassword(false)} />}
    </>
  );
}
