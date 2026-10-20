# 0018 page cache and warm-up on deploy

Status: accepted (2026-10-20); amended 2026-10-20 at the plan (V15) and at the review of PR 1
(AC11, AC14).

Issue #41. Decisions: `clarifications.md` (V1–V18).

## Goal

The catalog's public data is read from the api once a minute, not on every page request, from a
cache that both blue-green copies share. Before nginx switches to a new copy, the deploy requests
every public page of that copy: the first visitors after a deploy get warm pages, and a page that
fails to render stops the deploy instead of reaching a visitor.

## In scope

- A page cache in web for the public catalog's server reads with no filters: the header's
  categories, a category by its slug, the first page of products, the filter counts and the
  sitemap's list (V1, V2, V15). Data stays fresh for 60 s, refreshed in the background (V3).
- A Redis of its own for caches, shared by both copies, with a memory limit that evicts old cache
  entries; the filter counts move there. The Redis of the rate-limit counters gets a memory limit
  too and never evicts them (V4, V10).
- Without the caches' Redis the site works as today, reading the api on every request (V5).
- A warm-up step in the deploy, between the new copy's readiness and nginx's switch, and before a
  rollback's switch: it requests every warm-up address and stops the deploy unless each answers 200
  in time (V6, V7).
- A list of warm-up routes in web, with a check that fails on a page that is neither in it nor
  excluded, and a rule for agents and people writing new pages (V8).
- The warm-up's timings in the deploy log, and the first request after a deploy measured against
  later ones, before and after this spec, with the render time of a page whose data is cached
  (V9, V14).
- A time limit on the deploy job (V11).

## Non-goals

- Invalidating the cache on a catalog change: catalog writes stay `@Closed()` and the seed runs before
  the switch; a change by hand shows within the cache's lifetime (V3).
- Caching anything that depends on the visitor: the session, the header's profile, the account pages
  of spec 0017, sign-in.
- Caching page markup; pages still render on every request (V2). The measurement decides whether
  the grid of pages with no filters is cached later (V14).
- Pages that do not exist yet (product pages): they join the warm-up list with their own spec (V8).
- HTTP/2 and the nginx rate limits of spec 0014.

## Acceptance criteria

### Page cache

- **AC1.** Within 60 s, repeated requests for `/catalog` and for a category page, from different
  visitors, read each cached api route at most once (counted in the api's log).
- **AC2.** A change to a category's name in the database shows on its page no later than the second
  request made 60 s or more after the change.
- **AC3.** Nothing in the cache depends on the visitor: a signed-in and a signed-out visitor of the
  same page each get their own header profile, and the cache's entries hold only the public catalog
  data of AC1.
- **AC4.** The two copies of one release share the cache: an entry written by one is read by the
  other. A new release never reads the entries of an earlier one.
- **AC5.** With the caches' Redis stopped, catalog pages answer 200 with current data, and the web
  log reports the failure at most once a minute.

### Redis

- **AC6.** The caches' Redis has a memory limit; once it is full, the oldest cache entries are
  evicted and writes go on. The filter counts are stored there.
- **AC7.** The rate-limit counters' Redis has its own memory limit and never evicts a counter; once
  full, the api's limits keep working as they do with Redis down (spec 0006 F28).

### Warm-up

- **AC8.** Before nginx switches to the new copy, the deploy requests every warm-up address from
  that copy, past nginx, and logs each address with its status and the time of its first and of a
  repeated request.
- **AC9.** A warm-up address that answers anything but 200, or answers too late, stops the deploy:
  the new copy is stopped and the running copy keeps serving the site.
- **AC10.** A rollback to the copy that still runs warms it up the same way before the switch; a
  failure stops the rollback and the current copy keeps serving.
- **AC11.** The warm-up addresses cover `/`, `/catalog`, the page of every active category (up to
  50; the deploy log counts the ones skipped, V16), `/privacy`, `/sitemap.xml` and `/robots.txt`;
  through those pages, the api's GET routes they read are warmed up too. A category added to the
  database is warmed up by the next deploy with no change to the code.
- **AC12.** A page route added under `web/app` that is neither in the warm-up list nor in its
  exclusions fails `npm run verify`.
- **AC13.** Warm-up requests are not counted against any visitor's rate limit.

### Speed

- **AC14.** In production, the first request for `/catalog` and for a category page after a deploy's
  switch takes at most twice the median of five later requests. Three measurements are recorded in
  `tasks.md`: after a deploy with neither cache nor warm-up, after PR 2's (the cache, no warm-up)
  and after PR 3's (both); the threshold holds on the last (V17).

### Deploy and build

- **AC15.** A deploy job that runs past its time limit stops, and the running copy keeps serving.
- **AC16.** `npm run verify` passes, and the web image still builds with no api, Redis or database
  running.

## Owner actions (Claude cannot do them)

- Send the server's memory figures (`free -h`, `docker stats --no-stream`) before the plan sets the
  memory limits (V10; done 2026-10-20).
- Merge the pull request that adds the caches' Redis at a quiet time: it recreates the
  infrastructure's Redis, a short outage (V12).
- Check AC14 on production after the deploys, and AC9's stop on the deploy log.
- Merge the pull requests.

## Assumptions

- Spec 0014 is closed before the code of this spec starts: its routes (`/catalog`,
  `/catalog/[slug]`, `sitemap.ts`, `robots.ts`, `/healthz`) and its filter-counts cache exist.
- Spec 0017's account pages (`/customer/*`) read the user's data in the browser only (0017 U11), so
  they stay out of the cache and out of the warm-up list (V8).
- Catalog writes stay `@Closed()` until a spec opens them; that spec brings invalidation.
- Next 16 keys `'use cache'` entries by the build, so each release starts with an empty cache and
  the warm-up fills it before the switch.
