# 0005 Faster CI and CD

Status: accepted (2026-10-15).
Decisions this spec relies on: [clarifications.md](clarifications.md) (referred to by their ids, e.g. G1).

## Goal

A pull request waits about 6.5 minutes for CI, and a merge into `main` takes about 8.5 minutes to
reach the site. Most of it is waiting: the image build and deploy check wait for the checks, though
they need nothing from them, and every image build starts from nothing. Measured on the last three
runs (2026-10-14):

| Job                   | Pull request | `main` | What takes the time                                                       |
| --------------------- | ------------ | ------ | ------------------------------------------------------------------------- |
| Checks                | 224 s        | 219 s  | install 34 s, `verify` 170 s (web tests 68 s, api tests 41 s, build 33 s) |
| Images (after Checks) | 159 s        | 200 s  | image builds ~105 s, deploy check ~52 s, push to GHCR ~35 s (`main`)      |
| CD (after Images)     | —            | 68 s   | image pull on the server 21 s, deploy ~20 s, outside check 8 s            |

This spec makes a pull request's CI about 4 minutes and a merge's way to the site about 5 minutes,
without weakening any check, and gives pull requests no right to publish images (backlog item "Image
job permissions").

## In scope

- Images (build, deploy check) run at the same time as Checks instead of after them (G1).
- Images of a push to `main` are published to GHCR by a job that runs only on `main`; pull requests
  build and check images with read-only access (G1, closes the backlog item "Image job
  permissions", including `persist-credentials: false` on checkouts).
- CD starts only when every check of the push succeeded: Secret scan, Checks and Images.
- On `main`, images are published only after Secret scan passed; a deploy by hand deploys only a tag
  that was live, any other is refused before the server is touched (G6).
- Image builds in CI reuse layers of earlier runs that did not change (dependencies above all).
- api and web tests in `npm test` run at the same time; `verify` stays the one list of checks (G3).
- A new api or web copy reports healthy soon after it is ready, in CI and on the server; the regular
  health poll stays as it is.
- The first step of this spec, as of every next spec: the AC15 repeat of spec 0004 (0004, E62).

## Non-goals

- Removing `build` from `verify` or a separate list of checks for CI (G3).
- A smaller api image (801 MB); it slows the push and the server's pull, and gets a backlog item of
  its own (G4).
- Fewer or weaker checks: every check that runs today still runs, the deploy check stays strict
  (0004, E38).
- Self-hosted or larger runners.

## Acceptance criteria

### Order and permissions

- AC1. In a CI run, Secret scan, Checks and Images all start at the run's start; none waits for
  another, except that on a push to `main` Images starts after Secret scan succeeded (G6).
- AC2. A pull request's image job has a token with `contents: read` only (the job log's "GITHUB_TOKEN
  Permissions"), and no checkout in CI leaves the token in `.git/config`.
- AC3. Images are published to GHCR, tagged with the commit hash, only on a push to `main`, never
  from a pull request (as 0001 AC15).
- AC4. CD runs only after Secret scan, Checks and Images of the same push all succeeded; a push to
  `main` with any of them failed deploys nothing.
- AC5. A deploy by hand (Actions → CD → Run workflow) with the hash of an earlier `main` commit that
  was live still works (as 0001 AC19); a hash CI never deployed is refused before the server is
  touched (G6).

### Speed

- AC6. A second image build with unchanged lockfiles reuses the dependency layers (the build log
  shows them `CACHED`) and is faster than a build from nothing.
- AC7. Three pull request CI runs in a row each take at most 4.5 minutes from start to the last job's
  end.
- AC8. Three pushes to `main` in a row each take at most 5.5 minutes from the start of CI to the end of
  CD.
- AC9. A new api or web copy is reported healthy at most 2 seconds after it answers its health
  check; afterwards the health check runs every 5 seconds, as before.

### Checks stay whole

- AC10. A failing api test or a failing web test still makes `npm test`, `npm run verify` and CI red,
  and the log shows which test failed.
- AC11. The deploy check in CI still runs a blue-green switch under a request loop and fails on one
  failed request (0001 AC26, 0004 E38).
- AC12. `npm run verify` passes.

## Owner actions (Claude cannot do them)

- Review and merge the pull requests; the merges are the `main` runs AC4, AC5 and AC8 are measured
  on.
- Run CD by hand with an earlier hash for AC5, or confirm that Claude runs it.

## Assumptions

- GitHub-hosted `ubuntu-latest` runners with 4 CPUs (public repository); every job gets its own
  runner, so parallel jobs do not slow each other.
- The GitHub Actions cache (10 GB per repository) holds the image layers of at least the last few
  runs.
- Docker on the server and on the runners supports `start_interval` in health checks (Engine 25 or
  newer); the plan checks the versions.
