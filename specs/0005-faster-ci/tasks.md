# 0005 Faster CI and CD: tasks

Status: accepted (2026-10-15); amended 2026-10-15: T6 reverted by T6a (G7).
Implements [plan.md](plan.md). `👤` marks a step only the owner can do.

## How the work flows

- One pull request per phase, merged with "Rebase and merge" once CI is green; the next branch
  starts from a fresh `main`.
- One task = one commit, with its checkbox ticked in the same commit. Each task runs in a fresh
  session: brief from `spec-finder`, time estimate, implementation, `finish-task`, the owner's OK,
  commit.
- A task that changes what `CLAUDE.md`, a README or `.claude/rules/` describes updates it in the
  same commit. A task that closes a backlog item removes it from `specs/backlog.md` in the same
  commit.
- Checks name the acceptance criteria they cover; the evidence goes into "Acceptance record".
- Workflow changes are checked with `actionlint` before the commit (as in 0001 T25).

## PR 0 · `docs/0005-spec` · documents

- [x] **T1. Spec documents.** `spec.md`, `clarifications.md`, `plan.md` (committed as they were
      accepted) and this file. `specs/backlog.md`: the web data layer becomes spec 0007 (G2), and
      so does the reference in `api/src/common/errors/error-codes.ts`; a new item "api image size"
      in a section "Images" (G4: 801 MB, what it costs, the 0001 T17 Temporal trim as the only
      reduction so far).
      Check: `npm run format:check`; the owner has accepted spec, plan and tasks.
      Commit: `docs(specs): add spec 0005`
- [x] **T2. AC15 repeat of spec 0004.** The result of the E59 repeat on `e1ec071` (0004, E62) goes
      into the AC15 row of `specs/0004-crud-api/tasks.md`, "Acceptance record" (the one edit of a
      closed folder the owner allowed); the item leaves `specs/backlog.md`.
      Check: `npm run format:check`.
      Commit: `docs(specs): record the production repeat of 0004 ac15`

## PR 1 · `ci/0005-faster-ci` · parallel jobs, parallel tests, health checks

- [x] **T3. Health checks report sooner.** `start_interval: 1s` for api and web in
      `deploy/compose/app.yml` and for postgres, redis, temporal and nginx in
      `deploy/compose/infra.yml` (plan §4); `deploy/README.md` and `.claude/rules/deploy.md`: an
      `infra.yml` change recreates the service in place (G5); `CLAUDE.md`, "Production and deploys".
      Check: `scripts/ci-deploy-check.sh` locally passes (no failed request); `docker inspect` of a
      fresh api and web container shows health entries 1 s apart until the first success, 5 s after
      it; a deploy with the old `deploy/`, then `deploy/` updated in place as CD does and a second
      deploy under the request loop: the infrastructure is recreated once, the outage is measured
      (G5), the old copy is ready afterwards. AC9, AC11.
      Commit: `perf(deploy): check health every second while a container starts`
- [x] **T4. api and web tests at the same time.** `scripts/run-parallel.mjs` and its
      `scripts/run-parallel.test.mjs`; root `test` uses it (plan §3); `CLAUDE.md`, "Commands".
      Check: `npm test` before and after (time, locally); a test made to fail in api, then in web:
      `npm test` exits 1 and the output names the test, then removed. AC10, AC12.
      Commit: `perf(tooling): run the api and web tests in parallel`
- [x] **T5. Images alongside Checks; publishing only on `main`.** `.github/workflows/images.yml`
      (the steps of today's `images` job, input `publish`, output `image_tag`, `production`
      environment only when publishing); `ci.yml` with `images-pr`, `images-main` and `cd` needing
      `secrets`, `checks` and `images-main` (plan §1); `persist-credentials: false` on every
      checkout in `ci.yml`, `images.yml` and `cd.yml`; CD by hand refuses a tag that was never
      live (G6, `checks: read`). `deploy/README.md` ("Как идёт деплой",
      "Откат": only to a hash that was live) and `.claude/rules/deploy.md`. Removes "Image job
      permissions" from `specs/backlog.md`.
      Check: `actionlint`; the pull request's run: the three jobs start together, `images-pr` has
      `Contents: read` only and publishes nothing. AC1, AC2, AC3. `images-main` first runs at the
      merge: a failure there deploys nothing and is fixed forward.
      Commit: `ci(ci): build images alongside the checks and publish from a main-only job`
