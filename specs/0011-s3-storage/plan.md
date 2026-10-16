# 0011 S3 storage: plan

Status: accepted (2026-10-16).

Implements [spec.md](spec.md); decisions in [clarifications.md](clarifications.md) (M1–M18).

## 1. Configuration (M1, M10; AC14)

`api/src/config/env.ts` (zod), `.env.example`, `docker-compose.yml`, `deploy/compose/app.yml` and
`worker.yml` (the worker deletes files), `scripts/ci-deploy-check.sh`, `cd.yml`:

| Variable                    | Local                      | Production                 | Note                                                                                 |
| --------------------------- | -------------------------- | -------------------------- | ------------------------------------------------------------------------------------ |
| `S3_ENDPOINT`               | `http://s3:8333`           | `https://s3.twcstorage.ru` | the api's and worker's address of the storage                                        |
| `S3_PUBLIC_ENDPOINT`        | `http://localhost:8333`    | (empty: `S3_ENDPOINT`)     | the host signed links carry; the signature covers it, so it is the browser's address |
| `S3_REGION`                 | `ru-1`                     | `ru-1`                     | default `ru-1`                                                                       |
| `S3_BUCKET`                 | `ai-fitting`               | GitHub variable            | the app's bucket (M1)                                                                |
| `S3_ACCESS_KEY_ID`          | from `scripts/init-env.sh` | GitHub secret              | the "Чтение и запись" user (M14)                                                     |
| `S3_SECRET_ACCESS_KEY`      | from `scripts/init-env.sh` | GitHub secret              |                                                                                      |
| `S3_SIGNED_URL_TTL_SECONDS` | 900                        | 900                        | default 900 (M9), 60 to 3600                                                         |

Both keys are required in production (the env schema refuses an empty one, as `ADMIN_API_TOKEN`
rules do); `init-env.sh` generates random local values for the emulator. The unit tests' env
(`api/vitest.config.ts`) points `S3_ENDPOINT` at a closed port, as it does for the other services.
`check:web-bundle` also fails on the names `S3_SECRET_ACCESS_KEY` and `S3_ACCESS_KEY_ID`.

## 2. Storage module `api/src/storage/` (M7, M9; AC7, AC8)

- `s3-client.provider.ts`: two `S3Client`s from `@aws-sdk/client-s3`, both `forcePathStyle: true`,
  `requestChecksumCalculation` and `responseChecksumValidation` `'WHEN_REQUIRED'` (since 3.729 the
  SDK sends CRC checksums by default, which several S3-compatible services refuse; Timeweb's docs
  say nothing, so the smoke check of §9 tries a put, a `DeleteObjects` and a signed link on the real
  bucket). One client talks to `S3_ENDPOINT`; the other, built for `S3_PUBLIC_ENDPOINT`, only signs
  links (`@aws-sdk/s3-request-presigner`, no network).
- `storage.service.ts`: `put(key, body, { contentType, cacheControl, ownerUserId })`, `exists(key)`
  (`HeadObject`), `deletePrefix(prefix)` (`ListObjectsV2` pages, `DeleteObjects` of up to 1,000
  keys), `signedUrl(key)` (`GetObject`, `S3_SIGNED_URL_TTL_SECONDS`). Metadata
  `x-amz-meta-owner-user-id` for `keep/` files.
- `keys.ts`, the one place keys are built and checked:
  - `mediaKey(key)` → `media/<key>`; `MEDIA_CACHE_CONTROL = 'public, max-age=86400'` (0002 C9e,
    stored on each media object, passed through by nginx).
  - `userPhotoKey(userId)`, `generationInputKey(userId, generationId)`,
    `generationResultKey(…)`; `RETENTION_CLASSES = ['keep']`; `userFolders(userId)` →
    `keep/users/<userId>/` per class; `generationFolder(userId, generationId)`;
    `isInUserFolder(key, userId)`.
  - Every key still passes `IMAGE_KEY` (`common/validation/rules.ts`).
