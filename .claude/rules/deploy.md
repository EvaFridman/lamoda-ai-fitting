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

- A merge into `main` is the deploy: CI (secret scan, `verify`, images built and a blue-green deploy
  checked on the runner, published to GHCR) → CD (`.github/workflows/cd.yml`) → the server runs
  `deploy/scripts/deploy.sh <commit hash>`. Rollback: run CD by hand with an earlier hash.
- Blue-green: the new copy of api and web starts next to the running one, nginx switches only when
  it is healthy; the previous copy stays as the rollback. The Temporal worker is replaced in place.
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
