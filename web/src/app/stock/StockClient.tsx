'use client';

import React, { useState, useMemo } from 'react';
import { 
  Package, 
  Search, 
  Plus, 
  Edit3, 
  Trash2, 
  X, 
  AlertCircle,
  Filter,
  RotateCcw
} from 'lucide-react';
import { useI18n } from '@/lib/i18n/client';
import { LOCALES } from '@/lib/i18n/config';
import { SortableTh, compareValues, TablePagination, SortDirection, usePageSize, downloadCsv } from '@/components/TableSort';

export function StockClient({ initialStock }: { initialStock: any[] }) {
  const { t, lang } = useI18n();
  const money2 = (n: number) => n.toLocaleString(LOCALES[lang], { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const [stock, setStock] = useState(initialStock);

  // Search & Filter state
  const [search, setSearch] = useState('');
  const [warehouseFilter, setWarehouseFilter] = useState('ALL');
  const [stockStatus, setStockStatus] = useState<'ALL' | 'IN_STOCK' | 'OUT_OF_STOCK'>('ALL');
  const [minPrice, setMinPrice] = useState('');
  const [maxPrice, setMaxPrice] = useState('');
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);

  // Sorting state
  const [sortField, setSortField] = useState<string>('name');
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc');

  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = usePageSize('stock', 50);

  // Modal
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<any | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const [formData, setFormData] = useState({
    name: '',
    code: '',
    barcode: '',
    warehouseName: 'Pagrindinis',
    remainder: 10,
    price: 15,
    cost: 10,
    clientName: ''
  });

  // Extract distinct warehouses
  const warehouseList = useMemo(() => {
    const set = new Set<string>();
    for (const s of stock) {
      if (s.warehouseName && s.warehouseName.trim()) set.add(s.warehouseName.trim());
    }
    return ['ALL', ...Array.from(set).sort()];
  }, [stock]);

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
    setWarehouseFilter('ALL');
    setStockStatus('ALL');
    setMinPrice('');
    setMaxPrice('');
    setCurrentPage(1);
  };

  const activeFiltersCount = [
    search.trim() !== '',
    warehouseFilter !== 'ALL',
    stockStatus !== 'ALL',
    minPrice !== '',
    maxPrice !== ''
  ].filter(Boolean).length;

  const filteredAndSorted = useMemo(() => {
    const filtered = stock.filter((item) => {
      if (warehouseFilter !== 'ALL' && item.warehouseName !== warehouseFilter) return false;
      if (stockStatus === 'IN_STOCK' && Number(item.remainder || 0) <= 0) return false;
      if (stockStatus === 'OUT_OF_STOCK' && Number(item.remainder || 0) > 0) return false;
      if (minPrice && Number(item.price || 0) < Number(minPrice)) return false;
      if (maxPrice && Number(item.price || 0) > Number(maxPrice)) return false;

      if (!search.trim()) return true;
      const q = search.toLowerCase();
      return (
        (item.name && item.name.toLowerCase().includes(q)) ||
        (item.code && item.code.toLowerCase().includes(q)) ||
        (item.barcode && item.barcode.toLowerCase().includes(q)) ||
        (item.warehouseName && item.warehouseName.toLowerCase().includes(q)) ||
        (item.clientName && item.clientName.toLowerCase().includes(q))
      );
    });

    return filtered.sort((a, b) => {
      let valA: any = a[sortField];
      let valB: any = b[sortField];

      if (sortField === 'remainder' || sortField === 'price' || sortField === 'cost') {
        valA = Number(valA) || 0;
        valB = Number(valB) || 0;
      }

      return compareValues(valA, valB, sortDirection);
    });
  }, [stock, search, warehouseFilter, stockStatus, minPrice, maxPrice, sortField, sortDirection]);

  // Totals
  const totals = useMemo(() => {
    return filteredAndSorted.reduce((acc, item) => {
      const rem = Number(item.remainder || 0);
      const pr = Number(item.price || 0);
      const cst = Number(item.cost || 0);
      return {
        totalUnits: acc.totalUnits + rem,
        totalCostValue: acc.totalCostValue + (rem * cst),
        totalSaleValue: acc.totalSaleValue + (rem * pr),
      };
    }, { totalUnits: 0, totalCostValue: 0, totalSaleValue: 0 });
  }, [filteredAndSorted]);

  const paginatedStock = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredAndSorted.slice(start, start + pageSize);
  }, [filteredAndSorted, currentPage, pageSize]);

  const openCreateModal = () => {
    setEditingItem(null);
    setFormData({
      name: '',
      code: '',
      barcode: '',
      warehouseName: 'Pagrindinis',
      remainder: 1,
      price: 0,
      cost: 0,
      clientName: ''
    });
    setErrorMsg('');
    setIsModalOpen(true);
  };

  const openEditModal = (item: any) => {
    setEditingItem(item);
    setFormData({
      name: item.name || '',
      code: item.code || '',
      barcode: item.barcode || '',
      warehouseName: item.warehouseName || 'Pagrindinis',
      remainder: item.remainder || 0,
      price: item.price || 0,
      cost: item.cost || 0,
      clientName: item.clientName || ''
    });
    setErrorMsg('');
    setIsModalOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name.trim()) {
      setErrorMsg(t('stock.errName'));
      return;
    }
    setSubmitting(true);
    setErrorMsg('');

    try {
      if (editingItem) {
        const res = await fetch(`/api/stock/${editingItem.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(formData)
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || t('stock.errUpdate'));
        setStock(stock.map(s => s.id === editingItem.id ? { ...s, ...data.stockItem } : s));
      } else {
        const res = await fetch('/api/stock', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(formData)
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || t('stock.errCreate'));
        setStock([data.stockItem, ...stock]);
      }

      setIsModalOpen(false);
    } catch (err: any) {
      setErrorMsg(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (item: any) => {
    if (!window.confirm(t('stock.confirmDelete', { name: item.name }))) return;
    try {
      const res = await fetch(`/api/stock/${item.id}`, { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || t('stock.errDelete'));
      setStock(stock.filter(s => s.id !== item.id));
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
            <Package className="w-6 h-6 text-emerald-400" />
            <span>{t('stock.title')}</span>
          </h1>
          <p className="text-sm text-slate-400 mt-1">
            {t('stock.totalItems', { count: stock.length })}
          </p>
        </div>
        <button
          onClick={openCreateModal}
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs transition-colors shadow-sm self-start"
        >
          <Plus className="w-4 h-4" />
          <span>{t('stock.addNew')}</span>
        </button>
      </div>

      {/* Filter Bar */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 space-y-3">
        <div className="flex flex-col md:flex-row items-center justify-between gap-3">
          <div className="relative w-full md:w-80">
            <Search className="w-4 h-4 absolute left-3 top-3 text-slate-400" />
            <input
              type="text"
              placeholder={t('stock.searchPlaceholder')}
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
            {/* Warehouse select */}
            <div className="flex items-center gap-1.5 bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1 text-xs text-slate-300">
              <span className="text-slate-400">{t('stock.warehouse')}:</span>
              <select
                value={warehouseFilter}
                onChange={(e) => { setWarehouseFilter(e.target.value); setCurrentPage(1); }}
                className="bg-transparent text-emerald-400 font-bold focus:outline-none cursor-pointer"
              >
                {warehouseList.map(w => (
                  <option key={w} value={w} className="bg-slate-900 text-slate-200">
                    {w === 'ALL' ? t('stock.allWarehouses') : w}
                  </option>
                ))}
              </select>
            </div>

            {/* Stock status */}
            <div className="flex items-center gap-1.5 bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1 text-xs text-slate-300">
              <span className="text-slate-400">{t('stock.remainder')}:</span>
              <select
                value={stockStatus}
                onChange={(e) => { setStockStatus(e.target.value as any); setCurrentPage(1); }}
                className="bg-transparent text-emerald-400 font-bold focus:outline-none cursor-pointer"
              >
                <option value="ALL" className="bg-slate-900 text-slate-200">{t('stock.all')}</option>
                <option value="IN_STOCK" className="bg-slate-900 text-slate-200">{t('stock.inStockOnly')}</option>
                <option value="OUT_OF_STOCK" className="bg-slate-900 text-slate-200">{t('stock.soldOut')}</option>
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
              <span>{t('stock.filters')}</span>
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
                title={t('stock.clearFilters')}
              >
                <RotateCcw className="w-3 h-3" />
                <span>{t('stock.reset')}</span>
              </button>
            )}
          </div>
        </div>

        {/* Advanced Filters */}
        {showAdvancedFilters && (
          <div className="pt-3 border-t border-slate-800/80 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 text-xs">
            <div>
              <label className="block text-slate-400 font-medium mb-1">{t('stock.priceFrom')}</label>
              <input
                type="number"
                placeholder="0.00"
                value={minPrice}
                onChange={(e) => { setMinPrice(e.target.value); setCurrentPage(1); }}
                className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-slate-200 font-mono focus:outline-none focus:border-emerald-500"
              />
            </div>
            <div>
              <label className="block text-slate-400 font-medium mb-1">{t('stock.priceTo')}</label>
              <input
                type="number"
                placeholder="9999.00"
                value={maxPrice}
                onChange={(e) => { setMaxPrice(e.target.value); setCurrentPage(1); }}
                className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-slate-200 font-mono focus:outline-none focus:border-emerald-500"
              />
            </div>
          </div>
        )}

        {/* Live Filter Summary Strip */}
        <div className="flex flex-wrap items-center justify-between text-xs pt-2 border-t border-slate-800/60 text-slate-400">
          <div>
            {t('stock.found', { shown: filteredAndSorted.length, total: stock.length })}
          </div>
          <div className="flex items-center gap-4 font-mono">
            <span>{t('stock.totalRemainder')}: <strong className="text-slate-200">{t('stock.units', { count: totals.totalUnits.toLocaleString(LOCALES[lang]) })}</strong></span>
            <span>{t('stock.cost')}: <strong className="text-slate-200">€{money2(totals.totalCostValue)}</strong></span>
            <span>{t('stock.saleValue')}: <strong className="text-emerald-400 text-sm font-bold">€{money2(totals.totalSaleValue)}</strong></span>
          </div>
        </div>
      </div>

      {/* Stock Table */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="text-[11px] uppercase bg-slate-950/80 text-slate-400 border-b border-slate-800 tracking-wider">
              <tr>
                <SortableTh field="name" currentField={sortField} currentDirection={sortDirection} onSort={handleSort}>
                  {t('stock.itemName')}
                </SortableTh>
                <SortableTh field="code" currentField={sortField} currentDirection={sortDirection} onSort={handleSort}>
                  {t('stock.codeSku')}
                </SortableTh>
                <SortableTh field="warehouseName" currentField={sortField} currentDirection={sortDirection} onSort={handleSort}>
                  {t('stock.warehouseCol')}
                </SortableTh>
                <SortableTh field="remainder" currentField={sortField} currentDirection={sortDirection} onSort={handleSort} align="right">
                  {t('stock.remainderCol')}
                </SortableTh>
                <SortableTh field="cost" currentField={sortField} currentDirection={sortDirection} onSort={handleSort} align="right">
                  {t('stock.costCol')}
                </SortableTh>
                <SortableTh field="price" currentField={sortField} currentDirection={sortDirection} onSort={handleSort} align="right">
                  {t('stock.priceCol')}
                </SortableTh>
                <SortableTh field="clientName" currentField={sortField} currentDirection={sortDirection} onSort={handleSort}>
                  {t('stock.supplier')}
                </SortableTh>
                <th className="py-2.5 px-3 text-center w-20">{t('stock.actions')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 font-mono">
              {paginatedStock.map((item) => (
                <tr key={item.id} className="hover:bg-slate-800/40 transition-colors">
                  <td className="py-2.5 px-3 font-semibold text-slate-100 font-sans">
                    <div className="truncate max-w-[240px]" title={item.name}>{item.name}</div>
                    {item.barcode && (
                      <div className="text-[10px] text-slate-500 font-mono">{t('stock.barcodeLabel', { code: item.barcode })}</div>
                    )}
                  </td>
                  <td className="py-2.5 px-3 text-slate-300">
                    {item.code || '—'}
                  </td>
                  <td className="py-2.5 px-3 text-slate-400 font-sans">
                    <span className="px-2 py-0.5 rounded bg-slate-800 border border-slate-700/80 text-[10px]">
                      {item.warehouseName || 'Pagrindinis'}
                    </span>
                  </td>
                  <td className="py-2.5 px-3 text-right font-bold text-sm">
                    <span className={Number(item.remainder || 0) > 0 ? 'text-emerald-400' : 'text-slate-500'}>
                      {Number(item.remainder || 0).toLocaleString(LOCALES[lang])}
                    </span>
                  </td>
                  <td className="py-2.5 px-3 text-right text-slate-400">
                    €{Number(item.cost || 0).toFixed(2)}
                  </td>
                  <td className="py-2.5 px-3 text-right font-bold text-slate-200">
                    €{Number(item.price || 0).toFixed(2)}
                  </td>
                  <td className="py-2.5 px-3 font-sans text-slate-400 text-xs truncate max-w-[160px]" title={item.clientName || ''}>
                    {item.clientName || '—'}
                  </td>
                  <td className="py-2.5 px-3 text-center">
                    <div className="flex items-center justify-center gap-1">
                      <button
                        onClick={() => openEditModal(item)}
                        className="p-1 hover:bg-slate-800 rounded text-slate-400 hover:text-emerald-400 transition-colors"
                        title={t('stock.edit')}
                      >
                        <Edit3 className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => handleDelete(item)}
                        className="p-1 hover:bg-slate-800 rounded text-slate-400 hover:text-rose-400 transition-colors"
                        title={t('stock.delete')}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {paginatedStock.length === 0 && (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-slate-400 font-sans">
                    {t('stock.noneFound')}
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
          onExport={() => downloadCsv('sandelis', [{header:t('stock.csvName'),key:'name'},{header:t('stock.csvCode'),key:'code'},{header:t('stock.barcode'),key:'barcode'},{header:t('stock.warehouse'),key:'warehouseName'},{header:t('stock.remainder'),key:'remainder'},{header:t('stock.cost'),key:'cost'},{header:t('stock.price'),key:'price'},{header:t('stock.supplier'),key:'clientName'}], filteredAndSorted)}
          onPageSizeChange={(newSize) => { setPageSize(newSize); setCurrentPage(1); }}
        />
      </div>

      {/* Modal: Create/Edit Stock Item */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-lg w-full p-6 shadow-2xl text-slate-100">
            <div className="flex items-center justify-between pb-4 border-b border-slate-800">
              <h3 className="text-lg font-bold text-white flex items-center gap-2">
                <Package className="w-5 h-5 text-emerald-400" />
                <span>{editingItem ? t('stock.editTitle') : t('stock.newTitle')}</span>
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
              <div>
                <label className="block text-slate-300 font-semibold mb-1">{t('stock.itemNameReq')}</label>
                <input
                  type="text"
                  required
                  placeholder={t('stock.namePlaceholder')}
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-300 font-semibold mb-1">{t('stock.codeSku')}</label>
                  <input
                    type="text"
                    placeholder="PRK-001"
                    value={formData.code}
                    onChange={(e) => setFormData({ ...formData, code: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100 font-mono focus:outline-none focus:border-emerald-500"
                  />
                </div>
                <div>
                  <label className="block text-slate-300 font-semibold mb-1">{t('stock.warehouse')}</label>
                  <input
                    type="text"
                    value={formData.warehouseName}
                    onChange={(e) => setFormData({ ...formData, warehouseName: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-emerald-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-slate-300 font-semibold mb-1">{t('stock.remainderQty')}</label>
                  <input
                    type="number"
                    step="any"
                    value={formData.remainder}
                    onChange={(e) => setFormData({ ...formData, remainder: parseFloat(e.target.value) || 0 })}
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100 text-right font-mono focus:outline-none focus:border-emerald-500"
                  />
                </div>
                <div>
                  <label className="block text-slate-300 font-semibold mb-1">{t('stock.priceCol')}</label>
                  <input
                    type="number"
                    step="0.01"
                    value={formData.price}
                    onChange={(e) => setFormData({ ...formData, price: parseFloat(e.target.value) || 0 })}
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100 text-right font-mono focus:outline-none focus:border-emerald-500"
                  />
                </div>
                <div>
                  <label className="block text-slate-300 font-semibold mb-1">{t('stock.costCol')}</label>
                  <input
                    type="number"
                    step="0.01"
                    value={formData.cost}
                    onChange={(e) => setFormData({ ...formData, cost: parseFloat(e.target.value) || 0 })}
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100 text-right font-mono focus:outline-none focus:border-emerald-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-slate-300 font-semibold mb-1">{t('stock.supplier')}</label>
                <input
                  type="text"
                  placeholder={t('stock.supplierPlaceholder')}
                  value={formData.clientName}
                  onChange={(e) => setFormData({ ...formData, clientName: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 text-sm font-medium text-slate-300 hover:bg-slate-800 rounded-lg"
                >
                  {t('stock.cancel')}
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-5 py-2 text-sm font-bold text-white bg-emerald-600 hover:bg-emerald-500 rounded-lg disabled:opacity-50"
                >
                  {submitting ? t('stock.saving') : (editingItem ? t('stock.save') : t('stock.addItem'))}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
