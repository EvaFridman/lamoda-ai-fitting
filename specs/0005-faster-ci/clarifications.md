# 0005 Faster CI and CD: clarifications

Status: open (2026-10-15).

The owner's decisions for this spec. Ids `G1`, `G2`, … are referred to by the spec, the plan and
code comments.

## Order and publishing

- **G1. Images run alongside Checks; publishing has its own job for `main`.** The image build and
  the deploy check move to a reusable workflow called by two jobs: one for pull requests with
  `contents: read`, one for pushes to `main` with `packages: write` that publishes right after its
  own build and deploy check. A job's permissions cannot depend on the event, so two callers are
  the way to keep write access away from pull requests without losing time. Chosen over a separate
  publish job after Checks and Images (images carried between runners as an artifact or rebuilt
  from cache: about a minute more on every `main` run). Accepted risk: on `main`, images reach GHCR
  before Checks finishes, so a push whose Checks fail leaves a published image that CD never
  deploys. The same code passed Checks in its pull request, and a rollback by hand goes to a hash
  that was live before.
- **G2. Number.** This spec is 0005. Spec 0006 is the api's guards, limiters, pipes and middleware
  (written in parallel in a second worktree); the web data layer reserved as 0005 in the backlog
  becomes 0007.

## Checks

- **G3. `build` stays in `verify`.** It catches `next build` errors before a push that typecheck and
  tests do not, and `verify` stays the one list for the pre-push hook and CI. Once Checks and Images
  run in parallel, Images on `main` is about as long as Checks, so dropping `build` from CI would
  save about 25 seconds on pull requests only. To be looked at again if Checks is still the longest
  job after this spec.

## Deploy

- **G5. `start_interval` also in `infra.yml`, with one restart of the infrastructure.** A changed
  health check changes the service's Compose config, so the first deploy with the new `infra.yml`
  recreates postgres, redis, temporal and nginx on the server: the site does not answer for a few
  seconds and the active copy and the Temporal worker lose their connections. It happens once: later deploys find the same
  config, and a rollback by hand uses the deploy files of `main`. Accepted for a faster start of
  the infrastructure in every CI run (the deploy check starts it from nothing) and after a server
  reboot; PR 1 is merged at a quiet time. Found in T3. Measured locally (old `deploy/`, then the new
  one synced in place): all four recreated once, the site did not answer for about a second (9 of
  704 requests failed), the old copy was ready afterwards.
- **G6. CD by hand deploys only a tag that was live.** With G1, GHCR holds images of `main` pushes
  whose Secret scan or Checks failed; a rollback by hand to one of them would put unchecked code
  live. CD run by hand (`workflow_dispatch`) first checks that the tag's commit has a successful
  check run `CD / Deploy to production` from GitHub Actions (only CI's call of CD makes one; a run
  by hand names its job without the `CD / ` prefix and attaches to the dispatched branch's head),
  and refuses otherwise before touching the server. A CD that failed on its own is re-run in its
  CI run. Proposed by the security review of T5; owner, 2026-10-15. Chosen over a rule in
  `deploy/README.md` alone. Also from that review: `images-main` waits for Secret scan, so a secret
  that reached `main` without its pull request's scan (an admin push, an edit on GitHub) is not
  pushed to GHCR or uploaded to Sentry with the source maps. The repository is public, so the
  secret is exposed in git anyway and is rotated; this keeps two more copies from being made. It
  costs the scan's few seconds on `main` only; pull requests keep all three jobs starting together
  (owner, 2026-10-15, over leaving it as G1's accepted risk).

## Later

- **G4. api image size.** 801 MB (web: 296 MB); it costs the push to GHCR and the pull on the server.
  Not in this spec; a backlog item.
