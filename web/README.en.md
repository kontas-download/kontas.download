[Lietuvių](README.md) | [Русский](README.ru.md) | [English](README.en.md)

# kontas.download: developer guide

The application: Next.js 16 (App Router), React 19, TypeScript, Tailwind CSS 4, SQLite through `better-sqlite3`. General project description: [../README.en.md](../README.en.md).

## Running

```bash
npm install
cp .env.example .env         # DATABASE_URL, APP_ORIGIN, COOKIE_SECURE=false, PORT=3200, SMTP_ENCRYPTION_KEY
node scripts/bootstrap.cjs   # for an empty database: schema, chart of accounts, administrator
npm run dev
```

The application is available at http://localhost:3200. `bootstrap.cjs` is safe to run at any time: for an empty database it creates the base schema (`scripts/base-schema.sql`), the standard chart of accounts (`scripts/chart-of-accounts.json`) and, if there are no users yet, an administrator (`ADMIN_EMAIL`, by default `admin@kontas.local`; without `ADMIN_PASSWORD` a random one-time password is printed to the console). It does not change an existing database. In the Docker image it runs before the server (see `Dockerfile`).

## Scripts (`package.json`)

| Command | Purpose |
|---|---|
| `npm run dev` | development server (`next dev`) |
| `npm run build` | production build (`next build`); the folder can be changed with `NEXT_BUILD_DIR` |
| `npm start` | production server (`next start`) |
| `npm run lint` | ESLint |
| `npm test` | `node --test tests/*.cjs` |

Before `dev`, `build` and `test`, `scripts/ensure-local-extensions.cjs` runs automatically: it creates the Git-ignored `src/extensions/local.ts` from `local.empty.ts`. Type check: `npx tsc --noEmit`.

## Structure of `web/src`

- `app/` - pages and API routes (`app/api/...`): `accounts`, `bank`, `clients`, `companies`, `financial-statements`, `help`, `invoices`, `ledger`, `login`, `payrolls`, `purchases`, `receivables`, `reconciliation`, `recurring`, `stock`, `tax-calendar`, `tax-reports`, `trial-balance`, `users`.
- `components/` - shared interface components (sidebar, company switcher, language switcher, dialogs).
- `lib/` - business logic and data access: `db.ts` (connection and migrations), `auth.ts`, `access.ts` (roles), `sales.ts`, `purchases.ts`, `payments.ts`, `bank-*.ts`, `isaf.ts`, `fr0600.ts`, `invoice-pdf.ts` and others; `*-schema.ts` are migrations.
- `lib/i18n/` - languages (`config.ts`, `translate.ts`, `server.ts`, `client.tsx`) and the message namespaces in `messages/`.
- `lib/help/` - help pages and sources.
- `extensions/` - registry of optional add-ons (`registry.ts`); `local.ts` is not in Git.
- `proxy.ts` - an optimistic redirect to `/login`; the real check is always done by the server against the session.

Other folders: `prisma/` (the SQLite file at run time), `scripts/` (bootstrap, password reset), `tests/`, `public/`.

## Tests

`tests/*.cjs` run with `node --test`. They create a temporary SQLite database (schema `tests/schema.sql`) and never modify `prisma/dev.db`. TypeScript files are loaded through the `typescript` transpiler. `tests/production-smoke.mjs` is an HTTP check of a separate production build (`NEXT_BUILD_DIR=.next-audit npm run build`, then `node tests/production-smoke.mjs`). When you change behaviour, add a regression test.

## Language mechanism (i18n)

The interface has three languages: `lt`, `ru`, `en`. The language is taken from the cookie, then from `Accept-Language`, and is Lithuanian if nothing is found.

- Texts are grouped into namespaces: one file `src/lib/i18n/messages/<namespace>.ts` exports an object with the keys for every language (`Namespace`, see `types.ts`). Values may contain `{name}` placeholders.
- A new namespace must be registered in `messages/index.ts` (the import and adding it to `namespaces`). A key is used as `namespace.key`.
- `tests/i18n.cjs` checks that every namespace has the same keys and placeholders in lt, ru and en, and that no text is empty.

## Help system

Help pages live in `src/lib/help/pages-*.ts` (groups: start, operations, accounting, tax, system; the order is set in `pages.ts`). Each page (`HelpPage`) has a `slug`, a group, an optional `appHref`, source ids from `sources.ts` and the full text in three languages (title, summary, purpose, steps, rules, common mistakes, notes). `tests/help.cjs` checks unique slugs, source references (https, verification date), that all languages are filled equally, and that the help states that nothing is submitted to VMI automatically. When you change behaviour, update the help too.

## Database migrations

Principle: **additive migrations only**. Existing tables are not rebuilt and no data is lost; only `ALTER TABLE ... ADD COLUMN`, new tables, indexes and triggers are used.

- Each migration is a function `migrate...(db)` in a `src/lib/*-schema.ts` file. A version marker is written to the `AppMigration` table (for example `2026-10-users-v1`), so a migration runs once; conditions are checked inside a transaction.
- A new function must be called in `src/lib/db.ts` inside `getDb()` (migrations are applied on first access to the database).
- Migrations do not regroup or recalculate old records automatically.
- Before data migrations and bulk repairs make a database backup (see [../deploy/README.en.md](../deploy/README.en.md)).

## Documents

- [SECURITY.en.md](SECURITY.en.md) - sign-in, security, reporting vulnerabilities.
- [DOCUMENTS.en.md](DOCUMENTS.en.md) - customer invoices, PDF and e-mail.
- [ACCOUNTING.md](ACCOUNTING.md) - postings and rounding.
