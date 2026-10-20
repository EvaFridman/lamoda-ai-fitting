# 0014 catalog page: plan

Status: accepted (2026-10-19); amended 2026-10-19 after the owner's Lamoda references (O5, O14)
and after the check against 0012, 0013 and 0015 (O35–O39, §1, §2.7, §3.2, §3.6, §3.7, §5, §8);
amended 2026-10-19 at the review of PR 1 (O40–O48; the article test inside `toProductSql` and
the price indexes, §2.2, §2.4) and its second round (the cursor conditions' index bounds, §2.3;
the count from the facets, O49, §3.3, §3.4) and its third round (the rating cursor in two
branches, §2.3; `aria-setsize` bounded by the loaded cards, §3.4).

How `spec.md` (AC1–AC24) is built. Decisions: `clarifications.md` (O1–O50).

## 1. Pull requests and release order

Four pull requests (O2). Each one leaves production working with the previous release on either
side of a blue-green switch. One window is accepted: during PR 3's switch the old release's home
page may show the greeting's error for a few seconds (O48). PR 3 merges only after spec 0015's
event catalog is on `main` and T20 is done (O40); T11–T12 may ship ahead as their own pull request
(O46). Once spec 0012 is on `main`, PR 2's deploy, which brings a migration,
stores a database copy before migrating, and a failed copy stops it (0012 P3). PR 2 and later edit
`ci-deploy-check.sh` and `CLAUDE.md`, which 0012 also edits. Whichever lands second rebases.

| PR  | Contents                                                                                             | Why this order                                                               |
| --- | ---------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| 1   | `spec.md`, `clarifications.md`, `plan.md`, `tasks.md`                                                | —                                                                            |
| 2   | api: search, cursor, `GET /categories/by-slug/:slug`, indexes, facet cache, pool, dev catalog script | Additive only. The deployed web still sends `offset` and uses `/hello`       |
| 3   | web: the catalog, header, removals (web and api `/hello`, O33), `/healthz`, analytics, SEO           | Needs PR 2 in production. `/hello` goes with the web that stops calling it   |
| 4   | Removal of `offset` from `/products`; web CSP; nginx page limit                                      | Needs PR 3 in production: the measurement (O24), and no web sending `offset` |

## 2. api (PR 2)

### 2.1 Search column (O14, O17)

A migration `…_product_search`:

- adds `products.search_vector tsvector NOT NULL DEFAULT ''`;
- fills it, and keeps it in step with triggers:
  - `products` `BEFORE INSERT OR UPDATE OF name, brand_id, category_id` sets
    `setweight(to_tsvector('russian', name), 'A') || to_tsvector('russian', brand.name) || to_tsvector('russian', category.name)`;
  - `AFTER UPDATE OF name` on `brands` and `categories` refreshes their products' vectors.
    A generated column cannot read other tables, hence the triggers.
- creates the index `products_search_vector_idx USING GIN (search_vector)`.

Prisma models the column as `searchVector Unsupported("tsvector") @default(dbgenerated("''::tsvector"))`:
the column's own NOT NULL and default, so `prisma migrate diff` finds no drift, and Prisma's `create`
does not need it (found at T4: an optional mapping made the diff drop NOT NULL). `schema.prisma`
notes that the triggers own it.

The query: `q` is split into tokens of letters and digits (`\p{L}\p{N}`, others are separators).
Each token becomes a lexeme, the last one with `:*` when it has two characters or more (O53), joined by
`&`; stop words drop out (O52). The input is NFC-normalized first. The result goes to
`to_tsquery('russian', $1)` as a bound parameter. Only those characters reach it, so no tsquery
syntax can be injected. A `q` with no token answers an empty list (the DTO keeps the 1–100
character rule, 0004 E45 / 0010 L11). "плат:*" matches "платье" because the stemmer cuts both to
"плат". AC8's typo case ("плтье") finds nothing, because no lexeme starts with "плт".

