import type { Namespace } from './types';

const settings: Namespace = {
  lt: {
    title: 'Sistemos nustatymai', subtitle: 'Kalba, išvaizda, paskyra ir duomenys.',
    language: 'Kalba', languageHint: 'Sąsajos ir naujų dokumentų kalba. Pakeitimas pritaikomas iš karto.',
    theme: 'Išvaizda', themeHint: 'Tamsi, šviesi arba pagal įrenginio nustatymus. Spausdinimas ir PDF visada šviesūs.',
    themeDark: 'Tamsi', themeLight: 'Šviesi', themeSystem: 'Kaip įrenginyje',
    account: 'Paskyra', signedInAs: 'Prisijungta kaip', role: 'Vaidmuo', changePassword: 'Keisti slaptažodį', logout: 'Atsijungti',
    data: 'Duomenys', backupHint: 'Atsisiųskite visos duomenų bazės kopiją (SQLite). Saugokite ją saugioje vietoje.', backupDownload: 'Atsisiųsti kopiją', adminOnly: 'Tik administratoriui.',
    shortcuts: 'Kiti nustatymai', shortcutCompanies: 'Įmonės ir duomenų perkėlimas', shortcutUsers: 'Naudotojai ir vaidmenys', shortcutAccounts: 'Sąskaitų planas', shortcutRules: 'Mokesčių taisyklės',
    version: 'Versija',
  },
  ru: {
    title: 'Системные настройки', subtitle: 'Язык, оформление, учётная запись и данные.',
    language: 'Язык', languageHint: 'Язык интерфейса и новых документов. Изменение применяется сразу.',
    theme: 'Оформление', themeHint: 'Тёмная, светлая или по настройкам устройства. Печать и PDF всегда светлые.',
    themeDark: 'Тёмная', themeLight: 'Светлая', themeSystem: 'Как на устройстве',
    account: 'Учётная запись', signedInAs: 'Вы вошли как', role: 'Роль', changePassword: 'Сменить пароль', logout: 'Выйти',
    data: 'Данные', backupHint: 'Скачайте копию всей базы данных (SQLite). Храните её в надёжном месте.', backupDownload: 'Скачать копию', adminOnly: 'Только для администратора.',
    shortcuts: 'Другие настройки', shortcutCompanies: 'Компании и перенос данных', shortcutUsers: 'Пользователи и роли', shortcutAccounts: 'План счетов', shortcutRules: 'Налоговые правила',
    version: 'Версия',
  },
  en: {
    title: 'System settings', subtitle: 'Language, appearance, account and data.',
    language: 'Language', languageHint: 'Language of the interface and of new documents. Applies at once.',
    theme: 'Appearance', themeHint: 'Dark, light or follow the device. Printing and PDFs are always light.',
    themeDark: 'Dark', themeLight: 'Light', themeSystem: 'Match device',
    account: 'Account', signedInAs: 'Signed in as', role: 'Role', changePassword: 'Change password', logout: 'Log out',
    data: 'Data', backupHint: 'Download a copy of the whole database (SQLite). Keep it somewhere safe.', backupDownload: 'Download backup', adminOnly: 'Administrators only.',
    shortcuts: 'More settings', shortcutCompanies: 'Companies and data transfer', shortcutUsers: 'Users and roles', shortcutAccounts: 'Chart of accounts', shortcutRules: 'Tax rules',
    version: 'Version',
  },
};
export default settings;
