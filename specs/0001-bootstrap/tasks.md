# 0001 Bootstrap: tasks

Status: accepted (2026-10-06), in progress.
Implements [plan.md](plan.md). `👤` marks a step only the owner can do.

## How the work flows

- One pull request per phase (W1), merged with "Rebase and merge" (W2) once CI is green.
- One task = one commit with the message given; its checkbox is ticked in the same commit.
- After each task Claude stops: what changed, where to look, the check result. The commit happens
  after the owner's OK (W3).
- Root scripts and the CI workflow grow with the PRs: a check is added together with the code it
  checks (e.g. `typecheck` arrives with `api`).
- If a task shows that the plan is wrong, work stops, the plan is fixed first (with the owner), and
  only then the task continues.

Ready on the Mac: Node 26, npm 12, Docker 29, gitleaks 8.30, Ansible 2.21, jq, gh (logged in).

## PR 1 · `chore/0001-tooling` · repository, tooling, base CI

- [x] **T0. Specs first.** Commit `specs/0001-bootstrap/` as accepted, so the history starts with the
      decisions.
      Commit: `docs(specs): add 0001-bootstrap spec, plan and tasks`
- [x] **T1. Root skeleton.** Root `package.json` (private, `engines` for Node 26 and npm 12,
      `allowScripts`), `.nvmrc`, `.gitignore`, `.editorconfig`, Prettier config and ignore file,
      `README.md` stub.
      Check: `npm ci && npm run format:check` exits 0.
      Commit: `chore(tooling): add root package and prettier`
- [x] **T2. Lint and commit rules.** Root `eslint.config.mjs` (api and web blocks), commitlint,
      lint-staged, `.githooks/` (pre-commit without gitleaks yet, commit-msg, pre-push), `prepare`.
      Check: AC10 (a commit `update stuff` is rejected; a valid one passes).
      Commit: `chore(tooling): add eslint, commitlint and git hooks`
- [x] **T3. Secret scanning.** `.gitleaks.toml` with the connection-URL rule; gitleaks in pre-commit.
      Check: AC11 (staging a fake `postgresql://u:<random>@host/db` is rejected; file then discarded).
      Commit: `chore(tooling): scan staged changes for secrets`
- [x] **T4. Claude Code setup.** `.claude/settings.json`, `hooks/guard-bash.sh`, `hooks/format.sh`,
      `agents/code-reviewer.md`, `commands/pr-summary.md`, `commands/review-changes.md`.
      Check: feeding `docker volume prune` to the guard hook exits 2; an edited file gets formatted.
      Commit: `chore(tooling): add claude code settings, hooks and review agent`
- [x] **T5. Working rules.** First version of `CLAUDE.md` (stack, versions with the reasons from
      V1–V5, layers, commands, spec lifecycle A9a), `CONTRIBUTING.md`, `specs/principles.md`.
      Written now so every later session starts from them; updated as tasks change things.
      Check: owner reads them.
      Commit: `docs(docs): add claude.md, contributing and spec principles`
- [x] **T6. Base CI.** `.github/workflows/ci.yml` with `secrets` (gitleaks, full history) and
      `checks` (what exists so far: format, lint). Push, open PR 1 with `gh`.
      Check: both jobs green on the PR.
      Commit: `ci(ci): add secret scan and checks`
- [x] **T7. Repository settings.** 👤 confirms, Claude applies with `gh api`: only "Rebase and merge"
      allowed, branches deleted after merge, `main` protected (pull request required, `secrets` and
      `checks` must pass, no force push).
      Check: `gh api` shows the settings; a direct `git push` to `main` is refused.
      (No commit: settings live on GitHub.) 👤 merges PR 1.
      Note: PR 1 got merged by Claude's first protection test, a push of the PR's own head commit to
      `main`. GitHub accepts that as merging a PR whose required checks are green. The test that
      counts pushes a commit that is in no pull request (this checkbox commit).

## PR 2 · `feat/0001-api` · api

- [x] **T8. Nest skeleton.** `api/` with Nest 12, TS 6, ESM, strict tsconfig; `config` module with a
      zod env schema; `nestjs-pino`; `trust proxy`, CORS, global `ValidationPipe`, shutdown hooks.
      Root `typecheck` script and CI step.
      Check: `npm run lint && npm run typecheck`, `npm --prefix api run build`; starting without a
      required variable fails with its name.
      Commit: `feat(api): add nest skeleton with config and logging`