- [x] **T6. Image layer cache** (reverted by T6a, G7). `scripts/ci-build-images.sh` with
      `BUILD_CACHE=gha` (Buildx builder on BuildKit v0.33.1, `--load`, `gha` cache per image,
      `mode=max`, `ignore-error=true`); `images.yml` sets `BUILD_CACHE` and exports the cache
      variables with `actions/github-script` (plan §2).
      Check: two pull request runs with the same lockfiles: the second shows the `npm ci` steps
      `CACHED` and a shorter build step than 100–118 s; if it is not shorter, stop and change the
      plan with the owner. AC6, AC11. Three pull request runs in a row (re-runs allowed) ≤ 4.5 min.
      AC7.
      Commit: `perf(ci): reuse image layers between ci runs`
- [x] **T6a. No image layer cache.** T6's changes to `scripts/ci-build-images.sh`, `images.yml`
      and `.claude/rules/deploy.md` reverted; spec (AC6 and the scope line dropped), plan (§2,
      versions, risks) and G7 record why.
      Check: `actionlint`; the build step logs plain `docker build` again. Three pull request runs
      in a row (re-runs allowed) ≤ 4.5 min. AC7, AC11.
      Commit: `revert(ci): build images without the layer cache`

After the merge of PR 1:

- 👤 Confirm two re-runs of the merge's CI; the merge and both re-runs ≤ 5.5 min from CI start to
  the end of CD. AC4 (the run graph), AC8.
- 👤 Confirm CD by hand with the hash before the merge, then with the merge's hash; the site reports
  each version. Then with the hash of a commit CI never deployed (one inside a merged pull
  request): CD fails at "Check that the tag was live" before the SSH step. AC5.

## PR 2 · `docs/0005-close` · acceptance

- [x] **T7. Acceptance.** Evidence for every criterion from the runs above; "Acceptance record"
      filled in.
      Check: every AC has evidence.
      Commit: `docs(specs): record the acceptance of spec 0005`
- [ ] **T8. Close.** All files `Status: done`; `CLAUDE.md` (spec 0005 in the opening paragraph)
      and `README.md` in line with what was built.
      Check: `npm run format:check`.
      Commit: `docs(specs): close spec 0005`

## Acceptance record

Filled in by T7.