### 2.2 One SQL builder for the list (O11, O17)

Today the list uses Prisma's `findMany` with `toProductWhere`, and the facets use raw SQL with
`toProductSql`: two builders that must agree (`listing/product-filter.ts`). Full text and keyset
conditions do not fit Prisma's `where`. So the list moves to the same raw builder:

1. `$queryRaw`: `SELECT p.id … FROM products p WHERE <toProductSql> AND <cursor condition> ORDER BY <sort> LIMIT limit+1`.
   The extra row only tells whether a next cursor exists.
2. `findMany({ where: { id: { in: ids } }, include: LIST_ITEM_INCLUDE })`, reordered in JS to the ids'
   order.
3. `total`: `SELECT count(*)` with the same filter, in the same transaction (repeatable read, as
   today's `$transaction`). It runs only for the first batch, a request without `cursor`. A
   request with `cursor` answers `total: null` (O44).

`toProductWhere` is deleted once nothing uses it. `q` in `toProductSql` becomes
`(p.search_vector @@ to_tsquery(…) OR lower(p.article) = lower(q))` (O14). The article test is
backed by an index on `lower(article)` in the same migration. Because both conditions live in
`toProductSql`, the list, its `total` and the facets agree for every `q`.

### 2.3 Keyset cursor (O11)

- **Cursor.** base64url of JSON `{ s: sort, k: <sort key value>, id }`:
  - `price` is a decimal string;
  - `discount` is an integer;
  - `rating` is a decimal string or `null`;
  - `createdAt` is ISO with milliseconds.
    It is validated with zod on the way in. A malformed cursor, or one of another sort, answers 400
    `VALIDATION_FAILED` on `cursor`.
- **Condition per sort.** Rows equal on the key fall back to `id desc`:
  - `new`: `(p.created_at, p.id) < (k, id)`.
  - `price_asc`: `p.price >= k AND (p.price > k OR p.id < id)`. Not a row comparison: the key goes
    up and the id goes down. The redundant `p.price >= k` gives the index scan its start (an
    `Index Cond`), so a deep batch does not read the index from its beginning.
  - `price_desc` and `discount`: `(key, p.id) < (k, id)`.
  - `rating desc nulls last`: while `k` is not null, two queries in turn, since an `OR` with
    `IS NULL` gives the scan no start:
    1. `p.rating <= k AND (p.rating < k OR p.id < id)`, limited to `limit+1`;
    2. if that returns fewer rows than `limit+1`, `p.rating IS NULL` for the rest, from the
       beginning of the unrated rows.
       Unrated rows come strictly after every rated one, so the order and the answer are those of one
       query. Once `k` is null, a single `p.rating IS NULL AND p.id < id`. Each branch is an
       `Index Cond` on `(rating DESC NULLS LAST, id DESC)`.
  - Every condition returns the same rows as its plain form. AC14 checks that each one is an
    `Index Cond` in the plan, not only that an index is used.
- **Query and answer.** `?cursor=` and `?limit=`. The answer is `{ items, total: number | null,
nextCursor: string | null }`; `total` is a number only without `cursor` (O44).
  - A new `CursorPaginated<T>` and `ApiCursorPaginatedResponse` sit in `common/pagination/`.
  - `offset` stays accepted until PR 4. A request with both `cursor` and `offset` answers 400.
  - Other lists keep `PaginationQueryDto`.

### 2.4 Indexes (O17)

The same migration as 2.1 adds:

- `(created_at DESC, id DESC)`;
- `(price ASC, id DESC)` for `price_asc` and `(price DESC, id DESC)` for `price_desc`. Both sorts
  end with `id desc` (0004 E45), so one index scanned both ways cannot serve them both;
- `(discount DESC, id DESC)`;
- `(rating DESC NULLS LAST, id DESC)`.

Each list index is a plain b-tree; there is no `CONCURRENTLY`, because a Prisma migration runs in a
transaction and the table is small; it waits for its locks at most 5 s (`lock_timeout`, O51), then
fails and stops the deploy. A later large table would need a separate step, noted in
`schema.prisma`. The GIN index and the five sort indexes are also `@@index` entries in `schema.prisma`
(with their names, `map`), or the next `prisma migrate dev` would drop them; `rating`'s NULLS LAST
and the `lower(article)` index of 2.2 live in the migration only (found at T4). AC14 is checked
with `EXPLAIN` on the dev catalog (2.8).

### 2.5 Category by slug (O3, O4)

`GET /categories/by-slug/:slug`, `@Public()`, answers the category or 404 `NOT_FOUND`.

- It is added to `PUBLIC_HANDLERS` (`test/access-markers.e2e-spec.ts`).
- The slug is checked by the same rule as `@IsSlug`; anything else answers 400.
- Inactive categories are returned too. The web page answers 404 for them (O4), because the api's
  catalog reads do not hide inactive rows elsewhere either.

### 2.6 Facet cache (O18)

`ProductFacetsCache` (`products/listing/facets-cache.ts`) wraps `countFacets`:

- **Key.** `facets:v1:<sha256 of the normalized filter JSON>`. The arrays are sorted; `q` goes in
  as sent (O58), since the article test compares the whole `q` ("AB-12" and "ab 12" have the same
  tokens but not the same answer; found at T5) and JavaScript's lower case is not the database's.
- **Value.** The JSON answer, kept for `FACETS_CACHE_TTL_SECONDS` (default 60).
- **Redis.** The shared client (`REDIS`, `redis/redis.module.ts`; 1 s `commandTimeout`).
- **Redis failure.** A failed read or write is logged once per minute and counted as a miss, so
  facets still answer without Redis.
- **No invalidation.** Catalog writes are `@Closed()`, and the seed runs before the switch. A row
  changed by hand shows within the TTL.

### 2.7 Database pool and statement timeout (O18)

`PrismaPg` gets `max: DATABASE_POOL_MAX` (default 10, at most 50),
`statement_timeout: DATABASE_STATEMENT_TIMEOUT_MS` (default 5000) and
`connectionTimeoutMillis: DATABASE_CONNECTION_TIMEOUT_MS` (default 2000, O36). Both are less than
`REQUEST_TIMEOUT_MS`, which stays at 6000 or more (CLAUDE.md, storage).

- A pool that gives no connection in time throws; it maps to 503 `SERVICE_UNAVAILABLE` like
  `57014`.
- The backup job of spec 0012 has its own connection (`pg_dump`) and is not affected.
- This closes backlog "Timeouts of the database pool".

- `env.ts` refines `statement < request timeout` and `connection < request timeout`.
- A cancelled statement (`57014`) maps to 503 `SERVICE_UNAVAILABLE` in `AppExceptionFilter`.
- The migrations and the seed use their own connection without the timeout: a migration may run
  longer.
- New variables go to `.env.example`, `docker-compose.yml` (`x-api-env`) and
  `deploy/compose/app.yml`.

### 2.8 Development catalog (O13)

`api/src/seed/dev-catalog.ts`, run as `npm run seed:dev-large` (`nest start --entryFile
seed/dev-catalog`), creates the number of products given as its argument, 2000 by default
(`npm run seed:dev-large -- 50000` for AC14, O43):

- the articles are `DEV-00001…`;
- names, brands, categories, prices, discounts, ratings and sizes are combinations of the seed's;
- the image keys are the seed's existing ones, so nothing is uploaded.

It only adds missing articles, as the seed does. It refuses to run when `NODE_ENV=production`. It is
not in the runtime image's commands.

## 3. web (PR 3)

### 3.1 Routes

| Route                         | Source                                                                             |
| ----------------------------- | ---------------------------------------------------------------------------------- |
| `/`                           | `redirects()` in `next.config.ts`: `/` → `/catalog`, `permanent: false` (307, O42) |
| `/catalog`                    | `app/catalog/page.tsx` → `_pages/catalog`                                          |
| `/catalog/[slug]`             | `app/catalog/[slug]/page.tsx` → same page with a category                          |
| `/catalog/opengraph-image`    | `app/catalog/opengraph-image.tsx` (`next/og`)                                      |
| `/sitemap.xml`, `/robots.txt` | `app/sitemap.ts`, `app/robots.ts`                                                  |
| `/healthz`                    | `app/healthz/route.ts`, plain 200 (O34). nginx answers 404 for it in PR 4          |

The root layout gets `metadataBase` (from a new server env `SITE_URL`, `https://lamoda-ai-fitting.ru` in
production, `http://localhost:3000` in `.env.example`) and the title template `%s — Виртуальная примерка | Lamoda AI Fitting` (O25).

**404 status (AC2).** A page that streams has already sent 200 before it learns the slug is
unknown. So the slug is resolved before anything streams:

- `generateMetadata` and the page call `getCategoryBySlug`, a server function cached per request
  with `React.cache`, outside `<Suspense>`;
- `notFound()` is called there;
- the page awaits `connection()` first, so the build does not reach the api.

This is the main risk of the plan (§6). If Next 16 with `cacheComponents` still streams the shell
first, `proxy.ts` resolves the slug through `apiFetch` and rewrites to the 404 page.

### 3.2 FSD slices

- **`_pages/catalog`.** The page. It owns the URL state and the requests.
  - `model/url-state.ts` parses and serializes `searchParams` ⇄ `ProductListQuery` without
    `offset`:
    - array params are comma lists;
    - unknown and invalid params are dropped from the catalog's state. The page never rewrites
      the address to drop them, so the sign-in's `error` and `error_description` (0013 N54) stay
      for the login modal, which removes them itself. A test covers a failed sign-in on
      `/catalog?brandId=…`;
    - `q` is cut to 100.
  - `ui/catalog-page.tsx` is the server part: category lookup, prefetch, `HydrationBoundary`,
    JSON-LD and the "Дальше" link.
  - `ui/catalog-browser.tsx` is the client part.
- **`widgets/catalog-filters`.** The desktop row of chips (O5): `ProductSortFilter` first, then
  0009's filters (their `FilterDropdown` already shows an applied value in black with a ×), then
  `DiscountFilter`, and the "Очистить фильтры" link while any filter is applied. No `FilterChips`
  row. The phone drawer (O6).
  - The drawer uses the kit's `Drawer` + `Accordion`, with the inner `CheckboxFilter`,
    `PriceFilter` and `SortFilter` in place of the dropdowns.
  - The entity gains `*FilterPanel` variants of each filter, which render the same body without
    `FilterDropdown`. They remain display-only (0009 K7).
  - Choices in the drawer apply on "Показать N товаров". N comes from the facet count of the pending
    selection (`useProductFacets` with the draft filters).
- **`widgets/product-grid`.** The virtualized list (3.3).
- **`entities/category`.** It gains `getCategoryBySlug` (server) and a schema check. The header
  categories become `<Link href="/catalog/<slug>">` (O16).
- **`features/header-search`.** `search()` pushes `/catalog?q=<query>` (O15).
- **Removed (O8, O33):**
  - `_pages/home`, `widgets/greeting`, `entities/greeting`, `_pages/dev-catalog`, `app/dev`;
  - in api: `hello/`, `temporal/activities/hello.activities.ts`, `temporal/workflows/hello.workflow.ts`
    and their exports and specs.

**Tainted secret (O37).** `@/shared/api/server` calls
`experimental_taintUniqueValue` on `PROXY_SECRET` when it reads the server env. Passing the
value to a client component then throws. This needs `experimental.taint: true` in
`next.config.ts`; the task checks it against Next 16's docs in `node_modules/next/dist/docs/`. A
test renders a client component given the secret and expects the error.

### 3.3 Infinite list and virtualization (O10, O12)

- **Library.** `@tanstack/react-virtual` 3.14.x. 3.14.21 is current (2026-10-16); the task pins the
  newest release that is at least a few days old when it installs. The peer is React ≥16.8, and it
  has one dependency (`@tanstack/virtual-core`).
- **Data.**
  - `productInfiniteOptions(query)` uses `infiniteQueryOptions`:
    - the key is `['products', 'infinite', productListQuery(query)]`;
    - `initialPageParam: null`;
    - `getNextPageParam: (last) => last.nextCursor`.
      It lives in `entities/product/api/queries.ts`, with a server twin in `server-queries.ts`.
  - `productListSchema` gains `nextCursor` and a nullable `total`, and the contract test follows the
    OpenAPI document. The page does not use the list's `total`: the count in the title and
    `aria-setsize` come from the facets' `total` on every address, `?cursor=` included (O49).
  - `prefetch` (`@/shared/api/server`) gains `prefetchInfinite`: the first page only, with the same
    "returns a failure" rule.
- **Grid.** `useWindowVirtualizer` over rows:
  - the column count follows the container's width (`ResizeObserver`: 4 from 1024 px, 3 from 768,
    otherwise 2);
  - the row height is measured (`measureElement`);
  - `overscan: 2` rows.
    When the last virtual row is within 2 rows of the end and `hasNextPage`, it calls
    `fetchNextPage` (one at a time).
