'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Check, FileText, Trash2, UserCheck } from '@/components/icons';
import { askConfirm } from '@/components/ConfirmHost';
import { useI18n } from '@/lib/i18n/client';
import { LOCALES } from '@/lib/i18n/config';
import { PayrollSlipDialog } from '@/app/payrolls/PayrollSlipDialog';
import type { EmployeePayRow, EmployeeRow } from '@/lib/payroll-runs';

type Card = { employee: EmployeeRow; history: EmployeePayRow[]; years: { year: number; gross: number; gpm: number; sodraEmployee: number; net: number; months: number }[];
  leave: { periodFrom: string; periodUntil: string; days: number; note: string | null }[]; leaveTotal: number;
  client: { id: number; name: string; code: string | null } | null;
  bank: { date: string; number: string | null; sum: number; notes: string | null; account: string | null }[]; bankTotals: { count: number; paid: number; received: number };
  ledger: { account: string; debit: number; credit: number; count: number }[] };
type Form = Record<'name' | 'personalCode' | 'position' | 'baseSalary' | 'contractType' | 'accidentRate' | 'startDate' | 'endDate' | 'agreementNumber' | 'agreementDate' | 'email' | 'phone' | 'bankAccount' | 'address' | 'notes' | 'employmentKind' | 'clientId', string> & { applyNpd: boolean; pensionAccumulation: boolean; active: boolean };

const input = 'w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 focus:border-emerald-500 focus:outline-none';
const label = 'block text-xs font-medium text-slate-400 mb-1';
const card = 'rounded-xl border border-slate-800 bg-slate-900 p-5';

const toForm = (e: EmployeeRow | null): Form => ({
  name: e?.name ?? '', personalCode: e?.personalCode ?? '', position: e?.position ?? '', baseSalary: e ? String(e.baseSalary) : '',
  contractType: e?.contractType ?? 'OPEN', accidentRate: e?.accidentRate == null ? '' : String(e.accidentRate), startDate: e?.startDate ?? '', endDate: e?.endDate ?? '',
  agreementNumber: e?.agreementNumber ?? '', agreementDate: e?.agreementDate ?? '', email: e?.email ?? '', phone: e?.phone ?? '', bankAccount: e?.bankAccount ?? '',
  address: e?.address ?? '', notes: e?.notes ?? '', employmentKind: e?.employmentKind ?? 'EMPLOYMENT', clientId: e?.clientId ? String(e.clientId) : '', applyNpd: e ? e.applyNpd === 1 : true, pensionAccumulation: e?.pensionAccumulation === 1, active: e ? e.active === 1 : true,
});

