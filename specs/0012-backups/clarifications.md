# 0012 Backups: clarifications

Status: open (2026-10-19).

The owner's decisions for this spec. Ids `P1`, `P2`, … are referred to by the spec, the plan and
code comments. All decisions below: owner, 2026-10-19. The frame is spec 0011 M6: database backups
go into a bucket of their own (cold class, the smallest size, a 7-day expiry rule), written with a
key that can only write there, encrypted, with a restore check; never into the app bucket.

## Scope

- **P1. Only the PostgreSQL database.** It holds every user's data, the sessions (0013 N3) and the
  catalog. Redis holds only rate-limit counters, and losing them loosens the limit for a minute.
  Temporal's SQLite holds unfinished workflows (`deleteFiles`, later generations): a night-old copy
  would bring back stale history rather than help, so it is a non-goal with a backlog item.
- **P8. No copy outside Timeweb.** The server and the backup bucket are in one Timeweb account, so
  losing the account or the provider loses both: an accepted risk for the demo, with a backlog item
  to revisit before real users.
- **P9. The app bucket is backed up too.** The backlog item "Storage backups" joins this spec. Every
  night, in the same run as the database copy, the objects under `media/` and `keep/` (not `tmp/`)
  go into the backup bucket as one encrypted archive, kept 7 days. `media/` is included because
  catalog photos added after the seed are not in `api/seed-media/`. Versioning of the app bucket
  was rejected: the versions would live next to the data and the api's key could delete them (the
  reasoning of M6). The job reads the app bucket with a key of its own that can only read it, not
  the api's. A deleted user's files stay in the copies up to 7 days, as their rows do in the
  database copies.

## Schedule and runtime

- **P2. Daily at 04:00 Moscow time, kept 7 days.** The backup bucket's lifecycle rule deletes the
  copies, so nothing on the server lists or deletes old ones.
- **P3. A database copy before migrations.** A deploy whose release brings migrations not yet
  applied stores a database copy first; a failed copy stops the deploy before the migrations, and
  the running copy keeps serving. A deploy with no new migration makes none. These copies go to the
  same bucket under a prefix of their own and expire the same way.
- **P4. Its own container, delivered by CD.** The job runs in a container of its own compose
  project (like the worker), updated by every deploy. A cron job or timer on the host was rejected
  (only the root Ansible playbook could change it, by hand), and so was a Temporal schedule (the
  worker would need `pg_dump` and the backup key, and a lost Temporal history would lose the
  schedule). `infra.yml` is not changed, so no deploy of this spec restarts PostgreSQL.

## Protection and checks

- **P5. Encrypted with `age` to the owner's public key.** The server and GitHub hold only the public
  key; the private key stays with the owner (a password manager). A leaked server `.env` or backup
  bucket discloses no copy. A shared password was rejected: whoever read `.env` could decrypt all
  copies.
- **P6. Alerts through Sentry Crons.** The job checks in with a Sentry cron monitor (the api
  project), which alerts the owner on a failed run and on a run that did not start.
- **P7. Each copy checked, the restore rehearsed by hand.** Before encrypting, every database copy
  is read back as a dump (its table of contents); one that cannot be read is not stored and the run
  fails. Restoring the database and the bucket is written down in `deploy/README.md` and done once
  by the owner at acceptance. A scheduled automatic restore was rejected: the server would need the
  private key, which undoes P5.

## Decided at the plan

- **P11. The write-only key is a custom role.** Timeweb's per-bucket presets are «Управление»,
  «Чтение и запись», «Чтение» and «Нет доступа»; there is no write-only one. The backup user gets
  a custom role instead: an IAM policy that allows only uploading objects (single and multipart)
  into the backup bucket, set by the owner with `aws-cli` following `deploy/README.md`. M6 rejected
  such policies for the app bucket because their mistakes go unnoticed; here AC7 checks the
  policy at acceptance (reading, listing and deleting are refused). «Чтение и запись» was rejected:
  whoever reads the server's `.env` could delete every copy. The app bucket's read key is a custom
  role too, allowing only listing and reading the app bucket (amended at the review of PR 1: the
  preset «Чтение» does not list objects in Timeweb's documentation, and one way for both keys
  keeps the README without a branch).
- **P12. The backup bucket keeps versions.** A write-only key can still overwrite a copy under the
  same name. With versioning on, an overwritten copy stays as a version that this key cannot
  delete; a lifecycle rule removes versions 7 days after they stop being current, so an
  overwritten copy lives at most 14 days. A rule also aborts unfinished uploads after a day.
- **P13. The job is TypeScript in `api`, in an image of its own.** Code in `api/src/backup/`, built
  into a separate `backup` target of `api/Dockerfile` (the api runtime plus `pg_dump` 18), so the
  api image does not change. Everything streams: no copy, encrypted or not, is written to the
  server's disk. It is tested with Vitest against real PostgreSQL and SeaweedFS (Testcontainers),
  up to a restore. A shell script on the `postgres` image was rejected: the bucket copy would need
  the photos on disk, and it would have almost no automatic tests.

## Decided at the review of PR 1

- **P14. Deleted users' data in the copies goes to the backlog.** The copies hold a deleted user's
  rows and files up to 7 days (an overwritten version up to 14, P12). Accepted for the demo; before
  real users the period is written into the privacy policy and checked against the law on personal
  data (backlog item "Deleted users in backups").
- **P15. A service started in the half hour after 04:00 runs at once.** A deploy replaces the
  backup container; one restarted between 04:00 and 04:30 Moscow time (the monitor's margin) would
  otherwise sleep until the next night and skip this one. It runs a copy at once instead; when the
  night's copy had already finished, the second one is only one more object. The service cannot
  tell, since its key may not list the backup bucket (P11).

## Decided at T4

- **P16. The PostgreSQL client has an exact version.** `postgresql-client-18` and its `libpq5` are pinned in
  `api/Dockerfile` and raised together with the `postgres` image, so two builds of one commit hold
  the same `pg_dump`, and a new PGDG release reaches the image that reads the whole database only
  by a commit. A build fails once PGDG drops the pinned version, until it is raised.
- **P17. The tools' stderr is cut before the log.** A server's `DETAIL:` or `CONTEXT:` line, or a
  tool's own `detail:` line, can quote a table's values (names, e-mails) and would reach the log
  and, through it, Sentry: such lines are dropped, and every other line is cut to 500 characters.

## Decided at T5

- **P18. The job's S3 clients wait longer on a silent socket.** The bucket copy reads an object
  while one 8 MiB part uploads, and the read's socket stays silent until the part is sent; the
  api's 10 s would end the whole copy whenever a part takes longer (below about 6.7 Mbit/s). Both
  of the job's clients get 60 s; the connection timeout stays the api's.
- **P19. The bucket copy keeps every key as it is.** A key with a `..` or empty segment, a leading
  `/`, or a zero-size "folder" ending in `/` (made by a console, never by the api, whose keys
  `storage/keys.ts` checks) is copied like any other, so the copy stays complete. The restore
  extracts into an empty directory and never with `-P` (`--absolute-names`), so nothing is written
  outside it: tar skips an entry with `..` and strips a leading `/`, so such keys do not come back
  as they were and show as a difference when the listings are compared (plan §8).

## Delivery

- **P10. Two pull requests.** The first holds this spec's documents and can be merged while spec
  0011 is closing; the second, after 0011 is closed, holds the whole implementation as one phase of
  `tasks.md`.
