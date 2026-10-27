[Lietuvių](VMI-EDS-AUTOMATION.md) | [Русский](VMI-EDS-AUTOMATION.ru.md) | [English](VMI-EDS-AUTOMATION.en.md)

# VMI / EDS: reikalavimai ir automatizavimo planas

Patikrinta 2026 m. spalio 26 d. pagal oficialius viešus šaltinius ir tuometinį kodą. Tai projekto tyrimas: toliau aprašytos naujos deklaracijos ir integracijos dar neįgyvendintos. Į įmonės asmeninę paskyrą nebuvo jungiamasi, o faktinių įmonės mokestinių pareigų pagal VMI registracijos duomenis nepatvirtinome.

**Kas čia faktas, o kas planas.** Skyriai „Atliktas ... etapas“ ir „Papildymas“ aprašo tai, kas jau yra programoje. Visa kita (reikalavimai, deklaracijų lentelė, projektuojamas procesas, P0–P2 eilė, prijungimas prie EDS ir i.MAS) yra pastabos ir planai, o ne programos galimybės. Šiuo metu programa **nieko nesiunčia į VMI**: ji paruošia i.SAF XML failą ir FR0600 juodraštį, kuriuos pateikti reikia rankiniu būdu. Katalogo `docs/vmi/` failai (oficialūs PDF ir XSD) saugomi privačioje saugykloje ir į viešą pateikimą neįtraukiami.

## Įmonės mokestinis profilis

Vien `isVatPayer` nepakanka. Reikia bent režimų `NON_VAT`, `STANDARD_VAT`, `SVS_LT`, galiojimo datų ir pakeitimų istorijos. PVM kodas pats savaime nereiškia 21 % skaičiavimo.

