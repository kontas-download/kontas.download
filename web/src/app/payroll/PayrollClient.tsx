'use client';

import Link from 'next/link';
import { useState } from 'react';
import { Users, Wallet } from 'lucide-react';
import { useI18n } from '@/lib/i18n/client';

export interface EmployeeDto {
  id: number; name: string; personalCode: string | null; position: string | null; baseSalary: number; contractType: 'OPEN' | 'FIXED';
  applyNpd: number; pensionAccumulation: number; accidentRate: number | null; startDate: string | null; endDate: string | null; active: number;
}
export interface RunSummary { id: number; year: number; month: number; status: 'DRAFT' | 'POSTED'; rulesProvisional: number; verifiedAt: string | null; lineCount: number; totalGross: number; totalNet: number }
interface Payslip { gross: number; net: number; totalCost: number; overridden: string[]; [key: string]: unknown }
interface Line { id: number; employeeName: string; gross: number; calc: Payslip; result: Payslip; overrides: Record<string, number> }
interface LogRow { id: number; createdAt?: string; action: string; employeeName: string | null; field: string | null; oldValue: number | null; newValue: number | null; reason: string | null; actorName: string | null }
interface RunDetail { run: { id: number; year: number; month: number; status: 'DRAFT' | 'POSTED'; rulesProvisional: boolean; verifiedAt: string | null; verifiedByName: string | null }; lines: Line[]; log: LogRow[] }

const FIELDS = ['npd', 'gpm', 'vsd', 'psd', 'pension', 'unemployment', 'accident', 'guarantee', 'longTerm'] as const;
const FIELD_KEY: Record<string, string> = { npd: 'rFieldNpd', gpm: 'rFieldGpm', vsd: 'rFieldVsd', psd: 'rFieldPsd', pension: 'rFieldPension', unemployment: 'rFieldUnemployment', accident: 'rFieldAccident', guarantee: 'rFieldGuarantee', longTerm: 'rFieldLongTerm' };
const input = 'rounded border border-slate-700 bg-slate-950 px-2 py-1 text-sm text-slate-100';
const btn = 'rounded border border-slate-600 px-3 py-1 text-sm text-slate-100 hover:bg-slate-800 disabled:opacity-50';

const blankEmployee = { name: '', personalCode: '', position: '', baseSalary: '', contractType: 'OPEN', applyNpd: true, pensionAccumulation: false, accidentRate: '', startDate: '', endDate: '', active: true };
type EmployeeForm = typeof blankEmployee;

