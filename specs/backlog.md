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
  pages of 0007: move `/_next/static/` to its own location (`/media/` has one since spec 0011, with
  no `limit_req` yet; it comes first: nginx caches a missing key's 404 per key, so random keys each
  reach the bucket, held back only by the connection limit), measure how many requests a page makes with Next's prefetch, and set the rate
  above that.
- **HTTP/2.** nginx serves HTTP/1.1 only: with HTTP/2 every reload drops a few requests (spec 0004
  E38). Bringing it back needs nginx to stop reloading in normal work: blue-green switching through
  a DNS name nginx re-resolves (`resolve`) instead of a rewritten upstream and a reload, the
  certificate through a variable in `ssl_certificate` instead of the 6-hour reload, and a template
  reload only when the rendered config changed. The owner weighs the costs: both copies serve for
  up to ~10 s during a switch, and if the name moves by disconnecting the old copy from a network,
  its WebSocket connections break.
- **Encryption headers of `/media/`.** nginx hides the storage's headers by a list (0011 M39);
  the `x-amz-server-side-encryption-*` family beyond the bare one (the KMS key id, customer key
  algorithm and MD5, bucket key) is not in it: names that long need
  `proxy_headers_hash_bucket_size 128` (at 64 nginx does not start). They appear only if the
  bucket gets encryption; add both before that, checked by `ci-deploy-check.sh`.
- **A revoked session on an open socket.** The socket reads its user once, at the handshake; a
  sign-out, a "sign out everywhere" or a deleted user does not close an open socket (0013 N36), and
  one connected while the session reads were full stays anonymous until it reconnects (N42).
  Harmless while no handler reads the user; the generations spec decides how long that trust lasts
  (close on revoke, read again on demand, or refuse for a retry).
- **CONNECT packets per connection.** The session is read once per connection, but every CONNECT
  a client sends while that read runs (up to 2 s) still becomes a socket, held until the
  connection closes (0013 N41). Limit the sockets of one connection with the first real socket
  feature (0006 F8).

## api

- **Email look-alikes.** Users' emails are NFC with no control or format characters (0004 E47),
  but two accounts can still have addresses that look the same: mixed scripts (`ivаn@mail.ru` with
  a Cyrillic `а`), invisible characters outside Cf (variation selectors U+FE00–FE0F, combining
  U+034F, Hangul fillers, U+2800) and full-width or ligature forms that only NFKC folds. Decide
  before sign-up lands: one script per part or a UTS #39 skeleton check, and NFKC; the api rule
  and `users_email_check` change together.
- **Other ways to sign in.** Sign-in is Google only (0013 N2). Yandex ID, VK ID, Google One Tap,
  passkeys and email codes each come with their own decision; Better Auth's `AUTH_ROUTES` list
  (`auth/auth-routes.ts`) opens their routes.
- **Guests.** Trying on needs a Google sign-in (0013 N9). Guests (Better Auth's anonymous sign-in,
  fewer generations, deleted after 30 idle days) were dropped: a guest who later signs in into an
  existing account needs their files copied between owners' folders (0011 M7), and a guest who
  becomes a new account is not something Better Auth supports, so it needs custom rewiring of its
  users. Comes back only with an answer to both.
- **Drop `sessions.user_agent`.** Sessions keep no User-Agent (0013 N34): the column is always
  empty. Drop it in a release after 0013's (migrations stay compatible with the previous release).
- **Old fitting routes.** `/fitting-sessions` (reads and deletes; its writes close in 0019 A21)
  and `/ai-generations` stay next to 0019's `/fittings` and `/me/photos`, which the site uses.
  Remove them, their DTOs, tests and `openapi.json` entries once 0019 is closed, and move the
  `MAX_GENERATION_PRODUCTS` limit with them.
