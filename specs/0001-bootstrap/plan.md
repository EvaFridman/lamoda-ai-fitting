# 0001 Bootstrap: plan

Status: accepted (2026-10-05).
Implements [spec.md](spec.md) (criteria AC1–AC26) under the decisions in
[clarifications.md](clarifications.md) (ids like B7).

## 1. Versions

Checked against npm and Docker Hub on 2026-10-05 and by test installs. Lockfiles and image tags pin
exact versions.

| What                        | Version                                                          | Note                                                                                                                                       |
| --------------------------- | ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| Node                        | 26.x (`node:26.10.0-trixie-slim`) (V4)                           | same in CI (`setup-node` 26) and `.nvmrc`                                                                                                  |
| npm                         | 12.x (V5)                                                        | images and CI run `npm install -g npm@12` first (Node images ship 11); install scripts only from the `allowScripts` list in `package.json` |
| TypeScript                  | 6.0.x (V1)                                                       | **not 7.0**: no JS API; typescript-eslint refuses to install with it, the Nest Swagger plugin and Next need the API                        |
| ESLint                      | 10.x (V2)                                                        | React and a11y rules from `@eslint-react/eslint-plugin` and `eslint-plugin-jsx-a11y-x`: the classic plugins do not run on 10               |
| NestJS                      | 12.x                                                             |                                                                                                                                            |
| Prisma                      | 7.10.x                                                           | **install as `prisma@7`**: the npm `latest` tag points at `8.0.0-rc`                                                                       |
| Next / React                | 16.3.x / 19.x                                                    |                                                                                                                                            |
| Temporal SDK / server image | 1.24.x / `temporalio/temporal:1.9.1`                             |                                                                                                                                            |
| Vitest                      | 5.x                                                              | no SWC plugin needed, see 4.6                                                                                                              |
| PostgreSQL / Redis          | `postgres:18.6-trixie` / `redis:8.10.2-trixie`                   |                                                                                                                                            |
| nginx / certbot             | `nginx:1.30.5-alpine` (stable branch) / `certbot/certbot:v5.8.0` |                                                                                                                                            |

Goal: every package installs with plain `npm ci`, no `--legacy-peer-deps` anywhere.

## 2. Repository layout

```
.
├── .claude/                 settings.json, hooks/, agents/code-reviewer.md, commands/
├── .githooks/               pre-commit, commit-msg, pre-push
├── .github/workflows/       ci.yml, deploy.yml
├── api/                     NestJS (section 4)
├── web/                     Next.js (section 5)
├── deploy/
│   ├── ansible/             one-time server setup (section 8)
│   ├── compose/             infra.yml, app.yml, worker.yml (section 6.2)
│   ├── nginx/               templates/, entrypoint scripts
│   ├── scripts/             deploy.sh, init-cert.sh
│   └── README.md
├── scripts/                 init-env.sh, ci-build-images.sh, smoke-test.sh
├── specs/                   principles.md, 0001-bootstrap/
├── docker-compose.yml       dev setup
├── .env.example, .gitignore, .gitleaks.toml, .prettierrc, .prettierignore, .lintstagedrc.json
├── commitlint.config.mjs, eslint.config.mjs, package.json
└── CLAUDE.md, CONTRIBUTING.md, README.md
```

## 3. Root tooling (A1–A11)

- **One ESLint config at root** (`eslint.config.mjs`, flat config) with blocks per folder: base TS
  rules for `api/**`; for `web/**` the Next plugin, `@eslint-react`, `react-hooks` and
  `jsx-a11y-x` (V2), assembled by hand instead of `eslint-config-next`, which loads its parser from
  the `next` package (not resolvable from the root) and brings plugins that do not run on ESLint 10.
  Rules both React plugins carry are reported once (from `react-hooks`). ESLint
  and plugins are installed in root only; `api` and `web` have no ESLint config or dependency of
  their own (A3). Lint runs from root: `npm run lint`.
- **One Prettier config at root**, `singleQuote: true`, `printWidth: 100`, `trailingComma: all`.
- Root `package.json` scripts: `format`, `format:check`, `lint`, `lint:css`, `typecheck`, `test`
  (they call into `api`/`web` with `npm --prefix`), and `prepare` (sets `core.hooksPath .githooks`).
