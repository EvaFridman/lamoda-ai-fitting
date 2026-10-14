# 0004 CRUD api: tasks

Status: done (2026-10-15). History, not instructions.
Implements [plan.md](plan.md). `👤` marks a step only the owner can do.

## How the work flows

- One pull request per phase, merged with "Rebase and merge" once CI is green; the next branch
  starts from a fresh `main`.
- One task = one commit, with its checkbox ticked in the same commit. Each task runs in a fresh
  session: brief from `spec-finder`, time estimate, implementation, `finish-task`, the owner's OK,
  commit.
- Every resource task follows the same steps:
  - the module in `api/src/<resource>/` (controller, service, `dto/`), registered in `AppModule`;
  - field rules from `common/validation/rules.ts`, Swagger decorators, `@AdminOnly()` where E1 says;
  - database e2e specs through `test/support/test-app.ts`: create, read, list with paging, update,
    delete, 404, 409 and 400 cases of the resource.
- A task that changes what `CLAUDE.md`, a README or `.env.example` describes updates it in the same
  commit. A task that closes a backlog item removes it from `specs/backlog.md` in the same commit.
- Checks name the acceptance criteria they cover; the evidence goes into "Acceptance record".

## PR 0 · `docs/0004-spec` · documents

- [x] **T1. Spec documents.** `spec.md`, `clarifications.md`, `plan.md` (committed as they were
      accepted) and this file; the E29 entries and the "Web data layer" entry for spec 0005 (E30,
      with the web design notes of plan "Backlog"; it absorbs "`apiFetch` paths") added to
      `specs/backlog.md`.
      Check: `npm run format:check`; the owner has accepted spec, plan and tasks.
      Commit: `docs(specs): add the tasks of spec 0004`

## PR 1 · `feat/0004-api-foundation` · errors, access, paging, Sentry

- [x] **T2. Error handling.**
  - `common/errors/` (`AppException` and subclasses, `error-codes.ts`, `constraint-fields.ts`).
  - `common/filters/app-exception.filter.ts` as `APP_FILTER`, with pino logging (4xx warn, 5xx
    error).
  - `common/validation/validation-pipe.ts` with `exceptionFactory`, used in `main.ts`.
  - `common/pipes/uuid.pipe.ts`.
  - `CLAUDE.md` ("Conventions"): the error format and where error types live.
  - Check: unit tests, one per row of E20; e2e for broken JSON, a body over the limit, an unknown
    route; `/health/*` responses unchanged. AC13, AC14.
  - Commit: `feat(api): answer every error in one format with a code`
- [x] **T3. Admin access, paging, environment.**
  - `ADMIN_API_TOKEN` and `MEDIA_BASE_URL` in `config/env.ts`, `.env.example`, `scripts/init-env.sh`
    (generates a local token) and `deploy/compose/app.yml`.
  - `common/guards/admin.guard.ts` with `@AdminOnly()`; the Swagger `admin` key.
  - The `X-Admin-Token` header redacted in pino-http.
  - `common/pagination/`.
  - `test/support/test-app.ts`: `AppModule` on the database from `createTestDatabase()`.
  - Check: unit guard (right, wrong and missing token; empty env); a log line of a request with
    the token shows it redacted. AC1 (guard part).
  - Commit: `feat(api): guard writes with an admin token and page lists`
- [x] **T4. Sentry in the api and the worker.**
  - `@sentry/nestjs` at the plan's version.
  - `src/instrument.ts` imported first in `main.ts` and `temporal/worker.ts`; `SentryModule` in
    `AppModule` and `WorkerModule`; an activity interceptor in the worker.
  - The filter captures 5xx only.
  - `SENTRY_DSN` and `SENTRY_ENVIRONMENT` in env, `.env.example` and `app.yml` (from
    `API_SENTRY_DSN`).
  - Check: unit, the filter calls capture for a 500 and not for a 404; with an empty DSN the app
    starts and sends nothing; `CLAUDE.md` stack table: Sentry in api. AC15 (code part).
  - Commit: `feat(api): report errors and traces to sentry`
