'use client';
import { Fragment, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { useT } from '@/lib/i18n/client';

interface Setting { code: string; enabled: boolean; period: string | null; auto: boolean; reason: string; }
interface Event { code: string; title: string; periodStart: string; periodEnd: string; dueNominal: string; dueWorkingDay: string; source: string; done: boolean; doneAt: number | null; submittedDate: string | null; registrationNo: string | null; note: string | null; }
interface PreparedFile { name: string; mime: string; content: string }
interface Prepared { code: string; periodStart: string; periodEnd: string; dueNominal: string; files: PreparedFile[]; issues: { level: 'error' | 'warning'; text: string }[]; submit: { system: 'EDS' | 'EDAS'; url: string }; done: boolean; }
interface FilingInfo { provider: { id: string; label: string; manualUrl: string; status: string } | null; attempts: Attempt[] }
interface Attempt { id: number; provider: string; at: string; action: 'SUBMIT' | 'CHECK'; result: string; message: string }
const CODES = ['FR0600', 'FR0564', 'GPM313', 'GPM312', 'PLN204'];
const PERIODS: [string, string][] = [['MONTH', 'tax.cal.periodMonth'], ['QUARTER', 'tax.cal.periodQuarter'], ['HALF', 'tax.cal.periodHalf']];
const daysTo = (from: string, to: string) => Math.round((Date.parse(to) - Date.parse(from)) / 86_400_000);
const inputCls = 'bg-slate-950 border border-slate-700 rounded px-2 py-1 text-sm';

export function TaxCalendarClient({ today, settings, events }: { today: string; settings: Setting[]; events: Event[] }) {
  const t = useT();
  const router = useRouter();
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState<{ key: string; loading: boolean; error: string; data: Prepared | null } | null>(null);
  const [submittedDate, setSubmittedDate] = useState(today);
  const [registrationNo, setRegistrationNo] = useState('');
  const [submitNote, setSubmitNote] = useState('');
  const [filing, setFiling] = useState<FilingInfo | null>(null);
  const [filingBusy, setFilingBusy] = useState(false);
  const [filingResult, setFilingResult] = useState<{ result: string; message: string; provider: string } | null>(null);
  const focus = useSearchParams().get('focus') || '';

  async function save(body: object) {
    setBusy(true); setError('');
    try {
      const res = await fetch('/api/tax-calendar', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { setError(data.error || t('tax.cal.saveFailed')); return false; }
      router.refresh();
      return true;
    } finally { setBusy(false); }
  }

  async function prepare(e: Event) {
    const key = `${e.code}:${e.periodEnd}`;
    setSubmittedDate(today); setRegistrationNo(''); setSubmitNote('');
    setOpen({ key, loading: true, error: '', data: null });
    setFiling(null); setFilingResult(null);
    fetch(`/api/tax-calendar/filing?code=${e.code}&periodEnd=${e.periodEnd}`).then(r => r.ok ? r.json() : null).then(d => { if (d) setFiling(d); }).catch(() => {});
    try {
      const res = await fetch(`/api/tax-calendar/prepare?code=${e.code}&periodEnd=${e.periodEnd}`);
      const data = await res.json().catch(() => ({}));
      setOpen({ key, loading: false, error: res.ok ? '' : (data.error || t('tax.cal.prepareFailed')), data: res.ok ? data : null });
    } catch { setOpen({ key, loading: false, error: t('tax.cal.prepareFailed'), data: null }); }
  }
  async function runFiling(e: Event, action: 'submit' | 'check') {
    setFilingBusy(true); setFilingResult(null);
    const provider = filing?.provider?.id || '';
    try {
      const res = await fetch('/api/tax-calendar/filing', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code: e.code, periodEnd: e.periodEnd, action }) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { setFilingResult({ result: 'ERROR', message: data.error || t('tax.cal.filingFailed'), provider }); return; }
      setFilingResult({ result: data.result.result, message: data.result.message, provider });
      setFiling(f => f && { ...f, attempts: data.attempts });
    } catch { setFilingResult({ result: 'ERROR', message: t('tax.cal.filingFailed'), provider }); } finally { setFilingBusy(false); }
  }
  // NOT_IMPLEMENTED texts are shown in the interface language; other messages come from the server as they are.
  const filingText = (result: string, provider: string, message: string) => result === 'NOT_IMPLEMENTED' && ['VMI_EDS', 'SODRA_EDAS', 'RC'].includes(provider) ? t(`tax.cal.notImplemented.${provider}`) : message;
  function downloadFile(f: PreparedFile) {
    const url = URL.createObjectURL(new Blob([f.content], { type: f.mime + ';charset=utf-8' }));
    const a = document.createElement('a'); a.href = url; a.download = f.name; a.click(); URL.revokeObjectURL(url);
  }

  // A link from the reminder letter (?focus=CODE:periodEnd) opens the entry.
  useEffect(() => {
    const e = events.find(x => `${x.code}:${x.periodEnd}` === focus);
    if (e) void prepare(e);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focus]);

  const overdue = events.filter(e => !e.done && e.dueNominal < today);
  const upcoming = events.filter(e => e.dueNominal >= today);

  const panel = (e: Event) => {
    if (!open) return null;
    if (open.loading) return <div className="text-sm text-slate-400">{t('tax.cal.preparing')}</div>;
    if (open.error || !open.data) return <div className="text-sm text-amber-200">{open.error}</div>;
    const d = open.data;
    const errors = d.issues.filter(i => i.level === 'error'), warnings = d.issues.filter(i => i.level === 'warning');
    return (
      <div className="space-y-3 text-sm">
        <div className="flex justify-between gap-3"><strong className="text-white">{e.title}: {t('tax.cal.prepPeriod', { start: d.periodStart, end: d.periodEnd, due: d.dueNominal })}</strong><button onClick={() => setOpen(null)} className="text-xs text-slate-400 underline">{t('tax.cal.prepClose')}</button></div>
        {d.files.length > 0
          ? <div className="flex flex-wrap gap-2">{d.files.map(f => <button key={f.name} onClick={() => downloadFile(f)} className="px-3 py-1.5 rounded border border-emerald-700 text-emerald-300 text-xs">{t('tax.cal.prepFiles')}: {f.name}</button>)}</div>
          : <div className="text-amber-200">{t('tax.cal.prepNoFiles')}</div>}
        <div>
          <strong className="text-slate-200">{t('tax.cal.prepChecks')}</strong>
          {d.issues.length === 0 ? <p className="text-slate-400">{t('tax.cal.prepNoIssues')}</p> : (
            <ul className="list-disc pl-5 mt-1 space-y-1">
              {errors.map((i, n) => <li key={`e${n}`} className="text-rose-300">{t('tax.cal.prepError')}: {i.text}</li>)}
              {warnings.map((i, n) => <li key={`w${n}`} className="text-amber-200">{t('tax.cal.prepWarning')}: {i.text}</li>)}
            </ul>
          )}
        </div>
        <div><strong className="text-slate-200">{t('tax.cal.submitWhere')}:</strong> <a href={d.submit.url} target="_blank" rel="noreferrer" className="text-sky-300 underline">{d.submit.system === 'EDS' ? t('tax.cal.submitEds') : t('tax.cal.submitEdas')} ({d.submit.url.replace('https://', '')})</a></div>
        {filing?.provider && (
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <button disabled={filingBusy || errors.length > 0} onClick={() => void runFiling(e, 'submit')} className="px-3 py-1.5 rounded border border-sky-700 text-sky-300 text-xs font-semibold disabled:opacity-40">{t(`tax.cal.submitTo.${filing.provider.id}`)}</button>
              <button disabled={filingBusy} onClick={() => void runFiling(e, 'check')} className="px-3 py-1.5 rounded border border-slate-700 text-xs">{t('tax.cal.checkStatus')}</button>
              <span className="text-xs text-slate-500">{t('tax.cal.connection')}: {t(`api.status${filing.provider.status}`)}</span>
            </div>
            {filingResult && (
              <div role={filingResult.result === 'ERROR' ? 'alert' : 'status'} className={`rounded border p-3 text-xs space-y-1 ${filingResult.result === 'ERROR' ? 'border-rose-800 bg-rose-950/30 text-rose-200' : 'border-sky-800 bg-sky-950/30 text-sky-100'}`}>
                <p>{filingText(filingResult.result, filingResult.provider, filingResult.message)}</p>
                {filingResult.result === 'NOT_IMPLEMENTED' && <p><a href={filing.provider.manualUrl} target="_blank" rel="noreferrer" className="underline">{t('tax.cal.manualLink')}: {filing.provider.manualUrl.replace('https://', '')}</a> · <Link href="/settings/api" className="underline">{t('tax.cal.apiSettingsLink')}</Link></p>}
              </div>
            )}
            <div>
              <strong className="text-slate-200 text-xs">{t('tax.cal.attemptsTitle')}</strong>
              {filing.attempts.length === 0 ? <p className="text-xs text-slate-500">{t('tax.cal.attemptsNone')}</p> : (
                <ul className="mt-1 space-y-1 text-xs text-slate-400">
                  {filing.attempts.map(a => <li key={a.id}>{a.at.slice(0, 16).replace('T', ' ')} · {t(a.action === 'SUBMIT' ? 'tax.cal.attemptSubmit' : 'tax.cal.attemptCheck')} · {a.result} — {filingText(a.result, a.provider, a.message)}</li>)}
                </ul>
              )}
            </div>
          </div>
        )}
        {!e.done && (
          <div className="flex flex-wrap items-end gap-3">
            <label className="text-xs text-slate-300">{t('tax.cal.submitDate')}<input type="date" value={submittedDate} onChange={x => setSubmittedDate(x.target.value)} className={`block mt-1 ${inputCls}`} /></label>
            <label className="text-xs text-slate-300">{t('tax.cal.submitRegNo')}<input value={registrationNo} maxLength={100} onChange={x => setRegistrationNo(x.target.value)} className={`block mt-1 ${inputCls}`} /></label>
            <label className="text-xs text-slate-300">{t('tax.cal.submitNote')}<input value={submitNote} maxLength={500} onChange={x => setSubmitNote(x.target.value)} className={`block mt-1 w-64 ${inputCls}`} /></label>
            <button disabled={busy} onClick={async () => { if (await save({ code: e.code, periodEnd: e.periodEnd, done: true, submittedDate, registrationNo, note: submitNote })) setOpen(null); }} className="px-3 py-1.5 rounded bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold">{t('tax.cal.markSubmitted')}</button>
          </div>
        )}
        <p className="text-xs text-slate-500">{t('tax.cal.autoSubmitNote')}</p>
      </div>
    );
  };

  const row = (e: Event) => {
    const left = daysTo(today, e.dueNominal);
    const key = `${e.code}:${e.periodEnd}`;
    return (
      <Fragment key={key}>
        <tr className="border-t border-slate-800">
          <td className="p-3">{e.title}<div className="text-xs text-slate-500">{e.source}</div></td>
          <td className="p-3 text-slate-400">{e.periodStart} – {e.periodEnd}</td>
          <td className="p-3 font-mono">{e.dueNominal}{e.dueWorkingDay !== e.dueNominal && <div className="text-xs text-amber-400">{t('tax.cal.nonWorkingDay', { date: e.dueWorkingDay })}</div>}</td>
          <td className={`p-3 ${e.done ? 'text-emerald-400' : left < 0 ? 'text-rose-400' : left <= 7 ? 'text-amber-400' : 'text-slate-300'}`}>
            {e.done
              ? <>{t('tax.cal.filed')}{e.submittedDate && <div className="text-xs text-slate-400">{t('tax.cal.submittedInfo', { date: e.submittedDate })}{e.registrationNo ? ', ' + t('tax.cal.submittedReg', { no: e.registrationNo }) : ''}</div>}</>
              : left < 0 ? t('tax.cal.overdueDays', { days: -left }) : left === 0 ? t('tax.cal.today') : t('tax.cal.inDays', { days: left })}
          </td>
          <td className="p-3 text-right space-x-2 whitespace-nowrap">
            <button disabled={busy} onClick={() => prepare(e)} className="px-3 py-1 rounded bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold">{t('tax.cal.prepare')}</button>
            <button disabled={busy} onClick={() => save({ code: e.code, periodEnd: e.periodEnd, done: !e.done })} className="px-3 py-1 rounded border border-slate-700 text-xs">{e.done ? t('tax.cal.unmark') : t('tax.cal.markFiled')}</button>
          </td>
        </tr>
        {open?.key === key && <tr className="border-t border-slate-800 bg-slate-950/40"><td colSpan={5} className="p-4">{panel(e)}</td></tr>}
      </Fragment>
    );
  };
  const table = (title: string, list: Event[], empty: string) => (
    <div className="rounded-xl border border-slate-800 bg-slate-900 overflow-x-auto">
      <div className="p-3 font-semibold text-white">{title}</div>
      <table className="w-full text-sm"><tbody>{list.length === 0 ? <tr><td className="p-3 text-slate-400">{empty}</td></tr> : list.map(row)}</tbody></table>
    </div>
  );

  return (
    <div className="p-8 max-w-6xl mx-auto space-y-6 text-slate-200">
      <div>
        <h1 className="text-2xl font-bold text-white">{t('tax.cal.title')}</h1>
        <p className="text-sm text-slate-400 mt-1">{t('tax.cal.intro', { today })}</p>
      </div>
      {error && <div className="rounded border border-amber-700 bg-amber-950/30 p-3 text-amber-200">{error}</div>}
      <div className="rounded-xl border border-slate-800 bg-slate-900 p-4 space-y-2">
        <div className="font-semibold text-white">{t('tax.cal.applicable')}</div>
        {settings.map(s => (
          <div key={s.code} className="flex flex-wrap items-center gap-3 text-sm">
            <label className="flex items-center gap-2 min-w-72"><input type="checkbox" checked={s.enabled} disabled={busy || s.auto} onChange={e => save({ code: s.code, enabled: e.target.checked })} />{CODES.includes(s.code) ? t(`tax.cal.${s.code}`) : s.code}</label>
            {s.code === 'FR0600' && s.enabled && <select disabled={busy} value={s.period || 'MONTH'} onChange={e => save({ code: 'FR0600', period: e.target.value })} className="bg-slate-950 border border-slate-700 rounded p-1">{PERIODS.map(([v, l]) => <option key={v} value={v}>{t(l)}</option>)}</select>}
            <span className="text-xs text-slate-500">{s.reason}</span>
          </div>
        ))}
      </div>
      {table(t('tax.cal.overdueTitle'), overdue, t('tax.cal.overdueEmpty'))}
      {table(t('tax.cal.upcomingTitle'), upcoming, t('tax.cal.upcomingEmpty'))}
    </div>
  );
}
