import type { Namespace } from './types';

// "Create demonstration company" on the Companies page and the hint on an empty dashboard.
const demo: Namespace = {
  lt: {
    create: 'Sukurti demonstracinę įmonę',
    creating: 'Kuriama...',
    confirm: 'Bus pridėta nauja demonstracinė įmonė su visiškai išgalvotais duomenimis: klientais, sąskaitomis, pirkimais, banko operacijomis, darbo užmokesčiu ir periodinių sąskaitų šablonais. Jokių asmens ar tikrų įmonių duomenų joje nėra. Esami duomenys nekeičiami, o demonstracinę įmonę vėliau galima ištrinti kaip bet kurią kitą įmonę. Tęsti?',
    failed: 'Nepavyko sukurti demonstracinės įmonės: {message}',
    createdNotSwitched: 'Demonstracinė įmonė sukurta, bet nepavyko jos aktyvuoti ({message}). Pasirinkite ją sąraše rankiniu būdu.',
    dashboardHint: 'Norite pabandyti programą su pavyzdiniais duomenimis? Administratorius gali skiltyje „Įmonės“ paspausti „Sukurti demonstracinę įmonę“.',
  },
  ru: {
    create: 'Создать демонстрационную компанию',
    creating: 'Создаётся...',
    confirm: 'Будет добавлена новая демонстрационная компания с полностью вымышленными данными: клиентами, счетами, покупками, банковскими операциями, зарплатой и шаблонами периодических счетов. Персональных данных и данных реальных компаний в ней нет. Существующие данные не меняются, а демонстрационную компанию потом можно удалить как любую другую компанию. Продолжить?',
    failed: 'Не удалось создать демонстрационную компанию: {message}',
    createdNotSwitched: 'Демонстрационная компания создана, но сделать её активной не удалось ({message}). Выберите её в списке вручную.',
    dashboardHint: 'Хотите попробовать программу на примерных данных? Администратор может в разделе «Компании» нажать «Создать демонстрационную компанию».',
  },
  en: {
    create: 'Create demonstration company',
    creating: 'Creating...',
    confirm: 'A new demonstration company with entirely fictional data will be added: customers, invoices, purchases, bank transactions, payroll and recurring invoice templates. It contains no personal data and no data of real companies. Existing data is not changed, and the demonstration company can later be deleted like any other company. Continue?',
    failed: 'Could not create the demonstration company: {message}',
    createdNotSwitched: 'The demonstration company was created, but it could not be made active ({message}). Select it in the list yourself.',
    dashboardHint: 'Want to try the program with sample data? An administrator can open Companies and click "Create demonstration company".',
  },
};
export default demo;
