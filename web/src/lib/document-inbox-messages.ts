// Russian and English texts of the server messages of the document mailbox (the Lithuanian text is the source).
// Merged into the general server error translation (lib/errors.ts).
type Ru = (...m: string[]) => string;
const EXACT: [string, string, string][] = [
  ['Neteisingas leidžiamų siuntėjų sąrašas', 'Некорректный список разрешённых отправителей', 'Invalid list of allowed senders'],
  ['Per daug leidžiamų siuntėjų (daugiausia 200)', 'Слишком много разрешённых отправителей (максимум 200)', 'Too many allowed senders (200 at most)'],
  ['Nurodykite, ar dėžutė įjungta', 'Укажите, включён ли ящик', 'State whether the mailbox is enabled'],
  ['Neteisingas pašto serveris', 'Некорректный почтовый сервер', 'Invalid mail server'],
  ['Neteisingas prievadas', 'Некорректный порт', 'Invalid port'],
  ['Nurodykite, ar naudojamas SSL/TLS', 'Укажите, используется ли SSL/TLS', 'State whether SSL/TLS is used'],
  ['Neteisingas naudotojo vardas', 'Некорректное имя пользователя', 'Invalid username'],
  ['Neteisingas slaptažodis', 'Некорректный пароль', 'Invalid password'],
  ['Norėdami įjungti dėžutę, nurodykite naudotojo vardą ir slaptažodį.', 'Чтобы включить ящик, укажите имя пользователя и пароль.', 'To enable the mailbox, enter the username and password.'],
  ['Keičiant naudotojo vardą įveskite naują slaptažodį.', 'При смене имени пользователя введите новый пароль.', 'When changing the username, enter a new password.'],
  ['Nurodykite naudotojo vardą', 'Укажите имя пользователя', 'Enter the username'],
  ['Pirmiausia įveskite slaptažodį.', 'Сначала введите пароль.', 'Enter the password first.'],
  ['Nepavyko nuskaityti išsaugoto slaptažodžio. Patikrinkite šifravimo raktą.', 'Не удалось прочитать сохранённый пароль. Проверьте ключ шифрования.', 'The stored password could not be read. Check the encryption key.'],
  ['Nepavyko prisijungti prie pašto dėžutės.', 'Не удалось подключиться к почтовому ящику.', 'Could not connect to the mailbox.'],
  ['Dėžutė jau tikrinama. Palaukite kelias sekundes.', 'Ящик уже проверяется. Подождите несколько секунд.', 'The mailbox is already being checked. Wait a few seconds.'],
  ['El. pašto dėžutė neįjungta.', 'Почтовый ящик не включён.', 'The mailbox is not enabled.'],
  ['Nepavyko perskaityti pašto dėžutės.', 'Не удалось прочитать почтовый ящик.', 'The mailbox could not be read.'],
  ['Nepavyko nuskaityti laiško.', 'Не удалось прочитать письмо.', 'The message could not be read.'],
  ['Prisijungti nepavyko: neteisingas naudotojo vardas ar slaptažodis. Gmail atveju naudokite programos slaptažodį ir įjunkite IMAP.', 'Войти не удалось: неверное имя пользователя или пароль. Для Gmail используйте пароль приложения и включите IMAP.', 'Sign-in failed: wrong username or password. For Gmail use an app password and enable IMAP.'],
  ['Pašto serveris nerastas: patikrinkite serverio adresą.', 'Почтовый сервер не найден: проверьте адрес сервера.', 'Mail server not found: check the server address.'],
  ['Saugaus ryšio (SSL/TLS) klaida: patikrinkite prievadą ir SSL/TLS nustatymą arba serverio sertifikatą.', 'Ошибка защищённого соединения (SSL/TLS): проверьте порт, настройку SSL/TLS или сертификат сервера.', 'Secure connection (SSL/TLS) error: check the port, the SSL/TLS setting or the server certificate.'],
  ['Nepavyko prisijungti prie serverio: patikrinkite adresą, prievadą ir ugniasienę.', 'Не удалось подключиться к серверу: проверьте адрес, порт и брандмауэр.', 'Could not reach the server: check the address, the port and the firewall.'],
  ['Laiške nėra tinkamų priedų', 'В письме нет подходящих вложений', 'The message has no suitable attachments'],
];
export const INBOX_EXACT: Record<string, { ru: string; en: string }> = Object.fromEntries(EXACT.map(([lt, ru, en]) => [lt, { ru, en }]));

export const INBOX_PATTERNS: { re: RegExp; ru: Ru; en: Ru }[] = [
  { re: /^Neteisingas aplanko pavadinimas \((.+)\)$/, ru: (_, k) => `Некорректное имя папки (${k})`, en: (_, k) => `Invalid folder name (${k})` },
  { re: /^Neteisingas siuntėjas: (.+)\. Nurodykite el\. pašto adresą arba @domeną, po vieną eilutėje\.$/, ru: (_, s) => `Некорректный отправитель: ${s}. Укажите адрес эл. почты или @домен, по одному в строке.`, en: (_, s) => `Invalid sender: ${s}. Enter an e-mail address or @domain, one per line.` },
  { re: /^Aplankas "(.+)" nerastas pašto dėžutėje\.$/, ru: (_, f) => `Папка "${f}" не найдена в почтовом ящике.`, en: (_, f) => `The folder "${f}" was not found in the mailbox.` },
  { re: /^Siuntėjas nėra leidžiamų sąraše: (.+)$/, ru: (_, s) => `Отправитель не в списке разрешённых: ${s}`, en: (_, s) => `The sender is not on the allowed list: ${s}` },
  { re: /^DMARC patikra nepavyko: laiškas galėjo būti suklastotas \((.+)\)$/, ru: (_, s) => `Проверка DMARC не пройдена: письмо могло быть подделано (${s})`, en: (_, s) => `DMARC check failed: the message may be forged (${s})` },
  { re: /^Išsaugota dokumentų: (\d+)$/, ru: (_, n) => `Сохранено документов: ${n}`, en: (_, n) => `Documents stored: ${n}` },
  { re: /^Dublikatas: (.+)$/, ru: (_, f) => `Дубликат: ${f}`, en: (_, f) => `Duplicate: ${f}` },
  { re: /^XML e-sąskaita nepriimta \((.+?)\)(?:: (.+))?$/, ru: (_, f, why) => `XML-счёт не принят (${f})${why ? `: ${why}` : ''}`, en: (_, f, why) => `XML e-invoice not accepted (${f})${why ? `: ${why}` : ''}` },
  { re: /^HEIC formato nuotraukos nepalaikomos: (.+)$/, ru: (_, f) => `Фотографии формата HEIC не поддерживаются: ${f}`, en: (_, f) => `HEIC photos are not supported: ${f}` },
  { re: /^Per daug priedų: apdorota tik pirmieji (\d+)$/, ru: (_, n) => `Слишком много вложений: обработаны только первые ${n}`, en: (_, n) => `Too many attachments: only the first ${n} were processed` },
];
