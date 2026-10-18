# Деплой

Продакшен: VPS с Ubuntu 24.04, сайт https://lamoda-ai-fitting.ru. Деплой автоматический: каждый
merge в `main` → CI собирает и проверяет образы, публикует их в GHCR и разворачивает на сервере
скриптом `deploy/scripts/deploy.sh` (blue-green, без простоя для api и web; инфраструктура — см. «Как идёт деплой»). Как устроены
файлы:

| Что                     | Где                                                               |
| ----------------------- | ----------------------------------------------------------------- |
| инфраструктура          | `compose/infra.yml` — PostgreSQL, Redis, Temporal, nginx, certbot |
| копия приложения (цвет) | `compose/app.yml` — api + web, blue или green                     |
| воркер Temporal         | `compose/worker.yml`                                              |
| nginx                   | `nginx/` — шаблон конфига, временный сертификат, автоперезагрузка |
| деплой                  | `scripts/deploy.sh`                                               |
| подготовка сервера      | `ansible/base.yml`                                                |
| образы в CI             | `.github/workflows/images.yml`, вызывается из `ci.yml`            |
| CD                      | `.github/workflows/cd.yml`, вызывается из `ci.yml`                |

## Как идёт деплой

Push в `main` (merge PR) → workflow **CI**: Secret scan и Checks стартуют одновременно, Images —
сразу после успешного Secret scan (секунды; так секрет не попадёт в GHCR и в Sentry). В pull
request все три стартуют одновременно.
Images (`images.yml`) собирает образы, проверяет blue-green деплой на раннере и публикует образы в
GHCR; публикует только job `images-main`, который запускается лишь на push в `main` и один имеет
`packages: write`. Pull request вызывает тот же `images.yml` из `images-pr` с `contents: read` и
ничего не публикует. Когда все три прошли → **CD** (`cd.yml`, окружение `production`):

1. SSH на сервер под `deploy` (ключ сервера сверяется с `DEPLOY_KNOWN_HOSTS`);
2. каталог `deploy/` синхронизируется в `/opt/ai-fitting/deploy` на месте (`rsync --delete`):
   папки не подменяются, иначе работающий nginx продолжал бы видеть старую, удалённую копию;
3. `/opt/ai-fitting/.env` пишется заново из секретов и переменных GitHub — **правки на сервере
   затираются**, менять значения нужно в GitHub;
4. сервер входит в GHCR временным токеном прогона и выходит после деплоя;
5. `deploy.sh <тег>`: базы и Temporal (ничего не делает, если `infra.yml` не менялся) → срок
   хранения истории Temporal → миграции → сид демо-каталога → проверка фото из бакета → nginx
   (пересоздаётся, если менялся его сервис в `infra.yml`, и получает новый конфиг) → проверка фото
   через nginx → новая копия рядом со старой → проверка → переключение nginx. Срок хранения истории namespace `default`
   каждый деплой ставит 24 часа (спека 0013 N45): id удалённого пользователя остаётся в истории
   `deleteFiles` не дольше суток, и ни новый образ Temporal, ни новый том этого не меняют. Сид
   добавляет только недостающие строки и не меняет существующие, а в бакет загружает только
   недостающие фото, поэтому при следующем деплое ничего не делает. Проверка фото берёт случайную
   картинку каталога прямо из бакета (из одноразового контейнера нового образа api на сервере, без
   кэша nginx), затем ту же картинку через nginx, и ждёт 200 («Хранилище S3»). Упавшая миграция,
   сид или проверка из бакета останавливают деплой до nginx: nginx, его конфиг и `/media/`
   остаются прежними, а сайт продолжает обслуживать старая копия (спека 0011 M38). Откат на копию,
   которая ещё работает, применяет nginx сразу, без миграций, сида и проверок фото;
6. проверка снаружи: сайт отвечает новой версией;
7. удаляются образы api и web, из которых не создан ни один контейнер: остаются рабочая копия,
   запасная (для отката) и воркер. Каждый деплой добавляет ~1,7 ГБ, и 2026-10-16 они заполнили
   диск сервера (следующий деплой не смог скачать образ). На сервере то же делается и перед
   скачиванием образов (шаг 5), поэтому заполненный диск не останавливает следующий деплой. Откат на
   более старую версию скачивает её образы из GHCR заново. Лог пишет, сколько образов удалено;
   ошибка очистки пишет предупреждение и деплой не роняет.

