import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';

export type ErrorLang = 'lt' | 'ru' | 'en';

export class HttpError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

const EXACT_ERRORS: Record<string, { ru: string; en: string }> = {
  'Reikia prisijungti': { ru: 'Требуется вход в систему', en: 'Sign-in required' },
  'Prieiga uždrausta': { ru: 'Доступ запрещён', en: 'Access denied' },
  'Prieinama tik administratoriui': { ru: 'Доступно только администратору', en: 'Available to administrators only' },
  'Netinkamas užklausos šaltinis': { ru: 'Недопустимый источник запроса', en: 'Invalid request origin' },
  'Aktyvi įmonė pasikeitė. Perkraukite puslapį.': { ru: 'Активная компания изменилась. Перезагрузите страницу.', en: 'Active company changed. Reload the page.' },
  'Laikotarpis uždarytas keitimams. Atidarykite jį įmonės apskaitos kontrolėje, jei taisymas tikrai būtinas.': { ru: 'Период закрыт для изменений. Откройте его в контроле учёта компании, если исправление действительно необходимо.', en: 'The period is closed to changes. Reopen it in company accounting controls if a correction is truly required.' },
  'Dokumentas su šia serija ir numeriu įmonėje jau egzistuoja.': { ru: 'Документ с этой серией и номером уже существует в компании.', en: 'A document with this series and number already exists in the company.' },
  'Dokumento suma negali būti mažesnė už jau susietus mokėjimus. Pirmiausia ištrinkite arba sumažinkite susiejimus banko skyriuje.': { ru: 'Сумма документа не может быть меньше уже привязанных платежей. Сначала удалите или уменьшите привязки в разделе банка.', en: 'The document total cannot be less than already linked payments. First delete or reduce the links in the bank section.' },
  'Dokumentas jau įtrauktas į atsargų apskaitą (pajamuotos arba nurašytos prekės). Jo keisti ar trinti negalima: išrašykite kreditinę sąskaitą arba atlikite atsargų koregavimą.': { ru: 'Документ уже проведён в учёте запасов (оприходованы или списаны товары). Изменять или удалять его нельзя: выпишите кредитовый счёт или выполните корректировку запасов.', en: 'The document is already posted to inventory (goods received or written off). It cannot be edited or deleted: issue a credit note or record an inventory adjustment.' },
  'Atsargų kortelė turi apskaitos judėjimų, todėl jos ištrinti negalima.': { ru: 'По карточке запасов есть учётные движения, поэтому удалить её нельзя.', en: 'The stock item has accounting movements and cannot be deleted.' },
  'Atsargų judėjimai nekeičiami: klaidą taisykite nauju koregavimu.': { ru: 'Движения запасов неизменяемы: исправьте ошибку новой корректировкой.', en: 'Inventory movements are immutable: fix errors with a new adjustment.' },
  'Neteisingas JSON': { ru: 'Некорректный JSON', en: 'Invalid JSON' },
  'Operacija pažeidžia duomenų vientisumą arba sukuria dublikatą': { ru: 'Операция нарушает целостность данных или создаёт дубликат', en: 'The operation violates data integrity or creates a duplicate' },
  'Vidinė serverio klaida': { ru: 'Внутренняя ошибка сервера', en: 'Internal server error' },
  'Neteisinga data': { ru: 'Некорректная дата', en: 'Invalid date' },
  'Tikimasi objekto': { ru: 'Ожидается объект', en: 'Object expected' },
  'Neteisingi duomenys': { ru: 'Некорректные данные', en: 'Invalid data' },
  'Neteisingas ID': { ru: 'Некорректный идентификатор', en: 'Invalid ID' },
  'Nežinomas veiksmas': { ru: 'Неизвестное действие', en: 'Unknown action' },
  'Kontrahentas nepriklauso dabartinei įmonei': { ru: 'Контрагент не принадлежит текущей компании', en: 'Counterparty does not belong to the current company' },
  'Klientas nerastas šioje įmonėje': { ru: 'Клиент не найден в этой компании', en: 'Customer not found in this company' },
  'Nurodykite dokumento numerį': { ru: 'Укажите номер документа', en: 'Specify the document number' },
  'Numeris ir data privalomi': { ru: 'Номер и дата обязательны', en: 'Number and date are required' },
  'Dokumentą turi sudaryti nuo 1 iki 1000 eilučių': { ru: 'Документ должен содержать от 1 до 1000 строк', en: 'A document must have between 1 and 1000 lines' },
  'Nurodykite eilutės pavadinimą': { ru: 'Укажите наименование строки', en: 'Specify the line item name' },
  'Neteisinga suma': { ru: 'Некорректная сумма', en: 'Invalid amount' },
  'Suma negali būti neigiama': { ru: 'Сумма не может быть отрицательной', en: 'Amount cannot be negative' },
  'Nežinoma apskaitos sąskaita': { ru: 'Неизвестный счёт учёта', en: 'Unknown chart of accounts code' },
  'Sąskaita nerasta sąskaitų plane': { ru: 'Счёт не найден в плане счетов', en: 'Account not found in the chart of accounts' },
  'Debetas ir kreditas turi skirtis': { ru: 'Дебет и кредит должны различаться', en: 'Debit and credit accounts must differ' },
  'Neteisingas laikotarpis': { ru: 'Некорректный период', en: 'Invalid period' },
  'Neteisingas laikotarpis (YYYY-MM)': { ru: 'Некорректный период (ГГГГ-ММ)', en: 'Invalid period (YYYY-MM)' },
  'Neteisingi metai arba mėnuo': { ru: 'Некорректный год или месяц', en: 'Invalid year or month' },
  'Nurodykite darbuotojus': { ru: 'Укажите сотрудников', en: 'Specify employees' },
  'Nurodykite darbuotojo vardą': { ru: 'Укажите имя сотрудника', en: 'Specify employee name' },
  'Nurodykite darbuotojo vardą ir pavardę': { ru: 'Укажите имя и фамилию сотрудника', en: 'Specify employee full name' },
  'Sukaupimai negali būti neigiami': { ru: 'Начисления не могут быть отрицательными', en: 'Accruals cannot be negative' },
  'Atlyginimas negali būti neigiamas': { ru: 'Зарплата не может быть отрицательной', en: 'Salary cannot be negative' },
  'Apskaičiuotas atlyginimas nesutampa su išmokama suma ir išskaitomis': { ru: 'Начисленная зарплата не совпадает с выплачиваемой суммой и удержаниями', en: 'Gross salary does not match net pay plus deductions' },
  'Išskaitos viršija priskaičiuotą darbo užmokestį': { ru: 'Удержания превышают начисленную зарплату', en: 'Deductions exceed gross pay' },
  'Taikant režimą be PVM arba SVS, pardavime mokestis neskaičiuojamas': { ru: 'В режиме без НДС или SVS налог при продаже не начисляется', en: 'Under non-VAT or SVS mode, VAT is not charged on sales' },
  'Be PVM ir taikant SVS įeinantis PVM neatskaitomas': { ru: 'В режиме без НДС и при SVS входящий НДС не вычитается', en: 'Input VAT is not deductible under non-VAT or SVS mode' },
  'Sąskaita nerasta': { ru: 'Счёт не найден', en: 'Invoice not found' },
  'Įrašas nerastas': { ru: 'Запись не найдена', en: 'Record not found' },
  'Įmonė nerasta': { ru: 'Компания не найдена', en: 'Company not found' },
  'Darbuotojas nerastas': { ru: 'Сотрудник не найден', en: 'Employee not found' },
  'DU skaičiavimas nerastas': { ru: 'Расчёт зарплаты не найден', en: 'Payroll run not found' },
  'Eilutė nerasta': { ru: 'Строка не найдена', en: 'Line not found' },
  'Ilgalaikis turtas nerastas': { ru: 'Основное средство не найдено', en: 'Fixed asset not found' },
  'Atsargų kortelė nerasta': { ru: 'Карточка запасов не найдена', en: 'Stock item not found' },
  'Naudotojas nerastas': { ru: 'Пользователь не найден', en: 'User not found' },
  'Šablonas nerastas': { ru: 'Шаблон не найден', en: 'Template not found' },
  'Archyvinė kopija nerasta': { ru: 'Архивная копия не найдена', en: 'Archived copy not found' },
  'Suma viršija dokumento likutį': { ru: 'Сумма превышает остаток по документу', en: 'Amount exceeds document balance' },
  'Suma viršija banko operacijos likutį': { ru: 'Сумма превышает остаток банковской операции', en: 'Amount exceeds bank transaction balance' },
  'Kreditinio dokumento apmokėti negalima': { ru: 'Кредитовый документ оплатить нельзя', en: 'A credit note cannot be paid' },
  'Gaunamąjį mokėjimą galima susieti tik su pardavimo sąskaita, išeinantįjį — su pirkimu': { ru: 'Входящий платёж можно связать только со счётом продажи, исходящий — с покупкой', en: 'Incoming payments can only be linked to sales invoices, outgoing to purchases' },
  'Banko operacija jau priskirta kitai paskirčiai': { ru: 'Банковская операция уже отнесена к другому назначению', en: 'Bank transaction is already classified for another purpose' },
  'Pagal dokumentą nėra likučio apmokėti': { ru: 'По документу нет остатка к оплате', en: 'Document has no outstanding balance to pay' },
  'Šio mėnesio DU skaičiavimas jau yra': { ru: 'Расчёт зарплаты за этот месяц уже существует', en: 'A payroll run for this month already exists' },
  'Skaičiavimas jau užregistruotas apskaitoje; pirmiausia atšaukite registravimą': { ru: 'Расчёт уже проведён в учёте; сначала отмените проведение', en: 'Payroll run is already posted; unpost it first' },
  'Skaičiavimas neužregistruotas': { ru: 'Расчёт не проведён в учёте', en: 'Payroll run is not posted' },
  'Pirmiau atšaukite vėlesnių mėnesių skaičiavimus.': { ru: 'Сначала отмените расчёты более поздних месяцев.', en: 'Unpost later months first.' },
  'Nurodykite rankinio pakeitimo priežastį': { ru: 'Укажите причину ручного изменения', en: 'Specify the reason for the manual override' },
  'Nustatykite SMTP pardavėjo įmonės kortelėje.': { ru: 'Настройте SMTP в карточке компании продавца.', en: 'Configure SMTP in the seller company card.' },
  'Failas per didelis': { ru: 'Файл слишком большой', en: 'File is too large' },
};

