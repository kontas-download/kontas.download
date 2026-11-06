'use client';
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useI18n } from '@/lib/i18n/client';
import { LOCALES } from '@/lib/i18n/config';
import { askConfirm } from '@/components/ConfirmHost';
import { TAX_CODES } from '@/lib/tax-codes';

interface Rule {
  id: number; name: string; clientId: number | null; senderPattern: string | null; debitAccount: string | null; taxCode: string | null; evidenceType: string | null;
  paymentMethod: string | null; paidBy: string | null; deductionPercent: number | null; notes: string | null; lastUsedAt: string | null;
}
interface Props { clients: { id: number; name: string; code: string | null }[]; accounts: { code: string; name: string }[] }
interface FormState { clientId: string; senderPattern: string; debitAccount: string; taxCode: string; evidenceType: string; paymentMethod: string; paidBy: string; deductionPercent: string; notes: string }
const EMPTY: FormState = { clientId: '', senderPattern: '', debitAccount: '', taxCode: '', evidenceType: '', paymentMethod: '', paidBy: '', deductionPercent: '', notes: '' };

const control = 'block mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-2.5 py-2 text-sm text-slate-100 focus:border-emerald-500 focus:outline-none';
const label = 'block text-xs font-medium text-slate-400';
const btn = 'rounded-lg border border-slate-700 px-3 py-1.5 text-xs font-semibold text-slate-200 hover:bg-slate-800 disabled:opacity-40';