Весь путь коммита виден в одном прогоне на вкладке Actions. Деплои идут строго по одному.

Образы попадают в GHCR, не дожидаясь Checks. Если Checks упал, образ этого коммита уже
опубликован, но CD его не развернёт: в GHCR бывают теги, которые никогда не работали на сайте.

Инфраструктура (`compose/infra.yml`) не участвует в blue-green: деплой, в котором изменилось
описание её сервиса, пересоздаёт этот сервис на месте: PostgreSQL, Redis и Temporal в начале
`deploy.sh`, до миграций, nginx после сида и проверки фото из бакета. Для
PostgreSQL, Redis, Temporal и nginx это простой: секунды при смене настроек, дольше при смене
образа; активная копия и воркер Temporal теряют соединения. Такие изменения решает владелец и
мержит в тихое время.

## Лимиты nginx

Грубая страховка до Node, выше квот самого api (спека 0006 F7, F8, F32–F37; значения в
`nginx/templates/default.conf.template`):

| Что                                                             | Лимит на адрес клиента                                   | Ответ сверх него                                     |
| --------------------------------------------------------------- | -------------------------------------------------------- | ---------------------------------------------------- |
| запросы к `/api/`                                               | 20 в секунду, всплеск до 40 сверх темпа                  | 429 `TOO_MANY_REQUESTS`                              |
| запросы к `/socket.io/`                                         | 10 в секунду, всплеск до 20 сверх темпа                  | 429 `TOO_MANY_REQUESTS`                              |
| запросы к `/api/health/live`                                    | 50 в секунду, всплеск до 100 сверх темпа                 | 429 `TOO_MANY_REQUESTS`                              |
| соединения `/socket.io/` (сокеты и long-polling)                | 10 одновременно                                          | 429 `TOO_MANY_REQUESTS`                              |
| запросы в работе на всём сайте (и сокеты)                       | 50 одновременно                                          | 429 `TOO_MANY_REQUESTS`                              |
| медленный клиент: заголовки, пауза в теле или при чтении ответа | 10 с; простой keep-alive 15 с (редиректы без keep-alive) | соединение закрывается без ответа (408 в логе nginx) |
| тело запроса                                                    | 1 МБ (весь сайт, не на адрес)                            | 413 `PAYLOAD_TOO_LARGE`                              |
| ответ api                                                       | 60 с; api сам отвечает 503 не позже ~31 с                | 503 `SERVICE_UNAVAILABLE`                            |

Ответы nginx — в формате ошибок api (`{ error: { code, message, details } }`), 502 и 504 на
`/api/` тоже становятся 503. Страницы web (`/`) и фото (`/media/`) под лимит запросов в секунду пока
не попадают, только под лимит запросов в работе (F37); `/api/socket.io` закрыт (404), иначе socket.io за `/api/`
обходил бы лимит соединений. Соединение, которое ещё не дослало заголовки, не видит ни один лимит
nginx: его ограничивает только таймаут в 10 с.
Посетители за одним NAT делят лимит. nginx не ограничивает размер WebSocket-кадров: это делает api
(`SOCKET_MAX_MESSAGE_BYTES`). `worker_connections` остаётся 1024 на воркер из образа (сокет
занимает два соединения); когда их не хватает, в логе nginx «worker_connections are not enough».
Поднять — свой `nginx.conf` и больший `nofile`. Проверяет `scripts/ci-deploy-check.sh`.

## Откат

Предыдущая версия остаётся запущенной (запасной цвет), откат на неё занимает секунды:

1. Actions → **CD** → **Run workflow** → `image_tag` = 7 символов хеша нужного коммита из `main`;
2. либо из терминала: `gh workflow run cd.yml -f image_tag=<хеш>`.

Откатывать можно только на хеш, который уже был на сайте: прогон CI этого коммита дошёл до
зелёного CD. Опубликованный образ коммита, у которого упал Checks, на сайт никогда не попадал.
CD, запущенный вручную, сам проверяет это (шаг «Check that the tag was live»: у коммита должен
быть успешный check run `CD / Deploy to production`) и отказывает до любого действия на сервере.
Если CD коммита упал сам по себе (например, сбой сети), его перезапускают в прогоне CI
(**Re-run failed jobs**), а не вручную.

