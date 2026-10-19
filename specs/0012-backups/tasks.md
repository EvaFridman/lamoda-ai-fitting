# 0012 Backups: tasks

Status: accepted (2026-10-19).
Implements [plan.md](plan.md). `👤` marks a step only the owner can do.

## How the work flows

- Two pull requests (P10), merged with "Rebase and merge" once CI is green; PR 2 starts from a
  fresh `main` after spec 0011 is closed.
- Each task: brief from `spec-finder`, a time estimate, the code, `finish-task`, the owner's OK, one
  commit that ticks its box. A fresh session (or `/clear`) per task.
- Every task of PR 2 touches config, dependencies, Docker, deploy or CI, or handles secrets, so
  `security-reviewer` joins each review.
- The pull request of PR 2 carries `Closes #42` under "Что сделано".

## PR 1 · `docs/0012-backups` · documents

- [x] **T1. Spec and clarifications.** `spec.md`, `clarifications.md` (P1–P10).
      Check: owner's acceptance of `spec.md`.
      Commit: `docs(specs): add spec 0012 backups and its first decisions`
- [x] **T2. Plan.** `plan.md`; the spec amended and P11–P13 recorded at the plan.
      Check: owner's acceptance of `plan.md`.
      Commit: `docs(specs): add the plan of spec 0012 and amend its spec`
- [x] **T3. Tasks and backlog.** This file; `specs/backlog.md` gets "Temporal history backup" (P1)
      and "Backups outside Timeweb" (P8).
      Check: owner's acceptance; `npm run format:check`.
      Commit: `docs(specs): add the tasks of spec 0012`
- 👤 merges PR 1.

## PR 2 · `feat/0012-backups` · the backups

- 👤 Before T8 is merged: the production setup of plan §9 (bucket, versioning and rules, the two
  users, the age key pair, GitHub secrets and variables). Before T4: nothing.
- [x] **T4. Database copy.** `age-encryption`, `@aws-sdk/lib-storage` (plan, Dependencies);
      `api/src/backup/config.ts` (plan §1) and its variables in `.env.example`, the two S3 clients
      from `createS3Client`,
      `database.ts` with the check and the gate (§2); the PostgreSQL tools' command prefix (§7);
      the `backup` stage of `api/Dockerfile` with `postgresql-client-18` (§6); unit tests (gate,
      key names, config) and `api/test/database/backup.e2e-spec.ts` (copy, decrypt, restore, row
      counts; a failed check stores nothing; no key in the log lines).
      Check: `npm run verify`; `docker build --target backup api` succeeds and
      `pg_dump --version` in it says 18; the size the stage adds to `runtime` is in the summary.
      Commit: `feat(api): copy the database encrypted into the backup bucket`
- [x] **T5. Bucket copy.** `tar-stream`, `@types/tar-stream`; `bucket.ts` (§3); database tests:
      the restored archive holds the same keys and sizes, no `tmp/`, a vanished object skipped and
      counted, a key longer than 100 characters intact; a 200 MB input checks the process's memory
      (Risks); a database copy over 8 MiB whose check fails, and a bucket copy over 8 MiB whose
      read fails midway, store nothing and leave no unfinished multipart upload (plan §2, added
      at T5). Removes "Storage backups" from `specs/backlog.md`.
      Check: `npm run verify`.
      Commit: `feat(api): copy the app bucket encrypted into the backup bucket`
- [x] **T6. The service, its schedule and the Sentry monitor.** `main.ts` with the service,
      `--once` (§4), `nextRun` and its unit tests, the check-ins with the config of §4 (by hand,
      not `Sentry.withMonitor`: P21, amended at T6);
      the `backup` profile in `docker-compose.yml` (with `BACKUP_BUCKET`'s default
      `ai-fitting-backups`), the backup bucket in `storage/dev-setup.ts`, `README.md` (§7);
      `.env.example` got the variables at T4.
      Check: `npm run verify`; locally a `--once` run of the `backup` profile leaves both objects
      in the local backup bucket; a unit test with a fake clock shows the service runs once at
      04:00 Moscow time, at once when started before 04:30 (P15), and checks in with the
      monitor's config;
      `qa-tester` on the local profile.
      Commit: `feat(api): run the backups every night at 04:00 moscow time`
- [x] **T7. Copy before migrations.** `--pre-deploy` (§5) with database tests (a new migration →
      a copy under `pre-deploy/`; none → no object; a missing `_prisma_migrations` → a copy);
      `deploy.sh`'s `backup()` helper and its step before the migrations; `ci-deploy-check.sh`;
      `deploy/compose/backup.yml` and the backup image in `scripts/ci-build-images.sh` (§6, moved
      from T8 at T7, P22); the copy step and the backup image's pruning in the deploy steps of
      `CLAUDE.md`, `.claude/rules/deploy.md` and `deploy/README.md` (owner, at T7: "Keep this file
      true"; the «Бэкапы» section stays with T8/T9).
      Check: `npm run verify`; `ci-deploy-check.sh` locally and in CI: a new migration → a copy
      before migrating; a refused upload → the deploy stops before the migrations, the running copy
      answers; no new migration → no copy.
      Commit: `feat(deploy): copy the database before a deploy migrates it`
- [ ] **T8. Delivery to production.** `images.yml` (the backup image), `deploy.sh` replacing the
      backup project (§6);
      `cd.yml` writing and checking the new variables; `check:web-bundle` with the two secrets'
      names; `deploy/README.md` «Бэкапы»: the production setup (§9).
      Check: `npm run verify`; `ci-deploy-check.sh` starts the backup project; CD's check refuses a
      missing or malformed variable (a CI case or a local run of the check step);
      `scripts/check-web-bundle.mjs` tests.
      Commit: `feat(deploy): deliver the backup service with every deploy`
- [ ] **T9. Restore procedures and docs.** `deploy/README.md` «Бэкапы»: restoring the database and
      the bucket, the row-count query, replacing the age key (§8); `deploy/README.md:183`;
      `CLAUDE.md`, `.claude/rules/deploy.md` (plan, Docs).
      Check: the procedures run against the local profile's copies (decrypt with a local key pair,
      restore into a throwaway `postgres:18.6-trixie`, compare counts; the bucket into a fresh
      SeaweedFS bucket); `npm run format:check`.
      Commit: `docs(deploy): describe restoring the database and the bucket`
- 👤 merges PR 2 at a quiet time; the deploy runs the first `--pre-deploy` check.
- [ ] **T10. Production checks and closing.** 👤 `--once` on the server, AC6–AC8 with `aws-cli`,
      AC10 (a refused run, a stopped container), AC11 and AC12 by the README; the morning after,
      AC1. The record below; every file `Status: done`; `CLAUDE.md` and `README.md` in line
      (principles, "Closing a spec").
      Check: all 13 criteria recorded with evidence.
      Commit: `docs(specs): close spec 0012 backups`

## Acceptance record

Filled in by T10.
