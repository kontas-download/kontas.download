export const LANGS = ['lt', 'ru', 'en'] as const;
export type Lang = (typeof LANGS)[number];
export const LANG_COOKIE = 'lang';
export const DEFAULT_LANG: Lang = 'lt';
export const LANG_NAMES: Record<Lang, string> = { lt: 'Lietuvių', ru: 'Русский', en: 'English' };
export const LOCALES: Record<Lang, string> = { lt: 'lt-LT', ru: 'ru-RU', en: 'en-GB' };

export function isLang(value: unknown): value is Lang {
  return typeof value === 'string' && (LANGS as readonly string[]).includes(value);
}

// First supported language of an Accept-Language header, otherwise the default.
export function pickLang(cookie: string | undefined, acceptLanguage: string | null | undefined): Lang {
  if (isLang(cookie)) return cookie;
  for (const part of (acceptLanguage || '').split(',')) {
    const code = part.split(';')[0].trim().slice(0, 2).toLowerCase();
    if (isLang(code)) return code;
  }
  return DEFAULT_LANG;
}
