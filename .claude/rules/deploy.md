---
paths:
  - deploy/**
  - .github/**
  - scripts/**
  - '**/Dockerfile'
  - '**/.dockerignore'
  - docker-compose*.yml
---

# Production, deploys and images

Details and commands: `deploy/README.md`.

## Deploys

- A merge into `main` is the deploy: CI runs at once the secret scan, Checks (`verify`) and Images
  (`.github/workflows/images.yml`: images built and a blue-green deploy checked on the runner; the
  `main`-only caller `images-main` with `packages: write` waits for the secret scan and also
  publishes to GHCR, pull requests call it as `images-pr` with `contents: read`) → CD (`.github/workflows/cd.yml`, needs all three) → the
  server runs `deploy/scripts/deploy.sh <commit hash>`. Every checkout has
  `persist-credentials: false`. Rollback: run CD by hand with the hash of a version that was live
  (an image of a push whose Checks failed is published but was never deployed); CD
  run by hand refuses a hash whose commit has no successful `CD / Deploy to production` check run.
- Blue-green: the new copy of api and web starts next to the running one, nginx switches only when
  it is healthy; the previous copy stays as the rollback. The Temporal worker and then the nightly
  backup job (`deploy/compose/backup.yml`, spec 0012) are replaced in place after the switch; a
  failed start of either is a warning, not a failed deploy.
  Before pulling (with a registry) and after the switch, `deploy.sh` removes the app images (api,
  web, backup) no container uses (they once filled the server's disk); a rollback to an older version pulls its
  images again.
- Infrastructure (`deploy/compose/infra.yml`) is not blue-green: a deploy that changes a service's
  definition there recreates it in place, postgres, redis, redis-cache and temporal before the migrations, nginx
  after the seed and the bucket check (spec 0011 M38); for any of them but redis-cache (empty caches, the site works without it, spec 0018 V5) that is an outage (seconds for a config change, longer for an image upgrade). Such a change
  is the owner's decision and is merged at a quiet time.
- Every change to deploy files is tested the way it reaches production: on a copy of `deploy/`
  updated as CD updates the server, and in CI by `scripts/ci-deploy-check.sh`. nginx config changes
  are applied by `deploy.sh` without restarting nginx.
- The server's `.env` is rewritten from GitHub on every deploy; values change in GitHub, not on the
  server.
- After the infrastructure is up, every deploy (a rollback too) sets the retention of Temporal's
  `default` namespace to 24 hours (spec 0013 N45): a deleted user's id stays in `deleteFiles`'
  history no longer. `ci-deploy-check.sh` reads it back; the step is not removed.
- Before the migrations, `deploy.sh` runs `--pre-deploy <tag>` in a throwaway container of the
  release's `ai-fitting-backup` image (`deploy/compose/backup.yml`, spec 0012 §5): if the release
  brings a migration the database has not applied, it stores an encrypted database copy under the
  backup bucket's `pre-deploy/`; a failed copy stops the deploy, the active copy keeps serving. A
  version whose api image has no `dist/backup/pre-deploy.js` (from before spec 0012) and no backup
  image skips the copy; one with the job but no backup image stops (P24). A rollback to the copy
  that still runs makes none. Restoring a copy, returning it to production and replacing the age key are the owner's steps on
  the Mac (`deploy/README.md`, «Бэкапы»): the server never holds the private key.
- Before the new copy starts, `deploy.sh` runs, from the new image, the migrations and then the seed
  (`dist/seed/main.js`, the demo catalog: adds only missing rows and uploads only the photos missing
  from the bucket, a no-op once loaded), then checks one random catalog photo straight from the
  bucket from a throwaway container of the new api image (the server's address, no cache), then
  changes nginx (recreated if its service changed, the new config applied), then checks the photo
  through nginx (spec 0011 M31, M38). A failed migration, seed or photo check stops the deploy and
  the active copy keeps serving; one before the nginx step leaves nginx and its config as they
  were. An image
  without the seed (a rollback to a version from before it) logs "seed skipped" and deploys. A
  rollback to the copy that still runs applies nginx and switches it: no migrations, no seed, no photo check; compose recreates that copy first
  when `.env` or `app.yml` changed since it started (a rotated secret), and it must pass readiness.
- Between readiness and the switch, for a new version and a rollback alike, `deploy.sh` warms up
  the target (spec 0018 V6–V8): `deploy/scripts/warmup.mjs`, piped into its web container
  (`exec -T`, `127.0.0.1`, never through nginx), requests every address of `/healthz/warmup`
  twice and logs both times; any status but 200 (`/`'s 307), a 10 s answer or 120 s in all stops
  the target and the deploy, the active copy keeps serving. An image from before the list (404)
  warms up `/` only. `WARMUP_EXTRA_PATH` (a check's knob, never set by CD) reaches the script
  through `exec -e`, never the container's environment. A change to the step or the script is
  checked in `ci-deploy-check.sh` (the lines, a stopped deploy, the rollback run).
- CD's `deploy` job has `timeout-minutes: 30` (spec 0018 V11): far above the slowest deploy seen
  (12.5 min, a slow GHCR pull) plus the warm-up's 2. GitHub then cancels the job and the ssh
  session ends; it has no pty, so `deploy.sh` dies of SIGPIPE at its next log line, and bash's EXIT
  trap still removes `.deploy-lock` (a `trap … PIPE` of its own would stop that on bash 5.3). A
  command in progress runs on until it writes to the log; docker's client then dies too, and a
  container it ran (`compose run`) keeps running without its `--rm`. Before the switch the active
  copy keeps serving; after it the worker or the backup job may stay on the old version until the
  next deploy (accepted), while `.deploy-state`, written (by a rename) right after `switch_to`,
  whose output waits until then, already names the serving colour (V29), so the next deploy never
  targets it; a switch back restores it only once nginx is back. `ci-deploy-check.sh` checks the
  lock and the order. A cancelled run is not a
  successful check run, so CD by hand refuses a rollback to that hash. A step that makes deploys
  slower revisits the limit.
- A changed `PROXY_SECRET` recreates nginx; `deploy.sh` first checks that the serving api already
  trusts it (as `PROXY_SECRET_NEXT`) and stops otherwise. Rotation takes two deploys
  (`deploy/README.md`).
- nginx serves `/media/` from the bucket, which lets only the server's address read `media/`
  (`deploy/README.md`, "Хранилище S3"): a new server address needs the bucket policy updated first.
  nginx has `S3_ENDPOINT` and `S3_BUCKET` in `infra.yml`, so changing either recreates it;
  `deploy.sh` refuses an `S3_ENDPOINT` that is not `http(s)://host[:port]`.
- Migrations must stay compatible with the running version (`specs/principles.md`): a rollback does
  not undo them.
- The server is reached as `ssh ai-fitting` (the owner's SSH alias); CI logs in as `deploy`.

## Images

- Multi-stage, exact base-image versions, non-root user, exec-form `CMD`, dependencies installed
  before sources are copied.
- Secrets never go into an image (`ARG`/`ENV`/`COPY`); the web and api builds take the Sentry token
  as a BuildKit secret.
