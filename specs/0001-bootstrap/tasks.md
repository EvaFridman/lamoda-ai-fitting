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
- [ ] **T10. Data layer clients.** Prisma 7 (`prisma@7`, schema without models, `prisma.config.ts`,
      `PrismaService`), Redis provider, Temporal client provider. CI step `prisma generate`.
      Check: `npx prisma generate` succeeds (if it refuses with zero models: placeholder model, per plan
      risks); build and typecheck pass.
      Commit: `feat(api): add prisma, redis and temporal clients`
- [ ] **T11. Health checks.** `/health/live` with `version`, `/health/ready` with three indicators;
      e2e test for `/health/live`.
      Check: tests pass. (Live behavior of `ready` is checked in T18.)
      Commit: `feat(api): add liveness and readiness checks`
- [ ] **T12. Throttling, events, WebSockets.** Throttler with Redis storage (limits from env,
      `/health` skipped), `EventEmitterModule`, socket.io gateway `ping` → `pong`.
      Check: build, lint, tests. (Live behavior in T18.)
      Commit: `feat(api): add throttling, event emitter and websocket gateway`
- [ ] **T13. Temporal worker.** `src/temporal/worker.ts`, `hello` workflow and activity, npm scripts.
      Check: build; `dist/temporal/worker.js` exists. (Live run in T18.)
      Commit: `feat(api): add temporal worker with hello workflow`
- 👤 merges PR 2.

## PR 3 · `feat/0001-web` · web

- [ ] **T14. Next skeleton.** `web/` with Next 16, TS 6, `standalone`, React Compiler,
      `cacheComponents`; SCSS + Stylelint; FSD folders with layer READMEs; `app/` only re-exports.
      Root `lint:css` script and CI step.
      Check: root `npm run lint`, `npm run lint:css`, `npm run typecheck`.
      Commit: `feat(web): add next skeleton with fsd layout and scss`
- [ ] **T15. Home page.** Providers (TanStack Query, Zustand), zod env, server-only Redis client
      (lazy), `apiFetch`; home page with `<Suspense>` greeting, error state, version footer.
      Check: `npm --prefix web run build` with no api, Redis or database running (AC12, natively).
      Commit: `feat(web): show the api greeting on the home page`
- [ ] **T16. Sentry.** `instrumentation*.ts`, `withSentryConfig`, upload only when the token is set,
      source maps removed from the output.
      Check: build without the token succeeds and has no `.map` files in `.next/static`.
      Commit: `feat(web): add sentry with source map upload`
- 👤 merges PR 3.

## PR 4 · `feat/0001-docker` · local Docker stack

- [ ] **T17. Images.** `api/Dockerfile`, `web/Dockerfile`, `.dockerignore`s (npm 12 inside).
      Check: both runtime images build; `docker run` of each starts and answers (api `/health/live`).
      Commit: `feat(infra): add api and web docker images`
- [ ] **T18. Dev stack.** `docker-compose.yml`, `.env.example`, `scripts/init-env.sh`.
      Check: AC1–AC8 by hand, each with its command from the spec; results in the PR description.
      Commit: `feat(infra): add dev compose setup`
- 👤 merges PR 4.

## PR 5 · `feat/0001-prod` · production setup, tested locally and in CI

- [ ] **T19. Production compose and nginx.** `deploy/compose/{infra,app,worker}.yml`, nginx template,
      entrypoint (self-signed fallback, reload loop), upstream file, certbot service.
      Check, on the Mac with `SITE_DOMAIN=localhost`: infra and blue started by hand, the page through
      `https://localhost` shows "Hello, world!".
      Commit: `feat(deploy): add production compose files and nginx`
- [ ] **T20. Blue-green script.** `deploy/scripts/deploy.sh`, `scripts/smoke-test.sh`.
      Check, on the Mac: deploy blue; deploy green with a request loop → zero failures (AC26); deploy a
      nonexistent tag → fails, site stays up (AC18); deploy the previous tag → takes seconds (AC19).
      Commit: `feat(deploy): add blue-green deploy script`
- [ ] **T21. Image job in CI.** `scripts/ci-build-images.sh`; job `images` (build, smoke test through
      nginx with a blue-green switch; GHCR push only on `main`).
      Check: AC13 on the PR; AC14 (a temporary failing test turns the PR red, then reverted).
      Commit: `ci(ci): build images and smoke-test a blue-green deploy`
- 👤 merges PR 5. Check AC15: images appear in GHCR with the merge commit's hash.

## PR 6 · `feat/0001-server` · server

- [ ] **T22. Server baseline.** `deploy/ansible/` (`base.yml`: Docker, log rotation, ufw, swap, user
      `deploy`, `/opt/ai-fitting`). Generate the CI SSH key pair locally, outside the repo.
      👤 runs `ansible-playbook base.yml` (Claude prepares the command).
      Check: `ssh deploy@<host> docker ps` works with the CI key; `ufw status` shows 22/80/443.
      Commit: `feat(deploy): add ansible server baseline with deploy user`
- [ ] **T23. Remove the old stack.** 👤 confirms each command: `docker compose down` in
      `/opt/realty` (no `-v`), remove `realty-*` images. Document the user check and the volume removal
      command in `deploy/README.md`.
      Check: AC24 (`docker ps -a`, `docker images`).
      Commit: `docs(deploy): document removal of the previous server stack`
- [ ] **T24. GitHub and Sentry settings.** Step-by-step list in `deploy/README.md`; 👤 creates the
      Environment `production`, the repository secrets and variables (plan §10), the Sentry project and
      token. Secret values never go through the chat.
      Check: `gh secret list`, `gh variable list` (names only) show every name from plan §10.
      Commit: `docs(deploy): add github and sentry setup steps`
- 👤 merges PR 6.

## PR 7 · `feat/0001-deploy` · continuous delivery

- [ ] **T25. Deploy workflow.** `.github/workflows/deploy.yml`; job `deploy` in `ci.yml`.
      Check: CI on the PR green (the deploy job is skipped outside `main`).
      Commit: `ci(ci): deploy to production on push to main`
- [ ] **T26. First deploy.** 👤 merges PR 7: CI publishes images and deploys blue; nginx runs on its
      self-signed certificate.
      Check: AC16, AC17 (job log); `https://lamoda-ai-fitting.ru` answers (certificate warning expected
      until T27).

## PR 8 · `feat/0001-hsts` · certificate, HSTS, acceptance

- [ ] **T27. Certificate.** `init-cert.sh` on the server: `--staging` first, then the real one.
      Check: AC20, AC21 (`certbot renew --dry-run`).
      Commit (only if the script needed fixes): `fix(deploy): ...`
- [ ] **T28. HSTS.** Enable HSTS in the nginx template. The merge of this PR is the second real deploy
      (green), run with a request loop from the Mac.
      Check: AC26 on the server; AC19 via `workflow_dispatch` with the previous tag, timed; AC18 by
      running `deploy.sh` with a nonexistent tag on the server; AC22, AC23 against the domain.
      Commit: `feat(deploy): enable hsts`
- [ ] **T29. Acceptance.** Go through AC1–AC26, record the result and evidence of each below.
      Finish `README.md` and `deploy/README.md`; bring `CLAUDE.md` in line with what was built; list any
      difference from the spec. Set `Status: done` in spec, clarifications, plan and tasks (A9a).
      Commit: `docs(specs): close 0001-bootstrap`
- 👤 merges PR 8.

## Acceptance record

Filled in at T29.

| AC  | Result | Evidence |
| --- | ------ | -------- |
|     |        |          |
