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
  when a quote is not enough. The exception: a `spec.md` or `plan.md` you are writing.

## How work is done

- Spec → clarifications → plan → tasks → code. No code without an accepted plan.
- Decisions that change behavior belong to the owner: ask, record the answer in
  `clarifications.md`, do not pick silently.
- One task from `tasks.md` = one commit; tick its checkbox in the same commit.
- Before writing a `spec.md` or `plan.md`: ask `spec-finder` which earlier decisions touch the same
  area.
- Before a task: read its section of `tasks.md`, get a brief from `spec-finder` (what the task
  refers to and related decisions it does not mention), then state a time estimate. After it: stop,
  summarize what changed and the check result, wait for the owner's OK, then commit.
- If a task shows the plan is wrong: stop, fix the plan with the owner, then continue.
- After implementing a task, before the owner's review (agents: see "Agents" below):
  1. `test-writer`: tests for new or changed api logic. Then `git status`: only test files may have
     changed (its hook limits its tools, not what a test does when Vitest runs it).
  2. `npm run verify`.
  3. `qa-tester`, when the task changes observable behavior (an endpoint, a page, a workflow); not
     for docs, tooling or config-only changes. Pass it the acceptance criteria.
  4. A bug it reproduces: `test-writer` pins it with a failing test, then fix it and repeat 2–3.
     Stop and ask the owner instead when the bug shows the plan or spec is wrong, or the fix changes
     behavior outside the task. Its "not covered by tests" list goes to `test-writer` too.
  5. `code-reviewer` on the diff.
  6. The task summary lists what each agent found and what was done about it.

## Agents

Subagents in `.claude/agents/` work in their own context and return a short report. Delegate to them
instead of doing their job in the main context.

- `spec-finder`: task briefs and facts from the specs and docs (read-only).
- `test-writer`: writes and runs api tests after the logic is implemented; it reports bugs instead
  of fixing code. Its guard allows writing only test files and running only the api tests,
  typecheck and ESLint.
- `qa-tester`: a QA engineer on the running local stack: curl and a headless Chrome through
  Playwright MCP (`@playwright/mcp`, an exact root devDependency, started with `npx --no-install`).
  Reports reproduced bugs and scenarios no test covers; `test-writer` turns those into tests. Its
  guard allows curl to the local stack with an allowlist of flags and `docker compose` ps, logs,
  stop/start/restart of one service and `up -d --wait`; stop, start and restart also ask the owner
  (`.claude/settings.json`).
- `code-reviewer`: reviews a diff against this file and the active spec (read-only).

Guards: each agent's PreToolUse hook in its frontmatter runs `node .claude/hooks/guard.mjs <rules>`
with the rules in `.claude/hooks/<rules>-rules.mjs` (read-only agents share `read-only`: ls, grep,
rg, find, read-only git; never secret files). A guard splits a command into the exact arguments the
program gets (`guard-lib.mjs`) and checks them against allowlists; anything else, including a guard
error, blocks. qa-tester's browser tools are allowlisted in its rules; `tools:` lists the same set
(a test keeps them equal) but does not limit an MCP server declared in the agent file (checked
live), so the guard is what enforces it. The cases are in `.claude/hooks/guards.test.mjs` (`node:test`, part of
`npm test`); add a case for every bypass found. Agent files are loaded when a session starts:
restart Claude Code after changing one.

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
`next build`) and the agents' guard hooks (lint, tests). `web` has no tests yet: when its first test
lands, add `web` to the root `test` script, or `verify` keeps saying nothing about web logic.

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
- `.env` (git-ignored, created by `scripts/init-env.sh`) holds local values; every variable is
  listed in `.env.example`. Claude cannot read `.env` (settings deny it) and does not need to.
- Sources are bind-mounted; rebuild an image (`docker compose up -d --build <service>`) only after
  a dependency or config change. After a Prisma schema change:
  `docker compose run --rm api npx prisma generate`.
- Images: multi-stage, exact base-image versions, non-root user, exec-form `CMD`, dependencies
  installed before sources are copied. Secrets never go into an image (`ARG`/`ENV`/`COPY`); the
  web build takes the Sentry token as a BuildKit secret.
- Containers reach each other by service name, never `localhost`; addresses come from compose.
  Startup order uses health checks with `depends_on: service_healthy`, never sleeps.
- `docker compose down -v` and `docker volume rm/prune` delete data; the guard hook blocks them.
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

Details and commands: `deploy/README.md`.

- A merge into `main` is the deploy: CI (secret scan, `verify`, images built and a blue-green deploy
  checked on the runner, published to GHCR) → CD (`.github/workflows/cd.yml`) → the server runs
  `deploy/scripts/deploy.sh <commit hash>`. Rollback: run CD by hand with an earlier hash.
- Blue-green: the new copy of api and web starts next to the running one, nginx switches only when
  it is healthy; the previous copy stays as the rollback. The Temporal worker is replaced in place.
- Every change to deploy files is tested the way it reaches production: on a copy of `deploy/`
  updated as CD updates the server, and in CI by `scripts/ci-deploy-check.sh`. nginx config changes
  are applied by `deploy.sh` without restarting nginx.
- The server's `.env` is rewritten from GitHub on every deploy; values change in GitHub, not on the
  server. Production secrets never pass through the chat.
- Migrations must stay compatible with the running version (`specs/principles.md`): a rollback does
  not undo them.
- The server is reached as `ssh ai-fitting` (the owner's SSH alias); CI logs in as `deploy`.
  Commands that change the server need the owner's confirmation.

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
  pre-push (`npm run verify`). Never skip them; `.claude/hooks/guard-bash.sh` blocks `--no-verify`.
- The guard reads a Bash command's text, so a `grep` for a blocked phrase is blocked too: search
  files with the Grep/Read tools, and write such text with the editor, not with `cat <<EOF`.
- A gitleaks hit is a real secret until proven otherwise: unstage it. Only a value confirmed to be a
  placeholder goes into the `.gitleaks.toml` allowlist, with a description.
- One branch and pull request per phase of `tasks.md`; merged with "Rebase and merge".
  After a merge, start the next branch from a fresh `main`.

@CONTRIBUTING.md
