'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowUpRight, Download, RotateCcw } from '@/components/icons';
import { useI18n } from '@/lib/i18n/client';
import type { UpdateStatus } from '@/lib/update-check';

const loadStatus = (force = false): Promise<UpdateStatus | null> =>
  fetch(`/api/system/update${force ? '?force=1' : ''}`).then(r => (r.ok ? r.json() : null)).catch(() => null);

const code = 'block overflow-x-auto rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 font-mono text-xs text-slate-200';

/** Settings card (administrators): installed vs published version and the one-command update instructions. */
export function UpdatePanel() {
  const { t } = useI18n();
  const [status, setStatus] = useState<UpdateStatus | null>(null);
  const [checking, setChecking] = useState(true);

  const check = async (force: boolean) => {
    setChecking(true);
    setStatus(await loadStatus(force));
    setChecking(false);
  };
  useEffect(() => { void check(false); }, []);

  return (
    <section id="updates" aria-labelledby="updates-title" className="rounded-xl border border-slate-800 bg-slate-900 p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 id="updates-title" className="text-lg font-semibold text-white">{t('settings.updates')}</h2>
          <p className="mt-1 text-sm text-slate-400">{t('settings.updatesHint')}</p>
        </div>
        <button type="button" onClick={() => check(true)} disabled={checking} className="inline-flex items-center gap-2 rounded-lg border border-slate-700 px-3 py-2 text-sm font-semibold text-slate-200 hover:bg-slate-800 disabled:opacity-50 transition-colors">
          <RotateCcw size={16} aria-hidden />{checking ? t('settings.updateChecking') : t('settings.updateCheckNow')}
        </button>
      </div>

      {status && (
        <div className="mt-4 space-y-4 text-sm" aria-live="polite">
          <dl className="grid gap-1">
            <div className="flex gap-2"><dt className="text-slate-400">{t('settings.updateCurrent')}:</dt><dd className="font-semibold text-white">{status.current}</dd></div>
            {status.latest && <div className="flex gap-2"><dt className="text-slate-400">{t('settings.updateLatest')}:</dt><dd className="font-semibold text-white">{status.latest}</dd></div>}
          </dl>
          {status.disabled && <p className="text-slate-400">{t('settings.updateDisabled')}</p>}
          {status.error && <p className="text-amber-400">{t('settings.updateFailed', { error: status.error })}</p>}
          {!status.error && !status.disabled && !status.available && status.latest && <p className="text-emerald-400">{t('settings.updateUpToDate')}</p>}
          {status.available && (
            <div className="space-y-3 rounded-lg border border-emerald-500/40 bg-emerald-500/10 p-4">
              <p className="font-semibold text-emerald-300">{t('settings.updateAvailable', { version: status.latest || '' })}</p>
              <div className="flex flex-wrap gap-2">
                {status.notesUrl && <a href={status.notesUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 px-3 py-1.5 font-semibold text-slate-200 hover:bg-slate-800"><ArrowUpRight size={14} aria-hidden />{t('settings.updateNotes')}</a>}
                {status.downloadUrl && <a href={status.downloadUrl} rel="noopener noreferrer" className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 px-3 py-1.5 font-semibold text-slate-200 hover:bg-slate-800"><Download size={14} aria-hidden />{t('settings.updateDownload')}</a>}
              </div>
              <p className="text-slate-300">{t('settings.updateHow')}</p>
              <div className="grid gap-2">
                <div><div className="mb-1 text-xs text-slate-400">{t('settings.updateWindows')}</div><code className={code}>powershell -ExecutionPolicy Bypass -File .\update.ps1</code></div>
                <div><div className="mb-1 text-xs text-slate-400">{t('settings.updateUnix')}</div><code className={code}>bash update.sh</code></div>
              </div>
            </div>
          )}
        </div>
      )}
    </section>
  );
}

/** Small sidebar link shown to administrators only while a newer version is published. */
export function UpdateBadge() {
  const { t } = useI18n();
  const [latest, setLatest] = useState<string | null>(null);
  useEffect(() => { loadStatus().then(s => setLatest(s?.available ? s.latest : null)); }, []);
  if (!latest) return null;
  return (
    <Link href="/settings#updates" className="mx-3 mb-2 flex items-center gap-2 rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-xs font-semibold text-emerald-300 hover:bg-emerald-500/20 transition-colors">
      <Download size={14} aria-hidden />{t('settings.updateBadge', { version: latest })}
    </Link>
  );
}
