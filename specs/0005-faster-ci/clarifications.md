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

## Later

- **G4. api image size.** 801 MB (web: 296 MB); it costs the push to GHCR and the pull on the server.
  Not in this spec; a backlog item.