- `StorageModule` is imported by `AppModule`, `SeedModule` and `WorkerModule`.

## 3. Users' files in the api (M8, M9; AC8, AC9)

- Responses: `UserResponseDto.fittingProfileImageUrl: string | null`,
  `AiGenerationResponseDto.userImageUrl: string` and `resultImageUrl: string | null`, signed in the
  services' `toResponse` (lists too: signing is a local HMAC, no request per row). No existence check
  per row: a link to a missing file answers 404 from the storage. The keys stay in the responses.
  The comments "personal photos have no url" (0004 E47, E51) go.
- Owner check (M8), in the services, after the DTO's `IsImageKey`:
  - users: `update` checks `fittingProfileImageKey` against the path's id; `create` refuses any
    non-null key, as the new user's id does not exist yet;
  - generations: `create` reads the session's `userId`; `update` reads it through the generation.
  - A refusal is `AppException` `VALIDATION_FAILED` with the field's detail, as the DTO errors are;
    `@ApiErrors` is not needed (400 `VALIDATION_FAILED` is implied by a body).
- `api/openapi.json` is rewritten; web's `entities/user` and `entities/generation` schemas get the
  url fields, and their contract tests pass.

## 4. Deleting files (M11; AC10)

- `users.service.delete`: reads nothing extra, deletes the row, then starts `deleteFiles` with the
  prefixes `userFolders(id)`.
- `fitting-sessions.service.delete` and `ai-generations.service.delete`: read the session's `userId`
  and the generation ids first, delete the row (the cascade takes the generations), then start
  `deleteFiles` with each `generationFolder(userId, generationId)`. A generation's files are those
  in its folder; a key of the generation that points elsewhere in the owner's folder (e.g. the
  user's photo) is the user's file and stays.
- Workflow `deleteFiles({ prefixes })` (`api/src/temporal/workflows/delete-files.workflow.ts`): one
  activity `deletePrefix(prefix)` per prefix, `startToCloseTimeout` 30 s, retry policy with no
  attempt limit, initial interval 1 s, backoff 2, maximum interval 20 s, so files go within a
  minute of the storage coming back (AC10). Workflow id `delete-files-<kind>-<id>`; a repeat start
  with the same id is ignored (the work is idempotent). The activities get `StorageService` from the
  worker's Nest context: `createActivities(app.get(StorageService))` (the pattern
  `hello.activities.ts` names); `WorkerModule` imports `StorageModule`.
- `api/src/temporal/file-deletion.ts`: `startFileDeletion(kind, id, prefixes)` through the shared
  `Client`, after the database delete has committed. If Temporal cannot be reached, the request still
  answers 204, and the failure is logged and sent to Sentry with the prefixes (Risks).
- Backlog "Retries of the shared connection at shutdown": `TemporalClientModule` bounds each start
  with an abort signal (5 s, `connection.withAbortSignal`) and `onModuleDestroy` waits for the
  starts in progress before `connection.close()`. Detailed in the task with the
  `temporal-developer` skill; the `temporal-reviewer` checks it.
- Tests (M16): the workflow and activity run against a throwaway
  Temporal of the same image as compose (`temporalio/temporal`, Testcontainers) and the emulator, so
  `@temporalio/testing`'s downloaded test server is not needed (backlog "Workflow logic tests").

## 5. Seed photos (M13; AC1, AC6, AC12)

- The 78 files move with `git mv` from `web/public/media/seed/` to `api/seed-media/seed/`
  (the key is the path under `api/seed-media/`). `api/Dockerfile` copies `seed-media/` into the
  runtime image next to `dist/` (3.2 MB); the dev stack bind-mounts it with the api's sources.
- `SeedService.run()`, after the rows: for each seed key, `exists(mediaKey(key))`, and when missing
  `put` with `image/webp` and `MEDIA_CACHE_CONTROL`. Existing objects are never written (AC6); the
  log line says how many were uploaded. A storage failure fails the seed, so the deploy stops and
  the running copy keeps serving (as a failed migration does).
