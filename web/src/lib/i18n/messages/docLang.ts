import type { Namespace } from './types';

const docLang: Namespace = {
  lt: { label: 'Dokumento kalba', hint: 'Kalba, kuria sąskaita, PDF ir laiškas bus išsiųsti klientui', byClient: 'Pagal kliento kalbą', defaultLt: 'Lietuvių (numatyta)', lt: 'Lietuvių', ru: 'Rusų', en: 'Anglų', clientField: 'Dokumentų kalba (sąskaitos, laiškai, priminimai)' },
  ru: { label: 'Язык документа', hint: 'Язык, на котором счёт, PDF и письмо уйдут клиенту', byClient: 'По языку клиента', defaultLt: 'Литовский (по умолчанию)', lt: 'Литовский', ru: 'Русский', en: 'Английский', clientField: 'Язык документов (счета, письма, напоминания)' },
  en: { label: 'Document language', hint: 'The language in which the invoice, PDF and email are sent to the customer', byClient: "Customer's language", defaultLt: 'Lithuanian (default)', lt: 'Lithuanian', ru: 'Russian', en: 'English', clientField: 'Document language (invoices, emails, reminders)' },
};
export default docLang;
