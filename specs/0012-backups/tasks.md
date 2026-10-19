# 0012 Backups: tasks

Status: done (2026-10-19): what the tests prove passes (record below), the production checks
are a backlog item (P32). History, not instructions. Accepted 2026-10-19; amended at the
review of PR 2: T10 closes the spec without the production checks (P32).
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
- [x] **T8. Delivery to production.** `images.yml` (the backup image), `deploy.sh` replacing the
      backup project (§6);
      `cd.yml` writing and checking the new variables; `check:web-bundle` with the two secrets'
      names; `deploy/README.md` «Бэкапы»: the production setup (§9).
      Check: `npm run verify`; `ci-deploy-check.sh` starts the backup project; CD's check refuses a
      missing or malformed variable (a CI case or a local run of the check step);
      `scripts/check-web-bundle.mjs` tests.
      Commit: `feat(deploy): deliver the backup service with every deploy`
- [x] **T9. Restore procedures and docs.** `deploy/README.md` «Бэкапы»: restoring the database and
      the bucket, the row-count query, replacing the age key (§8); `deploy/README.md:183`;
      `CLAUDE.md`, `.claude/rules/deploy.md` (plan, Docs).
      Check: the procedures run against the local profile's copies (decrypt with a local key pair,
      restore into a throwaway `postgres:18.6-trixie`, compare counts; the bucket into a fresh
      SeaweedFS bucket); `npm run format:check`.
      Commit: `docs(deploy): describe restoring the database and the bucket`
- [x] **T10. Closing** (amended at the review of PR 2, P32). The record below; every file
      `Status: done`; `CLAUDE.md` and `README.md` in line (principles, "Closing a spec"); the
      production checks (`--once` on the server, AC1, AC6–AC8, AC10–AC12, the Sentry alert rule)
      into the backlog item "Production checks of the backups".
      Check: all 13 criteria recorded, each with its evidence or its backlog item.
      Commit: `docs(specs): close spec 0012 backups`
- 👤 merges PR 2 at a quiet time; the deploy runs the first `--pre-deploy` check (no new migration
  in this release: one log line, no copy, AC3).

## Acceptance record

Recorded 2026-10-19 on `feat/0012-backups` (PR #85): `npm run verify` on `b306cd2`, the last
code commit, passed (api 3105 tests, web 1886, guards and scripts 594), and CI runs
`ci-deploy-check.sh`. "Backlog" means the production check of the backlog item "Production checks
of the backups" (P32); "part" means the tests prove the criterion except what is named there.

| AC   | Result  | Evidence                                                                                                                                                                                                                                                                                                                             |
| ---- | ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| AC1  | backlog | `service.spec.ts`: a service started at 03:00 Moscow runs once at 04:00, then the next day at 04:00; `schedule.spec.ts`: the monitor's 04:00 Moscow config. `ci-deploy-check.sh`: the deploy leaves the job running from the release's image                                                                                         |
| AC2  | pass    | `ci-deploy-check.sh`: a deploy onto a database with no migrations stores a copy under `pre-deploy/` before them; a refused upload stops the deploy and the running copy answers. `backup.e2e-spec.ts` "stores a restorable copy when the release has a migration the database lacks"                                                 |
| AC3  | pass    | `ci-deploy-check.sh`: a deploy with no new migration stores nothing. `backup.e2e-spec.ts` "stores nothing and says so when every migration is applied"                                                                                                                                                                               |
| AC4  | pass    | `backup.e2e-spec.ts` "stores nothing when the check fails", "stores nothing when pg_dump fails", "leaves no unfinished multipart upload when a copy over one part fails its check"; `service.spec.ts` "sends error with the same id and rethrows when the backup fails"                                                              |
| AC5  | pass    | `backup.e2e-spec.ts` "stores media/ and keep/ whole across listing pages and never tmp/"                                                                                                                                                                                                                                             |
| AC6  | backlog | The reader's role at the production setup (plan §9, step 3); refusals not yet checked with `aws-cli`                                                                                                                                                                                                                                 |
| AC7  | backlog | The writer's role and the bucket's versioning at the production setup (plan §9, steps 1–2); refusals and the old version not yet checked                                                                                                                                                                                             |
| AC8  | backlog | The lifecycle rules set at the production setup (plan §9, step 1); not yet read back                                                                                                                                                                                                                                                 |
| AC9  | part    | Tests: `backup.e2e-spec.ts` checks the stored copy starts with age's header. Code review at T4–T5: every copy streams from the tools through age into the upload, no file written. Setup: the private key only in the owner's password manager. Backlog: a look at the server's disk after a run                                     |
| AC10 | backlog | `service.spec.ts`: an in-progress check-in, error on a failed run, error at once on a cut-off run (P21). The alert rule and both cases on production: backlog                                                                                                                                                                        |
| AC11 | backlog | The procedure ran at T9 against the local profile's copies (a throwaway `postgres:18.6-trixie`, counts compared); `backup.e2e-spec.ts` "stores an age-encrypted dump that restores to the same rows". On production: backlog                                                                                                         |
| AC12 | backlog | The procedure ran at T9 against the local profile's copy into a fresh SeaweedFS bucket. On production: backlog                                                                                                                                                                                                                       |
| AC13 | part    | Tests: `check:web-bundle` refuses the four backup key names; `backup.e2e-spec.ts` "puts no credential in a log line or an error" (database) and "puts no credential and no object key in a log line or an error" (bucket). Gitleaks on every commit. Setup: secrets set in GitHub from files. Backlog: the server's logs after a run |
