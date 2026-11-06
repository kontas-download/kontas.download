import type { Namespace } from './types';

// Settings -> API: access to external systems. [key, lt, ru, en]
const rows: [string, string, string, string][] = [
  ['title', 'API prieigos', 'API-доступы', 'API access'],
  ['subtitle', 'Prisijungimai prie išorinių sistemų: dokumentų atpažinimas, valstybės sistemos ir programos adresas. Slaptažodžiai saugomi užšifruoti ir niekada nerodomi.', 'Подключения к внешним системам: распознавание документов, государственные системы и адрес программы. Пароли хранятся в зашифрованном виде и никогда не показываются.', 'Connections to external systems: document recognition, state systems and the application address. Passwords are stored encrypted and never shown.'],
  ['company', 'Įmonė: {name}. Prisijungimai priklauso aktyviai įmonei.', 'Компания: {name}. Подключения относятся к активной компании.', 'Company: {name}. The connections belong to the active company.'],
  ['recognitionTitle', 'dokumentų atpažinimas', 'распознавание документов', 'document recognition'],
  ['recognitionMoved', 'Dokumentų atpažinimo raktas — Nustatymai → API', 'Ключ распознавания документов — Настройки → API', 'Document recognition key — Settings → API'],
  ['vmiTitle', 'VMI EDS', 'VMI EDS', 'VMI EDS'],
  ['vmiIntro', 'Deklaracijų siuntimas į VMI per EDS žiniatinklio paslaugą. Duomenų perdavimo vartotojo vardą ir slaptažodį sukuria įmonės atstovas pačioje EDS sistemoje. Siuntimas dar neprijungtas: dabar failą reikia pateikti EDS rankiniu būdu.', 'Отправка деклараций в VMI через веб-службу EDS. Имя пользователя и пароль для передачи данных создаёт представитель компании в самой системе EDS. Отправка пока не подключена: сейчас файл нужно подать в EDS вручную.', 'Sending declarations to VMI through the EDS web service. The data-transfer user name and password are created by the company representative in EDS itself. Sending is not connected yet: for now the file has to be filed in EDS by hand.'],
  ['vmiUsername', 'Duomenų perdavimo vartotojo vardas', 'Имя пользователя для передачи данных', 'Data-transfer user name'],
  ['sodraTitle', 'Sodra EDAS', 'Sodra EDAS', 'Sodra EDAS'],
  ['sodraIntro', 'Ataskaitų siuntimas į Sodrą per EDAS duomenų perdavimo sąsają. API vartotojo vardą ir slaptažodį sugeneruojate EDAS portale. Siuntimas dar neprijungtas: dabar failą reikia pateikti EDAS rankiniu būdu.', 'Отправка отчётов в Sodra через интерфейс передачи данных EDAS. Имя пользователя и пароль API генерируются в портале EDAS. Отправка пока не подключена: сейчас файл нужно подать в EDAS вручную.', 'Sending reports to Sodra through the EDAS data-transfer interface. The API user name and password are generated in the EDAS portal. Sending is not connected yet: for now the file has to be filed in EDAS by hand.'],
  ['sodraUsername', 'API vartotojo vardas', 'Имя пользователя API', 'API user name'],
  ['rcTitle', 'Registrų centras', 'Центр регистров', 'Centre of Registers'],
  ['unavailable', 'Prijungimas dar negalimas', 'Подключение пока невозможно', 'Connecting is not possible yet'],
  ['rcBody', 'Registrų centras metinių finansinių ataskaitų teikimui programinės sąsajos nesuteikia, todėl ataskaitą reikia įkelti rankiniu būdu Registrų centro e. paslaugose.', 'Центр регистров не предоставляет программного интерфейса для подачи годовой финансовой отчётности, поэтому отчёт нужно загрузить вручную в электронных услугах Центра регистров.', 'The Centre of Registers offers no programming interface for annual financial statements, so the report has to be uploaded by hand in the Centre of Registers e-services.'],
  ['bankTitle', 'Bankų API', 'API банков', 'Bank APIs'],
  ['bankBody', 'Ateityje čia bus galima prijungti banką, kad išrašai būtų gaunami automatiškai. Kol kas išrašus įkelkite skiltyje „Bankas ir išrašai“.', 'В будущем здесь можно будет подключить банк, чтобы выписки поступали автоматически. Пока загружайте выписки в разделе «Банк и выписки».', 'In the future a bank can be connected here so that statements arrive automatically. For now upload statements in the "Bank and statements" section.'],
  ['password', 'Slaptažodis', 'Пароль', 'Password'],
  ['secretStored', 'Slaptažodis išsaugotas', 'Пароль сохранён', 'Password stored'],
  ['secretKept', 'Išsaugotas; palikite tuščią, jei nekeičiate', 'Сохранён; оставьте пустым, если не меняете', 'Stored; leave empty to keep it'],
  ['environment', 'Aplinka', 'Среда', 'Environment'],
  ['envTest', 'Bandomoji', 'Тестовая', 'Test'],
  ['envProduction', 'Gamybinė', 'Рабочая', 'Production'],
  ['status', 'Būsena', 'Состояние', 'Status'],
  ['statusNOT_CONNECTED', 'Neprijungta', 'Не подключено', 'Not connected'],
  ['statusCONFIGURED', 'Duomenys įvesti', 'Данные введены', 'Configured'],
  ['statusCONNECTED', 'Prijungta', 'Подключено', 'Connected'],
  ['save', 'Išsaugoti', 'Сохранить', 'Save'],
  ['saving', 'Saugoma…', 'Сохранение…', 'Saving…'],
  ['saved', 'Išsaugota', 'Сохранено', 'Saved'],
  ['remove', 'Pašalinti prieigą', 'Удалить доступ', 'Remove access'],
  ['removed', 'Prieiga pašalinta', 'Доступ удалён', 'Access removed'],
  ['lastChecked', 'Paskutinis patikrinimas: {at}', 'Последняя проверка: {at}', 'Last checked: {at}'],
  ['lastError', 'Paskutinė klaida: {error}', 'Последняя ошибка: {error}', 'Last error: {error}'],
  ['baseTitle', 'Programos adresas', 'Адрес программы', 'Application address'],
  ['baseIntro', 'Viešas šios programos adresas (pvz., https://apskaita.example.lt). Jis naudojamas nuorodoms priminimų laiškuose. Jei nenurodytas, naudojamas aplinkos kintamasis APP_BASE_URL.', 'Публичный адрес этой программы (например, https://apskaita.example.lt). Используется для ссылок в письмах-напоминаниях. Если не указан, берётся переменная окружения APP_BASE_URL.', 'The public address of this application (for example https://apskaita.example.lt). It is used for links in reminder e-mails. If empty, the APP_BASE_URL environment variable is used.'],
  ['baseLabel', 'Adresas', 'Адрес', 'Address'],
  ['baseEffective', 'Šiuo metu naudojamas: {url}', 'Сейчас используется: {url}', 'Currently used: {url}'],
  ['baseNone', 'nenurodytas', 'не указан', 'not set'],
  ['baseAdminOnly', 'Adresą gali keisti tik administratorius.', 'Адрес может менять только администратор.', 'Only an administrator can change the address.'],
  ['openApi', 'API prieigos (Nustatymai → API)', 'API-доступы (Настройки → API)', 'API access (Settings → API)'],
];

const build = (i: number) => Object.fromEntries(rows.map(r => [r[0], r[i]]));
const api: Namespace = { lt: build(1), ru: build(2), en: build(3) };
export default api;
