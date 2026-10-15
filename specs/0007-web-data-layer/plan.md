# 0007 web data layer: plan

Status: accepted (2026-10-15).

Implements [spec.md](spec.md); decisions in [clarifications.md](clarifications.md). No new
dependencies: zod 4 (`z.toJSONSchema`), TanStack Query 5 (`HydrationBoundary`, `dehydrate`),
`@sentry/nextjs` and `server-only` are installed already.

## 1. `shared/api` (H16, backlog "`apiFetch` paths")

- `index.ts`, safe in the browser:
  - `buildPath(template, params)`: `template` is a literal such as `/products/:id`; each param is
    encoded with `encodeURIComponent`, so one value is one segment (`../users` → `..%2Fusers`). It
    returns an `ApiPath` (the path plus its template, used by Sentry, §3). Both clients take only an
    `ApiPath`, never a string.
  - Query strings: a `query` option serialized with `URLSearchParams`, arrays as repeated keys (the
    api accepts both, 0004).
  - `ApiError`: `kind` (`http`, `network`, `timeout`, `schema`), `status`, `code`, `details`,
    `template`. A non-2xx answer is parsed as the api's error envelope (zod); one that is not (an
    nginx HTML page) keeps `code` empty.
  - `paginatedSchema(item)` for `{ items, total }`.
  - `errorText(error)` and `detailText(detail)`: the Russian texts (§2).
  - `clientFetch` (§4).
- `server.ts`, `import 'server-only'`: `apiFetch`, moved from `api-fetch.ts` with its headers, 5 s
  timeout, origin check and `redirect: 'error'` unchanged; it takes an `ApiPath`. Also
  `prefetch(queryClient, options)`, the server half of §4.
- The two clients share one response step (status, envelope, schema → `ApiError`), so both report
  and classify errors the same way.
- `shared/config` and `shared/redis` follow the same rule (H16): `getServerEnv` with `ServerEnv`
  and `getRedis` move to their segment's `server.ts`, and their `index.ts` goes, since nothing in
  them is browser-safe. Imports become `@/shared/config/server` and `@/shared/redis/server`.

## 2. Texts (H8, H11)

`shared/api/error-text.ts`: a `Record` from each api error code to a Russian text, the same for
`details` codes (`TOO_MANY_ERRORS` included), a general text for anything else, and texts for
`network`, `timeout` and `schema` failures. 429 gets "Слишком много запросов, подождите немного".
The code list is a copy (no shared package); the contract check (§6) fails when the api has a code
the dictionary lacks.

## 3. Sentry (H9)

`shared/api/report.ts`, called by the shared response step:

- reports `network`, `timeout`, `schema` and `http` with status ≥ 500; never 4xx or 429;
- `fingerprint: ['api-failure', kind, method, template]`, so one cause is one issue whatever the
  ids in the path;
- at most one event per fingerprint per 60 s per process (server) or per tab (browser), to keep
  web's share of the Sentry quota (5k errors a month with the api, 0004) when the api is down;
- tags: `api_status`, `api_code`, and on the server the request id; no bodies or query values (as
  `sentry.options.ts`).

Components only render `errorText(error)`; the greeting's `console.error` goes.

## 4. Browser client and handoff (H5, H6, H7, H10)

