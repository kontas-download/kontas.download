// Language of customer-facing documents (invoice PDF, invoice email, payment reminder). It is independent of the interface language:
// the default is the language stored on the customer, otherwise Lithuanian, and it can be chosen per document.
export const DOC_LANGS = ['lt', 'ru', 'en'] as const;
export type DocLang = (typeof DOC_LANGS)[number];
export const DEFAULT_DOC_LANG: DocLang = 'lt';
export const DOC_LOCALES: Record<DocLang, string> = { lt: 'lt-LT', ru: 'ru-RU', en: 'en-GB' };

export const isDocLang = (value: unknown): value is DocLang => typeof value === 'string' && (DOC_LANGS as readonly string[]).includes(value);
export const resolveDocLang = (...candidates: unknown[]): DocLang => candidates.find(isDocLang) ?? DEFAULT_DOC_LANG;

export interface DocTexts {
  creditPrefix: string; titleSvs: string; titleVat: string; titleNoVat: string;
  number: string; issueDate: string; corrects: string; reason: string;
  seller: string; buyer: string; companyCode: string; vatCode: string; currency: string;
  colNo: string; colItem: string; colQty: string; colPriceNet: string; colPrice: string; colVatPct: string; colSumVat: string; colSum: string;
  sumNet: string; vat: string; total: string; noVatSvs: string; noVatSeller: string; reverseChargeEu: string; reverseChargeLt96: string;
  dueDate: string; iban: string; bank: string; swift: string;
  invoiceWord: string; greeting: string; sendingInvoice: string; amount: string; payBy: string; regards: string;
  reminderSubject: string; reminderBody: string; reminderDue: string; reminderAttached: string;
}

const lt: DocTexts = {
  creditPrefix: 'KREDITINĖ ', titleSvs: 'SUPAPRASTINTA PVM SĄSKAITA FAKTŪRA', titleVat: 'PVM SĄSKAITA FAKTŪRA', titleNoVat: 'SĄSKAITA FAKTŪRA',
  number: 'Nr.', issueDate: 'Išrašymo data', corrects: 'Koreguojama sąskaita', reason: 'Priežastis',
  seller: 'PARDAVĖJAS', buyer: 'PIRKĖJAS', companyCode: 'Įmonės kodas', vatCode: 'PVM kodas', currency: 'Valiuta',
  colNo: 'Nr.', colItem: 'Prekė / Paslauga', colQty: 'Kiekis', colPriceNet: 'Kaina be PVM', colPrice: 'Kaina', colVatPct: 'PVM %', colSumVat: 'Suma su PVM', colSum: 'Suma',
  sumNet: 'Suma be PVM', vat: 'PVM', total: 'IŠ VISO', noVatSvs: 'PVM neskaičiuojamas. Taikoma SVS Lietuvoje.', noVatSeller: 'PVM neskaičiuojamas. Pardavėjas ne PVM mokėtojas.',
  reverseChargeEu: 'Atvirkštinis apmokestinimas — PVM skaičiuoja pirkėjas (PVMĮ 13 str. 2 d., Direktyvos 2006/112/EB 196 str.).',
  reverseChargeLt96: 'Atvirkštinis apmokestinimas — PVM išskaičiuoja ir sumoka pirkėjas (LR PVMĮ 96 str. 1 d.).',
  dueDate: 'Apmokėti iki', iban: 'IBAN', bank: 'Bankas', swift: 'SWIFT',
  invoiceWord: 'Sąskaita faktūra', greeting: 'Laba diena,', sendingInvoice: 'Siunčiame sąskaitą faktūrą {number}.', amount: 'Suma', payBy: 'Apmokėti iki', regards: 'Pagarbiai,',
  reminderSubject: 'Priminimas apie neapmokėtą sąskaitą {number}', reminderBody: 'primename, kad sąskaita faktūra {number} ({date}) nėra pilnai apmokėta. Neapmokėta suma: {balance} {currency}.', reminderDue: 'Apmokėjimo terminas buvo {date}.', reminderAttached: 'Sąskaitą pridedame. Jei apmokėjote, prašome šio laiško nepaisyti.',
};
const ru: DocTexts = {
  creditPrefix: 'КРЕДИТОВЫЙ ', titleSvs: 'УПРОЩЁННЫЙ СЧЁТ-ФАКТУРА PVM', titleVat: 'СЧЁТ-ФАКТУРА PVM', titleNoVat: 'СЧЁТ-ФАКТУРА',
  number: '№', issueDate: 'Дата выписки', corrects: 'Корректируемый счёт', reason: 'Причина',
  seller: 'ПРОДАВЕЦ', buyer: 'ПОКУПАТЕЛЬ', companyCode: 'Код компании', vatCode: 'Код PVM', currency: 'Валюта',
  colNo: '№', colItem: 'Товар / Услуга', colQty: 'Кол-во', colPriceNet: 'Цена без PVM', colPrice: 'Цена', colVatPct: 'PVM %', colSumVat: 'Сумма с PVM', colSum: 'Сумма',
  sumNet: 'Сумма без PVM', vat: 'PVM', total: 'ИТОГО', noVatSvs: 'PVM не начисляется. Применяется SVS в Литве.', noVatSeller: 'PVM не начисляется. Продавец не является плательщиком PVM.',
  reverseChargeEu: 'Обратное начисление PVM — налог исчисляет покупатель (ч. 2 ст. 13 Закона о PVM ЛР, ст. 196 Директивы 2006/112/ЕС).',
  reverseChargeLt96: 'Обратное начисление PVM — налог удерживает и уплачивает покупатель (ч. 1 ст. 96 Закона о PVM ЛР).',
  dueDate: 'Оплатить до', iban: 'IBAN', bank: 'Банк', swift: 'SWIFT',
  invoiceWord: 'Счёт-фактура', greeting: 'Добрый день,', sendingInvoice: 'Направляем счёт-фактуру {number}.', amount: 'Сумма', payBy: 'Оплатить до', regards: 'С уважением,',
  reminderSubject: 'Напоминание о неоплаченном счёте {number}', reminderBody: 'напоминаем, что счёт-фактура {number} ({date}) оплачена не полностью. Неоплаченная сумма: {balance} {currency}.', reminderDue: 'Срок оплаты был {date}.', reminderAttached: 'Счёт прилагаем. Если вы уже оплатили, просим не учитывать это письмо.',
};
const en: DocTexts = {
  creditPrefix: 'CREDIT ', titleSvs: 'SIMPLIFIED VAT INVOICE', titleVat: 'VAT INVOICE', titleNoVat: 'INVOICE',
  number: 'No.', issueDate: 'Issue date', corrects: 'Corrected invoice', reason: 'Reason',
  seller: 'SELLER', buyer: 'BUYER', companyCode: 'Company code', vatCode: 'VAT code', currency: 'Currency',
  colNo: 'No.', colItem: 'Goods / Services', colQty: 'Qty', colPriceNet: 'Price excl. VAT', colPrice: 'Price', colVatPct: 'VAT %', colSumVat: 'Amount incl. VAT', colSum: 'Amount',
  sumNet: 'Total excl. VAT', vat: 'VAT', total: 'TOTAL', noVatSvs: 'VAT is not charged. Simplified VAT scheme (SVS) in Lithuania applies.', noVatSeller: 'VAT is not charged. The seller is not a VAT payer.',
  reverseChargeEu: 'Reverse charge — VAT to be accounted for by the recipient (Art. 13(2) LT VAT Act, Art. 196 Directive 2006/112/EC).',
  reverseChargeLt96: 'Domestic reverse charge — VAT to be withheld and paid by the buyer (Art. 96(1) LT VAT Act).',
  dueDate: 'Pay by', iban: 'IBAN', bank: 'Bank', swift: 'SWIFT',
  invoiceWord: 'Invoice', greeting: 'Hello,', sendingInvoice: 'Please find attached invoice {number}.', amount: 'Amount', payBy: 'Pay by', regards: 'Kind regards,',
  reminderSubject: 'Reminder: unpaid invoice {number}', reminderBody: 'this is a reminder that invoice {number} ({date}) has not been paid in full. Outstanding amount: {balance} {currency}.', reminderDue: 'The payment due date was {date}.', reminderAttached: 'The invoice is attached. If you have already paid, please disregard this message.',
};
const TEXTS: Record<DocLang, DocTexts> = { lt, ru, en };

