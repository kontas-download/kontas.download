import { LANG_COOKIE, type Lang } from './config';

export function storeLang(lang: Lang) {
  document.cookie = `${LANG_COOKIE}=${lang}; path=/; max-age=31536000; samesite=lax`;
}