- lint-staged: ESLint + Prettier on TS, Stylelint + Prettier on SCSS, Prettier on JSON/MD/YAML.
- Hooks: pre-commit = lint-staged then `gitleaks git --pre-commit --staged`; commit-msg = commitlint;
  pre-push = typecheck + tests. gitleaks is a local binary (`brew install gitleaks`); the hook stops
  with a clear message if it is missing.
- `.gitleaks.toml`: default rules plus a rule for passwords inside connection URLs
  (`postgresql://user:pass@`), which the default rules miss.
- `.claude/settings.json`: `ask` for deleting files, `git push`, `ssh`/`scp`, installing packages,
  Prisma commands that change a database; PreToolUse hook `guard-bash.sh` blocks
  `docker compose down -v`, `docker volume rm/prune`, `prisma migrate reset`, `prisma db push`;
  PostToolUse hook runs Prettier on edited files.

## 4. api

### 4.1 Process model

One image, two entry points:

- `dist/main.js`: HTTP + WebSocket server (port 3000).
- `dist/temporal/worker.js`: Temporal worker.

### 4.2 Modules

| Module     | Does                                                                                                                                                                                                          |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `config`   | `@nestjs/config`, env validated at startup with a zod schema; a missing variable stops the process with its name                                                                                              |
| `logger`   | `nestjs-pino`; JSON in prod, `pino-pretty` in dev; level from `LOG_LEVEL`                                                                                                                                     |
| `prisma`   | `PrismaService` over `@prisma/adapter-pg`; client generated into `src/generated/prisma` (git-ignored)                                                                                                         |
| `redis`    | one shared `ioredis` client as a provider                                                                                                                                                                     |
| `temporal` | Temporal `Client` provider (address `TEMPORAL_ADDRESS`, queue `TEMPORAL_TASK_QUEUE`)                                                                                                                          |
| `health`   | `GET /health/live` → `{ status, version }`, no dependency checks; `GET /health/ready` → terminus checks of Postgres (`SELECT 1`), Redis (`PING`), Temporal (`getSystemInfo`), 503 naming the failed one (AC3) |
| `hello`    | `GET /hello` → `{ message: 'Hello, world!' }` (AC2, AC4)                                                                                                                                                      |
| `realtime` | socket.io gateway: `ping` → `pong` (AC6); the place later domain events (`@nestjs/event-emitter`) reach clients                                                                                               |
| throttling | global `ThrottlerGuard`, storage in Redis, limits from env (AC8); `/health/*` skipped                                                                                                                         |

`version` comes from `APP_VERSION`: the image tag (commit hash) in prod, `dev` locally (AC16).

Throttler counters live in Redis, so the blue and green copies share them: switching versions does
not reset anyone's limit.

### 4.3 HTTP details

- Swagger UI at `/docs`, only when `NODE_ENV !== 'production'` (AC4).
- `trust proxy` on: behind nginx every request would otherwise come from nginx's IP, and the
  throttler would count all users as one.
- CORS allows `WEB_ORIGIN` only (dev: `http://localhost:3001`; prod: same origin through nginx).
- `ValidationPipe` (whitelist, transform) global, for DTOs with class-validator.
- Graceful shutdown (`enableShutdownHooks`): on stop, the api finishes requests in flight.
- No response envelope or error hierarchy yet: the first feature spec decides the API format.

### 4.4 Temporal worker

`src/temporal/worker.ts` creates a `Worker` for `TEMPORAL_TASK_QUEUE` with `workflows/` and
`activities/`. One workflow `hello` calls one activity that returns `'Hello, world!'` (AC5).
Workflows are bundled by the Temporal SDK from compiled `dist/temporal/workflows`.

The worker is not blue-green (D6a). Two worker versions polling one task queue could replay
running workflows with different code and fail them. One worker, replaced in place, is safe:
while it restarts, Temporal keeps the tasks queued.

### 4.5 Prisma

`schema.prisma` has a datasource and a generator, no models (E3). `prisma.config.ts` at `api/`.
`prisma` stays in `dependencies`: the runtime image runs `prisma migrate deploy`.

