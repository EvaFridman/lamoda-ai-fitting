# 0018 page cache and warm-up on deploy: clarifications

Status: accepted (2026-10-20); amended 2026-10-20 at the plan (V10's figures, V15) and at the
review of PR 1 (V7, V9, V12, V15, V16–V18); amended 2026-10-21 at T4 (V19, V20).

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

**V19. T4 and T5 before spec 0014 closes.** Neither needs 0014's routes: T4 changes only the
infrastructure and T5 only the api's filter-counts cache, which is on `main`. Both are done early,
committed and pushed on `feat/0018-page-cache`, but the pull request is not opened until spec 0014
is closed and the branch is rebased on a `main` with its routes; T6 onwards wait for that too.
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