- `clientFetch` calls `/api` + path (relative, same origin); no secret, no forwarded headers;
  timeout 15 s (above the api's 10 s, so its 503 arrives first); `redirect: 'error'`.
- Local development: `next.config.ts` `rewrites()` maps `/api/:path*` to `${API_URL}/:path*` only
  when `NODE_ENV === 'development'` (as nginx's `proxy_pass http://api/` strips `/api`). The
  production image has no rewrite; nginx serves `/api/` before Next.
- `_app/providers.tsx` QueryClient defaults: `staleTime` 60 s (kept); `retry`: at most 2, only
  `network` or status 503; `retryDelay` 1 s then 2 s.
- Handoff: a server component inside `<Suspense>` calls `connection()`, creates a QueryClient for
  the request, `prefetch`es through `apiFetch` with the same query key the browser hook uses,
  and renders `<HydrationBoundary state={dehydrate(client)}>`. A failed server fetch renders the
  error text there and is not dehydrated. Data stays plain JSON (dates as ISO strings, no zod
  transforms), so it survives dehydration.

## 5. Entities (H3, H13)

One slice each: `category`, `brand`, `product`, `attribute`, `user`, `fitting-session`,
`generation`.

- `model/schemas.ts`: zod objects mirroring the response DTOs. `z.object` drops unknown keys;
  enums are `z.enum` (unknown value fails). Types via `z.infer`.
- Catalog slices, `api/queries.ts` (in `index.ts`): query keys and options with `clientFetch`, and
  hooks (`useProducts(filters)`, `useProduct(id)`, `useProductFacets(filters)`, `useCategories`,
  `useBrands`, `useAttributes`, and the product's images, variations and attribute values).
- Catalog slices, `server.ts`: the same options with `apiFetch` as their query function.
- `user`, `fitting-session`, `generation`: `model/` only; their `index.ts` exports schemas and
  types.
- `greeting` gets a `server.ts` too (§8).

## 6. Contract check (H12, AC10, AC11)

- api: `api/test/openapi-snapshot.e2e-spec.ts` builds the document as `swagger.e2e-spec.ts` does
  (no database) and checks it with Vitest's `toMatchFileSnapshot('../openapi.json')`. A DTO change
  without the snapshot fails it; `npm --prefix api test -- -u` rewrites it. `api/openapi.json` is
  committed and listed in `.prettierignore`.
- web: a helper in `shared/api` test support compares a zod schema (`z.toJSONSchema`, output side)
  with an OpenAPI component, following `$ref`s: the same property names both ways, required set,
  types and formats, nullable and enum values. Each entity's `model/schemas.contract.test.ts` pairs
  its schemas with component names (`ProductListItemDto`, …); paginated responses are checked
  through their item. The error dictionary is checked against the `code` enum of
  `ErrorResponseDto`. A failure names the schema, the component and the field.

## 7. FSD rule (H16)

`.claude/skills/fsd/SKILL.md` ("Through the public API only", "Server-only modules"),
`.claude/agents/fsd-reviewer.md` (rule 3) and `.claude/README.md` allow `server.ts` as a second
entry for server-only exports. `CLAUDE.md` "Conventions": server calls through
`apiFetch` from `@/shared/api/server`, browser calls through `clientFetch` on `/api`, paths through
`buildPath`. The owner restarts Claude Code after the change.

## 8. Greeting (H15)

`entities/greeting/server.ts` exports `getGreeting` over the new `apiFetch`; the widget renders
`errorText`. The text "Hello, world!" stays (`scripts/smoke-test.sh` greps it) and `/` still
answers 200 when the api fails (web's health check fetches `/`).

## 9. Dev page (H14)

`web/app/dev/catalog/page.tsx` re-exports `_pages/dev-catalog`, with
`robots: { index: false, follow: false }` as `/ui-kit` (0003). The page:

- on the server: products (first page) and brand facets, handed to the browser (§4);
- in the browser: a brand filter and "next page" through the hooks;
- error cases on demand: an unknown product id (404 `NOT_FOUND`) and a price filter with
  `minPrice > maxPrice` (400 `VALIDATION_FAILED`), each showing its text.

It uses only public catalog routes and is removed with the catalog page.

## 10. Bundle check (AC6)

`scripts/check-web-bundle.mjs`, run by `verify` after `build`: fails when any file under
`web/.next/static` contains `x-proxy-secret` (any case) or `PROXY_SECRET`. A `node --test` case
covers it. Importing `server-only` from a client component already fails `next build`; the
script guards the rest.

## Values

| What                        | Value             | Why                                          |
| --------------------------- | ----------------- | -------------------------------------------- |
| `apiFetch` timeout          | 5 s (kept)        | below the api's 10 s (0006)                  |
| `clientFetch` timeout       | 15 s              | above the api's 10 s, so its 503 text shows  |
| browser retries             | 2, after 1 s, 2 s | H10; a 503 often clears; stays within 10/s   |
| `staleTime`                 | 60 s              | H7                                           |
| Sentry, one event per cause | per 60 s          | one issue per cause; spares the shared quota |

## Environment

No new variables. `next.config.ts` reads `API_URL` (already in web's env) for the dev rewrite.

## Backlog

Taken (H4): "Web data layer", removed by the last task of PR 3; "api call failures in Sentry",
removed by the Sentry task.

## Risks

- **0006 not merged yet.** Tasks that read errors start after 0006 PR 2 (H1); the dictionary
  includes 0006's codes. Shared files rebase by 0006 F1.
- **Snapshot churn.** Every response DTO change rewrites `api/openapi.json`; that is the point
  (AC11). `test-writer`'s "only test files changed" check treats it as expected after `-u`.
- **Hydration mismatch.** Server and browser options share keys and schemas from one module; a
  test renders a hydrated hook and asserts no request.
- **Dev quota.** Through the dev rewrite all browser calls share one quota (H6).
- **Agent files.** The FSD rule change takes effect after a restart (§7).

## How each criterion is verified

| AC   | How                                                                                        |
| ---- | ------------------------------------------------------------------------------------------ |
| AC1  | unit tests per loader with a stubbed `fetch`; the dev page renders data (qa-tester)        |
| AC2  | unit tests of `buildPath` and the origin check                                             |
| AC3  | unit tests of the response step; dev page error cases (qa-tester); 503 with api stopped    |
| AC4  | `curl` the dev page: data in HTML; browser network panel: no catalog request on load       |
| AC5  | browser: filter and next page request `/api/...`; in production after 0006 PR 3 (PR 4)     |
| AC6  | `scripts/check-web-bundle.mjs` in `verify`                                                 |
| AC7  | unit tests of the retry policy; browser with the api answering 503 / 429                   |
| AC8  | unit test of fingerprint and throttle; in production, web's Sentry project (PR 4)          |
| AC9  | unit tests: unknown enum fails and reports, extra field dropped                            |
| AC10 | add a field to a DTO locally, `npm run verify` red (recorded in the task)                  |
| AC11 | change a DTO without `-u`, `npm run verify` red                                            |
| AC12 | production: `curl` the dev page for `noindex`, browser network panel (PR 4)                |
| AC13 | `/` with the api stopped locally: Russian text, 200, Sentry event (dev DSN off: unit test) |
