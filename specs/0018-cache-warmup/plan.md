# 0018 page cache and warm-up on deploy: plan

Status: accepted (2026-10-20); amended 2026-10-20 at the review of PR 1 (§2, §3's key, §4's bound
and pace, §5, §9, §10); amended 2026-10-21 after 0014 deferred the proxy secret's taint (O76);
amended 2026-10-21 at T4 (§1, V19; §2, V20), at T5 (§1, V19; §2, the worker's `REDIS_CACHE_URL`)
and at T6 (§1, V19; §3's handler, V21, V22).

How [spec.md](spec.md) is built. Decisions: [clarifications.md](clarifications.md) (V1–V22).
No new dependencies: web already has `ioredis` (its `package.json`), Next is 16.3.8.

## 1. Pull requests and release order

| PR  | Branch                    | What                                                                                   |
| --- | ------------------------- | -------------------------------------------------------------------------------------- |
| 1   | `docs/0018-cache-warmup`  | spec, clarifications, plan, tasks                                                      |
| 2   | `feat/0018-page-cache`    | the caches' Redis, both memory limits, the page cache, the first-request measurement   |
| 3   | `feat/0018-deploy-warmup` | the warm-up list and its check, the warm-up step, the deploy's time limit, agent rules |
| 4   | `docs/0018-close`         | production checks (AC9, AC14) and the closing                                          |

PR 2 and PR 3 start after spec 0014 is closed (its routes, `sitemap.ts`, `robots.ts`, `/healthz`
and the filter-counts cache are on `main`); only PR 2's T4–T6, which need none of them, are
done before 0014 closes, committed on its branch and not pushed until the pull request opens (V19). PR 2 recreates the infrastructure's Redis (a new
`command`): merged at a quiet time (V12). PR 4 exists because AC14 and AC9's production half are
read from the deploy of PR 3, after its merge (as 0017's PR 3).

## 2. Redis (V4, V10)

- **`deploy/compose/infra.yml`.** A new service `redis-cache` (`redis:8.10.2-trixie`, the same
  image) with `command: redis-server --save '' --appendonly no --maxmemory
${REDIS_CACHE_MAXMEMORY:-128mb} --maxmemory-policy allkeys-lru`, no volume, `mem_limit: 192m`, the
  same health check as `redis`. `redis` gets `--maxmemory ${REDIS_MAXMEMORY:-64mb}
--maxmemory-policy noeviction` and `mem_limit: 128m`, and, like `redis-cache`, `--save ''
--appendonly no` and no volume (V20: a restart loses at most a minute of counters).
- **`deploy.sh`.** `infra up -d --wait postgres redis redis-cache temporal`: a `redis-cache` that
  does not become healthy stops the deploy like the others, the running copy serving (V18).
- **Local `docker-compose.yml`.** The same `redis-cache` (no host port; `REDIS_CACHE_HOST_PORT`
  only if a test needs it), `api` and `web` depend on it healthy.
- **Environment.** `REDIS_CACHE_URL` (`redis://redis-cache:6379`) for api and web in both compose
  files; web's unused `REDIS_URL` is replaced by it at T6, with `server-env.ts`, and the unused
  `getRedis` is removed (V21). The limits
  are infrastructure variables in `.env.example` with comments. The api's schema requires it, so
  every process that validates that environment gets it too: the Temporal worker
  (`deploy/compose/worker.yml`, and locally the shared `x-api-env`, which `s3-init` uses as well),
  though none of them connects to it (added at T5).
- **api.** `ProductFacetsCache` gets its own client (`REDIS_CACHE` token next to `REDIS` in
  `redis/redis.module.ts`, same `commandTimeout: 1000`) from `REDIS_CACHE_URL`; the throttler keeps
  `REDIS`. `/health/ready` keeps checking only `REDIS`: the caches' Redis never blocks readiness
  (V5, 0014 O56). The key `facets:v1:…` does not change; the new Redis starts empty, one recompute.
- **AC7.** With `noeviction`, a full `redis` refuses writes with `OOM`: the throttler's existing
  fallback counts in memory for 10 s (0006 F28). Checked by a database e2e that sets a tiny
  `maxmemory` on its Testcontainers Redis.

## 3. web: page cache (V1–V3, V5, V15)

- **Directive.** Cached reads use `'use cache: remote'`; `next.config.ts` sets
  `cacheHandlers: { remote: <path of the handler> }`. The `default` handler (`'use cache'`, the
  in-memory one) stays unused, so nothing of the build goes to Redis.
- **Handler.** `web/cache-handlers/redis.mjs` (plain ESM next to `next.config.ts`, outside
  `src/`; Next loads it by path, so it cannot go through FSD imports): `get`, `set`,
  `refreshTags`, `getExpiration`, `updateTags` of Next's `CacheHandler`
  (`next/dist/server/lib/cache-handlers/types.d.ts`). Key
  `page-cache:v1:<build id>:<Next's cache key>`, the build id read once from `.next/BUILD_ID`.
  Next's key holds the build id too, but the handler's own prefix keeps AC4 true whatever a later
  Next does with its key: releases never share entries. From T7 Next's key is stored as its
  sha256, and an entry over 1 MB is not stored (V22). Value: the entry's
  fields and its stream as base64, `EX` = the entry's `expire`. `set` awaits the pending entry;
  a `get` for a key whose `set` is in flight waits for it (the interface requires it). No tags are
  used, so `getExpiration` answers 0 and `updateTags` is a no-op.
- **Failure (V5).** `get` never throws (Next turns a throw into a render error): a failed or slow
  command (`commandTimeout` 200 ms) is a miss, logged at most once a minute, then Redis is skipped
  for 10 s; the client is created lazily and skipped while not connected. `set` failures are
  swallowed the same way. The handler's logic is a function over an injected client, tested with
  Vitest in `web/src/shared/page-cache/` (the `.mjs` only wires `ioredis` to it; it imports the
  logic's `handler.mts` through Node's type stripping, V21).
- **Lifetime (V3).** Each cached function calls `cacheLife({ stale: 60, revalidate: n, expire:
3600 })` with `n` from server env `PAGE_CACHE_REVALIDATE_SECONDS` (whole number 1–3600, default 60;
  zod in `server-env.ts`). It is read at run time, not baked into `next.config.ts` (standalone
  serializes the config at build). After `n` s the next request gets the entry and refreshes it in
  the background (AC2); after an hour unused it expires.
- **Which reads (V15).** In the server twins of the entity slices (`entities/*/api/server-queries.ts`
  of spec 0014): `getCategories` (header, sitemap, the warm-up list), `getCategoryBySlug` (under its
  `React.cache`), the first page of products and the filter counts. A query function picks the
  cached variant only for the empty query of a category (no filter, default sort, no `q`, no
  cursor); anything else calls the api as today.
- **No visitor data in the cache (AC3).** A cached function cannot read headers, so it calls a new
  `cachedApiFetch` (`@/shared/api/server`): `apiFetch`'s path, timeout, schema and error steps,
  without the visitor's address, request id or `X-Proxy-Secret`. The api counts it under web's
  own address (V15). Its arguments are the query only. The header's profile, search and session
  stay outside, as now. `PROXY_SECRET` (not tainted, 0014 O76) never reaches a cached
  function's arguments or closure, which Next would serialize into the entry and its key.
- **Build (AC16).** Callers keep `await connection()` before the cached call, inside `<Suspense>`
  (`header-categories.tsx`, the catalog page, `sitemap.ts`), so `next build` calls none of them
  and the image builds with no api or Redis. The handler module connects only on its first `get`.
- **Errors.** A failed api read inside a cached function throws out of it and is not stored; the
  caller's `prefetch` turns it into a failure as today.

## 4. Warm-up (V6–V8)

- **The list.** `web/src/_app/warmup/routes.ts` holds every warm-up route: a static path, or a
  pattern with its source (`/catalog/[slug]` ← every active category, through `getCategories`, at
  most 50, V16; the answer also names how many were left out). `EXCLUDED` holds the routes that are never warmed up, each with its reason:
  `/customer/*` (0017, the user's data), `/ui-kit`, `/dev/*`, `/healthz`, `/healthz/warmup`.
  Warmed up: `/`, `/catalog`, `/catalog/[slug]`, `/catalog/opengraph-image`, `/privacy`,
  `/sitemap.xml`, `/robots.txt`.
- **The check (AC12).** `routes.test.ts` walks `web/app` for `page.tsx` and `route.ts` (and the
  metadata routes `sitemap.ts`, `robots.ts`, `opengraph-image.tsx`), turns each into its route
  pattern and fails on one in neither list, and on an entry of either that no file backs.
- **The addresses.** `app/healthz/warmup/route.ts` (re-exported from `_app/warmup`) answers JSON
  `{ "paths": [...] }`, the routes resolved to addresses at request time (`connection()`). nginx
  answers 404 for `/healthz` and everything under it (`location ^~ /healthz`, extending 0014 T23's
  `location = /healthz`), so it is reached only from inside.
- **The step.** `deploy/scripts/warmup.mjs`, piped into the target's web container:
  `app "$target" "$tag" exec -T web node --input-type=module - < "$here/warmup.mjs"`. It reads the
  list from `http://127.0.0.1:3001/healthz/warmup`, then requests each address twice: a cold pass,
  one page at a time and at most one a second, then a repeated pass, one at a time with no pause
  (it reads the warm cache and barely touches the quota). The cold pass makes about
  three api reads a category page, so 50 categories and the other pages stay under 200 api reads a
  minute, two thirds of the `read` tier's 300, and under its 10 a second (V16). Each request has a
  10 s timeout and the whole step 120 s. It prints one line per address (status, first and
  repeated time in ms) and how many categories were skipped. Any status but 200 (`redirect:
'manual'`, so `/` answers its 307 and is expected as such), a timeout or the budget exceeded
  exits 1 with the address named.
- **Where.** In `deploy.sh` right after the readiness loop, before `switch_to`, so it covers both a
  new version (3b) and a rollback (3a, V6). On failure: the target is stopped (as after a failed
  readiness) and `fail "... warm-up failed: <address>; $active keeps serving"`.
- **Older images.** A rollback to an image from before the list answers 404 at `/healthz/warmup`:
  the step then requests only `/` and logs that the image predates the list (as the seed's
  "predates" skip), so a rollback past this spec stays possible.
- **Not a visitor (AC13).** The requests come from inside the web container (`127.0.0.1`), never
  through nginx, so no visitor's quota is touched; pages forward that address to the api.
- **Tests.** `deploy/scripts/warmup.test.mjs` (`node --test` against a local HTTP server: a 500, a
  slow answer, the budget, a 404 list, the 307). The root `test` and `lint` globs gain
  `deploy/scripts/*.mjs`.
- **CI.** `scripts/ci-deploy-check.sh`: the deploy's log shows a warm-up line for `/catalog` and
  every demo category; a deploy with `WARMUP_EXTRA_PATH=/catalog/no-such` (an address that answers
  404; read only by `warmup.mjs`, documented as a check's knob) stops before the switch and the
  previous copy still serves; the rollback run (step a) shows the warm-up too.

## 5. Measurement (V9, V14, AC14)

- **`scripts/measure-first-request.mjs <base-url> <path>...`** (with its `node --test`, as 0014
  T22's `measure-page-requests.mjs`). For each path, the time of the first request and the median
  of five more, through nginx; prints them and the ratio; exits 0 (the threshold is read by the
  owner, AC14). `cd.yml` runs it after `smoke-test.sh` for `/catalog` and one category;
  `ci-deploy-check.sh` too.
- **Three measurements (V17).** Before PR 2 is merged, the script from its branch runs against
  production right after a deploy: neither cache nor warm-up. PR 2's deploy records the numbers
  with the cache but without the warm-up (a new release's cache is empty, so its first request is
  cold). PR 3's deploy records them with both; AC14's threshold holds there. All three go into
  `tasks.md`'s acceptance record.
- **Render time (V14).** The warm-up's repeated request, from inside the container with the data
  cached, is the render time of each page. After PR 3's deploy the owner decides V14 from those
  numbers; a markup cache, if chosen, is added as tasks then.

## 6. Deploy time limit (V11)

`cd.yml`'s `deploy` job gets `timeout-minutes: 30`: the slowest deploy seen took 12.5 minutes
(a slow GHCR pull, backlog), and the warm-up adds at most 2. GitHub then cancels the job; the ssh
session ends and `deploy.sh` is stopped where it is. Before the switch that leaves the running copy
serving; the step's own risk is §10.

## 7. Rules for agents and people (V8)

- **`CLAUDE.md`** (Conventions, web): the page cache (`'use cache: remote'`, `cachedApiFetch`, no
  visitor data, reads with no filters only, the lifetime) and the warm-up rule: a new page route
  goes into `_app/warmup/routes.ts` or its exclusions with a reason, `routes.test.ts` fails
  otherwise. Production and deploys: the warm-up step and its stop.
- **`.claude/rules/web-pages.md`** (new, `paths: web/app/**, web/src/_pages/**, web/src/_app/**`):
  the same rule for a new page, the cache's rules, and that a product page names its address
  source (for example the first products of each category).
- **`.claude/rules/deploy.md`**: the warm-up step between readiness and the switch, on a rollback
  too, and that a change to it is checked in `ci-deploy-check.sh`.
- **`.claude/README.md`** if the new rule changes what it lists.

## 8. Analytics

None: no page, element or event changes.

## 9. How each criterion is checked

- **AC1.** `qa-tester` on the local stack: ten requests of `/catalog` and of a category from two
  addresses within 60 s; the api's log counts each cached route once.
- **AC2.** Handler test (a stale entry is served and its refresh started); `qa-tester`: a category
  renamed in the database shows by the second request after 60 s.
- **AC3.** `cachedApiFetch` test (no address, request id or secret sent); `qa-tester`: signed-in
  and signed-out profiles on the same page; the stored entries hold only catalog JSON.
- **AC4.** Handler test (the Redis key holds Next's key, so the build id); locally, two `web`
  processes of one build share an entry and a rebuilt image misses.
- **AC5.** Handler test (timeout, the 10 s skip, one log line a minute); `qa-tester` with
  `redis-cache` stopped: pages answer 200 with current data.
- **AC6.** `redis-cli CONFIG GET maxmemory*` locally; a database e2e fills past the limit, keys are
  evicted and writes go on.
- **AC7.** Database e2e: a full `noeviction` Redis, and the throttler still limits (in memory).
- **AC8.** `ci-deploy-check.sh`: the warm-up lines in the deploy log, before "switching nginx".
- **AC9.** `warmup.test.mjs`; `ci-deploy-check.sh` with `WARMUP_EXTRA_PATH`; in production, the log
  of PR 3's deploy.
- **AC10.** `ci-deploy-check.sh`'s rollback run shows the warm-up; `warmup.test.mjs` for the
  failure.
- **AC11.** `routes.test.ts` (the list's entries); `ci-deploy-check.sh`: one warm-up line per demo
  category; `warmup.test.mjs` and a route test for the bound of 50 and the count of skipped ones.
  The api's routes are warmed through the pages (the cached reads land in Redis), not requested
  on their own.
- **AC12.** `routes.test.ts` over a fixture tree with an unknown route.
- **AC13.** Warm-up requests reach web from `127.0.0.1` (web's log) and never nginx (its log).
- **AC14.** `measure-first-request.mjs` in production before PR 2's merge, after PR 2 and after
  PR 3 (V17); the numbers go into the acceptance record.
- **AC15.** `cd.yml` has `timeout-minutes`; read at review (a cancelled run is not provoked in
  production).
- **AC16.** `npm run verify`; the web image builds in CI's Images job with no api or Redis.

## 10. Risks

- **The handler module in standalone.** Next must trace `web/cache-handlers/redis.mjs` and
  `ioredis` into `.next/standalone`; checked first in its task with `next build` and the image.
  If not traced, the Dockerfile copies the file.
- **`cacheLife` with a value from env at run time.** Inline profiles are documented, but a value
  read inside the cached function must not end up in its key; checked by the AC2 test. Fallback: a
  named profile in `next.config.ts` with the default, and the env variable dropped.
- **`'use cache: remote'` with `cacheComponents` and a dynamic caller.** If Next still tries to fill
  it at build, the build hangs for 50 s: checked by `next build` with no api in the first task.
- **Warm-up against the rate limit.** The cold misses share web's `read` quota. The bound of 50
  categories and one page a second keep the step under 200 api reads a minute (V16); a 429 still
  fails the step, so the deploy stops instead of switching.
- **The same quota in normal work.** Each cached key refreshes at most once a minute from web's
  address: about three per category plus two, so tens a minute today. With about 100 categories
  all visited within a minute the refreshes reach the `read` tier's 300; V15 is revisited when the
  active categories pass 50.
- **A flood of filter-count keys.** The case of backlog "Redis memory limit" now fills the caches'
  Redis, whose LRU then evicts page-cache entries too. A page entry then misses once more: there
  are about three per category (V15), so the misses stay far below web's `read` quota, and the
  counters' Redis is untouched.
- **A cancelled deploy after the switch.** If GitHub's limit cancels the job after `switch_to`,
  the worker or the backup job may stay on the old version until the next deploy. The limit (30
  min) is far above a normal deploy, so this is accepted.
- **Two Redis in local development.** One more container for each copy of the stack; the second
  copy of the stack (README) needs no new port.

## 11. Docs closed with the spec

`CLAUDE.md` (Structure, Conventions: web's cache and the warm-up, the filter counts' Redis,
Production and deploys), `README.md` (the caches' Redis in the local stack), `deploy/README.md`
(«Как идёт деплой»: the warm-up step; the two Redis and their limits), `.claude/rules/deploy.md`,
`.claude/rules/web-pages.md`, `.env.example`, `specs/backlog.md`: remove "Page cache in a read-only
image", "Cache warm-up on deploy (issue #41)", "Redis memory limit", "No time limit on the deploy
step" (V13).
