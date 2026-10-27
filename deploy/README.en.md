[Lietuvių](README.md) | [Русский](README.ru.md) | [English](README.en.md)

# Server deployment

Minimum server: 1 vCPU, 1 GB RAM (2 GB is better), 20 GB of disk, Linux with Docker 24+ and Compose v2. The application runs as a single instance (the SQLite database is a file), so load balancers and serverless platforms without a persistent disk are not suitable.

Layout: the application container `kontas-app` is reachable only through the Caddy container `kontas-caddy`, which obtains and renews the HTTPS certificate by itself. Only ports 80 and 443 are open to the outside.

## Preparation

1. Point the domain's DNS record (for example `accounting.example.com`) to the server IP. Open ports 80 and 443.
2. Install Docker and copy the repository to the server (`git clone`; for customers use `git archive HEAD` so the history is not handed over).
3. If the server has little memory (1 GB), add 2 GB of swap while the image is built: `fallocate -l 2G /swapfile && chmod 600 /swapfile && mkswap /swapfile && swapon /swapfile`. It is not needed after the build.

## First run

```bash
cd deploy
cp .env.example .env
# fill in DOMAIN, SMTP_ENCRYPTION_KEY (the generation command is in the file), ADMIN_EMAIL
mkdir -p data && chown -R 1000:1000 data
docker compose -f docker-compose.server.yml --env-file .env up -d --build
docker logs kontas-app      # the administrator password is shown here once, if ADMIN_PASSWORD is empty
```

Variables in `.env`:

- `DOMAIN` - the public domain name (required).
- `SMTP_ENCRYPTION_KEY` - 64 hexadecimal characters (required); it encrypts the SMTP passwords stored in the database.
- `ADMIN_EMAIL`, `ADMIN_PASSWORD` - used only on the first start, when there is no database yet. If `ADMIN_EMAIL` is empty it becomes `admin@kontas.local`; if `ADMIN_PASSWORD` is empty a random one-time password is generated (there is no default password). The password must have at least 10 characters.

Open `https://your-domain`, sign in and change the password immediately.

On the first start the program creates an empty database with the standard Lithuanian chart of accounts and one administrator (the script `web/scripts/bootstrap.cjs`). The start-up script never changes an existing database, and migrations are applied by the application on first access to the data.

## Moving an existing database

Stop the application, put the database file at `deploy/data/dev.db` (there must be no old `dev.db-wal` and `dev.db-shm` next to it), run `chown 1000:1000`, then start. `SMTP_ENCRYPTION_KEY` must be the same as on the old server, otherwise the saved SMTP passwords cannot be decrypted. If there is no database, create a company under "Company management"; data from another system can be loaded by importing a company package.

## What to keep

- **Database:** `deploy/data/dev.db`. Back up the running database with SQLite backup, not by copying the file: `docker exec kontas-app node -e "const D=require('better-sqlite3');new D('/app/prisma/dev.db',{readonly:true}).backup('/tmp/b.db').then(()=>console.log('ok'))" && docker cp kontas-app:/tmp/b.db ./backup-$(date +%F).db`. The administrator can also download a copy from the program (`/api/admin/backup`).
- **Key `SMTP_ENCRYPTION_KEY`:** keep it separately from database backups; without it the saved SMTP passwords cannot be read and have to be entered again.
- Keep copies outside this server.

## Updating

```bash
git pull
docker compose -f docker-compose.server.yml --env-file .env up -d --build
```

Make a database copy before updating. Database migrations are applied automatically and only add new things.

## Resetting a password

```bash
docker exec -it kontas-app node scripts/set-password.cjs admin@example.com          # new random password
docker exec -it kontas-app node scripts/set-password.cjs admin@example.com 'my-long-password'
docker exec -it kontas-app node scripts/set-password.cjs admin@example.com --enable  # also re-enables a disabled account
```

The password must have at least 10 characters; all sessions of the user end and the sign-in throttling is cleared. If the account is disabled, the password changes without `--enable` but signing in still fails (the script warns about it); you can also enable the user on the "Users" page.

## Health check

`docker ps` shows the status `healthy` for `kontas-app` (the Dockerfile checks the `/login` page every 30 s). Logs: `docker logs -f kontas-app`.

## Outgoing e-mail

To send invoices and reminders the server needs access to an SMTP server (ports 465 or 587). Some hosting providers block them: if e-mails are not sent, use the SMTP service of your mail provider or ask for the port to be opened. SMTP settings are entered on each company's card.

## Security

Only ports 80 and 443 (Caddy) are open to the outside; the application is reachable only inside the Docker network. Enable automatic OS updates and a firewall. Do not publish the `.env` file or the `data` folder. More: [../web/SECURITY.en.md](../web/SECURITY.en.md).
