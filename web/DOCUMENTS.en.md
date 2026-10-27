[Lietuvių](DOCUMENTS.md) | [Русский](DOCUMENTS.ru.md) | [English](DOCUMENTS.en.md)

# Customer invoices and email

The print action generates a standalone A4 PDF through `/api/invoices/:id/pdf`. Its preview, download and native PDF print action use the same document. Internal status and notes are excluded. Long tables continue across pages with repeated column headings and page numbers. The PDF language (Lithuanian, Russian or English) can be chosen per customer.

Set the seller's PVM status in Company management. New non-PVM invoices use zero VAT and equal net/gross amounts. Each invoice stores the seller's tax status so later company edits do not silently change historical documents. Customer PVM status is separate.

Use **E-mail / SMTP settings** on each company card. Configure the sender address, SMTP host, port, TLS/STARTTLS and credentials supplied by that company's mail provider. No global fallback sender is used: only the seller company's settings apply. SMTP passwords are encrypted using AES-256-GCM and are never returned to the browser. A blank password on edit preserves the saved password.

Generate `SMTP_ENCRYPTION_KEY` once (64 hexadecimal characters) and retain it securely; the generation command is in `.env.example`. Without the key SMTP settings cannot be saved. For Docker the key is passed at runtime (for example `docker compose --env-file web/.env up -d --build`, or through `deploy/.env` on a server) and is never copied into the image. Keep the key separately from database copies and out of Git.

Click a customer's email to select an invoice and review the recipient, text and PDF, then send. SMTP acceptance is reported as acceptance, not guaranteed inbox delivery. Duplicate retries share an idempotency identifier. If the result is uncertain, check the mailbox before creating a new send attempt. The PDF attachment of a successfully sent message (bytes, SHA-256, recipient) is stored in an immutable archive.

Validation: `npm test`, `npm run build`; isolated production smoke uses `NEXT_BUILD_DIR=.next-audit` and `node tests/production-smoke.mjs`. No regression test sends real email.
