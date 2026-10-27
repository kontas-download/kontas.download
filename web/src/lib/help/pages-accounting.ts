import type { HelpPage } from './types';

export const accountingPages: HelpPage[] = [
  {
    slug: 'ledger',
    group: 'accounting',
    appHref: '/ledger',
    sources: ['lt-financial-accounting-law', 'lt-business-accounting-standards'],
    text: {
      lt: {
        title: 'Didžioji knyga (žurnalas)',
        summary: 'Automatiniai ir rankiniai buhalteriniai įrašai.',
        purpose: ['Didžiojoje knygoje matomi visi įmonės įrašai: debetas, kreditas, suma, data ir šaltinis. Iš jų sudaromas apyvartos žiniaraštis, pelno (nuostolių) ataskaita ir balansas.'],
        steps: [
          'Atidarykite „Didžioji knyga (Žurnalas)“ ir filtruokite pagal laikotarpį ar sąskaitą.',
          'Rankiniam įrašui (pvz. nusidėvėjimas, atsargų nurašymas, sukauptos sąnaudos) įveskite datą, debeto ir kredito sąskaitas, sumą ir aprašymą.',
          'Automatinius įrašus taisykite per jų šaltinio dokumentą (pardavimą, pirkimą, banko operaciją, darbo užmokestį).',
        ],
        rules: [
          'Data, debetas, kreditas ir suma privalomi.',
          'Automatinių įrašų (pardavimų, pirkimų, banko, DU) redaguoti ar trinti tiesiogiai negalima; ištrynus šaltinio dokumentą jo įrašai pašalinami.',
          'Rankiniai įrašai išsaugomi ir automatiškai neperskaičiuojami.',
          'Istoriniai įrašai tyliai neperrašomi ir nepildomi atgaline data.',
          'Uždarytame laikotarpyje įrašų kurti, keisti ar trinti negalima.',
          'Numatytosios sąskaitos (2410, 4430, 2444, 4492, 5001, 6118, 2710, 6304, 4480–4482) yra programos susitarimas, o ne automatinis kiekvienos ūkinės operacijos klasifikavimas.',
        ],
        mistakes: [
          'Bandoma pataisyti automatinį įrašą ranka – pakeiskite šaltinio dokumentą.',
          'Rankiniu įrašu dubliuojama operacija, kurią jau įregistravo dokumentas.',
        ],
      },
      ru: {
        title: 'Главная книга (журнал)',
        summary: 'Автоматические и ручные бухгалтерские проводки.',
        purpose: ['В главной книге видны все проводки компании: дебет, кредит, сумма, дата и источник. Из них строятся оборотная ведомость, отчёт о прибыли и баланс.'],
        steps: [
          'Откройте «Главная книга (журнал)» и отфильтруйте по периоду или счёту.',
          'Для ручной проводки (например, амортизация, списание запасов, начисленные расходы) введите дату, счета дебета и кредита, сумму и описание.',
          'Автоматические проводки исправляйте через их исходный документ (продажа, покупка, банковская операция, зарплата).',
        ],
        rules: [
          'Дата, дебет, кредит и сумма обязательны.',
          'Автоматические проводки (продажи, покупки, банк, зарплата) нельзя редактировать или удалять напрямую; при удалении исходного документа его проводки удаляются.',
          'Ручные проводки сохраняются и автоматически не пересчитываются.',
          'Исторические проводки не переписываются молча и не дополняются задним числом.',
          'В закрытом периоде проводки нельзя создавать, изменять или удалять.',
          'Счета по умолчанию (2410, 4430, 2444, 4492, 5001, 6118, 2710, 6304, 4480–4482) — соглашение программы, а не автоматическая классификация каждой хозяйственной операции.',
        ],
        mistakes: [
          'Попытка исправить автоматическую проводку вручную — измените исходный документ.',
          'Ручная проводка дублирует операцию, уже отражённую документом.',
        ],
      },
      en: {
        title: 'General ledger (journal)',
        summary: 'Automatic and manual journal entries.',
        purpose: ['The general ledger shows all company entries: debit, credit, amount, date and source. The trial balance, income statement and balance sheet are built from it.'],
        steps: [
          'Open "General ledger (journal)" and filter by period or account.',
          'For a manual entry (for example depreciation, stock write-off, accruals) enter the date, debit and credit accounts, amount and description.',
          'Correct automatic entries through their source document (sale, purchase, bank transaction, payroll).',
        ],
        rules: [
          'Date, debit, credit and amount are required.',
          'Automatic entries (sales, purchases, bank, payroll) cannot be edited or deleted directly; deleting the source document removes its entries.',
          'Manual entries are preserved and never recalculated automatically.',
          'Historical entries are not silently rewritten or backfilled.',
          'Entries in a locked period cannot be created, changed or deleted.',
          'The default accounts (2410, 4430, 2444, 4492, 5001, 6118, 2710, 6304, 4480–4482) are application conventions, not an automatic classification of every economic transaction.',
        ],
        mistakes: [
          'Trying to fix an automatic entry by hand: change the source document.',
          'A manual entry duplicating a transaction already posted by a document.',
        ],
      },
    },
  },
  {
    slug: 'reports',
    group: 'accounting',
    appHref: '/financial-statements',
    sources: ['lt-financial-accounting-law', 'lt-business-accounting-standards'],
    text: {
      lt: {
        title: 'Apyvartos žiniaraštis, pelno (nuostolių) ataskaita ir balansas',
        summary: 'Ataskaitos, sudaromos iš didžiosios knygos įrašų.',
        purpose: [
          'Apyvartos žiniaraštis rodo kiekvienos sąskaitos pradinį likutį, debeto ir kredito apyvartas ir galutinį likutį pasirinktam laikotarpiui bei tikrina, ar debetas lygus kreditui.',
          'Pelno (nuostolių) ataskaita ir balansas sugrupuoja sąskaitas pagal sąskaitų plano klases (5 – pajamos, 6 – sąnaudos, 1–4 – turtas, nuosavas kapitalas ir įsipareigojimai) ir parodo, ar balansas subalansuotas.',
        ],
        steps: [
          'Atidarykite „Apyvartos žiniaraštis“, pasirinkite laikotarpį ir, jei reikia, sąskaitų klasę.',
          'Patikrinkite, ar rodoma „subalansuota“. Jei ne – ieškokite klaidingų rankinių įrašų.',
          'Atidarykite „Pelno ataskaita ir Balansas“, pasirinkite metus arba visą laikotarpį ir skirtuką.',
          'Spausdinkite arba išsaugokite PDF per naršyklės spausdinimą.',
        ],
        rules: [
          'Ataskaitos skaičiuojamos tik iš didžiosios knygos; dokumentai be įrašų į jas nepatenka.',
          'Grupavimas pagal sąskaitų kodų pradžią yra supaprastintas ir neatitinka visų VAS formos reikalavimų.',
          'Pelno mokestis, atidėjiniai ir metų uždarymas neskaičiuojami automatiškai.',
          'Metinių finansinių ataskaitų rinkinys Registrų centrui iš programos neteikiamas.',
        ],
        mistakes: [
          'Ataskaita laikoma oficialiu finansinių ataskaitų rinkiniu – ji yra vidinė ir skirta peržiūrai.',
          'Naujos sąskaitos kodas neatitinka klasių struktūros (pvz. sąnaudų sąskaita ne 6 klasėje) – ji bus sugrupuota neteisingai.',
        ],
      },
      ru: {
        title: 'Оборотная ведомость, отчёт о прибыли и баланс',
        summary: 'Отчёты, строящиеся по проводкам главной книги.',
        purpose: [
          'Оборотная ведомость показывает по каждому счёту начальное сальдо, дебетовые и кредитовые обороты и конечное сальдо за выбранный период и проверяет равенство дебета и кредита.',
          'Отчёт о прибыли и баланс группируют счета по классам плана счетов (5 — доходы, 6 — расходы, 1–4 — активы, капитал и обязательства) и показывают, сбалансирован ли баланс.',
        ],
        steps: [
          'Откройте «Оборотная ведомость», выберите период и при необходимости класс счетов.',
          'Проверьте, что показано «сбалансировано». Если нет — ищите ошибочные ручные проводки.',
          'Откройте «Отчёт о прибыли и баланс», выберите год или весь период и вкладку.',
          'Распечатайте или сохраните PDF через печать браузера.',
        ],
        rules: [
          'Отчёты считаются только по главной книге; документы без проводок в них не попадают.',
          'Группировка по началу кода счёта упрощённая и не соответствует всем требованиям форм VAS.',
          'Налог на прибыль, резервы и закрытие года автоматически не рассчитываются.',
          'Комплект годовой финансовой отчётности в Registrų centras из программы не подаётся.',
        ],
        mistakes: [
          'Отчёт принимают за официальный комплект финансовой отчётности — он внутренний и предназначен для проверки.',
          'Код нового счёта не соответствует структуре классов (например, счёт расходов не в 6 классе) — он будет сгруппирован неверно.',
        ],
      },
      en: {
        title: 'Trial balance, income statement and balance sheet',
        summary: 'Reports built from the general ledger entries.',
        purpose: [
          'The trial balance shows, for each account, the opening balance, debit and credit turnover and closing balance for the chosen period and checks that debit equals credit.',
          'The income statement and balance sheet group accounts by chart classes (5 income, 6 expenses, 1–4 assets, equity and liabilities) and show whether the balance sheet balances.',
        ],
        steps: [
          'Open "Trial balance", choose the period and, if needed, an account class.',
          'Check that it says "balanced". If not, look for wrong manual entries.',
          'Open "Income statement & balance sheet", choose a year or the whole period and the tab.',
          'Print or save as PDF with the browser\'s print function.',
        ],
        rules: [
          'Reports are computed only from the general ledger; documents without entries are not included.',
          'Grouping by account code prefix is simplified and does not meet every requirement of the VAS formats.',
          'Corporate income tax, provisions and year-end closing are not calculated automatically.',
          'The annual financial statements set is not submitted to the Register Centre from the application.',
        ],
        mistakes: [
          'Treating the report as the official financial statements: it is internal and meant for review.',
          'A new account code that does not follow the class structure (for example an expense account outside class 6) is grouped wrongly.',
        ],
      },
    },
  },
  {
    slug: 'chart-of-accounts',
    group: 'accounting',
    appHref: '/accounts',
    sources: ['lt-business-accounting-standards', 'lt-financial-accounting-law'],
    text: {
      lt: {
        title: 'Sąskaitų planas',
        summary: 'Sąskaitų kodai ir pavadinimai, naudojami įrašuose.',
        purpose: ['Sąskaitų planas – kodų ir pavadinimų sąrašas. Jis naudojamas didžiojoje knygoje, ataskaitose ir pirkimo debeto sąskaitos pasirinkimui.'],
        steps: [
          'Atidarykite „Sąskaitų planas“.',
          'Pridėkite sąskaitą: unikalų kodą ir pavadinimą.',
          'Pervadinkite ar ištrinkite tik tas sąskaitas, kurios nenaudojamos įrašuose.',
        ],
        rules: [
          'Kodas ir pavadinimas privalomi, kodas turi būti unikalus.',
          'Sąskaitų planas bendras visoms įmonėms šioje programos instaliacijoje.',
          'Programa nebando atkurti įrašų, jei sąskaita ištrinama ar pakeičiamas jos kodas – ištrynus naudojamą sąskaitą, įrašai lieka su senu kodu be pavadinimo.',
          'Numatytosios sąskaitos 2410, 4430, 2444, 4492, 5001, 6118, 2710, 6304, 4480, 4481, 4482 turi likti plane.',
        ],
        mistakes: [
          'Ištrinama ar perkoduojama programos naudojama sąskaita.',
          'Kuriama sąskaita su kodu ne savoje klasėje – ataskaitose ji bus sugrupuota netinkamai.',
        ],
      },
      ru: {
        title: 'План счетов',
        summary: 'Коды и названия счетов, используемые в проводках.',
        purpose: ['План счетов — список кодов и названий. Он используется в главной книге, отчётах и при выборе дебетового счёта покупки.'],
        steps: [
          'Откройте «План счетов».',
          'Добавьте счёт: уникальный код и название.',
          'Переименовывайте или удаляйте только счета, которые не используются в проводках.',
        ],
        rules: [
          'Код и название обязательны, код должен быть уникальным.',
          'План счетов общий для всех компаний в этой установке программы.',
          'Программа не перестраивает проводки при удалении счёта или изменении его кода — после удаления используемого счёта проводки остаются со старым кодом без названия.',
          'Счета по умолчанию 2410, 4430, 2444, 4492, 5001, 6118, 2710, 6304, 4480, 4481, 4482 должны оставаться в плане.',
        ],
        mistakes: [
          'Удаление или перекодирование счёта, который использует программа.',
          'Создание счёта с кодом не в своём классе — в отчётах он будет сгруппирован неверно.',
        ],
      },
      en: {
        title: 'Chart of accounts',
        summary: 'Account codes and names used in entries.',
        purpose: ['The chart of accounts is a list of codes and names. It is used in the general ledger, in reports and to choose a purchase debit account.'],
        steps: [
          'Open "Chart of accounts".',
          'Add an account: a unique code and a name.',
          'Rename or delete only accounts not used in entries.',
        ],
        rules: [
          'Code and name are required; the code must be unique.',
          'The chart of accounts is shared by all companies in this installation.',
          'The application does not rebuild entries when an account is deleted or recoded: entries of a deleted account keep the old code without a name.',
          'The default accounts 2410, 4430, 2444, 4492, 5001, 6118, 2710, 6304, 4480, 4481, 4482 must stay in the chart.',
        ],
        mistakes: [
          'Deleting or recoding an account the application uses.',
          'Creating an account with a code outside its class: reports will group it wrongly.',
        ],
      },
    },
  },
  {
    slug: 'reconciliation',
    group: 'accounting',
    appHref: '/reconciliation',
    sources: ['lt-financial-accounting-law'],
    text: {
      lt: {
        title: 'Tarpusavio skolų suderinimo aktai',
        summary: 'Atsiskaitymų su kontragentu suderinimo aktas tam tikrai datai.',
        purpose: ['Suderinimo aktas surenka su kontragentu susijusius pardavimus, pirkimus ir banko operacijas iki pasirinktos datos ir parodo likutį, kurį galima pateikti kontragentui patvirtinti.'],
        steps: [
          'Atidarykite „Suderinimo aktai“.',
          'Pasirinkite kontragentą ir datą.',
          'Peržiūrėkite dokumentų sąrašą ir likutį, atspausdinkite arba išsaugokite PDF per naršyklę ir išsiųskite kontragentui patys.',
        ],
        rules: [
          'Įtraukiami aktyvios įmonės dokumentai iki datos imtinai, susieti su kontragentu pagal ID, kodą arba pavadinimą.',
          'Aktas nesiunčiamas automatiškai ir neįrašomas kaip dokumentas.',
        ],
        mistakes: ['Kontragentas užregistruotas keliais skirtingais pavadinimais ar kodais – dalis dokumentų į aktą gali nepatekti.'],
      },
      ru: {
        title: 'Акты сверки взаиморасчётов',
        summary: 'Акт сверки расчётов с контрагентом на дату.',
        purpose: ['Акт сверки собирает продажи, покупки и банковские операции по контрагенту до выбранной даты и показывает сальдо, которое можно отправить контрагенту на подтверждение.'],
        steps: [
          'Откройте «Акты сверки».',
          'Выберите контрагента и дату.',
          'Проверьте список документов и сальдо, распечатайте или сохраните PDF через браузер и отправьте контрагенту сами.',
        ],
        rules: [
          'Включаются документы активной компании до даты включительно, связанные с контрагентом по ID, коду или названию.',
          'Акт не отправляется автоматически и не сохраняется как документ.',
        ],
        mistakes: ['Контрагент заведён под разными названиями или кодами — часть документов может не попасть в акт.'],
      },
      en: {
        title: 'Reconciliation statements',
        summary: 'A statement of account with a counterparty as of a date.',
        purpose: ['A reconciliation statement collects the sales, purchases and bank transactions with a counterparty up to a chosen date and shows the balance to send to the counterparty for confirmation.'],
        steps: [
          'Open "Reconciliation statements".',
          'Choose the counterparty and the date.',
          'Review the documents and the balance, print or save as PDF from the browser and send it to the counterparty yourself.',
        ],
        rules: [
          'Documents of the active company up to and including the date are included, matched to the counterparty by id, code or name.',
          'The statement is not sent automatically and is not stored as a document.',
        ],
        mistakes: ['A counterparty registered under several names or codes: some documents may be missing from the statement.'],
      },
    },
  },
  {
    slug: 'payroll',
    group: 'accounting',
    appHref: '/payrolls',
    sources: ['lt-pit-law', 'sodra', 'vmi-eds'],
    text: {
      lt: {
        title: 'Darbo užmokestis',
        summary: 'Mėnesio darbo užmokesčio žiniaraščiai ir jų įrašai didžiojoje knygoje.',
        purpose: ['Modulis saugo mėnesio žiniaraštį: darbuotojus, priskaičiuotą (bruto) ir išmokamą (neto) atlyginimą, GPM, darbuotojo ir darbdavio Sodros įmokas, ir sukuria įrašus didžiojoje knygoje.'],
        steps: [
          'Atidarykite „Darbo užmokestis“ ir sukurkite žiniaraštį metams ir mėnesiui (1–12).',
          'Pridėkite darbuotojus ir įveskite bruto sumą. Forma pasiūlo apytikslį skaičiavimą: GPM 20 %, darbuotojo Sodra 19,5 %, darbdavio Sodra 1,77 %.',
          'Patikrinkite ir, jei reikia, pataisykite GPM, Sodros ir neto sumas pagal faktinį skaičiavimą (NPD, tarifų pokyčiai, lubos ir kt.).',
          'Išsaugokite.',
        ],
        rules: [
          'Metai ir mėnuo privalomi; žiniaraščio data – paskutinė mėnesio diena.',
          'Įrašai: D 6304 su kreditu 4480, 4481 ir 4482, įskaitant darbdavio įmokas.',
          'Forma pateikiami procentai yra supaprastintas pasiūlymas: neapskaičiuojamas NPD, progresiniai GPM tarifai, Sodros lubos ir kiti individualūs atvejai. Galutinės sumos yra jūsų įvestos.',
          'Programa neteikia GPM313, GPM312, SAM ar kitų pranešimų VMI ar Sodrai.',
          'Uždarytame laikotarpyje žiniaraščių keisti negalima.',
        ],
        mistakes: [
          'Pasiūlytos sumos naudojamos be patikrinimo – jos gali skirtis nuo teisingų.',
          'Mažosios bendrijos nario ar vadovo išmokos registruojamos kaip darbo užmokestis – jų apmokestinimas kitoks.',
        ],
      },
      ru: {
        title: 'Заработная плата',
        summary: 'Месячные ведомости зарплаты и их проводки в главной книге.',
        purpose: ['Модуль хранит месячную ведомость: работников, начисленную (брутто) и выплачиваемую (нетто) зарплату, GPM, взносы Sodra работника и работодателя, и создаёт проводки в главной книге.'],
        steps: [
          'Откройте «Заработная плата» и создайте ведомость за год и месяц (1–12).',
          'Добавьте работников и введите сумму брутто. Форма предлагает приблизительный расчёт: GPM 20 %, Sodra работника 19,5 %, Sodra работодателя 1,77 %.',
          'Проверьте и при необходимости исправьте GPM, Sodra и нетто по фактическому расчёту (NPD, изменения ставок, потолки и т. д.).',
          'Сохраните.',
        ],
        rules: [
          'Год и месяц обязательны; дата ведомости — последний день месяца.',
          'Проводки: Д 6304 с кредитом 4480, 4481 и 4482, включая взносы работодателя.',
          'Проценты в форме — упрощённое предложение: не учитываются NPD, прогрессивные ставки GPM, потолки Sodra и другие индивидуальные случаи. Итоговые суммы — те, что ввели вы.',
          'Программа не подаёт GPM313, GPM312, SAM и другие уведомления в VMI или Sodra.',
          'В закрытом периоде ведомости изменять нельзя.',
        ],
        mistakes: [
          'Использование предложенных сумм без проверки — они могут отличаться от правильных.',
          'Выплаты члену малого товарищества (MB) или руководителю оформляются как зарплата — их налогообложение иное.',
        ],
      },
      en: {
        title: 'Payroll',
        summary: 'Monthly payroll sheets and their general ledger entries.',
        purpose: ['The module stores a monthly sheet: employees, gross and net pay, personal income tax (GPM) and employee and employer Sodra contributions, and posts entries to the general ledger.'],
        steps: [
          'Open "Payroll" and create a sheet for a year and month (1–12).',
          'Add employees and enter the gross amount. The form suggests an approximate calculation: GPM 20 %, employee Sodra 19.5 %, employer Sodra 1.77 %.',
          'Check and, if needed, correct GPM, Sodra and net amounts according to the actual calculation (tax-exempt amount NPD, rate changes, caps, etc.).',
          'Save.',
        ],
        rules: [
          'Year and month are required; the payroll date is the last day of the month.',
          'Entries: D 6304 against C 4480, 4481 and 4482, including employer contributions.',
          'The percentages in the form are a simplified suggestion: NPD, progressive GPM rates, Sodra caps and other individual cases are not calculated. The final amounts are the ones you enter.',
          'The application does not submit GPM313, GPM312, SAM or other notifications to VMI or Sodra.',
          'Payroll sheets in a locked period cannot be changed.',
        ],
        mistakes: [
          'Using the suggested amounts without checking: they can differ from the correct ones.',
          'Recording payments to a small partnership (MB) member or manager as salary: their taxation is different.',
        ],
      },
    },
  },
];
