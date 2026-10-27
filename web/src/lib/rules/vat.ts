import { INITIAL_CHECK, REGISTRY_FROM, type RuleEntry } from './types';

// VAT rates of domestic taxed supplies (classified automatically to i.SAF codes PVM1, PVM2, PVM3, PVM58) and the VAT return
// deadline. Rates: confirmed by the VMI table "Dažniausiai pasitaikančių sandorių deklaravimas FR0600 + i.SAF kodas" (2025-12-17,
// docs/vmi/FR0600_isaf_kodai.pdf). The per-code rates of the full i.SAF catalogue stay in tax-codes.ts (entry isaf.taxCodes.catalogue).
const TABLE = 'VMI lentelė „Dažniausiai pasitaikančių sandorių deklaravimas FR0600 + i.SAF kodas“ (2025-12-17)';
const rate = (id: string, value: number, code: string, from: string, title: RuleEntry['title']): RuleEntry => ({
  id, topic: 'vat', title, unit: 'percent', value, effectiveFrom: from, effectiveTo: null,
  basis: { actTitle: TABLE, article: `i.SAF kodas ${code}; PVMĮ 19 str.`, sourceId: 'lt-vat-law' },
  status: 'verified', ...INITIAL_CHECK, example: `rules: ${id}`,
});

export const vatRules: RuleEntry[] = [
  rate('vat.rate.standard', 21, 'PVM1', REGISTRY_FROM, { lt: 'Standartinis PVM tarifas', ru: 'Стандартная ставка НДС', en: 'Standard VAT rate' }),
  rate('vat.rate.reduced9', 9, 'PVM2', REGISTRY_FROM, { lt: 'Lengvatinis PVM tarifas 9 %', ru: 'Льготная ставка НДС 9 %', en: 'Reduced VAT rate 9%' }),
  rate('vat.rate.reduced5', 5, 'PVM3', REGISTRY_FROM, { lt: 'Lengvatinis PVM tarifas 5 %', ru: 'Льготная ставка НДС 5 %', en: 'Reduced VAT rate 5%' }),
  rate('vat.rate.reduced12', 12, 'PVM58', '2026-01-01', { lt: 'Lengvatinis PVM tarifas 12 %', ru: 'Льготная ставка НДС 12 %', en: 'Reduced VAT rate 12%' }),
  {
    id: 'vat.return.dueDay', topic: 'vat', unit: 'dayOfMonth', value: 25, effectiveFrom: REGISTRY_FROM, effectiveTo: null,
    title: { lt: 'PVM deklaracijos FR0600 pateikimo ir PVM sumokėjimo diena (kito laikotarpio pirmasis mėnuo)', ru: 'День подачи декларации НДС FR0600 и уплаты НДС (первый месяц следующего периода)', en: 'Day the FR0600 VAT return is due and VAT is paid (first month of the next period)' },
    basis: { actTitle: 'Lietuvos Respublikos pridėtinės vertės mokesčio įstatymas; VMI KM1112', article: 'iki kito mokestinio laikotarpio pirmojo mėnesio 25 d.', sourceId: 'lt-vat-law' },
    status: 'provisional', ...INITIAL_CHECK, example: 'rules: vat.return.dueDay',
  },
];
