import type { HelpPage } from './types';

// The only help file that may name the cloud vendor and its models (release_tree.py VENDOR_ALLOWED keeps the allowance this narrow).
export const recognitionPages: HelpPage[] = [
  {
    slug: 'document-recognition',
    group: 'operations',
    appHref: '/purchase-documents',
    related: ['purchases'],
    sources: ['lt-financial-accounting-law', 'lt-vat-law', 'lt-archives-ve73', 'eu-gdpr'],
    text: {
      lt: {
        title: 'Dokumentų atpažinimas',
        summary: 'Pirkimo sąskaitų ir kvitų nuotraukų ar PDF atpažinimas: raktas, modelio pasirinkimas, kaina, privatumas, fotografavimas ir originalų saugojimas.',
        purpose: [
          'Meniu „Gauti dokumentai“ įkeliate pirkimo sąskaitą ar kasos kvitą (PDF arba nuotrauką). Atpažinimo paslauga ištraukia tiekėją, datą, numerį, eilutes ir PVM, o programa paruošia pirkimo juodraštį. Jūs peržiūrite duomenis šalia originalo, pataisote ir patvirtinate.',
          'Nieko neįrašoma automatiškai: pirkimas, tiekėjas ar buhalterinė korespondencija sukuriami tik paspaudus „Patvirtinti“.',
          'Patvirtinus sukuriama: pirkimas (su eilučių PVM kodais ir sąnaudų sąskaita), naujas tiekėjas (jei toks dar nerastas), nuoroda į nepakeistą originalą, o už savo lėšas apmokėtas pirkimas įtraukiamas į kompensuotinų išlaidų sąrašą.',
          'Sąnaudų (debeto) sąskaita užpildoma iš anksto: pirmiausia pagal paskutinį šio tiekėjo pirkimą (rodoma, iš kurio dokumento), o jei tiekėjas naujas – pagal dokumento turinį kaip pasiūlymas su trumpu paaiškinimu. Pasiūlymą visada galite pakeisti; PVM kodai niekada nepasirenkami automatiškai. Patvirtinant išsaugoma, iš kur sąskaita atsirado (istorija, pasiūlymas ar jūsų pasirinkimas).',
        ],
        steps: [
          'Užsiregistruokite console.anthropic.com įmonės vardu (pageidautina įmonės el. paštu, ne asmeniniu).',
          'Skiltyje „Billing“ papildykite kreditą nedidele suma ir nustatykite mėnesio išlaidų limitą – taip kaina niekada neviršys jūsų numatytos ribos.',
          'Skiltyje „API keys“ sukurkite raktą ir nukopijuokite jį iškart: vėliau svetainė jo nebeparodys.',
          'Programoje atidarykite „Įmonės“ ir aktyvios įmonės nustatymus (SMTP ir dokumentų atpažinimas), skiltį „Dokumentų atpažinimas“.',
          'Įklijuokite raktą, pasirinkite modelį ir įjunkite atpažinimą.',
          'Paspauskite „Patikrinti raktą“. Sėkmės pranešimas reiškia, kad raktas veikia ir yra kreditas; tada paspauskite „Išsaugoti“.',
          'Atidarykite „Gauti dokumentai“, įkelkite failą ir patikrinkite gautą juodraštį prieš patvirtindami.',
        ],
        rules: [
          'Dublikatai: be identiško failo (SHA-256) tikrinamas ir turinys. Tas pats tiekėjas ir tas pats dokumento numeris (nepaisoma didžiųjų raidžių, tarpų, brūkšnelių ir pirmaujančių nulių) arba tas pats kvito ir kasos aparato numeris laikomi tikėtinu dublikatu, kurį patvirtinti galima tik pažymėjus „Tai ne dublikatas, vis tiek patvirtinti“. Tas pats tiekėjas, ta pati suma ir data ±3 dienos – tik įspėjimas. Lyginama su pirkimais ir kitais dar nepatvirtintais gautais dokumentais (pvz., dvi to paties kvito nuotraukos).',
          'Raktas saugomas užšifruotas ir niekada nerodomas iš naujo; kai raktas jau išsaugotas, lauką galima palikti tuščią. Raktą galima pašalinti.',
          'Kol įmonė neįjungė atpažinimo ir nenurodė rakto, joks dokumentas niekur nesiunčiamas; failai tik išsaugomi, duomenis suvedate rankiniu būdu.',
          'Tas pats failas (pagal kontrolinę sumą) antrą kartą neįkeliamas. Tas pats tiekėjo serijos ir numerio derinys pirkimuose taip pat neleidžiamas.',
          'Kvitui be pirkėjo rekvizitų atskaitomo PVM dalis pagal nutylėjimą yra 0 %. Atskaitą galite padidinti tik turėdami PVM sąskaitą faktūrą.',
          'Atpažinimo paslauga gali klysti: sumas, PVM tarifus ir tiekėją visada tikrina žmogus, programa rodo įspėjimus dėl neatitikimų.',
        ],
        mistakes: [
          'Patvirtinama neperžiūrėjus sumų ir PVM – atpažinimo rezultatas yra tik pasiūlymas.',
          'Laikoma, kad kasos kvitas suteikia PVM atskaitą – be pirkėjo rekvizitų paprastai nesuteikia.',
          'Įklijuojamas raktas su tarpu pradžioje ar pabaigoje arba kito teikėjo raktas.',
          'Nenustatomas mėnesio išlaidų limitas teikėjo svetainėje.',
          'Popierinis kvitas išmetamas neįsitikinus, kad skaitmeninė kopija įskaitoma ir kad leidžiama sunaikinti popierių.',
        ],
        notes: [
          {
            title: 'Modelio pasirinkimas ir kaina',
            items: [
              'Claude Opus 5.5 (numatytasis): tiksliausias; 4 USD / 20 USD už 1 mln. įvesties / išvesties žetonų; apytiksliai 3–5 ct už dokumentą.',
              'Claude Sonnet 5.5: subalansuotas; 2 USD / 10 USD už 1 mln. žetonų; apytiksliai 1–3 ct už dokumentą.',
              'Claude Haiku 5.5: greičiausias ir pigiausias; 0,10 USD / 0,50 USD už 1 mln. žetonų; kaina – cento dalys, tačiau prastose nuotraukose daugiau klaidų.',
              'Kainos nurodytos išleidimo datai (2026 m. lapkritis), kaina už dokumentą yra įvertis ir priklauso nuo puslapių skaičiaus bei eilučių kiekio. Dabartines kainas tikrinkite teikėjo svetainėje.',
            ],
          },
          {
            title: 'Duomenys ir privatumas',
            items: [
              'Atpažinimui dokumentas (PDF ar nuotrauka su visu tekstu) siunčiamas išorės teikėjui. Dokumentuose gali būti asmens duomenų (pvz. pirkėjo, kortelės paskutiniai skaitmenys).',
              'Pagal teikėjo API sąlygas per API siunčiami duomenys pagal nutylėjimą nenaudojami modeliams mokyti. Rekomenduojame šias sąlygas ir privatumo politiką perskaityti patiems, nes jos gali keistis.',
              'Funkcija išjungta, kol įmonė pati jos neįjungia ir neįveda savo rakto. Atpažinimą galima bet kada išjungti ar raktą pašalinti.',
            ],
          },
          {
            title: 'Kaip fotografuoti kvitus',
            items: [
              'Fotografuokite tą pačią dieną: terminio popieriaus kvitai išblunka per 1–2 metus, o apskaitos dokumentus reikia saugoti 10 metų.',
              'Kvitas turi būti matomas visas, išlygintas, lygiagrečiai telefonui, gerai apšviestas, be atspindžių ir šešėlių. Ilgą kvitą patogiausia nuskenuoti telefono dokumentų skeneriu į vieną PDF.',
              'iPhone nuotraukos HEIC formatu priimamos tiesiogiai: programa jas pati paverčia JPEG. Jei norite, galite telefone pasirinkti „Maksimalus suderinamumas“ (JPEG) – tai neprivaloma.',
              'Atpažinimui programa paruošia nuotraukos kopiją: pagal nuotraukos kryptį ją pasuka, per didelę (ilgoji pusė virš 2500 px) sumažina ir šiek tiek sureguliuoja kontrastą. Originalas saugomas nepakeistas (su kontroline suma); peržiūrai HEIC rodoma ta paruošta kopija.',
              'Palaikomi PDF, JPEG, PNG, WebP ir HEIC failai iki 20 MB.',
            ],
          },
          {
            title: 'Originalų saugojimas ir kvitai prieš PVM sąskaitas',
            items: [
              'Originalas saugomas nepakeistas, su kontroline suma (SHA-256), įkėlimo laiku ir siuntėju, įtraukiamas į atsargines kopijas ir įmonės eksporto paketą. Pirkimo kortelėje yra nuoroda į originalą.',
              'Ar popierinį originalą galima sunaikinti po suskaitmeninimo, nustato popierinių dokumentų atrankos ir išsaugojimo elektronine forma tvarka (Lietuvos vyriausiojo archyvaro 2019 m. įsakymas Nr. VE-73). Prieš naikindami popierių patikrinkite galiojančią redakciją e-tar.lt arba pasitarkite su buhalteriu ar VMI.',
              'Kasos kvitas be pirkėjo rekvizitų paprastai nesuteikia teisės į PVM atskaitą; PVM atskaitai reikia PVM sąskaitos faktūros su pirkėjo duomenimis. Todėl kvito formoje atskaitos dalis pagal nutylėjimą yra 0 %.',
              'Programa nesprendžia, ar konkretus sandoris atitinka apskaitos ar mokesčių taisykles; tai lieka naudotojo ir jo buhalterio atsakomybė.',
            ],
          },
          {
            title: 'Trikčių šalinimas',
            items: [
              'Neteisingas raktas: patikrinkite, ar nukopijuotas visas raktas be tarpų, ar jis sukurtas tame pačiame teikėjo paskyros darbo srityje ir ar nebuvo ištrintas. Jei abejojate, sukurkite naują ir įklijuokite iš naujo.',
              'Nėra kredito arba viršytas limitas: papildykite kreditą arba padidinkite mėnesio limitą teikėjo svetainės skiltyje „Billing“. Esant užklausų dažnio apribojimui palaukite kelias minutes ir bandykite atpažinti dar kartą.',
              'Neryški ar nuskaityta tik dalis nuotraukos: nufotografuokite iš naujo arba suveskite duomenis rankiniu būdu. Prastoms nuotraukoms rinkitės tikslesnį modelį.',
              'HEIC nuotrauka neatsidaro ar atpažinimas nepavyksta: failas gali būti pažeistas arba neįprasto formato – išsaugokite jį kaip JPEG ar PDF ir įkelkite iš naujo.',
              'Dokumentas jau įkeltas: programa parodo esamo dokumento numerį; atidarykite jį užuot kūrę dublį.',
              'Pasirinktas ne tas tiekėjas: peržiūros formoje pakeiskite tiekėją arba pasirinkite naują; patikrinkite įmonės kodą.',
            ],
          },
          {
            title: 'Dokumentų priėmimas el. paštu',
            items: [
              'Programa gali pati paimti sąskaitas iš pašto dėžutės: kas 5 minutes ji perskaito nurodytą dėžutę, o leidžiamų siuntėjų laiškų PDF ar nuotraukų priedus išsaugo skiltyje „Gauti dokumentai“ (šaltinis „El. paštas“, matomas siuntėjas). Pirkimas ir toliau sukuriamas tik jums patvirtinus. Įmonės domeno DNS įrašų keisti nereikia.',
              'Nustatymai: „Įmonės“ > aktyvios įmonės nustatymai > „El. pašto dėžutė dokumentams“. Nurodykite IMAP serverį, prievadą (dažniausiai 993 su SSL/TLS), naudotojo vardą, slaptažodį ir aplanką, tada „Patikrinti ryšį“ ir „Išsaugoti“.',
              'Variantas 1 – nauja dėžutė prie esamo pašto serverio: pašto talpinimo valdymo skydelyje sukurkite atskirą dėžutę (pvz., saskaitos@jusu-imone.lt). Dėžutės sukūrimas nėra DNS keitimas. Tiekėjų prašykite siųsti sąskaitas šiuo adresu; IMAP serverio adresą rasite hostingo instrukcijoje.',
              'Variantas 2 – nemokamas Gmail: sukurkite atskirą Gmail paskyrą, įjunkite dviejų žingsnių patvirtinimą, sukurkite „programos slaptažodį“ (App password) ir paskyros nustatymuose įjunkite IMAP. Programoje paspauskite „Gmail šablonas“ (imap.gmail.com, 993) ir slaptažodžio laukelyje įveskite programos slaptažodį, ne įprastą paskyros slaptažodį.',
              'Variantas 3 – aplankas įprastoje dėžutėje: savo pašto programoje sukurkite aplanką (pvz., „Sąskaitos“) ir taisyklę, kuri į jį perkelia sąskaitų laiškus. Programoje nurodykite tą aplanką laukelyje „Aplankas, kurį skaityti“.',
              'Leidžiami siuntėjai: įrašykite po vieną el. pašto adresą arba @domeną eilutėje. Tuščias sąrašas reiškia, kad nepriimama nieko. Tai būtina, nes kitaip bet kas, žinodamas adresą, galėtų „pakišti“ išlaidų. Programa papildomai atmeta laiškus, kuriuos pašto serveris pats pažymėjo kaip suklastotus (DMARC), bet tai tik papildoma apsauga; pagrindinė yra jūsų sąrašas.',
              'Kas vyksta su laiškais: pirmą kartą skaitomi tik neperskaityti laiškai, kad į programą nepatektų sena istorija. Apdorotas laiškas pažymimas kaip perskaitytas arba (jei nurodytas „Aplankas apdorotiems laiškams“) perkeliamas į tą aplanką. Tas pats laiškas ar tas pats failas antrą kartą nepriimamas. Nedidelės įterptos nuotraukos (parašų, logotipų paveikslėliai) ignoruojamos; vieno laiško ribos – 10 priedų po 20 MB.',
              'XML e-sąskaitos (UBL) laiške: jos išsaugomos eilėje „Gauti dokumentai“ be atpažinimo paslaugos – duomenys skaitomi tiesiai iš failo, o patvirtinus pirkimas sukuriamas tokiu pačiu keliu kaip XML importu (taip pat ir kreditinės sąskaitos). Jei laiške kartu yra to paties pavadinimo (arba vienintelis) PDF, jis tampa XML vaizdiniu originalu: eilėje lieka vienas įrašas, o duomenų šaltinis – XML. XML, kurio programa negali perskaityti, eilėje nesaugomas; žurnale matysite pastabą „XML e-sąskaita nepriimta“ su priežastimi, o PDF (jei yra) apdorojamas įprastai. HEIC nuotraukos priedai priimami taip pat kaip JPEG.',
              'Tikrinimas vyksta kas 5 minutes (debesies versijoje, kur programa tarp apsilankymų „miega“, – kas 15 minučių, ir tik jei yra įjungta dėžutė); mygtukas „Tikrinti dabar“ paleidžia jį iškart. Paskutinį tikrinimą, klaidą ir paskutinių laiškų žurnalą matote tame pačiame nustatymų bloke. Slaptažodis saugomas užšifruotas ir nerodomas; į įmonės eksporto paketą jis, kaip ir SMTP, neįtraukiamas.',
            ],
          },
          {
            title: 'Ilgalaikis turtas ir atsargos iš dokumento',
            items: [
              'Kiekvienoje eilutėje galite (neprivaloma) pasirinkti, kad ji yra atsargos arba ilgalaikis turtas. Pagal nutylėjimą eilutė registruojama kaip paprastos sąnaudos ar paslauga.',
              'Ilgalaikis turtas: pasirinkus ilgalaikio turto sąskaitą (pvz. 1206 Kita įranga, 1204 Mašinos ir įrenginiai, 1205 Transporto priemonės, 1202 Pastatai, 1130 Programinė įranga), eilutėje atsiranda žymė „Sukurti ilgalaikio turto kortelę“. Patvirtinus dokumentą sukuriama turto kortelė: pavadinimas iš eilutės, įsigijimo data iš dokumento, naudoti pradėta data (numatyta ta pati), įsigijimo kaina = suma be PVM + neatskaitoma PVM dalis. Kortelė susiejama su pirkimu ir jo eilute, o nusidėvėjimas registruojamas skyriuje „Ilgalaikis turtas“.',
              'Jei naudingo tarnavimo laiko nenurodote, taikoma mokestinė norma pagal turto grupę. Kortelė sukuriama viena kiekvienai pažymėtai eilutei (visam eilutės kiekiui); kelis atskirus vienetus sukurkite atskiromis eilutėmis. Jei turto taisyklės kortelės nepriima (pvz. kodas jau naudojamas), nepatvirtinamas nei dokumentas, nei kortelė.',
              'Atsargos: kai įmonė vykdo atsargų apskaitą, eilutę galite susieti su esama atsargų kortele (programa pasiūlo kortelę su tokiu pat pavadinimu) arba sukurti naują kortelę nurodant kodą. Patvirtinus pirkimas sukuria atsargų pajamavimą taip pat, kaip įprastas pirkimas: pagal kortelės kodą ir sandėlį. Visos susietos kortelės turi būti viename sandėlyje.',
              'Eilutė negali būti ir ilgalaikis turtas, ir atsargos. Nieko nesukuriama, kol nepatvirtinate dokumento.',
            ],
          },
          {
            title: 'Užsienio valiutos dokumentai',
            items: [
              'Jei dokumente nurodyta valiuta ne eurai, formoje atsiranda valiutos kurso blokas: sumos lieka tokios, kokios išspausdintos dokumente (originalia valiuta), o programa parodo, kiek tai eurais pagal kursą.',
              'Kursas gaunamas automatiškai iš Europos centrinio banko (ECB) paskelbtų euro ir užsienio valiutų santykių: imamas dokumento datos kursas, o jei tą dieną jis nepaskelbtas (savaitgalis, šventė) – paskutinis ankstesnis. Gauti kursai saugomi programoje, todėl tas pats kursas antrą kartą iš interneto nesiunčiamas.',
              'Lietuvoje užsienio valiuta operacijos dieną paprastai perskaičiuojama pagal Europos centrinio banko (arba Lietuvos banko) paskelbtą euro ir valiutos santykį. Programa taiko ECB kursą dokumento dienai; ar toks kursas tinka jūsų konkrečiam atvejui (pvz. kai sąskaitos ir PVM apskaitos dienos skiriasi, arba taikote kitą politiką), pasitikslinkite su buhalteriu.',
              'Nėra ryšio arba ECB nepaskelbė tos valiutos kurso? Įveskite kursą rankiniu būdu (valiutos vienetų už 1 EUR, kaip skelbia ECB). Rankiniu būdu įvestas kursas pirkime pažymimas kaip „įvesta rankiniu būdu“.',
              'Patvirtinus pirkimas saugomas eurais (visos ataskaitos ir PVM skaičiuojami eurais), pirkimo valiutos laukas rodo dokumento valiutą, o originalios sumos, kursas, kurso data ir šaltinis išsaugomos kartu su pirkimu. Eilutės PVM perskaičiuojamas iš eurais perskaičiuotos sumos be PVM pagal eilutės tarifą, todėl gali skirtis nuo dokumente nurodyto PVM keliais centais.',
              'Jei sumas jau įvedėte eurais, pažymėkite „sumos jau įvestos eurais“ – kursas netaikomas.',
            ],
          },
          {
            title: 'Kreditinės sąskaitos iš PDF ar nuotraukos',
            items: [
              'Jei atpažintas dokumentas yra kreditinė sąskaita (arba pažymite langelį „Tai kreditinė sąskaita“), jis registruojamas ne kaip naujas pirkimas, o kaip pasirinkto pradinio pirkimo korekcija – taip pat, kaip kreditinis pirkimas arba XML importas.',
              'Pradinį pirkimą visada pasirenkate jūs. Programa pasiūlo tą, kurio numeris sutampa su dokumente nurodytu pradinės sąskaitos numeriu (tame pačiame tiekėjo pirkimų sąraše); jei nuorodos nėra ar ji neaiški, pasirinkite rankiniu būdu. Tiekėjas turi būti žinyne ir sutapti su pradinio pirkimo tiekėju.',
              'Sumos gali būti nurodytos su minuso ženklu arba be jo – programa naudoja teigiamas sumas ir pati pasirašo jas neigiamai. Galioja tos pačios taisyklės kaip kreditiniam pirkimui: kreditinių dokumentų suma ir PVM neviršija pradinio dokumento, PVM tarifai turi sutapti, atskaitomo PVM dalis perkeliama iš pradinio pirkimo, korekcijos data negali būti ankstesnė už pradinio dokumento datą.',
              'Prekes, grąžintas tiekėjui, galima susieti su esama atsargų kortele – tada jos išrašomos iš atsargų. Užsienio valiutos kreditinis dokumentas ir kreditinis dokumentas prie užsienio valiuta užregistruoto pirkimo čia nepriimami: įveskite sumas eurais arba naudokite kreditinio pirkimo formą.',
            ],
          },
          {
            title: 'Atpažinimo išlaidos ir mėnesio limitas',
            items: [
              'Kiekvienas atpažinimas įrašomas kartu su teikėjo grąžintu žetonų skaičiumi (įvesties ir išvesties) ir modeliu. Iš to skaičiuojama apytikslė kaina pagal modelio kainoraštį; ji rodoma dokumentų sąraše, peržiūros ekrane ir įmonės atpažinimo nustatymuose (šio mėnesio suma).',
              'Tai įvertis, o ne sąskaita: galutinę sumą visada rodo teikėjo svetainė. Kainoraštis laikomas programoje, USD paverčiami eurais fiksuotu koeficientu (0,92; galima pakeisti aplinkos kintamuoju RECOGNITION_USD_TO_EUR).',
              'Įmonės nustatymuose galima nurodyti mėnesio limitą eurais. Pasiekus jį, automatinis atpažinimas (įkėlimas, dalinimasis iš telefono, el. paštas, mygtukas „Atpažinti“) sustoja iki kito kalendorinio mėnesio (UTC); dokumentai vis tiek išsaugomi, o duomenis galima suvesti rankiniu būdu. Limitą galima padidinti ar panaikinti bet kada.',
              'Limitas programoje neatstoja limito teikėjo svetainėje – nustatykite abu.',
            ],
          },
          {
            title: 'Greita peržiūra iš eilės',
            items: [
              'Sąraše paspauskite „Peržiūrėti iš eilės“: atidaromas seniausias laukiantis dokumentas. Patvirtinus ar atmetus, automatiškai atidaromas kitas laukiantis dokumentas; kai eilė baigiasi, grįžtama į sąrašą.',
              'Klavišų deriniai peržiūros ekrane: Ctrl+Enter (Mac: Cmd+Enter) – patvirtinti (tik kai patvirtinti galima: nėra klaidų ir veiksmas nevyksta); Alt+→ ir Alt+← – kitas ir ankstesnis laukiantis dokumentas; Esc – atgal į sąrašą; R – pasukti nuotrauką; + ir − – keisti mastelį.',
              'Esc, R, + ir − neveikia, kai žymeklis yra įvedimo lauke ar sąraše, todėl rašymo jie netrukdo; Ctrl+Enter ir Alt+rodyklės veikia ir laukuose. Kol atidarytas patvirtinimo langas, sparčiųjų klavišų reakcija išjungta.',
            ],
          },
          {
            title: 'Archyvas patikrinimui',
            items: [
              'Skiltyje „Gauti dokumentai“ (apačioje) pasirinkite pirkimo datų laikotarpį ir paspauskite „Parsisiųsti archyvą“. Gausite ZIP failą: originalai/ su visų laikotarpio pirkimų originaliais dokumentais (pavadinimas <data>_<tiekėjas>_<numeris>.<plėtinys>), registras.csv ir README.txt.',
              'Registre (CSV, atidaroma Excel) kiekvienam dokumentui nurodyta: data, tiekėjas, kodas, PVM kodas, serija ir numeris, sumos be PVM / PVM / su PVM, valiuta, dokumento rūšis, PVM kodai, debeto sąskaita, kas apmokėjo, banko ryšys, originalo failo pavadinimas, SHA-256, įkėlimo laikas ir kas įkėlė, kas ir kada patvirtino.',
              'SHA-256 įrodo, kad failai nepakeisti: ji apskaičiuojama įkeliant, o failas saugomas tik vieną kartą ir niekada neperrašomas. Inspektorius gali apskaičiuoti failo sumą (README.txt yra komandos) ir palyginti su registru.',
              'Pirkimai, kuriems originalas nepateiktas (importuoti ar suvesti rankiniu būdu), registre pažymimi „originalas nepateiktas“. XML e-sąskaitos vaizdinis PDF dedamas kaip atskiras failas. Archyvas siunčiamas srautu, todėl didelis laikotarpis neapkrauna atminties; viršijus 5 metų laikotarpį ar 4 GB programa pasiūlo trumpesnį laikotarpį.',
            ],
          },
          {
            title: 'Dalinimasis iš telefono',
            items: [
              'Android: atidarykite programą naršyklėje Chrome, meniu pasirinkite „Įdiegti programą“ (Install app) arba „Pridėti prie pagrindinio ekrano“. Po to nuotrauką ar PDF pasirinkite galerijoje ar failų programoje, paspauskite „Dalintis“ ir pasirinkite kontas.download.',
              'Dalinantis turite būti prisijungę; jei ne, programa nukreips į prisijungimą – po prisijungimo dalinimąsi pakartokite.',
              'Pasidalinti failai išsaugomi skiltyje „Gauti dokumentai“ ir (jei atpažinimas įjungtas) iškart atpažįstami; nieko nepatvirtinama automatiškai.',
              'iPhone: Safari nepalaiko dalinimosi į svetainę, todėl naudokite „Gauti dokumentai“ įkėlimo puslapį ir fotoaparato mygtuką arba failo pasirinkimą.',
            ],
          },
        ],
      },
      ru: {
        title: 'Распознавание документов',
        summary: 'Распознавание фото и PDF счетов и чеков покупок: ключ, выбор модели, стоимость, конфиденциальность, как фотографировать и хранение оригиналов.',
        purpose: [
          'В меню «Полученные документы» вы загружаете счёт покупки или кассовый чек (PDF или фото). Сервис распознавания извлекает поставщика, дату, номер, строки и PVM, а программа готовит черновик покупки. Вы проверяете данные рядом с оригиналом, исправляете и подтверждаете.',
          'Автоматически ничего не записывается: покупка, поставщик и проводки создаются только после нажатия «Подтвердить».',
          'При подтверждении создаётся: покупка (с кодами PVM строк и счётом расходов), новый поставщик (если такого ещё нет), ссылка на неизменённый оригинал, а покупка, оплаченная собственными средствами, попадает в список возмещаемых расходов.',
          'Счёт расходов (дебет) заполняется заранее: сначала по последней покупке у этого поставщика (видно, по какому документу), а для нового поставщика — по содержанию документа как предложение с кратким пояснением. Предложение всегда можно изменить; коды PVM автоматически не выбираются. При подтверждении сохраняется источник счёта (история, предложение или ваш выбор).',
        ],
        steps: [
          'Зарегистрируйтесь на console.anthropic.com на имя компании (желательно с корпоративной почтой, а не личной).',
          'В разделе «Billing» пополните кредит небольшой суммой и задайте месячный лимит расходов — тогда стоимость не превысит заданной границы.',
          'В разделе «API keys» создайте ключ и сразу скопируйте его: позже сайт его больше не покажет.',
          'В программе откройте «Компании» и настройки активной компании (SMTP и распознавание документов), раздел «Распознавание документов».',
          'Вставьте ключ, выберите модель и включите распознавание.',
          'Нажмите «Проверить ключ». Сообщение об успехе означает, что ключ работает и есть кредит; затем нажмите «Сохранить».',
          'Откройте «Полученные документы», загрузите файл и проверьте черновик перед подтверждением.',
        ],
        rules: [
          'Дубликаты: помимо идентичного файла (SHA-256) проверяется и содержимое. Тот же поставщик и тот же номер документа (регистр, пробелы, дефисы и ведущие нули не учитываются) либо тот же номер чека и кассового аппарата считаются вероятным дубликатом: подтвердить можно, только отметив «Это не дубликат, всё равно подтвердить». Тот же поставщик, та же сумма и дата ±3 дня — только предупреждение. Сравнение идёт с покупками и другими ещё не подтверждёнными полученными документами (например, два фото одного чека).',
          'Ключ хранится в зашифрованном виде и повторно не показывается; когда ключ уже сохранён, поле можно оставить пустым. Ключ можно удалить.',
          'Пока компания не включила распознавание и не указала ключ, никакие документы никуда не отправляются: файлы только сохраняются, данные вводятся вручную.',
          'Тот же файл (по контрольной сумме) повторно не загружается. Такая же комбинация серии и номера счёта поставщика в покупках тоже не допускается.',
          'Для чека без реквизитов покупателя доля вычитаемого PVM по умолчанию 0 %. Увеличить её можно только при наличии счёта-фактуры PVM.',
          'Сервис распознавания может ошибаться: суммы, ставки PVM и поставщика всегда проверяет человек, программа показывает предупреждения о расхождениях.',
        ],
        mistakes: [
          'Подтверждение без проверки сумм и PVM — результат распознавания является лишь предложением.',
          'Мнение, что кассовый чек даёт вычет PVM — без реквизитов покупателя, как правило, не даёт.',
          'Ключ вставлен с пробелом в начале или конце либо ключ другого поставщика.',
          'Не задан месячный лимит расходов на сайте поставщика.',
          'Бумажный чек выброшен без проверки, что цифровая копия читаема и что уничтожение бумаги разрешено.',
        ],
        notes: [
          {
            title: 'Выбор модели и стоимость',
            items: [
              'Claude Opus 5.5 (по умолчанию): самая точная; 4 USD / 20 USD за 1 млн входных / выходных токенов; примерно 3–5 центов за документ.',
              'Claude Sonnet 5.5: сбалансированная; 2 USD / 10 USD за 1 млн токенов; примерно 1–3 цента за документ.',
              'Claude Haiku 5.5: самая быстрая и дешёвая; 0,10 USD / 0,50 USD за 1 млн токенов; стоимость — доли цента, но на плохих фото больше ошибок.',
              'Цены указаны на дату выпуска (ноябрь 2026), стоимость за документ — оценка и зависит от числа страниц и строк. Актуальные цены проверяйте на сайте поставщика.',
            ],
          },
          {
            title: 'Данные и конфиденциальность',
            items: [
              'Для распознавания документ (PDF или фото со всем текстом) отправляется внешнему поставщику. В документах могут быть персональные данные (например, покупателя, последние цифры карты).',
              'По условиям API поставщика данные, отправленные через API, по умолчанию не используются для обучения моделей. Рекомендуем самостоятельно прочитать эти условия и политику конфиденциальности, так как они могут меняться.',
              'Функция выключена, пока компания сама не включит её и не введёт свой ключ. Распознавание можно в любой момент выключить, а ключ удалить.',
            ],
          },
          {
            title: 'Как фотографировать чеки',
            items: [
              'Фотографируйте в тот же день: чеки на термобумаге выцветают за 1–2 года, а учётные документы нужно хранить 10 лет.',
              'Чек должен быть виден целиком, разглажен, параллелен телефону, хорошо освещён, без бликов и теней. Длинный чек удобнее отсканировать сканером документов телефона в один PDF.',
              'Фото iPhone в формате HEIC принимаются напрямую: программа сама преобразует их в JPEG. При желании можно выбрать на телефоне «Наиболее совместимый» (JPEG) — это необязательно.',
              'Для распознавания программа готовит копию фото: поворачивает по ориентации снимка, уменьшает слишком большое (длинная сторона свыше 2500 px) и слегка корректирует контраст. Оригинал хранится без изменений (с контрольной суммой); для просмотра HEIC показывается эта подготовленная копия.',
              'Поддерживаются файлы PDF, JPEG, PNG, WebP и HEIC до 20 МБ.',
            ],
          },
          {
            title: 'Хранение оригиналов и чеки против счетов с PVM',
            items: [
              'Оригинал хранится без изменений, с контрольной суммой (SHA-256), временем загрузки и отправителем, входит в резервные копии и пакет экспорта компании. В карточке покупки есть ссылка на оригинал.',
              'Можно ли уничтожать бумажный оригинал после оцифровки, определяет порядок отбора и сохранения бумажных документов в электронной форме (приказ Главного архивариуса Литвы 2019 г. № VE-73). Перед уничтожением бумаги проверьте действующую редакцию на e-tar.lt или посоветуйтесь с бухгалтером или VMI.',
              'Кассовый чек без реквизитов покупателя, как правило, не даёт права на вычет PVM; для вычета нужен счёт-фактура PVM с данными покупателя. Поэтому в форме чека доля вычета по умолчанию 0 %.',
              'Программа не решает, соответствует ли конкретная операция правилам учёта и налогов; это остаётся на ответственности пользователя и его бухгалтера.',
            ],
          },
          {
            title: 'Устранение неполадок',
            items: [
              'Неверный ключ: проверьте, что скопирован весь ключ без пробелов, что он создан в том же рабочем пространстве аккаунта поставщика и не был удалён. Если сомневаетесь, создайте новый и вставьте заново.',
              'Нет кредита или превышен лимит: пополните кредит или увеличьте месячный лимит в разделе «Billing» на сайте поставщика. При ограничении частоты запросов подождите несколько минут и повторите распознавание.',
              'Размытое фото или считана только часть: сфотографируйте заново или введите данные вручную. Для плохих фото выбирайте более точную модель.',
              'Фото HEIC не открывается или распознавание не удаётся: файл может быть повреждён или иметь необычный формат — сохраните его как JPEG или PDF и загрузите заново.',
              'Документ уже загружен: программа показывает номер существующего документа; откройте его вместо создания дубля.',
              'Выбран не тот поставщик: в форме проверки измените поставщика или выберите нового; проверьте код компании.',
            ],
          },
          {
            title: 'Приём документов по эл. почте',
            items: [
              'Программа может сама забирать счета из почтового ящика: каждые 5 минут она читает указанный ящик, а PDF и фото из писем разрешённых отправителей сохраняет в разделе «Полученные документы» (источник «Эл. почта», виден отправитель). Покупка по-прежнему создаётся только после вашего подтверждения. Менять DNS-записи домена компании не нужно.',
              'Настройки: «Компании» > настройки активной компании > «Почтовый ящик для документов». Укажите IMAP-сервер, порт (обычно 993 с SSL/TLS), имя пользователя, пароль и папку, затем «Проверить соединение» и «Сохранить».',
              'Вариант 1 – новый ящик на существующем почтовом сервере: в панели управления хостингом создайте отдельный ящик (например, saskaitos@vasha-firma.lt). Создание ящика не является изменением DNS. Попросите поставщиков присылать счета на этот адрес; адрес IMAP-сервера указан в инструкции хостинга.',
              'Вариант 2 – бесплатный Gmail: создайте отдельный аккаунт Gmail, включите двухэтапную проверку, создайте «пароль приложения» (App password) и включите IMAP в настройках аккаунта. В программе нажмите «Шаблон Gmail» (imap.gmail.com, 993) и введите в поле пароля пароль приложения, а не обычный пароль аккаунта.',
              'Вариант 3 – папка в обычном ящике: в почтовой программе создайте папку (например, «Счета») и правило, которое переносит в неё письма со счетами. В программе укажите эту папку в поле «Папка для чтения».',
              'Разрешённые отправители: по одному адресу эл. почты или @домену в строке. Пустой список означает, что не принимается никто. Это обязательно: иначе любой, узнав адрес, мог бы «подбросить» расходы. Программа дополнительно отклоняет письма, которые почтовый сервер сам пометил как поддельные (DMARC), но это лишь дополнительная защита; основная – ваш список.',
              'Что происходит с письмами: при первом чтении берутся только непрочитанные письма, чтобы старая история не попала в программу. Обработанное письмо помечается прочитанным или (если указана «Папка для обработанных писем») переносится в эту папку. Одно и то же письмо или файл повторно не принимается. Небольшие встроенные картинки (подписи, логотипы) игнорируются; предел одного письма – 10 вложений по 20 МБ.',
              'XML-счета (UBL) в письме: сохраняются в очереди «Полученные документы» без сервиса распознавания — данные читаются прямо из файла, а после подтверждения покупка создаётся тем же путём, что и при XML-импорте (в том числе кредитные счета). Если в письме есть PDF с тем же именем (или единственный PDF), он становится визуальным оригиналом XML: в очереди остаётся одна запись, а источник данных — XML. XML, который программа не может прочитать, в очередь не попадает; в журнале будет пометка «XML-счёт не принят» с причиной, а PDF (если есть) обрабатывается как обычно. Вложения-фото HEIC принимаются так же, как JPEG.',
              'Проверка идёт каждые 5 минут (в облачной версии, где программа между визитами «спит», – каждые 15 минут и только при включённом ящике); кнопка «Проверить сейчас» запускает её немедленно. Последнюю проверку, ошибку и журнал последних писем видно в том же блоке настроек. Пароль хранится зашифрованным и не показывается; в пакет экспорта компании он, как и SMTP, не включается.',
            ],
          },
          {
            title: 'Основные средства и запасы из документа',
            items: [
              'В каждой строке можно (по желанию) указать, что она относится к запасам или к основным средствам. По умолчанию строка регистрируется как обычный расход или услуга.',
              'Основные средства: при выборе счёта основных средств (например 1206 Прочее оборудование, 1204 Машины и оборудование, 1205 Транспортные средства, 1202 Здания, 1130 Программное обеспечение) в строке появляется отметка «Создать карточку основного средства». При подтверждении документа создаётся карточка: название из строки, дата приобретения из документа, дата ввода в эксплуатацию (по умолчанию та же), стоимость приобретения = сумма без PVM + невычитаемая часть PVM. Карточка связывается с покупкой и её строкой, а амортизация регистрируется в разделе «Основные средства».',
              'Если срок полезного использования не указан, применяется налоговая норма группы имущества. Карточка создаётся одна на каждую отмеченную строку (на всё количество строки); отдельные единицы создавайте отдельными строками. Если правила учёта основных средств карточку не принимают (например код уже занят), не подтверждается ни документ, ни карточка.',
              'Запасы: если в компании ведётся учёт запасов, строку можно связать с существующей карточкой запасов (программа предлагает карточку с таким же названием) или создать новую, указав код. При подтверждении покупка оприходует запасы так же, как обычная покупка: по коду карточки и складу. Все связанные карточки должны быть на одном складе.',
              'Строка не может быть одновременно основным средством и запасами. Пока вы не подтвердите документ, ничего не создаётся.',
            ],
          },
          {
            title: 'Документы в иностранной валюте',
            items: [
              'Если в документе указана валюта, отличная от евро, в форме появляется блок курса: суммы остаются такими, как напечатаны в документе (в исходной валюте), а программа показывает их эквивалент в евро по курсу.',
              'Курс получается автоматически из опубликованных Европейским центральным банком (ECB) курсов евро к иностранным валютам: берётся курс на дату документа, а если на эту дату он не публиковался (выходной, праздник) — последний предыдущий. Полученные курсы сохраняются в программе, поэтому один и тот же курс повторно из интернета не загружается.',
              'В Литве иностранная валюта в день операции обычно пересчитывается по курсу евро к валюте, опубликованному Европейским центральным банком (или Банком Литвы). Программа применяет курс ECB на дату документа; подходит ли такой курс именно в вашем случае (например, когда даты счёта и учёта PVM различаются или применяется иная политика), уточните у бухгалтера.',
              'Нет связи или ECB не опубликовал курс этой валюты? Введите курс вручную (единиц валюты за 1 EUR, как публикует ECB). Курс, введённый вручную, помечается в покупке как «введён вручную».',
              'После подтверждения покупка хранится в евро (все отчёты и PVM считаются в евро), поле валюты покупки показывает валюту документа, а исходные суммы, курс, дата курса и источник сохраняются вместе с покупкой. PVM строки пересчитывается от суммы без PVM в евро по ставке строки, поэтому может отличаться от PVM в документе на несколько центов.',
              'Если суммы уже введены в евро, отметьте «суммы уже введены в евро» — курс не применяется.',
            ],
          },
          {
            title: 'Кредитные счета из PDF или фото',
            items: [
              'Если распознанный документ — кредитный счёт (или вы отмечаете «Это кредитный счёт»), он регистрируется не как новая покупка, а как корректировка выбранной исходной покупки — так же, как кредитная покупка или импорт XML.',
              'Исходную покупку всегда выбираете вы. Программа предлагает ту, номер которой совпадает с номером исходного счёта, указанным в документе (среди покупок того же поставщика); если ссылки нет или она неясна, выберите вручную. Поставщик должен быть в справочнике и совпадать с поставщиком исходной покупки.',
              'Суммы можно указывать с минусом или без него — программа использует положительные суммы и сама записывает их с отрицательным знаком. Действуют те же правила, что для кредитной покупки: сумма и PVM кредитных документов не превышают исходный документ, ставки PVM должны совпадать, доля вычитаемого PVM переносится из исходной покупки, дата корректировки не может быть раньше даты исходного документа.',
              'Товары, возвращённые поставщику, можно связать с существующей карточкой запасов — тогда они списываются из запасов. Кредитный документ в иностранной валюте и кредитный документ к покупке, зарегистрированной в иностранной валюте, здесь не принимаются: введите суммы в евро или используйте форму кредитной покупки.',
            ],
          },
          {
            title: 'Расходы на распознавание и месячный лимит',
            items: [
              'Каждое распознавание записывается вместе с числом токенов (входных и выходных), которое вернул провайдер, и моделью. По этому числу считается приблизительная стоимость по прайс-листу модели; она показывается в списке документов, на экране проверки и в настройках распознавания компании (сумма за этот месяц).',
              'Это оценка, а не счёт: итоговую сумму всегда показывает сайт провайдера. Прайс-лист хранится в программе, USD пересчитываются в евро по фиксированному коэффициенту (0,92; можно изменить переменной окружения RECOGNITION_USD_TO_EUR).',
              'В настройках компании можно указать месячный лимит в евро. По его достижении автоматическое распознавание (загрузка, отправка с телефона, эл. почта, кнопка «Распознать») останавливается до следующего календарного месяца (UTC); документы всё равно сохраняются, данные можно ввести вручную. Лимит можно увеличить или снять в любое время.',
              'Лимит в программе не заменяет лимит на сайте провайдера — задайте оба.',
            ],
          },
          {
            title: 'Быстрая проверка по очереди',
            items: [
              'В списке нажмите «Проверять по очереди»: откроется самый старый ожидающий документ. После подтверждения или отклонения автоматически открывается следующий ожидающий документ; когда очередь закончится, вы вернётесь к списку.',
              'Клавиши на экране проверки: Ctrl+Enter (Mac: Cmd+Enter) — подтвердить (только когда подтверждение возможно: нет ошибок и действие не выполняется); Alt+→ и Alt+← — следующий и предыдущий ожидающий документ; Esc — назад к списку; R — повернуть фото; + и − — масштаб.',
              'Esc, R, + и − не работают, когда курсор в поле ввода или списке, поэтому не мешают вводу; Ctrl+Enter и Alt+стрелки работают и в полях. Пока открыто окно подтверждения, клавиши отключены.',
            ],
          },
          {
            title: 'Архив для проверки',
            items: [
              'В разделе «Полученные документы» (внизу) выберите период дат покупок и нажмите «Скачать архив». Вы получите ZIP-файл: originalai/ с оригиналами документов всех покупок периода (имя <дата>_<поставщик>_<номер>.<расширение>), registras.csv и README.txt.',
              'В реестре (CSV, открывается в Excel) для каждого документа указано: дата, поставщик, код, PVM-код, серия и номер, суммы без PVM / PVM / с PVM, валюта, вид документа, коды PVM, счёт дебета, кто оплатил, связь с банком, имя исходного файла, SHA-256, время загрузки и кто загрузил, кто и когда подтвердил.',
              'SHA-256 доказывает, что файлы не изменены: она вычисляется при загрузке, а файл хранится один раз и никогда не перезаписывается. Инспектор может вычислить сумму файла (команды есть в README.txt) и сравнить с реестром.',
              'Покупки без оригинала (импортированные или введённые вручную) отмечены в реестре «originalas nepateiktas». PDF-образ XML-счёта кладётся отдельным файлом. Архив отдаётся потоком, поэтому большой период не нагружает память; для периода свыше 5 лет или 4 ГБ программа предложит более короткий период.',
            ],
          },
          {
            title: 'Отправка с телефона',
            items: [
              'Android: откройте программу в браузере Chrome, в меню выберите «Установить приложение» (Install app) или «Добавить на главный экран». Затем выберите фото или PDF в галерее или файловом менеджере, нажмите «Поделиться» и выберите kontas.download.',
              'При отправке вы должны быть авторизованы; если нет, программа перенаправит на вход — после входа повторите отправку.',
              'Отправленные файлы сохраняются в «Полученные документы» и (если распознавание включено) сразу распознаются; ничего не подтверждается автоматически.',
              'iPhone: Safari не поддерживает отправку в сайт, поэтому используйте страницу загрузки «Полученные документы» и кнопку камеры или выбор файла.',
            ],
          },
        ],
      },
      en: {
        title: 'Document recognition',
        summary: 'Recognising photos and PDFs of purchase invoices and receipts: key, model choice, cost, privacy, how to photograph and how originals are kept.',
        purpose: [
          'In "Received documents" you upload a purchase invoice or a cash receipt (PDF or photo). The recognition service extracts the supplier, date, number, lines and VAT, and the program prepares a purchase draft. You review the data next to the original, correct it and confirm.',
          'Nothing is booked automatically: the purchase, the supplier and the postings are created only when you press "Confirm".',
          "On confirmation the program creates: the purchase (with line VAT codes and the expense account), a new supplier if none matches, a link to the unchanged original, and a purchase paid from own funds is added to the list of expenses to reimburse.",
          "The expense (debit) account is pre-filled: first from the supplier's latest purchase (the source document is shown), and for a new supplier from the document content as a suggestion with a short reason. You can always change it; VAT codes are never chosen automatically. On confirmation the source of the account (history, suggestion or your choice) is stored.",
        ],
        steps: [
          "Register at console.anthropic.com in the company's name (preferably with a company e-mail, not a personal one).",
          'In "Billing" top up the credit with a small amount and set a monthly spend limit, so the cost never exceeds the limit you chose.',
          'In "API keys" create a key and copy it at once: the site will not show it again.',
          'In the program open "Companies" and the settings of the active company (SMTP and document recognition), the "Document recognition" section.',
          'Paste the key, choose a model and enable recognition.',
          'Press "Check key". A success message means the key works and there is credit; then press "Save".',
          'Open "Received documents", upload a file and review the draft before confirming.',
        ],
        rules: [
          'Duplicates: besides an identical file (SHA-256) the content is checked too. The same supplier and the same document number (case, spaces, dashes and leading zeros are ignored) or the same receipt and cash register number is a likely duplicate that can only be confirmed by ticking "This is not a duplicate, confirm anyway". The same supplier, the same total and a date within 3 days is only a warning. The comparison covers purchases and other unconfirmed received documents (for example two photos of one receipt).',
          'The key is stored encrypted and is never shown again; when a key is already stored the field can stay empty. The key can be removed.',
          'Until the company enables recognition and provides a key, no document is sent anywhere: files are only stored and the data is entered by hand.',
          'The same file (by checksum) cannot be uploaded twice. The same supplier invoice series and number cannot be entered twice in purchases either.',
          "For a receipt without the buyer's details the deductible VAT share defaults to 0 %. It can be raised only with a VAT invoice.",
          'The recognition service can be wrong: amounts, VAT rates and the supplier are always checked by a person, and the program shows warnings about mismatches.',
        ],
        mistakes: [
          'Confirming without checking amounts and VAT: the recognition result is only a suggestion.',
          "Assuming a cash receipt gives a VAT deduction: without the buyer's details it generally does not.",
          'Pasting a key with a space at the start or end, or a key of another provider.',
          "Not setting a monthly spend limit on the provider's site.",
          'Throwing the paper receipt away without checking that the digital copy is legible and that destroying paper is allowed.',
        ],
        notes: [
          {
            title: 'Model choice and cost',
            items: [
              'Claude Opus 5.5 (default): the most accurate; USD 4 / USD 20 per 1 million input / output tokens; roughly 3–5 cents per document.',
              'Claude Sonnet 5.5: balanced; USD 2 / USD 10 per 1 million tokens; roughly 1–3 cents per document.',
              'Claude Haiku 5.5: fastest and cheapest; USD 0.10 / USD 0.50 per 1 million tokens; fractions of a cent, but more errors on poor photos.',
              "Prices are as of the release date (November 2026); the cost per document is an estimate and depends on the page and line count. Check the provider's current pricing.",
            ],
          },
          {
            title: 'Data and privacy',
            items: [
              'For recognition the document (a PDF or photo with all its text) is sent to an external provider. Documents may contain personal data (for example the buyer, last digits of a card).',
              "Under the provider's API terms, data sent through the API is by default not used to train models. We recommend reading those terms and the privacy policy yourself, as they may change.",
              'The feature is off until the company enables it and enters its own key. Recognition can be turned off and the key removed at any time.',
            ],
          },
          {
            title: 'How to photograph receipts',
            items: [
              'Photograph on the same day: thermal-paper receipts fade within 1–2 years and accounting records must be kept for 10 years.',
              "The whole receipt must be visible, flat, parallel to the phone, well lit, without glare or shadows. A long receipt is best scanned with the phone's document scanner into one PDF.",
              'iPhone photos in HEIC are accepted directly: the program converts them to JPEG itself. If you like, you can choose "Most Compatible" (JPEG) on the phone - it is optional.',
              'For recognition the program prepares a copy of the photo: it rotates it by the photo orientation, shrinks one that is too large (long side over 2500 px) and adjusts the contrast slightly. The original is kept unchanged (with its checksum); for viewing, a HEIC photo is shown as that prepared copy.',
              'PDF, JPEG, PNG, WebP and HEIC files up to 20 MB are supported.',
            ],
          },
          {
            title: 'Keeping originals, and receipts versus VAT invoices',
            items: [
              'The original is stored unchanged, with a checksum (SHA-256), upload time and sender, and is included in backups and the company export package. The purchase card links to the original.',
              'Whether a paper original may be destroyed after digitisation is governed by the rules on selecting and keeping paper documents in electronic form (Order No. VE-73 of 2019 of the Chief Archivist of Lithuania). Before destroying paper, check the current wording on e-tar.lt or consult an accountant or the VMI.',
              "A cash receipt without the buyer's details generally gives no right to deduct VAT; the deduction needs a VAT invoice with the buyer's details. That is why the receipt form defaults to a 0 % deduction.",
              'The program does not decide whether a specific transaction meets accounting or tax rules; that remains the responsibility of the user and the accountant.',
            ],
          },
          {
            title: 'Troubleshooting',
            items: [
              'Invalid key: check that the whole key was copied without spaces, that it was created in the same workspace of the provider account and that it has not been deleted. If in doubt, create a new one and paste it again.',
              'No credit or limit reached: top up the credit or raise the monthly limit in "Billing" on the provider\'s site. On a rate limit wait a few minutes and run the recognition again.',
              'Blurry photo or only part was read: photograph again or enter the data by hand. For poor photos choose a more accurate model.',
              'A HEIC photo does not open or recognition fails: the file may be damaged or in an unusual format - save it as JPEG or PDF and upload it again.',
              'Document already uploaded: the program shows the number of the existing document; open it instead of creating a duplicate.',
              'Wrong supplier matched: in the review form change the supplier or choose a new one; check the company code.',
            ],
          },
          {
            title: 'Receiving documents by e-mail',
            items: [
              'The program can fetch invoices from a mailbox by itself: every 5 minutes it reads the mailbox you name and stores the PDF and photo attachments of messages from allowed senders in "Received documents" (source "E-mail", the sender is shown). A purchase is still created only after you confirm it. No DNS records of the company domain need to change.',
              'Settings: "Companies" > settings of the active company > "Mailbox for documents". Enter the IMAP server, the port (usually 993 with SSL/TLS), the username, the password and the folder, then "Test connection" and "Save".',
              'Option 1 - a new mailbox at your existing mail host: create a dedicated mailbox (for example invoices@your-company.lt) in the hosting control panel. Creating a mailbox is not a DNS change. Ask suppliers to send invoices to that address; the IMAP server address is in the hosting instructions.',
              'Option 2 - a free Gmail: create a separate Gmail account, turn on 2-step verification, create an "App password" and enable IMAP in the account settings. In the program press "Gmail preset" (imap.gmail.com, 993) and enter the app password in the password field, not the normal account password.',
              'Option 3 - a folder in your normal mailbox: in your mail program create a folder (for example "Invoices") and a rule that moves invoice messages into it. Enter that folder in "Folder to read".',
              'Allowed senders: one e-mail address or @domain per line. An empty list means nobody is accepted. This is required, because otherwise anyone who learns the address could inject expenses. The program also refuses messages that the mail server itself marked as forged (DMARC), but that is only an extra safeguard; your list is the real protection.',
              'What happens to messages: the first run reads only unread messages so that old history does not enter the program. A processed message is marked as read or, if a "Folder for processed messages" is set, moved to it. The same message or file is not accepted twice. Small inline images (signatures, logos) are ignored; the limit per message is 10 attachments of 20 MB each.',
              'XML e-invoices (UBL) in a message: they are stored in the "Received documents" queue without the recognition service - the data is read straight from the file, and on confirmation the purchase is created the same way as by the XML import (credit notes too). If the message also holds a PDF with the same file name (or the only PDF), it becomes the XML\'s visual original: one queue item remains and the data source is the XML. An XML the program cannot read is not queued; the log shows the note "XML e-invoice not accepted" with the reason, and the PDF (if any) is processed as usual. HEIC photo attachments are accepted just like JPEG.',
              'Checks run every 5 minutes (on the cloud installation, where the program sleeps between visits, every 15 minutes and only while a mailbox is enabled); the "Check now" button runs one at once. The last check, the last error and the log of recent messages are shown in the same settings block. The password is stored encrypted and never shown; like SMTP it is not part of the company export package.',
            ],
          },
          {
            title: 'Fixed assets and stock from a document',
            items: [
              'On every line you may (optionally) mark it as stock or as a fixed asset. By default a line is booked as an ordinary expense or service.',
              'Fixed assets: when you choose a fixed asset account (for example 1206 Other equipment, 1204 Machinery and equipment, 1205 Vehicles, 1202 Buildings, 1130 Software), the line shows "Create a fixed asset card". Confirming the document creates the card: the name from the line, the acquisition date from the document, the date put into use (the same by default), and the acquisition cost = net amount + the non-deductible part of the VAT. The card is linked to the purchase and its line, and depreciation is posted in the "Fixed assets" section.',
              'If you leave the useful life empty, the tax norm of the asset group applies. One card is created for each marked line (for the whole line quantity); create separate units as separate lines. If the fixed asset rules refuse the card (for example the code is taken), neither the document nor the card is confirmed.',
              'Stock: when the company keeps inventory accounting, you can link a line to an existing stock card (the program suggests the card with the same name) or create a new card by entering a code. On confirmation the purchase books the stock receipt the same way as a normal purchase: by the card code and warehouse. All linked cards must be in one warehouse.',
              'A line cannot be both a fixed asset and stock. Nothing is created until you confirm the document.',
            ],
          },
          {
            title: 'Foreign currency documents',
            items: [
              'If the document currency is not euro, the form shows a rate block: the amounts stay as printed on the document (in the original currency), and the program shows their euro equivalent at the rate.',
              'The rate is fetched automatically from the euro foreign exchange reference rates published by the European Central Bank (ECB): the rate of the document date is used, or, if none was published that day (weekend, holiday), the last earlier one. Fetched rates are kept in the program, so the same rate is not downloaded twice.',
              'In Lithuania a foreign currency amount is normally converted on the day of the transaction at the euro exchange rate published by the European Central Bank (or the Bank of Lithuania). The program applies the ECB rate for the document date; whether that rate fits your particular case (for example when the invoice and VAT accounting dates differ, or you follow another policy), check with your accountant.',
              'No connection, or the ECB has not published a rate for that currency? Type the rate by hand (currency units per 1 EUR, as the ECB quotes it). A rate typed by hand is marked "typed by hand" on the purchase.',
              'After confirmation the purchase is stored in euro (all reports and VAT are calculated in euro), the currency field of the purchase shows the document currency, and the original amounts, the rate, the rate date and the source are kept with the purchase. The VAT of a line is recalculated from the euro net amount at the line rate, so it may differ from the VAT printed on the document by a few cents.',
              'If you already entered the amounts in euro, tick "amounts already entered in euro" - no rate is applied.',
            ],
          },
          {
            title: 'Credit notes from a PDF or a photo',
            items: [
              'If the recognized document is a credit note (or you tick "This is a credit note"), it is registered not as a new purchase but as a correction of the chosen original purchase - the same way as a credit purchase or an XML import.',
              'You always choose the original purchase. The program suggests the one whose number equals the original invoice number printed on the document (among the purchases of the same supplier); if there is no reference or it is unclear, choose by hand. The supplier must be in the list and be the supplier of the original purchase.',
              'Amounts may be entered with or without a minus sign - the program uses positive amounts and signs them negative itself. The same rules apply as for a credit purchase: the credit notes\' amount and VAT do not exceed the original document, the VAT rates must match, the deductible VAT share is carried over from the original purchase, and the correction date cannot be earlier than the original document date.',
              'Goods returned to the supplier can be linked to an existing stock card - then they leave the stock. A foreign currency credit note and a credit note against a purchase registered in a foreign currency are not accepted here: enter the amounts in euro or use the credit purchase form.',
            ],
          },
          {
            title: 'Recognition cost and the monthly limit',
            items: [
              'Every recognition is recorded together with the token counts (input and output) returned by the provider and the model. From them an approximate cost is calculated with the model price list; it is shown in the document list, on the review screen and in the company recognition settings (this month\'s total).',
              'This is an estimate, not an invoice: the provider\'s website always shows the final amount. The price list is kept in the program and USD is converted to euros at a fixed factor (0.92; it can be changed with the RECOGNITION_USD_TO_EUR environment variable).',
              'The company settings accept a monthly limit in euros. When it is reached automatic recognition (upload, phone share, e-mail, the Recognize button) pauses until the next calendar month (UTC); documents are still stored and the data can be entered manually. The limit can be raised or removed at any time.',
              'The limit in the program does not replace the limit on the provider\'s website - set both.',
            ],
          },
          {
            title: 'Fast review in order',
            items: [
              'In the list press "Review in order": the oldest waiting document opens. After you confirm or reject, the next waiting document opens automatically; when the queue is finished you return to the list.',
              'Keys on the review screen: Ctrl+Enter (Mac: Cmd+Enter) - confirm (only when confirming is allowed: no errors and no action running); Alt+→ and Alt+← - next and previous waiting document; Esc - back to the list; R - rotate the photo; + and − - zoom.',
              'Esc, R, + and − do nothing while the cursor is in an input field or a list, so they never get in the way of typing; Ctrl+Enter and Alt+arrows also work inside fields. While a confirmation dialog is open the keys are off.',
            ],
          },
          {
            title: 'Archive for an inspection',
            items: [
              'In "Received documents" (at the bottom) choose the period of purchase dates and press "Download the archive". You get a ZIP file: originalai/ with the original documents of all purchases of the period (named <date>_<supplier>_<number>.<extension>), registras.csv and README.txt.',
              'The register (CSV, opens in Excel) lists for each document: date, supplier, code, VAT code, series and number, amounts net / VAT / gross, currency, document type, VAT codes, debit account, who paid, bank link, original file name, SHA-256, upload time and uploader, who confirmed it and when.',
              'The SHA-256 proves the files are unchanged: it is calculated on upload, and the file is stored once and never overwritten. An inspector can calculate a file\'s checksum (README.txt has the commands) and compare it with the register.',
              'Purchases without an original (imported or entered manually) are marked "originalas nepateiktas" in the register. The PDF image of an XML e-invoice is added as a separate file. The archive is streamed, so a long period does not load the memory; for a period over 5 years or 4 GB the program asks for a shorter period.',
            ],
          },
          {
            title: 'Sharing from a phone',
            items: [
              'Android: open the program in Chrome, choose "Install app" or "Add to Home screen" in the menu. Then select a photo or PDF in the gallery or file manager, tap "Share" and choose kontas.download.',
              'You must be signed in when sharing; otherwise the program redirects to sign-in, and you repeat the share after signing in.',
              'Shared files are stored in "Received documents" and (if recognition is enabled) recognised at once; nothing is confirmed automatically.',
              'iPhone: Safari does not support share targets, so use the upload page of "Received documents" and the camera button or file picker.',
            ],
          },
        ],
      },
    },
  },
];
