# 0005 Faster CI and CD: plan

Status: accepted (2026-10-15).
Spec: [spec.md](spec.md); decisions: [clarifications.md](clarifications.md).

## Versions (checked 2026-10-15)

| What                       | Version                                                             | Where it comes from                                                |
| -------------------------- | ------------------------------------------------------------------- | ------------------------------------------------------------------ |
| `actions/github-script`    | v9.0.0, pinned by commit `3a2844b7e9c422d3c10d287c895573f7108da1b3` | GitHub's own action, released 2026-04-09                           |
| BuildKit (`moby/buildkit`) | v0.33.1 (2026-09-30)                                                | the builder container in CI; v0.34.0 is eight days old, too fresh  |
| Docker on the server       | Engine 29.1.3, Compose 2.40.3                                       | `ssh ai-fitting docker version`; `start_interval` needs Engine 25+ |
| Buildx on the runners      | ships with Docker on `ubuntu-latest`                                | no action needed to create a builder                               |

No new npm package. The only new third-party code is the BuildKit image, which the runner already
uses for every `docker build` today (the default builder is BuildKit inside the Docker Engine).

## 1. Jobs and permissions (G1, AC1–AC5)

`ci.yml` after the change:

| Job           | Runs on             | Needs                              | Permissions                         | What                                                        |
| ------------- | ------------------- | ---------------------------------- | ----------------------------------- | ----------------------------------------------------------- |
| `secrets`     | every run           | —                                  | `contents: read`                    | unchanged                                                   |
| `checks`      | every run           | —                                  | `contents: read`                    | unchanged                                                   |
| `images-pr`   | `pull_request` only | —                                  | `contents: read`                    | calls `images.yml` with `publish: false`                    |
| `images-main` | push to `main` only | —                                  | `contents: read`, `packages: write` | calls `images.yml` with `publish: true`, `secrets: inherit` |
| `cd`          | push to `main` only | `secrets`, `checks`, `images-main` | `contents: read`, `packages: read`  | calls `cd.yml` with the tag from `images-main`              |

- New reusable workflow `.github/workflows/images.yml` (`on: workflow_call`, input `publish`,
  output `image_tag`): the steps of today's `images` job (tag, build, deploy check, publish when
  `publish` is true). Its job uses `environment: production` only when `publish` is true, so the
  Sentry token (0004, E36) still reaches `main` builds only.
- A job's `permissions` cannot depend on the event; two callers with their own permissions are what
  keeps `packages: write` away from pull requests (G1). A called workflow's token never gets more
  than its caller's.
- Every `actions/checkout` in `ci.yml`, `images.yml` and `cd.yml` gets `persist-credentials: false`
  (backlog). Nothing after a checkout uses git with the token: commitlint reads history, CD copies
  files with `rsync` over SSH.
- One run shows the whole path as today (0001 T25: CD stays a called workflow inside `ci.yml`). The
  run graph shows one skipped `images-*` job per run.
- Accepted risk (G1): on `main`, images reach GHCR before Checks ends; a push whose Checks fail has
  a published image that CD skips. `deploy/README.md`, "Откат", says to roll back only to a hash that
  was live.

## 2. Image layer cache (AC6)

`scripts/ci-build-images.sh` builds with Buildx and the GitHub Actions cache when it runs in CI:

- When `BUILD_CACHE=gha` is set, the script creates a builder once
  (`docker buildx create --name ai-fitting-ci --driver docker-container --driver-opt
image=moby/buildkit:v0.33.1 --use`) and builds with `docker buildx build --load`,
  `--cache-from type=gha,scope=<app>` and `--cache-to type=gha,scope=<app>,mode=max,ignore-error=true`.
  `mode=max` keeps the layers of the `deps`, `prod-deps` and `build` stages too, where the time goes.
  `ignore-error`: a cache that cannot be written never fails a build.
- Without `BUILD_CACHE` (a local run) the script builds as today. Everything else stays: tags,
  labels, the Sentry secret, the check that the api image holds no source maps, the size lines.
- The `gha` backend reads `ACTIONS_RUNTIME_TOKEN` and `ACTIONS_RESULTS_URL` from the environment,
  which GitHub gives only to actions, not to `run` steps (Docker's docs, "GitHub Actions cache",
  "Authentication"). One `actions/github-script` step exports both before the build. The token
  allows only this run's cache and artifacts.
- Cache isolation: a pull request reads the cache of `main` and its own branch and writes only to
  its own (GitHub's cache rules), so a pull request cannot change what `main` builds from.
- The Sentry token is a BuildKit secret: not part of any layer, so not part of the cache. The
  `release` stage (source map upload) is cached only for the same `dist` and the same build
  arguments; `SENTRY_RELEASE` is the commit hash, so it runs on every `main` build, as today.
- `--load` copies each image from the builder into the runner's Docker (~10–20 s for the api's
  801 MB), which the deploy check and the push need. Part of the saving goes there; AC6 is measured
  on the whole build step.

