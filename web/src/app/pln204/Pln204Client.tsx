'use client';
import { useState } from 'react';
import { useT } from '@/lib/i18n/client';
import { buildPln204Ffdata } from '@/lib/ffdata';

interface DraftFields {
  f18: number;
  f19: number;
  f20: number;
  f26: number;
  f37: number;
  f40: number;
  f41: number;
  f43: number;
  f45: number;
  f48: number;
  f52: number;
  f52a: number;
  f53a: '1' | '2' | '3';
  f54a: number;
  f55a: number;
  f55: number;
  f59: number;
  f62: number;
  f64: number;
}

interface Draft {
  year: number;
  periodStart: string;
  periodEnd: string;
  employees: number;
  tariffCode: '1' | '2' | '3';
  citRate: number;
  mxfdRate: string;
  accounting: {
    salesRevenue: number;
    otherRevenue: number;
    finIncome: number;
    totalIncome: number;
    totalExpenses: number;
    profitBeforeTax: number;
  };
  fields: DraftFields;
  entryCount: number;
  provisional: boolean;
  notes: string[];
  notFilled: string[];
}

interface Result {
  dueDate: string;
  header: { name: string; code: string; year: number };
  draft: Draft;
  notice: string;
}

function download(name: string, type: string, content: string) {
  const url = URL.createObjectURL(new Blob([content], { type: type + ';charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

const fieldRows: (keyof DraftFields)[] = [
  'f18',
  'f19',
  'f20',
  'f26',
  'f37',
  'f40',
  'f41',
  'f43',
  'f45',
  'f48',
  'f52',
  'f53a',
  'f54a',
  'f55',
  'f62',
  'f64',
];

export function Pln204Client({ today }: { today: string }) {
  const t = useT();
  const [year, setYear] = useState(String(Number(today.slice(0, 4)) - 1));
  const [f20, setF20] = useState('0');
  const [f26, setF26] = useState('0');
  const [f45, setF45] = useState('0');
  const [tariffCode, setTariffCode] = useState<'1' | '2' | '3'>('1');
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function calculate() {
    if (!/^\d{4}$/.test(year)) return;
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const qs = new URLSearchParams({
        year,
        f20: f20 || '0',
        f26: f26 || '0',
        f45: f45 || '0',
        tariffCode,
      });
      const res = await fetch(`/api/tax-reports/pln204?${qs.toString()}`);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || t('tax.pln204.calcFailed'));
        return;
      }
      setResult(data);
    } catch {
      setError(t('tax.pln204.calcFailed'));
    } finally {
      setBusy(false);
    }
  }

  const exportFfdata = () =>
    result &&
    download(
      `PLN204_${year}.ffdata`,
      'application/xml',
      buildPln204Ffdata({
        header: result.header,
        period: { start: result.draft.periodStart, end: result.draft.periodEnd },
        employees: result.draft.employees,
        fields: { ...result.draft.fields, f54a: result.draft.mxfdRate },
        createdOn: today,
      }),
    );

  const exportCsv = () => {
    if (!result) return;
    const f = result.draft.fields;
    const lines = [
      'field;value',
      `4;${result.draft.employees}`,
      `18;${f.f18}`,
      `19;${f.f19}`,
      `20;${f.f20}`,
      `26;${f.f26}`,
      `37;${f.f37}`,
      `40;${f.f40}`,
      `41;${f.f41}`,
      `43;${f.f43}`,
      `45;${f.f45}`,
      `48;${f.f48}`,
      `52;${f.f52}`,
      `53A;${f.f53a}`,
      `54A;${f.f54a}`,
      `55;${f.f55}`,
      `62;${f.f62}`,
      `64;${f.f64}`,
    ];
    download(`PLN204_${year}_juodrastis.csv`, 'text/csv', lines.join('\r\n') + '\r\n');
  };

  const exportJson = () =>
    result &&
    download(
      `PLN204_${year}_juodrastis.json`,
      'application/json',
      JSON.stringify(
        {
          draft: true,
          notice: result.notice,
          header: result.header,
          dueDate: result.dueDate,
          employees: result.draft.employees,
          accounting: result.draft.accounting,
          fields: result.draft.fields,
          provisional: result.draft.provisional,
          notes: result.draft.notes,
          notFilled: result.draft.notFilled,
        },
        null,
        2,
      ),
    );

  return (
    <div className="p-8 max-w-6xl mx-auto space-y-5 text-slate-200">
      <div>
        <h1 className="text-2xl font-bold text-white">{t('tax.pln204.title')}</h1>
        <p className="text-sm text-slate-400 mt-1">{t('tax.pln204.intro')}</p>
      </div>
      <div className="rounded border border-amber-700 bg-amber-950/30 p-3 text-amber-200 text-sm font-semibold">
        {t('tax.pln204.banner')}
      </div>
      <div className="flex flex-wrap items-end gap-3 print:hidden">
        <label className="text-sm">
          {t('tax.pln204.year')}
          <input
            type="number"
            min={2000}
            max={2100}
            value={year}
            onChange={e => setYear(e.target.value)}
            className="block mt-1 w-28 bg-slate-950 border border-slate-700 rounded px-2 py-1.5"
          />
        </label>
        <label className="text-sm">
          {t('tax.pln204.tariffLabel')}
          <select
            value={tariffCode}
            onChange={e => setTariffCode(e.target.value as '1' | '2' | '3')}
            className="block mt-1 bg-slate-950 border border-slate-700 rounded px-2 py-1.5"
          >
            <option value="1">{t('tax.pln204.tariff1')}</option>
            <option value="2">{t('tax.pln204.tariff2')}</option>
            <option value="3">{t('tax.pln204.tariff3')}</option>
          </select>
        </label>
        <label className="text-sm">
          {t('tax.pln204.inputF20')}
          <input
            type="number"
            min={0}
            step={1}
            value={f20}
            onChange={e => setF20(e.target.value)}
            className="block mt-1 w-32 bg-slate-950 border border-slate-700 rounded px-2 py-1.5"
          />
        </label>
        <label className="text-sm">
          {t('tax.pln204.inputF26')}
          <input
            type="number"
            min={0}
            step={1}
            value={f26}
            onChange={e => setF26(e.target.value)}
            className="block mt-1 w-32 bg-slate-950 border border-slate-700 rounded px-2 py-1.5"
          />
        </label>
        <label className="text-sm">
          {t('tax.pln204.inputF45')}
          <input
            type="number"
            min={0}
            step={1}
            value={f45}
            onChange={e => setF45(e.target.value)}
            className="block mt-1 w-32 bg-slate-950 border border-slate-700 rounded px-2 py-1.5"
          />
        </label>
        <button
          onClick={calculate}
          disabled={busy}
          className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-sm font-semibold"
        >
          {busy ? t('tax.fr.calculating') : t('tax.fr.calculate')}
        </button>
        {result && (
          <>
            <button onClick={exportFfdata} className="px-3 py-2 rounded-lg border border-slate-700 text-sm">
              {t('tax.fr564.exportFfdata')}
            </button>
            <button onClick={exportCsv} className="px-3 py-2 rounded-lg border border-slate-700 text-sm">
              {t('tax.fr564.exportCsv')}
            </button>
            <button onClick={exportJson} className="px-3 py-2 rounded-lg border border-slate-700 text-sm">
              {t('tax.fr564.exportJson')}
            </button>
            <button onClick={() => window.print()} className="px-3 py-2 rounded-lg border border-slate-700 text-sm">
              {t('tax.fr564.print')}
            </button>
          </>
        )}
      </div>
      {error && (
        <div className="rounded border border-amber-700 bg-amber-950/30 p-3 text-amber-200 text-sm">
          <strong>{error}</strong>
        </div>
      )}
      {result && (
        <div className="space-y-4 text-sm">
          <div className="rounded-xl border border-slate-800 bg-slate-900 p-4">
            <div className="font-semibold text-white">{t('tax.pln204.header')}</div>
            <p className="mt-1 text-slate-300">
              {t('tax.pln204.headerLine', {
                name: result.header.name,
                code: result.header.code || '—',
                year: result.header.year,
                employees: result.draft.employees,
              })}
            </p>
            <p className="text-slate-400">{t('tax.fr.due', { date: result.dueDate })}</p>
            <p className="text-slate-400 mt-1">
              {t('tax.pln204.accountingSummary', {
                income: result.draft.accounting.totalIncome.toFixed(2),
                expenses: result.draft.accounting.totalExpenses.toFixed(2),
                profit: result.draft.accounting.profitBeforeTax.toFixed(2),
              })}
            </p>
          </div>
          <div className="rounded-xl border border-slate-800 bg-slate-900 p-4">
            <table className="w-full">
              <tbody>
                {fieldRows.map(key => {
                  const val = result.draft.fields[key];
                  const formatted =
                    key === 'f53a' ? String(val) : key === 'f54a' ? `${val} %` : `${val} €`;
                  return (
                    <tr key={key} className="border-t border-slate-800">
                      <td className="py-2 text-slate-300">{t(`tax.pln204.${key}`)}</td>
                      <td className="py-2 text-right font-mono">{formatted}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {!!result.draft.notes.length && (
            <div className="rounded border border-sky-800 bg-sky-950/30 p-3 text-sky-200">
              <strong>{t('tax.fr.notesTitle')}</strong>
              <ul className="list-disc pl-5 mt-1 space-y-1">
                {result.draft.notes.map(i => (
                  <li key={i}>{i}</li>
                ))}
              </ul>
            </div>
          )}
          <div className="rounded border border-slate-700 p-3">
            <strong>{t('tax.fr564.notFilled')}</strong>
            <ul className="list-disc pl-5 mt-1 space-y-1 text-slate-300">
              {result.draft.notFilled.map(i => (
                <li key={i}>{i}</li>
              ))}
            </ul>
          </div>
          <p className="text-xs text-slate-500">{result.notice}</p>
        </div>
      )}
    </div>
  );
}
