# Backlog

Known problems that have no spec of their own yet. When a new spec touches an item's area, the
item goes into that spec (its `spec.md` or `plan.md` names it), and the commit that closes it
removes it from this list. Found by the agents' first security audit and trial runs (2026-10-07).

## Images

- **api image size.** The api runtime image is 801 MB (web: 296 MB): it costs about 35 s of the push
  to GHCR in CI and about 20 s of the pull on the server at every deploy (0005 G4). The only
  reduction so far is the Temporal native module trimmed to the image's own platform (0001 T17).
  Find what the production `node_modules` holds and what the runtime does not need.
- **Image tags are rewritten by a re-run.** A re-run of a `main` CI run builds the images again and
  pushes them to GHCR under the same commit tag; CD by hand checks only that the commit was live, not
  which build the tag holds now (0005 G8). A re-run whose Checks or CD fail leaves a never-live
  build under a live tag; a push that stops after api mixes api and web of different attempts. Do
  not publish over an existing tag, or deploy by digest.

## nginx and realtime

- **Connections per address in the firewall.** nginx's limits count a request only once its header
  is read, so one address can open connections that never finish a header or sit idle between
  requests; each lasts at most 10 s (header) or 15 s (keep-alive, spec 0006 F36). A per-address connection limit on 80/443 in the
  server's firewall (`ct count`, `deploy/ansible/base.yml`) closes it; the owner applies it, with
  a way back in case the rule cuts off the site or SSH.
- **Rate limit for web pages.** `/` has no `limit_req` (spec 0006 F37). Add one after the catalog
  pages of 0007: move `/_next/static/` and `/media/` to their own locations, measure how many
  requests a page makes with Next's prefetch, and set the rate above that.
- **HTTP/2.** nginx serves HTTP/1.1 only: with HTTP/2 every reload drops a few requests (spec 0004
  E38). Bringing it back needs nginx to stop reloading in normal work: blue-green switching through
  a DNS name nginx re-resolves (`resolve`) instead of a rewritten upstream and a reload, the
  certificate through a variable in `ssl_certificate` instead of the 6-hour reload, and a template
  reload only when the rendered config changed. The owner weighs the costs: both copies serve for
  up to ~10 s during a switch, and if the name moves by disconnecting the old copy from a network,
  its WebSocket connections break.

## api

- **Email look-alikes.** Users' emails are NFC with no control or format characters (0004 E47),
  but two accounts can still have addresses that look the same: mixed scripts (`ivаn@mail.ru` with
  a Cyrillic `а`), invisible characters outside Cf (variation selectors U+FE00–FE0F, combining
  U+034F, Hangul fillers, U+2800) and full-width or ligature forms that only NFKC folds. Decide
  before sign-up lands: one script per part or a UTS #39 skeleton check, and NFKC; the api rule
  and `users_email_check` change together.
