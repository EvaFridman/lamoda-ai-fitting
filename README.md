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
./scripts/init-env.sh           # один раз: .env со случайным паролем базы
docker compose up -d --wait     # весь стек, ждёт, пока сервисы станут здоровы
```

| Что         | Адрес                                                       |
| ----------- | ----------------------------------------------------------- |
| Сайт        | http://localhost:3001                                       |
| api         | http://localhost:3000 (Swagger: http://localhost:3000/docs) |
| Temporal UI | http://localhost:8233                                       |
| PostgreSQL  | `localhost:5433` (логин и пароль в `.env`)                  |
| Redis       | `localhost:6380`                                            |

Исходники `api/src` и `web/{app,src}` примонтированы в контейнеры: правки подхватываются без
пересборки. Пересобрать образ (`docker compose up -d --build <сервис>`) нужно после изменения
зависимостей или конфигов. После изменения схемы Prisma:
`docker compose run --rm api npx prisma generate`.

`docker compose down` останавливает и удаляет контейнеры, данные остаются в томах.

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
