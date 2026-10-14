# 0005 Faster CI and CD: tasks

Status: accepted (2026-10-15).
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
- [ ] **T2. AC15 repeat of spec 0004.** The result of the E59 repeat on `e1ec071` (0004, E62) goes
      into the AC15 row of `specs/0004-crud-api/tasks.md`, "Acceptance record" (the one edit of a
      closed folder the owner allowed); the item leaves `specs/backlog.md`.
      Check: `npm run format:check`.
      Commit: `docs(specs): record the production repeat of 0004 ac15`

## PR 1 · `ci/0005-faster-ci` · parallel jobs, cache, parallel tests, health checks

- [ ] **T3. Health checks report sooner.** `start_interval: 1s` for api and web in
      `deploy/compose/app.yml` and for postgres, redis, temporal and nginx in
      `deploy/compose/infra.yml` (plan §4).
      Check: `scripts/ci-deploy-check.sh` locally passes (no failed request); `docker inspect` of a
      fresh api and web container shows health entries 1 s apart until the first success, 5 s after
      it. AC9, AC11.
      Commit: `perf(deploy): check health every second while a container starts`
- [ ] **T4. api and web tests at the same time.** `scripts/run-parallel.mjs` and its
      `scripts/run-parallel.test.mjs`; root `test` uses it (plan §3); `CLAUDE.md`, "Commands".
      Check: `npm test` before and after (time, locally); a test made to fail in api, then in web:
      `npm test` exits 1 and the output names the test, then removed. AC10, AC12.
      Commit: `perf(tooling): run the api and web tests in parallel`
- [ ] **T5. Images alongside Checks; publishing only on `main`.** `.github/workflows/images.yml`
      (the steps of today's `images` job, input `publish`, output `image_tag`, `production`
      environment only when publishing); `ci.yml` with `images-pr`, `images-main` and `cd` needing
      `secrets`, `checks` and `images-main` (plan §1); `persist-credentials: false` on every
      checkout in `ci.yml`, `images.yml` and `cd.yml`. `deploy/README.md` ("Как идёт деплой",
      "Откат": only to a hash that was live) and `.claude/rules/deploy.md`. Removes "Image job
      permissions" from `specs/backlog.md`.
      Check: `actionlint`; the pull request's run: the three jobs start together, `images-pr` has
      `Contents: read` only and publishes nothing. AC1, AC2, AC3. `images-main` first runs at the
      merge: a failure there deploys nothing and is fixed forward.
      Commit: `ci(ci): build images alongside the checks and publish from a main-only job`
- [ ] **T6. Image layer cache.** `scripts/ci-build-images.sh` with `BUILD_CACHE=gha` (Buildx
      builder on BuildKit v0.33.1, `--load`, `gha` cache per image, `mode=max`,
      `ignore-error=true`); `images.yml` sets `BUILD_CACHE` and exports the cache variables with
      `actions/github-script` (plan §2).
      Check: two pull request runs with the same lockfiles: the second shows the `npm ci` steps
      `CACHED` and a shorter build step than 100–118 s; if it is not shorter, stop and change the
      plan with the owner. AC6, AC11. Three pull request runs in a row (re-runs allowed) ≤ 4.5 min.
      AC7.
      Commit: `perf(ci): reuse image layers between ci runs`

After the merge of PR 1:

- 👤 Confirm two re-runs of the merge's CI; the merge and both re-runs ≤ 5.5 min from CI start to
  the end of CD. AC4 (the run graph), AC8.
- 👤 Confirm CD by hand with the hash before the merge, then with the merge's hash; the site reports
  each version. AC5.

## PR 2 · `docs/0005-close` · acceptance

- [ ] **T7. Acceptance.** Evidence for every criterion from the runs above; "Acceptance record"
      filled in.
      Check: every AC has evidence.
      Commit: `docs(specs): record the acceptance of spec 0005`
- [ ] **T8. Close.** All files `Status: done`; `CLAUDE.md` (spec 0005 in the opening paragraph)
      and `README.md` in line with what was built.
      Check: `npm run format:check`.
      Commit: `docs(specs): close spec 0005`

## Acceptance record

Filled in by T7.

| AC   | Result | Evidence |
| ---- | ------ | -------- |
| AC1  |        |          |
| AC2  |        |          |
| AC3  |        |          |
| AC4  |        |          |
| AC5  |        |          |
| AC6  |        |          |
| AC7  |        |          |
| AC8  |        |          |
| AC9  |        |          |
| AC10 |        |          |
| AC11 |        |          |
| AC12 |        |          |
