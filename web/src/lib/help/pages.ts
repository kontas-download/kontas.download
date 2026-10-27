import type { HelpPage } from './types';
import { startPages } from './pages-start';
import { salesPages } from './pages-sales';
import { purchasePages } from './pages-purchases';
import { bankPages } from './pages-bank';
import { accountingPages } from './pages-accounting';
import { taxPages } from './pages-tax';
import { systemPages } from './pages-system';
import { dataPages } from './pages-data';
import { userPages } from './pages-users';

// Table of contents order.
export const helpPages: HelpPage[] = [...startPages, ...salesPages, ...purchasePages, ...bankPages, ...accountingPages, ...taxPages, ...systemPages, ...userPages, ...dataPages];

export function helpPage(slug: string): HelpPage | undefined {
  return helpPages.find(page => page.slug === slug);
}