- `api/test/database/seed.e2e-spec.ts` reads `api/seed-media/` instead of `web/public/media/`, and a
  new case seeds twice against the emulator: the second run uploads nothing.

## 6. web

- `web/public/media/` is gone (the folder holds nothing else); the `/media/:path*` header rule in
  `next.config.ts` goes (the objects carry `Cache-Control`). `web/Dockerfile` still copies `public/`.
- Local `/media/`: `rewrites()` in `next.config.ts`, development only, as `/api` is: `/media/:path*`
  → `${S3_ENDPOINT}/${S3_BUCKET}/media/:path*` (server env of the web container). In production
  nginx answers `/media/` and the request never reaches web; without a rewrite web answers 404.
- `_pages/ui-kit/config/select.ts` (relative `/media/…`) and `catalog.ts` (absolute production URL)
  keep working unchanged.

## 7. nginx (M3, M15; AC2, AC3)

`deploy/nginx/templates/default.conf.template`:

```nginx
# http level
proxy_cache_path /var/cache/nginx/media levels=1:2 keys_zone=media:10m max_size=1g
                 inactive=7d use_temp_path=off;

# main server
location /media/ {
  limit_except GET { deny all; }        # GET also allows HEAD
  set $s3_origin "${S3_ENDPOINT}";
  rewrite ^/media/(.*)$ /${S3_BUCKET}/media/$1 break;
  proxy_pass $s3_origin;                # a variable: resolved at request time, not at start
  proxy_ssl_server_name on;
  proxy_ssl_verify on;
  proxy_ssl_trusted_certificate /etc/ssl/certs/ca-certificates.crt;
  proxy_set_header Host "${S3_HOST}";   # own proxy_set_header: proxy-headers.inc is NOT inherited
  proxy_set_header Authorization "";
  proxy_set_header Cookie "";
  proxy_hide_header x-amz-id-2;
  proxy_hide_header x-amz-request-id;
  proxy_hide_header x-amz-meta-owner-user-id;
  proxy_hide_header Set-Cookie;
  proxy_ignore_headers Set-Cookie;
  proxy_intercept_errors on;
  error_page 403 404 = @media_not_found; # a missing key answers 403 without ListBucket
  proxy_cache media;
  proxy_cache_valid 200 1d;
  proxy_cache_valid 404 1m;
  proxy_cache_use_stale error timeout updating;
  proxy_cache_lock on;
}
location @media_not_found { return 404; }
```

- Its own `proxy_set_header` lines mean the location does not inherit `proxy-headers.inc`: neither
  `X-Proxy-Secret` nor the visitor's address go to Timeweb. A check in `ci-deploy-check.sh` asserts
  that the emulator never sees `X-Proxy-Secret`.
- No `add_header` in the location, so the server's security headers and HSTS stay.
- `/media/` gets no `limit_req` yet; the backlog item "Rate limit for web pages" keeps the rest
  (`/_next/static/`, measuring a page). The connection limit applies.
- `infra.yml`: nginx gets `S3_ENDPOINT`, `S3_HOST` and `S3_BUCKET`. A new variable recreates nginx:
  a few seconds of outage on the deploy of PR 2, merged at a quiet time (`.claude/rules/deploy.md`).
- `deploy.sh`: after the nginx config is applied and before the switch, `curl` of one seed photo
  through nginx; a failure stops the deploy (the M15 address check).

## 8. Local stack and CI (M12; AC12, AC13)

