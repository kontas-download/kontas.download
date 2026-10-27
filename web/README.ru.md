[Lietuvių](README.md) | [Русский](README.ru.md) | [English](README.en.md)

# kontas.download: описание для разработчика

Приложение: Next.js 16 (App Router), React 19, TypeScript, Tailwind CSS 4, SQLite через `better-sqlite3`. Общее описание проекта: [../README.ru.md](../README.ru.md).

## Запуск

```bash
npm install
cp .env.example .env         # DATABASE_URL, APP_ORIGIN, COOKIE_SECURE=false, PORT=3200, SMTP_ENCRYPTION_KEY
node scripts/bootstrap.cjs   # для пустой базы: схема, план счетов, администратор
npm run dev
```

Приложение доступно по адресу http://localhost:3200. `bootstrap.cjs` безопасно запускать в любое время: для пустой базы он создаёт базовую схему (`scripts/base-schema.sql`), стандартный план счетов (`scripts/chart-of-accounts.json`) и, если пользователей ещё нет, администратора (`ADMIN_EMAIL`, по умолчанию `admin@kontas.local`; без `ADMIN_PASSWORD` случайный одноразовый пароль выводится в консоль). Существующую базу он не изменяет. В образе Docker он запускается перед сервером (см. `Dockerfile`).

## Скрипты (`package.json`)

| Команда | Назначение |
|---|---|
| `npm run dev` | сервер разработки (`next dev`) |
| `npm run build` | production-сборка (`next build`); каталог можно изменить переменной `NEXT_BUILD_DIR` |
| `npm start` | production-сервер (`next start`) |
| `npm run lint` | ESLint |
| `npm test` | `node --test tests/*.cjs` |

Перед `dev`, `build` и `test` автоматически запускается `scripts/ensure-local-extensions.cjs`: он создаёт не отслеживаемый Git файл `src/extensions/local.ts` из `local.empty.ts`. Проверка типов: `npx tsc --noEmit`.

## Структура `web/src`

- `app/` — страницы и API-маршруты (`app/api/...`): `accounts`, `bank`, `clients`, `companies`, `financial-statements`, `help`, `invoices`, `ledger`, `login`, `payrolls`, `purchases`, `receivables`, `reconciliation`, `recurring`, `stock`, `tax-calendar`, `tax-reports`, `trial-balance`, `users`.
- `components/` — общие компоненты интерфейса (боковое меню, переключатель компании, переключатель языка, диалоги).
- `lib/` — бизнес-логика и доступ к данным: `db.ts` (подключение и миграции), `auth.ts`, `access.ts` (роли), `sales.ts`, `purchases.ts`, `payments.ts`, `bank-*.ts`, `isaf.ts`, `fr0600.ts`, `invoice-pdf.ts` и др.; `*-schema.ts` — миграции.
- `lib/i18n/` — языки (`config.ts`, `translate.ts`, `server.ts`, `client.tsx`) и пространства сообщений `messages/`.
- `lib/help/` — страницы справки и источники.
- `extensions/` — реестр необязательных дополнений (`registry.ts`); `local.ts` не в Git.
- `proxy.ts` — оптимистичное перенаправление на `/login`; настоящую проверку всегда выполняет сервер по сессии.

Прочие каталоги: `prisma/` (файл SQLite во время работы), `scripts/` (bootstrap, смена пароля), `tests/`, `public/`.

## Тесты

`tests/*.cjs` запускаются через `node --test`. Они создают временную базу SQLite (схема `tests/schema.sql`) и никогда не изменяют `prisma/dev.db`. Файлы TypeScript загружаются через транспайлер `typescript`. `tests/production-smoke.mjs` — HTTP-проверка отдельной production-сборки (`NEXT_BUILD_DIR=.next-audit npm run build`, затем `node tests/production-smoke.mjs`). При изменении поведения добавляйте регрессионный тест.

## Механизм языков (i18n)

В интерфейсе три языка: `lt`, `ru`, `en`. Язык выбирается по cookie, затем по `Accept-Language`, а если ничего не найдено — литовский.

- Тексты сгруппированы в пространства (namespace): один файл `src/lib/i18n/messages/<пространство>.ts` экспортирует объект с ключами для каждого языка (`Namespace`, см. `types.ts`). В значениях можно использовать подстановки `{имя}`.
- Новое пространство нужно зарегистрировать в `messages/index.ts` (импорт и добавление в `namespaces`). Ключ используется как `пространство.ключ`.
- `tests/i18n.cjs` проверяет, что в каждом пространстве одинаковые ключи и подстановки на lt, ru и en и нет пустых текстов.

## Справка

Страницы справки лежат в `src/lib/help/pages-*.ts` (группы: начало, операции, учёт, налоги, система; порядок задаёт `pages.ts`). Каждая страница (`HelpPage`) содержит `slug`, группу, необязательный `appHref`, идентификаторы источников из `sources.ts` и полный текст на трёх языках (заголовок, краткое описание, назначение, шаги, правила, частые ошибки, примечания). `tests/help.cjs` проверяет уникальность `slug`, ссылки на источники (https, дата проверки), одинаковую заполненность всех языков и то, что справка сообщает: в VMI ничего не подаётся автоматически. При изменении поведения обновляйте и справку.

## Миграции базы данных

Принцип: **только аддитивные миграции**. Существующие таблицы не пересоздаются и данные не теряются; применяются только `ALTER TABLE ... ADD COLUMN`, новые таблицы, индексы и триггеры.

- Каждая миграция — функция `migrate...(db)` в файле `src/lib/*-schema.ts`. Метка версии записывается в таблицу `AppMigration` (например, `2026-10-users-v1`), поэтому миграция выполняется один раз; условия проверяются внутри транзакции.
- Новую функцию нужно вызвать в `src/lib/db.ts` внутри `getDb()` (миграции применяются при первом обращении к базе).
- Миграции не группируют и не пересчитывают старые записи автоматически.
- Перед миграциями данных и массовыми исправлениями сделайте резервную копию базы (см. [../deploy/README.ru.md](../deploy/README.ru.md)).

## Документы

- [SECURITY.ru.md](SECURITY.ru.md) — вход, безопасность, сообщения об уязвимостях.
- [DOCUMENTS.ru.md](DOCUMENTS.ru.md) — счета клиентам, PDF и e-mail.
- [ACCOUNTING.md](ACCOUNTING.md) — проводки и округление.