### 4.6 Tests (B7)

Vitest, no SWC plugin (revised in T9). Nest's dependency injection needs decorator metadata;
Vitest 5 runs on Vite 8, whose Oxc transformer emits it from `emitDecoratorMetadata` (checked:
`design:paramtypes` is present in tests without `unplugin-swc`). Tests that build classes through
Nest's DI fail loudly if that ever changes. First tests: `HelloController` (unit), `/health/live` (e2e with `supertest` against the Nest app).

### 4.7 Packages installed now without code yet (owner decision, 4-week timeline)

`@nestjs/swagger` and class-validator/class-transformer get used in 4.3. `@nestjs/event-emitter`,
`@types/multer` (uploads go through `@nestjs/platform-express`, which already includes multer) are
installed and registered. Their first real use comes with features.

## 5. web

- App Router. `app/` holds routing only: each `page.tsx` re-exports a page from `src/_pages`.
- FSD layers in `src/`: `_app` (providers: TanStack Query, Zustand store for UI state), `_pages/home`,
  `widgets/greeting`, `shared/api` (server-side `apiFetch` with `API_URL`), `shared/config/env.ts`
  (zod), `shared/redis/client.ts` (C6: `server-only`, `lazyConnect`). The empty layers `features` and
  `entities` are created with a `README.md` stating their rule.
- `next.config.ts`: `output: 'standalone'`, `reactCompiler: true`, `cacheComponents: true`,
  wrapped with Sentry.
- Home page: a static shell (title, footer) plus `<Suspense>` around `Greeting`, a server component
  that calls `await connection()` and then `GET {API_URL}/hello`. `connection()` makes it render
  per request, never at build time, so the build needs no api (C7, AC12). If the api fails, the
  component shows an error state (AC2).
- The footer shows `APP_VERSION` (read at request time) (AC16).
- Styles: SCSS modules + `globals.scss`; Stylelint over `web/src` and `web/app`.
- Browser-to-api calls (none yet) will use `NEXT_PUBLIC_API_URL`: `/api` in prod (same origin through
  nginx), `http://localhost:3000` in dev.

### 5.1 Sentry (C8)

- `instrumentation.ts` (server) + `instrumentation-client.ts` (browser). An empty DSN turns it off,
  so dev and CI pull requests run without it.
- Source maps: `withSentryConfig` uploads them during `next build` and deletes them from the image
  afterwards (users never download them). The upload needs `SENTRY_AUTH_TOKEN`, `SENTRY_ORG`,
  `SENTRY_PROJECT`; the token enters the build as a BuildKit secret, never as `ARG` or `ENV`, so it
  is in no image layer. Without the token (local builds, pull requests from forks) the build skips
  the upload and still succeeds.
- Release name = the commit hash, the same value as `APP_VERSION`, so an error in Sentry points at
  the exact deployed version.

## 6. Docker

### 6.1 Images

`api/Dockerfile` stages: `deps` → `build` (`prisma generate`, `nest build`) → `dev` (watch mode,
`procps` for Nest's watcher) → `prod-deps` (`npm ci --omit=dev`) → `runtime` (dist, generated
client, prisma files; user `node`, exec-form `CMD`).

`web/Dockerfile` stages: `deps` (also the dev target, `next dev`) → `build` (`next build`, no api, no
network services) → `runtime` (standalone server, `.next/static`, `public`; user `node`).

`APP_VERSION` is not baked in: compose passes it at run time, so the same image runs anywhere.

Every stage that installs packages first runs `npm install -g npm@<pinned 12.x>`, so the image honors
the same `allowScripts` list as the Mac and CI.

### 6.2 Compose files

**Dev** stays one ordinary file, `docker-compose.yml`: `postgres`, `redis`, `temporal` (`start-dev`,
UI on `127.0.0.1:8233`), `api` and `temporal-worker` (target `dev`, `src` bind-mounted, watch), `web`
(target `deps`, `next dev`). Host ports on `127.0.0.1` only: api 3000, web 3001, Postgres 5433,
Redis 6380 (offset to avoid clashes with anything native on the Mac; overridable in `.env`). Project
name `ai-fitting`.

