# 0002 Database schema: tasks

Status: accepted (2026-10-07), amended the same day after the review of T1: seed before images,
`CLAUDE.md` updated per task, rollback check in T6, acceptance in its own pull request.
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
- [ ] 👤 **Merge PR 1.** CD applies the migration on production (deploy log shows the migration and
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
- [ ] **T5. Placeholder images.** One WebP garment drawing per image key of T4 (C9b, C9c) in
      `web/public/media/seed/products/<article>/<n>.webp`; a test that every key has its file;
      `web/Dockerfile` copies `public/` and owns the app by root with only `.next/cache` writable
      (backlog "Image ownership", removed from `specs/backlog.md`); `docker-compose.yml` mounts
      `./web/public`.
      Check: every file is WebP (`file` reports `Web/P image`), 600×800, under 100 KB; the owner looks
      at them; `curl -I localhost:3001/media/seed/…` → 200 for every key; the production web image
      built by `scripts/ci-build-images.sh` serves one too and runs with a read-only app tree;
      `npm run verify`.
      Commit: `feat(web): add placeholder images for the demo catalog`
- [ ] **T6. Seed on deploy.** `deploy/scripts/deploy.sh` runs `node dist/seed/main.js` after the
      migrations when the image has it, "seed skipped" otherwise; a failed seed fails the deploy like
      a failed migration. `scripts/ci-deploy-check.sh` checks the counts after both deploys.
      `deploy/README.md`, `.claude/rules/deploy.md` and `CLAUDE.md` (Production and deploys) describe
      the step.
      Check: AC11 on CI (deploy check log: migration, then seed, before the new api starts; the
      second deploy changes no counts); `deploy.sh` with an image from before T4 logs "seed skipped"
      and deploys; `npm run verify`.
      Commit: `feat(deploy): load the demo catalog on every deploy`
- [ ] 👤 **Merge PR 2.** CD log shows the migration (no-op), the seed and the new api ready; the
      owner applies the drawsql patch (spec, "Owner actions").

## PR 3 · `docs/0002-close` · acceptance

- [ ] **T7. Close the spec.** AC10 (`curl -I` on every seed key on production) and AC12 (CD log;
      counts read by the owner over SSH); "Acceptance record" filled in; a last pass over `CLAUDE.md`
      and `README.md` against what was built; all spec files `Status: done`.
      Check: every AC has evidence below; `npm run format:check`.
      Commit: `docs(specs): close spec 0002`

## Acceptance record

Filled in by T7.

| AC   | Result | Evidence |
| ---- | ------ | -------- |
| AC1  |        |          |
| AC2  |        |          |
| AC3  |        |          |
| AC4  |        |          |
| AC5  |        |          |
| AC6  |        |          |
| AC7  |        |          |
| AC8  |        |          |
| AC9  |        |          |
| AC10 |        |          |
| AC11 |        |          |
| AC12 |        |          |
