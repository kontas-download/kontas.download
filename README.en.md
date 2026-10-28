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
- **Taxes:** i.SAF 1.2 XML export, FR0600, FR0564, GPM313, GPM312 and PLN204 drafts and EDS `.ffdata` file export, year-versioned tax and rate rules, tax codes, tax calendar.
- **Accounting:** general ledger (journal), trial balance, income statement and balance sheet, chart of accounts, counterparty reconciliation statements, locked periods and change history.
- **Other:** counterparties, stock and inventory costing (FIFO or weighted average), fixed assets register and monthly depreciation, payroll runs (NPD, progressive GPM rates, Sodra ceilings).
- **Multi-company:** an unlimited number of companies in one installation, with the data of each kept separate.
- **Data:** company package export and import, a copy of the whole database (for the administrator).
- **Users:** several users, the "administrator" and "accountant" roles, disabling an account, limiting sign-in attempts.

Detailed instructions are in the program's own help (the "Help" menu).

## Limits

The program is not tax or legal advice; the user and their accountant are responsible for declarations, accounting policy and the correctness of the data.

- Nothing is **submitted to VMI or Sodra automatically**: there is no connection to EDS, i.MAS or Sodra. The program prepares files and drafts; you submit them yourself.
- There is no connection to Sodra.
- There are no debit notes (DS).
- Payroll results are provisional until verified by an accountant; Sodra SAM and 1-SD forms are not prepared.
- GPM313, GPM312, FR0564 and PLN204 are prepared as drafts and EDS `.ffdata` files with a list of unfilled fields (GPM313 fields 6 and 7 are split by payout date; GPM312 `.ffdata` supports the L9/U9 rate and the non-resident appendix GPM312U; FR0564 `.ffdata` supports appendices FR0564P/R/T/TP; PLN204 `.ffdata` supports appendices PLN204S and PLN204Z, while special variants PLN204A/N/U are not prepared). The tax calendar reminds you of deadlines.
- In the FR0600 panel and `.ffdata` file, fields 26–28 (import VAT and deduction %) can be entered manually; the margin scheme and some special i.SAF codes are filled manually in EDS. A reverse-charge notice is printed on the customer PDF when an invoice line is assigned code PVM15, PVM34 or PVM25–PVM27.
- Cost of goods sold write-off is disabled by default (`NONE`); inventory costing (FIFO or weighted average) and fixed asset depreciation must be checked by an accountant.
- Supplier PDF invoices are not read (no OCR); only XML (UBL / Peppol) is imported.
- There is no automatic or scheduled sending of invoices and reminders: every send is a manual action.

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
