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