**Production** (server and the CI smoke test) is split by lifetime, because blue-green needs two
copies of the app but one copy of everything else:

| File                        | Compose project                        | Contents                                                                                                                                     | Lifetime                      |
| --------------------------- | -------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------- |
| `deploy/compose/infra.yml`  | `ai-fitting`                           | `postgres`, `redis`, `temporal` (`--headless`), `nginx`, `certbot` (server only, compose profile `server`); creates the network `ai-fitting` | long-lived, changes rarely    |
| `deploy/compose/app.yml`    | `ai-fitting-blue` / `ai-fitting-green` | `api`, `web` with `IMAGE_TAG` and `COLOR`; joins `ai-fitting` with aliases `api-<color>`, `web-<color>`; no published ports                  | one per deploy                |
| `deploy/compose/worker.yml` | `ai-fitting-worker`                    | `temporal-worker` with `IMAGE_TAG`                                                                                                           | replaced in place each deploy |

Only nginx publishes ports (80, 443). Startup order via `healthcheck` + `depends_on: service_healthy`
inside a project; across projects, `deploy.sh` waits for health explicitly. Named volumes: `pgdata`,
`redisdata`, `temporaldata`, `letsencrypt`, `certbot-www`, `nginx-upstream`.

Estimated memory on the server: ~1.2 GB with both colors running; the VPS has 3.8 GB.

## 7. nginx and certificates (D3)

Configuration: `deploy/nginx/templates/default.conf.template`. The official nginx image substitutes
`${SITE_DOMAIN}` from the environment at start.

| Server            | Behavior                                                                                                                                                                                                                                                                                 |
| ----------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `:80`, both names | `/.well-known/acme-challenge/` from the `certbot-www` volume; everything else 301 → `https://lamoda-ai-fitting.ru`                                                                                                                                                                       |
| `:443 www.`       | 301 → apex (AC20)                                                                                                                                                                                                                                                                        |
| `:443` apex       | TLS (Mozilla "intermediate" settings), HTTP/2, gzip, `client_max_body_size 20m` (AC22); `/` → upstream `web`; `/api/` → upstream `api` (prefix stripped); `/socket.io/` → upstream `api` with `Upgrade`/`Connection` headers and `proxy_read_timeout 1h` (AC22); `X-Forwarded-*` headers |

`/api/health/ready` is closed to the outside (`deny all`): its 503 body names internal hosts and
failure reasons. `deploy.sh` checks readiness over the internal network; `/api/health/live` (only
status and version) stays public for AC16. Added in T11.

**Blue-green switch.** The upstreams live in a separate file, `upstream/active.conf`, on its own
volume:

```nginx
upstream api { server api-green:3000; }
upstream web { server web-green:3001; }
```

`deploy.sh` rewrites it for the new color, runs `nginx -t`, then `nginx -s reload`. A reload starts
new nginx workers with the new upstreams; old workers finish their requests and then exit, so no
request is dropped (AC26). Open WebSocket connections stay on the old color until the client
reconnects, which is another reason the old color keeps running.

nginx resolves upstream names when it loads the config, so it refuses to start if the named color
does not exist. Hence the order on the very first deploy: app first, nginx second.

HSTS is added only after the real certificate works. Before that, a wrong HSTS header could lock
browsers out of the site.

**First certificate.** This is the chicken-and-egg problem from the clarifications. An entrypoint
script in the nginx container creates a temporary self-signed certificate if none exists, so nginx
always starts with the full config. `deploy/scripts/init-cert.sh` (run once on the server) then
runs `certbot certonly --webroot` for both names, first with `--staging`, then for real, and
reloads nginx. The CI smoke test relies on the same self-signed fallback.

**Renewal (AC21).** The `certbot` container runs `certbot renew` every 12 hours. nginx reloads
itself every 6 hours (a background loop in its entrypoint), so a renewed certificate is picked up
without the containers needing to signal each other or access to the Docker socket.

## 8. Server (one-time setup)

`deploy/ansible/base.yml` (idempotent, run from the Mac):

- Docker Engine + Compose plugin, Docker log rotation, ufw (22, 80, 443 in), 2 GB swap. Most of this
  already exists on the VPS; the playbook confirms it and fixes drift.
