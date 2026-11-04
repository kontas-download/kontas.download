'use client';

import { useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AlertCircle, Check, Edit3, Mail, Plus, Search, Trash2 } from '@/components/icons';
import { askConfirm } from '@/components/ConfirmHost';
import { useI18n } from '@/lib/i18n/client';
import { LOCALES } from '@/lib/i18n/config';
import type { MailTemplateRow } from '@/lib/mail';
import { SignaturePreview } from '@/components/SignaturePreview';

export type MailClientRow = { id: number; name: string; email: string; balance: number };
type Message = { id: number; recipient: string; recipientName: string | null; subject: string; body: string; status: 'SENT' | 'FAILED'; error: string | null; createdAt: string; templateName: string | null };
type Tab = 'compose' | 'templates' | 'sent';
const PLACEHOLDERS = ['client_name', 'client_code', 'company_name', 'date', 'balance', 'open_invoices'];

const input = 'w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 focus:border-emerald-500 focus:outline-none';
const label = 'block text-xs font-medium text-slate-400 mb-1';
const card = 'rounded-xl border border-slate-800 bg-slate-900 p-5';
const primary = 'inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-500 disabled:opacity-50';
const secondary = 'inline-flex items-center gap-2 rounded-lg border border-slate-700 px-3 py-2 text-sm font-semibold text-slate-200 hover:bg-slate-800 disabled:opacity-50';

async function call(url: string, method: string, body?: unknown) {
  const res = await fetch(url, { method, headers: body ? { 'content-type': 'application/json' } : undefined, body: body ? JSON.stringify(body) : undefined });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error || 'Error');
  return json;
}

