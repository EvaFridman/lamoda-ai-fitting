# 0002 Database schema: catalog, users, fittings

Status: done (2026-10-08): all 12 criteria pass (`tasks.md`, "Acceptance record"). History, not instructions.
Accepted 2026-10-07, amended the same day after the review of T1: AC2, AC3, AC12.
Decisions this spec relies on: [clarifications.md](clarifications.md) (referred to by their ids, e.g. C7).

## Goal

The api has a database connection but no tables. Every feature that follows (auth, catalog, AI
fitting) needs the same data model, so it lands first and on its own: the tables the owner designed,
with the rules that keep the data consistent enforced by the database itself, and a demo catalog so
the site and local development have something to show before real products exist.

## In scope

- Twelve tables: users; categories, brands, products, product images, product sizes (variations),
  attributes, attribute values, product attribute values; fitting sessions, AI generations,
  products of a generation (C1, C4).
- Data rules enforced by the database: required fields, uniqueness, value formats and ranges, what
  happens to related rows on delete (C7, C8, C11, C12, C15).
- A demo catalog (seed) that is loaded locally and in production, and that can be loaded again
  without duplicating or overwriting anything (C5, C16).
- Placeholder images for the demo catalog, served by the site (C9).
- Every deploy applies new migrations, then loads the seed (C16).

## Non-goals

- Endpoints and pages for the catalog, profile or fitting: later specs (C1).
- Sign-up and login, and the input rules that belong to them (phone normalization, age 14+):
  spec `0003-auth` (C2, C12).
- File storage and photo upload; building full image URLs (`MEDIA_BASE_URL`): later specs (C9).
- Reviews and computing ratings, nested categories, the price after the discount (C4, C13, C17).
- Database backups and restore: a separate spec before launch (0001).

## Acceptance criteria

Each criterion is checked by the command or action next to it.

### Schema

- AC1. On an empty local database, applying the migrations succeeds and
  `docker compose run --rm api npx prisma migrate status` reports the schema up to date.
- AC2. `\dt` in psql lists the twelve tables of C4 (plus the migration history table of the
  migration tool, nothing else), with the columns, types and nullability of the drawsql design as
  amended in `clarifications.md`.
- AC3. A row inserted without an id gets a UUID v7 (`uuid_extract_version(id) = 7`), and
  `created_at`/`updated_at` are filled; `updated_at` changes when the api updates the row.

### Data rules

- AC4. Each rule of C12 is covered by a test: a valid row is accepted, and a row breaking the rule is
  rejected by the database (for example phone `89991234567`, email `Ivan@Mail.ru`, discount 101,
  stock -1, a slug with a capital letter, an image key starting with `/`, a completed generation
  without a result image).
- AC5. The database rejects duplicates: phone, email, category name and slug, brand name, product
  article, attribute name, the same size twice for one product, the same value twice for one
  attribute, a second active fitting session for one user (C11, C15).
- AC6. Deletes behave as C8 says: deleting a product removes its images, sizes and attribute links;
  deleting a product used in a generation, or a brand or category that has products, is refused;
  deleting a user removes their sessions, generations and the generations' product links.
- AC7. AC4–AC6 run in `npm run verify`, locally and in CI.

### Demo catalog

- AC8. After the seed on an empty database: at least 5 categories, 5 brands and 30 products; every
  product has at least one image, one size and one attribute value. No users are created.
- AC9. Running the seed a second time changes no row counts, and a value edited by hand in the
  database (for example a product's price) keeps the edited value.
- AC10. For every image key in the seed, `curl -I <site>/media/<key>` returns 200, locally and in
  production.

### Deploys

- AC11. A merge into `main` with this spec's migration deploys successfully; the deploy log shows the
  migration, then the seed, before the new api starts. The next deploy shows both as no-ops.
- AC12. After the deploy, the CD log shows the new api ready (the deploy checks readiness from inside
  the server; the endpoint is closed to the public), and the production database holds the demo
  catalog of AC8 (counts read by the owner on the server).

## Owner actions (Claude cannot do them)

- Apply the drawsql patch, so the diagram matches the schema.
- Approve the steps that touch the server, if a deploy has to be checked or repaired by hand.

## Assumptions

- The production database has no tables of its own yet: spec 0001 shipped no migrations.
- The demo catalog is invented: no real products or brands. Its photos come from Unsplash under the
  Unsplash License, each product naming its source (C9d).
