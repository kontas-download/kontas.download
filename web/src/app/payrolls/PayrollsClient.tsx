'use client';

import React, { useState, useMemo } from 'react';
import { 
  Wallet, 
  Plus, 
  Edit3, 
  Trash2, 
  X, 
  AlertCircle,
  Users,
  Search,
  Calendar,
  Filter,
  RotateCcw
} from 'lucide-react';
import { useI18n } from '@/lib/i18n/client';
import { LOCALES } from '@/lib/i18n/config';
import { SortableTh, compareValues, TablePagination, SortDirection, usePageSize, downloadCsv } from '@/components/TableSort';

interface EmployeeLine {
  employeeName: string;
  employeeCode?: string;
  grossSalary: number;
  netSalary: number;
  gpm: number;
  sodraEmployee: number;
  sodraEmployer: number;
}

// Splits a translated text on {name} markers and substitutes the given nodes.
function rich(text: string, nodes: Record<string, React.ReactNode>) {
  return text.split(/(\{\w+\})/).map((part, i) => {
    const name = part.match(/^\{(\w+)\}$/)?.[1];
    return name && name in nodes ? <React.Fragment key={i}>{nodes[name]}</React.Fragment> : part;
  });
}

// Estimate rates in percent from the rules registry (provided by the server page).
export interface PayrollRules { gpm: number; sodraEmployee: number; sodraEmployer: number }