Откат на ещё запущенную копию применяет nginx (пересоздаёт, если менялся его сервис) и
переключает его: миграций, сида и проверки фото в нём нет. Если `.env` или `compose/app.yml`
изменились с её запуска (сменили `PROXY_SECRET`, добавили или убрали переменную), копия сначала
пересоздаётся (секунд 20, трафик пока идёт на текущую копию); если она не поднимется, её
останавливают, и сайт остаётся на текущей. Откат на более старую версию — тот же запуск, только
это полный деплой (~1 мин). Откат не возвращает миграции базы назад: поэтому миграции всегда
совместимы с предыдущим релизом (`specs/principles.md`). В образе, собранном до появления сида,
шага нет: деплой пишет «seed skipped» и идёт дальше.

## На сервере

Какой цвет и тег сейчас обслуживают сайт, какие проекты compose запущены (`ai-fitting-infra`,
`-blue`, `-green`, `-worker`), последние 50 строк лога api копии blue (для green —
`ai-fitting-green-api-1`):

```bash
ssh ai-fitting 'cat /opt/ai-fitting/.deploy-state'
ssh ai-fitting 'docker compose ls'
ssh ai-fitting 'docker logs --tail 50 ai-fitting-blue-api-1'
```

## Подготовка Mac (один раз)

`deploy.sh` нужен bash 4+:

```bash
brew install ansible bash
```

В `~/.ssh/config` — алиас сервера (адрес и ключ только здесь, не в репозитории):

```
Host ai-fitting
  HostName <IP сервера>
  User root
  IdentityFile ~/.ssh/<ключ владельца>
  IdentitiesOnly yes
```

Проверка: `ssh ai-fitting hostname`.

## Подготовка сервера (один раз, повторный запуск безопасен)

1. **Ключ для CI.** Отдельный ключ, которым GitHub Actions заходит на сервер как пользователь
   `deploy`. Создаётся на Mac, в репозиторий не попадает:

   ```bash
   ssh-keygen -t ed25519 -N "" -C "ai-fitting CI deploy" -f ~/.ssh/ai-fitting-ci
   ```

   Открытая часть (`.pub`) уходит на сервер через плейбук, закрытая — только в секрет GitHub
   `DEPLOY_SSH_KEY` (раздел «Настройки GitHub»).

2. **Плейбук.** Имя сервера `ai-fitting`, Docker и Compose, ротация логов Docker, firewall (входящие
   только 22, 80, 443/tcp), swap 2 ГБ, пользователь `deploy` (группа `docker`, без пароля и без sudo,
   вход только по ключу CI), каталог `/opt/ai-fitting`. Запуск с `--check --diff` показывает, что
   изменится, ничего не меняя; затем запуск без флагов:

   ```bash
   cd deploy/ansible
   ansible-playbook base.yml --check --diff
   ansible-playbook base.yml
   ```

   Ожидаемо: `failed=0`; при повторном запуске `changed=0`.

3. **Проверка входа CI:**

   ```bash
   ssh -i ~/.ssh/ai-fitting-ci -o IdentitiesOnly=yes deploy@<IP сервера> 'hostname; docker ps'
   ```

Пользователь `deploy` в группе `docker` фактически может управлять контейнерами сервера. Выигрыш
отдельного пользователя — отдельный ключ: его можно отозвать (`exclusive` в плейбуке заменяет
ключи), не трогая доступ владельца, и в логах сервера видно, что делал CI.

## Хранилище S3

Один закрытый бакет приложения в Timeweb Cloud (спека 0011). Первый сегмент ключа — его класс:
`media/` — фото каталога, без срока; `keep/users/<id>/…` — фото пользователей и результаты
генераций, без срока; `tmp/` — незаконченные загрузки, удаляются через сутки. Ничего не публично:
`media/` читает без ключа только адрес сервера, остальное — только api со своим ключом или по
подписанной ссылке (15 минут). Бэкапы базы будут в отдельном бакете (спека 0012, ещё не начата).