export function PayrollClient({ initialEmployees, initialRuns, companyId }: { initialEmployees: EmployeeDto[]; initialRuns: RunSummary[]; companyId: number }) {
  const { t, money, date } = useI18n();
  const [employees, setEmployees] = useState(initialEmployees);
  const [runs, setRuns] = useState(initialRuns);
  const [detail, setDetail] = useState<RunDetail | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState<EmployeeForm | null>(null);
  const [editId, setEditId] = useState<number | null>(null);
  const now = new Date();
  const [period, setPeriod] = useState({ year: String(now.getFullYear()), month: String(now.getMonth() + 1) });
  const [override, setOverride] = useState<{ lineId: number; field: string; value: string; reason: string } | null>(null);
  const [unpostReason, setUnpostReason] = useState('');

  async function call(url: string, method: string, body?: unknown) {
    setBusy(true); setError('');
    try {
      const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { setError(data.error || t('payroll.rError')); return null; }
      return data;
    } catch { setError(t('payroll.rError')); return null; } finally { setBusy(false); }
  }
  async function reloadRuns() { const d = await call('/api/payroll/runs', 'GET'); if (d) setRuns(d.runs); }
  async function reloadEmployees() { const d = await call('/api/payroll/employees', 'GET'); if (d) setEmployees(d.employees); }

  async function saveEmployee() {
    if (!form) return;
    const body = { ...form, baseSalary: form.baseSalary === '' ? 0 : Number(form.baseSalary), accidentRate: form.accidentRate === '' ? null : Number(form.accidentRate), startDate: form.startDate || null, endDate: form.endDate || null };
    const d = await call(editId ? `/api/payroll/employees/${editId}` : '/api/payroll/employees', editId ? 'PUT' : 'POST', body);
    if (d) { setForm(null); setEditId(null); await reloadEmployees(); }
  }
  async function removeEmployee(e: EmployeeDto) {
    if (!window.confirm(t('payroll.rConfirmDeleteEmployee', { name: e.name }))) return;
    if (await call(`/api/payroll/employees/${e.id}`, 'DELETE')) await reloadEmployees();
  }
  function editEmployee(e: EmployeeDto) {
    setEditId(e.id);
    setForm({ name: e.name, personalCode: e.personalCode ?? '', position: e.position ?? '', baseSalary: String(e.baseSalary), contractType: e.contractType, applyNpd: e.applyNpd === 1, pensionAccumulation: e.pensionAccumulation === 1, accidentRate: e.accidentRate === null ? '' : String(e.accidentRate), startDate: e.startDate ?? '', endDate: e.endDate ?? '', active: e.active === 1 });
  }

  async function openRun(id: number) { const d = await call(`/api/payroll/runs/${id}`, 'GET'); if (d) { setDetail(d); setOverride(null); } }
  async function createRun() {
    const d = await call('/api/payroll/runs', 'POST', { year: Number(period.year), month: Number(period.month), companyId });
    if (d) { setDetail(d); await reloadRuns(); }
  }
  async function action(body: Record<string, unknown>) {
    if (!detail) return;
    const d = await call(`/api/payroll/runs/${detail.run.id}`, 'PUT', body);
    if (d) { setDetail(d); setOverride(null); await reloadRuns(); }
  }
  async function removeRun() {
    if (!detail || !window.confirm(t('payroll.rConfirmDeleteRun', { month: detail.run.month, year: detail.run.year }))) return;
    if (await call(`/api/payroll/runs/${detail.run.id}`, 'DELETE')) { setDetail(null); await reloadRuns(); }
  }
  function editGross(l: Line) {
    const v = window.prompt(t('payroll.rGrossEdit'), String(l.gross));
    if (v !== null && v.trim() !== '') void action({ action: 'gross', lineId: l.id, gross: Number(v.replace(',', '.')) });
  }

  const draft = detail?.run.status === 'DRAFT';
  const set = (patch: Partial<EmployeeForm>) => setForm(f => f && { ...f, ...patch });

  return (
    <div className="p-4 sm:p-8 max-w-7xl mx-auto space-y-6">
      <header>
        <h1 className="text-2xl font-bold text-white tracking-tight flex items-center gap-2"><Wallet className="w-6 h-6 text-emerald-400" /><span>{t('payroll.rTitle')}</span></h1>
        <p className="text-sm text-slate-400 mt-1">{t('payroll.rSubtitle')}</p>
      </header>
      <div role="alert" className="rounded-lg border border-amber-700 bg-amber-950/30 p-3 text-sm text-amber-200">{t('payroll.rProvisional')}</div>
      {error && <div role="alert" className="rounded-lg border border-rose-700 bg-rose-950/30 p-3 text-sm text-rose-200">{error}</div>}

      <section className="rounded-xl border border-slate-800 bg-slate-900 p-4 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold text-white flex items-center gap-2"><Users className="w-4 h-4" />{t('payroll.rEmployees')}</h2>
          {!form && <button className={btn} onClick={() => { setEditId(null); setForm({ ...blankEmployee }); }}>{t('payroll.rAddEmployee')}</button>}
        </div>
        {form && (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm text-slate-300">
            <label className="flex flex-col gap-1">{t('payroll.rName')}<input className={input} value={form.name} onChange={e => set({ name: e.target.value })} /></label>
            <label className="flex flex-col gap-1">{t('payroll.rCode')}<input className={input} value={form.personalCode} onChange={e => set({ personalCode: e.target.value })} /></label>
            <label className="flex flex-col gap-1">{t('payroll.rPosition')}<input className={input} value={form.position} onChange={e => set({ position: e.target.value })} /></label>
            <label className="flex flex-col gap-1">{t('payroll.rBaseSalary')}<input className={input} type="number" step="0.01" min="0" value={form.baseSalary} onChange={e => set({ baseSalary: e.target.value })} /></label>
            <label className="flex flex-col gap-1">{t('payroll.rContract')}<select className={input} value={form.contractType} onChange={e => set({ contractType: e.target.value })}><option value="OPEN">{t('payroll.rContractOpen')}</option><option value="FIXED">{t('payroll.rContractFixed')}</option></select></label>
            <label className="flex flex-col gap-1">{t('payroll.rAccident')}<input className={input} type="number" step="0.01" min="0" value={form.accidentRate} onChange={e => set({ accidentRate: e.target.value })} /></label>
            <label className="flex flex-col gap-1">{t('payroll.rStart')}<input className={input} type="date" value={form.startDate} onChange={e => set({ startDate: e.target.value })} /></label>
            <label className="flex flex-col gap-1">{t('payroll.rEnd')}<input className={input} type="date" value={form.endDate} onChange={e => set({ endDate: e.target.value })} /></label>
            <div className="flex flex-wrap items-end gap-4">
              <label className="flex items-center gap-1"><input type="checkbox" checked={form.applyNpd} onChange={e => set({ applyNpd: e.target.checked })} />{t('payroll.rApplyNpd')}</label>
              <label className="flex items-center gap-1"><input type="checkbox" checked={form.pensionAccumulation} onChange={e => set({ pensionAccumulation: e.target.checked })} />{t('payroll.rPension')}</label>
              <label className="flex items-center gap-1"><input type="checkbox" checked={form.active} onChange={e => set({ active: e.target.checked })} />{t('payroll.rActive')}</label>
            </div>
            <div className="flex gap-2 sm:col-span-3"><button className={btn} disabled={busy} onClick={saveEmployee}>{t('payroll.rSave')}</button><button className={btn} onClick={() => { setForm(null); setEditId(null); }}>{t('payroll.rCancel')}</button></div>
          </div>
        )}
        {employees.length === 0 ? <p className="text-sm text-slate-400">{t('payroll.rNoEmployees')}</p> : (
          <div className="overflow-x-auto"><table className="w-full text-sm">
            <thead className="text-left text-xs uppercase tracking-wider text-slate-400"><tr><th className="py-2 px-2">{t('payroll.rName')}</th><th className="py-2 px-2">{t('payroll.rPosition')}</th><th className="py-2 px-2 text-right">{t('payroll.rBaseSalary')}</th><th className="py-2 px-2">{t('payroll.rContract')}</th><th className="py-2 px-2">{t('payroll.rActive')}</th><th /></tr></thead>
            <tbody>{employees.map(e => (
              <tr key={e.id} className="border-t border-slate-800">
                <td className="py-2 px-2 text-slate-100">{e.name}</td><td className="py-2 px-2">{e.position}</td>
                <td className="py-2 px-2 text-right font-mono">{money(e.baseSalary)}</td>
                <td className="py-2 px-2">{t(e.contractType === 'FIXED' ? 'payroll.rContractFixed' : 'payroll.rContractOpen')}</td>
                <td className="py-2 px-2">{e.active ? '✓' : ''}</td>
                <td className="py-2 px-2 text-right whitespace-nowrap"><button className="text-emerald-400 hover:underline mr-3" onClick={() => editEmployee(e)}>{t('payroll.rEdit')}</button><button className="text-rose-400 hover:underline" onClick={() => removeEmployee(e)}>{t('payroll.rDelete')}</button></td>
              </tr>))}</tbody>
          </table></div>
        )}
      </section>

      <section className="rounded-xl border border-slate-800 bg-slate-900 p-4 space-y-3">
        <h2 className="font-semibold text-white">{t('payroll.rRuns')}</h2>
        <div className="flex flex-wrap items-end gap-3 text-sm text-slate-300">
          <label className="flex flex-col gap-1">{t('payroll.rYear')}<input className={`${input} w-24`} type="number" value={period.year} onChange={e => setPeriod(p => ({ ...p, year: e.target.value }))} /></label>
          <label className="flex flex-col gap-1">{t('payroll.rMonth')}<input className={`${input} w-20`} type="number" min="1" max="12" value={period.month} onChange={e => setPeriod(p => ({ ...p, month: e.target.value }))} /></label>
          <button className={btn} disabled={busy} onClick={createRun}>{t('payroll.rNewRun')}</button>
        </div>
        {runs.length === 0 ? <p className="text-sm text-slate-400">{t('payroll.rNoRuns')}</p> : (
          <div className="overflow-x-auto"><table className="w-full text-sm">
            <tbody>{runs.map(r => (
              <tr key={r.id} className="border-t border-slate-800">
                <td className="py-2 px-2 font-mono">{r.year}-{String(r.month).padStart(2, '0')}</td>
                <td className="py-2 px-2">{t(r.status === 'POSTED' ? 'payroll.rPosted' : 'payroll.rDraft')}{r.rulesProvisional ? <span className="ml-2 text-xs text-amber-300">{t('payroll.rRulesProvisional')}</span> : null}</td>
                <td className="py-2 px-2 text-right font-mono">{money(r.totalGross)}</td><td className="py-2 px-2 text-right font-mono">{money(r.totalNet)}</td>
                <td className="py-2 px-2 text-right"><button className="text-emerald-400 hover:underline" onClick={() => openRun(r.id)}>{t('payroll.rOpen')}</button></td>
              </tr>))}</tbody>
          </table></div>
        )}
      </section>

      {detail && (
        <section className="rounded-xl border border-slate-800 bg-slate-900 p-4 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="font-semibold text-white">{detail.run.year}-{String(detail.run.month).padStart(2, '0')} · {t(draft ? 'payroll.rDraft' : 'payroll.rPosted')}</h2>
            <button className={btn} onClick={() => setDetail(null)}>{t('payroll.rClose')}</button>
          </div>
          <div className="text-sm text-slate-300">
            {detail.run.verifiedAt ? t('payroll.rVerified', { date: date(detail.run.verifiedAt.slice(0, 10)) }) + (detail.run.verifiedByName ? ` · ${detail.run.verifiedByName}` : '') : t('payroll.rNotVerified')}
            {detail.run.rulesProvisional && <span className="ml-3 text-amber-300">{t('payroll.rRulesProvisional')}</span>}
          </div>
          <div className="flex flex-wrap gap-2">
            {draft && <><button className={btn} disabled={busy} onClick={() => action({ action: 'recalculate' })}>{t('payroll.rRecalculate')}</button>
              <button className={btn} disabled={busy} onClick={() => action({ action: 'verify' })}>{t('payroll.rVerify')}</button>
              <button className={btn} disabled={busy} onClick={() => action({ action: 'post' })}>{t('payroll.rPost')}</button>
              <button className={`${btn} text-rose-300`} disabled={busy} onClick={removeRun}>{t('payroll.rDeleteRun')}</button></>}
            {!draft && <><input className={`${input} w-64`} placeholder={t('payroll.rUnpostReason')} value={unpostReason} onChange={e => setUnpostReason(e.target.value)} />
              <button className={btn} disabled={busy} onClick={() => action({ action: 'unpost', reason: unpostReason })}>{t('payroll.rUnpost')}</button></>}
          </div>

          {detail.lines.map(l => (
            <div key={l.id} className="rounded-lg border border-slate-800 p-3 space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="text-slate-100 font-medium">{l.employeeName}</div>
                <div className="text-sm text-slate-300 font-mono">{t('payroll.rGross')}: {money(l.gross)} · {t('payroll.rNet')}: {money(l.result.net)} · {t('payroll.rEmployerCost')}: {money(l.result.totalCost)}</div>
                {draft && <button className="text-emerald-400 hover:underline text-sm" onClick={() => editGross(l)}>{t('payroll.rGrossEdit')}</button>}
              </div>
              <div className="overflow-x-auto"><table className="w-full text-sm">
                <thead className="text-left text-xs uppercase tracking-wider text-slate-400"><tr><th className="py-1 px-2">{t('payroll.rOverrideField')}</th><th className="py-1 px-2 text-right">{t('payroll.rComputed')}</th><th className="py-1 px-2 text-right">{t('payroll.rFinal')}</th><th /></tr></thead>
                <tbody>{FIELDS.map(f => {
                  const changed = l.result.overridden.includes(f);
                  return (
                    <tr key={f} className="border-t border-slate-800">
                      <td className="py-1 px-2">{t(`payroll.${FIELD_KEY[f]}`)}{changed && <span className="ml-2 text-xs text-amber-300">{t('payroll.rOverridden')}</span>}</td>
                      <td className="py-1 px-2 text-right font-mono text-slate-400">{money(l.calc[f] as number)}</td>
                      <td className={`py-1 px-2 text-right font-mono ${changed ? 'text-amber-300' : 'text-slate-100'}`}>{money(l.result[f] as number)}</td>
                      <td className="py-1 px-2 text-right">{draft && <button className="text-emerald-400 hover:underline" onClick={() => setOverride({ lineId: l.id, field: f, value: changed ? String(l.result[f]) : '', reason: '' })}>{t('payroll.rOverride')}</button>}</td>
                    </tr>
                  );
                })}</tbody>
              </table></div>
              {override && override.lineId === l.id && (
                <div className="flex flex-wrap items-end gap-3 text-sm text-slate-300 border-t border-slate-800 pt-2">
                  <span className="font-medium text-slate-100">{t(`payroll.${FIELD_KEY[override.field]}`)}</span>
                  <label className="flex flex-col gap-1">{t('payroll.rOverrideValue')}<input className={input} type="number" step="0.01" min="0" value={override.value} onChange={e => setOverride({ ...override, value: e.target.value })} /></label>
                  <label className="flex flex-col gap-1">{t('payroll.rOverrideReason')}<input className={`${input} w-72`} value={override.reason} onChange={e => setOverride({ ...override, reason: e.target.value })} /></label>
                  <button className={btn} disabled={busy} onClick={() => action({ action: 'override', lineId: override.lineId, field: override.field, value: override.value === '' ? null : Number(override.value), reason: override.reason })}>{t('payroll.rApply')}</button>
                  <button className={btn} onClick={() => setOverride(null)}>{t('payroll.rCancel')}</button>
                </div>
              )}
            </div>
          ))}

          {detail.log.length > 0 && (
            <div className="space-y-1">
              <h3 className="font-semibold text-white text-sm">{t('payroll.rLog')}</h3>
              <div className="overflow-x-auto"><table className="w-full text-xs text-slate-300">
                <thead className="text-left text-slate-400"><tr><th className="py-1 px-2">{t('payroll.rLogAction')}</th><th className="py-1 px-2">{t('payroll.rLineEmployee')}</th><th className="py-1 px-2 text-right">{t('payroll.rComputed')} → {t('payroll.rFinal')}</th><th className="py-1 px-2">{t('payroll.rLogReason')}</th><th className="py-1 px-2">{t('payroll.rLogBy')}</th></tr></thead>
                <tbody>{detail.log.map(row => (
                  <tr key={row.id} className="border-t border-slate-800">
                    <td className="py-1 px-2">{row.action}{row.field ? ` · ${row.field}` : ''}</td><td className="py-1 px-2">{row.employeeName}</td>
                    <td className="py-1 px-2 text-right font-mono">{row.newValue !== null ? `${row.oldValue === null ? '' : money(row.oldValue) + ' → '}${money(row.newValue)}` : ''}</td>
                    <td className="py-1 px-2">{row.reason}</td><td className="py-1 px-2">{row.actorName}</td>
                  </tr>))}</tbody>
              </table></div>
            </div>
          )}
        </section>
      )}

      <Link href="/help/payroll-runs" className="inline-block text-sm text-emerald-400 hover:underline">{t('payroll.rHelpLink')}</Link>
    </div>
  );
}
