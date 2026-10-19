# 0014 catalog page: clarifications

Status: accepted (2026-10-19); amended 2026-10-19 at the plan: the whole greeting goes (O33), web's
own health route (O34), Lamoda's layout of applied filters and the breadcrumbs (O5), search by
article (O14); amended 2026-10-19 after the check against 0012, 0013 and 0015 (O35–O39).

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
  Filters, the sort and the search are query parameters. `/` redirects permanently to `/catalog`.
- **O4. Unknown category.** A slug that names no category, or an inactive one, answers 404.
- **O5. Layout, desktop.** As on Lamoda's catalog (the owner's screenshots and saved page of
  2026-10-19), from top to bottom:
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
  makes no product repeat or go missing. The answer carries the total and the next cursor (none on
  the last batch). Only the product list changes; the other lists keep limit and offset. The list
  accepts offset until the web that uses the cursor is deployed, and a later release removes it.
  This amends 0004 E5 and E45 for the product list.
- **O12. Back to the same place.** Going back to the catalog (from a product, for example) shows the
  batches already loaded, at the same scroll position.
- **O13. A large catalog for testing only.** The production seed stays as it is (33 products). A
  separate development-only script fills the local database with about 2000 generated products made
  from the existing photos, for QA of scrolling and for measuring the indexes.

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
  - `robots.txt` points to the sitemap and keeps `/ui-kit` out.
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
    one category.
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
