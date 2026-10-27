[Lietuvių](VMI-EDS-AUTOMATION.md) | [Русский](VMI-EDS-AUTOMATION.ru.md) | [English](VMI-EDS-AUTOMATION.en.md)

# VMI / EDS: requirements and automation plan

Checked on 26 October 2026 against official public sources and the code of that time. This is a project study: the new returns and integrations described below are not implemented yet. No sign-in to the company's personal account was made, and the company's actual tax obligations were not confirmed from VMI registration data.

**What is fact and what is plan.** The sections "Stage ... done" and "Update" describe what already exists in the program. Everything else (requirements, the table of returns, the designed process, the P0-P2 order, connecting to EDS and i.MAS) is notes and plans, not features of the program. At present the program **submits nothing to VMI**: it prepares an i.SAF XML file and an FR0600 draft for manual submission. The files in `docs/vmi/` (official PDFs and XSD) are kept in the private repository and are not part of the public distribution.

## The company's tax profile

`isVatPayer` alone is not enough. At least the modes `NON_VAT`, `STANDARD_VAT`, `SVS_LT`, effective dates and a change history are needed. A PVM code by itself does not mean that 21% is charged.

SVS allows a registered payer not to charge PVM on the relevant sales in Lithuania; input PVM is not recoverable under this scheme and i.SAF is not submitted. An SVS invoice contains the PVM code but not the rate and the tax amount. For the relevant cross-border transactions PVM101 and sometimes FR0564 arise. Purchases of foreign services can create a registration obligation even with a small turnover. Source: [VMI - SVS in Lithuania](https://www.vmi.lt/evmi/svs-lietuvoje?inheritRedirect=true).

Design decision: tax profile + counterparty country + transaction type + basis of taxation + date determine the rules. Add monitoring of applicable thresholds and foreign transactions. Do not change the company's current status automatically on a guess.

## Returns and the data they need

| Area | What the program needs |
|---|---|
| PLN204 | Tax adjustments of accounting profit, allowed / non-allowed expenses, losses, reliefs with a check of conditions, rule version by period. For the relevant profit-making legal entities the form is submitted by the 15th day of the sixth month after the tax period; for a calendar year, 15 June. [VMI](https://www.vmi.lt/evmi/lt/metines-pelno-mokescio-deklaracijos-pln204-pln204a-pln204n-pln204u-) |
| Payments to people | Recipient, residency, basis, actual payment date, class A/B and income code. For members of an MB the codes 02, 26, 77 differ; a manager who is not a member has a separate classification. All payments cannot be processed as salary. [VMI](https://www.vmi.lt/evmi/ma%C5%BEosios-bendrijos-nario/vadovo-pajamos1?inheritRedirect=true) |
| GPM312 / GPM313 | Generate only when the obligations apply. General deadlines: GPM313 - by the 15th of the next month, GPM312 - by 15 February of the next year. The GPM payment deadline is separate from the return deadline. [VMI](https://www.vmi.lt/evmi/lt/kokie-yra-deklaracij%C5%B3-pateikimo-ir-pajam%C5%B3-mokes%C4%8Dio-sumok%C4%97jimo-terminai-) |
| FR0600 / i.SAF | Tax classification at line level, a separate right of deduction, country, document type, credit/debit adjustments; reconciliation of the register and the return. Sales PVM is reconciled by fields 29-31, not by field 25. [VMI](https://www.vmi.lt/evmi/aktualus-klausimai-del-pvm-deklaracijos-fr0600-vertinimo) |
| Sodra | A separate module for MB members and employees, rules with effective dates. For example, the VSD base for withdrawals for personal needs of an MB member in 2026 changes from 50% to 90% from 1 July. Do not carry last year's rates and bases into a new calculation. [Sodra](https://sodra.lt/imokos/esu-mazosios-bendrijos-narys?el_id=1173&lang=uk) |
| Annual reporting | Financial statements and explanatory note for Registrų centras - a task separate from PLN204. The format of the set depends on the category of the organization. [Registrų centras](https://info.registrucentras.lt/node/144439) |
| SAF-T | This is a separate accounting data format, not i.SAF. Check whether the obligation applies separately; do not declare it a monthly mandatory submission for every MB. Provide export of postings, reference data and source documents, and XSD validation. [VMI](https://www.vmi.lt/evmi/saf-t1?inheritRedirect=true) |

All deadlines in the calendar must take into account the applicable carry-over rules, the company's period and the specific obligation. The table is not confirmation that every form is mandatory for a particular company.

## What can really be automated through official interfaces

EDS has a web service: separate credentials of the legal entity's representative, transfer of documents and retrieval of statuses. According to the published instruction, a return sent this way must be confirmed in EDS within 3 days; an unconfirmed one is deleted. So "file transferred" must not be shown as "return submitted". [EDS - procedure](https://deklaravimas.vmi.lt/lt/Apie_formu_teikima/Apie_formu_teikima_1/Ziniatinklio_paslauga.aspx).

i.SAF has a separate web service with an i.MAS certificate, the official XSD 1.2 and the description of schema 1.2.1. Separate connection settings for each company, a check of authority, certificate expiry, queues and statuses are needed. [VMI - technical documentation](https://www.vmi.lt/evmi/i.saf2).

Designed process: source documents -> validation -> postings -> period closing -> report draft -> reconciliation / XSD -> user review -> transfer -> confirmation, if required -> receiving the result. Keep the exact file sent, its hash, the period, the schema version, the authority's response and the history of corrections. A repeated network request must not create a repeated submission.

Before implementing the connector, check separately the full current specification, access and the test environment. During this study no connection to the API and no trial submission were made.

## Problems found in the code (at the start of the work, 2026-10-26)

These are results of reading the project at the start of the work, not statements of VMI. Most items have since been fixed in the stages below (FR0600 draft and i.SAF with XSD, PVM deduction share, immutable PDF archive, period closing and change log); the current state is described by the sections "Stage ... done":

1. `web/src/app/tax-reports/TaxReportsClient.tsx`: sales PVM was added into `box25`; input PVM was accepted for deduction in full. At that time the screen could not be considered a correct FR0600.
2. `web/src/app/api/tax-reports/isaf/route.ts`: the code was chosen only between `PVM1` and `PVM100` by the tax amount; the country was hard-coded as `LT`; the rate was computed from totals. No XSD validation. The join of customers by code was not limited to the company and could duplicate documents or pull in someone else's counterparty.
3. `web/src/lib/accounting-schema.ts`: purchase postings always assigned PVM to `2444`, regardless of the company's right of deduction. Rules for non-recoverable PVM and the purpose of the purchase (expense, inventory, asset) are needed, not one universal posting. Recalculate historical data only after a separate change report and a backup.
4. `web/prisma/schema.prisma`: there were no full line-level tax categories, history of the company's mode, payments to MB members, linking of bank payments to documents, period closing and change log.
5. `web/src/lib/invoice-document.ts`: the PDF takes part of the details from the current reference data. An immutable snapshot of the issued document and archiving of the PDF actually sent are needed.

## Development order and readiness criteria

### P0 - correctness of accounting

- Separate the tax mode, the rate and the reason for not charging; store the effective date and the document snapshot. Tests: non-PVM, standard, SVS, mode change, counterparties of different statuses.
- Fix input PVM: recoverable / non-recoverable / partial, purpose of the purchase; test postings, balance and that old documents do not change without an explicit migration.
- Fix FR0600 and i.SAF; until verified, show a readiness limitation. XSD, official examples, different countries, several rates, adjustments and isolation of companies are mandatory checks.
- Introduce a change log, locking of a closed period, correcting documents and unique numbering.

### P1 - daily automation

- Bank statement import, protection against duplicates, matching payments to invoices, partial payments and overpayments. Compute the payment status from allocated payments.
- Incoming invoices from a file / mail: extraction of details, check of totals, duplicate detection; doubtful fields require review.
- Recurring invoices, line templates, e-mail queues, receivable reminders with a prior payment check.
- A single calendar of obligations: an explanation of why each form applies, reminders, a link to the source and the period of validity of the rule.
- An archive of source documents, PDFs and confirmations; regular backups plus restore verification. A copy of the database in Git does not replace a document archive.

VMI lists the mandatory details of an ordinary invoice, including units of measure when the quantity is expressed. So add a separate unit field and do not hide it only in the name of the service. [VMI - documenting](https://www.vmi.lt/evmi/reikalavimai-dokumentavimui).

### P2 - reporting and integrations

- Payments to MB members and GPM312/GPM313; then PLN204 with tax adjustments.
- EDS/i.MAS: transfer of prepared documents, tracking of confirmation and result, error notifications.
- Fixed assets and depreciation, inventory / cost of goods, annual closing and the set of financial statements; SAF-T after checking applicability.

To configure the rules it is still necessary to clarify the actual VMI regime, transactions with foreign suppliers/customers, the composition of MB members and employees, types of payments, the tax period and the right to reliefs. This information cannot be reliably derived from the company name and an empty PVM code alone.

## Stage one done - 2026-10-26

- Added NON_VAT / STANDARD_VAT / SVS_LT, the history of mode start dates, choosing the mode by the date of a new document and a snapshot of the sale's mode. The SVS PDF shows the PVM code without charging tax.
- Purchases got an explicit deduction share; for NON_VAT/SVS it is zero. In the base expense postings non-recoverable PVM is included in the expense and recoverable PVM goes to 2444. Purchase purpose as inventory or a fixed asset is not implemented yet.
- Old postings are not recalculated by the migration. Purchases with an unknown deduction share are marked as unverified and do not increase the confirmed deduction amount in the summary.
- Editing of purchases was fixed: the form keeps the original lines instead of replacing them with a single line at 21%.
- Wrong FR0600 field calculations were removed. A verification summary is shown instead; an unconfirmed i.SAF XML is no longer issued. A full FR0600 and a validated i.SAF remained in the work list.
- Period closing at the SQLite level and a change log of documents, lines and postings were added. Changing the period boundary records the user ID; for automatic database events the author is not yet determined. The interface states this limitation honestly.
- New duplicates of outgoing numbers are blocked within a company; incoming numbers are checked together with the supplier. The migration does not delete old duplicates.

This is not yet the completion of the whole automation program. Bank matching, the archive of issued PDFs, correcting documents, tax classifiers, MB forms and external connections remained for later stages. EDS/i.MAS are not connected; no real returns were submitted.

## Stage two done - i.SAF (2026-10-26)

Source: the official i.SAF 1.2 XSD (`docs/vmi/isaf_1.2.xsd`, marked on the VMI page as the valid edition of 2016-09-16) and the element descriptions embedded in it. The PDF "XML structure description 1.2.1" had not been loaded into the project: rules that are not in the XSD still had to be reconciled with it.

- `web/src/lib/isaf.ts` generates the sales and purchase register. The file is validated against the XSD in the tests (`web/tests/isaf.cjs`, xmllint-wasm).
- Export is available only to a company whose mode is STANDARD_VAT for the whole period. A mode change inside the period blocks the export.
- Data is taken only from the active company; the counterparty is linked by `clientId` and `companyId`, not by code.
- Only domestic sales with PVM 21/9/5% (PVM1/PVM2/PVM3) are classified automatically. These were the only classifier codes confirmed in the sources reviewed.
- Everything else blocks the export and goes to the list of remarks: lines without tax or with 0%, other rates, foreign PVM codes and counterparties, negative amounts, repeated numbers, an unsuitable company code.
- In purchases from a Lithuanian PVM payer `TaxCode` and `TaxPercentage` were left empty, as the description of the `TaxCode` element prescribes. This had to be confirmed against PDF 1.2.1.
- Not implemented: `SettlementsAndPayments`, correcting documents (KS/DS), 0% PVM classes, EU / export, reverse charge, FR0564, submission through the web service. The file is generated for review and manual upload; it is not sent to VMI.
- Problem No. 2 of the first list (hard-coded `LT`, guessing the rate, mixing of companies) was fixed; No. 1 (FR0600) remained open.
- Purchase purpose: a purchase got an optional ledger account (`debitAccount`, the purchases form). An empty value keeps 6118. Depreciation and inventory cost are not automated. The migration `2026-10-purchase-account-v1` only adds a column and recreates triggers; old postings do not change.
- Sales corrections: credit notes (KS) are created from the original invoice with negative amounts, a reason, a limit by the remaining amount and a PDF "KREDITINĖ ...". The migration `2026-10-sale-correction-v1` adds columns and protective triggers. Not implemented: debit notes (DS), purchase corrections and export of KS to i.SAF (the sign of amounts had to be reconciled with description 1.2.1).
- PDF archive: when an e-mail is sent successfully, the exact bytes of the attachment, SHA-256, the recipient and a snapshot of the details are stored in the immutable table `InvoiceArchive`. There is no UI link to the archive yet, only an API.
- The i.SAF 1.2.1 description (`docs/vmi/isaf_1.2.1_aprasymas.pdf`, 159 pages) was read. It confirms that the valid XSD is 1.2 (1.2.1 is the version of the document) and that `TaxCode` is not filled in purchases from a Lithuanian PVM payer. It contains no list of classifier codes (VA-49) and no rule for the sign of amounts of credit documents, so KS stayed blocked in the export. For KS the description has `References` (a reference to the corrected invoice). This PDF does not apply to FR0600: separate instructions for completing the return are needed.

## FR0600: information from the VMI page (obtained 2026-10-26)

Source: the VMI page "PVM deklaracija FR0600 (84-86 str., 88-89 str., 115-3 str.)", the questions and answers section, and the instruction `docs/vmi/FR0600_uzpildymas_KM1739.pdf` (it says that part of the provisions became outdated from 01.01.2026).

- Submission: only electronically through EDS. The completion rules were approved by order VA-29 of 2004-03-01.
- Deadlines: month - by the 25th of the next month; quarter - by the 25th day of the first month of the next quarter; half-year - similarly; another established period - no later than 25 days after its end; a person leaving the payers or being liquidated - within 20 days.
- Small business mode (SVS) or a non-PVM payer: does not submit the standard FR0600; a person who kept SVS after leaving the payers submits the last FR0600 marked "Mokestinio laikotarpio" in field 9.
- Correction: a new FR0600 marked "Patikslinta" in field 8, with the complete data set and the same period. The time limit is the current and 3 past calendar years; for bad debts and movable fixed assets - 5; for immovable property - 10.
- Purchases of services from a foreign payer under Article 95 (reverse charge): fields 23, 24 (base), 32 (calculated PVM), then the same tax is added to 25 and, if there is a right of deduction, to 35.
- Construction services within Lithuania under Article 96: the seller shows only the base in field 12 and does not declare the tax; the buyer - the tax in field 33, then 25 and 35.
- Services outside Lithuania (Article 13) go to field 20, not FR0564. Supply to the EU - field 18 and FR0564.
- The VMI table "Dažniausiai pasitaikančių sandorių deklaravimas FR0600 + i.SAF kodas" links typical transactions to FR0600 fields and i.SAF classifier codes. This is exactly the list of codes the project lacked. The file had to be downloaded manually.
- The VMI menu mentions a reduced 12% rate. The project knew only 21/9/5%, so lines with another rate are blocked.
- Through i.SAF, VMI offers a service of preliminary returns FR0600 and FR0564 ("Preliminarių PVM deklaracijų paslauga").

## Stage three done - classifier codes and the FR0600 draft (2026-10-26)

Source: the official VMI table "Dažniausiai pasitaikančių sandorių deklaravimas FR0600 + i.SAF kodas" of 2025-12-17 (`docs/vmi/FR0600_isaf_kodai.pdf`) and the instruction KM1739.

- Codes for domestic transactions: 21% - PVM1, 12% - PVM58 (only from 2026-01-01, field 29A), 9% - PVM2, 5% - PVM3. They apply in both the sales and the purchase register. The earlier assumption "empty TaxCode in purchases" was replaced by the codes from the table.
- `web/src/lib/fr0600.ts` and `GET /api/tax-reports/fr0600?start&end` compute fields 11, 25, 29, 29A, 30, 31, 35 and 36 (= 29 + 29A + 30 + 31 - 35). Credit documents go with a minus sign into fields 11 and 29-31, as KM1739 requires. For a monthly period the deadline is shown - the 25th of the next month (without moving to weekends and holidays).
- Everything else goes to the manual-processing list and is not summed: lines without tax or with another rate, foreign counterparties (fields 17-24, 32-34), import (26-27), proportional deduction (28), Article 95 and 96 transactions. Purchases with an unverified deduction do not go to field 35.
- The result is a working draft for reconciliation with the return in EDS. Submission and confirmation remain with the user.
- The table has codes for 0%, EU, export, reverse charge and margin schemes (PVM5, PVM12-PVM15, PVM19-PVM21, PVM25-PVM27, PVM32-PVM34 and others), but the PDF layout is jumbled when the text is extracted. They have to be entered manually with a check against the PDF itself, so they are not automated at present.

## Update: credit documents in i.SAF, bank statements

- The rule for the sign of amounts was confirmed by the VMI document "Sąskaitų faktūrų duomenų importo i.SAF..." (`docs/vmi/isaf_importo_aprasymas.pdf`, 2022): a negative taxable value is allowed only in a credit or debit invoice; if the corrected invoice is given, the type must be KS/DS/VK/VD; the corrected invoice must exist in the register; PVM must match the value and the rate. Sales KS are exported with negative amounts and a reference to the original invoice. Debit documents and purchase KS are not implemented.
- A bank statement is accepted in the ISO 20022 camt.053 standard with a check of balances and IBAN. Import of MT940 and CSV was added later (when this note was written MT940 was not yet supported).