export const docTexts = (lang: DocLang): DocTexts => TEXTS[lang];
const fill = (text: string, params: Record<string, string | number>) => text.replace(/\{(\w+)\}/g, (whole, key) => (key in params ? String(params[key]) : whole));

// Number formatting without non-breaking spaces (the PDF font renders them unevenly).
export const formatDocNumber = (lang: DocLang, value: number, min = 2, max = 2) =>
  Number(value).toLocaleString(DOC_LOCALES[lang], { minimumFractionDigits: min, maximumFractionDigits: max }).replace(/[  ]/g, ' ');

// Lines of an email: an empty line separates paragraphs, never more than one in a row.
const compact = (lines: string[]) => lines.filter((line, i, all) => line || (i > 0 && all[i - 1])).join('\n');

export function invoiceMailDraft(lang: DocLang, d: { number: string; total: number; currency: string; dueDate: string | null; seller: string }) {
  const x = docTexts(lang);
  return { subject: `${x.invoiceWord} ${d.number}`, text: compact([x.greeting, '', fill(x.sendingInvoice, { number: d.number }), `${x.amount}: ${d.total.toFixed(2)} ${d.currency}.`, d.dueDate ? `${x.payBy}: ${d.dueDate}.` : '', '', x.regards, d.seller]) };
}
export function reminderMailDraft(lang: DocLang, d: { number: string; date: string; dueDate: string | null; balance: number; currency: string; seller: string }) {
  const x = docTexts(lang);
  return {
    subject: fill(x.reminderSubject, { number: d.number }),
    text: compact([x.greeting, '', fill(x.reminderBody, { number: d.number, date: d.date, balance: d.balance.toFixed(2), currency: d.currency }), d.dueDate ? fill(x.reminderDue, { date: d.dueDate }) : '', x.reminderAttached, '', x.regards, d.seller]),
  };
}
