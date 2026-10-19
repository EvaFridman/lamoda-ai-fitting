# 0012 Backups: plan

Status: accepted (2026-10-19).

Implements [spec.md](spec.md); decisions in [clarifications.md](clarifications.md) (P1–P15).

## 1. Configuration (P5, P11, P13; AC9, AC13)

The job has an env schema of its own, `api/src/backup/config.ts` (zod, like `config/env.ts`), and
does not load `CoreModule`: it needs neither Redis, Temporal nor the api's S3 key, and the api's
schema would demand them.

| Variable                           | What                                                               | Production source |
| ---------------------------------- | ------------------------------------------------------------------ | ----------------- |
| `DATABASE_URL`                     | the app database, as for the worker                                | compose, as today |
| `S3_ENDPOINT`, `S3_REGION`         | Timeweb's endpoint and region, shared by both buckets              | GitHub var        |
| `S3_BUCKET`                        | the app bucket, read only                                          | GitHub var        |
| `BACKUP_READ_ACCESS_KEY_ID`        | key of the user that can only read the app bucket (P9, P11)        | GitHub secret     |
| `BACKUP_READ_SECRET_ACCESS_KEY`    |                                                                    | GitHub secret     |
| `BACKUP_BUCKET`                    | the backup bucket                                                  | GitHub var        |
| `BACKUP_WRITE_ACCESS_KEY_ID`       | key of the user that can only upload there (P11)                   | GitHub secret     |
| `BACKUP_WRITE_SECRET_ACCESS_KEY`   |                                                                    | GitHub secret     |
| `BACKUP_AGE_RECIPIENT`             | the owner's public key, `age1…` (P5)                               | GitHub var        |
| `SENTRY_DSN`, `SENTRY_ENVIRONMENT` | the api project's DSN (P6); empty turns Sentry and the monitor off | as for the worker |
| `LOG_LEVEL`, `APP_VERSION`         | as for the worker                                                  | as for the worker |

- The backup container gets no `S3_ACCESS_KEY_ID`/`S3_SECRET_ACCESS_KEY` (the api's read-write
  key); api, web and the worker get no `BACKUP_*`.
- `pg_dump`, `pg_restore` and `psql` get the connection as `PGHOST`, `PGPORT`, `PGUSER`,
  `PGPASSWORD`, `PGDATABASE` in their environment, parsed from `DATABASE_URL`, never on the
  command line (visible in `ps`).
- Both S3 clients come from `createS3Client` (`storage/s3-client.provider.ts`), so they get the
  same `forcePathStyle`, `WHEN_REQUIRED` checksums and timeouts as the api's; errors go through
  `StorageError.from` (no keys, no paths).
- Every new variable goes into `.env.example` with a comment; the two secrets' names join
  `check:web-bundle`'s list.

## 2. Database copy (P3, P5, P7; AC1, AC4, AC9)

`api/src/backup/database.ts`, one function used by the nightly and the pre-deploy runs:

```
pg_dump --format=custom ──┬──> pg_restore --list > /dev/null        (the check, P7)
                          └──> age encrypt (age-encryption) ──> gate ──> Upload (lib-storage)
```

- `pg_dump`'s output is split: one branch feeds `pg_restore --list` (reading a custom-format dump
  from a pipe works; tested on `postgres:18.6-trixie`), the other is encrypted to
  `BACKUP_AGE_RECIPIENT` and uploaded. `pg_restore --list` may exit after the table of contents
  without reading the rest: once it has exited, its branch is dropped (no more writes, its `EPIPE`
  ignored) so the other branch neither fails nor waits on it; a unit test closes the check's input
  early.
- What the check proves: `pg_dump` exiting 0 says the dump is complete; `pg_restore --list` only
  says it is a readable dump and not something else. Whether it restores is proven by AC11 and the
  database test, not by the check.
- **The gate** holds back the end of the encrypted stream until `pg_dump` and `pg_restore` have
  both exited 0. If either fails, the stream is destroyed with the error: `Upload` aborts its
  multipart upload, or never sends its single `PutObject` (a small body is sent only when the
  stream ends). So a copy that failed the check is never stored (AC4). An abort the store refuses
  is left to the rule that aborts unfinished uploads after a day (P12).
- `Upload`: part size 8 MiB, one part in flight; memory stays bounded whatever the size.
- Nothing touches the disk: no temporary file, encrypted or not (P13, AC9).
- The tools' stderr goes to the log line by line (the password is in the environment), but a
  server's `DETAIL:`/`CONTEXT:` line (any case) is dropped and every line is cut to 500 characters: they can quote table
  values (P17, amended at T4).
