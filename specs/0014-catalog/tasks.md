# 0014 catalog page: tasks

Status: done (2026-10-22): all 24 criteria pass, AC23 with Accessibility 97 (O108; record below).
History, not instructions. Accepted 2026-10-19; amended 2026-10-19 after the check against 0012, 0013 and 0015
(T5, T9, T12, T13, T13a, T20, T23); amended 2026-10-19 at the review of PR 1 (T6, T10, T11, T24,
O40–O48) and its second round (T10); amended 2026-10-21 at T13a (deferred, O76); amended
2026-10-22 at T25 (PR 5 for the close, O113).
Implements [plan.md](plan.md). `👤` marks a step only the owner can do.

## How the work flows

- One pull request per phase, merged with "Rebase and merge" once CI is green; the next branch
  starts from a fresh `main`.
- Each task: brief from `spec-finder`, a time estimate, the code, `finish-task`, the owner's OK, one
  commit that ticks its box. A fresh session (or `/clear`) per task.
- A task that changes what `CLAUDE.md`, a README or `.env.example` describes updates them in its own
  commit. A task that closes a backlog item removes it from `specs/backlog.md` in its commit
  (plan §8).
- PR 2 changes endpoints, the database and config, so `security-reviewer` joins each review.
  `temporal-reviewer` joins T12. The web tasks get `fsd-reviewer`.
- The documents of PR 1 are committed only once the 0013 session no longer uses the shared worktree
  (O1; 0013 closed on 2026-10-19).
- T20 starts after spec 0015's event catalog is on `main` (O35), and PR 3 merges only after T20
  (O40). T11–T12 may ship ahead as their own pull request if the web phase drags on (O46).
- The pull request of PR 5 carries `Closes #68` and `Closes #71` under "Что сделано" (O113).

## PR 1 · `docs/0014-catalog` · documents

- [x] **T1. Spec and clarifications.** `spec.md`, `clarifications.md` (O1–O50).
      Check: owner's acceptance of `spec.md` (given 2026-10-19).
      Commit: `docs(specs): add spec 0014 catalog page and its decisions`
- [x] **T2. Plan.** `plan.md`; O33–O39 recorded at the plan and after the check against 0012,
      0013 and 0015.
      Check: owner's acceptance of `plan.md` (given 2026-10-19).
      Commit: `docs(specs): add the plan of spec 0014`
- [x] **T3. Tasks.** This file.
      Check: owner's acceptance (given 2026-10-19); `npm run format:check`.
      Commit: `docs(specs): add the tasks of spec 0014`
- 👤 merges PR 1.

## PR 2 · `feat/0014-catalog-api` · search, cursor and limits in the api

- [x] **T4. Search column and sort indexes.** The migration `…_product_search`:
      `products.search_vector`, its triggers on `products`, `brands` and `categories`, the GIN index,
      the `lower(article)` index of plan §2.2 and the five sort indexes (plan §2.1, §2.4);
      `searchVector`, the indexes and the note in `schema.prisma`.
      Check: database e2e of the migration (as `migration-color-hex`): a new product's vector holds
      its name, brand and category, and renaming a brand or a category updates its products' vectors;
      `npm run verify`.
      Commit: `feat(api): keep a search vector and sort indexes for products`
- [x] **T5. One SQL builder and full-text search.** The list goes through `toProductSql` (ids, then
      `findMany`, then `count`) and `toProductWhere` is deleted; `q` becomes the tsquery of plan §2.1
      in the list and the facets; the DTO's description of `q`; `openapi.json`.
      Check: the existing listing and facets e2e still pass with their `q` cases moved to word
      search; new cases for "платья", "плат", a brand name, a category name and "плтье" (AC8);
      punctuation-only `q` gives an empty list; an article in any case finds its product; the facets
      e2e made stable under load (O38, backlog "Flaky facets test"); `npm run verify`.
      Commit: `feat(api): search products by words of their name, brand and category`
