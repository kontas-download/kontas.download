[Lietuvių](README.md) | [Русский](README.ru.md) | [English](README.en.md)

# kontas.download

Svetainė ir atsisiuntimas: https://kontas.download

Nemokama, savo serveryje veikianti apskaitos programa Lietuvos įmonėms. Visi duomenys lieka pas jus: jie saugomi vienoje SQLite duomenų bazėje jūsų kompiuteryje ar serveryje, o programa nesiunčia jų į jokias išorines paslaugas. Sąsaja pilnai veikia trimis kalbomis: lietuvių, rusų ir anglų.

Programa paruošta veikti Docker konteineryje (Next.js 16, React 19, TypeScript, SQLite).

## Ką programa moka

- **Pardavimai:** pardavimų sąskaitos faktūros (SF), kreditinės sąskaitos (KS), periodinės sąskaitos.
- **Pirkimai:** pirkimų dokumentai, PVM atskaita, tiekėjų kreditinės sąskaitos, tiekėjų e. sąskaitų (UBL XML) importas.
- **PVM režimai:** PVM mokėtojas, ne PVM mokėtojas ir SVS; pardavėjas ir pirkėjas gali būti PVM mokėtojais nepriklausomai vienas nuo kito. Istorinių sąskaitų mokesčių statusas išsaugomas.
- **PDF ir el. paštas:** sąskaitos PDF pirkėjo kalba (lietuvių, rusų ar anglų); siuntimas el. paštu per pardavėjo įmonės SMTP; išsiųstos sąskaitos PDF archyvas. Kliento PDF neturi vidinių apmokėjimo statusų ir pastabų.
- **Bankas:** banko išrašų importas (CSV, camt.053, MT940), mokėjimų susiejimas su dokumentais, atsiskaitymai ne per banką.
- **Skolos:** gautinų sumų apžvalga ir priminimai.
- **Mokesčiai:** i.SAF 1.2 XML eksportas, FR0600, FR0564, GPM313, GPM312 ir PLN204 juodraščiai bei EDS `.ffdata` failų eksportas, mokesčių ir tarifų taisyklės pagal metus, mokesčių kodai, mokesčių kalendorius.
- **Apskaita:** didžioji knyga (žurnalas), apyvartos žiniaraštis, pelno (nuostolių) ataskaita ir balansas, sąskaitų planas, tarpusavio skolų suderinimo aktai, uždaryti laikotarpiai ir pakeitimų istorija.
- **Kita:** kontrahentai, sandėlis ir atsargų savikaina (FIFO arba svertinis vidurkis), ilgalaikio turto registras ir mėnesinis nusidėvėjimas, darbo užmokesčio skaičiavimai (NPD, progresiniai GPM tarifai, „Sodros“ lubos, DU žiniaraščiai).
- **Kelios įmonės:** neribotas įmonių skaičius vienoje programoje, kiekvienos duomenys atskirti.
- **Duomenys:** įmonės paketo eksportas ir importas, visos duomenų bazės kopija (administratoriui).
- **Naudotojai:** keli naudotojai, rolės „administratorius“ ir „buhalteris“, paskyros išjungimas, bandymų prisijungti ribojimas.

Išsami instrukcija yra pačios programos žinyne (meniu „Žinynas“).

## Ribojimai

Programa nėra mokesčių ar teisinė konsultacija; už deklaracijas, apskaitos politiką ir duomenų teisingumą atsako naudotojas ir jo buhalteris.

- Niekas **automatiškai nepateikiama VMI ar „Sodrai“**: nėra ryšio su EDS, i.MAS ar „Sodra“. Programa paruošia failus ir juodraščius, o pateikti juos reikia patiems.
- Nėra ryšio su Sodra.
- Nėra debetinių sąskaitų (DS).
- Darbo užmokesčio rezultatai yra preliminarūs, kol juos patikrina buhalteris; „Sodros“ SAM ir 1-SD formos nerengiamos.
- GPM313, GPM312, FR0564 ir PLN204 rengiami kaip juodraščiai ir EDS `.ffdata` failai su neužpildomų laukų sąrašu (GPM313 6 ir 7 laukai paskirstomi pagal išmokėjimo datą; GPM312 `.ffdata` palaiko L9/U9 tarifą ir nerezidentų priedą GPM312U; FR0564 `.ffdata` palaiko priedus FR0564P/R/T/TP; PLN204 `.ffdata` palaiko priedus PLN204S ir PLN204Z, o specialios modifikacijos PLN204A/N/U nerengiamos). Mokesčių kalendorius primena terminus.
- FR0600 skydelyje ir `.ffdata` faile galima rankiniu būdu įvesti 26–28 laukus (importo PVM ir atskaitos %); maržos schema ir kai kurie specialūs i.SAF kodai pildomi rankiniu būdu EDS. Atvirkštinio apmokestinimo nuoroda pirkėjo PDF sąskaitoje pridedama priskyrus eilutei PVM15, PVM34 ar PVM25–PVM27 kodą.
- Parduotų prekių savikainos nurašymas pagal nutylėjimą išjungtas (`NONE`); atsargų savikainą (FIFO arba svertinį vidurkį) ir ilgalaikio turto nusidėvėjimą turi patikrinti buhalteris.
- Tiekėjų PDF sąskaitos neskaitomos (nėra OCR); importuojamas tik XML (UBL / Peppol).
- Nėra automatinio ar suplanuoto sąskaitų ir priminimų siuntimo: kiekvienas siuntimas yra rankinis veiksmas.

