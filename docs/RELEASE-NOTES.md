[Lietuvių](#lietuviškai) | [English](#english)

# kontas.download – versijos pastabos / release notes

## Lietuviškai

Pagrindinė dokumentacijos kalba – lietuvių. Jei lietuviškas ir angliškas tekstai skiriasi, viršesnis lietuviškas.

### 0.1.0 – pirmasis viešas leidimas

Archyvas: `kontas-download-0.1.0.zip`, šalia – kontrolinės sumos failas `kontas-download-0.1.0.zip.sha256`.

**Kas yra programoje**

- Kelios įmonės vienoje sistemoje, kiekvienos duomenys atskirti; aktyvios įmonės perjungiklis.
- Pardavimo sąskaitos su serijomis ir numeriais; PVM mokėtojo, ne PVM mokėtojo ir SVS režimai su galiojimo data; kiekviena sąskaita išsaugo išrašymo dienos režimą. Kreditinės sąskaitos (KS). Periodinių sąskaitų šablonai (sąskaita išrašoma tik paspaudus).
- PDF klientui lietuvių, rusų ar anglų kalba (be vidinių būsenų ir pastabų); siuntimas per pačios įmonės SMTP; kiekvieno išsiųsto PDF archyvas su SHA-256; priminimai apie skolas siunčiami tik rankiniu būdu.
- Pirkimai ir tiekėjų kreditinės sąskaitos; UBL 2.1 / Peppol BIS XML sąskaitų ir kreditinių sąskaitų (EUR) importas su peržiūra; PVM atskaita pagal įmonės režimą; pasirenkama pirkimo debeto sąskaita.
- Banko išrašų importas: CSV, camt.053, MT940; dublikatų kontrolė; mokėjimų susiejimo pasiūlymai; apmokėjimai ne per banką; skolos pagal vėlavimo laikotarpius.
- Automatiniai didžiosios knygos įrašai; žurnalas, apyvartos žiniaraštis, pelno (nuostolių) ataskaita ir balansas, suderinimo aktai; standartinis Lietuvos sąskaitų planas.
- i.SAF XML (PVM mokėtojams), eilučių i.SAF kodai, FR0600 juodraštis su rankinio tvarkymo sąrašu, mokesčių kalendorius.
- Kontragentai, sandėlis, paprasta darbo užmokesčio skaičiuoklė.
- Laikotarpių uždarymas, apskaitos įrašų pakeitimų istorija.
- Naudotojai ir rolės (administratorius, buhalteris), slaptažodžio keitimas, prisijungimo bandymų ribojimas.
- Įmonės paketo eksportas/importas, skyrių eksportas CSV/JSON, visos duomenų bazės kopija administratoriui (mygtukas puslapyje „Įmonių valdymas“, `/api/admin/backup`).
- Sąsaja ir įtaisyta pagalba lietuvių, rusų ir anglų kalbomis.

**Žinomi apribojimai**

- Nėra ryšio su VMI EDS ir i.MAS: i.SAF ir FR0600 failus įkeliate ir pateikiate patys. Nėra ryšio su „Sodra“.
- Nėra debetinių sąskaitų (DS); pirkimų pusėje yra tik tiekėjų kreditinės sąskaitos.
- Darbo užmokestis – supaprastinta skaičiuoklė: neskaičiuojamas NPD, progresinis GPM, „Sodros“ lubos; SAM, 1-SD, GPM313 ir kitos formos nerengiamos.
- PLN204, GPM312, GPM313 ir FR0564 nerengiami; mokesčių kalendorius tik primena terminus (jei įjungta). Termino perkėlimo dėl švenčių taisyklė nepatikrinta – naudokite ankstesnę datą. i.SAF registrų terminų kalendoriuje nėra.
- FR0600: 26–28 laukai ir marža pildomi EDS; maržos kodai (PVM32/33/52/53) ir 23/24 laukų skaidymas – rankiniu būdu; kai užpildyti 32–34 laukai, 36 laukas neskaičiuojamas.
- i.SAF neeksportuoja kodų PVM6–8, PVM59, PVM9, PVM19, PVM25 (pardavimams) ir maržos kodų – juos reikia deklaruoti rankiniu būdu.
- Nėra automatinio nusidėvėjimo, parduotų prekių savikainos ir atsargų nurašymo.
- Tiekėjų PDF sąskaitos neskaitomos; XML importas priima tik EUR, standartinį, 0 % ir neapmokestinamą PVM, be nuolaidų ir antkainių dokumento lygiu.
- camt.053 ir MT940 – tik EUR.
- Nėra automatinio ar suplanuoto sąskaitų ir priminimų siuntimo.
- Duomenų bazės atkūrimas – operatoriaus veiksmas (programoje nėra mygtuko „atkurti“).
- Programa veikia vienu egzemplioriumi (SQLite failas).
- Kai kurie serverio pranešimai gali būti rodomi tik lietuvių kalba.

**Pirmas paleidimas**

Programos aplanke: `cp .env.example .env`, įrašykite `SMTP_ENCRYPTION_KEY` (`openssl rand -hex 32`) ir, jei norite, `ADMIN_EMAIL` / `ADMIN_PASSWORD`, tada `docker compose up -d --build`. Vienkartinis administratoriaus slaptažodis (jei `ADMIN_PASSWORD` tuščias) – `docker logs kontas-app`. Programa: `http://localhost:3200`.

**Atnaujinimas**

Tai pirmasis leidimas. Būsimiems atnaujinimams: padarykite atsarginę kopiją, senajame aplanke paleiskite `docker compose down`, išskleiskite naują archyvą į naują aplanką, nukopijuokite senojo `web/prisma` turinį ir `.env` (jei yra) į naująjį, tada naujajame aplanke `docker compose up -d --build`. Duomenų bazės migracijos pritaikomos automatiškai ir tik prideda naujų dalykų. `SMTP_ENCRYPTION_KEY` turi likti tas pats. Serveriui su HTTPS: `deploy/README.md`.

**Kontrolinė suma**

- Windows (PowerShell): `(Get-FileHash .\kontas-download-0.1.0.zip -Algorithm SHA256).Hash -eq (Get-Content .\kontas-download-0.1.0.zip.sha256).Split(' ')[0]` – turi būti `True`.
- macOS: `shasum -a 256 -c kontas-download-0.1.0.zip.sha256` – turi būti `OK`.
- Linux: `sha256sum -c kontas-download-0.1.0.zip.sha256` – turi būti `OK`.

Programa ir jos pagalba nėra mokesčių ar teisinė konsultacija; už deklaracijas atsako naudotojas ir jo buhalteris. Naudojimo sąlygos – `LICENSE`.

## English

The main documentation language is Lithuanian; if the texts differ, the Lithuanian one prevails.

### 0.1.0 – first public release

Archive: `kontas-download-0.1.0.zip`, with the checksum file `kontas-download-0.1.0.zip.sha256` next to it.

**What is in the program**

- Several companies in one installation, data kept separate; active company switcher.
- Sales invoices with series and numbers; VAT payer, non-payer and SVS modes with an effective date; every invoice keeps the mode of its date. Credit notes (KS). Recurring invoice templates (an invoice is issued only on a click).
- Customer PDF in Lithuanian, Russian or English (without internal statuses and notes); e-mail through the company's own SMTP; archive of every sent PDF with SHA-256; payment reminders sent manually only.
- Purchases and supplier credit notes; import of UBL 2.1 / Peppol BIS XML invoices and credit notes (EUR) with a preview; VAT deduction by the company's mode; selectable purchase debit account.
- Bank statement import: CSV, camt.053, MT940; duplicate protection; payment matching suggestions; settlements outside the bank; receivables ageing.
- Automatic general ledger entries; journal, trial balance, income statement and balance sheet, reconciliation statements; standard Lithuanian chart of accounts.
- i.SAF XML (VAT payers), i.SAF codes per line, FR0600 draft with a manual-handling list, tax calendar.
- Counterparties, stock, a simple payroll calculator.
- Period closing, change history of accounting records.
- Users and roles (administrator, accountant), password change, sign-in throttling.
- Company package export/import, CSV/JSON section exports, whole-database copy for administrators (button on the "Company management" page, `/api/admin/backup`).
- Interface and built-in help in Lithuanian, Russian and English.

**Known limitations**

- No connection to VMI EDS or i.MAS: you upload and submit the i.SAF and FR0600 files yourself. No connection to Sodra.
- No debit notes (DS); on the purchase side only supplier credit notes exist.
- Payroll is a simplified calculator: no tax-exempt amount (NPD), progressive GPM or Sodra caps; SAM, 1-SD, GPM313 and other forms are not prepared.
- PLN204, GPM312, GPM313 and FR0564 are not prepared; the tax calendar only reminds of due dates (when enabled). The holiday carry-over rule is not verified – use the earlier date. i.SAF register deadlines are not in the calendar.
- FR0600: fields 26–28 and the margin are completed in EDS; margin codes (PVM32/33/52/53) and the 23/24 split are manual; field 36 is not computed when fields 32–34 are filled.
- i.SAF does not export the codes PVM6–8, PVM59, PVM9, PVM19, PVM25 on sales and the margin codes; declare them manually.
- No automatic depreciation, cost of goods sold or stock write-off.
- Supplier PDF invoices are not read; the XML import accepts only EUR, standard, zero-rated and exempt VAT, and no document-level discounts or charges.
- camt.053 and MT940 in EUR only.
- No automatic or scheduled sending of invoices or reminders.
- Restoring a database is an operator procedure (there is no restore button).
- Single instance only (SQLite file).
- Some server messages may be shown in Lithuanian only.

**First start**

In the program folder: `cp .env.example .env`, set `SMTP_ENCRYPTION_KEY` (`openssl rand -hex 32`) and optionally `ADMIN_EMAIL` / `ADMIN_PASSWORD`, then `docker compose up -d --build`. The one-time administrator password (when `ADMIN_PASSWORD` is empty) is in `docker logs kontas-app`. The program: `http://localhost:3200`.

**Upgrading**

This is the first release. For future upgrades: make a backup, run `docker compose down` in the old folder, unpack the new archive into a new folder, copy the contents of the old `web/prisma` and the `.env` file (if any) into the new folder, then run `docker compose up -d --build` in the new folder. Database migrations are applied automatically and only add new things. `SMTP_ENCRYPTION_KEY` must stay the same. For a server with HTTPS see `deploy/README.en.md`.

**Checksum**

- Windows (PowerShell): `(Get-FileHash .\kontas-download-0.1.0.zip -Algorithm SHA256).Hash -eq (Get-Content .\kontas-download-0.1.0.zip.sha256).Split(' ')[0]` must print `True`.
- macOS: `shasum -a 256 -c kontas-download-0.1.0.zip.sha256` must print `OK`.
- Linux: `sha256sum -c kontas-download-0.1.0.zip.sha256` must print `OK`.

The program and its help are not tax or legal advice; the user and their accountant are responsible for declarations. Terms of use: `LICENSE` (translations `LICENSE.en.md`, `LICENSE.ru.md`).
