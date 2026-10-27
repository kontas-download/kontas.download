import type { HelpPage } from './types';

export const rulesPages: HelpPage[] = [
  {
    slug: 'rules-registry',
    group: 'system',
    appHref: '/rules',
    sources: ['lt-vat-law', 'vmi-isaf-rules', 'lt-pit-law', 'sodra'],
    text: {
      lt: {
        title: 'Mokesčių taisyklių registras',
        summary: 'Kur programa laiko nuo teisės aktų priklausančias reikšmes ir kaip sužinoti, ar jos patikrintos.',
        purpose: [
          'Tarifai, terminai ir kodai, kurie priklauso nuo įstatymų (PVM tarifai, PVM deklaracijos ir kitų deklaracijų terminai, darbo užmokesčio skaičiavimo tarifai, i.SAF kodų katalogas), laikomi viename taisyklių registre, o ne išbarstyti skaičiavimo kode.',
          'Kiekviena reikšmė turi galiojimo datas, teisinį pagrindą, būseną, patikros datą ir datą, iki kurios ją reikia patikrinti iš naujo. Skaičiavimai (i.SAF, FR0600 juodraštis, mokesčių kalendorius, darbo užmokesčio formos pasiūlymas) reikšmę ima tą dieną, kuriai skaičiuojama.',
        ],
        steps: [
          'Atidarykite „Mokesčių taisyklės“ (meniu „Sistema & Nustatymai“) arba nuorodą apžvalgos puslapyje.',
          'Patikrinkite datą „Mokesčių taisyklės aktualios iki ...“ ir ar nėra įspėjimų apie praėjusį patikros terminą.',
          'Laikinas (provisional) taisykles palyginkite su nurodytu pagrindu ir oficialiais VMI ar „Sodros“ šaltiniais; apie neatitikimą praneškite programos prižiūrėtojui.',
        ],
        rules: [
          'Būsena „Patikrinta“ reiškia, kad reikšmė sutikrinta su nurodytu oficialiu šaltiniu; „Laikina“ – kad ją dar turi patikrinti buhalteris. Laikinų taisyklių rezultatų nenaudokite deklaracijoms, kol jos nepatikrintos.',
          'Pasikeitus teisės aktui, pridedamas naujas įrašas su nauja galiojimo pradžia, o senas uždaromas: seni dokumentai lieka skaičiuojami pagal tuo metu galiojusias taisykles.',
          'Registras peržiūrimas kasmet gruodį (naujų metų parametrai), kas ketvirtį ir nedelsiant sužinojus apie pakeitimą. Kiekvienas pakeitimas įrašomas į pakeitimų žurnalą kartu su pagrindu ir tikrintoju.',
          'Įspėjimas rodomas, kai praėjo kurios nors galiojančios taisyklės patikros data arba kai naujausia patikra senesnė nei 400 dienų. Puslapyje taisyklių redaguoti negalima: jos keičiamos kartu su programos versija.',
        ],
        mistakes: [
          'Nemanykite, kad programa pati seka įstatymų pakeitimus: ji taiko tik registre įrašytas reikšmes. Už jų atitiktį galiojantiems teisės aktams atsako įmonė ir jos buhalteris.',
          'Darbo užmokesčio formos tarifai yra tik pasiūlymas: progresinių GPM tarifų, NPD ir įmokų lubų programa neskaičiuoja, todėl sumas patikrinkite prieš išsaugodami.',
        ],
      },
      ru: {
        title: 'Реестр налоговых правил',
        summary: 'Где программа хранит значения, зависящие от правовых актов, и как узнать, проверены ли они.',
        purpose: [
          'Ставки, сроки и коды, зависящие от законов (ставки НДС, сроки декларации НДС и других деклараций, ставки расчёта зарплаты, каталог кодов i.SAF), хранятся в одном реестре правил, а не разбросаны по коду расчётов.',
          'У каждого значения есть даты действия, правовое основание, статус, дата проверки и дата, до которой его нужно проверить заново. Расчёты (i.SAF, черновик FR0600, налоговый календарь, предложение в форме зарплаты) берут значение на ту дату, для которой выполняется расчёт.',
        ],
        steps: [
          'Откройте «Налоговые правила» (меню «Система и настройки») или ссылку на странице обзора.',
          'Проверьте дату «Налоговые правила актуальны на ...» и нет ли предупреждений об истёкшем сроке проверки.',
          'Временные (provisional) правила сверьте с указанным основанием и официальными источниками VMI или Sodra; о расхождении сообщите тому, кто сопровождает программу.',
        ],
        rules: [
          'Статус «Проверено» означает, что значение сверено с указанным официальным источником; «Временное» — что его ещё должен проверить бухгалтер. Не используйте результаты временных правил в декларациях, пока они не проверены.',
          'При изменении правового акта добавляется новая запись с новой датой начала действия, а старая закрывается: старые документы по-прежнему считаются по правилам, действовавшим в то время.',
          'Реестр пересматривается ежегодно в декабре (параметры нового года), ежеквартально и сразу, как только становится известно об изменении. Каждое изменение записывается в журнал изменений вместе с основанием и проверяющим.',
          'Предупреждение показывается, если истёк срок проверки какого-либо действующего правила или если последняя проверка старше 400 дней. На странице правила изменить нельзя: они меняются вместе с версией программы.',
        ],
        mistakes: [
          'Не считайте, что программа сама следит за изменениями законов: она применяет только значения из реестра. За их соответствие действующим правовым актам отвечают компания и её бухгалтер.',
          'Ставки в форме зарплаты — только предложение: прогрессивные ставки GPM, NPD и потолки взносов программа не рассчитывает, поэтому проверьте суммы перед сохранением.',
        ],
      },
      en: {
        title: 'Tax rules registry',
        summary: 'Where the program keeps the values that depend on legislation and how to see whether they have been checked.',
        purpose: [
          'Rates, deadlines and codes that depend on the law (VAT rates, deadlines of the VAT return and other returns, payroll estimate rates, the i.SAF code catalogue) are kept in one rules registry instead of being scattered through the calculation code.',
          'Every value has validity dates, a legal basis, a status, a check date and a date by which it must be checked again. The calculations (i.SAF, the FR0600 draft, the tax calendar, the payroll form suggestion) take the value valid on the date they calculate for.',
        ],
        steps: [
          'Open Tax rules (menu System & Settings) or the link on the overview page.',
          'Check the date "Tax rules up to date as of ..." and whether there are warnings about a passed review date.',
          'Compare provisional rules with the stated basis and the official VMI or Sodra sources; report any difference to whoever maintains the program.',
        ],
        rules: [
          'Status "Verified" means the value was checked against the stated official source; "Provisional" means the accountant still has to check it. Do not use the results of provisional rules in returns until they are checked.',
          'When a law changes, a new entry with a new start date is added and the old one is closed: old documents are still calculated with the rules valid at their time.',
          'The registry is reviewed every December (parameters of the new year), every quarter and immediately when a change becomes known. Every change is recorded in the change log with its basis and who checked it.',
          'A warning is shown when the review date of any rule in force has passed or when the newest check is older than 400 days. Rules cannot be edited on the page: they change together with the program version.',
        ],
        mistakes: [
          'Do not assume the program follows changes of the law by itself: it only applies the values in the registry. The company and its accountant are responsible for their compliance with the laws in force.',
          'The payroll form rates are only a suggestion: the program does not calculate progressive income tax rates, the tax-exempt amount or contribution ceilings, so check the amounts before saving.',
        ],
      },
    },
  },
];