export function PayrollsClient({ initialPayrolls, payrollRules }: { initialPayrolls: any[]; payrollRules: PayrollRules }) {
  const { t, lang } = useI18n();
  const gpmRate = payrollRules.gpm / 100;
  const sodraEeRate = payrollRules.sodraEmployee / 100;
  const sodraErRate = payrollRules.sodraEmployer / 100;
  const [payrolls, setPayrolls] = useState(initialPayrolls);

  // Filter state
  const [yearFilter, setYearFilter] = useState('ALL');
  const [monthFilter, setMonthFilter] = useState('ALL');
  const [search, setSearch] = useState('');
  const [minGross, setMinGross] = useState('');
  const [maxGross, setMaxGross] = useState('');
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);

  // Sorting state
  const [sortField, setSortField] = useState<string>('period');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');

  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = usePageSize('payrolls', 25);

  // Modal
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingPayroll, setEditingPayroll] = useState<any | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const [formData, setFormData] = useState({
    year: new Date().getFullYear(),
    month: new Date().getMonth() + 1,
    employees: [
      { employeeName: 'Darbuotojas 1', employeeCode: '', grossSalary: 1500, netSalary: 978, gpm: 220, sodraEmployee: 292, sodraEmployer: 26 }
    ] as EmployeeLine[]
  });

  // Extract distinct years
  const yearsList = useMemo(() => {
    const set = new Set<string>();
    for (const p of payrolls) {
      if (p.year) set.add(String(p.year));
    }
    return ['ALL', ...Array.from(set).sort().reverse()];
  }, [payrolls]);

  const handleSort = (field: string) => {
    if (sortField === field) {
      setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
  };

  const handleResetFilters = () => {
    setYearFilter('ALL');
    setMonthFilter('ALL');
    setSearch('');
    setMinGross('');
    setMaxGross('');
    setCurrentPage(1);
  };

  const activeFiltersCount = [
    yearFilter !== 'ALL',
    monthFilter !== 'ALL',
    search.trim() !== '',
    minGross !== '',
    maxGross !== ''
  ].filter(Boolean).length;

  const filteredAndSorted = useMemo(() => {
    const filtered = payrolls.filter((p) => {
      if (yearFilter !== 'ALL' && String(p.year) !== yearFilter) return false;
      if (monthFilter !== 'ALL' && String(p.month) !== monthFilter) return false;

      const gross = Number(p.totalGross || p.sumWithVat || 0);
      if (minGross && gross < Number(minGross)) return false;
      if (maxGross && gross > Number(maxGross)) return false;

      if (!search.trim()) return true;
      const q = search.toLowerCase();
      const periodStr = `${p.year}-${String(p.month).padStart(2, '0')}`;
      return periodStr.includes(q);
    });

    return filtered.sort((a, b) => {
      let valA: any = a[sortField];
      let valB: any = b[sortField];

      if (sortField === 'period') {
        valA = Number(a.year) * 100 + Number(a.month);
        valB = Number(b.year) * 100 + Number(b.month);
      } else if (sortField === 'totalGross') {
        valA = Number(a.totalGross || a.sumWithVat || 0);
        valB = Number(b.totalGross || b.sumWithVat || 0);
      } else if (sortField === 'totalNet') {
        valA = Number(a.totalNet || 0);
        valB = Number(b.totalNet || 0);
      } else if (sortField === 'empCount') {
        valA = Number(a.empCount || 0);
        valB = Number(b.empCount || 0);
      }

      return compareValues(valA, valB, sortDirection);
    });
  }, [payrolls, yearFilter, monthFilter, search, minGross, maxGross, sortField, sortDirection]);

  // Totals
  const totals = useMemo(() => {
    return filteredAndSorted.reduce((acc, p) => {
      const gross = Number(p.totalGross || p.sumWithVat || 0);
      const net = Number(p.totalNet || 0);
      const gpm = gross * gpmRate;
      const sodra = gross * (sodraEeRate + sodraErRate);
      return {
        gross: acc.gross + gross,
        net: acc.net + net,
        gpm: acc.gpm + gpm,
        sodra: acc.sodra + sodra,
        employees: acc.employees + Number(p.empCount || 1),
      };
    }, { gross: 0, net: 0, gpm: 0, sodra: 0, employees: 0 });
  }, [filteredAndSorted, gpmRate, sodraEeRate, sodraErRate]);

  const paginatedPayrolls = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredAndSorted.slice(start, start + pageSize);
  }, [filteredAndSorted, currentPage, pageSize]);

  const openCreateModal = () => {
    setEditingPayroll(null);
    setFormData({
      year: new Date().getFullYear(),
      month: new Date().getMonth() + 1,
      employees: [
        { employeeName: 'Darbuotojas 1', employeeCode: '38500000000', grossSalary: 1500, netSalary: 978, gpm: 220, sodraEmployee: 292, sodraEmployer: 26 }
      ]
    });
    setErrorMsg('');
    setIsModalOpen(true);
  };

  const openEditModal = (p: any) => {
    setEditingPayroll(p);
    const grossVal = Number(p.totalGross || p.sumWithVat || 1500);
    const gpm = Math.round(grossVal * gpmRate * 100) / 100;
    const sodraEe = Math.round(grossVal * sodraEeRate * 100) / 100;
    const sodraEr = Math.round(grossVal * sodraErRate * 100) / 100;
    const net = Math.round((grossVal - gpm - sodraEe) * 100) / 100;

    setFormData({
      year: p.year,
      month: p.month,
      employees: [
        { 
          employeeName: 'Darbuotojas', 
          employeeCode: '', 
          grossSalary: grossVal, 
          netSalary: Number(p.totalNet || net), 
          gpm, 
          sodraEmployee: sodraEe, 
          sodraEmployer: sodraEr 
        }
      ]
    });
    setErrorMsg('');
    setIsModalOpen(true);
  };

  const handleAddEmployee = () => {
    setFormData({
      ...formData,
      employees: [
        ...formData.employees,
        { employeeName: '', employeeCode: '', grossSalary: 1000, netSalary: 650, gpm: 150, sodraEmployee: 195, sodraEmployer: 18 }
      ]
    });
  };

  const handleRemoveEmployee = (idx: number) => {
    if (formData.employees.length <= 1) return;
    setFormData({
      ...formData,
      employees: formData.employees.filter((_, i) => i !== idx)
    });
  };

  const handleGrossChange = (idx: number, gross: number) => {
    const updated = [...formData.employees];
    const gpm = Math.round(gross * gpmRate * 100) / 100;
    const sodraEe = Math.round(gross * sodraEeRate * 100) / 100;
    const sodraEr = Math.round(gross * sodraErRate * 100) / 100;
    const net = Math.round((gross - gpm - sodraEe) * 100) / 100;

    updated[idx] = {
      ...updated[idx],
      grossSalary: gross,
      gpm,
      sodraEmployee: sodraEe,
      sodraEmployer: sodraEr,
      netSalary: net
    };
    setFormData({ ...formData, employees: updated });
  };

  const handleEmpFieldChange = (idx: number, field: keyof EmployeeLine, val: any) => {
    const updated = [...formData.employees];
    updated[idx] = { ...updated[idx], [field]: val };
    setFormData({ ...formData, employees: updated });
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setErrorMsg('');

    try {
      if (editingPayroll) {
        const res = await fetch(`/api/payrolls/${editingPayroll.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(formData)
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || t('payroll.updateFailed'));
        setPayrolls(payrolls.map(p => p.id === editingPayroll.id ? { ...p, ...data.payroll } : p));
      } else {
        const res = await fetch('/api/payrolls', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(formData)
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || t('payroll.createFailed'));
        setPayrolls([data.payroll, ...payrolls]);
      }

      setIsModalOpen(false);
    } catch (err: any) {
      setErrorMsg(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (p: any) => {
    if (!window.confirm(t('payroll.confirmDelete', { year: p.year, month: p.month }))) return;
    try {
      const res = await fetch(`/api/payrolls/${p.id}`, { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || t('payroll.deleteFailed'));
      setPayrolls(payrolls.filter(item => item.id !== p.id));
    } catch (err: any) {
      alert(err.message);
    }
  };

  const formTotalGross = formData.employees.reduce((acc, emp) => acc + (Number(emp.grossSalary) || 0), 0);
  const formTotalNet = formData.employees.reduce((acc, emp) => acc + (Number(emp.netSalary) || 0), 0);
  const formTotalGpm = formData.employees.reduce((acc, emp) => acc + (Number(emp.gpm) || 0), 0);
  const formTotalSodra = formData.employees.reduce((acc, emp) => acc + (Number(emp.sodraEmployee) || 0) + (Number(emp.sodraEmployer) || 0), 0);

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight flex items-center gap-2">
            <Wallet className="w-6 h-6 text-emerald-400" />
            <span>{t('payroll.title')}</span>
          </h1>
          <p className="text-sm text-slate-400 mt-1">
            {rich(t('payroll.totalCount', { count: '{count}' }), { count: <strong className="text-white font-mono">{payrolls.length}</strong> })}
          </p>
        </div>
        <button
          onClick={openCreateModal}
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs transition-colors shadow-sm self-start"
        >
          <Plus className="w-4 h-4" />
          <span>{t('payroll.new')}</span>
        </button>
      </div>

      {/* Filter Bar */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 space-y-3">
        <div className="flex flex-col md:flex-row items-center justify-between gap-3">
          <div className="flex items-center gap-2 w-full md:w-auto flex-wrap">
            {/* Year selector */}
            <div className="flex items-center gap-1.5 bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1 text-xs text-slate-300">
              <span className="text-slate-400">{t('payroll.year')}</span>
              <select
                value={yearFilter}
                onChange={(e) => { setYearFilter(e.target.value); setCurrentPage(1); }}
                className="bg-transparent text-emerald-400 font-bold focus:outline-none cursor-pointer"
              >
                {yearsList.map(y => (
                  <option key={y} value={y} className="bg-slate-900 text-slate-200">
                    {y === 'ALL' ? t('payroll.allYears') : t('payroll.yearOption', { year: y })}
                  </option>
                ))}
              </select>
            </div>

            {/* Month selector */}
            <div className="flex items-center gap-1.5 bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1 text-xs text-slate-300">
              <span className="text-slate-400">{t('payroll.month')}</span>
              <select
                value={monthFilter}
                onChange={(e) => { setMonthFilter(e.target.value); setCurrentPage(1); }}
                className="bg-transparent text-emerald-400 font-bold focus:outline-none cursor-pointer"
              >
                <option value="ALL" className="bg-slate-900 text-slate-200">{t('payroll.allMonths')}</option>
                {['1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12'].map(m => (
                  <option key={m} value={m} className="bg-slate-900 text-slate-200">{t(`payroll.m${m}`)}</option>
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
              <span>{t('payroll.filters')}</span>
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
                title={t('payroll.clearFilters')}
              >
                <RotateCcw className="w-3 h-3" />
                <span>{t('payroll.reset')}</span>
              </button>
            )}
          </div>
        </div>

        {/* Advanced Filters */}
        {showAdvancedFilters && (
          <div className="pt-3 border-t border-slate-800/80 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 text-xs">
            <div>
              <label className="block text-slate-400 font-medium mb-1">{t('payroll.grossFrom')}</label>
              <input
                type="number"
                placeholder="0.00"
                value={minGross}
                onChange={(e) => { setMinGross(e.target.value); setCurrentPage(1); }}
                className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-slate-200 font-mono focus:outline-none focus:border-emerald-500"
              />
            </div>
            <div>
              <label className="block text-slate-400 font-medium mb-1">{t('payroll.grossTo')}</label>
              <input
                type="number"
                placeholder="99999.00"
                value={maxGross}
                onChange={(e) => { setMaxGross(e.target.value); setCurrentPage(1); }}
                className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-slate-200 font-mono focus:outline-none focus:border-emerald-500"
              />
            </div>
          </div>
        )}

        {/* Live Filter Summary Strip */}
        <div className="flex flex-wrap items-center justify-between text-xs pt-2 border-t border-slate-800/60 text-slate-400">
          <div>
            {rich(t('payroll.found', { count: '{count}', total: payrolls.length }), { count: <strong className="text-white font-mono">{filteredAndSorted.length}</strong> })}
          </div>
          <div className="flex items-center gap-4 font-mono">
            <span>{t('payroll.sumGross')} <strong className="text-slate-200">€{totals.gross.toLocaleString(LOCALES[lang], { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong></span>
            <span>{t('payroll.sumGpm')} <strong className="text-slate-400">€{totals.gpm.toLocaleString(LOCALES[lang], { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong></span>
            <span>{t('payroll.sumNet')} <strong className="text-emerald-400 text-sm font-bold">€{totals.net.toLocaleString(LOCALES[lang], { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong></span>
          </div>
        </div>
      </div>

      {/* Payrolls Table */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="text-[11px] uppercase bg-slate-950/80 text-slate-400 border-b border-slate-800 tracking-wider">
              <tr>
                <SortableTh field="period" currentField={sortField} currentDirection={sortDirection} onSort={handleSort}>
                  {t('payroll.colPeriod')}
                </SortableTh>
                <SortableTh field="empCount" currentField={sortField} currentDirection={sortDirection} onSort={handleSort} align="center">
                  {t('payroll.colEmployees')}
                </SortableTh>
                <SortableTh field="totalGross" currentField={sortField} currentDirection={sortDirection} onSort={handleSort} align="right">
                  {t('payroll.colGross')}
                </SortableTh>
                <SortableTh field="totalNet" currentField={sortField} currentDirection={sortDirection} onSort={handleSort} align="right">
                  {t('payroll.colNet')}
                </SortableTh>
                <th className="py-2.5 px-3 text-center">{t('payroll.colStatus')}</th>
                <th className="py-2.5 px-3 text-center w-20">{t('payroll.colActions')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 font-mono">
              {paginatedPayrolls.map((p) => (
                <tr key={p.id} className="hover:bg-slate-800/40 transition-colors">
                  <td className="py-3 px-3 font-bold text-slate-100 font-sans">
                    <span className="text-emerald-400 font-mono font-bold mr-1.5">{t('payroll.yearShort', { year: p.year })}</span>
                    <span>{t('payroll.monthShort', { month: String(p.month).padStart(2, '0') })}</span>
                  </td>
                  <td className="py-3 px-3 text-center">
                    <span className="px-2 py-0.5 rounded bg-slate-950 border border-slate-800 text-[10px] text-slate-300">
                      {t('payroll.persons', { count: p.empCount || 1 })}
                    </span>
                  </td>
                  <td className="py-3 px-3 text-right text-slate-200">
                    €{(p.totalGross || p.sumWithVat || 0).toFixed(2)}
                  </td>
                  <td className="py-3 px-3 text-right font-bold text-emerald-400 text-sm">
                    €{(p.totalNet || 0).toFixed(2)}
                  </td>
                  <td className="py-3 px-3 text-center font-sans">
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                      {t('payroll.statusCalculated')}
                    </span>
                  </td>
                  <td className="py-3 px-3 text-center">
                    <div className="flex items-center justify-center gap-1">
                      <button
                        onClick={() => openEditModal(p)}
                        className="p-1 hover:bg-slate-800 rounded text-slate-400 hover:text-emerald-400 transition-colors"
                        title={t('payroll.edit')}
                      >
                        <Edit3 className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => handleDelete(p)}
                        className="p-1 hover:bg-slate-800 rounded text-slate-400 hover:text-rose-400 transition-colors"
                        title={t('payroll.delete')}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {paginatedPayrolls.length === 0 && (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-slate-400 font-sans">
                    {t('payroll.empty')}
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
          onExport={() => downloadCsv('darbo_uzmokestis', [{header:t('payroll.csvYear'),key:'year'},{header:t('payroll.csvMonth'),key:'month'},{header:t('payroll.csvEmployees'),key:'empCount'},{header:t('payroll.csvGross'),key:'totalGross'},{header:t('payroll.csvNet'),key:'totalNet'}], filteredAndSorted)}
          onPageSizeChange={(newSize) => { setPageSize(newSize); setCurrentPage(1); }}
        />
      </div>

      {/* Modal: Create/Edit Payroll */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-2xl w-full p-6 shadow-2xl text-slate-100 max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between pb-4 border-b border-slate-800">
              <h3 className="text-lg font-bold text-white flex items-center gap-2">
                <Wallet className="w-5 h-5 text-emerald-400" />
                <span>{editingPayroll ? t('payroll.modalEdit') : t('payroll.modalNew')}</span>
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
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-300 font-semibold mb-1">{t('payroll.formYear')}</label>
                  <input
                    type="number"
                    min="2010"
                    max="2035"
                    required
                    value={formData.year}
                    onChange={(e) => setFormData({ ...formData, year: parseInt(e.target.value, 10) })}
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100 font-mono focus:outline-none focus:border-emerald-500"
                  />
                </div>
                <div>
                  <label className="block text-slate-300 font-semibold mb-1">{t('payroll.formMonth')}</label>
                  <input
                    type="number"
                    min="1"
                    max="12"
                    required
                    value={formData.month}
                    onChange={(e) => setFormData({ ...formData, month: parseInt(e.target.value, 10) })}
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100 font-mono focus:outline-none focus:border-emerald-500"
                  />
                </div>
              </div>

              {/* Employee lines */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-slate-300">{t('payroll.employeesCalc')}</span>
                  <button
                    type="button"
                    onClick={handleAddEmployee}
                    className="inline-flex items-center gap-1 text-xs text-emerald-400 hover:text-emerald-300 font-semibold"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>{t('payroll.addEmployee')}</span>
                  </button>
                </div>

                <div className="space-y-2">
                  {formData.employees.map((emp, idx) => (
                    <div key={idx} className="bg-slate-950 p-2.5 rounded-lg border border-slate-800 space-y-2">
                      <div className="flex items-center gap-2">
                        <div className="flex-1">
                          <input
                            type="text"
                            required
                            placeholder={t('payroll.namePlaceholder')}
                            value={emp.employeeName}
                            onChange={(e) => handleEmpFieldChange(idx, 'employeeName', e.target.value)}
                            className="w-full bg-slate-900 border border-slate-700 rounded px-2.5 py-1.5 text-xs text-slate-100 focus:outline-none focus:border-emerald-500"
                          />
                        </div>
                        <div className="w-32">
                          <input
                            type="text"
                            placeholder={t('payroll.codePlaceholder')}
                            value={emp.employeeCode}
                            onChange={(e) => handleEmpFieldChange(idx, 'employeeCode', e.target.value)}
                            className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1.5 text-xs text-slate-100 font-mono focus:outline-none focus:border-emerald-500"
                          />
                        </div>
                        <div className="w-24">
                          <input
                            type="number"
                            min="0"
                            step="0.01"
                            required
                            placeholder={t('payroll.grossPlaceholder')}
                            value={emp.grossSalary}
                            onChange={(e) => handleGrossChange(idx, parseFloat(e.target.value) || 0)}
                            className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1.5 text-xs text-slate-100 font-mono text-right focus:outline-none focus:border-emerald-500"
                          />
                        </div>
                        {formData.employees.length > 1 && (
                          <button
                            type="button"
                            onClick={() => handleRemoveEmployee(idx)}
                            className="p-1 hover:text-rose-400 text-slate-500"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        )}
                      </div>

                      {/* Tax Breakdown */}
                      <div className="grid grid-cols-4 gap-2 pt-1 border-t border-slate-900 text-[11px] font-mono">
                        <div>
                          <span className="text-slate-500 font-sans">{t('payroll.gpm20', { rate: payrollRules.gpm })}</span> €{emp.gpm.toFixed(2)}
                        </div>
                        <div>
                          <span className="text-slate-500 font-sans">{t('payroll.sodra195', { rate: payrollRules.sodraEmployee })}</span> €{emp.sodraEmployee.toFixed(2)}
                        </div>
                        <div>
                          <span className="text-slate-500 font-sans">{t('payroll.employer177', { rate: payrollRules.sodraEmployer })}</span> €{emp.sodraEmployer.toFixed(2)}
                        </div>
                        <div className="text-right font-bold text-emerald-400">
                          <span className="text-slate-500 font-sans font-normal">{t('payroll.net')}</span> €{emp.netSalary.toFixed(2)}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Form Totals */}
                <div className="bg-slate-950 p-3 rounded-xl border border-slate-800 grid grid-cols-4 gap-2 text-center text-xs">
                  <div>
                    <div className="text-slate-400">{t('payroll.totalGross')}</div>
                    <div className="font-bold text-slate-100 font-mono">€{formTotalGross.toFixed(2)}</div>
                  </div>
                  <div>
                    <div className="text-slate-400">{t('payroll.totalGpm', { rate: payrollRules.gpm })}</div>
                    <div className="font-bold text-slate-300 font-mono">€{formTotalGpm.toFixed(2)}</div>
                  </div>
                  <div>
                    <div className="text-slate-400">{t('payroll.totalSodra')}</div>
                    <div className="font-bold text-slate-300 font-mono">€{formTotalSodra.toFixed(2)}</div>
                  </div>
                  <div>
                    <div className="text-slate-400">{t('payroll.totalNet')}</div>
                    <div className="font-bold text-emerald-400 font-mono text-sm">€{formTotalNet.toFixed(2)}</div>
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 text-sm font-medium text-slate-300 hover:bg-slate-800 rounded-lg"
                >
                  {t('payroll.cancel')}
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-5 py-2 text-sm font-bold text-white bg-emerald-600 hover:bg-emerald-500 rounded-lg disabled:opacity-50"
                >
                  {submitting ? t('payroll.saving') : (editingPayroll ? t('payroll.save') : t('payroll.create'))}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