/** Letters: compose to counterparties and free addresses (group sending), templates with placeholders, log of sent letters. */
export function MailClient({ clients, templates: initialTemplates, messages, smtpReady, signature = null }: { clients: MailClientRow[]; templates: MailTemplateRow[]; messages: Message[]; smtpReady: boolean; signature?: { text: string; logoUrl: string | null } | null }) {
  const { t, lang } = useI18n();
  const router = useRouter();
  const [tab, setTab] = useState<Tab>('compose');
  const [templates, setTemplates] = useState(initialTemplates);
  const [query, setQuery] = useState('');
  const [onlyDebtors, setOnlyDebtors] = useState(false);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [addresses, setAddresses] = useState('');
  const [templateId, setTemplateId] = useState('');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null);
  const [preview, setPreview] = useState<{ email: string; subject: string; body: string }[] | null>(null);
  const [editing, setEditing] = useState<{ id?: number; name: string; subject: string; body: string } | null>(null);
  const bodyRef = useRef<HTMLTextAreaElement>(null);
  const money = (v: number) => '€' + v.toLocaleString(LOCALES[lang], { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return clients.filter(c => (!onlyDebtors || c.balance > 0) && (!q || c.name.toLowerCase().includes(q) || c.email.toLowerCase().includes(q)));
  }, [clients, query, onlyDebtors]);
  const toggle = (id: number) => setSelected(s => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const payload = () => ({ clientIds: [...selected], addresses, subject, body, templateId: templateId || null });
  const fail = (err: unknown) => setNotice({ ok: false, text: err instanceof Error ? err.message : t('mail.failed') });

  const useTemplate = (id: string) => {
    setTemplateId(id);
    const tpl = templates.find(x => String(x.id) === id);
    if (tpl) { setSubject(tpl.subject); setBody(tpl.body); }
    setPreview(null);
  };
  const insert = (ph: string) => {
    const el = bodyRef.current, token = `{${ph}}`;
    if (!el) { setBody(b => b + token); return; }
    const start = el.selectionStart ?? body.length, end = el.selectionEnd ?? body.length;
    setBody(body.slice(0, start) + token + body.slice(end));
    requestAnimationFrame(() => { el.focus(); el.setSelectionRange(start + token.length, start + token.length); });
  };
  const runPreview = async () => {
    setBusy(true); setNotice(null);
    try { setPreview((await call('/api/mail/preview', 'POST', payload())).letters); } catch (e) { fail(e); } finally { setBusy(false); }
  };
  const send = async () => {
    setNotice(null);
    let count = 0;
    try { count = (await call('/api/mail/preview', 'POST', payload())).letters.length; } catch (e) { fail(e); return; }
    if (!await askConfirm(t('mail.confirmSend', { count }))) return;
    setBusy(true);
    try {
      const { results } = await call('/api/mail/send', 'POST', payload());
      const sent = results.filter((r: { status: string }) => r.status === 'SENT').length;
      setNotice({ ok: sent === results.length, text: t('mail.resultSent', { sent, failed: results.length - sent }) });
      if (sent === results.length) { setSelected(new Set()); setAddresses(''); setPreview(null); }
      router.refresh();
    } catch (e) { fail(e); } finally { setBusy(false); }
  };
  const saveTemplate = async () => {
    if (!editing) return;
    setBusy(true);
    try {
      const { template } = await call(editing.id ? `/api/mail/templates/${editing.id}` : '/api/mail/templates', editing.id ? 'PUT' : 'POST', editing);
      setTemplates(list => [...list.filter(x => x.id !== template.id), template].sort((a, b) => a.name.localeCompare(b.name)));
      setEditing(null); setNotice(null);
    } catch (e) { fail(e); } finally { setBusy(false); }
  };
  const removeTemplate = async (tpl: MailTemplateRow) => {
    if (!await askConfirm(t('mail.confirmDelete', { name: tpl.name }))) return;
    try { await call(`/api/mail/templates/${tpl.id}`, 'DELETE'); setTemplates(list => list.filter(x => x.id !== tpl.id)); if (templateId === String(tpl.id)) setTemplateId(''); } catch (e) { fail(e); }
  };

  const tabs: [Tab, string][] = [['compose', t('mail.tabCompose')], ['templates', t('mail.tabTemplates')], ['sent', t('mail.tabSent')]];
  const templateForm = editing && (
    <div className="space-y-3 rounded-xl border border-emerald-700/50 bg-slate-950/50 p-4">
      <h3 className="font-semibold text-white">{editing.id ? t('mail.editTemplate') : t('mail.newTemplate')}</h3>
      <div><label className={label} htmlFor="tpl-name">{t('mail.templateName')}</label><input id="tpl-name" className={input} maxLength={200} value={editing.name} onChange={e => setEditing({ ...editing, name: e.target.value })} /></div>
      <div><label className={label} htmlFor="tpl-subject">{t('mail.subject')}</label><input id="tpl-subject" className={input} maxLength={200} value={editing.subject} onChange={e => setEditing({ ...editing, subject: e.target.value })} /></div>
      <div><label className={label} htmlFor="tpl-body">{t('mail.body')}</label><textarea id="tpl-body" rows={8} className={input} maxLength={20000} value={editing.body} onChange={e => setEditing({ ...editing, body: e.target.value })} /></div>
      <p className="text-xs text-slate-500">{t('mail.placeholders')} {PLACEHOLDERS.map(p => <code key={p} className="mr-2 text-slate-300">{`{${p}}`}</code>)}</p>
      <div className="flex gap-2"><button type="button" className={primary} disabled={busy} onClick={saveTemplate}><Check className="w-4 h-4" aria-hidden />{t('mail.save')}</button><button type="button" className={secondary} onClick={() => setEditing(null)}>{t('mail.cancel')}</button></div>
    </div>
  );

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-6">
      <header>
        <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight text-white"><Mail className="w-6 h-6 text-emerald-400" aria-hidden />{t('mail.title')}</h1>
        <p className="mt-1 text-sm text-slate-400">{t('mail.subtitle')}</p>
      </header>
      {!smtpReady && <div role="alert" className="flex items-center gap-2 rounded-lg border border-amber-800 bg-amber-950/40 px-3 py-2 text-sm text-amber-300"><AlertCircle className="w-4 h-4 shrink-0" aria-hidden />{t('mail.smtpMissing')}</div>}
      {notice && <div role="status" className={`rounded-lg border px-3 py-2 text-sm ${notice.ok ? 'border-emerald-800 bg-emerald-950/40 text-emerald-300' : 'border-rose-800 bg-rose-950/40 text-rose-300'}`}>{notice.text}</div>}
      <div className="flex gap-1 border-b border-slate-800" role="tablist">
        {tabs.map(([key, text]) => <button key={key} type="button" role="tab" aria-selected={tab === key} onClick={() => setTab(key)} className={`px-4 py-2 text-sm font-semibold border-b-2 -mb-px ${tab === key ? 'border-emerald-500 text-white' : 'border-transparent text-slate-400 hover:text-slate-200'}`}>{text}</button>)}
      </div>

      {tab === 'compose' && (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
          <section className={card} aria-labelledby="m-recipients">
            <h2 id="m-recipients" className="mb-3 font-semibold text-white">{t('mail.recipients')} <span className="ml-2 text-xs font-normal text-emerald-400">{t('mail.selected', { count: selected.size })}</span></h2>
            <label className="mb-2 flex items-center gap-2 rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-sm"><Search className="w-4 h-4 text-slate-500" aria-hidden /><input value={query} onChange={e => setQuery(e.target.value)} placeholder={t('mail.searchClients')} aria-label={t('mail.searchClients')} className="w-full bg-transparent text-slate-100 placeholder:text-slate-500 focus:outline-none" /></label>
            <div className="mb-2 flex flex-wrap items-center gap-3 text-xs">
              <label className="flex items-center gap-1.5 text-slate-300"><input type="checkbox" className="accent-emerald-500" checked={onlyDebtors} onChange={e => setOnlyDebtors(e.target.checked)} />{t('mail.onlyDebtors')}</label>
              <button type="button" className="text-emerald-400 hover:underline" onClick={() => setSelected(s => new Set([...s, ...shown.filter(c => c.email).map(c => c.id)]))}>{t('mail.selectAll')}</button>
              <button type="button" className="text-slate-400 hover:underline" onClick={() => setSelected(new Set())}>{t('mail.clearAll')}</button>
            </div>
            <ul className="max-h-80 overflow-y-auto divide-y divide-slate-800/60 rounded-lg border border-slate-800">
              {shown.map(c => (
                <li key={c.id}><label className={`flex items-center gap-2 px-3 py-2 text-sm ${c.email ? 'cursor-pointer hover:bg-slate-800/40' : 'opacity-50'}`}>
                  <input type="checkbox" className="accent-emerald-500" disabled={!c.email} checked={selected.has(c.id)} onChange={() => toggle(c.id)} />
                  <span className="min-w-0 flex-1"><span className="block truncate text-slate-100">{c.name}</span><span className="block truncate text-xs text-slate-500">{c.email || t('mail.noEmail')}</span></span>
                  {c.balance > 0 && <span className="shrink-0 text-xs font-mono text-amber-400">{t('mail.debt', { amount: money(c.balance) })}</span>}
                </label></li>
              ))}
            </ul>
            <div className="mt-3"><label className={label} htmlFor="m-addresses">{t('mail.addresses')}</label><textarea id="m-addresses" rows={2} className={input} value={addresses} onChange={e => setAddresses(e.target.value)} placeholder="vardas@pavyzdys.lt" /></div>
          </section>

          <section className={`${card} space-y-3`} aria-label={t('mail.tabCompose')}>
            <div><label className={label} htmlFor="m-template">{t('mail.template')}</label><select id="m-template" className={input} value={templateId} onChange={e => useTemplate(e.target.value)}><option value="">{t('mail.templateNone')}</option>{templates.map(x => <option key={x.id} value={x.id}>{x.name}</option>)}</select></div>
            <div><label className={label} htmlFor="m-subject">{t('mail.subject')}</label><input id="m-subject" className={input} maxLength={200} value={subject} onChange={e => { setSubject(e.target.value); setPreview(null); }} /></div>
            <div><label className={label} htmlFor="m-body">{t('mail.body')}</label><textarea id="m-body" ref={bodyRef} rows={10} className={input} maxLength={20000} value={body} onChange={e => { setBody(e.target.value); setPreview(null); }} /></div>
            <div className="flex flex-wrap items-center gap-1.5 text-xs"><span className="text-slate-500">{t('mail.placeholders')}</span>{PLACEHOLDERS.map(p => <button key={p} type="button" onClick={() => insert(p)} title={`{${p}}`} className="rounded-full border border-slate-700 px-2 py-0.5 text-slate-300 hover:border-emerald-600 hover:text-emerald-300">{t(`mail.ph_${p}`)}</button>)}</div>
            <div className="flex flex-wrap gap-2 pt-1">
              <button type="button" className={primary} disabled={busy || !smtpReady} onClick={send}><Mail className="w-4 h-4" aria-hidden />{busy ? t('mail.sending') : t('mail.send')}</button>
              <button type="button" className={secondary} disabled={busy} onClick={runPreview}>{t('mail.preview')}</button>
              <button type="button" className={secondary} disabled={!subject.trim() || !body.trim()} onClick={() => { setEditing({ name: '', subject, body }); setTab('templates'); }}><Plus className="w-4 h-4" aria-hidden />{t('mail.saveAsTemplate')}</button>
            </div>
            {preview && preview.length > 0 && (
              <div className="space-y-2">
                <div className="text-xs text-slate-500">{t('mail.previewOf', { email: preview[0].email })}</div>
                <div className="rounded-lg bg-white p-4 text-sm text-slate-900 shadow-inner">
                  <div className="mb-2 border-b border-slate-200 pb-2 font-semibold">{preview[0].subject}</div>
                  <div className="whitespace-pre-wrap">{signature ? preview[0].body.split('\n\n-- \n')[0] : preview[0].body}</div>
                  <SignaturePreview signature={signature} />
                </div>
                {preview.length > 1 && <div className="text-xs text-slate-500">{t('mail.previewMore', { count: preview.length - 1 })}</div>}
              </div>
            )}
          </section>
        </div>
      )}

      {tab === 'templates' && (
        <section className={`${card} space-y-4`}>
          {!editing && <button type="button" className={primary} onClick={() => setEditing({ name: '', subject: '', body: '' })}><Plus className="w-4 h-4" aria-hidden />{t('mail.newTemplate')}</button>}
          {templateForm}
          {templates.length === 0 && !editing ? <p className="text-sm text-slate-400">{t('mail.noTemplates')}</p> : (
            <ul className="divide-y divide-slate-800/60">
              {templates.map(x => (
                <li key={x.id} className="flex flex-wrap items-start justify-between gap-3 py-3">
                  <div className="min-w-0"><div className="font-semibold text-white">{x.name}</div><div className="text-sm text-slate-300">{x.subject}</div><div className="mt-1 line-clamp-2 whitespace-pre-wrap text-xs text-slate-500">{x.body}</div></div>
                  <div className="flex shrink-0 gap-2">
                    <button type="button" className={secondary} onClick={() => { useTemplate(String(x.id)); setTab('compose'); }}><Mail className="w-4 h-4" aria-hidden />{t('mail.use')}</button>
                    <button type="button" className={secondary} onClick={() => setEditing({ id: x.id, name: x.name, subject: x.subject, body: x.body })} aria-label={t('mail.edit')}><Edit3 className="w-4 h-4" aria-hidden /></button>
                    <button type="button" className="inline-flex items-center rounded-lg border border-rose-800 px-3 py-2 text-rose-300 hover:bg-rose-950/40" onClick={() => removeTemplate(x)} aria-label={t('mail.delete')}><Trash2 className="w-4 h-4" aria-hidden /></button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {tab === 'sent' && (
        <section className={card}>
          {messages.length === 0 ? <p className="text-sm text-slate-400">{t('mail.noMessages')}</p> : (
            <div className="overflow-x-auto"><table className="w-full text-sm">
              <thead className="text-[11px] uppercase tracking-wider text-slate-500"><tr><th className="py-2 pr-3 text-left">{t('mail.colDate')}</th><th className="py-2 pr-3 text-left">{t('mail.colRecipient')}</th><th className="py-2 pr-3 text-left">{t('mail.colSubject')}</th><th className="py-2 text-left">{t('mail.colStatus')}</th></tr></thead>
              <tbody className="divide-y divide-slate-800/60">{messages.map(m => (
                <tr key={m.id} className="align-top">
                  <td className="py-2 pr-3 font-mono text-xs text-slate-400 whitespace-nowrap">{m.createdAt.slice(0, 16).replace('T', ' ')}</td>
                  <td className="py-2 pr-3"><div className="text-slate-100">{m.recipientName || m.recipient}</div>{m.recipientName && <div className="text-xs text-slate-500">{m.recipient}</div>}</td>
                  <td className="py-2 pr-3"><details><summary className="cursor-pointer text-slate-200">{m.subject}{m.templateName && <span className="ml-2 text-xs text-slate-500">({m.templateName})</span>}</summary><pre className="mt-2 whitespace-pre-wrap font-sans text-xs text-slate-400">{m.body}</pre></details></td>
                  <td className="py-2">{m.status === 'SENT' ? <span className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-bold text-emerald-400">{t('mail.statusSent')}</span> : <span title={m.error || ''} className="rounded-full border border-rose-700 bg-rose-950/40 px-2 py-0.5 text-[10px] font-bold text-rose-300">{t('mail.statusFailed')}</span>}</td>
                </tr>
              ))}</tbody>
            </table></div>
          )}
        </section>
      )}
    </div>
  );
}
