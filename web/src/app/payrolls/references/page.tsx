import Link from 'next/link';
import { ArrowLeft, BookOpen } from '@/components/icons';
import { requirePageAccess } from '@/lib/access';
import { getDb } from '@/lib/db';
import { getActiveCompanyId } from '@/lib/company';
import { getT } from '@/lib/i18n/server';
import { pageTitle } from '@/lib/i18n/page-title';

export async function generateMetadata() { return { title: await pageTitle('payroll.refsLink') }; }
export const dynamic = 'force-dynamic';

type Code = { kind: 'PAY' | 'TIMECARD'; code: string; name: string; printName: string | null; category: string | null };
type Shift = { name: string; weekJson: string };
type Day = { from: string | null; hours: number };

const card = 'rounded-xl border border-slate-800 bg-slate-900 p-5';
const th = 'py-2 pr-3 text-left text-[11px] font-semibold uppercase tracking-wider text-slate-400';
const td = 'py-1.5 pr-3 text-slate-200';

// Personnel reference books (read only): positions, payroll codes, time-card markings and work-schedule shifts.
export default async function PayrollReferencesPage() {
  await requirePageAccess();
  const { t } = await getT();
  const db = getDb();
  const companyId = await getActiveCompanyId();
  const positions = db.prepare('SELECT name FROM HrPosition WHERE companyId=? ORDER BY name').all(companyId) as { name: string }[];
  const codes = db.prepare('SELECT kind, code, name, printName, category FROM PayrollCode WHERE companyId=? ORDER BY kind, sortOrder, CAST(code AS INTEGER), code').all(companyId) as Code[];
  const shifts = db.prepare('SELECT name, weekJson FROM WorkShift WHERE companyId=? ORDER BY name').all(companyId) as Shift[];
  const pay = codes.filter(c => c.kind === 'PAY'), time = codes.filter(c => c.kind === 'TIMECARD');
  const empty = <p className="text-sm text-slate-500">{t('payroll.refsEmpty')}</p>;
  const category = (c: string | null) => c === 'ADDITION' ? t('payroll.refsAddition') : c === 'DEDUCTION' ? t('payroll.refsDeduction') : (c ?? '');
  const week = (json: string) => { try { return (JSON.parse(json) as Day[]).map(d => (d.hours ? `${d.from ?? ''} ${d.hours}h` : '–')).join(' · '); } catch { return ''; } };

  return (
    <div className="p-8 max-w-6xl mx-auto space-y-6">
      <header className="space-y-2">
        <Link href="/payrolls" className="inline-flex items-center gap-1 text-xs text-slate-400 hover:text-emerald-400"><ArrowLeft className="w-3.5 h-3.5" aria-hidden />{t('payroll.title')}</Link>
        <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight text-white"><BookOpen className="w-6 h-6 text-emerald-400" aria-hidden />{t('payroll.refsTitle')}</h1>
        <p className="text-sm text-slate-400">{t('payroll.refsSubtitle')}</p>
      </header>

      <div className="grid gap-6 lg:grid-cols-3">
        <section className={card} aria-labelledby="ref-positions">
          <h2 id="ref-positions" className="mb-3 font-semibold text-white">{t('payroll.refsPositions')} <span className="font-mono text-xs text-slate-500">{positions.length}</span></h2>
          {positions.length ? <ul className="space-y-1 text-sm text-slate-200">{positions.map(p => <li key={p.name}>{p.name}</li>)}</ul> : empty}
        </section>
        <section className={`${card} lg:col-span-2`} aria-labelledby="ref-shifts">
          <h2 id="ref-shifts" className="mb-3 font-semibold text-white">{t('payroll.refsShifts')} <span className="font-mono text-xs text-slate-500">{shifts.length}</span></h2>
          {shifts.length ? (
            <table className="w-full text-sm"><thead><tr><th className={th}>{t('payroll.slipName')}</th><th className={th}>{t('payroll.refsWeek')}</th></tr></thead>
              <tbody className="divide-y divide-slate-800/60">{shifts.map(s => <tr key={s.name}><td className={td}>{s.name}</td><td className={`${td} font-mono text-xs text-slate-400`}>{week(s.weekJson)}</td></tr>)}</tbody></table>
          ) : empty}
        </section>
      </div>

      <section className={card} aria-labelledby="ref-pay">
        <h2 id="ref-pay" className="mb-3 font-semibold text-white">{t('payroll.refsPayCodes')} <span className="font-mono text-xs text-slate-500">{pay.length}</span></h2>
        {pay.length ? (
          <div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr><th className={th}>{t('payroll.slipCode')}</th><th className={th}>{t('payroll.slipName')}</th><th className={th}>{t('payroll.refsPrintName')}</th><th className={th}>{t('payroll.refsCategory')}</th></tr></thead>
            <tbody className="divide-y divide-slate-800/60">{pay.map(c => <tr key={c.code}><td className={`${td} font-mono text-slate-400`}>{c.code}</td><td className={td}>{c.name}</td><td className={`${td} text-slate-400`}>{c.printName ?? ''}</td><td className={`${td} text-slate-400`}>{category(c.category)}</td></tr>)}</tbody></table></div>
        ) : empty}
      </section>

      <section className={card} aria-labelledby="ref-time">
        <h2 id="ref-time" className="mb-3 font-semibold text-white">{t('payroll.refsTimeCodes')} <span className="font-mono text-xs text-slate-500">{time.length}</span></h2>
        {time.length ? (
          <div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr><th className={th}>{t('payroll.slipCode')}</th><th className={th}>{t('payroll.slipName')}</th></tr></thead>
            <tbody className="divide-y divide-slate-800/60">{time.map(c => <tr key={c.code}><td className={`${td} font-mono text-slate-400`}>{c.code}</td><td className={td}>{c.name}</td></tr>)}</tbody></table></div>
        ) : empty}
      </section>
    </div>
  );
}
