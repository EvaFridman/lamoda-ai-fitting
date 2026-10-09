# Деплой

Продакшен: VPS с Ubuntu 24.04, сайт https://lamoda-ai-fitting.ru. Деплой автоматический: каждый
merge в `main` → CI собирает и проверяет образы, публикует их в GHCR и разворачивает на сервере
скриптом `deploy/scripts/deploy.sh` (blue-green, без простоя). Как устроены файлы:

| Что                     | Где                                                               |
| ----------------------- | ----------------------------------------------------------------- |
| инфраструктура          | `compose/infra.yml` — PostgreSQL, Redis, Temporal, nginx, certbot |
| копия приложения (цвет) | `compose/app.yml` — api + web, blue или green                     |
| воркер Temporal         | `compose/worker.yml`                                              |
| nginx                   | `nginx/` — шаблон конфига, временный сертификат, автоперезагрузка |
| деплой                  | `scripts/deploy.sh`                                               |
| подготовка сервера      | `ansible/base.yml`                                                |
| CD                      | `.github/workflows/cd.yml`, вызывается из `ci.yml`                |

## Как идёт деплой

Push в `main` (merge PR) → workflow **CI**: Secret scan, Checks, Images (сборка, проверка
blue-green деплоя на раннере, публикация в GHCR) → **CD** (`cd.yml`, окружение `production`):

1. SSH на сервер под `deploy` (ключ сервера сверяется с `DEPLOY_KNOWN_HOSTS`);
2. каталог `deploy/` синхронизируется в `/opt/ai-fitting/deploy` на месте (`rsync --delete`):
   папки не подменяются, иначе работающий nginx продолжал бы видеть старую, удалённую копию;
3. `/opt/ai-fitting/.env` пишется заново из секретов и переменных GitHub — **правки на сервере
   затираются**, менять значения нужно в GitHub;
4. сервер входит в GHCR временным токеном прогона и выходит после деплоя;
5. `deploy.sh <тег>`: миграции → сид демо-каталога → новая копия рядом со старой → проверка →
   переключение nginx. Сид добавляет только недостающие строки и не меняет существующие,
   поэтому при следующем деплое ничего не делает; упавший сид, как и упавшая миграция, останавливает деплой, а
   сайт продолжает обслуживать старая копия;
6. проверка снаружи: сайт отвечает новой версией.

Весь путь коммита виден в одном прогоне на вкладке Actions. Деплои идут строго по одному.

## Откат

Предыдущая версия остаётся запущенной (запасной цвет), откат на неё занимает секунды:

1. Actions → **CD** → **Run workflow** → `image_tag` = 7 символов хеша нужного коммита из `main`;
2. либо из терминала: `gh workflow run cd.yml -f image_tag=<хеш>`.

Откат на ещё запущенную копию только переключает nginx: миграций и сида в нём нет.
Откат на более старую версию — тот же запуск, только это полный деплой (~1 мин). Откат не
возвращает миграции базы назад: поэтому миграции всегда совместимы с предыдущим релизом
(`specs/principles.md`). В образе, собранном до появления сида, шага нет: деплой пишет
«seed skipped» и идёт дальше.

## На сервере

```bash
ssh ai-fitting 'cat /opt/ai-fitting/.deploy-state'      # какой цвет и тег сейчас обслуживают сайт
ssh ai-fitting 'docker compose ls'                       # ai-fitting-infra, -blue, -green, -worker
ssh ai-fitting 'docker logs --tail 50 ai-fitting-blue-api-1'
```

## Подготовка Mac (один раз)

```bash
brew install ansible bash     # bash 4+ нужен deploy.sh
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
   вход только по ключу CI), каталог `/opt/ai-fitting`:

   ```bash
   cd deploy/ansible
   ansible-playbook base.yml --check --diff   # что изменится, без изменений
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

### Environment `production` (GitHub)

Окружение, в котором работают джоб деплоя и, при push в `main`, джоб сборки образов (ему нужен
токен Sentry). Деплоить из него можно только из ветки `main`: workflow из pull request не получит
эти секреты.

**Переменные** (не секретные):

