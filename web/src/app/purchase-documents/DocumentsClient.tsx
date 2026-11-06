'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useI18n } from '@/lib/i18n/client';
import { LOCALES } from '@/lib/i18n/config';
import { askConfirm } from '@/components/ConfirmHost';
import { waitingIds } from '@/lib/review-queue';

export interface DocumentRow {
  id: number; fileName: string; mimeType: string; source: 'UPLOAD' | 'EMAIL'; sender: string | null; receivedAt: string; status: string; error: string | null; purchaseId: number | null; costEur?: number | null;
  summary: { supplier: string | null; number: string | null; issueDate: string | null; gross: number | null; docKind: string } | null;
}
const ACCEPT = 'application/pdf,image/jpeg,image/png,image/webp,image/heic,image/heif,.heic,.heif,application/xml,text/xml,.xml';
const STATUS_STYLE: Record<string, string> = {
  NEW: 'bg-sky-950 text-sky-300 border-sky-800', EXTRACTED: 'bg-amber-950 text-amber-300 border-amber-800', FAILED: 'bg-rose-950 text-rose-300 border-rose-800',
  CONFIRMED: 'bg-emerald-950 text-emerald-300 border-emerald-800', REJECTED: 'bg-slate-800 text-slate-300 border-slate-700',
};
const FILTERS = ['AWAITING', 'ALL', 'CONFIRMED', 'REJECTED'] as const;
const OPEN = ['NEW', 'EXTRACTED', 'FAILED'];