- [x] **T6. Cursor paging of the product list.** `cursor` in `ProductListQueryDto`,
      `CursorPaginated<T>` with `nextCursor` and a `total` counted only without `cursor` (O44), the
      condition per sort, 400 for a broken cursor, a cursor of another sort or `cursor` with
      `offset` (plan §2.3); `openapi.json`; web's contract test and `productListSchema` accept
      `nextCursor` and a nullable `total`.
      Check: database e2e for each sort: rows inserted and deleted between batches never repeat or
      go missing; ties in the sort key and null ratings are paged through (AC12); a cursor request
      runs no count and answers `total: null`; `offset` still works; `npm run verify`.
      Commit: `feat(api): page the product list by cursor`
- [x] **T7. Category by slug.** `GET /categories/by-slug/:slug` (plan §2.5), `PUBLIC_HANDLERS`,
      `openapi.json`.
      Check: e2e: active and inactive categories answer, unknown → 404, a bad slug → 400;
      `access-markers`; `npm run verify`.
      Commit: `feat(api): find a category by its slug`
- [x] **T8. Filter-count cache.** `ProductFacetsCache` (plan §2.6), `FACETS_CACHE_TTL_SECONDS` in
      `env.ts`, compose files and `.env.example`; backlog "Cache for filter counts" (its cache half).
      Check: e2e: a second identical request does not query the database; a Redis failure still
      answers the counts (AC15); `npm run verify`.
      Commit: `feat(api): cache the product filter counts in redis`
- [x] **T9. Database pool and its timeouts.** `DATABASE_POOL_MAX`,
      `DATABASE_STATEMENT_TIMEOUT_MS`, `DATABASE_CONNECTION_TIMEOUT_MS` (plan §2.7, O36): `env.ts` with
      its refines, `PrismaPg`, the 503 mapping of `57014` and of a pool timeout (also Prisma's
      `P2028`, which the product list's interactive transaction throws when it waits for a
      connection longer than `maxWait` or runs longer than `timeout`; both set explicitly from the
      new timeouts, below `REQUEST_TIMEOUT_MS`; found at T5), compose files,
      `.env.example`, `CLAUDE.md`; the rest of backlog "Cache for filter counts" and backlog
      "Timeouts of the database pool".
      Check: env unit tests; database e2e: a statement over the timeout and a request with the pool
      exhausted both answer 503 `SERVICE_UNAVAILABLE`, and `/health/live` still answers (AC15);
      migrations and the seed are unaffected; `npm run verify`.
      Commit: `feat(api): limit the database pool and slow statements`