- **Without JavaScript and for crawlers (O29).**
  - The server renders the first batch as a plain `<ul>`, which hydrates into the virtual list.
  - `?cursor=<c>` renders the batch after `c` as the first batch.
  - Under the list, `<a href="?…&cursor=<next>" rel="next">Дальше</a>` is visible without JS. With
    JS it is visually hidden, but it stays in the DOM and in the tab order last.
- **Back to the place (O12).**
  - The query cache keeps the loaded pages: `gcTime` stays at the default 5 min, `staleTime` at
    60 s.
  - Before leaving, the scroll offset is written to `sessionStorage` (`catalog-scroll:<path+query>`,
    wrapped in try/catch).
  - On return, `initialOffset` and `scrollToOffset` restore it, after the cached pages render.
  - Next's own scroll restoration is turned off for this page only (`scroll={false}` on the
    filters' `router.replace`).

### 3.4 Accessibility (O30)

- The landmarks come from the existing `<Header>` (header), the footer and the breadcrumbs
  (`<nav><ol>`, already in the kit). The page adds `<main>` and `<aside aria-label="Категории">`.
  There is one `<h1>`: the category name or "Каталог".
- The grid is `<ul aria-label="Товары">`, each card in an `<li aria-setsize={max(facets.total, loaded)} aria-posinset={i+1}>` (O49). The cached count can lag behind the live list for the cache's lifetime; the `max` keeps a position from exceeding the size.
  The rows are positioned with `transform`, so the reading order is the DOM order.
