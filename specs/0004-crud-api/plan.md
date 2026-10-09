# 0004 CRUD api: plan

Status: accepted (2026-10-09); amended the same day: the web part moved to spec 0005 (E30), its
design notes to the backlog entry "Web data layer".
Implements [spec.md](spec.md); decisions are in [clarifications.md](clarifications.md) (E1, E2, …).

## Overview

- **api.** It gets a shared foundation (error handling, admin guard, paging, Sentry), one Nest module
  per resource of E3, and a product listing with filter counts.
- **web.** Unchanged in this spec (E30).
- **Order.** The work goes in five phases (see `tasks.md`). Each phase is a pull request that leaves
  `main` deployable.

## Versions (checked against the registry on 2026-10-09)

| Package          | Version | Where              | Why this one                                                                                                                                                                                   |
| ---------------- | ------- | ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `@sentry/nestjs` | 11.4.0  | api, dependency    | Same line as web's `@sentry/nextjs` 11.4; 11.5 and 11.6 are one and two days old (CONTRIBUTING: a few days old). Peer range includes Nest 12                                                   |
| `@sentry/cli`    | 3.8.0   | api, devDependency | Source map upload in the build stage only; three weeks old. Its install script fetches the binary: approved in `allowScripts` if the platform package alone does not work (said in the commit) |

Nothing else is added: class-validator, class-transformer, Swagger, zod and TanStack Query are
already there.

## api

### Foundation (`api/src/common/`)

- **Errors (E18–E22).**
  - `errors/app.exception.ts`: `AppException(status, code, message, details?)` and its subclasses
    `NotFoundError`, `ConflictError`, `InUseError`, `ValidationError`, `UnauthorizedError`.
  - `errors/error-codes.ts`: the codes of E20 as a const union. web gets its own copy in spec 0005
    (no shared package, E26).
- **Filter.** `filters/app-exception.filter.ts` is `@Catch()` and registered as `APP_FILTER`. It
  maps, in this order:
  - `AppException` → as is;
  - Prisma `P2025` → 404 `NOT_FOUND`;
  - `P2002` → 409 `ALREADY_EXISTS`, with the fields from `meta.target`;
  - `P2003` on delete → 409 `IN_USE`, on create or update → 400 `RELATED_NOT_FOUND`;
  - a pg `23514` (check) → 400 `CONSTRAINT_VIOLATION`, the constraint name mapped to a field by a
    table in `errors/constraint-fields.ts` built from `migration.sql`;
  - `P1001`/`P1017` and connection errors from the pg adapter or ioredis → 503;
  - Nest `HttpException`s: body-parser's `entity.parse.failed` → `BAD_JSON`, `entity.too.large` →
    413, `ThrottlerException` → 429, `NotFoundException` for an unknown route → `ROUTE_NOT_FOUND`;
  - anything else → 500 `INTERNAL_ERROR`, with only a generic message in the body.

  Logging goes through the injected pino logger: 4xx as warn, 5xx as error with the stack. Only 5xx
  go to `Sentry.captureException`.

- **Validation.** `validation/validation-pipe.ts` sets `exceptionFactory`: class-validator errors →
  `ValidationError` with `details[]` (`field` is the dotted path, `code` is the constraint name in
  upper snake case, `message` is English). `main.ts` uses it in place of the current pipe (same
  options).
- **Ids.** `pipes/uuid.pipe.ts`: `ParseUUIDPipe` whose error is `INVALID_ID`.
- **Paging.** `pagination/`: `PaginationQueryDto` (`limit` 1–100, default 60; `offset` ≥ 0, default
  0), `Paginated<T>` and an `ApiPaginatedResponse(Dto)` Swagger decorator.
- **Admin access (E1).** `guards/admin.guard.ts` plus `@AdminOnly()`.
  - The guard compares the `X-Admin-Token` header with `ADMIN_API_TOKEN` using
    `crypto.timingSafeEqual` on SHA-256 digests (equal lengths).
  - An empty env value rejects everything.
  - It is applied per controller or route, not globally, so health and public reads need nothing.
  - Swagger: `addApiKey({ in: 'header', name: 'X-Admin-Token' }, 'admin')` and
    `@ApiSecurity('admin')`.