- [x] **T10. Development catalog and the query plans.** `seed/large-catalog.ts` (O64),
      `npm run seed:dev-large`, its refusal in production (plan §2.8); `README.md` (how to fill the
      local catalog); the count argument (O43); `EXPLAIN` of every sort and a search on 50 000
      products after `ANALYZE`, among them a two-character beginning (`q=пл`, O53) with its time
      for the list and the facets, recorded in this file (AC14); if it is too slow,
      `MIN_PREFIX_LENGTH` goes up with the owner; backlog "Product list cost".
      Check: the script twice adds nothing the second time; each `EXPLAIN` uses an index with the
      planner not forced, and a later batch of each sort shows its cursor as an `Index Cond`; the
      two-character search's plan and time are recorded; `npm run verify`.
      Commit: `feat(api): add a large development catalog`

      **Recorded (AC14, 2026-10-20).** Local stack, PostgreSQL 18, 50 030 products (the demo 30 and
      `DEV-00001…DEV-50000`, every tenth unrated), 206 790 variations in stock; `ANALYZE`, then
      `EXPLAIN (ANALYZE, BUFFERS)` of the SQL `productPageSql` and `afterCursorSql` build, `LIMIT 61`,
      `enable_seqscan = on`. A later batch starts after the 1000th row of its sort.

      | Query                                   | Plan                                                                                   | Time     |
      | --------------------------------------- | -------------------------------------------------------------------------------------- | -------- |
      | `new`, first / later batch              | Index Scan `products_created_at_id_idx`; later: `Index Cond: ROW(created_at, id) < …`  | 0.04 / 0.03 ms |
      | `price_asc`, first / later              | Index Scan `products_price_asc_id_idx`; later: `Index Cond: price >= k`, id in Filter  | 0.09 / 0.08 ms |
      | `price_desc`, first / later             | Index Scan `products_price_desc_id_idx`; later: `Index Cond: ROW(price, id) < …`       | 0.06 / 0.07 ms |
      | `discount`, first / later               | Index Scan `products_discount_id_idx`; later: `Index Cond: ROW(discount, id) < …`      | 0.04 / 0.04 ms |
      | `rating`, first batch                   | Index Scan `products_rating_id_idx`                                                    | 0.06 ms  |
      | `rating`, later: rated rest             | the same, `Index Cond: rating <= k`, id in Filter (1000 rows of its tie removed)       | 0.53 ms  |
      | `rating`, later: unrated from the start | the same, `Index Cond: rating IS NULL`                                                 | 0.04 ms  |
      | `rating`, later: unrated after cursor   | the same, `Index Cond: rating IS NULL AND id < …`                                      | 0.03 ms  |
      | `q=пл` (8340 matches), `new` first      | Index Scan `products_created_at_id_idx`, the search in Filter (315 rows removed)       | 0.19 ms  |
      | `q=пл`, `new` later batch               | the same with `Index Cond: ROW(created_at, id) < …`                                    | 0.14 ms  |
      | `q=пл`, `price_asc` first               | Index Scan `products_price_asc_id_idx`, search in Filter (7504 rows removed)           | 5.9 ms   |
      | `q=бюстье` (one demo name), `price_asc` | Index Scan `products_price_asc_id_idx`, search in Filter (13 119 rows removed)         | 14.8 ms  |
      | `q=бюстье`, `rating` first              | Index Scan `products_rating_id_idx`, search in Filter (2626 rows removed)              | 2.0 ms   |
      | `q=DEV-01234` (one row), `new` first    | BitmapOr (GIN and `lower(article)`), then a sort of the one row                        | 0.1 ms   |
      | `q=пл`, `total`                         | BitmapOr of `products_search_vector_idx` (GIN) and `products_article_lower_idx`        | 2.3 ms   |
      | `q=пл`, facets: total, discounted       | the same BitmapOr                                                                      | 2.8, 2.5 |
      | `q=пл`, facets: price                   | `products_price_desc_id_idx` both ways, search in Filter                               | 6.0 ms   |
      | `q=пл`, facets: categories, brands      | the BitmapOr, hash join                                                                | 5.9, 5.7 |
      | `q=пл`, facets: sizes                   | the BitmapOr; every variation in stock read once (seq scan)                            | 171 ms   |
      | `q=пл`, facets: attributes              | the BitmapOr; `product_attribute_values_attribute_value_id_idx` per value              | 106 ms   |

      A frequent word walks the sort's index and filters; a rare one goes to the search's indexes
      first, so no page reads the table whole. Over HTTP (curl, api in
      Docker, O63's bounds 300 ms and 1 s): `q=пл` list 184 ms on a fresh connection, then
      10–23 ms with any sort; facets with the cache missed (`пл`, `Пл`, `ПЛ`, three keys, O58)
      127–143 ms, from the cache 5 ms; facets without `q`, missed, 204 ms; rare matches 8–44 ms.
      So `MIN_PREFIX_LENGTH` stays 2. The measurement found the sizes count joining every variation
      to every other of its size (it never finished): fixed before this task by
      `fix(api): count each size once in the filter counts`.

- 👤 merges PR 2; after the deploy, `GET /products?q=платье` on production answers.

## PR 3 · `feat/0014-catalog-web` · the catalog page

- [x] **T11. Catalog routes and a true 404.** `app/catalog/page.tsx`, `app/catalog/[slug]/page.tsx`
      with a placeholder page (`h1` only), `getCategoryBySlug` (`entities/category/server.ts`), the
      redirect of `/`, `/healthz`, `SITE_URL` in the server env and `.env.example`, `metadataBase`
      and the title template (plan §3.1). The fallback through `proxy.ts` is taken only if the status
      check fails, and then it is recorded in `plan.md`. `smoke-test.sh`, `request-loop.sh` and
      `ci-deploy-check.sh`'s `check_request_id` follow the redirect (plan §3.7, O69).
      Check: `curl -I` locally: `/` → 307 `/catalog`, `/catalog` → 200, unknown and inactive slugs →
      404 (AC1, AC2), `/healthz` → 200 with the api stopped; `npm run verify`.
      Commit: `feat(web): add the catalog routes`
- [x] **T12. The greeting and the dev page go.** Removals of plan §3.2 in web and api, with the
      Temporal `hello` workflow (O33); the e2e and `ci-deploy-check.sh` use `GET /categories`;
      the web health check (O34, plan §3.7); `openapi.json`;
      the nginx comment; the docs and `.claude/` files of plan §3.7, `CLAUDE.md`; backlog "Remove
      greeting", "Flaky handoff test" and "Retry policy of `hello`".
      Check: `rg -i 'hello|greeting|dev-catalog|dev/catalog'` finds only specs, history and the
      unrelated (AC6); `npm run verify`; `docker compose up -d --build --wait web` is healthy.
      Commit: `refactor(web): remove the greeting and the dev catalog`
- [x] **T13. Catalog data on the server and in the URL.** `productInfiniteOptions` and its server
      twin, `prefetchInfinite`, `_pages/catalog/model/url-state.ts`, the server part of the page
      with the first batch (plan §3.2, §3.3). With products on `/catalog`, `smoke-test.sh` and
      `request-loop.sh` check that page's data from the api, not only T11's static heading and
      `/catalog/dresses` (O69, plan §3.7).
      Check: Vitest round trips of the URL state (unknown params dropped, `q` cut to 100, the
      sign-in's `error` left in the address for the login modal); the page renders the first batch
      from the server with no browser request (AC7, part); `npm run verify`.
      Commit: `feat(web): load the catalog from the url on the server`
- [x] **T13a. Tainted proxy secret, deferred.** The flag runs `app` on `react@experimental`, so
      the taint is not taken (O76, plan §3.2); backlog "Taint the proxy secret" stays, its condition
      updated. Documents only.
      Check: `npm run format:check`.
      Commit: `docs(specs): defer the proxy secret's taint`
- [x] **T14. The virtual grid.** `@tanstack/react-virtual` (version pinned per plan §3.3, approved
      in the commit message if it needs an install script); `widgets/product-grid`: rows by width,
      loading the next batch, the "Дальше" link, `?cursor=` rendering, return to the place, the
      list's roles (`aria-setsize`, `aria-posinset`); card links `/products/<id>` (O7); backlog
      "Product card link", whose prefetch part stays for the product page (O75).
      Check: Vitest of the column count, the next-batch trigger and the scroll restore;
      `curl /catalog` holds the first batch and "Дальше" (AC22); `qa-tester` on the dev catalog
      (AC11, AC13); `npm run verify`.
      Commit: `feat(web): scroll the catalog in a virtual grid`
- [x] **T15. Filters, sort and the empty state.** `widgets/catalog-filters` (desktop row of chips,
      O5), the category list in `<aside>`, breadcrumbs, the title with the count, the empty state
      (plan §3.2); compared with the owner's Lamoda screenshots.
      Check: Vitest of applying, a chip's × and "Очистить фильтры" against the URL (AC7, AC10); `qa-tester`
      at 1440 px (AC3); `npm run verify`.
      Commit: `feat(web): filter and sort the catalog`
- [x] **T16. Filters on phones.** The `*FilterPanel` variants in `entities/product`, the drawer with
      the accordion and "Показать N товаров", two columns (O6); the panels on `/ui-kit`; backlog
      "Mobile filters".
      Check: Vitest of the drawer applying to the URL; `qa-tester` at 375 px (AC4); `npm run verify`.
      Commit: `feat(web): show the catalog filters in a drawer on phones`
- [x] **T17. Header search and categories.** `features/header-search` opens `/catalog?q=` (O15), with
      the placeholder "Товар, бренд или артикул" (O14); the header categories become links (O16).
      Check: Vitest of both (AC9); `qa-tester` from `/privacy`; `npm run verify`.
      Commit: `feat(web): search and browse the catalog from the header`
- [x] **T18. Accessibility.** Landmarks, one `h1`, the live region, focus after "Очистить фильтры", the
      keyboard pass (plan §3.4).
      Check: Testing Library roles, names and the live region; `qa-tester` keyboard-only pass and a
      local Lighthouse Accessibility run (AC23, part); `npm run verify`.
      Commit: `feat(web): make the catalog readable by screen readers`
- [x] **T19. SEO.** `generateMetadata`, canonical and `noindex`, Open Graph and Twitter, the image,
      JSON-LD, `sitemap.ts`, `robots.ts` (plan §3.5). `next dev` logs "uncached data in
      generateMetadata()" (blocking-prerender-metadata-dynamic) for `/catalog`, from T11's
      `await connection()` in `generateCatalogMetadata`, though the answer is 200 (seen at T12):
      find on `next build` + `next start` whether the title is in `<head>` of the first bytes, and
      fix it.
      Check: Vitest of the metadata per address, the JSON-LD (escaped `<`), the sitemap with a failed
      api and `robots.ts` (AC19, AC20); a local Lighthouse SEO run; `npm run verify`; the web image
      builds with no services running (AC24).
      Commit: `feat(web): describe the catalog to search engines`
- [x] **T20. Catalog analytics.** After 0015's catalog is on `main` (O35): the events and elements
      of plan §3.6 as entries of 0015's catalog, with descriptions and frequencies, and the calls in
      the page and widgets.
      Check: 0015's catalog tests pass; Vitest with a mocked `track`: each event once, no search
      text and no product id, nothing without consent (AC18); `npm run verify`.
      Commit: `feat(web): track how visitors use the catalog`
- 👤 merges PR 3; after the deploy runs Lighthouse on `/catalog` and one category, Google's Rich
  Results and Yandex's validator, and checks Mixpanel's live events (AC18, AC21, AC23).

## PR 4 · `feat/0014-catalog-edge` · offset out, page limits, CSP and closing

- [x] **T21. No offset in the product list.** Plan §4: the DTO, `openapi.json`, web's
      `ProductListQuery`.
      Check: e2e: `offset` on `/products` → 400, other lists keep it; `npm run verify`.
      Commit: `refactor(api): page the product list by cursor only`
- [x] **T22. Measuring a catalog visit.** `scripts/measure-page-requests.mjs` with its `node --test`
      (plan §5).
      Check: the script's tests on a sample log; `npm run verify`.
      Commit: `feat(deploy): measure the page requests of one visit`
- 👤 makes the visit and runs the script on the server; the numbers go into T23.
  Measured 2026-10-22 (O109): pages peak 11/s, 14 in total; photos 10, 10/s; static 19/s; no 429.
- [x] **T23. Rate limit for pages and media.** The `edge_pages` and `edge_media` zones from the
      measurement, `/_next/static/` and `location = /healthz` (plan §5, O39); the fallback to `/`
      in `deploy/compose/app.yml`'s web health check goes, and `deploy/README.md`'s paragraph on
      a rollback before PR 3 then says such a rollback no longer becomes healthy (O70);
      `ci-deploy-check.sh`'s connection test on `/_next/static/`; `deploy/README.md` "Лимиты nginx";
      backlog "Rate limit for web pages".
      Check: `ci-deploy-check.sh` in CI: a flood of `/catalog` and of `/media/` → 429 in the api's
      format, one visit stays under (AC16, local half); `npm run verify`.
      Commit: `feat(deploy): limit page and media requests per client`
- [x] **T24. Content Security Policy.** `web/proxy.ts` with the nonce, the JSON-LD's nonce, nginx's
      header handling for pages (plan §5); `CLAUDE.md`; backlog "Full CSP for web".
      Check: Vitest of the header; the deploy check sees the header on `/catalog` and only
      `frame-ancestors` on `/api/`; the browser console shows no violation locally, with and without
      consent, with the owner's placeholder Mixpanel token in `.env` so the SDK and its recorder
      load (O45); `npm run verify`.
      Commit: `feat(web): add a content security policy`
- 👤 merges PR 4; after the deploy, checks the page limit and the console of `/catalog` in
  production (AC16, AC17), and checks that the phone drawer's dialog has an accessible name (a
  suspicion of T18's QA). Lighthouse (AC23), the validators (AC21) and the live events (AC18) were
  checked after PR 3's deploy (2026-10-22) and are not repeated (O113).

## PR 5 · `docs/0014-close` · closing

- [x] **T25. Close the spec.** The production checks of PR 3 and PR 4 from the owner, the
      acceptance record below with T24's open points as known limits and the backlog item for
      0019's `img-src` (O113), every file gets `Status: done`, `CLAUDE.md` and the READMEs as
      plan §8. Starts from a fresh `main` after PR 4's deploy.
      Check: every criterion has evidence; `npm run verify`.
      Commit: `docs(specs): close spec 0014`

## Acceptance record

Production checks on 2026-10-22 by the owner, on two deploys. PR 3's (#96): Lighthouse in
PageSpeed Insights on `/catalog` and `/catalog/dresses`, Google's Rich Results test,
validator.schema.org and Yandex's microdata validator, Mixpanel's live events, one
`GET /products/facets` per view in the api's log (O107), and the 1440 and 375 px screenshots
compared with Lamoda's catalog. PR 4's (#97, main `fb084e6`, `/health/live` answered that
version): `curl -I` of the pages, `/api/` and `/media/`, a flood of `/catalog`, an ordinary visit
with the Network panel open, the console of `/catalog` with and without consent, and the phone
drawer's accessible name at 375 px. The local criteria rest on the checks of the tasks named and
the tests below. `npm run verify` on the closing commit passed.

| AC   | Result | Evidence                                                                                                                                                                                                                                                                                                                                                                    |
| ---- | ------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| AC1  | pass   | Production: `/` → 307 `/catalog` (`smoke-test.sh` in CD). Locally: T11's `curl -I`; `catalog-page.test.tsx` with and without a slug.                                                                                                                                                                                                                                        |
| AC2  | pass   | T11's `curl -I` of an unknown and an inactive slug → 404 (`web/proxy.ts`, O65); `category-proxy.test.ts` "rewrites a missing category to the not-found path".                                                                                                                                                                                                               |
| AC3  | pass   | Owner compared the 1440 px screenshot with Lamoda's (2026-10-22); T15's `qa-tester`; `catalog-filters.test.tsx`, `catalog-heading.test.tsx`, `columns.test.ts`.                                                                                                                                                                                                             |
| AC4  | pass   | Owner compared the 375 px screenshot with Lamoda's; the discount is a switch row, not an accordion (O88); T16's `qa-tester`; `catalog-filters.drawer.test.tsx`, `catalog-filters-drawer.test.tsx`.                                                                                                                                                                          |
| AC5  | pass   | `catalog-product-card.test.tsx`, `product-grid.test.tsx`: `/products/<id>`; `catalog-product-card.prefetch.test.tsx` passes `prefetch` to the link, and `widgets/product-grid` sets it `false` while that page is missing (O75).                                                                                                                                            |
| AC6  | pass   | T12's `rg`: only specs, history and unrelated words; `openapi.json` has no `/hello`; web's health check is `/healthz`, the `/` fallback gone at T23 (O70); T11's `/healthz` 200 with the api stopped.                                                                                                                                                                       |
| AC7  | pass   | `url-state.test.ts`, `catalog-browser.url.test.tsx`, `catalog-filters.test.tsx`; T15's `qa-tester` applies, reloads and opens a new tab.                                                                                                                                                                                                                                    |
| AC8  | pass   | `product-listing.e2e-spec.ts` with the real stemmer: "платья", "плат", a brand, a category, an article in any case, "плтье" empty (T5).                                                                                                                                                                                                                                     |
| AC9  | pass   | `header-search.test.tsx`, `header-search.submitted.test.tsx`, `header-categories.test.tsx`; T17's `qa-tester` from `/privacy`.                                                                                                                                                                                                                                              |
| AC10 | pass   | `catalog-browser.test.tsx`: the empty state and its "Очистить фильтры".                                                                                                                                                                                                                                                                                                     |
| AC11 | pass   | T14's `qa-tester` on the 50 000-product dev catalog: scrolled to the last product, the DOM held a few rows beyond the visible; `product-grid.test.tsx`.                                                                                                                                                                                                                     |
| AC12 | pass   | `product-cursor.e2e-spec.ts`: rows inserted and deleted between batches, per sort, never repeat or go missing (T6).                                                                                                                                                                                                                                                         |
| AC13 | pass   | T14's `qa-tester`; `product-grid.restore.test.tsx`, `scroll-memory.test.ts`.                                                                                                                                                                                                                                                                                                |
| AC14 | pass   | T10's `EXPLAIN` table above: every sort and a search use an index unforced, later batches show the cursor as `Index Cond`.                                                                                                                                                                                                                                                  |
| AC15 | pass   | `product-facets-cache.e2e-spec.ts` (the second request does not reach the database, Redis down still answers); `database-timeouts.e2e-spec.ts` (T9): statement timeout and exhausted pool → 503, `/health/live` answers.                                                                                                                                                    |
| AC16 | pass   | Production: 100 parallel `/catalog` from the owner's Mac → 90 × 200 `text/html`, 10 × 429 `application/json`; an ordinary visit (`/catalog`, filters, a category) had no 429. CI: `ci-deploy-check.sh`'s floods and visit (T23). Limits from the measured visit (O109, O110).                                                                                               |
| AC17 | pass   | Production: `curl -I` shows one CSP of web's on `/catalog` and `/catalog/dresses` (nonce, `$RT` hash, Mixpanel and Sentry in `connect-src`, `frame-ancestors 'none'`), only `frame-ancestors` on `/api/`; the console of `/catalog` shows no violation without consent and after «Принять». `policy.test.ts`, `proxy.test.ts`, `check:web-shells` in `verify` (O112, O114). |
| AC18 | pass   | Production: Mixpanel's live events show each event and element, no `q` text, nothing without consent. `catalog-browser.analytics.test.tsx`, `catalog-filters.analytics.test.tsx`, `product-grid.analytics.test.tsx`, `catalog.test.ts` (0015's checks).                                                                                                                     |
| AC19 | pass   | `metadata.test.ts` per address, `preview-image.test.ts`; Lighthouse SEO 100 in production (the title, description, canonical).                                                                                                                                                                                                                                              |
| AC20 | pass   | `sitemap.test.ts` (with a failed api), `robots.test.ts`.                                                                                                                                                                                                                                                                                                                    |
| AC21 | pass   | Production: Rich Results, validator.schema.org and Yandex's validator with no errors; `json-ld.test.ts` (`<` escaped), `catalog-json-ld.test.tsx` (the nonce).                                                                                                                                                                                                              |
| AC22 | pass   | T14's `curl /catalog`: the first batch and "Дальше" in the HTML; `product-grid.traversal.test.tsx`.                                                                                                                                                                                                                                                                         |
| AC23 | pass   | Production: SEO 100, Accessibility 97 on both pages, accepted by the owner (O108); the phone drawer's dialog has an accessible name. T18's `qa-tester` keyboard pass; the live regions and focus in `catalog-browser.test.tsx`, `product-grid.test.tsx`.                                                                                                                    |
| AC24 | pass   | `npm run verify` on the closing commit; CI of `fb084e6` built the web image with no api, Redis or database.                                                                                                                                                                                                                                                                 |

Known limits (T24's open points, O113):

- Whether nginx or Next serves `_global-error.html` as a ready file was not seen; if it is, its
  inline scripts carry no nonce and the CSP blocks them (`check:web-shells` skips that page).
- Next's 416 page under `/_next/static/` (a `Range` the file cannot serve) carries no CSP of web's,
  since `proxy.ts` does not run there; nginx still adds its `frame-ancestors 'none'`.
- Spec 0019's signed storage links need `S3_PUBLIC_ENDPOINT`'s origin in `img-src`: backlog
  "Signed links in the CSP".
