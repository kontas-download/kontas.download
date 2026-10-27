'use client';

import React, { useState, useMemo } from 'react';
import { 
  BookOpenCheck, 
  Search, 
  Plus, 
  Edit3, 
  Trash2, 
  X, 
  AlertCircle,
  Calendar,
  Filter,
  RotateCcw
} from 'lucide-react';
import { useI18n } from '@/lib/i18n/client';
import { LOCALES } from '@/lib/i18n/config';
import { getNextDocumentNumber } from '@/lib/numbering';
import { SortableTh, compareValues, TablePagination, SortDirection, usePageSize, downloadCsv } from '@/components/TableSort';

export function LedgerClient({ 
  initialEntries, 
  totalCount,
  accountsList 
}: { 
  initialEntries: any[]; 
  totalCount: number;
  accountsList: any[];
}) {
  const { t, lang } = useI18n();
  const [entries, setEntries] = useState(initialEntries);

  // Search & Filter state
  const [search, setSearch] = useState('');
  const [accountFilter, setAccountFilter] = useState('');
  const [sourceFilter, setSourceFilter] = useState('ALL');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [minAmount, setMinAmount] = useState('');
  const [maxAmount, setMaxAmount] = useState('');
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);

  // Sorting state
  const [sortField, setSortField] = useState<string>('date');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');

  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = usePageSize('ledger', 50);

  // Modal
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingEntry, setEditingEntry] = useState<any | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const [formData, setFormData] = useState({
    date: new Date().toISOString().split('T')[0],
    docNumber: '',
    debitAccount: '2410',
    creditAccount: '5001',
    amount: 100,
    clientName: '',
    description: ''
  });

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
    setAccountFilter('');
    setSourceFilter('ALL');
    setFromDate('');
    setToDate('');
    setMinAmount('');
    setMaxAmount('');
    setCurrentPage(1);
  };

  const activeFiltersCount = [
    search.trim() !== '',
    accountFilter !== '',
    sourceFilter !== 'ALL',
    fromDate !== '',
    toDate !== '',
    minAmount !== '',
    maxAmount !== ''
  ].filter(Boolean).length;

  const filteredAndSorted = useMemo(() => {
    const filtered = entries.filter((e) => {
      // Account filter
      if (accountFilter && e.debitAccount !== accountFilter && e.creditAccount !== accountFilter) {
        return false;
      }
      // Source type
      if (sourceFilter !== 'ALL' && e.sourceType !== sourceFilter) return false;
      // Date from / to
      if (fromDate && e.date < fromDate) return false;
      if (toDate && e.date > toDate) return false;
      // Amount range
      if (minAmount && Number(e.amount) < Number(minAmount)) return false;
      if (maxAmount && Number(e.amount) > Number(maxAmount)) return false;

      // Search
      if (!search.trim()) return true;
      const q = search.toLowerCase();
      return (
        (e.docNumber && e.docNumber.toLowerCase().includes(q)) ||
        (e.description && e.description.toLowerCase().includes(q)) ||
        (e.clientName && e.clientName.toLowerCase().includes(q)) ||
        (e.debitAccount && e.debitAccount.toLowerCase().includes(q)) ||
        (e.creditAccount && e.creditAccount.toLowerCase().includes(q))
      );
    });

    return filtered.sort((a, b) => {
      let valA: any = a[sortField];
      let valB: any = b[sortField];

      if (sortField === 'amount') {
        valA = Number(valA) || 0;
        valB = Number(valB) || 0;
      }

      return compareValues(valA, valB, sortDirection);
    });
  }, [entries, search, accountFilter, sourceFilter, fromDate, toDate, minAmount, maxAmount, sortField, sortDirection]);

  const totalSum = useMemo(() => {
    return filteredAndSorted.reduce((acc, e) => acc + (Number(e.amount) || 0), 0);
  }, [filteredAndSorted]);

  const paginatedEntries = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredAndSorted.slice(start, start + pageSize);
  }, [filteredAndSorted, currentPage, pageSize]);

  const openCreateModal = () => {
    setEditingEntry(null);
    setFormData({
      date: new Date().toISOString().split('T')[0],
      docNumber: getNextDocumentNumber(entries, 'docNumber', { prefix: `BŽ-${new Date().getFullYear()}-`, defaultWidth: 4 }),
      debitAccount: '2410',
      creditAccount: '5001',
      amount: 100,
      clientName: '',
      description: t('ledger.defaultDescription')
    });
    setErrorMsg('');
    setIsModalOpen(true);
  };

  const openEditModal = (entry: any) => {
    setEditingEntry(entry);
    setFormData({
      date: entry.date,
      docNumber: entry.docNumber || '',
      debitAccount: entry.debitAccount,
      creditAccount: entry.creditAccount,
      amount: entry.amount,
      clientName: entry.clientName || '',
      description: entry.description || ''
    });
    setErrorMsg('');
    setIsModalOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.date || !formData.debitAccount || !formData.creditAccount || !formData.amount) {
      setErrorMsg(t('ledger.fillRequired'));
      return;
    }
    setSubmitting(true);
    setErrorMsg('');

    try {
      if (editingEntry) {
        const res = await fetch(`/api/ledger/${editingEntry.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(formData)
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || t('ledger.updateFailed'));
        setEntries(entries.map(ent => ent.id === editingEntry.id ? { ...ent, ...data.entry } : ent));
      } else {
        const res = await fetch('/api/ledger', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(formData)
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || t('ledger.createFailed'));
        setEntries([data.entry, ...entries]);
      }

      setIsModalOpen(false);
    } catch (err: any) {
      setErrorMsg(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (entry: any) => {
    if (!window.confirm(t('ledger.confirmDelete', { debit: entry.debitAccount, credit: entry.creditAccount, amount: entry.amount }))) return;
    try {
      const res = await fetch(`/api/ledger/${entry.id}`, { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || t('ledger.deleteFailed'));
      setEntries(entries.filter(e => e.id !== entry.id));
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
            <BookOpenCheck className="w-6 h-6 text-emerald-400" />
            <span>{t('ledger.title')}</span>
          </h1>
          <p className="text-sm text-slate-400 mt-1">
            {t('ledger.subtitle')}
          </p>
        </div>
        <button
          onClick={openCreateModal}
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs transition-colors shadow-sm self-start"
        >
          <Plus className="w-4 h-4" />
          <span>{t('ledger.newEntry')}</span>
        </button>
      </div>

      {/* Filter Bar */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 space-y-3">
        <div className="flex flex-col md:flex-row items-center justify-between gap-3">
          <div className="relative w-full md:w-80">
            <Search className="w-4 h-4 absolute left-3 top-3 text-slate-400" />
            <input
              type="text"
              placeholder={t('ledger.searchPlaceholder')}
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
            {/* Account filter */}
            <div className="flex items-center gap-1.5 bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1 text-xs text-slate-300">
              <span className="text-slate-400">{t('ledger.account')}</span>
              <select
                value={accountFilter}
                onChange={(e) => { setAccountFilter(e.target.value); setCurrentPage(1); }}
                className="bg-transparent text-emerald-400 font-bold focus:outline-none cursor-pointer max-w-[160px] truncate"
              >
                <option value="" className="bg-slate-900 text-slate-200">{t('ledger.allAccounts')}</option>
                {accountsList.map((a: any) => (
                  <option key={a.id} value={a.code} className="bg-slate-900 text-slate-200">
                    {a.code} - {a.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Source type */}
            <div className="flex items-center gap-1.5 bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1 text-xs text-slate-300">
              <span className="text-slate-400">{t('ledger.source')}:</span>
              <select
                value={sourceFilter}
                onChange={(e) => { setSourceFilter(e.target.value); setCurrentPage(1); }}
                className="bg-transparent text-emerald-400 font-bold focus:outline-none cursor-pointer"
              >
                <option value="ALL" className="bg-slate-900 text-slate-200">{t('ledger.allSources')}</option>
                <option value="SALE" className="bg-slate-900 text-slate-200">{t('ledger.srcSale')}</option>
                <option value="PURCHASE" className="bg-slate-900 text-slate-200">{t('ledger.srcPurchase')}</option>
                <option value="BANK" className="bg-slate-900 text-slate-200">{t('ledger.srcBank')}</option>
                <option value="PAYROLL" className="bg-slate-900 text-slate-200">{t('ledger.srcPayroll')}</option>
                <option value="MANUAL" className="bg-slate-900 text-slate-200">{t('ledger.srcManual')}</option>
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
              <span>{t('ledger.filters')}</span>
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
                title={t('ledger.clearFilters')}
              >
                <RotateCcw className="w-3 h-3" />
                <span>{t('ledger.reset')}</span>
              </button>
            )}
          </div>
        </div>

        {/* Advanced Filters */}
        {showAdvancedFilters && (
          <div className="pt-3 border-t border-slate-800/80 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 text-xs">
            <div>
              <label className="block text-slate-400 font-medium mb-1">{t('ledger.dateFrom')}</label>
              <input
                type="date"
                value={fromDate}
                onChange={(e) => { setFromDate(e.target.value); setCurrentPage(1); }}
                className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-emerald-500"
              />
            </div>
            <div>
              <label className="block text-slate-400 font-medium mb-1">{t('ledger.dateTo')}</label>
              <input
                type="date"
                value={toDate}
                onChange={(e) => { setToDate(e.target.value); setCurrentPage(1); }}
                className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-emerald-500"
              />
            </div>
            <div>
              <label className="block text-slate-400 font-medium mb-1">{t('ledger.amountFrom')}</label>
              <input
                type="number"
                placeholder="0.00"
                value={minAmount}
                onChange={(e) => { setMinAmount(e.target.value); setCurrentPage(1); }}
                className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-slate-200 font-mono focus:outline-none focus:border-emerald-500"
              />
            </div>
            <div>
              <label className="block text-slate-400 font-medium mb-1">{t('ledger.amountTo')}</label>
              <input
                type="number"
                placeholder="99999.00"
                value={maxAmount}
                onChange={(e) => { setMaxAmount(e.target.value); setCurrentPage(1); }}
                className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-slate-200 font-mono focus:outline-none focus:border-emerald-500"
              />
            </div>
          </div>
        )}

        {/* Live Filter Summary Strip */}
        <div className="flex flex-wrap items-center justify-between text-xs pt-2 border-t border-slate-800/60 text-slate-400">
          <div>
            {t('ledger.recordsFound')} <strong className="text-white font-mono">{filteredAndSorted.length}</strong> {t('ledger.ofTotal', { total: entries.length })}
          </div>
          <div className="flex items-center gap-4 font-mono">
            <span>{t('ledger.turnoverInSelection')}: <strong className="text-emerald-400 text-sm font-bold">€{totalSum.toLocaleString(LOCALES[lang], { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong></span>
          </div>
        </div>
      </div>

      {/* Ledger Table */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="text-[11px] uppercase bg-slate-950/80 text-slate-400 border-b border-slate-800 tracking-wider">
              <tr>
                <SortableTh field="date" currentField={sortField} currentDirection={sortDirection} onSort={handleSort}>
                  {t('common.date')}
                </SortableTh>
                <SortableTh field="docNumber" currentField={sortField} currentDirection={sortDirection} onSort={handleSort}>
                  {t('ledger.docNo')}
                </SortableTh>
                <SortableTh field="debitAccount" currentField={sortField} currentDirection={sortDirection} onSort={handleSort}>
                  {t('ledger.debit')}
                </SortableTh>
                <SortableTh field="creditAccount" currentField={sortField} currentDirection={sortDirection} onSort={handleSort}>
                  {t('ledger.credit')}
                </SortableTh>
                <SortableTh field="amount" currentField={sortField} currentDirection={sortDirection} onSort={handleSort} align="right">
                  {t('ledger.amountEur')}
                </SortableTh>
                <SortableTh field="clientName" currentField={sortField} currentDirection={sortDirection} onSort={handleSort}>
                  {t('ledger.counterparty')}
                </SortableTh>
                <SortableTh field="description" currentField={sortField} currentDirection={sortDirection} onSort={handleSort}>
                  {t('ledger.description')}
                </SortableTh>
                <SortableTh field="sourceType" currentField={sortField} currentDirection={sortDirection} onSort={handleSort} align="center">
                  {t('ledger.source')}
                </SortableTh>
                <th className="py-2.5 px-3 text-center w-20">{t('common.actions')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 font-mono">
              {paginatedEntries.map((e) => (
                <tr key={e.id} className="hover:bg-slate-800/40 transition-colors">
                  <td className="py-2.5 px-3 text-slate-400 font-sans">{e.date}</td>
                  <td className="py-2.5 px-3 font-semibold text-slate-200">{e.docNumber || '—'}</td>
                  <td className="py-2.5 px-3">
                    <span className="px-2 py-0.5 rounded bg-emerald-950/60 border border-emerald-800/40 text-emerald-400 font-bold">
                      D {e.debitAccount}
                    </span>
                  </td>
                  <td className="py-2.5 px-3">
                    <span className="px-2 py-0.5 rounded bg-blue-950/60 border border-blue-800/40 text-blue-400 font-bold">
                      K {e.creditAccount}
                    </span>
                  </td>
                  <td className="py-2.5 px-3 text-right font-bold text-white text-sm">
                    €{Number(e.amount).toFixed(2)}
                  </td>
                  <td className="py-2.5 px-3 text-slate-300 font-sans max-w-[180px] truncate" title={e.clientName}>
                    {e.clientName || '—'}
                  </td>
                  <td className="py-2.5 px-3 text-slate-400 font-sans max-w-[260px] truncate" title={e.description}>
                    {e.description || '—'}
                  </td>
                  <td className="py-2.5 px-3 text-center font-sans">
                    <span className={`px-2 py-0.5 rounded text-[10px] font-semibold ${
                      e.sourceType === 'SALE' ? 'bg-emerald-500/10 text-emerald-400' :
                      e.sourceType === 'PURCHASE' ? 'bg-rose-500/10 text-rose-400' :
                      e.sourceType === 'BANK' ? 'bg-blue-500/10 text-blue-400' :
                      e.sourceType === 'PAYROLL' ? 'bg-purple-500/10 text-purple-400' :
                      'bg-slate-800 text-slate-300'
                    }`}>
                      {e.sourceType}
                    </span>
                  </td>
                  <td className="py-2.5 px-3 text-center font-sans">
                    <div className="flex items-center justify-center gap-1">
                      <button
                        onClick={() => openEditModal(e)}
                        className="p-1 hover:bg-slate-800 rounded text-slate-400 hover:text-emerald-400"
                        title={t('common.edit')}
                      >
                        <Edit3 className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => handleDelete(e)}
                        className="p-1 hover:bg-slate-800 rounded text-slate-400 hover:text-rose-400"
                        title={t('common.delete')}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {paginatedEntries.length === 0 && (
                <tr>
                  <td colSpan={9} className="py-12 text-center text-slate-400 font-sans">
                    {t('ledger.noResults')}
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
          onExport={() => downloadCsv('dziugioji_knyga', [{header:t('common.date'),key:'date'},{header:t('ledger.docNo'),key:'docNumber'},{header:t('ledger.csvDebit'),key:'debitAccount'},{header:t('ledger.csvCredit'),key:'creditAccount'},{header:t('ledger.csvAmount'),key:'amount'},{header:t('ledger.counterparty'),key:'clientName'},{header:t('ledger.csvDescription'),key:'description'},{header:t('ledger.source'),key:'sourceType'}], filteredAndSorted)}
          onPageSizeChange={(newSize) => { setPageSize(newSize); setCurrentPage(1); }}
        />
      </div>

      {/* Modal: Manual General Entry */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-lg w-full p-6 shadow-2xl text-slate-100">
            <div className="flex items-center justify-between pb-4 border-b border-slate-800">
              <h3 className="text-lg font-bold text-white flex items-center gap-2">
                <BookOpenCheck className="w-5 h-5 text-emerald-400" />
                <span>{editingEntry ? t('ledger.editEntry') : t('ledger.newManualEntry')}</span>
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
                  <label className="block text-slate-300 font-semibold mb-1">{t('ledger.dateRequired')}</label>
                  <input
                    type="date"
                    required
                    value={formData.date}
                    onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-emerald-500"
                  />
                </div>
                <div>
                  <label className="block text-slate-300 font-semibold mb-1">{t('ledger.documentNo')}</label>
                  <input
                    type="text"
                    value={formData.docNumber}
                    onChange={(e) => setFormData({ ...formData, docNumber: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100 font-mono focus:outline-none focus:border-emerald-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 p-3 bg-slate-950/60 rounded-xl border border-slate-800">
                <div>
                  <label className="block text-emerald-400 font-bold mb-1">{t('ledger.debitAccountRequired')}</label>
                  <input
                    type="text"
                    list="debit-accounts-list"
                    required
                    placeholder={t('ledger.placeholderDebit')}
                    value={formData.debitAccount}
                    onChange={(e) => setFormData({ ...formData, debitAccount: e.target.value })}
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100 font-mono font-bold focus:outline-none focus:border-emerald-500"
                  />
                  <datalist id="debit-accounts-list">
                    {accountsList.map((a: any) => (
                      <option key={a.id} value={a.code}>{a.name}</option>
                    ))}
                  </datalist>
                </div>

                <div>
                  <label className="block text-blue-400 font-bold mb-1">{t('ledger.creditAccountRequired')}</label>
                  <input
                    type="text"
                    list="credit-accounts-list"
                    required
                    placeholder={t('ledger.placeholderCredit')}
                    value={formData.creditAccount}
                    onChange={(e) => setFormData({ ...formData, creditAccount: e.target.value })}
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100 font-mono font-bold focus:outline-none focus:border-emerald-500"
                  />
                  <datalist id="credit-accounts-list">
                    {accountsList.map((a: any) => (
                      <option key={a.id} value={a.code}>{a.name}</option>
                    ))}
                  </datalist>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-300 font-semibold mb-1">{t('ledger.amountRequired')}</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0.01"
                    required
                    value={formData.amount}
                    onChange={(e) => setFormData({ ...formData, amount: parseFloat(e.target.value) || 0 })}
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100 font-mono text-right focus:outline-none focus:border-emerald-500"
                  />
                </div>
                <div>
                  <label className="block text-slate-300 font-semibold mb-1">{t('ledger.counterpartyClient')}</label>
                  <input
                    type="text"
                    placeholder={t('ledger.placeholderClient')}
                    value={formData.clientName}
                    onChange={(e) => setFormData({ ...formData, clientName: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-emerald-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-slate-300 font-semibold mb-1">{t('ledger.description')}</label>
                <textarea
                  rows={2}
                  placeholder={t('ledger.placeholderDescription')}
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-emerald-500 resize-none"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 text-sm font-medium text-slate-300 hover:bg-slate-800 rounded-lg"
                >
                  {t('common.cancel')}
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-5 py-2 text-sm font-bold text-white bg-emerald-600 hover:bg-emerald-500 rounded-lg disabled:opacity-50"
                >
                  {submitting ? t('ledger.saving') : (editingEntry ? t('common.save') : t('ledger.register'))}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
