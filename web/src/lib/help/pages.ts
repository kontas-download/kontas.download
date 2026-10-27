import type { HelpPage } from './types';
import { startPages } from './pages-start';
import { salesPages } from './pages-sales';
import { purchasePages } from './pages-purchases';
import { bankPages } from './pages-bank';
import { accountingPages } from './pages-accounting';
import { taxPages } from './pages-tax';
import { systemPages } from './pages-system';
import { assetPages } from './pages-assets';
import { inventoryPages } from './pages-inventory';
import { dataPages } from './pages-data';
import { userPages } from './pages-users';
import { demoPages } from './pages-demo';
import { rulesPages } from './pages-rules';
import { payrollPages } from './pages-payroll';

// Table of contents order.
export const helpPages: HelpPage[] = [...startPages, ...demoPages, ...salesPages, ...purchasePages, ...bankPages, ...accountingPages, ...payrollPages, ...taxPages, ...systemPages, ...rulesPages, ...userPages, ...dataPages, ...assetPages, ...inventoryPages];

export function helpPage(slug: string): HelpPage | undefined {
  return helpPages.find(page => page.slug === slug);
}
