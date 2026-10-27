'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useT } from '@/lib/i18n/client';
import { 
  Building2, 
  Plus, 
  CheckCircle2, 
  Edit3, 
  Trash2, 
  Upload, 
  CreditCard, 
  MapPin, 
  Phone, 
  Mail, 
  TrendingUp, 
  Receipt, 
  Users, 
  ShoppingCart,
  Landmark,
  X,
  AlertCircle
} from 'lucide-react';
import { CompanyWithStats } from '@/lib/company';
import { CompanySmtpDialog } from '@/components/CompanySmtpDialog';
import { AccountingControlDialog } from '@/components/AccountingControlDialog';
import { CompanyDataPanel } from '@/components/CompanyDataPanel';

interface Props {
  initialCompanies: CompanyWithStats[];
  activeCompanyId: number;
  // Accountants do not see administrator-only actions; the API refuses them anyway.
  isAdmin: boolean;
}

export function CompaniesClient({ initialCompanies, activeCompanyId, isAdmin }: Props) {
  const router = useRouter();
  const t = useT();
  const [companies, setCompanies] = useState<CompanyWithStats[]>(initialCompanies);
  const [activeId, setActiveId] = useState<number>(activeCompanyId);

  // Modals state
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [editingCompany, setEditingCompany] = useState<CompanyWithStats | null>(null);
  const [smtpCompany, setSmtpCompany] = useState<CompanyWithStats | null>(null);
  const [controlCompany, setControlCompany] = useState<CompanyWithStats | null>(null);
  const [dataCompany, setDataCompany] = useState<CompanyWithStats | null>(null);
  const [importingCompanyId, setImportingCompanyId] = useState<number | null>(null);

  // Form states
  const [formData, setFormData] = useState({
    name: '',
    code: '',
    vatCode: '',
    isVatPayer: false,
    taxMode: 'NON_VAT',
    taxEffectiveFrom: new Date().toISOString().slice(0,10),
    address: '',
    email: '',
    phone: '',
    bankName: '',
    bankIban: '',
    bankSwift: '',
    currencyCode: 'EUR'
  });

  const [importFile, setImportFile] = useState<File | null>(null);
  const [importStatus, setImportStatus] = useState<string>('');
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [creatingDemo, setCreatingDemo] = useState(false);

  const openCreateModal = () => {
    setFormData({
      name: '',
      code: '',
      vatCode: '',
    isVatPayer: false,
    taxMode: 'NON_VAT',
    taxEffectiveFrom: new Date().toISOString().slice(0,10),
      address: '',
      email: '',
      phone: '',
      bankName: '',
      bankIban: '',
      bankSwift: '',
      currencyCode: 'EUR'
    });
    setErrorMsg('');
    setIsCreateOpen(true);
  };

  const openEditModal = (comp: CompanyWithStats) => {
    setEditingCompany(comp);
    setFormData({
      name: comp.name || '',
      code: comp.code || '',
      vatCode: comp.vatCode || '',
      isVatPayer: Boolean(comp.isVatPayer),
      taxMode: comp.taxMode || (comp.isVatPayer ? 'STANDARD_VAT' : 'NON_VAT'),
      taxEffectiveFrom: new Date().toISOString().slice(0,10),
      address: comp.address || '',
      email: comp.email || '',
      phone: comp.phone || '',
      bankName: comp.bankName || '',
      bankIban: comp.bankIban || '',
      bankSwift: comp.bankSwift || '',
      currencyCode: comp.currencyCode || 'EUR'
    });
    setErrorMsg('');
  };

  const handleSwitchActive = async (companyId: number) => {
    try {
      const res = await fetch('/api/companies/switch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ companyId })
      });
      if (res.ok) {
        setActiveId(companyId);
        window.location.reload();
      }
    } catch (e: any) {
      alert(t('companies.switchError', { message: e.message }));
    }
  };

  const handleCreateCompany = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name.trim()) {
      setErrorMsg(t('companies.enterName'));
      return;
    }
    setSubmitting(true);
    setErrorMsg('');

    try {
      const res = await fetch('/api/companies', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData)
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || t('companies.createFailed'));
      }

      setIsCreateOpen(false);
      window.location.reload();
    } catch (err: any) {
      setErrorMsg(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleUpdateCompany = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingCompany) return;
    setSubmitting(true);
    setErrorMsg('');

    try {
      const res = await fetch(`/api/companies/${editingCompany.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData)
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || t('companies.updateFailed'));
      }

      setEditingCompany(null);
      window.location.reload();
    } catch (err: any) {
      setErrorMsg(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteCompany = async (comp: CompanyWithStats) => {
    if (companies.length <= 1) {
      alert(t('companies.cannotDeleteOnly'));
      return;
    }
    const confirmDelete = window.confirm(
      t('companies.confirmDelete', { name: comp.name })
    );
    if (!confirmDelete) return;

    try {
      const res = await fetch(`/api/companies/${comp.id}`, { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || t('companies.deleteFailed'));
      }
      window.location.reload();
    } catch (e: any) {
      alert(e.message);
    }
  };

  // Fictional demonstration company; after creation it becomes the active company through the usual switch.
  const handleCreateDemo = async () => {
    if (!window.confirm(t('demo.confirm'))) return;
    setCreatingDemo(true);
    let companyId: number;
    try {
      const res = await fetch('/api/demo', { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || res.statusText);
      companyId = data.companyId;
    } catch (e) {
      alert(t('demo.failed', { message: (e as Error).message }));
      setCreatingDemo(false);
      return;
    }
    // The company exists from here on: a failed switch must not be reported as a failed creation.
    try {
      const res = await fetch('/api/companies/switch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ companyId })
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || res.statusText);
      setActiveId(companyId);
    } catch (e) {
      alert(t('demo.createdNotSwitched', { message: (e as Error).message }));
    }
    window.location.reload();
  };

  const handleImportSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!importFile || !importingCompanyId) {
      alert(t('companies.chooseJson'));
      return;
    }

    setSubmitting(true);
    setImportStatus(t('companies.importReading'));

    try {
      const text = await importFile.text();
      const jsonData = JSON.parse(text);

      setImportStatus(t('companies.importSending'));
      const res = await fetch('/api/companies/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          companyId: importingCompanyId,
          jsonData
        })
      });

      const resData = await res.json();
      if (!res.ok) {
        throw new Error(resData.error || t('companies.importError'));
      }

      setImportStatus('✅ ' + t('companies.importDone'));
      setTimeout(() => {
        setImportingCompanyId(null);
        window.location.reload();
      }, 1200);
    } catch (err: any) {
      setImportStatus('❌ ' + t('companies.importFailed', { message: err.message }));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-8">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2.5">
            <Building2 className="w-7 h-7 text-emerald-600" />
            <span>{t('companies.title')}</span>
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            {t('companies.subtitle')}
          </p>
        </div>

        {isAdmin && <button
          onClick={handleCreateDemo}
          disabled={creatingDemo}
          className="inline-flex items-center px-4 py-2 text-sm font-semibold text-slate-200 border border-slate-700 rounded-lg hover:bg-slate-800 disabled:opacity-50"
        >
          {creatingDemo ? t('demo.creating') : t('demo.create')}
        </button>}
        {isAdmin && <a href="/api/admin/backup" download className="inline-flex items-center px-4 py-2 text-sm font-semibold text-slate-200 border border-slate-700 rounded-lg hover:bg-slate-800">{t('companies.backupFull')}</a>}
        {isAdmin && <button
          onClick={openCreateModal}
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-medium text-sm transition-colors shadow-sm"
        >
          <Plus className="w-4 h-4" />
          <span>{t('companies.createNew')}</span>
        </button>}
      </div>

      {/* Companies Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {companies.map((comp) => {
          const isActive = comp.id === activeId;

          return (
            <div
              key={comp.id}
              className={`rounded-2xl border transition-all p-6 bg-white shadow-sm flex flex-col justify-between ${
                isActive 
                  ? 'border-emerald-500 ring-2 ring-emerald-500/20' 
                  : 'border-slate-200 hover:border-slate-300'
              }`}
            >
              <div>
                {/* Title & Status */}
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className={`w-12 h-12 rounded-xl flex items-center justify-center font-bold text-lg ${
                      isActive 
                        ? 'bg-emerald-100 text-emerald-800 border border-emerald-300' 
                        : 'bg-slate-100 text-slate-700'
                    }`}>
                      {comp.name.slice(0, 2).toUpperCase()}
                    </div>
                    <div>
                      <h2 className="text-lg font-bold text-slate-900 leading-tight">
                        {comp.name}
                      </h2>
                      <div className="text-xs text-slate-500 mt-0.5 flex items-center gap-2">
                        {comp.code && <span>{t('companies.codeLabel')}: <strong className="text-slate-700">{comp.code}</strong></span>}
                        {comp.vatCode && <span>{t('companies.vatLabel')}: <strong className="text-slate-700">{comp.vatCode}</strong></span>}
                      </div>
                    </div>
                  </div>

                  {isActive ? (
                    <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800 border border-emerald-300">
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                      {t('companies.activeCompany')}
                    </span>
                  ) : (
                    <button
                      onClick={() => handleSwitchActive(comp.id)}
                      className="px-3 py-1 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors"
                    >
                      {t('companies.switchHere')}
                    </button>
                  )}
                </div>

                {/* Company Contact / Bank Details */}
                <div className="mt-5 space-y-2 text-xs text-slate-600 border-t border-slate-100 pt-4">
                  {comp.address && (
                    <div className="flex items-center gap-2">
                      <MapPin className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                      <span className="truncate">{comp.address}</span>
                    </div>
                  )}
                  {comp.bankIban && (
                    <div className="flex items-center gap-2">
                      <CreditCard className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                      <span>{comp.bankName ? `${comp.bankName}: ` : ''}<code className="bg-slate-50 px-1 py-0.5 rounded text-slate-800 font-mono">{comp.bankIban}</code></span>
                    </div>
                  )}
                  <div className="flex items-center gap-4 text-slate-500">
                    {comp.email && (
                      <span className="flex items-center gap-1.5">
                        <Mail className="w-3.5 h-3.5 text-slate-400" />
                        {comp.email}
                      </span>
                    )}
                    {comp.phone && (
                      <span className="flex items-center gap-1.5">
                        <Phone className="w-3.5 h-3.5 text-slate-400" />
                        {comp.phone}
                      </span>
                    )}
                  </div>
                </div>

                {/* Mini Stats */}
                <div className="grid grid-cols-4 gap-2 mt-5 p-3 rounded-xl bg-slate-50 border border-slate-100 text-center">
                  <div>
                    <div className="text-[11px] text-slate-500">{t('companies.statSales')}</div>
                    <div className="text-sm font-bold text-slate-900 mt-0.5">{comp.salesCount}</div>
                  </div>
                  <div>
                    <div className="text-[11px] text-slate-500">{t('companies.statPurchases')}</div>
                    <div className="text-sm font-bold text-slate-900 mt-0.5">{comp.purchasesCount}</div>
                  </div>
                  <div>
                    <div className="text-[11px] text-slate-500">{t('companies.statClients')}</div>
                    <div className="text-sm font-bold text-slate-900 mt-0.5">{comp.clientsCount}</div>
                  </div>
                  <div>
                    <div className="text-[11px] text-slate-500">{t('companies.statBank')}</div>
                    <div className="text-sm font-bold text-slate-900 mt-0.5">{comp.bankCount}</div>
                  </div>
                </div>
              </div>

              {/* Bottom Actions */}
              {isAdmin && <button onClick={() => setControlCompany(comp)} className="mt-4 mr-4 text-sm font-semibold text-emerald-700 underline">{t('companies.controlTitle')}</button>}
              {isAdmin && <button onClick={() => setDataCompany(comp)} className="mt-4 mr-4 text-sm font-semibold text-emerald-700 underline">{t('companies.dataButton')}</button>}
              <button onClick={() => setSmtpCompany(comp)} className="mt-4 text-sm font-semibold text-emerald-700 underline">{t('companies.smtpButton')}</button>
              <div className="mt-6 pt-4 border-t border-slate-100 flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => openEditModal(comp)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 transition-colors"
                  >
                    <Edit3 className="w-3.5 h-3.5 text-slate-500" />
                    <span>{t('common.edit')}</span>
                  </button>

                  {isAdmin && <button
                    onClick={() => setImportingCompanyId(comp.id)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-emerald-700 bg-emerald-50 border border-emerald-200 hover:bg-emerald-100 transition-colors"
                  >
                    <Upload className="w-3.5 h-3.5 text-emerald-600" />
                    <span>{t('companies.importBackup')}</span>
                  </button>}
                </div>

                {isAdmin && companies.length > 1 && (
                  <button
                    onClick={() => handleDeleteCompany(comp)}
                    title={t('companies.deleteCompany')}
                    className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Modal: Create Company */}
      {dataCompany && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-3" role="dialog" aria-modal="true" aria-label={t('companies.dataButton')}>
          <div className="bg-slate-900 text-slate-100 rounded-xl border border-slate-700 shadow-xl w-full max-w-5xl max-h-[92vh] overflow-y-auto p-6">
            <div className="flex items-center justify-between mb-4"><h2 className="text-lg font-bold">{t('companies.dataButton')}: {dataCompany.name}</h2><button onClick={() => setDataCompany(null)} className="px-3 py-1 rounded border border-slate-600 text-sm">{t('common.close')}</button></div>
            <CompanyDataPanel companyId={dataCompany.id} companyName={dataCompany.name} />
          </div>
        </div>
      )}
      {controlCompany && <AccountingControlDialog company={controlCompany} onClose={() => setControlCompany(null)} />}
      {smtpCompany && <CompanySmtpDialog company={smtpCompany} onClose={() => setSmtpCompany(null)} />}
      {isCreateOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-slate-200">
            <div className="flex items-center justify-between pb-4 border-b border-slate-100">
              <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                <Building2 className="w-5 h-5 text-emerald-600" />
                <span>{t('companies.newCompany')}</span>
              </h3>
              <button 
                onClick={() => setIsCreateOpen(false)}
                className="p-1 rounded-lg text-slate-400 hover:bg-slate-100"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {errorMsg && (
              <div className="mt-4 p-3 rounded-lg bg-rose-50 text-rose-700 text-xs flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{errorMsg}</span>
              </div>
            )}

            <form onSubmit={handleCreateCompany} className="mt-4 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  {t('companies.nameLabel')}
                </label>
                <input
                  type="text"
                  required
                  placeholder={t('companies.namePlaceholder')}
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    {t('companies.codeField')}
                  </label>
                  <input
                    type="text"
                    placeholder="301234567"
                    value={formData.code}
                    onChange={(e) => setFormData({ ...formData, code: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
                <label className="block text-xs font-semibold text-slate-700">{t('companies.vatMode')}<select value={formData.taxMode} onChange={e=>setFormData({...formData,taxMode:e.target.value,isVatPayer:e.target.value!=='NON_VAT'})} className="block w-full border rounded p-2"><option value="NON_VAT">{t('companies.modeNonVat')}</option><option value="STANDARD_VAT">{t('companies.modeVat')}</option><option value="SVS_LT">{t('companies.modeSvs')}</option></select></label><label className="block text-xs text-slate-600">{t('companies.modeEffectiveFrom')}<input type="date" required value={formData.taxEffectiveFrom} onChange={e=>setFormData({...formData,taxEffectiveFrom:e.target.value})} className="block border rounded p-2"/></label>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    {t('companies.vatCode')}
                  </label>
                  <input
                    type="text"
                    placeholder="LT100000000000"
                    value={formData.vatCode}
                    onChange={(e) => setFormData({ ...formData, vatCode: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  {t('companies.address')}
                </label>
                <input
                  type="text"
                  placeholder={t('companies.addressPlaceholder')}
                  value={formData.address}
                  onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    {t('companies.email')}
                  </label>
                  <input
                    type="email"
                    placeholder={t('companies.emailPlaceholder')}
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    {t('companies.phone')}
                  </label>
                  <input
                    type="text"
                    placeholder="+37060000000"
                    value={formData.phone}
                    onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
              </div>

              <div className="border-t border-slate-100 pt-3">
                <div className="text-xs font-bold text-slate-800 mb-2">{t('companies.bankDetails')}</div>
                <div className="space-y-3">
                  <div>
                    <label className="block text-xs text-slate-600 mb-1">{t('companies.bankName')}</label>
                    <input
                      type="text"
                      placeholder={t('companies.bankName')}
                      value={formData.bankName}
                      onChange={(e) => setFormData({ ...formData, bankName: e.target.value })}
                      className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    />
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    <div className="col-span-2">
                      <label className="block text-xs text-slate-600 mb-1">{t('companies.ibanAccount')}</label>
                      <input
                        type="text"
                        placeholder="LT..."
                        value={formData.bankIban}
                        onChange={(e) => setFormData({ ...formData, bankIban: e.target.value })}
                        className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-emerald-500"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-slate-600 mb-1">SWIFT / BIC</label>
                      <input
                        type="text"
                        placeholder="AAAALT00"
                        value={formData.bankSwift}
                        onChange={(e) => setFormData({ ...formData, bankSwift: e.target.value })}
                        className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-emerald-500"
                      />
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsCreateOpen(false)}
                  className="px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100 rounded-lg"
                >
                  {t('common.cancel')}
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-5 py-2 text-sm font-medium text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg disabled:opacity-50"
                >
                  {submitting ? t('companies.creating') : t('companies.createCompany')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Edit Company */}
      {editingCompany && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-slate-200">
            <div className="flex items-center justify-between pb-4 border-b border-slate-100">
              <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                <Edit3 className="w-5 h-5 text-emerald-600" />
                <span>{t('companies.editDetails')}</span>
              </h3>
              <button 
                onClick={() => setEditingCompany(null)}
                className="p-1 rounded-lg text-slate-400 hover:bg-slate-100"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {errorMsg && (
              <div className="mt-4 p-3 rounded-lg bg-rose-50 text-rose-700 text-xs flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{errorMsg}</span>
              </div>
            )}

            <form onSubmit={handleUpdateCompany} className="mt-4 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  {t('companies.nameLabel')}
                </label>
                <input
                  type="text"
                  required
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    {t('companies.codeField')}
                  </label>
                  <input
                    type="text"
                    value={formData.code}
                    onChange={(e) => setFormData({ ...formData, code: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
                <label className="block text-xs font-semibold text-slate-700">{t('companies.vatMode')}<select value={formData.taxMode} onChange={e=>setFormData({...formData,taxMode:e.target.value,isVatPayer:e.target.value!=='NON_VAT'})} className="block w-full border rounded p-2"><option value="NON_VAT">{t('companies.modeNonVat')}</option><option value="STANDARD_VAT">{t('companies.modeVat')}</option><option value="SVS_LT">{t('companies.modeSvs')}</option></select></label><label className="block text-xs text-slate-600">{t('companies.modeEffectiveFrom')}<input type="date" required value={formData.taxEffectiveFrom} onChange={e=>setFormData({...formData,taxEffectiveFrom:e.target.value})} className="block border rounded p-2"/></label>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    {t('companies.vatCode')}
                  </label>
                  <input
                    type="text"
                    value={formData.vatCode}
                    onChange={(e) => setFormData({ ...formData, vatCode: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  {t('companies.address')}
                </label>
                <input
                  type="text"
                  value={formData.address}
                  onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    {t('companies.email')}
                  </label>
                  <input
                    type="email"
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    {t('companies.phone')}
                  </label>
                  <input
                    type="text"
                    value={formData.phone}
                    onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
              </div>

              <div className="border-t border-slate-100 pt-3">
                <div className="text-xs font-bold text-slate-800 mb-2">{t('companies.bankDetails')}</div>
                <div className="space-y-3">
                  <div>
                    <label className="block text-xs text-slate-600 mb-1">{t('companies.bankName')}</label>
                    <input
                      type="text"
                      value={formData.bankName}
                      onChange={(e) => setFormData({ ...formData, bankName: e.target.value })}
                      className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    />
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    <div className="col-span-2">
                      <label className="block text-xs text-slate-600 mb-1">{t('companies.ibanAccount')}</label>
                      <input
                        type="text"
                        value={formData.bankIban}
                        onChange={(e) => setFormData({ ...formData, bankIban: e.target.value })}
                        className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-emerald-500"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-slate-600 mb-1">SWIFT / BIC</label>
                      <input
                        type="text"
                        value={formData.bankSwift}
                        onChange={(e) => setFormData({ ...formData, bankSwift: e.target.value })}
                        className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-emerald-500"
                      />
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setEditingCompany(null)}
                  className="px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100 rounded-lg"
                >
                  {t('common.cancel')}
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-5 py-2 text-sm font-medium text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg disabled:opacity-50"
                >
                  {submitting ? t('companies.saving') : t('companies.saveChanges')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Import JSON Backup */}
      {importingCompanyId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200">
            <div className="flex items-center justify-between pb-4 border-b border-slate-100">
              <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                <Upload className="w-5 h-5 text-emerald-600" />
                <span>{t('companies.importTitle')}</span>
              </h3>
              <button 
                onClick={() => setImportingCompanyId(null)}
                className="p-1 rounded-lg text-slate-400 hover:bg-slate-100"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleImportSubmit} className="mt-4 space-y-4">
              <p className="text-xs text-slate-600">
                {t('companies.importIntro')}
              </p>

              <div className="border-2 border-dashed border-slate-300 rounded-xl p-5 text-center hover:border-emerald-500 transition-colors">
                <input
                  type="file"
                  accept=".json"
                  onChange={(e) => setImportFile(e.target.files?.[0] || null)}
                  className="block w-full text-xs text-slate-500 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-emerald-50 file:text-emerald-700 hover:file:bg-emerald-100"
                />
              </div>

              {importStatus && (
                <div className="p-3 rounded-lg bg-slate-100 text-xs font-mono text-slate-800">
                  {importStatus}
                </div>
              )}

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setImportingCompanyId(null)}
                  className="px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100 rounded-lg"
                >
                  {t('common.cancel')}
                </button>
                <button
                  type="submit"
                  disabled={submitting || !importFile}
                  className="px-5 py-2 text-sm font-medium text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg disabled:opacity-50"
                >
                  {submitting ? t('companies.importing') : t('companies.startImport')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
