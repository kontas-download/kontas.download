'use client';
import { useCallback, useEffect, useState } from 'react';
import { useT } from '@/lib/i18n/client';

const input = 'block mt-1 w-full h-10 rounded-lg border border-slate-700 bg-slate-950 px-3 text-sm text-slate-100 focus:border-emerald-500 focus:outline-none';
const area = 'block mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 focus:border-emerald-500 focus:outline-none';
interface LogRow { id: number; sender: string | null; subject: string | null; receivedAt: string; status: string; detail: string[]; canAllow?: boolean }

// Per-company mailbox for received purchase documents. The password is write-only: the server only says whether one is stored.
export function DocumentInboxSection() {
  const t = useT();
  const [enabled, setEnabled] = useState(false);
  const [host, setHost] = useState('');
  const [port, setPort] = useState(993);
  const [secure, setSecure] = useState(true);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [hasPassword, setHasPassword] = useState(false);
  const [clearPassword, setClearPassword] = useState(false);
  const [folder, setFolder] = useState('INBOX');
  const [processedFolder, setProcessedFolder] = useState('');
  const [allowedSenders, setAllowedSenders] = useState('');
  const [acceptKnown, setAcceptKnown] = useState(true);
  const [lastRunAt, setLastRunAt] = useState<string | null>(null);
  const [lastError, setLastError] = useState<string | null>(null);
  const [log, setLog] = useState<LogRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [gmail, setGmail] = useState(false);
  const [message, setMessage] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);

  const apply = useCallback((d: Record<string, unknown>) => {
    setEnabled(Boolean(d.enabled)); setHost(String(d.host ?? '')); setPort(Number(d.port) || 993); setSecure(d.secure !== false); setUsername(String(d.username ?? ''));
    setHasPassword(Boolean(d.hasPassword)); setFolder(String(d.folder || 'INBOX')); setProcessedFolder(String(d.processedFolder ?? '')); setAllowedSenders(String(d.allowedSenders ?? '')); setAcceptKnown(d.acceptKnownContacts !== false);
    setLastRunAt((d.lastRunAt as string | null) ?? null); setLastError((d.lastError as string | null) ?? null);
  }, []);
  const loadLog = useCallback(() => fetch('/api/settings/document-inbox/log').then(r => r.json()).then(d => { if (Array.isArray(d)) setLog(d); }).catch(() => undefined), []);

  useEffect(() => {
    let cancelled = false;
    Promise.all([fetch('/api/settings/document-inbox').then(r => r.json()), loadLog()]).then(([d]) => { if (!cancelled) apply(d); })
      .catch(() => { if (!cancelled) setMessage({ kind: 'error', text: t('common.error') }); }).finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [t, apply, loadLog]);

  const form = () => ({ enabled, host, port, secure, username, folder, processedFolder, allowedSenders, acceptKnownContacts: acceptKnown, ...(password ? { password } : {}), ...(clearPassword ? { clearPassword: true } : {}) });
  async function call(url: string, method: string, body: unknown, onOk: (data: Record<string, unknown>) => void) {
    setBusy(true); setMessage(null);
    try {
      const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || t('common.error'));
      onOk(data);
    } catch (error) { setMessage({ kind: 'error', text: error instanceof Error ? error.message : t('common.error') }); } finally { setBusy(false); }
  }
  const save = () => call('/api/settings/document-inbox', 'PUT', form(), d => { apply(d); setPassword(''); setClearPassword(false); setMessage({ kind: 'ok', text: t('docs.inboxSaved') }); });
  const test = () => call('/api/settings/document-inbox/test', 'POST', form(), d => setMessage(d.ok ? { kind: 'ok', text: t('docs.inboxConnected') } : { kind: 'error', text: String(d.error || t('common.error')) }));
  const poll = () => call('/api/settings/document-inbox/poll', 'POST', {}, d => {
    setMessage({ kind: 'ok', text: t('docs.inboxPolled', { messages: Number(d.messages), imported: Number(d.imported), skipped: Number(d.skipped) }) });
    fetch('/api/settings/document-inbox').then(r => r.json()).then(apply).catch(() => undefined); loadLog();
  });
  // From the refusal log: the sender joins the allowed list at once (the stored list is reloaded into the form).
  const allow = (address: string) => call('/api/settings/document-inbox/allow-sender', 'POST', { address }, d => { apply(d); setMessage({ kind: 'ok', text: t('docs.inboxSenderAllowed', { address }) }); });
  function useGmail() { setHost('imap.gmail.com'); setPort(993); setSecure(true); setFolder('INBOX'); setGmail(true); }
  function removePassword() { setClearPassword(true); setPassword(''); setHasPassword(false); setEnabled(false); }

  return <section className="space-y-3 rounded-xl border border-slate-800 p-4" aria-label={t('docs.inboxTitle')}>
    <h3 className="font-bold text-white">{t('docs.inboxTitle')}</h3>
    <p className="text-sm text-slate-400">{t('docs.inboxIntro')} <a href="/help/document-recognition" target="_blank" rel="noopener noreferrer" className="font-semibold text-emerald-300 underline">{t('docs.helpLink')}</a></p>
    {message && <p role={message.kind === 'error' ? 'alert' : 'status'} className={`rounded-lg border p-2 text-sm ${message.kind === 'error' ? 'border-rose-800 bg-rose-950/40 text-rose-300' : 'border-emerald-800 bg-emerald-950/40 text-emerald-300'}`}>{message.text}</p>}
    <fieldset disabled={loading || busy} className="space-y-3 disabled:opacity-50">
      <label className="flex items-center gap-2 text-sm text-slate-200"><input type="checkbox" className="h-4 w-4 accent-emerald-500" checked={enabled} onChange={e => setEnabled(e.target.checked)} /> {t('docs.inboxEnable')}</label>
      <button type="button" onClick={useGmail} className="rounded-lg border border-slate-700 px-3 py-1.5 text-xs font-semibold text-slate-200 hover:bg-slate-800">{t('docs.inboxGmail')}</button>
      {gmail && <p className="text-xs text-amber-300">{t('docs.inboxGmailNote')}</p>}
      <div className="grid gap-3 sm:grid-cols-[1fr_7rem]">
        <label className="block text-xs font-medium text-slate-400">{t('docs.inboxHost')}<input value={host} onChange={e => setHost(e.target.value)} placeholder="imap.example.com" className={input} /></label>
        <label className="block text-xs font-medium text-slate-400">{t('docs.inboxPort')}<input type="number" min={1} max={65535} value={port} onChange={e => setPort(Number(e.target.value))} className={input} /></label>
      </div>
      <label className="flex items-center gap-2 text-sm text-slate-200"><input type="checkbox" className="h-4 w-4 accent-emerald-500" checked={secure} onChange={e => setSecure(e.target.checked)} /> {t('docs.inboxSecure')}</label>
      <label className="block text-xs font-medium text-slate-400">{t('docs.inboxUser')}<input autoComplete="off" value={username} onChange={e => setUsername(e.target.value)} className={input} /></label>
      <label className="block text-xs font-medium text-slate-400">{t('docs.inboxPassword')}
        <input type="password" autoComplete="new-password" onKeyDown={e => { if (e.key === 'Enter') e.preventDefault(); }} value={password} onChange={e => { setPassword(e.target.value); setClearPassword(false); }} placeholder={hasPassword ? t('docs.inboxPasswordStored') : ''} className={input} />
      </label>
      {hasPassword && !password && <div className="flex items-center gap-3 text-sm"><span className="text-emerald-400">{t('docs.inboxPasswordStored')}</span><button type="button" onClick={removePassword} className="text-rose-300 underline">{t('docs.inboxPasswordClear')}</button></div>}
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block text-xs font-medium text-slate-400">{t('docs.inboxFolder')}<input value={folder} onChange={e => setFolder(e.target.value)} className={input} /></label>
        <label className="block text-xs font-medium text-slate-400">{t('docs.inboxProcessed')}<input value={processedFolder} onChange={e => setProcessedFolder(e.target.value)} className={input} /><span className="mt-1 block font-normal">{t('docs.inboxProcessedHint')}</span></label>
      </div>
      <label className="block text-xs font-medium text-slate-400">{t('docs.inboxSenders')}
        <textarea rows={4} value={allowedSenders} onChange={e => setAllowedSenders(e.target.value)} placeholder={'tiekejas@example.com\n@example.org'} className={area} />
        <span className="mt-1 block font-normal">{t('docs.inboxSendersHint')}</span>
      </label>
      <label className="flex items-start gap-2 text-sm text-slate-200"><input type="checkbox" className="mt-1 h-4 w-4 accent-emerald-500" checked={acceptKnown} onChange={e => setAcceptKnown(e.target.checked)} /><span>{t('docs.inboxAcceptKnown')}<span className="mt-0.5 block text-xs text-slate-400">{t('docs.inboxAcceptKnownHint')}</span></span></label>
      {!allowedSenders.trim() && !acceptKnown && <p className="text-xs text-amber-300">{t('docs.inboxSendersEmpty')}</p>}
    </fieldset>
    <p className="text-xs text-slate-400">{t('docs.inboxLastRun')}: {lastRunAt ? new Date(lastRunAt).toLocaleString() : t('docs.inboxNever')}{lastError && <span className="text-rose-300"> · {t('docs.inboxLastError')}: {lastError}</span>}</p>
    <div className="flex flex-wrap justify-end gap-3">
      <button type="button" disabled={loading || busy} onClick={test} className="rounded-lg border border-slate-700 px-4 py-2 text-sm font-semibold text-slate-200 hover:bg-slate-800 disabled:opacity-40">{t('docs.inboxTest')}</button>
      <button type="button" disabled={loading || busy || !enabled} onClick={poll} className="rounded-lg border border-slate-700 px-4 py-2 text-sm font-semibold text-slate-200 hover:bg-slate-800 disabled:opacity-40">{t('docs.inboxPoll')}</button>
      <button type="button" disabled={loading || busy} onClick={save} className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-500 disabled:opacity-40">{t('docs.inboxSave')}</button>
    </div>
    <div>
      <h4 className="text-sm font-semibold text-slate-200">{t('docs.inboxLog')}</h4>
      {log.length === 0 ? <p className="text-xs text-slate-400">{t('docs.inboxLogEmpty')}</p> : <div className="max-h-64 overflow-auto"><table className="mt-1 w-full text-left text-xs text-slate-300">
        <thead className="text-slate-400"><tr><th className="p-1">{t('docs.inboxColDate')}</th><th className="p-1">{t('docs.inboxColSender')}</th><th className="p-1">{t('docs.inboxColResult')}</th></tr></thead>
        <tbody>{log.map(r => <tr key={r.id} className="border-t border-slate-800 align-top">
          <td className="p-1 whitespace-nowrap">{new Date(r.receivedAt).toLocaleString()}</td>
          <td className="p-1 break-all">{r.sender || '—'}{r.subject && <div className="text-slate-500 truncate max-w-[220px]" title={r.subject}>{r.subject}</div>}</td>
          <td className="p-1"><span className="font-semibold">{t(`docs.inboxStatus${r.status}`)}</span>{r.detail.map((d, i) => <div key={i} className="text-slate-400">{d}</div>)}{r.canAllow && r.sender && <button type="button" disabled={busy} onClick={() => { void allow(r.sender as string); }} className="mt-1 rounded-lg border border-emerald-700 px-2 py-0.5 text-[11px] font-semibold text-emerald-200 hover:bg-emerald-950 disabled:opacity-40">{t('docs.inboxAllowSender')}</button>}</td>
        </tr>)}</tbody>
      </table></div>}
    </div>
  </section>;
}