Daugiau: žinyno puslapis „Ribojimai: ko programa nedaro“ ir [docs/VMI-EDS-AUTOMATION.md](docs/VMI-EDS-AUTOMATION.md).

## Greita pradžia (Docker)

Reikia Docker su Compose v2.

```bash
docker compose up -d --build
```

Programa pasiekiama adresu **http://localhost:3200** (konteineris `kontas-app`; prievadas atidarytas tik 127.0.0.1).

Pirmą kartą paleidus su tuščia duomenų baze programa sukuria standartinį Lietuvos sąskaitų planą ir administratorių. Numatytasis el. paštas yra `admin@kontas.local`, **numatytojo slaptažodžio nėra**: atsitiktinis vienkartinis slaptažodis vieną kartą parodomas konteinerio žurnale:

```bash
docker logs kontas-app
```

Prisijunkite ir iškart pasikeiskite slaptažodį (rakto mygtukas šoninio meniu apačioje). Kitą administratoriaus el. paštą ar slaptažodį (bent 10 simbolių) galima nurodyti kintamaisiais `ADMIN_EMAIL` ir `ADMIN_PASSWORD` prieš pirmą paleidimą. Pamiršus slaptažodį:

```bash
docker exec -it kontas-app node scripts/set-password.cjs el.pastas@pavyzdys.lt
```

Norint saugoti SMTP slaptažodžius (sąskaitų siuntimui), prieš paleidžiant reikia nustatyti `SMTP_ENCRYPTION_KEY` (64 šešioliktainiai simboliai; sugeneravimo komanda yra `web/.env.example`) ir saugoti šį raktą atskirai nuo duomenų bazės kopijų.

Duomenų bazė saugoma kataloge `web/prisma` (Docker tomas), todėl duomenys išlieka perkūrus konteinerį. Serveris su HTTPS: žr. [deploy/README.md](deploy/README.md).

## Vietinis kūrimas

Reikia Node.js 22 (tokios pat versijos kaip Dockerfile).

```bash
cd web
npm install
cp .env.example .env        # DATABASE_URL, APP_ORIGIN
node scripts/bootstrap.cjs  # sukuria tuščią duomenų bazę ir administratorių (slaptažodis išvedamas į konsolę)
npm run dev
npm test
```

Daugiau apie kūrimą: [web/README.md](web/README.md).

## Projekto struktūra

- `web/` – programa (Next.js, SQLite, Dockerfile, bandymai, paleidimo scenarijai `web/scripts`).
- `deploy/` – diegimas serveryje su HTTPS (Caddy): [deploy/README.md](deploy/README.md).
- `docs/` – dokumentacija, pvz. [VMI / EDS automatizavimo pastabos](docs/VMI-EDS-AUTOMATION.md).
- `docker-compose.yml` – vietinis paleidimas (konteineris `kontas-app`, prievadas 3200).
- `README.md`, `README.ru.md`, `README.en.md` – šis aprašas.

## Kalbų politika

Pagrindinė projekto dokumentacijos kalba yra **lietuvių**. Rusiški ir angliški variantai (`*.ru.md`, `*.en.md`) yra jų vertimai ir guli šalia originalo; jei variantai skiriasi, galioja lietuviškas. Programos sąsaja ir žinynas visada turi tris kalbas (lt, ru, en).

## Dokumentacija

- [Diegimas serveryje](deploy/README.md)
- [Saugumas ir prisijungimas](web/SECURITY.md)
- [Kliento sąskaitos ir el. paštas](web/DOCUMENTS.md)
- [Programuotojo aprašas](web/README.md)
- [VMI / EDS automatizavimas](docs/VMI-EDS-AUTOMATION.md)

## Licencija

Programa naudojama pagal [LICENSE](LICENSE) (kontas.download licencija: **naudoti galima, platinti negalima**; vertimai: [EN](LICENSE.en.md), [RU](LICENSE.ru.md)). Trečiųjų šalių komponentų sąrašas: [THIRD-PARTY-NOTICES.md](THIRD-PARTY-NOTICES.md). Licencijos tekstas yra projektas, kurį prieš skelbimą peržiūri teisininkas.

## Parama projektui

Programa nemokama. Jei norite paremti projekto kūrėjus, informacija bus skelbiama projekto svetainėje, kai ji bus paleista. Parama nėra privaloma ir neturi įtakos programos funkcijoms.

## Pranešimas apie pažeidžiamumus

Apie saugumo klaidas praneškite ne viešame pranešime apie klaidą. Žr. [web/SECURITY.md](web/SECURITY.md).
