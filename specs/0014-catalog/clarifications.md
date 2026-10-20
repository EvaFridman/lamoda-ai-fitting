# 0014 catalog page: clarifications

Status: accepted (2026-10-19); amended 2026-10-19 at the plan: the whole greeting goes (O33), web's
own health route (O34), Lamoda's layout of applied filters and the breadcrumbs (O5), search by
article (O14); amended 2026-10-19 after the check against 0012, 0013 and 0015 (O35–O39);
amended 2026-10-19 at the review of PR 1 (O40–O48), its second round (O5's description, O46,
O49, O50) and its third round (O49's lag).

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
  - "Catalog Page Loaded": the number of the batch.
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
  browser through props. This closes backlog "Taint the proxy secret".
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
  start. T24 checks the browser console locally with a token of a Mixpanel development project,
  which the owner puts into `.env`. (Note 6.)
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
