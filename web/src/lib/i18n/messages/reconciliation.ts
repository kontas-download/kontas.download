import type { Namespace } from './types';

// [key, lt, ru, en]
const rows: [string, string, string, string][] = [
  ['title', 'Tarpusavio atsiskaitymų suderinimo aktas', 'Акт сверки взаиморасчётов', 'Reconciliation statement of mutual settlements'],
  ['subtitle', 'Oficialus pirkėjų ir tiekėjų skolų suderinimo aktas su parašų ir antspaudų rekvizitais', 'Официальный акт сверки задолженности покупателей и поставщиков с реквизитами подписей и печатей', 'Official statement for reconciling customer and supplier balances, with signature and stamp fields'],
  ['print', 'Spausdinti / PDF', 'Печать / PDF', 'Print / PDF'],
  ['selectCounterparty', 'Pasirinkite kontragentą (Pirkėją / Tiekėją):', 'Выберите контрагента (покупателя / поставщика):', 'Select a counterparty (customer / supplier):'],
  ['selectPlaceholder', '-- Pasirinkite iš sąrašo --', '-- Выберите из списка --', '-- Select from the list --'],
  ['codeSuffix', '(kodas: {code})', '(код: {code})', '(code: {code})'],
  ['asOf', 'Būklė datai:', 'Состояние на дату:', 'Status as of:'],
  ['loading', 'Kraunama...', 'Загрузка...', 'Loading...'],
  ['generate', 'Sudaryti aktą', 'Сформировать акт', 'Generate statement'],
  ['docTitle', 'TARPUSAVIO ATSISKAITYMŲ SUDERINIMO AKTAS', 'АКТ СВЕРКИ ВЗАИМОРАСЧЁТОВ', 'RECONCILIATION STATEMENT OF MUTUAL SETTLEMENTS'],
  ['dateLabel', 'Data:', 'Дата:', 'Date:'],
  ['vatSuffix', ', PVM mokėtojo kodas {code}', ', код плательщика НДС {code}', ', VAT payer code {code}'],
  ['intro', 'Mes, žemiau pasirašę, {company}, įmonės kodas {code}{vat}, ir {client}, įmonės kodas {clientCode}{clientVat}, surašėme šį aktą apie tai, kad pagal apskaitos duomenis {date} dienai tarpusavio atsiskaitymų būklė yra ši:', 'Мы, нижеподписавшиеся, {company}, код компании {code}{vat}, и {client}, код компании {clientCode}{clientVat}, составили настоящий акт о том, что по данным учёта на {date} состояние взаиморасчётов следующее:', 'We, the undersigned, {company}, company code {code}{vat}, and {client}, company code {clientCode}{clientVat}, have drawn up this statement confirming that, according to the accounting records, the status of mutual settlements as of {date} is as follows:'],
  ['colDate', 'Data', 'Дата', 'Date'],
  ['colDoc', 'Dokumento Nr.', 'Номер документа', 'Document no.'],
  ['colOperation', 'Operacija / Pavadinimas', 'Операция / Наименование', 'Transaction / Description'],
  ['colDebit', 'Debetas (€)', 'Дебет (€)', 'Debit (€)'],
  ['colCredit', 'Kreditas (€)', 'Кредит (€)', 'Credit (€)'],
  ['colBalance', 'Likutis (€)', 'Остаток (€)', 'Balance (€)'],
  ['empty', 'Užregistruotų tarpusavio operacijų iki pasirinktos datos nėra.', 'Зарегистрированных взаимных операций до выбранной даты нет.', 'There are no recorded mutual transactions up to the selected date.'],
  ['totalTurnover', 'IŠ VISO APYVARTA:', 'ИТОГО ОБОРОТ:', 'TOTAL TURNOVER:'],
  ['conclusion', 'Galutinė atsiskaitymų išvada:', 'Итоговый вывод по расчётам:', 'Final conclusion on settlements:'],
  ['clientOwes', 'Pagal {company} apskaitos duomenis, {client} įsiskolinimas {company} naudai sudaro {amount}.', 'По данным учёта {company} задолженность {client} в пользу {company} составляет {amount}.', 'According to the accounting records of {company}, the debt of {client} in favour of {company} is {amount}.'],
  ['companyOwes', 'Pagal {company} apskaitos duomenis, {company} įsiskolinimas {client} naudai sudaro {amount}.', 'По данным учёта {company} задолженность {company} в пользу {client} составляет {amount}.', 'According to the accounting records of {company}, the debt of {company} in favour of {client} is {amount}.'],
  ['settled', 'Tarpusavio atsiskaitymai pagal {date} dienos duomenis yra visiškai suderinti. Įsiskolinimo nėra ({amount}).', 'Взаиморасчёты по данным на {date} полностью сверены. Задолженности нет ({amount}).', 'Mutual settlements as of {date} are fully reconciled. There is no debt ({amount}).'],
  ['confirmNote', 'Prašome patvirtinti suderinimo aktą parašu bei antspaudu ir grąžinti vieną egzempliorių per 10 kalendorinių dienų. Negavus motyvuotų pastabų per nurodytą laiką, aktas laikomas suderintu ir galiojančiu be išlygų.', 'Просим подтвердить акт сверки подписью и печатью и вернуть один экземпляр в течение 10 календарных дней. Если в указанный срок не будет получено мотивированных возражений, акт считается согласованным и действительным без оговорок.', 'Please confirm the statement with a signature and stamp and return one copy within 10 calendar days. If no reasoned objections are received within that time, the statement is considered reconciled and valid without reservations.'],
  ['managerAccountant', 'Vadovas / Vyr. buhalteris:', 'Руководитель / Главный бухгалтер:', 'Manager / Chief accountant:'],
  ['debtConfirmedBy', 'Skolą patvirtina (Vadovas / Vyr. buhalteris):', 'Задолженность подтверждает (Руководитель / Главный бухгалтер):', 'Debt confirmed by (Manager / Chief accountant):'],
  ['signature', '(parašas)', '(подпись)', '(signature)'],
  ['fullName', '(vardas, pavardė)', '(имя, фамилия)', '(first name, surname)'],
  ['stampPlace', 'A.V. (Antspaudo vieta)', 'М.П. (место печати)', 'Stamp (place for stamp)'],
  ['emptyHint', 'Pasirinkite kontragentą ir spauskite „Sudaryti aktą“', 'Выберите контрагента и нажмите «Сформировать акт»', 'Select a counterparty and click “Generate statement”'],
  ['emptyHint2', 'Sistema automatiškai surinks visus pardavimo, pirkimo ir banko dokumentus', 'Система автоматически соберёт все документы продаж, покупок и банка', 'The system will automatically collect all sales, purchase and bank documents'],
];

const build = (i: number) => Object.fromEntries(rows.map(r => [r[0], r[i]]));
const reconciliation: Namespace = { lt: build(1), ru: build(2), en: build(3) };
export default reconciliation;