- `docker-compose.yml`:
  - `s3`: `chrislusf/seaweedfs:4.48`, `weed mini -dir=/data`, `AWS_ACCESS_KEY_ID` /
    `AWS_SECRET_ACCESS_KEY` from `.env`, `S3_BUCKET` the bucket name, port
    `127.0.0.1:${S3_HOST_PORT:-8333}:8333`, health check `curl -fsS http://localhost:8333/healthz`
    plus a bucket check, named volume `s3data`.
  - `s3-init`: one-shot on the api image, `npm run storage:setup:dev`
    (`api/src/storage/dev-setup.ts`): a policy that lets anyone read `media/*` and the `tmp/` rule
    (M14 locally). `api`, `temporal-worker` and `web` depend on it (`service_completed_successfully`).
- README: the second copy sets `S3_HOST_PORT=8334`. `qa-tester` may reach 8333/8334: its port list
  (`.claude/hooks/qa-tester-rules.mjs`, `.claude/agents/qa-tester.md`) and `.claude/README.md`
  change, with a case in `guards.test.mjs` (a `.claude/` change: security review).
- Tests: `api/test/support/storage.ts`, a second `globalSetup` of the `database` project, starts
  SeaweedFS with `GenericContainer` (`testcontainers`, no module exists; `Wait.forHttp('/healthz')`
  plus a `HeadBucket` loop), random keys, Ryuk off, stopped in teardown (0002 C19, C24). It runs the
  same `dev-setup.ts`. `createTestApp()` points `StorageService` at it. The project is renamed in
  docs as "the throwaway PostgreSQL, SeaweedFS and Temporal" (`CLAUDE.md`).
- `test-writer` may use these throwaway services in `api/test/database/` (0002 C20 extended): its
  agent file changes (M17).
- `scripts/ci-deploy-check.sh` starts a SeaweedFS container next to the stack on the runner, so the
  seed's upload, `/media/` through nginx and the second-deploy no-op (AC6) are checked in CI.

## 9. Production setup (owner, M14, M15)

`deploy/README.md` gets a section "Хранилище S3":

1. Create the bucket (private, Standard, 10 GB) and the extra user with "Чтение и запись".
2. Bucket policy: `Allow`, `Principal: *`, `s3:GetObject`, resource `arn:aws:s3:::<bucket>/media/*`,
   condition `IpAddress aws:SourceIp <server address>`. Check: `curl -I` of a test object under
   `media/` from the server (200) and from the laptop (refused); a test object under `keep/` from
   the server (refused, AC7).
3. Lifecycle: `tmp/`, delete after 1 day, abort unfinished uploads after 1 day.
4. `gh secret set S3_ACCESS_KEY_ID --env production` (hidden input), the same for the secret;
   `gh variable set S3_BUCKET --env production`.
5. Smoke check from the laptop is not possible (no production keys there, `CONTRIBUTING.md` 4): the
   first deploy's seed is the put check; the T-task's AC8/AC10 checks on production cover signed
   links and `DeleteObjects`.
6. A new server address: update the policy's address first, then move.

## Dependencies

| Package                         | Version (checked 2026-10-16) | Where               | Why                                                                          |
| ------------------------------- | ---------------------------- | ------------------- | ---------------------------------------------------------------------------- |
| `@aws-sdk/client-s3`            | 3.1148.0 (2026-10-08)        | api dependencies    | S3 API                                                                       |
| `@aws-sdk/s3-request-presigner` | 3.1148.0 (same release)      | api dependencies    | signed links                                                                 |
| `testcontainers`                | 12.2.0 (2026-09-28)          | api devDependencies | SeaweedFS and Temporal containers, same line as `@testcontainers/postgresql` |

Releases at least a week old, both AWS packages on one version; checked again (`npm view`) at the
task, install scripts expected none. `chrislusf/seaweedfs:4.48` (2026-09-28), exact tag.

## Backlog

- "File storage": narrowed to what photo upload owes (size and type limits, re-encoding to WebP);
  storage, deletion with the owner and server-named keys are done.
- "Retries of the shared connection at shutdown": closed (§4).
- "Rate limit for web pages": `/media/` has its own location; the rest stays.
- "Workflow logic tests": closed if the Temporal container of §4 is accepted.

## Docs

