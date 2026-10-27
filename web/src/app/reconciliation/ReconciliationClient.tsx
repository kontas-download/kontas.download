'use client';

import React, { useState } from 'react';
import { useT } from '@/lib/i18n/client';
import { 
  FileCheck2, 
  Printer, 
  Search, 
  Calendar, 
  Building2, 
  UserCheck, 
  ArrowRight,
  CheckCircle2,
  AlertCircle
} from 'lucide-react';

interface ClientItem {
  id: number;
  name: string;
  code: string | null;
  vatCode: string | null;
  address: string | null;
}

interface StatementRow {
  id: string;
  date: string;
  docNumber: string;
  docType: string;
  notes: string;
  debit: number;
  credit: number;
  balance: number;
}

interface ReconciliationData {
  client: {
    id?: number;
    name: string;
    code?: string;
    vatCode?: string;
    address?: string;
  };
  asOfDate: string;
  rows: StatementRow[];
  totalDebit: number;
  totalCredit: number;
  finalBalance: number;
}

interface Props {
  company: {
    name: string;
    code: string;
    vatCode: string;
    address?: string;
  };
  clients: ClientItem[];
}

// Splits a translated text on {name} markers and substitutes the given nodes.
function rich(text: string, nodes: Record<string, React.ReactNode>) {
  return text.split(/(\{\w+\})/).map((part, i) => {
    const name = part.match(/^\{(\w+)\}$/)?.[1];
    return name && name in nodes ? <React.Fragment key={i}>{nodes[name]}</React.Fragment> : part;
  });
}