- A visually hidden `<p aria-live="polite">` says "Найдено N товаров" after a change, and "Загружаем
  ещё" while a batch loads.
- Applying a filter does not move focus. After "Очистить фильтры" or a chip's ×, which remove the
  focused element, focus goes to the `<h1>` (`tabIndex={-1}`). A batch load never steals focus.
- Keyboard: the kit's dropdowns, drawer and accordion (Base UI) already handle it. The chips' ×
  and "Очистить фильтры" are buttons.
- The check: the Lighthouse a11y audit, plus a Testing Library test of the roles, names and the
  live region.

### 3.5 SEO (O25–O29)

- **Metadata.** `generateMetadata` builds:
  - title: the category name or "Каталог", through the template;
  - description: the category's `description`, else "<N> товаров от <min price> ₽ …", from the
    facets' `total` and `price.min`;
  - `alternates.canonical`: `/catalog` or `/catalog/<slug>`;
  - `robots: { index: false, follow: true }` when any filter, `q` or `cursor` is present;
  - `openGraph` and `twitter` (`summary_large_image`).
- **The image.** `opengraph-image.tsx` (1200×630) draws "Lamoda AI Fitting" in Latin letters with
  the default font, so no font is fetched at build or run time. It is one static image for every
  catalog page.
- **JSON-LD.** A server component renders `<script type="application/ld+json">` with
  `JSON.stringify(...).replace(/</g, '\\u003c')`:
  - `BreadcrumbList`;
  - `ItemList` of the first batch's `Product` items (name, image, url, `Offer` with `price` and
    `priceCurrency: RUB`);
  - on `/catalog`, `WebSite` with `SearchAction` (`/catalog?q={search_term_string}`) and
    `Organization`.
    The types are written in the slice; there is no new dependency.