`CLAUDE.md` (Structure: seed media in `api/seed-media/`, the storage module; Docker: the `s3`
services and ports; Conventions: key classes, signed links, file deletion through Temporal; the
`database` test project), `README.md` (quick start, second copy), `deploy/README.md` (§9, variables
table), `.claude/rules/deploy.md` (the media check in `deploy.sh`), `.env.example`.

## Risks

| Risk                                                                        | Answer                                                                                     |
| --------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| Timeweb refuses the SDK's default checksums                                 | `WHEN_REQUIRED` on both settings; the first deploy's seed fails loudly if a put is refused |
| Timeweb sees the server's requests from an internal address (M15)           | checked in §9 step 2 before the first deploy; otherwise back to the owner                  |
| An expired signed link answers 500 on Timeweb, not 403                      | AC8 says "refused"; nothing depends on the status                                          |
| A policy on the whole bucket opens users' files to the server (M1)          | resource `media/*` only; AC7 checks a `keep/` object from the server                       |
| Temporal unreachable when a row is deleted: its files stay                  | logged and sent to Sentry with the prefixes; the owner reruns the deletion by hand         |
| nginx sends the proxy secret or visitors' addresses to Timeweb              | the location's own `proxy_set_header`; CI asserts the emulator never sees the secret       |
| PR 2's deploy recreates nginx                                               | a few seconds of outage, merged at a quiet time                                            |
| `/media/` breaks between the deploy that drops `web/public/media` and nginx | both land in the same PR and deploy (PR 2); the seed uploads before the new copy starts    |
| The seaweedfs image is 690 MB                                               | development and tests only, pulled once                                                    |
| SeaweedFS enforces lifecycle on a schedule                                  | AC11 is checked by reading the rules, not by waiting a day                                 |

## How each criterion is verified

| AC   | How                                                                                                                                                 |
| ---- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| AC1  | `curl -I` of every seed key on :3001 locally; `docker compose exec web ls public` has no `media`                                                    |
| AC2  | `curl -I` of every seed key on production: 200, `Cache-Control`, no `x-amz-*`                                                                       |
| AC3  | `curl` of a missing key (404), `PUT`/`POST`/`DELETE` (403), `/media/` (404); a seed key straight from `s3.twcstorage.ru` from the laptop (refused)  |
| AC4  | `qa-tester` on `/dev/catalog` and `/ui-kit`, locally and on production                                                                              |
| AC5  | `docker run --rm <web image> ls public` in CI's image has no `media`                                                                                |
| AC6  | `ci-deploy-check.sh`: first deploy uploads, second uploads nothing (seed log line, object `ETag`s unchanged); the same lines in production's CD log |
| AC7  | e2e against the emulator (unsigned `GET` of a `keep/` object refused); on production `curl` from the server (§9 step 2)                             |
| AC8  | e2e: link 200, refused after a short TTL; on production a link from an admin `GET`, then after 15 min                                               |
| AC9  | e2e: keys of another user, of `media/`, of `tmp/` answer 400 `VALIDATION_FAILED`                                                                    |
| AC10 | e2e with the Temporal and emulator containers: user, session, generation; the emulator stopped, delete, started, files gone within a minute         |
| AC11 | `GetBucketLifecycleConfiguration` on the emulator and on production (the owner's panel screenshot)                                                  |
| AC12 | `qa-tester`: fresh clone, `docker compose up -d --wait`, the README's seed step, AC1                                                                |
| AC13 | `npm run verify`; the test containers carry their own random names and ports                                                                        |
| AC14 | `docker history` / `docker inspect` of both images; `rg` over the api's logs during the e2e; `check:web-bundle`                                     |

## Pull requests (M18)

- PR 1: §1–§4, §8. Before its merge: the owner's §9 steps 1, 3 and 4.
- PR 2: §5–§7, docs, backlog, the production checks. Before its merge: §9 step 2; merged at a
  quiet time (nginx is recreated).
