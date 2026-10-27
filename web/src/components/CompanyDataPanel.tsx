'use client';
import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useT } from '@/lib/i18n/client';

type Problem = { code: string; message: string; params?: Record<string, string | number> };
type PackagePreview = { ok: boolean; committed: boolean; companyId: number | null; companyName: string; counts: Record<string, number>; problems: Problem[]; warnings: Problem[]; accountsAdded: number };
type CsvPreview = { ok: boolean; committed: boolean; total: number; toInsert: number; inserted: number; skipped: { line: number; key: string; reason: string }[]; errors: { line: number; message: string }[] };
type HistoryEvent = { id: number; createdAt: string; entity: string; recordId: number; action: string; actorName: string | null; actorId: number | null; summary: string };

const SECTIONS = ['clients', 'stock', 'sales', 'purchases', 'journal', 'bank'] as const;
const PAGE = 50;
const button = 'px-3 py-1.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-100 text-xs disabled:opacity-40';
const primary = 'px-4 py-2 rounded bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-sm disabled:opacity-40';

// Export / import of company data and the company change history. Self-contained: mount it with the company id and name.
export function CompanyDataPanel({ companyId, companyName }: { companyId: number; companyName: string }) {
  const t = useT();
  const router = useRouter();
  const problemText = (p: Problem) => { const key = 'dataTransfer.problem_' + p.code; const text = t(key, p.params); return text === key ? p.message : text; };

  // Package import
  const [pkgText, setPkgText] = useState('');
  const [pkgFile, setPkgFile] = useState('');
  const [newName, setNewName] = useState('');
  const [allowDuplicate, setAllowDuplicate] = useState(false);
  const [preview, setPreview] = useState<PackagePreview | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function sendPackage(commit: boolean, text = pkgText) {
    setBusy(true); setError('');
    try {
      const query = new URLSearchParams();
      if (commit) query.set('commit', '1');
      if (newName.trim()) query.set('name', newName.trim());
      if (allowDuplicate) query.set('allowDuplicateCode', '1');
      const res = await fetch('/api/companies/import-package?' + query, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: text });
      const data = await res.json().catch(() => ({}));
      if (!data.problems) { setError(data.error || t('dataTransfer.importFailed')); return; }
      setPreview(data);
    } catch { setError(t('dataTransfer.importFailed')); } finally { setBusy(false); }
  }
  async function pickPackage(file: File | undefined) {
    if (!file) return;
    if (file.size > 50 * 1024 * 1024) { setError(t('dataTransfer.fileTooLarge')); return; }
    const text = await file.text();
    setPkgText(text); setPkgFile(file.name); setPreview(null);
    await sendPackage(false, text);
  }
  async function openCompany(id: number) {
    const res = await fetch('/api/companies/switch', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ companyId: id }) });
    if (res.ok) { router.push('/'); router.refresh(); } else setError(t('dataTransfer.loadFailed'));
  }

  // Clients / stock CSV import
  const [csvKind, setCsvKind] = useState<'clients' | 'stock'>('clients');
  const [csvText, setCsvText] = useState('');
  const [csvPreview, setCsvPreview] = useState<CsvPreview | null>(null);
  async function sendCsv(commit: boolean, text = csvText, kind = csvKind) {
    setBusy(true); setError('');
    try {
      const res = await fetch('/api/import/' + kind, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ csv: text, commit, companyId }) });
      const data = await res.json().catch(() => ({}));
      if (!('total' in data)) { setError(data.error || t('dataTransfer.importFailed')); return; }
      setCsvPreview(data);
    } catch { setError(t('dataTransfer.importFailed')); } finally { setBusy(false); }
  }
  async function pickCsv(file: File | undefined) {
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) { setError(t('dataTransfer.fileTooLarge')); return; }
    const text = await file.text();
    setCsvText(text); setCsvPreview(null);
    await sendCsv(false, text);
  }

  // History
  const [from, setFrom] = useState(''), [to, setTo] = useState(''), [entity, setEntity] = useState(''), [offset, setOffset] = useState(0);
  const [events, setEvents] = useState<HistoryEvent[]>([]), [entities, setEntities] = useState<string[]>([]), [total, setTotal] = useState(0), [loading, setLoading] = useState(false);
  const historyQuery = useCallback((extra: Record<string, string>) => {
    const q = new URLSearchParams(extra);
    if (from) q.set('from', from);
    if (to) q.set('to', to);
    if (entity) q.set('entity', entity);
    return q.toString();
  }, [from, to, entity]);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/companies/${companyId}/history?` + historyQuery({ limit: String(PAGE), offset: String(offset) }));
        const data = await res.json();
        if (cancelled) return;
        if (!res.ok) { setError(data.error || t('dataTransfer.loadFailed')); return; }
        setEvents(data.events); setTotal(data.total); setEntities(data.entities);
      } catch { if (!cancelled) setError(t('dataTransfer.loadFailed')); } finally { if (!cancelled) setLoading(false); }
    })();
    return () => { cancelled = true; };
  }, [companyId, historyQuery, offset, t]);

  const blocked = !preview?.ok || busy;
  return (
    <div className="space-y-6 text-sm text-slate-200">
      <h2 className="text-lg font-bold text-white">{t('dataTransfer.title', { name: companyName })}</h2>
      {error && <p role="alert" className="rounded border border-red-700 bg-red-950/30 p-2 text-red-200">{error}</p>}

      <section className="rounded-xl border border-slate-800 bg-slate-900 p-4 space-y-3">
        <h3 className="font-semibold text-white">{t('dataTransfer.exportTitle')}</h3>
        <p className="text-xs text-slate-400">{t('dataTransfer.exportNote')}</p>
        <a href={`/api/companies/${companyId}/export`} className={primary + ' inline-block'}>{t('dataTransfer.exportPackage')}</a>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {SECTIONS.map(s => (
            <div key={s} className="flex items-center justify-between gap-2 rounded border border-slate-800 px-3 py-2">
              <span>{t('dataTransfer.section_' + s)}</span>
              <span className="flex gap-1">
                <a className={button} href={`/api/export/${s}?format=csv&companyId=${companyId}`}>CSV</a>
                <a className={button} href={`/api/export/${s}?format=json&companyId=${companyId}`}>JSON</a>
              </span>
            </div>
          ))}
        </div>
        <p className="text-xs text-slate-400">{t('dataTransfer.csvNote')}</p>
      </section>

      <section className="rounded-xl border border-slate-800 bg-slate-900 p-4 space-y-3">
        <h3 className="font-semibold text-white">{t('dataTransfer.importTitle')}</h3>
        <p className="text-xs text-slate-400">{t('dataTransfer.importNote')}</p>
        <label className="block text-xs text-slate-300">{t('dataTransfer.packageFile')}
          <input type="file" accept=".json,application/json" disabled={busy} onChange={e => pickPackage(e.target.files?.[0])} className="block mt-1" />
        </label>
        {pkgFile && <p className="text-xs text-slate-400">{pkgFile}</p>}
        {preview && !preview.committed && (
          <div className="space-y-2">
            <div className="flex flex-wrap gap-3 items-end">
              <label className="text-xs text-slate-300">{t('dataTransfer.newName')}
                <input value={newName} placeholder={preview.companyName} maxLength={200} onChange={e => setNewName(e.target.value)} className="block mt-1 rounded border border-slate-700 bg-slate-950 p-2 text-sm" />
              </label>
              <label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={allowDuplicate} onChange={e => setAllowDuplicate(e.target.checked)} />{t('dataTransfer.allowDuplicate')}</label>
              <button type="button" disabled={busy || !pkgText} onClick={() => sendPackage(false)} className={button}>{t('dataTransfer.recheck')}</button>
            </div>
            <p>{preview.ok ? t('dataTransfer.previewOk', { name: preview.companyName }) : t('dataTransfer.previewBlocked')}</p>
            {Object.keys(preview.counts).length > 0 && (
              <table className="text-xs"><tbody>{Object.entries(preview.counts).filter(([, n]) => n > 0).map(([k, n]) => <tr key={k}><td className="pr-4 text-slate-400">{t('dataTransfer.count_' + k)}</td><td className="text-right">{n}</td></tr>)}</tbody></table>
            )}
            {preview.problems.length > 0 && <ul className="list-disc pl-5 rounded border border-amber-700 bg-amber-950/30 p-3 text-amber-200">{preview.problems.map((p, i) => <li key={i}>{problemText(p)}</li>)}</ul>}
            {preview.warnings.length > 0 && <ul className="list-disc pl-5 text-slate-400">{preview.warnings.map((p, i) => <li key={i}>{problemText(p)}</li>)}</ul>}
            <button type="button" disabled={blocked} onClick={() => sendPackage(true)} className={primary}>{t('dataTransfer.confirmImport')}</button>
          </div>
        )}
        {preview?.committed && preview.companyId && (
          <div className="rounded border border-emerald-700 bg-emerald-950/30 p-3 text-emerald-200 space-y-2">
            <p>{t('dataTransfer.imported', { name: preview.companyName })}</p>
            <button type="button" onClick={() => openCompany(preview.companyId!)} className={button}>{t('dataTransfer.openCompany')}</button>
          </div>
        )}
      </section>

      <section className="rounded-xl border border-slate-800 bg-slate-900 p-4 space-y-3">
        <h3 className="font-semibold text-white">{t('dataTransfer.csvImportTitle')}</h3>
        <p className="text-xs text-slate-400">{t('dataTransfer.csvImportNote')}</p>
        <div className="flex flex-wrap gap-3 items-end">
          <label className="text-xs text-slate-300">{t('dataTransfer.csvKind')}
            <select value={csvKind} onChange={e => { setCsvKind(e.target.value as 'clients' | 'stock'); setCsvPreview(null); setCsvText(''); }} className="block mt-1 rounded border border-slate-700 bg-slate-950 p-2">
              <option value="clients">{t('dataTransfer.section_clients')}</option>
              <option value="stock">{t('dataTransfer.section_stock')}</option>
            </select>
          </label>
          <label className="text-xs text-slate-300">{t('dataTransfer.csvFile')}
            <input key={csvKind} type="file" accept=".csv,text/csv" disabled={busy} onChange={e => pickCsv(e.target.files?.[0])} className="block mt-1" />
          </label>
        </div>
        {csvPreview && (
          <div className="space-y-2">
            <p>{csvPreview.committed ? t('dataTransfer.csvInserted', { count: csvPreview.inserted }) : t('dataTransfer.csvPreview', { total: csvPreview.total, count: csvPreview.toInsert, skipped: csvPreview.skipped.length })}</p>
            {csvPreview.skipped.length > 0 && <ul className="list-disc pl-5 text-slate-400 text-xs">{csvPreview.skipped.slice(0, 100).map(s => <li key={s.line}>{t(s.reason === 'exists' ? 'dataTransfer.skippedExists' : 'dataTransfer.skippedRepeated', { line: s.line, key: s.key })}</li>)}</ul>}
            {csvPreview.errors.length > 0 && <ul className="list-disc pl-5 rounded border border-amber-700 bg-amber-950/30 p-3 text-amber-200 text-xs">{csvPreview.errors.slice(0, 100).map((e, i) => <li key={i}>{t('dataTransfer.csvError', { line: e.line, message: e.message })}</li>)}</ul>}
            {!csvPreview.committed && <button type="button" disabled={busy || !csvPreview.ok || csvPreview.toInsert === 0} onClick={() => sendCsv(true)} className={primary}>{t('dataTransfer.csvCommit', { count: csvPreview.toInsert })}</button>}
          </div>
        )}
      </section>

      <section className="rounded-xl border border-slate-800 bg-slate-900 p-4 space-y-3">
        <h3 className="font-semibold text-white">{t('dataTransfer.historyTitle')}</h3>
        <div className="flex flex-wrap gap-3 items-end">
          <label className="text-xs text-slate-300">{t('dataTransfer.from')}<input type="date" value={from} onChange={e => { setFrom(e.target.value); setOffset(0); }} className="block mt-1 rounded border border-slate-700 bg-slate-950 p-2" /></label>
          <label className="text-xs text-slate-300">{t('dataTransfer.to')}<input type="date" value={to} onChange={e => { setTo(e.target.value); setOffset(0); }} className="block mt-1 rounded border border-slate-700 bg-slate-950 p-2" /></label>
          <label className="text-xs text-slate-300">{t('dataTransfer.entity')}
            <select value={entity} onChange={e => { setEntity(e.target.value); setOffset(0); }} className="block mt-1 rounded border border-slate-700 bg-slate-950 p-2">
              <option value="">{t('dataTransfer.allEntities')}</option>
              {entities.map(e => <option key={e} value={e}>{e}</option>)}
            </select>
          </label>
          <a className={button} href={`/api/companies/${companyId}/history?` + historyQuery({ format: 'csv' })}>{t('dataTransfer.downloadCsv')}</a>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="text-left text-slate-400"><tr><th className="p-2">{t('dataTransfer.colTime')}</th><th className="p-2">{t('dataTransfer.colRecord')}</th><th className="p-2">{t('dataTransfer.colAction')}</th><th className="p-2">{t('dataTransfer.colUser')}</th><th className="p-2">{t('dataTransfer.colChange')}</th></tr></thead>
            <tbody>
              {events.map(e => (
                <tr key={e.id} className="border-t border-slate-800 align-top">
                  <td className="p-2 whitespace-nowrap">{e.createdAt.replace('T', ' ').slice(0, 19)}</td>
                  <td className="p-2 whitespace-nowrap">{e.entity} #{e.recordId}</td>
                  <td className="p-2">{t('dataTransfer.action_' + e.action) === 'dataTransfer.action_' + e.action ? e.action : t('dataTransfer.action_' + e.action)}</td>
                  <td className="p-2">{e.actorName || (e.actorId ? '#' + e.actorId : '—')}</td>
                  <td className="p-2 break-all">{e.summary}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {!loading && events.length === 0 && <p className="text-slate-500 p-2">{t('dataTransfer.noEvents')}</p>}
        </div>
        <div className="flex items-center gap-3">
          <button type="button" className={button} disabled={loading || offset === 0} onClick={() => setOffset(Math.max(0, offset - PAGE))}>{t('dataTransfer.newer')}</button>
          <span className="text-xs text-slate-400">{t('dataTransfer.range', { from: total ? offset + 1 : 0, to: Math.min(offset + PAGE, total), total })}</span>
          <button type="button" className={button} disabled={loading || offset + PAGE >= total} onClick={() => setOffset(offset + PAGE)}>{t('dataTransfer.older')}</button>
        </div>
      </section>
    </div>
  );
}