- Keys: `daily/<UTC stamp>/database.dump.age` and `pre-deploy/<UTC stamp>-<image tag>/database.dump.age`;
  the stamp is `YYYY-MM-DDTHH-mm-ssZ`, so names never repeat and sort by time. The image tag must
  match `^[0-9a-f]{7,40}$` (the deploy's tags are commit SHAs), else `--pre-deploy` exits 1 before
  dumping.

## 3. Bucket copy (P9; AC5, AC6, AC10)

`api/src/backup/bucket.ts`:

```
ListObjectsV2 media/, keep/ ──> for each: GetObject ──> tar entry ──> age encrypt ──> Upload
```

- Lists `media/` and `keep/` with the read key, page by page; `tmp/` is never listed (AC5).
- Each object becomes a `tar-stream` entry named by its full key, with the size from `GetObject`'s
  `ContentLength` and the time from `LastModified`; objects are read one after another.
- An object deleted between the listing and the read (`NoSuchKey`) is skipped and counted; any
  other error fails the run.
- The tar stream is encrypted and uploaded as `daily/<UTC stamp>/storage.tar.age`; the log line
  gives the number of objects, the bytes and the skipped count.
- Restoring is `age -d | tar -x`, then uploading the tree as is: the paths are the keys.
- Long keys: `tar-stream` writes the ustar prefix or a PAX header past 100 characters; a test
  uses a key longer than 100.

## 4. Runs, schedule and alerts (P2, P4, P6; AC1, AC10)

`api/src/backup/main.ts` (imports `../instrument.js` first, like the worker; plain pino logger, no
Nest context), three modes:

- **No argument — the service.** Sleeps until the next 04:00 Moscow time (`nextRun(now)`, a pure
  function, `Intl` with `Europe/Moscow`), runs the database copy, then the bucket copy (the second
  runs even when the first failed; the run fails if either did), and sleeps again. Started
  between 04:00 and 04:30 Moscow time (after a deploy), it runs at once instead of waiting a day
  (P15). On `SIGTERM` it stops at once; a run cut off by a deploy at 04:00 ends as a failure in
  Sentry, and the restarted service runs again (Risks).
- **`--once`**: one database and bucket copy now, for a manual run and the acceptance; no
  check-in, so the monitor's schedule stays clean.
- **`--pre-deploy <tag>`**: §5.

The nightly run is wrapped in `Sentry.withMonitor('nightly-backup', …)` (`@sentry/nestjs` re-exports
it from `@sentry/node`) with the monitor's config sent from code, so Sentry creates the monitor on
the first check-in: `schedule` `0 4 * * *`, `timezone` `Europe/Moscow`, `checkinMargin` 30 min,
`maxRuntime` 120 min, `failureIssueThreshold` 1, `recoveryThreshold` 1. A run that failed or
never started becomes an issue, and the owner's alert rule in Sentry mails it (AC10). With an empty
DSN no check-in is sent.

## 5. Copy before migrations (P3; AC2, AC3)

- `--pre-deploy <tag>` compares the migration folders in the image (`prisma/migrations/*/`) with
  `SELECT migration_name FROM _prisma_migrations WHERE finished_at IS NOT NULL` (through `psql`;
  a missing table counts every migration as new). No new migration: one log line, exit 0, no
  copy (AC3). Otherwise the database copy of §2 under `pre-deploy/`; a failure exits 1.
- `deploy/scripts/deploy.sh`, a `backup()` helper like `worker()`, and right before the migrations
  (`deploy.sh:246`):
  `backup run --rm -T backup node dist/backup/main.js --pre-deploy "$tag" || fail "the database copy failed; $active keeps serving"`.
  It runs the new image, so its list of migrations is the release's.
- `scripts/ci-deploy-check.sh` covers it: a deploy with a new migration stores a copy in the
  emulator before migrating; a deploy whose copy fails (a refused upload) stops before the
  migrations, and the running copy keeps answering.

## 6. Image and production (P4, P13; AC1, AC7, AC13)

- `api/Dockerfile`: a stage `backup` from `runtime`: as root, `postgresql-common` from Debian, its
  script adds the PGDG repository, then `postgresql-client-18` at an exact version, raised with
  the `postgres` image (P16; trixie has only 17; `pg_dump` refuses a newer server, so the client is
  18 like the server); apt lists removed; back to
  `USER node`; `CMD ["node", "dist/backup/main.js"]`. The `runtime` image (api, worker) does not
  change.
- `scripts/ci-build-images.sh` builds the target as `ai-fitting-backup:<tag>`;
  `.github/workflows/images.yml` publishes it from `main` with api and web (it shares the runtime's
  layers, so the push is small).
- `deploy/compose/backup.yml`: project `ai-fitting-backup`, service `backup`, image
  `${IMAGE_REGISTRY:-}ai-fitting-backup:${IMAGE_TAG}`, `restart: unless-stopped`, the variables of
  §1, the `ai-fitting` network, no ports, a memory limit of 512 MB.
- `deploy.sh` replaces the backup project in place after the worker; a failed start is a warning
  like the worker's (the missed check-in alerts too).
- `.github/workflows/cd.yml` writes the new variables into the server's `.env` and checks them
  before touching the server (M21 rules): bucket names like `S3_BUCKET`, `BACKUP_AGE_RECIPIENT`
  `^age1[0-9a-z]{58}$`, keys without the characters the shell reads; a missing one stops CD, as for
  `S3_*`. So the owner's setup (§9) is done before PR 2 is merged.

## 7. Local stack and tests (P13)

- `docker-compose.yml`: a service `backup` under `profiles: [backup]` (built from the `backup`
  target), the dev S3 key for both sides; `docker compose --profile backup run --rm backup node
dist/backup/main.js --once` makes a local copy. `storage/dev-setup.ts` also creates the
  `BACKUP_BUCKET` bucket in SeaweedFS.
- Unit tests (`api/src/backup/*.spec.ts`, next to their code: the `unit` project runs no other
  `*.spec.ts`; amended at T4): `nextRun` around midnight and the new year, a start at
  04:10 runs at once and one at 04:40 waits (P15), key names and the tag's format, the gate (a
  failing check destroys the stream, a passing one ends it, a check that stops reading early does
  not stall the upload), config errors.
