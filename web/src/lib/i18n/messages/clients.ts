import type { Namespace } from './types';

const clients: Namespace = {
  lt: {
    title: 'Kontragentai (pirkėjai ir tiekėjai, CRM)', totalInSystem: 'Iš viso sistemoje: {count} įmonių ir asmenų.', addNew: 'Pridėti naują kontragentą',
    searchPlaceholder: 'Paieška pagal pavadinimą, kodą, PVM, miestą...', city: 'Miestas', allCities: 'Visi miestai', vat: 'PVM', all: 'Visi', withVatCode: 'Tik su PVM kodu', withoutVatCode: 'Be PVM kodo',
    clearFilters: 'Išvalyti filtrus', reset: 'Atstatyti', tableView: 'Lentelės vaizdas', cardView: 'Kortelių vaizdas', found: 'Rasta kontragentų: {shown} iš {total}',
    nameCol: 'Pavadinimas / Vardas', companyCode: 'Įmonės kodas', vatCode: 'PVM kodas', email: 'El. paštas', phone: 'Telefonas', turnoverCol: 'Apyvarta (€)', actions: 'Veiksmai',
    edit: 'Redaguoti', delete: 'Ištrinti', noneFound: 'Pagal nurodytus filtrus kontragentų nerasta.', csvName: 'Pavadinimas', address: 'Adresas', turnover: 'Apyvarta',
    code: 'Kodas', invoicesCount: 'Sąskaitų: {count}', editTitle: 'Redaguoti kontragentą', newTitle: 'Naujas kontragentas', fullName: 'Įmonės pavadinimas / Vardas, Pavardė *', namePlaceholder: 'UAB Klientas',
    vatPayer: 'PVM mokėtojas', vatPayerCode: 'PVM mokėtojo kodas', cancel: 'Atšaukti', saving: 'Išsaugoma...', save: 'Išsaugoti', create: 'Sukurti',
    errName: 'Įveskite kliento / įmonės pavadinimą', errUpdate: 'Nepavyko atnaujinti kliento', errCreate: 'Nepavyko sukurti kliento', errDelete: 'Nepavyko ištrinti kliento', confirmDelete: 'Ar tikrai norite ištrinti klientą "{name}"?',
  },
  ru: {
    title: 'Контрагенты (покупатели и поставщики, CRM)', totalInSystem: 'Всего в системе: {count} компаний и лиц.', addNew: 'Добавить нового контрагента',
    searchPlaceholder: 'Поиск по названию, коду, PVM, городу...', city: 'Город', allCities: 'Все города', vat: 'PVM', all: 'Все', withVatCode: 'Только с кодом PVM', withoutVatCode: 'Без кода PVM',
    clearFilters: 'Сбросить фильтры', reset: 'Сбросить', tableView: 'Табличный вид', cardView: 'Вид карточками', found: 'Найдено контрагентов: {shown} из {total}',
    nameCol: 'Название / Имя', companyCode: 'Код предприятия', vatCode: 'Код PVM', email: 'Эл. почта', phone: 'Телефон', turnoverCol: 'Оборот (€)', actions: 'Действия',
    edit: 'Редактировать', delete: 'Удалить', noneFound: 'По заданным фильтрам контрагентов не найдено.', csvName: 'Название', address: 'Адрес', turnover: 'Оборот',
    code: 'Код', invoicesCount: 'Счетов: {count}', editTitle: 'Редактировать контрагента', newTitle: 'Новый контрагент', fullName: 'Название предприятия / Имя, фамилия *', namePlaceholder: 'UAB Клиент',
    vatPayer: 'Плательщик PVM', vatPayerCode: 'Код плательщика PVM', cancel: 'Отмена', saving: 'Сохранение...', save: 'Сохранить', create: 'Создать',
    errName: 'Введите название клиента / предприятия', errUpdate: 'Не удалось обновить клиента', errCreate: 'Не удалось создать клиента', errDelete: 'Не удалось удалить клиента', confirmDelete: 'Вы уверены, что хотите удалить клиента "{name}"?',
  },
  en: {
    title: 'Counterparties (customers and suppliers, CRM)', totalInSystem: 'Total in the system: {count} companies and individuals.', addNew: 'Add new counterparty',
    searchPlaceholder: 'Search by name, code, VAT, city...', city: 'City', allCities: 'All cities', vat: 'VAT', all: 'All', withVatCode: 'With VAT code only', withoutVatCode: 'Without VAT code',
    clearFilters: 'Clear filters', reset: 'Reset', tableView: 'Table view', cardView: 'Card view', found: 'Counterparties found: {shown} of {total}',
    nameCol: 'Name / Full name', companyCode: 'Company code', vatCode: 'VAT code', email: 'Email', phone: 'Phone', turnoverCol: 'Turnover (€)', actions: 'Actions',
    edit: 'Edit', delete: 'Delete', noneFound: 'No counterparties found for the selected filters.', csvName: 'Name', address: 'Address', turnover: 'Turnover',
    code: 'Code', invoicesCount: 'Invoices: {count}', editTitle: 'Edit counterparty', newTitle: 'New counterparty', fullName: 'Company name / First name, Last name *', namePlaceholder: 'Customer Ltd',
    vatPayer: 'VAT payer', vatPayerCode: 'VAT payer code', cancel: 'Cancel', saving: 'Saving...', save: 'Save', create: 'Create',
    errName: 'Enter the customer / company name', errUpdate: 'Failed to update the customer', errCreate: 'Failed to create the customer', errDelete: 'Failed to delete the customer', confirmDelete: 'Are you sure you want to delete customer "{name}"?',
  },
};
export default clients;
