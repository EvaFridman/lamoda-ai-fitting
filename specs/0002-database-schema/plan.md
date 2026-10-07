# 0002 Database schema: plan

Status: accepted (2026-10-07), amended the same day after the review of T1: three pull requests,
seed skipped by older images, `updated_at` default, the test-writer rules (C20), image ownership;
amended after the review of T4: reference rows only with a new product (C16b); amended during T5:
Unsplash photos and seed data that follows them (C9d, C9g), `/media/` cache (C9e), api image
ownership (C9f).
How the accepted [spec.md](spec.md) is built. Decisions are referred to by their ids in
[clarifications.md](clarifications.md).

## Overview

Three phases, one pull request each:

1. **Schema** (phase A): Prisma models for the twelve tables, one migration `init_schema` with every
   constraint, and tests that run the migration on a throwaway PostgreSQL and check each rule.
2. **Seed** (phase B): a Nest standalone script that loads the demo catalog, placeholder images in
   `web/public/media/`, a deploy step that runs the seed after the migrations, and the living docs.
3. **Acceptance** (phase C): the production checks that need phase B live (AC10, AC12); the spec is
   closed.

Phase A can go live on its own: an empty schema the running code does not use (expand only).
`CLAUDE.md` is updated in the task that changes what it describes (T3, T4, T6), not at the end.

## Versions (checked against the registry on 2026-10-07)

| Package                    | Version | Where                | Why                                    |
| -------------------------- | ------- | -------------------- | -------------------------------------- |
| prisma, @prisma/client     | 7.10    | api (already)        | `partialIndexes` preview feature (C15) |
| PostgreSQL                 | 18.6    | compose, prod, tests | `uuidv7()` (C3)                        |
| @testcontainers/postgresql | 12.2.0  | api devDependencies  | throwaway database for the tests (C19) |

`@testcontainers/postgresql` (public repository `testcontainers/testcontainers-node`, released
2026-09-28) pulls `ssh2`, whose install script only builds an optional native speed-up
(`cpu-features`). No install script is approved: `ssh2` works without it; T3 confirms on a clean
`npm ci`. Every environment runs PostgreSQL 18, which provides `uuidv7()`.

## Schema (`api/prisma/schema.prisma`)

- Generator: `previewFeatures = ["partialIndexes"]`.
- Models in PascalCase, fields in camelCase, `@@map`/`@map` to the snake_case names of the design
  (C10): `User` → `users`, `ProductVariation` → `product_variations`, `fittingProfileImageKey` →
  `fitting_profile_image_key`, …
- Ids: `id String @id @default(dbgenerated("uuidv7()")) @db.Uuid`; foreign keys `@db.Uuid` (C3).
- Timestamps: `createdAt DateTime @default(now()) @map("created_at") @db.Timestamptz(3)`,
  `updatedAt DateTime @default(now()) @updatedAt @map("updated_at") @db.Timestamptz(3)` on every
  table except `generation_products` (C10). The database fills both on insert, so a row written
  without Prisma (psql, raw SQL) is complete; Prisma moves `updatedAt` on update.
- Enums: `Gender { male female }` → `gender`, `GenerationStatus { pending processing completed
failed }` → `generation_status` (C6).
- Types from the design: `varchar(n)` → `@db.VarChar(n)`; plain `varchar` without a length →
  `@db.VarChar(255)` (keys, names, article, title), `text` → `@db.Text`; `price @db.Decimal(10, 2)`,
  `rating Decimal? @db.Decimal(2, 1)` (C13), `discount Int @default(0)`, `sortOrder Int @default(0)`,
  `isActive Boolean @default(true)` (sessions), `categories.is_active` without a default as in the
  design.
- Changed against the design: `phone @db.VarChar(12)`, `email @db.VarChar(254)` (C12); nullable
  `categories.description` (C17), `products.rating` (C13); renamed image columns (C9);
  `updated_at` in `ai_generations` (C10).
- Relations and `onDelete` (C4, C8):
  - `Cascade`: product → images, variations, product attribute values; user → sessions;
    session → generations; generation → generation products.
  - `Restrict`: product → brand, product → category, attribute value → attribute, product attribute
    value → attribute value, generation product → product.
