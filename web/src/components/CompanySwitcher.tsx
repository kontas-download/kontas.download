'use client';

import React, { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useI18n } from '@/lib/i18n/client';
import { Building2, Check, ChevronsUpDown, Plus, Settings } from 'lucide-react';

interface Company {
  id: number;
  name: string;
  code?: string | null;
  currencyCode?: string;
  isDefault?: number;
}

export function CompanySwitcher() {
  const router = useRouter();
  const { t } = useI18n();
  const [companies, setCompanies] = useState<Company[]>([]);
  const [activeId, setActiveId] = useState<number | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const fetchCompanies = async () => {
    try {
      const res = await fetch('/api/companies');
      if (res.ok) {
        const data = await res.json();
        setCompanies(data.companies || []);
        setActiveId(data.activeId || null);
      }
    } catch (e) {
      console.error('Failed to load companies:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial data load
    fetchCompanies();
  }, []);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSelectCompany = async (companyId: number) => {
    if (companyId === activeId) {
      setIsOpen(false);
      return;
    }
    try {
      const res = await fetch('/api/companies/switch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ companyId })
      });
      if (res.ok) {
        setActiveId(companyId);
        setIsOpen(false);
        // Force full refresh so all server components re-render with new company data
        window.location.reload();
      }
    } catch (e) {
      console.error('Failed to switch company:', e);
    }
  };

  const activeCompany = companies.find((c) => c.id === activeId) || companies[0];

  return (
    <div className="relative px-3 py-2 border-b border-slate-800" ref={dropdownRef}>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between p-2 rounded-lg bg-slate-800/80 hover:bg-slate-800 text-left transition-colors border border-slate-700/60 shadow-sm"
      >
        <div className="flex items-center gap-2.5 overflow-hidden">
          <div className="w-7 h-7 rounded-md bg-emerald-500/20 text-emerald-400 flex items-center justify-center shrink-0 border border-emerald-500/30">
            <Building2 className="w-4 h-4" />
          </div>
          <div className="overflow-hidden">
            <div className="text-xs text-slate-400 font-medium">{t('companies.activeCompany')}</div>
            <div className="text-sm font-semibold text-slate-100 truncate">
              {loading ? t('common.loading') : (activeCompany?.name || t('companies.selectCompany'))}
            </div>
          </div>
        </div>
        <ChevronsUpDown className="w-4 h-4 text-slate-400 shrink-0 ml-1" />
      </button>

      {isOpen && (
        <div className="absolute left-3 right-3 top-full mt-1.5 z-50 bg-slate-900 border border-slate-700 rounded-xl shadow-xl overflow-hidden py-1.5 animate-in fade-in zoom-in-95 duration-100">
          <div className="px-3 py-1.5 text-xs font-semibold text-slate-400 uppercase tracking-wider border-b border-slate-800">
            {t('companies.yourCompanies', { count: companies.length })}
          </div>

          <div className="max-h-56 overflow-y-auto py-1">
            {companies.map((company) => {
              const isSelected = company.id === activeId;
              return (
                <button
                  key={company.id}
                  onClick={() => handleSelectCompany(company.id)}
                  className={`w-full flex items-center justify-between px-3 py-2 text-left text-sm transition-colors ${
                    isSelected
                      ? 'bg-emerald-600/20 text-emerald-300 font-medium'
                      : 'text-slate-200 hover:bg-slate-800'
                  }`}
                >
                  <div className="truncate mr-2">
                    <div className="truncate">{company.name}</div>
                    {company.code && (
                      <div className="text-xs text-slate-400">{t('companies.codeLabel')}: {company.code}</div>
                    )}
                  </div>
                  {isSelected && <Check className="w-4 h-4 text-emerald-400 shrink-0" />}
                </button>
              );
            })}
          </div>

          <div className="pt-1 mt-1 border-t border-slate-800 space-y-0.5 px-1">
            <button
              onClick={() => {
                setIsOpen(false);
                router.push('/companies?action=new');
              }}
              className="w-full flex items-center gap-2 px-2.5 py-1.5 text-xs font-medium text-emerald-400 hover:bg-emerald-950/40 rounded-lg transition-colors"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>{t('companies.addNewCompany')}</span>
            </button>
            <button
              onClick={() => {
                setIsOpen(false);
                router.push('/companies');
              }}
              className="w-full flex items-center gap-2 px-2.5 py-1.5 text-xs font-medium text-slate-400 hover:bg-slate-800 hover:text-slate-200 rounded-lg transition-colors"
            >
              <Settings className="w-3.5 h-3.5" />
              <span>{t('companies.manageAll')}</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
