# 0018 page cache and warm-up on deploy: clarifications

Status: accepted (2026-10-20); amended 2026-10-20 at the plan (V10's figures, V15) and at the
review of PR 1 (V7, V9, V12, V15, V16–V18); amended 2026-10-21 at T4 (V19, V20), at T5 (V19: no push before the pull request) and at T6 (V19: T6 before 0014 too; V21, V22); amended 2026-10-22 at T7 (V23, V24), at T8 (V25) and at the review of PR 2 (V26, V27), at T9 (V28), at T12 (V29), at T13 (V30), at the review of PR 3 (V31) and at T14 (V14 decided).

The owner's decisions for this spec. Ids `V1`, `V2`, … are referred to by the spec, the plan and
code comments. All decisions below: owner, 2026-10-20.

## Scope

**V1. A page cache, not only a warm-up.** Today web reads the api on every request and keeps no
cache (0007 H7, 0014 O21), so a warm-up alone would only load the new copy's modules and open its
database connections. The owner chose to add a page cache too (backlog "Page cache in a read-only
image"), which the warm-up then fills. The owner weighed a warm-up only, with the cache left to a
later spec after a measurement: smaller, but issue #41 asks to warm Next's cache.

**V2. The catalog's public reads are cached, not page markup.** Cached: the server reads of the
public catalog that pages make: the header's categories (every page), a category by its slug, the
first page of products, the filter counts and the sitemap's list. Pages still render on every
request, and nothing that depends on the visitor is cached. The owner weighed caching whole page
segments (the grid, the filters): faster, but stricter rules on what a component may read, and more
changes to spec 0014's code.

**V3. Fresh for 60 s.** A cached read is fresh for 60 s, set by an environment variable. After that
the next request gets the cached answer and refreshes it in the background, so a page waits for the
api only on an empty cache. 60 s matches the filter counts' cache (0014 O18, O49) and the browser's
freshness (0007 H7), so a page and its filter counts never differ by more than a minute. The owner
weighed 5 minutes (more hits, a longer lag behind the counts) and "until the next deploy" (the
catalog changes only by the seed for now, but a change by hand would not show, and opening catalog
writes would need invalidation at once).

**V14. Page markup is cached only if the measurement shows its rendering matters.** V2 keeps
markup out of the cache: the cost a cache removes is the api's and the database's, rendering is
expected to take milliseconds (not measured yet), markup depends on the address (sort, filters,
`?cursor=`, search) and on per-request values a cached segment cannot read (spec 0014 T24's
content security policy carries a nonce per request), and its entries are larger than the data's. V9's measurement, after the page cache is deployed, also records the
render time of `/catalog` and of a category page with the data cached. If rendering is a notable
part of the first request, the grid's segment of pages with no filters is cached too, as a task of
this spec added with the owner or as a spec of its own; otherwise markup stays uncached.

Decided at T14 (owner, 2026-10-22): markup stays uncached. PR 3's deploy (f97cadf) logged, from
inside the new web container with the data cached, a repeated request of 91 ms for `/catalog` and
46–140 ms for the six categories (`/catalog/dresses` 98 ms); the first request of the copy (875 ms
for `/catalog`) is taken by the warm-up before the switch. That deploy's outside measurement
(AC14's third) gave a first request equal to the median: `/catalog` 946 / 944 ms (1.00),
`/catalog/dresses` 733 / 755 ms (0.97). Rendering is no longer a part of the first request that
the switch exposes; a markup cache would only shorten every request by about the render time, at
the cost listed above. The owner weighed caching the grid of pages with no filters (a new spec).

## Redis

**V4. A Redis of its own for caches.** A new service holds the caches only: the page cache and,
moved from the current Redis, the filter counts. It has a memory limit, evicts the least recently
used keys once full and keeps nothing on disk (a lost cache only costs a recompute, 0014 plan §8).
The current Redis keeps the rate-limit counters only, with a memory limit of its own and no
eviction: an evicted counter would let a client past its limit. This also takes backlog "Redis
memory limit", whose case (an anonymous client varying `maxPrice` or `q` to fill Redis with
filter-count keys, 0014 T8's review) then evicts only cache entries, never a counter. The owner weighed one Redis with one limit: simpler, but eviction would reach the
counters, since every key there has a TTL.

**V5. Without the caches' Redis, web works without a cache.** As with the filter counts (0014 O56):
a short timeout, a failure counts as a miss and is logged at most once a minute, then the cache is
skipped for 10 s. Pages read the api directly; readiness does not depend on it. The owner weighed
treating the copy as not ready while that Redis is down.

## Warm-up

**V6. The warm-up stops the deploy, and runs on a rollback too.** The step sits after the new
copy's readiness and before nginx's switch. Any warm-up address that answers anything but 200, or
too late, stops the deploy like a failed migration or photo check: the new copy is stopped, the
running one keeps serving. A rollback to the copy that still runs gets the same step before its
switch: the catalog may have changed and the idle copy may have broken, and the step takes seconds;
a failure stops the rollback. The owner weighed a warning only, and stopping on pages but only
warning on api routes.

**V7. Every active category is warmed up.** The warm-up addresses: `/`, `/catalog`, the page of
every active category read from the api at the step (bounded in number), `/privacy`,
`/sitemap.xml`, `/robots.txt`, and the api's GET routes those pages read (the product list and the
filter counts with no filters for each category), warmed up through the pages. The bound is 50
categories (V16). A category added to the database is warmed up by
the next deploy without a code change. Sign-in and the account pages (spec 0017) are not requested.
The owner weighed a fixed list of addresses kept in `deploy/`.

**V8. Every new page joins the warm-up list or its exclusions.** web holds the list of warm-up
routes; a dynamic route names where its addresses come from (every active category; later, for
example, the first products of a product page). A check, like the api's
`test/access-markers.e2e-spec.ts`, fails `npm run verify` on a page route under `web/app` that is
neither in the list nor in its exclusions (sign-in, the account pages, `/ui-kit`, `/dev/*`), so a new
page, a product page included, cannot be forgotten. The rule is written where agents load it: in
`CLAUDE.md` (web conventions) and in a `.claude/rules/` file loaded for `web/app/**` and `web/src/**`,
and in `.claude/rules/deploy.md` for the deploy side. The owner weighed taking the addresses from
`sitemap.xml`: simpler, but pages outside the sitemap would not be warmed up, and a large catalog
would give thousands of addresses.

**V9. Measured inside the work, with a threshold.** Backlog #41 asks to measure the first request
after a deploy against later ones. The first task of the warm-up's pull request logs, for every
warm-up address, the time of its first and of a repeated request; the numbers show in
`ci-deploy-check.sh` on the runner and in production. Before the warm-up lands, the numbers of a
deploy without it are recorded (three measurements, V17). The criterion (AC14): after a deploy's switch, the first outside
request for `/catalog` and for a category page takes at most twice the median of five later ones.
The owner weighed measuring in production before the plan (the documents would wait for spec 0014's
merge) and no threshold (numbers only).

**V10. The memory limits come from the server.** The owner sends the server's `free -h` and
`docker stats --no-stream` before the plan; the plan sets both Redis limits from them, as
environment variables of the infrastructure. The figures of 2026-10-20: 3.8 GiB in all, 2.5 GiB
available, 2 GiB of swap nearly unused; the current Redis holds about 4 MiB; one copy of api and
web takes about 250 MiB, so a deploy, with both copies up, takes that much more for a while. Chosen:
128 MB for the caches' Redis and 64 MB for the counters' one, each container with room above it for
Redis' own overhead, about 250 MB in all. The owner weighed 256/64 MB (room for a large catalog)
and 64/32 MB.

**V15. Only reads with no filters are cached.** A cached read cannot see the request's headers,
so a miss reaches the api from web's own address, not the visitor's, and every miss shares one
quota of the `read` tier (10 a second, 300 a minute). Cached: the header's categories, a category
by its slug, the first page of products with no filter and the default sort, the filter counts
with no filter, and the sitemap's list; about three keys per category plus two, so misses stay at
tens a minute. A read with a filter, a sort, a search or a cursor goes as today, with the visitor's
address (its filter counts are cached by the api, 0014 O18). The api does not change. The owner
weighed a quota tier of its own for web's cached reads, which would let filtered reads be cached
too: a new rule in the api and in its throttle test, and more trust behind the proxy secret.
Revisited when the active categories pass 50: each key refreshes at most once a minute, so with
about 100 categories all visited within a minute the misses would reach the tier's 300 (review of
PR 1); a tier of its own or a higher limit is then the owner's choice.

## Deploy and delivery

**V11. A time limit on the deploy job.** The warm-up adds to the deploy step, so `cd.yml`'s deploy
job gets a time limit above the slowest normal deploy (backlog "No time limit on the deploy step").
A deploy stopped by it leaves the running copy serving.

**V12. Four pull requests.** The documents; then the caches' Redis, both memory limits and the page
cache, deployed and checked in production on their own; then the warm-up, its measurement and the
time limit; then the closing. The owner first chose three (the closing inside the warm-up's pull
request) and accepted four at the plan: AC14 and AC9's production half are read from the warm-up's
deploy, after its merge (plan §1). The second recreates the infrastructure's Redis, a short
outage, so it is merged at a quiet time. The owner weighed two pull requests (the documents, then all the
code at once): one deploy would change web, the infrastructure and `deploy.sh` together, and the
measurement would first run without the cache.

## Backlog

**V13. Taken by this spec.** "Page cache in a read-only image", "Cache warm-up on deploy
(issue #41)", "Redis memory limit" and "No time limit on the deploy step". Each is removed from
`specs/backlog.md` by the commit that closes it. This takes back 0014 O21, which left the first two
in the backlog until a measurement: V9 makes the measurement part of this spec.

## Added at the review of PR 1

**V16. Up to 50 categories, with room in the quota.** A cold category page makes about three api
reads, and the `read` tier allows 300 a minute. The warm-up requests the pages of at most 50 active
categories, at most one page a second in its cold pass and at most 200 api reads a minute, within
120 s for the whole step; the categories over 50 are not requested, and the log says how many were
skipped. The owner weighed 100 categories warmed in batches by the quota's minute window (the step
up to 4 minutes) and no bound at all.

**V17. Three measurements for AC14.** Before PR 2 is merged, the measurement script from its branch
is run against production right after a deploy (neither cache nor warm-up: plain outside GETs);
then PR 2's deploy (the cache, empty at the switch, no warm-up); then PR 3's (both). The threshold
of AC14 holds on the third. The owner weighed taking PR 2's deploy alone as the baseline.

**V18. A `redis-cache` that does not start stops the deploy.** `deploy.sh` brings it up with
`postgres`, `redis` and `temporal` (`infra up --wait`): infrastructure that fails at a deploy stops
it and the running copy keeps serving. V5 is about serving without that Redis, not about deploying
without it. The owner weighed starting it apart, with a warning only.

## Added at T4

**V19. T4–T6 before spec 0014 closes.** None needs 0014's routes: T4 changes only the
infrastructure, T5 only the api's filter-counts cache, which is on `main`, and T6 only adds the
page cache's handler, which nothing calls until T7 (amended at T6). All three are done early,
committed on `feat/0018-page-cache`, but the pull request is not opened until spec 0014 is closed
and the branch is rebased on a `main` with its routes; T7 onwards wait for that too. The branch is
not pushed before then: its first push is the one that opens the pull request (amended at T5; until
then its commits exist only on the owner's machine).
`ci-deploy-check.sh` first runs the new `redis-cache` when the pull request opens; locally only
`redis` and `redis-cache` are brought up for T4's check. The owner weighed waiting for 0014 with
the whole of PR 2.

**V20. The counters' Redis keeps nothing on disk.** `redis` runs with `--save ''` and
`--appendonly no` and loses its volume: a counter lives at most a minute, so a restart loses at
most a minute of counts, while a snapshot's fork of a full Redis would need up to twice its 64 MB
and could push the container past its 128 MB limit (T4's review). This takes back plan §2's "its
volume stays". The owner weighed a higher `mem_limit` (about 192 MB) and keeping the snapshots,
checked by the memory peak in T5's e2e. The removal of backlog "Redis memory limit" moves from T4
to T5, which takes the filter counts out of this Redis.

## Added at T6

**V21. The handler's logic runs as TypeScript in plain Node; web's own Redis client goes.** Next
imports `web/cache-handlers/redis.mjs` by path, outside the bundle, so it reaches the logic in
`web/src/shared/page-cache/handler.mts` through Node 26's type stripping: that file imports only
types and holds no `server-only`, `@/` alias or enum, and the `.mjs` reads `REDIS_CACHE_URL` from
the environment itself. `web/src/shared/redis/` (`getRedis`, on `REDIS_URL`) is removed: nothing
imported it, and the handler, outside the bundle, has its own client. The owner weighed the logic
as plain `.mjs` with JSDoc types, and keeping `getRedis` pointed at `REDIS_CACHE_URL`.

**V22. A hashed key and a size limit come with T7; an ACL waits in the backlog.** From T6's
security review. Next's cache key holds the cached function's arguments, which Sentry's Redis spans
could record and whose length nothing bounds: T7 stores entries under
`page-cache:v1:<build id>:<sha256 of Next's key>` (as the api's `facets:v1:<sha256>`) and checks
that a Redis span in Sentry carries no arguments; the build id stays in the clear, so AC4 holds.
T7 also stores no entry over a size limit (1 MB), so one large answer cannot evict the rest of the
caches' Redis. An ACL on `redis-cache` (web writes only `page-cache:*`, api only `facets:*`), so
that no other container can plant an entry served to every visitor, goes to the backlog: it needs
access to the internal network first. The owner weighed doing the first two at T6, before anything
calls the cache.

## Added at T7

**V23. A cached read answers its failure as a value, not stored.** Next 16.3 passes an error thrown
inside `'use cache'` through the entry's RSC stream: in production the caller gets a plain `Error`
with a digest, not the `ApiError`, and Next logs it. A category's 404 would then not become `null`
(an error in place of `notFound()`), `errorText` would give only the general text, and
`reportFailure` would send a second Sentry event. So a cached function never throws for a failed
api read: it returns `{ failure }` with the `ApiError`'s fields and calls
`cacheLife({ revalidate: 0, expire: 0 })`, which Next takes as the entry's lifetime (the shortest
wins) and the handler does not store (`expire` 0); the caller rebuilds the `ApiError`, and the rest
goes as today (`callApi` reported it once). This replaces plan §3's "throws out of it". The owner
weighed throwing as planned (those three effects), and on a failure a second, uncached read through
`apiFetch` for the real error (two timeouts, up to 10 s, with the api down, and twice its requests).

**V24. No read of the visitor's choosing, and no read while Redis is skipped, spends web's quota.**
From T7's security review: a cache miss counts under web's own address, one `read` quota for all
visitors (V15). (1) A category by its slug is taken from the cached list of active categories (the
header's entry); a slug not in it (unknown, inactive, created since the list was read, or the list
failed) is read on the visitor's behalf, uncached, as `proxy.ts` does. A cached read by slug would
have let a visitor spend web's quota with made-up slugs that `proxy.ts` lets through (a prefetch
header, a failed check), and kept a deleted category up to the entry's hour. (2) While the handler
skips Redis (down, slow, still connecting) it publishes until when in a process-wide slot of
`globalThis`, and the app reads on the visitor's behalf meanwhile, as before this spec; once the
skip ends, the next read goes through the cache and probes Redis. So V5's "web works without the
cache" holds without turning an outage into one shared quota. The owner weighed, for (1), the list
alone (a new category answers 404 until the list refreshes) and a cached read by slug with misses on
the visitor's behalf (the deleted category stays); for (2), accepting the risk (`redis-cache` is
recreated only by an `infra.yml` change) and an in-memory LRU in the handler. `proxy.ts` passing a
request on after its own check's 429 goes to the backlog. An accepted risk (the second review):
the page cache shares `redis-cache` (`allkeys-lru`) with the api's filter counts, whose keys follow
the visitor's `q`, so a flood of searches from many addresses could evict the page cache's entries
while Redis stays up, and their misses would count under web's address. It needs on the order of
the whole 128 MB of counts a minute, and the pages' keys are read on every view; a memory of its
own for the page cache was weighed.

## Added at T8

**V25. The measurement goes before the smoke test.** `smoke-test.sh` requests `/catalog` and
`/catalog/dresses`, and `deploy.sh` requests no page, so the smoke test is the first visitor after
a switch: a measurement after it, as plan §5 had it, sees Next's modules loaded and, from PR 2 on,
the page cache filled. So `cd.yml` and `ci-deploy-check.sh` (after its first deploy) run
`measure-first-request.mjs` right after `deploy.sh` and before `smoke-test.sh`; it exits 0 whatever
it measures, so a broken site is still caught by the smoke test that follows. V17's first
measurement is run by hand after a deploy from `main`, whose smoke test has already run: the
record says so. The owner weighed a category the smoke test does not request (`/catalog` would
stay warm) and keeping the plan's order (AC14's numbers lowered by the smoke test's warm-up).

## Added at the review of PR 2

**V26. The request id through a page goes by a sort.** `ci-deploy-check.sh` checked that a request
to `/catalog/dresses` leaves nginx's id on two of the api's lines, web's proxy (the request's
headers) and the page (`headers()`), so both send the proxy secret (spec 0006 F10). Since T7 that
page reads its category, products and counts from the page cache, and only the proxy's read goes
on the visitor's behalf. The check takes `/catalog/dresses?sort=price_asc`: a sort bypasses the
cache (V15), so the page's batch is read as the visitor again and both lines stay checked. The
check requires both routes on lines with nginx's id, not a count of lines: while the page cache is
skipped the page reads more as the visitor and would make up a missing line. The owner weighed one
line through the plain page (the page's path unchecked). An accepted risk: when the cached list of
active categories fails during the check, the page reads the category by its slug itself, and that
line would hide a proxy that sends no secret; a marker on the proxy's read was weighed.

**V27. The measurement does not check certificates.** `measure-first-request.mjs` keeps
`rejectUnauthorized: false` against production too, as `smoke-test.sh -k`: it sends nothing secret,
a forged answer would only change the numbers the owner reads, and TLS is checked apart. The owner
weighed checking certificates for any host but `localhost`.

## Added at T9

**V28. The Twitter image is warmed up; nothing under `/healthz` passes `proxy.ts`.** The plan's
lists missed `app/catalog/twitter-image.tsx`, and the check fails on a route in neither: it is
warmed up as the Open Graph image is, the same static picture link previews ask for (the owner
weighed excluding it as a copy). `/dev/*` leaves `EXCLUDED`: no file backs it, and the check fails
on such an entry; a development page adds it back. `proxy.ts`'s matcher skips `/healthz` and
everything under it, as nginx does (`location = /healthz` and `^~ /healthz/`, so `/healthzx` stays
a page), so the list answers with no policy or category lookup. The answer is
`{ "paths": [...], "skipped": <count> }`, its categories read from the api past the page cache: a
copy rolled back to may hold an hour-old list (V7, found at T9's review).

## Added at T12

**V29. A deploy cut by the time limit leaves a state the next one can trust.** T12's review found
plan §6 and §10 wrong: `deploy.sh` wrote `.deploy-state` only after the worker and the backup job,
so a job cancelled after the switch left nginx on the new colour and the state on the old one, and
the next deploy recreated (or, failing, stopped) the copy that serves the site. The owner chose to
fix it in T12: `.deploy-state` is written right after `switch_to` (the old one put back when the
deploy switches back, once nginx serves the old colour; written by a rename; the switch's output
held until the state is written). The ssh session runs with no pty, so the server's `deploy.sh`
gets no signal: it dies of SIGPIPE at its next log line, and a command in progress runs on until it
writes to the log. The
review feared the lock stays then; tried on bash 5.1, 5.2 (Ubuntu 22.04, 24.04) and 5.3, bash runs
the EXIT trap on SIGPIPE and SIGTERM, so `.deploy-lock` goes, and a `trap … PIPE` of its own made
bash 5.3 skip the EXIT trap: none is added, and `ci-deploy-check.sh` checks that the lock goes.
Not taken: `ssh -tt` (it merges stderr into stdout and adds `\r` to the log) and a manual procedure
in place of the fix.

## Added at T13

**V30. The rule for new pages also loads where cached reads are written.** T13's reviews found
plan §7's `paths` (`web/app/**`, `web/src/_pages/**`, `web/src/_app/**`) narrower than V8
(`web/app/**` and `web/src/**`): the rule's page cache section describes code in the entity slices'
`api` segment and in `shared/api`, where it did not load. The owner chose to add
`web/src/entities/*/api/**` and `web/src/shared/api/**` (the segment, not `server-queries.ts`, since
a new slice may lay its reads out otherwise). Not taken: plan §7's paths alone (`CLAUDE.md` holds
the same rules) and `web/src/**`, which loads the rule for the kit, the features and the entities'
UI, where it has nothing to say.

## Added at the review of PR 3

**V31. The switch's output is printed when the state cannot be written.** The review of PR 3 found
that V29's held output of `switch_to` (nginx's reload notice) was printed only after the state was
written: when `write_state` failed, both `fail`s of that branch ended the deploy without it, so the
log lost what nginx said at the switch. The owner chose to print it at the top of the failure
branch, before the switch back. Fixed in PR 4, not PR 3, to spare a review run.
