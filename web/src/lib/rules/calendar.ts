import { INITIAL_CHECK, REGISTRY_FROM, type RuleEntry } from './types';

// Nominal deadlines of the tax calendar (lib/tax-calendar.ts) other than the VAT return (vat.return.dueDay). Weekend and holiday
// carry-over is not part of these values. Provisional until the accountant checks them against the VMI sources.
const deadline = (entry: Omit<RuleEntry, 'topic' | 'effectiveFrom' | 'effectiveTo' | 'status' | 'verifiedOn' | 'verifiedBy' | 'reviewBy' | 'example'> & { example?: string }): RuleEntry => ({
  ...entry, topic: 'calendar', effectiveFrom: REGISTRY_FROM, effectiveTo: null, status: 'provisional', ...INITIAL_CHECK, example: entry.example ?? 'rules: calendar deadlines in the tax calendar',
});

export const calendarRules: RuleEntry[] = [
  deadline({
    id: 'calendar.fr0564.dueDay', unit: 'dayOfMonth', value: 25,
    title: { lt: 'FR0564 ataskaitos pateikimo diena (kitas mėnuo)', ru: 'День подачи отчёта FR0564 (следующий месяц)', en: 'FR0564 report due day (next month)' },
    basis: { actTitle: 'VMI viršininko 2004-03-12 įsakymas Nr. VA-34 (FR0564 užpildymo, teikimo ir tikslinimo taisyklės), suvestinė redakcija nuo 2025-05-01 (pakeitimas VA-40)', article: '6 punktas: iki kito kalendorinio mėnesio 25 d.', sourceId: 'vmi-fr0564-rules' },
    example: 'fr0564: filing deadline is the 25th of the next month',
  }),
  deadline({
    id: 'calendar.gpm313.dueDay', unit: 'dayOfMonth', value: 15,
    title: { lt: 'GPM313 mėnesinės pajamų deklaracijos pateikimo diena (kitas mėnuo)', ru: 'День подачи месячной декларации GPM313 (следующий месяц)', en: 'GPM313 monthly income declaration due day (next month)' },
    basis: { actTitle: 'VMI viršininko 2017-12-20 įsakymas Nr. VA-121 (GPM313 užpildymo ir pateikimo tvarkos aprašas), paskutiniai pakeitimai VA-105 (2025-11-20); GPMĮ 24 str. 2 d.', article: '12 punktas: iki kito mėnesio 15 d.', sourceId: 'vmi-gpm313-rules' },
    example: 'gpm313: filing deadline is the 15th of the next month',
  }),
  deadline({
    id: 'calendar.gpm312.due', unit: 'nextYearDate', value: '02-15',
    title: { lt: 'GPM312 metinės pajamų deklaracijos pateikimo data (kiti metai)', ru: 'Дата подачи годовой декларации GPM312 (следующий год)', en: 'GPM312 annual income declaration due date (next year)' },
    basis: { actTitle: 'VMI viršininko 2018-02-06 įsakymas Nr. VA-9 (GPM312 užpildymo ir pateikimo taisyklės), redakcija 2026-03-26 įsakymu Nr. VA-24; GPMĮ 24 str. 2 d., 33 str. 2 d.', article: '57 punktas: iki kito mokestinio laikotarpio vasario 15 d.', sourceId: 'vmi-gpm312-rules' },
    example: 'gpm312: filing deadline is 15 February of the next year',
  }),
  deadline({
    id: 'calendar.pln204.due', unit: 'nextYearDate', value: '06-15',
    title: { lt: 'PLN204 metinės pelno mokesčio deklaracijos pateikimo data (kiti metai, kalendoriniai mokestiniai metai)', ru: 'Дата подачи годовой декларации налога на прибыль PLN204 (следующий год, календарный налоговый год)', en: 'PLN204 annual corporate income tax return due date (next year, calendar tax year)' },
    basis: { actTitle: 'Lietuvos Respublikos pelno mokesčio įstatymas', article: 'iki kitų metų birželio 15 d.', sourceId: 'lt-cit-law' },
  }),
];
