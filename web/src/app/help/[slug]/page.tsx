import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft, ArrowRight, ExternalLink, CircleHelp } from 'lucide-react';
import { requirePageAccess } from '@/lib/access';
import { getT } from '@/lib/i18n/server';
import { formatDate } from '@/lib/i18n/translate';
import { helpPage, helpPages } from '@/lib/help/pages';
import { helpSourceById } from '@/lib/help/sources';
import { HelpNotices, HelpToc, groupKey } from '../HelpToc';

export default async function HelpTopicPage({ params }: { params: Promise<{ slug: string }> }) {
  await requirePageAccess();
  const { slug } = await params;
  const page = helpPage(slug);
  if (!page) notFound();
  const { t, lang } = await getT();
  const text = page.text[lang];
  const index = helpPages.indexOf(page);
  const previous = helpPages[index - 1];
  const next = helpPages[index + 1];
  const sources = page.sources.map(id => helpSourceById.get(id)).filter(source => source !== undefined);

  const sections: { id: string; title: string; items: string[]; ordered?: boolean }[] = [
    { id: 'purpose', title: t('help.purpose'), items: text.purpose },
    { id: 'steps', title: t('help.steps'), items: text.steps, ordered: true },
    { id: 'rules', title: t('help.rules'), items: text.rules },
    { id: 'mistakes', title: t('help.mistakes'), items: text.mistakes },
    ...(text.notes || []).map((note, i) => ({ id: `note-${i + 1}`, title: note.title, items: note.items })),
  ];
  const anchors = [...sections.map(({ id, title }) => ({ id, title })), { id: 'sources', title: t('help.sources') }];

  return (
    <div className="p-4 sm:p-8 max-w-7xl mx-auto">
      <div className="lg:grid lg:grid-cols-[15rem_minmax(0,1fr)] lg:gap-10">
        <aside className="hidden lg:block">
          <div className="sticky top-8 max-h-[calc(100vh-4rem)] overflow-y-auto pr-2">
            <HelpToc lang={lang} t={t} active={page.slug} />
          </div>
        </aside>

        <article className="min-w-0 max-w-3xl space-y-8">
          <header>
            <Link href="/help" className="lg:hidden inline-flex items-center gap-1 text-xs text-slate-400 hover:text-emerald-400 mb-3">
              <ArrowLeft className="w-3.5 h-3.5" />{t('help.backToIndex')}
            </Link>
            <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500">{t(groupKey(page.group))}</p>
            <h1 className="text-2xl font-bold text-white tracking-tight flex items-center gap-2 mt-1">
              <CircleHelp className="w-6 h-6 text-emerald-400 shrink-0" />
              <span>{text.title}</span>
            </h1>
            <p className="text-sm text-slate-400 mt-2 leading-relaxed">{text.summary}</p>
            {page.appHref && (
              <Link href={page.appHref} className="inline-flex items-center gap-2 mt-4 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs transition-colors">
                {t('help.openInApp')}<ArrowRight className="w-3.5 h-3.5" />
              </Link>
            )}
          </header>

          <nav aria-label={t('help.onThisPage')} className="rounded-xl border border-slate-800 bg-slate-900 p-4">
            <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-2">{t('help.onThisPage')}</p>
            <ul className="flex flex-wrap gap-x-4 gap-y-1.5 text-sm">
              {anchors.map(anchor => (
                <li key={anchor.id}><a href={`#${anchor.id}`} className="text-slate-300 hover:text-emerald-400">{anchor.title}</a></li>
              ))}
            </ul>
          </nav>

          <HelpNotices t={t} />

          {sections.map(section => {
            const List = section.ordered ? 'ol' : 'ul';
            return (
              <section key={section.id} id={section.id} aria-labelledby={`${section.id}-title`} className="scroll-mt-8">
                <h2 id={`${section.id}-title`} className="text-lg font-bold text-white mb-3">
                  <a href={`#${section.id}`} className="hover:text-emerald-400">{section.title}</a>
                </h2>
                {section.id === 'purpose' ? (
                  <div className="space-y-3 text-[15px] leading-7 text-slate-300">
                    {section.items.map((item, i) => <p key={i}>{item}</p>)}
                  </div>
                ) : (
                  <List className={`space-y-2 text-[15px] leading-7 text-slate-300 pl-5 ${section.ordered ? 'list-decimal marker:text-emerald-400 marker:font-bold' : 'list-disc marker:text-slate-600'}`}>
                    {section.items.map((item, i) => <li key={i} className="pl-1">{item}</li>)}
                  </List>
                )}
              </section>
            );
          })}

          <section id="sources" aria-labelledby="sources-title" className="scroll-mt-8">
            <h2 id="sources-title" className="text-lg font-bold text-white mb-3">
              <a href="#sources" className="hover:text-emerald-400">{t('help.sources')}</a>
            </h2>
            {sources.length ? (
              <ul className="space-y-3">
                {sources.map(source => (
                  <li key={source.id} className="rounded-xl border border-slate-800 bg-slate-900 p-4 text-sm">
                    <a href={source.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-start gap-1.5 font-medium text-emerald-400 hover:text-emerald-300 break-words">
                      <span>{source.title[lang]}</span>
                      <ExternalLink className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                    </a>
                    <p className="text-xs text-slate-500 mt-1 break-all">{source.url}</p>
                    <p className="text-xs text-slate-400 mt-1">{t('help.issuer')}: {source.issuer} · {t('help.verifiedOn', { date: formatDate(lang, source.verifiedOn) })}</p>
                    {source.portal && <p className="text-xs text-amber-300/80 mt-1">{t('help.portalHint')}</p>}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-slate-400">{t('help.noSources')}</p>
            )}
          </section>

          <nav className="flex flex-col sm:flex-row justify-between gap-3 border-t border-slate-800 pt-6 text-sm">
            {previous ? (
              <Link href={`/help/${previous.slug}`} className="inline-flex items-center gap-2 text-slate-400 hover:text-emerald-400">
                <ArrowLeft className="w-4 h-4 shrink-0" /><span><span className="block text-[10px] uppercase tracking-widest text-slate-500">{t('help.previous')}</span>{previous.text[lang].title}</span>
              </Link>
            ) : <span />}
            {next && (
              <Link href={`/help/${next.slug}`} className="inline-flex items-center gap-2 text-slate-400 hover:text-emerald-400 sm:text-right sm:ml-auto">
                <span><span className="block text-[10px] uppercase tracking-widest text-slate-500">{t('help.next')}</span>{next.text[lang].title}</span><ArrowRight className="w-4 h-4 shrink-0" />
              </Link>
            )}
          </nav>
        </article>
      </div>
    </div>
  );
}
