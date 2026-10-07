# Backlog

Known problems that have no spec of their own yet. When a new spec touches an item's area, the
item goes into that spec (its `spec.md` or `plan.md` names it), and the commit that closes it
removes it from this list. Found by the agents' first security audit and trial runs (2026-10-07).

## CI

- **Image job permissions.** The `images` job in `.github/workflows/ci.yml` also runs for pull
  requests with `packages: write`, and `actions/checkout` keeps the token for later steps. Publish
  images from a separate job that runs only on a push to `main`; set `persist-credentials: false`
  on checkouts.
- **Sentry token scope.** `SENTRY_AUTH_TOKEN` is a repository secret; move it to the `production`
  environment with the step that uploads source maps.

## nginx and realtime

- **WebSocket connections per client.** `/socket.io/` holds connections for an hour and nothing
  limits how many one client opens. Add a per-address connection limit (`limit_conn`) and review
  `worker_connections`.
- **Security headers.** Add `Content-Security-Policy: frame-ancestors 'none'` and
  `X-Content-Type-Options: nosniff` before login or photo upload land.

## web

- **`apiFetch` paths.** `web/src/shared/api/api-fetch.ts` accepts any path. Before a path segment
  comes from user input, require one leading `/`, check the resolved origin equals `API_URL` and
  build segments with `encodeURIComponent`.
- **Image ownership.** `web/Dockerfile` copies the app owned by the runtime user; own it by root and
  leave only `.next/cache` writable, as `api/Dockerfile` does.

## Server

- **Host hardening check.** Confirm on the server that SSH password login and root login are off,
  and record in `deploy/README.md` that the `deploy` user's membership in the `docker` group is an
  accepted risk.

## Temporal

- **Retry policy of `hello`.** `api/src/temporal/workflows/hello.workflow.ts` sets no retry policy,
  so a failing activity is retried forever. A retry policy change needs no `patched()` (Temporal
  versioning rules), but already scheduled activities keep the old one.
- **Workflow logic tests.** `workflows.spec.ts` only checks that workflows bundle. Testing workflow
  logic needs `@temporalio/testing` (an owner's decision: its test server is downloaded on the first
  run, in CI on every run). A test must not end a workflow with an execution timeout: that hides
  endless retries.
- **SDK version ranges.** `@temporalio/client` is `"1.24"` while the other SDK packages are
  `"^1.24.0"`; align them so all SDK packages move together.

## Dependencies

- **`npm audit` highs.** The `braces` chain in the root lint tooling (stylelint, Next's ESLint
  plugin) and `deepmerge-ts` / `mysql2` through Prisma in `api`. Check for fixed releases.

## Data and media

Left for later specs by `0002-database-schema` (its `clarifications.md` has the decisions).

- **Catalog API.** Image columns hold object keys (C9): the first API that returns images adds
  `MEDIA_BASE_URL` (validated, in `.env.example`) and builds full URLs, checking that each result
  stays on the base's origin and under its path (not a bare `new URL(key, base)`; the base ends with
  `/`, or its last segment is dropped). It also computes the price
  after the discount from `price` and `discount` (C17), with a rounding rule decided by the owner.
- **Auth input rules (`0003-auth`).** Normalize phone input (`8 …`, `+7 …`, spaces, brackets,
  hyphens) to `+79XXXXXXXXX`; trim and lower-case email; require age 14 or more at sign-up. The
  database rejects anything else (C12), so without these rules valid users get database errors.
- **File storage.** Placeholders are static files of web (C9a). Photo upload and generation results
  need real storage (object storage or a server folder), with backups and limits on size and type.
  Deleting a user or a generation deletes its files too (the database cascade of C8 does not reach
  storage), and old photo snapshots of C14 get a retention period.