- [x] **T9. Tests and first endpoint.** Vitest; `GET /hello`; Swagger at `/docs` outside
      production; unit test. Root `test` script and CI step.
      Check: `npm test` passes; the unit test builds the controller through Nest's DI.
      Revised during the task: the planned `unplugin-swc` turned out unnecessary (plan 4.6).
      Commit: `feat(api): add hello endpoint, swagger and vitest`
- [x] **T10. Data layer clients.** Prisma 7 (`prisma@7`, schema without models, `prisma.config.ts`,
      `PrismaService`), Redis provider, Temporal client provider. `prisma generate` runs as the
      api's `postinstall`, so `npm ci` (CI, Docker, a fresh clone) produces the client.
      Check: `npx prisma generate` succeeds (if it refuses with zero models: placeholder model, per plan
      risks); build and typecheck pass.
      Done: zero models generate fine; the api starts and serves `/hello` with Postgres, Redis and
      Temporal all down. Install scripts: `prisma`, `@prisma/engines` approved; `fsevents`,
      `protobufjs` denied. Prisma skills added (A11a).
      Commit: `feat(api): add prisma, redis and temporal clients`
- [x] **T11. Health checks.** `/health/live` with `version`, `/health/ready` with three indicators;
      e2e test for `/health/live`.
      Check: tests pass. (Live behavior of `ready` is checked in T18.)
      Commit: `feat(api): add liveness and readiness checks`
- [x] **T12. Throttling, events, WebSockets.** Throttler with Redis storage (limits from env,
      `/health` skipped), `EventEmitterModule`, socket.io gateway `ping` → `pong`.
      Check: build, lint, tests. (Live behavior in T18.)
      Done: decisions B12a–B12c. e2e tests: 429 over the limit with Redis down (memory fallback),
      health never limited, socket `ping` → `pong`. Live: separate limits per `X-Forwarded-For`
      client, a spoofed leading address is ignored (`trust proxy` 1).
      Commit: `feat(api): add throttling, event emitter and websocket gateway`
- [x] **T13. Temporal worker.** `src/temporal/worker.ts`, `hello` workflow and activity, npm scripts.
      Check: build; `dist/temporal/worker.js` exists. (Live run in T18.)
      Done: config and logging moved to `CoreModule`, shared by both processes; tests for the
      activity and for bundling workflows (fails on a forbidden import). Live run done early: the
      built worker against a throwaway Temporal container completed `hello` with "Hello, world!".
      Commit: `feat(api): add temporal worker with hello workflow`
- 👤 merges PR 2.

## PR 3 · `feat/0001-web` · web

- [x] **T14. Next skeleton.** `web/` with Next 16, TS 6, `standalone`, React Compiler,
      `cacheComponents`; SCSS + Stylelint; FSD folders; `app/` only re-exports.
      Root `lint:css`; `web` joins the root `typecheck` and `build` scripts (and `test` with its
      first test), so `npm run verify` (pre-push and CI) covers it; `npm ci --prefix web` in CI.
      Check: root `npm run verify` runs the web typecheck and `next build`.
      Done: one `web/README.md` describes the layers (owner's choice: no per-layer READMEs; empty
      layers kept with `.gitkeep`). Stylelint lives in the root like ESLint. Next's agent rules
      committed (A11b). `turbopack.root` and `outputFileTracingRoot` pinned to `web/`, so
      `.next/standalone/server.js` sits at the top of the standalone folder.
      Commit: `feat(web): add next skeleton with fsd layout and scss`
- [x] **T15. Home page.** Providers (TanStack Query, Zustand), zod env, server-only Redis client
      (lazy), `apiFetch`; home page with `<Suspense>` greeting, error state, version footer.
      Check: `npm --prefix web run build` with no api, Redis or database running (AC12, natively).
      Done: the build ran with `API_URL`/`REDIS_URL` unset (routes are Partial Prerender). Live,
      natively: greeting from the api; api stopped → error state; footer shows the runtime
      `APP_VERSION`. The footer is a widget rendered once in the root layout. Zustand is installed
      with no store yet: stores live in the slice that owns the UI state, starting with the first one.
      Commit: `feat(web): show the api greeting on the home page`
- [x] **T16. Sentry.** `instrumentation*.ts`, `withSentryConfig`, upload only when the token is set,
      source maps removed from the output.
      Check: build without the token succeeds and has no `.map` files in `.next/static`.
      Done: 0 maps in `.next/static`; the page works with Sentry wired in and no DSN. Sentry 11
      changes met: `withSentryConfig` comes from `@sentry/nextjs/config`; `sendDefaultPii` is
      gone, data collection is turned off explicitly (plan 5.1). The upload itself is first
      exercised by a CI build of `main` with the token (PR 5).
      Commit: `feat(web): add sentry with source map upload`
