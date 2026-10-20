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
page `/dev/catalog`) by `0007-web-data-layer`; Mixpanel analytics behind a cookie consent banner,
the page `/privacy` and Lamoda's footer by `0008-web-analytics`; attribute values' swatch colour,
the catalog product card, filters and category list, and their sections on `/ui-kit` by
`0009-entity-ui`; Lamoda's header by `0010-web-header`; the S3 bucket, the catalog photos served
from it through nginx, users' files with signed links and their deletion through Temporal by
`0011-s3-storage`; sign-in with Google, sessions, the admin token's removal, user routes that serve
only the signed-in user's own data, account deletion and the header's profile menu by `0013-auth`;
nightly encrypted copies of the database and the bucket, a database copy before a deploy migrates
and the restore procedures by `0012-backups`, whose production checks are a backlog item (all
closed).

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

| What       | Version                                                                                                                                                | Why                                                                                                                                                          |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Node / npm | 26 / 12                                                                                                                                                | Node 26 is LTS from 2026-10-28. npm 12 runs install scripts only from `allowScripts` in `package.json`; Node images ship npm 11, so images and CI install 12 |
| TypeScript | 6.0                                                                                                                                                    | 7.0 has no JS API (typescript-eslint, Nest Swagger plugin, Next need it). Move when they support 7                                                           |
| ESLint     | 10                                                                                                                                                     | React/a11y rules from `@eslint-react/eslint-plugin` and `eslint-plugin-jsx-a11y-x`; the classic plugins do not run on 10                                     |
| Prisma     | 7.10                                                                                                                                                   | install as `prisma@7`: npm's `latest` tag points at an 8.0 release candidate                                                                                 |
| api        | NestJS 12, PostgreSQL 18, Redis 8 (ioredis), Temporal (SDK 1.x), Better Auth 1.7, pino, socket.io, Sentry, Vitest                                      |                                                                                                                                                              |
| web        | Next 16, React 19, TanStack Query 5, Zustand 5, zod, SCSS, Base UI, Better Auth (client, the api's version), Sentry, Mixpanel, Vitest, Testing Library |                                                                                                                                                              |
| Server     | Docker Compose, nginx + certbot, blue-green deploys                                                                                                    | `deploy/README.md`                                                                                                                                           |

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
`web/.next/static` (the browser bundle) contains `x-proxy-secret` (any case), `PROXY_SECRET`,
`S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, `BETTER_AUTH_SECRET`, `GOOGLE_CLIENT_SECRET` or the
backup job's `BACKUP_{READ,WRITE}_{ACCESS_KEY_ID,SECRET_ACCESS_KEY}`, or when that directory is
missing or empty; the one exception is Better Auth's env getter of `BETTER_AUTH_SECRET` in its
browser client, cut out in exactly its shape (spec 0013 N53). Docker must be running for `verify` and
`npm test`: the Vitest project `database` (`api/test/database/`) starts a throwaway PostgreSQL,
SeaweedFS and Temporal with Testcontainers (`api/test/support/`), never the development ones; without Docker it fails
with a message to start it. The project `unit` (everything else) needs no Docker. `web` tests
(Vitest in jsdom with Testing Library, `web/vitest.config.mts`) sit next to their code as
`web/src/**/*.test.ts(x)` and need no Docker: `npm --prefix web test`.

Before calling a task done: `npm run verify`. Before opening a pull request, also a clean install
the way CI does it (`npm ci` in the root and in each package), then `verify` again.

## Structure

- Root: shared tooling (Prettier, ESLint, commitlint, lint-staged, gitleaks), `.githooks/`,
  `.claude/`, `.mcp.json` (the Mixpanel MCP server: the main session and the `analytics` agent's
  four aggregate tools, `.claude/README.md`), `specs/`.
- `api/src/<module>/`: controller (thin) → service (logic) → Prisma. Imports go downward only.
  Generated Prisma client in `api/src/generated/` (git-ignored, never edited by hand).
- `api/prisma/`: `schema.prisma` and migrations. CHECK constraints live only in the migrations'
  `migration.sql` (Prisma does not model them); `schema.prisma` notes the rules queries must follow.
- `api/src/seed/`: the demo catalog. Its image columns hold keys, not URLs; the files are in
  `api/seed-media/<key>`, and the seed uploads the missing ones to the bucket's `media/<key>`
  (served at `/media/<key>`).
- `api/src/storage/`: the S3 bucket (`StorageService`: `put`, `exists`, `deletePrefix`,
  `signedUrl`) and `keys.ts`, the one place object keys are built and checked.
- `api/src/backup/`: the backup job (spec 0012), a plain Node process outside Nest, run as
  `dist/backup/main.js` from the `backup` target of `api/Dockerfile` (image `ai-fitting-backup`):
  a nightly service, `--once`, and `--pre-deploy <tag>` for the deploy. Its object names are
  built only by `backup/keys.ts`.
- `api/scripts/`: development-only scripts, not in the runtime image: `fake-oidc.mjs`, the fake
  Google of the compose service `oidc` and of e2e (spec 0013 N14, N19, N20).
- `web/`: `app/` holds routing only and re-exports pages from `src/_pages`. FSD layers in `web/src/`,
  imports only downward: `_app → _pages → widgets → features → entities → shared`. A slice or a
  `shared` segment exposes `index.ts` (browser-safe) and/or `server.ts`, which starts with
  `import 'server-only'`; one with only server-only exports has only `server.ts` (the `fsd` skill).
  An entity slice's `ui` segment only displays: its components take entity data, the current
  choice (`value`, `checked`), if any, and either callbacks (`onApply`, `onValueChange`,
  `onCheckedChange`) or the links the page builds (`href`,
  `getHref`); they keep no state beyond their own open dropdown, search or unapplied choice, read
  no URL and make no requests (spec 0009 K7). The page that places them owns the filter state, the
  URL and the requests.
- `deploy/`: production compose files, nginx, deploy scripts, Ansible (server setup).

## Docker (local development)

- The app runs in Docker: `docker compose up -d --wait` (quick start in `README.md`). Do not run
  api or web natively against the compose services, or two copies end up fighting over ports.
- A second copy in Docker (e.g. a git worktree) needs its own `COMPOSE_PROJECT_NAME` and host
  ports in its `.env` (README, "Вторая копия стека"). `qa-tester` reaches only the ports of these
  two copies (3000/3001/8233/8333/4010 and 4000/4001/8234/8334/4011) and picks its own from
  `docker compose ps`.
- `.env` (git-ignored, created by `scripts/init-env.sh`) holds local values; every variable is
  listed in `.env.example`. Claude cannot read `.env` (settings deny it) and does not need to.
- Sources are bind-mounted; rebuild an image (`docker compose up -d --build <service>`) only after
  a dependency or config change. After a Prisma schema change:
  `docker compose up -d --build --renew-anon-volumes --wait api temporal-worker s3-init`. The generated
  client lives in the image and in each container's anonymous volume: `prisma generate` in a
  `run --rm` container reaches neither the running services nor the next `run`.
- Local database: `docker compose run --rm api npx prisma migrate dev`, then
  `docker compose run --rm api npm run seed:dev` (the demo catalog of `api/src/seed/`). The seed
  only adds rows that are missing, found by natural keys, and never changes existing ones; then it
  uploads the photos missing from the bucket and never rewrites one that is there.
- Local storage: SeaweedFS (service `s3`, port 8333, bucket `S3_BUCKET`, volume `s3data`) stands in
  for Timeweb's S3; the one-shot `s3-init` (`api/src/storage/dev-setup.ts`) lets anyone read
  `media/*` and expires `tmp/` after a day, and api, the worker and web start after it. Signed links carry `S3_PUBLIC_ENDPOINT`
  (`http://localhost:<S3_HOST_PORT>`), the browser's address of the emulator. `next dev`
  forwards `/media/` to the emulator (`rewrites()` in `next.config.ts`, development only); in
  production nginx answers it. A fresh `s3data` holds no photos until `seed:dev` runs again.
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
  ones a route's shape implies (body, query, `@UuidParam`, `@SignedIn()`/`@Closed()`'s 401, 429/500/503); a route that can
  answer 409 `ALREADY_EXISTS`/`IN_USE` or 400 `RELATED_NOT_FOUND`/`CONSTRAINT_VIOLATION` declares
  them with `@ApiErrors(...)` (`common/errors/`). The OpenAPI document is committed as
  `api/openapi.json`, a snapshot `test/openapi-snapshot.e2e-spec.ts` checks: a route or DTO change
  fails it until `npm --prefix api test -- -u` rewrites it, committed with the change. web's
  `*.contract.test.ts` compare its response schemas with that file through `@/shared/contract`
  (test-only; ESLint refuses it outside `*.test.ts(x)`). Those schemas hold no `.catch()`,
  `.default()` or transforms, and dates stay ISO strings: the check reports all but
  `z.preprocess` and codecs.
- `api` access is closed by default: the global `AccessGuard` (`common/auth/`) answers 401
  `UNAUTHORIZED` on a route that carries none of `@Public()`, `@SignedIn()` and `@Closed()` (per
  controller or route; a route's marker overrides its controller's). `@Public()` serves anyone, a
  broken or expired session cookie too (catalog reads, `/health/*`, hello, the socket gateway);
  `@SignedIn()` lets through the principal `user` (`/me`, the user's own fitting sessions and
  generations: someone else's row answers 404, as a missing one, spec 0013 N8); `@Closed()`
  answers 401 to everyone (catalog writes, other users' routes, writing generations) and stays for
  the tests and a later spec that opens it. `test/access-markers.e2e-spec.ts` fails on a route
  with no marker, on a route missing from its lists `PUBLIC_HANDLERS` and
  `SIGNED_IN_HANDLERS` (a new one is added there on purpose), on `@Public()` under a `@Closed()` or
  `@SignedIn()` controller and on either on a socket handler. There is no admin token (spec 0013
  AC6). Both global guards are registered in `AppModule`, the throttler first, so a refused request
  is counted against that route's limit (counters are per route, spec 0006 F22). Lists take
  `PaginationQueryDto` and answer `Paginated<T>` (`common/pagination/`).
- `api` sign-in (spec 0013): Better Auth (`auth/`) with Google only (locally the fake provider of
  the compose service `oidc`), mounted by `mountAuth()` (from `createHttpApp()`) at `/api/auth`
  as an Express route ahead of Nest's; only the routes in `AUTH_ROUTES` (`auth-routes.ts`) answer,
  anything else there is 404. These routes are the second exception to the error format: their
  answers are Better Auth's `{ code, message }` (N17), except their own rate limit's 429, which
  keeps the api's format (N32); no Nest guard, interceptor or filter sees them. A session is a row
  in `sessions` plus a signed cookie; its signed copy answers without the database for 5 minutes
  (N18), so a sign-out or a deleted user may still pass for that long. Expired `sessions` and
  `verifications` rows are deleted, 1000 per statement, every day at 03:00 Moscow time by the
  Temporal schedule `delete-expired-auth-rows` (workflow `deleteExpiredAuthRows`). The worker
  creates it at start, or brings an existing one to the code's settings at every start; a pause
  set by hand stays (N27, N50). Production needs
  `BETTER_AUTH_SECRET` (32+ letters or digits, not a proxy secret), `GOOGLE_CLIENT_ID` and
  `GOOGLE_CLIENT_SECRET`, and refuses the fake provider's `AUTH_FAKE_OIDC_*` (`assertServerEnv`);
  elsewhere an empty `BETTER_AUTH_SECRET` logs a warning at start (`serverEnvWarnings`, N51).
- `api` socket.io is set up by `SocketIoAdapter` (`realtime/`, used by `server.ts` and the socket
  e2e): CORS for `WEB_ORIGIN` and `maxHttpBufferSize` from `SOCKET_MAX_MESSAGE_BYTES` (64 KB, at
  most 1 MB, spec 0006 F30). A bigger message never reaches the gateway: over WebSocket the server
  closes the connection, over long-polling the request answers 413. nginx does not limit WebSocket
  frames, so this is the only size limit. At the handshake the adapter reads the session cookie
  through the request context's session reader (`SESSION_READER`, one per app, so both share its
  cap, sockets at most 5 of its 20 reads, N42; one read per connection) and puts the principal in
  `socket.data.principal`; a new connection whose `Origin` is not `WEB_ORIGIN` (an exact origin,
  checked at start, N43) is refused (N40), a failed read connects as anonymous, and a sign-out
  does not close an open socket (spec 0013 plan §7, N36). A database socket e2e gets its app from
  `createTestApp({ socketAdapter })`. Clients may not send binary attachments (F31): the adapter's
  parser (`NoAttachmentsDecoder`) takes none and closes the connection; the server's own emits may
  carry binary data. `socket.io-parser` is a direct dependency for that parser; its range
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
  events) and the principal (`@CurrentPrincipal()`, `common/auth/`): `user` from a valid session
  cookie, read by the session reader (`auth/session-reader.ts`; not on `/api/auth`, which reads its
  own), else `anonymous`. A read that fails, takes over its timeout or finds 20 reads in progress
  answers 503 `SERVICE_UNAVAILABLE` (spec 0013 N29). Code reads them with
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
  (`shouldRetry`, `_app/providers.tsx`); a request cancelled by its caller is not an error. The
  one other browser client is Better Auth's (`@/shared/auth`, the site's own `/api/auth`, spec
  0013): its calls go through `callAuth`, and `useSession` (`@/entities/session`) turns a failed
  read into one with `authFailure`, so their failures are `ApiError`s too.
- `web` reads every api answer through a zod schema of its entity slice (an extra field is dropped,
  an unknown enum value is an `ApiError` of kind `schema`). Errors show Russian text only through
  `errorText` / `detailText` (`@/shared/api`, `error-text.ts`: one text per api code, a general one
  for the rest, a table of its own for `/api/auth`, and `signInRedirectText` for a sign-in that
  failed at Google; a contract test fails on an `ErrorCode` missing there). All clients report a
  network error, a timeout, a schema failure, a 5xx or a 401 to Sentry (`report.ts`), one event per
  cause (kind, method, route template, and an `http` answer's status) per 60 s, counted per server
  process or browser tab; other 4xx, 429, refused paths and a status the caller expects
  (`callAuth`'s `acceptStatus`: the 401 of `revoke-sessions`) are not reported. A component that
  catches an error renders it with `errorText` and passes it to `reportFailure` (an `ApiError` is
  already reported, anything else is sent then). A page loads data on the server with `prefetch`
  (`@/shared/api/server`, which returns a failure instead of throwing) into a `HydrationBoundary`,
  and the browser's hooks start from it with the same query key, without a request.
- `web` sign-in (spec 0013): the session is read only in the browser. `apiFetch` forwards no
  cookies, so no page reads user data on the server (the first one that does adds it, backlog).
  `authClient` (`@/shared/auth`) is Better Auth's `better-auth/react` client, at the api's exact
  version (N33); its `get-session` read also extends the session (the api never does, N30).
  `useSession()` (`@/entities/session`) parses its answer with the slice's schema and gives
  `pending`, `signed-in` with the user, or `signed-out` with `failed`: true when the read failed or
  did not match, so the session may still be there (a failure after a session was read keeps it).
  `features/auth` holds the sign-in and the sign-outs: `signInWithGoogle(callbackURL)` sends
  `errorCallbackURL` equal to `callbackURL`, which `callbackUrl()` builds from the router's path and
  query (without `error` and `error_description`) only, never from a query parameter, every leading
  run of `/` and `\` cut to one `/` (no open redirect); `signOutEverywhere()` revokes every session,
  then signs out (a 401 of the revoke still signs out). A sign-in that fails at Google comes back to
  its page with Better Auth's `error` code: `LoginModal` opens with `signInRedirectText` (a text of
  its own for `access_denied`, a general one otherwise), and the code and `error_description` leave
  the address, signed in (`DropSignInError`) or not (N54). A code other than `access_denied` is
  reported to Sentry as `SignInFailed` only when the sign-in flag (see analytics) shows a sign-in
  started in this tab, so someone else's link with a made-up `error` reports nothing. The header's profile icon (`widgets/header`, `HeaderProfile`,
  rendered per request inside `<Suspense>` since the modal reads the query) is inert while the session
  loads, opens `LoginModal` signed out (a failed read too) and, signed in, the kit's `Menu`: a circle
  with the first letter of the name (or of the email) and the name or "Профиль" (no email or avatar,
  N6; `user-label.ts`) in a `MenuHeader` with `mp-block`, four inert disabled items that get links
  with their pages' specs, a separator and `SignOutItems` ("Выйти", "Выйти со всех устройств"; a
  failure shows a toast).
- An attribute value's `colorHex` is its swatch colour, `#RRGGBB` (either case) or `null` (an
  empty bordered circle); the DTOs and a CHECK in the migration refuse anything else. web draws it with
  `ColorSwatch`, and an attribute with at least one coloured value is a colour filter
  (`splitFacetAttributes`). The seed never changes existing rows, so a colour of an existing seed
  value is changed by a migration.
- `/dev/catalog` (`_pages/dev-catalog`) shows the data layer at work; like `/ui-kit` it is
  `noindex`, linked from nowhere and shows only the public catalog. The catalog page spec removes
  it.
- `web` analytics (Mixpanel, spec 0008) go only through `@/shared/analytics`: `track` and
  `useTrackedElement` (a click, and a hover of 500 ms once per element per page view; a page view
  for hovers ends on a path change, seen by `useHoverReset()`, mounted once in the consent gate). Every event,
  its properties and every tracked element are listed in `catalog.ts` (`events.ts` derives the
  types from it, spec 0015); anything else fails
  `typecheck`. The SDK sends its own page views and, for heatmaps, `$mp_click`-style events, from
  which `strip-attributes.ts` drops element attributes, ids, links and text. Recordings mask all
  text and inputs and block image elements and inline `url(...)` styles, but keep attributes and
  stylesheets as they are: personal data never goes into attributes (`title`, `aria-*`, `alt`,
  `href`, `data-*`) or stylesheets (the kit's `SearchField`, uncontrolled, keeps typed text and
  its starting query out of attributes, L9), a fitting photo renders only through `<img>`/`next/image`
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
  Sign-in (spec 0013 N13): `client.ts`'s `identify(id, { signedIn })` ties the SDK to the user's id
  only (no email or name), now or at the next start after consent, and with `signedIn` sends
  `Signed In` after it; `reset()` forgets the user. Both are called only by
  `useSignInAnalytics` (`features/auth`, mounted once by the header's profile icon): `identify` on
  every page load with a session, `reset` whenever the session is `signed-out` and not `failed`, so
  every real end (a sign-out here, in another tab or browser, an expiry) forgets the user and a
  failed read does not. An identity left by another user is reset before `identify`. Events, without
  properties: `Login Opened` (the visitor opens the modal; not its opening by itself after a failed sign-in, N56), `Signed In`, `Signed Out` (after either sign-out
  succeeds, before `reset`); tracked elements: "Войти через Google" and the two sign-outs.
  `Signed In` is sent once, on the page a sign-in of this tab came back to: `markSignInStarted()`
  (`features/auth`) puts the time in `sessionStorage` (`sign-in-started`, not an `mp_`/`__mp` key
  the SDK clearing removes) before leaving for Google, and a flag older than 10 minutes counts as
  none (N55). `takeSignInStarted()` takes it once: `useSignInAnalytics` signed in, `LoginModal`
  signed out (a failed read too, so a sign-in whose session read fails on the way back loses its
  `Signed In`, N55), on "Back" from the browser's cache or after a failed start. A sign-in seen
  without consent is not kept: a later consent sends only the identity.
- `web` data from the api renders at request time inside `<Suspense>`: the web image must build with
  no api, Redis or database running.
- `api` storage (spec 0011): one private bucket. The first segment of a key is its class, since
  Timeweb's lifecycle rules match prefixes only: `media/` (the catalog media, no expiry; the
  database keeps the key without `media/`, nginx and the seed add it), `keep/users/<userId>/…`
  (users' photos and generations, no expiry; the database keeps the whole key) and `tmp/` (deleted
  after a day). Keys are built only by `storage/keys.ts`; the server names every private key, and
  a write (of a `@Closed()` route for now) of `fittingProfileImageKey`, `userImageKey` or `resultImageKey` outside the row
  owner's `keep/users/<userId>/` answers 400 `VALIDATION_FAILED` with the detail code `IN_OWNER_FOLDER`
  (`owner-check.ts`; a new user has no folder yet, so any key is refused). Responses carry
  a signed link instead (`*ImageUrl`, `S3_SIGNED_URL_TTL_SECONDS`, 15 min by default), signed only
  for a key in the owner's folder, else `null` and a warning naming the row and the field. Deleting
  a user, a fitting session or a generation commits, then `FileDeletion` starts the Temporal
  workflow `deleteFiles` (id `delete-files-<kind>-<id>`), which clears the folders and retries a
  failed storage request without limit; a folder outside `keys.ts`'s shapes fails at once, and the
  workflow fails after all the other folders are done (M33). A failed start never fails the delete and is logged with the folders.
  `StorageError` carries the operation, S3 code, status and request id, never a key; Sentry keeps no
  storage paths (requests to `S3_ENDPOINT` are cut to method and origin, a failed deletion sends
  only the kind and the id). `REQUEST_TIMEOUT_MS` stays at 6000 or more: a delete may wait up to
  5 s for Temporal. `S3_ACCESS_KEY_ID` alone grants nothing (every signed link carries it),
  but it stays a GitHub secret, is not logged and `check:web-bundle` refuses it;
  `S3_SECRET_ACCESS_KEY` appears in no image, log line or bundle.
- `api` backups (spec 0012): every night at 04:00 Moscow time the job copies the database
  (`pg_dump --format=custom`, stored only after `pg_restore --list` reads it) and the app bucket's
  `media/` and `keep/` (one tar, `tmp/` skipped) into the backup bucket `BACKUP_BUCKET` as
  `daily/<UTC stamp>-<16 random hex>/database.dump.age` and `storage.tar.age`, encrypted with age
  to the owner's public key `BACKUP_AGE_RECIPIENT`. The private key is only in the owner's password
  manager: never on the server, in GitHub or the chat. Everything streams, nothing unencrypted
  touches a disk. The job reads the app bucket with `BACKUP_READ_*` (list, and read `media/*` and
  `keep/*`: a new key class needs that role widened, P26) and writes with `BACKUP_WRITE_*` (upload
  only), never the api's key. Neither can list or read the backup bucket, and log lines show
  `<suffix>` in place of the random part, so a copy is found only by listing with the owner's main
  key (P27). The bucket keeps versions; its lifecycle deletes copies after 7 days. Each nightly run
  checks in with the Sentry monitor `nightly-backup`; `--once` does not. The image's
  `postgresql-client-18` moves together with the `postgres` image (P16). Restoring, returning a
  copy to production (the site stopped, every session deleted, users deleted after the copy
  deleted again, P31) and replacing the age key: `deploy/README.md`, «Бэкапы»; running it locally: `README.md`, «Бэкап локально».
- `web` has no files of its own under `public/`, and its image copies no `public/` (it comes back
  with the first static file). Images from `/media/` skip Next's optimizer (`unoptimized`), or
  `/_next/image` would fetch them from web itself.
- Every new environment variable goes into `.env.example` with a comment.
- Migrations stay compatible with the previous release: add in one release, remove in a later one.
  A bad migration is fixed by rolling forward.

## Production and deploys

A merge into `main` is the deploy (blue-green for api and web; the Temporal worker and the nightly
backup job, `deploy/compose/backup.yml`, are replaced in place; a changed `infra.yml` service is recreated in place, with an outage). After the infrastructure is up, the deploy sets
Temporal's `default` namespace retention to 24 hours (spec 0013 N45, read back by
`ci-deploy-check.sh`). Before the new copy starts, the deploy stores an encrypted database copy in
the backup bucket's `pre-deploy/` if the release brings a migration not yet applied (spec 0012 P3;
a throwaway container of the `ai-fitting-backup` image, `deploy/compose/backup.yml`; a version from
before that image skips it, P24), runs the migrations, then the seed (the demo catalog
and its photos, a no-op once loaded), then fetches one catalog photo from the bucket and through
nginx; a failure of any stops it, the running copy keeps serving. nginx serves `/media/<key>` from
the bucket's `media/<key>` (the bucket lets only the server's address read it, so a new address
needs the policy updated first: `deploy/README.md`, "Хранилище S3"), with a cache, a 404 or 503 in
the api's error format and nothing of the visitor's request passed on. nginx limits
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
- The Bash guard (`.claude/hooks/main-rules.mjs`) blocks data deletion, skipped hooks, force pushes,
  printing secrets and `gh` beyond its own commands, with `gh api` only reading (a path,
  `--paginate`, `--jq`) and a write starting its command so its `ask` rule applies; for recursive search use `rg`. Quoted strings and heredocs no shell reads
  are data, so a commit message may mention a blocked command. A real need for a blocked command:
  the owner runs it by hand; a false positive: fix the rule and add a case to `guards.test.mjs`.
- A gitleaks hit is a real secret until proven otherwise: unstage it. Only a value confirmed to be a
  placeholder goes into the `.gitleaks.toml` allowlist, with a description.
- One branch and pull request per phase of `tasks.md`; merged with "Rebase and merge".
  After a merge, start the next branch from a fresh `main`.
- A review bot reviews a pull request when it opens and again on every push to it, and each run
  costs tokens; a branch with no pull request costs nothing. So a pull request is opened once its
  phase is done, and an open one gets one push per round: every fix of a review, and anything else
  meant for the pull request, is committed first, then pushed together. Review fixes are not pushed
  one by one, and before a push to an open pull request ask the owner whether anything else is
  pending. The one exception: a fix for a failed check of the pull request (CI, a conflict with
  `main`) when nothing else is pending, pushed alone with the owner's OK. A round's fixes are one `fix(...)` commit, outside `tasks.md`; a pushed commit is never
  amended. The bot's reviews are handled with the `apply-review` skill.

@CONTRIBUTING.md