- **`sitemap.ts`.** It renders at request time (`connection()`), so the build needs no api. It
  lists `/catalog` and the active categories (`getCategories`). A failed request answers only
  `/catalog`.
- **`robots.ts`.** It allows everything, disallows `/ui-kit` and `/healthz`, and names the
  sitemap. Batch addresses stay open, with `noindex, follow` from the metadata (O41).
- **CSP.** The policy needs nonces on Next's inline scripts and the JSON-LD; this is PR 4 (§5).

### 3.6 Analytics (O22, O23)

The entries go into spec 0015's event catalog, in its format and checked by its tests (O35). T20
starts once 0015's catalog is on `main`. Zone `catalog`; every event and element gets its
description and frequency per visit (0015 R9).

- **`Catalog Filter Applied`** `{ filter: enum category | brand | size | color | attribute | price
| discount, values: number }`
- **`Catalog Sorted`** `{ sort: enum of PRODUCT_SORTS }`
- **`Catalog Searched`** `{ query_length: number, results: number }`
- **`Catalog Page Loaded`** `{ batch: number }`
- **Elements.** `catalog.card`, `catalog.category`, and one fixed id per filter
  (`catalog.filter-brand`, `catalog.filter-size`, `catalog.filter-color`, `catalog.filter-price`,
  `catalog.filter-discount`, `catalog.filter-attribute`, `catalog.sort`).
  - `Element Clicked` and `Element Hovered` keep 0015's shape: `element` plus its `zone` and `type`.
    The card's position goes only into a catalog event if 0015's rules give one. No product id is
    sent anywhere.
  - The frequency estimates come from the dev catalog's scripted visit. Card hovers and
    `Catalog Page Loaded` are the high-volume ones; hovers count once per element per page view
    (0008 J8).

