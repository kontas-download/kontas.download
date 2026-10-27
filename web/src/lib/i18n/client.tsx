'use client';
import { createContext, useContext, useMemo } from 'react';
import { DEFAULT_LANG, type Lang } from './config';
import { formatDate, formatMoney, makeT, type T } from './translate';

interface Ctx { lang: Lang; t: T; money: (value: number, currency?: string) => string; date: (iso: string) => string; }
const I18nContext = createContext<Ctx | null>(null);

export function I18nProvider({ lang, children }: { lang: Lang; children: React.ReactNode }) {
  const value = useMemo<Ctx>(() => ({ lang, t: makeT(lang), money: (v, c) => formatMoney(lang, v, c), date: iso => formatDate(lang, iso) }), [lang]);
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}
export function useI18n(): Ctx {
  return useContext(I18nContext) ?? { lang: DEFAULT_LANG, t: makeT(DEFAULT_LANG), money: (v, c) => formatMoney(DEFAULT_LANG, v, c), date: iso => formatDate(DEFAULT_LANG, iso) };
}
export const useT = () => useI18n().t;
