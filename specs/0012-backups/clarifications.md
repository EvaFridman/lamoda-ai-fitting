# 0012 Backups: clarifications

Status: done (2026-10-19). History, not instructions. The production checks went to the backlog
(P32).

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
  into the backup bucket, set by the owner following `deploy/README.md` (in Timeweb's panel, P28). M6 rejected
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

## Decided at the production setup

- **P20. The backup bucket is of the standard class, not cold.** Timeweb had sold out the cold
  class when the bucket was rented. Nothing in the job depends on the class (the same S3 API, keys
  and rules), and a 7-day expiry runs no risk of a cold class's minimum storage period; a gigabyte
  costs more, which the 10 GB threshold of the plan's Risks covers. The bucket has versioning and
  the three lifecycle rules all the same (P2, P12).
- **P26. The read key reads only `media/` and `keep/`.** `backup-reader`'s role allows `GetObject`
  on the app bucket's `media/*` and `keep/*`, not on all its objects: the job skips `tmp/`, and
  `storage/keys.ts` builds no other class. A new class of keys needs the role widened, or its
  objects fail the night's bucket copy.

## Decided at T6

- **P21. A run cut off by a stop fails in Sentry at once.** `Sentry.withMonitor` closes a check-in
  only when its callback ends, so a run a deploy cut off would fail only when `maxRuntime` ran out,
  about 06:00, after the restarted service's run (P15) had already succeeded. The job sends its
  check-ins by hand instead and, on `SIGTERM` during a nightly run, closes the run's check-in as
  failed; the restarted run's success then resolves the issue.

## Decided at T7

- **P22. The backup image and its compose file come with the copy before migrations.** The deploy's
  `--pre-deploy` step runs the service `backup` of `deploy/compose/backup.yml` from the image
  `ai-fitting-backup:<tag>`, which only the `backup` stage has (`pg_dump` and `psql` 18; the api
  image does not change, P13). So `backup.yml` and the image's build in `scripts/ci-build-images.sh`
  move from T8 to T7, and `ci-deploy-check.sh` can test the step; T8 keeps publishing the image,
  starting the backup project at every deploy, `cd.yml`, `check:web-bundle` and the docs.
- **P23. `--pre-deploy` has no timeout and no Sentry report of its own.** The S3 clients' socket
  timeout (P18) bounds a silent upload, and `deploy.sh` sets no timeout on its other steps. A
  failure shows in the deploy's log and stops it (`fail`); the nightly monitor's check-ins stay the
  only Sentry report of this job. A rollback to the copy that still runs migrates nothing, so it
  makes no copy.
- **P24. A version from before the backup job skips the copy.** A rollback to a version from before
  this spec has no `ai-fitting-backup:<tag>`, and its migrations are all applied: when the backup
  image cannot be found or pulled and the tag's api image has no `dist/backup/pre-deploy.js`, the
  deploy logs "copy skipped" and goes on, like the seed of an image without one. Stopping would
  make such a rollback manual. A version whose api image has the job must have its backup image:
  one that cannot be found or pulled stops the deploy before the migrations (amended at the review
  of T7: a registry failing on that image alone would otherwise let a new migration through
  without a copy). The variables of `backup.yml` are checked first, so a missing one is not taken
  for a missing image; a rollback to the copy that still runs checks neither.

## Decided at T8

- **P25. All four backup keys' names are refused in the browser bundle; no `S3_REGION` in CD.**
  `check:web-bundle` refuses the names of both key ids, not only of the two secret keys: a key id
  alone grants nothing, but it stays out of the bundle like `S3_ACCESS_KEY_ID`, at no cost. CD
  writes two new variables, `BACKUP_BUCKET` and `BACKUP_AGE_RECIPIENT`; `S3_REGION` is not
  written, and the compose files keep its default `ru-1`, as for the api and the worker.
- **P27. Every copy's name ends in a random suffix.** Found at T8's security review: the write key
  cannot list the bucket, but the names `daily/<stamp>/…` were guessable (04:00 Moscow time, a few
  seconds in), so a leaked `.env` could overwrite the last nights' copies with garbage; the
  originals would live on only as noncurrent versions for 7 days, and the nightly monitor would
  see nothing. Each run's folder now ends in 16 random hex digits (`daily/<stamp>-<suffix>/`,
  `pre-deploy/<stamp>-<tag>-<suffix>/`): a copy can be found only by listing, which only the
  owner's main key can do. The job's log lines show the key with `<suffix>` in its place: the
  copy before migrations is logged into the deploy's log on GitHub, and the nightly ones into the
  container's log on the server. Restoring therefore starts with a listing (plan §8). Versioning
  (P12) stays the second line.
- **P28. The custom roles are set in Timeweb's panel.** The owner set both users' roles in each
  user's settings (Timeweb, «Хранилище» → «Пользователи»), not with `aws iam put-user-policy`
  (P11, plan §9 amended): the panel offers custom roles per user, and no main key leaves it. AC7
  still checks them at acceptance.

## Decided at T9

- **P29. The old age key is kept 14 days after the deploy that replaces it** (owner, 2026-10-19).
  A copy lives 7 days, and the version an overwrite leaves behind 7 more (P12), so a key kept only
  7 days could leave such a version unreadable (plan §8 amended).
- **P30. A new age key takes effect with the next merge into `main`** (owner, 2026-10-19). The
  procedure does not describe running CD by hand to apply it sooner, even after a leak: the copies
  stay unreadable without the main key, which alone can list and read the backup bucket.
- **P31. Returning a copy to production is written down too** (owner, 2026-10-19). CI and CD are
  turned off for the time (CD runs inside CI) and `deploy.sh`'s lock is taken on the server; api and the worker are stopped first, then the ids of the last 24 hours'
  `deleteFiles` workflows (N45) are saved and, if the old database can be read, a `--once` copy of
  it and the ids of its users, fitting sessions and generations; then the backup job stops, the database is dropped and created again, and
  the copy restored into it in one transaction from the Mac over ssh (the private key stays on the
  Mac); the running release's migrations; every session deleted (everyone signs in again); the
  users, fitting sessions and generations deleted after the copy deleted again (P14); users, fitting
  sessions and generations missing from the old database are listed and deleted only by hand
  (owner, at the review), since a damaged old database would list living rows too; every `keep/users/<uuid>/` folder with no user row removed; then the
  containers that ran are started and, once api is ready, the lock released and CI and CD turned
  back on (plan §8 amended). Deletions missing from Temporal's history (a fitting session with no
  generations, a failed start) are added by hand from Sentry; they and files uploaded after the copy
  are a backlog item ("Deletions after a restored copy"). With the old database
  unreadable and more than a day gone, such data cannot be found (backlog "Deleted users in
  backups").

## Decided at the review of PR 2

- **P32. The production checks leave this spec** (owner, 2026-10-19). They need the merged
  deploy and a night in production, so they cannot sit in PR 2, and the owner does them in a later
  spec. The spec closes with PR 2 (T10 is the closing only, `Closes #42` stays there): what the
  tests and `ci-deploy-check.sh` prove is recorded as passed; a manual `--once` on the server, AC1, AC6–AC8, AC10,
  AC11 and AC12 on production, AC9's and AC13's look at the server and its logs after a run, and
  the Sentry alert rule of plan §9 (step 6, only possible after the first nightly check-in creates
  the monitor) become the backlog item "Production checks of the backups".

## Delivery

- **P10. Two pull requests.** The first holds this spec's documents and can be merged while spec
  0011 is closing; the second, after 0011 is closed, holds the whole implementation as one phase of
  `tasks.md`.