- Junctions: `@@id([productId, attributeValueId])`, `@@id([generationId, productId])`.
- Unique and indexes (C7, C11, C15):
  - `@unique` on `users.phone`, `users.email`, `categories.name`, `categories.slug`, `brands.name`,
    `products.article`, `attributes.name` (from the design; AC5, and the keys the seed relies on).
  - `@@unique([productId, size])` on variations, `@@unique([attributeId, value])` on attribute
    values; both also serve the foreign-key lookup.
  - `@@index` on `products(brandId)`, `products(categoryId)`, `product_images(productId)`,
    `product_attribute_values(attributeValueId)`, `ai_generations(sessionId)`,
    `generation_products(productId)`; the composite primary keys cover the other junction columns.
  - `@@unique([userId], where: raw("is_active"))` on fitting sessions (partial unique index), plus
    `@@index([userId])` for the history list.

## Migration (`api/prisma/migrations/<timestamp>_init_schema/migration.sql`)

- Generated by `docker compose run --rm api npx prisma migrate dev --create-only --name init_schema`,
  then the CHECK constraints are appended to the file with the Edit tool, then the migration is
  applied with `prisma migrate dev`. Prisma does not model CHECK constraints and ignores them when it
  compares the schema with the database, so later migrations neither drop nor repeat them.
- Every CHECK is named `<table>_<column>_check` (or `<table>_<rule>_check` when it spans columns), so
  a test and a future error message can name the rule.
- The rules of C12, as SQL:

| Constraint                                                                              | Expression                                                                                                                                                                                                                              |
| --------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `users_phone_check`                                                                     | `phone ~ '^\+79[0-9]{9}$'`                                                                                                                                                                                                              |
| `users_email_check`                                                                     | `email = lower(email) AND char_length(email) <= 254 AND email ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'`                                                                                                                      |
| `users_first_name_check` (and `last_name`, `patronymic`, NULL allowed for the last two) | `char_length(x) BETWEEN 2 AND 50 AND x ~ '^[A-Za-zА-ЯЁа-яё]+([ ''-][A-Za-zА-ЯЁа-яё]+)*$'`                                                                                                                                               |
| `users_date_of_birth_check`                                                             | `date_of_birth >= DATE '1900-01-01' AND date_of_birth <= CURRENT_DATE`                                                                                                                                                                  |
| `categories_slug_check`                                                                 | `slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'`                                                                                                                                                                                                     |
| `<table>_<column>_check` for names, article, size, value                                | `x <> '' AND x = btrim(x)`                                                                                                                                                                                                              |
| `products_price_check`                                                                  | `price > 0`                                                                                                                                                                                                                             |
| `products_discount_check`                                                               | `discount BETWEEN 0 AND 100`                                                                                                                                                                                                            |
| `products_rating_check`                                                                 | `rating BETWEEN 0 AND 5` (NULL passes)                                                                                                                                                                                                  |
| `product_variations_stock_check`                                                        | `stock >= 0`                                                                                                                                                                                                                            |
| `categories_sort_order_check`, `product_images_sort_order_check`                        | `sort_order >= 0`                                                                                                                                                                                                                       |
| `<table>_<column>_check` for the four image keys (C22)                                  | `x ~ '^[A-Za-z0-9][A-Za-z0-9._-]*(/[A-Za-z0-9][A-Za-z0-9._-]*)*$' AND strpos(x, '..') = 0`                                                                                                                                              |
| `ai_generations_error_message_check` (C23)                                              | `error_message <> ''` (the length is the column type, `varchar(1000)`)                                                                                                                                                                  |
| `ai_generations_status_check`                                                           | `(status = 'completed' AND result_image_key IS NOT NULL AND error_message IS NULL) OR (status = 'failed' AND error_message IS NOT NULL) OR (status IN ('pending','processing') AND result_image_key IS NULL AND error_message IS NULL)` |

- `CURRENT_DATE` in a CHECK is evaluated when a row is written: a date valid then stays valid, so
  existing rows and dump restores are not affected.
- Postgres's `btrim` trims spaces only; tabs and newlines in names are the api's validation (later
  specs).

## Tests (C19, C20, AC3–AC7)

- `api/test/support/database.ts`, used through Vitest `globalSetup`: starts one
  `PostgreSqlContainer('postgres:18.6-trixie')` for the run, applies the migrations with
  `prisma migrate deploy` into a template database, and hands its address to the tests
  (`provide`/`inject`). Each test file creates its own database from the template
  (`CREATE DATABASE … TEMPLATE …`), so files run in parallel without sharing rows. The container is
  removed at the end of the run.