| Имя              | Значение                              |
| ---------------- | ------------------------------------- |
| `DEPLOY_HOST`    | IP сервера                            |
| `DEPLOY_USER`    | `deploy`                              |
| `SITE_DOMAIN`    | `lamoda-ai-fitting.ru`                |
| `POSTGRES_USER`  | `ai_fitting`                          |
| `POSTGRES_DB`    | `ai_fitting`                          |
| `MEDIA_BASE_URL` | `https://lamoda-ai-fitting.ru/media/` |

**Секреты** — из корня репозитория:

```bash
# Закрытый ключ CI (открытая часть уже на сервере, ansible/base.yml)
gh secret set DEPLOY_SSH_KEY --env production < ~/.ssh/ai-fitting-ci

# Ключ сервера для known_hosts CI: сверить отпечаток с тем, что знает ваш Mac
ssh-keyscan -t ed25519 <IP сервера> 2>/dev/null | ssh-keygen -lf -
ssh-keygen -F <IP сервера> -l | grep ED25519
# Если отпечатки совпали:
ssh-keyscan -t ed25519 <IP сервера> 2>/dev/null | gh secret set DEPLOY_KNOWN_HOSTS --env production

# Пароль базы: случайный, его не видит никто — CI сам запишет его в .env на сервере
openssl rand -hex 32 | gh secret set POSTGRES_PASSWORD --env production

# DSN проектов Sentry (gh спросит значение, ввод не отображается): web и api
gh secret set SENTRY_DSN --env production
gh secret set API_SENTRY_DSN --env production

# Токен Sentry для загрузки source maps (шаг 2)
gh secret set SENTRY_AUTH_TOKEN --env production
# Если токен остался секретом репозитория (так было до спеки 0004): удалить после того, как лог CI
# первой сборки из main покажет загрузку. Workflow из pull request видит секреты репозитория.
gh secret delete SENTRY_AUTH_TOKEN

# Токен админских запросов api (заголовок X-Admin-Token): случайный, 64 символа
openssl rand -hex 32 | gh secret set ADMIN_API_TOKEN --env production
```

### Уровень репозитория (GitHub)

Переменные джоба сборки образов: он работает и для pull request, без окружения.

```bash
gh variable set SENTRY_ORG --body "<slug организации>"
gh variable set SENTRY_PROJECT --body "lamoda-ai-fitting"
gh variable set SENTRY_PROJECT_API --body "lamoda-ai-fitting-api"
gh variable set NEXT_PUBLIC_SENTRY_DSN --body "<DSN>"   # DSN web: он публичный, уходит в браузер
```

### Проверка

```bash
gh secret list --env production     # DEPLOY_SSH_KEY, DEPLOY_KNOWN_HOSTS, POSTGRES_PASSWORD, SENTRY_DSN,
                                    # API_SENTRY_DSN, SENTRY_AUTH_TOKEN, ADMIN_API_TOKEN
gh variable list --env production   # DEPLOY_HOST, DEPLOY_USER, SITE_DOMAIN, POSTGRES_USER, POSTGRES_DB,
                                    # MEDIA_BASE_URL
gh secret list                      # пусто
gh variable list                    # SENTRY_ORG, SENTRY_PROJECT, SENTRY_PROJECT_API, NEXT_PUBLIC_SENTRY_DSN
```

`POSTGRES_PASSWORD` задаётся один раз, до первого деплоя: база инициализируется с ним, и смена
секрета потом сломает подключение api к уже созданной базе.

## Сертификат HTTPS

До первого выпуска nginx работает на временном самоподписанном сертификате (`nginx/cert-init.sh`),
браузеры показывают предупреждение. Настоящий сертификат Let's Encrypt выпускается **один раз**, на
сервере, после первого деплоя (nginx должен отвечать на проверку домена):

```bash
ssh ai-fitting
cd /opt/ai-fitting
deploy/scripts/init-cert.sh --staging <email>   # тестовый сервер Let's Encrypt: лимиты мягкие
deploy/scripts/init-cert.sh <email>             # настоящий; на email придут предупреждения
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