## 3. Parallel tests (G3, AC10)

- New `scripts/run-parallel.mjs` (Node, no packages): runs the commands it gets at the same time,
  keeps each one's output, prints it as one block with a header when that command ends (in the
  order they end), and exits 1 if any failed, naming which. Blocks, not interleaved lines, so a
  failure's Vitest report stays readable.
- Root `test`: `node --test .claude/hooks/guards.test.mjs && node scripts/run-parallel.mjs "npm
--prefix api run test" "npm --prefix web run test"`. `verify` keeps calling `npm test`; the list
  of checks does not change (G3).
- Both Vitest runs size their worker pools from the CPU count, so together they ask for about twice
  the CPUs; on 4-CPU runners the gain is expected to be ~30–40 s, not the full 41 s of the api. The
  task measures it and leaves the pools alone unless the total gets slower.
- `scripts/run-parallel.mjs` gets tests in `scripts/run-parallel.test.mjs`, run by the root `test`
  with `node --test` like the guard tests.

## 4. Health checks (AC9)

- `deploy/compose/app.yml` (api, web) and `deploy/compose/infra.yml` (postgres, redis, temporal,
  nginx): `start_interval: 1s` next to the existing `start_period`. During `start_period` Docker
  checks every second; after the first success, or after `start_period`, every `interval` (5 s;
  nginx 10 s), as before (0004 E33 counts on the 5 s poll).
- The changed health checks recreate the infrastructure services once, at the first deploy after
  the merge (G5): `deploy/README.md` ("Как идёт деплой") and `.claude/rules/deploy.md` say that a
  change to `infra.yml` is not blue-green.
- Both places that wait on health use these files: `deploy.sh` on the server and
  `scripts/ci-deploy-check.sh` on the runner (twice per run).
- The dev `docker-compose.yml` is out of scope.

## 5. Documentation

- `deploy/README.md`, "Как идёт деплой" and "Откат": the new job graph; roll back only to a hash
  that was live (G1).
- `.claude/rules/deploy.md`: the CI line names the parallel jobs and the publish job.
- `CLAUDE.md`, "Commands": `npm test` runs the api and web tests at the same time.
- `specs/backlog.md`: the AC15 repeat item goes when its row is written; "Image job permissions"
  goes when §1 lands; the web data layer becomes spec 0007 (G2); a new item "api image size" (G4).

## Risks

- **The deploy check flake (0001, AC26 observation).** It runs on its own runner as before; the
  load on it does not change. The cache shortens only the build before it.
- **Cache eviction.** The repository cache holds 10 GB, evicting the oldest. Two images with
  `mode=max` take a few hundred MB per scope and branch; many open pull requests could evict
  `main`'s cache, and a build then runs from nothing (slower, still correct).
- **`--load` slower than the saving.** If the build step is not faster with the cache (AC6), the
  task stops and the plan changes (e.g. a containerd image store on the runner instead of `--load`).
- **Two Vitest runs at once on a developer's Mac** use more memory; `verify` on the pre-push hook
  runs it too. Checked in §3's task.

## How each criterion is verified

| AC   | How                                                                                                                                                                       |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| AC1  | `gh run view <id> --json jobs`: the start times of Secret scan, Checks and Images are within a few seconds of each other.                                                 |
| AC2  | The pull request's `images-pr` log, "GITHUB_TOKEN Permissions": `Contents: read` only; `rg persist-credentials .github` lists every checkout.                             |
| AC3  | The pull request's run has no publish step that ran; `gh api` of the GHCR package versions lists only `main` hashes.                                                      |
| AC4  | The `main` run's graph: CD needs Secret scan, Checks and Images. Not checked by breaking `main` on purpose; `needs` with a failed job skips the job by GitHub's rules.    |
| AC5  | After the merge: CD by hand with the previous hash (rollback), then with the current one; both green, the site reports each version.                                      |
| AC6  | Two runs of the pull request with the same lockfiles: the second one's build log shows the `npm ci` steps `CACHED`, and its build step is shorter than today's 100–118 s. |
| AC7  | `gh run list` timings of three pull request runs in a row, each ≤ 4.5 min.                                                                                                |
| AC8  | Three `main` runs: the merge of PR 1 and two re-runs of its CI, before the acceptance task (the owner confirms each re-run: it redeploys); each ≤ 5.5 min.                |
| AC9  | `docker inspect` of a fresh api and web container: `State.Health.Log` entries 1 s apart until the first success, 5 s apart after it.                                      |
| AC10 | A test made to fail on purpose, once in api and once in web: `npm test` exits 1 and its output names the test; then removed.                                              |
| AC11 | The deploy check's log in every run: the request loop ran through the switch with no failed request.                                                                      |
| AC12 | `npm run verify` exits 0.                                                                                                                                                 |
