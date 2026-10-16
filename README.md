# lamoda-ai-fitting

Монорепозиторий: `api` (NestJS) и `web` (Next.js). Сайт: https://lamoda-ai-fitting.ru

Каждый merge в `main` проверяется и выкатывается на сервер автоматически, без простоя
(blue-green). Как устроены CI, CD и сервер, как откатиться: [deploy/README.md](deploy/README.md).

Работа идёт по спекам (`specs/`, порядок в [specs/principles.md](specs/principles.md)).
Завершены (в папке каждой — решения, план и результаты приёмки):
[0001-bootstrap](specs/0001-bootstrap/), [0002-database-schema](specs/0002-database-schema/),
[0003-ui-kit](specs/0003-ui-kit/), [0004-crud-api](specs/0004-crud-api/),
[0005-faster-ci](specs/0005-faster-ci/), [0006-api-guards](specs/0006-api-guards/),
[0007-web-data-layer](specs/0007-web-data-layer/), [0008-web-analytics](specs/0008-web-analytics/),
[0009-entity-ui](specs/0009-entity-ui/), [0010-web-header](specs/0010-web-header/).

## Требования

- Node 26 и npm 12 (версия Node задана в `.nvmrc`; установка на другой версии остановится с ошибкой)
- Docker с Compose; должен быть запущен и для `npm run verify` (тесты базы поднимают одноразовую
  PostgreSQL в контейнере)
- gitleaks (`brew install gitleaks`): его запускает git-хук перед каждым коммитом

## Быстрый старт

1. `npm ci`: зависимости корня и git-хуки.
2. `./scripts/init-env.sh`, один раз: `.env` со случайными паролем базы, админ-токеном, секретом
   прокси и ключами эмулятора S3.
3. `docker compose up -d --wait`: весь стек; команда ждёт, пока сервисы станут здоровы. Эмулятор
   S3 (SeaweedFS, сервис `s3`) создаёт бакет при старте, одноразовый `s3-init` ставит его правила
   (`media/` читает кто угодно, `tmp/` очищается через сутки) и завершается; api, worker и web
   стартуют после него.
4. Миграции: dev-стек сам их не применяет.

```bash
npm ci
./scripts/init-env.sh
docker compose up -d --wait
docker compose run --rm api npx prisma migrate deploy
```

| Что           | Адрес                                                             |
| ------------- | ----------------------------------------------------------------- |
| Сайт          | http://localhost:3001                                             |
| api           | http://localhost:3000 (Swagger: http://localhost:3000/docs)       |
| Temporal UI   | http://localhost:8233                                             |
| PostgreSQL    | `localhost:5433` (логин и пароль в `.env`)                        |
| Redis         | `localhost:6380`                                                  |
| S3 (эмулятор) | http://localhost:8333 (ключи `S3_*` в `.env`, бакет `ai-fitting`) |

Запросы, которые меняют данные, и все запросы к пользователям, сессиям примерки и генерациям
требуют админ-токен: значение `ADMIN_API_TOKEN` из `.env` в заголовке `X-Admin-Token` (в Swagger:
кнопка Authorize). Пустое значение закрывает эти запросы. В `.env`, созданном до появления
токена, его нет: допишите строку `ADMIN_API_TOKEN=` со значением из `openssl rand -hex 32` и
перезапустите стек (`docker compose up -d --wait`).

`PROXY_SECRET` — общий секрет nginx, web и api: только запрос с ним в заголовке `X-Proxy-Secret`
может назвать api адрес клиента и id запроса. В `.env`, созданном до его появления, строки нет, и
`docker compose` откажется запускаться с подсказкой. Допишите её и перезапустите стек:

```bash
printf 'PROXY_SECRET=%s\n' "$(openssl rand -hex 32)" >> .env
docker compose up -d --wait
```

Ключи эмулятора S3 (`S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`) тоже обязательны: со старым `.env`
`docker compose` не запустится ни с одной командой и подскажет, чего не хватает. Допишите их и
пересоберите образ api (в нём появилась зависимость `@aws-sdk/client-s3`):

