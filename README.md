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
- **Mokesčiai:** i.SAF 1.2 XML eksportas, FR0600 juodraštis, mokesčių kodai, mokesčių kalendorius.
- **Apskaita:** didžioji knyga (žurnalas), apyvartos žiniaraštis, pelno (nuostolių) ataskaita ir balansas, sąskaitų planas, tarpusavio skolų suderinimo aktai, uždaryti laikotarpiai ir pakeitimų istorija.
- **Kita:** kontrahentai, sandėlis ir atsargos, darbo užmokesčio skaičiuoklė.
- **Kelios įmonės:** neribotas įmonių skaičius vienoje programoje, kiekvienos duomenys atskirti.
- **Duomenys:** įmonės paketo eksportas ir importas, visos duomenų bazės kopija (administratoriui).
- **Naudotojai:** keli naudotojai, rolės „administratorius“ ir „buhalteris“, paskyros išjungimas, bandymų prisijungti ribojimas.

Išsami instrukcija yra pačios programos žinyne (meniu „Žinynas“).

## Ribojimai

Programa nėra mokesčių ar teisinė konsultacija; už deklaracijas, apskaitos politiką ir duomenų teisingumą atsako naudotojas ir jo buhalteris.

- Niekas **automatiškai nepateikiama VMI**: nėra ryšio su EDS ar i.MAS. Programa tik paruošia i.SAF XML failą ir FR0600 juodraštį, o pateikti juos reikia patiems.
- Nėra ryšio su Sodra.
- Nėra debetinių sąskaitų (DS).
- Darbo užmokesčio modulis paprastas: pasiūlytas skaičiavimas supaprastintas (be NPD, progresinių GPM tarifų, Sodros lubų), galutines sumas įvedate jūs.
- Neruošiamos PLN204, GPM312/GPM313 ir FR0564 deklaracijos; mokesčių kalendorius tik primena terminus.
- Sąskaitoje nėra automatinės atvirkštinio apmokestinimo (reverse charge) žymos paslaugoms ES PVM mokėtojui. Įrašyti jos į pirkėjo PDF programa dar neleidžia (vidinės pastabos į PDF nepatenka), todėl šį įrašą ir FR0564 tvarko buhalteris.
- Nėra automatinio ilgalaikio turto nusidėvėjimo ir atsargų savikainos nurašymo.
- Nėra automatinio sąskaitų siuntimo pagal tvarkaraštį: kiekvienas siuntimas yra rankinis veiksmas.

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
- `site/` – projekto svetainė.
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