| AC   | Result       | Evidence                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| ---- | ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| AC1  | pass         | Pull request run 38663036235 on `6b7de3d`, attempts 1–3: Secret scan, Checks and Images (PR) start in the same second (00:58:24, 01:01:39, 01:05:29). Merge run 38664022064 on `e027f81`: Secret scan and Checks start together, Images (main) 3–4 s after Secret scan ends (attempt 1: 01:08:45 → 01:08:48; attempts 2–4 likewise)                                                                                                                                                                                                               |
| AC2  | pass         | `images-pr` log of run 38663036235 (all three attempts), "GITHUB_TOKEN Permissions": `Contents: read` and `Metadata: read` (always granted), nothing else; `images-main`: `Contents: read`, `Metadata: read`, `Packages: write`. All four checkouts (`ci.yml` 2, `images.yml`, `cd.yml`) have `persist-credentials: false`                                                                                                                                                                                                                        |
| AC3  | pass         | `images-pr`, all three attempts: "Publish images to GHCR" skipped, and its token has no `packages` permission. Published only by `images-main` of the push to `main` (`ghcr.io/evafridman/ai-fitting-{api,web}:e027f81`). 👤 `gh api` of the GHCR package versions (owner granted `read:packages`): 28 tags each for `ai-fitting-api` and `ai-fitting-web`, every one a commit of `main`'s first-parent history, none from a pull request; the two untagged versions of each are `e027f81` of attempts 1 and 2, whose tag the re-runs moved (G8)  |
| AC4  | pass         | Merge run 38664022064: CD needs Secret scan, Checks and Images (main) and starts after the last of them (attempt 1: Checks ends 01:12:29, CD starts 01:12:34). Attempt 3: Images (main) failed (observation 1), CD skipped, nothing deployed                                                                                                                                                                                                                                                                                                      |
| AC5  | pass         | 👤 CD by hand: 38666039553 with `6c00cc1` (the hash before the merge) green, the site reports `6c00cc1`; 38666159327 with `e027f81` green, the site reports `e027f81`; 38666264838 with `4efc5d2` (inside PR #49, never deployed) red at "Check that the tag was live" ("4efc5d2 was never deployed by CI"), checkout, SSH and deploy skipped                                                                                                                                                                                                     |
| AC6  | dropped (G7) | —                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| AC7  | pass         | Run 38663036235 on `6b7de3d`, three attempts in a row (re-runs allowed, T6a), all green: 3:06, 3:43, 2:19 (limit 4.5 min; before the spec Checks alone took 3:44)                                                                                                                                                                                                                                                                                                                                                                                 |
| AC8  | pass         | 👤 Merge run 38664022064 on `e027f81`, CI start to the end of CD, all green: attempt 1 5:09, attempt 2 4:48, attempt 4 4:40 (limit 5.5 min). Attempt 3 failed at publishing, not counted (G8, observation 1). The cache does not come back (G7)                                                                                                                                                                                                                                                                                                   |
| AC9  | pass         | T7, `scripts/ci-deploy-check.sh` locally (images `t7check`), `State.Health.Log` polled every 0.5 s: the first check of each fresh copy runs 1.0–1.1 s after it starts and succeeds (blue api 01:42:20.3 → 01:42:21.4; blue web, green api and green web likewise), later checks 5.1 s apart. Without `start_interval` the first check would run at 5 s. Each copy answered before its first check, so no 1 s entries before a success were seen. CI's deploy check and the server use the same `deploy/compose/*.yml`; not measured on the server |
| AC10 | pass         | T7: a test made to fail in `api/src`, then in `web/src/shared/lib`: `npm test` exits 1, the block of the failed run says `failed (exit 1)` and names the file and test (`FAIL … > t7 api test that fails on purpose`, likewise web); the other run's block still prints. Tests removed. `scripts/run-parallel.test.mjs` (exit 1 naming the failed command, a command killed by a signal). CI runs `verify`, which runs `npm test`                                                                                                                 |
| AC11 | pass         | Deploy check in every run, 0 failed requests: pull request attempts 1–3 618, 614, 576 requests; main attempts 1–4 718, 664, 610, 611; locally in T7 603                                                                                                                                                                                                                                                                                                                                                                                           |
| AC12 | pass         | T7: `npm run verify` → exit 0; api 45 files, 1781 tests; web 52 files, 516 tests; guard hooks and scripts 411                                                                                                                                                                                                                                                                                                                                                                                                                                     |

Observations:

1. Attempt 3 of the merge run (38664022064) failed in Images (main) at `docker push` of the api image to GHCR with "unknown blob"; CD was skipped and nothing was deployed. Attempt 4 passed. A re-run builds the images again and pushes them under the same tag, so `e027f81` in GHCR now names attempt 4's build, which attempt 4's CD and run 38666159327 deployed (G8, backlog).
2. On `main`, Images ends before Checks (attempt 1: 01:11:21 against 01:12:29), as on pull requests: Checks is the longest job on both; `build` stays in `verify` (G3, G7).
