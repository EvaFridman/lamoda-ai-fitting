# 0011 S3 storage: clarifications

Status: open (2026-10-16).

The owner's decisions for this spec. Ids `M1`, `M2`, … are referred to by the spec, the plan and
code comments. All decisions below: owner, 2026-10-16.

## Storage

- **M1. One private bucket for the app in Timeweb Cloud.** It holds the catalog media (today the
  product photos) under `media/` and users' photos and generation results, which no route writes
  yet, under `keep/` and `tmp/` (M7). Nothing in it is public: only the server may read `media/`
  (M15), everything else needs the api's key or a signed link (M9). Revised on 2026-10-16 while
  writing the plan: first two buckets were chosen, a public one for the media and a private one for
  users' files, because a public bucket open to the internet next to users' photos was the risk.
  Once the media bucket became readable only from the server (M15), that reason was gone; one bucket
  is one tariff, one set of rights for the api's key and one emulator bucket. The remaining risk: a
  policy written for the whole bucket instead of `media/*` lets the server's address read users'
  files, which AC7 checks after setup. Database backups stay in a bucket of their own (M6).
- **M2. Only the media that exist move.** Issue #43 lists product photos, promo videos, category and
  brand images; only product photos exist. No column for category or brand images or videos is
  added until a page needs one.
- **M3. Media through nginx.** nginx serves `/media/<key>` from the bucket's `media/<key>` on the
  site's own origin, so `MEDIA_BASE_URL` in production stays `https://lamoda-ai-fitting.ru/media/`,
  the image keys in the database stay as they are, and the browser needs no cross-origin rules.
  Links straight to the bucket were rejected: another origin for CSP and videos, and every request
  counts against the bucket's traffic.
- **M4. Users' files have no time limit.** They are deleted by hand or together with their user or
  generation. Lifecycle removes only unfinished uploads (after a day). A retention period can be
  added later as a retention class (M7).
- **M5. Size.** One Standard bucket of 10 GB, the smallest tier; "cold" storage is not used for it
  (slow, and the data are not an archive). Estimate: catalog 3.2 MB now, about 150 MB at 1,000
  products; a generation's photo and result about 0.6 MB as WebP (3–5 MB as uploaded), about 2 GB a
  year at ten generations a day. The upload spec re-encodes photos to WebP.
