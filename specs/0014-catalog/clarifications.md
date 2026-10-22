# 0014 catalog page: clarifications

Status: done (2026-10-22). History, not instructions. Accepted 2026-10-19; amended 2026-10-19 at
the plan: the whole greeting goes (O33), web's
own health route (O34), Lamoda's layout of applied filters and the breadcrumbs (O5), search by
article (O14); amended 2026-10-19 after the check against 0012, 0013 and 0015 (O35–O39);
amended 2026-10-19 at the review of PR 1 (O40–O48), its second round (O5's description, O46,
O49, O50) and its third round (O49's lag); amended 2026-10-21 at T13a (O76: the taint deferred) and at T20 (O97–O105: analytics);
amended 2026-10-22 at the review of PR 3 (O106, O107) and its production checks (O108: AC23's
Accessibility 97 accepted) and at T25 (O113: the close in a pull request of its own) and the review of PR 4 (O114) and
at the close (O115: what plan §8 asked that the close does not do).

The owner's decisions for this spec. Ids `O1`, `O2`, … are referred to by the spec, the plan and
code comments. All decisions below: owner, 2026-10-19.

## Order

- **O1. Number, issues and branches.** This spec is 0014, for issues #68 (the catalog: scrolling,
  filters, sorting, search) and #71 (SEO of the main page). The main page is the catalog. It is
  written while 0012 and 0013 are in progress, so its documents stay uncommitted until the 0013
  session no longer uses the shared worktree. Then they go to `docs/0014-catalog` from a fresh
  `main`. (0013 closed and merged on 2026-10-19; the documents were checked against it, O35–O39.)
- **O2. Four pull requests.** One phase of `tasks.md` per pull request, in this order:
  1. the documents (spec, clarifications, plan, tasks);
  2. api: search, paging, lookup by slug, indexes, the filter-count cache, the database pool;
  3. web: the page, the header, the removals, analytics, SEO;
  4. nginx: the rate limit for pages and the Content Security Policy.
     The api pull request keeps the deployed web working, and the nginx one comes after the catalog has
     been measured in production (O24).

## Address and page

- **O3. Address.** The catalog is at `/catalog`, and a category at `/catalog/<slug>` (its `slug`).
  Filters, the sort and the search are query parameters. `/` redirects to `/catalog` with a
  temporary redirect (307), so browsers do not keep it if `/` gets its own page later (amended by
  O42).
- **O4. Unknown category.** A slug that names no category, or an inactive one, answers 404.
- **O5. Layout, desktop.** As on Lamoda's catalog. The owner showed screenshots and a saved page on
  2026-10-19. They stay outside the repository (O50); the owner gives them again when a task needs
  them. From top to bottom:
  - breadcrumbs: "Каталог" (a link to `/catalog`), then the category; on `/catalog`, "Каталог"
    alone, without a link;
  - the title with the number of products ("Платья 128 товаров", the count small and grey, the
    noun agreeing with the number);
  - on the left, the category list with counts (0009 K8); the chosen category is a black row; a
    category with no product under the current filters is hidden (the facets' rule, 0004 E46);
  - above the grid, a wrapping row of chips: the sort first (it shows the chosen order and turns
    black when it is not the default), then each filter's dropdown, then "Только со скидкой";
  - an applied filter is its own chip, black, with its value ("Стиль вечерний") and a × that clears
    it. There is no separate row of chosen values. While any filter is applied, the row ends with
    the link "Очистить фильтры", which clears every filter and the search and keeps the category
    and the sort;
  - a grid of four cards per row.

  What the references show, so that the layout can be checked without them:
  - **Header.** The header of 0010 above everything.
  - **Breadcrumbs and title.** Small grey breadcrumbs separated by "/". Below them, the title in a
    large font with the count after it in a small grey font.
  - **Category list.** In the left column, one category per line in a large font with its count in
    small grey. The chosen one is a black rounded row with white text, its count and a chevron.
  - **Chips.** Outlined rounded rectangles with the filter's name and a chevron, wrapping onto
    several lines. An applied chip is black with white text and a × instead of the chevron.
  - **Sort dropdown.** A list of radio buttons; choosing one applies it at once.
  - **Checkbox dropdowns** (brand, size, material, season, style). Lines with a checkbox, the value
    and its count on the right, then a full-width "Применить" button. The button is grey and
    inactive until the choice changes, then black.
  - **Colour dropdown.** As a checkbox dropdown, plus a search field ("Найдите цвет") on top,
    "Выбрать все", and a round swatch before each colour.
  - **Price dropdown.** A two-handle slider, the fields "Мин. цена" and "Макс. цена" under it, and
    "Применить".
  - **Card.** A photo in about 3:4 with the discount badge ("−40%", red) at its bottom left. Under it
    the old price struck through, the new price in red, the brand, the name and the rating
    ("★ 4.8 (21)"). The heart in the photo's corner, the club badge and labels such as "только у
    нас" are Lamoda features this spec does not build (the card's action slot stays empty, 0009
    K10).
    The kit's `FilterDropdown` and 0009's filters already draw these chips. (Amended at the plan,
    after the owner's references: no row of chips under the filters.)

- **O6. Layout, phone.** A "Фильтры" button opens the filters in a bottom sheet as an accordion.
  The grid has two columns. This builds backlog "Mobile filters" and lifts 0009 K16 (desktop
  dropdowns only).
- **O7. Card link.** Each card links to `/products/<id>`. That answers 404 until the product page
  spec adds the page, which then needs no change to the catalog. This is backlog "Product card
  link"; 0009 K15 stays (the card takes the address as a prop).
- **O8. The greeting and the dev page go.** Removed:
  - the welcome page;
  - `entities/greeting`;
  - the api's `/hello`;
  - their tests;
  - `/dev/catalog` and its tests.
    This is backlog "Remove greeting" and 0007 H14.
- **O9. Filter state.** The page owns the filter state, the URL and the requests (0009 K7). Every
  applied filter, the sort and the search are in the URL, so a link opens the same selection.

## Scrolling and paging

- **O10. Infinite scroll with virtualization.** The next batch loads as the visitor nears the end of
  the list. Only the rows near the screen are in the page's DOM. There are no page numbers.
- **O11. Keyset paging for the product list.** The product list pages by a cursor that continues
  after the last product shown, not by offset. A product added or removed while the visitor scrolls
  makes no product repeat or go missing. The answer carries the next cursor (none on the last
  batch) and, for the first batch only, the total (amended by O44). Only the product list changes; the other lists keep limit and offset. The list
  accepts offset until the web that uses the cursor is deployed, and a later release removes it.
  This amends 0004 E5 and E45 for the product list.
- **O12. Back to the same place.** Going back to the catalog (from a product, for example) shows the
  batches already loaded, at the same scroll position.
- **O13. A large catalog for testing only.** The production seed stays as it is (33 products). A
  separate development-only script fills the local database with generated products made from the
  existing photos, for QA of scrolling and for measuring the indexes: about 2000 by default, and
  50 000 for the index check (O43).

## Search

- **O14. Full-text search.** The search matches word forms in Russian ("платья" finds "платье"). It
  searches the product's name, its brand and its category. The last word matches as a beginning
  ("плат" finds "платье"). Typos are not forgiven. The results keep the chosen sort; there is no
  sort by relevance. This replaces 0004 E45's substring of the name. The 100-character limit (0010
  L11) stays. A query equal to a product's article, case ignored, finds that product too, and the
  header field's placeholder is "Товар, бренд или артикул". (Article added at the plan.)
