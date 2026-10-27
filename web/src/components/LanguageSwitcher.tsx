'use client';
import { useRouter } from 'next/navigation';
import { Globe } from 'lucide-react';
import { LANGS, LANG_NAMES, type Lang } from '@/lib/i18n/config';
import { storeLang } from '@/lib/i18n/cookie';
import { useI18n } from '@/lib/i18n/client';

// Switchable at any time, on any page: stores the choice in a cookie and re-renders the server components.
export function LanguageSwitcher({ compact = false }: { compact?: boolean }) {
  const { lang, t } = useI18n();
  const router = useRouter();
  const choose = (next: Lang) => {
    storeLang(next);
    router.refresh();
  };
  return (
    <div className="flex items-center gap-1.5 px-3 py-1.5" role="group" aria-label={t('common.language')}>
      {!compact && <Globe size={14} className="text-slate-400" aria-hidden />}
      {LANGS.map(code => (
        <button key={code} type="button" onClick={() => choose(code)} title={LANG_NAMES[code]} aria-pressed={code === lang}
          className={`px-2 py-0.5 rounded text-xs font-semibold uppercase ${code === lang ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-white hover:bg-slate-800'}`}>{code}</button>
      ))}
    </div>
  );
}
