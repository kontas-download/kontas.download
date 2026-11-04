'use client';

import { useEffect, useState } from 'react';
import { X } from '@/components/icons';
import { useI18n } from '@/lib/i18n/client';
import { LOCALES } from '@/lib/i18n/config';

type Employee = { id: number; employeeName: string; employeeCode: string | null; position: string | null; payDate: string | null; grossSalary: number; npd: number | null; gpm: number; sodraEmployee: number; netSalary: number; payOut: number | null; sodraEmployer: number; guaranteeFund: number | null };
type Detail = { employeeName: string; employeeCode: string | null; kind: 'ADDITION' | 'DEDUCTION'; code: string | null; name: string; amount: number; hours: number | null; days: number | null };
type Slip = { payroll: { year: number; month: number }; employees: Employee[]; details: Detail[] };

/** Read-only payroll breakdown: per employee the totals and the additions / deductions by payroll code. */
export function PayrollSlipDialog({ payrollId, onClose }: { payrollId: number; onClose: () => void }) {
  const { t, lang } = useI18n();
  const [slip, setSlip] = useState<Slip | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    fetch(`/api/payrolls/${payrollId}`).then(r => (r.ok ? r.json() : Promise.reject())).then(setSlip).catch(() => setFailed(true));
  }, [payrollId]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const money = (v: number | null | undefined) => v == null ? '–' : '€' + Number(v).toLocaleString(LOCALES[lang], { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const linesOf = (e: Employee, kind: Detail['kind']) => (slip?.details || []).filter(d => d.kind === kind && d.employeeName === e.employeeName && (d.employeeCode ?? null) === (e.employeeCode ?? null));

  const table = (rows: Detail[], title: string) => rows.length > 0 && (
    <div>
      <h4 className="mb-1 text-xs font-semibold uppercase tracking-wider text-slate-400">{title}</h4>
      <table className="w-full text-xs">
        <thead className="text-slate-500"><tr><th className="py-1 pr-2 text-left font-medium">{t('payroll.slipCode')}</th><th className="py-1 pr-2 text-left font-medium">{t('payroll.slipName')}</th><th className="py-1 pr-2 text-right font-medium">{t('payroll.slipHours')}</th><th className="py-1 pr-2 text-right font-medium">{t('payroll.slipDays')}</th><th className="py-1 text-right font-medium">{t('payroll.slipAmount')}</th></tr></thead>
        <tbody className="divide-y divide-slate-800/60">
          {rows.map((d, i) => (
            <tr key={i}><td className="py-1 pr-2 font-mono text-slate-400">{d.code ?? ''}</td><td className="py-1 pr-2 text-slate-200">{d.name}</td><td className="py-1 pr-2 text-right font-mono text-slate-400">{d.hours || ''}</td><td className="py-1 pr-2 text-right font-mono text-slate-400">{d.days || ''}</td><td className="py-1 text-right font-mono text-slate-100">{money(d.amount)}</td></tr>
          ))}
        </tbody>
      </table>
    </div>
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="slip-title" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-3xl w-full p-6 shadow-2xl text-slate-100">
        <div className="flex items-center justify-between pb-4 border-b border-slate-800">
          <h3 id="slip-title" className="text-lg font-bold text-white">{slip ? t('payroll.slipTitle', { year: slip.payroll.year, month: String(slip.payroll.month).padStart(2, '0') }) : t('payroll.slip')}</h3>
          <button type="button" onClick={onClose} aria-label={t('payroll.slipClose')} className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-800 hover:text-white"><X className="w-5 h-5" /></button>
        </div>
        {!slip && <p className="py-6 text-sm text-slate-400">{failed ? t('payroll.rError') : t('payroll.slipLoading')}</p>}
        {slip && slip.employees.length === 0 && <p className="py-6 text-sm text-slate-400">{t('payroll.slipEmpty')}</p>}
        {slip && slip.employees.map(e => (
          <section key={e.id} className="mt-4 space-y-3 rounded-xl border border-slate-800 bg-slate-950/40 p-4">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <div className="font-semibold text-white">{e.employeeName}{e.position && <span className="ml-2 text-xs font-normal text-slate-400">{e.position}</span>}</div>
              {e.payDate && <div className="text-xs text-slate-400">{t('payroll.slipPayDate')}: <span className="font-mono text-slate-200">{e.payDate}</span></div>}
            </div>
            <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs sm:grid-cols-4">
              {([['slipGross', e.grossSalary], ['slipNpd', e.npd], ['slipGpm', e.gpm], ['slipSodra', e.sodraEmployee], ['slipNet', e.netSalary], ['slipPayOut', e.payOut], ['slipEmployer', e.sodraEmployer], ['slipGuarantee', e.guaranteeFund]] as const).map(([key, value]) => (
                <div key={key}><dt className="text-slate-500">{t(`payroll.${key}`)}</dt><dd className="font-mono text-slate-100">{money(value)}</dd></div>
              ))}
            </dl>
            {table(linesOf(e, 'ADDITION'), t('payroll.slipAdditions'))}
            {table(linesOf(e, 'DEDUCTION'), t('payroll.slipDeductions'))}
          </section>
        ))}
        <div className="mt-5 flex justify-end">
          <button type="button" onClick={onClose} className="rounded-lg border border-slate-700 px-4 py-2 text-sm font-semibold text-slate-200 hover:bg-slate-800">{t('payroll.slipClose')}</button>
        </div>
      </div>
    </div>
  );
}