- `api/test/database/*.e2e-spec.ts`, one file per area: `users`, `catalog`, `fittings` (T3), and
  `seed` for the idempotence rules (T4). For every
  rule: one valid row passes, each broken variant is rejected with the named constraint (or unique
  index, or foreign key). Deletes: cascade and restrict as C8. Ids: `uuid_extract_version(id) = 7`;
  timestamps filled, `updatedAt` moves on update (AC3).
- Writes go through the generated Prisma client with the pg adapter, the way the api writes. The
  exact shape of a constraint error under the driver adapter (where the constraint name sits) is
  pinned in a helper `expectViolation(promise, name)` in `test/support/` in T3.
- Who writes what: the main session writes `test/support/*` (the test-writer hook allows only
  `*.spec.ts` and `*.e2e-spec.ts`, and that stays); `test-writer` writes the specs.
- C20 in T3: `.claude/agents/test-writer.md` allows specs under `api/test/database/` (and only
  there) to use the throwaway database from `test/support/database.ts`; every other test still
  stubs Prisma. `.claude/README.md` and the comment in `api/vitest.config.ts` say the same. Claude
  Code is restarted after the agent file changes.
- The tests need a running Docker. Without it, `globalSetup` fails with a message saying so; it
  never skips.

## Seed (C5, C9, C16)

- `api/src/seed/`: `main.ts` (entry), `seed.module.ts` (config, logger, Prisma only), `seed.service.ts`,
  `catalog.data.ts` (the data). It is compiled by `nest build` like the rest, so the runtime image
  has `dist/seed/main.js` and production runs plain `node`. Scripts in `api/package.json`:
  `"seed": "node dist/seed/main.js"`, `"seed:dev": "nest start --entryFile seed/main"`, the same
  pattern as the worker.
- `main.ts` builds a Nest application context (no HTTP server), runs the service, closes the context
  and exits with 1 on error. Logging through pino, as everywhere in the api.
- Data: about 5 categories, 5 brands (invented names), 3 attributes (colour, material, season) with
  values, 30 products with a unique article, a garment kind (for its picture), price, discount,
  rating, 2–3 images, 3–5 sizes with stock, and attribute values. No users (C5). The seed task (T4)
  fixes the articles and image keys; the image task (T5) draws one file per key.
- Idempotence (C16, C16b):
  - the articles that exist are read in one query; when every product exists, the run ends there;
  - categories, brands, attributes, attribute values that the missing products need (and only
    those): `createMany({ skipDuplicates: true })` on their unique keys (`slug`/`name`, `name`,
    `name`, `(attributeId, value)`), then read back the ids by those keys;
  - products: a product whose article exists is skipped whole. A new product is created in one
    transaction together with its images, sizes and attribute links. So a reseed never adds,
    changes or removes anything under an existing product, and a hand edit survives (AC9).

## Placeholder images (C9a–C9g)

- Seed articles match `[A-Za-z0-9][A-Za-z0-9-]*`, at most 50 characters, so every key passes the
  image key CHECK (C22); the seed test checks it together with the files.
- Keys `seed/products/<article>/<n>.webp`, files `web/public/media/seed/products/…`, WebP only:
  an Unsplash photo of one garment, no people or visible logos (C9d); image 1 the whole garment,
  images 2 and 3 closer crops of the same photo; 3:4, 600×800, under 100 KB each.
- The seed data follows the photo (C9g): a product's colour, kind, name, description, material and
  season match it; articles and categories stay. The colour attribute gains `коричневый`,
  `жёлтый`, `оранжевый` and loses the unused `красный`. 👤 The owner clears the local database and
  reseeds, since the seed never changes existing products (C16b).
- Each seed product names its photo (`photo: { url, author }`, the Unsplash page); the seed does not
  store it. Downloads go to a fresh scratchpad folder; a Node script there, with `sharp` installed
  there (the owner confirms the install), crops and re-encodes them; only the `.webp` files are
  committed (C9c).
- A test in api checks that every image key of the seed data has its file under `web/public/media/`,
  no seed file lacks a key, and every product names an Unsplash photo.
- `web/next.config.ts` sends `Cache-Control: public, max-age=86400` for `/media/:path*` (C9e).
- `api/Dockerfile` runtime copies with `--chown=root:root` and gives `/app` back to root (C9f).
- `web/Dockerfile`: the runtime stage copies `public/` (the standalone output does not include it),
  so `/media/…` is served in production (AC10). The backlog item "Image ownership" is in this area
  and is done in the same task: the app is owned by root and only `.next/cache` is writable by the
  runtime user, as in `api/Dockerfile`; the item leaves `specs/backlog.md` in that commit.