nginx отдаёт `/media/<ключ>` из `media/<ключ>` бакета на том же домене (`MEDIA_BASE_URL`
остаётся `https://lamoda-ai-fitting.ru/media/`). В хранилище уходят только ключ и `Host`: ни
заголовков посетителя (секрет прокси, адрес, cookies), ни query string. Заголовки хранилища из
списка в `nginx/templates/default.conf.template` скрыты (список, не маска: новые метаданные объекта
добавляются туда), `Cache-Control` объекта (сутки) остаётся. Кэш nginx: фото — сутки, отказ —
минуту; если хранилище недоступно (нет соединения, таймаут, ответ 5xx), отдаётся устаревшая копия,
когда она есть в кэше (фото, которое спрашивали за последние 7 дней). Нет ключа, `/media/` сам по себе или ключ на
`/` — 404 `NOT_FOUND`; метод кроме `GET`/`HEAD` — 404 `ROUTE_NOT_FOUND`; хранилище упало или
недоступно, а копии в кэше нет — 503 `SERVICE_UNAVAILABLE`. `S3_ENDPOINT` и `S3_BUCKET` есть и у nginx в `infra.yml`:
их смена пересоздаёт nginx (несколько секунд простоя).

Настройка, один раз (сделана 2026-10-16):

1. В панели Timeweb: бакет — приватный, класс Standard, 10 ГБ; дополнительный пользователь с
   правом «Чтение и запись» на этот бакет: его ключ — секреты `S3_ACCESS_KEY_ID`,
   `S3_SECRET_ACCESS_KEY` («Environment `production`» ниже), не ключ главного пользователя.
2. Политика бакета: чтение `media/*` без ключа только с адреса сервера. В панели её задать
   нельзя: она ставится через `aws-cli` в одноразовом контейнере на сервере, с ключом главного
   пользователя, который никуда не сохраняется. На сервере (`ssh ai-fitting`) файл
   `policy.json`:

   ```json
   {
     "Version": "2012-10-17",
     "Statement": [
       {
         "Effect": "Allow",
         "Principal": "*",
         "Action": "s3:GetObject",
         "Resource": "arn:aws:s3:::<бакет>/media/*",
         "Condition": { "IpAddress": { "aws:SourceIp": "<IP сервера>/32" } }
       }
     ]
   }
   ```

   Затем ключ главного пользователя. Эти строки вставлять по одной: `read` без них заберёт
   следующую строку блока, а ключ, набранный в приглашение shell, попадёт в историю. Ввод не
   отображается; история этой сессии не пишется в файл:

   ```bash
   unset HISTFILE
   read -rsp 'Access key ID: ' AWS_ACCESS_KEY_ID; echo
   read -rsp 'Secret key: ' AWS_SECRET_ACCESS_KEY; echo
   export AWS_ACCESS_KEY_ID AWS_SECRET_ACCESS_KEY
   ```

   Политика (образ закреплён по дайджесту: он получает главный ключ) и уборка:

   ```bash
   docker run --rm -e AWS_ACCESS_KEY_ID -e AWS_SECRET_ACCESS_KEY \
     --mount type=bind,src="$PWD/policy.json",dst=/policy.json,readonly \
     amazon/aws-cli:2.17.0@sha256:643507c10ada7964ca6157b3d799f030b90577643da9955d319a77399ed80d73 \
     s3api put-bucket-policy --endpoint-url https://s3.twcstorage.ru --region ru-1 \
     --bucket <бакет> --policy file:///policy.json
   unset AWS_ACCESS_KEY_ID AWS_SECRET_ACCESS_KEY
   rm policy.json
   ```

   Если ключ мог попасть в историю или на экран, перевыпустить его в панели.

   Проверка: тестовые объекты `media/check.txt` и `keep/check.txt` в панели, затем
   `curl -I https://s3.twcstorage.ru/<бакет>/media/check.txt` с сервера (`ssh ai-fitting`) — 200,
   с Mac — отказ; `…/keep/check.txt` с сервера — отказ. Если с сервера тоже отказ, Timeweb видит
   его запросы с другого адреса (внутренняя сеть): к выбору доступа к `media/` возвращаемся
   (спека 0011 M15). Тестовые объекты потом удалить.

3. Правило жизненного цикла: префикс `tmp/`, удалять объекты через 1 день и прерывать незаконченные
   загрузки через 1 день.
4. Секреты и переменные `production` — в «Environment `production`» ниже.

Проверить запись с Mac нельзя: production-ключей на нём нет (`CONTRIBUTING.md`, п. 4). Запись
проверяет первый деплой: сид загружает фото каталога, затем `deploy.sh` проверяет одно из них.

