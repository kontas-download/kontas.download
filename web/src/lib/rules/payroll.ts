import { INITIAL_CHECK, type RuleEntry, type RuleUnit } from './types';

// Payroll values. The first three entries are the rates of the approximate estimate on the manual payroll form (src/app/payrolls);
// payroll.gpm.rate is also the first (basic) income tax rate of the payroll calculation (lib/payroll-calc.ts). The other entries are
// the 2026 parameters of the payroll calculation, taken from the private source research (legal/vmi-formu-saltiniai.md, section 3).
// Every payroll entry is provisional: the owner's accountant must verify it before the results are used in returns.
const provisional = { status: 'provisional' as const, ...INITIAL_CHECK, effectiveFrom: '2019-01-01', effectiveTo: null, topic: 'payroll' as const, unit: 'percent' as const };

const SODRA_2026 = 'https://sodra.lt/nuo-2026-m-sausio-1-d-taikomi-sodros-imoku-tarifai-turintiems-samdomu-darbuotoju';
const FINMIN_2026 = 'https://finmin.lrv.lt/lt/naujienos/seimo-priimti-mokesciu-istatymu-pakeitimai/';
const MMA_2026 = 'https://socmin.lrv.lt/lt/naujienos/patvirtinta-mma-nuo-2026-m-1153-eurai-mNK/';
const PIT_LAW = 'Lietuvos Respublikos gyventojų pajamų mokesčio įstatymas Nr. IX-1007';
const SODRA_LAW = 'Lietuvos Respublikos valstybinio socialinio draudimo įstatymas';
// Control example (title of a test in tests/payroll.cjs) shared by the 2026 parameters.
const GOLDEN = 'payroll: golden examples 2026';

const y2026 = (id: string, unit: RuleUnit, value: number, title: RuleEntry['title'], basis: RuleEntry['basis'], example = GOLDEN): RuleEntry => ({
  id, topic: 'payroll', unit, value, title, basis, effectiveFrom: '2026-01-01', effectiveTo: null, status: 'provisional', ...INITIAL_CHECK, example,
});