`Catalog Searched` fires when the first batch for a new `q` arrives, so `results` is the total.

### 3.7 Scripts and checks touched by the removals

- `scripts/smoke-test.sh`: `/` → 307 to `/catalog`; `/catalog` contains `<h1`.
- `scripts/request-loop.sh` follows the same change.
- `scripts/ci-deploy-check.sh`: every `/api/hello` becomes `/api/categories?limit=1` (O33). The rest
  of its checks stay. Unlike `/hello`, that route reads the database. The flood, request-id and
  security-header checks then also need PostgreSQL up, which the deploy check already starts.
- The comment in `deploy/nginx/templates/default.conf.template` that names `/api/hello` changes to
  `/api/categories`.
- Backlog "Retry policy of `hello`" is removed: the workflow is gone.
- `deploy/compose/app.yml` web health check: `http://127.0.0.1:3001/healthz`.
- The api e2e that use `/hello` switch to `GET /categories`:
  - `throttling-tiers`;
  - `request-context`, `request-context-rotation`;
  - `throttling-realtime`, `auth-throttling`;
  - `socket-principal`.
    These are unit e2e without a database, so `PrismaService` is stubbed where needed (as the
    existing e2e do for other public routes). `access-markers` drops `HelloController.get`.
- `api/openapi.json` is regenerated.
- Docs and agent files that cite greeting or hello as examples are updated in the same task:
  - `.claude/skills/fsd/SKILL.md`;
  - `.claude/agents/test-writer.md`;
  - `.claude/hooks/guards.test.mjs` fixtures (paths only; the cases stay);
  - `.claude/README.md`;
  - `web/README.md`;
  - `CLAUDE.md`.