- User `deploy` (D6b) in the `docker` group, with the CI's SSH public key only, and `/opt/ai-fitting`
  owned by it. Membership in `docker` is close to root; the gain is a separate key that can be
  revoked without touching the owner's access, and a clear trail of what CI did.

Old stack removal (F1, AC24), a step in the tasks, each command confirmed by the owner:
`docker compose down` in `/opt/realty` (no `-v`), then removing the `realty-*` images.
`deploy/README.md` documents the check (users created after 2026-10-02) and the command that deletes
the old volumes and `/opt/realty`, for the owner to run.

## 9. CI: `.github/workflows/ci.yml`

Triggers: pull request to `main`, push to `main`. `permissions: contents: read` by default.

The workflow grows with the pull requests (W1): `secrets` and `checks` arrive with the tooling PR, so
every later PR is checked; `images` with the production setup; `deploy` last.

| Job       | Needs    | Steps                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| --------- | -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `secrets` |          | gitleaks (pinned image) over the full history                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| `checks`  |          | Node 26, npm 12, `npm ci` in root, api, web; `prisma generate`; `format:check`, `lint`, `lint:css`, `typecheck`, `test` (AC9, AC14)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| `images`  | both     | `scripts/ci-build-images.sh`: build both runtime images (BuildKit, cache in GitHub Actions; Sentry upload only on push to `main`). Then the smoke test on the runner, with the same files and script as the server: `infra.yml` without certbot, `SITE_DOMAIN=localhost`, nginx on its self-signed certificate; `deploy.sh` deploys blue, `smoke-test.sh` checks the page through nginx contains "Hello, world!"; `deploy.sh` deploys green while a request loop runs, and the loop must see zero failures (AC12, AC13, AC26). On push to `main` only: push to GHCR with tag = 7-char commit hash (AC15; `packages: write` only in this job) |
| `deploy`  | `images` | push to `main` only: calls `deploy.yml` with that tag                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |

Running `deploy.sh` in CI on every pull request means the switch logic is tested before it ever
touches the server, and a broken nginx config fails the PR, not the deploy.

## 10. CD: `.github/workflows/deploy.yml`

Triggers: `workflow_call` (from CI) and `workflow_dispatch` with an `image_tag` input (rollback, AC19).
Runs in the GitHub Environment `production`; `concurrency: production`, never cancel a running
deploy.

1. Load the SSH key of the `deploy` user; known hosts come from a secret (the server's key pinned,
   no trust-on-first-use).
2. Copy `deploy/compose/`, `deploy/nginx/` and `deploy/scripts/` to `/opt/ai-fitting`.
3. Write `.env` on the server from Environment variables and secrets (overwritten every deploy, so
   editing it by hand on the server is pointless and documented as such).
4. Pass a short-lived `GITHUB_TOKEN` to `docker login ghcr.io` on the server, pull, `docker logout`.
   GHCR packages start private even in a public repo; this way they can stay private.
5. Run `deploy.sh <tag>` on the server.

### `deploy.sh <tag>`

State file `/opt/ai-fitting/state`: the active color and its tag.

1. Target color = the one not active (first deploy: blue).
2. If the target color already runs `<tag>` and is healthy (a rollback to the previous version):
   skip to step 6. This is what makes AC19 take seconds.
3. `infra.yml up -d --wait` (a no-op when nothing changed).
4. `prisma migrate deploy` in a one-off container of the new api image (AC17).
5. `app.yml` as project `ai-fitting-<target>` with `IMAGE_TAG=<tag>`: `up -d --wait`, then
   `/health/ready` of `api-<target>` and `/` of `web-<target>` checked over the internal network.
   Any failure: stop the target color, exit 1. nginx was never touched, so the old version kept
   serving (AC18).
6. Switch nginx to the target color (section 7).
7. Check `https://<domain>/api/health/live` returns `<tag>` (AC16). If not: switch nginx back,
   exit 1.
8. `worker.yml up -d` with `<tag>`.
9. Write the state file. The previous color keeps running, idle, until the next deploy replaces it.

Known limits, accepted for this scope:

