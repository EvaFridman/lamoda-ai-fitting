# 0002 Database schema: tasks

Status: done (2026-10-08). History, not instructions.
Accepted 2026-10-07, amended the same day after the review of T1: seed before images, `CLAUDE.md`
updated per task, rollback check in T6, acceptance in its own pull request.
Implements [plan.md](plan.md). `👤` marks a step only the owner can do.

## How the work flows

- One pull request per phase, merged with "Rebase and merge" once CI is green; the next branch
  starts from a fresh `main`.
- One task = one commit, with its checkbox ticked in the same commit. Each task runs in a fresh
  session: brief from `spec-finder`, time estimate, implementation, `finish-task`, the owner's OK,
  commit.
- A task that changes what `CLAUDE.md` or a README describes updates it in the same commit.
- Checks name the acceptance criteria they cover; the evidence goes into "Acceptance record".

## PR 1 · `feat/0002-schema` · schema, migration, constraint tests

- [x] **T1. Spec documents.** `spec.md`, `clarifications.md`, `plan.md`, `tasks.md` of this spec; the
      three new items in `specs/backlog.md` (plan, "Backlog").
      Check: `npm run format:check`; the owner has accepted spec, plan and tasks.
      Commit: `docs(specs): add spec 0002 for the database schema`
- [x] **T2. Prisma schema and migration.** Models, enums, relations, `onDelete`, unique constraints,
      indexes and the partial unique index in `api/prisma/schema.prisma` (plan, "Schema");
      `migrate dev --create-only --name init_schema`, the CHECK constraints appended to
      `migration.sql` (plan, "Migration"), the migration applied; `prisma generate`.
      Check: AC1 (`prisma migrate status` up to date on an empty compose database); AC2 (`\dt`,
      `\d+` per table against the clarifications); `prisma migrate diff` from the migrated database
      to the schema reports no difference; `npm run verify`.
      Commit: `feat(api): add the database schema with its constraints`
- [x] **T3. Constraint tests.** `@testcontainers/postgresql` in api devDependencies (no install script
      approved); `test/support/database.ts` as Vitest `globalSetup` (one container, a template
      database, one database per file) and the `expectViolation` helper, written by the main
      session; `test/database/{users,catalog,fittings}.e2e-spec.ts` by `test-writer`. C20:
      `.claude/agents/test-writer.md`, `.claude/README.md`, the comment in `api/vitest.config.ts`;
      Claude Code restarted before `test-writer` runs. `CLAUDE.md` (Commands) and `README.md`:
      Docker must be running for `verify`.
      Check: AC3–AC6 (each rule of C12 with C22/C23, the unique keys of C7/C11/C15 including a user
      with two archived sessions and an active one (C21), the deletes of C8, UUID v7 and timestamps); AC7 (`npm run verify` locally with a clean `npm ci --prefix api`; CI green on the
      pull request); with Docker stopped, `npm test` fails with the message to start it.
      Commit: `test(api): check the database constraints on a throwaway postgres`
- [x] 👤 **Merge PR 1.** CD applies the migration on production (deploy log shows the migration and
      the new api ready).

## PR 2 · `feat/0002-seed` · demo catalog, images, deploys

- [x] **T4. Seed.** `api/src/seed/` (entry, module, service, catalog data with articles, garment
      kinds and image keys), scripts `seed` and `seed:dev` in `api/package.json`; tests for the
      idempotence rules in `api/test/database/seed.e2e-spec.ts` (`test-writer`, on the throwaway
      database of T3, C20), and that every article matches `[A-Za-z0-9][A-Za-z0-9-]*`, at most 50
      characters (C22). `CLAUDE.md` (Docker (local development)) and `README.md`: local migrate
      and seed.
      Check: AC8 (counts after `docker compose run --rm api npm run seed:dev` on an empty database);
      AC9 (second run: same counts; a price edited by hand survives); `npm run verify`.
      Commit: `feat(api): seed a demo catalog`
- [x] **T5. Placeholder images.** One WebP per image key of T4 in
      `web/public/media/seed/products/<article>/<n>.webp`, cut from one Unsplash photo per product
      (C9b, C9c, C9d); each product names its photo in `catalog.data.ts`, and its data follows the
      photo (C9g); a test that every key has its file and every product its photo source;
      `web/Dockerfile` copies `public/` and owns the app by root with only `.next/cache` writable
      (backlog "Image ownership", removed from `specs/backlog.md`), `api/Dockerfile` the same
      (C9f); `/media/` cached for a day (C9e); `docker-compose.yml` mounts `./web/public`.
      Check: every file is WebP (`file` reports `Web/P image`), 600×800, under 100 KB; the owner looks
      at them; `curl -I localhost:3001/media/seed/…` → 200 with the C9e `Cache-Control` for every
      key; the production images built by `scripts/ci-build-images.sh` serve one too and run with a
      read-only app tree; `npm run verify`; 👤 the owner clears the local database and reseeds, then
      AC8 and AC9 counts again.
      Commit: `feat(web): add placeholder images for the demo catalog`
