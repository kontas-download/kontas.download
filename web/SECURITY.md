[Lietuvių](SECURITY.md) | [Русский](SECURITY.ru.md) | [English](SECURITY.en.md)

# Prisijungimas, saugumas ir diegimas

## Sesijos ir paskyros

- Sesijos – atsitiktiniai 256 bitų neskaidrūs žetonai, galiojantys 14 dienų. SQLite saugomi tik žetonų SHA-256 santraukos. Kiekviena apsaugota API užklausa ir serverio puslapis tikrina, ar sesija nepasibaigusi, o naudotojo paskyra neišjungta.
- Slaptažodžiai saugomi kaip scrypt maišos (N=32768, r=8, p=3, atsitiktinė druska). Senos maišos, jei tokių yra, atnaujinamos į scrypt sėkmingai prisijungus.
- Numatytojo slaptažodžio nėra. Pirmą kartą paleidus su tuščia duomenų baze `web/scripts/bootstrap.cjs` sukuria administratorių (`ADMIN_EMAIL`, pagal nutylėjimą `admin@kontas.local`) ir, jei nenurodytas `ADMIN_PASSWORD`, vieną kartą išveda atsitiktinį slaptažodį į konteinerio žurnalą (`docker logs kontas-app`). Slaptažodis – bent 10 simbolių.
- Rolės: **administratorius** gali viską (naudotojai, visos duomenų bazės kopija, įmonių paketų eksportas ir importas, uždarymo kontrolė, įmonių kūrimas ir trynimas); **buhalteris** atlieka įprastą apskaitos darbą visose įmonėse, bet negali valdyti naudotojų ir atlikti administratoriaus veiksmų. Įmonės bendros visiems naudotojams; teisių atskiroms įmonėms nėra.
- Išjungtas naudotojas nebegali prisijungti, o jo sesijos nustoja galioti iš karto. Paskutinio aktyvaus administratoriaus išjungti, pažeminti ar ištrinti negalima.
- Slaptažodžio keitimas: naudotojas pats keičia slaptažodį šoninio meniu rakto mygtuku (reikia dabartinio slaptažodžio; kitos jo sesijos baigiamos). Administratoriaus nustatytas naujas slaptažodis baigia visas naudotojo sesijas. Slaptažodį galima atkurti ir serveryje: `docker exec -it kontas-app node scripts/set-password.cjs <el. paštas> [naujas slaptažodis] [--enable]`.
- Naudotojų veiksmai (sukūrimas, rolė, išjungimas, slaptažodžio keitimas, prisijungimas) registruojami nekeičiamame žurnale be slaptažodžių ar jų maišų.

## Prisijungimo bandymų ribojimas

Bandymai prisijungti ribojami pagal normalizuotą el. paštą SQLite lentelėje: po 10 nesėkmingų bandymų paskyra užblokuojama 15 minučių. Tas pats ribojimas taikomas neteisingam dabartiniam slaptažodžiui keičiant slaptažodį. Internetui atvirame diegime papildomą ribojimą pagal IP adresą nustatykite atvirkštiniame tarpiniame serveryje.

## Aplinkos kintamieji

- `APP_ORIGIN` – viešas programos adresas už atvirkštinio tarpinio serverio (naudojamas užklausų kilmės patikrai).
- `COOKIE_SECURE` – gamyboje sesijos slapukams reikia HTTPS (`true`). Tik vietiniam HTTP išbandymui aiškiai nustatykite `false`.
- `DATABASE_URL` – `file:` ir absoliutus kelias arba kelias, skaičiuojamas nuo `web` darbo katalogo.
- `SMTP_ENCRYPTION_KEY` – 64 šešioliktainiai simboliai; juo AES-256-GCM šifruojami SMTP slaptažodžiai. Saugokite jį atskirai nuo duomenų bazės kopijų ir neįtraukite į Git.

Serverio diegimas su HTTPS: [../deploy/README.md](../deploy/README.md).

## Patikra

Paleiskite `npm test` ir `npx tsc --noEmit`. Bandymai kuria laikiną duomenų bazę ir niekada nekeičia `prisma/dev.db`.

## Pranešimas apie pažeidžiamumus

Apie saugumo spragas praneškite privačiai, ne viešame pranešime apie klaidą. Rašykite adresu security@kontas.download. Pranešime nurodykite versiją, atkūrimo žingsnius ir poveikį; prašome neskelbti detalių, kol spraga neištaisyta.