- [x] **T5. Source maps and deploy.**
  - `@sentry/cli` at the plan's version (install script approved only if needed, reason in the
    commit).
  - A Dockerfile `release` stage after `build` (runtime copies `dist` from it; `dev` stays on
    `build`) uploads maps when the secret is present and deletes them; workflow code is not
    injected (the worker bundles it into Temporal's sandbox); a failed upload does not fail the
    build (E37); `scripts/ci-build-images.sh` passes the secret and args; `ci.yml` adds `SENTRY_PROJECT_API`;
    `cd.yml` writes `API_SENTRY_DSN`, `ADMIN_API_TOKEN`, `MEDIA_BASE_URL` to the server `.env`;
    `deploy/README.md` lists them.
  - nginx clears incoming `sentry-trace`, `baggage`, `traceparent` and `tracestate` headers at the
    server level (web too, E34) and in `/socket.io/`, so a client cannot set the trace id of api events.
  - `SENTRY_AUTH_TOKEN` is read from the `production` environment: the `images` job takes that
    environment only on a push to `main` (E36); `deploy/README.md` moves it there. Removes "Sentry
    token scope" from `specs/backlog.md`.
  - 👤 Create the api's Sentry project; add `API_SENTRY_DSN` and `ADMIN_API_TOKEN` to the
    `production` environment; add the variables `SENTRY_PROJECT_API` and `MEDIA_BASE_URL`.
  - 👤 Before the merge: `SENTRY_AUTH_TOKEN` added to the `production` environment. After the CI
    log of the merge shows the upload: the repository secret `SENTRY_AUTH_TOKEN` deleted.
  - Check: a local `docker build --target runtime api` without the token succeeds and holds no
    maps; with the merge to `main`, the CI log shows the upload. AC15 (maps). A trace of a request
    whose Prisma call fails carries no text of the Prisma error in its spans (E35).
  - Commit: `build(api): upload source maps to sentry at build time`

## PR 2 · `feat/0004-catalog-reference` · categories, brands, attributes

- [x] **T6. Shared catalog pieces.** `common/validation/rules.ts` (the CHECK rules of
      `migration.sql`), `common/media/media-url.ts`, `common/price/final-price.ts`, the Decimal
      mapping helper.
      Check: unit `toMediaUrl` (base with and without `/`, a key escaping the base) and
      `finalPrice` (1999.99 / 15 → 1699; 0 and 100). AC5.
      Commit: `feat(api): build media urls and the price after the discount`
- [x] **T7. Categories and brands.** Both resources; `?isActive` on categories.
      Check: database e2e; deleting a category or brand with products → 409 `IN_USE`; duplicate
      slug or name → 409 `ALREADY_EXISTS`. AC1, AC2, AC3, AC6 (part).
      Commit: `feat(api): serve categories and brands`
- [x] **T8. Attributes and their values.** `/attributes` and `/attributes/:id/values`.
      Check: database e2e; a value in use → 409; a duplicate value of one attribute → 409.
      AC2, AC6 (part).
      Commit: `feat(api): serve attributes and their values`

## PR 3 · `feat/0004-products` · products and their parts

- [x] **T9. Products.** CRUD with the list item and detail of plan "Resources"; `image.url` and
      `finalPrice`; the Swagger note on DELETE and the seed. Removes "Catalog API" from the backlog.
      Check: database e2e on shapes, Decimal as numbers, cascade on delete, 409 for a product in a
      generation. AC2, AC4, AC6.
      Commit: `feat(api): serve products with image urls and final prices`
- [x] **T10. Product images, sizes and attribute values.** The nested routes of plan "Resources".
      Check: database e2e; a duplicate size → 409; a missing attribute value → 400
      `RELATED_NOT_FOUND`; negative stock → 400. AC2.
      Commit: `feat(api): edit product images, sizes and attribute values`

## PR 4 · `feat/0004-product-listing` · filters, sorting, counts

- [x] **T11. Filters and sorting.** `ProductListQueryDto`, `listing/product-filter.ts` (the Prisma
      part), the sorts of E14.
      Check: database e2e per filter; attribute AND across and OR inside; out-of-stock size skipped;
      each sort and its stable order; array over 50 values → 400. AC10, AC11.
      Commit: `feat(api): filter and sort the product list`
- [x] **T12. Filter counts.** `GET /products/facets`; the SQL part of the filter builder.
      Check: database e2e comparing each count with the list `total` for the filters plus that
      value; choosing a colour keeps the other colours' counts; price range and discounted count
      match the list; `security-reviewer` on the raw SQL. AC12.
      Commit: `feat(api): count products per filter value`

## PR 5 · `feat/0004-users-fittings` · users, fitting sessions, generations, error docs

- [x] **T13. Users.** Phone and email normalization, the age rule. Removes "Auth input rules" from
      the backlog.
      Check: unit normalization; database e2e with the AC7 inputs; under 14 → 400; deleting a user
      removes their sessions and generations. AC1, AC2, AC6, AC7.
      Commit: `feat(api): serve users with normalized phone and email`
- [x] **T14. Fitting sessions.** `?userId`; activation archives the previous active session.
      Check: database e2e; two parallel activations leave one active. AC2, AC8.
      Commit: `feat(api): serve fitting sessions with one active per user`
- [x] **T15. Generations.** `?sessionId`; the status, result and error check; `productIds`.
      Check: unit validator; database e2e, a bad triple → 400 with no write, links replaced on
      update; `temporal-reviewer` confirms nothing starts a workflow. AC2, AC9.
      Commit: `feat(api): serve ai generations and their products`
- [x] **T16. Error responses in Swagger.** `ErrorResponseDto`; the answers a route's shape implies
      added in `swagger.ts`; `ApiErrors(...)` on the routes with 409, `IN_USE`,
      `RELATED_NOT_FOUND` or `CONSTRAINT_VIOLATION`, every resource (E50). Removes "401 in
      Swagger" from the backlog.
      Check: e2e on the Swagger JSON, every operation and the decorated spot checks. AC2.
      Commit: `feat(api): list error responses in swagger`

## PR 6 · `docs/0004-close` · acceptance

- [x] **T17. Acceptance.** `qa-tester` on the local stack through every criterion; 👤 a test 500
      on production after the deploy shows in the api's Sentry project with the release and a
      TypeScript stack. "Acceptance record" filled in.
      Check: every AC has evidence.
      Commit: `docs(specs): record the acceptance of spec 0004`
- [x] **T18. Close.** All files `Status: done`; `CLAUDE.md` (spec 0004 in the opening paragraph)
      and `README.md` in line with what was built.
      Check: `npm run format:check`.
      Commit: `docs(specs): close spec 0004`

## Acceptance record

Filled in by T17.

| AC   | Result | Evidence                                                                                                                                                                                                                                                                                                                                                    |
| ---- | ------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| AC1  | pass   | T17 `qa-tester`: catalog `GET`s (categories, brands, attributes, products, facets) 200 with no token; every write (nested routes too) and every users, fitting-sessions, ai-generations request 401 `UNAUTHORIZED` with no, a wrong or an empty token. Right token, empty env token: `admin.guard.spec.ts`, `test/admin-only.e2e-spec.ts` (E32)             |
| AC2  | pass   | T17 `qa-tester`: `/docs-json` lists every route of E3 with its methods and error responses. Create, read, list, update, delete: `test/database/{categories,brands,attributes,products,product-parts,users-api,fitting-sessions,ai-generations}.e2e-spec.ts`; `test/swagger.e2e-spec.ts`                                                                     |
| AC3  | pass   | T17 `qa-tester`: products in pages of 10 concatenate to the `limit=100` list (30, no repeats); `limit=101` → 400 `MAX`. `paginated.spec.ts`, `pagination-query.dto.spec.ts` and the list cases of the database e2e                                                                                                                                          |
| AC4  | pass   | T17 `qa-tester`: list item and detail carry the fields of AC4; `image.url` is `http://localhost:3001/media/seed/…` and loads (200 `image/webp`). `product-mapper.spec.ts`, `media-url.spec.ts`, `test/database/products.e2e-spec.ts`                                                                                                                        |
| AC5  | pass   | `final-price.spec.ts` (1999.99 / 15 → 1699, discounts 0 and 100). T17 `qa-tester`: `finalPrice` of all 30 demo products equals the floor, half-ruble cases included                                                                                                                                                                                         |
| AC6  | pass   | `test/database/{categories,brands,attributes,products,product-parts,users-api,ai-generations}.e2e-spec.ts`: 409 `IN_USE` on a used record, cascades on product and user deletes                                                                                                                                                                             |
| AC7  | pass   | `test/database/users-api.e2e-spec.ts`: `8 (999) 123-45-67` and `Anna@Mail.RU` stored as `+79991234567`, `anna@mail.ru`; under 14 → 400. `rules.spec.ts`                                                                                                                                                                                                     |
| AC8  | pass   | `test/database/fitting-sessions.e2e-spec.ts`: activating archives the previous session; parallel activations leave one active                                                                                                                                                                                                                               |
| AC9  | pass   | `generation-triple.spec.ts`, `ai-generation.dto.spec.ts`; `test/database/ai-generations.e2e-spec.ts`: a bad triple → 400, no row written                                                                                                                                                                                                                    |
| AC10 | pass   | T17 `qa-tester`: each filter narrows; black 6, white 5, black or white 11; black and cotton 1; `size=42` skips the product whose size 42 has stock 0. `product-filter.spec.ts`, `test/database/product-listing.e2e-spec.ts`                                                                                                                                 |
| AC11 | pass   | T17 `qa-tester`: each sort orders the list (prices before the discount, E45); the same request twice and paged in tens gives the same ids. `test/database/product-listing.e2e-spec.ts`                                                                                                                                                                      |
| AC12 | pass   | T17 `qa-tester`: sampled counts equal the list `total` for the filters plus that value; with black chosen, white stays 5; facet `total` equals the list's. `test/database/product-facets.e2e-spec.ts`                                                                                                                                                       |
| AC13 | pass   | T17 `qa-tester`: `VALIDATION_FAILED`, `BAD_JSON`, `INVALID_ID`, `UNAUTHORIZED`, `ROUTE_NOT_FOUND`, `NOT_FOUND`, `TOO_MANY_REQUESTS` live, no internal details. Every E20 row: `to-app-exception.spec.ts`, `app-exception.filter.spec.ts`, `test/errors.e2e-spec.ts`. Production with Postgres stopped answered 500, not 503: fixed in T17 (E60)             |
| AC14 | pass   | T17 `qa-tester`: one bad query gives a detail per invalid field (8 fields). `validation-pipe.spec.ts`, `test/errors.e2e-spec.ts`; one detail for a value of the wrong type: E61                                                                                                                                                                             |
| AC15 | pass   | 👤 T17 on `75ab653` (E59): Postgres stopped → event: release, `production`, message removed, no headers, body or user; a script error at `final-price.ts:7:6`; 400: no event. Repeat on `e1ec071` (E62): 503 `SERVICE_UNAVAILABLE` (event `c08497cd`), TypeScript source seen (`81a308dd`). `sentry.options.spec.ts`, `sentry-activity.interceptor.spec.ts` |
| AC16 | pass   | T17: `npm run verify` → exit 0; api 45 files, 1781 tests; web 52 files, 516 tests; guard hooks 402                                                                                                                                                                                                                                                          |