const PATTERN_ERRORS: { re: RegExp; ru: (...m: string[]) => string; en: (...m: string[]) => string }[] = [
  {
    re: /^Nepakanka atsargų: „(.+)“ likutis (.+), reikia (.+)$/,
    ru: (_, item, bal, req) => `Недостаточно запасов: остаток «${item}» ${bal}, требуется ${req}`,
    en: (_, item, bal, req) => `Insufficient stock: "${item}" balance is ${bal}, required ${req}`,
  },
  {
    re: /^Slaptažodį turi sudaryti bent (\d+) simbolių$/,
    ru: (_, n) => `Пароль должен содержать не менее ${n} символов`,
    en: (_, n) => `Password must be at least ${n} characters long`,
  },
  {
    re: /^Priminimas dėl šios sąskaitos jau buvo siųstas prieš mažiau nei (\d+) d\.$/,
    ru: (_, n) => `Напоминание по этому счёту уже отправлялось менее ${n} дн. назад.`,
    en: (_, n) => `A reminder for this invoice was already sent less than ${n} days ago.`,
  },
  {
    re: /^Sąskaita (\S+) nerasta sąskaitų plane$/,
    ru: (_, c) => `Счёт ${c} не найден в плане счетов`,
    en: (_, c) => `Account ${c} not found in the chart of accounts`,
  },
  {
    re: /^Kodas (\S+) netaikomas (pardavimams|pirkimams)$/,
    ru: (_, c, k) => `Код ${c} не применяется к ${k === 'pardavimams' ? 'продажам' : 'покупкам'}`,
    en: (_, c, k) => `Code ${c} does not apply to ${k === 'pardavimams' ? 'sales' : 'purchases'}`,
  },
];

