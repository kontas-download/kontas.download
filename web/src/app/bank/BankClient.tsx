'use client';

import React, { useState, useMemo } from 'react';
import { BankPaymentsPanel } from '@/components/BankPaymentsPanel';
import { 
  Search, 
  Landmark, 
  Plus, 
  Edit3, 
  Trash2, 
  X, 
  AlertCircle,
  ArrowDownLeft,
  ArrowUpRight,
  Filter,
  RotateCcw
} from 'lucide-react';
import { useI18n } from '@/lib/i18n/client';
import { LOCALES } from '@/lib/i18n/config';
import { getNextDocumentNumber } from '@/lib/numbering';
import { SortableTh, compareValues, TablePagination, SortDirection, usePageSize, downloadCsv } from '@/components/TableSort';

// Splits a translated text on {name} markers and substitutes the given nodes.
function rich(text: string, nodes: Record<string, React.ReactNode>) {
  return text.split(/(\{\w+\})/).map((part, i) => {
    const name = part.match(/^\{(\w+)\}$/)?.[1];
    return name && name in nodes ? <React.Fragment key={i}>{nodes[name]}</React.Fragment> : part;
  });
}

export function BankClient({ initialTransactions, totalCount }: { initialTransactions: any[]; totalCount: number }) {
  const { t: tr, lang } = useI18n(); // `t` is used below for transaction rows
  const [transactions, setTransactions] = useState(initialTransactions);

  // Search & Filter state
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<'ALL' | 'IN' | 'OUT'>('ALL');
  const [bankFilter, setBankFilter] = useState('ALL');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [minSum, setMinSum] = useState('');
  const [maxSum, setMaxSum] = useState('');
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);

  // Sorting state
  const [sortField, setSortField] = useState<string>('date');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');

  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = usePageSize('bank', 50);

  // Modal
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingTx, setEditingTx] = useState<any | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const [formData, setFormData] = useState({
    date: new Date().toISOString().split('T')[0],
    number: '',
    clientName: '',
    clientCode: '',
    sum: 100,
    type: 'IN', // IN or OUT
    accountingBankInternalName: 'Swedbank',
    correspondenceAccountCode: '2710',
    notes: ''
  });

  // Extract distinct banks
  const banksList = useMemo(() => {
    const set = new Set<string>();
    for (const t of transactions) {
      if (t.accountingBankInternalName && t.accountingBankInternalName.trim()) {
        set.add(t.accountingBankInternalName.trim());
      }
    }
    return ['ALL', ...Array.from(set).sort()];
  }, [transactions]);

  const handleSort = (field: string) => {
    if (sortField === field) {
      setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
  };

  const handleResetFilters = () => {
    setSearch('');
    setTypeFilter('ALL');
    setBankFilter('ALL');
    setFromDate('');
    setToDate('');
    setMinSum('');
    setMaxSum('');
    setCurrentPage(1);
  };

  const activeFiltersCount = [
    search.trim() !== '',
    typeFilter !== 'ALL',
    bankFilter !== 'ALL',
    fromDate !== '',
    toDate !== '',
    minSum !== '',
    maxSum !== ''
  ].filter(Boolean).length;

  const filteredAndSorted = useMemo(() => {
    const filtered = transactions.filter((t) => {
      const sumNum = Number(t.sum || 0);
      if (typeFilter === 'IN' && sumNum <= 0) return false;
      if (typeFilter === 'OUT' && sumNum >= 0) return false;
      if (bankFilter !== 'ALL' && t.accountingBankInternalName !== bankFilter) return false;
      if (fromDate && t.date < fromDate) return false;
      if (toDate && t.date > toDate) return false;

      const absSum = Math.abs(sumNum);
      if (minSum && absSum < Number(minSum)) return false;
      if (maxSum && absSum > Number(maxSum)) return false;

      if (!search.trim()) return true;
      const q = search.toLowerCase();
      return (
        (t.clientName && t.clientName.toLowerCase().includes(q)) ||
        (t.notes && t.notes.toLowerCase().includes(q)) ||
        (t.number && t.number.toLowerCase().includes(q)) ||
        (t.clientCode && t.clientCode.toLowerCase().includes(q)) ||
        (t.correspondenceAccountCode && t.correspondenceAccountCode.toLowerCase().includes(q))
      );
    });

    return filtered.sort((a, b) => {
      let valA: any = a[sortField];
      let valB: any = b[sortField];

      if (sortField === 'sum') {
        valA = Number(valA) || 0;
        valB = Number(valB) || 0;
      }

      return compareValues(valA, valB, sortDirection);
    });
  }, [transactions, search, typeFilter, bankFilter, fromDate, toDate, minSum, maxSum, sortField, sortDirection]);

  // Totals
  const totals = useMemo(() => {
    return filteredAndSorted.reduce((acc, t) => {
      const val = Number(t.sum || 0);
      if (val > 0) {
        acc.inflow += val;
      } else {
        acc.outflow += Math.abs(val);
      }
      acc.netFlow += val;
      return acc;
    }, { inflow: 0, outflow: 0, netFlow: 0 });
  }, [filteredAndSorted]);

  const paginatedTransactions = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredAndSorted.slice(start, start + pageSize);
  }, [filteredAndSorted, currentPage, pageSize]);

  const openCreateModal = () => {
    setEditingTx(null);
    setFormData({
      date: new Date().toISOString().split('T')[0],
      number: getNextDocumentNumber(transactions, 'number', { defaultWidth: 6 }),
      clientName: '',
      clientCode: '',
      sum: 100,
      type: 'IN',
      accountingBankInternalName: 'Swedbank',
      correspondenceAccountCode: '2710',
      notes: ''
    });
    setErrorMsg('');
    setIsModalOpen(true);
  };

  const openEditModal = (t: any) => {
    setEditingTx(t);
    const isOut = Number(t.sum) < 0;
    setFormData({
      date: t.date || new Date().toISOString().split('T')[0],
      number: t.number || '',
      clientName: t.clientName || '',
      clientCode: t.clientCode || '',
      sum: Math.abs(Number(t.sum || 0)),
      type: isOut ? 'OUT' : 'IN',
      accountingBankInternalName: t.accountingBankInternalName || 'Swedbank',
      correspondenceAccountCode: t.correspondenceAccountCode || '2710',
      notes: t.notes || ''
    });
    setErrorMsg('');
    setIsModalOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.date || formData.sum === undefined) {
      setErrorMsg(tr('bank.dateAndSumRequired'));
      return;
    }
    setSubmitting(true);
    setErrorMsg('');

    const finalSum = formData.type === 'OUT' ? -Math.abs(Number(formData.sum)) : Math.abs(Number(formData.sum));

    const payload = {
      ...formData,
      sum: finalSum
    };

    try {
      if (editingTx) {
        const res = await fetch(`/api/bank/${editingTx.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || tr('bank.updateFailed'));
        setTransactions(transactions.map(t => t.id === editingTx.id ? { ...t, ...data.transaction } : t));
      } else {
        const res = await fetch('/api/bank', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || tr('bank.createFailed'));
        setTransactions([data.transaction, ...transactions]);
      }

      setIsModalOpen(false);
    } catch (err: any) {
      setErrorMsg(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (t: any) => {
    if (!window.confirm(tr('bank.confirmDelete', { date: t.date, sum: t.sum }))) return;
    try {
      const res = await fetch(`/api/bank/${t.id}`, { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || tr('bank.deleteFailed'));
      setTransactions(transactions.filter(item => item.id !== t.id));
    } catch (err: any) {
      alert(err.message);
    }
  };

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight flex items-center gap-2">
            <Landmark className="w-6 h-6 text-emerald-400" />
            <span>{tr('bank.title')}</span>
          </h1>
          <p className="text-sm text-slate-400 mt-1">
            {rich(tr('bank.totalCount', { count: '{count}' }), { count: <strong className="text-white font-mono">{transactions.length}</strong> })}
          </p>
        </div>
        <button
          onClick={openCreateModal}
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs transition-colors shadow-sm self-start"
        >
          <Plus className="w-4 h-4" />
          <span>{tr('bank.add')}</span>
        </button>
      </div>

      <BankPaymentsPanel />

      {/* Filter Bar */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 space-y-3">
        <div className="flex flex-col md:flex-row items-center justify-between gap-3">
          <div className="relative w-full md:w-80">
            <Search className="w-4 h-4 absolute left-3 top-3 text-slate-400" />
            <input
              type="text"
              placeholder={tr('bank.searchPlaceholder')}
              value={search}
              onChange={(e) => { setSearch(e.target.value); setCurrentPage(1); }}
              className="w-full bg-slate-950 border border-slate-800 rounded-lg pl-9 pr-8 py-2 text-xs text-slate-100 placeholder-slate-400 focus:outline-none focus:border-emerald-500"
            />
            {search && (
              <button 
                onClick={() => setSearch('')}
                className="absolute right-2.5 top-2.5 text-slate-400 hover:text-white"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          <div className="flex items-center gap-2 w-full md:w-auto flex-wrap">
            {/* Type selector */}
            <div className="flex items-center gap-1.5 bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1 text-xs text-slate-300">
              <span className="text-slate-400">{tr('bank.flow')}</span>
              <select
                value={typeFilter}
                onChange={(e) => { setTypeFilter(e.target.value as any); setCurrentPage(1); }}
                className="bg-transparent text-emerald-400 font-bold focus:outline-none cursor-pointer"
              >
                <option value="ALL" className="bg-slate-900 text-slate-200">{tr('bank.allFlows')}</option>
                <option value="IN" className="bg-slate-900 text-slate-200">{tr('bank.flowIn')}</option>
                <option value="OUT" className="bg-slate-900 text-slate-200">{tr('bank.flowOut')}</option>
              </select>
            </div>

            {/* Bank selector */}
            <div className="flex items-center gap-1.5 bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1 text-xs text-slate-300">
              <span className="text-slate-400">{tr('bank.bank')}</span>
              <select
                value={bankFilter}
                onChange={(e) => { setBankFilter(e.target.value); setCurrentPage(1); }}
                className="bg-transparent text-emerald-400 font-bold focus:outline-none cursor-pointer"
              >
                {banksList.map(b => (
                  <option key={b} value={b} className="bg-slate-900 text-slate-200">
                    {b === 'ALL' ? tr('bank.allBanks') : b}
                  </option>
                ))}
              </select>
            </div>

            <button
              onClick={() => setShowAdvancedFilters(!showAdvancedFilters)}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-semibold transition-colors ${
                showAdvancedFilters || activeFiltersCount > 0
                  ? 'bg-emerald-950/40 border-emerald-700 text-emerald-400'
                  : 'bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-700'
              }`}
            >
              <Filter className="w-3.5 h-3.5" />
              <span>{tr('bank.filters')}</span>
              {activeFiltersCount > 0 && (
                <span className="w-4 h-4 rounded-full bg-emerald-500 text-slate-950 text-[10px] font-black flex items-center justify-center">
                  {activeFiltersCount}
                </span>
              )}
            </button>

            {activeFiltersCount > 0 && (
              <button
                onClick={handleResetFilters}
                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs text-rose-400 hover:bg-rose-950/30 transition-colors"
                title={tr('bank.clearFilters')}
              >
                <RotateCcw className="w-3 h-3" />
                <span>{tr('bank.reset')}</span>
              </button>
            )}
          </div>
        </div>

        {/* Advanced Filters */}
        {showAdvancedFilters && (
          <div className="pt-3 border-t border-slate-800/80 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 text-xs">
            <div>
              <label className="block text-slate-400 font-medium mb-1">{tr('bank.dateFrom')}</label>
              <input
                type="date"
                value={fromDate}
                onChange={(e) => { setFromDate(e.target.value); setCurrentPage(1); }}
                className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-emerald-500"
              />
            </div>
            <div>
              <label className="block text-slate-400 font-medium mb-1">{tr('bank.dateTo')}</label>
              <input
                type="date"
                value={toDate}
                onChange={(e) => { setToDate(e.target.value); setCurrentPage(1); }}
                className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-emerald-500"
              />
            </div>
            <div>
              <label className="block text-slate-400 font-medium mb-1">{tr('bank.sumFrom')}</label>
              <input
                type="number"
                placeholder="0.00"
                value={minSum}
                onChange={(e) => { setMinSum(e.target.value); setCurrentPage(1); }}
                className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-slate-200 font-mono focus:outline-none focus:border-emerald-500"
              />
            </div>
            <div>
              <label className="block text-slate-400 font-medium mb-1">{tr('bank.sumTo')}</label>
              <input
                type="number"
                placeholder="99999.00"
                value={maxSum}
                onChange={(e) => { setMaxSum(e.target.value); setCurrentPage(1); }}
                className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-slate-200 font-mono focus:outline-none focus:border-emerald-500"
              />
            </div>
          </div>
        )}

        {/* Live Filter Summary Strip */}
        <div className="flex flex-wrap items-center justify-between text-xs pt-2 border-t border-slate-800/60 text-slate-400">
          <div>
            {rich(tr('bank.found', { count: '{count}', total: transactions.length }), { count: <strong className="text-white font-mono">{filteredAndSorted.length}</strong> })}
          </div>
          <div className="flex items-center gap-4 font-mono">
            <span>{tr('bank.inflow')} <strong className="text-emerald-400">€{totals.inflow.toLocaleString(LOCALES[lang], { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong></span>
            <span>{tr('bank.outflow')} <strong className="text-rose-400">€{totals.outflow.toLocaleString(LOCALES[lang], { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong></span>
            <span>{tr('bank.netFlow')} <strong className={`text-sm font-bold ${totals.netFlow >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
              €{totals.netFlow.toLocaleString(LOCALES[lang], { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </strong></span>
          </div>
        </div>
      </div>

      {/* Transactions Table */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="text-[11px] uppercase bg-slate-950/80 text-slate-400 border-b border-slate-800 tracking-wider">
              <tr>
                <SortableTh field="date" currentField={sortField} currentDirection={sortDirection} onSort={handleSort}>
                  {tr('bank.colDate')}
                </SortableTh>
                <SortableTh field="number" currentField={sortField} currentDirection={sortDirection} onSort={handleSort}>
                  {tr('bank.colDoc')}
                </SortableTh>
                <SortableTh field="clientName" currentField={sortField} currentDirection={sortDirection} onSort={handleSort}>
                  {tr('bank.colPayee')}
                </SortableTh>
                <SortableTh field="sum" currentField={sortField} currentDirection={sortDirection} onSort={handleSort} align="right">
                  {tr('bank.colSum')}
                </SortableTh>
                <SortableTh field="correspondenceAccountCode" currentField={sortField} currentDirection={sortDirection} onSort={handleSort}>
                  {tr('bank.colAccount')}
                </SortableTh>
                <SortableTh field="accountingBankInternalName" currentField={sortField} currentDirection={sortDirection} onSort={handleSort}>
                  {tr('bank.colBank')}
                </SortableTh>
                <SortableTh field="notes" currentField={sortField} currentDirection={sortDirection} onSort={handleSort}>
                  {tr('bank.colPurpose')}
                </SortableTh>
                <th className="py-2.5 px-3 text-center w-20">{tr('bank.colActions')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 font-mono">
              {paginatedTransactions.map((t) => {
                const isPositive = Number(t.sum) >= 0;

                return (
                  <tr key={t.id} className="hover:bg-slate-800/40 transition-colors">
                    <td className="py-2.5 px-3 text-slate-300 font-sans text-xs">{t.date}</td>
                    <td className="py-2.5 px-3 text-slate-300">{t.number || '—'}</td>
                    <td className="py-2.5 px-3 font-semibold text-slate-100 font-sans">
                      <div className="max-w-[200px] truncate" title={t.clientName}>{t.clientName || '—'}</div>
                      {t.clientCode && <div className="text-[10px] text-slate-500 font-mono">{tr('bank.codeLabel', { code: t.clientCode })}</div>}
                    </td>
                    <td className="py-2.5 px-3 text-right font-bold text-sm">
                      <span className={`inline-flex items-center gap-1 ${isPositive ? 'text-emerald-400' : 'text-rose-400'}`}>
                        {isPositive ? <ArrowDownLeft className="w-3.5 h-3.5" /> : <ArrowUpRight className="w-3.5 h-3.5" />}
                        €{Math.abs(Number(t.sum)).toFixed(2)}
                      </span>
                    </td>
                    <td className="py-2.5 px-3 text-slate-400 font-sans">
                      <span className="px-1.5 py-0.5 rounded bg-slate-950 border border-slate-800 font-mono text-[11px] text-emerald-400">
                        {t.correspondenceAccountCode || '2710'}
                      </span>
                    </td>
                    <td className="py-2.5 px-3 font-sans text-slate-300">{t.accountingBankInternalName || '—'}</td>
                    <td className="py-2.5 px-3 font-sans text-slate-400 max-w-[260px] truncate" title={t.notes}>
                      {t.notes || '—'}
                    </td>
                    <td className="py-2.5 px-3 text-center">
                      <div className="flex items-center justify-center gap-1">
                        <button
                          onClick={() => openEditModal(t)}
                          className="p-1 hover:bg-slate-800 rounded text-slate-400 hover:text-emerald-400 transition-colors"
                          title={tr('bank.edit')}
                        >
                          <Edit3 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => handleDelete(t)}
                          className="p-1 hover:bg-slate-800 rounded text-slate-400 hover:text-rose-400 transition-colors"
                          title={tr('bank.delete')}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {paginatedTransactions.length === 0 && (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-slate-400 font-sans">
                    {tr('bank.empty')}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <TablePagination
          currentPage={currentPage}
          pageSize={pageSize}
          totalItems={filteredAndSorted.length}
          onPageChange={setCurrentPage}
          onExport={() => downloadCsv('bankas', [{header:tr('bank.csvDate'),key:'date'},{header:tr('bank.csvNumber'),key:'number'},{header:tr('bank.csvPayee'),key:'clientName'},{header:tr('bank.csvCode'),key:'clientCode'},{header:tr('bank.csvSum'),key:'sum'},{header:tr('bank.csvAccount'),key:'correspondenceAccountCode'},{header:tr('bank.csvBank'),key:'accountingBankInternalName'},{header:tr('bank.csvPurpose'),key:'notes'}], filteredAndSorted)}
          onPageSizeChange={(newSize) => { setPageSize(newSize); setCurrentPage(1); }}
        />
      </div>

      {/* Modal: Create/Edit Bank Transaction */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-lg w-full p-6 shadow-2xl text-slate-100">
            <div className="flex items-center justify-between pb-4 border-b border-slate-800">
              <h3 className="text-lg font-bold text-white flex items-center gap-2">
                <Landmark className="w-5 h-5 text-emerald-400" />
                <span>{editingTx ? tr('bank.modalEdit') : tr('bank.modalNew')}</span>
              </h3>
              <button 
                onClick={() => setIsModalOpen(false)}
                className="p-1 rounded-lg text-slate-400 hover:bg-slate-800"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {errorMsg && (
              <div className="mt-4 p-3 rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{errorMsg}</span>
              </div>
            )}

            <form onSubmit={handleSave} className="mt-4 space-y-4 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-300 font-semibold mb-1">{tr('bank.formType')}</label>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setFormData({ ...formData, type: 'IN' })}
                      className={`py-2 rounded-lg font-bold text-center transition-colors ${
                        formData.type === 'IN' 
                          ? 'bg-emerald-600 text-white' 
                          : 'bg-slate-950 text-slate-400 border border-slate-700'
                      }`}
                    >
                      {tr('bank.typeIn')}
                    </button>
                    <button
                      type="button"
                      onClick={() => setFormData({ ...formData, type: 'OUT' })}
                      className={`py-2 rounded-lg font-bold text-center transition-colors ${
                        formData.type === 'OUT' 
                          ? 'bg-rose-600 text-white' 
                          : 'bg-slate-950 text-slate-400 border border-slate-700'
                      }`}
                    >
                      {tr('bank.typeOut')}
                    </button>
                  </div>
                </div>
                <div>
                  <label className="block text-slate-300 font-semibold mb-1">{tr('bank.formSum')}</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0.01"
                    required
                    value={formData.sum}
                    onChange={(e) => setFormData({ ...formData, sum: parseFloat(e.target.value) || 0 })}
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100 font-mono text-right focus:outline-none focus:border-emerald-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-300 font-semibold mb-1">{tr('bank.formDate')}</label>
                  <input
                    type="date"
                    required
                    value={formData.date}
                    onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-emerald-500"
                  />
                </div>
                <div>
                  <label className="block text-slate-300 font-semibold mb-1">{tr('bank.formDoc')}</label>
                  <input
                    type="text"
                    value={formData.number}
                    onChange={(e) => setFormData({ ...formData, number: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100 font-mono focus:outline-none focus:border-emerald-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-300 font-semibold mb-1">{tr('bank.formPayee')}</label>
                  <input
                    type="text"
                    placeholder="UAB Partneris"
                    value={formData.clientName}
                    onChange={(e) => setFormData({ ...formData, clientName: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-emerald-500"
                  />
                </div>
                <div>
                  <label className="block text-slate-300 font-semibold mb-1">{tr('bank.formCode')}</label>
                  <input
                    type="text"
                    placeholder="301234567"
                    value={formData.clientCode}
                    onChange={(e) => setFormData({ ...formData, clientCode: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100 font-mono focus:outline-none focus:border-emerald-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-300 font-semibold mb-1">{tr('bank.formBank')}</label>
                  <input
                    type="text"
                    value={formData.accountingBankInternalName}
                    onChange={(e) => setFormData({ ...formData, accountingBankInternalName: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-emerald-500"
                  />
                </div>
                <div>
                  <label className="block text-slate-300 font-semibold mb-1">{tr('bank.formAccount')}</label>
                  <input
                    type="text"
                    value={formData.correspondenceAccountCode}
                    onChange={(e) => setFormData({ ...formData, correspondenceAccountCode: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100 font-mono focus:outline-none focus:border-emerald-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-slate-300 font-semibold mb-1">{tr('bank.formPurpose')}</label>
                <textarea
                  rows={2}
                  placeholder={tr('bank.purposePlaceholder')}
                  value={formData.notes}
                  onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-emerald-500 resize-none"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 text-sm font-medium text-slate-300 hover:bg-slate-800 rounded-lg"
                >
                  {tr('bank.cancel')}
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-5 py-2 text-sm font-bold text-white bg-emerald-600 hover:bg-emerald-500 rounded-lg disabled:opacity-50"
                >
                  {submitting ? tr('bank.saving') : (editingTx ? tr('bank.save') : tr('bank.addTx'))}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
