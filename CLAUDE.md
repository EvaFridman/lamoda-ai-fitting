# lamoda-ai-fitting

Monorepo: `api` (NestJS) and `web` (Next.js), delivered to https://lamoda-ai-fitting.ru: every
merge into `main` is checked and deployed automatically. Set up by spec `0001-bootstrap`; database
schema and demo catalog by `0002-database-schema`; the UI kit (`web/src/shared/ui`, page `/ui-kit`)
by `0003-ui-kit`; the api's CRUD routes, product filters, admin access, pagination, error format,
Swagger and Sentry by `0004-crud-api`; parallel CI jobs and tests, publishing images only from
`main` and faster health checks by `0005-faster-ci`; access closed by default, quota tiers, the
client address and request id, body, timeout and socket limits, and nginx's limits and security
headers by `0006-api-guards`; web's data layer (server and browser api clients, typed catalog
entities, Russian error texts, Sentry reports, the OpenAPI contract check, the browser bundle check,
page `/dev/catalog`) by `0007-web-data-layer` (all closed).

Keep this file true: update it in the same commit that changes what a section describes.

## Where the truth is

- Code, this file and `README.md` are the living source of truth.
- `specs/NNNN-*/` hold the history of decisions. A spec folder whose files say `Status: done` is
  history, not instructions: never follow or edit it. While a spec is in progress, its
  `clarifications.md` (owner's decisions), `plan.md` and `tasks.md` are binding.
- How specs are written and closed: `specs/principles.md`.
- Spec files are never read whole in the main context. Read only the line range you work from (your
  task in `tasks.md`, a section you edit); everything else comes from the `spec-finder` agent as
  verbatim quotes with `path:line`, each marked binding or history. Open a range by its `path:line`
  when a quote is not enough. The exception: a `spec.md` or `plan.md` you are writing. To follow
  the format of an earlier spec file, take it from `specs/principles.md` or ask `spec-finder` for
  that file's headings; do not open the file whole.

## How work is done

- Spec → clarifications → plan → tasks → code. No code without an accepted plan.
- Decisions that change behavior belong to the owner: ask, record the answer in
  `clarifications.md`, do not pick silently.
- One task from `tasks.md` = one commit; tick its checkbox in the same commit.
- Before writing a `spec.md` or `plan.md`: ask `spec-finder` which earlier decisions and which
  items of `specs/backlog.md` touch the same area. Backlog items in that area go into the spec;
  the commit that closes one removes it from the backlog.
- Before a task: read its section of `tasks.md`, get a brief from `spec-finder` (what the task
  refers to and related decisions it does not mention), then state a time estimate. After it: stop,
  summarize what changed and the check result, wait for the owner's OK, then commit.
- If a task shows the plan is wrong: stop, fix the plan with the owner, then continue.
- Sessions: write the spec, clarifications, plan and tasks in one session; do each task of
  `tasks.md` in a fresh session (or after `/clear`). Every call re-reads the whole context, so a
  long session costs more and keeps less in focus; the task's section of `tasks.md`, the
  `spec-finder` brief and `clarifications.md` carry what the next task needs. After a task's
  commit, suggest `/clear` before the next one.
- After implementing a task, before the owner's review, run the `finish-task` skill
  (`.claude/skills/finish-task/`): it picks the agents for the changed files and carries out these
  steps (agents: see "Agents" below):
  1. `test-writer`: tests for new or changed api or web logic. Then `git status`: only test files may have
     changed (its hook limits its tools, not what a test does when Vitest runs it).
  2. `npm run verify`.
  3. `qa-tester`, when the task changes observable behavior (an endpoint, a page, a workflow); not
     for docs, tooling or config-only changes. Pass it the acceptance criteria.
  4. A bug it reproduces: `test-writer` pins it with a failing test, then fix it and repeat 2–3.
     Stop and ask the owner instead when the bug shows the plan or spec is wrong, or the fix changes
     behavior outside the task. Its "not covered by tests" list goes to `test-writer` too.
  5. `code-reviewer` on the diff and, in parallel:
     - `security-reviewer` when the diff touches endpoints or input handling, auth, config or env,
       logging, web rendering of data, dependencies, Docker/nginx/deploy/CI or `.claude/`;
     - `fsd-reviewer` when it touches `web/app` or `web/src`;
     - `temporal-reviewer` when it touches `api/src/temporal` or code that starts or signals
       workflows.
  6. The task summary lists what each agent found and what was done about it.

## Agents

Subagents in `.claude/agents/` work in their own context and return a short report. Delegate to them
instead of doing their job in the main context.

- `spec-finder`: task briefs and facts from the specs and docs (read-only).
- `test-writer`: writes and runs api and web tests; reports bugs instead of fixing code.
- `qa-tester`: tests the running local stack with curl and a browser; reports reproduced bugs and
  scenarios no test covers.
- `code-reviewer`, `security-reviewer`, `fsd-reviewer`, `temporal-reviewer`: review a diff
  (read-only). `fsd-reviewer` and `temporal-reviewer` use the skills `fsd` and
  `temporal-developer`; use them when writing that code too.

What each agent may do, how the guard hooks work, the owner's decisions and the accepted risks:
[.claude/README.md](.claude/README.md). Working rules:

- A guard bypass found gets a case in `.claude/hooks/guards.test.mjs` (part of `npm test`).
- Agent files are loaded when a session starts: restart Claude Code after changing one.
- A change to `.claude/` updates `.claude/README.md` in the same commit when it changes what the
  README describes.

## Stack and versions

Pinned on purpose; each "not newer" has a reason and a condition to move on.

| What       | Version                                                                                                       | Why                                                                                                                                                          |
| ---------- | ------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Node / npm | 26 / 12                                                                                                       | Node 26 is LTS from 2026-10-28. npm 12 runs install scripts only from `allowScripts` in `package.json`; Node images ship npm 11, so images and CI install 12 |
| TypeScript | 6.0                                                                                                           | 7.0 has no JS API (typescript-eslint, Nest Swagger plugin, Next need it). Move when they support 7                                                           |
| ESLint     | 10                                                                                                            | React/a11y rules from `@eslint-react/eslint-plugin` and `eslint-plugin-jsx-a11y-x`; the classic plugins do not run on 10                                     |
| Prisma     | 7.10                                                                                                          | install as `prisma@7`: npm's `latest` tag points at an 8.0 release candidate                                                                                 |
| api        | NestJS 12, PostgreSQL 18, Redis 8 (ioredis), Temporal (SDK 1.x), pino, socket.io, Sentry, Vitest              |                                                                                                                                                              |
| web        | Next 16, React 19, TanStack Query 5, Zustand 5, zod, SCSS, Base UI, Sentry, Mixpanel, Vitest, Testing Library |                                                                                                                                                              |
| Server     | Docker Compose, nginx + certbot, blue-green deploys                                                           | `deploy/README.md`                                                                                                                                           |

## Commands (from the root)

- `npm ci`: install; also sets git hooks (`core.hooksPath .githooks`).
- `npm run format` / `format:check`: Prettier on the whole repo.
- `npm run lint`: ESLint for root, `api` and `web` (one config, `eslint.config.mjs`).
- `npm run typecheck`, `npm test`, `npm run build`: for every package that has them. `npm test`
  runs the api and web tests at the same time (`scripts/run-parallel.mjs`), each Vitest with half
  the CPUs (two full pools at once were slower than one after the other); each one's output prints
  as one block when it ends, and the run fails if either does.
- `npm run verify`: format check, lint, typecheck, tests and build in one command. The pre-push
  hook and CI run exactly this, so the list of checks lives in one place (root `package.json`).

`verify` covers `api` (lint, typecheck, tests, build), `web` (lint, Stylelint, typecheck, tests,
`next build`), the agents' guard hooks and root `scripts/*.mjs` (lint, `node --test`). Last, after
`build`, `check:web-bundle` (`scripts/check-web-bundle.mjs`) fails when a file under
`web/.next/static` (the browser bundle) contains `x-proxy-secret` (any case) or `PROXY_SECRET`, or
when that directory is missing or empty. Docker must be running for `verify` and
`npm test`: the Vitest project `database` (`api/test/database/`) starts a throwaway PostgreSQL with
Testcontainers (`api/test/support/`), never the development database; without Docker it fails
with a message to start it. The project `unit` (everything else) needs no Docker. `web` tests
(Vitest in jsdom with Testing Library, `web/vitest.config.mts`) sit next to their code as
`web/src/**/*.test.ts(x)` and need no Docker: `npm --prefix web test`.

Before calling a task done: `npm run verify`. Before opening a pull request, also a clean install
the way CI does it (`npm ci` in the root and in each package), then `verify` again.

## Structure

- Root: shared tooling (Prettier, ESLint, commitlint, lint-staged, gitleaks), `.githooks/`,
  `.claude/`, `.mcp.json` (the Mixpanel MCP server, main session only: `.claude/README.md`),
  `specs/`.
- `api/src/<module>/`: controller (thin) → service (logic) → Prisma. Imports go downward only.
  Generated Prisma client in `api/src/generated/` (git-ignored, never edited by hand).
- `api/prisma/`: `schema.prisma` and migrations. CHECK constraints live only in the migrations'
  `migration.sql` (Prisma does not model them); `schema.prisma` notes the rules queries must follow.
- `api/src/seed/`: the demo catalog. Its image columns hold keys, not URLs; the files are in
  `web/public/media/<key>` and web serves them at `/media/<key>`.
- `web/`: `app/` holds routing only and re-exports pages from `src/_pages`. FSD layers in `web/src/`,
  imports only downward: `_app → _pages → widgets → features → entities → shared`. A slice or a
  `shared` segment exposes `index.ts` (browser-safe) and/or `server.ts`, which starts with
  `import 'server-only'`; one with only server-only exports has only `server.ts` (the `fsd` skill).
- `deploy/`: production compose files, nginx, deploy scripts, Ansible (server setup).

## Docker (local development)

- The app runs in Docker: `docker compose up -d --wait` (quick start in `README.md`). Do not run
  api or web natively against the compose services, or two copies end up fighting over ports.
- A second copy in Docker (e.g. a git worktree) needs its own `COMPOSE_PROJECT_NAME` and host
  ports in its `.env` (README, "Вторая копия стека"). `qa-tester` reaches only the ports of these
  two copies (3000/3001/8233 and 4000/4001/8234) and picks its own from `docker compose ps`.
- `.env` (git-ignored, created by `scripts/init-env.sh`) holds local values; every variable is
  listed in `.env.example`. Claude cannot read `.env` (settings deny it) and does not need to.
- Sources are bind-mounted; rebuild an image (`docker compose up -d --build <service>`) only after
  a dependency or config change. After a Prisma schema change:
  `docker compose up -d --build --renew-anon-volumes --wait api temporal-worker`. The generated
  client lives in the image and in each container's anonymous volume: `prisma generate` in a
  `run --rm` container reaches neither the running services nor the next `run`.
- Local database: `docker compose run --rm api npx prisma migrate dev`, then
  `docker compose run --rm api npm run seed:dev` (the demo catalog of `api/src/seed/`). The seed
  only adds rows that are missing, found by natural keys, and never changes existing ones.
- Containers reach each other by service name, never `localhost`; addresses come from compose.
  Startup order uses health checks with `depends_on: service_healthy`, never sleeps.
- `docker compose down -v` and `docker volume rm/prune` delete data; the Bash guard blocks them.
  The owner runs them by hand.

## Conventions

- Files are changed with the Edit and Write tools, never with `sed -i`, `perl`, `python` or other
  scripts: the formatting hook runs and the owner sees each change as a diff.
- `api` is an ESM package: relative imports end in `.js`.
- Configuration comes from validated environment variables (zod schemas), never hard-coded
  addresses; containers reach each other by service name.
- Logging: `api` through the injected pino logger, never `console` (ESLint enforces it).
- `api` errors: every HTTP error answers `{ error: { code, message, details } }` (successful
  responses are the data itself); `details` is `[{ field, code, message }]`, `message` is English,
  at most 50 entries (`MAX_DETAILS`, `common/validation/`) and then one `TOO_MANY_ERRORS` entry that
  counts the rest; a detail's `field` keeps at most 100 characters and its `message` 200. A JSON
  body over `BODY_LIMIT` (at most 1 MB) answers 413 `PAYLOAD_TOO_LARGE`. Only JSON bodies are read
  (Nest's default parsers off, `bodyParser: false`): a route that needs form bodies turns the
  urlencoded parser on with the same limit (spec 0006 F26).
  Codes and their statuses (`ERROR_STATUS`) are `api/src/common/errors/error-codes.ts`; throw
  `AppException` or its subclasses (`common/errors/app.exception.ts`, the status follows from the
  code), and let Prisma errors through: `AppExceptionFilter`
  (`common/filters/`) maps them, with `common/errors/constraint-fields.ts` naming the field of
  each database constraint (a new constraint gets a row there). Path ids use `@UuidParam('id')`
  (`common/pipes/`): `UuidPipe` plus the uuid format in Swagger. Services write references as scalar ids (`brandId`), not nested `connect`,
  so a missing one answers `RELATED_NOT_FOUND`. `/health/*` keep their own format (the deploy
  reads them). `server.ts` and every e2e app whose module provides `ConfigService` are created by
  `createHttpApp()` (`common/http/http-app.ts`): `AppExpressAdapter` (else broken JSON is a plain 400) with `bodyParser: false`, `useRequestContext(app)` (else every route behind the global
  guards answers 500), CORS, the JSON parser with `BODY_LIMIT`, `createValidationPipe()`
  (`common/validation/`) and `TimeoutInterceptor` (a handler slower than `REQUEST_TIMEOUT_MS`, at
  most 30 s, answers 503 `SERVICE_UNAVAILABLE`; its work is not cancelled, its end is logged, and
  only a route's first timeout within a minute goes to Sentry, spec 0006 F29). The timeout starts
  after the global guards; the shared Redis client's `commandTimeout` (1 s) keeps the throttler from
  hanging there, and after a failed command it counts in memory for 10 s (F28). A step the server and the tests share goes into `createHttpApp()`, and no
  e2e spec repeats one; a unit spec of a single piece (the middleware, Swagger metadata) may build
  a bare app. Database e2e get such an app from `createTestApp()` (`test/support/test-app.ts`).
  Node's server timeouts are set only by `server.ts`, after `listen()` (`common/http/server-timeouts.ts`). Swagger error responses: `swagger.ts` adds the
  ones a route's shape implies (body, query, `@UuidParam`, admin, 429/500/503); a route that can
  answer 409 `ALREADY_EXISTS`/`IN_USE` or 400 `RELATED_NOT_FOUND`/`CONSTRAINT_VIOLATION` declares
  them with `@ApiErrors(...)` (`common/errors/`). The OpenAPI document is committed as
  `api/openapi.json`, a snapshot `test/openapi-snapshot.e2e-spec.ts` checks: a route or DTO change
  fails it until `npm --prefix api test -- -u` rewrites it, committed with the change. web's
  `*.contract.test.ts` compare its response schemas with that file through `@/shared/contract`
  (test-only; ESLint refuses it outside `*.test.ts(x)`). Those schemas hold no `.catch()`,
  `.default()` or transforms, and dates stay ISO strings: the check reports all but
  `z.preprocess` and codecs.
- `api` access is closed by default: the global `AccessGuard` (`common/auth/`) answers 401
  `UNAUTHORIZED` on a route that carries neither `@Public()` nor `@AdminOnly()` (per controller or
  route). `test/access-markers.e2e-spec.ts` fails on such a route, on a public route missing from
  its list `PUBLIC_HANDLERS` (a new one is added there on purpose), on `@Public()` inside an
  `@AdminOnly()` controller and on `@AdminOnly()` on a socket handler.
  `@Public()` serves anyone, a wrong token too (catalog reads, `/health/*`, hello, the socket
  gateway); `@AdminOnly()` (writes and every route of users, fitting sessions and generations) lets
  through the principal `admin`, which the request context gives when `X-Admin-Token` equals
  `ADMIN_API_TOKEN` (empty closes them). Both global guards are registered in `AppModule`, the
  throttler first, so a wrong token is counted against that route's limit before it is refused
  (counters are per route, spec 0006 F22). Lists take `PaginationQueryDto` and answer
  `Paginated<T>` (`common/pagination/`).
- `api` socket.io is set up by `SocketIoAdapter` (`realtime/`, used by `server.ts` and the socket
  e2e): CORS for `WEB_ORIGIN` and `maxHttpBufferSize` from `SOCKET_MAX_MESSAGE_BYTES` (64 KB, at
  most 1 MB, spec 0006 F30). A bigger message never reaches the gateway: over WebSocket the server
  closes the connection, over long-polling the request answers 413. nginx does not limit WebSocket
  frames, so this is the only size limit. Clients may not send binary attachments (F31): the
  adapter's parser (`NoAttachmentsDecoder`) takes none and closes the connection; the server's own
  emits may carry binary data. `socket.io-parser` is a direct dependency for that parser; its range
  stays in socket.io's minor line, so `npm ls socket.io-parser` shows one copy.
- `api` rate limit (`throttling/`): `TieredThrottlerGuard` counts a request in one quota tier, each
  with a 1-second and a 60-second limit from `THROTTLE_*` env: `expensive` for a route marked
  `@Expensive()` (a route that starts an AI generation or a photo upload gets it), else `read` for
  GET/HEAD, else `write`. The minute window is checked first, so a client over its minute quota is
  told that wait in `Retry-After` (spec 0006 F23). `@SkipThrottle()` (any form; with no argument it skips every tier) is allowed
  only on the classes in `SKIPPED` of `test/throttle-markers.e2e-spec.ts` (health, the gateway; a new one is
  added there on purpose). A per-route `@Throttle()` names one of its tier's two throttlers
  (`expensive-minute`), not `default`; that test fails on any other name.
- `api` request context (`common/http/request-context.ts`): a middleware ahead of the body parser
  sets the client address, the request id (answered in `X-Request-Id`, on log lines and Sentry
  events) and the principal (`@CurrentPrincipal()`, `common/auth/`). Code reads them with
  `requestContextOf(req)`, never `req.ip` or the headers: `X-Forwarded-For` and `X-Request-Id`
  count only on requests that carry `X-Proxy-Secret` equal to `PROXY_SECRET` (nginx, web) or, while
  it is rotated, to `PROXY_SECRET_NEXT` (api only; rotation in two deploys: `deploy/README.md`).
- `web` calls the api from the server only through `apiFetch` (`@/shared/api/server`): it forwards
  the visitor's address and the request id with `X-Proxy-Secret` (server env `PROXY_SECRET`, never
  `NEXT_PUBLIC_`), so the api's per-client rate limit applies to the visitor and not to the web
  container. A direct `fetch` to the api would put all visitors into one limit. Paths come only
  from `buildPath('/products/:id', { id }, query)` (`@/shared/api`): each param is encoded into one
  segment, and an empty, `.` or `..` param, like a path off the api's origin, is an `ApiError` of
  kind `path` before any request.
- `web` calls the api from the browser only through `clientFetch` (`@/shared/api`): the site's own
  `/api` (no public api address, no cross-origin calls), no secret, a 15 s timeout, the same
  response step and errors as `apiFetch`. In production nginx serves `/api/`; locally `next dev`
  forwards it to `API_URL` (`rewrites()` in `next.config.ts`, development only; the config is in
  the image, so rebuild web after changing it), and all browser calls share the web container's
  quota. With the api stopped that rewrite answers a plain 500, not nginx's 503: the local 503 text
  is checked with a stubbed answer. Queries retry only a network error or a 503, at most twice
  (`shouldRetry`, `_app/providers.tsx`); a request cancelled by its caller is not an error.
- `web` reads every api answer through a zod schema of its entity slice (an extra field is dropped,
  an unknown enum value is an `ApiError` of kind `schema`). Errors show Russian text only through
  `errorText` / `detailText` (`@/shared/api`, `error-text.ts`: one text per api code, a general one
  for the rest; a contract test fails on an `ErrorCode` missing there). Both clients report a
  network error, a timeout, a schema failure, a 5xx or a 401 to Sentry (`report.ts`), one event per
  cause (kind, method, route template, and an `http` answer's status) per 60 s, counted per server
  process or browser tab; other 4xx, 429 and refused paths are not reported. A component that
  catches an error renders it with `errorText` and passes it to `reportFailure` (an `ApiError` is
  already reported, anything else is sent then). A page loads data on the server with `prefetch`
  (`@/shared/api/server`, which returns a failure instead of throwing) into a `HydrationBoundary`,
  and the browser's hooks start from it with the same query key, without a request.
- `/dev/catalog` (`_pages/dev-catalog`) shows the data layer at work; like `/ui-kit` it is
  `noindex`, linked from nowhere and shows only the public catalog. The catalog page spec removes
  it.
- `web` analytics (Mixpanel, spec 0008) go only through `@/shared/analytics`: `track` and
  `useTrackedElement` (a click, and a hover of 500 ms once per element per page view; a page view
  for hovers ends on a path change, seen by `useHoverReset()`, mounted once in the consent gate). Every event,
  its properties and every tracked element are listed in `events.ts`; anything else fails
  `typecheck`. The SDK sends its own page views and, for heatmaps, `$mp_click`-style events, from
  which `strip-attributes.ts` drops element attributes, ids, links and text. Recordings mask all
  text and inputs and block image elements and inline `url(...)` styles, but keep attributes and
  stylesheets as they are: personal data never goes into attributes (`title`, `aria-*`, `alt`,
  `href`, `data-*`) or stylesheets, a fitting photo renders only through `<img>`/`next/image`
  without `priority`/`preload`, and a container of personal data gets the class `mp-block` (not
  recorded). `mixpanel-browser` is imported only by `client.ts`,
  through `import()` (`eslint.config.mjs` fails any other import of the package or its files, except type imports), so nothing loads before consent: `startAnalytics()` loads and inits the SDK
  once per tab and opts it back in after a decline (a no-op with an empty
  `NEXT_PUBLIC_MIXPANEL_TOKEN`, which only images published from `main` have); `stopAnalytics()`
  stops sending and clears the SDK's storage, and with no SDK started in the tab removes the keys
  and IndexedDB databases an earlier one left (`client.ts` lists them; check on an SDK update). A failed SDK load leaves analytics off until the page
  reloads and is not reported to Sentry. Only `AnalyticsGate` (`features/cookie-consent`, mounted
  in `_app/providers.tsx`) calls them, following the visitor's answer in `localStorage`
  (`cookie-consent`, kept 365 days, shared by open tabs; an answer the browser will not store counts
  as a decline until the page reloads); the banner and "Настройки cookies" render only with a token.
- `web` data from the api renders at request time inside `<Suspense>`: the web image must build with
  no api, Redis or database running.
- Every new environment variable goes into `.env.example` with a comment.
- Migrations stay compatible with the previous release: add in one release, remove in a later one.
  A bad migration is fixed by rolling forward.

## Production and deploys

A merge into `main` is the deploy (blue-green for api and web; the Temporal worker is replaced in
place; a changed `infra.yml` service is recreated in place, with an outage). Before the new copy starts, the deploy runs the migrations, then the seed (the demo catalog,
a no-op once loaded); a failure of either stops it, the running copy keeps serving. nginx limits
requests, sockets and requests in progress per client address above the api's own quotas, slow
clients to 10 s, and bodies to 1 MB, and answers 429, 413 and
`/api/`'s 502/504 (as 503) in the api's error format (`deploy/README.md`, "Лимиты nginx"). How deploys, rollbacks and images work: `.claude/rules/deploy.md`, loaded when you work on
deploy, CI, Docker or `scripts/` files, and `deploy/README.md`. Production secrets never pass through the chat;
commands that change the server (`ssh ai-fitting`) need the owner's confirmation.

## Dependencies

- Check a package before adding it (rules in `CONTRIBUTING.md`). Plain `npm ci` must work: never
  `--legacy-peer-deps`. The only peer-range exception is an `overrides` entry in
  `api/package.json` for `@nest-lab/throttler-storage-redis` (declares Nest ≤ 11, runs on 12);
  remove it once a release supports Nest 12. A new exception needs the owner's decision.
- npm 12 blocks install scripts that are not approved. Approve only what needs one
  (`npm install-scripts approve <pkg>`), and say why in the commit.
- ESLint and its plugins live only in the root `package.json`.

## Git

- Commits: `type(scope): subject`, subject lower-case. Types: feat, fix, perf, refactor, style,
  test, docs, build, ci, chore, revert. Scope required: api, web, infra, deploy, ci, deps, docs,
  specs, tooling.
- No `Co-Authored-By` lines in commit messages.
- Hooks: pre-commit (lint-staged, then gitleaks on staged changes), commit-msg (commitlint),
  pre-push (`npm run verify`). Never skip them; the main session's guard blocks `--no-verify`.
- The Bash guard (`.claude/hooks/main-rules.mjs`) blocks data deletion, skipped hooks, force pushes
  and printing secrets; for recursive search use `rg`. Quoted strings and heredocs no shell reads
  are data, so a commit message may mention a blocked command. A real need for a blocked command:
  the owner runs it by hand; a false positive: fix the rule and add a case to `guards.test.mjs`.
- A gitleaks hit is a real secret until proven otherwise: unstage it. Only a value confirmed to be a
  placeholder goes into the `.gitleaks.toml` allowlist, with a description.
- One branch and pull request per phase of `tasks.md`; merged with "Rebase and merge".
  After a merge, start the next branch from a fresh `main`.

@CONTRIBUTING.md
