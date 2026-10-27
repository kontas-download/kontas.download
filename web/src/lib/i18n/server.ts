import { cookies, headers } from 'next/headers';
import { LANG_COOKIE, pickLang, type Lang } from './config';
import { makeT, type T } from './translate';

export async function getLang(): Promise<Lang> {
  return pickLang((await cookies()).get(LANG_COOKIE)?.value, (await headers()).get('accept-language'));
}
export async function getT(): Promise<{ lang: Lang; t: T }> {
  const lang = await getLang();
  return { lang, t: makeT(lang) };
}
