---
paths:
  - web/app/**
  - web/src/_pages/**
  - web/src/_app/**
  - web/src/entities/*/api/**
  - web/src/shared/api/**
---

# New web pages

Why: spec 0018 (V8, V15, V16, V24, V30). The list and its check: `web/src/_app/warmup/routes.ts` and
`routes.test.ts`; the page cache: `CLAUDE.md`, "`web` page cache".

## Every route joins the warm-up list or its exclusions

- Every route of `web/app` (a `page.tsx`, a `route.ts`, a metadata file such as `sitemap.ts`,
  `robots.ts`, `opengraph-image.tsx`, `twitter-image.tsx`, an icon or the manifest) is in `WARMUP`
  or in `EXCLUDED` of `routes.ts`, added in the same commit as the route. `routes.test.ts` fails
  `npm run verify` on a route in neither or in both, and on an entry no file backs (but a
  `redirect` one, which must be a source of `redirects()` in `next.config.ts`).
- Warm up what a visitor reaches without signing in. Exclude, with its reason, what reads the
  user's data or is not for visitors: the account (`/customer/*`), `/ui-kit`, `/healthz` and each
  route under it (one entry each), a sign-in or development page (`/dev/*`) once a file backs it.
- A dynamic route names where its addresses come from, as `/catalog/[slug]` takes the active
  categories (`source: 'categories'`, at most `WARMUP_CATEGORY_MAX`, 50). A new source is a new
  `source` kind in `WARMUP`'s type and in `warmupList()`, read from the api at request time past the
  page cache, bounded, with its count over the bound in `skipped` (and `warmup.mjs`'s log line,
  which says "categories", reworded). A product page, for example, names the first products of
  each category; a source that would give thousands of addresses (the whole sitemap) is not one
  (V8).
- Every warmed address must answer 200 within 10 s to a plain GET with no cookie, or the deploy
  stops (V6). The one other status is `/`'s 307: `expectedStatus` in `deploy/scripts/warmup.mjs`
  knows only that address, so a new `redirect` entry changes it (and its test) too.
- The warm-up's cold pass makes at most 200 api reads a minute within 120 s for the whole step
  (V16): a route that adds many addresses or api reads per page revisits that bound with the owner.

## Reads of a new page

- Data from the api renders at request time inside `<Suspense>`, after reading request data
  (`params`, `searchParams`) or `await connection()` when it reads none, so `next build` reads
  nothing and the image builds with no api, Redis or database.
- Only the public catalog's reads with no filter are cached (V2, V15): products and filter counts
  with no filter but the one `categoryId` of a category's page (taken from the category, never from
  the address), no sort, `q`, `limit` or cursor; categories, a first page only. Any other read goes
  through `apiFetch` as the visitor. The user's data is read only in the browser (`clientFetch`),
  never on the server (`CLAUDE.md`, "`web` sign-in"). Page markup is not cached (V14).
- No other form of cache: not `'use cache'` (the in-memory default handler) or
  `'use cache: private'`, not `unstable_cache`, not `fetch`'s `cache` or `next.revalidate`. They
  skip the handler's key, size bound and `pageCacheOpen()`, and a cached `apiFetch` would key on the
  visitor's headers.
- A cached read is a function of an entity slice's `server-queries.ts` with `'use cache: remote'`
  whose body only returns `cachedApiFetch(...)`, which sets the lifetime (`pageCacheLife()`) and
  lifetime 0 on a failure: no `cacheLife` of its own. Its arguments and closure become the key and
  are stored: the query only, never a header, a cookie, a secret or user data. A path with a param
  (`buildPath('/x/:id', …)`) is built by the caller and passed in, since nothing may throw inside
  it; the caller unwraps the result with `cachedData` (V23).
- The caller checks `pageCacheOpen()` first and reads through `apiFetch` as the visitor when it is
  false, as `getCategories` and `isCacheable` do: otherwise every miss while Redis is skipped counts
  under web's one quota (V24).
- A read whose argument the visitor chooses (a slug, an id from the address) is never cached on its
  own key, for the same reason. Take it from a cached list, as `getCategoryBySlug` does, or read it
  as the visitor.