- **Media and price (E8).**
  - `media/media-url.ts`: `toMediaUrl(key)`. The base is normalized to end with `/`; the result
    must keep the base's origin and start with its path (the backlog rule). A key that escapes
    throws, which means a 500, since the database already forbids such keys.
  - `price/final-price.ts`: `finalPrice(price: Decimal, discount: number)` computes
    `floor(price × (100 − discount) / 100)` in `Decimal` arithmetic, then returns a number.
- **Serialization (E6).** Mappers in each module turn `Decimal` into a number; there is no global
  interceptor.

### Environment

New keys in `config/env.ts`, in `.env.example` with comments, and in `deploy/compose/app.yml`:

| Key                                | Rule                                  | Local value                        | Production                            |
| ---------------------------------- | ------------------------------------- | ---------------------------------- | ------------------------------------- |
| `ADMIN_API_TOKEN`                  | string, may be empty (empty = closed) | generated by `scripts/init-env.sh` | GitHub secret → server `.env`         |
| `MEDIA_BASE_URL`                   | URL, http(s)                          | `http://localhost:3001/media/`     | `https://lamoda-ai-fitting.ru/media/` |
| `SENTRY_DSN`, `SENTRY_ENVIRONMENT` | optional; empty DSN = off             | empty                              | the api project's DSN                 |

The server `.env` already holds `SENTRY_DSN` for web. The api's DSN therefore enters it as
`API_SENTRY_DSN` (written by `cd.yml`). `app.yml` passes it to the api and worker containers as
`SENTRY_DSN`.

### Sentry (E23–E25)

- **`src/instrument.ts`.** It calls `Sentry.init` with:
  - `dsn || undefined`, `environment`, `release: APP_VERSION`, `tracesSampleRate: 0.1`;
  - `sendDefaultPii: false`, and request headers, cookies and bodies off (the 11.x
    `dataCollection` option, as web does).

  It reads `process.env` directly: it runs before Nest and its config. It is imported as the first
  line of `main.ts` and of `temporal/worker.ts`.

- **Module.** `SentryModule.forRoot()` goes into `AppModule` and `WorkerModule`. Our filter does the
  capture, so `SentryGlobalFilter` is not used.
- **Worker.** A failed activity is captured in an activity interceptor. Workflow code does not
  import Sentry (determinism); workflow failures surface as activity or client errors.
- **Source maps.** `tsconfig` already emits them.
  - The Dockerfile `build` stage runs, behind
    `RUN --mount=type=secret,id=sentry_auth_token,env=SENTRY_AUTH_TOKEN`:
    `sentry-cli sourcemaps inject dist && sentry-cli sourcemaps upload --release $SENTRY_RELEASE dist`,
    only when the token is set. The maps are then deleted from `dist`.
  - `scripts/ci-build-images.sh` passes the secret and the `SENTRY_ORG`, `SENTRY_PROJECT_API` and
    `SENTRY_RELEASE` args to the api build. `ci.yml` adds `vars.SENTRY_PROJECT_API`.

### Resources (E2–E4, E7, E9–E12)

**Module shape.** Each module follows `hello`: `<name>.module.ts`, a thin controller, a service on
`PrismaService`, `dto/` (create, update = `PartialType(create)`, response, list query). Routes:

| Module             | Routes                                                                                                                                                                              | Access                     |
| ------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------- |
| `categories`       | `GET /categories` (`?isActive`), `GET /categories/:id`, `POST`, `PATCH /:id`, `DELETE /:id`                                                                                         | reads public, writes admin |
| `brands`           | same, no filter                                                                                                                                                                     | reads public, writes admin |
| `attributes`       | `/attributes` CRUD; `/attributes/:id/values` list, create; `/attributes/:id/values/:valueId` read, update, delete                                                                   | reads public, writes admin |
| `products`         | `/products` CRUD (list = E13–E15); `GET /products/facets`; `/products/:id/images`, `/variations`, `/attribute-values` (list, create, update, delete; attribute values: add, remove) | reads public, writes admin |
| `users`            | `/users` CRUD                                                                                                                                                                       | admin                      |
| `fitting-sessions` | `/fitting-sessions` CRUD (`?userId`)                                                                                                                                                | admin                      |
| `ai-generations`   | `/ai-generations` CRUD (`?sessionId`), `productIds` in create and update                                                                                                            | admin                      |