- **IDOR checks with auth (0006 F4).** Once users sign in, every route that reads or changes a
  user's data (users, fitting sessions, generations, photos) checks that the resource belongs to
  the principal (the owner decides the answer for someone else's: 404 or 403). Today these routes
  are admin-only and the admin sees everything; the auth spec owes the checks and their tests.
- **Flaky facets test.** `test/database/product-facets.e2e-spec.ts`, "holds for every listed value,
  and every value with products is listed", takes about 1 s alone but timed out at Vitest's 5 s
  twice in a row in `npm run verify` on the development machine while other work loaded it
  (2026-10-15, spec 0005); the same tests passed before and after. Find what makes it slow under
  load (requests one after another for every value) and give it a time budget or fewer requests.
- **Request headers in the log.** pino-http writes every request header in full (found in 0006
  T4): a client's 9000-character header goes into the log line as is. Node caps a request's
  headers at 16 KB and the throttler caps the requests, so the size is bounded, but the lines carry
  data nobody reads (cookies are redacted, other headers are not). Log only chosen headers
  (`user-agent`, `content-type`, `content-length`, `referer`) through pino-http's `req`
  serializer, keeping the redaction of secrets for the headers that stay.
- **Long writes after a timeout.** A request over `REQUEST_TIMEOUT_MS` answers 503, which tells the
  client to retry, but its handler is not cancelled and may still commit (0006 F11, F29). Today's
  writes are admin writes and fast. The photo upload and generation specs make their expensive
  routes answer at once (start a workflow, 202) or take an idempotency key, so a retry does not run
  the work twice.

## web

- **api call failures in Sentry.** web's server-side calls to the api that fail (api down, a
  timeout, an invalid response, web's own env refused, 0006 F20) are caught by the component, logged
  with `console.error` and replaced by a fallback; nothing reaches Sentry and the page answers 200.
  Report them (once per cause, not per page view) when pages with real data land.
- **How long to wait after a 429.** The api's limit sets `Retry-After` (0006 F23), but web's 429
  text only says "wait a little" (0007 H25), while the minute window can mean up to 60 s. Show the
  wait, or retry after it, once nginx's own 429 (0006 PR 3) is known to carry the header too.
- **Web data layer (spec 0007, next after 0006; 0005 G2).** Typed access to the api of spec 0004,
  with no pages; 0007 adds tasks of its own. Starting point, from 0004 E22, E26–E28 (open to change
  in 0007):
  - a slice in `web/src/entities` per entity (category, brand, product, attribute, user, fitting
    session, generation), with zod schemas written by hand (no code generation, no shared package);
  - catalog entities load data on the server (`apiFetch`) and in the browser (`useQuery` hooks over a
    browser client calling `NEXT_PUBLIC_API_URL`, `/api` in production); users, sessions and
    generations get types only, and the admin token never reaches web; no writes from web;
  - `shared/api` split into an isomorphic `index.ts` (`ApiError` with `code` and `details`,
    `clientFetch`, `paginatedSchema`, the error dictionary) and a server-only `server.ts`
    (`apiFetch`), so browser code never imports `server-only`; a second public entry that the fsd
    rules must allow;
  - Russian text for each api error code, a general text for an unknown one;
  - paths: `web/src/shared/api/api-fetch.ts` accepts any path. Before a path segment comes from user
    input, require one leading `/`, check the resolved origin equals the base and build segments with
    `encodeURIComponent` (a `buildPath` helper for both clients).
  - overlap with 0006 (checked 2026-10-15, while 0006 PR 2 was in progress): 0006 PR 1 is merged
    (`apiFetch` sends `X-Proxy-Secret` and forwards `x-request-id`; web refuses an empty secret in
    production), so 0007 starts from it. Still to land in 0006, already decided there and written
    against by 0007: 401 for a route with neither `@Public()` nor `@AdminOnly()`, catalog reads
    public (T7); quota tiers per visitor, read 10/s and 300/min, shared by the browser client and
    `apiFetch` (T8); 413 `PAYLOAD_TOO_LARGE` and the last `details` entry `TOO_MANY_ERRORS`, one more
    code for the error dictionary (T9); 503 `SERVICE_UNAVAILABLE` after 10 s, above `apiFetch`'s
    5 s (T10); nginx on `/api/` 20 r/s, burst 40 per address, 1 MB bodies, 429 and 413 in the api's
    format (T12, PR 3). CORS for `WEB_ORIGIN` is on already (`api/src/server.ts`); 0006 does not
    touch it. 0007's documents need nothing from 0006; its tasks that read api errors (`ApiError`,
    the error dictionary) start after 0006 PR 2 merges, and the browser client's acceptance in
    production after PR 3. Shared files, rebased by the 0006 F1 rule (the later branch rebases):
    `CLAUDE.md`, `specs/backlog.md`, `.env.example`, `docker-compose.yml`, `deploy/compose/app.yml`.
- **Remove `greeting`.** The home page widget, `entities/greeting`, the api's `/hello` and their
  tests are a bootstrap demo; remove them with the catalog page spec (0004 E29).
- **Page cache in a read-only image.** The web runtime user writes only to `.next/cache`. Next keeps
  regenerated ISR pages and `'use cache'` results with revalidation under `.next/server/app/`, so
  the first such page fails to write them (a warning, cache only in memory, per blue-green copy).
  Before it lands, choose a `cacheHandler` (Redis is already there) or a writable cache path.
