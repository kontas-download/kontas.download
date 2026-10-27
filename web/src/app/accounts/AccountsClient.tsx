'use client';

import React, { useState, useMemo } from 'react';
import { 
  BookOpen, 
  Search, 
  Plus, 
  Edit3, 
  Trash2, 
  X, 
  AlertCircle,
  RotateCcw
} from 'lucide-react';
import { useT } from '@/lib/i18n/client';
import { SortableTh, compareValues, TablePagination, SortDirection, usePageSize, downloadCsv } from '@/components/TableSort';

export function AccountsClient({ initialAccounts }: { initialAccounts: any[] }) {
  const t = useT();
  const [accounts, setAccounts] = useState(initialAccounts);
  const [search, setSearch] = useState('');
  const [selectedClass, setSelectedClass] = useState('ALL');

  // Sorting state
  const [sortField, setSortField] = useState<string>('code');
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc');

  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = usePageSize('accounts', 50);

  // Modal
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingAcc, setEditingAcc] = useState<any | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const [formData, setFormData] = useState({
    code: '',
    name: ''
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
    setSelectedClass('ALL');
    setCurrentPage(1);
  };

  const filteredAndSorted = useMemo(() => {
    const filtered = accounts.filter((acc) => {
      const classNum = acc.code.charAt(0);
      const matchClass = selectedClass === 'ALL' || classNum === selectedClass;
      if (!matchClass) return false;

      if (!search.trim()) return true;
      const q = search.toLowerCase();
      return (
        acc.code.toLowerCase().includes(q) ||
        acc.name.toLowerCase().includes(q)
      );
    });

    return filtered.sort((a, b) => {
      let valA: any = a[sortField];
      let valB: any = b[sortField];

      if (sortField === 'class') {
        valA = a.code.charAt(0);
        valB = b.code.charAt(0);
      }

      return compareValues(valA, valB, sortDirection);
    });
  }, [accounts, search, selectedClass, sortField, sortDirection]);

  const paginatedAccounts = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredAndSorted.slice(start, start + pageSize);
  }, [filteredAndSorted, currentPage, pageSize]);

  const openCreateModal = () => {
    setEditingAcc(null);
    setFormData({ code: '', name: '' });
    setErrorMsg('');
    setIsModalOpen(true);
  };

  const openEditModal = (acc: any) => {
    setEditingAcc(acc);
    setFormData({ code: acc.code, name: acc.name });
    setErrorMsg('');
    setIsModalOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.code.trim() || !formData.name.trim()) {
      setErrorMsg(t('accounts.enterCodeName'));
      return;
    }
    setSubmitting(true);
    setErrorMsg('');

    try {
      if (editingAcc) {
        const res = await fetch(`/api/accounts/${editingAcc.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(formData)
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || t('accounts.updateFailed'));
        setAccounts(accounts.map(a => a.id === editingAcc.id ? { ...a, ...data.account } : a));
      } else {
        const res = await fetch('/api/accounts', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(formData)
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || t('accounts.createFailed'));
        setAccounts([...accounts, data.account].sort((a, b) => a.code.localeCompare(b.code, undefined, { numeric: true })));
      }

      setIsModalOpen(false);
    } catch (err: any) {
      setErrorMsg(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (acc: any) => {
    if (!window.confirm(t('accounts.confirmDelete', { code: acc.code, name: acc.name }))) return;
    try {
      const res = await fetch(`/api/accounts/${acc.id}`, { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || t('accounts.deleteFailed'));
      setAccounts(accounts.filter(a => a.id !== acc.id));
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
            <BookOpen className="w-6 h-6 text-emerald-400" />
            <span>{t('accounts.title')}</span>
          </h1>
          <p className="text-sm text-slate-400 mt-1">
            {t('accounts.subtitle')}
          </p>
        </div>
        <button
          onClick={openCreateModal}
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs transition-colors shadow-sm self-start"
        >
          <Plus className="w-4 h-4" />
          <span>{t('accounts.addNew')}</span>
        </button>
      </div>

      {/* Filter Bar */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 flex flex-col md:flex-row items-center justify-between gap-4">
        <div className="relative w-full md:w-80">
          <Search className="w-4 h-4 absolute left-3 top-3 text-slate-400" />
          <input
            type="text"
            placeholder={t('accounts.searchPlaceholder')}
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

        <div className="flex items-center gap-1.5 overflow-x-auto w-full md:w-auto pb-1 md:pb-0">
          {[
            { id: 'ALL', label: t('accounts.all') },
            { id: '1', label: t('accounts.class1') },
            { id: '2', label: t('accounts.class2s') },
            { id: '3', label: t('accounts.class3s') },
            { id: '4', label: t('accounts.class4') },
            { id: '5', label: t('accounts.class5') },
            { id: '6', label: t('accounts.class6') }
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => { setSelectedClass(tab.id); setCurrentPage(1); }}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors ${
                selectedClass === tab.id
                  ? 'bg-emerald-600 text-white'
                  : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
              }`}
            >
              {tab.label}
            </button>
          ))}

          {(search || selectedClass !== 'ALL') && (
            <button
              onClick={handleResetFilters}
              className="p-1.5 rounded-lg text-xs text-rose-400 hover:bg-rose-950/30 transition-colors"
              title={t('accounts.resetFilters')}
            >
              <RotateCcw className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Accounts Table */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="text-[11px] uppercase bg-slate-950/80 text-slate-400 border-b border-slate-800 tracking-wider">
              <tr>
                <SortableTh field="code" currentField={sortField} currentDirection={sortDirection} onSort={handleSort} className="w-32">
                  {t('accounts.colCode')}
                </SortableTh>
                <SortableTh field="class" currentField={sortField} currentDirection={sortDirection} onSort={handleSort} className="w-48">
                  {t('accounts.colClass')}
                </SortableTh>
                <SortableTh field="name" currentField={sortField} currentDirection={sortDirection} onSort={handleSort}>
                  {t('accounts.colName')}
                </SortableTh>
                <th className="py-2.5 px-3 text-center w-20">{t('common.actions')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 font-mono">
              {paginatedAccounts.map((acc) => {
                const classNum = acc.code.charAt(0);
                let classLabel = t('accounts.classN', { n: classNum });
                if (classNum === '1') classLabel = t('accounts.class1');
                else if (classNum === '2') classLabel = t('accounts.class2');
                else if (classNum === '3') classLabel = t('accounts.class3');
                else if (classNum === '4') classLabel = t('accounts.class4');
                else if (classNum === '5') classLabel = t('accounts.class5');
                else if (classNum === '6') classLabel = t('accounts.class6');

                return (
                  <tr key={acc.id} className="hover:bg-slate-800/40 transition-colors">
                    <td className="py-2.5 px-4 font-bold text-emerald-400 text-sm">{acc.code}</td>
                    <td className="py-2.5 px-4 text-slate-400 font-sans">{classLabel}</td>
                    <td className="py-2.5 px-4 text-slate-200 font-sans text-xs font-semibold">{acc.name}</td>
                    <td className="py-2.5 px-4 text-center font-sans">
                      <div className="flex items-center justify-center gap-1">
                        <button
                          onClick={() => openEditModal(acc)}
                          className="p-1 hover:bg-slate-800 rounded text-slate-400 hover:text-emerald-400 transition-colors"
                          title={t('common.edit')}
                        >
                          <Edit3 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => handleDelete(acc)}
                          className="p-1 hover:bg-slate-800 rounded text-slate-400 hover:text-rose-400 transition-colors"
                          title={t('common.delete')}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {paginatedAccounts.length === 0 && (
                <tr>
                  <td colSpan={4} className="py-12 text-center text-slate-400 font-sans">
                    {t('accounts.noResults')}
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
          onExport={() => downloadCsv('saskaitu_planas', [{header:t('accounts.csvCode'),key:'code'},{header:t('accounts.csvName'),key:'name'}], filteredAndSorted)}
          onPageSizeChange={(newSize) => { setPageSize(newSize); setCurrentPage(1); }}
        />
      </div>

      {/* Modal: Create/Edit Account */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-md w-full p-6 shadow-2xl text-slate-100">
            <div className="flex items-center justify-between pb-4 border-b border-slate-800">
              <h3 className="text-lg font-bold text-white flex items-center gap-2">
                <BookOpen className="w-5 h-5 text-emerald-400" />
                <span>{editingAcc ? t('accounts.editAccount') : t('accounts.newAccount')}</span>
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
                <label className="block text-slate-300 font-semibold mb-1">{t('accounts.codeRequired')}</label>
                <input
                  type="text"
                  required
                  placeholder={t('accounts.placeholderCode')}
                  value={formData.code}
                  onChange={(e) => setFormData({ ...formData, code: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100 font-mono focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div>
                <label className="block text-slate-300 font-semibold mb-1">{t('accounts.nameRequired')}</label>
                <input
                  type="text"
                  required
                  placeholder={t('accounts.placeholderName')}
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-emerald-500"
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
                  {submitting ? t('accounts.saving') : (editingAcc ? t('common.save') : t('accounts.create'))}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
