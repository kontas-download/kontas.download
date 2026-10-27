[Lietuvių](SECURITY.md) | [Русский](SECURITY.ru.md) | [English](SECURITY.en.md)

# Authentication, security and deployment

## Sessions and accounts

- Sessions are random opaque 256-bit tokens valid for 14 days. Only SHA-256 digests of the tokens are stored in SQLite. Every protected API request and server page verifies that the session has not expired and that the user's account is not disabled.
- Passwords are stored as scrypt hashes (N=32768, r=8, p=3, random salt). Legacy hashes, if any, are upgraded to scrypt on successful sign-in.
- There is no default password. On the first start with an empty database `web/scripts/bootstrap.cjs` creates an administrator (`ADMIN_EMAIL`, by default `admin@kontas.local`) and, unless `ADMIN_PASSWORD` is set, prints a random password once in the container log (`docker logs kontas-app`). The password must have at least 10 characters.
- Roles: the **administrator** can do everything (users, a copy of the whole database, export and import of company packages, closing controls, creating and deleting companies); the **accountant** does the normal accounting work in every company but cannot manage users or perform administrator actions. Companies are shared by all users; per-company permissions are not implemented.
- A disabled user can no longer sign in and their sessions stop working immediately. The last active administrator cannot be disabled, demoted or deleted.
- Changing the password: a user changes their own password with the key button in the sidebar (the current password is required; their other sessions end). A new password set by an administrator ends all sessions of that user. A password can also be reset on the server: `docker exec -it kontas-app node scripts/set-password.cjs <email> [new password] [--enable]`.
- User actions (creation, role, disabling, password change, sign-in) are recorded in an immutable log that contains no passwords or hashes.

## Sign-in throttling

Sign-in attempts are limited per normalized e-mail in a SQLite table: after 10 failed attempts the account is blocked for 15 minutes. The same limit applies to a wrong current password when changing a password. For an Internet-facing deployment, configure an additional IP rate limit at the reverse proxy.

## Environment variables

- `APP_ORIGIN` - the public origin of the program behind a reverse proxy (used to check where requests come from).
- `COOKIE_SECURE` - production session cookies require HTTPS (`true`). For local HTTP testing only, explicitly set `false`.
- `DATABASE_URL` - `file:` followed by an absolute path, or a path relative to the `web` working directory.
- `SMTP_ENCRYPTION_KEY` - 64 hexadecimal characters; it encrypts SMTP passwords (AES-256-GCM). Keep it separately from database copies and out of Git.

Server deployment with HTTPS: [../deploy/README.en.md](../deploy/README.en.md).

## Verification

Run `npm test` and `npx tsc --noEmit`. The tests create a temporary database and never modify `prisma/dev.db`.

## Reporting vulnerabilities

Report security issues privately, not in a public bug report. Write to security@kontas.download. Include the version, the steps to reproduce and the impact; please do not disclose details until the issue is fixed.
