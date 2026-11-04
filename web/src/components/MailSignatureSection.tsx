'use client';
import { useEffect, useState } from 'react';
import { useT } from '@/lib/i18n/client';
import { buildSignature, type SignatureCompany, type SignatureConfig } from '@/lib/signature-build';
import { SignaturePreview } from './SignaturePreview';

type Signature = { enabled: boolean; includeLogo: boolean; config: SignatureConfig; text: string; company: SignatureCompany | null; hasLogo: boolean };
const field = 'block mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 focus:border-emerald-500 focus:outline-none';
const lbl = 'block text-xs font-medium text-slate-400';
const box = 'h-4 w-4 accent-emerald-500';

/** Signature configurator: on/off, person and own contacts, which company details to show, website, extra text, logo; live preview. */
export function MailSignatureSection({ companyId }: { companyId: number }) {
  const t = useT();
  const [s, setS] = useState<Signature | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  useEffect(() => {
    let cancelled = false;
    fetch(`/api/companies/${companyId}/signature`).then(r => r.json()).then(d => { if (!cancelled) setS(d); }).catch(() => { if (!cancelled) setMessage({ ok: false, text: t('common.error') }); });
    return () => { cancelled = true; };
  }, [companyId, t]);
  if (!s) return null;

  const set = (patch: Partial<Signature>) => { setS({ ...s, ...patch }); setMessage(null); };
  const setConfig = (patch: Partial<SignatureConfig>) => set({ config: { ...s.config, ...patch } });
  const setShow = (key: keyof SignatureConfig['show'], value: boolean) => setConfig({ show: { ...s.config.show, [key]: value } });
  const save = async () => {
    setBusy(true); setMessage(null);
    try {
      const r = await fetch(`/api/companies/${companyId}/signature`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ enabled: s.enabled, includeLogo: s.includeLogo, config: s.config }) });
      const d = await r.json();
      if (!r.ok) throw Error(d.error);
      setS(d); setMessage({ ok: true, text: t('companies.settingsSaved') });
    } catch (e) { setMessage({ ok: false, text: e instanceof Error ? e.message : t('common.error') }); } finally { setBusy(false); }
  };
  const text = buildSignature(s.config, s.company ?? undefined);
  const input = (key: 'personName' | 'personTitle' | 'phone' | 'email' | 'website', type = 'text', placeholder = '') => (
    <label className={lbl}>{t(`companies.sig_${key}`)}<input type={type} className={field} value={s.config[key]} placeholder={placeholder} maxLength={200} onChange={e => setConfig({ [key]: e.target.value })} /></label>
  );
  const shows: (keyof SignatureConfig['show'])[] = ['companyName', 'codes', 'address', 'contacts', 'bank'];

  return (
    <section className="space-y-3 border-t border-slate-800 pt-4" aria-labelledby="sig-title">
      <h3 id="sig-title" className="font-semibold text-white">{t('companies.signatureTitle')}</h3>
      <label className="flex items-center gap-2 text-sm text-slate-200"><input type="checkbox" className={box} checked={s.enabled} onChange={e => set({ enabled: e.target.checked })} />{t('companies.signatureEnable')}</label>
      <fieldset disabled={!s.enabled} className="space-y-3 disabled:opacity-50">
        <div className="grid gap-3 sm:grid-cols-2">
          {input('personName')}
          {input('personTitle')}
          {input('phone', 'tel', s.company?.phone || '')}
          {input('email', 'email', s.company?.email || '')}
          <div className="sm:col-span-2">{input('website', 'url', 'https://')}</div>
        </div>
        <div>
          <div className={lbl}>{t('companies.sig_show')}</div>
          <div className="mt-1 grid gap-1.5 sm:grid-cols-2">
            {shows.map(key => <label key={key} className="flex items-center gap-2 text-sm text-slate-200"><input type="checkbox" className={box} checked={s.config.show[key]} onChange={e => setShow(key, e.target.checked)} />{t(`companies.sig_show_${key}`)}</label>)}
          </div>
        </div>
        <label className={lbl}>{t('companies.sig_extra')}<textarea rows={3} maxLength={1000} className={field} value={s.config.extra} onChange={e => setConfig({ extra: e.target.value })} /></label>
        <label className={`flex items-center gap-2 text-sm ${s.hasLogo ? 'text-slate-200' : 'text-slate-500'}`}><input type="checkbox" className={box} disabled={!s.hasLogo} checked={s.includeLogo && s.hasLogo} onChange={e => set({ includeLogo: e.target.checked })} />{s.hasLogo ? t('companies.signatureLogo') : t('companies.signatureNoLogo')}</label>
        {(text || (s.includeLogo && s.hasLogo)) && (
          <div className="rounded-lg bg-white p-3 text-sm text-slate-800">
            <div className="text-[11px] uppercase tracking-wider text-slate-400">{t('companies.signaturePreview')}</div>
            <SignaturePreview signature={{ text, logoUrl: s.includeLogo && s.hasLogo ? `/api/companies/${companyId}/logo` : null }} />
          </div>
        )}
      </fieldset>
      {message && <p role="status" className={`text-sm ${message.ok ? 'text-emerald-400' : 'text-rose-300'}`}>{message.text}</p>}
      <div className="flex justify-end"><button type="button" disabled={busy} onClick={save} className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-500 disabled:opacity-40">{t('companies.signatureSave')}</button></div>
    </section>
  );
}