- **O15. Header search.** Submitting the header search on any page opens `/catalog?q=<query>` and
  clears the category, the filters and the sort. This replaces 0010 L8, which kept the current page
  and its parameters.
- **O16. Header categories.** The categories in the header link to `/catalog/<slug>`. This replaces
  0010 L4 (plain text).

## Performance and protection

- **O17. Cost of the product list.** Every sort of 0004 E14 and the search use an index. This is
  backlog "Product list cost".
- **O18. Filter counts are cached.** The filter counts are kept in Redis for a short time. The
  database pool size and a statement timeout come from the environment, so a few slow requests
  cannot hold every connection. This is backlog "Cache for filter counts".
- **O19. Rate limit for pages.** nginx limits page requests per client address. The threshold is
  set from a measurement of the deployed catalog. This is backlog "Rate limit for web pages".
- **O20. Content Security Policy.** web's pages get a full policy that still allows Mixpanel (0008
  J12). This is backlog "Full CSP for web".
- **O21. Left in the backlog.** Each stays for a reason:
  - "Cache warm-up on deploy" (#41) and "Page cache in a read-only image": the backlog asks to
    measure the first request after a deploy on the real catalog first. This defers the owner's note
    of 2026-10-15 that put them with the catalog page spec.
  - "Category tree": categories stay flat.
  - "Sizes off the scale": the catalog has no such sizes yet.

## Analytics

- **O22. Catalog events.** The page sends these, each listed in `events.ts` (0008 J7):
  - "Catalog Filter Applied": which filter and how many values;
  - "Catalog Sorted";
  - "Catalog Searched": the query's length and the number of results, never its text;
  - "Catalog Page Loaded": the number of the batch (renamed `Catalog Batch Loaded` by O97).
- **O23. Tracked clicks and hovers.** These are tracked with `useTrackedElement` (0008 J8):
  - product cards, with their position (amended by O35: no product id);
  - categories;
  - filters.
    No personal data goes into these events.
- **O24. Measured before nginx.** The rate limit of O19 is set after the web pull request is deployed
  and the requests of one catalog visit are measured in production.

## SEO and accessibility

- **O25. Titles and descriptions.** The site name is "Lamoda AI Fitting". The title of a category
  is "<category> — Виртуальная примерка | Lamoda AI Fitting", and of `/catalog` "Каталог —
  Виртуальная примерка | Lamoda AI Fitting". The description is the category's `description`. When
  that is empty, a template gives the number of products and the lowest price.
- **O26. Indexing.**
  - Canonical address: the catalog or category address without filters.
  - `noindex` on any address with a search or a filter.
  - `sitemap.xml` lists the catalog and the active categories.
  - `robots.txt` points to the sitemap and keeps `/ui-kit` out. Batch addresses (`?cursor=`) stay
    open to crawlers, with `noindex, follow` (O41).
- **O27. Structured data.** JSON-LD:
  - on every catalog page, the breadcrumbs and the products of the first batch (name, price, link);
  - on `/catalog`, the site with its search and the organization.
- **O28. Link previews.** Open Graph and Twitter tags (title, description, image) for `/catalog` and
  each category. The image is generated by the app, since web has no static files (CLAUDE.md, web
  `public/`).
- **O29. Crawlers without scrolling.** The first batch is always in the server's HTML. Under the
  list, an ordinary "Дальше" link opens the next batch as its own address, rendered by the server
  without JavaScript.
- **O30. Semantic markup and screen readers.**
  - The page uses landmarks (header, navigation, main, aside, footer), one level-one heading, and
    breadcrumbs in a navigation.
  - The grid is a list, and each card states its position in the whole list.
  - The result count and loading are announced.
  - Focus stays in place when a batch loads or a filter is applied.
  - Every filter, chip and the bottom sheet work from the keyboard.
- **O31. No webmaster registration.** Yandex.Webmaster and Google Search Console are out of scope.
- **O32. How SEO is checked.**
  - Tests check the metadata, the structured data, the sitemap and robots.
  - After the web deploy, Lighthouse gives 100 for SEO and 100 for Accessibility on `/catalog` and
    one category (O47 for points lost outside this spec's code).
  - The structured data passes Yandex's validator and Google's Rich Results test.
  - The results are posted on the pull request.

## Decided at the plan

- **O33. The whole greeting goes.** Besides O8, the Temporal demo workflow `hello` and its activity
  go. Tests and deploy checks that used `/hello` as an ordinary public route use `GET /categories`
  instead (the same `read` tier). (Owner, at the plan.)
- **O34. web's own health route.** web answers `/healthz` with 200 without calling the api. The
  container's health check uses it, and nginx does not serve it. The smoke test checks the redirect
  on `/` and the catalog's heading on `/catalog`. (Owner, at the plan.)

## Decided after the check against 0012, 0013 and 0015

- **O35. Analytics follow spec 0015.** Spec 0015 (issue #70) brings a catalog of events in which a
  property is an enum, a number or a boolean, never free text (0015 R7). Names follow its rules
  (R8): snake_case properties and fixed element ids (`catalog.card`, `catalog.category`,
  `catalog.filter-brand`, …). Every event gets its frequency per visit. Cards send their position
  only, not the product's id: no new kind of property in 0015, and nothing in the events can tie a
  visitor to a product. Product-level analytics, if wanted, come with the product page and an
  amendment of 0015. T20 starts after 0015's catalog is on `main`. This amends O22 and O23. (Owner
  asked for the safer option, 2026-10-19.)
- **O36. The pool's connection timeout too.** Besides the pool size and the statement timeout
  (O18), a request waits for a free connection only for a limited time (`connectionTimeoutMillis`)
  and then answers 503. This closes backlog "Timeouts of the database pool" in full.
- **O37. The proxy secret is tainted.** The catalog is the first page whose server components pass
  props to client ones. React's taint API marks `PROXY_SECRET` so that it can never reach the
  browser through props. This closes backlog "Taint the proxy secret". Revised by O76: deferred.
- **O38. The flaky facets test is fixed.** T5 and T8 rewrite the facets e2e anyway. They also make
  `product-facets.e2e-spec.ts` stable under load. This closes backlog "Flaky facets test".
- **O39. A rate limit for `/media/`.** PR 4 also limits `/media/` per client address, from the same
  measured visit (O24). A virtual grid loads many photos, so the threshold has to allow them. This
  is the first step of backlog "Rate limit for web pages" (random keys reach the bucket).

## Decided at the review of PR 1

The review of PR 1 (#87) was posted as a comment on 2026-10-19.

- **O40. PR 3 waits for 0015.** T20 stays in PR 3, and PR 3 merges only once spec 0015's event
  catalog is on `main` and T20 is done. Its entries follow 0015 as merged, which may differ from
  the names in plan §3.6. (Review note 1.)
- **O41. Batch addresses stay open to crawlers.** `robots.txt` does not block `?cursor=`. Those
  pages carry `noindex, follow`, so a crawler walks the "Дальше" chain and finds every product link,
  but no batch page is indexed. (Note 5; amends O26 and O29.)
- **O42. A temporary redirect on `/`.** `/` → `/catalog` is a 307, not a 308: a later page on `/`
  needs no browser cache to clear. (Note 7; amends O3 and AC1.)
- **O43. The index check runs on 50 000 products.** The dev catalog script takes a count (2000 by
  default). AC14 runs it with 50 000, then `ANALYZE`, and each `EXPLAIN` must choose the index on
  its own, without `enable_seqscan = off`. (Note 3.)
- **O44. The total only in the first batch.** A request with `cursor` does not count. Its `total`
  is `null`, and web keeps the first batch's total. The offset answer stays as it is until PR 4
  removes it. (Note 8; amends O11.)
- **O45. The CSP allows the recorder's worker.** The policy has `worker-src 'self' blob:` from the
  start. T24 checks the browser console locally with a placeholder token the owner puts into
  `.env` (amended at T24: no development project; any non-empty token loads the SDK and its
  recorder, and Mixpanel refuses its events, so no data is sent). (Note 6.)
- **O46. Some tasks of PR 3 may go ahead alone.** If the web phase drags on, T11 and T12 (routes,
  redirect and removals) may ship as their own pull request before the rest of PR 3. Such a pull
  request keeps PR 3's release conditions: PR 2 in production (T11 needs the category by slug), and
  the `/hello` window of O48 happens at its deploy. (Note 9; the conditions added at the second
  round.)
- **O47. Lighthouse 100 for this spec's code.** A point lost to the UI kit or the header is fixed
  in this spec when the fix is small. Otherwise it goes to the backlog, and AC23 is accepted with
  the reason recorded. (Note 10.)
- **O48. The `/hello` window is accepted.** During PR 3's blue-green switch, the old release's home
  page may show the greeting's error for a few seconds; the switch ends it. (Note 11.)

Second round, on the review of `4817711`:

- **O49. The title's count comes from the filter counts.** The number in the title ("128 товаров")
  and the list's `aria-setsize` come from the facets' `total`. The page loads the facets on every
  address, a batch page (`?cursor=`) included, and they are cached (O18). The list's own `total`
  (first batch only, O44) is then not needed by web. The count comes from the cache, so after a
  catalog change it may lag behind the list for the cache's lifetime (60 s); this is accepted and
  is not a defect at AC3 or AC23. (The lag noted at the third round.)
- **O50. The references are described, not stored.** The Lamoda screenshots and saved page are
  not committed. The saved page holds the owner's personal data, and the pictures are someone
  else's. O5 describes what they show; when a task needs them, the owner gives them again.

## Decided at T4

- **O51. The search migration waits for its locks at most 5 s.** The migration `…_product_search`
  starts with `SET lock_timeout = '5s'` and ends with `RESET lock_timeout`. Behind a long query of
  the running release it fails, rolls back whole and stops the deploy, while the running copy keeps
  serving, instead of queueing every read of `products` behind it until they time out (503). A plain
  `SET`, not `SET LOCAL`, so it holds however Prisma sends the script. (security-reviewer, T4.)

## Decided at T5

- **O52. Stop words drop out of a search, the last word too.** The Russian dictionary drops words
  like "на", "по", "без" (and English "a", "it") from the query, as it does from the names. So
  "платье без" finds what "платье" finds, and "на" alone finds nothing, not "наволочка". The header
  search runs on submit (O15), so a stop word typed as a beginning is rare; a search as you type
  would revisit this. (code-reviewer, T5.)
- **O53. The last word is a beginning only from two characters.** Letters or digits: "пл" finds
  "платье", "52" finds "520"; a single letter or digit is a whole word (unless a stop word, O52).
  One letter as a beginning matches nearly
  every word in the index and gives nothing useful, while each facets request runs seven such
  queries. T10 measures a two-letter beginning on 50 000 products (AC14); if it is too slow, the
  threshold goes up. (security-reviewer, T5.)

## Decided at T6

- **O54. A refused cursor, and `nextCursor` beside `offset`.** A malformed cursor, one of another
  sort or an empty `?cursor=` answers 400 `VALIDATION_FAILED` with one detail on `cursor`, code
  `INVALID_CURSOR`; its message never repeats the cursor. `cursor` with `offset` answers 400 with a
  detail on `offset`. `cursor` belongs to the list's query only, so the facets answer it 400 (0004
  E46). The offset answer gains `nextCursor` too (an added field; the deployed web drops it), and
  `limit` keeps its default 60 and maximum 100. (Owner, T6.)

## Decided at T7

- **O55. A refused slug.** A slug in `GET /categories/by-slug/:slug` that breaks the slug rule
  answers 400 `VALIDATION_FAILED` with a detail on `slug`, as a malformed query parameter does, not
  `INVALID_ID`: a slug is not an id. (Owner, T7.)

## Decided at T8

- **O56. The facet cache backs off after a Redis failure.** Plan §2.6 only logs a failure, so a
  Redis that holds the connection but does not answer would add up to 1 s (the shared client's
  `commandTimeout`) to every facets request. As the throttler does (0006 F28), after a failed command
  the cache is skipped for 10 s, then one request tries Redis again; while the client is not
  connected it is skipped at once. The write after a miss is not awaited. (Owner, T8.)
- **O57. The facet cache lives 1 s to an hour.** `FACETS_CACHE_TTL_SECONDS` is a whole number from 1
  to 3600, default 60; anything else stops the api at start. (Owner, T8.)
- **O58. The facet cache keys `q` as sent.** Plan §2.6 had `q`'s tokens and `q` in lower case, but
  JavaScript's lower case differs from the database's `lower()` for a few letters (a final "Σ",
  "İ"), so two `q` could share a key and not an answer. `q` goes into the key as it is; "Платье" and
  "платье" are two keys, one more miss each. (code-reviewer and security-reviewer, owner, T8.)

## Decided at T9

- **O59. Both database timeouts together stay below the request timeout.** Plan §2.7 refines each
  timeout against `REQUEST_TIMEOUT_MS` on its own, but a query may first wait for a connection and
  then run its statement, so the api refuses to start unless
  `DATABASE_CONNECTION_TIMEOUT_MS + DATABASE_STATEMENT_TIMEOUT_MS < REQUEST_TIMEOUT_MS` (the
  defaults: 2000 + 5000 < 10000). Every transaction, the product list's interactive one among
  them, gets `maxWait = DATABASE_CONNECTION_TIMEOUT_MS` and `timeout = DATABASE_STATEMENT_TIMEOUT_MS`
  (the whole transaction, not each statement; `transactionOptions` of `PrismaService`); Prisma's
  `P2028` past either answers 503 `SERVICE_UNAVAILABLE`, any other `P2028` (a misused `tx`) stays a 500. The bound holds for one query. Prisma does not stop a statement under way, so a
  transaction's last statement may run on to its statement timeout (at worst
  `maxWait + timeout + statement timeout`, 12 s with the defaults), and a handler that runs several
  in a row is bounded only by the request timeout, which answers 503 first. `/health/ready` keeps its `SELECT 1` through the same pool: with the pool exhausted it answers
  503, while `/health/live` answers (AC15). (Owner, T9; code-reviewer and security-reviewer.)
- **O60. An outage's 503 goes to Sentry once a minute per route.** A statement timeout or a pool
  with no free connection now answers 503 within seconds, before the request timeout, so the once a
  minute of 0006 F29 no longer covered it, and a client sending a slow filter again and again sent
  an event each time. `AppExceptionFilter` sends a 503 of a dependency down, too slow or busy (the
  database, Redis, the facet slots of O62; not a request timeout or a session read, which keep
  their own once a minute) to Sentry once per route template and minute in the process; the others
  go to the log as warnings. (security-reviewer, owner, T9.)
- **O61. The product list reads the filter's attributes in its transaction.** `loadValueAttributes`
  runs inside the list's transaction, so the whole list is one transaction bounded as in O59.
  (code-reviewer, owner, T9.)
- **O62. The filter counts use at most half the pool.** A facets cache miss runs 7 queries at once,
  so a client sending new filters (`q` or prices) could hold the pool of 10 and every other route
  would wait for a connection. At most `floor(DATABASE_POOL_MAX / 2)` (at least 1) of the counts'
  queries run at once in a process (`FacetQuerySlots`); one that waits for a slot longer than
  `DATABASE_CONNECTION_TIMEOUT_MS` answers 503 `SERVICE_UNAVAILABLE`. After the first failure of a
  request's queries (a slot wait, a statement timeout, any error) its queries not yet started are
  dropped. The wait for a slot comes on top of O59's bound
  (with the defaults 2000 + 2000 + 5000 < 10000; the refine does not check it). The other half stays for the
  list, the product page and the session reads. Counting on one connection would be safer still but
  makes every miss several times slower. The browser keeps retrying a 503 (0007 H24): a 503 of a
  statement timeout is not told apart, which would need a new error code. A transaction is not
  bounded more strictly than O59. (security-reviewer, owner, T9.)

## Decided at T10

- **O63. What "too slow" means for a two-character beginning.** On the 50 000-product dev catalog
  after `ANALYZE`, `q=пл` is fast enough when the list's first batch answers in under 300 ms and the
  facets with the cache missed (a `q` not asked before) in under 1 s, as measured over HTTP on the
  local stack. Slower, and the measured numbers go to the owner, who decides whether
  `MIN_PREFIX_LENGTH` goes up (O53). The plans' own times come from `EXPLAIN (ANALYZE, BUFFERS)` in
  psql, since a statement over `DATABASE_STATEMENT_TIMEOUT_MS` answers 503 instead of a time. (Owner,
  T10.)
- **O64. The development catalog's file is `seed/large-catalog.ts`.** Plan §2.8 named it
  `dev-catalog.ts`, which T12's check (`rg -i '…|dev-catalog|…'` finds only specs and history)
  would catch. The command stays `npm run seed:dev-large`. (Owner, T10.)

## Decided at T11

- **O65. The category's 404 is decided in `proxy.ts`.** Plan §3.1's first way fails on Next 16.3
  with `cacheComponents`, checked on `next build` + `next start`: `connection()` and `notFound()`
  outside `<Suspense>` fail the build, and with `instant = false` the static shell still goes out
  first, so an unknown slug answers 200 (a soft 404: the not-found page with `noindex`). A rewrite
  from `proxy.ts` to the page keeps the page's 200 too; a rewrite to a path no route matches answers
  404 with the site's not-found page. So `proxy.ts` (matcher `/catalog/:slug`) reads the category
  and rewrites an unknown or inactive one there; when the api fails, the request goes on unchanged
  and the page shows the error. `apiFetch` takes the incoming headers as an argument for it, since
  `headers()` is not there in `proxy.ts`. (Owner, T11.)
- **O66. A category page reads its category twice.** `proxy.ts` and the page each call
  `GET /categories/by-slug/:slug`: `React.cache` does not span them. Both count in the visitor's
  `read` quota. Passing the category from the proxy in a request header was refused: the page would
  trust a header a visitor can send. If O24's measurement shows too many reads per visit, the proxy
  keeps the active slugs in memory for about a minute, as a decision of its own. (Owner, T11.)
- **O67. `metadataBase` is set by the pages that render per request, not the root layout.** The
  root layout's metadata is built with the static pages (`/privacy`, `/ui-kit`, the not-found page),
  when no server env exists, so a runtime `SITE_URL` cannot reach it. The title template stays in
  the root layout; the catalog's `generateMetadata` (and later the sitemap and robots) set
  `metadataBase` from `SITE_URL`. Static pages have no relative URLs in their metadata. (Owner,
  T11.)
- **O68. `SITE_URL`'s values.** Production: `https://${SITE_DOMAIN}` in `deploy/compose/app.yml`,
  like the api's `WEB_ORIGIN`, so GitHub gets no new variable. Locally: optional in `.env.example`,
  and `docker-compose.yml` defaults it to `http://localhost:<WEB_HOST_PORT>` (web's port, not the
  api's 3000 the plan named). (Owner, T11.)
- **O69. The deploy checks follow the redirect in T11.** `/` stops showing the greeting with T11's
  redirect, not T12's removals, so T11 moves `smoke-test.sh` (`/` → 307, `<h1` on `/catalog`),
  `request-loop.sh` (`/catalog/dresses` and its heading) and `ci-deploy-check.sh`'s
  `check_request_id` (`/catalog/dresses`, where the proxy and the page call the api; it wants both
  calls' lines) with it. Each commit keeps the deploy checks passing, and T11–T12 may ship alone
  (O46). `/catalog`'s placeholder heading is static, so the smoke test, CD's only check of
  production, also wants `/catalog/dresses` to show "Платья" from the api: otherwise a web that
  cannot reach the api would pass. T13 revisits these steps once `/catalog` shows products from the
  api. (code-reviewer, owner, T11.)

## Decided at T12

- **O70. web's health check moves to `/healthz` over two releases.** A rollback takes `deploy/`
  from `main`, so an image from before PR 3, which has no `/healthz`, would be checked on it, answer
  404 and never become healthy: the rollback most likely to be needed, right after PR 3, would fail.
  So in `deploy/compose/app.yml` a 404 from `/healthz` is checked again on `/`, which such an image
  serves with 200. New images always answer `/healthz`. T23 (PR 4) removes the fallback; it may
  mask a lost `/healthz` meanwhile (`/` redirects to `/catalog`, 200). `docker-compose.yml` checks
  `/healthz` only: a local copy runs its own branch's file. Such a rollback still ends with CD's
  smoke step failing: `smoke-test.sh` comes from `main` and wants T11's redirect and
  `/catalog/dresses` (O69). The smoke test stays strict, as CD's only check of production;
  `deploy/README.md` ("Откат") says the switch happened and how to confirm it by the version of
  `/api/health/live`. T23, removing the fallback, updates that paragraph. The alternative the
  owner weighed and rejected: accept that no rollback past PR 3 is possible and say so in `deploy/README.md`; no code,
  but a broken PR 3 would be left by a revert through CI and CD, or by hand on the server.
  (code-reviewer, owner, T12.)

## Decided at T13

- **O71. The deploy checks want a product from the api.** With products on `/catalog`,
  `smoke-test.sh` wants at least one product card on it (the card's `<article`), not a product of
  the seed by name, so removing a seed product never fails a deploy. `/catalog/dresses` keeps its
  check of "Платья" (O69), the category's name from the api. `request-loop.sh` stays on
  `/catalog/dresses` and wants both its heading and a card. The alternative weighed: a seed
  product's name, more specific but tied to the seed. (Owner, T13.)
- **O72. A cursor the api refuses shows the first batch.** A `?cursor=` the list answers 400
  `INVALID_CURSOR` (O54: malformed, another sort's, empty) renders the first batch of the same
  filters and sort, not the error state, so a batch link saved before a change of the sort does not
  look broken. The address is not rewritten. T13 parses `cursor` into the URL state but renders the
  first batch for any cursor; T14, which renders `?cursor=`, applies this rule. The alternative
  weighed: the error state. (Owner, T13.)
- **O73. The category comes from the path only.** The address's query never sets `categoryId`:
  `/catalog?categoryId=…` shows the whole catalog and `/catalog/<slug>?categoryId=…` its own
  category, so one selection has one address, the canonical one of O26. A category is a page, not
  a filter: the catalog's categories are links to `/catalog/<slug>`, and
  `Catalog Filter Applied` has no `category` value (plan §3.6; `catalog.category` counts the
  clicks). The cost: no choice of several categories at once, which the spec does not ask for; a
  later spec that wants it adds the parameter and its rule against the path. The alternative
  weighed: `categoryId` as a query filter. (code-reviewer, owner, T13.)
- **O74. A batch the server could not load is requested again by the browser.** When the server's
  first batch fails, the page renders the error text and still mounts the browser's list, which
  requests the batch (retrying a network error or a 503 twice, `shouldRetry`) and replaces the text
  with the products; without JavaScript the text stays. A category whose read fails still shows
  only the error. The alternative weighed: the error until a reload. (code-reviewer, owner, T13.)
- **O75. No prefetch of the card links while no product page exists.** The cards link to
  `/products/<id>` (O7), which answers 404 until the product page's spec; `CatalogProductCard`
  takes `prefetch` and the catalog passes `false`, or Next would request every visible card's
  page in production. Backlog "Product card link" turns it back on with that page. (code-reviewer,
  owner, T13.)
- **O76. The proxy secret's taint is deferred.** Revises O37. On Next 16.3 and React 19.3,
  `experimental_taintUniqueValue` exists only in React's experimental build, and
  `experimental.taint: true` switches the whole `app` directory to `react@experimental` in
  production (Next's `taint.md`); a test would also need the experimental `react` and
  `react-server-dom-webpack` wired into Vitest by hand. A defensive check is not worth running the
  site on an experimental React. `PROXY_SECRET` stays read only by `apiFetch`, and backlog "Taint
  the proxy secret" stays open until the taint API ships in stable React. The alternatives weighed:
  the flag as planned; no taint but `getServerEnv()` without the secret, read by one function only
  `apiFetch` may import (ESLint). (owner, T13a.)

## Decided at T14

- **O77. Back to the place: Next's own on a client-side step, the grid's on a full load.** Refines
  O12 and plan §3.3. With `cacheComponents`, a client-side Back or Forward shows the list Next kept
  hidden (`<Activity>`) with its loaded batches and DOM, and the browser puts the scroll back
  itself, within about a row. The grid restores its saved place (`sessionStorage`
  `catalog-scroll:<path+query>`: offset, a measured row's height, the count loaded) only when the
  catalog loads as a new document by Back or Forward (a `back_forward` navigation entry of its
  address): it first loads as many batches as before, up to 600 products, then scrolls; a wheel,
  a touch scroll, a scroll key outside a field or a press on the scrollbar in the meantime cancels
  it, and nothing is saved until it is done. Accepted limit: Back to a list of the same address
  with another start (from `?cursor=`, reached by "Дальше", which with JavaScript only the keyboard
  reaches) remounts the list, and the browser puts the scroll back while the other batch is still
  on the page, so it lands at the end of the first batch. The alternative weighed: the grid's own
  restore on client-side steps too, which raced Next's reveal and the browser's restore (QA, T14).
  (owner, T14.)
- **O78. The search text in the "Дальше" link is accepted.** The link's `href` carries the
  address's query, `q` included; recordings keep element attributes (spec 0008), but the same `q`
  is already in every event's `$current_url`. The link gets no `mp-block`. The alternative
  weighed: `mp-block`, which drops the link from the recordings. (security-reviewer, owner, T14.)
- **O79. The first batch's HTML waits for the filter counts.** The server prefetches the facets
  with the batch, so `aria-setsize` comes from their `total` from the first render (O49); the
  page's HTML waits for the slower of the two. The alternative weighed: render without waiting,
  the size from the loaded count until the browser's own request. (code-reviewer, owner, T14.)
- **O80. Back between filter states with the same cursor is T15's.** The grid remounts by the
  start cursor only; whether a change of the filters, which T15 makes with `router.replace`, needs
  its own place is decided there. (code-reviewer, owner, T14.)
- **O81. The header's search drops the batch cursor.** Revises 0010 L8 (the search keeps the
  page's other parameters): `cursor` is left out, so a search from `/catalog?cursor=…` starts at
  its first batch instead of after a product of another list. The alternative weighed: leave it to
  T17. (code-reviewer, owner, T14.)

## Decided at T15

- **O82. A filter change has no place of its own.** Answers O80. A filter, the sort or "Очистить
  фильтры" replaces the address (`router.replace`, `scroll={false}`), so no history entry is added
  and Back leaves the catalog. The new address starts at its first batch (`cursor` dropped, as in
  O81). The page scrolls to the top of the list's column when the visitor is below it, and stays
  where it is otherwise. The place saved for Back from a product (O77) follows the address, so it
  is the new selection's. The alternative weighed: keep the scroll as it is, which leaves the
  visitor in the middle of a new, often shorter list. (owner, T15.)
- **O83. The page's texts and parts the spec left open.** The empty state says "Ничего не
  нашлось" and, while a filter or the search is applied, has a "Очистить фильтры" button doing what
  the row's link does. The row is the kit's `FilterChips`, which moves the focus to the first chip
  after "Очистить фильтры"; T18 moves it to the `<h1>` instead, which gets `tabIndex={-1}` now. The
  row shows the sort and "Очистить фильтры" before the filter counts load. The
  count's noun agrees with the number by a small `shared/lib` helper. (owner, T15.)
- **O84. Four columns from 900 px of the grid.** Revises plan §3.3 (4 from 1024 px, 3 from 768).
  The category column takes about 250 px of the 1200 px container, so at 1440 px the grid is about
  950 px wide, as Lamoda's; with the old steps it showed three cards a row, not AC3's four. Now 4
  from 900 px, 3 from 600, otherwise 2. The category column shows from a 1024 px window; below it
  the grid takes the whole width (phones: T16). The alternatives weighed: keep the steps and
  change AC3; a container wider than the header's 1200 px. (owner, T15.)
- **O85. `hasDiscount` in the address is read only as `true`.** Revises T13's `url-state`: the
  page has no "without a discount" choice, so `?hasDiscount=false` narrowed the list to products
  without a discount while the chip showed off and nothing named it. It is dropped from the state
  like an invalid value (and stays in the address, as unknown ones do). The alternative weighed: a
  third state of the discount chip. (code-reviewer, owner, T15.)
- **O86. The search text in the category links is accepted too.** Extends O78: each row of the
  category list keeps the address's query, `q` included, in its `href`, which recordings keep; the
  list gets no `mp-block`. (security-reviewer, owner, T15.)
- **O87. An empty selection keeps only the chips with values.** With no products the api's counts
  have no attribute values (only the chosen ones), so the colour and attribute chips leave the row
  until the selection has products again. Accepted as is. (qa-tester, owner, T15.)

## Decided at T16

- **O88. The phone drawer's open points.** Below a 1024 px window, where the category column goes
  (O84), the row of chips gives way to the "Фильтры" button; one DOM, switched by CSS. The drawer
  has "Очистить фильтры" as the desktop row does: shown while a filter or the search is applied
  (or chosen in the drawer), it clears them, at once in the address when it has any, and the
  drawer stays open; the sort stays (O5), the applied one in the address and the one chosen in the
  drawer. "Только со скидкой" is a switch row under the accordion, as on Lamoda, not a section of
  its own. A window grown to 1024 px or wider closes the drawer, dropping the draft as any close
  does. Choices in the drawer are a draft: closing it without "Показать N товаров"
  drops them, and it opens again with the address's selection. N is asked for once the choice has
  stood 300 ms; until then, while it loads or when it fails, the button says "Показать товары" and
  still applies. The sort is a section of the drawer and applies with the filters on "Показать N
  товаров" (plan §3.2); it changes no count, so a sort alone keeps N. (owner, T16.)

## Decided at T17

- **O89. The header's links and search stay plain.** The header's category of the current page is
  not highlighted; a query submitted again on `/catalog?q=<same>` is pushed as any other. The
  backlog's "Logo keeps the catalog's scroll" stays in the backlog: T17 does not change the logo.
  (owner, T17.)

## Decided at T18

- **O90. Focus after "Очистить фильтры" in the drawer stays on "Показать".** Plan §3.4's focus on
  the `<h1>` applies to the desktop row (its "Очистить фильтры" and a chip's ×) and the empty
  state. The phone drawer stays open after it (O88) and keeps the focus inside, so the focus goes
  to "Показать" there, as T16 made it. (owner, T18.)
- **O91. A chip's × keeps the focus on the chip.** Revises plan §3.4: the × removes only itself,
  the chip stays (unapplied), so the kit's focus on the chip stays; the focus goes to the `<h1>`
  only after "Очистить фильтры" (the row's and the empty state's). (owner, T18.)

## Decided at T19

- **O92. A sort alone keeps the page indexed.** `noindex, follow` comes only with a filter, `q` or
  `cursor` (plan §3.5); an address whose only parameter is `sort` stays indexable, and its canonical
  address (without parameters) points crawlers to the unsorted page. (owner, T19.)
- **O93. Metadata streams for browsers, blocks for bots; AC23 is measured as a bot.** With
  `cacheComponents`, Next 16 streams `generateMetadata`'s tags into `<body>` for browsers and puts
  them in `<head>` only for its list of HTML-limited bots (Yandex, `Chrome-Lighthouse`, link
  previews; checked on `next build` + `next start`). Next's default list stays: widening it
  (`htmlLimitedBots: /.*/`) makes every request with a user agent skip the prerendered shell, on
  every page of the site (spec 0018's cache too). Lighthouse 12's own user agent is a plain mobile
  Chrome, so a local run finds no description or canonical in `<head>` (SEO 92): AC23 is measured
  with PageSpeed Insights, or locally with `--emulated-user-agent` containing `Chrome-Lighthouse`.
  The task's "uncached data in generateMetadata()" did not show again in `next dev`, and `next
build` passes. (owner, T19.)
- **O94. The description has no price.** O25's "lowest price" would come from the counts'
  `price.min`, the price before the discount, above what the cards and the JSON-LD show. The
  template keeps the count only: "Платья: 8 340 товаров с виртуальной примеркой в Lamoda AI
  Fitting." The lowest price after the discount in the counts is a backlog item. (owner, T19.)
- **O95. The JSON-LD's risks are accepted for AC21.** The `Product`s of the `ItemList` link to
  `/products/<id>`, a 404 until the product page's spec (O7), and `/catalog`'s breadcrumbs have one
  item. Both are checked with Rich Results and Yandex's validator after the deploy. (owner, T19.)
- **O96. Product counts are grouped.** "50 030 товаров", with a no-break space as prices have
  (`formatAmount`): the heading, its live region, the description and the drawer's "Показать N
  товаров". (owner, T19.)

## Decided at T20

- **O97. `Catalog Batch Loaded`, not `Catalog Page Loaded`.** Renames plan §3.6's event before its
  first send, so no history splits: "page" reads as the SDK's page view. It is sent for a batch the
  visitor loads (2, 3, …): not for the first one, which is the page view, and not for the batches
  `ProductGrid` loads by itself to restore the place after "Back". (owner, T20.)
- **O98. The header's categories are not tracked.** O23's "categories" is `catalog.category`, the
  list beside the grid. The header's row is a server component and belongs to a later `header`
  zone. (owner, T20.)
- **O99. No elements beyond plan §3.6.** "Очистить фильтры", the phone's "Фильтры" button and the
  "Дальше" link are not tracked; adding one later splits no history. `catalog.category` has no
  `position`. (owner, T20.)
- **O100. `Catalog Searched` on the first batch of every new `q` on the page.** From the header,
  a link or a reload alike; a start with `?q=&cursor=`, whose batch has no total (O44), sends
  nothing. Replaced by O105 at the review. (owner, T20.)
- **O101. One event per changed choice.** "Показать N товаров" in the drawer sends
  `Catalog Filter Applied` for each filter it changes and `Catalog Sorted` if the sort changed;
  the events say nothing of the row or the drawer. A filter removed (a chip's ×, a value
  unchecked to none) sends `values: 0`. (owner, T20.)
- **O102. `sdkPerVisit` goes to 12.** The categories are new paths, so the SDK sends more page
  views and heatmap clicks (`.claude/rules/analytics.md`, the budget). (owner, T20.)
- **O103. Card hovers count once per page view, as now.** A filter, a sort or a search changes
  the query, not the path, so a card's hover at a position is not sent again after it
  (`useTrackedElement` unchanged). (owner, T20.)
- **O104. The search text leaves the SDK's URL properties.** Revises O78 for analytics: the SDK
  puts the page's address into every event (`$current_url`, `current_url_search`, `$referrer`,
  `$initial_referrer`), so after T20 the text of `q` would go with every catalog event, and a
  search box gets names, phones and addresses typed into it. The `on_track` hook drops the `q`
  parameter (and the fragment) from those properties, the heatmap and page view events' included,
  and `mp_keyword` (the SDK takes an address with "google" in it for a search engine's); the
  profile's `$initial_referrer`, sent by `set_once` past `on_track`, loses it where the SDK
  stores it (the `loaded` callback, before the SDK queues it) and in the `before_send_people`
  hook. Recordings still
  keep it (link `href`s, the replay's own `$current_url`) and Mixpanel no longer has the queries
  themselves: both are backlog items. (owner, T20 review.)
- **O105. `Catalog Searched` counts an act of searching.** Replaces O100. It is sent when the
  first batch arrives (with its total) for a query submitted in the header, the same query again
  included, on the page the header opens (`/catalog?q=` only; a submit counts for a minute, so
  one whose page did not open counts if that page opens within it, by Back too), or
  for the page the document was loaded at by a link, decided at the tab's first catalog mount (navigation type `navigate`,
  the document's address). A move to a category with the same `q`, Back or Forward, a reload and
  a filter change are not searches; a start from a cursor sends nothing (O44). (owner, T20
  review.)

## Decided at the review of PR 3

- **O106. `@tanstack/react-virtual` is pinned to `~3.14.21`.** Plan §3.3 says 3.14.x and the grid
  reads `itemSizeCache`, which the documented API does not name: a minor release could change it
  unseen by the tests, whose virtualizer is mocked. A move to 3.15 is its own change, checked in a
  browser. (owner, PR #96 review.)
- **O107. One counts request per page view.** `generateMetadata` (the description's count on an
  indexed address) and the page's prefetch ask for the same `GET /products/facets`; the server's
  `getProductFacets` keeps one request per path within a render (`cache` of a map, keyed by the
  path's string), so a view costs the visitor's quota one read, not two. (PR #96 review.)

## Decided at the production checks of PR 3

- **O108. Accessibility 97 is accepted for AC23.** Lighthouse (PageSpeed Insights) on production
  gave `/catalog` and `/catalog/dresses` Accessibility 97, not AC23's 100; the owner accepts 97
  and nothing is changed for it. Which audits lost the points was not recorded, so O47's fix or
  backlog item does not apply: this entry is the recorded reason. (owner, 2026-10-22.)

## Decided at T23

- **O109. The measured visit has no second batch.** Production's catalog holds 30 products and a
  batch is 60, so plan §5's "scroll 5 batches" cannot be done. The owner's visit (2026-10-22:
  `/catalog`, 2 filters, a category) is taken as the measurement: pages peak 11 r/s with Next's
  prefetches, 14 in total; photos 10, all in one second; static files 19 in a second; no 429.
  Another batch is one api request and its photos, under `/api/`'s and `/media/`'s own limits.
  So `edge_pages` is 33 r/s with a burst of 33. (owner, T23.)
- **O110. `/media/` takes one batch at once.** The visit's 10 photos are the seed's shared ones;
  60 cards with photos of their own may ask for more than 30 at once. So `edge_media` keeps
  plan §5's rate (30 r/s, 3× the visit) but its burst is one batch, 60 photos, not 30. Random keys
  are still held at 30 a second. (owner, T23.)
- **O111. Static files are told apart by the raw request, not by a location.** Plan §5's own
  location for `/_next/static/` let `/x%2F..%2F_next/static/a` past the page limit: nginx decodes
  it into that location, Next reads the raw path and renders its not-found page. So there is one
  `location /`, and `$edge_pages_key` leaves out of `edge_pages` only a GET or HEAD of
  `/_next/static/` whose raw path nginx and Next cannot read apart (no `%2F`, `%2e`, `..`, `\`) and
  that has no `Range`, `If-Match` or `If-Unmodified-Since` (on which Next renders its 416 and 412
  pages). Everything else counts as a page. `ci-deploy-check.sh`'s slow-upload test holds its
  slots with GETs carrying a body. (owner, T23 security review.)
- **O112. The CSP allows our own scripts and the shells' by hash, without `'strict-dynamic'`.**
  The static shell `cacheComponents` prerenders at build time has no nonce: a production build
  showed Next's script tags and React's inline `$RT` script in it without one, the nonce only on
  what streams per request. Under plan §5's `'strict-dynamic'`, `'self'` no longer counts, and the
  page would not hydrate. Rendering every page per request would keep it, at the cost of the shell
  and of spec 0018's page cache. So `script-src` is `'self'`, the nonce and the hashes of the
  shells' inline scripts, checked against every build by `scripts/check-web-shells.mjs`. Any script
  of our own origin may run: the api's and `/media/`'s answers are not JavaScript and go with
  `nosniff`, so a browser does not run them as scripts. (owner, T24.)

## Decided at T25

- **O113. The spec closes in a pull request of its own, after PR 4's deploy.** AC16 and AC17 are
  checked in production, so only after PR 4 is deployed, and a folder with `Status: done` is not
  edited again. So T25 leaves PR 4 for a PR 5, `docs/0014-close`, opened after the owner's checks
  of PR 4's deploy (AC16, AC17, the phone drawer's accessible name); PR 3's production checks
  (Lighthouse, AC21's validators, AC18's live events) are not repeated. That pull request, not
  PR 4's, carries `Closes #68` and `Closes #71`. T24's open points go into the acceptance record as
  known limits: whether `_global-error.html` is served as a ready file (its inline scripts would
  then be blocked), Next's 416 page under `/_next/static/` carries no CSP of web's, and spec 0019's
  signed storage links need `S3_PUBLIC_ENDPOINT`'s origin in `img-src` (a backlog item for 0019).
  (owner, 2026-10-22.)

## Decided at the review of PR 4

- **O114. The shell check hashes nonced scripts; the visit check waits 5 s.** A nonce written into
  a prerendered shell never equals a request's, so `check-web-shells.mjs` passes only scripts with
  `src` and checks every inline one by its hash, a nonced one too; it reads the attributes pair by
  pair, so `src=` inside another attribute's value does not count. `ci-deploy-check.sh`'s
  `check_visit` waits 5 s, not 3, after the floods: `edge_media` takes 2 s to refill and the
  floods' tail may run late. A plain miss under `/_next/static/` needs nothing: Next answers it
  with a text 404 without rendering a page. (owner, PR #97 review.)

## Decided at the close

- **O115. What plan §8 asked that the close does not do.** Spec 0012 closed first (2026-10-19), and
  a folder with `Status: done` is never edited, so its "Redis holds only rate-limit counters"
  stays as it was written; no living document repeats it, and `CLAUDE.md` describes the filter
  counts' cache in Redis. Redis stays out of the backups: a lost cache only costs a recompute. Of
  plan §8's backlog items every one was removed by the task that closed it; "Product card link"
  stays for its prefetch (O75), "Taint the proxy secret" stays (O76), and the two items O21 left
  ("Page cache in a read-only image", "Cache warm-up on deploy") are spec 0018's (its V13). The
  close adds two backlog items: 0019's `img-src` (O113) and `types {}` in nginx's
  `location ~* ^/api/socket\.io`, the one note of PR #97's fourth review, which the owner moved to
  the backlog. (owner, 2026-10-22.)
