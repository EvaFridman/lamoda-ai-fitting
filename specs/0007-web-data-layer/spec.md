# 0007 web data layer

Status: accepted (2026-10-15).

Issue #28. Decisions: `clarifications.md` (H1–H16).

## Goal

web reads the public catalog of spec 0004 on the server and in the browser through one typed,
checked layer: every response is validated, every api error reaches the visitor as a Russian text,
and failures of the api show up in Sentry instead of only in logs. The catalog page and the fitting
features build on it; this spec adds no product pages.

## In scope

- A slice per entity (H3): catalog entities load on the server and in the browser; users, fitting
  sessions and generations get types only.
- One server client and one browser client over the same error contract; browser code never
  imports server-only code or secrets.
- Paths built from input stay inside the api (backlog "Web data layer", `apiFetch` paths).
- Data loaded on the server is handed to the browser without a second request (H5); the browser
  calls `/api` in every environment (H6); freshness 60 s (H7).
- Russian texts for api error codes and `details` codes (H8); Sentry for api failures (H9, backlog
  "api call failures in Sentry"); retries (H10) and 429 (H11).
- A check that keeps the hand-written schemas in sync with the api (H12, H13).
- A hidden dev page (H14); the greeting moved onto the layer (H15).

## Non-goals

- Catalog and product pages, filter state in the URL, and removing the greeting (catalog page spec).
- Writes from web, sign-in, the admin token in web, loaders for users, sessions and generations.
- Code generation of types or a package shared by api and web.
- A Next page cache, the cache warm-up on deploy (issue #41), HTTP/2, nginx in local development.

## Acceptance criteria

### Server

- AC1. A server component gets catalog data (product list with filters, product, categories, brands,
  attributes, filter counts) typed and validated; a test shows each loader against its route.
- AC2. A path segment taken from input (e.g. an id `../users` or `a/b`) is encoded into one segment
  and a path that resolves outside the api's origin is refused before any request; unit tests.
- AC3. An api error answer becomes an error that carries its `code`, status and `details`; a 400 on
  a product list filter, a 404 on an unknown product id and a 503 each show their Russian text on
  the dev page, and an unknown code shows the general text.

### Browser

- AC4. The dev page answers with catalog data in its HTML, and the browser makes no catalog request
  while the page loads (network panel).
- AC5. Changing a filter or the page on the dev page requests `/api/...` from the browser and shows
  the new data; locally and, after 0006 PR 3, in production.
- AC6. No browser bundle contains the server client, `server-only` code or the value of
  `PROXY_SECRET` (a check on the built `.next/static`).
- AC7. With the api answering 503 the browser retries at most twice, then shows the error text; on a
  429 or any 4xx it does not retry, and a 429 shows its own text.

### Sentry

- AC8. With the api stopped, ten loads of a page that reads the catalog create one Sentry issue in
  web's project, not ten; a 404 on an unknown product id creates none.
- AC9. A response that fails its schema (e.g. an enum value web does not know) is reported to Sentry
  and shows the general error text; a response with an extra field is accepted, without the field.

### Contract

- AC10. Adding a field to a catalog response DTO, or changing a field's type, without changing web's
  schema turns `npm run verify` red, naming the field and the schema.
- AC11. A change to the api's response DTOs without an updated OpenAPI snapshot turns
  `npm run verify` red.

### Production

- AC12. After 0006 PR 3, the dev page on `https://lamoda-ai-fitting.ru` loads with data, its browser
  calls go to `/api`, it carries `noindex` and no page links to it.
- AC13. The greeting on `/` works as before; with the api failing it shows the Russian text and the
  failure reaches Sentry (H15).

## Owner actions (Claude cannot do them)

- Merge the four pull requests (H2); confirm in web's Sentry project that AC8 and AC13 hold in
  production.
- Restart Claude Code after the FSD rule change (H16): agent files load when a session starts.

## Assumptions

- 0006 lands as decided: catalog reads public, read quota 10/s and 300/min shared by both clients,
  413, 429 and 503 in the api's error format, `TOO_MANY_ERRORS` in `details`.
- The catalog's response DTOs do not change while this spec is in progress, other than through the
  contract check.
- web's Sentry project and its DSN are already in production (0001 C8).
