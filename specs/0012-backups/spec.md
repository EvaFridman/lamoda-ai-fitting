# 0012 Backups

Status: accepted (2026-10-19); amended at the plan: a custom role for the write key (P11) and
versions in the backup bucket (P12), AC7 and AC8 extended, the Sentry monitor created by the job.

Issue #42 and the backlog item "Storage backups". Decisions: `clarifications.md` (P1–P13); the
frame comes from spec 0011 M6.

## Goal

Production keeps users, their sessions and the catalog in one PostgreSQL database, and users'
photos, generation results and the catalog photos in the app's bucket. Neither has a backup: a bad
migration, a mistaken delete or a lost volume or bucket loses the data for good. After this spec a
copy of both is made every night and kept for a week, before every deploy that migrates the
database the database is copied too, nobody but the owner can read the copies, a missed or failed
copy is noticed, and the owner has a checked way back.

## In scope

- A daily copy of the database at 04:00 Moscow time (P2).
- A copy of the database before a deploy runs new migrations; a failed copy stops the deploy (P3).
- A daily copy of the app bucket's `media/` and `keep/`, in the same run as the database (P9).
- Copies encrypted on the server so that only the owner can read them (P5).
- A bucket of their own for the copies, written with a key that can only write there, each copy
  deleted after 7 days (M6, P2).
- A key that can only read the app bucket, for the bucket's copy (P9).
- An alert when a nightly run fails or does not happen (P6).
- Each database copy checked to be a readable dump before it is stored (P7).
- Written procedures in `deploy/README.md`: setting it all up, restoring the database, restoring the
  bucket, replacing the encryption key; both restores carried out once at acceptance (P7).

## Non-goals

- Redis (rate-limit counters only) and Temporal's history (P1); Temporal goes to the backlog.
- A copy outside Timeweb (P8): an accepted risk, a backlog item before real users.
- Point-in-time recovery (WAL archiving), copies kept longer than a week, versioning of the app
  bucket (P9).
- A scheduled automatic restore (P7).
- Backups in the local stack beyond what checks the job works.

## Acceptance criteria

### Database

- AC1. After 04:00 Moscow time the backup bucket holds a new encrypted database copy of that night,
  and the job's log says so.
- AC2. A deploy that brings a new migration stores a database copy before the migration runs. When
  that copy fails, the deploy stops before the migration and the running copy keeps serving (P3).
- AC3. A deploy with no new migration makes no copy.
- AC4. A copy that is not a readable dump is not stored, and the run counts as failed (P7).

### App bucket

- AC5. The same nightly run stores one encrypted copy of every object under `media/` and `keep/`
  of the app bucket and none under `tmp/` (P9).
- AC6. The key the job reads the app bucket with can neither write nor delete there (P9).

### Storage, keys and expiry

- AC7. The key the job writes the backup bucket with can neither read, list, nor delete there, nor
  reach the app bucket (M6, P11). A copy it overwrites stays readable as an older version (P12).
- AC8. The backup bucket's lifecycle rules delete objects 7 days after they are written and old
  versions 7 days after they stop being current (checked by reading the rules) (P2, P12).
- AC9. No copy exists unencrypted outside the job's running process: not in the bucket, on the
  server's disk, or in a log. Neither the server nor GitHub holds the key that decrypts (P5).

### Failures and alerts

- AC10. A failed nightly run and a nightly run that did not start each show in Sentry and reach the
  owner (P6).

### Restore

- AC11. Following `deploy/README.md`, the owner restores the latest database copy into an empty
  PostgreSQL, and the row count of every table equals production's at the time of the copy.
- AC12. Following `deploy/README.md`, the owner restores the latest bucket copy into an empty bucket,
  and it holds the same keys with the same sizes as `media/` and `keep/` at the time of the copy.

### Secrets

- AC13. No key or secret of this spec appears in an image, a log line, the chat, or the repository.

## Owner actions (Claude cannot do them)

- Rent a private bucket for backups in Timeweb Cloud, the cold class and the smallest size (M6);
  turn versioning on and add lifecycle rules: objects deleted after 7 days, old versions 7 days
  after they stop being current, unfinished uploads aborted after a day (P2, P12). Check the prices
  in the panel first.
- Create an extra Timeweb user with a custom role that can only upload into the backup bucket
  (M6, P11), and one that can only read the app bucket (P9); put their keys into GitHub
  (Environment `production`), never into the chat.
- Create the encryption key pair on the Mac, keep the private key in a password manager, and put
  only the public key into GitHub (P5).
- Have the cron monitor's alerts in Sentry sent to the owner (P6).
- Restore both copies once by the README's procedures at acceptance (AC11, AC12).

## Assumptions

- Timeweb's custom roles take a policy allowing only uploads into one bucket (its documentation
  says so; AC7 checks it).
- The database and the bucket are small enough today that a full copy every night fits the night
  and the server's memory.
- Sentry includes one cron monitor in every plan; the nightly run uses it, and nothing else does.
- The bucket copy and the database copy taken minutes apart are consistent enough: a row may point
  to a file uploaded after the bucket copy, or the other way round.