## 4. Remove `offset` from the product list (PR 4)

`ProductListQueryDto` drops `offset`, which becomes an unknown parameter and answers 400. The
snapshot is regenerated, and web's `ProductListQuery` loses `offset`. This lands only after PR 3 is
in production, so no deployed web sends it.

## 5. nginx and CSP (PR 4)

- **Measurement (O24).** The owner makes one visit in a browser: open `/catalog`, scroll 5
  batches, apply 2 filters, open a category. `scripts/measure-page-requests.mjs` (Node, no new
  dependency) then reads nginx's access log for that client address. The owner runs it on the
  server over `ssh`. It prints the requests per second, at peak and in total, for the page
  locations. The numbers go to `tasks.md`.
- **Page limit.** A zone `edge_pages` with the rate and burst at 3× the measured peak, on
  `location /` and `/catalog`. `/_next/static/` gets its own location without the limit (backlog
  "Rate limit for web pages"). The api-format 429 goes through `@too_many_requests`.
  `location = /healthz` answers 404.
- **`/media/` limit (O39).** A zone `edge_media` on the existing `/media/` location, with the rate
  and burst at 3× the photos of the measured visit. Its 429 follows the location's own error pages:
  it repeats 413 and 429, as the template's comment requires.
  - `ci-deploy-check.sh`'s slow-POST connection test (it relies on `/` having no rate limit) moves
    to `/_next/static/`, which still has no limit.
- **CSP.** `web/proxy.ts`, Next 16's middleware, runs on page routes and not on `/_next/static`,
  `/media` or `/api`. It sets a per-request nonce and the header:
  ```
  default-src 'self'; script-src 'self' 'nonce-<n>' 'strict-dynamic';
  style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:;
  connect-src 'self' https://api-eu.mixpanel.com <sentry ingest origin>;
  font-src 'self'; worker-src 'self' blob:; frame-ancestors 'none'; base-uri 'self';
  form-action 'self'; object-src 'none'
  ```
  - Styles need `'unsafe-inline'`: Next and Base UI inject style attributes.
  - nginx keeps `frame-ancestors 'none'` for non-page answers. For pages it passes web's header
    through and does not add its own, since two CSP headers intersect.
  - The JSON-LD `<script>` takes the nonce.
  - Mixpanel's recording worker and its CDN load come from the npm package (bundled), so no extra
    origin is needed. The recorder runs in a `blob:` worker, hence `worker-src 'self' blob:` (O45).
    The local check uses a Mixpanel development project's token in `.env` (the owner's), since an
    empty token loads no SDK. Production is checked in the browser console (AC17).
- `deploy/README.md` "Лимиты nginx" gains the page limit and the CSP.

## 6. Risks

- **404 after streaming (AC2).** With `cacheComponents`, a `notFound()` inside Suspense keeps the 200
  and only adds `noindex`. The fallback is in §3.1. The first web task proves the status with
  `curl -I` before the rest is built on it.
- **Keyset and decimals.** A price key compared as text would sort wrongly. The cursor's value is
  bound as `::numeric`, `::int` or `::timestamptz` by sort. An e2e inserts rows between batches for
  each sort (AC12).
- **The stemmer's prefix.** "плат" and "платья" depend on the Russian snowball stemmer. The e2e
  pins AC8's cases against the real PostgreSQL (Testcontainers).
