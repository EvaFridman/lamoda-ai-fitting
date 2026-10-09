# lamoda-ai-fitting

Монорепозиторий: `api` (NestJS) и `web` (Next.js). Сайт: https://lamoda-ai-fitting.ru

Каждый merge в `main` проверяется и выкатывается на сервер автоматически, без простоя
(blue-green). Как устроены CI, CD и сервер, как откатиться: [deploy/README.md](deploy/README.md).

Работа идёт по спекам (`specs/`, порядок в [specs/principles.md](specs/principles.md)); первая —
[0001-bootstrap](specs/0001-bootstrap/) — завершена: решения, план и результаты приёмки.

## Требования

- Node 26 и npm 12 (версия Node задана в `.nvmrc`; установка на другой версии остановится с ошибкой)
- Docker с Compose; должен быть запущен и для `npm run verify` (тесты базы поднимают одноразовую
  PostgreSQL в контейнере)
- gitleaks (`brew install gitleaks`): его запускает git-хук перед каждым коммитом

## Быстрый старт

```bash
npm ci                          # зависимости корня и git-хуки
./scripts/init-env.sh           # один раз: .env со случайными паролем базы и админ-токеном
docker compose up -d --wait     # весь стек, ждёт, пока сервисы станут здоровы
docker compose run --rm api npx prisma migrate deploy   # миграции: dev-стек сам их не применяет
```

| Что         | Адрес                                                       |
| ----------- | ----------------------------------------------------------- |
| Сайт        | http://localhost:3001                                       |
| api         | http://localhost:3000 (Swagger: http://localhost:3000/docs) |
| Temporal UI | http://localhost:8233                                       |
| PostgreSQL  | `localhost:5433` (логин и пароль в `.env`)                  |
| Redis       | `localhost:6380`                                            |

Запросы, которые меняют данные, и все запросы к пользователям, сессиям примерки и генерациям
требуют админ-токен: значение `ADMIN_API_TOKEN` из `.env` в заголовке `X-Admin-Token` (в Swagger:
кнопка Authorize). Пустое значение закрывает эти запросы. В `.env`, созданном до появления
токена, его нет: допишите строку `ADMIN_API_TOKEN=` со значением из `openssl rand -hex 32` и
перезапустите стек (`docker compose up -d --wait`).

Исходники `api/src` и `web/{app,src}` примонтированы в контейнеры: правки подхватываются без
пересборки. Пересобрать образ (`docker compose up -d --build <сервис>`) нужно после изменения
зависимостей или конфигов. После изменения схемы Prisma клиент Prisma нужно собрать заново: он
лежит в образе и в анонимных томах контейнеров, а не в примонтированных исходниках:
`docker compose up -d --build --renew-anon-volumes --wait api temporal-worker`.

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
# в .env заполнить уже существующие пустые строки:
#   COMPOSE_PROJECT_NAME=ai-fitting-ui-kit
#   API_HOST_PORT=4000  WEB_HOST_PORT=4001  POSTGRES_HOST_PORT=5434
#   REDIS_HOST_PORT=6381  TEMPORAL_UI_HOST_PORT=8234
docker compose up -d --wait
docker compose run --rm api npx prisma migrate deploy
```

У копии свои тома, значит и своя пустая база. Останавливается копия командой
`docker compose down` из её папки.

Агент `qa-tester` ходит только на порты api, web и Temporal UI этих двух копий (3000, 3001, 8233 и
4000, 4001, 8234) и выбирает свои по `docker compose ps` в папке, из которой запущен. Другие
порты для второй копии он не пропустит.

## Команды

Из корня репозитория:

```bash
npm run verify         # всё, что проверяет CI: формат, линтеры, типы, тесты, сборки
npm run format         # отформатировать всё Prettier
```

`verify` и `npm test` требуют запущенного Docker: тесты в `api/test/database/` проверяют ограничения
базы на одноразовой PostgreSQL (Testcontainers), а не на базе разработки. Без Docker тесты падают
с сообщением его запустить. Контейнер удаляется в конце прогона; если прогон оборвать (Ctrl+C,
падение процесса), он остаётся — найти его можно по метке `org.testcontainers=true` и удалить в
Docker Desktop.

Остальные команды: `api/package.json`, `web/README.md`.

## Как вносить изменения

Ветка от свежего `main` → коммиты в формате `type(scope): subject` (проверяет git-хук) → pull
request → зелёный CI → «Rebase and merge». Merge выкатывает изменения на прод. Правила для людей и
агентов: [CONTRIBUTING.md](CONTRIBUTING.md), [CLAUDE.md](CLAUDE.md).