**DTO rules.** They repeat the CHECK constraints of `migration.sql` (E9): lengths, trimmed names,
slug regex, `price > 0` with at most 2 decimals, `discount` 0–100, `rating` 0–5 with 1 decimal,
image keys by the C22 regex. They live in one `common/validation/rules.ts` so the regexes have one
copy.

**Module-specific rules.**

- **users (E10).** The phone is normalized by a `@Transform` (digits only; a leading `8` or `7`
  becomes `+7`), then `^\+79\d{9}$`. The email is trimmed and lower-cased. `dateOfBirth` must be at
  least 14 years before today (UTC date) and not before 1900-01-01.
- **fitting-sessions (E11).**
  - Every query that looks up the active session adds `isActive: true` (schema note).
  - Create, or a PATCH that sets `isActive: true`, runs in one `$transaction`: archive the user's
    active session, then write.
  - Two parallel activations: the partial unique index rejects the second with `P2002`, which
    becomes 409.
- **ai-generations (E12).**
  - A class-level validator checks the status, result and error triple for create, and for update
    on the merged row (the service reads the row, merges, validates, writes).
  - `productIds` replace the links in the same transaction (`deleteMany` + `createMany`).
- **products (E7, E8).** The list item has `{ id, article, name, brand{id,name,slug},
category{id,name,slug}, image: {url} | null, price, discount, finalPrice, rating, createdAt }`.
  The detail adds `description`, `images[]`, `variations[]` (size, stock), and `attributes[]`
  grouped as `{ attribute{id,name}, values[{id,value}] }`.

### Product listing (E13–E17)

- **Query DTO.** `ProductListQueryDto` extends paging with:
  - `categoryId[]`, `brandId[]`, `size[]` and `attributeValueId[]`, accepting repeated keys or a
    comma list;
  - `q`, 1–100 characters;
  - `minPrice` and `maxPrice`;
  - `hasDiscount`;
  - `sort` ∈ `new | price_asc | price_desc | discount | rating`, default `new`.

  Arrays are capped at 50 values each.

- **One filter builder.** `products/listing/product-filter.ts` builds both:
  - a Prisma `where` for the list;
  - a `Prisma.sql` fragment for the facets, from the same parsed filters.

  Attribute values are grouped by attribute through one lookup of their `attributeId`s, giving an AND
  across groups and an OR inside each (E13a). An unknown value id gives an empty result, not an
  error. The size filter is `variations: { some: { size: { in }, stock: { gt: 0 } } }` (E13b).

- **Sorting (E14).** Each sort ends with `id` desc as the tie-break. `rating` sorts nulls last;
  `discount` sorts desc.
- **Facets (E16).** `GET /products/facets` runs in parallel, each with the filters minus its own
  group:
  - `categories`, `brands`, `sizes` (in stock);
  - one query for all attributes, which excludes, per attribute, only that attribute's group;
  - `price {min,max}`, `discounted`, `total` with all filters.

  Every query is a `$queryRaw` tagged template with `Prisma.join` for lists. No string building.
  Counts are `count(DISTINCT p.id)` and come back as numbers.

- **Indexes.** The existing FK indexes cover the joins. No migration in this spec.

### Tests (api)

- **Unit** (`*.spec.ts` next to the code): the filter, one case per row of E20; the guard; the
  validation pipe's details; `finalPrice`; `toMediaUrl`; phone, email and age normalization; the
  generation triple validator; the filter builder (grouping, AND and OR).
- **Database e2e** (`test/database/*.e2e-spec.ts`). A new helper, `test/support/test-app.ts`, boots
  `AppModule` with `PrismaService` overridden by the client from `createTestDatabase()`. Redis and
  Temporal point at closed ports, as now. The specs cover CRUD, restrict and cascade for every
  resource, list filters and sorts, facet counts, and the session and generation rules.
- **e2e without a database:** access per route group; Swagger lists every route.

## Files

