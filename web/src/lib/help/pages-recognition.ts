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
              'iPhone nuotraukos HEIC formatu nepalaikomos: nustatymuose Fotoaparatas > Formatai pasirinkite „Maksimalus suderinamumas“ (JPEG) arba nuotrauką pasidalinkite kaip JPEG.',
              'Palaikomi PDF, JPEG, PNG ir WebP failai iki 20 MB.',
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
              'HEIC: žr. skyrių apie fotografavimą – naudokite JPEG.',
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
              'XML e-sąskaitos neimportuojamos automatiškai: žurnale matysite pastabą „XML e-sąskaita: importuokite per XML importą“ – atsisiųskite failą ir naudokite pirkimų XML importą. HEIC nuotraukos nepalaikomos (žr. skyrių apie fotografavimą).',
              'Tikrinimas vyksta kas 5 minutes; mygtukas „Tikrinti dabar“ paleidžia jį iškart. Paskutinį tikrinimą, klaidą ir paskutinių laiškų žurnalą matote tame pačiame nustatymų bloke. Slaptažodis saugomas užšifruotas ir nerodomas; į įmonės eksporto paketą jis, kaip ir SMTP, neįtraukiamas.',
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
              'Фото iPhone в формате HEIC не поддерживаются: в настройках Камера > Форматы выберите «Наиболее совместимый» (JPEG) или поделитесь фото как JPEG.',
              'Поддерживаются файлы PDF, JPEG, PNG и WebP до 20 МБ.',
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
              'HEIC: см. раздел о съёмке — используйте JPEG.',
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
              'XML-счета автоматически не импортируются: в журнале будет пометка «XML-счёт: импортируйте через XML-импорт» – скачайте файл и используйте XML-импорт покупок. Фотографии HEIC не поддерживаются (см. раздел о фотографировании).',
              'Проверка идёт каждые 5 минут; кнопка «Проверить сейчас» запускает её немедленно. Последнюю проверку, ошибку и журнал последних писем видно в том же блоке настроек. Пароль хранится зашифрованным и не показывается; в пакет экспорта компании он, как и SMTP, не включается.',
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
              'iPhone photos in HEIC are not supported: in Settings > Camera > Formats choose "Most Compatible" (JPEG) or share the photo as JPEG.',
              'PDF, JPEG, PNG and WebP files up to 20 MB are supported.',
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
              'HEIC: see the photographing section and use JPEG.',
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
              'XML e-invoices are not imported automatically: the log shows the note "XML e-invoice: import it through the XML import" - download the file and use the XML import of purchases. HEIC photos are not supported (see the photographing section).',
              'Checks run every 5 minutes; the "Check now" button runs one at once. The last check, the last error and the log of recent messages are shown in the same settings block. The password is stored encrypted and never shown; like SMTP it is not part of the company export package.',
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
