import React from 'react';
import { requirePageAccess } from '@/lib/access';
import Link from 'next/link';
import { getDb } from '@/lib/db';
import { getActiveCompany } from '@/lib/company';
import { getT } from '@/lib/i18n/server';
import { LOCALES } from '@/lib/i18n/config';
import { formatDate } from '@/lib/i18n/translate';
import { todayVilnius } from '@/lib/dates';
import { rulesFreshness } from '@/lib/rules';
import { 
  TrendingUp, 
  TrendingDown, 
  Users, 
  Receipt, 
  Landmark, 
  ArrowUpRight,
  PlusCircle,
  FileSpreadsheet,
  Building2,
  Scale
} from 'lucide-react';

export default async function DashboardPage() {
  await requirePageAccess();
  const { t, lang } = await getT();
  const locale = LOCALES[lang];
  const db = getDb();
  const company = await getActiveCompany();
  const companyId = company.id;

  // Metrics filtered by active company
  const totalSales = db.prepare('SELECT SUM(sumWithVat) as s, COUNT(*) as c FROM Sale WHERE companyId = ?').get(companyId) as { s: number, c: number };
  const totalPurchases = db.prepare('SELECT SUM(sumWithVat) as s, COUNT(*) as c FROM Purchase WHERE companyId = ?').get(companyId) as { s: number, c: number };
  const totalClients = db.prepare('SELECT COUNT(*) as c FROM Client WHERE companyId = ?').get(companyId) as { c: number };
  const totalBankOps = db.prepare('SELECT COUNT(*) as c FROM BankTransaction WHERE companyId = ?').get(companyId) as { c: number };

  const salesSum = totalSales?.s || 0;
  const purchasesSum = totalPurchases?.s || 0;
  const netIncome = salesSum - purchasesSum;

  // Recent 8 Sales for this company
  const recentSales = db.prepare(`
    SELECT id, series, number, saleDate, clientName, clientCode, sumWithVat, statusName, warehouseName
    FROM Sale
    WHERE companyId = ?
    ORDER BY saleDate DESC, id DESC
    LIMIT 8
  `).all(companyId) as any[];

  // Top Clients for this company
  const topClients = db.prepare(`
    SELECT clientName, clientCode, SUM(sumWithVat) as totalSpent, COUNT(*) as invoiceCount
    FROM Sale
    WHERE companyId = ? AND clientName IS NOT NULL
    GROUP BY clientName
    ORDER BY totalSpent DESC
    LIMIT 5
  `).all(companyId) as any[];

  // Last 12 months: revenue vs expenses
  const monthKeys: string[] = [];
  const now = new Date();
  for (let i = 11; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    monthKeys.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
  }
  const firstMonthStart = `${monthKeys[0]}-01`;

  const salesByMonth = db.prepare(`
    SELECT substr(saleDate, 1, 7) as m, SUM(sumWithVat) as s
    FROM Sale WHERE companyId = ? AND saleDate >= ?
    GROUP BY m
  `).all(companyId, firstMonthStart) as { m: string; s: number }[];

  const purchasesByMonth = db.prepare(`
    SELECT substr(purchaseDate, 1, 7) as m, SUM(sumWithVat) as s
    FROM Purchase WHERE companyId = ? AND purchaseDate >= ?
    GROUP BY m
  `).all(companyId, firstMonthStart) as { m: string; s: number }[];

  const monthly = monthKeys.map((m) => ({
    month: m,
    revenue: salesByMonth.find((r) => r.m === m)?.s || 0,
    expenses: purchasesByMonth.find((r) => r.m === m)?.s || 0,
  }));
  const chartMax = Math.max(1, ...monthly.map((x) => Math.max(x.revenue, x.expenses)));

  // Bank balances per account
  const bankBalances = db.prepare(`
    SELECT COALESCE(NULLIF(accountingBankInternalName, ''), 'Be pavadinimo') as bank,
           SUM(sum) as balance, COUNT(*) as ops
    FROM BankTransaction
    WHERE companyId = ?
    GROUP BY bank
    ORDER BY balance DESC
  `).all(companyId) as { bank: string; balance: number; ops: number }[];

  const statusLabel = (name: string) => name === 'Apmokėta' ? t('dashboard.statusPaid') : name === 'Neapmokėta' ? t('dashboard.statusUnpaid') : name;
  // Freshness of the legislation rules registry (lib/rules): as-of date, overdue reviews, provisional entries.
  const taxRules = rulesFreshness(todayVilnius());
  const formatEur = (v: number) => v.toLocaleString(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-8">
      {/* Top Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-emerald-400 mb-1">
            <Building2 className="w-3.5 h-3.5" />
            <span>{company.name}</span>
            {company.code && <span className="text-slate-500 font-mono">({company.code})</span>}
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-white">{t('dashboard.title')}</h1>
          <p className="text-sm text-slate-400 mt-1">
            {t('dashboard.subtitle')}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Link
            href="/invoices"
            className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-500 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors shadow-sm"
          >
            <PlusCircle className="w-4 h-4" />
            <span>{t('dashboard.newInvoice')}</span>
          </Link>
          <Link
            href="/companies"
            className="flex items-center gap-2 bg-slate-800 hover:bg-slate-700 text-slate-200 px-4 py-2 rounded-lg text-sm font-medium border border-slate-700 transition-colors"
          >
            <Building2 className="w-4 h-4" />
            <span>{t('dashboard.switchCompany')}</span>
          </Link>
        </div>
      </div>

      {/* Tax rules registry freshness */}
      <div className={`rounded-xl border p-4 text-sm ${taxRules.overdue.length || taxRules.stale ? 'border-amber-700 bg-amber-950/30 text-amber-200' : 'border-slate-800 bg-slate-900 text-slate-300'}`}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Scale className="w-4 h-4 text-emerald-400" />
            <span>{taxRules.asOf ? t('rules.asOf', { date: formatDate(lang, taxRules.asOf) }) : t('rules.asOfUnknown')}</span>
          </div>
          <Link href="/rules" className="text-emerald-400 hover:underline">{t('rules.open')}</Link>
        </div>
        {taxRules.overdue.length > 0 && <p role="alert" className="mt-2">{t('rules.overdue', { count: taxRules.overdue.length })}</p>}
        {taxRules.stale && taxRules.asOf && <p role="alert" className="mt-2">{t('rules.stale', { days: taxRules.daysOld ?? 0 })}</p>}
        {taxRules.provisional > 0 && <p className="mt-2 text-slate-400">{t('rules.provisionalNote', { count: taxRules.provisional })}</p>}
      </div>

      {/* Metric Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-400 uppercase tracking-wider">{t('dashboard.revenue')}</span>
            <div className="w-9 h-9 rounded-lg bg-emerald-500/10 text-emerald-400 flex items-center justify-center">
              <TrendingUp className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-3">
            <div className="text-2xl font-bold text-white">
              {salesSum.toLocaleString(locale, { style: 'currency', currency: company.currencyCode || 'EUR' })}
            </div>
            <div className="text-xs text-slate-400 mt-1 flex items-center gap-1">
              <Receipt className="w-3.5 h-3.5 text-slate-400" />
              <span>{t('dashboard.invoicesCount', { count: totalSales?.c || 0 })}</span>
            </div>
          </div>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-400 uppercase tracking-wider">{t('dashboard.expenses')}</span>
            <div className="w-9 h-9 rounded-lg bg-rose-500/10 text-rose-400 flex items-center justify-center">
              <TrendingDown className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-3">
            <div className="text-2xl font-bold text-white">
              {purchasesSum.toLocaleString(locale, { style: 'currency', currency: company.currencyCode || 'EUR' })}
            </div>
            <div className="text-xs text-slate-400 mt-1 flex items-center gap-1">
              <span>{t('dashboard.supplierDocs', { count: totalPurchases?.c || 0 })}</span>
            </div>
          </div>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-400 uppercase tracking-wider">{t('dashboard.netMargin')}</span>
            <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${
              netIncome >= 0 ? 'bg-emerald-500/10 text-emerald-400' : 'bg-rose-500/10 text-rose-400'
            }`}>
              <ArrowUpRight className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-3">
            <div className={`text-2xl font-bold ${netIncome >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
              {netIncome.toLocaleString(locale, { style: 'currency', currency: company.currencyCode || 'EUR' })}
            </div>
            <div className="text-xs text-slate-400 mt-1">
              {t('dashboard.incomeMinusExpenses')}
            </div>
          </div>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-400 uppercase tracking-wider">{t('dashboard.counterpartiesBank')}</span>
            <div className="w-9 h-9 rounded-lg bg-blue-500/10 text-blue-400 flex items-center justify-center">
              <Landmark className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-3">
            <div className="text-2xl font-bold text-white">
              {totalClients?.c || 0}
            </div>
            <div className="text-xs text-slate-400 mt-1 flex items-center gap-1">
              <Users className="w-3.5 h-3.5" />
              <span>{t('dashboard.clientsAndBank', { ops: totalBankOps?.c || 0 })}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Grid: Recent Sales & Top Clients */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Recent Invoices Table (2 cols) */}
        <div className="lg:col-span-2 bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-sm">
          <div className="flex items-center justify-between mb-4 pb-3 border-b border-slate-800">
            <div>
              <h2 className="text-base font-semibold text-white">{t('dashboard.recentInvoices')}</h2>
              <p className="text-xs text-slate-400">{t('dashboard.recentInvoicesNote')}</p>
            </div>
            <Link 
              href="/invoices" 
              className="text-xs text-emerald-400 hover:text-emerald-300 font-medium flex items-center gap-1"
            >
              <span>{t('dashboard.allInvoices')}</span>
              <ArrowUpRight className="w-3.5 h-3.5" />
            </Link>
          </div>

          <div className="overflow-x-auto">
            {recentSales.length === 0 ? (
              <div className="text-center py-8 text-sm text-slate-500">
                {t('dashboard.noInvoices')}
                <div className="mt-2 text-xs">{t('demo.dashboardHint')}</div>
              </div>
            ) : (
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="text-xs text-slate-400 uppercase tracking-wider border-b border-slate-800">
                    <th className="py-2 px-3">{t('dashboard.colNumber')}</th>
                    <th className="py-2 px-3">{t('common.date')}</th>
                    <th className="py-2 px-3">{t('dashboard.colClient')}</th>
                    <th className="py-2 px-3 text-right">{t('dashboard.colAmountEur')}</th>
                    <th className="py-2 px-3 text-center">{t('dashboard.colStatus')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {recentSales.map((inv) => (
                    <tr key={inv.id} className="hover:bg-slate-800/40 transition-colors">
                      <td className="py-2.5 px-3 font-medium text-white flex items-center gap-2">
                        <span className="font-mono text-emerald-400">{inv.series} {inv.number}</span>
                      </td>
                      <td className="py-2.5 px-3 text-slate-300 text-xs">
                        {inv.saleDate}
                      </td>
                      <td className="py-2.5 px-3 text-slate-300 max-w-[200px] truncate" title={inv.clientName}>
                        {inv.clientName || '—'}
                      </td>
                      <td className="py-2.5 px-3 text-right font-medium text-white">
                        {Number(inv.sumWithVat).toLocaleString(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €
                      </td>
                      <td className="py-2.5 px-3 text-center">
                        <span className="inline-block px-2 py-0.5 text-[11px] rounded-full bg-emerald-500/10 text-emerald-400 font-medium">
                          {statusLabel(inv.statusName || 'Apmokėta')}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>

        {/* Top Clients Breakdown (1 col) */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-sm">
          <div className="flex items-center justify-between mb-4 pb-3 border-b border-slate-800">
            <div>
              <h2 className="text-base font-semibold text-white">{t('dashboard.topClients')}</h2>
              <p className="text-xs text-slate-400">{t('dashboard.byRevenue')}</p>
            </div>
            <Link 
              href="/clients" 
              className="text-xs text-emerald-400 hover:text-emerald-300 font-medium flex items-center gap-1"
            >
              <span>{t('dashboard.all')}</span>
              <ArrowUpRight className="w-3.5 h-3.5" />
            </Link>
          </div>

          {topClients.length === 0 ? (
            <div className="text-center py-8 text-sm text-slate-500">
              {t('dashboard.noData')}
            </div>
          ) : (
            <div className="space-y-4">
              {topClients.map((client, index) => (
                <div key={index} className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2.5 overflow-hidden">
                    <div className="w-7 h-7 rounded-full bg-slate-800 flex items-center justify-center text-xs font-semibold text-slate-300 shrink-0">
                      {index + 1}
                    </div>
                    <div className="overflow-hidden">
                      <div className="text-sm font-medium text-white truncate" title={client.clientName}>
                        {client.clientName}
                      </div>
                      <div className="text-xs text-slate-400">
                        {t('dashboard.invoicesShort', { count: client.invoiceCount })}
                      </div>
                    </div>
                  </div>
                  <div className="text-sm font-semibold text-emerald-400 whitespace-nowrap">
                    {Number(client.totalSpent).toLocaleString(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