- A rollback does not undo migrations (D6c). Rule for `principles.md`: migrations stay compatible
  with the previous release (add first, remove in a later release); a bad migration is fixed by
  rolling forward.
- The temporal-worker restarts in place, so background jobs pause for a few seconds per deploy.

### GitHub settings the owner creates

Environment `production`:

- Secrets: `DEPLOY_SSH_KEY`, `DEPLOY_KNOWN_HOSTS`, `POSTGRES_PASSWORD`, `SENTRY_DSN`.
- Variables: `DEPLOY_HOST`, `DEPLOY_USER`, `SITE_DOMAIN`, `POSTGRES_USER`, `POSTGRES_DB`,
  `LETSENCRYPT_EMAIL`.

Repository level (the `images` job builds web before any environment is involved):

- Secret: `SENTRY_AUTH_TOKEN`.
- Variables: `SENTRY_ORG`, `SENTRY_PROJECT`, `NEXT_PUBLIC_SENTRY_DSN` (public in the bundle anyway).

## 11. Environment variables

All of them are listed in root `.env.example` with a comment; `scripts/init-env.sh` fills dev values
and random secrets. Server-to-server addresses (`postgres`, `redis`, `temporal:7233`,
`http://api:3000` in dev, `api-<color>` in prod) are set in compose, never in code.

## 12. Documentation (A9, A9a)

- `README.md`: what the project is, quick start (AC1), commands.
- `CLAUDE.md`: stack and versions, layer rules, conventions, check commands, Docker rules, git
  rules, the spec lifecycle rule (A9a). Imports `CONTRIBUTING.md`.
- `CONTRIBUTING.md`: security rules for people and agents.
- `specs/principles.md`: spec → clarifications → plan → tasks → code; acceptance criteria are
  observable; A9a; backward-compatible migrations (D6c).
- `deploy/README.md`: one-time server setup, first certificate, GitHub settings, how blue-green
  works, rollback, old stack removal.

## 13. Verification map

| AC     | How it is checked                                                                                                                                                                                   |
| ------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1–8    | by hand on the local stack, commands from the spec                                                                                                                                                  |
| 9      | the commands, locally and in the `checks` job                                                                                                                                                       |
| 10, 11 | a test commit with a bad message / a fake secret, then discarded                                                                                                                                    |
| 12     | `docker build` of `web` with nothing else running; the `images` job proves it on every PR                                                                                                           |
| 13–15  | a test PR (green), a test PR with a broken test (red, then closed); GHCR after merge                                                                                                                |
| 16–19  | the first merge; AC18 by running `deploy.sh` on the server with a nonexistent tag (the site must stay up); AC19 via `workflow_dispatch` with the previous tag, timed                                |
| 20–23  | `curl -I`, `certbot renew --dry-run`, a socket.io client against the domain, a 10 MB upload request (413 from nginx would fail; any api answer passes), `nc -z` from the Mac to 5432/6379/7233/3000 |
| 24     | `docker ps -a`, `docker images` on the server                                                                                                                                                       |
| 25     | gitleaks in CI, review of `.env.example`                                                                                                                                                            |
| 26     | in CI on every PR; on the server, a request loop from the Mac during the first real deploy                                                                                                          |

## 14. Risks

| Risk                                                          | Plan                                                                                                                          |
| ------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| Prisma 7 refuses to generate a client with zero models        | add a placeholder model, no migration; noted in the PR                                                                        |
| `start-dev` Temporal loses history if the volume is lost      | acceptable for now (D2); history is not business data                                                                         |
| The first real certificate fails and burns rate limit         | always `--staging` first (D3)                                                                                                 |
| Next 16 + `cacheComponents` + standalone edge cases           | the `images` job builds the real production image on every PR                                                                 |
| Monorepo with three lockfiles drifts                          | CI uses `npm ci` in each folder: a stale lockfile fails                                                                       |
| A bug in `deploy.sh` leaves nginx pointing at a stopped color | the switch happens only after the target is healthy; the post-switch check switches back; CI runs the same script on every PR |
| Both colors plus a deploy's pull exceed memory                | ~1.2 GB estimated of 3.8 GB, 2 GB swap; checked with `free -h` after the first deploy                                         |
