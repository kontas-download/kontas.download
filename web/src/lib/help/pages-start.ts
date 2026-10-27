import type { HelpPage } from './types';

export const startPages: HelpPage[] = [
  {
    slug: 'getting-started',
    group: 'start',
    appHref: '/',
    sources: ['lt-financial-accounting-law', 'lt-business-accounting-standards', 'eu-gdpr'],
    text: {
      lt: {
        title: 'Pradžia ir apžvalgos skydelis',
        summary: 'Kaip sutvarkyta programa, kas rodoma apžvalgoje ir kokia tvarka pradėti darbą.',
        purpose: [
          'kontas.download – savame serveryje veikianti Lietuvos įmonių apskaitos programa: pardavimų ir pirkimų dokumentai, bankas, skolos, didžioji knyga, ataskaitos ir mokesčių failų paruošimas.',
          'Apžvalgos skydelis (meniu „Apžvalga“) rodo aktyvios įmonės pardavimų ir pirkimų sumas su PVM, jų skirtumą, kontragentų ir banko operacijų skaičių bei paskutines 8 pardavimo sąskaitas. Tai orientacinė suvestinė, ne finansinė ataskaita.',
          'Visi duomenys priklauso aktyviai įmonei, pasirinktai šoniniame meniu. Kitos įmonės duomenys nerodomi ir nekeičiami.',
        ],
        steps: [
          'Prisijunkite savo el. paštu ir slaptažodžiu.',
          'Meniu „Įmonių valdymas“ patikrinkite įmonės rekvizitus (pavadinimas, kodas, PVM kodas, adresas, IBAN) ir PVM režimą su jo galiojimo data.',
          'Jei sąskaitas siųsite el. paštu, įmonės kortelėje nustatykite jos SMTP serverį.',
          'Patikrinkite sąskaitų planą (meniu „Sąskaitų planas“) – programa naudoja sąskaitas 2410, 4430, 2444, 4492, 5001, 6118, 2710 ir kitas.',
          'Įveskite arba importuokite kontragentus, tada pradėkite išrašyti sąskaitas, registruoti pirkimus ir importuoti banko išrašus.',
          'Mėnesio pabaigoje peržiūrėkite skolas, apyvartos žiniaraštį, paruoškite i.SAF / FR0600 failus ir, jei reikia, uždarykite laikotarpį.',
        ],
        rules: [
          'Kiekvienas pardavimas, pirkimas, banko operacija ir darbo užmokesčio žiniaraštis automatiškai sukuria įrašus didžiojoje knygoje toje pačioje duomenų bazės transakcijoje.',
          'Pinigų sumos skaičiuojamos fiksuoto tikslumo aritmetika: eilutės suma be PVM ir PVM apvalinami iki centų (pusė – nuo nulio), dokumento suma – suapvalintų eilučių suma.',
          '„Šiandien“ terminams, mokesčių kalendoriui ir periodinėms sąskaitoms skaičiuojama pagal Europe/Vilnius laiko juostą.',
          'Programa neteikia jokių duomenų VMI, Sodrai ar kitoms institucijoms automatiškai.',
        ],
        mistakes: [
          'Dirbama ne su ta įmone – prieš įvedant dokumentus patikrinkite aktyvią įmonę šoniniame meniu.',
          'Apžvalgos „pelnas“ laikomas apskaitos rezultatu. Tai tik pardavimų ir pirkimų sumų su PVM skirtumas; tikram rezultatui naudokite pelno (nuostolių) ataskaitą.',
          'Nenustatytas PVM režimas arba neteisinga jo pradžios data – dėl to naujose sąskaitose bus (ar nebus) skaičiuojamas PVM.',
        ],
        notes: [{ title: 'Atsakomybė', items: ['Šis žinynas aprašo programos veikimą ir nurodo oficialius šaltinius. Jis nėra mokesčių ar teisinė konsultacija. Už deklaracijas, apskaitos politiką ir duomenų teisingumą atsako naudotojas ir jo buhalteris.'] }],
      },
      ru: {
        title: 'Начало работы и обзорная панель',
        summary: 'Как устроена программа, что показывает обзор и в каком порядке начинать работу.',
        purpose: [
          'kontas.download — программа учёта для литовских компаний, работающая на вашем собственном сервере: документы продаж и покупок, банк, долги, главная книга, отчёты и подготовка налоговых файлов.',
          'Обзорная панель (меню «Обзор») показывает по активной компании суммы продаж и покупок с PVM, их разницу, количество контрагентов и банковских операций и последние 8 счетов продаж. Это ориентировочная сводка, а не финансовый отчёт.',
          'Все данные относятся к активной компании, выбранной в боковом меню. Данные другой компании не показываются и не изменяются.',
        ],
        steps: [
          'Войдите по своему e-mail и паролю.',
          'В меню «Управление компаниями» проверьте реквизиты компании (название, код, PVM-код, адрес, IBAN) и режим PVM с датой начала действия.',
          'Если счета будут отправляться по e-mail, настройте SMTP-сервер компании в её карточке.',
          'Проверьте план счетов (меню «План счетов»): программа использует счета 2410, 4430, 2444, 4492, 5001, 6118, 2710 и другие.',
          'Введите или импортируйте контрагентов, затем выписывайте счета, регистрируйте покупки и импортируйте банковские выписки.',
          'В конце месяца проверьте долги, оборотную ведомость, подготовьте файлы i.SAF / FR0600 и при необходимости закройте период.',
        ],
        rules: [
          'Каждая продажа, покупка, банковская операция и ведомость зарплаты автоматически создаёт записи в главной книге в той же транзакции базы данных.',
          'Денежные суммы считаются арифметикой с фиксированной точностью: сумма строки без PVM и PVM округляются до центов (половина — от нуля), итог документа — сумма округлённых строк.',
          '«Сегодня» для сроков оплаты, налогового календаря и периодических счетов определяется по часовому поясу Europe/Vilnius.',
          'Программа ничего не передаёт в VMI, Sodra или другие учреждения автоматически.',
        ],
        mistakes: [
          'Работа не в той компании — перед вводом документов проверьте активную компанию в боковом меню.',
          '«Прибыль» на обзоре принимают за учётный результат. Это лишь разница сумм продаж и покупок с PVM; для настоящего результата используйте отчёт о прибыли.',
          'Не задан режим PVM или неверна дата его начала — от этого зависит, начисляется ли PVM в новых счетах.',
        ],
        notes: [{ title: 'Ответственность', items: ['Справка описывает работу программы и указывает официальные источники. Она не является налоговой или юридической консультацией. За декларации, учётную политику и правильность данных отвечают пользователь и его бухгалтер.'] }],
      },
      en: {
        title: 'Getting started and overview dashboard',
        summary: 'How the application is organised, what the overview shows and in which order to start.',
        purpose: [
          'kontas.download is a self-hosted accounting application for Lithuanian companies: sales and purchase documents, bank, receivables, general ledger, reports and preparation of tax files.',
          'The overview dashboard (menu "Overview") shows, for the active company, sales and purchase totals including VAT, their difference, the number of counterparties and bank operations and the 8 latest sales invoices. It is an indicative summary, not a financial statement.',
          'All data belongs to the active company selected in the sidebar. Another company\'s data is neither shown nor changed.',
        ],
        steps: [
          'Sign in with your e-mail and password.',
          'In "Company management" check the company details (name, code, VAT code, address, IBAN) and the VAT mode with its effective date.',
          'If invoices will be e-mailed, configure the company\'s own SMTP server on its card.',
          'Review the chart of accounts ("Chart of accounts"): the application uses accounts 2410, 4430, 2444, 4492, 5001, 6118, 2710 and others.',
          'Enter or import counterparties, then issue invoices, record purchases and import bank statements.',
          'At month end review receivables and the trial balance, prepare the i.SAF / FR0600 files and lock the period if needed.',
        ],
        rules: [
          'Every sale, purchase, bank transaction and payroll automatically creates general ledger entries in the same database transaction.',
          'Money is calculated with fixed-point arithmetic: line net and VAT are rounded to cents (half away from zero) and the document total is the sum of rounded lines.',
          '"Today" for due dates, the tax calendar and recurring invoices is the date in the Europe/Vilnius time zone.',
          'The application never submits anything to VMI, Sodra or any other authority automatically.',
        ],
        mistakes: [
          'Working in the wrong company: check the active company in the sidebar before entering documents.',
          'Treating the overview "profit" as the accounting result. It is only the difference between sales and purchase totals including VAT; use the income statement for the real result.',
          'A missing VAT mode or a wrong effective date: it decides whether new invoices charge VAT.',
        ],
        notes: [{ title: 'Responsibility', items: ['This help describes how the software works and cites official sources. It is not tax or legal advice. The user and their accountant remain responsible for declarations, accounting policy and the correctness of the data.'] }],
      },
    },
  },
  {
    slug: 'language',
    group: 'start',
    sources: [],
    text: {
      lt: {
        title: 'Kalbos perjungimas',
        summary: 'Sąsajos kalba (lietuvių, rusų, anglų) ir dokumentų kalba.',
        purpose: [
          'Programos sąsaja ir šis žinynas pateikiami lietuvių, rusų ir anglų kalbomis.',
          'Sąsajos kalba yra naudotojo nustatymas; ji nekeičia jau išrašytų dokumentų ir apskaitos duomenų.',
        ],
        steps: [
          'Šoniniame meniu pasirinkite kalbą kalbos perjungiklyje.',
          'Puslapis persikraus pasirinkta kalba; pasirinkimas įrašomas naršyklės slapuke „lang“ ir galioja kitą kartą prisijungus.',
          'Jei kalba nepasirinkta, naudojama pirmoji palaikoma naršyklės kalba, kitaip – lietuvių.',
        ],
        rules: [
          'Sąskaitos PDF ir laiškas klientui sudaromi dokumento kalba, o ne pagal tai, kokia kalba šiuo metu matote sąsają. Dokumento kalbą (lt, ru arba en) galima nurodyti kontrahento kortelėje (laukas „Dokumentų kalba“; tuščias laukas = lietuvių) ir pakeisti konkrečiam dokumentui sąskaitos peržiūros bei laiško lange ir priminimo lange. PDF, laiško tekstas ir priminimas visada sutampa pagal kalbą, o išsiųsta kopija archyvuojama tokia, kokia buvo išsiųsta. Kalba keliauja kartu su kontrahentu eksportuojant įmonę.',
          'Mokesčių failai (i.SAF XML, FR0600 juodraštis) ir jų laukai atitinka VMI specifikacijas ir nepriklauso nuo sąsajos kalbos.',
          'Kai kurie serverio klaidų pranešimai gali būti rodomi kita kalba, kol jie dar neišversti.',
        ],
        mistakes: [
          'Manoma, kad pakeitus sąsajos kalbą pasikeis jau išsiųstų sąskaitų kalba – archyvuotos kopijos nekeičiamos.',
          'Slapukų blokavimas naršyklėje – tada kalba kiekvieną kartą nustatoma iš naršyklės nustatymų.',
        ],
      },
      ru: {
        title: 'Переключение языка',
        summary: 'Язык интерфейса (литовский, русский, английский) и язык документов.',
        purpose: [
          'Интерфейс программы и эта справка доступны на литовском, русском и английском языках.',
          'Язык интерфейса — личная настройка пользователя; он не меняет уже выписанные документы и учётные данные.',
        ],
        steps: [
          'В боковом меню выберите язык в переключателе языка.',
          'Страница перезагрузится на выбранном языке; выбор сохраняется в cookie «lang» браузера и действует при следующем входе.',
          'Если язык не выбран, используется первый поддерживаемый язык браузера, иначе литовский.',
        ],
        rules: [
          'PDF счёта и письмо клиенту формируются на языке документа, а не на языке, в котором вы сейчас видите интерфейс. Язык документа (lt, ru или en) задаётся в карточке контрагента (поле «Язык документов»; пусто = литовский) и может быть изменён для конкретного документа в окне просмотра/отправки счёта и в окне напоминания. PDF, текст письма и напоминание всегда совпадают по языку, а отправленная копия архивируется в том виде, в каком была отправлена. Язык переносится вместе с контрагентом при экспорте компании.',
          'Налоговые файлы (i.SAF XML, черновик FR0600) и их поля соответствуют спецификациям VMI и не зависят от языка интерфейса.',
          'Некоторые сообщения об ошибках сервера могут показываться на другом языке, пока они не переведены.',
        ],
        mistakes: [
          'Ожидание, что смена языка интерфейса изменит язык уже отправленных счетов — архивные копии не меняются.',
          'Блокировка cookie в браузере — тогда язык каждый раз определяется по настройкам браузера.',
        ],
      },
      en: {
        title: 'Switching the language',
        summary: 'Interface language (Lithuanian, Russian, English) and document language.',
        purpose: [
          'The interface and this help are available in Lithuanian, Russian and English.',
          'The interface language is a personal setting; it does not change documents already issued or accounting data.',
        ],
        steps: [
          'Choose the language in the language switcher in the sidebar.',
          'The page reloads in that language; the choice is stored in the browser cookie "lang" and applies on your next visit.',
          'Without a choice, the first supported browser language is used, otherwise Lithuanian.',
        ],
        rules: [
          'The invoice PDF and the e-mail to the customer are produced in the document language, not in the language you currently see the interface in. The document language (lt, ru or en) is set on the customer card (field "Document language"; empty = Lithuanian) and can be changed for a single document in the invoice preview/send window and in the reminder window. The PDF, the e-mail text and the reminder always match in language, and the sent copy is archived exactly as it was sent. The language travels with the customer when a company is exported.',
          'Tax files (i.SAF XML, FR0600 draft) and their fields follow the VMI specifications and do not depend on the interface language.',
          'Some server error messages may appear in another language until they are translated.',
        ],
        mistakes: [
          'Expecting a change of interface language to change invoices already sent: archived copies never change.',
          'Blocking cookies in the browser: the language is then taken from the browser settings every time.',
        ],
      },
    },
  },
  {
    slug: 'limitations',
    group: 'start',
    sources: ['vmi-eds', 'sodra', 'vmi-isaf-rules'],
    text: {
      lt: {
        title: 'Ribojimai: ko programa nedaro',
        summary: 'Aiškus sąrašas funkcijų, kurių programoje nėra arba kurios atliekamos rankiniu būdu.',
        purpose: ['Šis puslapis padeda nepasikliauti funkcijomis, kurių nėra. Viską, kas čia išvardyta, reikia atlikti kitomis priemonėmis arba rankiniu būdu.'],
        steps: [
          'Prieš terminą paruoškite failus programoje (i.SAF XML, FR0600 juodraštį).',
          'Prisijunkite prie VMI Elektroninio deklaravimo sistemos (EDS) ir patys įkelkite bei pateikite failus / deklaracijas.',
          'Sodros pranešimus ir deklaracijas teikite Sodros sistemose.',
        ],
        rules: [
          'Nėra ryšio su VMI EDS ir i.MAS: niekas nepateikiama automatiškai, programa tik paruošia failus.',
          'Nėra ryšio su Sodra; darbo užmokesčio modulis neteikia SAM, 1-SD ar kitų pranešimų.',
          'Nėra debetinių sąskaitų (DS).',
          'Nėra automatinio ilgalaikio turto nusidėvėjimo, savikainos ar atsargų nurašymo pagal pardavimus.',
          'Nėra automatinio ar suplanuoto sąskaitų ir priminimų siuntimo – kiekvienas siuntimas yra rankinis veiksmas.',
          'Nėra PDF sąskaitų atpažinimo; importuojamos tik UBL / Peppol XML sąskaitos.',
          'Pajamų mokesčio (PLN204), GPM312/GPM313, FR0564 deklaracijos neruošiamos – kalendorius tik primena terminus, jei jie įjungti.',
        ],
        mistakes: ['Manyti, kad paspaudus „Atsisiųsti i.SAF“ duomenys jau pateikti VMI. Failą būtina įkelti patiems.'],
      },
      ru: {
        title: 'Ограничения: чего программа не делает',
        summary: 'Чёткий список функций, которых в программе нет или которые выполняются вручную.',
        purpose: ['Эта страница помогает не рассчитывать на отсутствующие функции. Всё перечисленное нужно выполнять другими средствами или вручную.'],
        steps: [
          'До срока подготовьте файлы в программе (i.SAF XML, черновик FR0600).',
          'Войдите в систему электронного декларирования VMI (EDS) и сами загрузите и подайте файлы / декларации.',
          'Уведомления и декларации Sodra подавайте в системах Sodra.',
        ],
        rules: [
          'Нет подключения к VMI EDS и i.MAS: ничего не подаётся автоматически, программа только готовит файлы.',
          'Нет подключения к Sodra; модуль зарплаты не подаёт SAM, 1-SD и другие уведомления.',
          'Нет дебетовых счетов (DS).',
          'Нет автоматической амортизации основных средств, себестоимости и списания запасов по продажам.',
          'Нет автоматической или плановой отправки счетов и напоминаний — каждая отправка выполняется вручную.',
          'PDF-счета не распознаются; импортируются только XML-счета UBL / Peppol.',
          'Декларации PLN204, GPM312/GPM313, FR0564 не готовятся — календарь только напоминает о сроках, если они включены.',
        ],
        mistakes: ['Считать, что после «Скачать i.SAF» данные уже поданы в VMI. Файл нужно загрузить самостоятельно.'],
      },
      en: {
        title: 'Limitations: what the application does not do',
        summary: 'A clear list of functions that do not exist or are performed manually.',
        purpose: ['This page helps you not to rely on functions that do not exist. Everything listed here must be done with other tools or by hand.'],
        steps: [
          'Before the deadline prepare the files in the application (i.SAF XML, FR0600 draft).',
          'Sign in to the VMI Electronic Declaration System (EDS) and upload and submit the files / returns yourself.',
          'Submit Sodra notifications and returns in Sodra\'s own systems.',
        ],
        rules: [
          'No connection to VMI EDS or i.MAS: nothing is submitted automatically, the application only prepares files.',
          'No connection to Sodra; the payroll module does not submit SAM, 1-SD or other notifications.',
          'No debit notes (DS).',
          'No automatic depreciation of fixed assets, cost of goods sold or stock write-off from sales.',
          'No automatic or scheduled sending of invoices or reminders: every sending is a manual action.',
          'PDF invoices are not read; only UBL / Peppol XML invoices are imported.',
          'Returns PLN204, GPM312/GPM313 and FR0564 are not prepared; the calendar only reminds of their due dates when enabled.',
        ],
        mistakes: ['Assuming that "Download i.SAF" has submitted the data to VMI. You must upload the file yourself.'],
      },
    },
  },
];