export const payrollRules: RuleEntry[] = [
  {
    id: 'payroll.gpm.rate', value: 20, ...provisional,
    title: { lt: 'GPM tarifas darbo užmokesčiui (pagrindinis, iki 36 VDU per metus)', ru: 'Ставка GPM для зарплаты (основная, до 36 VDU в год)', en: 'Personal income tax rate on salary (basic, up to 36 VDU a year)' },
    basis: { actTitle: PIT_LAW, article: '6 str.', sourceId: 'lt-pit-law' },
    example: 'rules: payroll rates reach the payroll form',
  },
  {
    id: 'payroll.sodra.employee', value: 19.5, ...provisional,
    title: { lt: 'Darbuotojo „Sodros“ įmokos (VSD ir PSD)', ru: 'Взносы Sodra работника (VSD и PSD)', en: 'Employee Sodra contributions (social and health insurance)' },
    basis: { actTitle: 'Lietuvos Respublikos valstybinio socialinio draudimo įstatymas; Lietuvos Respublikos sveikatos draudimo įstatymas', sourceId: 'sodra' },
    example: 'rules: payroll rates reach the payroll form',
  },
  {
    id: 'payroll.sodra.employer', value: 1.77, ...provisional,
    title: { lt: 'Darbdavio „Sodros“ įmokos', ru: 'Взносы Sodra работодателя', en: 'Employer Sodra contributions' },
    basis: { actTitle: 'Lietuvos Respublikos valstybinio socialinio draudimo įstatymas', sourceId: 'sodra' },
    example: 'rules: payroll rates reach the payroll form',
  },

  // Amounts of 2026.
  y2026('payroll.mma', 'eur', 1153,
    { lt: 'Minimalioji mėnesio alga (MMA)', ru: 'Минимальная месячная зарплата (MMA)', en: 'Minimum monthly wage (MMA)' },
    { actTitle: 'LR Vyriausybės 2025-10-16 nutarimas Nr. 700 „Dėl 2026 metais taikomo minimaliojo darbo užmokesčio“', url: MMA_2026 }),
  y2026('payroll.vdu', 'eur', 2312.15,
    { lt: 'Vidutinis darbo užmokestis (VDU) įmokų lubų ir GPM ribų skaičiavimui', ru: 'Средняя зарплата (VDU) для потолка взносов и порогов GPM', en: 'Average wage (VDU) for the contribution ceiling and income tax thresholds' },
    { actTitle: 'LR Vyriausybės nutarimas dėl 2026 m. VDU (numeris nepatikrintas); „Sodros“ paskelbti 2026 m. dydžiai', sourceId: 'sodra', url: SODRA_2026 }),

  // Tax-exempt amount (NPD): max when the month's income <= MMA, otherwise max - coefficient x (income - MMA), not below zero.
  y2026('payroll.npd.max', 'eur', 747,
    { lt: 'Didžiausias mėnesio NPD (kai pajamos neviršija MMA)', ru: 'Максимальный месячный NPD (доход не выше MMA)', en: 'Maximum monthly tax-exempt amount (income up to MMA)' },
    { actTitle: PIT_LAW, article: '20 str. (straipsnis nepatikrintas)', sourceId: 'lt-pit-law' }),
  y2026('payroll.npd.coefficient', 'factor', 0.49,
    { lt: 'NPD mažinimo koeficientas (747 − 0,49 × (pajamos − MMA))', ru: 'Коэффициент уменьшения NPD (747 − 0,49 × (доход − MMA))', en: 'Tax-exempt amount reduction coefficient (747 − 0.49 × (income − MMA))' },
    { actTitle: PIT_LAW, article: '20 str. (straipsnis nepatikrintas)', sourceId: 'lt-pit-law' }),

  // Progressive income tax on employment income (annual income from the same employer).
  y2026('payroll.gpm.rate2', 'percent', 25,
    { lt: 'GPM tarifas darbo pajamų daliai tarp 36 ir 60 VDU per metus', ru: 'Ставка GPM для части дохода от 36 до 60 VDU в год', en: 'Income tax rate on the part of annual income between 36 and 60 VDU' },
    { actTitle: PIT_LAW + ' (2026-01-01 redakcija)', article: '6 str. (straipsnis nepatikrintas)', sourceId: 'lt-pit-law', url: FINMIN_2026 }),
  y2026('payroll.gpm.rate3', 'percent', 32,
    { lt: 'GPM tarifas darbo pajamų daliai virš 60 VDU per metus', ru: 'Ставка GPM для части дохода свыше 60 VDU в год', en: 'Income tax rate on the part of annual income above 60 VDU' },
    { actTitle: PIT_LAW + ' (2026-01-01 redakcija)', article: '6 str. (straipsnis nepatikrintas)', sourceId: 'lt-pit-law', url: FINMIN_2026 }),
  y2026('payroll.gpm.band2FromVdu', 'factor', 36,
    { lt: 'Metinių darbo pajamų riba (VDU kartotinis), nuo kurios taikomas antrasis GPM tarifas', ru: 'Порог годового дохода (кратность VDU) для второй ставки GPM', en: 'Annual income threshold (multiple of VDU) of the second income tax rate' },
    { actTitle: PIT_LAW + ' (2026-01-01 redakcija)', article: '6 str. (straipsnis nepatikrintas)', sourceId: 'lt-pit-law', url: FINMIN_2026 }),
  y2026('payroll.gpm.band3FromVdu', 'factor', 60,
    { lt: 'Metinių darbo pajamų riba (VDU kartotinis), nuo kurios taikomas trečiasis GPM tarifas', ru: 'Порог годового дохода (кратность VDU) для третьей ставки GPM', en: 'Annual income threshold (multiple of VDU) of the third income tax rate' },
    { actTitle: PIT_LAW + ' (2026-01-01 redakcija)', article: '6 str. (straipsnis nepatikrintas)', sourceId: 'lt-pit-law', url: FINMIN_2026 }),

  // Sodra: employee contributions (VSD capped by the annual ceiling, PSD not capped) and the employer's components.
  y2026('payroll.sodra.ceilingVdu', 'factor', 60,
    { lt: 'Metinės VSD įmokų bazės lubos (VDU kartotinis)', ru: 'Годовой потолок базы взносов VSD (кратность VDU)', en: 'Annual ceiling of the social insurance contribution base (multiple of VDU)' },
    { actTitle: SODRA_LAW, article: 'straipsnis nepatikrintas', sourceId: 'sodra', url: SODRA_2026 }),
  y2026('payroll.sodra.employee.vsd', 'percent', 12.52,
    { lt: 'Darbuotojo VSD įmokos (pensijų 8,72 + ligos 1,99 + motinystės 1,81)', ru: 'Взносы VSD работника (пенсия 8,72 + болезнь 1,99 + материнство 1,81)', en: 'Employee social insurance (pension 8.72 + sickness 1.99 + maternity 1.81)' },
    { actTitle: SODRA_LAW, sourceId: 'sodra', url: SODRA_2026 }),
  y2026('payroll.sodra.employee.psd', 'percent', 6.98,
    { lt: 'Darbuotojo PSD (privalomojo sveikatos draudimo) įmokos', ru: 'Взносы PSD работника (обязательное медицинское страхование)', en: 'Employee compulsory health insurance (PSD)' },
    { actTitle: 'Lietuvos Respublikos sveikatos draudimo įstatymas', sourceId: 'sodra', url: SODRA_2026 }),
  y2026('payroll.sodra.employee.pension', 'percent', 3,
    { lt: 'Papildoma įmoka dalyvaujant pensijų kaupime (II pakopa)', ru: 'Дополнительный взнос при участии в пенсионном накоплении (II ступень)', en: 'Additional contribution of a pension accumulation participant (2nd pillar)' },
    { actTitle: 'Lietuvos Respublikos pensijų kaupimo įstatymas', sourceId: 'sodra', url: SODRA_2026 }),
  y2026('payroll.sodra.employer.unemployment', 'percent', 1.31,
    { lt: 'Darbdavio nedarbo socialinio draudimo įmokos (neterminuota sutartis)', ru: 'Взносы работодателя на страхование от безработицы (бессрочный договор)', en: 'Employer unemployment insurance (open-ended contract)' },
    { actTitle: SODRA_LAW, sourceId: 'sodra', url: SODRA_2026 }),
  y2026('payroll.sodra.employer.unemploymentFixedTerm', 'percent', 2.03,
    { lt: 'Darbdavio nedarbo socialinio draudimo įmokos (terminuota sutartis)', ru: 'Взносы работодателя на страхование от безработицы (срочный договор)', en: 'Employer unemployment insurance (fixed-term contract)' },
    { actTitle: SODRA_LAW, sourceId: 'sodra', url: SODRA_2026 }),
  y2026('payroll.sodra.employer.accidentMin', 'percent', 0.14,
    { lt: 'Nelaimingų atsitikimų darbe draudimo tarifas: mažiausias (I grupė)', ru: 'Тариф страхования от несчастных случаев: минимальный (I группа)', en: 'Accidents at work insurance rate: lowest (group I)' },
    { actTitle: SODRA_LAW, sourceId: 'sodra', url: SODRA_2026 }),
  y2026('payroll.sodra.employer.accidentMax', 'percent', 1.4,
    { lt: 'Nelaimingų atsitikimų darbe draudimo tarifas: didžiausias (IV grupė)', ru: 'Тариф страхования от несчастных случаев: максимальный (IV группа)', en: 'Accidents at work insurance rate: highest (group IV)' },
    { actTitle: SODRA_LAW, sourceId: 'sodra', url: SODRA_2026 }),
  y2026('payroll.sodra.employer.accidentDefault', 'percent', 0.49,
    { lt: 'Nelaimingų atsitikimų darbe draudimo tarifas pagal nutylėjimą (II grupė)', ru: 'Тариф страхования от несчастных случаев по умолчанию (II группа)', en: 'Default accidents at work insurance rate (group II)' },
    { actTitle: SODRA_LAW, sourceId: 'sodra', url: SODRA_2026 }),
  y2026('payroll.sodra.employer.guarantee', 'percent', 0.16,
    { lt: 'Garantinio fondo įmokos', ru: 'Взносы в Гарантийный фонд', en: 'Guarantee Fund contributions' },
    { actTitle: 'Lietuvos Respublikos garantinio fondo įstatymas', sourceId: 'sodra', url: SODRA_2026 }),
  y2026('payroll.sodra.employer.longTerm', 'percent', 0.16,
    { lt: 'Ilgalaikio darbo išmokų fondo įmokos', ru: 'Взносы в Фонд выплат за долгосрочную работу', en: 'Long-term Employment Benefit Fund contributions' },
    { actTitle: 'Lietuvos Respublikos ilgalaikio darbo išmokų fondo įstatymas', sourceId: 'sodra', url: SODRA_2026 }),
];