**Убрать фото каталога.** Ключ в `media/` никогда не перезаписывается: новое фото получает новый
ключ. Поэтому nginx отдаёт копию из кэша и тогда, когда хранилище отвечает 5xx (спека 0011 M36),
до 7 дней после последнего запроса. Если фото нужно убрать (например, по жалобе), после удаления
объекта в панели очистить кэш nginx (подтверждает владелец, команда меняет сервер):

```bash
ssh ai-fitting 'docker exec ai-fitting-infra-nginx-1 sh -c "rm -rf /var/cache/nginx/media/*"'
```

**Новый адрес сервера.** Политика пускает в `media/` только старый адрес: сначала добавить новый
адрес в политику (шаг 2, `"aws:SourceIp"` принимает список) (а старый убрать после переезда), потом переезжать. Иначе `/media/` отвечает 404,
а деплой останавливается на проверке фото из бакета («the server cannot read the media from the
bucket»), не меняя nginx. Отказ nginx держит в кэше минуту: после исправления политики `/media/`
оживает не сразу.

## Настройки GitHub и Sentry

Значения секретов не проходят ни через чат, ни через терминал на экране: команды ниже читают их из
файлов или генерируют на лету и сразу передают в GitHub (`gh secret set`). Проверка — только по
именам: `gh secret list`, `gh variable list`.

### Sentry (веб-интерфейс)

1. **Проекты:** Projects → Create Project → платформа **Next.js**, имя `lamoda-ai-fitting` (web);
   второй — платформа **Nest.js**, имя `lamoda-ai-fitting-api` (api и Temporal worker). Из
   настроек каждого проекта (Client Keys) понадобится его **DSN**.
2. **Токен для загрузки source maps:** Settings → Developer Settings → **Organization Tokens** →
   Create New Token (`lamoda-ai-fitting CI`). Отдельный токен для этого репозитория, чтобы его можно
   было отозвать, не задевая другие проекты. Показывается один раз — сразу в GitHub (шаг ниже).
3. **Slug организации** — в адресе `https://<slug>.sentry.io` или в Settings → General.

### Вход через Google (Google Cloud Console)

Вход на сайт — только через Google (спека 0013). Без клиента Google api в production не стартует,
а CD останавливается до сервера.

1. **Проект:** console.cloud.google.com → новый проект `lamoda-ai-fitting`.
2. **Экран согласия:** APIs & Services → OAuth consent screen (Google Auth Platform → Branding,
   Audience) → тип **External**, название сайта и почта поддержки; доступы только `openid`,
   `email`, `profile` (проверка Google для них не нужна). Пока приложение в статусе Testing,
   войти могут только добавленные тестовые пользователи; для всех — **Publish app**.
3. **Клиент:** Credentials (Clients) → Create OAuth client ID → тип **Web application**, имя
   `lamoda-ai-fitting`, Authorized redirect URIs: только
   `https://lamoda-ai-fitting.ru/api/auth/callback/google`. Адресов localhost у этого клиента нет
   (спека 0013 N49): локально входят через поддельный Google, сервис `oidc`. Чтобы проверить
   настоящий Google локально, в том же проекте заводят отдельный клиент `lamoda-ai-fitting-dev`
   с одним redirect `http://localhost:3001/api/auth/callback/google`; его значения — только в
   локальном `.env`, production-значения на машину разработки не попадают.

   Client ID — переменная `GOOGLE_CLIENT_ID`, Client secret — секрет `GOOGLE_CLIENT_SECRET`
   (ниже). Секрет показывается при создании; новый выпускается там же, а старый удаляется
   после деплоя с новым.

### Environment `production` (GitHub)

Окружение, в котором работают джоб деплоя и, при push в `main`, джоб сборки образов (ему нужен
токен Sentry). Деплоить из него можно только из ветки `main`: workflow из pull request не получит
эти секреты.

**Переменные** (не секретные):

| Имя                | Значение                              |
| ------------------ | ------------------------------------- |
| `DEPLOY_HOST`      | IP сервера                            |
| `DEPLOY_USER`      | `deploy`                              |
| `SITE_DOMAIN`      | `lamoda-ai-fitting.ru`                |
| `POSTGRES_USER`    | `ai_fitting`                          |
| `POSTGRES_DB`      | `ai_fitting`                          |
| `MEDIA_BASE_URL`   | `https://lamoda-ai-fitting.ru/media/` |
| `S3_ENDPOINT`      | `https://s3.twcstorage.ru`            |
| `S3_BUCKET`        | имя бакета приложения в Timeweb       |
| `GOOGLE_CLIENT_ID` | Client ID из Google Cloud Console     |

