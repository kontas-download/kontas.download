import { dictionaries } from './messages';
import { DEFAULT_LANG, LOCALES, type Lang } from './config';

export type Params = Record<string, string | number>;
export type T = (key: string, params?: Params) => string;

export function translate(lang: Lang, key: string, params?: Params): string {
  const text = dictionaries[lang][key] ?? dictionaries.en[key] ?? dictionaries[DEFAULT_LANG][key] ?? key;
  return params ? text.replace(/\{(\w+)\}/g, (whole, name) => (name in params ? String(params[name]) : whole)) : text;
}
export const makeT = (lang: Lang): T => (key, params) => translate(lang, key, params);

export const formatMoney = (lang: Lang, value: number, currency = 'EUR') => new Intl.NumberFormat(LOCALES[lang], { style: 'currency', currency }).format(value);
export const formatDate = (lang: Lang, iso: string) => (iso ? new Intl.DateTimeFormat(LOCALES[lang], { year: 'numeric', month: '2-digit', day: '2-digit', timeZone: 'UTC' }).format(new Date(`${iso.slice(0, 10)}T00:00:00Z`)) : '');