- 👤 merges PR 3.

## PR 4 · `feat/0001-docker` · local Docker stack

- [x] **T17. Images.** `api/Dockerfile`, `web/Dockerfile`, `.dockerignore`s (npm 12 inside).
      Check: both runtime images build; `docker run` of each starts and answers (api `/health/live`).
      Done: api 1.16 GB (Prisma CLI and Temporal dominate), web 461 MB. On one Docker network the
      web container showed the greeting from the api container; both run as `node`; the app code
      is read-only for it.
      Commit: `feat(infra): add api and web docker images`
- [x] **T18. Dev stack.** `docker-compose.yml`, `.env.example`, `scripts/init-env.sh`.
      Check: AC1–AC8 by hand, each with its command from the spec; results in the acceptance record
      below (pull request descriptions only say what was done).
      Done: `web` got a `dev` image stage with the project's configs (the `deps` stage lacked
      `tsconfig.json`, so the `@/` alias failed). AC1 also passed on a fresh copy of the tracked
      files as a separate compose project. Hot reload works over macOS bind mounts without polling.
      Commit: `feat(infra): add dev compose setup`
- 👤 merges PR 4.

## PR 5 · `feat/0001-prod` · production setup, tested locally and in CI

- [x] **T19. Production compose and nginx.** `deploy/compose/{infra,app,worker}.yml`, nginx template,
      entrypoint (self-signed fallback, reload loop), upstream file, certbot service.
      Check, on the Mac with `SITE_DOMAIN=localhost`: infra and blue started by hand, the page through
      `https://localhost` shows "Hello, world!".
      Done, through nginx: page with the greeting and runtime version; `/api/hello`;
      `/api/health/live`; `/api/health/ready` 403; http → https and www → apex 301; a bare IP's
      TLS handshake refused; HTTP/2; a 10 MB POST reaches the api, 21 MB gets 413; socket.io over
      WebSocket answers `pong`. Plan 7 revised (upstream `resolve`, `cert-init`, project name).
      Commit: `feat(deploy): add production compose files and nginx`
- [x] **T20. Blue-green script.** `deploy/scripts/deploy.sh`, `scripts/smoke-test.sh`.
      Check, on the Mac: deploy blue; deploy green with a request loop → zero failures (AC26); deploy a
      nonexistent tag → fails, site stays up (AC18); deploy the previous tag → takes seconds (AC19).
      Done: plus `scripts/request-loop.sh` (a page without the greeting counts as failed). Found
      and fixed in its own commit: page views shared one rate limit (B12d). The deploy script needs
      bash 4+ (`brew install bash` on the Mac), checked at its start.
      Commit: `feat(deploy): add blue-green deploy script`
- [x] **T21. Image job in CI.** `scripts/ci-build-images.sh`; job `images` (build, smoke test through
      nginx with a blue-green switch; GHCR push only on `main`).
      Check: AC13 on the PR; AC14 (a temporary failing test turns the PR red, then reverted).
      Done: the deploy check is `scripts/ci-deploy-check.sh` (two deploys through `deploy.sh`, the
      second under the request loop); it passed locally from empty volumes (37 s, 0 of 1264
      requests failed). AC14 is checked on a throwaway branch whose PR is closed unmerged, so no
      test-and-revert commits reach `main`. No build cache in CI yet: plain builds, a few minutes.
      Commit: `ci(ci): build images and smoke-test a blue-green deploy`
- 👤 merges PR 5. Check AC15: images appear in GHCR with the merge commit's hash.

## PR 6 · `feat/0001-server` · server

