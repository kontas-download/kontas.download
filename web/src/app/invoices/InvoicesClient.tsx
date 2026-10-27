'use client';

import React, { useState, useMemo, useEffect } from 'react';
import { 
  Search, 
  Printer, 
  ChevronDown, 
  ChevronRight, 
  Receipt,
  Building2,
  Calendar,
  Plus,
  Edit3,
  Trash2,
  X,
  AlertCircle,
  Filter,
  RotateCcw
} from 'lucide-react';
import { InvoiceDeliveryDialog } from '@/components/InvoiceDeliveryDialog';
import { CreditNoteDialog } from '@/components/CreditNoteDialog';
import { useI18n } from '@/lib/i18n/client';
import { LOCALES } from '@/lib/i18n/config';
import { SortableTh, compareValues, TablePagination, SortDirection, usePageSize, downloadCsv } from '@/components/TableSort';

interface InvoiceItem {
  id?: number;
  itemName: string;
  itemCode?: string;
  quantity: number;
  price: number;
  vatRate: number;
  priceWithVat?: number;
  sumWithoutVat?: number;
  sumWithVat?: number;
  warehouseName?: string;
}

export function InvoicesClient({ 
  initialSales, 
  itemsBySaleId,
  company,
  clientsList = []
}: { 
  initialSales: any[];
  itemsBySaleId: Record<number, any[]>;
  company?: any;
  clientsList?: any[];
}) {
  const { t, lang } = useI18n();
  const statusLabel = (name: string) => name === 'Apmokėta' ? t('invoices.statusPaid') : name === 'Neapmokėta' ? t('invoices.statusUnpaid') : name;
  const companyChargesVat = (company?.effectiveTaxMode ?? company?.taxMode ?? (company?.isVatPayer ? 'STANDARD_VAT' : 'NON_VAT')) === 'STANDARD_VAT';
  // Form suggestion, not a legal parameter: the rate is chosen per line and stored on the document; i.SAF and FR0600 classify a stored rate through the rules registry (lib/rules).
  const defaultVatRate = companyChargesVat ? 21 : 0;
  const [sales, setSales] = useState<any[]>(initialSales);
  const [itemsMap, setItemsMap] = useState<Record<number, any[]>>(itemsBySaleId);

  // Search & Filter state
  const [search, setSearch] = useState('');
  const [selectedSeries, setSelectedSeries] = useState('ALL');
  const [selectedStatus, setSelectedStatus] = useState('ALL');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [minSum, setMinSum] = useState('');
  const [maxSum, setMaxSum] = useState('');
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);

  // Sorting state
  const [sortField, setSortField] = useState<string>('saleDate');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');

  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = usePageSize('invoices', 50);

  // Expanded & print state
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [printModalSale, setPrintModalSale] = useState<any | null>(null);

  const [creditSale, setCreditSale] = useState<any | null>(null);
  const nextCreditNumber = () => {
    const used = sales.filter(s => s.docType === 'KS').map(s => parseInt(String(s.number).replace(/\D/g, ''), 10)).filter(n => !isNaN(n));
    return String((used.length ? Math.max(...used) : 0) + 1).padStart(6, '0');
  };
  const [emailClientId, setEmailClientId] = useState<number | null>(null);
  const [emailInvoice, setEmailInvoice] = useState<any | null>(null);
  // eslint-disable-next-line react-hooks/set-state-in-effect -- read the URL after hydration
  useEffect(() => { const id = Number(new URLSearchParams(window.location.search).get('emailClientId')); if(id > 0) setEmailClientId(id); }, []);
  const clientForSale = (sale: any) => clientsList.find(c => c.id === sale.clientId || (sale.clientCode && c.code === sale.clientCode));
  // Form modal state
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingSale, setEditingSale] = useState<any | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const [formData, setFormData] = useState({
    series: 'PARD',
    number: '',
    saleDate: new Date().toISOString().split('T')[0],
    payUntil: new Date(new Date().getTime() + 14 * 86400000).toISOString().split('T')[0],
    statusName: 'Apmokėta',
    warehouseName: 'Pagrindinis',
    clientId: null as number | null,
    clientName: '',
    clientCode: '',
    clientVatCode: '',
    notes: '',
    items: [
      { itemName: 'Paslauga', itemCode: '', quantity: 1, price: 100, vatRate: defaultVatRate }
    ] as InvoiceItem[]
  });

  const datedMode=company?.taxPeriods?.filter((p:{effectiveFrom:string})=>p.effectiveFrom<=formData.saleDate).at(-1)?.mode;
  const formIsVatPayer = editingSale ? (editingSale.sellerVatMode ? editingSale.sellerVatMode === 'STANDARD_VAT' : Boolean(editingSale.sellerIsVatPayer)) : datedMode ? datedMode==='STANDARD_VAT' : companyChargesVat;

  // Extract distinct series
  const seriesList = useMemo(() => {
    const set = new Set<string>();
    for (const s of sales) {
      if (s.series) set.add(s.series);
    }
    return ['ALL', ...Array.from(set).sort()];
  }, [sales]);

  // Extract distinct statuses
  const statusList = useMemo(() => {
    const set = new Set<string>();
    for (const s of sales) {
      if (s.statusName) set.add(s.statusName);
    }
    return ['ALL', ...Array.from(set).sort()];
  }, [sales]);

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
    setSelectedStatus('ALL');
    setFromDate('');
    setToDate('');
    setMinSum('');
    setMaxSum('');
    setCurrentPage(1);
  };

  const activeFiltersCount = [
    search.trim() !== '',
    selectedSeries !== 'ALL',
    selectedStatus !== 'ALL',
    fromDate !== '',
    toDate !== '',
    minSum !== '',
    maxSum !== ''
  ].filter(Boolean).length;

  // Filtered and sorted sales
  const filteredAndSortedSales = useMemo(() => {
    const filtered = sales.filter((s) => {
      // Series
      if (selectedSeries !== 'ALL' && s.series !== selectedSeries) return false;
      // Status
      if (selectedStatus !== 'ALL' && s.statusName !== selectedStatus) return false;
      // Date from
      if (fromDate && s.saleDate < fromDate) return false;
      // Date to
      if (toDate && s.saleDate > toDate) return false;
      // Min sum
      if (minSum && Number(s.sumWithVat) < Number(minSum)) return false;
      // Max sum
      if (maxSum && Number(s.sumWithVat) > Number(maxSum)) return false;

      // Text search
      if (!search.trim()) return true;
      const q = search.toLowerCase();
      return (
        (s.number && s.number.toLowerCase().includes(q)) ||
        (s.series && s.series.toLowerCase().includes(q)) ||
        (s.clientName && s.clientName.toLowerCase().includes(q)) ||
        (s.clientCode && s.clientCode.toLowerCase().includes(q)) ||
        (s.notes && s.notes.toLowerCase().includes(q))
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
  }, [sales, search, selectedSeries, selectedStatus, fromDate, toDate, minSum, maxSum, sortField, sortDirection]);

  // Totals of filtered items
  const totals = useMemo(() => {
    return filteredAndSortedSales.reduce((acc, s) => ({
      withoutVat: acc.withoutVat + (Number(s.sumWithoutVat) || 0),
      vat: acc.vat + (Number(s.vat) || 0),
      withVat: acc.withVat + (Number(s.sumWithVat) || 0),
    }), { withoutVat: 0, vat: 0, withVat: 0 });
  }, [filteredAndSortedSales]);

  // Paginated slice
  const paginatedSales = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredAndSortedSales.slice(start, start + pageSize);
  }, [filteredAndSortedSales, currentPage, pageSize]);

  // Next invoice number = highest numeric number in the series + 1 (keeps leading zeros width)
  const getNextInvoiceNumber = (series: string) => {
    let maxNum = 0;
    let width = 6;
    for (const s of sales) {
      if ((s.series || '') !== series) continue;
      const digits = String(s.number || '').match(/\d+$/);
      if (!digits) continue;
      const val = parseInt(digits[0], 10);
      if (val > maxNum) {
        maxNum = val;
        width = Math.max(digits[0].length, 1);
      }
    }
    return String(maxNum + 1).padStart(width, '0');
  };

  const handleSeriesChange = (series: string) => {
    if (editingSale) {
      setFormData({ ...formData, series });
      return;
    }
    setFormData({ ...formData, series, number: getNextInvoiceNumber(series) });
  };

  const openCreateModal = () => {
    setEditingSale(null);
    const nextNum = getNextInvoiceNumber('PARD');
    setFormData({
      series: 'PARD',
      number: nextNum,
      saleDate: new Date().toISOString().split('T')[0],
      payUntil: new Date(Date.now() + 14 * 86400000).toISOString().split('T')[0],
      statusName: 'Apmokėta',
      warehouseName: 'Pagrindinis',
      clientId: null as number | null,
    clientName: '',
      clientCode: '',
      clientVatCode: '',
      notes: '',
      items: [
        { itemName: 'Paslaugos suteikimas', itemCode: 'PASL-01', quantity: 1, price: 100, vatRate: defaultVatRate }
      ]
    });
    setErrorMsg('');
    setIsFormOpen(true);
  };

  const openEditModal = (sale: any) => {
    setEditingSale(sale);
    const existingItems = itemsMap[sale.id] || [];
    setFormData({
      series: sale.series || 'PARD',
      number: sale.number || '',
      saleDate: sale.saleDate || new Date().toISOString().split('T')[0],
      payUntil: sale.payUntil || '',
      statusName: sale.statusName || 'Apmokėta',
      warehouseName: sale.warehouseName || 'Pagrindinis',
      clientId: sale.clientId || null,
      clientName: sale.clientName || '',
      clientCode: sale.clientCode || '',
      clientVatCode: sale.clientVatCode || '',
      notes: sale.notes || '',
      items: existingItems.length > 0 ? existingItems.map(it => ({
        itemName: it.itemName,
        itemCode: it.itemCode || '',
        quantity: it.quantity || 1,
        price: it.price || 0,
        vatRate: it.vatRate ?? defaultVatRate
      })) : [
        { itemName: 'Paslauga', itemCode: '', quantity: 1, price: sale.sumWithoutVat || 100, vatRate: defaultVatRate }
      ]
    });
    setErrorMsg('');
    setIsFormOpen(true);
  };

  const handleAddItemRow = () => {
    setFormData({
      ...formData,
      items: [
        ...formData.items,
        // Same form suggestion as defaultVatRate.
        { itemName: '', itemCode: '', quantity: 1, price: 0, vatRate: formIsVatPayer ? 21 : 0 }
      ]
    });
  };

  const handleRemoveItemRow = (index: number) => {
    if (formData.items.length <= 1) return;
    setFormData({
      ...formData,
      items: formData.items.filter((_, i) => i !== index)
    });
  };

  const handleItemChange = (index: number, field: keyof InvoiceItem, value: any) => {
    const updated = [...formData.items];
    updated[index] = { ...updated[index], [field]: value };
    setFormData({ ...formData, items: updated });
  };

  const handleSaveInvoice = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.number.trim()) {
      setErrorMsg(t('invoices.errNumber'));
      return;
    }
    setSubmitting(true);
    setErrorMsg('');

    try {
      if (editingSale) {
        // PUT
        const res = await fetch(`/api/invoices/${editingSale.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(formData)
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || t('invoices.errSave'));
        if (data.droppedTaxCodes?.length) window.alert(t('tax.codes.dropped', { list: data.droppedTaxCodes.map((d: { itemName: string; taxCode: string }) => `${d.itemName}: ${d.taxCode}`).join(', ') }));
        
        setSales(sales.map(s => s.id === editingSale.id ? { ...s, ...data.sale, itemCount: formData.items.length } : s));
        setItemsMap({ ...itemsMap, [editingSale.id]: data.items });
      } else {
        // POST
        const res = await fetch('/api/invoices', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...formData, companyId: company?.id })
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || t('invoices.errCreate'));

        const newSale = { ...data.sale, itemCount: formData.items.length };
        setSales([newSale, ...sales]);
        setItemsMap({ ...itemsMap, [newSale.id]: data.items });
      }

      setIsFormOpen(false);
    } catch (err: any) {
      setErrorMsg(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteInvoice = async (sale: any) => {
    if (!window.confirm(t('invoices.confirmDelete', { doc: `${sale.series} ${sale.number}` }))) return;

    try {
      const res = await fetch(`/api/invoices/${sale.id}`, { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || t('invoices.errDelete'));

      setSales(sales.filter(s => s.id !== sale.id));
      const newItemsMap = { ...itemsMap };
      delete newItemsMap[sale.id];
      setItemsMap(newItemsMap);
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
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight flex items-center gap-2">
            <Receipt className="w-6 h-6 text-emerald-400" />
            <span>{t('invoices.heading')}</span>
          </h1>
          <p className="text-sm text-slate-400 mt-1">
            {t('invoices.totalLabel')} <strong className="text-white font-mono">{sales.length}</strong>
          </p>
        </div>
        <button
          onClick={openCreateModal}
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs transition-colors shadow-sm self-start"
        >
          <Plus className="w-4 h-4" />
          <span>{t('invoices.newInvoice')}</span>
        </button>
      </div>

      {/* Main Filter Bar */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 space-y-3">
        <div className="flex flex-col md:flex-row items-center justify-between gap-3">
          {/* Quick Search */}
          <div className="relative w-full md:w-80">
            <Search className="w-4 h-4 absolute left-3 top-3 text-slate-400" />
            <input
              type="text"
              placeholder={t('invoices.searchPlaceholder')}
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

          {/* Series & Status Selectors */}
          <div className="flex items-center gap-2 w-full md:w-auto flex-wrap">
            <div className="flex items-center gap-1.5 bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1 text-xs text-slate-300">
              <span className="text-slate-400">{t('invoices.series')}:</span>
              <select
                value={selectedSeries}
                onChange={(e) => { setSelectedSeries(e.target.value); setCurrentPage(1); }}
                className="bg-transparent text-emerald-400 font-bold focus:outline-none cursor-pointer"
              >
                {seriesList.map(s => (
                  <option key={s} value={s} className="bg-slate-900 text-slate-200">
                    {s === 'ALL' ? t('invoices.allSeries') : s}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex items-center gap-1.5 bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1 text-xs text-slate-300">
              <span className="text-slate-400">{t('invoices.status')}:</span>
              <select
                value={selectedStatus}
                onChange={(e) => { setSelectedStatus(e.target.value); setCurrentPage(1); }}
                className="bg-transparent text-emerald-400 font-bold focus:outline-none cursor-pointer"
              >
                {statusList.map(st => (
                  <option key={st} value={st} className="bg-slate-900 text-slate-200">
                    {st === 'ALL' ? t('invoices.allStatuses') : statusLabel(st)}
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
              <span>{t('invoices.filters')}</span>
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
                title={t('invoices.resetFiltersTitle')}
              >
                <RotateCcw className="w-3 h-3" />
                <span>{t('invoices.reset')}</span>
              </button>
            )}
          </div>
        </div>

        {/* Advanced Filters Expandable Drawer */}
        {showAdvancedFilters && (
          <div className="pt-3 border-t border-slate-800/80 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 text-xs">
            <div>
              <label className="block text-slate-400 font-medium mb-1">{t('invoices.dateFrom')}</label>
              <input
                type="date"
                value={fromDate}
                onChange={(e) => { setFromDate(e.target.value); setCurrentPage(1); }}
                className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-emerald-500"
              />
            </div>
            <div>
              <label className="block text-slate-400 font-medium mb-1">{t('invoices.dateTo')}</label>
              <input
                type="date"
                value={toDate}
                onChange={(e) => { setToDate(e.target.value); setCurrentPage(1); }}
                className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-emerald-500"
              />
            </div>
            <div>
              <label className="block text-slate-400 font-medium mb-1">{t('invoices.sumFrom')}</label>
              <input
                type="number"
                placeholder="0.00"
                value={minSum}
                onChange={(e) => { setMinSum(e.target.value); setCurrentPage(1); }}
                className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-slate-200 font-mono focus:outline-none focus:border-emerald-500"
              />
            </div>
            <div>
              <label className="block text-slate-400 font-medium mb-1">{t('invoices.sumTo')}</label>
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
            {t('invoices.recordsFound')} <strong className="text-white font-mono">{filteredAndSortedSales.length}</strong> {t('invoices.ofTotal', { total: sales.length })}
          </div>
          <div className="flex items-center gap-4 font-mono">
            <span>{t('invoices.withoutVat')}: <strong className="text-slate-200">€{totals.withoutVat.toLocaleString(LOCALES[lang], { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong></span>
            <span>{t('invoices.vat')}: <strong className="text-slate-200">€{totals.vat.toLocaleString(LOCALES[lang], { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong></span>
            <span>{t('invoices.withVat')}: <strong className="text-emerald-400 text-sm font-bold">€{totals.withVat.toLocaleString(LOCALES[lang], { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong></span>
          </div>
        </div>
      </div>

      {/* Invoices Table */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="text-[11px] uppercase bg-slate-950/80 text-slate-400 border-b border-slate-800 tracking-wider">
              <tr>
                <th className="w-8 py-2.5 px-2 text-center"></th>
                <SortableTh field="document" currentField={sortField} currentDirection={sortDirection} onSort={handleSort}>
                  {t('invoices.colDocument')}
                </SortableTh>
                <SortableTh field="saleDate" currentField={sortField} currentDirection={sortDirection} onSort={handleSort}>
                  {t('invoices.colDate')}
                </SortableTh>
                <SortableTh field="payUntil" currentField={sortField} currentDirection={sortDirection} onSort={handleSort}>
                  {t('invoices.colDue')}
                </SortableTh>
                <SortableTh field="clientName" currentField={sortField} currentDirection={sortDirection} onSort={handleSort}>
                  {t('invoices.colClient')}
                </SortableTh>
                <SortableTh field="sumWithoutVat" currentField={sortField} currentDirection={sortDirection} onSort={handleSort} align="right">
                  {t('invoices.withoutVat')}
                </SortableTh>
                <SortableTh field="vat" currentField={sortField} currentDirection={sortDirection} onSort={handleSort} align="right">
                  {t('invoices.vat')}
                </SortableTh>
                <SortableTh field="sumWithVat" currentField={sortField} currentDirection={sortDirection} onSort={handleSort} align="right">
                  {t('invoices.colTotal')}
                </SortableTh>
                <SortableTh field="statusName" currentField={sortField} currentDirection={sortDirection} onSort={handleSort} align="center">
                  {t('invoices.colStatus')}
                </SortableTh>
                <th className="py-2.5 px-3 text-center w-24">{t('invoices.colActions')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 font-mono">
              {paginatedSales.map((sale) => {
                const isExpanded = expandedId === sale.id;
                const items = itemsMap[sale.id] || [];

                return (
                  <React.Fragment key={sale.id}>
                    <tr className="hover:bg-slate-800/40 transition-colors">
                      <td className="py-2 px-2 text-center">
                        <button
                          onClick={() => setExpandedId(isExpanded ? null : sale.id)}
                          className="p-1 hover:bg-slate-800 rounded text-slate-400"
                        >
                          {isExpanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                        </button>
                      </td>
                      <td className="py-2 px-3 font-semibold text-white">
                        <div className="flex items-center gap-1 font-mono">
                          <span className="text-emerald-400 font-bold">{sale.series}</span>
                          <span>{sale.number}</span>
                        </div>
                      </td>
                      <td className="py-2 px-3 text-slate-300 font-sans text-xs">
                        <div className="flex items-center gap-1.5">
                          <Calendar className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                          <span>{sale.saleDate}</span>
                        </div>
                      </td>
                      <td className="py-2 px-3 text-slate-400 font-sans text-xs">
                        {sale.payUntil || '—'}
                      </td>
                      <td className="py-2 px-3 text-slate-200 font-sans">
                        <div className="font-semibold text-xs truncate max-w-[200px]" title={sale.clientName}>
                          {sale.clientName || '—'}
                        </div>
                        {clientForSale(sale)?.email && <button type="button" className="block text-xs text-emerald-400 underline" onClick={() => setEmailInvoice(sale)}>{clientForSale(sale).email}</button>}
                        {sale.clientCode && (
                          <div className="text-[10px] text-slate-400 font-mono">
                            {t('invoices.clientCodeLine', { code: sale.clientCode })}
                          </div>
                        )}
                      </td>
                      <td className="py-2 px-3 text-right text-slate-300">
                        €{Number(sale.sumWithoutVat || 0).toFixed(2)}
                      </td>
                      <td className="py-2 px-3 text-right text-slate-400">
                        €{Number(sale.vat || 0).toFixed(2)}
                      </td>
                      <td className="py-2 px-3 text-right font-bold text-emerald-400 text-sm">
                        €{Number(sale.sumWithVat || 0).toFixed(2)}
                      </td>
                      <td className="py-2 px-3 text-center font-sans">
                        <span className="inline-block px-2 py-0.5 text-[10px] font-bold rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                          {statusLabel(sale.statusName || 'Apmokėta')}
                        </span>
                        {sale.docType !== 'KS' && sale.paidAmount > 0 && (
                          <div className={`mt-1 text-[10px] ${Math.round((Number(sale.dueAmount) - Number(sale.paidAmount)) * 100) <= 0 ? 'text-emerald-400' : 'text-amber-400'}`}>
                            {Math.round((Number(sale.dueAmount) - Number(sale.paidAmount)) * 100) <= 0 ? t('invoices.paidViaBank') : t('invoices.receivedOf', { paid: Number(sale.paidAmount).toFixed(2), due: Number(sale.dueAmount).toFixed(2) })}
                          </div>
                        )}
                      </td>
                      <td className="py-2 px-3 text-center">
                        <div className="flex items-center justify-center gap-1">
                          <button
                            onClick={() => setPrintModalSale(sale)}
                            className="p-1 hover:bg-slate-800 rounded text-slate-300 hover:text-white transition-colors"
                            title={t('invoices.print')}
                          >
                            <Printer className="w-3.5 h-3.5 text-emerald-400" />
                          </button>
                          {sale.docType !== 'KS' && (
                            <button
                              onClick={() => setCreditSale(sale)}
                              className="px-1.5 py-0.5 hover:bg-slate-800 rounded text-[10px] font-bold text-amber-400 transition-colors"
                              title={t('invoices.createCredit')}
                            >
                              KS
                            </button>
                          )}
                          <button
                            onClick={() => openEditModal(sale)}
                            className="p-1 hover:bg-slate-800 rounded text-slate-400 hover:text-emerald-400 transition-colors"
                            title={t('invoices.edit')}
                          >
                            <Edit3 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => handleDeleteInvoice(sale)}
                            className="p-1 hover:bg-slate-800 rounded text-slate-400 hover:text-rose-400 transition-colors"
                            title={t('invoices.delete')}
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>

                    {/* Expanded Items */}
                    {isExpanded && (
                      <tr className="bg-slate-950/60 font-sans">
                        <td colSpan={10} className="p-3 pl-10 border-b border-slate-800">
                          <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-2">
                            {t('invoices.linesHeadingCount', { count: items.length })}
                          </div>
                          {items.length === 0 ? (
                            <div className="text-xs text-slate-500 py-1 italic">{t('invoices.noLines')}</div>
                          ) : (
                            <table className="w-full text-left text-xs bg-slate-900 rounded-lg border border-slate-800 overflow-hidden">
                              <thead>
                                <tr className="text-slate-400 border-b border-slate-800 text-[10px] uppercase">
                                  <th className="py-1.5 px-3">{t('invoices.colName')}</th>
                                  <th className="py-1.5 px-3 font-mono">{t('invoices.colCode')}</th>
                                  <th className="py-1.5 px-3 text-right">{t('invoices.colQty')}</th>
                                  <th className="py-1.5 px-3 text-right">{(sale.sellerVatMode ? sale.sellerVatMode === 'STANDARD_VAT' : (sale.sellerIsVatPayer ?? companyChargesVat)) ? t('invoices.priceNoVat') : t('invoices.price')}</th>
                                  <th className="py-1.5 px-3 text-right">{t('invoices.vatRate')}</th>
                                  <th className="py-1.5 px-3 text-right">{(sale.sellerVatMode ? sale.sellerVatMode === 'STANDARD_VAT' : (sale.sellerIsVatPayer ?? companyChargesVat)) ? t('invoices.sumWithVat') : t('invoices.sum')}</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-slate-800/40 font-mono">
                                {items.map((it, idx) => (
                                  <tr key={idx} className="hover:bg-slate-900/60">
                                    <td className="py-1.5 px-3 font-sans text-slate-200 font-medium">{it.itemName}</td>
                                    <td className="py-1.5 px-3 text-slate-400">{it.itemCode || '—'}</td>
                                    <td className="py-1.5 px-3 text-right text-slate-200">{it.quantity}</td>
                                    <td className="py-1.5 px-3 text-right text-slate-300">€{(it.price || 0).toFixed(2)}</td>
                                    <td className="py-1.5 px-3 text-right text-slate-400">{(sale.sellerVatMode ? sale.sellerVatMode === 'STANDARD_VAT' : (sale.sellerIsVatPayer ?? companyChargesVat)) ? `${it.vatRate ?? 0}%` : t('invoices.notApplicable')}</td>
                                    <td className="py-1.5 px-3 text-right font-bold text-emerald-400">€{(it.sumWithVat || 0).toFixed(2)}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          )}
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}
              {paginatedSales.length === 0 && (
                <tr>
                  <td colSpan={10} className="py-12 text-center text-slate-400 font-sans">
                    {t('invoices.noResults')}
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
          totalItems={filteredAndSortedSales.length}
          onPageChange={setCurrentPage}
          onExport={() => downloadCsv('sarasai_pardavimai', [{header:t('invoices.series'),key:'series'},{header:t('invoices.csvNumber'),key:'number'},{header:t('invoices.colDate'),key:'saleDate'},{header:t('invoices.payUntil'),key:'payUntil'},{header:t('invoices.csvBuyer'),key:'clientName'},{header:t('invoices.companyCode'),key:'clientCode'},{header:t('invoices.vatCode'),key:'clientVatCode'},{header:t('invoices.withoutVat'),key:'sumWithoutVat'},{header:t('invoices.vat'),key:'vat'},{header:t('invoices.withVat'),key:'sumWithVat'},{header:t('invoices.status'),key:'statusName'}], filteredAndSortedSales)}
          onPageSizeChange={(newSize) => { setPageSize(newSize); setCurrentPage(1); }}
        />
      </div>

      {/* Modal: Create / Edit Invoice */}
      {isFormOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-3xl w-full p-6 shadow-2xl text-slate-100 max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between pb-4 border-b border-slate-800">
              <h3 className="text-lg font-bold text-white flex items-center gap-2">
                <Receipt className="w-5 h-5 text-emerald-400" />
                <span>{editingSale ? t('invoices.editTitle') : t('invoices.createTitle')}</span>
              </h3>
              <button 
                onClick={() => setIsFormOpen(false)}
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

            <form onSubmit={handleSaveInvoice} className="mt-4 space-y-4 overflow-y-auto pr-1 flex-1 text-xs">
              <div className="grid grid-cols-4 gap-3">
                <div>
                  <label className="block text-slate-400 font-semibold mb-1">{t('invoices.series')}</label>
                  <input
                    type="text"
                    required
                    value={formData.series}
                    onChange={(e) => handleSeriesChange(e.target.value.toUpperCase())}
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100 font-mono uppercase focus:outline-none focus:border-emerald-500"
                  />
                </div>
                <div>
                  <label className="block text-slate-400 font-semibold mb-1">{t('invoices.number')}</label>
                  <input
                    type="text"
                    required
                    value={formData.number}
                    onChange={(e) => setFormData({ ...formData, number: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100 font-mono focus:outline-none focus:border-emerald-500"
                  />
                </div>
                <div>
                  <label className="block text-slate-400 font-semibold mb-1">{t('invoices.issueDate')}</label>
                  <input
                    type="date"
                    required
                    value={formData.saleDate}
                    onChange={(e) => { const date=e.target.value;const mode=company?.taxPeriods?.filter((p:{effectiveFrom:string})=>p.effectiveFrom<=date).at(-1)?.mode ?? company?.effectiveTaxMode ?? company?.taxMode ?? (companyChargesVat?'STANDARD_VAT':'NON_VAT');setFormData({...formData,saleDate:date,items:!editingSale&&mode!=='STANDARD_VAT'?formData.items.map(it=>({...it,vatRate:0})):formData.items}); }}
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-emerald-500"
                  />
                </div>
                <div>
                  <label className="block text-slate-400 font-semibold mb-1">{t('invoices.payUntil')}</label>
                  <input
                    type="date"
                    value={formData.payUntil}
                    onChange={(e) => setFormData({ ...formData, payUntil: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-emerald-500"
                  />
                </div>
              </div>

              {/* Client Info */}
              <div className="border border-slate-800 rounded-xl p-3 bg-slate-950/60 space-y-3">
                <div className="font-semibold text-slate-300">{t('invoices.buyerDetails')}</div>
                <div className="grid grid-cols-3 gap-3">
                  <div className="col-span-1">
                    <label className="block text-slate-400 mb-1">{t('invoices.colName')}</label>
                    <input
                      type="text"
                      list="invoice-clients-datalist"
                      placeholder={t('invoices.clientPlaceholder')}
                      value={formData.clientName}
                      onChange={(e) => {
                        const val = e.target.value;
                        const matched = clientsList.find((c: any) => c.name.toLowerCase() === val.toLowerCase());
                        if (matched) {
                          setFormData({
                            ...formData,
                            clientId: matched.id,
                            clientName: matched.name,
                            clientCode: matched.code || '',
                            clientVatCode: matched.isVatPayer ? (matched.vatCode || '') : ''
                          });
                        } else {
                          setFormData({ ...formData, clientId: null, clientName: val, clientCode: '', clientVatCode: '' });
                        }
                      }}
                      className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-slate-100 focus:outline-none focus:border-emerald-500"
                    />
                    <datalist id="invoice-clients-datalist">
                      {clientsList.map((c: any) => (
                        <option key={c.id} value={c.name}>{c.code ? t('invoices.clientCodeLine', { code: c.code }) : ''}</option>
                      ))}
                    </datalist>
                  </div>
                  <div>
                    <label className="block text-slate-400 mb-1">{t('invoices.companyCode')}</label>
                    <input
                      type="text"
                      placeholder="301234567"
                      value={formData.clientCode}
                      onChange={(e) => setFormData({ ...formData, clientCode: e.target.value })}
                      className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-slate-100 font-mono focus:outline-none focus:border-emerald-500"
                    />
                  </div>
                  <div>
                    <label className="block text-slate-400 mb-1">{t('invoices.vatCode')}</label>
                    <input
                      type="text"
                      placeholder="LT100000000000"
                      value={formData.clientVatCode}
                      onChange={(e) => setFormData({ ...formData, clientVatCode: e.target.value })}
                      className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-slate-100 font-mono focus:outline-none focus:border-emerald-500"
                    />
                  </div>
                </div>
              </div>

              {/* Items Section */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-slate-300">{t('invoices.linesHeading')}</span>
                  <button
                    type="button"
                    onClick={handleAddItemRow}
                    className="inline-flex items-center gap-1 text-xs text-emerald-400 hover:text-emerald-300 font-semibold"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>{t('invoices.addLine')}</span>
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
                            placeholder={t('invoices.namePlaceholder')}
                            value={it.itemName}
                            onChange={(e) => handleItemChange(idx, 'itemName', e.target.value)}
                            className="w-full bg-slate-900 border border-slate-700 rounded px-2.5 py-1.5 text-xs text-slate-100 focus:outline-none focus:border-emerald-500"
                          />
                        </div>
                        <div className="w-24">
                          <input
                            type="text"
                            placeholder={t('invoices.codePlaceholder')}
                            value={it.itemCode}
                            onChange={(e) => handleItemChange(idx, 'itemCode', e.target.value)}
                            className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1.5 text-xs text-slate-100 font-mono focus:outline-none focus:border-emerald-500"
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
                            disabled={!formIsVatPayer}
                            value={it.vatRate}
                            onChange={(e) => handleItemChange(idx, 'vatRate', parseInt(e.target.value, 10))}
                            className="w-full bg-slate-900 border border-slate-700 rounded px-1.5 py-1.5 text-xs text-slate-100 focus:outline-none focus:border-emerald-500"
                          >
                            {/* Rate choices of the line form (not a legal parameter, see lib/rules for how a stored rate is classified). */}
                            <option value={21}>21%</option>
                            <option value={9}>9%</option>
                            <option value={5}>5%</option>
                            <option value={0}>{formIsVatPayer ? '0%' : '—'}</option>
                          </select>
                        </div>
                        <div className="w-24 text-right font-mono font-semibold text-emerald-400 text-xs">
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

                {/* Totals Summary */}
                <div className="flex justify-end pt-2 text-right space-y-1">
                  <div className="bg-slate-950 p-3 rounded-xl border border-slate-800 space-y-1 w-64">
                    <div className="flex justify-between text-slate-400">
                      <span>{t('invoices.sumNoVat')}</span>
                      <span className="font-mono text-slate-200">€{formSubtotal.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between text-slate-400">
                      <span>{t('invoices.vat')}:</span>
                      <span className="font-mono text-slate-200">€{formVat.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between text-white font-bold text-sm border-t border-slate-800 pt-1">
                      <span>{t('invoices.payable')}</span>
                      <span className="font-mono text-emerald-400">€{formTotal.toFixed(2)}</span>
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsFormOpen(false)}
                  className="px-4 py-2 text-sm font-medium text-slate-300 hover:bg-slate-800 rounded-lg"
                >
                  {t('invoices.cancel')}
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-5 py-2 text-sm font-bold text-white bg-emerald-600 hover:bg-emerald-500 rounded-lg disabled:opacity-50"
                >
                  {submitting ? t('invoices.saving') : (editingSale ? t('invoices.saveChanges') : t('invoices.create'))}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {creditSale && <CreditNoteDialog sale={creditSale} items={itemsMap[creditSale.id] || []} suggestedNumber={nextCreditNumber()} onClose={() => setCreditSale(null)} onCreated={(created, createdItems) => { setSales([{ ...created, itemCount: createdItems.length }, ...sales]); setItemsMap({ ...itemsMap, [created.id]: createdItems }); setCreditSale(null); }} />}
      {printModalSale && <InvoiceDeliveryDialog invoices={[printModalSale]} initialId={printModalSale.id} onClose={() => setPrintModalSale(null)} />}
      {emailInvoice && <InvoiceDeliveryDialog invoices={[emailInvoice]} initialId={emailInvoice.id} emailMode onClose={() => setEmailInvoice(null)} />}
      {emailClientId && <InvoiceDeliveryDialog invoices={sales.filter(s => clientForSale(s)?.id === emailClientId)} emailMode onClose={() => setEmailClientId(null)} />}
    </div>
  );
}
