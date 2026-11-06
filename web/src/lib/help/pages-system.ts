import type { HelpPage } from './types';

export const systemPages: HelpPage[] = [
  {
    slug: 'companies',
    group: 'system',
    appHref: '/companies',
    sources: ['lt-vat-law', 'lt-financial-accounting-law', 'eu-gdpr'],
    text: {
      lt: {
        title: 'Įmonės ir kelių įmonių apskaita',
        summary: 'Įmonių kūrimas, rekvizitai, PVM režimas, SMTP, perjungimas, importas ir trynimas.',
        purpose: ['Vienoje programoje galima tvarkyti kelias įmones. Kiekvienos įmonės dokumentai, kontrahentai, bankas, nustatymai ir SMTP yra atskiri; aktyvi įmonė pasirenkama šoniniame meniu.'],
        steps: [
          'Atidarykite „Įmonių valdymas“ ir sukurkite naują įmonę (pavadinimas privalomas).',
          'Redaguokite rekvizitus: kodas, PVM kodas, adresas, el. paštas, telefonas, banko pavadinimas, IBAN, SWIFT/BIC.',
          'Nustatykite PVM režimą (PVM mokėtojas / ne mokėtojas / SVS) ir jo galiojimo datą.',
          'Nustatykite SMTP (mygtukas kortelėje), jei siųsite sąskaitas.',
          'Laikotarpio uždarymą ir audito žurnalą rasite kortelės apskaitos kontrolės lange.',
          'Perjunkite aktyvią įmonę mygtuku kortelėje arba šoniniame meniu.',
          'Duomenis iš JSON atsarginės kopijos galite importuoti į pasirinktą įmonę.',
        ],
        rules: [
          'Visi ekranai ir API dirba tik su aktyvios įmonės duomenimis.',
          'Vienintelės įmonės ištrinti negalima.',
          'Trinant įmonę pirmiausia pašalinami jos mokėjimai, periodiniai šablonai ir KS; nekeičiamos įrodymų lentelės (sąskaitų archyvas, tiekėjų XML, priminimų žurnalas) sąmoningai išlaikomos.',
          'Iš JSON importuoti pardavimai išlaiko šaltinio sistemos apmokėjimo būseną ir laikomi istorija.',
          'Įmonės rekvizitai PDF imami tuo metu galiojantys; išsiųstose kopijose išlieka siuntimo metu buvę rekvizitai.',
        ],
        mistakes: [
          'Įmonė ištrinama tikintis, kad liks jos dokumentai – jie pašalinami. Prieš trynimą padarykite atsarginę kopiją.',
          'Importuojama į ne tą įmonę.',
        ],
      },
      ru: {
        title: 'Компании и учёт нескольких компаний',
        summary: 'Создание компаний, реквизиты, режим PVM, SMTP, переключение, импорт и удаление.',
        purpose: ['В одной программе можно вести несколько компаний. Документы, контрагенты, банк, настройки и SMTP каждой компании раздельны; активная компания выбирается в боковом меню.'],
        steps: [
          'Откройте «Управление компаниями» и создайте новую компанию (название обязательно).',
          'Отредактируйте реквизиты: код, PVM-код, адрес, e-mail, телефон, название банка, IBAN, SWIFT/BIC.',
          'Задайте режим PVM (плательщик / неплательщик / SVS) и дату начала его действия.',
          'Настройте SMTP (кнопка в карточке), если будете отправлять счета.',
          'Закрытие периода и журнал аудита находятся в окне учётного контроля карточки.',
          'Переключите активную компанию кнопкой в карточке или в боковом меню.',
          'Данные из резервной копии JSON можно импортировать в выбранную компанию.',
        ],
        rules: [
          'Все экраны и API работают только с данными активной компании.',
          'Единственную компанию удалить нельзя.',
          'При удалении компании сначала удаляются её оплаты, периодические шаблоны и KS; неизменяемые таблицы-доказательства (архив счетов, XML поставщиков, журнал напоминаний) намеренно сохраняются.',
          'Продажи, импортированные из JSON, сохраняют статус оплаты исходной системы и считаются историей.',
          'Реквизиты компании в PDF берутся действующие на момент формирования; в отправленных копиях сохраняются реквизиты на момент отправки.',
        ],
        mistakes: [
          'Удаление компании в расчёте, что её документы останутся — они удаляются. Перед удалением сделайте резервную копию.',
          'Импорт не в ту компанию.',
        ],
      },
      en: {
        title: 'Companies and multi-company accounting',
        summary: 'Creating companies, details, VAT mode, SMTP, switching, import and deletion.',
        purpose: ['One installation can keep several companies. Each company\'s documents, counterparties, bank, settings and SMTP are separate; the active company is chosen in the sidebar.'],
        steps: [
          'Open "Company management" and create a new company (name is required).',
          'Edit the details: code, VAT code, address, e-mail, phone, bank name, IBAN, SWIFT/BIC.',
          'Set the VAT mode (VAT payer / non-payer / SVS) and its effective date.',
          'Configure SMTP (button on the card) if you will e-mail invoices.',
          'Period locking and the audit log are in the accounting control window of the card.',
          'Switch the active company with the button on the card or in the sidebar.',
          'Data from a JSON backup can be imported into a chosen company.',
        ],
        rules: [
          'All screens and APIs work only with the active company\'s data.',
          'The only company cannot be deleted.',
          'Deleting a company first removes its payments, recurring templates and credit notes; the append-only evidence tables (invoice archive, supplier XML, reminder log) are intentionally kept.',
          'Sales imported from JSON keep the paid status of the source system and are treated as history.',
          'Company details on a PDF are the current ones; sent copies keep the details valid when they were sent.',
        ],
        mistakes: [
          'Deleting a company expecting its documents to remain: they are removed. Make a backup first.',
          'Importing into the wrong company.',
        ],
      },
    },
  },
  {
    slug: 'period-closing',
    group: 'system',
    appHref: '/companies',
    sources: ['lt-financial-accounting-law', 'lt-tax-administration-law'],
    text: {
      lt: {
        title: 'Uždaryti laikotarpiai ir audito kontrolė',
        summary: 'Laikotarpio užrakinimas, pakeitimų žurnalas ir dokumentų numerių unikalumas.',
        purpose: ['Apskaitos kontrolė apsaugo jau deklaruotus ar patikrintus laikotarpius nuo pakeitimų ir registruoja kiekvieną dokumentų pakeitimą.'],
        steps: [
          'Įmonių valdyme atidarykite įmonės apskaitos kontrolės langą.',
          'Nurodykite datą „uždaryta iki“ ir pakeitimo priežastį, išsaugokite.',
          'Norėdami atidaryti laikotarpį, pakeiskite datą (tuščia data atidaro visus laikotarpius) ir nurodykite priežastį.',
          'Peržiūrėkite pakeitimų įvykius tame pačiame lange.',
        ],
        rules: [
          'Pardavimai, pirkimai, jų eilutės, banko operacijos, didžiosios knygos įrašai ir DU žiniaraščiai iki nurodytos datos imtinai negali būti pridėti, pakeisti ar ištrinti (duomenų bazės lygmeniu, ir importams).',
          'Kiekvienas šių įrašų sukūrimas, pakeitimas ar trynimas įrašomas į audito žurnalą su reikšmėmis prieš ir po.',
          'Naujas dublikatas (ta pati serija ir numeris; pirkimams – ir tas pats tiekėjas) atmetamas; esami seni dublikatai lieka matomi.',
          'Sąskaitų archyvas, tiekėjų XML ir priminimų žurnalas yra tik papildomi – jų įrašų keisti ar trinti negalima.',
        ],
        mistakes: [
          'Laikotarpis neuždaromas po deklaracijų pateikimo – vėlesni pakeitimai gali neatitikti pateiktų duomenų.',
          'Laikotarpis atidaromas be priežasties ir paliekamas atidarytas.',
        ],
      },
      ru: {
        title: 'Закрытые периоды и контроль аудита',
        summary: 'Блокировка периода, журнал изменений и уникальность номеров документов.',
        purpose: ['Учётный контроль защищает уже задекларированные или проверенные периоды от изменений и регистрирует каждое изменение документов.'],
        steps: [
          'В управлении компаниями откройте окно учётного контроля компании.',
          'Укажите дату «закрыто по» и причину изменения, сохраните.',
          'Чтобы открыть период, измените дату (пустая дата открывает все периоды) и укажите причину.',
          'Просматривайте события изменений в том же окне.',
        ],
        rules: [
          'Продажи, покупки, их строки, банковские операции, проводки главной книги и ведомости зарплаты по указанную дату включительно нельзя добавить, изменить или удалить (на уровне базы данных, в том числе при импорте).',
          'Каждое создание, изменение или удаление этих записей заносится в журнал аудита со значениями до и после.',
          'Новый дубликат (та же серия и номер; для покупок — и тот же поставщик) отклоняется; существующие старые дубликаты остаются видимыми.',
          'Архив счетов, XML поставщиков и журнал напоминаний только дополняются — их записи нельзя изменить или удалить.',
        ],
        mistakes: [
          'Период не закрыт после подачи деклараций — последующие изменения могут не совпасть с поданными данными.',
          'Период открыт без причины и оставлен открытым.',
        ],
      },
      en: {
        title: 'Locked periods and audit controls',
        summary: 'Locking a period, the change log and unique document numbers.',
        purpose: ['Accounting controls protect periods that were declared or reviewed from changes and record every change to documents.'],
        steps: [
          'In company management open the company\'s accounting control window.',
          'Enter the "locked through" date and the reason for the change, and save.',
          'To reopen, change the date (an empty date opens all periods) and give a reason.',
          'Review change events in the same window.',
        ],
        rules: [
          'Sales, purchases, their lines, bank transactions, ledger entries and payroll sheets dated up to and including the date cannot be added, changed or deleted (enforced in the database, imports included).',
          'Every insert, update or delete of these records is written to the audit log with before and after values.',
          'A new duplicate (same series and number; for purchases also the same supplier) is rejected; existing historical duplicates stay visible.',
          'The invoice archive, supplier XML and reminder log are append-only: their rows cannot be changed or deleted.',
        ],
        mistakes: [
          'Not locking the period after filing: later changes may no longer match the filed data.',
          'Reopening a period without a reason and leaving it open.',
        ],
      },
    },
  },
  {
    slug: 'backups',
    group: 'system',
    sources: ['lt-financial-accounting-law', 'eu-gdpr'],
    text: {
      lt: {
        title: 'Atsarginės kopijos',
        summary: 'Nuoseklios SQLite duomenų bazės kopijos ir šifravimo rakto saugojimas.',
        purpose: ['Visi duomenys saugomi vienoje SQLite duomenų bazėje serveryje. Atsarginės kopijos daromos serverio administratoriaus įrankiu, ne iš naršyklės.'],
        steps: [
          'Administratorius gali atsisiųsti nuoseklią visos duomenų bazės kopiją adresu /api/admin/backup (mygtukas „Atsisiųsti visos duomenų bazės kopiją“ puslapyje „Įmonių valdymas“). Kopiją galima daryti ir komanda: docker exec kontas-app node -e "const D=require(\'better-sqlite3\');new D(\'/app/prisma/dev.db\',{readonly:true}).backup(\'/tmp/b.db\').then(()=>console.log(\'ok\'))" && docker cp kontas-app:/tmp/b.db ./kopija.db',
          'Nekopijuokite veikiančios duomenų bazės failo paprastu failų kopijavimu: naudokite aukščiau pateiktą kopijavimo būdą arba prieš kopijuodami sustabdykite programą.',
          'Kopija sukuriama aplanke backups/database ir patikrinama PRAGMA integrity_check.',
          'Prieš duomenų migracijas ar masinius taisymus visada padarykite kopiją.',
          'Reguliariai išbandykite atkūrimą iš kopijos.',
        ],
        rules: [
          'Kopija daroma SQLite backup mechanizmu iš veikiančios bazės tik skaitymo režimu, todėl ji nuosekli.',
          'Neatidarykite veikiančios bazės vienu metu iš Windows ir Linux; prieš taisant duomenis iš serverio pusės sustabdykite programą.',
          'SMTP slaptažodžių šifravimo raktas (SMTP_ENCRYPTION_KEY) ir .env failas į kopiją neįeina ir neturi patekti į Git; saugokite juos atskirai ir saugiai.',
          'Kopijoje yra asmens duomenų – saugokite ją pagal BDAR reikalavimus.',
        ],
        mistakes: [
          'Kopijuojamas veikiančios bazės failas tiesiogiai (be backup mechanizmo) – kopija gali būti nenuosekli.',
          'Prarandamas šifravimo raktas – tada išsaugotų SMTP slaptažodžių nebeįmanoma perskaityti, juos tektų įvesti iš naujo.',
        ],
      },
      ru: {
        title: 'Резервные копии',
        summary: 'Согласованные копии базы SQLite и хранение ключа шифрования.',
        purpose: ['Все данные хранятся в одной базе SQLite на сервере. Резервные копии делает администратор сервера инструментом, а не из браузера.'],
        steps: [
          'Администратор может скачать согласованную копию всей базы по адресу /api/admin/backup (кнопка «Скачать копию всей базы» на странице «Управление компаниями»). Копию можно сделать и командой: docker exec kontas-app node -e "const D=require(\'better-sqlite3\');new D(\'/app/prisma/dev.db\',{readonly:true}).backup(\'/tmp/b.db\').then(()=>console.log(\'ok\'))" && docker cp kontas-app:/tmp/b.db ./kopija.db',
          'Не копируйте файл работающей базы обычным копированием файлов: используйте способ выше или остановите программу перед копированием.',
          'Копия создаётся в папке backups/database и проверяется PRAGMA integrity_check.',
          'Перед миграциями данных или массовыми исправлениями всегда делайте копию.',
          'Регулярно проверяйте восстановление из копии.',
        ],
        rules: [
          'Копия делается механизмом backup SQLite из работающей базы в режиме только чтения, поэтому она согласованна.',
          'Не открывайте рабочую базу одновременно из Windows и Linux; перед исправлением данных со стороны хоста остановите приложение.',
          'Ключ шифрования SMTP-паролей (SMTP_ENCRYPTION_KEY) и файл .env в копию не входят и не должны попадать в Git; храните их отдельно и надёжно.',
          'Копия содержит персональные данные — храните её по требованиям GDPR.',
        ],
        mistakes: [
          'Прямое копирование файла работающей базы (без механизма backup) — копия может быть несогласованной.',
          'Потеря ключа шифрования — сохранённые SMTP-пароли станет невозможно прочитать, их придётся ввести заново.',
        ],
      },
      en: {
        title: 'Backups',
        summary: 'Consistent SQLite database backups and keeping the encryption key.',
        purpose: ['All data is stored in one SQLite database on the server. Backups are made by the server administrator with a tool, not from the browser.'],
        steps: [
          'An administrator can download a consistent copy of the whole database at /api/admin/backup (the "Download a copy of the whole database" button on the Company management page). You can also make a copy with the command: docker exec kontas-app node -e "const D=require(\'better-sqlite3\');new D(\'/app/prisma/dev.db\',{readonly:true}).backup(\'/tmp/b.db\').then(()=>console.log(\'ok\'))" && docker cp kontas-app:/tmp/b.db ./kopija.db',
          'Do not copy the file of a running database with a plain file copy: use the method above or stop the program before copying.',
          'The copy is created in backups/database and checked with PRAGMA integrity_check.',
          'Always make a backup before data migrations or bulk repairs.',
          'Test restoring from a backup regularly.',
        ],
        rules: [
          'The copy uses the SQLite backup mechanism on the running database in read-only mode, so it is consistent.',
          'Never open the live database from Windows and Linux at the same time; stop the application before host-side data repairs.',
          'The SMTP password encryption key (SMTP_ENCRYPTION_KEY) and the .env file are not part of the backup and must stay out of Git; keep them separately and securely.',
          'The backup contains personal data: keep it in line with the GDPR.',
        ],
        mistakes: [
          'Copying the live database file directly (without the backup mechanism): the copy may be inconsistent.',
          'Losing the encryption key: saved SMTP passwords can then no longer be read and must be entered again.',
        ],
      },
    },
  },
  {
    slug: 'api-settings',
    group: 'system',
    related: ['tax-calendar', 'document-recognition'],
    sources: ['vmi-eds'],
    text: {
      lt: {
        title: 'API nustatymai',
        summary: 'Prisijungimai prie dokumentų atpažinimo, VMI EDS, Sodros EDAS ir programos adresas.',
        purpose: [
          'Skiltyje Nustatymai → API vienoje vietoje laikomi prisijungimai prie išorinių sistemų aktyviai įmonei: dokumentų atpažinimo raktas, VMI EDS ir Sodros EDAS duomenų perdavimo vartotojai. Registrų centras ir bankų API kol kas tik aprašyti.',
          'Slaptažodžiai ir raktai saugomi užšifruoti, po išsaugojimo niekada nerodomi ir į įmonės eksporto paketą neįtraukiami.',
        ],
        steps: [
          'Atidarykite Nustatymai → API.',
          'Dokumentų atpažinimas: įveskite raktą, pasirinkite modelį ir, jei reikia, mėnesio limitą.',
          'VMI EDS: įmonės atstovas EDS sistemoje sukuria duomenų perdavimo vartotoją; jo vardą ir slaptažodį įveskite čia ir pasirinkite aplinką (bandomoji ar gamybinė).',
          'Sodra EDAS: EDAS portale sugeneruokite API vartotoją ir slaptažodį ir įveskite čia.',
          'Programos adresas: nurodykite viešą programos adresą (pvz., https://apskaita.example.lt); jis naudojamas nuorodoms priminimų laiškuose.',
        ],
        rules: [
          'Duomenų siuntimas į VMI ir Sodrą dar neprijungtas: išsaugoti duomenys keičia tik būseną „Duomenys įvesti“. Deklaracijas kol kas pateikite rankiniu būdu.',
          'Registrų centras metinių finansinių ataskaitų teikimui programinės sąsajos nesuteikia; ataskaitą reikia įkelti rankiniu būdu.',
          'Programos adresą keičia tik administratorius; jei jis nenurodytas, naudojamas aplinkos kintamasis APP_BASE_URL.',
        ],
        mistakes: [
          'Tikėtis, kad įvedus VMI ar Sodros duomenis deklaracijos bus siunčiamos automatiškai.',
          'Pamiršti nurodyti programos adresą, todėl priminimų laiškuose nuorodos be adreso neveikia.',
        ],
      },
      ru: {
        title: 'Настройки API',
        summary: 'Подключения к распознаванию документов, VMI EDS, Sodra EDAS и адрес программы.',
        purpose: [
          'В разделе Настройки → API в одном месте хранятся подключения к внешним системам для активной компании: ключ распознавания документов, пользователи передачи данных VMI EDS и Sodra EDAS. Центр регистров и API банков пока только описаны.',
          'Пароли и ключи хранятся в зашифрованном виде, после сохранения не показываются и в пакет экспорта компании не включаются.',
        ],
        steps: [
          'Откройте Настройки → API.',
          'Распознавание документов: введите ключ, выберите модель и при необходимости месячный лимит.',
          'VMI EDS: представитель компании создаёт в системе EDS пользователя передачи данных; введите здесь его имя и пароль и выберите среду (тестовая или рабочая).',
          'Sodra EDAS: сгенерируйте в портале EDAS пользователя и пароль API и введите их здесь.',
          'Адрес программы: укажите публичный адрес программы (например, https://apskaita.example.lt); он используется для ссылок в письмах-напоминаниях.',
        ],
        rules: [
          'Отправка данных в VMI и Sodra пока не подключена: сохранённые данные меняют только состояние на «Данные введены». Декларации пока подавайте вручную.',
          'Центр регистров не предоставляет программного интерфейса для подачи годовой отчётности; отчёт нужно загрузить вручную.',
          'Адрес программы меняет только администратор; если он не указан, используется переменная окружения APP_BASE_URL.',
        ],
        mistakes: [
          'Ожидать, что после ввода данных VMI или Sodra декларации будут отправляться автоматически.',
          'Не указать адрес программы, из-за чего ссылки в письмах-напоминаниях остаются без адреса.',
        ],
      },
      en: {
        title: 'API settings',
        summary: 'Connections for document recognition, VMI EDS, Sodra EDAS and the application address.',
        purpose: [
          'Settings → API keeps the connections to external systems for the active company in one place: the document recognition key and the data-transfer users of VMI EDS and Sodra EDAS. The Centre of Registers and bank APIs are only described for now.',
          'Passwords and keys are stored encrypted, are never shown after saving and are not part of the company export package.',
        ],
        steps: [
          'Open Settings → API.',
          'Document recognition: enter the key, choose the model and, if needed, a monthly limit.',
          'VMI EDS: the company representative creates a data-transfer user in EDS; enter its name and password here and choose the environment (test or production).',
          'Sodra EDAS: generate an API user and password in the EDAS portal and enter them here.',
          'Application address: enter the public address of the application (for example https://apskaita.example.lt); it is used for links in reminder e-mails.',
        ],
        rules: [
          'Sending data to VMI and Sodra is not connected yet: the saved data only changes the status to "Configured". File declarations by hand for now.',
          'The Centre of Registers offers no programming interface for annual financial statements; the report has to be uploaded by hand.',
          'Only an administrator can change the application address; if it is empty, the APP_BASE_URL environment variable is used.',
        ],
        mistakes: [
          'Expecting declarations to be sent automatically once the VMI or Sodra data is entered.',
          'Leaving the application address empty, so links in reminder e-mails have no address.',
        ],
      },
    },
  },
];
