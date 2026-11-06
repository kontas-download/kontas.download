'use client';
import { useEffect, useState } from 'react';
import { useT } from '@/lib/i18n/client';
import { RecognitionSettingsSection } from '@/components/RecognitionSettingsSection';
import { RECOGNITION_VENDOR } from '@/lib/recognition/models';

interface Credential { provider: string; username: string; hasSecret: boolean; environment: 'TEST' | 'PRODUCTION'; status: 'NOT_CONNECTED' | 'CONFIGURED' | 'CONNECTED'; lastCheckedAt: string | null; lastError: string | null }
interface Overview { company: string; credentials: Credential[]; baseUrl: string; effectiveBaseUrl: string; admin: boolean }

const card = 'rounded-xl border border-slate-800 bg-slate-900 p-5 space-y-3';
const input = 'block mt-1 w-full h-10 rounded-lg border border-slate-700 bg-slate-950 px-3 text-sm text-slate-100 focus:border-emerald-500 focus:outline-none';
const statusTone = { NOT_CONNECTED: 'text-slate-400', CONFIGURED: 'text-amber-300', CONNECTED: 'text-emerald-400' } as const;

function CredentialCard({ provider, titleKey, introKey, userKey, initial }: { provider: string; titleKey: string; introKey: string; userKey: string; initial: Credential }) {
  const t = useT();
  const [cred, setCred] = useState(initial);
  const [username, setUsername] = useState(initial.username);
  const [password, setPassword] = useState('');
  const [environment, setEnvironment] = useState(initial.environment);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);

  async function send(method: 'PUT' | 'DELETE', body?: object, done?: string) {
    setBusy(true); setMessage(null);
    try {
      const res = await fetch(`/api/settings/api/${provider}`, { method, headers: { 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || t('common.error'));
      setCred(data); setUsername(data.username); setEnvironment(data.environment); setPassword('');
      setMessage({ kind: 'ok', text: done || t('api.saved') });
    } catch (error) { setMessage({ kind: 'error', text: error instanceof Error ? error.message : t('common.error') }); } finally { setBusy(false); }
  }

  return <section className={card} aria-label={t(titleKey)}>
    <div className="flex items-start justify-between gap-3">
      <h2 className="text-lg font-semibold text-white">{t(titleKey)}</h2>
      <span className={`text-sm font-medium ${statusTone[cred.status]}`}>{t('api.status')}: {t(`api.status${cred.status}`)}</span>
    </div>
    <p className="text-sm text-slate-400">{t(introKey)}</p>
    {message && <p role={message.kind === 'error' ? 'alert' : 'status'} className={`rounded-lg border p-2 text-sm ${message.kind === 'error' ? 'border-rose-800 bg-rose-950/40 text-rose-300' : 'border-emerald-800 bg-emerald-950/40 text-emerald-300'}`}>{message.text}</p>}
    <form onSubmit={e => { e.preventDefault(); void send('PUT', { username, environment, ...(password ? { password } : {}) }); }} className="space-y-3">
      <fieldset disabled={busy} className="space-y-3 disabled:opacity-50">
        <label className="block text-xs font-medium text-slate-400">{t(userKey)}
          <input autoComplete="off" value={username} maxLength={200} onChange={e => setUsername(e.target.value)} className={input} />
        </label>
        <label className="block text-xs font-medium text-slate-400">{t('api.password')}
          <input type="password" autoComplete="new-password" value={password} onChange={e => setPassword(e.target.value)} placeholder={cred.hasSecret ? t('api.secretKept') : ''} className={input} />
        </label>
        {cred.hasSecret && !password && <p className="text-sm text-emerald-400">{t('api.secretStored')}</p>}
        <label className="block text-xs font-medium text-slate-400">{t('api.environment')}
          <select value={environment} onChange={e => setEnvironment(e.target.value as 'TEST' | 'PRODUCTION')} className={input}>
            <option value="TEST">{t('api.envTest')}</option>
            <option value="PRODUCTION">{t('api.envProduction')}</option>
          </select>
        </label>
      </fieldset>
      {cred.lastCheckedAt && <p className="text-xs text-slate-500">{t('api.lastChecked', { at: cred.lastCheckedAt })}</p>}
      {cred.lastError && <p className="text-xs text-rose-300">{t('api.lastError', { error: cred.lastError })}</p>}
      <div className="flex flex-wrap gap-3">
        <button disabled={busy} className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-500 disabled:opacity-40">{busy ? t('api.saving') : t('api.save')}</button>
        {(cred.username || cred.hasSecret) && <button type="button" disabled={busy} onClick={() => void send('DELETE', undefined, t('api.removed'))} className="rounded-lg border border-slate-700 px-4 py-2 text-sm font-semibold text-rose-300 hover:bg-slate-800 disabled:opacity-40">{t('api.remove')}</button>}
      </div>
    </form>
  </section>;
}

function Placeholder({ titleKey, bodyKey }: { titleKey: string; bodyKey: string }) {
  const t = useT();
  return <section className={card} aria-label={t(titleKey)}>
    <div className="flex items-start justify-between gap-3">
      <h2 className="text-lg font-semibold text-white">{t(titleKey)}</h2>
      <span className="text-sm font-medium text-slate-400">{t('api.unavailable')}</span>
    </div>
    <p className="text-sm text-slate-400">{t(bodyKey)}</p>
  </section>;
}

function BaseUrlCard({ initial, effective, admin }: { initial: string; effective: string; admin: boolean }) {
  const t = useT();
  const [value, setValue] = useState(initial);
  const [shown, setShown] = useState(effective);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);
  async function save(e: React.FormEvent) {
    e.preventDefault(); setBusy(true); setMessage(null);
    try {
      const res = await fetch('/api/settings/api/app-url', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ baseUrl: value }) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || t('common.error'));
      setValue(data.baseUrl); setShown(data.effectiveBaseUrl); setMessage({ kind: 'ok', text: t('api.saved') });
    } catch (error) { setMessage({ kind: 'error', text: error instanceof Error ? error.message : t('common.error') }); } finally { setBusy(false); }
  }
  return <section className={card} aria-label={t('api.baseTitle')}>
    <h2 className="text-lg font-semibold text-white">{t('api.baseTitle')}</h2>
    <p className="text-sm text-slate-400">{t('api.baseIntro')}</p>
    {message && <p role={message.kind === 'error' ? 'alert' : 'status'} className={`rounded-lg border p-2 text-sm ${message.kind === 'error' ? 'border-rose-800 bg-rose-950/40 text-rose-300' : 'border-emerald-800 bg-emerald-950/40 text-emerald-300'}`}>{message.text}</p>}
    <form onSubmit={save} className="space-y-3">
      <label className="block text-xs font-medium text-slate-400">{t('api.baseLabel')}
        <input type="url" value={value} disabled={!admin || busy} onChange={e => setValue(e.target.value)} placeholder="https://apskaita.example.lt" className={`${input} disabled:opacity-50`} />
      </label>
      <p className="text-xs text-slate-500">{t('api.baseEffective', { url: shown || t('api.baseNone') })}</p>
      {admin ? <button disabled={busy} className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-500 disabled:opacity-40">{busy ? t('api.saving') : t('api.save')}</button> : <p className="text-xs text-slate-500">{t('api.baseAdminOnly')}</p>}
    </form>
  </section>;
}

