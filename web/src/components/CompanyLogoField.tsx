'use client';

import { useState } from 'react';
import { useI18n } from '@/lib/i18n/client';

const MAX_BYTES = 512 * 1024;

/** Upload / replace / remove the company logo. The logo is printed on invoice PDFs and shown in the sidebar. */
export function CompanyLogoField({ companyId }: { companyId: number }) {
  const { t } = useI18n();
  const [version, setVersion] = useState(() => Date.now());
  const [hasLogo, setHasLogo] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const url = `/api/companies/${companyId}/logo?v=${version}`;

  const upload = async (file: File | undefined) => {
    if (!file) return;
    setError('');
    if (file.size > MAX_BYTES) { setError(t('companies.logoTooBig')); return; }
    setBusy(true);
    try {
      const res = await fetch(`/api/companies/${companyId}/logo`, { method: 'PUT', body: file });
      if (!res.ok) { setError((await res.json().catch(() => ({}))).error || t('companies.logoError')); return; }
      setHasLogo(true); setVersion(Date.now());
    } finally { setBusy(false); }
  };
  const remove = async () => {
    setBusy(true); setError('');
    try {
      const res = await fetch(`/api/companies/${companyId}/logo`, { method: 'DELETE' });
      if (res.ok) setHasLogo(false); else setError(t('companies.logoError'));
    } finally { setBusy(false); }
  };

  return (
    <div className="rounded-lg border border-slate-800 p-3">
      <p className="text-xs font-semibold text-slate-200">{t('companies.logoLabel')}</p>
      <div className="mt-2 flex items-center gap-4">
        <div className="flex h-16 w-40 items-center justify-center rounded-md border border-dashed border-slate-700 bg-slate-900">
          {hasLogo
            // eslint-disable-next-line @next/next/no-img-element
            ? <img src={url} alt={t('companies.logoLabel')} onError={() => setHasLogo(false)} className="max-h-14 max-w-36 object-contain" />
            : <span className="text-[11px] text-slate-400">{t('companies.logoNone')}</span>}
        </div>
        <div className="flex flex-wrap gap-2">
          <label className={`cursor-pointer rounded-lg border border-slate-700 px-3 py-1.5 text-xs font-medium text-slate-200 hover:bg-slate-800 ${busy ? 'pointer-events-none opacity-50' : ''}`}>
            {hasLogo ? t('companies.logoReplace') : t('companies.logoUpload')}
            <input type="file" accept="image/png,image/jpeg" className="sr-only" onChange={e => { upload(e.target.files?.[0]); e.target.value = ''; }} />
          </label>
          {hasLogo && <button type="button" onClick={remove} disabled={busy} className="rounded-lg px-3 py-1.5 text-xs font-medium text-rose-300 hover:bg-rose-500/10 disabled:opacity-50">{t('companies.logoRemove')}</button>}
        </div>
      </div>
      <p className="mt-2 text-[11px] text-slate-400">{t('companies.logoHint')}</p>
      {error && <p role="alert" className="mt-1 text-xs text-rose-300">{error}</p>}
    </div>
  );
}
