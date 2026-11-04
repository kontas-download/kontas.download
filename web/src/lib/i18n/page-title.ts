import { getT } from './server';

/** Browser tab title for a page: translated section name (a nav key), the layout adds " · kontas.download". */
export async function pageTitle(key: string): Promise<string> {
  const { t } = await getT();
  return t(key);
}