- **Virtualization and hydration.** The server list must not jump on hydrate. The first render on
  the client draws the same rows as the server, before the virtualizer measures (`initialRect`
  from a 4-column estimate).
- **CSP breaking analytics or Sentry.** It is checked with and without consent in production
  (AC17). A rollback is a revert of `proxy.ts`.
- **PR 3 size.** It is the largest. Its tasks are split so each one passes `verify` alone.

## 7. How each criterion is verified

| AC    | Check                                                                                                                                           |
| ----- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| AC1   | `curl -I /` → 307 `/catalog`; Vitest of the page with and without a slug                                                                        |
| AC2   | `curl -I /catalog/nope` and an inactive slug → 404 (local and production)                                                                       |
| AC3–4 | `qa-tester` screenshots at 1440 and 375 px; owner compares                                                                                      |
| AC5   | Vitest: card `href`                                                                                                                             |
| AC6   | `rg` finds no `hello`/`greeting`/`dev-catalog`; snapshot has no `/hello`                                                                        |
| AC7   | Vitest of `url-state` round trips; `qa-tester` applies, reloads, opens in a new tab                                                             |
| AC8   | database e2e with the real stemmer: "платья", "плат", brand, category, "плтье"                                                                  |
| AC9   | Vitest of `header-search` and `header-categories`; `qa-tester` from `/privacy`                                                                  |
| AC10  | Vitest of the empty state                                                                                                                       |
| AC11  | `qa-tester` on the dev catalog: scroll to the end, count the DOM `li`                                                                           |
| AC12  | database e2e per sort: insert between batches, no repeat or gap                                                                                 |
| AC13  | `qa-tester`: scroll 3 batches, open a card, back                                                                                                |
| AC14  | `EXPLAIN` of each sort, a later batch of each sort (`Index Cond`) and a search on the 50 000-product dev catalog after `ANALYZE`, in `tasks.md` |
| AC15  | e2e: the second call does not hit the database (spy); `pg_sleep` past the timeout → 503, `/health` answers                                      |
| AC16  | production: the owner's `ab`/curl loop over the limit → 429 JSON; the scripted visit stays under                                                |
| AC17  | production browser console with and without consent; `curl -I` shows the header                                                                 |
| AC18  | Vitest with a mocked `track`; Mixpanel live events in production                                                                                |
| AC19  | Vitest of `generateMetadata`; `curl` the HTML for the meta tags; opening the OG image                                                           |
| AC20  | Vitest of `sitemap.ts` and `robots.ts`; `curl` in production                                                                                    |
| AC21  | Rich Results and Yandex validator on production, recorded on the PR                                                                             |
| AC22  | `curl /catalog` contains the first batch and the "Дальше" link; follow it                                                                       |
| AC23  | Lighthouse in production (SEO, Accessibility = 100); `qa-tester` keyboard pass; Vitest of the live region                                       |
| AC24  | `npm run verify`; `docker build` of web with no services running                                                                                |

## 8. Docs closed with the spec

- **`CLAUDE.md`:**
  - the spec list;
  - `/dev/catalog` and `/hello` lines removed;
  - the list's cursor;
  - full-text search;
  - the facet cache, pool and timeout;
  - `/healthz`;
  - the catalog route and URL state;
  - CSP;
  - page limits.
- **`README.md`, `web/README.md`, `deploy/README.md`.**
- **`specs/backlog.md`.** Remove "Product list cost", "Cache for filter counts", "Rate limit for
  web pages", "Full CSP for web", "Remove greeting", "Product card link", "Mobile filters",
  "Flaky handoff test", "Timeouts of the database pool", "Taint the proxy secret", "Flaky facets
  test" and "Retry policy of `hello`", each in the commit that closes it.
- **Spec 0012's docs.** Its "Redis holds only rate-limit counters" becomes "counters and a cache
  for the filter counts", in whichever of 0012 and 0014 closes later. A cache loss only costs a
  recompute, so Redis stays out of the backups.
