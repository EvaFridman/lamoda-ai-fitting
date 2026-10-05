# 0001 Bootstrap: clarifications

Status: accepted (2026-10-06).

Decisions made by the owner. Each line is final unless the owner changes it here.

## Repository and tooling

- A1. Monorepo `api/` + `web/`, each with its own `package.json`; root holds shared tooling.
- A2. One Prettier config for the whole repo, single quotes.
- A3. ESLint + typescript-eslint + eslint-config-prettier, one major version across root, api and web:
  one flat config and one ESLint install at the root, linting both `api` and `web`.
- A4. Stylelint (standard-scss + clean-order) for `web`.
- A5. commitlint, Conventional Commits. Types: feat, fix, perf, refactor, style, test, docs, build,
  ci, chore, revert. Required scope: api, web, infra, deploy, ci, deps, docs, specs, tooling.
- A6. Git hooks: pre-commit (lint-staged, then gitleaks), commit-msg (commitlint), pre-push
  (typecheck + tests).
- A7. gitleaks locally and in CI over the full history.
- A8. `scripts/init-env.sh` generates `.env` with random secrets.
- A9. `CLAUDE.md`, `CONTRIBUTING.md` (security rules for people and agents), `specs/principles.md`.
- A9a. Spec lifecycle: specs stay in the repo as the history of decisions. When a feature is done
  its spec folder gets `Status: done` and is never edited again; it is history, not instructions.
  The living source of truth is the code, `CLAUDE.md` and `README.md`, updated in the same PR that
  changes behavior. `CLAUDE.md` and `specs/principles.md` state this rule.
- A10. `.claude/`: Bash guard and format hooks, permissions.
- A11. `.claude/`: read-only code-reviewer agent, `/pr-summary`, `/review-changes` now; skills for
  repeated tasks (e.g. adding an endpoint) once there is code to model them on.

## api (NestJS)

- B1. NestJS, TypeScript, ESM.
- B2. `@nestjs/config`, `@nestjs/terminus`.
- B3. pino via `nestjs-pino`.
- B4. PostgreSQL + Prisma 7 (`@prisma/adapter-pg`).
- B5. Redis + ioredis.
- B6. Temporal SDK and a separate temporal-worker process.
- B7. Tests: Vitest.
- B8. Swagger, class-validator, class-transformer: set up now.
- B9. Auth is not part of bootstrap: its own spec `0002-auth`, right after this one.
- B10. No RabbitMQ: background jobs go through Temporal, pub/sub through Redis.
- B11. WebSockets (socket.io).
- B12. Throttler with Redis storage.
- B13. File uploads: yes. Mail and PDF: no.
- B14. `@nestjs/event-emitter`: yes (domain events to the WebSocket gateway).
  Not used: `@nestjs/observe`, `@nestjs/mau`, logdy, oxlint.

## web (Next.js)

- C1. Next 16 + React 19, `output: "standalone"`, React Compiler.
- C2. FSD layers: `_app → _pages → widgets → features → entities → shared`.
- C3. TanStack Query, Zustand, zod: set up now.
- C4. SCSS.
- C5. No axios.
- C6. ioredis in web: a server-only client that connects lazily (on the first command), so the
  build never needs Redis. What web stores there is decided by later specs (e.g. `0002-auth`).
- C7. `cacheComponents` on. Principle: the web image builds without a running api, Redis or
  database; api data renders at request time inside `<Suspense>`.
- C8. Sentry (browser and server), with source map upload at build time. A new Sentry project and
  a new auth token for this repository (revocable on its own); the token lives only in GitHub
  secrets and reaches the build as a BuildKit secret.

## Infrastructure and delivery

- D1. Docker multi-stage images, Node slim (V4), non-root; compose dev setup + production compose
  files.
- D2. Temporal runs in a container in both environments: `temporalio/temporal` `start-dev`, SQLite
  on a volume. Dev publishes the UI on `127.0.0.1:8233`; prod is headless (UI only via SSH tunnel).
  temporal-worker is a container in both.
- D3. nginx + certbot (Let's Encrypt), chosen to learn it, not a hard requirement. Debug against the
  Let's Encrypt staging server first, because of production rate limits.
- D4. "dev" is the local Docker setup only. The only server environment is prod.
- D5. VPS: IP 5.42.102.131, 2 CPU, 3.8 GB RAM, Ubuntu; SSH alias `realty` in the owner's
  `~/.ssh/config` (named `ai-fitting` only in the hosting panel). Domain `lamoda-ai-fitting.ru`;
  apex and `www` A records already point at the VPS (checked 2026-10-05).
- D6. Automatic CD: push to `main` → CI builds images → GHCR → SSH to the VPS → compose pull/up →
  health check. Secrets in a GitHub Environment. Ansible only for one-time server setup.
- D6a. Blue-green deploys: the new version of api and web starts next to the running one, nginx
  switches traffic only after it is healthy, the previous version keeps running idle for an instant
  rollback. Background processes (temporal-worker) are replaced in place.
- D6b. CI reaches the VPS as a dedicated `deploy` user (in the `docker` group, CI key only), never
  as root.
- D6c. Migrations stay compatible with the previous release (expand/contract: add in one release,
  remove in a later one). Rollback is for code errors; a bad migration is fixed by rolling forward.
- D7. Public GitHub repository https://github.com/EvaFridman/lamoda-ai-fitting, already the
  `origin` remote.
- F1. The VPS currently runs another stack (`realty-*` containers, files in `/opt/realty`) that
  holds ports 80/443. It is no longer needed. As part of this task its containers are stopped and
  removed and its images deleted (~2.6 GB; copies stay in GHCR). Its volumes (~80 MB, mostly mock
  data, a database copy from 2026-10-02 exists) and `/opt/realty` are deleted by the owner by hand,
  with the command from `deploy/README.md`, after a check that no user registered after that copy.

## Bootstrap scope

- E1. The web page shows "Hello, world!" fetched from the api.
- E2. `/health/ready` in api checks Postgres, Redis and Temporal.
- E3. Prisma connected, no models or migrations yet.

## Versions

- V1. TypeScript 6.0 everywhere. 7.0 has no JS API, so typescript-eslint, the Nest Swagger plugin
  and Next cannot use it; move to 7 once they support it.
- V2. ESLint 9 with the full `eslint-config-next` rule set. ESLint 10 crashes on
  `eslint-plugin-react` and cannot install `eslint-plugin-jsx-a11y`; move to 10 once they support it.
- V3. Prisma 7.10 (stable), not the 8.0 release candidate that npm's `latest` tag points at.
- V4. Node 26 on the Mac, in images and in CI. It becomes LTS on 2026-10-28 (supported until
  2029-04); Node 24 enters maintenance on 2026-10-20. Checked: every key package allows it, the
  Temporal native module loads on it.
- V5. npm 12 everywhere (Node images ship npm 11, so images and CI install npm 12). npm 12 runs a
  package's install scripts only if approved; the approved list (`allowScripts`) is in
  `package.json` and reviewed like code.

## Workflow

- W1. One pull request per phase of `tasks.md`, each merged into `main` when green. Only the PR that
  adds the deploy job has to wait for the server and GitHub settings.
- W2. Merge with "Rebase and merge": every task commit lands in `main` as is, no merge commits.
- W3. Claude stops after every task for the owner to review the diff before the commit.

## Open

None.