- Database tests (`api/test/database/backup.e2e-spec.ts`, the existing PostgreSQL and SeaweedFS
  containers): a copy of a seeded database, downloaded, decrypted with a key pair made in the test
  and restored into an empty database has every table's row count (AC11's procedure in code); a
  failed check stores nothing; the bucket copy restores the same keys and sizes, skips `tmp/` and
  a vanished object, keeps a long key; `--pre-deploy` copies only with a new migration.
- The tests run on the host, which has no `pg_dump` 18: the job takes the command prefix for the
  PostgreSQL tools from its options (`[]` in production, `docker exec -i <container>` in the
  tests), so the tests run the tools of the `postgres:18.6-trixie` container.

## 8. Restore and key rotation (P7; AC11, AC12)

`deploy/README.md`, section «Бэкапы», in Russian:

- **База:** download a copy with a read key typed in by hand (not stored), `age -d -i <identity>`
  on the Mac, `pg_restore --no-owner` into an empty `postgres:18.6-trixie` container; the query
  that counts every table's rows, run on production right before a `--once` copy and on the
  restored database.
- **Бакет:** `age -d | tar -x`, then `aws s3 sync` of the tree into an empty bucket (or back into
  the app bucket); the listing compared with production's.
- **Смена ключа age:** new pair, new `BACKUP_AGE_RECIPIENT`, the old private key kept 7 days more.

## 9. Production setup (owner; M6, P11, P12)

In `deploy/README.md`, «Бэкапы», before PR 2 is merged:

1. A private cold bucket, the smallest size; versioning on; lifecycle rules: objects after 7 days,
   noncurrent versions after 7 days, unfinished uploads after 1 day. Before renting, check in the
   panel that the cold class offers versioning and these three rules; if not, stop and decide with
   the owner.
2. User `backup-writer` with a custom role: `s3:PutObject`, `s3:AbortMultipartUpload` (and the
   multipart parts it implies) on `arn:aws:s3:::<backup bucket>/*`, nothing else; applied with
   `aws iam put-user-policy` in the one-off `aws-cli` container of «Хранилище S3», with the main
   user's key typed in and kept nowhere.
3. User `backup-reader` with a custom role: `s3:ListBucket` on the app bucket and `s3:GetObject`
   on its objects, nothing else (P11), applied the same way.