- **Cache warm-up on deploy (issue #41).** Before nginx switches to the new copy, `deploy.sh` checks
  only health (`up --wait`, the api's `/health/ready`): no page or catalog route is requested, so the
  first visitors pay for the cold copy (Next loads a page's modules on its first request, the api
  opens its database connections), and a page that fails to render is first seen by a visitor. Add
  a step between readiness and the switch that requests the main pages and the catalog's GET routes
  from the new copy and stops the deploy unless they answer 200. Owner, 2026-10-15: done together
  with the catalog page spec, which brings the caches to warm ("Page cache in a read-only image"
  above, "Cache for filter counts" in "Data and media"); there is nothing to warm in Next's cache or
  Redis before it. Measure the first request to `/` after a deploy against later ones first.

## Server

- **Host hardening check.** Confirm on the server that SSH password login and root login are off,
  and record in `deploy/README.md` that the `deploy` user's membership in the `docker` group is an
  accepted risk.

## Temporal

- **Retry policy of `hello`.** `api/src/temporal/workflows/hello.workflow.ts` sets no retry policy,
  so a failing activity is retried forever. A retry policy change needs no `patched()` (Temporal
  versioning rules), but already scheduled activities keep the old one.
- **Workflow logic tests.** `workflows.spec.ts` only checks that workflows bundle. Testing workflow
  logic needs `@temporalio/testing` (an owner's decision: its test server is downloaded on the first
  run, in CI on every run). A test must not end a workflow with an execution timeout: that hides
  endless retries.
- **SDK version ranges.** `@temporalio/client` is `"1.24"` while the other SDK packages are
  `"^1.24.0"`; align them so all SDK packages move together.
- **Retries of the shared connection at shutdown.** `TemporalClientModule`'s connection keeps the
  SDK's default gRPC retries; a retry still scheduled when the app closes it fires on the closed
  channel and throws "Channel has been shut down" out of a timer (an uncaught exception at SIGTERM
  or in an e2e test). Nothing calls it yet; the first code that starts workflows through `Client`
  needs bounded retries and calls finished (or cancelled) before `close()`.

## Dependencies

- **`npm audit` highs.** The `braces` chain in the root lint tooling (stylelint, Next's ESLint
  plugin) and `deepmerge-ts` / `mysql2` through Prisma in `api`. Check for fixed releases.
- **pg 9 and Prisma transactions.** `@prisma/adapter-pg` sends parallel queries of one transaction
  to one `pg` client; pg 8 queues them with a DeprecationWarning, pg 9 drops the queue. Before
  moving to pg 9, check that the adapter runs them in turn (the list's e2e would fail otherwise).

## Data and media

Left for later specs by `0002-database-schema` (its `clarifications.md` has the decisions).

- **File storage.** Placeholders are static files of web (C9a). Photo upload and generation results
  need real storage (object storage or a server folder), with backups and limits on size and type.
  Deleting a user or a generation deletes its files too (the database cascade of C8 does not reach
  storage), and old photo snapshots of C14 get a retention period. The server names a photo's key
  (e.g. `users/<id>/…`) and writes `users.fitting_profile_image_key` itself; a key from the client
  could point at another user's photo (0004 T13 security review).
- **Colour swatches.** The catalog's colour filter shows a swatch per value; attribute values have no
  colour. Add a nullable `attribute_values.color_hex` (`#RRGGBB`) and its data with the catalog page
  spec; the data goes in a migration, because the seed never changes existing rows (0004 E29).
- **Category tree.** Categories are a flat list (0002 C4); the catalog's left-hand tree is nested
  (0004 E29).
- **Size order.** Sizes are free text, so the filter counts list them by text (`L, M, S, XL`; 0004
  E46); the catalog's size filter needs the clothing order.
- **Cache for filter counts.** Spec 0004 computes the product filter counts on every request, which
  holds for the small demo catalog; cache them (Redis) if the catalog grows. One request runs 7
  queries in parallel, and the api's pg pool has the default 10 connections with no
  `statement_timeout`, so a few slow public requests could hold the whole pool, `/health` included
  (0004 T12 security review): with the cache, set a pool size and a statement timeout from env.
  The browser retries a 503 twice (0007 H24) while the timed-out handler keeps running, so one
  slow visitor can hold three requests' worth of queries.
- **Product list cost.** The sorts of 0004 E14 and the name search scan the whole table: `price`,
  `discount`, `rating` and `created_at` have no indexes, `q` is `ILIKE '%…%'`, and `offset` goes up
  to 2^31, so a deep page sorts everything. Free on the demo catalog; if the catalog grows, cap the
  list's `offset` (e.g. 10 000) and add indexes `(price, id)`, `(created_at, id)`, `(discount, id)`
  and a trigram index on `name` (0004 T11 security review).

## Tests

- **Database specs stay on the helper.** Specs under `api/test/database/` reach a real database
  (0002, C20). An ESLint rule for `api/test/**` forbids `new PrismaClient`, `PrismaPg`,
  `process.env`, `node:fs` and `node:child_process` in specs, so a spec reaches the database only
  through `createTestDatabase()` and cannot point a client at the development database; a bypass
  of the rule gets a test case.
- **Flaky Select test.** `web/src/shared/ui/select/select.test.tsx`, "opens with a click", failed
  once in `npm run verify` (2026-10-15, during 0006 T9) and passed alone 3 times of 3: its helper
  waits for the focus to leave the trigger with `vi.waitFor`'s default 1 s, which a loaded machine
  (api and web tests at once) can miss. Find what moves the focus late, or wait on the list's focus
  instead of a timeout.
