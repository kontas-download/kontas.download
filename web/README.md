[Lietuvių](README.md) | [Русский](README.ru.md) | [English](README.en.md)

# kontas.download: programuotojo aprašas

Programa: Next.js 16 (App Router), React 19, TypeScript, Tailwind CSS 4, SQLite per `better-sqlite3`. Bendras projekto aprašas: [../README.md](../README.md).

## Paleidimas

```bash
npm install
cp .env.example .env         # DATABASE_URL, APP_ORIGIN, COOKIE_SECURE=false, SMTP_ENCRYPTION_KEY
node scripts/bootstrap.cjs   # tuščiai duomenų bazei: schema, sąskaitų planas, administratorius
npm run dev
```

Programa pasiekiama adresu http://localhost:3200. `bootstrap.cjs` saugu paleisti bet kada: tuščiai bazei sukuria bazinę schemą (`scripts/base-schema.sql`), standartinį sąskaitų planą (`scripts/chart-of-accounts.json`) ir, jei naudotojų dar nėra, administratorių (`ADMIN_EMAIL`, pagal nutylėjimą `admin@kontas.local`; be `ADMIN_PASSWORD` atsitiktinis vienkartinis slaptažodis išvedamas į konsolę). Esamos bazės jis nekeičia. Docker atvaizde jis paleidžiamas prieš serverį (žr. `Dockerfile`).

## Scenarijai (`package.json`)

| Komanda | Paskirtis |
|---|---|
| `npm run dev` | kūrimo serveris (`next dev -p 3200`) |
| `npm run build` | gamybinis surinkimas (`next build`); aplanką galima pakeisti kintamuoju `NEXT_BUILD_DIR` |
| `npm start` | gamybinis serveris (`next start -p 3200`) |
| `npm run lint` | ESLint |
| `npm test` | `node --test tests/*.cjs` |

Prieš `dev`, `build` ir `test` automatiškai paleidžiamas `scripts/ensure-local-extensions.cjs`: jis sukuria Git nesekamą `src/extensions/local.ts` iš `local.empty.ts`. Tipų patikra: `npx tsc --noEmit`.

## `web/src` struktūra

- `app/` – puslapiai ir API maršrutai (`app/api/...`): `accounts`, `bank`, `clients`, `companies`, `financial-statements`, `help`, `invoices`, `ledger`, `login`, `payrolls`, `purchases`, `receivables`, `reconciliation`, `recurring`, `stock`, `tax-calendar`, `tax-reports`, `trial-balance`, `users`.
- `components/` – bendri sąsajos komponentai (šoninis meniu, įmonės perjungiklis, kalbos perjungiklis, dialogai).
- `lib/` – verslo logika ir duomenų prieiga: `db.ts` (prisijungimas ir migracijos), `auth.ts`, `access.ts` (rolės), `sales.ts`, `purchases.ts`, `payments.ts`, `bank-*.ts`, `isaf.ts`, `fr0600.ts`, `invoice-pdf.ts` ir kt.; `*-schema.ts` – migracijos.
- `lib/i18n/` – kalbos (`config.ts`, `translate.ts`, `server.ts`, `client.tsx`) ir žinučių sritys `messages/`.
- `lib/help/` – žinyno puslapiai ir šaltiniai.
- `extensions/` – neprivalomų papildinių registras (`registry.ts`); `local.ts` nėra Git.
- `proxy.ts` – optimistinis nukreipimas į `/login`; tikrą patikrą visada atlieka serveris pagal sesiją.

Kiti katalogai: `prisma/` (SQLite failas vykdymo metu), `scripts/` (bootstrap, slaptažodžio keitimas), `tests/`, `public/`.

## Bandymai

`tests/*.cjs` vykdomi per `node --test`. Jie kuria laikiną SQLite duomenų bazę (schema `tests/schema.sql`) ir niekada nekeičia `prisma/dev.db`. TypeScript failai kraunami per `typescript` transpiliatorių. `tests/production-smoke.mjs` – HTTP patikra su atskira gamybine versija (`NEXT_BUILD_DIR=.next-audit npm run build`, tada `node tests/production-smoke.mjs`). Pakeitus elgseną, pridėkite regresinį bandymą.

## Kalbų mechanizmas (i18n)

Sąsaja turi tris kalbas: `lt`, `ru`, `en`. Kalba parenkama iš slapuko, tada iš `Accept-Language`, o jei nieko nerasta – lietuvių.

- Tekstai sugrupuoti į sritis (namespace): vienas failas `src/lib/i18n/messages/<sritis>.ts` eksportuoja objektą su raktais kiekvienai kalbai (`Namespace`, žr. `types.ts`). Reikšmėse galima naudoti vietos žymeklius `{vardas}`.
- Naują sritį reikia užregistruoti faile `messages/index.ts` (importas ir įtraukimas į `namespaces`). Raktas naudojamas kaip `sritis.raktas`.
- `tests/i18n.cjs` tikrina, kad kiekviena sritis turi tuos pačius raktus ir žymeklius lt, ru ir en kalbomis ir kad nėra tuščių tekstų.

## Žinynas

Žinyno puslapiai yra `src/lib/help/pages-*.ts` (grupės: pradžia, operacijos, apskaita, mokesčiai, sistema; tvarką nustato `pages.ts`). Kiekvienas puslapis (`HelpPage`) turi `slug`, grupę, neprivalomą `appHref`, šaltinių id iš `sources.ts` ir pilną tekstą trimis kalbomis (pavadinimas, santrauka, paskirtis, žingsniai, taisyklės, dažnos klaidos, pastabos). `tests/help.cjs` tikrina unikalius `slug`, šaltinių nuorodas (https, patikrinimo data), kad visos kalbos užpildytos vienodai ir kad žinynas nurodo, jog nieko automatiškai nepateikiama VMI. Pakeitus elgseną, atnaujinkite ir žinyną.

## Duomenų bazės migracijos

Principas: **tik papildomos migracijos**. Esamos lentelės neperkuriamos ir duomenys neprarandami; taikomos tik `ALTER TABLE ... ADD COLUMN`, naujos lentelės, indeksai ir trigeriai.

- Kiekviena migracija yra funkcija `migrate...(db)` faile `src/lib/*-schema.ts`. Versijos žyma įrašoma į lentelę `AppMigration` (pvz., `2026-10-users-v1`), todėl migracija vykdoma vieną kartą; sąlygos tikrinamos transakcijoje.
- Naują funkciją reikia iškviesti faile `src/lib/db.ts` funkcijoje `getDb()` (migracijos taikomos pirmą kartą kreipusis į bazę).
- Senų įrašų migracijos automatiškai nepergrupuoja ir neperskaičiuoja.
- Prieš duomenų migracijas ar masinius taisymus pasidarykite duomenų bazės atsarginę kopiją (žr. [../deploy/README.md](../deploy/README.md)).

## Dokumentai

- [SECURITY.md](SECURITY.md) – prisijungimas, saugumas, pranešimas apie pažeidžiamumus.
- [DOCUMENTS.md](DOCUMENTS.md) – kliento sąskaitos, PDF ir el. paštas.
- [ACCOUNTING.md](ACCOUNTING.md) – įrašai ir apvalinimas.
