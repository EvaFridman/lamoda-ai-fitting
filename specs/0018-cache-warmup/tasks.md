# 0018 page cache and warm-up on deploy: tasks

Status: done (2026-10-22): all 16 criteria pass (record below). History, not instructions.
Accepted 2026-10-20; amended 2026-10-20 at the review of PR 1 (V17's measurement before
PR 2's merge, T10's bound, T15's three measurements); amended 2026-10-21 at T4 (T4 and T5 before
spec 0014 closes, V19; the backlog item moved to T5, V20), at T5 (no push before the pull
request, V19) and at T6 (T6 before spec 0014 closes too, V19; T7's hashed key and entry limit, V22).

Implements [plan.md](plan.md). 👤 marks a step only the owner can do.

## How the work flows

- One pull request per phase, merged with "Rebase and merge" once CI is green; the next branch
  starts from a fresh `main`.
- PR 2's T4–T6 are done before spec 0014 closes and committed on its branch, which is not
  pushed until the pull request opens (V19); T7 onwards and the pull request start after spec 0014 is closed (its routes,
  `sitemap.ts`, `robots.ts`, `/healthz` and `entities/*/api/server-queries.ts` are on `main`) and
  the branch is rebased on that `main`. If spec 0017 is still open, its `/customer/*` routes join
  T9's exclusions at the rebase that brings them.
- Each task: brief from `spec-finder`, a time estimate, the code, `finish-task`, the owner's OK, one
  commit that ticks its box. A fresh session (or `/clear`) per task.
- `security-reviewer` joins every task that touches compose, `deploy/`, CI, env or `.claude/`; the
  web tasks get `fsd-reviewer`.
- A task that closes a backlog item removes it from `specs/backlog.md` in its commit (V13), and
  brings `CLAUDE.md` in line with what it changes.
- PR 2 recreates the infrastructure's Redis: 👤 merges it at a quiet time (V12).
- The pull request of PR 4 carries `Closes #41` under "Что сделано".

## PR 1 · `docs/0018-cache-warmup` · documents

- [x] **T1. Spec and clarifications.** `spec.md`, `clarifications.md` (V1–V15).
      Check: owner's acceptance of `spec.md`.
      Commit: `docs(specs): add the page cache and warm-up spec and its decisions`
- [x] **T2. Plan.** `plan.md`.
      Check: owner's acceptance of `plan.md`.
      Commit: `docs(specs): add the page cache and warm-up plan`
- [x] **T3. Tasks.** This file.
      Check: owner's acceptance of `tasks.md`.
      Commit: `docs(specs): add the tasks of spec 0018`
- 👤 merges PR 1.

## PR 2 · `feat/0018-page-cache` · the caches' Redis and the page cache

- [x] **T4. The caches' Redis and both memory limits.** `redis-cache` in `deploy/compose/infra.yml`
      and `docker-compose.yml`, `maxmemory` and policies, `mem_limit`s, `REDIS_CACHE_URL` in both
      compose files, the limits in `.env.example`, `deploy.sh`'s `infra up` (plan §2); `README.md`
      and `deploy/README.md` (the two Redis); nothing on disk for `redis` (V20).
      Check: `docker compose up -d --wait`, `redis-cli CONFIG GET maxmemory*` on both;
      `ci-deploy-check.sh` in CI; `npm run verify`.
      Commit: `feat(infra): add a redis for caches and limit both redis' memory`
- [x] **T5. The filter counts in the caches' Redis.** The `REDIS_CACHE` client and
      `REDIS_CACHE_URL` in api's env, `ProductFacetsCache` on it, readiness on `REDIS` only; the
      database e2e of a full `noeviction` Redis and of an evicting one (AC6, AC7); `CLAUDE.md`'s
      filter counts; backlog "Redis memory limit" (V20).
      Check: the facets cache e2e on the new client, the throttler e2e with a full Redis;
      `npm run verify`.
      Commit: `feat(api): keep the filter counts in the caches' redis`
- [x] **T6. The page cache's handler.** The handler's logic in `web/src/shared/page-cache/` with its
      tests (get, set in flight, failure, the 10 s skip, one log a minute), `web/cache-handlers/redis.mjs`,
      `cacheHandlers.remote` in `next.config.ts`, `REDIS_CACHE_URL` and
      `PAGE_CACHE_REVALIDATE_SECONDS` in `server-env.ts` (replacing `REDIS_URL`, which leaves web's
      service in both compose files too), the Dockerfile if
      the module is not traced (plan §3, §10).
      Check: handler tests (AC2's refresh, AC4, AC5); `next build` and the web image with no api or
      Redis (AC16); the handler and `ioredis` are in `.next/standalone`; `npm run verify`.
      Commit: `feat(web): add a redis handler for the page cache`
- [x] **T7. Cached catalog reads.** `cachedApiFetch` (`@/shared/api/server`), the cached variants of
      `getCategories`, `getCategoryBySlug`, the first page of products and the filter counts with
      no filter (V15), `cacheLife` from env; the handler's key hashed and its 1 MB entry limit
      (V22); `CLAUDE.md`'s web conventions (the cache's rules); backlog "Page cache in a read-only
      image".
      Check: `cachedApiFetch` tests (no address, request id or secret); query tests (a filter, a
      sort, `q` or a cursor bypasses the cache); handler tests (the hashed key, an entry over the
      limit not stored); a Redis span in Sentry carries no arguments (V22); `qa-tester`: AC1, AC2,
      AC3, AC5 on the local stack; `npm run verify`.
      Commit: `feat(web): cache the catalog's public reads`
- [x] **T8. The first-request measurement.** `scripts/measure-first-request.mjs` and its `node --test`,
      run by `cd.yml` before `smoke-test.sh` (V25) and by `ci-deploy-check.sh` (plan §5).
      Check: its tests; its output in `ci-deploy-check.sh` in CI; `npm run verify`.
      Commit: `feat(ci): measure the first request after a deploy`
- 👤 Before the merge, with the owner, who picks the moment: the script from PR 2's branch runs
  against production right after the nearest deploy, the first measurement, neither cache nor
  warm-up (V17), kept for the acceptance record; that deploy's smoke test has already requested
  the pages (V25).
- 👤 merges PR 2 at a quiet time; the deploy's measurement (cache, no warm-up) is kept for the
  acceptance record (AC14).

## PR 3 · `feat/0018-deploy-warmup` · the warm-up and the deploy's time limit

- [x] **T9. The warm-up list.** `web/src/_app/warmup/routes.ts` (routes, sources, `EXCLUDED` with
      reasons), `routes.test.ts`, `app/healthz/warmup/route.ts`, nginx's `location ^~ /healthz`
      (plan §4); `CLAUDE.md`'s rule for a new page route.
      Check: `routes.test.ts` (AC11's entries, AC12 over a fixture tree); `/healthz/warmup` locally
      lists every demo category; `ci-deploy-check.sh`: it answers 404 through nginx;
      `npm run verify`.
      Commit: `feat(web): list the routes to warm up on deploy`
- [x] **T10. The warm-up script.** `deploy/scripts/warmup.mjs` and `warmup.test.mjs`; the root `test`
      and `lint` globs gain `deploy/scripts/*.mjs` (plan §4).
      Check: its tests (a 500, a timeout, the budget, a 404 list, the 307, one page a second in the
      cold pass and no pause in the repeated one, the bound of 50 and the skipped count, V16);
      `npm run verify`.
      Commit: `feat(deploy): add the warm-up script`
- [x] **T11. The warm-up step.** `deploy.sh` after readiness and before the switch, the stop and the
      older images' fallback; `WARMUP_EXTRA_PATH`; `ci-deploy-check.sh` (the lines, a stopped
      deploy, the rollback run); `deploy/README.md` «Как идёт деплой»; `.claude/rules/deploy.md`;
      `CLAUDE.md`'s Production and deploys; backlog "Cache warm-up on deploy (issue #41)".
      Check: `ci-deploy-check.sh` in CI (AC8–AC11, AC13); `npm run verify`.
      Commit: `feat(deploy): warm up the new copy before the switch`
- [x] **T12. The deploy's time limit.** `timeout-minutes: 30` on `cd.yml`'s `deploy` job (plan §6);
      `deploy.sh`: `.deploy-state` written after `switch_to` (V29); `ci-deploy-check.sh`: that and
      the lock removed after a closed log; `.claude/rules/deploy.md`; backlog "No time limit on the deploy
      step".
      Check: read at review (AC15); `ci-deploy-check.sh` in CI (V29); `npm run verify`.
      Commit: `ci(deploy): limit the deploy job to 30 minutes and record the state at the switch`
- [x] **T13. The rule for new pages.** `.claude/rules/web-pages.md` (plan §7) and
      `.claude/README.md` if its list of rules changes.
      Check: the rule loads for a file under `web/app` (a new session); `npm run verify`.
      Commit: `docs(tooling): add the rule for new web pages`
- 👤 merges PR 3; the deploy's warm-up lines and measurement (cache and warm-up) are kept.

## PR 4 · `docs/0018-close` · production checks and closing

- [x] **T14. Markup cache: the decision (V14).** The render times from PR 3's warm-up lines and the
      measurements of both deploys, shown to the owner; the decision recorded in
      `clarifications.md`. If the grid of pages with no filters is to be cached, the plan and this
      file are amended with the owner first, or a new spec is opened.
      Check: owner's decision recorded.
      Commit: `docs(specs): record the markup cache decision of spec 0018`
- [x] **T15. Close the spec.** The production checks with the owner: AC14's three measurements (V17),
      AC9 from the deploy log (a failed warm-up, if one happened, or `ci-deploy-check.sh`'s run);
      the acceptance record below; every file gets `Status: done`; `CLAUDE.md` and `README.md`
      checked against what was built.
      Check: every criterion has evidence; `npm run verify`.
      Commit: `docs(specs): close spec 0018`
- 👤 merges PR 4.

## Acceptance record

Production checks on 2026-10-22 on three deploys (V17): the first measurement by hand from the
laptop right after a deploy from `main` before PR 2's merge, whose smoke test had already requested
both pages (V25); the second by `cd.yml` on PR 2's deploy (#99, CI run 39779389158); the third on
PR 3's deploy (#100, `f97cadf`, CI run 39810902384, CD job 119941231883), which also logged the
warm-up. The second and third run on GitHub's runner, far from the server, so their times are
higher than the first's and only the ratios compare. AC8–AC11, AC13 and AC15's lock were read in the log of
`ci-deploy-check.sh` on #100 (CI run 39796021451, job 119883375920). The local criteria rest on
the checks of the tasks named and the tests below. `npm run verify` on the closing commit passed (api 3610 tests, web 3085, guards and scripts 665).

AC14's measurements (first request / median of five later ones, ratio):

| Deploy                          | `/catalog`          | `/catalog/dresses` |
| ------------------------------- | ------------------- | ------------------ |
| neither cache nor warm-up       | 208 / 145 ms, 1.43  | 181 / 140 ms, 1.30 |
| PR 2: the cache, no warm-up     | 1306 / 665 ms, 1.96 | 619 / 628 ms, 0.99 |
| PR 3: the cache and the warm-up | 946 / 944 ms, 1.00  | 733 / 755 ms, 0.97 |

PR 3's warm-up lines in production (13 addresses, 0 categories skipped; first / repeated request
from inside web, the repeated one the render time of V14): `/catalog` 875 / 91 ms, `dresses`
169 / 98, `jeans` 151 / 49, `outerwear` 184 / 46, `t-shirts` 196 / 140, `hoodies` 93 / 50,
`shoes` 88 / 58; every address answered its expected status.

| AC   | Result | Evidence                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| ---- | ------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| AC1  | pass   | Locally: T7's `qa-tester` (ten requests of `/catalog` and of a category from two addresses within 60 s, each cached api route once in the api's log); `server-queries.test.ts` of `entities/category` and `entities/product` (a filter, a sort, `q`, `limit` or a cursor goes as the visitor).                                                                                                                                                                                                     |
| AC2  | pass   | Locally: `handler.test.ts` "still returns an entry past revalidate, with revalidate unchanged (AC2)"; `cached-api-fetch.test.ts` "asks for stale 60, the configured revalidate and an hour"; T7's `qa-tester` (a renamed category by the second request after 60 s).                                                                                                                                                                                                                               |
| AC3  | pass   | Locally: `cached-api-fetch.test.ts` "sends nothing of the visitor and never reads headers()"; `handler.test.ts` "never gives Redis the Next key, which holds the cached function arguments"; T7's `qa-tester` (signed-in and signed-out profiles on one page, the stored entries only catalog JSON).                                                                                                                                                                                               |
| AC4  | pass   | Locally: `handler.test.ts` "keys entries by build id and the sha256 of the Next key", "does not share entries between two builds (AC4)": the key holds no copy's name, so blue and green of one image share it, and a new build never reads an earlier one's. Checked by these tests only, not by plan §9's local run of two processes and a rebuild (V32).                                                                                                                                        |
| AC5  | pass   | Locally: `handler.test.ts` "turns a failed get into a miss and skips Redis for 10 s, then tries again", "logs at most once per 60 s over any number of failures, then again"; `cached-api-fetch.test.ts` `pageCacheOpen`; T7's `qa-tester` with `redis-cache` stopped.                                                                                                                                                                                                                             |
| AC6  | pass   | Locally: `product-facets-cache-eviction.e2e-spec.ts` "stores the counts, evicts the oldest entries when full and keeps answering and writing"; T4's `redis-cli CONFIG GET maxmemory*` (128 MB, `allkeys-lru`).                                                                                                                                                                                                                                                                                     |
| AC7  | pass   | Locally: `throttling-full-redis.e2e-spec.ts` "counts in Redis while it has room, then keeps the limit on the fallback once it is full"; T4's `redis-cli CONFIG GET maxmemory*` (64 MB, `noeviction`).                                                                                                                                                                                                                                                                                              |
| AC8  | pass   | Production: PR 3's deploy logged the 13 warm-up lines above before the switch. CI: `ci-deploy-check.sh`'s first deploy, the lines `warm-up: <path> <status>, first N ms, repeated N ms` before "switching nginx". Locally: `warmup.test.mjs` "requests every address twice and prints a line for each".                                                                                                                                                                                            |
| AC9  | pass   | Production: no warm-up failed on PR 3's deploy, so the stop is read from CI: `ci-deploy-check.sh`'s group "a failed warm-up stops the deploy of 844f960-unwarmed before the switch" logged `deploy: FAILED: warm-up failed: /catalog/no-such (answered 404); stopped blue, green keeps serving`. Locally: `warmup.test.mjs` "stops at a 500 and names the address", "stops at an answer whose body does not end in time", "stops when the step runs past its budget".                              |
| AC10 | pass   | CI: `ci-deploy-check.sh`'s rollback to the running blue logged the 13 warm-up lines before "switching nginx to blue", and its check "blue warmed up /catalog and 6 category pages before the switch". Locally: `warmup.test.mjs` (a failure stops the step with exit 1).                                                                                                                                                                                                                           |
| AC11 | pass   | Production and CI: `/`, `/catalog`, the six demo categories, both social images, `/privacy`, `/sitemap.xml` and `/robots.txt`, "0 categories over the bound skipped". Locally: `routes.test.ts` "warms up the pages a visitor reaches without signing in (AC11)", "resolves the routes to addresses at request time, a page per active category", "requests at most 50 categories and counts the rest (V16)"; `warmup.test.mjs` "warms up 50 categories and prints the count of the skipped ones". |
| AC12 | pass   | Locally: `routes.test.ts` "fails on a new page in neither list", "fails on a route in both lists", "names every route of web/app once, warmed up or excluded, and nothing else" (part of `npm run verify`).                                                                                                                                                                                                                                                                                        |
| AC13 | pass   | CI: `ci-deploy-check.sh` logged "no warm-up request went through nginx" and `/healthz/warmup` from outside answers 404 `ROUTE_NOT_FOUND`; the warm-up runs inside web's container (`docker compose exec`) against `127.0.0.1`.                                                                                                                                                                                                                                                                     |
| AC14 | pass   | Production: the third measurement above, 1.00 and 0.97, under 2.                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| AC15 | pass   | Read at review of #100: `cd.yml`'s `deploy` job has `timeout-minutes: 30`, and `deploy.sh`'s lock and `.deploy-state` keep the running copy (V29; a cancelled run is not provoked in production). CI: `ci-deploy-check.sh`'s check of a deploy cut off from its log ("removed its lock"). Known limit: backlog "A deploy cut off by the time limit may run on".                                                                                                                                    |
| AC16 | pass   | `npm run verify` on the closing commit; the CI of #100 (Images (PR), the web image built with no api, Redis or database running).                                                                                                                                                                                                                                                                                                                                                                  |
