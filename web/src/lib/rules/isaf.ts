import { INITIAL_CHECK, REGISTRY_FROM, type RuleEntry } from './types';

// The i.SAF tax code catalogue (codes, their rates and FR0600 fields) is kept as a structured table in lib/tax-codes.ts (TAX_CODES):
// a rate there belongs to the code itself (a new rate gets a new code from VMI), so it is not repeated here. This entry records
// the source and review dates of that catalogue.
export const isafRules: RuleEntry[] = [
  {
    id: 'isaf.taxCodes.catalogue', topic: 'isaf', unit: 'reference', value: 'lib/tax-codes.ts TAX_CODES',
    title: { lt: 'i.SAF mokesčių kodų katalogas (kodai, tarifai, FR0600 laukai)', ru: 'Каталог налоговых кодов i.SAF (коды, ставки, поля FR0600)', en: 'i.SAF tax code catalogue (codes, rates, FR0600 fields)' },
    effectiveFrom: REGISTRY_FROM, effectiveTo: null,
    basis: { actTitle: 'VMI lentelė „Dažniausiai pasitaikančių sandorių deklaravimas FR0600 + i.SAF kodas“ (2025-12-17); i.SAF 1.2.1 aprašymas', sourceId: 'vmi-isaf-rules' },
    status: 'verified', ...INITIAL_CHECK, example: 'rules: isaf.taxCodes.catalogue',
  },
];
