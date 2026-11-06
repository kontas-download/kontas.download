[Lietuvių](#lietuviškai) | [Русский](#русский) | [English](#english)

# kontas.download – versijos pastabos / release notes

## Lietuviškai

Pagrindinė dokumentacijos kalba – lietuvių. Jei lietuviškas ir angliškas tekstai skiriasi, viršesnis lietuviškas.

### 0.5.4 – debesies diegimas, išmanūs siuntėjai, mokesčių kalendorius, API nustatymai

Archyvas: `kontas-download-0.5.4.zip`, šalia – kontrolinės sumos failas `kontas-download-0.5.4.zip.sha256`. Atnaujinti iš 0.4.0, 0.5.0, 0.5.1, 0.5.2 ar 0.5.3: `update.ps1` / `update.sh`.

- Debesies diegimas: į atvaizdą nebeįdedama duomenų bazė, paleidimas vyksta tik sėkmingai atkūrus duomenis iš atsarginės kopijos; dokumentų originalai į atvaizdą neįtraukiami.
- Gauti dokumentai: nurodytas pašto tikrinimo intervalas (debesies versijoje – kas 15 minučių).
- Išmanūs siuntėjai: žinomi kontaktai, savi naudotojai, persiųstų laiškų pirminis siuntėjas, pasiūlymai leisti siuntėją ir atmestų laiškų sąrašas.
- Tiekėjų taisyklės: atskiros taisyklės kiekvienam tiekėjui.
- Pirkimų eilutės: importuotų kainų taisymas (vienkartinė migracija), naujas redagavimo langas, apsauga nuo nulinės sumos ir kainos su 4 ženklais po kablelio.
- Mokesčių kalendorius: mygtukas „Paruošti“ (failai, patikrinimai, kur pateikti), žymėjimas pateikta su data ir registracijos nr., priminimai su nuorodomis.
- Nustatymai – API: atpažinimo raktas, valstybinių paslaugų prisijungimai ir programos adresas; pateikimo sluoksnis su mygtukais „Pateikti“ ir „Tikrinti būseną“, kurie paaiškina, kad valstybinės paslaugos dar nejungiamos.

Kontrolinė suma:
- Windows (PowerShell): `(Get-FileHash .\kontas-download-0.5.4.zip -Algorithm SHA256).Hash -eq (Get-Content .\kontas-download-0.5.4.zip.sha256).Split(' ')[0]` – turi būti `True`.
- macOS: `shasum -a 256 -c kontas-download-0.5.4.zip.sha256` – turi būti `OK`.
- Linux: `sha256sum -c kontas-download-0.5.4.zip.sha256` – turi būti `OK`.

### 0.5.3 – bankas, užsienio valiuta, kreditinės sąskaitos, archyvas patikrinimui

Archyvas: `kontas-download-0.5.3.zip`, šalia – kontrolinės sumos failas `kontas-download-0.5.3.zip.sha256`. Atnaujinti iš 0.4.0, 0.5.0, 0.5.1 ar 0.5.2: `update.ps1` / `update.sh`.

- Turinio dublikatų tikrinimas: tas pats dokumentas (stiprus sutapimas) ar galimas dublikatas pažymimas eilėje, patvirtinti galima tik aiškiai pažymėjus.
- Bankas: pirkimų ir banko operacijų suderinimas – pasiūlymai su patikimumu, susiejimas, atsiejimas, asmens sumokėtų išlaidų kompensavimas.
- Ilgalaikio turto kortelė ir atsargų priėmimas iš dokumento eilučių (neprivaloma, tik patvirtinus).
- Užsienio valiutos dokumentai su ECB kursu: kursas dokumento dienai ar paskutinei ankstesnei, galima įvesti kursą ranka.
- Kreditinės sąskaitos iš PDF ar nuotraukų registruojamos per bendrą kreditinio pirkimo kelią.
- XML e-sąskaitos iš el. pašto patenka į eilę; PDF lieka kaip matomas originalas, patvirtinama įprastu XML importo keliu.
- Atpažinimo apytikslė kaina ir mėnesio išlaidų limitas.
- Greita eilės peržiūra klaviatūra.
- HEIC nuotraukos ir nuotraukos paruošimas prieš atpažinimą.
- Archyvas mokesčių inspekcijos patikrinimui: ZIP su originalais, registru ir kontrolinėmis sumomis.
- Išlaidų sąskaita pagal tiekėjo istoriją arba pasiūlymas pagal turinį.
- Debesies diegimas: originalai saugomi objektų saugykloje (vietinis diskas – tik talpykla), pašto dėžutė tikrinama kas 15 minučių, tik kai įjungta dokumentų dėžutė.
- Diegimo sauga: gyvi duomenys neperrašomi, atsarginė kopija privaloma, slaptažodžių kode nėra.
- Pilnas trečiųjų šalių licencijų sąrašas.

Atnaujinimo pastabos: HEIC nuotraukų ir nuotraukų paruošimo bibliotekos (`sharp`, `heic-convert`) yra naujos priklausomybės; `update.ps1` / `update.sh` jas įdiegia kaip įprasta.

Kontrolinė suma:
- Windows (PowerShell): `(Get-FileHash .\kontas-download-0.5.3.zip -Algorithm SHA256).Hash -eq (Get-Content .\kontas-download-0.5.3.zip.sha256).Split(' ')[0]` – turi būti `True`.
- macOS: `shasum -a 256 -c kontas-download-0.5.3.zip.sha256` – turi būti `OK`.
- Linux: `sha256sum -c kontas-download-0.5.3.zip.sha256` – turi būti `OK`.

### 0.5.2 – gauti dokumentai, atpažinimas, priėmimas el. paštu

Archyvas: `kontas-download-0.5.2.zip`, šalia – kontrolinės sumos failas `kontas-download-0.5.2.zip.sha256`. Atnaujinti iš 0.4.0, 0.5.0 ar 0.5.1: `update.ps1` / `update.sh`.

- Skyrius „Gauti dokumentai“: pirkimų dokumentų (nuotraukų ir PDF) atpažinimas įmonės pačios prisijungimo raktu – raktas laikomas tik jūsų įmonės nustatymuose. Atpažintas juodraštis peržiūrimas formoje šalia originalo ir tik jūsų patvirtinus tampa pirkimo įrašu.
- Rankinis duomenų įvedimas be atpažinimo: dokumentą galima užpildyti ranka, o originalas lieka matomas šalia.
- Kasos kvitai: kvito numeris ir kasos aparato duomenys, kvitui rodoma 0 % PVM atskaita.
- Apmokėjimas: nurodoma, kas sumokėjo – įmonė ar asmuo; asmens sumokėtos išlaidos kaupiamos ir atlyginamos atskirai.
- Originalai įtraukiami į atsargines kopijas, nuotolinę saugyklą ir įmonės duomenų eksportą.
- Pagalbos puslapis apie dokumentų atpažinimą ir dalinimasis nuotrauka iš telefono (programa įdiegiama kaip PWA).
- Priėmimas iš pašto dėžutės (IMAP): dokumentai, atsiųsti į atskirą paštą, patenka į „Gautus dokumentus“ be jokių DNS pakeitimų.

Kontrolinė suma:
- Windows (PowerShell): `(Get-FileHash .\kontas-download-0.5.2.zip -Algorithm SHA256).Hash -eq (Get-Content .\kontas-download-0.5.2.zip.sha256).Split(' ')[0]` – turi būti `True`.
- macOS: `shasum -a 256 -c kontas-download-0.5.2.zip.sha256` – turi būti `OK`.
- Linux: `sha256sum -c kontas-download-0.5.2.zip.sha256` – turi būti `OK`.

### 0.5.1 – automatizavimas, el. paštas korespondencijai, apžvalgos laikotarpiai

Archyvas: `kontas-download-0.5.1.zip`, šalia – kontrolinės sumos failas `kontas-download-0.5.1.zip.sha256`. Atnaujinti iš 0.4.0 ar 0.5.0: `update.ps1` / `update.sh`.

- Skyrius „Automatizavimas“: robotas kasdien išrašo periodines sąskaitas ir išsiunčia jas su PDF, siunčia priminimus skolininkams pagal dienas po termino, susieja vienareikšmius banko mokėjimus, siunčia savaitės suvestinę ir mokesčių terminų priminimus. Kiekvienas darbas įjungiamas atskirai, viskas įrašoma į žurnalą.
- Kontrahento laukas „El. paštas korespondencijai“: laiškai iš programos siunčiami juo, tuščias – naudojamas el. paštas; sąskaitose lieka el. paštas ir telefonas.
- Apžvalgos statistika už pasirinktą laikotarpį (numatyta – šie metai), bet koks laikotarpis nuo–iki ir visas laikas.
- Periodinis šablonas: klientas iš anksto nepasirenkamas, duomenys iš paskutinės kliento sąskaitos (serija, eilutės, apmokėjimo terminas, pastabos), PVM stulpelis tik PVM mokėtojui. Numatyta serija – dažniausia įmonės serija.
- Laikotarpių uždarymas: buhalteris gali uždaryti, atidaryti – tik administratorius.
- Pataisyta: neapmokėtų sąskaitų spalva apžvalgoje, kontrahento formos lygiavimas, terminas „kontrahentas“; mažesnis Docker atvaizdas.

Kontrolinė suma:
- Windows (PowerShell): `(Get-FileHash .\kontas-download-0.5.1.zip -Algorithm SHA256).Hash -eq (Get-Content .\kontas-download-0.5.1.zip.sha256).Split(' ')[0]` – turi būti `True`.
- macOS: `shasum -a 256 -c kontas-download-0.5.1.zip.sha256` – turi būti `OK`.
- Linux: `sha256sum -c kontas-download-0.5.1.zip.sha256` – turi būti `OK`.

### 0.5.0 – personalas, laiškai su šablonais ir parašu, automatinis užpildymas

Archyvas: `kontas-download-0.5.0.zip`, šalia – kontrolinės sumos failas `kontas-download-0.5.0.zip.sha256`. Atnaujinti iš 0.4.0: `update.ps1` / `update.sh`.

- Skyrius „Darbuotojai“: darbuotojo kortelė (sutartis, santykių rūšis, kontaktai, banko sąskaita, DU nustatymai, pastabos), darbo užmokestis pagal mėnesius su metų sumomis, kasmetinės atostogos pagal darbo metus, atsiskaitymai pagal susietą kontrahentą (banko operacijos, žurnalas pagal sąskaitas).
- DU žiniaraščiai: išklotinė (priskaitymai ir išskaitos pagal DU kodą, NPD, garantinis fondas, išmokėta suma); redagavimo forma įkelia tikras darbuotojų eilutes. Žiniaraščiai, kurių įrašai jau yra perkeltame bendrajame žurnale, nekuriami antrą kartą. DU žinynai: pareigos, DU kodai, darbo laiko žymėjimai, pamainos.
- Modulis „Laiškai“: laiškai kontrahentams ar bet kokiu adresu, šablonai su įterpiamais laukais (kontrahentas, skola, neapmokėtos sąskaitos ir kt.), grupinis siuntimas, peržiūra, išsiųstų laiškų žurnalas.
- Laiškų parašas (įjungtas pagal nutylėjimą) su konfiguratoriumi ir logotipu; pridedamas prie laiškų, sąskaitų ir priminimų, matomas peržiūroje.
- Automatinis užpildymas formose iš jau įvestų duomenų: prekių ir paslaugų katalogas su paskutine kaina sąskaitose ir šablonuose, serijos, kontrahentai, sandėliai, miestai, sąskaitų planas, pareigos, darbuotojai.
- Vieningas tamsus SMTP, apskaitos kontrolės ir sąskaitos siuntimo langų stilius; periodinio šablono eilutės su stulpelių antraštėmis.

Kontrolinė suma:
- Windows (PowerShell): `(Get-FileHash .\kontas-download-0.5.0.zip -Algorithm SHA256).Hash -eq (Get-Content .\kontas-download-0.5.0.zip.sha256).Split(' ')[0]` – turi būti `True`.
- macOS: `shasum -a 256 -c kontas-download-0.5.0.zip.sha256` – turi būti `OK`.
- Linux: `sha256sum -c kontas-download-0.5.0.zip.sha256` – turi būti `OK`.

### 0.4.0 – atnaujinimai viena komanda

Archyvas: `kontas-download-0.4.0.zip`, šalia – kontrolinės sumos failas `kontas-download-0.4.0.zip.sha256`.

- Programa kas 12 val. patikrina, ar kontas.download paskelbė naujesnę versiją (`https://kontas.download/latest.json`; jokie duomenys nesiunčiami, išjungiama `UPDATE_CHECK=off`). Administratorius naują versiją mato Nustatymuose ir šoniniame meniu.
- Atnaujinimas viena komanda: `update.ps1` (Windows) arba `update.sh` (Linux / macOS). Patikrinama archyvo SHA-256, padaroma duomenų bazės kopija, seni failai perkeliami į `backups/previous-*`, konteineris perkuriamas ir patikrinamas; nepavykus grąžinama ankstesnė versija. `web/prisma` ir `.env` nekeičiami.
- Atnaujinant iš 0.3.0 ar senesnės versijos šį kartą archyvą reikia išskleisti rankiniu būdu (žr. vadovą); vėlesnius atnaujinimus atliks `update.ps1` / `update.sh`.

Kontrolinė suma:
- Windows (PowerShell): `(Get-FileHash .\kontas-download-0.4.0.zip -Algorithm SHA256).Hash -eq (Get-Content .\kontas-download-0.4.0.zip.sha256).Split(' ')[0]` – turi būti `True`.
- macOS: `shasum -a 256 -c kontas-download-0.4.0.zip.sha256` – turi būti `OK`.
- Linux: `sha256sum -c kontas-download-0.4.0.zip.sha256` – turi būti `OK`.

### 0.3.0 – naujas dizainas, šviesi tema, nustatymai ir įmonės logotipas

Archyvas: `kontas-download-0.3.0.zip`, šalia – kontrolinės sumos failas `kontas-download-0.3.0.zip.sha256`.

- Nauja išvaizda: Geist šriftas, vieninga spalvų paletė, Phosphor ikonos, patvirtinimo langai vietoje naršyklės dialogų, 404 ir įkėlimo puslapiai.
- Sistemos nustatymų puslapis: kalba, tamsi / šviesi / pagal įrenginį tema, paskyra, duomenų bazės kopija.
- Sąskaitos apmokėjimo būsenos keitimas sąraše ir redagavimo lange (grynieji pinigai su žurnalo įrašu); būsena nustatoma pagal likutį; naujos sąskaitos pagal nutylėjimą neapmokėtos.
- Sąskaitos kopijavimas: pažymėjus sąskaitą sąraše atidaroma nauja sąskaitos forma su užpildytais duomenimis.
- Įmonės logotipas (PNG arba JPEG): rodomas sąskaitų PDF viršuje ir šoninėje juostoje; įmonės formoje atsirado laisvos formos pastabų laukas.
- Sąskaitos PDF lentelė: antraštės ir reikšmės lygiuojamos pagal stulpelius.
- Modaliniai langai slenka, kai netelpa į ekraną, ir turi vieningą stilių; naršyklės kortelės pavadinime rodomas skyrius.
- Cloudflare Containers diegimas: duomenų bazės momentinės kopijos į R2, užrakinti vidiniai tiltai, tik vienas konteinerio egzempliorius.
- Importo taisymo skriptas `scripts/repair_item_names.py` atkuria konkrečius eilučių pavadinimus iš senos sistemos eksporto.

Kontrolinė suma:
- Windows (PowerShell): `(Get-FileHash .\kontas-download-0.3.0.zip -Algorithm SHA256).Hash -eq (Get-Content .\kontas-download-0.3.0.zip.sha256).Split(' ')[0]` – turi būti `True`.
- macOS: `shasum -a 256 -c kontas-download-0.3.0.zip.sha256` – turi būti `OK`.
- Linux: `sha256sum -c kontas-download-0.3.0.zip.sha256` – turi būti `OK`.

### 0.2.3 – PLN204 juodraštis ir išplėstas VMI formų eksportas

Archyvas: `kontas-download-0.2.3.zip`, šalia – kontrolinės sumos failas `kontas-download-0.2.3.zip.sha256`.

- Nauja metinės pelno mokesčio deklaracijos PLN204 juodraščio ataskaita ir `.ffdata` eksportas su PLN204S ir PLN204Z priedais.
- GPM312 `.ffdata` eksportas su L9 tarifo pasirinkimu ir nerezidentų priedu GPM312U.
- FR0564 `.ffdata` eksportas su FR0564R ir FR0564T/FR0564TP priedais.
- FR0600 juodraštis: rankinis 26–28 laukų įvedimas ir automatinis 35/36 laukų perskaičiavimas.
- Darbo užmokestis: išmokėjimo data GPM313 6 ir 7 laukų atskyrimui.
- Pirkėjo sąskaitos PDF: atvirkštinio apmokestinimo nuoroda pagal PVM15, PVM34 ar PVM25–PVM27 kodus.
- Serverio klaidų pranešimai išversti į lietuvių, rusų ir anglų kalbas.

Kontrolinė suma:

- Windows (PowerShell): `(Get-FileHash .\kontas-download-0.2.3.zip -Algorithm SHA256).Hash -eq (Get-Content .\kontas-download-0.2.3.zip.sha256).Split(' ')[0]` – turi būti `True`.
- macOS: `shasum -a 256 -c kontas-download-0.2.3.zip.sha256` – turi būti `OK`.
- Linux: `sha256sum -c kontas-download-0.2.3.zip.sha256` – turi būti `OK`.

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
- PDF klientui lietuvių, rusų ar anglų kalba (be vidinių būsenų ir pastabų; atvirkštinio apmokestinimo nuoroda pridedama priskyrus PVM15, PVM34 ar PVM25–PVM27 kodą); siuntimas per pačios įmonės SMTP; kiekvieno išsiųsto PDF archyvas su SHA-256; priminimai apie skolas siunčiami tik rankiniu būdu.
- Pirkimai ir tiekėjų kreditinės sąskaitos; UBL 2.1 / Peppol BIS XML sąskaitų ir kreditinių sąskaitų (EUR) importas su peržiūra; PVM atskaita pagal įmonės režimą; pasirenkama pirkimo debeto sąskaita; pirkimų sandėlio pasirinkimas.
- Banko išrašų importas: CSV, camt.053, MT940; dublikatų kontrolė; mokėjimų susiejimo pasiūlymai; apmokėjimai ne per banką; skolos pagal vėlavimo laikotarpius.
- Automatiniai didžiosios knygos įrašai; žurnalas, apyvartos žiniaraštis, pelno (nuostolių) ataskaita ir balansas, suderinimo aktai; standartinis Lietuvos sąskaitų planas.
- i.SAF XML (PVM mokėtojams), eilučių i.SAF kodai, FR0600 juodraštis ir `.ffdata` failo eksportas su rankinio tvarkymo sąrašu, mokesčių kalendorius.
- Darbo užmokestis: skaičiavimas (NPD, GPM, „Sodros“ įmokos) su laikinais 2026 m. parametrais, puslapis „Darbo užmokestis“, žurnalo įrašai.
- Ilgalaikis turtas: kortelės, nusidėvėjimo skaičiavimas ir įrašymas (su atšaukimu), rankinis keitimas su audito pėdsaku.
- Atsargos ir savikaina: svertinio vidurkio ir FIFO metodai (pagal nutylėjimą išjungta), judėjimai, rankinis koregavimas su priežastimi.
- VMI formų juodraščiai ir `.ffdata` failai: FR0564 (su FR0564P/R/T/TP priedais), GPM313 (iš užregistruotų darbo užmokesčio skaičiavimų, su 6 ir 7 laukų skirstymu pagal išmokėjimo datą), GPM312 (metinė suvestinė pagal darbuotojus su GPM312L ir GPM312U priedais) ir PLN204 (metinės pelno mokesčio deklaracijos juodraštis su PLN204S ir PLN204Z priedais); puslapiai, CSV/JSON/FFDATA, terminai registre.
- Taisyklių registras: tarifai, terminai ir darbo užmokesčio parametrai su galiojimo datomis; puslapis „Taisyklės“ (`/rules`); pelno mokesčio tarifas imamas iš registro pagal metus.
- Kontrahentai, laikotarpių uždarymas, apskaitos įrašų pakeitimų istorija.
- Naudotojai ir rolės (administratorius, buhalteris), slaptažodžio keitimas, prisijungimo bandymų ribojimas.
- Įmonės paketo eksportas/importas (apima ir darbo užmokesčio, ilgalaikio turto, atsargų lenteles), skyrių eksportas CSV/JSON, visos duomenų bazės kopija administratoriui (mygtukas puslapyje „Įmonių valdymas“, `/api/admin/backup`).
- Sąsaja, įtaisyta pagalba ir serverio klaidų pranešimai lietuvių, rusų ir anglų kalbomis.

**Svarbu**

Darbo užmokesčio parametrai ir tarifai yra laikini, kol buhalteris jų nepatikrino pagal oficialius šaltinius; prieš naudodami skaičiavimus ir juodraščius pateikimui, patikrinkite juos.

**Žinomi apribojimai**

- Nėra ryšio su VMI EDS ir i.MAS: i.SAF, FR0600 ir kitų formų failus įkeliate ir pateikiate patys. Nėra ryšio su „Sodra“.
- Nėra debetinių sąskaitų (DS); pirkimų pusėje yra tik tiekėjų kreditinės sąskaitos.
- Darbo užmokestis: SAM, 1-SD ir kitos formos nerengiamos; parametrai laikini (žr. „Svarbu“).
- Specialiosios formos PLN204A, PLN204N ir PLN204U nerengiamos; mokesčių kalendorius primena terminus (jei įjungta). Termino perkėlimo dėl švenčių taisyklė nepatikrinta – naudokite ankstesnę datą. i.SAF registrų terminų kalendoriuje nėra.
- FR0600: marža pildoma EDS; maržos kodai (PVM32/33/52/53) ir 23/24 laukų skaidymas – rankiniu būdu; 26–28 laukai užpildomi rankiniu būdu juodraščio skydelyje prieš eksportuojant `.ffdata`; kai užpildyti 32–34 laukai, 36 laukas neskaičiuojamas.
- i.SAF neeksportuoja kodų PVM6–8, PVM59, PVM9, PVM19, PVM25 (pardavimams) ir maržos kodų – juos reikia deklaruoti rankiniu būdu.
- Tiekėjų PDF sąskaitos neskaitomos; XML importas priima tik EUR, standartinį, 0 % ir neapmokestinamą PVM, be nuolaidų ir antkainių dokumento lygiu.
- camt.053 ir MT940 – tik EUR.
- Nėra automatinio ar suplanuoto sąskaitų ir priminimų siuntimo.
- Duomenų bazės atkūrimas – operatoriaus veiksmas (programoje nėra mygtuko „atkurti“).
- Programa veikia vienu egzemplioriumi (SQLite failas).

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

### 0.5.4 – облачная установка, умные отправители, налоговый календарь, настройки API

Архив: `kontas-download-0.5.4.zip`, рядом – файл контрольной суммы `kontas-download-0.5.4.zip.sha256`. Обновление с 0.4.0, 0.5.0, 0.5.1, 0.5.2 или 0.5.3: `update.ps1` / `update.sh`.

- Облачная установка: в образ больше не включается база данных, запуск происходит только после успешного восстановления данных из резервной копии; оригиналы документов в образ не попадают.
- Входящие документы: указан интервал проверки почты (в облачной версии – каждые 15 минут).
- Умные отправители: известные контакты, собственные пользователи, исходный отправитель пересланных писем, предложения разрешить отправителя и список отклонённых писем.
- Правила поставщиков: отдельные правила для каждого поставщика.
- Строки закупок: исправление импортированных цен (разовая миграция), новое окно редактирования, защита от нулевой суммы и цены с 4 знаками после запятой.
- Налоговый календарь: кнопка «Подготовить» (файлы, проверки, куда подавать), отметка о подаче с датой и регистрационным номером, напоминания со ссылками.
- Настройки – API: ключ распознавания, учётные данные государственных сервисов и адрес программы; слой подачи с кнопками «Подать» и «Проверить статус», которые поясняют, что государственные сервисы пока не подключены.

Контрольная сумма:
- Windows (PowerShell): `(Get-FileHash .\kontas-download-0.5.4.zip -Algorithm SHA256).Hash -eq (Get-Content .\kontas-download-0.5.4.zip.sha256).Split(' ')[0]` – должно быть `True`.
- macOS: `shasum -a 256 -c kontas-download-0.5.4.zip.sha256` – должно быть `OK`.
- Linux: `sha256sum -c kontas-download-0.5.4.zip.sha256` – должно быть `OK`.

### 0.5.3 – банк, иностранная валюта, кредитные счета, архив для проверки

Архив: `kontas-download-0.5.3.zip`, рядом – файл контрольной суммы `kontas-download-0.5.3.zip.sha256`. Обновление с 0.4.0, 0.5.0, 0.5.1 или 0.5.2: `update.ps1` / `update.sh`.

- Проверка дубликатов по содержимому: тот же документ (сильное совпадение) или возможный дубликат отмечается в очереди, подтвердить можно только с явной отметкой.
- Банк: сопоставление закупок и банковских операций – предложения с уровнем уверенности, привязка, отвязка, возмещение расходов, оплаченных лицом.
- Карточка основного средства и приход товаров из строк документа (необязательно, только после подтверждения).
- Документы в иностранной валюте с курсом ЕЦБ: курс на день документа или последний предыдущий, можно ввести курс вручную.
- Кредитные счета из PDF или фото регистрируются через общий путь кредитной закупки.
- XML e-счета из почты попадают в очередь; PDF остаётся видимым оригиналом, подтверждение – обычным путём импорта XML.
- Ориентировочная стоимость распознавания и месячный лимит расходов.
- Быстрый просмотр очереди с клавиатуры.
- Фото HEIC и подготовка фото перед распознаванием.
- Архив для налоговой проверки: ZIP с оригиналами, реестром и контрольными суммами.
- Счёт расходов по истории поставщика или предложение по содержимому.
- Облачная установка: оригиналы хранятся в объектном хранилище (локальный диск – только кэш), почтовый ящик проверяется каждые 15 минут, только если включён ящик документов.
- Безопасность развёртывания: живые данные не перезаписываются, резервная копия обязательна, паролей в коде нет.
- Полный список лицензий третьих сторон.

Примечания к обновлению: библиотеки для фото HEIC и подготовки фото (`sharp`, `heic-convert`) – новые зависимости; `update.ps1` / `update.sh` устанавливают их как обычно.

Контрольная сумма:
- Windows (PowerShell): `(Get-FileHash .\kontas-download-0.5.3.zip -Algorithm SHA256).Hash -eq (Get-Content .\kontas-download-0.5.3.zip.sha256).Split(' ')[0]` – должно быть `True`.
- macOS: `shasum -a 256 -c kontas-download-0.5.3.zip.sha256` – должно быть `OK`.
- Linux: `sha256sum -c kontas-download-0.5.3.zip.sha256` – должно быть `OK`.

### 0.5.2 – входящие документы, распознавание, приём по e-mail

Архив: `kontas-download-0.5.2.zip`, рядом – файл контрольной суммы `kontas-download-0.5.2.zip.sha256`. Обновление с 0.4.0, 0.5.0 или 0.5.1: `update.ps1` / `update.sh`.

- Раздел «Входящие документы»: распознавание документов закупок (фото и PDF) с помощью собственного ключа компании – ключ хранится только в настройках вашей компании. Распознанный черновик проверяется в форме рядом с оригиналом и становится записью закупки только после вашего подтверждения.
- Ручной ввод без распознавания: документ можно заполнить вручную, оригинал остаётся рядом.
- Кассовые чеки: номер чека и данные кассового аппарата, для чека показывается вычет PVM 0 %.
- Оплата: указывается, кто заплатил – компания или физическое лицо; расходы, оплаченные лицом, учитываются и возмещаются отдельно.
- Оригиналы включаются в резервные копии, удалённое хранилище и экспорт данных компании.
- Страница помощи по распознаванию документов и отправка фото с телефона (приложение устанавливается как PWA).
- Приём из почтового ящика (IMAP): документы, присланные на отдельную почту, попадают во «Входящие документы» без изменений DNS.

Контрольная сумма:
- Windows (PowerShell): `(Get-FileHash .\kontas-download-0.5.2.zip -Algorithm SHA256).Hash -eq (Get-Content .\kontas-download-0.5.2.zip.sha256).Split(' ')[0]` – должно быть `True`.
- macOS: `shasum -a 256 -c kontas-download-0.5.2.zip.sha256` – должно быть `OK`.
- Linux: `sha256sum -c kontas-download-0.5.2.zip.sha256` – должно быть `OK`.

### 0.5.1 – автоматизация, e-mail для корреспонденции, периоды на главной

Архив: `kontas-download-0.5.1.zip`, рядом – файл контрольной суммы `kontas-download-0.5.1.zip.sha256`. Обновление с 0.4.0 или 0.5.0: `update.ps1` / `update.sh`.

- Раздел «Автоматизация»: робот каждый день выставляет периодические счета и отправляет их с PDF, шлёт напоминания должникам в заданные дни после срока, разносит однозначные банковские платежи, отправляет недельную сводку и напоминания о налоговых сроках. Каждая задача включается отдельно, всё пишется в журнал.
- Поле контрагента «E-mail для корреспонденции»: письма из программы идут на него, если пусто – на обычный e-mail; в счетах остаются e-mail и телефон.
- Статистика на главной за выбранный период (по умолчанию этот год), любой период с–по и всё время.
- Периодический шаблон: клиент заранее не выбран, данные из последнего счёта клиента (серия, строки, срок оплаты, примечание), колонка PVM только для плательщика. Серия по умолчанию – самая используемая серия компании.
- Закрытие периодов: бухгалтер может закрыть, открыть – только администратор.
- Исправлено: цвет неоплаченных счетов на главной, выравнивание формы контрагента, термин «kontrahentas»; образ Docker меньше.

Контрольная сумма:
- Windows (PowerShell): `(Get-FileHash .\kontas-download-0.5.1.zip -Algorithm SHA256).Hash -eq (Get-Content .\kontas-download-0.5.1.zip.sha256).Split(' ')[0]` – должно быть `True`.
- macOS: `shasum -a 256 -c kontas-download-0.5.1.zip.sha256` – должно быть `OK`.
- Linux: `sha256sum -c kontas-download-0.5.1.zip.sha256` – должно быть `OK`.

### 0.5.0 – кадры, письма с шаблонами и подписью, автозаполнение

Архив: `kontas-download-0.5.0.zip`, рядом – файл контрольной суммы `kontas-download-0.5.0.zip.sha256`. Обновление с 0.4.0: `update.ps1` / `update.sh`.

- Раздел «Работники»: карточка (договор, вид отношений, контакты, банковский счёт, настройки зарплаты, заметки), зарплата по месяцам с итогами по годам, ежегодный отпуск по рабочим годам, расчёты по связанному контрагенту (банковские операции, проводки по счетам).
- Ведомости: расшифровка (начисления и удержания по кодам, НПД, гарантийный фонд, сумма к выплате); форма редактирования загружает настоящие строки работников. Ведомости, проводки которых уже есть в перенесённом журнале, не проводятся повторно. Справочники: должности, коды зарплаты, обозначения табеля, смены.
- Модуль «Письма»: письма контрагентам или на любой адрес, шаблоны с подстановками (контрагент, долг, неоплаченные счета и др.), групповая рассылка, предпросмотр, журнал отправленных.
- Подпись в письмах (включена по умолчанию) с конфигуратором и логотипом; добавляется к письмам, счетам и напоминаниям, видна в предпросмотре.
- Автозаполнение в формах из уже введённых данных: каталог товаров и услуг с последней ценой в счетах и шаблонах, серии, контрагенты, склады, города, план счетов, должности, работники.
- Единый тёмный стиль окон SMTP, контроля учёта и отправки счёта; заголовки колонок в строках периодического шаблона.

Контрольная сумма:
- Windows (PowerShell): `(Get-FileHash .\kontas-download-0.5.0.zip -Algorithm SHA256).Hash -eq (Get-Content .\kontas-download-0.5.0.zip.sha256).Split(' ')[0]` – должно быть `True`.
- macOS: `shasum -a 256 -c kontas-download-0.5.0.zip.sha256` – должно быть `OK`.
- Linux: `sha256sum -c kontas-download-0.5.0.zip.sha256` – должно быть `OK`.

### 0.4.0 – обновление одной командой

Архив: `kontas-download-0.4.0.zip`, рядом – файл контрольной суммы `kontas-download-0.4.0.zip.sha256`.

- Раз в 12 ч программа проверяет, опубликовал ли kontas.download новую версию (`https://kontas.download/latest.json`; никакие данные не отправляются, отключается `UPDATE_CHECK=off`). Администратор видит новую версию в Настройках и в боковом меню.
- Обновление одной командой: `update.ps1` (Windows) или `update.sh` (Linux / macOS). Проверяется SHA-256 архива, делается копия базы, старые файлы переносятся в `backups/previous-*`, контейнер пересобирается и проверяется; при ошибке возвращается прежняя версия. `web/prisma` и `.env` не меняются.
- При переходе с 0.3.0 и более ранних версий в этот раз архив нужно распаковать вручную (см. руководство); следующие обновления выполнит `update.ps1` / `update.sh`.

Контрольная сумма:
- Windows (PowerShell): `(Get-FileHash .\kontas-download-0.4.0.zip -Algorithm SHA256).Hash -eq (Get-Content .\kontas-download-0.4.0.zip.sha256).Split(' ')[0]` – должно быть `True`.
- macOS: `shasum -a 256 -c kontas-download-0.4.0.zip.sha256` – должно быть `OK`.
- Linux: `sha256sum -c kontas-download-0.4.0.zip.sha256` – должно быть `OK`.

### 0.3.0 – новый дизайн, светлая тема, настройки и логотип компании

Архив: `kontas-download-0.3.0.zip`, рядом – файл контрольной суммы `kontas-download-0.3.0.zip.sha256`.

- Новое оформление: шрифт Geist, единая палитра, иконки Phosphor, диалоги подтверждения вместо окон браузера, страницы 404 и загрузки.
- Страница системных настроек: язык, тёмная / светлая / как на устройстве тема, учётная запись, копия базы данных.
- Смена статуса оплаты счёта в списке и в окне редактирования (наличными с записью в журнале); статус определяется по остатку; новые счета по умолчанию неоплачены.
- Копирование счёта: отметьте счёт в списке, и откроется форма нового счёта с заполненными данными.
- Логотип компании (PNG или JPEG): показывается вверху PDF счетов и в боковой панели; в форме компании появилось поле свободных заметок.
- Таблица PDF счёта: заголовки и значения выровнены по колонкам.
- Модальные окна прокручиваются, если не помещаются на экран, и имеют единый стиль; в заголовке вкладки браузера показан раздел.
- Развёртывание Cloudflare Containers: снимки базы данных в R2, закрытые внутренние мосты, один экземпляр контейнера.
- Скрипт исправления импорта `scripts/repair_item_names.py` восстанавливает конкретные названия строк из экспорта старой системы.

Контрольная сумма:
- Windows (PowerShell): `(Get-FileHash .\kontas-download-0.3.0.zip -Algorithm SHA256).Hash -eq (Get-Content .\kontas-download-0.3.0.zip.sha256).Split(' ')[0]` – должно быть `True`.
- macOS: `shasum -a 256 -c kontas-download-0.3.0.zip.sha256` – должно быть `OK`.
- Linux: `sha256sum -c kontas-download-0.3.0.zip.sha256` – должно быть `OK`.

### 0.2.3 – черновик PLN204 и расширенный экспорт форм VMI

Архив: `kontas-download-0.2.3.zip`, рядом – файл контрольной суммы `kontas-download-0.2.3.zip.sha256`.

- Новый черновик годовой декларации по налогу на прибыль PLN204 и экспорт `.ffdata` с приложениями PLN204S и PLN204Z.
- Экспорт GPM312 `.ffdata` с выбором ставки L9 и приложением для нерезидентов GPM312U.
- Экспорт FR0564 `.ffdata` с приложениями FR0564R и FR0564T/FR0564TP.
- Черновик FR0600: ручной ввод полей 26–28 и автоматический пересчёт полей 35/36.
- Расчёт зарплаты: дата выплаты для разделения полей 6 и 7 формы GPM313.
- PDF счёта покупателю: отметка об обратном начислении по кодам PVM15, PVM34 и PVM25–PVM27.
- Сообщения об ошибках сервера переведены на литовский, русский и английский языки.

Контрольная сумма:

- Windows (PowerShell): `(Get-FileHash .\kontas-download-0.2.3.zip -Algorithm SHA256).Hash -eq (Get-Content .\kontas-download-0.2.3.zip.sha256).Split(' ')[0]` – должно быть `True`.
- macOS: `shasum -a 256 -c kontas-download-0.2.3.zip.sha256` – должно быть `OK`.
- Linux: `sha256sum -c kontas-download-0.2.3.zip.sha256` – должно быть `OK`.

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
- PDF для клиента на литовском, русском или английском языке (без внутренних статусов и заметок; отметка об обратном начислении добавляется при назначении кода PVM15, PVM34 или PVM25–PVM27); отправка через SMTP самой компании; архив каждого отправленного PDF с SHA-256; напоминания о долгах отправляются только вручную.
- Закупки и кредитные счета поставщиков; импорт XML-счетов и кредитных счетов UBL 2.1 / Peppol BIS (EUR) с предпросмотром; вычет НДС по режиму компании; выбираемый дебетовый счёт закупки; выбор склада в закупках.
- Импорт банковских выписок: CSV, camt.053, MT940; защита от дубликатов; предложения по сопоставлению платежей; расчёты не через банк; долги по периодам просрочки.
- Автоматические проводки главной книги; журнал, оборотная ведомость, отчёт о прибылях и убытках и баланс, акты сверки; стандартный литовский план счетов.
- i.SAF XML (для плательщиков НДС), коды i.SAF по строкам, черновик и экспорт `.ffdata` FR0600 со списком для ручной обработки, налоговый календарь.
- Зарплата: расчёт (НПД, GPM, взносы «Содры») с временными параметрами на 2026 год, страница «Зарплата», записи в журнале.
- Основные средства: карточки, расчёт и проводка амортизации (с отменой), ручные изменения с журналом аудита.
- Запасы и себестоимость: методы средневзвешенной и FIFO (по умолчанию выключено), движения, ручная корректировка с причиной.
- Черновики и файлы `.ffdata` форм VMI: FR0564 (с приложениями FR0564P/R/T/TP), GPM313 (из зарегистрированных расчётов зарплаты, с разбивкой полей 6 и 7 по дате выплаты), GPM312 (годовая сводка по работникам с приложениями GPM312L и GPM312U) и PLN204 (черновик годовой декларации по налогу на прибыль с приложениями PLN204S и PLN204Z); страницы, CSV/JSON/FFDATA, сроки в реестре.
- Реестр правил: ставки, сроки и параметры зарплаты с датами действия; страница «Правила» (`/rules`); ставка налога на прибыль берётся из реестра по годам.
- Контрагенты, закрытие периодов, история изменений учётных записей.
- Пользователи и роли (администратор, бухгалтер), смена пароля, ограничение попыток входа.
- Экспорт/импорт пакета компании (включая таблицы зарплаты, основных средств и запасов), экспорт разделов в CSV/JSON, копия всей базы данных для администратора (кнопка на странице «Управление компаниями», `/api/admin/backup`).
- Интерфейс, встроенная справка и сообщения об ошибках сервера на литовском, русском и английском языках.

**Важно**

Параметры и ставки зарплаты временные, пока бухгалтер не проверил их по официальным источникам; проверьте их, прежде чем полагаться на расчёты и черновики при подаче.

**Известные ограничения**

- Нет связи с VMI EDS и i.MAS: файлы i.SAF, FR0600 и других форм вы загружаете и подаёте сами. Нет связи с «Содрой».
- Нет дебетовых счетов (DS); на стороне закупок есть только кредитные счета поставщиков.
- Зарплата: SAM, 1-SD и другие формы не готовятся; параметры временные (см. «Важно»).
- Специальные формы PLN204A, PLN204N и PLN204U не готовятся; налоговый календарь напоминает о сроках (если включён). Правило переноса срока из-за праздников не проверено – используйте более раннюю дату. Сроков реестров i.SAF в календаре нет.
- FR0600: маржа заполняется в EDS; коды маржи (PVM32/33/52/53) и разделение полей 23/24 – вручную; поля 26–28 заполняются вручную в панели черновика перед экспортом `.ffdata`; при заполненных полях 32–34 поле 36 не вычисляется.
- i.SAF не экспортирует коды PVM6–8, PVM59, PVM9, PVM19, PVM25 (по продажам) и коды маржи – их нужно декларировать вручную.
- PDF-счета поставщиков не читаются; XML-импорт принимает только EUR, стандартный, нулевой и освобождённый НДС, без скидок и надбавок на уровне документа.
- camt.053 и MT940 – только EUR.
- Нет автоматической или запланированной отправки счетов и напоминаний.
- Восстановление базы данных – действие оператора (в программе нет кнопки «восстановить»).
- Программа работает в одном экземпляре (файл SQLite).

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

### 0.5.4 – cloud installation, smart senders, tax calendar, API settings

Archive: `kontas-download-0.5.4.zip`, with the checksum file `kontas-download-0.5.4.zip.sha256` next to it. Updating from 0.4.0, 0.5.0, 0.5.1, 0.5.2 or 0.5.3: `update.ps1` / `update.sh`.

- Cloud installation: the image no longer contains a database, and startup happens only after data has been restored and verified from a backup; document originals are excluded from the image.
- Received documents: the mail check interval is stated (in the cloud version, every 15 minutes).
- Smart senders: known contacts, own users, the original sender of forwarded mail, suggestions to allow a sender, and a list of refused mail.
- Supplier rules: separate rules for each supplier.
- Purchase lines: repair of imported prices (a one-time migration), a redesigned edit window, protection against a zero total and prices with 4 decimals.
- Tax calendar: a "Prepare" button (files, checks, where to file), marking as submitted with a date and registration no., reminders with links.
- Settings – API: the recognition key, state service credentials and the installation address; a filing layer with "Submit" and "Check status" buttons that explain that the state services are not connected yet.

Checksum:
- Windows (PowerShell): `(Get-FileHash .\kontas-download-0.5.4.zip -Algorithm SHA256).Hash -eq (Get-Content .\kontas-download-0.5.4.zip.sha256).Split(' ')[0]` – must be `True`.
- macOS: `shasum -a 256 -c kontas-download-0.5.4.zip.sha256` – must be `OK`.
- Linux: `sha256sum -c kontas-download-0.5.4.zip.sha256` – must be `OK`.

### 0.5.3 – bank, foreign currency, credit notes, archive for inspection

Archive: `kontas-download-0.5.3.zip`, with the checksum file `kontas-download-0.5.3.zip.sha256` next to it. Updating from 0.4.0, 0.5.0, 0.5.1 or 0.5.2: `update.ps1` / `update.sh`.

- Content duplicate check: the same document (strong match) or a possible duplicate is flagged in the queue; confirming requires an explicit tick.
- Bank: matching purchases with bank transactions – suggestions with a confidence level, linking, unlinking, and reimbursement of expenses paid by a person.
- Fixed asset card and stock receipt from document lines (optional, only after confirmation).
- Foreign currency documents with ECB rates: the rate for the document date or the last earlier one; a rate can be entered by hand.
- Credit notes from PDFs or photos are registered through the common credit purchase path.
- XML e-invoices from e-mail go into the queue; the PDF stays as the visual original, and confirmation uses the usual XML import path.
- Recognition cost estimate and monthly spending limit.
- Fast keyboard review of the queue.
- HEIC photos and photo preparation before recognition.
- Archive for a tax inspection: a ZIP with originals, a register and checksums.
- Expense account from the supplier's history or a suggestion based on content.
- Cloud installation: originals are stored in object storage (the local disk is only a cache), and the mailbox is checked every 15 minutes, only when a document mailbox is enabled.
- Deployment safety: live data is never overwritten, a backup is mandatory, no passwords in code.
- Full third-party licence list.

Upgrade notes: the HEIC and photo preparation libraries (`sharp`, `heic-convert`) are new dependencies; `update.ps1` / `update.sh` install them as usual.

Checksum:
- Windows (PowerShell): `(Get-FileHash .\kontas-download-0.5.3.zip -Algorithm SHA256).Hash -eq (Get-Content .\kontas-download-0.5.3.zip.sha256).Split(' ')[0]` – must be `True`.
- macOS: `shasum -a 256 -c kontas-download-0.5.3.zip.sha256` – must be `OK`.
- Linux: `sha256sum -c kontas-download-0.5.3.zip.sha256` – must be `OK`.

### 0.5.2 – received documents, recognition, intake by e-mail

Archive: `kontas-download-0.5.2.zip`, with the checksum file `kontas-download-0.5.2.zip.sha256` next to it. Updating from 0.4.0, 0.5.0 or 0.5.1: `update.ps1` / `update.sh`.

- "Received documents" section: purchase documents (photos and PDFs) are recognised with the company's own access key, which is stored only in your company's settings. The recognised draft is reviewed in a form next to the original and becomes a purchase record only after you confirm it.
- Manual entry without recognition: a document can be filled in by hand, with the original still visible next to it.
- Cash register receipts: receipt number and cash register details; a receipt shows a 0 % VAT deduction.
- Payment: who paid is recorded – the company or a person; expenses paid by a person are tracked and reimbursed separately.
- Originals are included in backups, remote storage and the company data export.
- A help page about document recognition and sharing a photo from a phone (the app installs as a PWA).
- Mailbox intake (IMAP): documents sent to a dedicated mailbox land in "Received documents" without any DNS changes.

Checksum:
- Windows (PowerShell): `(Get-FileHash .\kontas-download-0.5.2.zip -Algorithm SHA256).Hash -eq (Get-Content .\kontas-download-0.5.2.zip.sha256).Split(' ')[0]` – must be `True`.
- macOS: `shasum -a 256 -c kontas-download-0.5.2.zip.sha256` – must be `OK`.
- Linux: `sha256sum -c kontas-download-0.5.2.zip.sha256` – must be `OK`.

### 0.5.1 – automation, correspondence e-mail, overview periods

Archive: `kontas-download-0.5.1.zip`, with the checksum file `kontas-download-0.5.1.zip.sha256` next to it. Updating from 0.4.0 or 0.5.0: `update.ps1` / `update.sh`.

- Automation section: every day the robot issues recurring invoices and e-mails them with the PDF, sends reminders to debtors on the given days after the due date, links unambiguous bank payments, sends the weekly summary and tax deadline reminders. Each job is switched on separately and everything is logged.
- Counterparty field "Correspondence e-mail": letters from the program go there, empty means the e-mail; invoices keep the e-mail and phone.
- Overview statistics for a chosen period (this year by default), any from–to range and all time.
- Recurring template: no client chosen in advance, details from the client's last invoice (series, lines, payment term, notes), the VAT column only for VAT payers. The default series is the company's most used one.
- Period closing: an accountant can close a period, only an administrator can reopen it.
- Fixed: colour of unpaid invoices on the overview, counterparty form alignment, the term "kontrahentas"; a smaller Docker image.

Checksum:
- Windows (PowerShell): `(Get-FileHash .\kontas-download-0.5.1.zip -Algorithm SHA256).Hash -eq (Get-Content .\kontas-download-0.5.1.zip.sha256).Split(' ')[0]` – must be `True`.
- macOS: `shasum -a 256 -c kontas-download-0.5.1.zip.sha256` – must be `OK`.
- Linux: `sha256sum -c kontas-download-0.5.1.zip.sha256` – must be `OK`.

### 0.5.0 – personnel, letters with templates and signature, autocomplete

Archive: `kontas-download-0.5.0.zip`, with the checksum file `kontas-download-0.5.0.zip.sha256` next to it. Updating from 0.4.0: `update.ps1` / `update.sh`.

- Employees section: employee card (contract, relationship type, contacts, bank account, payroll settings, notes), pay by month with yearly totals, annual leave by work year, settlements by the linked counterparty (bank transactions, journal by account).
- Payrolls: breakdown (additions and deductions by payroll code, NPD, guarantee fund, amount paid out); the edit form loads the real employee rows. Payrolls whose entries are already in an imported general journal are not posted again. Reference books: positions, payroll codes, time-card markings, shifts.
- Letters module: letters to counterparties or any address, templates with placeholders (counterparty, amount owed, unpaid invoices and more), group sending, preview, log of sent letters.
- E-mail signature (on by default) with a configurator and the logo; added to letters, invoices and reminders, shown in previews.
- Autocomplete in forms from data already entered: item and service catalog with the latest price on invoices and templates, series, counterparties, warehouses, cities, chart of accounts, positions, employees.
- One dark style for the SMTP, accounting control and invoice sending windows; column headers on recurring template lines.

Checksum:
- Windows (PowerShell): `(Get-FileHash .\kontas-download-0.5.0.zip -Algorithm SHA256).Hash -eq (Get-Content .\kontas-download-0.5.0.zip.sha256).Split(' ')[0]` – must be `True`.
- macOS: `shasum -a 256 -c kontas-download-0.5.0.zip.sha256` – must be `OK`.
- Linux: `sha256sum -c kontas-download-0.5.0.zip.sha256` – must be `OK`.

### 0.4.0 – one-command updates

Archive: `kontas-download-0.4.0.zip`, with the checksum file `kontas-download-0.4.0.zip.sha256` next to it.

- Every 12 h the program checks whether kontas.download has published a newer version (`https://kontas.download/latest.json`; no data is sent; turn off with `UPDATE_CHECK=off`). The administrator sees the new version in Settings and in the sidebar.
- One-command update: `update.ps1` (Windows) or `update.sh` (Linux / macOS). The archive SHA-256 is verified, the database is backed up, old files move to `backups/previous-*`, the container is rebuilt and checked; on failure the previous version is restored. `web/prisma` and `.env` are left untouched.
- Coming from 0.3.0 or older, unpack the archive by hand this one time (see the manual); later updates are done by `update.ps1` / `update.sh`.

Checksum:
- Windows (PowerShell): `(Get-FileHash .\kontas-download-0.4.0.zip -Algorithm SHA256).Hash -eq (Get-Content .\kontas-download-0.4.0.zip.sha256).Split(' ')[0]` – must be `True`.
- macOS: `shasum -a 256 -c kontas-download-0.4.0.zip.sha256` – must be `OK`.
- Linux: `sha256sum -c kontas-download-0.4.0.zip.sha256` – must be `OK`.

### 0.3.0 – new design, light theme, settings and company logo

Archive: `kontas-download-0.3.0.zip`, with the checksum file `kontas-download-0.3.0.zip.sha256` next to it.

- New look: Geist typeface, one colour palette, Phosphor icons, confirmation dialogs instead of browser prompts, 404 and loading pages.
- System settings page: language, dark / light / match-device theme, account, database backup.
- Changing an invoice's payment status in the list and in the edit window (cash, with a journal entry); the status follows the open balance; new invoices are unpaid by default.
- Copy invoice: select an invoice in the list and a new invoice form opens, prefilled with its data.
- Company logo (PNG or JPEG): shown at the top of invoice PDFs and in the sidebar; the company form gained a free-form notes field.
- Invoice PDF table: headers and values are aligned by column.
- Modal windows scroll when they do not fit the screen and share one style; the browser tab title shows the section.
- Cloudflare Containers deployment: database snapshots to R2, locked internal bridges, a single container instance.
- The import repair script `scripts/repair_item_names.py` restores concrete line names from the old system's export.

Checksum:
- Windows (PowerShell): `(Get-FileHash .\kontas-download-0.3.0.zip -Algorithm SHA256).Hash -eq (Get-Content .\kontas-download-0.3.0.zip.sha256).Split(' ')[0]` must print `True`.
- macOS: `shasum -a 256 -c kontas-download-0.3.0.zip.sha256` must print `OK`.
- Linux: `sha256sum -c kontas-download-0.3.0.zip.sha256` must print `OK`.

### 0.2.3 – PLN204 draft and extended VMI forms export

Archive: `kontas-download-0.2.3.zip`, with the checksum file `kontas-download-0.2.3.zip.sha256` next to it.

- New corporate income tax return draft PLN204 and `.ffdata` export with appendices PLN204S and PLN204Z.
- GPM312 `.ffdata` export with L9 tax rate selection and non-resident appendix GPM312U.
- FR0564 `.ffdata` export with appendices FR0564R and FR0564T/FR0564TP.
- FR0600 draft: manual entry of fields 26–28 and automatic recalculation of fields 35/36.
- Payroll: payout date for splitting GPM313 fields 6 and 7.
- Customer invoice PDF: reverse-charge notice for PVM15, PVM34 and PVM25–PVM27 codes.
- Server error messages translated to Lithuanian, Russian and English.

Checksum:

- Windows (PowerShell): `(Get-FileHash .\kontas-download-0.2.3.zip -Algorithm SHA256).Hash -eq (Get-Content .\kontas-download-0.2.3.zip.sha256).Split(' ')[0]` must print `True`.
- macOS: `shasum -a 256 -c kontas-download-0.2.3.zip.sha256` must print `OK`.
- Linux: `sha256sum -c kontas-download-0.2.3.zip.sha256` must print `OK`.

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
- Customer PDF in Lithuanian, Russian or English (without internal statuses and notes; a reverse-charge notice is added when code PVM15, PVM34 or PVM25–PVM27 is assigned); e-mail through the company's own SMTP; archive of every sent PDF with SHA-256; payment reminders sent manually only.
- Purchases and supplier credit notes; import of UBL 2.1 / Peppol BIS XML invoices and credit notes (EUR) with a preview; VAT deduction by the company's mode; selectable purchase debit account; warehouse choice on purchases.
- Bank statement import: CSV, camt.053, MT940; duplicate protection; payment matching suggestions; settlements outside the bank; receivables ageing.
- Automatic general ledger entries; journal, trial balance, income statement and balance sheet, reconciliation statements; standard Lithuanian chart of accounts.
- i.SAF XML (VAT payers), i.SAF codes per line, FR0600 draft and `.ffdata` export with a manual-handling list, tax calendar.
- Payroll: calculation (NPD, GPM, Sodra contributions) with provisional 2026 parameters, a Payroll page, ledger entries.
- Fixed assets: asset cards, depreciation calculation and posting (with reversal), manual changes with an audit trail.
- Inventory and costing: weighted-average and FIFO methods (off by default), stock movements, manual adjustments with a reason.
- VMI form drafts and `.ffdata` files: FR0564 (with appendices FR0564P/R/T/TP), GPM313 (from registered payroll calculations, with fields 6 and 7 split by payout date), GPM312 (annual summary per employee with appendices GPM312L and GPM312U) and PLN204 (annual corporate income tax declaration draft with appendices PLN204S and PLN204Z); pages, CSV/JSON/FFDATA, deadlines in the registry.
- Rules registry: rates, deadlines and payroll parameters with effective dates; a Rules page (`/rules`); the corporate income tax rate is taken from the registry by year.
- Counterparties, period closing, change history of accounting records.
- Users and roles (administrator, accountant), password change, sign-in throttling.
- Company package export/import (including the payroll, fixed asset and inventory tables), CSV/JSON section exports, whole-database copy for administrators (button on the "Company management" page, `/api/admin/backup`).
- Interface, built-in help and server error messages in Lithuanian, Russian and English.

**Important**

Payroll parameters and rates are provisional until the accountant has verified them against the official sources; check them before relying on the calculations and drafts for filing.

**Known limitations**

- No connection to VMI EDS or i.MAS: you upload and submit the i.SAF, FR0600 and other form files yourself. No connection to Sodra.
- No debit notes (DS); on the purchase side only supplier credit notes exist.
- Payroll: SAM, 1-SD and other forms are not prepared; parameters are provisional (see "Important").
- Special forms PLN204A, PLN204N and PLN204U are not prepared; the tax calendar reminds of due dates (when enabled). The holiday carry-over rule is not verified – use the earlier date. i.SAF register deadlines are not in the calendar.
- FR0600: the margin is completed in EDS; margin codes (PVM32/33/52/53) and the 23/24 split are manual; fields 26–28 are entered manually in the draft panel before exporting `.ffdata`; field 36 is not computed when fields 32–34 are filled.
- i.SAF does not export the codes PVM6–8, PVM59, PVM9, PVM19, PVM25 on sales and the margin codes; declare them manually.
- Supplier PDF invoices are not read; the XML import accepts only EUR, standard, zero-rated and exempt VAT, and no document-level discounts or charges.
- camt.053 and MT940 in EUR only.
- No automatic or scheduled sending of invoices or reminders.
- Restoring a database is an operator procedure (there is no restore button).
- Single instance only (SQLite file).

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
