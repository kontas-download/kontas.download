import type { HelpPage } from './types';

export const userPages: HelpPage[] = [
  {
    slug: 'users',
    group: 'system',
    appHref: '/users',
    sources: ['eu-gdpr'],
    text: {
      lt: {
        title: 'Naudotojai ir rolės',
        summary: 'Kolegų paskyros, rolės administratorius ir buhalteris, išjungimas, slaptažodžiai.',
        purpose: [
          'Programa skirta keliems žmonėms. Pirmasis administratorius sukuriamas paleidžiant programą pirmą kartą; kitas paskyras kuria administratorius skiltyje „Naudotojai“. Savarankiškos registracijos nėra.',
          'Administratorius gali viską. Buhalteris atlieka visą įprastą apskaitos darbą visose įmonėse (dokumentai, kontragentai, bankas, DU, didžioji knyga, mokesčiai, ataskaitos, esamų įmonių rekvizitai ir SMTP).',
        ],
        steps: [
          'Atidarykite „Naudotojai“ (meniu matomas tik administratoriams) ir spauskite „Naujas naudotojas“.',
          'Įveskite vardą, el. paštą ir rolę. Įveskite pradinį slaptažodį (bent 10 simbolių) arba leiskite jį sugeneruoti.',
          'Sugeneruotas slaptažodis parodomas tik vieną kartą: nukopijuokite jį ir saugiai perduokite kolegai.',
          'Kolega po prisijungimo pasikeičia slaptažodį rakto mygtuku šoninio meniu apačioje („Keisti slaptažodį“).',
          'Kai darbuotojas išeina, paspauskite „Išjungti“: jis nebegalės prisijungti, o jo atidarytos sesijos baigiamos iš karto.',
        ],
        rules: [
          'Tik administratorius gali: valdyti naudotojus, atsisiųsti visos duomenų bazės kopiją, eksportuoti ir importuoti įmonės paketą bei seną JSON importą, matyti įmonės pakeitimų istoriją, naudoti apskaitos kontrolę (laikotarpio uždarymą), kurti ir trinti įmones.',
          'Paskutinio aktyvaus administratoriaus negalima išjungti, paversti buhalteriu ar ištrinti.',
          'El. paštas yra unikalus nepriklausomai nuo didžiųjų ir mažųjų raidžių.',
          'Naudotojas, kuris jau dirbo apskaitoje arba keitė kitus naudotojus, neištrinamas, o išjungiamas, kad istorijoje liktų autorius.',
          'Pakeitus slaptažodį baigiamos kitos to naudotojo sesijos; administratoriaus nustatytas naujas slaptažodis baigia visas naudotojo sesijas ir panaikina prisijungimo bandymų blokavimą.',
          'Naudotojų pakeitimai (sukūrimas, rolė, išjungimas, slaptažodžio keitimas, prisijungimas) registruojami nekeičiamame žurnale; slaptažodžiai ir jų maišos ten nesaugomi.',
        ],
        mistakes: [
          'Vienas prisijungimas naudojamas keliems žmonėms – tada istorijoje nematyti, kas ką pakeitė. Kiekvienam kolegai sukurkite atskirą paskyrą.',
          'Išėjusio darbuotojo paskyra paliekama aktyvi.',
          'Visiems suteikiama administratoriaus rolė, nors pakaktų buhalterio.',
        ],
      },
      ru: {
        title: 'Пользователи и роли',
        summary: 'Учётные записи коллег, роли администратор и бухгалтер, отключение, пароли.',
        purpose: [
          'Программа рассчитана на нескольких человек. Первый администратор создаётся при первом запуске; остальные учётные записи создаёт администратор в разделе «Пользователи». Самостоятельной регистрации нет.',
          'Администратор может всё. Бухгалтер выполняет всю обычную учётную работу во всех компаниях (документы, контрагенты, банк, зарплата, главная книга, налоги, отчёты, реквизиты и SMTP существующих компаний).',
        ],
        steps: [
          'Откройте «Пользователи» (пункт меню виден только администраторам) и нажмите «Новый пользователь».',
          'Введите имя, email и роль. Задайте начальный пароль (не короче 10 символов) или сгенерируйте его.',
          'Сгенерированный пароль показывается только один раз: скопируйте его и безопасно передайте коллеге.',
          'После входа коллега меняет пароль кнопкой с ключом внизу бокового меню («Сменить пароль»).',
          'Когда сотрудник уходит, нажмите «Отключить»: он больше не сможет войти, а его открытые сессии завершаются сразу.',
        ],
        rules: [
          'Только администратор может: управлять пользователями, скачивать копию всей базы, экспортировать и импортировать пакет компании и старый JSON-импорт, смотреть историю изменений компании, пользоваться учётным контролем (закрытием периода), создавать и удалять компании.',
          'Последнего активного администратора нельзя отключить, сделать бухгалтером или удалить.',
          'Email уникален без учёта регистра букв.',
          'Пользователь, который уже работал в учёте или менял других пользователей, не удаляется, а отключается, чтобы в истории остался автор.',
          'Смена пароля завершает другие сессии этого пользователя; новый пароль, заданный администратором, завершает все сессии пользователя и снимает блокировку попыток входа.',
          'Изменения пользователей (создание, роль, отключение, смена пароля, вход) записываются в неизменяемый журнал; пароли и их хэши там не хранятся.',
        ],
        mistakes: [
          'Один вход используется несколькими людьми — тогда в истории не видно, кто что изменил. Создайте каждому коллеге отдельную учётную запись.',
          'Учётная запись ушедшего сотрудника остаётся активной.',
          'Всем выдаётся роль администратора, хотя достаточно роли бухгалтера.',
        ],
      },
      en: {
        title: 'Users and roles',
        summary: 'Colleague accounts, the administrator and accountant roles, disabling, passwords.',
        purpose: [
          'The application is meant for several people. The first administrator is created on first start; the administrator creates all other accounts under "Users". There is no self-registration.',
          'The administrator can do everything. An accountant does all normal accounting work in every company (documents, counterparties, bank, payroll, general ledger, taxes, reports, details and SMTP of existing companies).',
        ],
        steps: [
          'Open "Users" (the menu entry is visible to administrators only) and click "New user".',
          'Enter the name, e-mail and role. Set an initial password (at least 10 characters) or let one be generated.',
          'A generated password is shown only once: copy it and hand it to the colleague securely.',
          'After signing in, the colleague changes the password with the key button at the bottom of the sidebar ("Change password").',
          'When an employee leaves, click "Disable": they can no longer sign in and their open sessions end immediately.',
        ],
        rules: [
          'Only an administrator can: manage users, download a copy of the whole database, export and import a company package and use the legacy JSON import, read the company change history, use the accounting control (closing periods), create and delete companies.',
          'The last active administrator cannot be disabled, turned into an accountant or deleted.',
          'E-mail addresses are unique regardless of letter case.',
          'A user who already worked in the books or changed other users is disabled rather than deleted, so the history keeps its author.',
          'Changing a password ends the user\'s other sessions; a new password set by the administrator ends all of the user\'s sessions and clears the sign-in throttle.',
          'Changes to users (creation, role, disabling, password changes, sign-ins) are written to an append-only log; passwords and their hashes are never stored there.',
        ],
        mistakes: [
          'One sign-in shared by several people, so the history cannot show who changed what. Create a separate account for each colleague.',
          'The account of an employee who left stays active.',
          'Everyone gets the administrator role although the accountant role would be enough.',
        ],
      },
    },
  },
];
