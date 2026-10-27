'use client';
import { useT } from '@/lib/i18n/client';
import { vatSummary } from '@/lib/vat-summary';

import React, { useState, useMemo } from 'react';
import { 
  Receipt, 
  Download, 
  Calendar, 
  Search, 
  FileCheck, 
  ArrowUpRight, 
  ArrowDownLeft, 
  Building2,
  AlertCircle,
  FileCode2
} from 'lucide-react';
import { TablePagination, usePageSize } from '@/components/TableSort';

interface InvoiceRow {
  id: number;
  series: string | null;
  number: string | null;
  date: string;
  partnerName: string | null;
  partnerCode: string | null;
  partnerVatCode: string | null;
  net: number;
  vat: number;
  gross: number;
  deductibleVat?:number|null;
}

interface Props {
  companyName: string;
  companyCode: string;
  companyVatCode: string;
  sales: InvoiceRow[];
  purchases: InvoiceRow[];
}

import { Fr0600Panel } from '@/components/Fr0600Panel';
import { TaxCodesPanel } from '@/components/TaxCodesPanel';
export function TaxReportsClient({ companyName, companyCode, companyVatCode, sales, purchases }: Props) {
  const t = useT();
  const currentYear = new Date().getFullYear().toString();
  const [selectedYear, setSelectedYear] = useState<string>(currentYear);
  const [selectedMonth, setSelectedMonth] = useState<string>('ALL');
  const [activeTab, setActiveTab] = useState<'fr0600' | 'sales' | 'purchases'>('fr0600');
  const [search, setSearch] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = usePageSize('tax-reports', 50);

  // Extract available years
  const availableYears = useMemo(() => {
    const years = new Set<string>();
    sales.forEach(s => s.date && years.add(s.date.substring(0, 4)));
    purchases.forEach(p => p.date && years.add(p.date.substring(0, 4)));
    if (!years.has(currentYear)) years.add(currentYear);
    return Array.from(years).sort().reverse();
  }, [sales, purchases, currentYear]);

  // Date range bounds for i.SAF and queries
  const { startDate, endDate } = useMemo(() => {
    if (selectedMonth === 'ALL') {
      return {
        startDate: `${selectedYear}-01-01`,
        endDate: `${selectedYear}-12-31`,
      };
    } else {
      const year = parseInt(selectedYear);
      const month = parseInt(selectedMonth);
      const lastDay = new Date(year, month, 0).getDate();
      return {
        startDate: `${selectedYear}-${selectedMonth}-01`,
        endDate: `${selectedYear}-${selectedMonth}-${String(lastDay).padStart(2, '0')}`,
      };
    }
  }, [selectedYear, selectedMonth]);

  // Filtered invoices
  const filteredSales = useMemo(() => {
    return sales.filter(s => {
      if (!s.date || s.date < startDate || s.date > endDate) return false;
      if (!search.trim()) return true;
      const q = search.toLowerCase();
      const num = `${s.series || ''}${s.number || ''}`.toLowerCase();
      const name = (s.partnerName || '').toLowerCase();
      const code = (s.partnerCode || '').toLowerCase();
      return num.includes(q) || name.includes(q) || code.includes(q);
    });
  }, [sales, startDate, endDate, search]);

  const filteredPurchases = useMemo(() => {
    return purchases.filter(p => {
      if (!p.date || p.date < startDate || p.date > endDate) return false;
      if (!search.trim()) return true;
      const q = search.toLowerCase();
      const num = `${p.series || ''}${p.number || ''}`.toLowerCase();
      const name = (p.partnerName || '').toLowerCase();
      const code = (p.partnerCode || '').toLowerCase();
      return num.includes(q) || name.includes(q) || code.includes(q);
    });
  }, [purchases, startDate, endDate, search]);

  const pagedSales = useMemo(() => filteredSales.slice((currentPage - 1) * pageSize, currentPage * pageSize), [filteredSales, currentPage, pageSize]);
  const pagedPurchases = useMemo(() => filteredPurchases.slice((currentPage - 1) * pageSize, currentPage * pageSize), [filteredPurchases, currentPage, pageSize]);

  const [isafBusy, setIsafBusy] = useState(false);
  const [isafError, setIsafError] = useState<{ message: string; issues: string[] } | null>(null);
  const downloadIsaf = async () => {
    setIsafBusy(true); setIsafError(null);
    try {
      const res = await fetch(`/api/tax-reports/isaf?start=${startDate}&end=${endDate}`);
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setIsafError({ message: data.error || t('tax.rep.isafFailed'), issues: data.issues || [] });
        return;
      }
      const url = URL.createObjectURL(await res.blob());
      const link = document.createElement('a');
      link.href = url; link.download = `iSAF_${startDate}_${endDate}.xml`; link.click();
      URL.revokeObjectURL(url);
    } catch {
      setIsafError({ message: t('tax.rep.isafFailed'), issues: [] });
    } finally { setIsafBusy(false); }
  };
  const summary=useMemo(()=>vatSummary(filteredSales,filteredPurchases),[filteredSales,filteredPurchases]);

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight flex items-center gap-2">
            <Receipt className="w-6 h-6 text-emerald-400" />
            <span>{t('tax.rep.title')}</span>
          </h1>
          <p className="text-sm text-slate-400 mt-1">
            {t('tax.rep.subtitle')}
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button onClick={downloadIsaf} disabled={isafBusy} className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-sm font-semibold">
            {isafBusy ? t('tax.rep.preparing') : t('tax.rep.downloadIsaf')}
          </button>
        </div>
      </div>

      {activeTab === 'fr0600' && <Fr0600Panel key={startDate + endDate} start={startDate} end={endDate} />}
      {activeTab === 'fr0600' && <TaxCodesPanel key={'codes' + startDate + endDate} start={startDate} end={endDate} />}

      {isafError && (
        <div className="rounded-xl border border-amber-700 bg-amber-950/30 p-4 text-amber-200 text-sm">
          <strong>{isafError.message}</strong>
          {isafError.issues.length > 0 && <ul className="list-disc pl-5 mt-2 space-y-1">{isafError.issues.slice(0, 30).map(issue => <li key={issue}>{issue}</li>)}</ul>}
          {isafError.issues.length > 30 && <p className="mt-2">{t('tax.rep.moreIssues', { count: isafError.issues.length - 30 })}</p>}
        </div>
      )}

      {/* Filter Bar */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 flex flex-col md:flex-row items-center justify-between gap-4">
        {/* Tab switchers */}
        <div className="flex items-center gap-2 w-full md:w-auto">
          <button
            onClick={() => { setActiveTab('fr0600'); setCurrentPage(1); }}
            className={`inline-flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-bold transition-colors ${
              activeTab === 'fr0600'
                ? 'bg-emerald-600 text-white'
                : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
            }`}
          >
            <FileCheck className="w-4 h-4" />
            <span>{t('tax.rep.tabVat')}</span>
          </button>
          <button
            onClick={() => { setActiveTab('sales'); setCurrentPage(1); }}
            className={`inline-flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-bold transition-colors ${
              activeTab === 'sales'
                ? 'bg-emerald-600 text-white'
                : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
            }`}
          >
            <ArrowUpRight className="w-4 h-4" />
            <span>{t('tax.rep.tabSales', { count: filteredSales.length })}</span>
          </button>
          <button
            onClick={() => { setActiveTab('purchases'); setCurrentPage(1); }}
            className={`inline-flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-bold transition-colors ${
              activeTab === 'purchases'
                ? 'bg-emerald-600 text-white'
                : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
            }`}
          >
            <ArrowDownLeft className="w-4 h-4" />
            <span>{t('tax.rep.tabPurchases', { count: filteredPurchases.length })}</span>
          </button>
        </div>

        {/* Period selectors */}
        <div className="flex items-center gap-2 w-full md:w-auto justify-end">
          <Calendar className="w-4 h-4 text-slate-400 shrink-0" />
          <select
            value={selectedYear}
            onChange={(e) => { setSelectedYear(e.target.value); setCurrentPage(1); }}
            className="bg-slate-950 border border-slate-800 text-slate-200 text-xs font-bold rounded-lg px-3 py-2 focus:outline-none focus:border-emerald-500 cursor-pointer"
          >
            {availableYears.map(yr => (
              <option key={yr} value={yr}>{t('tax.rep.yearOption', { year: yr })}</option>
            ))}
          </select>
          <select
            value={selectedMonth}
            onChange={(e) => { setSelectedMonth(e.target.value); setCurrentPage(1); }}
            className="bg-slate-950 border border-slate-800 text-slate-200 text-xs font-bold rounded-lg px-3 py-2 focus:outline-none focus:border-emerald-500 cursor-pointer"
          >
            <option value="ALL">{t('tax.rep.allYear')}</option>
            <option value="01">{t('tax.rep.m01')}</option>
            <option value="02">{t('tax.rep.m02')}</option>
            <option value="03">{t('tax.rep.m03')}</option>
            <option value="04">{t('tax.rep.m04')}</option>
            <option value="05">{t('tax.rep.m05')}</option>
            <option value="06">{t('tax.rep.m06')}</option>
            <option value="07">{t('tax.rep.m07')}</option>
            <option value="08">{t('tax.rep.m08')}</option>
            <option value="09">{t('tax.rep.m09')}</option>
            <option value="10">{t('tax.rep.m10')}</option>
            <option value="11">{t('tax.rep.m11')}</option>
            <option value="12">{t('tax.rep.m12')}</option>
          </select>
        </div>
      </div>

      {/* ===================== TAB 1: FR0600 PVM DEKLARACIJA ===================== */}
      {activeTab === 'fr0600' && <div className="space-y-4"><div className="rounded-xl border border-amber-700 bg-amber-950/30 p-5 text-amber-200"><strong>{t('tax.rep.notReturn')}</strong><p className="text-sm mt-2">{t('tax.rep.notReturnText')}</p>{summary.unreviewedPurchases>0&&<p className="mt-2">{t('tax.rep.unreviewed', { count: summary.unreviewedPurchases })}</p>}</div><div className="grid md:grid-cols-2 gap-4">{[[t('tax.rep.salesNet'),summary.salesNet],[t('tax.rep.salesVat'),summary.salesVat],[t('tax.rep.purchaseVat'),summary.purchaseVat],[t('tax.rep.deductibleVat'),summary.deductibleVat]].map(([label,value])=><div key={String(label)} className="rounded-xl border border-slate-800 bg-slate-900 p-5"><div className="text-sm text-slate-400">{label}</div><div className="font-mono text-xl mt-2">€{Number(value).toFixed(2)}</div></div>)}</div></div>}

      {activeTab === 'sales' && (
        <div className="space-y-4">
          <div className="relative w-full sm:w-80">
            <Search className="w-4 h-4 absolute left-3 top-3 text-slate-400" />
            <input
              type="text"
              placeholder={t('tax.rep.searchSales')}
              value={search}
              onChange={(e) => { setSearch(e.target.value); setCurrentPage(1); }}
              className="w-full bg-slate-950 border border-slate-800 rounded-lg pl-9 pr-4 py-2 text-xs text-slate-100 placeholder-slate-400 focus:outline-none focus:border-emerald-500"
            />
          </div>

          <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-950/80 text-slate-400 border-b border-slate-800 text-[11px] uppercase tracking-wider">
                  <tr>
                    <th className="py-2.5 px-3">{t('tax.rep.colDate')}</th>
                    <th className="py-2.5 px-3">{t('tax.rep.colDoc')}</th>
                    <th className="py-2.5 px-3">{t('tax.rep.colCustomer')}</th>
                    <th className="py-2.5 px-3">{t('tax.rep.colCode')}</th>
                    <th className="py-2.5 px-3 text-right">{t('tax.rep.colNet')}</th>
                    <th className="py-2.5 px-3 text-right">{t('tax.rep.colVat')}</th>
                    <th className="py-2.5 px-3 text-right">{t('tax.rep.colGross')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 font-mono">
                  {pagedSales.map(s => (
                    <tr key={s.id} className="hover:bg-slate-800/30 transition-colors">
                      <td className="py-2 px-3 text-slate-300">{s.date}</td>
                      <td className="py-2 px-3 font-bold text-emerald-400 font-sans">
                        {s.series ? `${s.series}-` : ''}{s.number}
                      </td>
                      <td className="py-2 px-3 font-sans text-slate-200 truncate max-w-[200px]" title={s.partnerName || ''}>
                        {s.partnerName || '—'}
                      </td>
                      <td className="py-2 px-3 text-slate-400">
                        {s.partnerCode || '—'} {s.partnerVatCode ? `(${s.partnerVatCode})` : ''}
                      </td>
                      <td className="py-2 px-3 text-right text-slate-300">€{s.net.toFixed(2)}</td>
                      <td className="py-2 px-3 text-right text-emerald-400 font-bold">€{s.vat.toFixed(2)}</td>
                      <td className="py-2 px-3 text-right text-white font-bold">€{s.gross.toFixed(2)}</td>
                    </tr>
                  ))}
                  {filteredSales.length === 0 && (
                    <tr>
                      <td colSpan={7} className="py-8 text-center text-slate-400 font-sans">
                        {t('tax.rep.emptySales')}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            <TablePagination currentPage={currentPage} pageSize={pageSize} totalItems={filteredSales.length} onPageChange={setCurrentPage} onPageSizeChange={(s) => { setPageSize(s); setCurrentPage(1); }} />
          </div>
        </div>
      )}

      {/* ===================== TAB 3: GAUTOS SF ===================== */}
      {activeTab === 'purchases' && (
        <div className="space-y-4">
          <div className="relative w-full sm:w-80">
            <Search className="w-4 h-4 absolute left-3 top-3 text-slate-400" />
            <input
              type="text"
              placeholder={t('tax.rep.searchPurchases')}
              value={search}
              onChange={(e) => { setSearch(e.target.value); setCurrentPage(1); }}
              className="w-full bg-slate-950 border border-slate-800 rounded-lg pl-9 pr-4 py-2 text-xs text-slate-100 placeholder-slate-400 focus:outline-none focus:border-emerald-500"
            />
          </div>

          <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-950/80 text-slate-400 border-b border-slate-800 text-[11px] uppercase tracking-wider">
                  <tr>
                    <th className="py-2.5 px-3">{t('tax.rep.colDate')}</th>
                    <th className="py-2.5 px-3">{t('tax.rep.colDoc')}</th>
                    <th className="py-2.5 px-3">{t('tax.rep.colSupplier')}</th>
                    <th className="py-2.5 px-3">{t('tax.rep.colCode')}</th>
                    <th className="py-2.5 px-3 text-right">{t('tax.rep.colNet')}</th>
                    <th className="py-2.5 px-3 text-right">{t('tax.rep.colVat')}</th>
                    <th className="py-2.5 px-3 text-right">{t('tax.rep.colGross')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 font-mono">
                  {pagedPurchases.map(p => (
                    <tr key={p.id} className="hover:bg-slate-800/30 transition-colors">
                      <td className="py-2 px-3 text-slate-300">{p.date}</td>
                      <td className="py-2 px-3 font-bold text-amber-400 font-sans">
                        {p.series ? `${p.series}-` : ''}{p.number}
                      </td>
                      <td className="py-2 px-3 font-sans text-slate-200 truncate max-w-[200px]" title={p.partnerName || ''}>
                        {p.partnerName || '—'}
                      </td>
                      <td className="py-2 px-3 text-slate-400">
                        {p.partnerCode || '—'} {p.partnerVatCode ? `(${p.partnerVatCode})` : ''}
                      </td>
                      <td className="py-2 px-3 text-right text-slate-300">€{p.net.toFixed(2)}</td>
                      <td className="py-2 px-3 text-right text-blue-400 font-bold">€{p.vat.toFixed(2)}</td>
                      <td className="py-2 px-3 text-right text-white font-bold">€{p.gross.toFixed(2)}</td>
                    </tr>
                  ))}
                  {filteredPurchases.length === 0 && (
                    <tr>
                      <td colSpan={7} className="py-8 text-center text-slate-400 font-sans">
                        {t('tax.rep.emptyPurchases')}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            <TablePagination currentPage={currentPage} pageSize={pageSize} totalItems={filteredPurchases.length} onPageChange={setCurrentPage} onPageSizeChange={(s) => { setPageSize(s); setCurrentPage(1); }} />
          </div>
        </div>
      )}
    </div>
  );
}
