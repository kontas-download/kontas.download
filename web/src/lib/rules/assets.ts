import { INITIAL_CHECK, REGISTRY_FROM, type RuleEntry } from './types';

// Fixed asset parameters (lib/fixed-assets.ts). Tax depreciation periods and the capitalisation threshold come from the
// Corporate Income Tax Law; the accounting policy of the company may set its own (the accountant has the last word per asset).
// Provisional until the accountant checks them against the law in force.
const EXAMPLE = 'fixed assets: depreciation schedule and rules';
const CIT_LAW = 'Lietuvos Respublikos pelno mokesčio įstatymas';
const provisional = (entry: Omit<RuleEntry, 'topic' | 'effectiveFrom' | 'effectiveTo' | 'status' | 'verifiedOn' | 'verifiedBy' | 'reviewBy' | 'example'>): RuleEntry => ({
  ...entry, topic: 'assets', effectiveFrom: REGISTRY_FROM, effectiveTo: null, status: 'provisional', ...INITIAL_CHECK, example: EXAMPLE,
});
const life = (category: string, years: number, title: RuleEntry['title'], article: string) => provisional({
  id: `assets.taxLife.${category}`, unit: 'years', value: years, title,
  basis: { actTitle: CIT_LAW, article: `1 priedas „Ilgalaikio turto nusidėvėjimo (amortizacijos) normatyvai“: ${article}`, sourceId: 'lt-cit-law' },
});

export const assetRules: RuleEntry[] = [
  provisional({
    id: 'assets.capitalization.minCost', unit: 'eur', value: 500,
    title: { lt: 'Mažiausia ilgalaikio turto įsigijimo kaina (pelno mokesčio tikslais)', ru: 'Минимальная стоимость приобретения долгосрочного имущества (для налога на прибыль)', en: 'Minimum acquisition cost of a fixed asset (corporate income tax)' },
    basis: { actTitle: CIT_LAW, article: '2 str. (ilgalaikio turto sąvoka: įsigijimo kaina ne mažesnė kaip 500 eurų)', sourceId: 'lt-cit-law' },
  }),
  provisional({
    id: 'assets.decliningBalance.factor', unit: 'factor', value: 2,
    title: { lt: 'Dvigubo balanso metodo koeficientas', ru: 'Коэффициент метода двойного уменьшающегося остатка', en: 'Double declining balance factor' },
    basis: { actTitle: CIT_LAW, article: '18 str. (nusidėvėjimo skaičiavimo metodai: tiesiogiai proporcingas, dvigubo balanso)', sourceId: 'lt-cit-law' },
  }),
  life('building', 15, { lt: 'Mažiausias nusidėvėjimo laikotarpis: kiti pastatai', ru: 'Минимальный срок амортизации: прочие здания', en: 'Minimum depreciation period: other buildings' }, 'kiti pastatai – 15 metų'),
  life('machinery', 5, { lt: 'Mažiausias nusidėvėjimo laikotarpis: mašinos ir įrengimai', ru: 'Минимальный срок амортизации: машины и оборудование', en: 'Minimum depreciation period: machinery and equipment' }, 'mašinos ir įrengimai – 5 metai'),
  life('vehicle', 6, { lt: 'Mažiausias nusidėvėjimo laikotarpis: lengvieji automobiliai', ru: 'Минимальный срок амортизации: легковые автомобили', en: 'Minimum depreciation period: passenger cars' }, 'lengvieji automobiliai, ne senesni kaip 5 metų – 6 metai'),
  life('computer', 3, { lt: 'Mažiausias nusidėvėjimo laikotarpis: kompiuterinė įranga ir ryšių priemonės', ru: 'Минимальный срок амортизации: компьютерная техника и средства связи', en: 'Minimum depreciation period: computers and communication equipment' }, 'kompiuterinė įranga ir ryšių priemonės – 3 metai'),
  life('furniture', 6, { lt: 'Mažiausias nusidėvėjimo laikotarpis: baldai', ru: 'Минимальный срок амортизации: мебель', en: 'Minimum depreciation period: furniture' }, 'baldai – 6 metai'),
  life('intangible', 3, { lt: 'Mažiausias amortizacijos laikotarpis: programinė įranga ir įsigytos teisės', ru: 'Минимальный срок амортизации: программное обеспечение и приобретённые права', en: 'Minimum amortisation period: software and acquired rights' }, 'programinė įranga, įsigytos teisės – 3 metai'),
  life('other', 4, { lt: 'Mažiausias nusidėvėjimo laikotarpis: kitas materialusis turtas', ru: 'Минимальный срок амортизации: прочее материальное имущество', en: 'Minimum depreciation period: other tangible assets' }, 'kitas materialusis turtas – 4 metai'),
];