```bash
printf 'S3_ACCESS_KEY_ID=%s\nS3_SECRET_ACCESS_KEY=%s\n' "$(openssl rand -hex 10)" "$(openssl rand -hex 20)" >> .env
docker compose up -d --build --wait
```

Аналитика (Mixpanel, после согласия посетителя) работает только с `NEXT_PUBLIC_MIXPANEL_TOKEN`:
его получают лишь образы, опубликованные из `main`. Локально он пуст, и сайт ничего не отправляет.
Для проверки можно задать в `.env` любой токен и пересоздать web (`docker compose up -d web`):
`next dev` читает его при старте.

Исходники `api/src` и `web/{app,src}` примонтированы в контейнеры: правки подхватываются без
пересборки. Пересобрать образ (`docker compose up -d --build <сервис>`) нужно после изменения
зависимостей или конфигов. После изменения схемы Prisma клиент Prisma нужно собрать заново: он
лежит в образе и в анонимных томах контейнеров, а не в примонтированных исходниках:
`docker compose up -d --build --renew-anon-volumes --wait api temporal-worker s3-init`.

База после первого запуска и после изменения схемы: миграции, затем демо-каталог. Сид только
добавляет недостающее (товары ищет по артикулу), правки, сделанные в базе, остаются:

```bash
docker compose run --rm api npx prisma migrate dev
docker compose run --rm api npm run seed:dev
```

`docker compose down` останавливает и удаляет контейнеры, данные остаются в томах.

### Вторая копия стека (git worktree)

Контейнеры, тома и образы api/web называются по имени проекта Compose (`ai-fitting` по умолчанию).
Чтобы вторая копия (например, в `git worktree`) работала рядом с первой и не трогала её данные и
образы, задайте в `.env` этой копии своё имя проекта и свободные порты:

```bash
git worktree add ../lamoda-ai-fitting-ui-kit -b feat/ui-kit
cd ../lamoda-ai-fitting-ui-kit
npm ci
./scripts/init-env.sh
```

Затем в `.env` копии заполнить уже существующие пустые строки:

```
COMPOSE_PROJECT_NAME=ai-fitting-ui-kit
API_HOST_PORT=4000
WEB_HOST_PORT=4001
POSTGRES_HOST_PORT=5434
REDIS_HOST_PORT=6381
TEMPORAL_UI_HOST_PORT=8234
S3_HOST_PORT=8334
```

И только после этого запустить стек:

```bash
docker compose up -d --wait
docker compose run --rm api npx prisma migrate deploy
```

У копии свои тома, значит и своя пустая база. Останавливается копия командой
`docker compose down` из её папки.

Агент `qa-tester` ходит только на порты api, web и Temporal UI этих двух копий (3000, 3001, 8233 и
4000, 4001, 8234) и выбирает свои по `docker compose ps` в папке, из которой запущен. Другие
порты для второй копии он не пропустит.

## Команды

Из корня репозитория: `npm run verify` запускает всё, что проверяет CI (формат, линтеры, типы,
тесты, сборки); `npm run format` форматирует всё Prettier.

```bash
npm run verify
npm run format
```

`verify` и `npm test` требуют запущенного Docker: тесты в `api/test/database/` идут в одноразовые
PostgreSQL, SeaweedFS и Temporal (Testcontainers), а не в сервисы разработки. Без Docker тесты
падают с сообщением его запустить. Контейнеры удаляются в конце прогона; если прогон оборвать
(Ctrl+C, падение процесса), они остаются — найти их можно по метке `org.testcontainers=true` и
удалить в Docker Desktop.

Остальные команды: `api/package.json`, `web/README.md`.

## Как вносить изменения

Ветка от свежего `main` → коммиты в формате `type(scope): subject` (проверяет git-хук) → pull
request → зелёный CI → «Rebase and merge». Merge выкатывает изменения на прод. Правила для людей и
агентов: [CONTRIBUTING.md](CONTRIBUTING.md), [CLAUDE.md](CLAUDE.md).