SVS leidžia registruotam mokėtojui neskaičiuoti PVM atitinkamiems pardavimams Lietuvoje; įsigijimų PVM pagal šią schemą neatskaitomas, i.SAF nepateikiamas. SVS sąskaitoje nurodomas PVM kodas, bet ne tarifas ir mokesčio suma. Atitinkamų tarpvalstybinių operacijų atveju atsiranda PVM101 ir kartais FR0564. Užsienio paslaugų pirkimai gali sukelti registracijos pareigą net ir esant nedidelėms pajamoms. Šaltinis: [VMI – SVS Lietuvoje](https://www.vmi.lt/evmi/svs-lietuvoje?inheritRedirect=true).

Projektinis sprendimas: mokestinis profilis + kontrahento šalis + operacijos tipas + apmokestinimo pagrindas + data nustato taisykles. Pridėti taikomų ribų ir užsienio operacijų stebėseną. Automatiškai pagal spėjimą nekeisti dabartinio įmonės statuso.

## Deklaracijos ir joms reikalingi duomenys

| Sritis | Ko reikia programai |
|---|---|
| PLN204 | Apskaitinio pelno mokestinės korekcijos, leidžiamos / neleidžiamos išlaidos, nuostoliai, lengvatos su sąlygų patikra, taisyklių versija pagal laikotarpį. Atitinkamiems pelną gaunantiems juridiniams asmenims forma teikiama iki kito mokestinio laikotarpio šeštojo mėnesio 15 d.; kalendoriniams metams – birželio 15 d. [VMI](https://www.vmi.lt/evmi/lt/metines-pelno-mokescio-deklaracijos-pln204-pln204a-pln204n-pln204u-) |
| Išmokos asmenims | Gavėjas, rezidavimas, pagrindas, faktinės išmokos data, klasė A/B ir pajamų kodas. MB nariams skiriami kodai 02, 26, 77; vadovas, nesantis nariu, klasifikuojamas atskirai. Visų išmokų negalima traktuoti kaip darbo užmokesčio. [VMI](https://www.vmi.lt/evmi/ma%C5%BEosios-bendrijos-nario/vadovo-pajamos1?inheritRedirect=true) |
| GPM312 / GPM313 | Formuoti tik esant taikomoms pareigoms. Bendri terminai: GPM313 – iki kito mėnesio 15 d., GPM312 – iki kitų metų vasario 15 d. GPM sumokėjimo terminas atskiras nuo deklaracijos termino. [VMI](https://www.vmi.lt/evmi/lt/kokie-yra-deklaracij%C5%B3-pateikimo-ir-pajam%C5%B3-mokes%C4%8Dio-sumok%C4%97jimo-terminai-) |
| FR0600 / i.SAF | Mokesčio klasifikavimas eilučių lygiu, atskira atskaitos teisė, šalis, dokumento tipas, kreditinės / debetinės korekcijos; registro ir deklaracijos suderinimas. Pardavimų PVM derinamas pagal laukus 29–31, o ne pagal 25 lauką. [VMI](https://www.vmi.lt/evmi/aktualus-klausimai-del-pvm-deklaracijos-fr0600-vertinimo) |
| Sodra | Atskiras MB narių ir darbuotojų modulis, taisyklės su galiojimo datomis. Pavyzdžiui, VSD bazė MB nario asmeniniams poreikiams skirtoms išmokoms 2026 m. nuo liepos 1 d. keičiasi iš 50 % į 90 %. Praėjusių metų tarifų ir bazių į naują skaičiavimą neperkelti. [Sodra](https://sodra.lt/imokos/esu-mazosios-bendrijos-narys?el_id=1173&lang=uk) |
| Metinė atskaitomybė | Finansinės ataskaitos ir aiškinamasis raštas Registrų centrui – atskira užduotis nuo PLN204. Rinkinio formatas priklauso nuo organizacijos kategorijos. [Registrų centras](https://info.registrucentras.lt/node/144439) |
| SAF-T | Tai atskiras apskaitos duomenų formatas, ne i.SAF. Pareigos taikymą tikrinti atskirai; neskelbti jo kas mėnesį privalomu bet kuriai MB. Numatyti įrašų, žinynų ir pirminių dokumentų eksportą ir XSD patikrą. [VMI](https://www.vmi.lt/evmi/saf-t1?inheritRedirect=true) |

Visi kalendoriaus terminai turi atsižvelgti į taikomas perkėlimo taisykles, įmonės laikotarpį ir konkrečią pareigą. Lentelė nepatvirtina, kad kiekviena forma privaloma konkrečiai įmonei.

## Kas realiai automatizuojama per oficialias sąsajas

EDS turi žiniatinklio paslaugą: atskiri juridinio asmens atstovo prisijungimo duomenys, dokumentų perdavimas ir būsenų gavimas. Pagal paskelbtą instrukciją tokiu būdu išsiųsta deklaracija per 3 dienas turi būti patvirtinta EDS; nepatvirtinta ištrinama. Todėl „failas perduotas“ negalima rodyti kaip „deklaracija pateikta“. [EDS – darbo tvarka](https://deklaravimas.vmi.lt/lt/Apie_formu_teikima/Apie_formu_teikima_1/Ziniatinklio_paslauga.aspx).

i.SAF turi atskirą žiniatinklio paslaugą su i.MAS sertifikatu, oficialią XSD 1.2 ir 1.2.1 schemos aprašą. Reikia atskirų kiekvienos įmonės prijungimo nustatymų, įgaliojimų patikros, sertifikato galiojimo kontrolės, eilių ir būsenų. [VMI – techninė dokumentacija](https://www.vmi.lt/evmi/i.saf2).

Projektuojamas procesas: pirminiai dokumentai → patikra → įrašai → laikotarpio uždarymas → ataskaitos juodraštis → suderinimas / XSD → naudotojo peržiūra → perdavimas → patvirtinimas, jei reikia → rezultato gavimas. Išsaugoti tikslų išsiųstą failą, jo maišą, laikotarpį, schemos versiją, institucijos atsakymą ir taisymų istoriją. Pakartotinė tinklo užklausa neturi sukurti pakartotinio pateikimo.

Prieš įgyvendinant jungtį atskirai patikrinti pilną aktualią specifikaciją, prieigas ir bandymų aplinką. Atliekant šį tyrimą prie API nebuvo jungiamasi ir bandomasis pateikimas nebuvo atliktas.

## Rastos kodo problemos (darbo pradžioje, 2026-10-26)

Tai projekto skaitymo darbo pradžioje rezultatai, o ne VMI teiginiai. Didžioji dalis punktų jau ištaisyta toliau aprašytuose etapuose (FR0600 juodraštis ir i.SAF su XSD, PVM atskaitos dalis, nekeičiamas PDF archyvas, laikotarpio uždarymas ir pakeitimų žurnalas); aktualią būklę aprašo skyriai „Atliktas ... etapas“:

1. `web/src/app/tax-reports/TaxReportsClient.tsx`: pardavimų PVM sudedamas į `box25`; gautas PVM visiškai laikomas atskaitomu. Tuo metu ekrano negalima buvo laikyti parengta teisinga FR0600.
2. `web/src/app/api/tax-reports/isaf/route.ts`: kodas pasirenkamas tik tarp `PVM1` ir `PVM100` pagal mokesčio sumą; šalis užkoduota kaip `LT`; tarifas skaičiuojamas iš sumų. Nėra XSD patikros. Klientų sujungimas pagal kodą nebuvo apribotas įmone ir galėjo dubliuoti dokumentus ar prijungti svetimą kontrahentą.
3. `web/src/lib/accounting-schema.ts`: pirkimų įrašai visada priskiria PVM sąskaitai `2444` nepriklausomai nuo įmonės atskaitos teisės. Reikia neatskaitomo PVM taisyklių ir pirkimo paskirties (sąnaudos, atsargos, turtas), o ne vieno universalaus įrašo. Istorinius duomenis perskaičiuoti tik po atskiros pakeitimų ataskaitos ir atsarginės kopijos.
4. `web/prisma/schema.prisma`: nebuvo pilnaverčių eilučių mokesčių kategorijų, įmonės režimo istorijos, išmokų MB nariams, banko mokėjimo susiejimo su dokumentais, laikotarpio uždarymo ir pakeitimų žurnalo.
5. `web/src/lib/invoice-document.ts`: PDF dalį rekvizitų ima iš dabartinių žinynų. Reikia nekeičiamo išduoto dokumento vaizdo ir faktiškai išsiųsto PDF archyvavimo.

## Kūrimo eilė ir paruošimo kriterijai

### P0 – apskaitos teisingumas

- Atskirti mokesčių režimą, tarifą ir neskaičiavimo pagrindą; išsaugoti galiojimo datą ir dokumento vaizdą. Bandymai: ne PVM mokėtojas, standartinis, SVS, režimo keitimas, skirtingo statuso kontrahentai.
- Ištaisyti gaunamą PVM: atskaitomas / neatskaitomas / dalinis, pirkimo paskirtis; bandyti įrašus, balansą ir tai, kad seni dokumentai nesikeičia be aiškios migracijos.
- Ištaisyti FR0600 ir i.SAF; kol netikrinta, rodyti paruošimo apribojimą. XSD, oficialūs pavyzdžiai, skirtingos šalys, keli tarifai, korekcijos ir įmonių izoliacija – privalomos patikros.
- Įvesti pakeitimų žurnalą, uždaryto laikotarpio užraktą, taisomuosius dokumentus ir unikalią numeraciją.

### P1 – kasdienė automatizacija

- Banko išrašo importas, apsauga nuo dublių, mokėjimų susiejimas su sąskaitomis, dalinis ir permokėtas apmokėjimas. Apmokėjimo statusą skaičiuoti iš paskirstytų mokėjimų.
- Gaunamos sąskaitos iš failo / pašto: rekvizitų išgavimas, sumų patikra, dublių aptikimas; abejotini laukai reikalauja peržiūros.
- Periodinės sąskaitos, eilučių šablonai, laiškų eilės, skolų priminimai su išankstine apmokėjimo patikra.
- Vieningas pareigų kalendorius: kiekvienos formos taikymo paaiškinimas, priminimai, nuoroda į šaltinį ir taisyklės galiojimo laikotarpis.
- Pirminių dokumentų, PDF ir patvirtinimų archyvas; reguliarios atsarginės kopijos ir atkūrimo patikra. Duomenų bazės kopija Git saugykloje nepakeičia dokumentų archyvo.

VMI nurodo privalomus įprastos sąskaitos rekvizitus, įskaitant matavimo vienetus, kai kiekis išreiškiamas. Todėl pridėti atskirą vieneto lauką ir neslėpti jo vien paslaugos pavadinime. [VMI – dokumentavimas](https://www.vmi.lt/evmi/reikalavimai-dokumentavimui).

### P2 – atskaitomybė ir integracijos

- Išmokos MB nariams ir GPM312/GPM313; vėliau PLN204 su mokestinėmis korekcijomis.
- EDS/i.MAS: paruoštų dokumentų perdavimas, patvirtinimo ir rezultato sekimas, pranešimai apie klaidas.
- Ilgalaikis turtas ir nusidėvėjimas, atsargos / savikaina, metinis uždarymas ir finansinių ataskaitų rinkinys; SAF-T po taikymo patikros.

Taisyklėms nustatyti dar reikia išsiaiškinti faktinį VMI režimą, operacijas su užsienio tiekėjais / pirkėjais, MB narių ir darbuotojų sudėtį, išmokų rūšis, mokestinį laikotarpį ir teisę į lengvatas. Šių duomenų negalima patikimai nustatyti vien iš įmonės pavadinimo ir tuščio PVM kodo.

## Atliktas pirmas etapas – 2026-10-26

- Pridėti NON_VAT / STANDARD_VAT / SVS_LT, režimo pradžios datos istorija, režimo parinkimas pagal naujo dokumento datą ir pardavimo režimo vaizdas. SVS PDF rodo PVM kodą be mokesčio skaičiavimo.
- Pirkimams atsirado aiški atskaitos dalis; NON_VAT/SVS ji lygi nuliui. Bazinėse sąnaudų įrašuose neatskaitomas PVM įtraukiamas į sąnaudas, atskaitomas – į 2444. Pirkimo paskirtis atsargomis ar ilgalaikiu turtu kol kas neįgyvendinta.
- Seni įrašai migracijos metu neperskaičiuojami. Pirkimai su nežinoma atskaitos dalimi pažymimi kaip nepatikrinti ir nedidina patvirtintos atskaitos sumos suvestinėje.
- Ištaisytas pirkimų redagavimas: forma išsaugo pradines eilutes, o ne pakeičia jas viena 21 % eilute.
- Pašalinti klaidingi FR0600 laukų skaičiavimai. Vietoj jų rodoma patikros suvestinė; nepatvirtintas i.SAF XML nebeišduodamas. Pilnavertė FR0600 ir patikrinamas i.SAF liko darbų sąraše.
- Pridėtas laikotarpio uždarymas SQLite lygiu ir dokumentų, eilučių bei įrašų pakeitimų žurnalas. Laikotarpio ribos keitimas įrašo naudotojo ID; automatinių duomenų bazės įvykių autorius kol kas nenustatomas. Sąsaja šį apribojimą rodo atvirai.
- Nauji išrašomų numerių dublikatai blokuojami įmonės ribose; gaunami numeriai tikrinami atsižvelgiant į tiekėją. Senų dublikatų migracija netrina.

Tai dar ne visos automatizavimo programos pabaiga. Banko susiejimas, išduotų PDF archyvas, taisomieji dokumentai, mokesčių klasifikatoriai, MB formos ir išoriniai ryšiai liko kitiems etapams. EDS/i.MAS neprijungti; tikros deklaracijos nebuvo siunčiamos.

## Atliktas antras etapas – i.SAF (2026-10-26)

Šaltinis: oficiali i.SAF 1.2 XSD (`docs/vmi/isaf_1.2.xsd`, VMI puslapyje pažymėta kaip galiojanti 2016-09-16 redakcija) ir joje įterpti elementų aprašai. PDF „XML struktūros aprašas 1.2.1“ į projektą nebuvo įkeltas: taisykles, kurių nėra XSD, dar reikėjo su juo suderinti.

- `web/src/lib/isaf.ts` formuoja pardavimų ir pirkimų registrą. Failas tikrinamas pagal XSD bandymuose (`web/tests/isaf.cjs`, xmllint-wasm).
- Eksportas prieinamas tik įmonei, kurios režimas visą laikotarpį yra STANDARD_VAT. Režimo keitimas laikotarpio viduje blokuoja eksportą.
- Duomenys imami tik iš aktyvios įmonės; kontrahentas susiejamas pagal `clientId` ir `companyId`, o ne pagal kodą.
- Automatiškai klasifikuojami tik vidaus pardavimai su PVM 21/9/5 % (PVM1/PVM2/PVM3). Tai vieninteliai klasifikatoriaus kodai, patvirtinti peržiūrėtuose šaltiniuose.
- Viskas kita blokuoja eksportą ir patenka į pastabų sąrašą: eilutės be mokesčio ar su 0 %, kiti tarifai, užsienio PVM kodai ir kontrahentai, neigiamos sumos, besikartojantys numeriai, netinkamas įmonės kodas.
- Pirkimuose iš Lietuvos PVM mokėtojo `TaxCode` ir `TaxPercentage` buvo paliekami tušti, kaip nurodo elemento `TaxCode` aprašas. Tai reikėjo patvirtinti pagal PDF 1.2.1.
- Neįgyvendinta: `SettlementsAndPayments`, taisomieji dokumentai (KS/DS), PVM klasės 0 %, ES / eksportas, atvirkštinis apmokestinimas, FR0564, pateikimas žiniatinklio paslauga. Failas formuojamas peržiūrai ir rankiniam įkėlimui; į VMI jis nesiunčiamas.
- Pirmo sąrašo 2 problema (užkoduota `LT`, tarifo spėjimas, įmonių sankirta) pašalinta; 1 (FR0600) liko atvira.
- Pirkimo paskirtis: pirkimas gavo neprivalomą apskaitos sąskaitą (`debitAccount`, pirkimų forma). Tuščia reikšmė palieka 6118. Nusidėvėjimas ir atsargų savikaina neautomatizuoti. Migracija `2026-10-purchase-account-v1` tik prideda stulpelį ir perkuria trigerius; seni įrašai nekeičiami.
- Pardavimų korekcijos: kreditiniai dokumentai (KS) kuriami iš pradinės sąskaitos neigiamomis sumomis su priežastimi, likučio apribojimu ir PDF „KREDITINĖ …“. Migracija `2026-10-sale-correction-v1` prideda stulpelius ir apsauginius trigerius. Neįgyvendinta: debetiniai dokumentai (DS), pirkimų korekcijos ir KS eksportas į i.SAF (sumų ženklą reikėjo suderinti su 1.2.1 aprašu).
- PDF archyvas: sėkmingai išsiuntus laišką tikslūs priedo baitai, SHA-256, gavėjas ir rekvizitų vaizdas saugomi nekeičiamoje lentelėje `InvoiceArchive`. Nuorodos į archyvą sąsajoje kol kas nėra, tik API.
- i.SAF 1.2.1 aprašas (`docs/vmi/isaf_1.2.1_aprasymas.pdf`, 159 psl.) perskaitytas. Jis patvirtina, kad galiojanti XSD yra 1.2 (1.2.1 – dokumento versija) ir kad pirkimuose iš Lietuvos PVM mokėtojo `TaxCode` nepildomas. Klasifikatoriaus kodų sąrašo (VA-49) ir kreditinių dokumentų sumų ženklo taisyklės jame nėra, todėl KS eksporte liko užblokuotas. KS apraše yra `References` (nuoroda į taisomą sąskaitą). FR0600 šis PDF netaikomas: reikia atskirų deklaracijos pildymo instrukcijų.

## FR0600: duomenys iš VMI puslapio (gauta 2026-10-26)

Šaltinis: VMI puslapis „PVM deklaracija FR0600 (84-86 str., 88-89 str., 115-3 str.)“, klausimų ir atsakymų skyrius, ir instrukcija `docs/vmi/FR0600_uzpildymas_KM1739.pdf` (joje sakoma, kad dalis nuostatų nuo 2026-01-01 pasenusios).

- Pateikimas: tik elektroniniu būdu per EDS. Pildymo taisyklės patvirtintos 2004-03-01 įsakymu VA-29.
- Terminai: mėnuo – iki kito mėnesio 25 d.; ketvirtis – iki kito ketvirčio pirmo mėnesio 25 d.; pusmetis – panašiai; kitas nustatytas laikotarpis – ne vėliau kaip per 25 dienas po jo pabaigos; išsiregistruojantis iš mokėtojų ar likviduojamas – per 20 dienų.
- Mažojo verslo režimas (SVS) ar ne PVM mokėtojas: standartinės FR0600 neteikia; kas išsaugojo SVS išsiregistravęs iš mokėtojų, teikia paskutinę FR0600 su žyma „Mokestinio laikotarpio“ 9 lauke.
- Taisymas: nauja FR0600 su žyma „Patikslinta“ 8 lauke, pilnu duomenų rinkiniu ir tuo pačiu laikotarpiu. Terminas – einamieji ir 3 praėję kalendoriniai metai; beviltiškoms skoloms ir kilnojamajam ilgalaikiam turtui – 5; nekilnojamajam – 10.
- Paslaugų pirkimas iš užsienio mokėtojo pagal 95 str. (atvirkštinis apmokestinimas): laukai 23, 24 (bazė), 32 (apskaičiuotas PVM), tada tas pats mokestis pridedamas prie 25 ir, jei yra atskaitos teisė, prie 35.
- Statybos paslaugos Lietuvos viduje pagal 96 str.: pardavėjas rodo tik bazę 12 lauke ir mokesčio nedeklaruoja; pirkėjas – mokestį 33 lauke, tada 25 ir 35.
- Paslaugos ne Lietuvoje (13 str.) rašomos 20 lauke, o ne FR0564. Prekių tiekimas į ES – 18 laukas ir FR0564.
- VMI lentelė „Dažniausiai pasitaikančių sandorių deklaravimas FR0600 + i.SAF kodas“ susieja tipines sandorių rūšis su FR0600 laukais ir i.SAF klasifikatoriaus kodais. Būtent šio kodų sąrašo projektui trūko. Failą reikėjo parsisiųsti rankiniu būdu.
- VMI meniu nurodytas lengvatinis 12 % tarifas. Projektas žinojo tik 21/9/5 %, todėl eilutės su kitu tarifu blokuojamos.
- Per i.SAF VMI siūlo preliminarių PVM deklaracijų FR0600 ir FR0564 paslaugą („Preliminarių PVM deklaracijų paslauga“).

## Atliktas trečias etapas – klasifikatoriaus kodai ir FR0600 juodraštis (2026-10-26)

Šaltinis: oficiali VMI lentelė „Dažniausiai pasitaikančių sandorių deklaravimas FR0600 + i.SAF kodas“ (2025-12-17, `docs/vmi/FR0600_isaf_kodai.pdf`) ir instrukcija KM1739.

- Kodai vidaus operacijoms: 21 % – PVM1, 12 % – PVM58 (tik nuo 2026-01-01, laukas 29A), 9 % – PVM2, 5 % – PVM3. Jie taikomi ir pardavimų, ir pirkimų registre. Ankstesnė prielaida „tuščias TaxCode pirkimuose“ pakeista lentelės kodais.
- `web/src/lib/fr0600.ts` ir `GET /api/tax-reports/fr0600?start&end` skaičiuoja laukus 11, 25, 29, 29A, 30, 31, 35 ir 36 (= 29 + 29A + 30 + 31 − 35). Kreditiniai dokumentai eina su minuso ženklu į laukus 11 ir 29–31, kaip reikalauja KM1739. Mėnesio laikotarpiui rodomas terminas – kito mėnesio 25 diena (be perkėlimo į savaitgalį ar šventines dienas).
- Viskas kita patenka į rankinio apdorojimo sąrašą ir nesumuojama: eilutės be mokesčio ar su kitu tarifu, užsienio kontrahentai (laukai 17–24, 32–34), įvežimas (26–27), proporcinė atskaita (28), 95 ir 96 str. operacijos. Pirkimai su nepatikrinta atskaita į 35 lauką nepatenka.
- Rezultatas – darbinis juodraštis suderinimui su deklaracija EDS. Pateikimas ir patvirtinimas lieka naudotojui.
- Lentelėje yra kodai 0 %, ES, eksporto, atvirkštinio apmokestinimo ir maržos schemų (PVM5, PVM12–PVM15, PVM19–PVM21, PVM25–PVM27, PVM32–PVM34 ir kt.), bet išgaunant tekstą PDF išdėstymas sumaišytas. Juos reikia įvesti rankiniu būdu patikrinus pačiame PDF, todėl šiuo metu jie neautomatizuoti.

## Papildymas: kreditiniai dokumentai i.SAF, banko išrašai

- Sumų ženklo taisyklė patvirtinta VMI dokumentu „Sąskaitų faktūrų duomenų importo i.SAF…“ (`docs/vmi/isaf_importo_aprasymas.pdf`, 2022): neigiama apmokestinamoji vertė leidžiama tik kreditinėje ar debetinėje sąskaitoje; jei nurodyta taisoma sąskaita, tipas turi būti KS/DS/VK/VD; taisoma sąskaita turi egzistuoti registre; PVM turi atitikti vertę ir tarifą. Pardavimų KS eksportuojamos su neigiamomis sumomis ir nuoroda į pradinę sąskaitą. Debetiniai dokumentai ir pirkimų KS neįgyvendinti.
- Banko išrašas priimamas ISO 20022 camt.053 standartu su likučių ir IBAN patikra. Vėliau pridėtas ir MT940 bei CSV importas (šioje pastaboje jos rašymo metu MT940 dar nebuvo palaikomas).
