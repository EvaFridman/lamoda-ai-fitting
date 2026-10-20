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
[0009-entity-ui](specs/0009-entity-ui/), [0010-web-header](specs/0010-web-header/),
[0011-s3-storage](specs/0011-s3-storage/), [0012-backups](specs/0012-backups/),
[0013-auth](specs/0013-auth/), [0015-analytics-events](specs/0015-analytics-events/).

## Требования

- Node 26 и npm 12 (версия Node задана в `.nvmrc`; установка на другой версии остановится с ошибкой)
- Docker с Compose; должен быть запущен и для `npm run verify` (тесты базы поднимают одноразовые
  PostgreSQL, SeaweedFS и Temporal в контейнерах)
- gitleaks (`brew install gitleaks`): его запускает git-хук перед каждым коммитом

## Быстрый старт

1. `npm ci`: зависимости корня и git-хуки.
2. `./scripts/init-env.sh`, один раз: `.env` со случайными паролем базы, секретом прокси,
   секретом входа (`BETTER_AUTH_SECRET`) и ключами эмулятора S3.
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

Чтение каталога открыто всем. Свой профиль (`/me`), свои сессии примерки и генерации — только
после входа (cookie сессии); запись каталога и данные других пользователей закрыты для всех
(спека 0013). Входят через Google, а локально вместо него работает поддельный Google — сервис
`oidc` (http://localhost:4010): он спрашивает почту и имя и пускает с любыми, одна почта — один
аккаунт. Вход — иконка профиля в шапке сайта (http://localhost:3001): без сессии она открывает
окно «Вход» с кнопкой «Войти через Google», после входа сайт возвращает на ту же страницу. Со
входом иконка открывает меню профиля с именем и пунктами «Выйти» и «Выйти со всех устройств»;
после «Выйти со всех устройств» другие браузеры ещё до 5 минут видят себя вошедшими.

После входа cookie сессии есть у `localhost` (cookie не зависят от порта), поэтому Swagger на
http://localhost:3000/docs отправляет её сам.
В `.env`, созданном до спеки 0013, нет `BETTER_AUTH_SECRET`, и cookie подписываются общеизвестным
секретом Better Auth по умолчанию. Допишите свой и перезапустите стек; строку старого админ-токена
можно удалить, её больше никто не читает:

```bash
printf 'BETTER_AUTH_SECRET=%s\n' "$(openssl rand -hex 32)" >> .env
docker compose up -d --wait
```

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
`next dev` читает его при старте. Вошедшего пользователя Mixpanel знает только по его id (без
почты и имени). Все события и отслеживаемые элементы с их свойствами и оценкой объёма:
[web/src/shared/analytics/EVENTS.md](web/src/shared/analytics/EVENTS.md).

Исходники `api/src` и `web/{app,src}` примонтированы в контейнеры: правки подхватываются без
пересборки. Пересобрать образ (`docker compose up -d --build <сервис>`) нужно после изменения
зависимостей или конфигов. После изменения схемы Prisma клиент Prisma нужно собрать заново: он
лежит в образе и в анонимных томах контейнеров, а не в примонтированных исходниках:
`docker compose up -d --build --renew-anon-volumes --wait api temporal-worker s3-init`.

База после первого запуска и после изменения схемы: миграции, затем демо-каталог. Сид только
добавляет недостающее (товары ищет по артикулу), правки, сделанные в базе, остаются. Фото каталога
лежат в `api/seed-media/`: сид загружает в бакет эмулятора те, которых там нет, а сайт отдаёт их по
`/media/<ключ>` (`next dev` берёт их из эмулятора). Без фото в бакете (новый том `s3data`) картинки
каталога не грузятся, пока сид не запустят снова:

```bash
docker compose run --rm api npx prisma migrate dev
docker compose run --rm api npm run seed:dev
```

`docker compose down` останавливает и удаляет контейнеры, данные остаются в томах.

### Бэкап локально

Задание бэкапа (спека 0012) копирует базу и бакет эмулятора, зашифрованные ключом age, в бакет
`BACKUP_BUCKET` эмулятора (по умолчанию `ai-fitting-backups`, его создаёт `s3-init`). Локально оно
запускается только руками, в профиле `backup`. Нужна своя пара ключей age, не продовая:
`mkdir -p ~/.config/age && age-keygen -o ~/.config/age/ai-fitting-dev.txt` (`brew install age`;
файл с закрытым ключом не кладите в репозиторий), открытый ключ (`age1…`) из её вывода записать в
`.env` как `BACKUP_AGE_RECIPIENT`. Затем одна копия сейчас:

```bash
docker compose --profile backup run --rm --build backup node dist/backup/main.js --once
```

В бакете появляются `daily/<время UTC>-<16 случайных hex>/database.dump.age` и `storage.tar.age`
рядом.
Без `--once` задание работает как на сервере: спит до 04:00 по Москве и копирует каждую ночь.
Sentry в локальном профиле выключен, чтобы локальные запуски не отмечались в мониторе
`nightly-backup` продового проекта.

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
OIDC_HOST_PORT=4011
```

И только после этого запустить стек:

```bash
docker compose up -d --wait
docker compose run --rm api npx prisma migrate deploy
```

У копии свои тома, значит и своя пустая база. Останавливается копия командой
`docker compose down` из её папки.

Агент `qa-tester` ходит только на порты api, web, Temporal UI и поддельного Google этих двух копий
(3000, 3001, 8233, 4010 и 4000, 4001, 8234, 4011) и выбирает свои по `docker compose ps` в папке, из которой запущен. Другие
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