`SITE_DOMAIN` — только имя хоста, в нижнем регистре и, для кириллического домена, в punycode
(`xn--…`), без порта, пути и `/` в конце. api собирает из него `WEB_ORIGIN` и не стартует, если
адрес не совпадает со своим origin (спека 0013 N43, N48).

**Секреты** — из корня репозитория, по одному блоку.

Закрытый ключ CI (открытая часть уже на сервере, `ansible/base.yml`):

```bash
gh secret set DEPLOY_SSH_KEY --env production < ~/.ssh/ai-fitting-ci
```

Ключ сервера для known_hosts CI. Сначала сверить отпечаток сервера с тем, что знает ваш Mac:

```bash
ssh-keyscan -t ed25519 <IP сервера> 2>/dev/null | ssh-keygen -lf -
ssh-keygen -F <IP сервера> -l | grep ED25519
```

Только если отпечатки совпали:

```bash
ssh-keyscan -t ed25519 <IP сервера> 2>/dev/null | gh secret set DEPLOY_KNOWN_HOSTS --env production
```

Пароль базы: случайный, его не видит никто — CI сам запишет его в `.env` на сервере:

```bash
openssl rand -hex 32 | gh secret set POSTGRES_PASSWORD --env production
```

DSN проектов Sentry, web и api (gh спросит значение, ввод не отображается):

```bash
gh secret set SENTRY_DSN --env production
gh secret set API_SENTRY_DSN --env production
```

Токен Sentry для загрузки source maps (шаг 2):

```bash
gh secret set SENTRY_AUTH_TOKEN --env production
```

Удалить секрет уровня репозитория `SENTRY_AUTH_TOKEN` (workflow из pull request видит секреты
репозитория), только если он там остался (так было до спеки 0004), и только после того, как лог CI
первой сборки из `main` покажет загрузку:

```bash
gh secret delete SENTRY_AUTH_TOKEN
```

Секрет, которым api подписывает cookie сессий (спека 0013): случайный, только буквы и цифры, от 32
символов, не равен `PROXY_SECRET` и `PROXY_SECRET_NEXT`; иначе или без него CD останавливается.
Смена секрета выводит из аккаунта всех пользователей.

```bash
openssl rand -hex 32 | gh secret set BETTER_AUTH_SECRET --env production
```

