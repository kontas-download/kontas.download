'use client';
import { useEffect, useState } from 'react';
import { useT } from '@/lib/i18n/client';
import { DocLanguageSelect } from './DocLanguageSelect';

type Choice = { id: number; series?: string; number: string };

export function InvoiceDeliveryDialog({
  invoices,
  initialId,
  emailMode = false,
  onClose
}: {
  invoices: Choice[];
  initialId?: number;
  emailMode?: boolean;
  onClose: () => void;
}) {
  const t = useT();
  const [id, setId] = useState(initialId || invoices[0]?.id || 0);
  const [compose, setCompose] = useState(emailMode);
  const [to, setTo] = useState(''), [subject, setSubject] = useState(''), [text, setText] = useState('');
  const [pdfReady, setPdfReady] = useState(false);
  const [pdfBlobUrl, setPdfBlobUrl] = useState<string>('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [sent, setSent] = useState(false);
  const [archiveWarning, setArchiveWarning] = useState(false);
  const [configured, setConfigured] = useState(false);
  const [requestId, setRequestId] = useState('');
  const [lang, setLang] = useState(''), [draftLang, setDraftLang] = useState('');

  const activeLang = lang || draftLang;
  const query = activeLang ? '?lang=' + encodeURIComponent(activeLang) : '';
  const pdfEndpoint = '/api/invoices/' + id + '/pdf' + query;
  const downloadEndpoint = '/api/invoices/' + id + '/pdf' + (query ? query + '&download=1' : '?download=1');

  function selectLanguage(value: string) {
    if (value === lang) return;
    setLoading(true);
    setError('');
    setSent(false);
    setArchiveWarning(false);
    setPdfReady(false);
    setPdfBlobUrl(prev => { if (prev) URL.revokeObjectURL(prev); return ''; });
    setRequestId('');
    setLang(value);
  }

  function selectInvoice(value: number) {
    setLoading(true);
    setError('');
    setSent(false);
    setArchiveWarning(false);
    setPdfReady(false);
    setPdfBlobUrl(prev => { if (prev) URL.revokeObjectURL(prev); return ''; });
    setRequestId('');
    setId(value);
  }

  useEffect(() => {
    let cancelled = false;
    let localBlobUrl = '';
    (async () => {
      try {
        if (!id) throw new Error(t('delivery.noInvoices'));
        const q = lang ? '?lang=' + encodeURIComponent(lang) : '';
        const draftResponse = await fetch('/api/invoices/' + id + '/email' + q);
        const draft = await draftResponse.json();
        if (!draftResponse.ok) throw new Error(draft.error);

        const pdfCheck = await fetch('/api/invoices/' + id + '/pdf' + q);
        if (!pdfCheck.ok) {
          const failure = await pdfCheck.json();
          throw new Error(failure.error);
        }

        const blob = await pdfCheck.blob();
        localBlobUrl = URL.createObjectURL(blob);

        if (cancelled) {
          URL.revokeObjectURL(localBlobUrl);
          return;
        }

        setRequestId(crypto.randomUUID());
        setDraftLang(draft.lang);
        setTo(draft.to);
        setSubject(draft.subject);
        setText(draft.text);
        setConfigured(draft.configured);
        setPdfBlobUrl(prev => {
          if (prev) URL.revokeObjectURL(prev);
          return localBlobUrl;
        });
        setPdfReady(true);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : t('delivery.pdfFailed'));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id, lang]); // eslint-disable-line react-hooks/exhaustive-deps

  async function send(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const response = await fetch('/api/invoices/' + id + '/email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ to, subject, text, requestId, lang: activeLang })
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error);
      setSent(true);
      setArchiveWarning(result.archiveWarning === true);
    } catch (e) {
      setError(e instanceof Error ? e.message : t('delivery.sendFailed'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-3 no-print" role="dialog" aria-modal="true" aria-label={t('delivery.dialogLabel')}>
      <div className="bg-white text-slate-900 rounded-xl shadow-xl w-full max-w-6xl h-[92vh] flex flex-col overflow-hidden">
        <div className="flex flex-wrap items-center gap-3 p-4 border-b">
          <strong>{t('delivery.dialogLabel')}</strong>
          {invoices.length > 1 && (
            <select
              aria-label={t('delivery.invoice')}
              value={id}
              disabled={busy}
              onChange={e => selectInvoice(Number(e.target.value))}
              className="border rounded px-2 py-1 text-sm bg-white"
            >
              {invoices.map(i => (
                <option key={i.id} value={i.id}>
                  {i.series} {i.number}
                </option>
              ))}
            </select>
          )}

          {pdfReady && (
            <div className="flex items-center gap-3">
              <a
                href={downloadEndpoint}
                download={'Invoice-' + id + '.pdf'}
                className="inline-flex items-center gap-1 text-emerald-700 hover:text-emerald-800 font-medium underline text-sm"
              >
                {t('delivery.download')}
              </a>
              <a
                href={pdfEndpoint}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 text-emerald-700 hover:text-emerald-800 font-medium underline text-sm"
              >
                {t('delivery.openPrint')}
              </a>
            </div>
          )}

          <DocLanguageSelect value={lang} onChange={selectLanguage} disabled={busy} className="border rounded px-2 py-1 text-sm" />

          <button
            onClick={() => setCompose(!compose)}
            disabled={busy}
            className="text-emerald-700 hover:text-emerald-800 underline text-sm font-medium"
          >
            {t('delivery.emailClient')}
          </button>

          <button
            onClick={onClose}
            disabled={busy}
            className="ml-auto border border-slate-300 rounded px-3 py-1 text-sm hover:bg-slate-50 transition"
            aria-label={t('delivery.close')}
          >
            {t('delivery.close')}
          </button>
        </div>

        {error && <p role="alert" className="bg-red-50 text-red-800 p-3 text-sm">{error}</p>}
        {sent && <p role="status" className="bg-emerald-50 text-emerald-800 p-3 text-sm">{t('delivery.sent')}</p>}
        {sent && archiveWarning && <p role="alert" className="bg-amber-50 text-amber-900 p-3 text-sm">{t('delivery.archiveWarning')}</p>}

        <div className="flex flex-col md:flex-row flex-1 min-h-0 overflow-hidden">
          {/* PDF Preview Area */}
          <div className="flex-1 min-h-[400px] bg-slate-100 flex flex-col relative overflow-hidden">
            {loading ? (
              <div className="flex-1 flex items-center justify-center p-8 text-slate-500">
                <p className="animate-pulse">{t('delivery.generating')}</p>
              </div>
            ) : pdfReady && pdfBlobUrl ? (
              <iframe
                src={`${pdfBlobUrl}#toolbar=1&navpanes=0`}
                title={t('delivery.pdfTitle')}
                className="w-full h-full flex-1 border-0"
              />
            ) : (
              <div className="flex-1 flex items-center justify-center p-8 text-slate-500">
                <p>{t('delivery.noPreview')}</p>
              </div>
            )}
          </div>

          {/* Email Compose Sidebar */}
          {compose && (
            <form onSubmit={send} className="p-5 md:w-96 border-t md:border-t-0 md:border-l border-slate-200 bg-white space-y-4 overflow-y-auto">
              <p className="text-xs text-slate-500">{t('delivery.attachNote')}</p>
              <label className="block text-sm font-medium text-slate-700">
                {t('delivery.to')}
                <input
                  type="email"
                  required
                  value={to}
                  disabled={busy || sent}
                  onChange={e => setTo(e.target.value)}
                  className="mt-1 block border border-slate-300 rounded p-2 w-full text-sm focus:ring-1 focus:ring-emerald-600 focus:outline-none"
                />
              </label>
              <label className="block text-sm font-medium text-slate-700">
                {t('delivery.subject')}
                <input
                  required
                  maxLength={200}
                  value={subject}
                  disabled={busy || sent}
                  onChange={e => setSubject(e.target.value)}
                  className="mt-1 block border border-slate-300 rounded p-2 w-full text-sm focus:ring-1 focus:ring-emerald-600 focus:outline-none"
                />
              </label>
              <label className="block text-sm font-medium text-slate-700">
                {t('delivery.body')}
                <textarea
                  required
                  maxLength={10000}
                  rows={10}
                  value={text}
                  disabled={busy || sent}
                  onChange={e => setText(e.target.value)}
                  className="mt-1 block border border-slate-300 rounded p-2 w-full text-sm focus:ring-1 focus:ring-emerald-600 focus:outline-none font-sans"
                />
              </label>
              {!loading && !configured && (
                <p className="text-amber-800 text-xs bg-amber-50 p-2 rounded border border-amber-200">
                  {t('delivery.notConfigured')}
                </p>
              )}
              <button
                type="submit"
                disabled={loading || busy || sent || !configured || !pdfReady}
                className="w-full bg-emerald-700 text-white px-4 py-2 rounded text-sm font-medium hover:bg-emerald-800 transition disabled:opacity-40"
              >
                {busy ? t('delivery.sending') : sent ? t('delivery.sentShort') : t('delivery.send')}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
