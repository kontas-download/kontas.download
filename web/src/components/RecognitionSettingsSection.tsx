'use client';
import { useEffect, useState } from 'react';
import { useI18n } from '@/lib/i18n/client';
import { LOCALES } from '@/lib/i18n/config';
import { DEFAULT_RECOGNITION_MODEL, RECOGNITION_MODELS } from '@/lib/recognition/models';

const input = 'block mt-1 w-full h-10 rounded-lg border border-slate-700 bg-slate-950 px-3 text-sm text-slate-100 focus:border-emerald-500 focus:outline-none';
const hintKey = { accurate: 'docs.modelAccurate', balanced: 'docs.modelBalanced', fast: 'docs.modelFast' } as const;

// Per-company settings of purchase document recognition. The API key is write-only: the server only says whether one is stored.
export function RecognitionSettingsSection() {
  const { t, lang } = useI18n();
  const [enabled, setEnabled] = useState(false);
  const [model, setModel] = useState<string>(DEFAULT_RECOGNITION_MODEL);
  const [hasKey, setHasKey] = useState(false);
  const [apiKey, setApiKey] = useState('');
  const [clearKey, setClearKey] = useState(false);
  const [limit, setLimit] = useState('');
  const [usage, setUsage] = useState<{ month: string; calls: number; inputTokens: number; outputTokens: number; costEur: number; limitEur: number | null; limitReached: boolean } | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/settings/recognition').then(r => r.json()).then(d => {
      if (cancelled) return;
      setEnabled(Boolean(d.enabled)); setHasKey(Boolean(d.hasKey)); setModel(d.model || DEFAULT_RECOGNITION_MODEL); setLimit(d.monthlyLimitEur == null ? '' : String(d.monthlyLimitEur)); setUsage(d.usage || null);
    }).catch(() => { if (!cancelled) setMessage({ kind: 'error', text: t('common.error') }); }).finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [t]);

  async function save() {
    setBusy(true); setMessage(null);
    try {
      const res = await fetch('/api/settings/recognition', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ enabled, model, monthlyLimitEur: limit.trim() ? Number(limit.replace(',', '.')) : null, ...(apiKey ? { apiKey } : {}), ...(clearKey ? { clearKey: true } : {}) }) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || t('common.error'));
      setEnabled(Boolean(data.enabled)); setHasKey(Boolean(data.hasKey)); setLimit(data.monthlyLimitEur == null ? '' : String(data.monthlyLimitEur)); setUsage(data.usage || null); setApiKey(''); setClearKey(false);
      setMessage({ kind: 'ok', text: t('docs.settingsSaved') });
    } catch (error) { setMessage({ kind: 'error', text: error instanceof Error ? error.message : t('common.error') }); } finally { setBusy(false); }
  }
  async function test() {
    setBusy(true); setMessage(null);
    try {
      const res = await fetch('/api/settings/recognition/test', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ model, ...(apiKey ? { apiKey } : {}) }) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || t('common.error'));
      setMessage(data.ok ? { kind: 'ok', text: t('docs.keyWorks') } : { kind: 'error', text: data.error || t('common.error') });
    } catch (error) { setMessage({ kind: 'error', text: error instanceof Error ? error.message : t('common.error') }); } finally { setBusy(false); }
  }
  function removeKey() { setClearKey(true); setApiKey(''); setHasKey(false); setEnabled(false); }

  return <section className="space-y-3 rounded-xl border border-slate-800 p-4" aria-label={t('docs.settingsTitle')}>
    <h3 className="font-bold text-white">{t('docs.settingsTitle')}</h3>
    <p className="text-sm text-slate-400">{t('docs.settingsIntro')} <a href="/help/document-recognition" target="_blank" rel="noopener noreferrer" className="font-semibold text-emerald-300 underline">{t('docs.helpLink')}</a></p>
    {message && <p role={message.kind === 'error' ? 'alert' : 'status'} className={`rounded-lg border p-2 text-sm ${message.kind === 'error' ? 'border-rose-800 bg-rose-950/40 text-rose-300' : 'border-emerald-800 bg-emerald-950/40 text-emerald-300'}`}>{message.text}</p>}
    <fieldset disabled={loading || busy} className="space-y-3 disabled:opacity-50">
      <label className="flex items-center gap-2 text-sm text-slate-200"><input type="checkbox" className="h-4 w-4 accent-emerald-500" checked={enabled} onChange={e => setEnabled(e.target.checked)} /> {t('docs.settingsEnable')}</label>
      <label className="block text-xs font-medium text-slate-400">{t('docs.settingsKey')}
        <input type="password" autoComplete="new-password" onKeyDown={e => { if (e.key === 'Enter') e.preventDefault(); }} value={apiKey} onChange={e => { setApiKey(e.target.value); setClearKey(false); }} placeholder={hasKey ? t('docs.keyStored') : ''} className={input} />
      </label>
      {hasKey && !apiKey && <div className="flex items-center gap-3 text-sm"><span className="text-emerald-400">{t('docs.keyStored')}</span><button type="button" onClick={removeKey} className="text-rose-300 underline">{t('docs.keyClear')}</button></div>}
      {clearKey && <p className="text-xs text-amber-300">{t('docs.keyWillClear')}</p>}
      <label className="block text-xs font-medium text-slate-400">{t('docs.settingsModel')}
        <select value={model} onChange={e => setModel(e.target.value)} className={input}>
          {RECOGNITION_MODELS.map(m => <option key={m.id} value={m.id}>{m.label} — {t(hintKey[m.hint])}{m.id === DEFAULT_RECOGNITION_MODEL ? ` (${t('docs.modelDefault')})` : ''}</option>)}
        </select>
      </label>
      <label className="block text-xs font-medium text-slate-400">{t('docs.limitLabel')}
        <input type="text" inputMode="decimal" onKeyDown={e => { if (e.key === 'Enter') e.preventDefault(); }} value={limit} onChange={e => setLimit(e.target.value)} placeholder={t('docs.limitNone')} className={input} />
        <span className="mt-1 block text-[11px] text-slate-500">{t('docs.limitHelp')}</span>
      </label>
      {usage && (
        <div role="status" className={`rounded-lg border p-3 text-sm ${usage.limitReached ? 'border-amber-700 bg-amber-950/40 text-amber-200' : 'border-slate-800 bg-slate-950 text-slate-300'}`}>
          <strong className="block text-slate-100">{t('docs.usageTitle', { month: usage.month })}</strong>
          {t('docs.usageLine', { calls: usage.calls, cost: usage.costEur.toLocaleString(LOCALES[lang], { minimumFractionDigits: 2, maximumFractionDigits: 2 }), input: usage.inputTokens.toLocaleString(LOCALES[lang]), output: usage.outputTokens.toLocaleString(LOCALES[lang]) })}
          {usage.limitEur !== null && <> {t('docs.usageOfLimit', { limit: usage.limitEur.toLocaleString(LOCALES[lang], { minimumFractionDigits: 2, maximumFractionDigits: 2 }) })}</>}
          {usage.limitReached && <span className="mt-1 block font-semibold">{t('docs.limitReachedShort')}</span>}
        </div>
      )}
    </fieldset>
    <div className="flex flex-wrap justify-end gap-3">
      <button type="button" disabled={loading || busy || (!apiKey && !hasKey)} onClick={test} className="rounded-lg border border-slate-700 px-4 py-2 text-sm font-semibold text-slate-200 hover:bg-slate-800 disabled:opacity-40">{t('docs.testKey')}</button>
      <button type="button" disabled={loading || busy} onClick={save} className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-500 disabled:opacity-40">{t('docs.settingsSave')}</button>
    </div>
  </section>;
}
