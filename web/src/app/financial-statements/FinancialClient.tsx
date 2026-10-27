'use client';

import React, { useState, useMemo } from 'react';
import { 
  TrendingUp, 
  Scale, 
  Calendar, 
  Printer, 
  ChevronRight, 
  ChevronDown, 
  CheckCircle2, 
  AlertCircle,
  Building2
} from 'lucide-react';
import { useI18n } from '@/lib/i18n/client';
import { LOCALES } from '@/lib/i18n/config';
import { computePnl, computeBalance, balanceNet } from '@/lib/financial-statements-calc';

interface Entry {
  id: number;
  date: string;
  debitAccount: string;
  creditAccount: string;
  amount: number;
  description: string | null;
}

interface AccountInfo {
  code: string;
  name: string;
}

interface Props {
  companyName: string;
  companyCode: string;
  entries: Entry[];
  accounts: AccountInfo[];
}

export function FinancialClient({ companyName, companyCode, entries, accounts }: Props) {
  const { t, lang } = useI18n();
  const locale = LOCALES[lang];
  const [activeTab, setActiveTab] = useState<'pnl' | 'balance'>('pnl');
  const [selectedYear, setSelectedYear] = useState<string>('ALL');
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({});

  const availableYears = useMemo(() => {
    const years = new Set<string>();
    entries.forEach(e => {
      if (e.date && e.date.length >= 4) {
        years.add(e.date.substring(0, 4));
      }
    });
    return Array.from(years).sort().reverse();
  }, [entries]);

  const toggleSection = (id: string) => {
    setExpandedSections(prev => ({ ...prev, [id]: !prev[id] }));
  };

  const accountMap = useMemo(() => {
    const map = new Map<string, string>();
    accounts.forEach(a => map.set(a.code, a.name));
    return map;
  }, [accounts]);

  // Filter entries for the selected period
  const filteredEntries = useMemo(() => {
    if (selectedYear === 'ALL') return entries;
    return entries.filter(e => e.date && e.date.startsWith(selectedYear));
  }, [entries, selectedYear]);

  // Balance sheet cumulative entries (from inception up to end of selected year)
  const cumulativeEntries = useMemo(() => {
    if (selectedYear === 'ALL') return entries;
    const endOfYear = `${selectedYear}-12-31`;
    return entries.filter(e => e.date && e.date <= endOfYear);
  }, [entries, selectedYear]);

  const nameOf = (code: string) => accountMap.get(code) || t('statements.accountFallback', { code });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const pnlData = useMemo(() => computePnl(filteredEntries, nameOf, selectedYear), [filteredEntries, selectedYear, accountMap, t]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const balanceData = useMemo(() => computeBalance(balanceNet(cumulativeEntries), nameOf), [cumulativeEntries, accountMap, t]);

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight flex items-center gap-2">
            <TrendingUp className="w-6 h-6 text-emerald-400" />
            <span>{t('statements.title')}</span>
          </h1>
          <p className="text-sm text-slate-400 mt-1">
            {t('statements.subtitle')}
          </p>
        </div>

        <button
          onClick={() => window.print()}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-xs font-semibold no-print self-start"
        >
          <Printer className="w-4 h-4 text-emerald-400" />
          <span>{t('statements.print')}</span>
        </button>
      </div>

      {/* Tabs and Year Filter */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 flex flex-col md:flex-row items-center justify-between gap-4 no-print">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setActiveTab('pnl')}
            className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold transition-colors ${
              activeTab === 'pnl'
                ? 'bg-emerald-600 text-white shadow-sm'
                : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
            }`}
          >
            <TrendingUp className="w-4 h-4" />
            <span>{t('statements.tabPnl')}</span>
          </button>
          <button
            onClick={() => setActiveTab('balance')}
            className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold transition-colors ${
              activeTab === 'balance'
                ? 'bg-emerald-600 text-white shadow-sm'
                : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
            }`}
          >
            <Scale className="w-4 h-4" />
            <span>{t('statements.tabBalance')}</span>
          </button>
        </div>

        <div className="flex items-center gap-2 w-full md:w-auto">
          <Calendar className="w-4 h-4 text-slate-400 shrink-0" />
          <span className="text-xs text-slate-400 font-medium">{t('statements.period')}</span>
          <select
            value={selectedYear}
            onChange={(e) => setSelectedYear(e.target.value)}
            className="bg-slate-950 border border-slate-800 text-slate-200 text-xs font-bold rounded-lg px-3 py-2 focus:outline-none focus:border-emerald-500 cursor-pointer"
          >
            <option value="ALL">{t('statements.allYears')}</option>
            {availableYears.map(yr => (
              <option key={yr} value={yr}>{t('statements.yearOption', { year: yr })}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Printable Report Header */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 shadow-sm printable-doc">
        <div className="text-center pb-6 border-b border-slate-800">
          <div className="text-xs uppercase tracking-wider text-slate-400 font-bold">
            {companyName} ({t('statements.companyCode')}: {companyCode || '—'})
          </div>
          <h2 className="text-xl font-bold text-white mt-1">
            {activeTab === 'pnl' ? t('statements.reportPnl') : t('statements.reportBalance')}
          </h2>
          <div className="text-xs text-slate-400 mt-1">
            {selectedYear === 'ALL' ? t('statements.wholePeriod') : t('statements.asOf', { date: `${selectedYear}-12-31` })} {t('statements.inEuros')}
          </div>
        </div>

        {/* ===================== PELNO (NUOSTOLIŲ) ATASKAITA ===================== */}
        {activeTab === 'pnl' && (
          <div className="mt-6 space-y-1">
            {/* Table structure */}
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-slate-700 text-slate-400 text-[11px] uppercase tracking-wider">
                  <th className="py-2.5 px-3 w-12 text-center">{t('statements.colNo')}</th>
                  <th className="py-2.5 px-3">{t('statements.colItems')}</th>
                  <th className="py-2.5 px-3 w-28 text-center no-print">{t('statements.colAccounts')}</th>
                  <th className="py-2.5 px-4 text-right w-40 font-bold">{t('statements.colAmount')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 font-sans">
                {/* I. Pardavimo pajamos */}
                <tr className="hover:bg-slate-800/30 transition-colors font-medium">
                  <td className="py-2 px-3 text-center text-slate-400">I.</td>
                  <td className="py-2 px-3 text-slate-100 flex items-center gap-2">
                    <span>{t('statements.pnlRevenue')}</span>
                    {pnlData.salesRevenue.list.length > 0 && (
                      <button onClick={() => toggleSection('I')} className="no-print text-slate-400 hover:text-white">
                        {expandedSections['I'] ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                      </button>
                    )}
                  </td>
                  <td className="py-2 px-3 text-center font-mono text-[11px] text-slate-400 no-print">5001, 500x</td>
                  <td className="py-2 px-4 text-right font-mono font-bold text-emerald-400">
                    {pnlData.salesRevenue.sum.toLocaleString(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </td>
                </tr>
                {expandedSections['I'] && pnlData.salesRevenue.list.map(item => (
                  <tr key={item.code} className="bg-slate-950/40 text-[11px] text-slate-400 italic">
                    <td></td>
                    <td className="py-1 px-6">{item.code} - {item.name}</td>
                    <td className="py-1 px-3 text-center font-mono no-print">{item.code}</td>
                    <td className="py-1 px-4 text-right font-mono text-slate-300">
                      {item.amount.toLocaleString(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </td>
                  </tr>
                ))}

                {/* II. Pardavimo savikaina */}
                <tr className="hover:bg-slate-800/30 transition-colors font-medium">
                  <td className="py-2 px-3 text-center text-slate-400">II.</td>
                  <td className="py-2 px-3 text-slate-100 flex items-center gap-2">
                    <span>{t('statements.pnlCogs')}</span>
                    {pnlData.cogs.list.length > 0 && (
                      <button onClick={() => toggleSection('II')} className="no-print text-slate-400 hover:text-white">
                        {expandedSections['II'] ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                      </button>
                    )}
                  </td>
                  <td className="py-2 px-3 text-center font-mono text-[11px] text-slate-400 no-print">600x</td>
                  <td className="py-2 px-4 text-right font-mono text-rose-400">
                    ({pnlData.cogs.sum.toLocaleString(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 })})
                  </td>
                </tr>
                {expandedSections['II'] && pnlData.cogs.list.map(item => (
                  <tr key={item.code} className="bg-slate-950/40 text-[11px] text-slate-400 italic">
                    <td></td>
                    <td className="py-1 px-6">{item.code} - {item.name}</td>
                    <td className="py-1 px-3 text-center font-mono no-print">{item.code}</td>
                    <td className="py-1 px-4 text-right font-mono text-slate-300">
                      {item.amount.toLocaleString(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </td>
                  </tr>
                ))}

                {/* III. Bendrasis pelnas */}
                <tr className="bg-slate-800/50 font-bold border-t border-b border-slate-700 text-slate-100">
                  <td className="py-2.5 px-3 text-center text-emerald-400">III.</td>
                  <td className="py-2.5 px-3">{t('statements.pnlGross')}</td>
                  <td className="py-2.5 px-3 text-center text-xs text-slate-400 no-print">—</td>
                  <td className={`py-2.5 px-4 text-right font-mono ${pnlData.grossProfit >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                    {pnlData.grossProfit.toLocaleString(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </td>
                </tr>

                {/* IV. Veiklos sąnaudos */}
                <tr className="hover:bg-slate-800/30 transition-colors font-medium">
                  <td className="py-2 px-3 text-center text-slate-400">IV.</td>
                  <td className="py-2 px-3 text-slate-100 flex items-center gap-2">
                    <span>{t('statements.pnlOpex')}</span>
                    <button onClick={() => toggleSection('IV')} className="no-print text-slate-400 hover:text-white">
                      {expandedSections['IV'] ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                    </button>
                  </td>
                  <td className="py-2 px-3 text-center font-mono text-[11px] text-slate-400 no-print">611x, 630x</td>
                  <td className="py-2 px-4 text-right font-mono text-rose-400">
                    ({pnlData.totalOperatingExpenses.toLocaleString(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 })})
                  </td>
                </tr>
                {expandedSections['IV'] && (
                  <>
                    {/* Admin expenses */}
                    <tr className="bg-slate-950/40 text-[11px] text-slate-300">
                      <td></td>
                      <td className="py-1 px-6 font-semibold">{t('statements.pnlAdmin')}</td>
                      <td className="py-1 px-3 text-center font-mono no-print">611x</td>
                      <td className="py-1 px-4 text-right font-mono text-rose-300">
                        ({pnlData.adminExpenses.sum.toLocaleString(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 })})
                      </td>
                    </tr>
                    {pnlData.adminExpenses.list.map(item => (
                      <tr key={item.code} className="bg-slate-950/70 text-[10px] text-slate-400 italic">
                        <td></td>
                        <td className="py-0.5 px-10">{item.code} - {item.name}</td>
                        <td className="py-0.5 px-3 text-center font-mono no-print">{item.code}</td>
                        <td className="py-0.5 px-4 text-right font-mono text-slate-400">{item.amount.toFixed(2)}</td>
                      </tr>
                    ))}
                    {/* Payroll expenses */}
                    <tr className="bg-slate-950/40 text-[11px] text-slate-300">
                      <td></td>
                      <td className="py-1 px-6 font-semibold">{t('statements.pnlPayroll')}</td>
                      <td className="py-1 px-3 text-center font-mono no-print">6304</td>
                      <td className="py-1 px-4 text-right font-mono text-rose-300">
                        ({pnlData.payrollExpenses.sum.toLocaleString(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 })})
                      </td>
                    </tr>
                  </>
                )}

                {/* V. Tipinės veiklos pelnas */}
                <tr className="bg-slate-800/30 font-semibold border-t border-slate-700/80">
                  <td className="py-2 px-3 text-center text-slate-400">V.</td>
                  <td className="py-2 px-3 text-slate-200">{t('statements.pnlOperating')}</td>
                  <td className="py-2 px-3 text-center text-xs text-slate-400 no-print">—</td>
                  <td className={`py-2 px-4 text-right font-mono font-bold ${pnlData.operatingProfit >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                    {pnlData.operatingProfit.toLocaleString(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </td>
                </tr>

                {/* VI. Finansinė veikla */}
                <tr className="hover:bg-slate-800/30 transition-colors">
                  <td className="py-2 px-3 text-center text-slate-400">VI.</td>
                  <td className="py-2 px-3 text-slate-300">{t('statements.pnlFinancial')}</td>
                  <td className="py-2 px-3 text-center font-mono text-[11px] text-slate-400 no-print">58x - 68x</td>
                  <td className="py-2 px-4 text-right font-mono text-slate-300">
                    {pnlData.finResult.toLocaleString(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </td>
                </tr>

                {/* VII. Pelnas prieš mokesčius */}
                <tr className="bg-slate-800/60 font-bold border-t border-slate-700">
                  <td className="py-2.5 px-3 text-center text-slate-300">VII.</td>
                  <td className="py-2.5 px-3 text-white">{t('statements.pnlBeforeTax')}</td>
                  <td className="py-2.5 px-3 text-center text-xs text-slate-400 no-print">—</td>
                  <td className={`py-2.5 px-4 text-right font-mono ${pnlData.profitBeforeTax >= 0 ? 'text-emerald-300' : 'text-rose-300'}`}>
                    {pnlData.profitBeforeTax.toLocaleString(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </td>
                </tr>

                {/* VIII. Pelno mokestis */}
                <tr className="hover:bg-slate-800/30 transition-colors">
                  <td className="py-2 px-3 text-center text-slate-400">VIII.</td>
                  <td className="py-2 px-3 text-slate-300">
                    {t('statements.pnlTax', { rate: `${+(pnlData.taxRate * 100).toFixed(2)}%` })}
                    <div className="text-[10px] text-amber-400/80 no-print">{t('statements.pnlTaxNote')}</div>
                  </td>
                  <td className="py-2 px-3 text-center font-mono text-[11px] text-slate-400 no-print">651</td>
                  <td className="py-2 px-4 text-right font-mono text-rose-400">
                    ({pnlData.estimatedTax.toLocaleString(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 })})
                  </td>
                </tr>

                {/* IX. GRYNASIS PELNAS */}
                <tr className="bg-emerald-950/40 border-t-2 border-emerald-500 font-extrabold text-sm text-white">
                  <td className="py-3 px-3 text-center text-emerald-400">IX.</td>
                  <td className="py-3 px-3 uppercase tracking-wide text-emerald-300">
                    {t('statements.pnlNet')}
                  </td>
                  <td className="py-3 px-3 text-center text-xs text-emerald-400/80 no-print">{t('statements.result')}</td>
                  <td className={`py-3 px-4 text-right font-mono text-base ${pnlData.netProfit >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                    €{pnlData.netProfit.toLocaleString(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        )}

        {/* ===================== BALANSAS ===================== */}
        {activeTab === 'balance' && (
          <div className="mt-6 space-y-8">
            {/* Balance check alert */}
            <div className={`p-4 rounded-xl border flex items-center justify-between no-print ${
              balanceData.isBalanced 
                ? 'bg-emerald-950/40 border-emerald-800/60 text-emerald-300' 
                : 'bg-rose-950/40 border-rose-800/60 text-rose-300'
            }`}>
              <div className="flex items-center gap-3">
                {balanceData.isBalanced ? (
                  <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
                ) : (
                  <AlertCircle className="w-5 h-5 text-rose-400 shrink-0" />
                )}
                <div>
                  <div className="text-sm font-bold">
                    {balanceData.isBalanced ? t('statements.balanced') : t('statements.unbalanced')}
                  </div>
                  <div className="text-xs opacity-80 mt-0.5 font-mono">
                    {t('statements.assets')}: €{balanceData.totalAssets.toLocaleString(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} • 
                    {t('statements.equityPlusLiabilities')}: €{balanceData.totalEquityAndLiabilities.toLocaleString(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </div>
                </div>
              </div>
            </div>

            {/* TURTAS (ASSETS) */}
            <div>
              <h3 className="text-sm font-bold text-white uppercase tracking-wider mb-2 flex items-center gap-2 border-b border-slate-800 pb-2">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-400"></span>
                <span>{t('statements.assetsHeading')}</span>
              </h3>
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="border-b border-slate-700 text-slate-400 text-[11px] uppercase tracking-wider">
                    <th className="py-2 px-3 w-12 text-center">{t('statements.colNoShort')}</th>
                    <th className="py-2 px-3">{t('statements.colItems')}</th>
                    <th className="py-2 px-3 w-28 text-center no-print">{t('statements.colAccounts')}</th>
                    <th className="py-2 px-4 text-right w-40 font-bold">{t('statements.colAmount')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 font-sans">
                  {/* A. Ilgalaikis turtas */}
                  <tr className="hover:bg-slate-800/30 transition-colors font-semibold">
                    <td className="py-2 px-3 text-center text-slate-400">A.</td>
                    <td className="py-2 px-3 text-slate-100">{t('statements.bsNonCurrent')}</td>
                    <td className="py-2 px-3 text-center font-mono text-[11px] text-slate-400 no-print">{t('statements.classN', { n: 1 })}</td>
                    <td className="py-2 px-4 text-right font-mono font-bold text-slate-200">
                      {balanceData.nonCurrentAssets.sum.toLocaleString(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </td>
                  </tr>

                  {/* B. Trumpalaikis turtas */}
                  <tr className="hover:bg-slate-800/30 transition-colors font-semibold bg-slate-900/60">
                    <td className="py-2 px-3 text-center text-slate-400">B.</td>
                    <td className="py-2 px-3 text-slate-100">{t('statements.bsCurrent')}</td>
                    <td className="py-2 px-3 text-center font-mono text-[11px] text-slate-400 no-print">{t('statements.classN', { n: 2 })}</td>
                    <td className="py-2 px-4 text-right font-mono font-bold text-emerald-400">
                      {balanceData.totalCurrentAssets.toLocaleString(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </td>
                  </tr>

                  {/* B.I Atsargos */}
                  <tr className="text-slate-300">
                    <td></td>
                    <td className="py-1.5 px-6">{t('statements.bsInventory')}</td>
                    <td className="py-1.5 px-3 text-center font-mono text-[11px] text-slate-400 no-print">20, 21</td>
                    <td className="py-1.5 px-4 text-right font-mono">
                      {balanceData.inventory.sum.toLocaleString(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </td>
                  </tr>

                  {/* B.II Gautinos sumos */}
                  <tr className="text-slate-300">
                    <td></td>
                    <td className="py-1.5 px-6">{t('statements.bsReceivables')}</td>
                    <td className="py-1.5 px-3 text-center font-mono text-[11px] text-slate-400 no-print">2410, 2444</td>
                    <td className="py-1.5 px-4 text-right font-mono text-emerald-300">
                      {balanceData.receivables.sum.toLocaleString(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </td>
                  </tr>

                  {/* B.III Pinigai */}
                  <tr className="text-slate-300">
                    <td></td>
                    <td className="py-1.5 px-6 font-medium">{t('statements.bsCash')}</td>
                    <td className="py-1.5 px-3 text-center font-mono text-[11px] text-slate-400 no-print">271x</td>
                    <td className="py-1.5 px-4 text-right font-mono font-bold text-emerald-400">
                      {balanceData.cash.sum.toLocaleString(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </td>
                  </tr>

                  {/* IŠ VISO TURTO */}
                  <tr className="bg-slate-800 border-t-2 border-slate-700 font-extrabold text-white">
                    <td className="py-2.5 px-3 text-center text-emerald-400"></td>
                    <td className="py-2.5 px-3 uppercase tracking-wider">{t('statements.bsTotalAssets')}</td>
                    <td className="py-2.5 px-3 text-center text-xs text-slate-400 no-print">—</td>
                    <td className="py-2.5 px-4 text-right font-mono text-sm text-emerald-400">
                      €{balanceData.totalAssets.toLocaleString(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>

            {/* NUOSAVAS KAPITALAS IR ĮSIPAREIGOJIMAI */}
            <div>
              <h3 className="text-sm font-bold text-white uppercase tracking-wider mb-2 flex items-center gap-2 border-b border-slate-800 pb-2">
                <span className="w-2.5 h-2.5 rounded-full bg-blue-400"></span>
                <span>{t('statements.equityLiabHeading')}</span>
              </h3>
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="border-b border-slate-700 text-slate-400 text-[11px] uppercase tracking-wider">
                    <th className="py-2 px-3 w-12 text-center">{t('statements.colNoShort')}</th>
                    <th className="py-2 px-3">{t('statements.colItems')}</th>
                    <th className="py-2 px-3 w-28 text-center no-print">{t('statements.colAccounts')}</th>
                    <th className="py-2 px-4 text-right w-40 font-bold">{t('statements.colAmount')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 font-sans">
                  {/* C. Nuosavas kapitalas */}
                  <tr className="hover:bg-slate-800/30 transition-colors font-semibold bg-slate-900/60">
                    <td className="py-2 px-3 text-center text-slate-400">C.</td>
                    <td className="py-2 px-3 text-slate-100">{t('statements.bsEquity')}</td>
                    <td className="py-2 px-3 text-center font-mono text-[11px] text-slate-400 no-print">{t('statements.classN', { n: 3 })}</td>
                    <td className="py-2 px-4 text-right font-mono font-bold text-blue-400">
                      {balanceData.totalEquity.toLocaleString(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </td>
                  </tr>

                  <tr className="text-slate-300">
                    <td></td>
                    <td className="py-1.5 px-6">{t('statements.bsCapital')}</td>
                    <td className="py-1.5 px-3 text-center font-mono text-[11px] text-slate-400 no-print">301</td>
                    <td className="py-1.5 px-4 text-right font-mono">
                      {balanceData.paidCapital.sum.toLocaleString(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </td>
                  </tr>

                  <tr className="text-slate-300">
                    <td></td>
                    <td className="py-1.5 px-6">{t('statements.bsReserves')}</td>
                    <td className="py-1.5 px-3 text-center font-mono text-[11px] text-slate-400 no-print">31, 32</td>
                    <td className="py-1.5 px-4 text-right font-mono">
                      {balanceData.reserves.sum.toLocaleString(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </td>
                  </tr>

                  <tr className="text-slate-300">
                    <td></td>
                    <td className="py-1.5 px-6 font-medium">{t('statements.bsRetained')}</td>
                    <td className="py-1.5 px-3 text-center font-mono text-[11px] text-slate-400 no-print">34, 5-6</td>
                    <td className={`py-1.5 px-4 text-right font-mono font-bold ${balanceData.cumulativeNetProfit >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                      {balanceData.cumulativeNetProfit.toLocaleString(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </td>
                  </tr>

                  {/* D. Mokėtinos sumos ir įsipareigojimai */}
                  <tr className="hover:bg-slate-800/30 transition-colors font-semibold bg-slate-900/60">
                    <td className="py-2 px-3 text-center text-slate-400">D.</td>
                    <td className="py-2 px-3 text-slate-100">{t('statements.bsLiabilities')}</td>
                    <td className="py-2 px-3 text-center font-mono text-[11px] text-slate-400 no-print">{t('statements.classN', { n: 4 })}</td>
                    <td className="py-2 px-4 text-right font-mono font-bold text-amber-400">
                      {balanceData.totalLiabilities.toLocaleString(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </td>
                  </tr>

                  <tr className="text-slate-300">
                    <td></td>
                    <td className="py-1.5 px-6">{t('statements.bsPayables')}</td>
                    <td className="py-1.5 px-3 text-center font-mono text-[11px] text-slate-400 no-print">4430</td>
                    <td className="py-1.5 px-4 text-right font-mono text-amber-300">
                      {balanceData.tradePayables.sum.toLocaleString(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </td>
                  </tr>

                  <tr className="text-slate-300">
                    <td></td>
                    <td className="py-1.5 px-6">{t('statements.bsPayroll')}</td>
                    <td className="py-1.5 px-3 text-center font-mono text-[11px] text-slate-400 no-print">448x</td>
                    <td className="py-1.5 px-4 text-right font-mono">
                      {balanceData.payrollLiabilities.sum.toLocaleString(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </td>
                  </tr>

                  <tr className="text-slate-300">
                    <td></td>
                    <td className="py-1.5 px-6">{t('statements.bsTaxes')}</td>
                    <td className="py-1.5 px-3 text-center font-mono text-[11px] text-slate-400 no-print">4492</td>
                    <td className="py-1.5 px-4 text-right font-mono">
                      {balanceData.taxLiabilities.sum.toLocaleString(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </td>
                  </tr>

                  {balanceData.unclassified.list.length > 0 && (
                    <tr className="text-slate-300">
                      <td></td>
                      <td className="py-1.5 px-6">{t('statements.bsUnclassified')}</td>
                      <td className="py-1.5 px-3 text-center font-mono text-[11px] text-slate-400 no-print">{balanceData.unclassified.list.map(i => i.code).join(', ')}</td>
                      <td className="py-1.5 px-4 text-right font-mono">
                        {balanceData.unclassified.sum.toLocaleString(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </td>
                    </tr>
                  )}

                  {/* IŠ VISO NUOSAVO KAPITALO IR ĮSIPAREIGOJIMŲ */}
                  <tr className="bg-slate-800 border-t-2 border-slate-700 font-extrabold text-white">
                    <td className="py-2.5 px-3 text-center text-blue-400"></td>
                    <td className="py-2.5 px-3 uppercase tracking-wider">{t('statements.bsTotalEL')}</td>
                    <td className="py-2.5 px-3 text-center text-xs text-slate-400 no-print">—</td>
                    <td className="py-2.5 px-4 text-right font-mono text-sm text-blue-400">
                      €{balanceData.totalEquityAndLiabilities.toLocaleString(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Official Sign-off Box */}
        <div className="mt-12 pt-8 border-t border-slate-800 grid grid-cols-2 gap-8 text-xs text-slate-300">
          <div>
            <div className="font-semibold text-slate-400">{t('statements.signManager')}</div>
            <div className="mt-8 border-b border-dashed border-slate-700 w-3/4"></div>
            <div className="text-[11px] text-slate-400 mt-1">{t('statements.signHint')}</div>
          </div>
          <div>
            <div className="font-semibold text-slate-400">{t('statements.signAccountant')}</div>
            <div className="mt-8 border-b border-dashed border-slate-700 w-3/4"></div>
            <div className="text-[11px] text-slate-400 mt-1">{t('statements.signHint')}</div>
          </div>
        </div>
      </div>
    </div>
  );
}