- **api.**
  - `src/instrument.ts`; `src/common/**`.
  - `src/{categories,brands,attributes,products,users,fitting-sessions,ai-generations}/**`.
  - `src/app.module.ts`, `src/main.ts`, `src/temporal/worker.ts`, `worker.module.ts`;
    `src/config/env.ts`; `src/swagger.ts`.
  - `Dockerfile`, `package.json`, `test/support/test-app.ts`, `test/**`.
- **root.** `.env.example`, `scripts/init-env.sh`, `scripts/ci-build-images.sh`,
  `deploy/compose/app.yml`, `.github/workflows/{ci,cd}.yml`, `deploy/README.md`, `CLAUDE.md`
  (stack: Sentry in api; conventions: the error format), `README.md`.

## Backlog

- **Closed and removed:** "Catalog API", "Auth input rules".
- **Added (E29, E30):**
  - "Web data layer" for spec 0005: decisions E22 (Russian texts), E26–E28 and the web design notes
    this plan held (a `shared/api` split into an isomorphic `index.ts` and a server-only `server.ts`,
    a browser `clientFetch`, `buildPath`, the error dictionary, `NEXT_PUBLIC_API_URL`); it absorbs
    the item "`apiFetch` paths";
  - remove greeting with the catalog page;
  - colour swatches;
  - a category tree;
  - a cache for facet counts if the catalog grows (the assumption in spec.md).

## Risks

- **Facet SQL.** It is the most complex code here. Mitigations: one filter builder for both list and
  facets, and database tests comparing every facet count with a list `total` for the same filters
  plus that value.
- **`$queryRaw` and injection.** Only tagged templates and `Prisma.join`, no `Prisma.raw` with
  input. The security reviewer checks the products phase.
- **The admin token in requests.** It must never be logged: pino-http's redaction gets
  `req.headers["x-admin-token"]`, and Sentry collects no headers.
- **sentry-cli install script.** If npm 12 blocks the binary download, approve it in
  `allowScripts` with the reason in the commit, or run it through the platform package; decided in
  the task.
- **`@sentry/nestjs` on Nest 12 ESM.** The peer range covers it, but instrumentation needs
  `instrument.ts` loaded first. If auto-instrumentation fails under ESM, use the
  `--import ./dist/instrument.js` flag in the CMD and the compose commands.
- **Seed and deletes.** A product deleted through the api comes back on the next deploy (0002 C16b).
  This is expected and documented in the api's Swagger description of DELETE /products/:id.

## How each criterion is verified

| AC   | Check                                                                                                                                          |
| ---- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| AC1  | e2e: each route group with no token, a wrong token, the right token, an empty env token; qa-tester with curl: no token, a wrong token (E32)    |
| AC2  | database e2e per resource; e2e: the Swagger JSON lists every route                                                                             |
| AC3  | database e2e: paging and `total`; `limit=101` → 400                                                                                            |
| AC4  | database e2e on the list item and detail shape; unit `toMediaUrl`                                                                              |
| AC5  | unit `finalPrice` (1999.99 / 15 → 1699; edge cases 0 and 100)                                                                                  |
| AC6  | database e2e: restrict → 409 `IN_USE`, cascades remove children                                                                                |
| AC7  | unit and database e2e: the phone and email from the AC are stored normalized; under 14 → 400                                                   |
| AC8  | database e2e: activating archives the previous one; parallel activations leave one active                                                      |
| AC9  | unit validator; e2e: no database call on a bad triple                                                                                          |
| AC10 | database e2e per filter; attributes AND across and OR inside; size with zero stock skipped                                                     |
| AC11 | database e2e per sort; the same request twice gives the same ids                                                                               |
| AC12 | database e2e: each facet count equals the list `total` for the filters plus that value; choosing a colour keeps the others                     |
| AC13 | unit filter per E20 row; e2e for broken JSON, a 101 KB body, an unknown route; qa-tester spot checks                                           |
| AC14 | unit pipe and e2e: `details` per field                                                                                                         |
| AC15 | owner: a test 500 with the DSN set shows in Sentry with the release and a TypeScript stack; unit: 4xx not captured, an empty DSN sends nothing |
| AC16 | `npm run verify`                                                                                                                               |