- **M6. Database backups are spec 0012.** Issue #42 (daily, kept a week) goes into its own spec
  right after this one: a bucket of its own (cold class, the smallest size, a 7-day expiry rule), a
  key that can only write there, an encrypted dump and a restore check. Putting dumps into the app's
  bucket was rejected (owner, 2026-10-16, again when M1 was revised): a backup must not live next to
  the data it protects (one deleted or misconfigured bucket loses both), Timeweb grants "Чтение и
  запись" per bucket, so the api's key would read the dump of the whole database and could delete
  it, prefix rules would need IAM user policies whose mistakes go unnoticed, and the dumps' expiry
  is the opposite of M4. Spec numbers: 0012 backups, 0013 auth (issue #38).
- **M7. Key layout.** Timeweb's lifecycle rules match key prefixes only (not tags or metadata), so
  the first segment of a key is its class: who may read it and how long it lives. Each class with
  an expiry is one lifecycle rule on that prefix.
  - `media/` (no expiry, readable from the server, M15): the catalog media. The database keeps the
    key without `media/`, as today (`seed/products/<article>/<n>.webp`; photos added later
    `catalog/products/<productId>/<uuid>.webp`); nginx and the seed add the prefix.
  - `keep/` (no expiry, M4): `keep/users/<userId>/photos/<uuid>.webp` for the photo a user uploads
    to try clothes on (`users.fitting_profile_image_key`; the site has no profile picture),
    `keep/users/<userId>/generations/<generationId>/input.webp` (the snapshot of 0002 C14) and
    `…/result.webp`. The database keeps these keys whole.
  - `tmp/` (expires after a day): `tmp/<uuid>` for unfinished uploads.
  - A later retention period is a new class (e.g. `ttl-30d/users/<userId>/…`) and one more rule; old
    keys stay where they are. Deleting a user's files clears `<class>/users/<userId>/` in every
    class. An expiry counts from the object's creation, not its last read; moving a file to another
    class is a copy, a delete and a new key in the database.
  - The owner's user id is in the key and in the object's metadata (for audits and manual cleanup;
    it does not drive expiry). The server names every private key; a key sent by a client could
    point at another user's file (backlog "File storage").
  - Keys follow 0002 C22.
  - The explicit class as the first segment was chosen over `users/<userId>/…` with no class.

## Private files

- **M8. Keys outside the owner's folder are refused.** Admin writes of `fittingProfileImageKey`,
  `userImageKey` and `resultImageKey` answer 400 `VALIDATION_FAILED` unless the key lies in
  `keep/users/<userId>/` of the row's owner (the user, or the generation's session's user; M7).
  Otherwise a signed link in a response could lead to another user's file or to the media, and
  deleting a generation could delete another user's files. Leaving them free until upload exists
  was rejected.
- **M9. Signed links live 15 minutes.** Long enough for a page to load the photo; a forwarded link
  stops working soon. The lifetime comes from the environment. One hour (Timeweb's panel) and five
  minutes were rejected.
- **M10. One access key for the api.** The api's key reaches the app's bucket; nginx reads `media/`
  without a key (M15). One secret, one rotation. Database backups (M6) get a key of their own.
- **M11. Files are deleted reliably through Temporal.** Deleting a user or a generation starts a
  workflow that deletes its files and retries until it succeeds, so no files are left behind. A
  manual cleanup script and a daily cleanup schedule were rejected. This is the first code that
  starts workflows, so it owes the backlog item "Retries of the shared connection at shutdown".

## Emulator, seed and access

- **M12. SeaweedFS as the local and test emulator** (`chrislusf/seaweedfs`, 4.48 on 2026-10-16,
  Apache-2.0, `weed mini`), in the Docker stack and through Testcontainers. Checked by running it:
  signed links with their expiry enforced, lifecycle rules with an abort of unfinished uploads, a
  bucket policy that opens part of the storage for reading and leaves the rest closed,
  `DeleteObjects`, metadata and `Cache-Control` kept, buckets and keys from the environment, ready
  in about 2 s. Rejected: MinIO (archived in April 2026), RustFS 1.0 (a month old, buckets need a
  separate step), Garage (no bucket policy), versitygw (no lifecycle), S3Mock (does not check
  signatures), LocalStack (community edition archived).
- **M13. The seed uploads its photos.** The demo catalog's photos move from `web/public/media` to
  the api (with the seed), and the seed, which already runs on every deploy and locally, also
  uploads the photos missing from `media/` and changes none that are there. A separate deploy step
  with its own S3 client image was rejected: one more step and one more image.
- **M14. The api's key reads and writes; the owner sets the bucket up.** In Timeweb the api's key
  belongs to an extra user with "Чтение и запись" on the app's bucket, not the main user with every
  right: a stolen key cannot open the bucket or remove its rules. The owner sets the lifecycle rule
  of `tmp/` and the policy of `media/` once in the panel, following `deploy/README.md`; the
  acceptance checks confirm the result. Locally an init step of the emulator sets them. Rules and
  a policy applied by the api with a managing key were rejected: that key could open the bucket.
- **M15. `media/` is readable only from the server.** The bucket's policy allows `s3:GetObject` on
  `media/*` from the server's address only (Timeweb's own setup for an nginx proxy, as a bucket
  behind a CDN is usually closed to everyone but the CDN). Every file goes through `/media/`, so
  nginx's cache and limits apply to each request, nobody downloads the media around the site at the
  owner's expense, and nothing lists them. The cost: a new server address breaks `/media/` until
  the policy is updated, so a check after each deploy fetches one photo through `/media/`. If
  Timeweb sees the server's requests from another address (its internal network), the owner and
  Claude return to this choice. A public bucket was rejected (files reachable around nginx, a
  listing not ruled out); nginx signing its requests with a read-only key was rejected (an nginx
  module and one more secret, whose change recreates nginx). Locally the emulator lets anyone read
  `media/`, which is fine on `localhost`.

## Accepted with the plan

- **M16. Workflow tests run against a throwaway Temporal.** The file deletion workflow and its
  activity are tested against a Testcontainers Temporal of the same image as compose, with the
  emulator, as the database tests are (0002 C19). `@temporalio/testing` was rejected: it downloads
  its test server on the first run, in CI on every run. Closes the backlog item "Workflow logic
  tests".
- **M17. `test-writer` may use the throwaway SeaweedFS and Temporal** in `api/test/database/`, as
  it may use the throwaway PostgreSQL there (0002 C20); every other test still stubs them. Its
  agent file and `.claude/README.md` change.
- **M18. Two pull requests.** PR 1: the storage module, the emulator, users' files and their
  deletion; before its merge the owner creates the bucket, its `tmp/` rule, the api's user and the
  GitHub secrets (the api refuses to start without the S3 variables). PR 2: the seed photos, web,
  nginx and the media check after a deploy; before its merge the owner sets the `media/` policy and
  checks the address; it recreates nginx (a few seconds of outage), merged at a quiet time.

## Decided at T4

- **M19. The S3 variables are required everywhere.** `S3_ENDPOINT`, `S3_BUCKET`,
  `S3_ACCESS_KEY_ID` and `S3_SECRET_ACCESS_KEY` have no default and refuse an empty value in every
  `NODE_ENV`, in the schema the api and the worker share (the worker deletes files). The keys are
  any non-space characters, with no length rule: Timeweb's key format is not ours. Checking them
  only in production (`assertServerEnv`) was rejected: the worker does not run that check.
- **M20. `@aws-sdk/client-s3` arrives with T4**, because `dev-setup.ts` sets the emulator's policy
  and rule through the S3 API; T6 adds the presigner on the same version. `weed shell` inside the
  container was rejected: the test emulator of T6 runs the same `dev-setup.ts`.

## Decided at T5

- **M21. CD checks production's storage settings before the server.** `S3_ENDPOINT` is `https://`
  and a host (users' photos travel to it), `S3_BUCKET` follows the api's bucket rule, and the keys
  hold no space and none of ``$`"'\;&|<>()#~``: the server's `.env` is sourced by shell unquoted,
  so such a key would reach the api changed or run as a command. This narrows M19 for production
  only; the api's schema stays as M19 says. Writing the `.env` quoted, to allow any key, was
  deferred: Timeweb's keys need none of these characters; it is the way out if one ever does.

## Decided at T6

- **M22. Storage errors are wrapped.** `StorageService` never lets the SDK's error out: it throws
  a `StorageError` with the operation, the S3 code, the HTTP status and the request id, and no
  cause. The SDK's error keeps the raw response, whose request header holds the access key id
  (`Credential=…`) and the object's path or the list's prefix (a user's id), and the answer's body
  fields (`Key`, `Resource`); pino's error serializer writes an error's own fields, so a log line
  would carry them (AC14). The e2e found this on the emulator with a wrong secret, so it does not
  depend on the service. First decided as "passed on as thrown, checked once on Timeweb with a
  made-up key"; dropped because the key id comes from the SDK, not from the service's answer.
- **M23. Sentry keeps no storage paths.** The http instrumentation names each outgoing request's
  span after its URL and puts the path and query into its attributes and into the breadcrumb that
  errors carry; a storage path holds the user's id next to the file (`keep/users/<userId>/…`). The
  api's and worker's Sentry options cut requests to `S3_ENDPOINT` down to the method and the
  origin, at T6 rather than with the worker's deletes at T8.

## Decided at T7

- **M24. The owner check is per user, not per generation.** A generation's key may lie anywhere in
  its user's folder, another generation's folder included; deleting that generation (T8) then
  leaves a link that answers 404. Only the admin writes keys until upload exists, and then the
  server names them. Requiring the generation's own folder or `photos/` was rejected as strictness
  with no real writer; deleting by the rows' keys instead of the folder too.
- **M25. Links are signed only for keys in the owner's folder.** `toResponse` signs a key only when
  it lies in the row's owner's folder (the user, or the generation's session's user); otherwise the
  url is `null` and a warning names the row and the field, not the key (on every read: such rows
  are not expected, so it is not rate-limited). Rows written before T7 or
  by a later path that skips the services' write check (the worker, the seed, manual SQL) can then
  never give a link to another user's file or to `media/` and `tmp/`. Signing every stored key and
  checking production by hand was rejected: the check would hold only while these two services
  write the keys.
- **M26. `REQUEST_TIMEOUT_MS` stays at 6000 or more, by documentation only.** A delete waits up to
  `START_TIMEOUT_MS` (5 s) for its file deletion to start; a request timeout below that would answer
  503 for a row already deleted while Temporal is down. The default (10 s) and production keep it;
  `env.ts` and `.env.example` say so. A minimum in the schema was rejected: the request timeout's
  e2e sets 100 ms through the environment to check its 503 quickly (T8).
- **M27. A killed api may leave a deleted row's files.** Between a row's delete and its workflow's
  start lies a window of milliseconds; a SIGTERM waits for the starts in progress, an OOM kill or
  SIGKILL there leaves the files with no log line. Accepted while only the admin deletes (plan,
  Risks); an outbox table went to the backlog (T8).

## Decided at T9

- **M28. The web image copies no `public/`.** Once the seed photos move, git holds no file under
  `web/public`, so a clean checkout has no such folder and `COPY /app/public` fails the build. The
  copy goes from `web/Dockerfile` in T9 and comes back with the first static file of web. A
  `web/public/.gitkeep` was rejected: an empty folder in the image for nothing (T9).

## Decided at T10

- **M29. `Select`'s thumbnails skip Next's image optimizer.** An optimized `next/image` with a
  relative `/media/…` source makes the browser ask `/_next/image`, and web fetches the file from
  itself; with no `public/` and no rewrite in production that answers 400, so the thumbnails on
  `/ui-kit` would vanish. `Select`'s `<Image>` gets `unoptimized`, as the product card has: the
  browser asks `/media/…`, which nginx serves from the bucket. Absolute sources with
  `images.remotePatterns` were rejected: the optimizer would fetch from an outside host (T10).

## Decided at T11

- **M30. `/media/` answers in the api's error format and sends the bucket only the key.** A missing
  key, `/media/` itself and a key ending in `/` (the emulator answers a folder with an empty object)
  answer 404 `NOT_FOUND`; a method other than `GET`/`HEAD` answers 404 `ROUTE_NOT_FOUND`, as the api
  answers a method a route lacks (owner); a storage that fails or cannot be reached answers 503
  `SERVICE_UNAVAILABLE`, as `/api/` does (F33). A 403 code was rejected: the api has none (a closed
  route answers 401), and adding one changes api and web for a route the api does not have. nginx
  drops the query string and every header of the visitor (`proxy_pass_request_headers off`) and
  sets only `Host` from the endpoint, so the plan's `S3_HOST` is not needed: the emulator acts on
  `?response-content-type=` and would answer with that type, and a query in the cache key would let
  anyone skip the cache to the bucket. `S3_ENDPOINT` may end in `/` (CD allows it); nginx drops it,
  or `proxy_pass` would take it for the path (T11).
- **M31. The media check runs only when a new copy starts.** After the seed, before the new copy,
  `deploy.sh` fetches a random catalog image straight from the bucket out of nginx's container (the
  server's address, past nginx's cache, which would hide a broken policy for up to a day) and then
  through nginx, and stops on anything but 200. A rollback
  to the copy that still runs skips it: a rollback is the way back, and a broken bucket is not
  fixed by refusing it (owner, T11).

## Decided at the review of PR 2

- **M32. A failed deletion start sends Sentry only the kind and the id.** Plan §4 sent the prefixes,
  which are storage paths (`keep/users/<userId>/…`), against M23. Sentry gets `kind` and `id`: an
  opaque row uuid is allowed (a user's one already reaches Sentry with `/users/<id>` requests), a
  storage path is not; the
  log line keeps the full list, the only source for the owner's manual rerun: a session's or a
  generation's prefixes cannot be rebuilt from its id once the rows are gone (owner).
- **M33. One refused folder does not stop the others.** `deleteFiles` waits for every activity of a
  batch with `Promise.allSettled`, goes through all batches and only then fails with an
  `ApplicationFailure` naming how many folders failed (no paths). With `Promise.all` a non-retryable
  `InvalidPrefix` failed the workflow at once and left the later batches' files undeleted (M11).
  Today the api builds no such prefix: it would be a bug of the api, and the activity's own failure
  reaches Sentry on its first attempt either way (owner). A cancelled workflow still ends as
  cancelled. No `patched()`: the commands differ from the old code's only after a rejected
  activity, which closed that workflow at once, and nothing queries or replays closed ones.
- **M34. AC14 means the secret.** `S3_SECRET_ACCESS_KEY` appears in no image, log line or browser
  bundle. `S3_ACCESS_KEY_ID` is not a secret: every signed link carries it in `X-Amz-Credential`,
  so it reaches admin answers and anyone a link is shown to. A page that shows such links keeps
  their `src` out of Sentry and Mixpanel (backlog "Signed links in reports") (owner).
- **M35. The deploy check removes its work folder.** `ci-deploy-check.sh` deletes `$work`
  (`deploy.env`, `s3.env` with the run's one-off keys) on every exit: a trap set right after
  `mktemp`, then `teardown` outside CI, so local runs leave no keys in the temp folder (owner).

## Decided at T12

- **M36. A storage that answers 5xx gets nginx's cached copy too.** `proxy_cache_use_stale` of
  `/media/` covered only a lost connection and a timeout, so a 500 or 503 of the storage answered
  503 even for a photo nginx had cached. It now covers `http_500`, `http_502`, `http_503` and
  `http_504`: a key always names the same photo (the seed never rewrites an object, a new photo
  gets a new key), so the copy is never wrong. A refusal (403, a broken policy) is not a 5xx, so
  the deploy's media check still catches it. `ci-deploy-check.sh` checks both answers with the
  storage failing (owner). This holds while a `media/` key is never rewritten: a later spec that
  lets the admin add photos gives each upload a new key, and a photo taken down is also cleared
  from nginx's cache (`deploy/README.md`, "Хранилище S3").