Client secret клиента Google («Вход через Google»; gh спросит значение, ввод не отображается). Без
пробелов и символов ``$`"'\;&|<>()#~``, как ключи S3 ниже; у Google их нет:

```bash
gh secret set GOOGLE_CLIENT_SECRET --env production
```

Общий секрет nginx, web и api (заголовок `X-Proxy-Secret`): только с ним api верит адресу клиента и
request id из заголовков. Случайный, не равен `BETTER_AUTH_SECRET`; без него CD останавливается.
Только буквы и цифры, от 32 символов: секрет попадает в конфиг nginx и в `.env`, который читает
shell; иначе CD остановится. Первый деплой с ним (спека 0006) пересоздаёт nginx: у контейнера новая
переменная, несколько секунд сайт не отвечает. Копия до 0006 пишет заголовки запросов в лог
целиком, с секретом. Секрет сменить (см. ниже) после первого деплоя с 0006 и после отката на версию
старше 0006, но только когда сайт снова на версии с 0006: пока старая копия работает, она запишет и
новый. Эта команда — только для первой установки; смена — в два шага ниже.

```bash
openssl rand -hex 32 | gh secret set PROXY_SECRET --env production
```

Ключ хранилища S3 для api и воркера Temporal (спека 0011, «Хранилище S3»): ключ дополнительного
пользователя Timeweb с правом «Чтение и запись» на бакет приложения, не главного. Без него и без переменных `S3_ENDPOINT`,
`S3_BUCKET` CD останавливается, а api и воркер не стартуют; `S3_ENDPOINT` — только `https://` и
имя хоста. В ключах не должно быть пробелов и символов ``$`"'\;&|<>()#~``: они попадают в `.env`,
который читает shell; иначе CD остановится.
gh спросит значение, ввод не отображается:

```bash
gh secret set S3_ACCESS_KEY_ID --env production
gh secret set S3_SECRET_ACCESS_KEY --env production
```

#### Смена `PROXY_SECRET`

В два деплоя (спека 0006 F21). api верит и второму секрету, `PROXY_SECRET_NEXT` (тот же формат, не
равен `BETTER_AUTH_SECRET`; nginx и web его не отправляют, CD передаёт его только api). Когда nginx
пересоздаётся с новым секретом, работающая копия уже его принимает, даже если дальше деплой упадёт.

GitHub не показывает значение секрета, поэтому новое значение генерируется один раз в переменную
shell и оба шага делаются в одном терминале; значение не печатается.

Шаг 1: новое значение становится вторым секретом, затем деплой (CD вручную с хешем текущей версии,
как в разделе «Откат», или следующий мерж в `main`). nginx не пересоздаётся, новая копия api принимает
оба секрета.

```bash
secret="$(openssl rand -hex 32)"
printf '%s' "$secret" | gh secret set PROXY_SECRET_NEXT --env production
```

Шаг 2, после успешного деплоя шага 1: то же значение становится основным, второй секрет удаляется,
и снова деплой. nginx пересоздаётся (несколько секунд сайт не отвечает). Если этот деплой упадёт,
работающая копия принимает новый секрет nginx как второй; исправить причину и задеплоить снова.

```bash
printf '%s' "$secret" | gh secret set PROXY_SECRET --env production
gh secret delete PROXY_SECRET_NEXT --env production
unset secret
```

В `PROXY_SECRET` ставится только значение, которое уже прошло успешный деплой как
`PROXY_SECRET_NEXT`: иначе деплой остановится до пересоздания nginx («does not accept the new
PROXY_SECRET»), ничего не меняя. Пока сайт на версии старше 0006, такая копия не верит никакому
секрету, и смена ждёт возврата на 0006. Если значение потеряно (терминал закрыт), шаг 1 повторяется с новым
(`gh secret set` перезапишет старое) и снова ждёт успешного деплоя. Если секрет меняют из-за утечки,
шаг 2 делается сразу после шага 1, а упавший шаг 2 доводится до успешного деплоя без задержки: до
этого работающая копия верит и старому секрету.

### Уровень репозитория (GitHub)

Переменные джоба сборки образов: он работает и для pull request, без окружения.
`NEXT_PUBLIC_SENTRY_DSN` (DSN проекта web) и `NEXT_PUBLIC_MIXPANEL_TOKEN` (токен проекта Mixpanel)
публичные: они уходят в браузер. Пустое значение выключает Sentry в браузере или аналитику. Токен
Mixpanel попадает только в образы, опубликованные из `main`: образы pull request собираются без
него.

```bash
gh variable set SENTRY_ORG --body "<slug организации>"
gh variable set SENTRY_PROJECT --body "lamoda-ai-fitting"
gh variable set SENTRY_PROJECT_API --body "lamoda-ai-fitting-api"
gh variable set NEXT_PUBLIC_SENTRY_DSN --body "<DSN>"
gh variable set NEXT_PUBLIC_MIXPANEL_TOKEN --body "<токен проекта>"
```

### Проверка

```bash
gh secret list --env production
gh variable list --env production
gh secret list
gh variable list
```

Что должна показать каждая команда, по порядку:

1. `DEPLOY_SSH_KEY`, `DEPLOY_KNOWN_HOSTS`, `POSTGRES_PASSWORD`, `SENTRY_DSN`, `API_SENTRY_DSN`,
   `SENTRY_AUTH_TOKEN`, `PROXY_SECRET` (и `PROXY_SECRET_NEXT`, только во время смены),
   `BETTER_AUTH_SECRET`, `GOOGLE_CLIENT_SECRET`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`.
2. `DEPLOY_HOST`, `DEPLOY_USER`, `SITE_DOMAIN`, `POSTGRES_USER`, `POSTGRES_DB`, `MEDIA_BASE_URL`,
   `S3_ENDPOINT`, `S3_BUCKET`, `GOOGLE_CLIENT_ID`.
3. Пусто.
4. `SENTRY_ORG`, `SENTRY_PROJECT`, `SENTRY_PROJECT_API`, `NEXT_PUBLIC_SENTRY_DSN`,
   `NEXT_PUBLIC_MIXPANEL_TOKEN`.