export function translateServerError(message: string, lang: ErrorLang = 'lt'): string {
  if (lang === 'lt' || !message) return message;
  const exact = EXACT_ERRORS[message];
  if (exact) return exact[lang];
  for (const p of PATTERN_ERRORS) {
    const m = p.re.exec(message);
    if (m) return p[lang](...m);
  }
  return message;
}

export async function currentErrorLang(): Promise<ErrorLang> {
  try {
    const c = (await cookies()).get('lang')?.value;
    if (c === 'ru' || c === 'en') return c;
  } catch { /* outside request context */ }
  return 'lt';
}

// The form was opened for another company than the one active now (company switched in another tab).
export function assertFormCompany(formCompanyId: unknown, activeCompanyId: number) {
  if (formCompanyId !== undefined && formCompanyId !== null && Number(formCompanyId) !== activeCompanyId) throw new HttpError(409, 'Aktyvi įmonė pasikeitė. Perkraukite puslapį.');
}

function resolveRawError(error: unknown): { msg: string; status: number } {
  if (error instanceof Error && error.message === 'ACCOUNTING_PERIOD_LOCKED') return { msg: 'Laikotarpis uždarytas keitimams. Atidarykite jį įmonės apskaitos kontrolėje, jei taisymas tikrai būtinas.', status: 409 };
  if (error instanceof Error && error.message === 'DUPLICATE_DOCUMENT_NUMBER') return { msg: 'Dokumentas su šia serija ir numeriu įmonėje jau egzistuoja.', status: 409 };
  if (error instanceof Error && error.message === 'Allocated payments exceed document total') return { msg: 'Dokumento suma negali būti mažesnė už jau susietus mokėjimus. Pirmiausia ištrinkite arba sumažinkite susiejimus banko skyriuje.', status: 409 };
  if (error instanceof Error && error.message === 'INVENTORY_DOCUMENT_POSTED') return { msg: 'Dokumentas jau įtrauktas į atsargų apskaitą (pajamuotos arba nurašytos prekės). Jo keisti ar trinti negalima: išrašykite kreditinę sąskaitą arba atlikite atsargų koregavimą.', status: 409 };
  if (error instanceof Error && error.message === 'INVENTORY_ITEM_HAS_MOVEMENTS') return { msg: 'Atsargų kortelė turi apskaitos judėjimų, todėl jos ištrinti negalima.', status: 409 };
  if (error instanceof Error && error.message === 'INVENTORY_MOVEMENT_IMMUTABLE') return { msg: 'Atsargų judėjimai nekeičiami: klaidą taisykite nauju koregavimu.', status: 409 };
  if (error instanceof HttpError) return { msg: error.message, status: error.status };
  if (error instanceof SyntaxError) return { msg: 'Neteisingas JSON', status: 400 };
  const code = (error as { code?: string })?.code || '';
  if (code.startsWith('SQLITE_CONSTRAINT')) return { msg: 'Operacija pažeidžia duomenų vientisumą arba sukuria dublikatą', status: 409 };
  console.error('API operation failed', error);
  return { msg: 'Vidinė serverio klaida', status: 500 };
}

export async function apiError(error: unknown) {
  const { msg, status } = resolveRawError(error);
  const lang = await currentErrorLang();
  return NextResponse.json({ error: translateServerError(msg, lang) }, { status });
}
