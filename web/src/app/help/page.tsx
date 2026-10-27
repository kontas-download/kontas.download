import Link from 'next/link';
import { CircleHelp, ExternalLink } from 'lucide-react';
import { requirePageAccess } from '@/lib/access';
import { getT } from '@/lib/i18n/server';
import { helpPages } from '@/lib/help/pages';
import { helpSources } from '@/lib/help/sources';
import { HELP_GROUPS } from '@/lib/help/types';
import { formatDate } from '@/lib/i18n/translate';
import { HelpNotices, HelpToc, groupKey } from './HelpToc';

export default async function HelpIndexPage() {
  await requirePageAccess();
  const { t, lang } = await getT();

  return (
    <div className="p-4 sm:p-8 max-w-7xl mx-auto">
      <div className="lg:grid lg:grid-cols-[15rem_minmax(0,1fr)] lg:gap-10">
        <aside className="hidden lg:block">
          <div className="sticky top-8 max-h-[calc(100vh-4rem)] overflow-y-auto pr-2">
            <HelpToc lang={lang} t={t} />
          </div>
        </aside>

        <div className="space-y-8 min-w-0">
          <header>
            <h1 className="text-2xl font-bold text-white tracking-tight flex items-center gap-2">
              <CircleHelp className="w-6 h-6 text-emerald-400" />
              <span>{t('help.title')}</span>
            </h1>
            <p className="text-sm text-slate-400 mt-1">{t('help.subtitle')}</p>
          </header>

          <HelpNotices t={t} />

          {HELP_GROUPS.map(group => (
            <section key={group} aria-labelledby={`group-${group}`}>
              <h2 id={`group-${group}`} className="text-xs font-bold uppercase tracking-widest text-slate-500 mb-3">{t(groupKey(group))}</h2>
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {helpPages.filter(page => page.group === group).map(page => (
                  <Link key={page.slug} href={`/help/${page.slug}`} className="group rounded-xl border border-slate-800 bg-slate-900 p-4 hover:border-emerald-500/50 hover:bg-slate-900/70 transition-colors">
                    <h3 className="font-semibold text-slate-100 group-hover:text-emerald-400">{page.text[lang].title}</h3>
                    <p className="text-xs text-slate-400 mt-1.5 leading-relaxed">{page.text[lang].summary}</p>
                  </Link>
                ))}
              </div>
            </section>
          ))}

          <section id="sources" aria-labelledby="all-sources" className="scroll-mt-8">
            <h2 id="all-sources" className="text-lg font-bold text-white">{t('help.allSources')}</h2>
            <p className="text-sm text-slate-400 mt-1 mb-4">{t('help.allSourcesIntro')}</p>
            <ul className="space-y-3">
              {helpSources.map(source => {
                const usedOn = helpPages.filter(page => page.sources.includes(source.id));
                return (
                  <li key={source.id} className="rounded-xl border border-slate-800 bg-slate-900 p-4 text-sm">
                    <a href={source.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-start gap-1.5 font-medium text-emerald-400 hover:text-emerald-300 break-words">
                      <span>{source.title[lang]}</span>
                      <ExternalLink className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                    </a>
                    <p className="text-xs text-slate-500 mt-1 break-all">{source.url}</p>
                    <p className="text-xs text-slate-400 mt-1">{t('help.issuer')}: {source.issuer} · {t('help.verifiedOn', { date: formatDate(lang, source.verifiedOn) })}</p>
                    {source.portal && <p className="text-xs text-amber-300/80 mt-1">{t('help.portalHint')}</p>}
                    {usedOn.length > 0 && (
                      <p className="text-xs text-slate-400 mt-2">
                        {t('help.usedOn')}:{' '}
                        {usedOn.map((page, i) => (
                          <span key={page.slug}>{i > 0 && ', '}<Link href={`/help/${page.slug}`} className="text-slate-300 hover:text-emerald-400 underline-offset-2 hover:underline">{page.text[lang].title}</Link></span>
                        ))}
                      </p>
                    )}
                  </li>
                );
              })}
            </ul>
          </section>
        </div>
      </div>
    </div>
  );
}
