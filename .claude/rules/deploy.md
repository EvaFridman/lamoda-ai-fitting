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
  it is healthy; the previous copy stays as the rollback. The Temporal worker is replaced in place.
- Infrastructure (`deploy/compose/infra.yml`) is not blue-green: a deploy that changes a service's
  definition there recreates it in place, before the migrations; for postgres, redis, temporal or
  nginx that is an outage (seconds for a config change, longer for an image upgrade). Such a change
  is the owner's decision and is merged at a quiet time.
- Every change to deploy files is tested the way it reaches production: on a copy of `deploy/`
  updated as CD updates the server, and in CI by `scripts/ci-deploy-check.sh`. nginx config changes
  are applied by `deploy.sh` without restarting nginx.
- The server's `.env` is rewritten from GitHub on every deploy; values change in GitHub, not on the
  server.
- Before the new copy starts, `deploy.sh` runs, from the new image, the migrations and then the seed
  (`dist/seed/main.js`, the demo catalog: adds only missing rows, a no-op once loaded). A failed
  migration or seed stops the deploy and the active copy keeps serving. An image without the seed
  (a rollback to a version from before it) logs "seed skipped" and deploys. A rollback to the copy
  that still runs only switches nginx: no migrations, no seed.
- Migrations must stay compatible with the running version (`specs/principles.md`): a rollback does
  not undo them.
- The server is reached as `ssh ai-fitting` (the owner's SSH alias); CI logs in as `deploy`.

## Images

- Multi-stage, exact base-image versions, non-root user, exec-form `CMD`, dependencies installed
  before sources are copied.
- Secrets never go into an image (`ARG`/`ENV`/`COPY`); the web and api builds take the Sentry token
  as a BuildKit secret.
- CI builds with the GitHub Actions layer cache (`BUILD_CACHE=gha` in `scripts/ci-build-images.sh`,
  one scope per image, `mode=max`); the Sentry token, a BuildKit secret, is in no layer and so in no
  cache. A pull request writes only its own branch's cache; `main` builds from `main`'s.