4. `age-keygen` on the Mac; the identity into the password manager; the recipient into GitHub.
5. The four keys and three variables into GitHub (Environment `production`) with `gh secret set`
   / `gh variable set`, read from files, never on screen.
6. In Sentry, an alert rule mailing the owner on the `nightly-backup` monitor's issues.

## Dependencies

Checked on npm 2026-10-19; none has install scripts.

| Package                | Version               | Released   | Why                                                                      |
| ---------------------- | --------------------- | ---------- | ------------------------------------------------------------------------ |
| `age-encryption`       | 0.3.1                 | 2026-08-28 | age by its author (typage); streams; deps only `@noble/*`, `@scure/base` |
| `tar-stream`           | 3.2.2                 | 2026-10-02 | a tar entry from a stream of known size                                  |
| `@types/tar-stream`    | 3.1.5                 | 2026-10-04 | dev                                                                      |
| `@aws-sdk/lib-storage` | 3.1148.0              | —          | multipart upload of a stream; the same version as `@aws-sdk/client-s3`   |
| `postgresql-client-18` | 18.6-1.pgdg13+2 (P16) | PGDG apt   | in the `backup` image only                                               |

## Backlog

- Removed by the bucket copy's task: "Storage backups" (`specs/backlog.md:174-177`).
- Added in PR 1: "Temporal history backup" (P1) and "Backups outside Timeweb" (P8).

## Docs

`deploy/README.md` (§8, §9; line 183 now says where the backups are), `CLAUDE.md` (structure,
a conventions paragraph on backups, the deploy summary), `.claude/rules/deploy.md` (the backup
project replaced in place, the copy before migrations), `README.md` (the local profile).

## Risks

| Risk                                                                   | Answer                                                                                          |
| ---------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| Timeweb refuses the SDK's checksums or multipart                       | `WHEN_REQUIRED` from `createS3Client`; the first `--once` at acceptance fails loudly            |
| A mistake in a custom role goes unnoticed                              | AC7 tries reading, listing and deleting with the write key; AC6 writing with the read key       |
| A deploy near 04:00 cuts off the nightly run                           | Sentry reports the failure; the restarted service runs again before 04:30 (P15), else `--once`  |
| Seven full copies cost seven times the data                            | the job logs each copy's size; revisit (incremental copies) when the backup bucket passes 10 GB |
| The database or the bucket grows                                       | streams end to end, one 8 MiB part in flight, 512 MB limit; revisit when a run nears an hour    |
| `age-encryption` holds a large input in memory                         | a database test encrypts 200 MB and checks the process's memory                                 |
| Objects change while the bucket is copied                              | a vanished object is skipped and counted; a row and a file may disagree (spec, Assumptions)     |
| The backup container holds the database password and reads every photo | the same reach as the worker's; no ports, its own project, no write key for the app bucket      |
| One Sentry cron monitor in the plan                                    | only the nightly run checks in                                                                  |

## How each criterion is verified

| AC   | How                                                                                                            |
| ---- | -------------------------------------------------------------------------------------------------------------- |
| AC1  | Production: the morning after the deploy, the backup bucket's listing (owner) and the job's log line           |
| AC2  | `ci-deploy-check.sh`: copy before the migrations; a refused upload stops the deploy, the old copy answers      |
| AC3  | `ci-deploy-check.sh` and a database test: no new migration, no object                                          |
| AC4  | Database test: a failing check leaves the bucket empty; unit test of the gate                                  |
| AC5  | Database test: `tmp/` absent from the restored archive                                                         |
| AC6  | Production: an upload and a delete with the read key are refused (owner, `aws-cli`)                            |
| AC7  | Production: get, list and delete with the write key are refused; an overwrite leaves the old version           |
| AC8  | Production: `get-bucket-lifecycle-configuration` and `get-bucket-versioning` (owner)                           |
| AC9  | Code review (no file writes) and `docker exec … find / -newer` after a run; the copies start with age's header |
| AC10 | Production: a run with a refused upload, and the container stopped past 04:30; both reach the owner            |
| AC11 | Owner, by §8 on the Mac; the database test does the same in code                                               |
| AC12 | Owner, by §8; the database test does the same in code                                                          |
| AC13 | `check:web-bundle`, `gitleaks`, the job's log lines in a database test hold no key                             |

## Pull requests (P10)

1. `docs/0012-backups`: the four documents and the backlog items.
2. `feat/0012-backups`, after spec 0011 is closed: the whole implementation, ending with the
   production checks and closing the spec.
