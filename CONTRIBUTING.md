[Lietuvių](CONTRIBUTING.md) | [Русский](CONTRIBUTING.ru.md) | [English](CONTRIBUTING.en.md)

# Dalyvavimas projekte kontas.download

Ačiū, kad norite padėti. Programa naudojama pagal [LICENSE](LICENSE): naudoti galima, platinti negalima. Šis dokumentas paaiškina, kaip dalyvauti, kad visiems būtų aišku dėl teisių.

## Pranešimai apie klaidas ir pasiūlymai

Praneškite apie klaidas ir siūlykite pagerinimus projekto klaidų sekimo skiltyje (nuoroda bus nurodyta projekto svetainėje https://kontas.download; kol kas rašykite contact@kontas.download). Nurodykite: programos versiją (laukas `version` faile `web/package.json`), ką darėte, ką tikėjotės ir ką gavote. Niekada nesiųskite tikrų apskaitos duomenų, slaptažodžių ar SMTP raktų: pakanka sugalvotų pavyzdžių.

Dėl pažeidžiamumų žr. [web/SECURITY.md](web/SECURITY.md): apie juos nepraneškite viešai.

## Kodo pakeitimai

Kodo pakeitimai (angl. pull requests) kol kas **nepriimami**, nes projektas dar neturi sutarties dėl teisių į prisidedantį kodą. Pasiūlymus aprašykite klaidų sekimo skiltyje: tai greičiausias būdas, kaip jie pateks į programą.

Kai bus priimta bendradarbių sutartis (angl. CLA), šis tekstas bus papildytas. Pagrindinės sąlygos bus tokios:
- siųsdami pakeitimą patvirtinate, kad esate jo autorius ir turite teisę jį siųsti;
- suteikiate teisių turėtojui nuolatinę, nemokamą teisę naudoti, keisti ir platinti jūsų pakeitimą kaip projekto dalį pagal projekto licenciją ir kitas jos versijas;
- jūsų autorystė nurodoma pakeitimų žurnale, jei pageidaujate.

## Kalbos

Pagrindinė projekto kalba yra lietuvių. Dokumentai turi lietuvišką pagrindinį tekstą ir rusišką bei anglišką versijas; keičiant vieną versiją, atnaujinkite ir kitas. Kodo komentarai ir tekstų raktai rašomi angliškai, naudotojo matomi tekstai: lietuviškai, rusiškai ir angliškai (žr. `web/src/lib/i18n`).

## Reikalavimai pakeitimams (kai jie bus priimami)

- Pakeitimas turi turėti testą (`cd web && npm test`), `npx tsc --noEmit` ir `npx eslint` negali rodyti klaidų.
- Duomenų bazės pakeitimai tik papildantys: nauja migracija su nauja versija, jau išleistų migracijų redaguoti negalima.
- Nieko, kas siunčia duomenis į išorę be aiškaus naudotojo veiksmo.
- Mokesčių skaičiavimai turi nurodyti oficialų šaltinį (įstatymą, VMI aprašymą).
