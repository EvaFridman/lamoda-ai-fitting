# Backlog

Known problems that have no spec of their own yet. When a new spec touches an item's area, the
item goes into that spec (its `spec.md` or `plan.md` names it), and the commit that closes it
removes it from this list. Found by the agents' first security audit and trial runs (2026-10-07).

## CI

- **Image job permissions.** The `images` job in `.github/workflows/ci.yml` also runs for pull
  requests with `packages: write`, and `actions/checkout` keeps the token for later steps. Publish
  images from a separate job that runs only on a push to `main`; set `persist-credentials: false`
  on checkouts.

## nginx and realtime

- **WebSocket connections per client.** `/socket.io/` holds connections for an hour and nothing
  limits how many one client opens. Add a per-address connection limit (`limit_conn`) and review
  `worker_connections`.
- **HTTP/2.** nginx serves HTTP/1.1 only: with HTTP/2 every reload drops a few requests (spec 0004
  E38). Bringing it back needs nginx to stop reloading in normal work: blue-green switching through
  a DNS name nginx re-resolves (`resolve`) instead of a rewritten upstream and a reload, the
  certificate through a variable in `ssl_certificate` instead of the 6-hour reload, and a template
  reload only when the rendered config changed. The owner weighs the costs: both copies serve for
  up to ~10 s during a switch, and if the name moves by disconnecting the old copy from a network,
  its WebSocket connections break.
- **Security headers.** Add `Content-Security-Policy: frame-ancestors 'none'` and
  `X-Content-Type-Options: nosniff` before login or photo upload land.
- **Request rate limit at the edge.** The api's `ThrottlerGuard` is a Nest guard, so it runs only
  on matched routes: requests to unknown routes are never counted, and each one still writes two
  log lines (the request and the filter's warn). nginx has no `limit_req`. Add one for `/api/` and
  `/socket.io/`; the owner decides the rate and burst per address, how visitors behind one NAT are
  treated, a separate limit for writes, and how it sits with the api's own limit.

## api

- **Cap on validation details.** With `forbidNonWhitelisted`, every unknown field of a body is one
  entry of `details`: an entry is about 12 times the size of its key, so a 100 KB body of short
  keys answers about 1.2 MB. Cap `details` (e.g. 50 entries, with the count of the rest); it changes
  the error contract that web's error handling (spec 0005) reads, so decide it there.

## web

- **Web data layer (spec 0005, next after 0004).** Typed access to the api of spec 0004, with no
  pages; 0005 adds tasks of its own. Starting point, from 0004 E22, E26–E28 (open to change in
  0005):
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
- **Remove `greeting`.** The home page widget, `entities/greeting`, the api's `/hello` and their
  tests are a bootstrap demo; remove them with the catalog page spec (0004 E29).
- **Page cache in a read-only image.** The web runtime user writes only to `.next/cache`. Next keeps
  regenerated ISR pages and `'use cache'` results with revalidation under `.next/server/app/`, so
  the first such page fails to write them (a warning, cache only in memory, per blue-green copy).
  Before it lands, choose a `cacheHandler` (Redis is already there) or a writable cache path.

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

## Data and media

Left for later specs by `0002-database-schema` (its `clarifications.md` has the decisions).

- **Auth input rules (`0003-auth`).** Normalize phone input (`8 …`, `+7 …`, spaces, brackets,
  hyphens) to `+79XXXXXXXXX`; trim and lower-case email; require age 14 or more at sign-up. The
  database rejects anything else (C12), so without these rules valid users get database errors.
- **File storage.** Placeholders are static files of web (C9a). Photo upload and generation results
  need real storage (object storage or a server folder), with backups and limits on size and type.
  Deleting a user or a generation deletes its files too (the database cascade of C8 does not reach
  storage), and old photo snapshots of C14 get a retention period.
- **Colour swatches.** The catalog's colour filter shows a swatch per value; attribute values have no
  colour. Add a nullable `attribute_values.color_hex` (`#RRGGBB`) and its data with the catalog page
  spec; the data goes in a migration, because the seed never changes existing rows (0004 E29).
- **Category tree.** Categories are a flat list (0002 C4); the catalog's left-hand tree is nested
  (0004 E29).
- **Cache for filter counts.** Spec 0004 computes the product filter counts on every request, which
  holds for the small demo catalog; cache them (Redis) if the catalog grows.

## Tests

- **Database specs stay on the helper.** Specs under `api/test/database/` reach a real database
  (0002, C20). An ESLint rule for `api/test/**` forbids `new PrismaClient`, `PrismaPg`,
  `process.env`, `node:fs` and `node:child_process` in specs, so a spec reaches the database only
  through `createTestDatabase()` and cannot point a client at the development database; a bypass
  of the rule gets a test case.