- **The other models of 0016 S7.** 0019 connects OpenAI's GPT-Image-2 only (0019 A4, A17); 0016
  S7 names Gemini's Nano Banana and Seedream as well, each replaceable by another. Add a second
  provider behind the `ImageModel` adapter (Google's API, or an intermediary such as fal.ai, whose
  queue and signed webhook were in 0019's first plan) once the pilot of 0016 wants the
  comparison, with a fallback on a technical failure of the primary model.
- **Fitting sessions per user.** A signed-in user can create fitting sessions within the `write`
  quota, and nothing removes archived ones (0013 N39). The generations spec, which defines how
  sessions are used, sets a per-user limit.
- **Request headers in the log.** pino-http writes every request header in full (found in 0006
  T4): a client's 9000-character header goes into the log line as is. Node caps a request's
  headers at 16 KB and the throttler caps the requests, so the size is bounded, but the lines carry
  data nobody reads (cookies are redacted, other headers are not). Log only chosen headers
  (`user-agent`, `content-type`, `content-length`, `referer`) through pino-http's `req`
  serializer, keeping the redaction of secrets for the headers that stay.
- **Long writes after a timeout.** A request over `REQUEST_TIMEOUT_MS` answers 503, which tells the
  client to retry, but its handler is not cancelled and may still commit (0006 F11, F29). Today's
  writes are a signed-in user's own rows and fast. The photo upload and generation specs make their expensive
  routes answer at once (start a workflow, 202) or take an idempotency key, so a retry does not run
  the work twice.
- **Bodies that are not JSON.** Only JSON bodies are read (0006 F26): a body sent with another
  `Content-Type` (`text/plain`, a form) reaches validation as `{}`, so a route whose fields are all
  optional (`PATCH /me`, `PATCH /fitting-sessions/:id`) answers 200 unchanged and the data is lost
  silently (found in 0017 T6). web always sends JSON. Answer a request that carries a body with
  another type 415 in the api's error format, in `createHttpApp()`. It goes into the next spec that
  works on the api's infrastructure, not left at the end of this list: a silent loss of data
  (owner's decision at the review of 0017 PR 2).

## web

- **The session cookie in `apiFetch`.** `apiFetch` does not forward the visitor's cookies: no page
  reads user data on the server yet (0013). The first server-rendered page with user data forwards
  the session cookie (and only it) and keeps such answers out of shared caches.
- **How long to wait after a 429.** The api's limit sets `Retry-After` (0006 F23), but web's 429
  text only says "wait a little" (0007 H25), while the minute window can mean up to 60 s. Show the
  wait, or retry after it, when the header is there; nginx's own 429 has none (0006 F32) and keeps
  the "wait a little" text.
- **Taint the proxy secret.** `check:web-bundle` finds the names of `PROXY_SECRET` in the browser
  bundle, but a server component that passes `getServerEnv()` (or the value) to a client component
  puts the secret into the page's HTML at request time (0007 H32). Taint it in `server-env.ts`
  (`experimental_taintUniqueValue`, Next's `experimental.taint`), so such a render fails. Deferred
  by 0014 O76: on Next 16.3 the flag runs the whole `app` directory on `react@experimental`. Take
  it when the taint API ships in stable React and the flag no longer switches the channel (Next's
  `taint.md`).
- **Footer links.** The footer copies Lamoda's items, but only the personal data policy has a page
  (0008 J22): each other item becomes a link when its page appears. The list is
  `widgets/footer/config/items.ts`.
- **Full CSP for web.** nginx sends only `frame-ancestors 'none'`; a full Content Security Policy
  comes with web's pages (0006 F9). It must allow Mixpanel: `connect-src https://api-eu.mixpanel.com`
  (0008 J12). The SDK's recorder may start a worker from a `blob:` URL and falls back to a `data:`
  one; with `record_canvas: false` it probably starts none. Check in a browser for CSP violations
  before adding `worker-src blob:`, and never allow `data:` there.
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
  above, and the filter counts' Redis cache of spec 0014 plan §2.6); there is nothing to warm in
  Next's cache or Redis before it. Spec 0014 left it here (O21): measure the first request to `/`
  after a deploy against later ones first.
- **Signed links in reports.** A signed storage link carries `X-Amz-Credential=<S3_ACCESS_KEY_ID>/…`
  and a user's id in its path (0011 M34). The spec that shows a user's photo through such a link
  keeps its `src` out of Sentry (events, breadcrumbs) and Mixpanel (heatmap clicks, recordings),
  and checks what `strip-attributes.ts` and the recordings' image blocking already cover.
- **Product card link.** The catalog's cards link to `/products/<id>` (spec 0014 O7) with
  `prefetch={false}` (`widgets/product-grid`) while that address is a 404 (O75). The product
  page's spec turns the prefetch back on and decides whether `CatalogProductCard` (0009 K15)
  builds the address itself.
- **Mobile tab bar.** The design of spec 0019 has a bottom tab bar on phones («Главная», «Каталог»,
  «Примерочная», «Корзина», «Профиль»); 0019 shows only the fitting room's icon in the header
  (0019 A10). Build the bar when the site has a cart and a home worth a tab.
- **Share link of a result.** «Поделиться» on a fitting result is a disabled button (0019 A14).
  The design: a public page of the generated image with the «Сгенерировано ИИ» mark and the
  product's card, a link the user copies or sends, revoked from the history. Needs its own route
  under `noindex`, a token per share, a rate limit on the public page and the result's moderation
  verdict checked again before it is served.
- **Photo crop.** The design's «Обрезать это фото» after a «several people» refusal (0019 A41):
  a crop step in the browser before the upload is retried.
- **Report a wrong photo check.** «Мы ошиблись? Сообщить» on the «child» refusal (0019 A41): a
  report the owner reads; needs a place to keep reports and a rate limit.
- **Compare as an overlay.** The history's compare page has the tab «Наложением» in the design;
  0019 builds «Рядом» only (0019 A41).
- **Avatar teaser.** «Создать свой аватар · скоро» on the photo picker is not rendered by 0019
  (A41); the digital twin's spec (0016 item 5) adds the real button.
- **Logo keeps the catalog's scroll.** The header's logo links to `/`, which redirects to
  `/catalog`; a client-side click from another page (`/privacy`) shows the catalog at the scroll it
  had, not at the top, and a click on `/catalog` itself does not scroll up (spec 0014 T14 QA). Next
  shows the list it kept (`cacheComponents`) and the redirect is not a new page to it. Decide
  whether the logo links to `/catalog` directly or scrolls to the top, with the header's next spec.
- **Focus lost when the filter counts fail.** On the catalog, applying a filter keeps the focus on
  its chip only while the new selection's counts are there: the server prefetches them, and when
  that fails the row's filter chips unmount until the browser's request answers
  (`widgets/catalog-filters`, `FacetFilters`), so the focus falls to `body` (spec 0014 T18 review).
  Plan §3.4 says applying a filter does not move focus. Keep the chips (the previous counts, or
  the chosen values) while the counts load, or move the focus to the `<h1>` then.

## Server

- **Host hardening check.** Confirm on the server that SSH password login and root login are off,
  and record in `deploy/README.md` that the `deploy` user's membership in the `docker` group is an
  accepted risk.

## Temporal

- **SDK version ranges.** `@temporalio/client` is `"1.24"` while the other SDK packages are
  `"^1.24.0"`; align them so all SDK packages move together.
- **Outbox for file deletion.** A row's delete commits, then `FileDeletion` starts `deleteFiles`
  (spec 0011 T8); an api killed between the two (OOM, SIGKILL) leaves the files with no log line.
  Users can delete their accounts since 0013 (`DELETE /me`), but no route writes into users'
  folders yet (0013 N37). With the photo upload spec, before the first user's file: write the
  deletion into a table in the delete's transaction and start workflows from it.
- **Deletions after a restored copy.** Returning a database copy to production (0012 P31) finds
  what was deleted after the copy in `deleteFiles`' history (24 hours) or by comparing with the old
  database; a fitting session with no generations starts no workflow and a failed start leaves only
  a Sentry event, so both are added by hand. Files uploaded after the copy by users the copy holds
  stay in their folders with no row. With the outbox above, the restore can read the deletions from
  the old database's table; with the photo upload spec, remove a user's files no row refers to.
- **Heartbeats for long activities.** No activity heartbeats: a cancelled workflow's running
  attempt goes on until its timeout (`deletePrefix`: at most 30 s, harmless, the delete is
  idempotent), and a dead worker is noticed only then. With the photo upload and AI generation
  activities, where a cancellation must stop a paid call, add `heartbeatTimeout` and `heartbeat()`
  to them and to `deletePrefix`.
- **Temporal history backup.** Spec 0012 backs up only PostgreSQL and the app bucket (0012 P1):
  Temporal's history is a SQLite file on the `temporaldata` volume. A lost volume loses unfinished
  workflows (`deleteFiles`, later generations), which may leave a deleted user's files in the
  bucket. Revisit with generations, or when Temporal moves off `start-dev`.

## Dependencies

- **`npm audit` highs.** The `braces` chain in the root lint tooling (stylelint, Next's ESLint
  plugin) and `deepmerge-ts` / `mysql2` through Prisma in `api`. Check for fixed releases.
- **pg 9 and Prisma transactions.** `@prisma/adapter-pg` sends parallel queries of one transaction
  to one `pg` client; pg 8 queues them with a DeprecationWarning, pg 9 drops the queue. Before
  moving to pg 9, check that the adapter runs them in turn (the list's e2e would fail otherwise).

## Data and media

Left for later specs by `0002-database-schema` (its `clarifications.md` has the decisions).

- **Photo upload limits.** Spec 0011 gave the storage, server-named keys and deletion of a user's
  or a generation's files. What photo upload still owes: limits on size and type, re-encoding to
  WebP, and a retention period for old photo snapshots of C14 (one more key class and lifecycle
  rule, `storage/keys.ts`).
- **Production checks of the backups.** Spec 0012 closed on its tests and `ci-deploy-check.sh`
  (0012 P32); what needs production is left. A `--once` on the server (`deploy/README.md`,
  «Бэкапы») gives the first copies before any night. After the first night: the backup bucket's listing
  and the job's log line (0012 AC1), then the Sentry alert rule mailing the owner on the monitor
  `nightly-backup`'s issues, which the first check-in creates (plan §9, step 6). With `aws-cli`:
  the read key cannot write or delete in the app bucket (AC6); the write key cannot read, list or
  delete in the backup bucket nor reach the app bucket, and an overwrite leaves the old version
  (AC7); the lifecycle rules and versioning read back (AC8). A run with a refused upload and the
  container stopped past 04:30 both reach the owner (AC10). The latest copies restored by
  `deploy/README.md`, «Бэкапы»: the row count of every table and the bucket's keys and sizes match
  production's (AC11, AC12). After a run: nothing unencrypted on the server's disk (AC9) and no key
  in its logs (AC13). The tasks and the record's format: 0012's `tasks.md`, acceptance record.
- **Backups outside Timeweb.** The server and the backup bucket of spec 0012 share one Timeweb
  account (0012 P8): losing the account or the provider loses the data and its copies. Before real
  users: a copy at a second provider, or one the owner downloads regularly.
- **Deleted users in backups.** The copies of spec 0012 keep a deleted user's rows and files up to
  7 days, an overwritten version up to 14 (0012 P14). Before real users: state the period in the
  privacy policy (`/privacy`) and check it against the law on personal data (152-ФЗ).
- **A deleted user's history in Mixpanel.** After `DELETE /me` the user's events stay in Mixpanel
  under their id (0017 U17), `Account Deleted` among them. Before real users: delete them through
  Mixpanel's API on account deletion and say so in the privacy policy (`/privacy`).
- **Category tree.** Categories are a flat list (0002 C4); the catalog's left-hand tree is nested
  (0004 E29).
- **Sizes off the scale.** The size filter's order (0009 K13) knows `XXS … 3XL` (`XXXL` = `3XL`)
  and plain numbers; `2XL`, `4XL` and up, ranges (`44-46`, `42/44`) and jeans sizes (`W28 L32`) go
  after all numbers, by text. Rank them once the catalog has such sizes.
- **Redis memory limit.** The facet cache (spec 0014 T8) stores one key per distinct filter, and an
  anonymous client can vary `maxPrice` or `q` for up to its read quota (300 a minute) of keys of up
  to tens of KB each, held for `FACETS_CACHE_TTL_SECONDS`. Redis has no `maxmemory` and is shared
  with the rate-limit counters (0014 T8 security review). Set `maxmemory` with `noeviction` in
  `infra.yml` (an eviction policy would drop the throttler's counters too: a way around the limit);
  a full Redis then fails the cache's write (back-off, O56) and the throttler counts in memory
  (0006 F28). Recreates Redis on deploy: merge at a quiet time.
- **Catalog renames when catalog writes open.** The search vector's triggers (0014 T4, migration
  `20261019120000_product_search`) rebuild every product of a renamed brand or category in the
  rename's transaction, and a product write takes `FOR SHARE` on its brand and category, so two
  transactions that mix product writes with renames may deadlock (40P01, answered as 500). Harmless
  while brand, category and product writes are `@Closed()`; the spec that opens them gives renames
  a quota or batches the refresh, and retries or orders the locks (brand before category) in any
  multi-step write (0014 T4 reviews).

## Agents' guards

- **zsh glob alternation.** The main session's Bash guard splits a word at `(`, so zsh's
  `cat .(e|x)nv` (alternation, extendedglob not needed) may pass as `cat .` and `e|x)nv`; not run
  to confirm (found in the review of the `[[ ]]` fix, spec 0011 T13a). Treat a `(` glued to a word
  as part of a glob and check the alternatives against the secret names.
- **Array index arithmetic.** bash evaluates an array index in `[[ -v 'a[$(cmd)]' ]]` and in the
  operands of `-eq` and the like, running `$(cmd)` even inside single quotes; the guard extracts
  no code from single quotes, so `cmd` is not checked (the same review). Extract `$(…)` from a
  quoted operand of `[[ -v`, `-eq`, `-ne`, `-lt`, `-le`, `-gt`, `-ge`, or refuse it.

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
- **Database specs time out under load.** During 0009 T5 (2026-10-16), two `npm run verify` runs
  of an unchanged api failed on time limits alone, then passed: once the `beforeAll` of several
  `api/test/database/` specs (access, brands, categories, …) missed Vitest's 10 s hook timeout,
  once `ai-generations.e2e-spec.ts`, "leaves exactly one of the sent sets after parallel PATCHes
  of productIds" (8 rounds), missed the 5 s test timeout while a browser QA run shared the
  machine (the api run took 53 s instead of about 25 s). Like the facets test above: find what
  makes the app start and the race test slow under load, and give them a time budget that holds
  on a loaded machine, or fewer rounds.
- **Flaky unread-body test.** `api/test/errors.e2e-spec.ts`, "a 150 KB urlencoded body is not
  read, so not refused as too large (F26)", failed once in `npm run verify` with `write EPIPE`
  (2026-10-18, 0013 T6, test unchanged) and passed alone 8 times of 8. The api answers 404 without
  reading the body and closes the connection while supertest is still writing it. Send the body
  so a closed socket is not an error (e.g. a raw `http.request` that ignores EPIPE and reads the
  answer), or check the answer with a body under the socket's buffer.
- **Flaky socket-principal tests.** `api/test/database/socket-principal.e2e-spec.ts`, "a failed
  session read": "warns once per minute and counts the refusals it left out" failed once on CI
  (run 39302501138, 2026-10-19: `warn` called 2 times, expected 1, after the second
  `passMinute()`), and "logs an error and reports to Sentry once per connection when the reader
  marks it" once in `npm run verify` (2026-10-19, 0015 T2, test unchanged: `warn` called with
  `connection error: connect ECONNREFUSED 127.0.0.1:1`); both passed on a rerun. The tests spy on
  `Logger.prototype.warn`, so `RedisModule`'s warning about its unreachable test address counts
  too whenever it lands during the connection. Spy on the adapter's logger alone, or count only
  the calls carrying the refusal's message.