// Management of the per-supplier rules that pre-fill the review of received documents.
export function RulesClient({ clients, accounts }: Props) {
  const { t, lang } = useI18n();
  const [rules, setRules] = useState<Rule[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<number | 'new' | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);
  const taxCodes = TAX_CODES.filter(d => d.purchase).map(d => d.code);

  const load = useCallback(async () => {
    const res = await fetch('/api/purchase-documents/rules', { cache: 'no-store' });
    const data = await res.json().catch(() => ({}));
    if (res.ok) setRules(data.rules);
    setLoading(false);
  }, []);
  // eslint-disable-next-line react-hooks/set-state-in-effect -- initial data load
  useEffect(() => { void load(); }, [load]);

  function start(rule: Rule | null) {
    setMessage(null);
    setEditing(rule ? rule.id : 'new');
    setForm(rule ? {
      clientId: rule.clientId === null ? '' : String(rule.clientId), senderPattern: rule.senderPattern ?? '', debitAccount: rule.debitAccount ?? '', taxCode: rule.taxCode ?? '', evidenceType: rule.evidenceType ?? '',
      paymentMethod: rule.paymentMethod ?? '', paidBy: rule.paidBy ?? '', deductionPercent: rule.deductionPercent === null ? '' : String(rule.deductionPercent), notes: rule.notes ?? '',
    } : EMPTY);
  }
  async function save() {
    if (!form.clientId && !form.senderPattern.trim()) { setMessage({ kind: 'error', text: t('docs.ruleNeedWho') }); return; }
    setBusy(true); setMessage(null);
    try {
      const body = { ...form, clientId: form.clientId ? Number(form.clientId) : null };
      const res = await fetch(editing === 'new' ? '/api/purchase-documents/rules' : `/api/purchase-documents/rules/${editing}`, { method: editing === 'new' ? 'POST' : 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { setMessage({ kind: 'error', text: data.error || t('common.error') }); return; }
      setEditing(null);
      setMessage({ kind: 'ok', text: t('docs.ruleSaved') });
      await load();
    } finally { setBusy(false); }
  }
  async function remove(rule: Rule) {
    if (!await askConfirm(t('docs.ruleConfirmDelete', { name: rule.name }))) return;
    setBusy(true); setMessage(null);
    try {
      const res = await fetch(`/api/purchase-documents/rules/${rule.id}`, { method: 'DELETE' });
      if (!res.ok) setMessage({ kind: 'error', text: (await res.json().catch(() => ({}))).error || t('common.error') });
      if (editing === rule.id) setEditing(null);
      await load();
    } finally { setBusy(false); }
  }

  const values = (r: Rule) => [
    r.debitAccount && `${t('docs.ruleAccount')}: ${r.debitAccount}`, r.taxCode && `${t('docs.ruleTaxCode')}: ${r.taxCode}`,
    r.evidenceType && `${t('docs.evidenceType')}: ${t(r.evidenceType === 'RECEIPT' ? 'docs.evidenceReceipt' : 'docs.evidenceInvoice')}`,
    r.paymentMethod && `${t('docs.paymentMethod')}: ${t(`docs.pay_${r.paymentMethod}`)}`,
    r.paidBy && `${t('docs.paidBy')}: ${t(r.paidBy === 'PERSON' ? 'docs.paidByPerson' : 'docs.paidByCompany')}`,
    r.deductionPercent !== null && `${t('docs.ruleDeduction')}: ${r.deductionPercent}`,
  ].filter(Boolean) as string[];
  const set = (field: keyof FormState, value: string) => setForm(f => ({ ...f, [field]: value }));

  return (
    <div className="p-4 sm:p-8 max-w-5xl mx-auto space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-white">{t('docs.rulesTitle')}</h1>
          <p className="text-sm text-slate-400 max-w-3xl">{t('docs.rulesIntro')}</p>
        </div>
        <div className="flex items-center gap-4">
          <Link href="/purchase-documents" className="text-sm font-semibold text-emerald-300 underline">{t('docs.rulesBack')}</Link>
          <button type="button" disabled={busy} onClick={() => start(null)} className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-bold text-white hover:bg-emerald-500 disabled:opacity-40">{t('docs.rulesNew')}</button>
        </div>
      </div>

      {message && <p role={message.kind === 'error' ? 'alert' : 'status'} className={`rounded-lg border p-2 text-sm ${message.kind === 'error' ? 'border-rose-800 bg-rose-950/40 text-rose-300' : 'border-emerald-800 bg-emerald-950/40 text-emerald-300'}`}>{message.text}</p>}

      {editing !== null && (
        <section className="space-y-3 rounded-xl border border-slate-800 bg-slate-900 p-4" aria-label={t(editing === 'new' ? 'docs.rulesNew' : 'docs.rulesEdit')}>
          <h2 className="font-bold text-white text-sm">{t(editing === 'new' ? 'docs.rulesNew' : 'docs.rulesEdit')}</h2>
          <fieldset disabled={busy} className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <label className={label}>{t('docs.ruleClient')}
                <select value={form.clientId} onChange={e => set('clientId', e.target.value)} className={control}>
                  <option value="">{t('docs.ruleNoClient')}</option>
                  {clients.map(c => <option key={c.id} value={c.id}>{c.name}{c.code ? ` (${c.code})` : ''}</option>)}
                </select>
              </label>
              <label className={label}>{t('docs.ruleSender')}
                <input value={form.senderPattern} onChange={e => set('senderPattern', e.target.value)} placeholder="saskaitos@tiekejas.lt / @tiekejas.lt" className={control} />
              </label>
              <label className={label}>{t('docs.ruleAccount')}
                <select value={form.debitAccount} onChange={e => set('debitAccount', e.target.value)} className={control}>
                  <option value="">{t('docs.ruleAny')}</option>
                  {accounts.map(a => <option key={a.code} value={a.code}>{a.code} — {a.name}</option>)}
                </select>
              </label>
              <label className={label}>{t('docs.ruleTaxCode')}
                <select value={form.taxCode} onChange={e => set('taxCode', e.target.value)} className={control}>
                  <option value="">{t('docs.ruleAny')}</option>
                  {taxCodes.map(code => <option key={code} value={code}>{code}</option>)}
                </select>
              </label>
              <label className={label}>{t('docs.evidenceType')}
                <select value={form.evidenceType} onChange={e => set('evidenceType', e.target.value)} className={control}>
                  <option value="">{t('docs.ruleAny')}</option>
                  <option value="INVOICE">{t('docs.evidenceInvoice')}</option>
                  <option value="RECEIPT">{t('docs.evidenceReceipt')}</option>
                </select>
              </label>
              <label className={label}>{t('docs.paymentMethod')}
                <select value={form.paymentMethod} onChange={e => set('paymentMethod', e.target.value)} className={control}>
                  <option value="">{t('docs.ruleAny')}</option>
                  {['CARD', 'CASH', 'TRANSFER', 'OTHER'].map(m => <option key={m} value={m}>{t(`docs.pay_${m}`)}</option>)}
                </select>
              </label>
              <label className={label}>{t('docs.paidBy')}
                <select value={form.paidBy} onChange={e => set('paidBy', e.target.value)} className={control}>
                  <option value="">{t('docs.ruleAny')}</option>
                  <option value="COMPANY">{t('docs.paidByCompany')}</option>
                  <option value="PERSON">{t('docs.paidByPerson')}</option>
                </select>
              </label>
              <label className={label}>{t('docs.ruleDeduction')}
                <input inputMode="decimal" value={form.deductionPercent} onChange={e => set('deductionPercent', e.target.value)} placeholder={t('docs.deductionDefault')} className={`${control} text-right font-mono`} />
              </label>
            </div>
            <label className={label}>{t('docs.ruleNotes')}
              <input value={form.notes} maxLength={300} onChange={e => set('notes', e.target.value)} className={control} />
            </label>
          </fieldset>
          <div className="flex justify-end gap-3">
            <button type="button" disabled={busy} onClick={() => setEditing(null)} className={btn}>{t('common.cancel')}</button>
            <button type="button" disabled={busy} onClick={() => { void save(); }} className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-500 disabled:opacity-40">{t('common.save')}</button>
          </div>
        </section>
      )}

      <div className="overflow-x-auto rounded-xl border border-slate-800 bg-slate-900">
        <table className="w-full text-left text-xs text-slate-200">
          <thead className="bg-slate-950/80 text-[11px] uppercase tracking-wider text-slate-400 border-b border-slate-800">
            <tr><th className="p-3">{t('docs.ruleColWho')}</th><th className="p-3">{t('docs.ruleColValues')}</th><th className="p-3">{t('docs.ruleColUsed')}</th><th className="p-3 text-center">{t('docs.colActions')}</th></tr>
          </thead>
          <tbody className="divide-y divide-slate-800/60">
            {rules.map(r => (
              <tr key={r.id} className="align-top hover:bg-slate-800/40">
                <td className="p-3"><div className="font-semibold">{r.name}</div>{r.senderPattern && r.senderPattern !== r.name && <div className="text-[11px] text-slate-400">{r.senderPattern}</div>}{r.notes && <div className="text-[11px] text-slate-500">{r.notes}</div>}</td>
                <td className="p-3">{values(r).map(v => <div key={v}>{v}</div>)}</td>
                <td className="p-3 whitespace-nowrap">{r.lastUsedAt ? new Date(r.lastUsedAt).toLocaleString(LOCALES[lang], { dateStyle: 'short', timeStyle: 'short' }) : '—'}</td>
                <td className="p-3"><div className="flex justify-center gap-1.5"><button type="button" disabled={busy} onClick={() => start(r)} className={btn}>{t('common.edit')}</button><button type="button" disabled={busy} onClick={() => { void remove(r); }} className={`${btn} text-rose-300`}>{t('common.delete')}</button></div></td>
              </tr>
            ))}
            {!rules.length && <tr><td colSpan={4} className="p-8 text-center text-slate-400">{loading ? t('common.loading') : t('docs.rulesEmpty')}</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
