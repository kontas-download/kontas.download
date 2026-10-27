import Link from 'next/link';
import type { Lang } from '@/lib/i18n/config';
import type { T } from '@/lib/i18n/translate';
import { helpPages } from '@/lib/help/pages';
import { HELP_GROUPS, type HelpGroup } from '@/lib/help/types';

export const groupKey = (group: HelpGroup) => `help.group${group[0].toUpperCase()}${group.slice(1)}`;

// Table of contents of all help pages, grouped like the application menu.
export function HelpToc({ lang, t, active }: { lang: Lang; t: T; active?: string }) {
  return (
    <nav aria-label={t('help.toc')} className="space-y-5 text-sm">
      <Link href="/help" className={`block font-semibold ${active ? 'text-slate-300 hover:text-white' : 'text-emerald-400'}`}>{t('help.backToIndex')}</Link>
      {HELP_GROUPS.map(group => (
        <div key={group}>
          <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-2">{t(groupKey(group))}</p>
          <ul className="space-y-1 border-l border-slate-800">
            {helpPages.filter(page => page.group === group).map(page => (
              <li key={page.slug}>
                <Link
                  href={`/help/${page.slug}`}
                  aria-current={page.slug === active ? 'page' : undefined}
                  className={`block -ml-px border-l pl-3 py-1 leading-snug transition-colors ${page.slug === active ? 'border-emerald-400 text-emerald-400 font-semibold' : 'border-transparent text-slate-400 hover:text-white hover:border-slate-500'}`}
                >
                  {page.text[lang].title}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </nav>
  );
}

export function HelpNotices({ t }: { t: T }) {
  return (
    <div className="space-y-3">
      <p role="note" className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-200 leading-relaxed">{t('help.vmiNotice')}</p>
      <p role="note" className="rounded-xl border border-slate-700 bg-slate-900 px-4 py-3 text-xs text-slate-400 leading-relaxed">{t('help.disclaimer')}</p>
    </div>
  );
}
