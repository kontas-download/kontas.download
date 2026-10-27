'use client';

import React, { useState, useMemo } from 'react';
import { PurchaseXmlImport } from '@/components/PurchaseXmlImport';
import { CreditNoteDialog } from '@/components/CreditNoteDialog';
import { 
  Search, 
  ShoppingCart, 
  Plus, 
  Edit3, 
  Trash2, 
  X, 
  AlertCircle,
  Filter,
  RotateCcw,
  Calendar
} from 'lucide-react';
import { getNextDocumentNumber } from '@/lib/numbering';
import { useI18n } from '@/lib/i18n/client';
import { LOCALES } from '@/lib/i18n/config';
import { SortableTh, compareValues, TablePagination, SortDirection, usePageSize, downloadCsv } from '@/components/TableSort';

export function PurchasesClient({ 
  initialPurchases,
  companyMode,
  accounts,
  itemsByPurchaseId,
  clientsList = []
}: { 
  initialPurchases: any[];
  companyMode: string;
  accounts: { code: string; name: string }[];
  itemsByPurchaseId: Record<number,any[]>;
  clientsList?: any[];
}) {
  const { t, lang } = useI18n();
  const num = (n: number) => n.toLocaleString(LOCALES[lang], { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const [purchases, setPurchases] = useState(initialPurchases);
  const [itemsMap,setItemsMap]=useState(itemsByPurchaseId);
  const [creditPurchase, setCreditPurchase] = useState<any | null>(null);

  // Search & Filter state
  const [search, setSearch] = useState('');
  const [selectedSeries, setSelectedSeries] = useState('ALL');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [minSum, setMinSum] = useState('');
  const [maxSum, setMaxSum] = useState('');
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);

  // Sorting state
  const [sortField, setSortField] = useState<string>('purchaseDate');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');

  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = usePageSize('purchases', 50);

  // Modal state
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingPurchase, setEditingPurchase] = useState<any | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const [formData, setFormData] = useState({
    series: 'SF',
    number: '',
    purchaseDate: new Date().toISOString().split('T')[0],
    clientName: '',
    clientCode: '',
    notes: '',
    deductionPercent: companyMode==='STANDARD_VAT'?100:0,
    debitAccount: '',
    items: [
      { itemName: t('purchases.defaultItem'), itemCode: '', quantity: 1, price: 50, vatRate: 21 }
    ]
  });

  // Extract distinct series
  const seriesList = useMemo(() => {
    const set = new Set<string>();
    for (const p of purchases) {
      if (p.series) set.add(p.series);
    }
    return ['ALL', ...Array.from(set).sort()];
  }, [purchases]);

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
    setSelectedSeries('ALL');
    setFromDate('');
    setToDate('');
    setMinSum('');
    setMaxSum('');
    setCurrentPage(1);
  };

  const activeFiltersCount = [
    search.trim() !== '',
    selectedSeries !== 'ALL',
    fromDate !== '',
    toDate !== '',
    minSum !== '',
    maxSum !== ''
  ].filter(Boolean).length;

  const filteredAndSorted = useMemo(() => {
    const filtered = purchases.filter((p) => {
      if (selectedSeries !== 'ALL' && p.series !== selectedSeries) return false;
      if (fromDate && p.purchaseDate < fromDate) return false;
      if (toDate && p.purchaseDate > toDate) return false;
      if (minSum && Number(p.sumWithVat) < Number(minSum)) return false;
      if (maxSum && Number(p.sumWithVat) > Number(maxSum)) return false;

      if (!search.trim()) return true;
      const q = search.toLowerCase();
      return (
        (p.clientName && p.clientName.toLowerCase().includes(q)) ||
        (p.number && p.number.toLowerCase().includes(q)) ||
        (p.series && p.series.toLowerCase().includes(q)) ||
        (p.clientCode && p.clientCode.toLowerCase().includes(q)) ||
        (p.notes && p.notes.toLowerCase().includes(q))
      );
    });

    return filtered.sort((a, b) => {
      let valA: any = a[sortField];
      let valB: any = b[sortField];

      if (sortField === 'document') {
        valA = `${a.series || ''} ${a.number || ''}`;
        valB = `${b.series || ''} ${b.number || ''}`;
      } else if (sortField === 'sumWithVat' || sortField === 'sumWithoutVat' || sortField === 'vat') {
        valA = Number(valA) || 0;
        valB = Number(valB) || 0;
      }

      return compareValues(valA, valB, sortDirection);
    });
  }, [purchases, search, selectedSeries, fromDate, toDate, minSum, maxSum, sortField, sortDirection]);

  const totals = useMemo(() => {
    return filteredAndSorted.reduce((acc, p) => ({
      withoutVat: acc.withoutVat + (Number(p.sumWithoutVat) || 0),
      vat: acc.vat + (Number(p.vat) || 0),
      withVat: acc.withVat + (Number(p.sumWithVat) || 0),
    }), { withoutVat: 0, vat: 0, withVat: 0 });
  }, [filteredAndSorted]);

  const paginatedPurchases = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredAndSorted.slice(start, start + pageSize);
  }, [filteredAndSorted, currentPage, pageSize]);

  const openCreateModal = () => {
    setEditingPurchase(null);
    setFormData({
      series: 'SF',
      number: getNextDocumentNumber(purchases, 'number', { seriesKey: 'series', series: 'SF', defaultWidth: 5 }),
      purchaseDate: new Date().toISOString().split('T')[0],
      clientName: '',
      clientCode: '',
      notes: '',
      deductionPercent: companyMode==='STANDARD_VAT'?100:0,
    debitAccount: '',
      items: [
        { itemName: t('purchases.defaultItem'), itemCode: '', quantity: 1, price: 50, vatRate: 21 }
      ]
    });
    setErrorMsg('');
    setIsModalOpen(true);
  };

  const openEditModal = (p: any) => {
    setEditingPurchase(p);
    setFormData({
      series: p.series || '',
      number: p.number || '',
      purchaseDate: p.purchaseDate || new Date().toISOString().split('T')[0],
      clientName: p.clientName || '',
      clientCode: p.clientCode || '',
      notes: p.notes || '',
      deductionPercent: p.deductionPercent ?? ((p.buyerVatMode || companyMode)==='STANDARD_VAT'?100:0),
      debitAccount: p.debitAccount || '',
      items: (itemsMap[p.id] || []).map(it=>({...it,vatRate:it.vatRate ?? (it.sumWithoutVat ? Math.round((it.sumWithVat/it.sumWithoutVat-1)*10000)/100 : 0)}))
    });
    setErrorMsg('');
    setIsModalOpen(true);
  };

  const handleAddItemRow = () => {
    setFormData({
      ...formData,
      items: [
        ...formData.items,
        { itemName: '', itemCode: '', quantity: 1, price: 0, vatRate: 21 }
      ]
    });
  };

  const handleRemoveItemRow = (idx: number) => {
    if (formData.items.length <= 1) return;
    setFormData({
      ...formData,
      items: formData.items.filter((_, i) => i !== idx)
    });
  };

  const handleItemChange = (idx: number, field: string, val: any) => {
    const updated = [...formData.items];
    updated[idx] = { ...updated[idx], [field]: val };
    setFormData({ ...formData, items: updated });
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.number.trim()) {
      setErrorMsg(t('purchases.errNumber'));
      return;
    }
    setSubmitting(true);
    setErrorMsg('');

    try {
      if (editingPurchase) {
        const res = await fetch(`/api/purchases/${editingPurchase.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(formData)
        });
        const data = await res.json();
      if(res.ok && data.purchase && data.items)setItemsMap(prev=>({...prev,[data.purchase.id]:data.items}));
        if (!res.ok) throw new Error(data.error || t('purchases.errUpdate'));
        if (data.droppedTaxCodes?.length) window.alert(t('tax.codes.dropped', { list: data.droppedTaxCodes.map((d: { itemName: string; taxCode: string }) => `${d.itemName}: ${d.taxCode}`).join(', ') }));
        setPurchases(purchases.map(p => p.id === editingPurchase.id ? { ...p, ...data.purchase } : p));
      } else {
        const res = await fetch('/api/purchases', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(formData)
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || t('purchases.errCreate'));
        if(data.items)setItemsMap(prev=>({...prev,[data.purchase.id]:data.items}));
        setPurchases([data.purchase, ...purchases]);
      }

      setIsModalOpen(false);
    } catch (err: any) {
      setErrorMsg(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (p: any) => {
    if (!window.confirm(t('purchases.confirmDelete', { doc: `${p.series} ${p.number}` }))) return;
    try {
      const res = await fetch(`/api/purchases/${p.id}`, { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || t('purchases.errDelete'));
      setPurchases(purchases.filter(item => item.id !== p.id));
    } catch (err: any) {
      alert(err.message);
    }
  };

  const formSubtotal = formData.items.reduce((acc, it) => acc + (Number(it.quantity || 1) * Number(it.price || 0)), 0);
  const formVat = formData.items.reduce((acc, it) => acc + (Number(it.quantity || 1) * Number(it.price || 0) * (Number(it.vatRate || 0) / 100)), 0);
  const formTotal = formSubtotal + formVat;

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight flex items-center gap-2">
            <ShoppingCart className="w-6 h-6 text-rose-400" />
            <span>{t('purchases.title')}</span>
          </h1>
          <p className="text-sm text-slate-400 mt-1">
            {t('purchases.totalInSystem', { count: purchases.length })}
          </p>
        </div>
        <button
          onClick={openCreateModal}
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs transition-colors shadow-sm self-start"
        >
          <Plus className="w-4 h-4" />
          <span>{t('purchases.addNew')}</span>
        </button>
      </div>

      <PurchaseXmlImport />

      {/* Filter Bar */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 space-y-3">
        <div className="flex flex-col md:flex-row items-center justify-between gap-3">
          <div className="relative w-full md:w-80">
            <Search className="w-4 h-4 absolute left-3 top-3 text-slate-400" />
            <input
              type="text"
              placeholder={t('purchases.searchPlaceholder')}
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
            <div className="flex items-center gap-1.5 bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1 text-xs text-slate-300">
              <span className="text-slate-400">{t('purchases.series')}:</span>
              <select
                value={selectedSeries}
                onChange={(e) => { setSelectedSeries(e.target.value); setCurrentPage(1); }}
                className="bg-transparent text-emerald-400 font-bold focus:outline-none cursor-pointer"
              >
                {seriesList.map(s => (
                  <option key={s} value={s} className="bg-slate-900 text-slate-200">
                    {s === 'ALL' ? t('purchases.allSeries') : s}
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
              <span>{t('purchases.filters')}</span>
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
                title={t('purchases.clearFilters')}
              >
                <RotateCcw className="w-3 h-3" />
                <span>{t('purchases.reset')}</span>
              </button>
            )}
          </div>
        </div>

        {/* Advanced Filters */}
        {showAdvancedFilters && (
          <div className="pt-3 border-t border-slate-800/80 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 text-xs">
            <div>
              <label className="block text-slate-400 font-medium mb-1">{t('purchases.dateFrom')}</label>
              <input
                type="date"
                value={fromDate}
                onChange={(e) => { setFromDate(e.target.value); setCurrentPage(1); }}
                className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-emerald-500"
              />
            </div>
            <div>
              <label className="block text-slate-400 font-medium mb-1">{t('purchases.dateTo')}</label>
              <input
                type="date"
                value={toDate}
                onChange={(e) => { setToDate(e.target.value); setCurrentPage(1); }}
                className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-emerald-500"
              />
            </div>
            <div>
              <label className="block text-slate-400 font-medium mb-1">{t('purchases.sumFrom')}</label>
              <input
                type="number"
                placeholder="0.00"
                value={minSum}
                onChange={(e) => { setMinSum(e.target.value); setCurrentPage(1); }}
                className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-slate-200 font-mono focus:outline-none focus:border-emerald-500"
              />
            </div>
            <div>
              <label className="block text-slate-400 font-medium mb-1">{t('purchases.sumTo')}</label>
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
            {t('purchases.found', { shown: filteredAndSorted.length, total: purchases.length })}
          </div>
          <div className="flex items-center gap-4 font-mono">
            <span>{t('purchases.exVat')}: <strong className="text-slate-200">€{num(totals.withoutVat)}</strong></span>
            <span>{t('purchases.vat')}: <strong className="text-slate-200">€{num(totals.vat)}</strong></span>
            <span>{t('purchases.incVat')}: <strong className="text-rose-400 text-sm font-bold">€{num(totals.withVat)}</strong></span>
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="text-[11px] uppercase bg-slate-950/80 text-slate-400 border-b border-slate-800 tracking-wider">
              <tr>
                <SortableTh field="document" currentField={sortField} currentDirection={sortDirection} onSort={handleSort}>
                  {t('purchases.document')}
                </SortableTh>
                <SortableTh field="purchaseDate" currentField={sortField} currentDirection={sortDirection} onSort={handleSort}>
                  {t('purchases.date')}
                </SortableTh>
                <SortableTh field="clientName" currentField={sortField} currentDirection={sortDirection} onSort={handleSort}>
                  {t('purchases.supplierPartner')}
                </SortableTh>
                <SortableTh field="sumWithoutVat" currentField={sortField} currentDirection={sortDirection} onSort={handleSort} align="right">
                  {t('purchases.exVatCol')}
                </SortableTh>
                <SortableTh field="vat" currentField={sortField} currentDirection={sortDirection} onSort={handleSort} align="right">
                  {t('purchases.vatCol')}
                </SortableTh>
                <SortableTh field="sumWithVat" currentField={sortField} currentDirection={sortDirection} onSort={handleSort} align="right">
                  {t('purchases.total')}
                </SortableTh>
                <th className="py-2.5 px-3 text-center w-24">{t('purchases.actions')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 font-mono">
              {paginatedPurchases.map((p) => (
                <tr key={p.id} className="hover:bg-slate-800/40 transition-colors">
                  <td className="py-2.5 px-3 font-semibold text-white">
                    <span className="text-slate-400 mr-1">{p.series}</span>
                    <span>{p.number}</span>
                  </td>
                  <td className="py-2.5 px-3 text-slate-300 font-sans text-xs">
                    <div className="flex items-center gap-1.5">
                      <Calendar className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                      <span>{p.purchaseDate}</span>
                    </div>
                  </td>
                  <td className="py-2.5 px-3 text-slate-200 font-sans">
                    <div className="font-semibold text-xs truncate max-w-[240px]" title={p.clientName}>
                      {p.clientName || '—'}
                    </div>
                    {p.clientCode && (
                      <div className="text-[10px] text-slate-400 font-mono">{t('purchases.codeLabel', { code: p.clientCode })}</div>
                    )}
                  </td>
                  <td className="py-2.5 px-3 text-right text-slate-300">
                    €{Number(p.sumWithoutVat || 0).toFixed(2)}
                  </td>
                  <td className="py-2.5 px-3 text-right text-slate-400">
                    €{Number(p.vat || 0).toFixed(2)}
                  </td>
                  <td className="py-2.5 px-3 text-right font-bold text-rose-400 text-sm">
                    €{Number(p.sumWithVat || 0).toFixed(2)}
                  </td>
                  <td className="py-2.5 px-3 text-center">
                    <div className="flex items-center justify-center gap-1">
                      {p.docType !== 'KS' && (
                        <button
                          onClick={() => setCreditPurchase(p)}
                          className="px-1.5 py-0.5 hover:bg-slate-800 rounded text-[10px] font-bold text-amber-400 transition-colors"
                          title={t('purchases.creditTitle')}
                        >
                          KS
                        </button>
                      )}
                      <button
                        onClick={() => openEditModal(p)}
                        className="p-1 hover:bg-slate-800 rounded text-slate-400 hover:text-emerald-400 transition-colors"
                        title={t('purchases.edit')}
                      >
                        <Edit3 className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => handleDelete(p)}
                        className="p-1 hover:bg-slate-800 rounded text-slate-400 hover:text-rose-400 transition-colors"
                        title={t('purchases.delete')}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {paginatedPurchases.length === 0 && (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-slate-400 font-sans">
                    {t('purchases.noneFound')}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        <TablePagination
          currentPage={currentPage}
          pageSize={pageSize}
          totalItems={filteredAndSorted.length}
          onPageChange={setCurrentPage}
          onExport={() => downloadCsv('pirkimai', [{header:t('purchases.series'),key:'series'},{header:t('purchases.csvNumber'),key:'number'},{header:t('purchases.date'),key:'purchaseDate'},{header:t('purchases.supplier'),key:'clientName'},{header:t('purchases.companyCode'),key:'clientCode'},{header:t('purchases.exVatCol'),key:'sumWithoutVat'},{header:t('purchases.vatCol'),key:'vat'},{header:t('purchases.incVatCol'),key:'sumWithVat'}], filteredAndSorted)}
          onPageSizeChange={(newSize) => { setPageSize(newSize); setCurrentPage(1); }}
        />
      </div>

      {/* Modal: Create / Edit Purchase */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-2xl w-full p-6 shadow-2xl text-slate-100 max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between pb-4 border-b border-slate-800">
              <h3 className="text-lg font-bold text-white flex items-center gap-2">
                <ShoppingCart className="w-5 h-5 text-rose-400" />
                <span>{editingPurchase ? t('purchases.editTitle') : t('purchases.newTitle')}</span>
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

            <form onSubmit={handleSave} className="mt-4 space-y-4 overflow-y-auto pr-1 flex-1 text-xs">
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-slate-400 font-semibold mb-1">{t('purchases.series')}</label>
                  <input
                    type="text"
                    value={formData.series}
                    onChange={(e) => setFormData({ ...formData, series: e.target.value.toUpperCase() })}
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100 font-mono uppercase focus:outline-none focus:border-emerald-500"
                  />
                </div>
                <div>
                  <label className="block text-slate-400 font-semibold mb-1">{t('purchases.docNo')}</label>
                  <input
                    type="text"
                    required
                    value={formData.number}
                    onChange={(e) => setFormData({ ...formData, number: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100 font-mono focus:outline-none focus:border-emerald-500"
                  />
                </div>
                <div>
                  <label className="block text-slate-400 font-semibold mb-1">{t('purchases.purchaseDate')}</label>
                  <input
                    type="date"
                    required
                    value={formData.purchaseDate}
                    onChange={(e) => setFormData({ ...formData, purchaseDate: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-emerald-500"
                  />
                </div>
              </div>

              {/* Supplier Info */}
              <div className="border border-slate-800 rounded-xl p-3 bg-slate-950/60 space-y-3">
                <div className="font-semibold text-slate-300">{t('purchases.supplierDetails')}</div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-slate-400 mb-1">{t('purchases.supplierName')}</label>
                    <input
                      type="text"
                      list="purchase-clients-datalist"
                      placeholder={t('purchases.supplierPlaceholder')}
                      value={formData.clientName}
                      onChange={(e) => {
                        const val = e.target.value;
                        const matched = clientsList.find((c: any) => c.name.toLowerCase() === val.toLowerCase());
                        if (matched) {
                          setFormData({ ...formData, clientName: matched.name, clientCode: matched.code || '' });
                        } else {
                          setFormData({ ...formData, clientName: val });
                        }
                      }}
                      className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-slate-100 focus:outline-none focus:border-emerald-500"
                    />
                    <datalist id="purchase-clients-datalist">
                      {clientsList.map((c: any) => (
                        <option key={c.id} value={c.name}>{c.code ? t('purchases.codeLabel', { code: c.code }) : ''}</option>
                      ))}
                    </datalist>
                  </div>
                  <div>
                    <label className="block text-slate-400 mb-1">{t('purchases.companyCode')}</label>
                    <input
                      type="text"
                      placeholder="301234567"
                      value={formData.clientCode}
                      onChange={(e) => setFormData({ ...formData, clientCode: e.target.value })}
                      className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-slate-100 font-mono focus:outline-none focus:border-emerald-500"
                    />
                  </div>
                </div>
              </div>

              {/* Items Section */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-slate-300">{t('purchases.itemsHeading')}</span>
                  <button
                    type="button"
                    onClick={handleAddItemRow}
                    className="inline-flex items-center gap-1 text-xs text-emerald-400 hover:text-emerald-300 font-semibold"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>{t('purchases.addRow')}</span>
                  </button>
                </div>

                <div className="space-y-2">
                  {formData.items.map((it, idx) => {
                    const rowNoVat = (Number(it.quantity) || 1) * (Number(it.price) || 0);
                    const rowWithVat = rowNoVat * (1 + (Number(it.vatRate) || 0) / 100);

                    return (
                      <div key={idx} className="flex items-center gap-2 bg-slate-950 p-2 rounded-lg border border-slate-800">
                        <div className="flex-1">
                          <input
                            type="text"
                            required
                            placeholder={t('purchases.itemPlaceholder')}
                            value={it.itemName}
                            onChange={(e) => handleItemChange(idx, 'itemName', e.target.value)}
                            className="w-full bg-slate-900 border border-slate-700 rounded px-2.5 py-1.5 text-xs text-slate-100 focus:outline-none focus:border-emerald-500"
                          />
                        </div>
                        <div className="w-16">
                          <input
                            type="number"
                            min="0.01"
                            step="any"
                            value={it.quantity}
                            onChange={(e) => handleItemChange(idx, 'quantity', parseFloat(e.target.value) || 0)}
                            className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1.5 text-xs text-slate-100 text-right font-mono focus:outline-none focus:border-emerald-500"
                          />
                        </div>
                        <div className="w-24">
                          <input
                            type="number"
                            min="0"
                            step="0.01"
                            value={it.price}
                            onChange={(e) => handleItemChange(idx, 'price', parseFloat(e.target.value) || 0)}
                            className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1.5 text-xs text-slate-100 text-right font-mono focus:outline-none focus:border-emerald-500"
                          />
                        </div>
                        <div className="w-16">
                          <select
                            value={it.vatRate}
                            onChange={(e) => handleItemChange(idx, 'vatRate', parseInt(e.target.value, 10))}
                            className="w-full bg-slate-900 border border-slate-700 rounded px-1.5 py-1.5 text-xs text-slate-100 focus:outline-none focus:border-emerald-500"
                          >
                            <option value={21}>21%</option>
                            <option value={9}>9%</option>
                            <option value={5}>5%</option>
                            <option value={0}>0%</option>
                          </select>
                        </div>
                        <div className="w-24 text-right font-mono font-semibold text-rose-400 text-xs">
                          €{rowWithVat.toFixed(2)}
                        </div>
                        {formData.items.length > 1 && (
                          <button
                            type="button"
                            onClick={() => handleRemoveItemRow(idx)}
                            className="p-1 hover:text-rose-400 text-slate-500"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>

                <label className="block text-xs text-slate-300">{t('purchases.deductionPercent')}<input type="number" min="0" max="100" step="0.01" value={formData.deductionPercent} disabled={(editingPurchase?.buyerVatMode || companyMode)!=='STANDARD_VAT'} onChange={e=>setFormData({...formData,deductionPercent:Number(e.target.value)})} className="block bg-slate-900 border border-slate-700 rounded p-2"/><span className="text-slate-400">{t('purchases.deductionHint')}</span></label>
                <label className="block text-xs text-slate-300">{t('purchases.debitAccount')}<select value={formData.debitAccount} onChange={e=>setFormData({...formData,debitAccount:e.target.value})} className="block bg-slate-900 border border-slate-700 rounded p-2 max-w-full"><option value="">{t('purchases.defaultAccount')}</option>{accounts.map(a=><option key={a.code} value={a.code}>{a.code} — {a.name}</option>)}</select><span className="text-slate-400">{t('purchases.debitHint')}</span></label>
                {/* Totals */}
                <div className="flex justify-end pt-2 text-right">
                  <div className="bg-slate-950 p-3 rounded-xl border border-slate-800 space-y-1 w-64">
                    <div className="flex justify-between text-slate-400">
                      <span>{t('purchases.exVat')}:</span>
                      <span className="font-mono text-slate-200">€{formSubtotal.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between text-slate-400">
                      <span>{t('purchases.vat')}:</span>
                      <span className="font-mono text-slate-200">€{formVat.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between text-white font-bold text-sm border-t border-slate-800 pt-1">
                      <span>{t('purchases.grandTotal')}</span>
                      <span className="font-mono text-rose-400">€{formTotal.toFixed(2)}</span>
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 text-sm font-medium text-slate-300 hover:bg-slate-800 rounded-lg"
                >
                  {t('purchases.cancel')}
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-5 py-2 text-sm font-bold text-white bg-emerald-600 hover:bg-emerald-500 rounded-lg disabled:opacity-50"
                >
                  {submitting ? t('purchases.saving') : (editingPurchase ? t('purchases.save') : t('purchases.addPurchase'))}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      {creditPurchase && <CreditNoteDialog sale={{ id: creditPurchase.id, series: creditPurchase.series, number: creditPurchase.number, saleDate: creditPurchase.purchaseDate }} items={itemsMap[creditPurchase.id] || []} suggestedNumber="" endpoint="/api/purchases" defaultSeries="" title={t('purchases.creditDialogTitle')} onClose={() => setCreditPurchase(null)} onCreated={(created, createdItems) => { setPurchases([{ ...created, itemCount: createdItems.length }, ...purchases]); setItemsMap({ ...itemsMap, [created.id]: createdItems }); setCreditPurchase(null); }} />}
    </div>
  );
}