export function ReconciliationClient({ company, clients }: Props) {
  const t = useT();
  const [selectedClientId, setSelectedClientId] = useState<string>(clients[0]?.id?.toString() || '');
  const [asOfDate, setAsOfDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [loading, setLoading] = useState<boolean>(false);
  const [data, setData] = useState<ReconciliationData | null>(null);

  const fetchStatement = async (cId: string, date: string) => {
    if (!cId) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/reconciliation?clientId=${cId}&asOfDate=${date}`);
      if (res.ok) {
        const json = await res.json();
        setData(json);
      }
    } catch (err) {
      console.error('Failed to load reconciliation statement:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleGenerate = (e: React.FormEvent) => {
    e.preventDefault();
    fetchStatement(selectedClientId, asOfDate);
  };

  const currentClient = clients.find(c => c.id.toString() === selectedClientId);

  return (
    <div className="p-8 max-w-5xl mx-auto space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight flex items-center gap-2">
            <FileCheck2 className="w-6 h-6 text-emerald-400" />
            <span>{t('reconciliation.title')}</span>
          </h1>
          <p className="text-sm text-slate-400 mt-1">
            {t('reconciliation.subtitle')}
          </p>
        </div>

        {data && (
          <button
            onClick={() => window.print()}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-xs font-semibold no-print self-start"
          >
            <Printer className="w-4 h-4 text-emerald-400" />
            <span>{t('reconciliation.print')}</span>
          </button>
        )}
      </div>

      {/* Selector Card (No-print) */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-sm no-print">
        <form onSubmit={handleGenerate} className="grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
          <div className="md:col-span-2">
            <label className="block text-xs font-semibold text-slate-300 mb-1.5">
              {t('reconciliation.selectCounterparty')}
            </label>
            <select
              value={selectedClientId}
              onChange={(e) => setSelectedClientId(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs font-medium text-slate-100 focus:outline-none focus:border-emerald-500 cursor-pointer"
            >
              <option value="">{t('reconciliation.selectPlaceholder')}</option>
              {clients.map(c => (
                <option key={c.id} value={c.id}>
                  {c.name} {c.code ? t('reconciliation.codeSuffix', { code: c.code }) : ''}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1.5">
              {t('reconciliation.asOf')}
            </label>
            <div className="flex gap-2">
              <input
                type="date"
                value={asOfDate}
                onChange={(e) => setAsOfDate(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs font-bold text-slate-100 focus:outline-none focus:border-emerald-500"
              />
              <button
                type="submit"
                disabled={loading || !selectedClientId}
                className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-xs font-bold whitespace-nowrap shadow-sm transition-colors"
              >
                {loading ? t('reconciliation.loading') : t('reconciliation.generate')}
              </button>
            </div>
          </div>
        </form>
      </div>

      {/* Printable Statement Document */}
      {data ? (
        <div className="bg-white text-slate-900 rounded-xl p-8 sm:p-12 shadow-md border border-slate-200 printable-doc font-sans text-xs">
          {/* Document Title */}
          <div className="text-center space-y-1 mb-8">
            <h2 className="text-lg font-bold uppercase tracking-wider text-slate-950">
              {t('reconciliation.docTitle')}
            </h2>
            <div className="text-slate-600 font-medium">
              {t('reconciliation.dateLabel')} <strong className="text-slate-900">{data.asOfDate}</strong>
            </div>
          </div>

          {/* Intro Legal Paragraph */}
          <div className="leading-relaxed text-justify mb-6 text-slate-700">
            {rich(t('reconciliation.intro', { company: '{company}', code: '{code}', vat: '{vat}', client: '{client}', clientCode: '{clientCode}', clientVat: '{clientVat}', date: '{date}' }), {
              company: <strong className="text-slate-950">{company.name}</strong>,
              code: <strong className="font-mono text-slate-900">{company.code || '—'}</strong>,
              vat: company.vatCode ? t('reconciliation.vatSuffix', { code: company.vatCode }) : '',
              client: <strong className="text-slate-950">{data.client.name}</strong>,
              clientCode: <strong className="font-mono text-slate-900">{data.client.code || '—'}</strong>,
              clientVat: data.client.vatCode ? t('reconciliation.vatSuffix', { code: data.client.vatCode }) : '',
              date: <strong className="text-slate-950">{data.asOfDate}</strong>,
            })}
          </div>

          {/* Ledger Table */}
          <div className="border border-slate-300 rounded overflow-hidden mb-6">
            <table className="w-full text-left text-[11px] border-collapse">
              <thead className="bg-slate-100 text-slate-800 font-bold border-b border-slate-300">
                <tr>
                  <th className="py-2 px-2.5 w-20">{t('reconciliation.colDate')}</th>
                  <th className="py-2 px-2.5 w-32">{t('reconciliation.colDoc')}</th>
                  <th className="py-2 px-2.5">{t('reconciliation.colOperation')}</th>
                  <th className="py-2 px-2.5 text-right w-24">{t('reconciliation.colDebit')}</th>
                  <th className="py-2 px-2.5 text-right w-24">{t('reconciliation.colCredit')}</th>
                  <th className="py-2 px-2.5 text-right w-28">{t('reconciliation.colBalance')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 font-mono">
                {data.rows.map(r => (
                  <tr key={r.id} className="hover:bg-slate-50">
                    <td className="py-1.5 px-2.5 font-sans text-slate-600">{r.date}</td>
                    <td className="py-1.5 px-2.5 font-sans font-semibold text-slate-900">{r.docNumber}</td>
                    <td className="py-1.5 px-2.5 font-sans text-slate-700">{r.docType}</td>
                    <td className="py-1.5 px-2.5 text-right text-slate-900 font-semibold">
                      {r.debit > 0 ? r.debit.toFixed(2) : '—'}
                    </td>
                    <td className="py-1.5 px-2.5 text-right text-slate-900 font-semibold">
                      {r.credit > 0 ? r.credit.toFixed(2) : '—'}
                    </td>
                    <td className={`py-1.5 px-2.5 text-right font-bold ${
                      r.balance >= 0 ? 'text-slate-950' : 'text-rose-700'
                    }`}>
                      {r.balance.toFixed(2)}
                    </td>
                  </tr>
                ))}
                {data.rows.length === 0 && (
                  <tr>
                    <td colSpan={6} className="py-6 text-center text-slate-500 font-sans italic">
                      {t('reconciliation.empty')}
                    </td>
                  </tr>
                )}
              </tbody>
              <tfoot className="bg-slate-100 font-bold text-slate-900 border-t-2 border-slate-300">
                <tr>
                  <td colSpan={3} className="py-2.5 px-2.5 uppercase font-sans text-xs">
                    {t('reconciliation.totalTurnover')}
                  </td>
                  <td className="py-2.5 px-2.5 text-right font-mono text-xs">
                    €{data.totalDebit.toFixed(2)}
                  </td>
                  <td className="py-2.5 px-2.5 text-right font-mono text-xs">
                    €{data.totalCredit.toFixed(2)}
                  </td>
                  <td className={`py-2.5 px-2.5 text-right font-mono text-xs ${
                    data.finalBalance >= 0 ? 'text-slate-950' : 'text-rose-700'
                  }`}>
                    €{data.finalBalance.toFixed(2)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>

          {/* Balance Statement Conclusion Box */}
          <div className="p-4 rounded-lg bg-slate-50 border border-slate-300 mb-8 space-y-2">
            <div className="text-xs font-bold text-slate-900">
              {t('reconciliation.conclusion')}
            </div>
            <div className="text-slate-800 leading-relaxed">
              {data.finalBalance > 0.005 ? (
                <>
                  {rich(t('reconciliation.clientOwes', { company: '{company}', client: '{client}', amount: '{amount}' }), {
                    company: <strong className="text-slate-950">{company.name}</strong>,
                    client: <strong className="text-slate-950">{data.client.name}</strong>,
                    amount: <strong className="font-mono text-emerald-800 text-sm">€{data.finalBalance.toFixed(2)}</strong>,
                  })}
                </>
              ) : data.finalBalance < -0.005 ? (
                <>
                  {rich(t('reconciliation.companyOwes', { company: '{company}', client: '{client}', amount: '{amount}' }), {
                    company: <strong className="text-slate-950">{company.name}</strong>,
                    client: <strong className="text-slate-950">{data.client.name}</strong>,
                    amount: <strong className="font-mono text-rose-800 text-sm">€{Math.abs(data.finalBalance).toFixed(2)}</strong>,
                  })}
                </>
              ) : (
                <>
                  {rich(t('reconciliation.settled', { date: '{date}', amount: '{amount}' }), {
                    date: <strong className="text-slate-950">{data.asOfDate}</strong>,
                    amount: <strong>0.00 EUR</strong>,
                  })}
                </>
              )}
            </div>
            <div className="text-[11px] text-slate-500 italic mt-2">
              {t('reconciliation.confirmNote')}
            </div>
          </div>

          {/* Dual Signatures */}
          <div className="grid grid-cols-2 gap-12 pt-6 border-t border-slate-200">
            {/* Our company */}
            <div className="space-y-4">
              <div>
                <div className="font-bold text-slate-950">{company.name}</div>
                <div className="text-[11px] text-slate-500">{t('reconciliation.managerAccountant')}</div>
              </div>
              <div className="pt-8 border-b border-dashed border-slate-400"></div>
              <div className="flex justify-between text-[10px] text-slate-500">
                <span>{t('reconciliation.signature')}</span>
                <span>{t('reconciliation.fullName')}</span>
              </div>
              <div className="text-[11px] text-slate-400">{t('reconciliation.stampPlace')}</div>
            </div>

            {/* Counterparty */}
            <div className="space-y-4">
              <div>
                <div className="font-bold text-slate-950">{data.client.name}</div>
                <div className="text-[11px] text-slate-500">{t('reconciliation.debtConfirmedBy')}</div>
              </div>
              <div className="pt-8 border-b border-dashed border-slate-400"></div>
              <div className="flex justify-between text-[10px] text-slate-500">
                <span>{t('reconciliation.signature')}</span>
                <span>{t('reconciliation.fullName')}</span>
              </div>
              <div className="text-[11px] text-slate-400">{t('reconciliation.stampPlace')}</div>
            </div>
          </div>
        </div>
      ) : (
        <div className="p-12 text-center rounded-xl bg-slate-900 border border-slate-800 text-slate-400">
          <FileCheck2 className="w-10 h-10 mx-auto text-slate-600 mb-3" />
          <div className="text-sm font-semibold text-slate-300">{t('reconciliation.emptyHint')}</div>
          <div className="text-xs text-slate-500 mt-1">{t('reconciliation.emptyHint2')}</div>
        </div>
      )}
    </div>
  );
}