Секрет или переменную сверх списка (от прошлых версий: CD их не читает) удалить после деплоя,
которому они уже не нужны: `gh secret delete <имя> --env production`.

`POSTGRES_PASSWORD` задаётся один раз, до первого деплоя: база инициализируется с ним, и смена
секрета потом сломает подключение api к уже созданной базе.

## Сертификат HTTPS

До первого выпуска nginx работает на временном самоподписанном сертификате (`nginx/cert-init.sh`),
браузеры показывают предупреждение. Настоящий сертификат Let's Encrypt выпускается **один раз**, на
сервере, после первого деплоя (nginx должен отвечать на проверку домена). `init-cert.sh --staging`
обращается к тестовому серверу Let's Encrypt (лимиты мягкие), `init-cert.sh` без флага — к
настоящему (на email придут предупреждения):

```bash
ssh ai-fitting
cd /opt/ai-fitting
deploy/scripts/init-cert.sh --staging <email>
deploy/scripts/init-cert.sh <email>
```

Сначала всегда `--staging`: у настоящего сервера жёсткий лимит (5 одинаковых сертификатов в неделю).
Скрипт сам убирает временный или тестовый сертификат, при ошибке возвращает временный.

Дальше всё автоматически: контейнер `certbot` дважды в сутки продлевает сертификат, nginx раз в
6 часов перезагружается и подхватывает продлённый. Проверка:

```bash
ssh ai-fitting 'cd /opt/ai-fitting && docker compose -f deploy/compose/infra.yml --env-file .env \
  --profile server exec -T certbot certbot renew --dry-run --webroot -w /var/www/certbot'
```

Выпущен 2026-10-06 на `lamoda-ai-fitting.ru` и `www.lamoda-ai-fitting.ru`.

**HSTS** (`Strict-Transport-Security: max-age=31536000`): браузер, раз открывший сайт, год ходит на
него только по HTTPS и **не даёт пройти мимо ошибки сертификата**. Поэтому истёкший или сломанный
сертификат — это недоступный сайт для всех прежних посетителей, пока его не починят: следите за
письмами Let's Encrypt. `includeSubDomains` и `preload` не включены сознательно — их последствия
трудно отменить.

**Заголовки безопасности** (спека 0006 F9, F38): основной сервер nginx отдаёт на каждый ответ api,
web и свой собственный (413, 429, 503) `X-Content-Type-Options: nosniff`,
`Content-Security-Policy: frame-ancestors 'none'` и `Referrer-Policy: strict-origin-when-cross-origin`.
Редиректы (порт 80, `www`) их не отдают. У `/_next/image` (Next) и статики Swagger (Express) есть
своя CSP. Браузер применяет обе политики, поэтому `proxy_hide_header Content-Security-Policy` не
ставят: он убрал бы песочницу Next для картинок. Ни одна `location` не задаёт свой `add_header`: он
отменил бы все заголовки уровня server, включая HSTS. Локально nginx нет, поэтому нет и заголовков.

## Предыдущий стек на сервере

До этого проекта сервер обслуживал другой сайт (compose-проект `realty`). Его контейнеры и образы
удалены 2026-10-06; **тома и `/opt/realty` оставлены**: в них база с данными пользователей.

Удалять их или нет — решение владельца, команды выполняются вручную (агенту удаление томов
запрещено). На 2026-10-06 в базе 211 пользователей, 2 из них зарегистрировались после последней
имеющейся копии (2026-10-02, 03:22 по Москве). Поэтому сначала свежая копия:

1. **Копия базы на Mac.** Одноразовый Postgres на старом томе, старый стек для этого не нужен:

   ```bash
   ssh ai-fitting 'docker run -d --rm --name realty-dump -v realty_pgdata:/var/lib/postgresql \
       postgres:18.6-trixie >/dev/null && sleep 5 \
     && docker exec realty-dump pg_dumpall -U realty; docker stop realty-dump >/dev/null' \
     > realty-backup-$(date +%F).sql
   ```

   В файле персональные данные: хранить вне репозитория (`*-backup-*.sql` в `.gitignore`).

2. **Удаление**, только когда копия проверена:

   ```bash
   ssh ai-fitting 'docker volume rm realty_caddyconfig realty_caddydata realty_pgdata \
     realty_redisdata realty_temporaldata realty_uploads && rm -rf /opt/realty'
   ```
