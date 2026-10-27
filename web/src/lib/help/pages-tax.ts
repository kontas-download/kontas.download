import type { HelpPage } from './types';

export const taxPages: HelpPage[] = [
  {
    slug: 'isaf',
    group: 'tax',
    appHref: '/tax-reports',
    sources: ['vmi-isaf-rules', 'lt-vat-law', 'lt-tax-administration-law', 'vmi-eds'],
    text: {
      lt: {
        title: 'i.SAF 1.2 XML eksportas',
        summary: 'Išrašytų ir gautų PVM sąskaitų faktūrų registro failo paruošimas rankiniam pateikimui VMI.',
        purpose: [
          'Programa sudaro i.SAF 1.2 formato XML failą su pasirinkto laikotarpio išrašytomis ir gautomis sąskaitomis.',
          'SVARBU: programa nieko nepateikia VMI automatiškai. Failą atsisiunčiate ir patys įkeliate per VMI sistemas (i.SAF / Elektroninio deklaravimo sistema). Pateikimą ir jo rezultatą tikrinate VMI sistemoje.',
        ],
        steps: [
          'Atidarykite „Mokesčiai & i.SAF XML“, pasirinkite metus ir mėnesį.',
          'Peržiūrėkite pardavimų ir pirkimų sąrašus.',
          'Spauskite i.SAF eksportą. Jei rodomas problemų sąrašas, failas nesudaromas – sutvarkykite nurodytus dokumentus arba deklaruokite tuos atvejus rankiniu būdu.',
          'Atsisiųskite XML failą ir patys įkelkite jį VMI sistemoje; ten patikrinkite, ar failas priimtas be klaidų.',
        ],
        rules: [
          'Failas sudaromas tik STANDARD_VAT įmonei visam laikotarpiui; įmonė turi turėti skaitinį juridinio asmens kodą ir PVM kodą; laikotarpis ne ankstesnis nei 2016-10-01.',
          'Automatiškai klasifikuojami tik vidaus (LT) dokumentai su 21 % (PVM1), 9 % (PVM2), 5 % (PVM3) ir 12 % (PVM58, nuo 2026-01-01) tarifais. Kitoms eilutėms buhalteris priskiria i.SAF kodą skydelyje „i.SAF kodai eilutėms“ (FR0600 skirtukas); sąskaita ir jos PDF nekeičiami, pakeitimai įrašomi į įmonės istoriją; uždarytame laikotarpyje kodų keisti negalima. Redaguojant dokumentą kodai perkeliami į tokias pačias eilutes; netinkantys kodai parodomi, o dokumentas neįtraukiamas, kol kodų nepriskirsite iš naujo ar nepatvirtinsite. Kreditinės sąskaitos perima originalo kodus. Eilutė be kodo (be PVM, užsienio PVM kodas, kita šalis, nežinomas tarifas) pateikiama kaip problema, ir failas nesudaromas – kad nebūtų išsiųstas klaidingas mokesčio kodas.',
          'Eksportuojami kodai: PVM1, PVM2, PVM3, PVM58, PVM5, PVM12, PVM13, PVM14, PVM15, PVM34, PVM16–18, PVM20, PVM21, PVM25–27, PVM43–45, PVM60. Neeksportuojami (problema, deklaruokite rankiniu būdu): PVM6–8, PVM59, PVM9, PVM19, PVM25 (pardavimas), PVM32, PVM33, PVM52, PVM53 – VMI dokumentuose jiems trūksta vienareikšmių i.SAF reikalavimų. Importas pažymimas „Neįtraukiama į i.SAF“ (PVM48 neeksportuojamas). Kai PVM apskaičiuoja pirkėjas (PVM16–18, 20, 21, 25–27, 43–45, 60), suma = vertė be PVM × kodo tarifas, apvalinama kaip sąskaitos eilutė; užsienio kontrahentui be ES PVM kodo šalies lauke įrašykite ISO kodą (pvz., US).',
          'Atmetami dokumentai be numerio, su pasikartojančiu numeriu, netinkama data, be eilučių ar kurių antraštės sumos nesutampa su eilučių suma.',
          'Pardavimų KS eksportuojama kaip tipas „KS“ su neigiamomis sumomis ir nuoroda į originalo numerį ir datą; tiekėjų KS – taip pat su nuoroda į originalą.',
          'Apmokestintas pirkimas iš tiekėjo be PVM kodo atmetamas.',
        ],
        mistakes: [
          'Manyti, kad atsisiuntus failą jis jau pateiktas VMI.',
          'Pateikti failą nepatikrinus problemų sąrašo ar rankiniu būdu deklaruotinų atvejų.',
          'Eksportuoti ne tos įmonės ar ne to laikotarpio failą.',
        ],
        notes: [{ title: 'Pateikimas VMI', items: ['Programa neturi ryšio su VMI EDS ar i.MAS. Visi failai pateikiami rankiniu būdu; už pateikimą ir jo terminus atsako naudotojas.'] }],
      },
      ru: {
        title: 'Экспорт i.SAF 1.2 XML',
        summary: 'Подготовка файла регистра выписанных и полученных PVM-счетов для ручной подачи в VMI.',
        purpose: [
          'Программа формирует XML-файл формата i.SAF 1.2 с выписанными и полученными счетами за выбранный период.',
          'ВАЖНО: программа ничего не подаёт в VMI автоматически. Вы скачиваете файл и сами загружаете его в системах VMI (i.SAF / система электронного декларирования). Подачу и её результат проверяете в системе VMI.',
        ],
        steps: [
          'Откройте «Налоги и i.SAF XML», выберите год и месяц.',
          'Просмотрите списки продаж и покупок.',
          'Нажмите экспорт i.SAF. Если показан список проблем, файл не формируется — исправьте указанные документы или задекларируйте эти случаи вручную.',
          'Скачайте XML-файл и сами загрузите его в системе VMI; там проверьте, что файл принят без ошибок.',
        ],
        rules: [
          'Файл формируется только для компании STANDARD_VAT за весь период; у компании должны быть числовой код юрлица и PVM-код; период не раньше 2016-10-01.',
          'Автоматически классифицируются только внутренние (LT) документы со ставками 21 % (PVM1), 9 % (PVM2), 5 % (PVM3) и 12 % (PVM58, с 2026-01-01). Остальным строкам бухгалтер назначает код i.SAF в панели «Коды i.SAF для строк» (вкладка FR0600); счёт и его PDF не меняются, изменения записываются в историю компании; в закрытом периоде коды менять нельзя. При правке документа коды переносятся на такие же строки; неподошедшие коды показываются, а документ не включается, пока коды не назначены заново или не подтверждены. Кредитовые документы перенимают коды оригинала. Строка без кода (без PVM, иностранный PVM-код, другая страна, неизвестная ставка) выводится как проблема, и файл не формируется — чтобы не был отправлен неверный налоговый код.',
          'Выгружаемые коды: PVM1, PVM2, PVM3, PVM58, PVM5, PVM12, PVM13, PVM14, PVM15, PVM34, PVM16–18, PVM20, PVM21, PVM25–27, PVM43–45, PVM60. Не выгружаются (проблема, декларируйте вручную): PVM6–8, PVM59, PVM9, PVM19, PVM25 (pardavimas), PVM32, PVM33, PVM52, PVM53 — в документах VMI для них нет однозначных требований i.SAF. Импорт помечается «Не включается в i.SAF» (PVM48 не выгружается). Когда НДС исчисляет покупатель (PVM16–18, 20, 21, 25–27, 43–45, 60), сумма = стоимость без НДС × ставка кода с округлением как у строки счёта; у иностранного контрагента без PVM-кода ЕС укажите в поле страны ISO-код (например, US).',
          'Отклоняются документы без номера, с повторяющимся номером, неверной датой, без строк или с расхождением итогов и суммы строк.',
          'KS продаж экспортируется с типом «KS», отрицательными суммами и ссылкой на номер и дату исходного счёта; KS поставщиков — тоже со ссылкой на исходный документ.',
          'Облагаемая покупка у поставщика без PVM-кода отклоняется.',
        ],
        mistakes: [
          'Считать, что скачанный файл уже подан в VMI.',
          'Подать файл, не проверив список проблем и случаи для ручного декларирования.',
          'Экспортировать файл не той компании или не за тот период.',
        ],
        notes: [{ title: 'Подача в VMI', items: ['У программы нет подключения к VMI EDS или i.MAS. Все файлы подаются вручную; за подачу и сроки отвечает пользователь.'] }],
      },
      en: {
        title: 'i.SAF 1.2 XML export',
        summary: 'Preparing the register file of issued and received VAT invoices for manual submission to VMI.',
        purpose: [
          'The application builds an i.SAF 1.2 XML file with the issued and received invoices of the chosen period.',
          'IMPORTANT: nothing is submitted to VMI automatically. You download the file and upload it yourself in the VMI systems (i.SAF / Electronic Declaration System). You check the submission and its result in the VMI system.',
        ],
        steps: [
          'Open "Taxes & i.SAF XML" and choose year and month.',
          'Review the sales and purchase lists.',
          'Click the i.SAF export. If a list of issues appears, no file is produced: fix the listed documents or declare those cases manually.',
          'Download the XML file and upload it yourself in the VMI system; check there that it was accepted without errors.',
        ],
        rules: [
          'A file is produced only for a STANDARD_VAT company for the whole period; the company needs a numeric company code and a VAT code; the period cannot start before 2016-10-01.',
          'Only domestic (LT) documents at 21 % (PVM1), 9 % (PVM2), 5 % (PVM3) and 12 % (PVM58, from 2026-01-01) are classified automatically. For other lines the accountant assigns an i.SAF code in the panel "i.SAF codes of lines" (FR0600 tab); the invoice and its PDF are not changed and changes are recorded in the company history; codes cannot be changed in a closed period. When a document is edited, codes move to identical lines; codes that no longer fit are shown and the document is left out until codes are assigned again or confirmed. Credit notes take over the codes of the original. A line without a code (no VAT, foreign VAT code, other country, unknown rate) is reported as an issue and no file is produced, so that a wrong tax code is never sent.',
          'Exported codes: PVM1, PVM2, PVM3, PVM58, PVM5, PVM12, PVM13, PVM14, PVM15, PVM34, PVM16–18, PVM20, PVM21, PVM25–27, PVM43–45, PVM60. Not exported (issue, declare manually): PVM6–8, PVM59, PVM9, PVM19, PVM25 (pardavimas), PVM32, PVM33, PVM52, PVM53 — the VMI documents do not define their i.SAF requirements unambiguously. Imports are marked "Not included in i.SAF" (PVM48 is never exported). When the buyer accounts for VAT (PVM16–18, 20, 21, 25–27, 43–45, 60), the amount = net × the code rate, rounded like an invoice line; for a foreign party without an EU VAT code enter the ISO code (e.g. US) in the country field.',
          'Documents without a number, with a repeated number, an invalid date, no lines, or header totals that differ from the sum of lines are refused.',
          'Sales credit notes are exported as type "KS" with negative amounts and a reference to the original number and date; supplier credit notes likewise reference the original.',
          'A taxed purchase from a supplier without a VAT code is refused.',
        ],
        mistakes: [
          'Assuming a downloaded file has been submitted to VMI.',
          'Submitting without reviewing the issues and the cases to declare manually.',
          'Exporting the wrong company or period.',
        ],
        notes: [{ title: 'Submission to VMI', items: ['The application has no connection to VMI EDS or i.MAS. Every file is submitted manually; the user is responsible for the submission and its deadlines.'] }],
      },
    },
  },
  {
    slug: 'fr0600',
    group: 'tax',
    appHref: '/tax-reports',
    sources: ['vmi-vat-return-rules', 'vmi-eds-forms', 'vmi-eds', 'lt-vat-law'],
    text: {
      lt: {
        title: 'FR0600 PVM deklaracijos juodraštis',
        summary: 'Sumos, kurias galima patikimai apskaičiuoti iš vidaus dokumentų, ir sąrašas to, ką reikia užpildyti rankiniu būdu.',
        purpose: [
          'FR0600 skydelis apskaičiuoja PVM deklaracijos laukų juodraštį: 11 (apmokestinamų sandorių vertė), 25 (pirkimų PVM), 29 / 30 / 31 ir 12 % tarifo laukas (pardavimų PVM pagal tarifus), 35 (atskaitomas PVM) ir 36 (mokėtinas / grąžintinas).',
          'SVARBU: juodraštis nepateikiamas VMI. Deklaraciją pildote ir pateikiate patys VMI Elektroninio deklaravimo sistemoje (EDS).',
        ],
        steps: [
          'Atidarykite „Mokesčiai & i.SAF XML“, FR0600 skirtuką, pasirinkite laikotarpį.',
          'Peržiūrėkite apskaičiuotus laukus.',
          'Peržiūrėkite sąrašus „rankiniam tvarkymui“ ir „nepatikrinta atskaita“ – juose esantys dokumentai į laukus neįtraukti.',
          'Prisijunkite prie EDS, užpildykite FR0600 formą (laukus perkelkite ir papildykite rankiniu būdu) ir pateikite.',
        ],
        rules: [
          'Automatiškai įtraukiami vidaus dokumentai su 21 %, 9 %, 5 % ir (nuo 2026-01-01) 12 % tarifais; kitos eilutės – tik su priskirtu i.SAF kodu, pagal VMI lentelę „FR0600 + i.SAF kodas“.',
          'Laukai 12–24 ir 32–34 skaičiuojami tik pagal priskirtus kodus; pirkėjo apskaičiuotas PVM rodomas kaip apskaičiuotas, jo atskaita (35) nepatikrinta. 36 laukas = 29–31 minus 35, o kai užpildyti 32–34 laukai, jis neskaičiuojamas (apskaičiuos EDS). 26–28 laukus ir maržą (16) užpildykite EDS. Dokumentas, kurio kodas netinka kontrahentui (pvz., PVM13 lietuviui), rodomas rankiniam tvarkymui. FR0564 sumos (13, 14, 18) rodomos tik kaip informacija.',
          'Dokumentai be eilučių arba kurių antraštės sumos nesutampa su eilutėmis rodomi rankiniam tvarkymui.',
          'Pirkimai su nepatikrinta atskaitos teise neįtraukiami į 35 lauką.',
          'Tiekėjų KS mažina 25 ir 35 laukus.',
          'Juodraštis „pilnas“ tik tada, kai nėra nei rankinių, nei nepatikrintų dokumentų.',
        ],
        mistakes: [
          'Juodraštis perkeliamas į EDS nepatikrinus rankinio tvarkymo sąrašo.',
          'Manoma, kad pardavimų PVM rodomas 25 lauke – pardavimų PVM yra 29–31 laukuose.',
        ],
        notes: [{ title: 'Pateikimas VMI', items: ['Programa nepateikia FR0600 VMI. Užpildykite ir pateikite deklaraciją EDS patys; už jos turinį atsako naudotojas ir buhalteris.'] }],
      },
      ru: {
        title: 'Черновик декларации PVM FR0600',
        summary: 'Суммы, которые можно надёжно вычислить из внутренних документов, и список того, что нужно заполнить вручную.',
        purpose: [
          'Панель FR0600 рассчитывает черновик полей декларации PVM: 11 (стоимость облагаемых операций), 25 (PVM покупок), 29 / 30 / 31 и поле ставки 12 % (PVM продаж по ставкам), 35 (вычитаемый PVM) и 36 (к уплате / возврату).',
          'ВАЖНО: черновик не подаётся в VMI. Декларацию вы заполняете и подаёте сами в системе электронного декларирования VMI (EDS).',
        ],
        steps: [
          'Откройте «Налоги и i.SAF XML», вкладку FR0600, выберите период.',
          'Проверьте рассчитанные поля.',
          'Просмотрите списки «для ручной обработки» и «непроверенный вычет» — эти документы в поля не включены.',
          'Войдите в EDS, заполните форму FR0600 (перенесите поля и дополните вручную) и подайте.',
        ],
        rules: [
          'Автоматически включаются внутренние документы со ставками 21 %, 9 %, 5 % и (с 2026-01-01) 12 %; остальные строки — только с назначенным кодом i.SAF, по таблице VMI «FR0600 + i.SAF kodas».',
          'Поля 12–24 и 32–34 считаются только по назначенным кодам; НДС, исчисленный покупателем, показан как расчётный, его вычет (35) не проверен. Поле 36 = 29–31 минус 35, а при заполненных полях 32–34 не рассчитывается (его рассчитает EDS). Поля 26–28 и маржу (16) заполните в EDS. Документ, код которого не подходит контрагенту (например, PVM13 литовцу), показывается для ручной обработки. Суммы FR0564 (13, 14, 18) показаны только для информации.',
          'Документы без строк или с расхождением итогов и строк показываются для ручной обработки.',
          'Покупки с непроверенным правом на вычет не включаются в поле 35.',
          'KS поставщиков уменьшают поля 25 и 35.',
          'Черновик «полный», только если нет ни ручных, ни непроверенных документов.',
        ],
        mistakes: [
          'Перенос черновика в EDS без проверки списка для ручной обработки.',
          'Ожидание, что PVM продаж стоит в поле 25 — PVM продаж находится в полях 29–31.',
        ],
        notes: [{ title: 'Подача в VMI', items: ['Программа не подаёт FR0600 в VMI. Заполните и подайте декларацию в EDS сами; за её содержание отвечают пользователь и бухгалтер.'] }],
      },
      en: {
        title: 'FR0600 VAT return draft',
        summary: 'The amounts that can be derived reliably from domestic documents, and a list of what must be completed by hand.',
        purpose: [
          'The FR0600 panel computes a draft of VAT return fields: 11 (value of taxable supplies), 25 (purchase VAT), 29 / 30 / 31 and the 12 % rate field (sales VAT by rate), 35 (deductible VAT) and 36 (payable / refundable).',
          'IMPORTANT: the draft is not submitted to VMI. You complete and submit the return yourself in the VMI Electronic Declaration System (EDS).',
        ],
        steps: [
          'Open "Taxes & i.SAF XML", the FR0600 tab, and choose the period.',
          'Review the computed fields.',
          'Review the "manual handling" and "deduction not reviewed" lists: those documents are not included in the fields.',
          'Sign in to EDS, fill in the FR0600 form (transfer the fields and complete the rest by hand) and submit it.',
        ],
        rules: [
          'Domestic documents at 21 %, 9 %, 5 % and (from 2026-01-01) 12 % are included automatically; other lines only with an assigned i.SAF code, following the VMI table "FR0600 + i.SAF kodas".',
          'Fields 12–24 and 32–34 are computed only from assigned codes; VAT calculated by the buyer is shown as computed and its deduction (35) is not reviewed. Field 36 = 29–31 minus 35; when fields 32–34 are filled it is not computed (EDS computes it). Complete fields 26–28 and the margin (16) in EDS. A document whose code does not fit the counterparty (e.g. PVM13 for a Lithuanian customer) is listed for manual handling. FR0564 amounts (13, 14, 18) are shown for information only.',
          'Documents without lines or whose header totals differ from their lines are listed for manual handling.',
          'Purchases whose right to deduct has not been reviewed are excluded from field 35.',
          'Supplier credit notes reduce fields 25 and 35.',
          'The draft is "complete" only when there are no manual or unreviewed documents.',
        ],
        mistakes: [
          'Copying the draft into EDS without reviewing the manual-handling list.',
          'Expecting sales VAT in field 25: sales VAT is in fields 29–31.',
        ],
        notes: [{ title: 'Submission to VMI', items: ['The application does not submit FR0600 to VMI. Complete and submit the return in EDS yourself; the user and the accountant are responsible for its content.'] }],
      },
    },
  },
  {
    slug: 'tax-calendar',
    group: 'tax',
    appHref: '/tax-calendar',
    sources: ['lt-tax-administration-law', 'vmi-vat-return-rules', 'lt-pit-law', 'lt-cit-law', 'vmi-eds'],
    text: {
      lt: {
        title: 'Mokesčių kalendorius',
        summary: 'Deklaracijų terminai pagal įmonės mokesčių profilį.',
        purpose: ['Kalendorius rodo deklaracijų terminus pagal įmonės profilį ir leidžia pažymėti laikotarpį kaip pateiktą. Jis nieko nepateikia ir nesiunčia.'],
        steps: [
          'Atidarykite „Mokesčių kalendorius“.',
          'Įjunkite jūsų įmonei taikomas deklaracijas ir FR0600 laikotarpį (mėnuo, ketvirtis, pusmetis).',
          'Pateikę deklaraciją VMI EDS, pažymėkite laikotarpį kaip pateiktą.',
        ],
        rules: [
          'FR0600 automatiškai rodoma STANDARD_VAT įmonėms; terminas – po laikotarpio einančio mėnesio 25 diena.',
          'FR0564 (25 d.), GPM313 (15 d. kitą mėnesį), GPM312 (vasario 15 d.) ir PLN204 (birželio 15 d.) išjungtos, kol jų neįjungiate, nes jų taikymas priklauso nuo faktų, kurių programa nežino.',
          'Datos nominalios. Termino perkėlimas, kai jis patenka į savaitgalį ar šventę, parodomas atskirai, tačiau ši taisyklė nepatikrinta pagal šaltinį – laikykitės ankstesnės datos.',
          'i.SAF registrų terminai neįtraukti, nes nepatikrinti.',
          'Pažymėjimas „pateikta“ yra tik žymė programoje.',
        ],
        mistakes: [
          'Laikyti kalendorių pilnu jūsų įmonės prievolių sąrašu.',
          'Pažymėti „pateikta“ prieš faktiškai pateikiant EDS.',
        ],
      },
      ru: {
        title: 'Налоговый календарь',
        summary: 'Сроки деклараций по налоговому профилю компании.',
        purpose: ['Календарь показывает сроки деклараций по профилю компании и позволяет отметить период как поданный. Он ничего не подаёт и не отправляет.'],
        steps: [
          'Откройте «Налоговый календарь».',
          'Включите декларации, которые применяются к вашей компании, и период FR0600 (месяц, квартал, полугодие).',
          'Подав декларацию в VMI EDS, отметьте период как поданный.',
        ],
        rules: [
          'FR0600 автоматически показывается компаниям STANDARD_VAT; срок — 25-е число месяца после окончания периода.',
          'FR0564 (25-е), GPM313 (15-е следующего месяца), GPM312 (15 февраля) и PLN204 (15 июня) выключены, пока вы их не включите, так как их применимость зависит от фактов, неизвестных программе.',
          'Даты номинальные. Перенос срока, попадающего на выходной или праздник, показывается отдельно, но это правило не проверено по источнику — ориентируйтесь на более раннюю дату.',
          'Сроки регистров i.SAF не включены, так как не проверены.',
          'Отметка «подано» — только пометка в программе.',
        ],
        mistakes: [
          'Считать календарь полным списком обязанностей вашей компании.',
          'Отмечать «подано» до фактической подачи в EDS.',
        ],
      },
      en: {
        title: 'Tax calendar',
        summary: 'Return due dates based on the company\'s tax profile.',
        purpose: ['The calendar lists return due dates from the company profile and lets you mark a period as filed. It never submits or sends anything.'],
        steps: [
          'Open "Tax calendar".',
          'Enable the returns that apply to your company and the FR0600 period (month, quarter, half-year).',
          'After submitting a return in VMI EDS, mark the period as filed.',
        ],
        rules: [
          'FR0600 appears automatically for STANDARD_VAT companies; due on the 25th of the month after the period.',
          'FR0564 (25th), GPM313 (15th of the next month), GPM312 (15 February) and PLN204 (15 June) are off until you enable them, because their applicability depends on facts the application does not know.',
          'Dates are nominal. The carry-over of a deadline falling on a weekend or holiday is shown separately, but that rule has not been verified against a source: use the earlier date.',
          'i.SAF register deadlines are not included because they have not been verified.',
          'Marking as filed is only a note in the application.',
        ],
        mistakes: [
          'Treating the calendar as the complete list of your company\'s obligations.',
          'Marking as filed before actually submitting in EDS.',
        ],
      },
    },
  },
];
