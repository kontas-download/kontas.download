'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { 
  ArrowUp, 
  ArrowDown, 
  ArrowUpDown, 
  ChevronLeft, 
  ChevronRight, 
  ChevronsLeft, 
  ChevronsRight,
  Download
} from 'lucide-react';
import { useT } from '@/lib/i18n/client';

export type SortDirection = 'asc' | 'desc';

export interface CsvColumn {
  header: string;
  key: string;
}

/**
 * Exports rows as CSV (UTF-8 with BOM, ';' separator) so Excel opens
 * Lithuanian characters and decimal numbers correctly.
 */
export function downloadCsv(filename: string, columns: CsvColumn[], rows: any[]) {
  const escape = (value: any) => {
    if (value === null || value === undefined) return '';
    const text = typeof value === 'number' ? String(value).replace('.', ',') : String(value);
    return /[";\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  };

  const lines = [
    columns.map(c => escape(c.header)).join(';'),
    ...rows.map(row => columns.map(c => escape(row[c.key])).join(';'))
  ];

  const blob = new Blob(['\uFEFF' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${filename}_${new Date().toISOString().split('T')[0]}.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/**
 * Page size setting remembered per table (localStorage), so the user's
 * choice survives navigation and reloads.
 */
export function usePageSize(storageKey: string, defaultSize = 50): [number, (size: number) => void] {
  const [pageSize, setPageSizeState] = useState<number>(defaultSize);

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(`pageSize:${storageKey}`);
      const parsed = saved ? parseInt(saved, 10) : NaN;
      // eslint-disable-next-line react-hooks/set-state-in-effect -- localStorage is readable only after hydration
      if (!isNaN(parsed) && parsed > 0) setPageSizeState(parsed);
    } catch {
      // localStorage unavailable - keep default
    }
  }, [storageKey]);

  const setPageSize = useCallback((size: number) => {
    setPageSizeState(size);
    try {
      window.localStorage.setItem(`pageSize:${storageKey}`, String(size));
    } catch {
      // ignore
    }
  }, [storageKey]);

  return [pageSize, setPageSize];
}

interface SortableThProps {
  field: string;
  currentField: string;
  currentDirection: SortDirection;
  onSort: (field: string) => void;
  children: React.ReactNode;
  align?: 'left' | 'center' | 'right';
  className?: string;
  style?: React.CSSProperties;
  rowSpan?: number;
}

export function SortableTh({
  field,
  currentField,
  currentDirection,
  onSort,
  children,
  align = 'left',
  className = '',
  style,
  rowSpan
}: SortableThProps) {
  const isActive = currentField === field;

  return (
    <th
      onClick={() => onSort(field)}
      style={style}
      rowSpan={rowSpan}
      className={`py-2.5 px-3 select-none cursor-pointer group transition-colors hover:text-white ${
        align === 'right' ? 'text-right' : align === 'center' ? 'text-center' : 'text-left'
      } ${className}`}
    >
      <div className={`inline-flex items-center gap-1.5 ${
        align === 'right' ? 'justify-end w-full' : align === 'center' ? 'justify-center w-full' : 'justify-start'
      }`}>
        <span className={isActive ? 'text-emerald-400 font-bold' : ''}>{children}</span>
        <span className="shrink-0 transition-opacity">
          {isActive ? (
            currentDirection === 'asc' ? (
              <ArrowUp className="w-3.5 h-3.5 text-emerald-400" />
            ) : (
              <ArrowDown className="w-3.5 h-3.5 text-emerald-400" />
            )
          ) : (
            <ArrowUpDown className="w-3.5 h-3.5 text-slate-500 opacity-40 group-hover:opacity-100" />
          )}
        </span>
      </div>
    </th>
  );
}

export function compareValues(a: any, b: any, direction: SortDirection = 'asc'): number {
  if (a === null || a === undefined) a = '';
  if (b === null || b === undefined) b = '';

  let res = 0;
  if (typeof a === 'number' && typeof b === 'number') {
    res = a - b;
  } else {
    const strA = String(a).toLowerCase();
    const strB = String(b).toLowerCase();
    res = strA.localeCompare(strB, undefined, { numeric: true, sensitivity: 'base' });
  }

  return direction === 'asc' ? res : -res;
}

interface TablePaginationProps {
  currentPage: number;
  pageSize: number;
  totalItems: number;
  onPageChange: (page: number) => void;
  onPageSizeChange: (size: number) => void;
  pageSizeOptions?: number[];
  onExport?: () => void;
}

function getPageNumbers(currentPage: number, totalPages: number): (number | string)[] {
  if (totalPages <= 7) {
    return Array.from({ length: totalPages }, (_, i) => i + 1);
  }

  if (currentPage <= 4) {
    return [1, 2, 3, 4, 5, '...', totalPages];
  }

  if (currentPage >= totalPages - 3) {
    return [1, '...', totalPages - 4, totalPages - 3, totalPages - 2, totalPages - 1, totalPages];
  }

  return [1, '...', currentPage - 1, currentPage, currentPage + 1, '...', totalPages];
}

export function TablePagination({
  currentPage,
  pageSize,
  totalItems,
  onPageChange,
  onPageSizeChange,
  pageSizeOptions = [10, 25, 50, 100, 200, 500],
  onExport
}: TablePaginationProps) {
  const t = useT();
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  const fromIndex = totalItems === 0 ? 0 : (currentPage - 1) * pageSize + 1;
  const toIndex = Math.min(currentPage * pageSize, totalItems);

  const [jumpInput, setJumpInput] = useState('');

  const handleJump = (e: React.FormEvent) => {
    e.preventDefault();
    const pageNum = parseInt(jumpInput, 10);
    if (!isNaN(pageNum) && pageNum >= 1 && pageNum <= totalPages) {
      onPageChange(pageNum);
      setJumpInput('');
    }
  };

  const pages = getPageNumbers(currentPage, totalPages);

  return (
    <div className="flex flex-col lg:flex-row items-center justify-between gap-4 px-4 py-3 bg-slate-950/80 border-t border-slate-800 text-xs text-slate-400">
      {/* Left: Info & Page Size */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-1.5">
          <span>{t('table.shown')}</span>
          <strong className="text-white font-mono">{fromIndex}–{toIndex}</strong>
          <span>{t('table.of')}</span>
          <strong className="text-white font-mono">{totalItems}</strong>
          <span>{t('table.records')}</span>
        </div>

        <span className="hidden sm:inline text-slate-700">|</span>

        <div className="flex items-center gap-1.5">
          <span>{t('table.perPage')}</span>
          <select
            value={pageSize}
            onChange={(e) => {
              onPageSizeChange(Number(e.target.value));
              onPageChange(1);
            }}
            className="bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1 text-xs text-emerald-400 font-bold focus:outline-none focus:border-emerald-500 cursor-pointer"
          >
            {pageSizeOptions.map(opt => (
              <option key={opt} value={opt} className="bg-slate-900 text-slate-200">{opt}</option>
            ))}
            <option value={100000} className="bg-slate-900 text-slate-200">{t('table.all')}</option>
          </select>
        </div>

        {onExport && (
          <button
            onClick={onExport}
            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-900 border border-slate-700 text-slate-300 hover:text-white hover:bg-slate-800 text-xs font-semibold transition-colors"
            title={t('table.exportCsv')}
          >
            <Download className="w-3.5 h-3.5 text-emerald-400" />
            <span>CSV</span>
          </button>
        )}
      </div>

      {/* Center/Right: Interactive Page Number Buttons */}
      <div className="flex flex-wrap items-center gap-1.5">
        {/* First Page */}
        <button
          onClick={() => onPageChange(1)}
          disabled={currentPage <= 1}
          className="p-1.5 rounded-lg bg-slate-900 border border-slate-800 text-slate-300 hover:bg-slate-800 hover:text-white disabled:opacity-25 disabled:pointer-events-none transition-colors"
          title={t('table.firstPage')}
        >
          <ChevronsLeft className="w-3.5 h-3.5" />
        </button>

        {/* Previous Page */}
        <button
          onClick={() => onPageChange(currentPage - 1)}
          disabled={currentPage <= 1}
          className="p-1.5 rounded-lg bg-slate-900 border border-slate-800 text-slate-300 hover:bg-slate-800 hover:text-white disabled:opacity-25 disabled:pointer-events-none transition-colors"
          title={t('table.prevPage')}
        >
          <ChevronLeft className="w-3.5 h-3.5" />
        </button>

        {/* Numbered Page Buttons */}
        <div className="flex items-center gap-1">
          {pages.map((p, idx) => {
            if (p === '...') {
              return (
                <span key={`dots-${idx}`} className="px-2 py-1 text-slate-500 font-mono select-none">
                  ...
                </span>
              );
            }

            const pageNum = Number(p);
            const isCurrent = pageNum === currentPage;

            return (
              <button
                key={pageNum}
                onClick={() => onPageChange(pageNum)}
                className={`min-w-[28px] h-7 px-2 rounded-lg text-xs font-mono font-bold transition-colors ${
                  isCurrent
                    ? 'bg-emerald-600 text-white shadow-sm'
                    : 'bg-slate-900 border border-slate-800 text-slate-300 hover:bg-slate-800 hover:text-white'
                }`}
              >
                {pageNum}
              </button>
            );
          })}
        </div>

        {/* Next Page */}
        <button
          onClick={() => onPageChange(currentPage + 1)}
          disabled={currentPage >= totalPages}
          className="p-1.5 rounded-lg bg-slate-900 border border-slate-800 text-slate-300 hover:bg-slate-800 hover:text-white disabled:opacity-25 disabled:pointer-events-none transition-colors"
          title={t('table.nextPage')}
        >
          <ChevronRight className="w-3.5 h-3.5" />
        </button>

        {/* Last Page */}
        <button
          onClick={() => onPageChange(totalPages)}
          disabled={currentPage >= totalPages}
          className="p-1.5 rounded-lg bg-slate-900 border border-slate-800 text-slate-300 hover:bg-slate-800 hover:text-white disabled:opacity-25 disabled:pointer-events-none transition-colors"
          title={t('table.lastPage', { page: totalPages })}
        >
          <ChevronsRight className="w-3.5 h-3.5" />
        </button>

        {/* Quick jump to page */}
        {totalPages > 3 && (
          <form onSubmit={handleJump} className="hidden sm:flex items-center gap-1.5 ml-2">
            <span className="text-[11px] text-slate-500">{t('table.goTo')}</span>
            <input
              type="number"
              min="1"
              max={totalPages}
              placeholder={String(currentPage)}
              value={jumpInput}
              onChange={(e) => setJumpInput(e.target.value)}
              className="w-12 bg-slate-900 border border-slate-700 rounded-lg px-1.5 py-1 text-center font-mono text-xs text-slate-200 focus:outline-none focus:border-emerald-500"
            />
          </form>
        )}
      </div>
    </div>
  );
}
