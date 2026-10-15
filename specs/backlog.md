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
- **Every deploy pulls `node_modules` again.** `images.yml` builds with no layer cache, so every
  build makes new layers from `RUN npm install -g npm` on, even when nothing in them changed: 95459a3
  (docs only) and 614761d share only the node base layers, and the server pulls the 158.5 MB
  `node_modules` layer of api at every deploy. On 2026-10-15 the pull from GHCR ran at about
  0.25 MB/s: api took 12 min of a 12.5 min deploy step (16:38 deploy: 9 min). A layer cache
  (`cache-from`/`cache-to`, e.g. `type=gha`) keeps unchanged layers' digests, so a deploy pulls
  only `dist`. Check that a cached layer still gets the base image's security updates (a base image
  bump changes its digest).
- **No time limit on the deploy step.** `cd.yml` sets no `timeout-minutes`, so a deploy stuck in a
  pull or in `up --wait` holds the run, and the deploys queued behind it, for GitHub's 6 hours. Set
  a limit above the slowest normal deploy; the running copy keeps serving when it stops.

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

- **How long to wait after a 429.** The api's limit sets `Retry-After` (0006 F23), but web's 429
  text only says "wait a little" (0007 H25), while the minute window can mean up to 60 s. Show the
  wait, or retry after it, when the header is there; nginx's own 429 has none (0006 F32) and keeps
  the "wait a little" text.
- **Texts of new validation rules.** web has a Russian text per `details` code, but the OpenAPI
  document types that code as a plain string, so a new api rule gets the general text unnoticed
  (0007 H28). With the first form, add an api test comparing the rule names its DTOs use with a
  list web's texts are checked against.
- **Taint the proxy secret.** `check:web-bundle` finds the names of `PROXY_SECRET` in the browser
  bundle, but a server component that passes `getServerEnv()` (or the value) to a client component
  puts the secret into the page's HTML at request time (0007 H32). Taint it in `server-env.ts`
  (`experimental_taintUniqueValue`, Next's `experimental.taint`), so such a render fails. Take it
  with the first real page, when server components start passing props to client ones; check first
  that the flag works on the Next version then in use.
- **Footer links.** The footer copies Lamoda's items, but only the personal data policy has a page
  (0008 J22): each other item becomes a link when its page appears. The list is
  `widgets/footer/config/items.ts`.
- **Full CSP for web.** nginx sends only `frame-ancestors 'none'`; a full Content Security Policy
  comes with web's pages (0006 F9). It must allow Mixpanel: `connect-src https://api-eu.mixpanel.com`
  (0008 J12). The SDK's recorder may start a worker from a `blob:` URL and falls back to a `data:`
  one; with `record_canvas: false` it probably starts none. Check in a browser for CSP violations
  before adding `worker-src blob:`, and never allow `data:` there.
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
- **Product card link.** `CatalogProductCard` (0009 K15) takes its link address as a prop: no
  product page exists yet. The spec that places the card on a page passes the address; once the
  product page exists, its spec decides whether the card builds the address itself.
- **Mobile filters.** The kit's filters and the catalog filters of 0009 are desktop dropdowns only
  (0003 D9, 0009 K16); on a phone Lamoda shows them in a bottom sheet. Build it with the catalog
  page spec.

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
  once in `npm run verify` (2026-10-15, during 0006 T9; again in 0007 T11, the same day) and passed
  alone 3 times of 3 each time: its helper
  waits for the focus to leave the trigger with `vi.waitFor`'s default 1 s, which a loaded machine
  (api and web tests at once) can miss. Find what moves the focus late, or wait on the list's focus
  instead of a timeout.
- **Flaky handoff test.** `web/src/_pages/dev-catalog/ui/catalog-handoff.test.tsx`, "shows a failed
  facets prefetch", failed in `npm run verify` (2026-10-15, 0007 T15; again 2026-10-16, 0009 T5:
  "Found multiple elements with the role alert") and passed alone 5 times of 5 each time. The
  failed prefetch leaves the browser part
  to request facets itself; the stub answers it with the same 404, and when that lands before the
  check a second alert is on the page while the test expects one. Assert on the server's alert by
  its text (or wait for both) instead of `getByRole('alert')`.
- **Database specs time out under load.** During 0009 T5 (2026-10-16), two `npm run verify` runs
  of an unchanged api failed on time limits alone, then passed: once the `beforeAll` of several
  `api/test/database/` specs (access, brands, categories, …) missed Vitest's 10 s hook timeout,
  once `ai-generations.e2e-spec.ts`, "leaves exactly one of the sent sets after parallel PATCHes
  of productIds" (8 rounds), missed the 5 s test timeout while a browser QA run shared the
  machine (the api run took 53 s instead of about 25 s). Like the facets test above: find what
  makes the app start and the race test slow under load, and give them a time budget that holds
  on a loaded machine, or fewer rounds.
