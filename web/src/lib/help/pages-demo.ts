import type { HelpPage } from './types';

export const demoPages: HelpPage[] = [
  {
    slug: 'demo-company',
    group: 'start',
    appHref: '/companies',
    sources: [],
    text: {
      lt: {
        title: 'Demonstracinė įmonė',
        summary: 'Išbandykite programą su išgalvotais duomenimis, nerizikuodami tikrąja apskaita.',
        purpose: [
          'Demonstracinė įmonė leidžia pamatyti visus pagrindinius programos skyrius su duomenimis: sąskaitas, kreditinę sąskaitą, pirkimus, banko operacijas ir jų susiejimą, skolas, darbo užmokestį, periodines sąskaitas, didžiąją knygą, i.SAF ir FR0600 juodraštį.',
          'Visi duomenys išgalvoti: pavadinimai, kodai, PVM kodai (sudaryti iš nulių), sąskaitos numeris (IBAN su kontroliniais skaitmenimis 00), el. paštai (tik @example.test); telefonų numerių nėra. Asmens duomenų ar tikrų įmonių duomenų nėra, SMTP nustatymai nekuriami.',
        ],
        steps: [
          'Prisijunkite kaip administratorius ir atidarykite „Įmonės“.',
          'Paspauskite „Sukurti demonstracinę įmonę“ ir patvirtinkite.',
          'Programa sukuria įmonę „UAB „Demo pavyzdys““ ir iš karto ją aktyvuoja: apžiūrėkite pardavimus, pirkimus, banką, skolas ir mokesčių ataskaitas.',
          'Kai demonstracinė įmonė nebereikalinga, ištrinkite ją „Įmonėse“ kaip bet kurią kitą įmonę. Jei jai uždarytas apskaitos laikotarpis, įmonės ištrinti negalima: pirmiausia atidarykite laikotarpį („Įmonių valdymas“ → „Apskaitos kontrolė“), tada ištrinkite.',
        ],
        rules: [
          'Įmonė yra PVM mokėtoja (STANDARD_VAT). Pateikiama: 9 kontrahentai (5 pirkėjai, įskaitant vieną iš Latvijos, ir 4 tiekėjai), 4 atsargų prekės, 13 pardavimo sąskaitų per paskutinius tris mėnesius (21 %, 9 % ir 0 % ES pirkėjui), 1 kreditinė sąskaita, 8 pirkimai su atskaitomu PVM, 13 banko operacijų (dauguma susietos su sąskaitomis, viena laukia susiejimo), 1 apmokėjimas grynaisiais, praėjusio mėnesio darbo užmokestis 2 išgalvotiems darbuotojams ir 2 periodinių sąskaitų šablonai.',
          'Datos skaičiuojamos nuo sukūrimo dienos (Lietuvos laiku), todėl dalis sąskaitų jau pradelstos, o mėnesinis šablonas paruoštas išrašyti šiandien.',
          'Paslaugoms Latvijos pirkėjui eilutėse priskirtas i.SAF kodas PVM15 (0 %), todėl laikotarpio i.SAF failas ir FR0600 juodraštis sudaromi be rankinių klausimų.',
          'Tikroje apskaitoje paslaugų ES PVM mokėtojui sąskaitoje turi būti atvirkštinio apmokestinimo įrašas, o tiekėjas papildomai teikia FR0564 ataskaitą (18 laukelis). Programa šio įrašo sąskaitos PDF dokumente dar nespausdina (vidinės pastabos į pirkėjo PDF nepatenka) ir FR0564 neruošia: tai tvarko buhalteris.',
          'Vienu metu gali būti ne daugiau kaip 3 demonstracinės įmonės; demonstracinė įmonė atpažįstama tik pagal pavadinimą.',
        ],
        mistakes: [
          'Neveskite tikrų dokumentų į demonstracinę įmonę: ji skirta tik mokytis ir bus ištrinta kartu su visais joje esančiais duomenimis.',
          'Demonstracinio i.SAF failo ar FR0600 juodraščio neteikite VMI: tai išgalvoti duomenys.',
        ],
      },
      ru: {
        title: 'Демонстрационная компания',
        summary: 'Попробуйте программу на вымышленных данных, не рискуя настоящим учётом.',
        purpose: [
          'Демонстрационная компания позволяет увидеть все основные разделы программы с данными: счета, кредитный счёт, покупки, банковские операции и их привязку, долги, зарплату, периодические счета, главную книгу, i.SAF и черновик FR0600.',
          'Все данные вымышлены: названия, коды, коды НДС (из нулей), номер счёта (IBAN с контрольными цифрами 00), адреса электронной почты (только @example.test); номеров телефонов нет. Персональных данных и данных реальных компаний нет, настройки SMTP не создаются.',
        ],
        steps: [
          'Войдите как администратор и откройте «Компании».',
          'Нажмите «Создать демонстрационную компанию» и подтвердите.',
          'Программа создаёт компанию «UAB „Demo pavyzdys“» и сразу делает её активной: посмотрите продажи, покупки, банк, долги и налоговые отчёты.',
          'Когда демонстрационная компания больше не нужна, удалите её в «Компаниях», как любую другую компанию. Если для неё закрыт учётный период, удалить компанию нельзя: сначала откройте период («Управление компаниями» → «Контроль учёта»), затем удалите.',
        ],
        rules: [
          'Компания является плательщиком НДС (STANDARD_VAT). В ней: 9 контрагентов (5 покупателей, включая одного из Латвии, и 4 поставщика), 4 складских товара, 13 счетов продажи за последние три месяца (21 %, 9 % и 0 % для покупателя из ЕС), 1 кредитный счёт, 8 покупок с вычитаемым НДС, 13 банковских операций (большинство привязаны к счетам, одна ждёт привязки), 1 оплата наличными, зарплата за прошлый месяц для 2 вымышленных работников и 2 шаблона периодических счетов.',
          'Даты отсчитываются от дня создания (по времени Литвы), поэтому часть счетов уже просрочена, а месячный шаблон готов к выписке сегодня.',
          'Строкам услуг для покупателя из Латвии присвоен код i.SAF PVM15 (0 %), поэтому файл i.SAF за период и черновик FR0600 формируются без ручных вопросов.',
          'В реальном учёте в счёте за услуги плательщику НДС из ЕС должна быть отметка об обратном начислении (reverse charge), а поставщик дополнительно подаёт отчёт FR0564 (поле 18). Программа пока не печатает эту отметку в PDF счёта (внутренние примечания в PDF покупателя не попадают) и не готовит FR0564: это делает бухгалтер.',
          'Одновременно может быть не более 3 демонстрационных компаний; демонстрационная компания распознаётся только по названию.',
        ],
        mistakes: [
          'Не вносите настоящие документы в демонстрационную компанию: она предназначена только для обучения и удаляется вместе со всеми своими данными.',
          'Не подавайте в VMI демонстрационный файл i.SAF или черновик FR0600: это вымышленные данные.',
        ],
      },
      en: {
        title: 'Demonstration company',
        summary: 'Try the program with fictional data without risking your real books.',
        purpose: [
          'The demonstration company shows every main part of the program with data: invoices, a credit note, purchases, bank transactions and their links, receivables, payroll, recurring invoices, the general ledger, i.SAF and the FR0600 draft.',
          'All data is fictional: names, codes, VAT codes (made of zeros), the account number (IBAN with check digits 00), e-mails (only @example.test); there are no phone numbers. There is no personal data and no data of real companies; no SMTP settings are created.',
        ],
        steps: [
          'Sign in as an administrator and open Companies.',
          'Click "Create demonstration company" and confirm.',
          'The program creates the company "UAB „Demo pavyzdys“" and makes it active right away: look at sales, purchases, the bank, receivables and the tax reports.',
          'When the demonstration company is no longer needed, delete it on the Companies page like any other company. While an accounting period is closed for it, the company cannot be deleted: first reopen the period (Company management → Accounting control), then delete it.',
        ],
        rules: [
          'The company is a VAT payer (STANDARD_VAT). It contains 9 counterparties (5 customers, one of them from Latvia, and 4 suppliers), 4 stock items, 13 sales invoices over the last three months (21%, 9% and 0% for the EU customer), 1 credit note, 8 purchases with deductible VAT, 13 bank transactions (most linked to invoices, one waiting to be linked), 1 cash payment, last month\'s payroll for 2 fictional employees and 2 recurring invoice templates.',
          'Dates are counted from the day of creation (Lithuanian time), so some invoices are already overdue and the monthly template is ready to be issued today.',
          'The service lines for the Latvian customer carry the i.SAF code PVM15 (0%), so the i.SAF file and the FR0600 draft for the period are built without manual questions.',
          'In real books, an invoice for services supplied to an EU VAT payer must carry the reverse-charge wording, and the supplier must also file the FR0564 report (field 18). The program does not yet print that wording on the invoice PDF (internal notes do not reach the customer PDF) and does not prepare FR0564: the accountant handles it.',
          'There can be at most 3 demonstration companies at a time; a demonstration company is recognised by its name only.',
        ],
        mistakes: [
          'Do not enter real documents into the demonstration company: it is for learning only and is deleted together with all its data.',
          'Do not submit the demonstration i.SAF file or FR0600 draft to VMI: the data is fictional.',
        ],
      },
    },
  },
];
