[Lietuvių](README.md) | [Русский](README.ru.md) | [English](README.en.md)

# kontas.download

Website and download: https://kontas.download

A free accounting program for Lithuanian companies that runs on your own server. All data stays with you: it is stored in a single SQLite database on your computer or server, and the program does not send it to any external service. The interface works fully in three languages: Lithuanian, Russian and English.

The program is packaged to run in a Docker container (Next.js 16, React 19, TypeScript, SQLite).

## Features

- **Sales:** sales invoices (SF), credit notes (KS), recurring invoices.
- **Purchases:** purchase documents, VAT (PVM) deduction, supplier credit notes, supplier e-invoice (UBL XML) import.
- **PVM modes:** PVM payer, non-payer and SVS; the seller and the customer can be PVM payers independently of each other. The tax status of historical invoices is preserved.
- **PDF and e-mail:** invoice PDF in the customer's language (Lithuanian, Russian or English); e-mail delivery through the seller company's own SMTP; archive of sent PDFs. The customer PDF contains no internal payment statuses or notes.
- **Bank:** bank statement import (CSV, camt.053, MT940), matching payments to documents, settlements outside the bank.
- **Receivables:** an overview of outstanding amounts and reminders.
- **Taxes:** i.SAF 1.2 XML export, FR0600 draft, tax codes, tax calendar.
- **Accounting:** general ledger (journal), trial balance, income statement and balance sheet, chart of accounts, counterparty reconciliation statements, locked periods and change history.
- **Other:** counterparties, stock and inventory, payroll calculator.
- **Multi-company:** an unlimited number of companies in one installation, with the data of each kept separate.
- **Data:** company package export and import, a copy of the whole database (for the administrator).
- **Users:** several users, the "administrator" and "accountant" roles, disabling an account, limiting sign-in attempts.

Detailed instructions are in the program's own help (the "Help" menu).

## Limits

The program is not tax or legal advice; the user and their accountant are responsible for declarations, accounting policy and the correctness of the data.

- Nothing is **submitted to VMI automatically**: there is no connection to EDS or i.MAS. The program only prepares the i.SAF XML file and an FR0600 draft; you must submit them yourself.
- There is no connection to Sodra.
- There are no debit notes (DS).
- The payroll module is simple: the suggested calculation is simplified (no NPD, progressive GPM rates or Sodra ceilings), and you enter the final amounts.
- PLN204, GPM312/GPM313 and FR0564 returns are not prepared; the tax calendar only reminds you of deadlines.
- Invoices carry no automatic reverse-charge wording for services supplied to an EU VAT payer. The program cannot yet print it on the customer PDF (internal notes do not reach the PDF), so the accountant handles that wording and FR0564.
- There is no automatic depreciation of fixed assets or write-off of inventory cost.
- There is no scheduled automatic sending of invoices: every send is a manual action.

More: the help page "Limitations: what the application does not do" and [docs/VMI-EDS-AUTOMATION.en.md](docs/VMI-EDS-AUTOMATION.en.md).

## Quick start (Docker)

You need Docker with Compose v2.

```bash
docker compose up -d --build
```

The program is available at **http://localhost:3200** (container `kontas-app`; the port is open on 127.0.0.1 only).

On the first start with an empty database the program creates the standard Lithuanian chart of accounts and an administrator. The default e-mail is `admin@kontas.local` and **there is no default password**: a random one-time password is printed once in the container log:

```bash
docker logs kontas-app
```

Sign in and change the password immediately (the key button at the bottom of the sidebar). A different administrator e-mail and password (at least 10 characters) can be set with the `ADMIN_EMAIL` and `ADMIN_PASSWORD` variables before the first start. If you forget the password:

```bash
docker exec -it kontas-app node scripts/set-password.cjs email@example.com
```

To store SMTP passwords (for sending invoices), set `SMTP_ENCRYPTION_KEY` (64 hexadecimal characters; the generation command is in `web/.env.example`) before starting, and keep this key separate from database copies.

The database is stored in the `web/prisma` folder (a Docker volume), so the data survives recreating the container. A server with HTTPS: see [deploy/README.en.md](deploy/README.en.md).

## Local development

You need Node.js 22 (the same version as in the Dockerfile).

```bash
cd web
npm install
cp .env.example .env        # DATABASE_URL, APP_ORIGIN
node scripts/bootstrap.cjs  # creates an empty database and an administrator (the password is printed to the console)
npm run dev
npm test
```

More about development: [web/README.en.md](web/README.en.md).

## Project structure

- `web/` - the application (Next.js, SQLite, Dockerfile, tests, helper scripts in `web/scripts`).
- `deploy/` - server deployment with HTTPS (Caddy): [deploy/README.en.md](deploy/README.en.md).
- `docs/` - documentation, for example [notes on VMI / EDS automation](docs/VMI-EDS-AUTOMATION.en.md).
- `site/` - the project website.
- `docker-compose.yml` - local run (container `kontas-app`, port 3200).
- `README.md`, `README.ru.md`, `README.en.md` - this description.

## Language policy

The main language of the project documentation is **Lithuanian**. The Russian and English versions (`*.ru.md`, `*.en.md`) are translations that live next to the original; if they differ, the Lithuanian version prevails. The program interface and help always exist in three languages (lt, ru, en).

## Documentation

- [Server deployment](deploy/README.en.md)
- [Security and sign-in](web/SECURITY.en.md)
- [Customer invoices and e-mail](web/DOCUMENTS.en.md)
- [Developer guide](web/README.en.md)
- [VMI / EDS automation](docs/VMI-EDS-AUTOMATION.en.md)

## License

The program is used under the [LICENSE](LICENSE) (kontas.download licence: **free to use, not to be redistributed**; translations: [EN](LICENSE.en.md), [RU](LICENSE.ru.md); the Lithuanian text prevails). Third-party components: [THIRD-PARTY-NOTICES.md](THIRD-PARTY-NOTICES.md). The licence text is a draft that a lawyer reviews before publication.

## Supporting the project

The program is free. If you would like to support its authors, information will be published on the project website once it is live. Support is optional and does not affect any features.

## Reporting vulnerabilities

Do not report security issues in a public bug report. See [web/SECURITY.en.md](web/SECURITY.en.md).
