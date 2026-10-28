[Lietuvių](#lietuviškai) | [Русский](#русский) | [English](#english)

# kontas.download – versijos pastabos / release notes

## Lietuviškai

Pagrindinė dokumentacijos kalba – lietuvių. Jei lietuviškas ir angliškas tekstai skiriasi, viršesnis lietuviškas.

### 0.2.2 – tvarkingesnės versijos pastabos

Archyvas: `kontas-download-0.2.2.zip`, šalia – kontrolinės sumos failas `kontas-download-0.2.2.zip.sha256`.

- Versijos pastabos dabar aprašo tik viešai paskelbtas versijas.
- Programos ir duomenų bazės pakeitimų nėra; atnaujinkite kaip įprasta (žr. „Atnaujinimas“ 0.2.1 skyriuje).

Kontrolinė suma:

- Windows (PowerShell): `(Get-FileHash .\kontas-download-0.2.2.zip -Algorithm SHA256).Hash -eq (Get-Content .\kontas-download-0.2.2.zip.sha256).Split(' ')[0]` – turi būti `True`.
- macOS: `shasum -a 256 -c kontas-download-0.2.2.zip.sha256` – turi būti `OK`.
- Linux: `sha256sum -c kontas-download-0.2.2.zip.sha256` – turi būti `OK`.

### 0.2.1 – pirmoji viešoji versija

Archyvas: `kontas-download-0.2.1.zip`, šalia – kontrolinės sumos failas `kontas-download-0.2.1.zip.sha256`. Archyve yra tik buhalterinė programa.

**Kas yra programoje**

- Kelios įmonės vienoje sistemoje, kiekvienos duomenys atskirti; aktyvios įmonės perjungiklis.
- Pardavimo sąskaitos su serijomis ir numeriais; PVM mokėtojo, ne PVM mokėtojo ir SVS režimai su galiojimo data; kiekviena sąskaita išsaugo išrašymo dienos režimą. Kreditinės sąskaitos (KS). Periodinių sąskaitų šablonai (sąskaita išrašoma tik paspaudus).
- PDF klientui lietuvių, rusų ar anglų kalba (be vidinių būsenų ir pastabų); siuntimas per pačios įmonės SMTP; kiekvieno išsiųsto PDF archyvas su SHA-256; priminimai apie skolas siunčiami tik rankiniu būdu.
- Pirkimai ir tiekėjų kreditinės sąskaitos; UBL 2.1 / Peppol BIS XML sąskaitų ir kreditinių sąskaitų (EUR) importas su peržiūra; PVM atskaita pagal įmonės režimą; pasirenkama pirkimo debeto sąskaita; pirkimų sandėlio pasirinkimas.
- Banko išrašų importas: CSV, camt.053, MT940; dublikatų kontrolė; mokėjimų susiejimo pasiūlymai; apmokėjimai ne per banką; skolos pagal vėlavimo laikotarpius.
- Automatiniai didžiosios knygos įrašai; žurnalas, apyvartos žiniaraštis, pelno (nuostolių) ataskaita ir balansas, suderinimo aktai; standartinis Lietuvos sąskaitų planas.
- i.SAF XML (PVM mokėtojams), eilučių i.SAF kodai, FR0600 juodraštis su rankinio tvarkymo sąrašu, mokesčių kalendorius.
- Darbo užmokestis: skaičiavimas (NPD, GPM, „Sodros“ įmokos) su laikinais 2026 m. parametrais, puslapis „Darbo užmokestis“, žurnalo įrašai.
- Ilgalaikis turtas: kortelės, nusidėvėjimo skaičiavimas ir įrašymas (su atšaukimu), rankinis keitimas su audito pėdsaku.
- Atsargos ir savikaina: svertinio vidurkio ir FIFO metodai (pagal nutylėjimą išjungta), judėjimai, rankinis koregavimas su priežastimi.
- VMI formų juodraščiai: FR0564, GPM313 (iš užregistruotų darbo užmokesčio skaičiavimų) ir GPM312 (metinė suvestinė pagal darbuotojus); puslapiai, CSV/JSON, terminai registre.
- Taisyklių registras: tarifai, terminai ir darbo užmokesčio parametrai su galiojimo datomis; puslapis „Taisyklės“ (`/rules`); pelno mokesčio tarifas imamas iš registro pagal metus.
- Kontragentai, laikotarpių uždarymas, apskaitos įrašų pakeitimų istorija.
- Naudotojai ir rolės (administratorius, buhalteris), slaptažodžio keitimas, prisijungimo bandymų ribojimas.
- Įmonės paketo eksportas/importas (apima ir darbo užmokesčio, ilgalaikio turto, atsargų lenteles), skyrių eksportas CSV/JSON, visos duomenų bazės kopija administratoriui (mygtukas puslapyje „Įmonių valdymas“, `/api/admin/backup`).
- Sąsaja ir įtaisyta pagalba lietuvių, rusų ir anglų kalbomis.

**Svarbu**

Darbo užmokesčio parametrai ir tarifai yra laikini, kol buhalteris jų nepatikrino pagal oficialius šaltinius; prieš naudodami skaičiavimus ir juodraščius pateikimui, patikrinkite juos.

**Žinomi apribojimai**

- Nėra ryšio su VMI EDS ir i.MAS: i.SAF, FR0600 ir kitų formų failus įkeliate ir pateikiate patys. Nėra ryšio su „Sodra“.
- Nėra debetinių sąskaitų (DS); pirkimų pusėje yra tik tiekėjų kreditinės sąskaitos.
- Darbo užmokestis: SAM, 1-SD ir kitos formos nerengiamos; parametrai laikini (žr. „Svarbu“).
- PLN204 nerengiama; mokesčių kalendorius tik primena terminus (jei įjungta). Termino perkėlimo dėl švenčių taisyklė nepatikrinta – naudokite ankstesnę datą. i.SAF registrų terminų kalendoriuje nėra.
- FR0600: 26–28 laukai ir marža pildomi EDS; maržos kodai (PVM32/33/52/53) ir 23/24 laukų skaidymas – rankiniu būdu; kai užpildyti 32–34 laukai, 36 laukas neskaičiuojamas.
- i.SAF neeksportuoja kodų PVM6–8, PVM59, PVM9, PVM19, PVM25 (pardavimams) ir maržos kodų – juos reikia deklaruoti rankiniu būdu.
- Tiekėjų PDF sąskaitos neskaitomos; XML importas priima tik EUR, standartinį, 0 % ir neapmokestinamą PVM, be nuolaidų ir antkainių dokumento lygiu.
- camt.053 ir MT940 – tik EUR.
- Nėra automatinio ar suplanuoto sąskaitų ir priminimų siuntimo.
- Duomenų bazės atkūrimas – operatoriaus veiksmas (programoje nėra mygtuko „atkurti“).
- Programa veikia vienu egzemplioriumi (SQLite failas).
- Kai kurie serverio pranešimai gali būti rodomi tik lietuvių kalba.

Planuojami darbai ir nuo ko jie priklauso aprašyti svetainės kontas.download puslapyje „Planas“; tai ne įsipareigojimas.

**Pirmas paleidimas**

Programos aplanke: `cp .env.example .env`, įrašykite `SMTP_ENCRYPTION_KEY` (`openssl rand -hex 32`) ir, jei norite, `ADMIN_EMAIL` / `ADMIN_PASSWORD`, tada `docker compose up -d --build`. Vienkartinis administratoriaus slaptažodis (jei `ADMIN_PASSWORD` tuščias) – `docker logs kontas-app`. Programa: `http://localhost:3200`. Serveriui su HTTPS: `deploy/README.md`.

**Atnaujinimas**

Padarykite atsarginę kopiją (aplanko `web/prisma` ir failo `.env`). Paleiskite diegimo komandą dar kartą arba išskleiskite naują archyvą ant senojo aplanko, išsaugodami `.env` ir `web/prisma`, tada paleiskite `docker compose up -d --build`. Duomenų bazės migracijos pritaikomos automatiškai ir tik prideda naujų dalykų. `SMTP_ENCRYPTION_KEY` turi likti tas pats.

**Kontrolinė suma**

- Windows (PowerShell): `(Get-FileHash .\kontas-download-0.2.1.zip -Algorithm SHA256).Hash -eq (Get-Content .\kontas-download-0.2.1.zip.sha256).Split(' ')[0]` – turi būti `True`.
- macOS: `shasum -a 256 -c kontas-download-0.2.1.zip.sha256` – turi būti `OK`.
- Linux: `sha256sum -c kontas-download-0.2.1.zip.sha256` – turi būti `OK`.

Programa ir jos pagalba nėra mokesčių ar teisinė konsultacija; už deklaracijas atsako naudotojas ir jo buhalteris. Naudojimo sąlygos – `LICENSE`.

## Русский

Основной язык документации – литовский; при расхождении текстов приоритет у литовского.

### 0.2.2 – приведены в порядок примечания к выпуску

Архив: `kontas-download-0.2.2.zip`, рядом – файл контрольной суммы `kontas-download-0.2.2.zip.sha256`.

- Примечания к выпуску теперь описывают только публично выпущенные версии.
- Изменений в программе и базе данных нет; обновляйте как обычно (см. «Обновление» в разделе 0.2.1).

Контрольная сумма:

- Windows (PowerShell): `(Get-FileHash .\kontas-download-0.2.2.zip -Algorithm SHA256).Hash -eq (Get-Content .\kontas-download-0.2.2.zip.sha256).Split(' ')[0]` – должно быть `True`.
- macOS: `shasum -a 256 -c kontas-download-0.2.2.zip.sha256` – должно быть `OK`.
- Linux: `sha256sum -c kontas-download-0.2.2.zip.sha256` – должно быть `OK`.

### 0.2.1 – первая публичная версия

Архив: `kontas-download-0.2.1.zip`, рядом – файл контрольной суммы `kontas-download-0.2.1.zip.sha256`. В архиве только бухгалтерская программа.

**Что есть в программе**

- Несколько компаний в одной установке, данные каждой разделены; переключатель активной компании.
- Счета продажи с сериями и номерами; режимы плательщика НДС, не плательщика и SVS с датой действия; каждый счёт сохраняет режим на день выписки. Кредитные счета (KS). Шаблоны периодических счетов (счёт выписывается только по нажатию).
- PDF для клиента на литовском, русском или английском языке (без внутренних статусов и заметок); отправка через SMTP самой компании; архив каждого отправленного PDF с SHA-256; напоминания о долгах отправляются только вручную.
- Закупки и кредитные счета поставщиков; импорт XML-счетов и кредитных счетов UBL 2.1 / Peppol BIS (EUR) с предпросмотром; вычет НДС по режиму компании; выбираемый дебетовый счёт закупки; выбор склада в закупках.
- Импорт банковских выписок: CSV, camt.053, MT940; защита от дубликатов; предложения по сопоставлению платежей; расчёты не через банк; долги по периодам просрочки.
- Автоматические проводки главной книги; журнал, оборотная ведомость, отчёт о прибылях и убытках и баланс, акты сверки; стандартный литовский план счетов.
- i.SAF XML (для плательщиков НДС), коды i.SAF по строкам, черновик FR0600 со списком для ручной обработки, налоговый календарь.
- Зарплата: расчёт (НПД, GPM, взносы «Содры») с временными параметрами на 2026 год, страница «Зарплата», записи в журнале.
- Основные средства: карточки, расчёт и проводка амортизации (с отменой), ручные изменения с журналом аудита.
- Запасы и себестоимость: методы средневзвешенной и FIFO (по умолчанию выключено), движения, ручная корректировка с причиной.
- Черновики форм VMI: FR0564, GPM313 (из зарегистрированных расчётов зарплаты) и GPM312 (годовая сводка по работникам); страницы, CSV/JSON, сроки в реестре.
- Реестр правил: ставки, сроки и параметры зарплаты с датами действия; страница «Правила» (`/rules`); ставка налога на прибыль берётся из реестра по годам.
- Контрагенты, закрытие периодов, история изменений учётных записей.
- Пользователи и роли (администратор, бухгалтер), смена пароля, ограничение попыток входа.
- Экспорт/импорт пакета компании (включая таблицы зарплаты, основных средств и запасов), экспорт разделов в CSV/JSON, копия всей базы данных для администратора (кнопка на странице «Управление компаниями», `/api/admin/backup`).
- Интерфейс и встроенная справка на литовском, русском и английском языках.

**Важно**

Параметры и ставки зарплаты временные, пока бухгалтер не проверил их по официальным источникам; проверьте их, прежде чем полагаться на расчёты и черновики при подаче.

**Известные ограничения**

- Нет связи с VMI EDS и i.MAS: файлы i.SAF, FR0600 и других форм вы загружаете и подаёте сами. Нет связи с «Содрой».
- Нет дебетовых счетов (DS); на стороне закупок есть только кредитные счета поставщиков.
- Зарплата: SAM, 1-SD и другие формы не готовятся; параметры временные (см. «Важно»).
- PLN204 не готовится; налоговый календарь только напоминает о сроках (если включён). Правило переноса срока из-за праздников не проверено – используйте более раннюю дату. Сроков реестров i.SAF в календаре нет.
- FR0600: поля 26–28 и маржа заполняются в EDS; коды маржи (PVM32/33/52/53) и разделение полей 23/24 – вручную; при заполненных полях 32–34 поле 36 не вычисляется.
- i.SAF не экспортирует коды PVM6–8, PVM59, PVM9, PVM19, PVM25 (по продажам) и коды маржи – их нужно декларировать вручную.
- PDF-счета поставщиков не читаются; XML-импорт принимает только EUR, стандартный, нулевой и освобождённый НДС, без скидок и надбавок на уровне документа.
- camt.053 и MT940 – только EUR.
- Нет автоматической или запланированной отправки счетов и напоминаний.
- Восстановление базы данных – действие оператора (в программе нет кнопки «восстановить»).
- Программа работает в одном экземпляре (файл SQLite).
- Некоторые сообщения сервера могут отображаться только на литовском языке.

Планируемые работы и от чего они зависят описаны на странице «План» сайта kontas.download; это не обязательство.

**Первый запуск**

В папке программы: `cp .env.example .env`, задайте `SMTP_ENCRYPTION_KEY` (`openssl rand -hex 32`) и, при желании, `ADMIN_EMAIL` / `ADMIN_PASSWORD`, затем `docker compose up -d --build`. Одноразовый пароль администратора (если `ADMIN_PASSWORD` пуст) – `docker logs kontas-app`. Программа: `http://localhost:3200`. Для сервера с HTTPS: `deploy/README.ru.md`.

**Обновление**

Сделайте резервную копию (папки `web/prisma` и файла `.env`). Запустите команду установки ещё раз или распакуйте новый архив поверх старой папки, сохранив `.env` и `web/prisma`, затем выполните `docker compose up -d --build`. Миграции базы данных применяются автоматически и только добавляют новое. `SMTP_ENCRYPTION_KEY` должен остаться тем же.

**Контрольная сумма**

- Windows (PowerShell): `(Get-FileHash .\kontas-download-0.2.1.zip -Algorithm SHA256).Hash -eq (Get-Content .\kontas-download-0.2.1.zip.sha256).Split(' ')[0]` – должно быть `True`.
- macOS: `shasum -a 256 -c kontas-download-0.2.1.zip.sha256` – должно быть `OK`.
- Linux: `sha256sum -c kontas-download-0.2.1.zip.sha256` – должно быть `OK`.

Программа и её справка не являются налоговой или юридической консультацией; за декларации отвечают пользователь и его бухгалтер. Условия использования – `LICENSE` (переводы `LICENSE.en.md`, `LICENSE.ru.md`).

## English

The main documentation language is Lithuanian; if the texts differ, the Lithuanian one prevails.

### 0.2.2 – tidier release notes

Archive: `kontas-download-0.2.2.zip`, with the checksum file `kontas-download-0.2.2.zip.sha256` next to it.

- The release notes now describe only publicly released versions.
- No program or database changes; update as usual (see "Updating" in the 0.2.1 section).

Checksum:

- Windows (PowerShell): `(Get-FileHash .\kontas-download-0.2.2.zip -Algorithm SHA256).Hash -eq (Get-Content .\kontas-download-0.2.2.zip.sha256).Split(' ')[0]` must print `True`.
- macOS: `shasum -a 256 -c kontas-download-0.2.2.zip.sha256` must print `OK`.
- Linux: `sha256sum -c kontas-download-0.2.2.zip.sha256` must print `OK`.

### 0.2.1 – first public release

Archive: `kontas-download-0.2.1.zip`, with the checksum file `kontas-download-0.2.1.zip.sha256` next to it. The archive contains only the accounting program.

**What is in the program**

- Several companies in one installation, data kept separate; active company switcher.
- Sales invoices with series and numbers; VAT payer, non-payer and SVS modes with an effective date; every invoice keeps the mode of its date. Credit notes (KS). Recurring invoice templates (an invoice is issued only on a click).
- Customer PDF in Lithuanian, Russian or English (without internal statuses and notes); e-mail through the company's own SMTP; archive of every sent PDF with SHA-256; payment reminders sent manually only.
- Purchases and supplier credit notes; import of UBL 2.1 / Peppol BIS XML invoices and credit notes (EUR) with a preview; VAT deduction by the company's mode; selectable purchase debit account; warehouse choice on purchases.
- Bank statement import: CSV, camt.053, MT940; duplicate protection; payment matching suggestions; settlements outside the bank; receivables ageing.
- Automatic general ledger entries; journal, trial balance, income statement and balance sheet, reconciliation statements; standard Lithuanian chart of accounts.
- i.SAF XML (VAT payers), i.SAF codes per line, FR0600 draft with a manual-handling list, tax calendar.
- Payroll: calculation (NPD, GPM, Sodra contributions) with provisional 2026 parameters, a Payroll page, ledger entries.
- Fixed assets: asset cards, depreciation calculation and posting (with reversal), manual changes with an audit trail.
- Inventory and costing: weighted-average and FIFO methods (off by default), stock movements, manual adjustments with a reason.
- VMI form drafts: FR0564, GPM313 (from registered payroll calculations) and GPM312 (annual summary per employee); pages, CSV/JSON, deadlines in the registry.
- Rules registry: rates, deadlines and payroll parameters with effective dates; a Rules page (`/rules`); the corporate income tax rate is taken from the registry by year.
- Counterparties, period closing, change history of accounting records.
- Users and roles (administrator, accountant), password change, sign-in throttling.
- Company package export/import (including the payroll, fixed asset and inventory tables), CSV/JSON section exports, whole-database copy for administrators (button on the "Company management" page, `/api/admin/backup`).
- Interface and built-in help in Lithuanian, Russian and English.

**Important**

Payroll parameters and rates are provisional until the accountant has verified them against the official sources; check them before relying on the calculations and drafts for filing.

**Known limitations**

- No connection to VMI EDS or i.MAS: you upload and submit the i.SAF, FR0600 and other form files yourself. No connection to Sodra.
- No debit notes (DS); on the purchase side only supplier credit notes exist.
- Payroll: SAM, 1-SD and other forms are not prepared; parameters are provisional (see "Important").
- PLN204 is not prepared; the tax calendar only reminds of due dates (when enabled). The holiday carry-over rule is not verified – use the earlier date. i.SAF register deadlines are not in the calendar.
- FR0600: fields 26–28 and the margin are completed in EDS; margin codes (PVM32/33/52/53) and the 23/24 split are manual; field 36 is not computed when fields 32–34 are filled.
- i.SAF does not export the codes PVM6–8, PVM59, PVM9, PVM19, PVM25 on sales and the margin codes; declare them manually.
- Supplier PDF invoices are not read; the XML import accepts only EUR, standard, zero-rated and exempt VAT, and no document-level discounts or charges.
- camt.053 and MT940 in EUR only.
- No automatic or scheduled sending of invoices or reminders.
- Restoring a database is an operator procedure (there is no restore button).
- Single instance only (SQLite file).
- Some server messages may be shown in Lithuanian only.

Planned work and what it depends on is described on the kontas.download site page "Roadmap"; it is not a commitment.

**First start**

In the program folder: `cp .env.example .env`, set `SMTP_ENCRYPTION_KEY` (`openssl rand -hex 32`) and optionally `ADMIN_EMAIL` / `ADMIN_PASSWORD`, then `docker compose up -d --build`. The one-time administrator password (when `ADMIN_PASSWORD` is empty) is in `docker logs kontas-app`. The program: `http://localhost:3200`. For a server with HTTPS see `deploy/README.en.md`.

**Updating**

Make a backup (the `web/prisma` folder and the `.env` file). Run the install command again, or unpack the new archive over the old folder keeping `.env` and `web/prisma`, then run `docker compose up -d --build`. Database migrations are applied automatically and only add new things. `SMTP_ENCRYPTION_KEY` must stay the same.

**Checksum**

- Windows (PowerShell): `(Get-FileHash .\kontas-download-0.2.1.zip -Algorithm SHA256).Hash -eq (Get-Content .\kontas-download-0.2.1.zip.sha256).Split(' ')[0]` must print `True`.
- macOS: `shasum -a 256 -c kontas-download-0.2.1.zip.sha256` must print `OK`.
- Linux: `sha256sum -c kontas-download-0.2.1.zip.sha256` must print `OK`.

The program and its help are not tax or legal advice; the user and their accountant are responsible for declarations. Terms of use: `LICENSE` (translations `LICENSE.en.md`, `LICENSE.ru.md`).