- [x] **T22. Server baseline.** `deploy/ansible/` (`base.yml`: Docker, log rotation, ufw, swap, user
      `deploy`, `/opt/ai-fitting`). Generate the CI SSH key pair locally, outside the repo.
      👤 runs `ansible-playbook base.yml` (Claude prepares the command).
      Check: `ssh deploy@<host> docker ps` works with the CI key; `ufw status` shows 22/80/443.
      Done: the owner ran the playbook (failed=0; a re-run in check mode: changed=0). Also, on the
      owner's request: SSH alias `ai-fitting` in the owner's ~/.ssh/config, server hostname
      `ai-fitting` (kept across reboots via cloud-init's `preserve_hostname`); 443/udp left by the
      previous stack closed. `deploy` logs in with the CI key only, runs Docker, has no sudo.
      `daemon.json` is written byte for byte as the server had it, so Docker was not restarted.
      Commit: `feat(deploy): add ansible server baseline with deploy user`
- [x] **T23. Remove the old stack.** 👤 confirms each command: `docker compose down` in
      `/opt/realty` (no `-v`), remove `realty-*` images. Document the user check and the volume removal
      command in `deploy/README.md`.
      Check: AC24 (`docker ps -a`, `docker images`).
      Done: 9 containers and the old app, Caddy and RabbitMQ images removed (2.6 GB freed); the
      Postgres, Redis and Temporal images of the same versions this stack uses are kept. User check:
      2 of 211 users registered after the last database copy, so `deploy/README.md` gives a fresh
      copy first, then the removal command. `*-backup-*.sql` added to `.gitignore`.
      Commit: `docs(deploy): document removal of the previous server stack`
- [x] **T24. GitHub and Sentry settings.** Step-by-step list in `deploy/README.md`; 👤 creates the
      Environment `production`, the repository secrets and variables (plan §10), the Sentry project and
      token. Secret values never go through the chat.
      Check: `gh secret list`, `gh variable list` (names only) show every name from plan §10.
      Done: Claude created the Environment (deployments from protected branches only) and its five
      non-secret variables with `gh`; the owner created the Sentry project (Next.js, no repository
      link, no Session Replay) and an organization token, and set the secrets with commands that read
      or generate the values without printing them. The server key fingerprint was compared with the
      one the owner's Mac already trusted. All 12 names present.
      Commit: `docs(deploy): add github and sentry setup steps`
- 👤 merges PR 6.

## PR 7 · `feat/0001-deploy` · continuous delivery

- [x] **T25. Deploy workflow.** `.github/workflows/deploy.yml`; job `deploy` in `ci.yml`.
      Check: CI on the PR green (the deploy job is skipped outside `main`).
      Commit: `ci(ci): deploy to production on push to main`
      Done: named `cd.yml` / workflow `CD` (owner's choice, alongside `ci.yml` / `CI`); CI calls it
      as a reusable workflow after Images on pushes to `main` (owner chose this over a `workflow_run`
      trigger: order guaranteed, one run shows the whole path). `actionlint` clean. The Sentry
      build plugin now reports the source map upload (it was silent inside the Docker build). CD
      itself first runs at the merge of this PR: the environment accepts `main` only.
- [x] **T26. First deploy.** 👤 merges PR 7: CI publishes images and deploys blue; nginx runs on its
      self-signed certificate.
      Check: AC16, AC17 (job log); `https://lamoda-ai-fitting.ru` answers (certificate warning expected
      until T27). Added in T25: a test error on the live site reaches Sentry with a readable stack
      trace (source maps), which also marks the project as set up in Sentry.
      Open observation (AC26): the CI run of the PR 7 merge failed its deploy check with 1 of 1006
      looped requests unanswered (`000` on `/`) during the switch, so nothing was published or
      deployed. Not reproduced since: 15 local switches (15,463 requests) and 4 CI runs on 2-CPU
      runners (3,961 requests), 0 failures, slowest request 0.29 s. Ruled out: CPU load from the
      worker's start, an nginx restart. The request loop now records curl's exit code, the time of
      each failure and the slowest requests (PR #10); the owner chose to go on with that in place.
      If it recurs, those details point at the cause.
      Done: the merge of PR #10 deployed `b6bf0a3` to blue (CI and CD green). From the internet: the
      page with the greeting and version, `/api/health/live`, `/api/health/ready` 403, redirects.
      Sentry: a test error from the live site arrived; source maps for release `b6bf0a3` uploaded
      (the build log now says so).

## PR 8 · `feat/0001-hsts` · certificate, HSTS, acceptance

Split during the work (owner's decision): T28 is checked by the deploy its merge triggers, and T29
records those results, so they go in two pull requests: 8a (T26 record, T27, T28 with a 5-minute
HSTS) and 8b (T29, HSTS for a year). The 8b merge is the third deploy and the last live check.

- [x] **T27. Certificate.** `init-cert.sh` on the server: `--staging` first, then the real one.
      Check: AC20, AC21 (`certbot renew --dry-run`).
      Done: `deploy/scripts/init-cert.sh` (new: the plan named it, no task had written it) was copied
      to the server by hand for this one run; the next deploy brings the same file. Staging and then
      the real certificate succeeded on the first try. Documented in `deploy/README.md`.
      Commit (only if the script needed fixes): `fix(deploy): ...`
- [ ] **T28. HSTS.** Enable HSTS in the nginx template. The merge of this PR is the second real deploy
      (green), run with a request loop from the Mac.
      Check: AC26 on the server; AC19 via `workflow_dispatch` with the previous tag, timed; AC18 by
      running `deploy.sh` with a nonexistent tag on the server; AC22, AC23 against the domain.
      HSTS starts at `max-age=300`: a mistake costs visitors 5 minutes, not a year.
      Commit: `feat(deploy): enable hsts`
- 👤 merges PR 8a; the checks above run on the deploy it triggers.
- [ ] **T29. Acceptance.** Go through AC1–AC26, record the result and evidence of each below.
      Finish `README.md` and `deploy/README.md`; bring `CLAUDE.md` in line with what was built; list any
      difference from the spec. Set `Status: done` in spec, clarifications, plan and tasks (A9a).
      HSTS raised to a year (`max-age=31536000`) once the 5-minute one has been seen working.
      Commit: `docs(specs): close 0001-bootstrap`
- 👤 merges PR 8b (the third deploy).

## Acceptance record

Filled in as criteria are checked; completed at T29.

| AC   | Result                            | Evidence                                                                                                                                                                                     |
| ---- | --------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| AC1  | pass (T18, 2026-10-06)            | fresh copy of the tracked files: `npm ci`, `init-env.sh`, `docker compose up -d --wait` → all services healthy (worker running) in 22 s, page shows the greeting                             |
| AC2  | pass (T18)                        | page shows "Hello, world!"; `docker compose stop api` → the Russian error state; api back → greeting again                                                                                   |
| AC3  | pass (T18)                        | `/health/live` 200 `{"status":"ok","version":"dev"}`; `/health/ready` 200, postgres/redis/temporal up; Redis stopped → 503, error names `redis`                                              |
| AC4  | pass (T18)                        | `/docs` 200; `/docs-json` paths include `/hello`                                                                                                                                             |
| AC5  | pass (T18)                        | Temporal UI 200 on :8233; `temporal workflow execute --type hello --task-queue main` → COMPLETED, "Hello, world!"                                                                            |
| AC6  | pass (T18)                        | socket.io client to :3000, `emitWithAck('ping')` → `pong`                                                                                                                                    |
| AC7  | pass (T18)                        | edit in `api/src` served after 7 s, edit in `web/src` at once; no image rebuild                                                                                                              |
| AC8  | pass (T18)                        | 101 requests to `/hello` within a minute → 100 × 200, 1 × 429 (counters in Redis)                                                                                                            |
| AC13 | pass (T21)                        | PR #6: Secret scan, Checks and Images green; Images built both images and ran `ci-deploy-check.sh` on the runner (blue-green switch, 0 of 1056 looped requests failed)                       |
| AC14 | pass (T21)                        | throwaway PR #7 with a broken test: Checks red (`expected 'Hello, world!' to deeply equal 'Hello, wrong!'`), merge blocked; closed unmerged. Locally the pre-push hook refuses such a push   |
| AC15 | pass (T21)                        | first `main` run after the merge pushed `ghcr.io/evafridman/ai-fitting-{api,web}:5029a6f` (the merge commit); pull requests publish nothing                                                  |
| AC16 | pass (T26)                        | merge commit `b6bf0a3` went live with no manual step; the page footer and `https://lamoda-ai-fitting.ru/api/health/live` report `b6bf0a3`                                                    |
| AC17 | pass (T26)                        | CD log: `deploy: migrating the database with b6bf0a3` → `No pending migrations to apply.` before `starting blue`                                                                             |
| AC20 | pass (T27)                        | with strict TLS (no `-k`): https 200, verify result 0; http → https and www → apex 301; Let's Encrypt certificate for both names, valid until 2027-01-04                                     |
| AC21 | pass (T27)                        | `certbot renew --dry-run` in the running certbot container: all simulated renewals succeeded; nginx's 6-hour reload loop running                                                             |
| AC24 | pass (T23)                        | on the server `docker ps -a` lists no containers, `docker images` only postgres, redis and temporal (kept for this stack); volume removal documented in `deploy/README.md`                   |
| AC18 | pass locally (T20); server at T28 | nonexistent tag → exit 1 before any change; an image that never gets healthy → exit 1 after 51 s, copy stopped; the site kept serving the previous version, 0 of 3894 looped requests failed |
| AC19 | pass locally (T20); server at T28 | rollback to the version on the idle copy: switch only, 2 s                                                                                                                                   |
| AC26 | pass locally (T20); server at T28 | full deploy under a request loop (page with the greeting + `/api/health/live`): 0 of 1229 failed across a deploy, a rollback and two failed deploys                                          |