export function ApiSettingsClient() {
  const t = useT();
  const [data, setData] = useState<Overview | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    let cancelled = false;
    fetch('/api/settings/api').then(async r => { const d = await r.json(); if (!r.ok) throw new Error(d.error || t('common.error')); if (!cancelled) setData(d); })
      .catch(e => { if (!cancelled) setError(e instanceof Error ? e.message : t('common.error')); });
    return () => { cancelled = true; };
  }, [t]);
  if (error) return <p role="alert" className="rounded-lg border border-rose-800 bg-rose-950/40 p-3 text-sm text-rose-300">{error}</p>;
  if (!data) return <p className="text-sm text-slate-400">…</p>;
  const cred = (provider: string) => data.credentials.find(c => c.provider === provider)!;
  return <div className="space-y-6">
    <p className="text-sm text-slate-300">{t('api.company', { name: data.company })}</p>
    <section className={card} aria-label={`${RECOGNITION_VENDOR} — ${t('api.recognitionTitle')}`}>
      <h2 className="text-lg font-semibold text-white">{RECOGNITION_VENDOR} — {t('api.recognitionTitle')}</h2>
      <RecognitionSettingsSection hideTitle />
    </section>
    <CredentialCard provider="VMI_EDS" titleKey="api.vmiTitle" introKey="api.vmiIntro" userKey="api.vmiUsername" initial={cred('VMI_EDS')} />
    <CredentialCard provider="SODRA_EDAS" titleKey="api.sodraTitle" introKey="api.sodraIntro" userKey="api.sodraUsername" initial={cred('SODRA_EDAS')} />
    <Placeholder titleKey="api.rcTitle" bodyKey="api.rcBody" />
    <Placeholder titleKey="api.bankTitle" bodyKey="api.bankBody" />
    <BaseUrlCard initial={data.baseUrl} effective={data.effectiveBaseUrl} admin={data.admin} />
  </div>;
}
