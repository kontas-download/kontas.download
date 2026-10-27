'use client';

import { usePrintMode } from '@/lib/use-print-mode';
import React, { useState, useMemo } from 'react';
import { 
  FileSpreadsheet, 
  Calendar, 
  Search, 
  Printer, 
  ArrowRight,
  CheckCircle2,
  AlertTriangle
} from 'lucide-react';
import { useI18n } from '@/lib/i18n/client';
import { LOCALES } from '@/lib/i18n/config';
import { SortableTh, compareValues, TablePagination, SortDirection, usePageSize } from '@/components/TableSort';

interface AccountBalance {
  code: string;
  name: string;
  classNum: string;
  openingDebit: number;
  openingCredit: number;
  turnoverDebit: number;
  turnoverCredit: number;
  closingDebit: number;
  closingCredit: number;
}

export function TrialBalanceClient({ initialData }: { initialData: AccountBalance[] }) {
  const printing = usePrintMode();
  const { t, lang } = useI18n();
  const [data, setData] = useState<AccountBalance[]>(initialData);
  const [search, setSearch] = useState('');
  const [selectedClass, setSelectedClass] = useState('ALL');
  const [fromDate, setFromDate] = useState('2013-01-01');
  const [toDate, setToDate] = useState(new Date().toISOString().split('T')[0]);
  const [loading, setLoading] = useState(false);

  // Sorting & pagination
  const [sortField, setSortField] = useState<string>('code');
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc');
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = usePageSize('trial-balance', 100);

  const handleSort = (field: string) => {
    if (sortField === field) {
      setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
  };

  const filtered = useMemo(() => {
    return data.filter((item) => {
      const matchClass = selectedClass === 'ALL' || item.classNum === selectedClass;
      if (!matchClass) return false;

      // Only show accounts with activity unless searching
      const hasActivity = item.openingDebit > 0 || item.openingCredit > 0 || 
                          item.turnoverDebit > 0 || item.turnoverCredit > 0 || 
                          item.closingDebit > 0 || item.closingCredit > 0;

      if (!search.trim() && !hasActivity) return false;

      if (!search.trim()) return true;
      const q = search.toLowerCase();
      return item.code.toLowerCase().includes(q) || item.name.toLowerCase().includes(q);
    });
  }, [data, search, selectedClass]);

  const sorted = useMemo(() => {
    return [...filtered].sort((a, b) => compareValues((a as any)[sortField], (b as any)[sortField], sortDirection));
  }, [filtered, sortField, sortDirection]);

  const paginated = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return sorted.slice(start, start + pageSize);
  }, [sorted, currentPage, pageSize]);

  const totals = useMemo(() => {
    return filtered.reduce((acc, it) => ({
      openingDebit: acc.openingDebit + it.openingDebit,
      openingCredit: acc.openingCredit + it.openingCredit,
      turnoverDebit: acc.turnoverDebit + it.turnoverDebit,
      turnoverCredit: acc.turnoverCredit + it.turnoverCredit,
      closingDebit: acc.closingDebit + it.closingDebit,
      closingCredit: acc.closingCredit + it.closingCredit,
    }), {
      openingDebit: 0, openingCredit: 0,
      turnoverDebit: 0, turnoverCredit: 0,
      closingDebit: 0, closingCredit: 0,
    });
  }, [filtered]);

  const isBalanced = Math.abs(totals.turnoverDebit - totals.turnoverCredit) < 0.05;

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-6 printable-doc">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight flex items-center gap-2">
            <FileSpreadsheet className="w-6 h-6 text-emerald-400" />
            <span>{t('trialBalance.title')}</span>
          </h1>
          <p className="text-sm text-slate-400 mt-1">
            {t('trialBalance.subtitle')}
          </p>
        </div>

        <button
          onClick={() => window.print()}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-xs font-semibold no-print self-start"
        >
          <Printer className="w-4 h-4 text-emerald-400" />
          <span>{t('trialBalance.print')}</span>
        </button>
      </div>

      {/* Balance Verification Banner */}
      <div className={`p-4 rounded-xl border flex items-center justify-between gap-4 ${
        isBalanced 
          ? 'bg-emerald-950/40 border-emerald-800/60 text-emerald-300' 
          : 'bg-rose-950/40 border-rose-800/60 text-rose-300'
      }`}>
        <div className="flex items-center gap-3">
          {isBalanced ? (
            <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
          ) : (
            <AlertTriangle className="w-5 h-5 text-rose-400 shrink-0" />
          )}
          <div>
            <div className="text-sm font-bold">
              {isBalanced ? t('trialBalance.balanced') : t('trialBalance.unbalanced')}
            </div>
            <div className="text-xs opacity-80 mt-0.5">
              {t('trialBalance.debitTurnover')}: €{totals.turnoverDebit.toLocaleString(LOCALES[lang], { minimumFractionDigits: 2, maximumFractionDigits: 2 })} • 
              {t('trialBalance.creditTurnover')}: €{totals.turnoverCredit.toLocaleString(LOCALES[lang], { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </div>
          </div>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 flex flex-col md:flex-row items-center justify-between gap-4 no-print">
        <div className="relative w-full md:w-72">
          <Search className="w-4 h-4 absolute left-3 top-3 text-slate-400" />
          <input
            type="text"
            placeholder={t('trialBalance.searchPlaceholder')}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full bg-slate-950 border border-slate-800 rounded-lg pl-9 pr-4 py-2 text-sm text-slate-100 placeholder-slate-400 focus:outline-none focus:border-emerald-500"
          />
        </div>

        <div className="flex items-center gap-1.5 overflow-x-auto w-full md:w-auto pb-1 md:pb-0">
          {[
            { id: 'ALL', label: t('trialBalance.classAll') },
            { id: '1', label: t('trialBalance.class1') },
            { id: '2', label: t('trialBalance.class2') },
            { id: '3', label: t('trialBalance.class3') },
            { id: '4', label: t('trialBalance.class4') },
            { id: '5', label: t('trialBalance.class5') },
            { id: '6', label: t('trialBalance.class6') }
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setSelectedClass(tab.id)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors ${
                selectedClass === tab.id
                  ? 'bg-emerald-600 text-white'
                  : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Trial Balance Table */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-950/80 text-slate-300 border-b border-slate-800">
              <tr>
                <SortableTh field="code" rowSpan={2} currentField={sortField} currentDirection={sortDirection} onSort={handleSort} className="w-20">{t('trialBalance.account')}</SortableTh>
                <SortableTh field="name" rowSpan={2} currentField={sortField} currentDirection={sortDirection} onSort={handleSort}>{t('trialBalance.name')}</SortableTh>
                <th colSpan={2} className="py-2 px-3 text-center border-l border-slate-800 text-slate-400">{t('trialBalance.opening')}</th>
                <th colSpan={2} className="py-2 px-3 text-center border-l border-slate-800 text-emerald-400 font-bold">{t('trialBalance.turnover')}</th>
                <th colSpan={2} className="py-2 px-3 text-center border-l border-slate-800 text-slate-400">{t('trialBalance.closing')}</th>
              </tr>
              <tr className="border-t border-slate-800/80 text-[11px] text-slate-400">
                <SortableTh field="openingDebit" currentField={sortField} currentDirection={sortDirection} onSort={handleSort} align="right" className="border-l border-slate-800">{t('trialBalance.debit')}</SortableTh>
                <SortableTh field="openingCredit" currentField={sortField} currentDirection={sortDirection} onSort={handleSort} align="right">{t('trialBalance.credit')}</SortableTh>
                <SortableTh field="turnoverDebit" currentField={sortField} currentDirection={sortDirection} onSort={handleSort} align="right" className="border-l border-slate-800 font-bold text-slate-300">{t('trialBalance.debit')}</SortableTh>
                <SortableTh field="turnoverCredit" currentField={sortField} currentDirection={sortDirection} onSort={handleSort} align="right" className="font-bold text-slate-300">{t('trialBalance.credit')}</SortableTh>
                <SortableTh field="closingDebit" currentField={sortField} currentDirection={sortDirection} onSort={handleSort} align="right" className="border-l border-slate-800">{t('trialBalance.debit')}</SortableTh>
                <SortableTh field="closingCredit" currentField={sortField} currentDirection={sortDirection} onSort={handleSort} align="right">{t('trialBalance.credit')}</SortableTh>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 font-mono">
              {(printing ? sorted : paginated).map((item) => (
                <tr key={item.code} className="hover:bg-slate-800/40 transition-colors">
                  <td className="py-2 px-3 font-bold text-emerald-400 text-xs">{item.code}</td>
                  <td className="py-2 px-3 font-sans text-slate-200 truncate max-w-[240px]" title={item.name}>
                    {item.name}
                  </td>
                  <td className="py-2 px-3 text-right text-slate-400 border-l border-slate-800/60">
                    {item.openingDebit > 0 ? `€${item.openingDebit.toFixed(2)}` : '—'}
                  </td>
                  <td className="py-2 px-3 text-right text-slate-400">
                    {item.openingCredit > 0 ? `€${item.openingCredit.toFixed(2)}` : '—'}
                  </td>
                  <td className="py-2 px-3 text-right text-slate-100 font-bold border-l border-slate-800/60">
                    {item.turnoverDebit > 0 ? `€${item.turnoverDebit.toFixed(2)}` : '—'}
                  </td>
                  <td className="py-2 px-3 text-right text-slate-100 font-bold">
                    {item.turnoverCredit > 0 ? `€${item.turnoverCredit.toFixed(2)}` : '—'}
                  </td>
                  <td className="py-2 px-3 text-right text-emerald-400 font-bold border-l border-slate-800/60">
                    {item.closingDebit > 0 ? `€${item.closingDebit.toFixed(2)}` : '—'}
                  </td>
                  <td className="py-2 px-3 text-right text-blue-400 font-bold">
                    {item.closingCredit > 0 ? `€${item.closingCredit.toFixed(2)}` : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot className="bg-slate-950 font-mono font-bold text-white border-t-2 border-slate-700">
              <tr>
                <td colSpan={2} className="py-3 px-3 uppercase text-xs">{t('trialBalance.totalLabel')}</td>
                <td className="py-3 px-3 text-right text-slate-300 border-l border-slate-800">
                  €{totals.openingDebit.toFixed(2)}
                </td>
                <td className="py-3 px-3 text-right text-slate-300">
                  €{totals.openingCredit.toFixed(2)}
                </td>
                <td className="py-3 px-3 text-right text-emerald-400 text-sm border-l border-slate-800">
                  €{totals.turnoverDebit.toFixed(2)}
                </td>
                <td className="py-3 px-3 text-right text-emerald-400 text-sm">
                  €{totals.turnoverCredit.toFixed(2)}
                </td>
                <td className="py-3 px-3 text-right text-emerald-400 border-l border-slate-800">
                  €{totals.closingDebit.toFixed(2)}
                </td>
                <td className="py-3 px-3 text-right text-blue-400">
                  €{totals.closingCredit.toFixed(2)}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
        <div className="no-print"><TablePagination
          currentPage={currentPage}
          pageSize={pageSize}
          totalItems={sorted.length}
          onPageChange={setCurrentPage}
          onPageSizeChange={(newSize) => { setPageSize(newSize); setCurrentPage(1); }}
          pageSizeOptions={[50, 100, 200, 500]}
        /></div>
      </div>
    </div>
  );
}