- `docker-compose.yml` mounts `./web/public` into the web container, so new images show up locally
  without a rebuild.
- nginx already sends everything outside `/api/` and `/socket.io/` to web.

## Deploys (C16, AC11, AC12)

- `deploy/scripts/deploy.sh`, step 3b: after `prisma migrate deploy`, a second one-off container of
  the new image runs the seed if the image has it (`test -f dist/seed/main.js`, C16a), and logs "seed
  skipped" otherwise. A rollback through CD checks out the current `deploy.sh` but may deploy an image
  from before the seed existed; without the guard, that rollback would fail. A failed seed stops the
  deploy like a failed migration: the active version keeps serving; the migration already applied
  stays (compatible by rule).
- `scripts/ci-deploy-check.sh` runs `deploy.sh` on the CI runner, so every pull request exercises
  migration plus seed twice (first deploy and the blue-green switch); the second run must be a
  no-op. The check adds a count query after each deploy.
- `/api/health/ready` is closed to the public by nginx; `deploy.sh` checks readiness from inside the
  new api container, so AC12 reads the CD log, and the production counts are read by the owner over
  SSH.
- No new environment variable: the seed uses `DATABASE_URL` and the validated env the api already
  has. `MEDIA_BASE_URL` comes with the first API that returns images (backlog).

## Local development

- After pulling the schema: `docker compose run --rm api npx prisma migrate dev`, then
  `docker compose run --rm api npm run seed:dev`. `README.md` gets both commands (T4).
- The anonymous volume with the generated client needs `npx prisma generate` after a schema change
  (as `CLAUDE.md` already says).

## Backlog

Items added by this spec (`specs/backlog.md`, T1):

- catalog API: `MEDIA_BASE_URL` and full image URLs, price after the discount (C9, C17);
- auth (0003): normalize phone input to `+79…`, email to lower case, minimum age 14 (C12);
- file storage for user photos and generation results (C9a).

Existing items in this spec's area: "Image ownership" (`web/Dockerfile`), done in T5; "Local deploy
check leaves its stack" (`scripts/ci-deploy-check.sh`), done in T6 (C25).

## Risks

| Risk                                                                           | Mitigation                                                                                                                                    |
| ------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------- |
| `partialIndexes` is a preview feature: its syntax may change in a later Prisma | pinned Prisma 7.10; if it misbehaves, the index moves to raw SQL in the migration and the test of C15 catches a regression                    |
| The client treats the partial key `userId` as fully unique (C21)               | queries add `isActive: true`; a comment in `schema.prisma`; T3 tests a user with archived sessions and an active one                          |
| A later `migrate dev` wants to drop or rewrite something added by hand         | only CHECKs are added by hand, and Prisma ignores them; T2 runs `prisma migrate diff` against the migrated database and expects no difference |
| Regex classes behave differently under the database's locale                   | ASCII and explicit Cyrillic ranges only, no `[[:alpha:]]`; tests run on the same image as production                                          |
| Docker not running blocks `verify` and pre-push                                | intended (C19); the failure message says to start Docker                                                                                      |
| Testcontainers on macOS needs the Docker socket path                           | Docker Desktop's default socket works; noted in `README.md` if T3 needs a setting                                                             |
| A rollback deploys an image without the seed                                   | the seed step runs only when the image has `dist/seed/main.js`; T6 checks a deploy of an image from before T4                                 |
| The seed slows every deploy                                                    | a run that finds every product is one query; measured in the deploy check log                                                                 |

## How each criterion is verified

| AC      | Check                                                                                                  |
| ------- | ------------------------------------------------------------------------------------------------------ |
| AC1     | `migrate dev` on an empty compose database; `prisma migrate status`                                    |
| AC2     | `\dt` and `\d+ <table>` in psql against the clarifications; reviewed in T2                             |
| AC3     | tests in `test/database/` (UUID version, timestamps)                                                   |
| AC4–AC6 | tests in `test/database/`, one case per rule                                                           |
| AC7     | `npm run verify` locally and the CI `Checks` job                                                       |
| AC8     | count queries after `npm run seed:dev`, and in the deploy check                                        |
| AC9     | seed twice, edit a price by hand, seed again; counts and the price unchanged                           |
| AC10    | `curl -I` on every seed key locally and on production (a script loop)                                  |
| AC11    | CI deploy check log; the production CD log after the merge of phase B                                  |
| AC12    | the CD log (readiness checked inside the new api) and the production counts, read by the owner via SSH |
