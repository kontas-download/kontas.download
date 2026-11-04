'use client';

import { useState } from 'react';
import Link from 'next/link';
import { AlertCircle, Check, RotateCcw } from '@/components/icons';
import { useI18n } from '@/lib/i18n/client';
import type { AutomationSettings } from '@/lib/automation';

type Run = { id: number; job: string; runDate: string; status: 'OK' | 'ERROR'; message: string | null; trigger: string; createdAt: string; details: { text: string; ok: boolean }[] };
const card = 'rounded-xl border border-slate-800 bg-slate-900 p-5';
const input = 'mt-1 block w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 focus:border-emerald-500 focus:outline-none';
const lbl = 'block text-xs font-medium text-slate-400';

/** Automation robot: one switch per job with its parameters, "run now" and the log of what the robot did. */
export function AutomationClient({ settings: initial, runs: initialRuns, templates, smtpReady, companyEmail, autoTemplates, admin }: { settings: AutomationSettings; runs: Run[]; templates: { id: number; name: string }[]; smtpReady: boolean; companyEmail: string; autoTemplates: number; admin: boolean }) {
  const { t } = useI18n();
  const [s, setS] = useState({ ...initial, reminderDays: initial.reminderDays.join(', '), notifyEmail: initial.notifyEmail || companyEmail });
  const [runs, setRuns] = useState(initialRuns);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null);
  const set = (patch: Partial<typeof s>) => { setS({ ...s, ...patch }); setNotice(null); };

  const call = async (method: 'PUT' | 'POST', body?: unknown) => {
    const res = await fetch('/api/automation', { method, headers: { 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || t('automation.failed'));
    return data;
  };
  const save = async () => {
    setBusy(true);
    try { await call('PUT', { ...s, reminderDays: s.reminderDays, reminderTemplateId: s.reminderTemplateId }); setNotice({ ok: true, text: t('automation.saved') }); }
    catch (e) { setNotice({ ok: false, text: e instanceof Error ? e.message : t('automation.failed') }); } finally { setBusy(false); }
  };
  const runNow = async () => {
    setBusy(true);
    try {
      await call('PUT', s);
      const data = await call('POST');
      setRuns(data.runs);
      const ran = (data.results as { status: string }[]).filter(r => r.status !== 'SKIPPED');
      setNotice({ ok: !ran.some(r => r.status === 'ERROR'), text: ran.length ? t('automation.ranDone', { count: ran.length }) : t('automation.ranNothing') });
    } catch (e) { setNotice({ ok: false, text: e instanceof Error ? e.message : t('automation.failed') }); } finally { setBusy(false); }
  };

  const toggle = (key: 'recurringEnabled' | 'remindersEnabled' | 'bankMatchEnabled' | 'digestEnabled' | 'taxEnabled', title: string, hint: string, extra?: React.ReactNode) => (
    <section className={card}>
      <label className="flex items-start gap-3">
        <input type="checkbox" className="mt-1 h-4 w-4 accent-emerald-500" disabled={!admin} checked={s[key]} onChange={e => set({ [key]: e.target.checked } as Partial<typeof s>)} />
        <span><span className="block font-semibold text-white">{title}</span><span className="block text-sm text-slate-400">{hint}</span></span>
      </label>
      {extra && <div className={`mt-4 pl-7 ${s[key] ? '' : 'opacity-50'}`}>{extra}</div>}
    </section>
  );
  const days = [1, 2, 3, 4, 5, 6, 7];

  return (
    <div className="p-8 max-w-5xl mx-auto space-y-6">
      <header>
        <h1 className="text-2xl font-bold tracking-tight text-white">{t('automation.title')}</h1>
        <p className="mt-1 text-sm text-slate-400">{t('automation.subtitle')}</p>
      </header>
      {!smtpReady && <div role="alert" className="flex items-center gap-2 rounded-lg border border-amber-800 bg-amber-950/40 px-3 py-2 text-sm text-amber-300"><AlertCircle className="w-4 h-4 shrink-0" aria-hidden />{t('automation.smtpMissing')}</div>}
      {notice && <div role="status" className={`rounded-lg border px-3 py-2 text-sm ${notice.ok ? 'border-emerald-800 bg-emerald-950/40 text-emerald-300' : 'border-rose-800 bg-rose-950/40 text-rose-300'}`}>{notice.text}</div>}

      {toggle('recurringEnabled', t('automation.recurring'), t('automation.recurringHint'),
        <p className="text-sm text-slate-300">{t('automation.recurringCount', { count: autoTemplates })} <Link href="/recurring" className="text-emerald-400 hover:underline">{t('automation.recurringOpen')}</Link></p>)}

      {toggle('remindersEnabled', t('automation.reminders'), t('automation.remindersHint'),
        <div className="grid gap-3 sm:grid-cols-2">
          <label className={lbl}>{t('automation.reminderDays')}<input className={input} disabled={!admin} value={s.reminderDays} onChange={e => set({ reminderDays: e.target.value })} placeholder="3, 14, 30" /></label>
          <label className={lbl}>{t('automation.reminderTemplate')}<select className={input} disabled={!admin} value={s.reminderTemplateId ?? ''} onChange={e => set({ reminderTemplateId: e.target.value ? Number(e.target.value) : null })}><option value="">{t('automation.reminderDefault')}</option>{templates.map(x => <option key={x.id} value={x.id}>{x.name}</option>)}</select></label>
        </div>)}

      {toggle('bankMatchEnabled', t('automation.bank'), t('automation.bankHint'))}

      {toggle('digestEnabled', t('automation.digest'), t('automation.digestHint'),
        <label className={lbl}>{t('automation.digestDay')}<select className={input} disabled={!admin} value={s.digestWeekday} onChange={e => set({ digestWeekday: Number(e.target.value) })}>{days.map(d => <option key={d} value={d}>{t(`automation.day${d}`)}</option>)}</select></label>)}

      {toggle('taxEnabled', t('automation.tax'), t('automation.taxHint'),
        <label className={lbl}>{t('automation.taxDays')}<input type="number" min={1} max={30} className={input} disabled={!admin} value={s.taxDaysBefore} onChange={e => set({ taxDaysBefore: Number(e.target.value) })} /></label>)}

      <section className={card}>
        <label className={lbl}>{t('automation.notifyEmail')}<input type="email" className={input} disabled={!admin} value={s.notifyEmail} onChange={e => set({ notifyEmail: e.target.value })} /></label>
        <p className="mt-1 text-xs text-slate-500">{t('automation.notifyHint')}</p>
      </section>

      {admin && (
        <div className="flex flex-wrap gap-2">
          <button type="button" disabled={busy} onClick={save} className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-500 disabled:opacity-50"><Check className="w-4 h-4" aria-hidden />{t('automation.save')}</button>
          <button type="button" disabled={busy} onClick={runNow} className="inline-flex items-center gap-2 rounded-lg border border-slate-700 px-4 py-2 text-sm font-semibold text-slate-200 hover:bg-slate-800 disabled:opacity-50"><RotateCcw className="w-4 h-4" aria-hidden />{busy ? t('automation.running') : t('automation.runNow')}</button>
        </div>
      )}
      <p className="text-xs text-slate-500">{t('automation.scheduleNote')}</p>

      <section className={card} aria-labelledby="runs-title">
        <h2 id="runs-title" className="mb-3 font-semibold text-white">{t('automation.log')}</h2>
        {runs.length === 0 ? <p className="text-sm text-slate-400">{t('automation.logEmpty')}</p> : (
          <ul className="divide-y divide-slate-800/60">
            {runs.map(r => (
              <li key={r.id} className="py-2 text-sm">
                <details>
                  <summary className="cursor-pointer">
                    <span className="font-mono text-xs text-slate-500">{r.createdAt.slice(0, 16).replace('T', ' ')}</span>
                    <span className="ml-2 text-slate-200">{t(`automation.job_${r.job}`)}</span>
                    <span className={`ml-2 rounded-full px-2 py-0.5 text-[10px] font-bold ${r.status === 'OK' ? 'bg-emerald-500/10 text-emerald-400' : 'bg-rose-950/60 text-rose-300'}`}>{r.status === 'OK' ? t('automation.ok', { count: r.details.length }) : t('automation.error')}</span>
                    <span className="ml-2 text-xs text-slate-500">{t(`automation.trigger_${r.trigger}`)}</span>
                  </summary>
                  {r.message && <p className="mt-1 text-xs text-rose-300">{r.message}</p>}
                  <ul className="mt-1 space-y-0.5 pl-4 text-xs">{r.details.map((d, i) => <li key={i} className={d.ok ? 'text-slate-300' : 'text-amber-300'}>{d.ok ? '✓' : '!'} {d.text}</li>)}</ul>
                  {!r.details.length && !r.message && <p className="mt-1 pl-4 text-xs text-slate-500">{t('automation.nothingToDo')}</p>}
                </details>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