// Inbox of received purchase documents: upload (file picker, drag and drop, phone camera), automatic recognition and the per-row actions.
export function DocumentsClient({ companyId, recognitionReady, limitReached = false, shareErrors = [] }: { companyId: number; recognitionReady: boolean; limitReached?: boolean; shareErrors?: string[] }) {
  const { t, lang } = useI18n();
  const [rows, setRows] = useState<DocumentRow[]>([]);
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>('AWAITING');
  const [loading, setLoading] = useState(true);
  const [dragging, setDragging] = useState(false);
  const [progress, setProgress] = useState<string[]>([]);
  const [errors, setErrors] = useState<string[]>(shareErrors);
  const [busyId, setBusyId] = useState<number | null>(null);
  const today = new Date().toISOString().slice(0, 10);
  const [archiveFrom, setArchiveFrom] = useState(`${today.slice(0, 4)}-01-01`);
  const [archiveTo, setArchiveTo] = useState(today);
  const fileInput = useRef<HTMLInputElement>(null);
  const cameraInput = useRef<HTMLInputElement>(null);
  const money = (n: number) => n.toLocaleString(LOCALES[lang], { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const when = (iso: string) => new Date(iso).toLocaleString(LOCALES[lang], { dateStyle: 'short', timeStyle: 'short' });

  const load = useCallback(async () => {
    const res = await fetch('/api/purchase-documents', { cache: 'no-store' });
    const data = await res.json().catch(() => ({}));
    if (res.ok) setRows(data.documents);
    setLoading(false);
  }, []);
  // eslint-disable-next-line react-hooks/set-state-in-effect -- initial data load
  useEffect(() => { load(); }, [load]);

  // Returns a failure text or null.
  async function recognize(id: number): Promise<string | null> {
    const res = await fetch(`/api/purchase-documents/${id}/recognize`, { method: 'POST' });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return data.error || t('common.error');
    return data.document?.status === 'FAILED' ? data.document.error || t('docs.recognizeFailed') : null;
  }

  async function upload(files: File[]) {
    if (!files.length) return;
    setErrors([]);
    const problems: string[] = [];
    for (const file of files) {
      const uploading = t('docs.uploading', { name: file.name });
      const recognizing = t('docs.recognizing', { name: file.name });
      setProgress(p => [...p, uploading]);
      const body = new FormData();
      body.append('file', file);
      body.append('companyId', String(companyId));
      const res = await fetch('/api/purchase-documents', { method: 'POST', body });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        problems.push(`${file.name}: ${data.error || t('common.error')}`);
        setProgress(p => p.filter(x => x !== uploading));
        continue;
      }
      // An XML e-invoice is read from the file itself: no recognition.
      if (recognitionReady && data.document.mimeType !== 'application/xml') {
        setProgress(p => p.map(x => (x === uploading ? recognizing : x)));
        const failure = await recognize(data.document.id);
        if (failure) problems.push(`${file.name}: ${failure}`);
      }
      setProgress(p => p.filter(x => x !== uploading && x !== recognizing));
      await load();
    }
    setErrors(problems);
  }

  async function act(row: DocumentRow, action: 'recognize' | 'reject' | 'delete') {
    if (action === 'delete' && !await askConfirm(t('docs.confirmDelete', { name: row.fileName }))) return;
    if (action === 'reject' && !await askConfirm(t('docs.confirmReject', { name: row.fileName }))) return;
    setBusyId(row.id); setErrors([]);
    try {
      if (action === 'recognize') {
        const failure = await recognize(row.id);
        if (failure) setErrors([`${row.fileName}: ${failure}`]);
      } else {
        const res = await fetch(`/api/purchase-documents/${row.id}${action === 'reject' ? '/reject' : ''}`, { method: action === 'reject' ? 'POST' : 'DELETE' });
        if (!res.ok) setErrors([`${row.fileName}: ${(await res.json().catch(() => ({}))).error || t('common.error')}`]);
      }
      await load();
    } finally { setBusyId(null); }
  }

  const oldestWaiting = waitingIds(rows)[0];
  const visible = rows.filter(r => filter === 'ALL' || (filter === 'AWAITING' ? OPEN.includes(r.status) : r.status === filter));
  const btn = 'rounded-lg border border-slate-700 px-2.5 py-1.5 text-xs font-semibold text-slate-200 hover:bg-slate-800 disabled:opacity-40';

  return (
    <div className="p-4 sm:p-8 max-w-7xl mx-auto space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-white">{t('docs.title')}</h1>
          <p className="text-sm text-slate-400 max-w-3xl">{t('docs.subtitle')}</p>
        </div>
        <div className="flex flex-wrap items-center gap-4">
          {oldestWaiting && <Link href={`/purchase-documents/${oldestWaiting}`} className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-bold text-white hover:bg-emerald-500">{t('docs.reviewQueue')}</Link>}
          <Link href="/help/document-recognition" className="text-sm font-semibold text-emerald-300 underline">{t('docs.helpLink')}</Link>
          <Link href="/purchases/reimbursements" className="text-sm font-semibold text-emerald-300 underline">{t('docs.reimbursementsLink')}</Link>
        </div>
      </div>

      {!recognitionReady && (
        <div role="note" className="rounded-xl border border-amber-800 bg-amber-950/30 p-3 text-sm text-amber-200">
          {t('docs.notReady')} <Link href="/companies" className="font-semibold underline">{t('docs.notReadyLink')}</Link>
        </div>
      )}

      {recognitionReady && limitReached && (
        <div role="alert" className="rounded-xl border border-amber-700 bg-amber-950/40 p-3 text-sm font-semibold text-amber-200">{t('docs.limitBanner')}</div>
      )}

      <div
        onDragOver={e => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={e => { e.preventDefault(); setDragging(false); upload(Array.from(e.dataTransfer.files)); }}
        className={`rounded-xl border-2 border-dashed p-6 text-center space-y-3 transition-colors ${dragging ? 'border-emerald-500 bg-emerald-950/20' : 'border-slate-700 bg-slate-900'}`}
      >
        <p className="text-sm text-slate-200">{t('docs.dropHint')}</p>
        <p className="text-xs text-slate-400">{t('docs.formats')}</p>
        <div className="flex flex-wrap justify-center gap-3">
          <button type="button" onClick={() => fileInput.current?.click()} className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-bold text-white hover:bg-emerald-500">{t('docs.chooseFiles')}</button>
          <button type="button" onClick={() => cameraInput.current?.click()} className="rounded-lg border border-slate-600 px-4 py-2 text-sm font-semibold text-slate-100 hover:bg-slate-800">{t('docs.takePhoto')}</button>
        </div>
        <input ref={fileInput} type="file" multiple accept={ACCEPT} className="hidden" onChange={e => { upload(Array.from(e.target.files || [])); e.target.value = ''; }} />
        <input ref={cameraInput} type="file" accept="image/*" capture="environment" className="hidden" onChange={e => { upload(Array.from(e.target.files || [])); e.target.value = ''; }} />
        {progress.length > 0 && <ul aria-live="polite" className="text-xs text-slate-300 space-y-0.5">{progress.map(p => <li key={p}>{p}</li>)}</ul>}
      </div>

      {errors.length > 0 && <ul role="alert" className="rounded-xl border border-rose-800 bg-rose-950/40 p-3 text-sm text-rose-200 space-y-1">{errors.map(e => <li key={e}>{e}</li>)}</ul>}

      <div className="flex flex-wrap gap-2" role="tablist">
        {FILTERS.map(f => <button key={f} role="tab" aria-selected={filter === f} onClick={() => setFilter(f)} className={`rounded-lg px-3 py-1.5 text-xs font-bold ${filter === f ? 'bg-emerald-600 text-white' : 'border border-slate-700 text-slate-300 hover:bg-slate-800'}`}>{t(`docs.filter_${f}`)}</button>)}
      </div>

      <div className="overflow-x-auto rounded-xl border border-slate-800 bg-slate-900">
        <table className="w-full text-left text-xs text-slate-200">
          <thead className="bg-slate-950/80 text-[11px] uppercase tracking-wider text-slate-400 border-b border-slate-800">
            <tr>
              <th className="p-3">{t('docs.colStatus')}</th><th className="p-3">{t('docs.colReceived')}</th><th className="p-3">{t('docs.colSource')}</th><th className="p-3">{t('docs.colFile')}</th>
              <th className="p-3">{t('docs.colSupplier')}</th><th className="p-3 text-right">{t('docs.colTotal')}</th><th className="p-3 text-right">{t('docs.colCost')}</th><th className="p-3 text-center">{t('docs.colActions')}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/60">
            {visible.map(r => (
              <tr key={r.id} className="hover:bg-slate-800/40">
                <td className="p-3">
                  <span className={`inline-block rounded-full border px-2 py-0.5 text-[10px] font-bold ${STATUS_STYLE[r.status] || ''}`}>{t(`docs.status_${r.status}`)}</span>
                  {r.error && <div className="mt-1 max-w-[220px] text-[11px] text-rose-300">{r.error}</div>}
                </td>
                <td className="p-3 whitespace-nowrap">{when(r.receivedAt)}</td>
                <td className="p-3">{r.source === 'EMAIL' ? <>{t('docs.sourceEmail')}{r.sender && <div className="text-[11px] text-slate-400 truncate max-w-[180px]" title={r.sender}>{r.sender}</div>}</> : t('docs.sourceUpload')}</td>
                <td className="p-3 max-w-[200px] truncate" title={r.fileName}>{r.fileName}</td>
                <td className="p-3">{r.summary ? <>{r.summary.supplier || '—'}<div className="text-[11px] text-slate-400">{[r.summary.number, r.summary.issueDate].filter(Boolean).join(' · ')}</div></> : <span className="text-slate-500">—</span>}</td>
                <td className="p-3 text-right font-mono">{r.summary?.gross != null ? `€${money(r.summary.gross)}` : '—'}</td>
                <td className="p-3 text-right font-mono text-slate-400" title={t('docs.colCost')}>{r.costEur ? `€${r.costEur.toLocaleString(LOCALES[lang], { minimumFractionDigits: 2, maximumFractionDigits: 4 })}` : '—'}</td>
                <td className="p-3">
                  <div className="flex flex-wrap items-center justify-center gap-1.5">
                    {OPEN.includes(r.status) && <Link href={`/purchase-documents/${r.id}`} className={`${btn} bg-emerald-700 border-emerald-600 text-white hover:bg-emerald-600`}>{t('docs.review')}</Link>}
                    {OPEN.includes(r.status) && recognitionReady && r.mimeType !== 'application/xml' && <button disabled={busyId === r.id} onClick={() => act(r, 'recognize')} className={btn}>{r.status === 'EXTRACTED' ? t('docs.recognizeAgain') : t('docs.recognize')}</button>}
                    {OPEN.includes(r.status) && <button disabled={busyId === r.id} onClick={() => act(r, 'reject')} className={btn}>{t('docs.reject')}</button>}
                    {r.status !== 'CONFIRMED' && <button disabled={busyId === r.id} onClick={() => act(r, 'delete')} className={`${btn} text-rose-300`}>{t('docs.delete')}</button>}
                    <a href={`/api/purchase-documents/${r.id}/file`} target="_blank" rel="noreferrer" className={btn}>{t('docs.original')}</a>
                    {r.status === 'CONFIRMED' && r.purchaseId && <Link href="/purchases" className={btn}>{t('docs.openPurchase')}</Link>}
                  </div>
                </td>
              </tr>
            ))}
            {!visible.length && <tr><td colSpan={8} className="p-8 text-center text-slate-400">{loading ? t('common.loading') : t('docs.empty')}</td></tr>}
          </tbody>
        </table>
      </div>
      <section className="rounded-xl border border-slate-800 bg-slate-900 p-4 space-y-3" aria-label={t('docs.archiveTitle')}>
        <h2 className="font-bold text-white">{t('docs.archiveTitle')}</h2>
        <p className="text-sm text-slate-400 max-w-3xl">{t('docs.archiveIntro')}</p>
        <div className="flex flex-wrap items-end gap-3">
          <label className="text-xs font-medium text-slate-400">{t('docs.archiveFrom')}
            <input type="date" value={archiveFrom} onChange={e => setArchiveFrom(e.target.value)} className="mt-1 block h-10 rounded-lg border border-slate-700 bg-slate-950 px-3 text-sm text-slate-100 focus:border-emerald-500 focus:outline-none" />
          </label>
          <label className="text-xs font-medium text-slate-400">{t('docs.archiveTo')}
            <input type="date" value={archiveTo} onChange={e => setArchiveTo(e.target.value)} className="mt-1 block h-10 rounded-lg border border-slate-700 bg-slate-950 px-3 text-sm text-slate-100 focus:border-emerald-500 focus:outline-none" />
          </label>
          {archiveFrom && archiveTo && archiveFrom <= archiveTo
            ? <a href={`/api/purchase-documents/archive?from=${encodeURIComponent(archiveFrom)}&to=${encodeURIComponent(archiveTo)}`} className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-bold text-white hover:bg-emerald-500">{t('docs.archiveDownload')}</a>
            : <span className="text-xs text-amber-300">{t('docs.archiveBadPeriod')}</span>}
        </div>
      </section>
    </div>
  );
}
