# lamoda-ai-fitting

Monorepo: `api` (NestJS) and `web` (Next.js), delivered to https://lamoda-ai-fitting.ru: every
merge into `main` is checked and deployed automatically. Set up by spec `0001-bootstrap` (closed).

Keep this file true: update it in the same commit that changes what a section describes.

## Where the truth is

- Code, this file and `README.md` are the living source of truth.
- `specs/NNNN-*/` hold the history of decisions. A spec folder whose files say `Status: done` is
  history, not instructions: never follow or edit it. While a spec is in progress, its
  `clarifications.md` (owner's decisions), `plan.md` and `tasks.md` are binding.
- How specs are written and closed: `specs/principles.md`.
- Spec files are never read whole in the main context. Read only the line range you work from (your
  task in `tasks.md`, a section you edit); everything else comes from the `spec-finder` agent as
  verbatim quotes with `path:line`, each marked binding or history. Open a range by its `path:line`
  when a quote is not enough. The exception: a `spec.md` or `plan.md` you are writing. To follow
  the format of an earlier spec file, take it from `specs/principles.md` or ask `spec-finder` for
  that file's headings; do not open the file whole.

## How work is done

- Spec → clarifications → plan → tasks → code. No code without an accepted plan.
- Decisions that change behavior belong to the owner: ask, record the answer in
  `clarifications.md`, do not pick silently.
- One task from `tasks.md` = one commit; tick its checkbox in the same commit.
- Before writing a `spec.md` or `plan.md`: ask `spec-finder` which earlier decisions and which
  items of `specs/backlog.md` touch the same area. Backlog items in that area go into the spec;
  the commit that closes one removes it from the backlog.
- Before a task: read its section of `tasks.md`, get a brief from `spec-finder` (what the task
  refers to and related decisions it does not mention), then state a time estimate. After it: stop,
  summarize what changed and the check result, wait for the owner's OK, then commit.
- If a task shows the plan is wrong: stop, fix the plan with the owner, then continue.
- Sessions: write the spec, clarifications, plan and tasks in one session; do each task of
  `tasks.md` in a fresh session (or after `/clear`). Every call re-reads the whole context, so a
  long session costs more and keeps less in focus; the task's section of `tasks.md`, the
  `spec-finder` brief and `clarifications.md` carry what the next task needs. After a task's
  commit, suggest `/clear` before the next one.
- After implementing a task, before the owner's review, run the `finish-task` skill
  (`.claude/skills/finish-task/`): it picks the agents for the changed files and carries out these
  steps (agents: see "Agents" below):
  1. `test-writer`: tests for new or changed api logic. Then `git status`: only test files may have
     changed (its hook limits its tools, not what a test does when Vitest runs it).
  2. `npm run verify`.
  3. `qa-tester`, when the task changes observable behavior (an endpoint, a page, a workflow); not
     for docs, tooling or config-only changes. Pass it the acceptance criteria.
  4. A bug it reproduces: `test-writer` pins it with a failing test, then fix it and repeat 2–3.
     Stop and ask the owner instead when the bug shows the plan or spec is wrong, or the fix changes
     behavior outside the task. Its "not covered by tests" list goes to `test-writer` too.
  5. `code-reviewer` on the diff and, in parallel:
     - `security-reviewer` when the diff touches endpoints or input handling, auth, config or env,
       logging, web rendering of data, dependencies, Docker/nginx/deploy/CI or `.claude/`;
     - `fsd-reviewer` when it touches `web/app` or `web/src`;
     - `temporal-reviewer` when it touches `api/src/temporal` or code that starts or signals
       workflows.
  6. The task summary lists what each agent found and what was done about it.

## Agents

Subagents in `.claude/agents/` work in their own context and return a short report. Delegate to them
instead of doing their job in the main context.

- `spec-finder`: task briefs and facts from the specs and docs (read-only).
- `test-writer`: writes and runs api tests; reports bugs instead of fixing code.
- `qa-tester`: tests the running local stack with curl and a browser; reports reproduced bugs and
  scenarios no test covers.
- `code-reviewer`, `security-reviewer`, `fsd-reviewer`, `temporal-reviewer`: review a diff
  (read-only). `fsd-reviewer` and `temporal-reviewer` use the skills `fsd` and
  `temporal-developer`; use them when writing that code too.

What each agent may do, how the guard hooks work, the owner's decisions and the accepted risks:
[.claude/README.md](.claude/README.md). Working rules:

- A guard bypass found gets a case in `.claude/hooks/guards.test.mjs` (part of `npm test`).
- Agent files are loaded when a session starts: restart Claude Code after changing one.
- A change to `.claude/` updates `.claude/README.md` in the same commit when it changes what the
  README describes.

## Stack and versions

Pinned on purpose; each "not newer" has a reason and a condition to move on.

| What       | Version                                                                                  | Why                                                                                                                                                          |
| ---------- | ---------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Node / npm | 26 / 12                                                                                  | Node 26 is LTS from 2026-10-28. npm 12 runs install scripts only from `allowScripts` in `package.json`; Node images ship npm 11, so images and CI install 12 |
| TypeScript | 6.0                                                                                      | 7.0 has no JS API (typescript-eslint, Nest Swagger plugin, Next need it). Move when they support 7                                                           |
| ESLint     | 10                                                                                       | React/a11y rules from `@eslint-react/eslint-plugin` and `eslint-plugin-jsx-a11y-x`; the classic plugins do not run on 10                                     |
| Prisma     | 7.10                                                                                     | install as `prisma@7`: npm's `latest` tag points at an 8.0 release candidate                                                                                 |
| api        | NestJS 12, PostgreSQL 18, Redis 8 (ioredis), Temporal (SDK 1.x), pino, socket.io, Vitest |                                                                                                                                                              |
| web        | Next 16, React 19, TanStack Query 5, Zustand 5, zod, SCSS, Sentry                        |                                                                                                                                                              |
| Server     | Docker Compose, nginx + certbot, blue-green deploys                                      | `deploy/README.md`                                                                                                                                           |

## Commands (from the root)

- `npm ci`: install; also sets git hooks (`core.hooksPath .githooks`).
- `npm run format` / `format:check`: Prettier on the whole repo.
- `npm run lint`: ESLint for root, `api` and `web` (one config, `eslint.config.mjs`).
- `npm run typecheck`, `npm test`, `npm run build`: for every package that has them.
- `npm run verify`: format check, lint, typecheck, tests and build in one command. The pre-push
  hook and CI run exactly this, so the list of checks lives in one place (root `package.json`).

`verify` covers `api` (lint, typecheck, tests, build), `web` (lint, Stylelint, typecheck,
`next build`) and the agents' guard hooks (lint, tests). Docker must be running for `verify` and
`npm test`: the Vitest project `database` (`api/test/database/`) starts a throwaway PostgreSQL with
Testcontainers (`api/test/support/`), never the development database; without Docker it fails
with a message to start it. The project `unit` (everything else) needs no Docker. `web` has no
tests yet: when its first test lands, add `web` to the root `test` script, or `verify` keeps saying
nothing about web logic.

Before calling a task done: `npm run verify`. Before opening a pull request, also a clean install
the way CI does it (`npm ci` in the root and in each package), then `verify` again.

## Structure

- Root: shared tooling (Prettier, ESLint, commitlint, lint-staged, gitleaks), `.githooks/`,
  `.claude/`, `specs/`.
- `api/src/<module>/`: controller (thin) → service (logic) → Prisma. Imports go downward only.
  Generated Prisma client in `api/src/generated/` (git-ignored, never edited by hand).
- `web/`: `app/` holds routing only and re-exports pages from `src/_pages`. FSD layers in `web/src/`,
  imports only downward: `_app → _pages → widgets → features → entities → shared`.
- `deploy/`: production compose files, nginx, deploy scripts, Ansible (server setup).

## Docker (local development)

- The app runs in Docker: `docker compose up -d --wait` (quick start in `README.md`). Do not run
  api or web natively against the compose services, or two copies end up fighting over ports.
- A second copy in Docker (e.g. a git worktree) needs its own `COMPOSE_PROJECT_NAME` and host
  ports in its `.env` (README, "Вторая копия стека"). `qa-tester` reaches only the ports of these
  two copies (3000/3001/8233 and 4000/4001/8234) and picks its own from `docker compose ps`.
- `.env` (git-ignored, created by `scripts/init-env.sh`) holds local values; every variable is
  listed in `.env.example`. Claude cannot read `.env` (settings deny it) and does not need to.
- Sources are bind-mounted; rebuild an image (`docker compose up -d --build <service>`) only after
  a dependency or config change. After a Prisma schema change:
  `docker compose up -d --build --renew-anon-volumes --wait api temporal-worker`. The generated
  client lives in the image and in each container's anonymous volume: `prisma generate` in a
  `run --rm` container reaches neither the running services nor the next `run`.
- Local database: `docker compose run --rm api npx prisma migrate dev`, then
  `docker compose run --rm api npm run seed:dev` (the demo catalog of `api/src/seed/`). The seed
  only adds rows that are missing, found by natural keys, and never changes existing ones.
- Containers reach each other by service name, never `localhost`; addresses come from compose.
  Startup order uses health checks with `depends_on: service_healthy`, never sleeps.
- `docker compose down -v` and `docker volume rm/prune` delete data; the Bash guard blocks them.
  The owner runs them by hand.

## Conventions

- Files are changed with the Edit and Write tools, never with `sed -i`, `perl`, `python` or other
  scripts: the formatting hook runs and the owner sees each change as a diff.
- `api` is an ESM package: relative imports end in `.js`.
- Configuration comes from validated environment variables (zod schemas), never hard-coded
  addresses; containers reach each other by service name.
- Logging: `api` through the injected pino logger, never `console` (ESLint enforces it).
- `web` calls the api from the server only through `apiFetch` (`web/src/shared/api`): it forwards
  the visitor's address, so the api's per-client rate limit applies to the visitor and not to the
  web container. A direct `fetch` to the api would put all visitors into one limit.
- `web` data from the api renders at request time inside `<Suspense>`: the web image must build with
  no api, Redis or database running.
- Every new environment variable goes into `.env.example` with a comment.
- Migrations stay compatible with the previous release: add in one release, remove in a later one.
  A bad migration is fixed by rolling forward.

## Production and deploys

A merge into `main` is the deploy (blue-green for api and web; the Temporal worker is replaced in
place). How deploys, rollbacks and images work: `.claude/rules/deploy.md`, loaded when you work on
deploy, CI, Docker or `scripts/` files, and `deploy/README.md`. Production secrets never pass through the chat;
commands that change the server (`ssh ai-fitting`) need the owner's confirmation.

## Dependencies

- Check a package before adding it (rules in `CONTRIBUTING.md`). Plain `npm ci` must work: never
  `--legacy-peer-deps`. The only peer-range exception is an `overrides` entry in
  `api/package.json` for `@nest-lab/throttler-storage-redis` (declares Nest ≤ 11, runs on 12);
  remove it once a release supports Nest 12. A new exception needs the owner's decision.
- npm 12 blocks install scripts that are not approved. Approve only what needs one
  (`npm install-scripts approve <pkg>`), and say why in the commit.
- ESLint and its plugins live only in the root `package.json`.

## Git

- Commits: `type(scope): subject`, subject lower-case. Types: feat, fix, perf, refactor, style,
  test, docs, build, ci, chore, revert. Scope required: api, web, infra, deploy, ci, deps, docs,
  specs, tooling.
- No `Co-Authored-By` lines in commit messages.
- Hooks: pre-commit (lint-staged, then gitleaks on staged changes), commit-msg (commitlint),
  pre-push (`npm run verify`). Never skip them; the main session's guard blocks `--no-verify`.
- The Bash guard (`.claude/hooks/main-rules.mjs`) blocks data deletion, skipped hooks, force pushes
  and printing secrets; for recursive search use `rg`. Quoted strings and heredocs no shell reads
  are data, so a commit message may mention a blocked command. A real need for a blocked command:
  the owner runs it by hand; a false positive: fix the rule and add a case to `guards.test.mjs`.
- A gitleaks hit is a real secret until proven otherwise: unstage it. Only a value confirmed to be a
  placeholder goes into the `.gitleaks.toml` allowlist, with a description.
- One branch and pull request per phase of `tasks.md`; merged with "Rebase and merge".
  After a merge, start the next branch from a fresh `main`.

@CONTRIBUTING.md
