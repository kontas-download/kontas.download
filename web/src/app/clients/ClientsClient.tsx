'use client';

import { DocLanguageSelect } from '@/components/DocLanguageSelect';
import React, { useState, useMemo } from 'react';
import { 
  Search, 
  Building2, 
  MapPin, 
  Mail, 
  Phone, 
  FileText, 
  Plus, 
  Edit3, 
  Trash2, 
  X, 
  AlertCircle,
  LayoutGrid,
  List,
  Filter,
  RotateCcw
} from 'lucide-react';
import { useI18n } from '@/lib/i18n/client';
import { LOCALES } from '@/lib/i18n/config';
import { SortableTh, compareValues, TablePagination, SortDirection, usePageSize, downloadCsv } from '@/components/TableSort';

export function ClientsClient({ initialClients }: { initialClients: any[] }) {
  const { t, lang } = useI18n();
  const [clients, setClients] = useState(initialClients);

  // Search & Filter state
  const [search, setSearch] = useState('');
  const [cityFilter, setCityFilter] = useState('ALL');
  const [vatFilter, setVatFilter] = useState<'ALL' | 'WITH_VAT' | 'WITHOUT_VAT'>('ALL');
  const [viewMode, setViewMode] = useState<'table' | 'grid'>('table');

  // Sorting state
  const [sortField, setSortField] = useState<string>('name');
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc');

  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = usePageSize('clients', 50);

  // Modal state
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingClient, setEditingClient] = useState<any | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const [formData, setFormData] = useState({
    name: '',
    code: '',
    vatCode: '',
    isVatPayer: false,
      documentLang: '',
    email: '',
    phone: '',
    address: '',
    city: 'Vilnius',
    countryName: 'Lietuva'
  });

  // Extract distinct cities
  const citiesList = useMemo(() => {
    const set = new Set<string>();
    for (const c of clients) {
      if (c.city && c.city.trim()) set.add(c.city.trim());
    }
    return ['ALL', ...Array.from(set).sort()];
  }, [clients]);

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
    setCityFilter('ALL');
    setVatFilter('ALL');
    setCurrentPage(1);
  };

  const activeFiltersCount = [
    search.trim() !== '',
    cityFilter !== 'ALL',
    vatFilter !== 'ALL'
  ].filter(Boolean).length;

  const filteredAndSorted = useMemo(() => {
    const filtered = clients.filter((c) => {
      if (cityFilter !== 'ALL' && c.city !== cityFilter) return false;
      if (vatFilter === 'WITH_VAT' && (!c.vatCode || !c.vatCode.trim())) return false;
      if (vatFilter === 'WITHOUT_VAT' && (c.vatCode && c.vatCode.trim())) return false;

      if (!search.trim()) return true;
      const q = search.toLowerCase();
      return (
        (c.name && c.name.toLowerCase().includes(q)) ||
        (c.code && c.code.toLowerCase().includes(q)) ||
        (c.vatCode && c.vatCode.toLowerCase().includes(q)) ||
        (c.city && c.city.toLowerCase().includes(q)) ||
        (c.address && c.address.toLowerCase().includes(q)) ||
        (c.email && c.email.toLowerCase().includes(q)) ||
        (c.phone && c.phone.toLowerCase().includes(q))
      );
    });

    return filtered.sort((a, b) => {
      let valA: any = a[sortField];
      let valB: any = b[sortField];

      if (sortField === 'totalSalesSum') {
        valA = Number(valA) || 0;
        valB = Number(valB) || 0;
      }

      return compareValues(valA, valB, sortDirection);
    });
  }, [clients, search, cityFilter, vatFilter, sortField, sortDirection]);

  const paginatedClients = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredAndSorted.slice(start, start + pageSize);
  }, [filteredAndSorted, currentPage, pageSize]);

  const openCreateModal = () => {
    setEditingClient(null);
    setFormData({
      name: '',
      code: '',
      vatCode: '',
    isVatPayer: false,
      documentLang: '',
      email: '',
      phone: '',
      address: '',
      city: 'Vilnius',
      countryName: 'Lietuva'
    });
    setErrorMsg('');
    setIsModalOpen(true);
  };

  const openEditModal = (c: any) => {
    setEditingClient(c);
    setFormData({
      name: c.name || '',
      code: c.code || '',
      vatCode: c.vatCode || '',
      isVatPayer: Boolean(c.isVatPayer),
      documentLang: c.documentLang || '',
      email: c.email || '',
      phone: c.phone || '',
      address: c.address || '',
      city: c.city || '',
      countryName: c.countryName || 'Lietuva'
    });
    setErrorMsg('');
    setIsModalOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name.trim()) {
      setErrorMsg(t('clients.errName'));
      return;
    }
    setSubmitting(true);
    setErrorMsg('');

    try {
      if (editingClient) {
        const res = await fetch(`/api/clients/${editingClient.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(formData)
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || t('clients.errUpdate'));
        setClients(clients.map(c => c.id === editingClient.id ? { ...c, ...data.client } : c));
      } else {
        const res = await fetch('/api/clients', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(formData)
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || t('clients.errCreate'));
        setClients([data.client, ...clients]);
      }

      setIsModalOpen(false);
    } catch (err: any) {
      setErrorMsg(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id: number, name: string) => {
    if (!window.confirm(t('clients.confirmDelete', { name }))) return;
    try {
      const res = await fetch(`/api/clients/${id}`, { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || t('clients.errDelete'));
      setClients(clients.filter(c => c.id !== id));
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
            <Building2 className="w-6 h-6 text-emerald-400" />
            <span>{t('clients.title')}</span>
          </h1>
          <p className="text-sm text-slate-400 mt-1">
            {t('clients.totalInSystem', { count: clients.length })}
          </p>
        </div>
        <button
          onClick={openCreateModal}
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs transition-colors shadow-sm self-start"
        >
          <Plus className="w-4 h-4" />
          <span>{t('clients.addNew')}</span>
        </button>
      </div>

      {/* Filter Bar */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 space-y-3">
        <div className="flex flex-col md:flex-row items-center justify-between gap-3">
          <div className="relative w-full md:w-80">
            <Search className="w-4 h-4 absolute left-3 top-3 text-slate-400" />
            <input
              type="text"
              placeholder={t('clients.searchPlaceholder')}
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
            {/* City */}
            <div className="flex items-center gap-1.5 bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1 text-xs text-slate-300">
              <span className="text-slate-400">{t('clients.city')}:</span>
              <select
                value={cityFilter}
                onChange={(e) => { setCityFilter(e.target.value); setCurrentPage(1); }}
                className="bg-transparent text-emerald-400 font-bold focus:outline-none cursor-pointer"
              >
                {citiesList.map(city => (
                  <option key={city} value={city} className="bg-slate-900 text-slate-200">
                    {city === 'ALL' ? t('clients.allCities') : city}
                  </option>
                ))}
              </select>
            </div>

            {/* PVM filter */}
            <div className="flex items-center gap-1.5 bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1 text-xs text-slate-300">
              <span className="text-slate-400">{t('clients.vat')}:</span>
              <select
                value={vatFilter}
                onChange={(e) => { setVatFilter(e.target.value as any); setCurrentPage(1); }}
                className="bg-transparent text-emerald-400 font-bold focus:outline-none cursor-pointer"
              >
                <option value="ALL" className="bg-slate-900 text-slate-200">{t('clients.all')}</option>
                <option value="WITH_VAT" className="bg-slate-900 text-slate-200">{t('clients.withVatCode')}</option>
                <option value="WITHOUT_VAT" className="bg-slate-900 text-slate-200">{t('clients.withoutVatCode')}</option>
              </select>
            </div>

            {activeFiltersCount > 0 && (
              <button
                onClick={handleResetFilters}
                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs text-rose-400 hover:bg-rose-950/30 transition-colors"
                title={t('clients.clearFilters')}
              >
                <RotateCcw className="w-3 h-3" />
                <span>{t('clients.reset')}</span>
              </button>
            )}

            {/* View Toggle */}
            <div className="flex items-center bg-slate-950 border border-slate-800 rounded-lg p-0.5 ml-auto md:ml-0">
              <button
                onClick={() => setViewMode('table')}
                className={`p-1.5 rounded ${viewMode === 'table' ? 'bg-slate-800 text-emerald-400' : 'text-slate-400 hover:text-white'}`}
                title={t('clients.tableView')}
              >
                <List className="w-4 h-4" />
              </button>
              <button
                onClick={() => setViewMode('grid')}
                className={`p-1.5 rounded ${viewMode === 'grid' ? 'bg-slate-800 text-emerald-400' : 'text-slate-400 hover:text-white'}`}
                title={t('clients.cardView')}
              >
                <LayoutGrid className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>

        <div className="flex items-center justify-between text-xs pt-1 border-t border-slate-800/60 text-slate-400">
          <div>
            {t('clients.found', { shown: filteredAndSorted.length, total: clients.length })}
          </div>
        </div>
      </div>

      {/* Table View */}
      {viewMode === 'table' ? (
        <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="text-[11px] uppercase bg-slate-950/80 text-slate-400 border-b border-slate-800 tracking-wider">
                <tr>
                  <SortableTh field="name" currentField={sortField} currentDirection={sortDirection} onSort={handleSort}>
                    {t('clients.nameCol')}
                  </SortableTh>
                  <SortableTh field="code" currentField={sortField} currentDirection={sortDirection} onSort={handleSort}>
                    {t('clients.companyCode')}
                  </SortableTh>
                  <SortableTh field="vatCode" currentField={sortField} currentDirection={sortDirection} onSort={handleSort}>
                    {t('clients.vatCode')}
                  </SortableTh>
                  <SortableTh field="city" currentField={sortField} currentDirection={sortDirection} onSort={handleSort}>
                    {t('clients.city')}
                  </SortableTh>
                  <SortableTh field="email" currentField={sortField} currentDirection={sortDirection} onSort={handleSort}>
                    {t('clients.email')}
                  </SortableTh>
                  <SortableTh field="phone" currentField={sortField} currentDirection={sortDirection} onSort={handleSort}>
                    {t('clients.phone')}
                  </SortableTh>
                  <SortableTh field="totalSalesSum" currentField={sortField} currentDirection={sortDirection} onSort={handleSort} align="right">
                    {t('clients.turnoverCol')}
                  </SortableTh>
                  <th className="py-2.5 px-3 text-center w-20">{t('clients.actions')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 font-sans">
                {paginatedClients.map((c) => (
                  <tr key={c.id} className="hover:bg-slate-800/40 transition-colors">
                    <td className="py-2.5 px-3 font-semibold text-slate-100">
                      <div className="truncate max-w-[240px]" title={c.name}>{c.name}</div>
                      {c.address && (
                        <div className="text-[10px] text-slate-500 truncate max-w-[240px]">{c.address}</div>
                      )}
                    </td>
                    <td className="py-2.5 px-3 font-mono text-slate-300">
                      {c.code || '—'}
                    </td>
                    <td className="py-2.5 px-3 font-mono text-emerald-400">
                      {c.vatCode || '—'}
                    </td>
                    <td className="py-2.5 px-3 text-slate-300">
                      {c.city || '—'}
                    </td>
                    <td className="py-2.5 px-3 text-slate-400 truncate max-w-[160px]" title={c.email || ''}>
                      {c.email ? <a className="text-emerald-400 underline" href={`/invoices?emailClientId=${c.id}`} onClick={e => e.stopPropagation()}>{c.email}</a> : '—'}
                    </td>
                    <td className="py-2.5 px-3 text-slate-400 font-mono">
                      {c.phone || '—'}
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono font-bold text-slate-200">
                      {c.totalSalesSum > 0 ? `€${Number(c.totalSalesSum).toFixed(2)}` : '—'}
                    </td>
                    <td className="py-2.5 px-3 text-center">
                      <div className="flex items-center justify-center gap-1">
                        <button
                          onClick={() => openEditModal(c)}
                          className="p-1 hover:bg-slate-800 rounded text-slate-400 hover:text-emerald-400 transition-colors"
                          title={t('clients.edit')}
                        >
                          <Edit3 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => handleDelete(c.id, c.name)}
                          className="p-1 hover:bg-slate-800 rounded text-slate-400 hover:text-rose-400 transition-colors"
                          title={t('clients.delete')}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {paginatedClients.length === 0 && (
                  <tr>
                    <td colSpan={8} className="py-12 text-center text-slate-400 font-sans">
                      {t('clients.noneFound')}
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
          onExport={() => downloadCsv('kontragentai', [{header:t('clients.csvName'),key:'name'},{header:t('clients.companyCode'),key:'code'},{header:t('clients.vatCode'),key:'vatCode'},{header:t('clients.address'),key:'address'},{header:t('clients.city'),key:'city'},{header:t('clients.email'),key:'email'},{header:t('clients.phone'),key:'phone'},{header:t('clients.turnover'),key:'totalSalesSum'}], filteredAndSorted)}
            onPageSizeChange={(newSize) => { setPageSize(newSize); setCurrentPage(1); }}
          />
        </div>
      ) : (
        /* Grid View */
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {paginatedClients.map((c) => (
              <div key={c.id} className="bg-slate-900 border border-slate-800 rounded-xl p-5 hover:border-slate-700 transition-colors shadow-sm space-y-3 flex flex-col justify-between">
                <div>
                  <div className="flex items-start justify-between gap-2">
                    <div className="font-semibold text-slate-100 text-sm leading-tight line-clamp-2">
                      {c.name}
                    </div>
                    {c.totalSalesSum > 0 && (
                      <span className="text-xs font-bold text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20 shrink-0 font-mono">
                        €{Number(c.totalSalesSum).toLocaleString(LOCALES[lang], { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                      </span>
                    )}
                  </div>

                  <div className="space-y-1.5 text-xs text-slate-400 mt-3 font-mono">
                    {c.code && (
                      <div className="flex items-center gap-1.5">
                        <span className="text-slate-500 font-sans">{t('clients.code')}:</span>
                        <span className="text-slate-300 font-medium">{c.code}</span>
                      </div>
                    )}
                    {c.vatCode && (
                      <div className="flex items-center gap-1.5">
                        <span className="text-slate-500 font-sans">{t('clients.vat')}:</span>
                        <span className="text-emerald-400 font-medium">{c.vatCode}</span>
                      </div>
                    )}
                    {c.address && (
                      <div className="flex items-center gap-1.5 truncate font-sans">
                        <MapPin className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                        <span className="truncate">{c.address}{c.city ? `, ${c.city}` : ''}</span>
                      </div>
                    )}
                    {c.email && (
                      <div className="flex items-center gap-1.5 truncate font-sans">
                        <Mail className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                        <a className="truncate text-emerald-400 underline" href={`/invoices?emailClientId=${c.id}`}>{c.email}</a>
                      </div>
                    )}
                    {c.phone && (
                      <div className="flex items-center gap-1.5 font-sans">
                        <Phone className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                        <span>{c.phone}</span>
                      </div>
                    )}
                  </div>
                </div>

                <div className="pt-3 border-t border-slate-800/80 flex items-center justify-between text-xs text-slate-500">
                  <span className="flex items-center gap-1">
                    <FileText className="w-3.5 h-3.5" />
                    <span>{t('clients.invoicesCount', { count: c.salesCount || 0 })}</span>
                  </span>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => openEditModal(c)}
                      className="p-1.5 rounded-lg text-slate-400 hover:text-emerald-400 hover:bg-slate-800 transition-colors"
                      title={t('clients.edit')}
                    >
                      <Edit3 className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => handleDelete(c.id, c.name)}
                      className="p-1.5 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-slate-800 transition-colors"
                      title={t('clients.delete')}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
            <TablePagination
              currentPage={currentPage}
              pageSize={pageSize}
              totalItems={filteredAndSorted.length}
              onPageChange={setCurrentPage}
          onExport={() => downloadCsv('kontragentai', [{header:t('clients.csvName'),key:'name'},{header:t('clients.companyCode'),key:'code'},{header:t('clients.vatCode'),key:'vatCode'},{header:t('clients.address'),key:'address'},{header:t('clients.city'),key:'city'},{header:t('clients.email'),key:'email'},{header:t('clients.phone'),key:'phone'},{header:t('clients.turnover'),key:'totalSalesSum'}], filteredAndSorted)}
              onPageSizeChange={(newSize) => { setPageSize(newSize); setCurrentPage(1); }}
            />
          </div>
        </div>
      )}

      {/* Modal Create/Edit */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-lg w-full p-6 shadow-2xl text-slate-100">
            <div className="flex items-center justify-between pb-4 border-b border-slate-800">
              <h3 className="text-lg font-bold text-white flex items-center gap-2">
                <Building2 className="w-5 h-5 text-emerald-400" />
                <span>{editingClient ? t('clients.editTitle') : t('clients.newTitle')}</span>
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
                <label className="block text-slate-300 font-semibold mb-1">
                  {t('clients.fullName')}
                </label>
                <input
                  type="text"
                  required
                  placeholder={t('clients.namePlaceholder')}
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-300 font-semibold mb-1">{t('clients.companyCode')}</label>
                  <input
                    type="text"
                    placeholder="301234567"
                    value={formData.code}
                    onChange={(e) => setFormData({ ...formData, code: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-emerald-500 font-mono"
                  />
                </div>
                <div>
                  <label className="flex items-center gap-2 mb-2"><input type="checkbox" checked={formData.isVatPayer} onChange={e => setFormData({ ...formData, isVatPayer: e.target.checked })} />{t('clients.vatPayer')}</label><label className="block text-slate-300 font-semibold mb-1">{t('clients.vatPayerCode')}</label>
                  <input
                    type="text"
                    placeholder="LT100000000000"
                    value={formData.vatCode}
                    onChange={(e) => setFormData({ ...formData, vatCode: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-emerald-500 font-mono"
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div className="col-span-2">
                  <label className="block text-slate-300 font-semibold mb-1">{t('clients.address')}</label>
                  <input
                    type="text"
                    placeholder="Gedimino pr. 10"
                    value={formData.address}
                    onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-emerald-500"
                  />
                </div>
                <div>
                  <label className="block text-slate-300 font-semibold mb-1">{t('clients.city')}</label>
                  <input
                    type="text"
                    placeholder="Vilnius"
                    value={formData.city}
                    onChange={(e) => setFormData({ ...formData, city: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-emerald-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-300 font-semibold mb-1">{t('clients.email')}</label>
                  <input
                    type="email"
                    placeholder="info@company.lt"
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-emerald-500"
                  />
                </div>
                <div>
                  <label className="block text-slate-300 font-semibold mb-1">{t('clients.phone')}</label>
                  <input
                    type="text"
                    placeholder="+37060000000"
                    value={formData.phone}
                    onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-emerald-500"
                  />
                </div>
                <div className="md:col-span-2">
                  <label className="block text-slate-300 font-semibold mb-1">{t('docLang.clientField')}</label>
                  <DocLanguageSelect value={formData.documentLang} onChange={value => setFormData({ ...formData, documentLang: value })} defaultLabelKey="docLang.defaultLt" className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-emerald-500" />
                </div>
              </div>

              <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 text-sm font-medium text-slate-300 hover:bg-slate-800 rounded-lg"
                >
                  {t('clients.cancel')}
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-5 py-2 text-sm font-bold text-white bg-emerald-600 hover:bg-emerald-500 rounded-lg disabled:opacity-50"
                >
                  {submitting ? t('clients.saving') : (editingClient ? t('clients.save') : t('clients.create'))}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