- [x] **T6. Seed on deploy.** `deploy/scripts/deploy.sh` runs `node dist/seed/main.js` after the
      migrations when the image has it, "seed skipped" otherwise; a failed seed fails the deploy like
      a failed migration. `scripts/ci-deploy-check.sh` checks the counts after both deploys and,
      outside CI, removes the stack it started (C25; closes the backlog item).
      `deploy/README.md`, `.claude/rules/deploy.md` and `CLAUDE.md` (Production and deploys) describe
      the step.
      Check: AC11 on CI (deploy check log: migration, then seed, before the new api starts; the
      second deploy changes no counts); `deploy.sh` with an image from before T4 logs "seed skipped"
      and deploys; `npm run verify`.
      Commit: `feat(deploy): load the demo catalog on every deploy`
- [x] 👤 **Merge PR 2.** CD log shows the migration (no-op), the seed and the new api ready; the
      owner applies the drawsql patch (spec, "Owner actions").

## PR 3 · `docs/0002-close` · acceptance

- [x] **T7. Close the spec.** AC10 (`curl -I` on every seed key on production) and AC12 (CD log;
      counts read by the owner over SSH); "Acceptance record" filled in; a last pass over `CLAUDE.md`
      and `README.md` against what was built; all spec files `Status: done`.
      Check: every AC has evidence below; `npm run format:check`.
      Commit: `docs(specs): close spec 0002`

## Acceptance record

All 12 criteria checked on 2026-10-08. Production checks ran against https://lamoda-ai-fitting.ru;
CD logs are the `CD / Deploy to production` jobs of the CI runs on `main` for PR #19 (acb4d10),
PR #20 (545fc97) and PR #21 (e6d2fb9).

| AC   | Result    | Evidence                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| ---- | --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| AC1  | pass (T2) | local: `prisma migrate status` → "Database schema is up to date!"; `prisma migrate diff` from the database to `schema.prisma` → "No difference detected". On empty databases: every run of the Vitest project `database` (a throwaway PostgreSQL); the CI deploy check and the production CD of acb4d10 both log "Applying migration `20261007174845_init_schema`" → "All migrations have been successfully applied"                                                                                                                       |
| AC2  | pass (T2) | `\dt` lists `_prisma_migrations` and the twelve tables of C4, nothing else; columns, types and nullability checked with `\d+` against the clarifications in T2                                                                                                                                                                                                                                                                                                                                                                             |
| AC3  | pass (T3) | `api/test/database/`: "ids and timestamps (AC3)" in `users`, `catalog` and `fittings` (UUID v7, `created_at`/`updated_at` filled); `updated_at` changing on update is checked in `users`                                                                                                                                                                                                                                                                                                                                                   |
| AC4  | pass (T3) | `api/test/database/`: each rule of C12 (with C22/C23) has an accepted and a rejected row, in `users`, `catalog` and `fittings`                                                                                                                                                                                                                                                                                                                                                                                                             |
| AC5  | pass (T3) | `api/test/database/`: duplicates of C7/C11/C15 rejected, including a user with two archived sessions and one active (C21)                                                                                                                                                                                                                                                                                                                                                                                                                  |
| AC6  | pass (T3) | `api/test/database/`: "deletes (AC6, C8)" in `catalog` and `fittings`                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| AC7  | pass (T3) | the Vitest project `database` runs in `npm run verify`; CI `Checks` green on PR #19, PR #21 and `main` (e6d2fb9: 4 database files, 334 tests passed)                                                                                                                                                                                                                                                                                                                                                                                       |
| AC8  | pass (T4) | `seed.e2e-spec.ts` "loads the whole catalog into an empty database (AC8)"; local after `seed:dev`: 6 categories, 5 brands, 30 products, 0 users; the CI deploy check counts after the first deploy, incomplete products 0                                                                                                                                                                                                                                                                                                                  |
| AC9  | pass (T4) | `seed.e2e-spec.ts` (second run, a price edited by hand survives); CI deploy check, second deploy: "Seed done: 0 products created, 30 already there", counts unchanged                                                                                                                                                                                                                                                                                                                                                                      |
| AC10 | pass (T7) | `curl -I` on all 78 keys of `web/public/media/` → 200, `image/webp`, `Cache-Control: public, max-age=86400`, locally (port 3001) and on production                                                                                                                                                                                                                                                                                                                                                                                         |
| AC11 | pass (T6) | CI deploy check (e6d2fb9): migration, then "seeding the demo catalog", before the new api starts; the second deploy logs "No pending migrations to apply" and "0 products created, 30 already there". Production: acb4d10 applies the migration; 545fc97 "No pending migrations to apply"; e6d2fb9 migration no-op, then "Seed done: 30 products created, 0 already there", then the new copy starts. A no-op seed on production is first seen in the deploy of this pull request; the no-op of both steps is shown by the CI deploy check |
| AC12 | pass (T7) | CD of e6d2fb9: green api and web "Healthy" (readiness checked inside the server), "done: e6d2fb9 serves the site from green". Production counts read by the owner over SSH: 6 categories, 5 brands, 30 products, 78 images, 129 sizes, 90 attribute links, 0 users, 0 products without an image, a size or an attribute value                                                                                                                                                                                                              |