/** Employee card: personnel details, payroll settings and the pay history by month (with the payroll breakdown). */
export function EmployeeCardClient({ card: data, positions, clients = [] }: { card: Card | null; positions: string[]; clients?: { id: number; name: string }[] }) {
  const { t, lang } = useI18n();
  const router = useRouter();
  const [form, setForm] = useState<Form>(toForm(data?.employee ?? null));
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [slipId, setSlipId] = useState<number | null>(null);
  const set = (patch: Partial<Form>) => { setForm(f => ({ ...f, ...patch })); setMessage(null); };
  const money = (v: number | null | undefined) => v == null ? '–' : '€' + Number(v).toLocaleString(LOCALES[lang], { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true); setMessage(null);
    const body = { ...form, baseSalary: Number(form.baseSalary || 0), accidentRate: form.accidentRate === '' ? null : Number(form.accidentRate), clientId: form.clientId === '' ? null : Number(form.clientId) };
    try {
      const res = await fetch(data ? `/api/payroll/employees/${data.employee.id}` : '/api/payroll/employees', { method: data ? 'PUT' : 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || t('employees.failed'));
      setMessage({ ok: true, text: t('employees.saved') });
      if (!data) router.replace(`/employees/${json.employee.id}`); else router.refresh();
    } catch (err) {
      setMessage({ ok: false, text: err instanceof Error ? err.message : t('employees.failed') });
    } finally { setBusy(false); }
  };
  const remove = async () => {
    if (!data || !await askConfirm(t('employees.confirmDelete', { name: data.employee.name }))) return;
    const res = await fetch(`/api/payroll/employees/${data.employee.id}`, { method: 'DELETE' });
    if (res.ok) router.push('/employees');
    else setMessage({ ok: false, text: (await res.json().catch(() => ({}))).error || t('employees.failed') });
  };

  const field = (key: keyof Form, text: string, props: React.InputHTMLAttributes<HTMLInputElement> = {}) => (
    <div><label className={label} htmlFor={`f-${key}`}>{text}</label><input id={`f-${key}`} className={input} value={form[key] as string} onChange={e => set({ [key]: e.target.value } as Partial<Form>)} {...props} /></div>
  );
  const check = (key: 'applyNpd' | 'pensionAccumulation' | 'active', text: string) => (
    <label className="flex items-center gap-2 text-sm text-slate-200"><input type="checkbox" checked={form[key]} onChange={e => set({ [key]: e.target.checked } as Partial<Form>)} className="h-4 w-4 accent-emerald-500" />{text}</label>
  );

  return (
    <div className="p-8 max-w-6xl mx-auto space-y-6">
      <header className="space-y-2">
        <Link href="/employees" className="inline-flex items-center gap-1 text-xs text-slate-400 hover:text-emerald-400"><ArrowLeft className="w-3.5 h-3.5" aria-hidden />{t('employees.back')}</Link>
        <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight text-white"><UserCheck className="w-6 h-6 text-emerald-400" aria-hidden />{data ? data.employee.name : t('employees.add')}</h1>
        {data && <p className="text-sm text-slate-400">{[data.employee.position, data.employee.active === 1 ? t('employees.active') : t('employees.inactive')].filter(Boolean).join(' · ')}</p>}
      </header>

      <form onSubmit={save} className="space-y-6">
        <div className="grid gap-6 lg:grid-cols-2">
          <section className={card} aria-labelledby="s-main">
            <h2 id="s-main" className="mb-4 font-semibold text-white">{t('employees.sectionMain')}</h2>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="sm:col-span-2">{field('name', t('employees.name'), { required: true, maxLength: 200 })}</div>
              {field('personalCode', t('employees.personalCode'), { maxLength: 20, inputMode: 'numeric' })}
              <div><label className={label} htmlFor="f-position">{t('employees.position')}</label><input id="f-position" list="positions" className={input} value={form.position} maxLength={200} onChange={e => set({ position: e.target.value })} /><datalist id="positions">{positions.map(p => <option key={p} value={p} />)}</datalist></div>
              <div className="sm:col-span-2">{check('active', t('employees.isActive'))}</div>
            </div>
          </section>
          <section className={card} aria-labelledby="s-contract">
            <h2 id="s-contract" className="mb-4 font-semibold text-white">{t('employees.sectionContract')}</h2>
            <div className="grid gap-3 sm:grid-cols-2">
              {field('agreementNumber', t('employees.agreementNumber'), { maxLength: 50 })}
              {field('agreementDate', t('employees.agreementDate'), { type: 'date' })}
              <div><label className={label} htmlFor="f-employmentKind">{t('employees.employmentKind')}</label><select id="f-employmentKind" className={input} value={form.employmentKind} onChange={e => set({ employmentKind: e.target.value })}><option value="EMPLOYMENT">{t('employees.kindEmployment')}</option><option value="SERVICE">{t('employees.kindService')}</option></select></div>
              <div><label className={label} htmlFor="f-contractType">{t('employees.contractType')}</label><select id="f-contractType" className={input} value={form.contractType} onChange={e => set({ contractType: e.target.value })}><option value="OPEN">{t('employees.contractOpen')}</option><option value="FIXED">{t('employees.contractFixed')}</option></select></div>
              {field('baseSalary', t('employees.baseSalary'), { type: 'number', min: 0, step: '0.01' })}
              {field('startDate', t('employees.startDate'), { type: 'date' })}
              {field('endDate', t('employees.endDate'), { type: 'date' })}
            </div>
          </section>
          <section className={card} aria-labelledby="s-contacts">
            <h2 id="s-contacts" className="mb-4 font-semibold text-white">{t('employees.sectionContacts')}</h2>
            <div className="grid gap-3 sm:grid-cols-2">
              {field('email', t('employees.email'), { type: 'email', maxLength: 200 })}
              {field('phone', t('employees.phone'), { type: 'tel', maxLength: 50 })}
              <div className="sm:col-span-2">{field('bankAccount', t('employees.bankAccount'), { maxLength: 50 })}</div>
              <div className="sm:col-span-2">{field('address', t('employees.address'), { maxLength: 300 })}</div>
              <div className="sm:col-span-2"><label className={label} htmlFor="f-clientId">{t('employees.client')}</label><select id="f-clientId" className={input} value={form.clientId} onChange={e => set({ clientId: e.target.value })}><option value="">{t('employees.clientNone')}</option>{clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select><p className="mt-1 text-xs text-slate-500">{t('employees.clientHint')}</p></div>
            </div>
          </section>
          <section className={card} aria-labelledby="s-payroll">
            <h2 id="s-payroll" className="mb-4 font-semibold text-white">{t('employees.sectionPayroll')}</h2>
            <div className="grid gap-3">
              {check('applyNpd', t('employees.applyNpd'))}
              {check('pensionAccumulation', t('employees.pension'))}
              {field('accidentRate', t('employees.accidentRate'), { type: 'number', min: 0, step: '0.01' })}
            </div>
          </section>
        </div>
        <section className={card}>
          <label className={label} htmlFor="f-notes">{t('employees.notes')}</label>
          <textarea id="f-notes" rows={3} maxLength={4000} className={input} value={form.notes} onChange={e => set({ notes: e.target.value })} />
        </section>
        <div className="flex flex-wrap items-center gap-3">
          <button type="submit" disabled={busy} className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-500 disabled:opacity-50"><Check className="w-4 h-4" aria-hidden />{t('employees.save')}</button>
          <Link href="/employees" className="rounded-lg border border-slate-700 px-4 py-2 text-sm font-semibold text-slate-200 hover:bg-slate-800">{t('employees.cancel')}</Link>
          {data && <button type="button" onClick={remove} className="ml-auto inline-flex items-center gap-2 rounded-lg border border-rose-800 px-3 py-2 text-sm font-semibold text-rose-300 hover:bg-rose-950/40"><Trash2 className="w-4 h-4" aria-hidden />{t('employees.delete')}</button>}
          {message && <p role="status" className={`text-sm ${message.ok ? 'text-emerald-400' : 'text-rose-400'}`}>{message.text}</p>}
        </div>
      </form>

      {data && (
        <section className={card} aria-labelledby="s-history">
          <h2 id="s-history" className="mb-4 font-semibold text-white">{t('employees.history')}</h2>
          {data.history.length === 0 ? <p className="text-sm text-slate-400">{t('employees.historyEmpty')}</p> : (
            <>
              <div className="mb-5 overflow-x-auto">
                <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-400">{t('employees.years')}</h3>
                <table className="w-full text-sm"><thead className="text-[11px] uppercase text-slate-500"><tr><th className="py-1.5 pr-3 text-left">{t('employees.period')}</th><th className="py-1.5 pr-3 text-right">{t('employees.months')}</th><th className="py-1.5 pr-3 text-right">{t('employees.gross')}</th><th className="py-1.5 pr-3 text-right">{t('employees.gpm')}</th><th className="py-1.5 pr-3 text-right">{t('employees.sodra')}</th><th className="py-1.5 text-right">{t('employees.net')}</th></tr></thead>
                  <tbody className="divide-y divide-slate-800/60 font-mono">{data.years.map(y => <tr key={y.year}><td className="py-1.5 pr-3 text-slate-200">{y.year}</td><td className="py-1.5 pr-3 text-right text-slate-400">{y.months}</td><td className="py-1.5 pr-3 text-right text-slate-100">{money(y.gross)}</td><td className="py-1.5 pr-3 text-right text-slate-300">{money(y.gpm)}</td><td className="py-1.5 pr-3 text-right text-slate-300">{money(y.sodraEmployee)}</td><td className="py-1.5 text-right text-emerald-400">{money(y.net)}</td></tr>)}</tbody></table>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm"><thead className="text-[11px] uppercase text-slate-500"><tr><th className="py-1.5 pr-3 text-left">{t('employees.period')}</th><th className="py-1.5 pr-3 text-left">{t('employees.payDate')}</th><th className="py-1.5 pr-3 text-right">{t('employees.gross')}</th><th className="py-1.5 pr-3 text-right">{t('employees.gpm')}</th><th className="py-1.5 pr-3 text-right">{t('employees.sodra')}</th><th className="py-1.5 pr-3 text-right">{t('employees.payOut')}</th><th className="py-1.5" /></tr></thead>
                  <tbody className="divide-y divide-slate-800/60">{data.history.map((h, i) => (
                    <tr key={i}>
                      <td className="py-1.5 pr-3 font-mono text-slate-200">{h.year}-{String(h.month).padStart(2, '0')}{h.source === 'RUN' && <span className="ml-2 font-sans text-[10px] text-amber-400">{t('employees.draft')}</span>}</td>
                      <td className="py-1.5 pr-3 font-mono text-xs text-slate-400">{h.payDate || '–'}</td>
                      <td className="py-1.5 pr-3 text-right font-mono text-slate-100">{money(h.gross)}</td>
                      <td className="py-1.5 pr-3 text-right font-mono text-slate-300">{money(h.gpm)}</td>
                      <td className="py-1.5 pr-3 text-right font-mono text-slate-300">{money(h.sodraEmployee)}</td>
                      <td className="py-1.5 pr-3 text-right font-mono text-emerald-400">{money(h.payOut ?? h.net)}</td>
                      <td className="py-1.5 text-right">{h.payrollId ? <button type="button" onClick={() => setSlipId(h.payrollId)} title={t('payroll.slip')} aria-label={t('payroll.slip')} className="rounded p-1 text-slate-400 hover:bg-slate-800 hover:text-emerald-400"><FileText className="w-3.5 h-3.5" /></button> : <Link href="/payroll" className="text-xs text-emerald-400 hover:underline">{t('employees.openRun')}</Link>}</td>
                    </tr>
                  ))}</tbody></table>
              </div>
            </>
          )}
        </section>
      )}
      {data && (
        <div className="grid gap-6 lg:grid-cols-2">
          <section className={card} aria-labelledby="s-leave">
            <h2 id="s-leave" className="mb-1 font-semibold text-white">{t('employees.leave')}</h2>
            <p className="mb-3 text-xs text-slate-500">{t('employees.leaveHint')}</p>
            {data.leave.length === 0 ? <p className="text-sm text-slate-400">{t('employees.leaveEmpty')}</p> : (
              <table className="w-full text-sm"><thead className="text-[11px] uppercase text-slate-500"><tr><th className="py-1.5 pr-3 text-left">{t('employees.leavePeriod')}</th><th className="py-1.5 text-right">{t('employees.leaveDays')}</th></tr></thead>
                <tbody className="divide-y divide-slate-800/60 font-mono">{data.leave.map(l => <tr key={l.periodFrom}><td className="py-1.5 pr-3 text-slate-300">{l.periodFrom} – {l.periodUntil}</td><td className="py-1.5 text-right text-slate-100">{l.days}</td></tr>)}</tbody>
                <tfoot><tr className="border-t border-slate-700"><td className="py-1.5 pr-3 text-slate-400">{t('employees.leaveTotal')}</td><td className="py-1.5 text-right font-mono font-semibold text-white">{data.leaveTotal}</td></tr></tfoot></table>
            )}
          </section>
          <section className={card} aria-labelledby="s-ledger">
            <h2 id="s-ledger" className="mb-1 font-semibold text-white">{t('employees.settlements')}</h2>
            {!data.client ? <p className="text-sm text-slate-400">{t('employees.settlementsNoClient')}</p> : (
              <>
                <p className="mb-3 text-xs text-slate-500">{t('employees.settlementsHint', { name: data.client.name })}</p>
                <dl className="mb-4 grid grid-cols-3 gap-3 text-xs">
                  <div><dt className="text-slate-500">{t('employees.bankCount')}</dt><dd className="font-mono text-slate-100">{data.bankTotals.count}</dd></div>
                  <div><dt className="text-slate-500">{t('employees.bankPaid')}</dt><dd className="font-mono text-rose-300">{money(data.bankTotals.paid)}</dd></div>
                  <div><dt className="text-slate-500">{t('employees.bankReceived')}</dt><dd className="font-mono text-emerald-400">{money(data.bankTotals.received)}</dd></div>
                </dl>
                {data.ledger.length > 0 && (
                  <table className="w-full text-sm"><thead className="text-[11px] uppercase text-slate-500"><tr><th className="py-1.5 pr-3 text-left">{t('employees.account')}</th><th className="py-1.5 pr-3 text-right">{t('employees.debit')}</th><th className="py-1.5 text-right">{t('employees.credit')}</th></tr></thead>
                    <tbody className="divide-y divide-slate-800/60 font-mono">{data.ledger.map(l => <tr key={l.account}><td className="py-1.5 pr-3 text-slate-300">{l.account}</td><td className="py-1.5 pr-3 text-right text-slate-100">{money(l.debit)}</td><td className="py-1.5 text-right text-slate-100">{money(l.credit)}</td></tr>)}</tbody></table>
                )}
              </>
            )}
          </section>
        </div>
      )}
      {data?.client && data.bank.length > 0 && (
        <section className={card} aria-labelledby="s-bank">
          <h2 id="s-bank" className="mb-3 font-semibold text-white">{t('employees.bankList')}</h2>
          <div className="overflow-x-auto max-h-96"><table className="w-full text-sm"><thead className="text-[11px] uppercase text-slate-500"><tr><th className="py-1.5 pr-3 text-left">{t('employees.payDate')}</th><th className="py-1.5 pr-3 text-left">{t('employees.bankNumber')}</th><th className="py-1.5 pr-3 text-left">{t('employees.account')}</th><th className="py-1.5 pr-3 text-left">{t('employees.notes')}</th><th className="py-1.5 text-right">{t('employees.amount')}</th></tr></thead>
            <tbody className="divide-y divide-slate-800/60">{data.bank.map((b, i) => <tr key={i}><td className="py-1.5 pr-3 font-mono text-xs text-slate-400">{b.date}</td><td className="py-1.5 pr-3 font-mono text-xs text-slate-400">{b.number || ''}</td><td className="py-1.5 pr-3 font-mono text-xs text-slate-400">{b.account || ''}</td><td className="py-1.5 pr-3 text-xs text-slate-300">{b.notes || ''}</td><td className={`py-1.5 text-right font-mono ${b.sum < 0 ? 'text-rose-300' : 'text-emerald-400'}`}>{money(b.sum)}</td></tr>)}</tbody></table></div>
          {data.bankTotals.count > data.bank.length && <p className="mt-2 text-xs text-slate-500">{t('employees.bankMore', { shown: data.bank.length, total: data.bankTotals.count })}</p>}
        </section>
      )}
      {slipId !== null && <PayrollSlipDialog payrollId={slipId} onClose={() => setSlipId(null)} />}
    </div>
  );
}
