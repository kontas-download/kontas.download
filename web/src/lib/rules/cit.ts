import { INITIAL_CHECK, REGISTRY_FROM, type RuleEntry } from './types';

// Standard corporate income tax (pelno mokestis) rate by year. Every entry is provisional: the values are not entered from the
// primary source and must be checked by the owner's accountant. Reliefs and special regimes are not covered.
const BASIS = {
  actTitle: 'Laikina: reikšmės neįrašytos iš pirminio šaltinio, tikrintina pagal VMI (https://www.vmi.lt/evmi/tarifai-5-str.-) ir PMĮ 5 str.; neapima lengvatų ir ypatingų režimų',
  article: '5 str.',
  url: 'https://www.vmi.lt/evmi/tarifai-5-str.-',
};
const EXAMPLE = 'cit: rate by year';
const TITLE: RuleEntry['title'] = { lt: 'Pelno mokesčio tarifas (standartinis)', ru: 'Ставка налога на прибыль (стандартная)', en: 'Corporate income tax rate (standard)' };
const rate = (value: number, effectiveFrom: string, effectiveTo: string | null): RuleEntry => ({
  id: 'cit.rate.standard', topic: 'cit', unit: 'percent', value, effectiveFrom, effectiveTo, title: TITLE, basis: BASIS,
  status: 'provisional', ...INITIAL_CHECK, example: EXAMPLE,
});

export const citRules: RuleEntry[] = [
  rate(15, REGISTRY_FROM, '2024-12-31'),
  rate(16, '2025-01-01', '2025-12-31'),
  rate(17, '2026-01-01', null),
];
