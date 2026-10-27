import type { HelpPage } from './types';

export const payrollPages: HelpPage[] = [
  {
    slug: 'payroll-runs',
    group: 'accounting',
    appHref: '/payroll',
    sources: ['lt-pit-law', 'sodra'],
    text: {
      lt: {
        title: 'Darbo užmokesčio skaičiavimas (laikinas)',
        summary: 'Darbuotojai, mėnesio DU skaičiavimas pagal taisyklių registrą, rankiniai pakeitimai su priežastimi ir registravimas apskaitoje.',
        purpose: [
          'Skiltyje „DU skaičiavimas“ vedami darbuotojai ir kuriamas kiekvieno mėnesio skaičiavimas: NPD, GPM, Sodros įmokos (darbuotojo ir darbdavio) imami iš taisyklių registro to mėnesio datai.',
          'Kiekvienoje eilutėje rodoma apskaičiuota ir galutinė reikšmė. Buhalteris gali pakeisti bruto sumą arba bet kurią sumą ranka; paskutinis žodis lieka jam, o pakeitimas su priežastimi įrašomas į pakeitimų žurnalą.',
        ],
        steps: [
          'Pridėkite darbuotojus (bruto atlyginimas, sutarties rūšis, ar taikomas NPD, kaupimas pensijai, darbo pradžia ir pabaiga).',
          'Pasirinkite metus ir mėnesį ir sukurkite mėnesio skaičiavimą; į jį įtraukiami tą mėnesį dirbantys aktyvūs darbuotojai.',
          'Peržiūrėkite eilutes; prireikus pakeiskite bruto arba pasirinkite „Keisti rankiniu būdu“, įveskite sumą ir privalomą priežastį. Tuščia suma grąžina apskaičiuotą reikšmę.',
          'Pažymėkite skaičiavimą patikrintu ir užregistruokite apskaitoje: sukuriami DU žurnalo įrašai. Registravimą galima atšaukti, jei laikotarpis neuždarytas.',
        ],
        rules: [
          'Skaičiavimas laikinas: kol buhalteris nepatikrino taisyklių ir sumų, rezultatų nenaudokite deklaracijoms (GPM, Sodros pranešimams).',
          'Pakeitus darbuotoją, bruto ar taisykles, patikros žyma panaikinama ir skaičiavimą reikia pažymėti patikrintu iš naujo.',
          'Užregistruoto skaičiavimo keisti negalima: pirmiausia atšaukite registravimą nurodydami priežastį.',
          'Metinės sumos (NPD, įmokų lubos) skaičiuojamos pagal ankstesnių užregistruotų tų metų mėnesių duomenis.',
        ],
        mistakes: [
          'Nepamirškite perskaičiuoti skaičiavimo pakeitus darbuotojo nustatymus: sumos savaime neatnaujinamos.',
          'Rankinis pakeitimas be teisinio pagrindo ar paaiškinimo apsunkina patikrą; priežastį rašykite aiškiai.',
        ],
      },
      ru: {
        title: 'Расчёт зарплаты (временный)',
        summary: 'Сотрудники, ежемесячный расчёт зарплаты по реестру правил, ручные изменения с причиной и проведение в учёте.',
        purpose: [
          'В разделе «Расчёт зарплаты» ведутся сотрудники и создаётся расчёт за каждый месяц: НПД, GPM и взносы Sodra (работника и работодателя) берутся из реестра правил на дату месяца.',
          'В каждой строке показаны расчётное и итоговое значения. Бухгалтер может изменить брутто или любую сумму вручную; последнее слово остаётся за ним, а изменение с причиной записывается в журнал изменений.',
        ],
        steps: [
          'Добавьте сотрудников (оклад брутто, вид договора, применяется ли НПД, накопление на пенсию, начало и окончание работы).',
          'Выберите год и месяц и создайте расчёт; в него попадают активные сотрудники, работающие в этом месяце.',
          'Проверьте строки; при необходимости измените брутто или выберите «Изменить вручную», введите сумму и обязательную причину. Пустая сумма возвращает расчётное значение.',
          'Отметьте расчёт проверенным и проведите в учёте: создаются записи журнала по зарплате. Проведение можно отменить, если период не закрыт.',
        ],
        rules: [
          'Расчёт временный: пока бухгалтер не проверил правила и суммы, не используйте результаты для деклараций (GPM, сообщения Sodra).',
          'После изменения сотрудника, брутто или правил отметка о проверке снимается, и расчёт нужно отметить проверенным заново.',
          'Проведённый расчёт изменить нельзя: сначала отмените проведение, указав причину.',
          'Годовые суммы (НПД, потолок взносов) считаются по данным ранее проведённых месяцев этого года.',
        ],
        mistakes: [
          'Не забудьте пересчитать расчёт после изменения настроек сотрудника: суммы сами не обновляются.',
          'Ручное изменение без основания или пояснения усложняет проверку; пишите причину ясно.',
        ],
      },
      en: {
        title: 'Payroll calculation (provisional)',
        summary: 'Employees, the monthly payroll calculated from the rules registry, manual changes with a reason, and posting to the ledger.',
        purpose: [
          'The "Payroll calculation" section keeps the employees and creates a calculation for each month: NPD, income tax (GPM) and Sodra contributions (employee and employer) come from the rules registry for the date of the month.',
          'Every line shows the computed and the final value. The accountant can change the gross pay or any amount by hand; the accountant has the last word, and the change with its reason is written to the change log.',
        ],
        steps: [
          'Add the employees (gross salary, contract type, whether NPD applies, pension accumulation, start and end of employment).',
          'Choose the year and month and create the monthly run; it includes the active employees who work in that month.',
          'Review the lines; if needed change the gross pay or choose "Override", enter the amount and the mandatory reason. An empty amount restores the computed value.',
          'Mark the run as verified and post it to the ledger: the payroll journal entries are created. Posting can be undone while the period is not closed.',
        ],
        rules: [
          'The calculation is provisional: until the accountant has verified the rules and amounts, do not use the results for declarations (GPM, Sodra notices).',
          'Changing an employee, the gross pay or the rules clears the verification mark; the run must be marked as verified again.',
          'A posted run cannot be changed: unpost it first and state the reason.',
          'Annual amounts (NPD, contribution ceiling) are computed from the earlier posted months of the same year.',
        ],
        mistakes: [
          'Remember to recalculate the run after changing an employee setting: amounts do not refresh by themselves.',
          'A manual change without a basis or explanation makes verification harder; write the reason clearly.',
        ],
      },
    },
  },
];
