# lamoda-ai-fitting

Monorepo: `api` (NestJS) and `web` (Next.js), delivered to https://lamoda-ai-fitting.ru.

**Bootstrap in progress** (`specs/0001-bootstrap/`, see `tasks.md` for what is done). Until it is
closed, sections below describe the target setup from `plan.md`: before relying on a file or
command, check that it exists. Update this file in the same commit that makes a section true or
wrong.

## Where the truth is

- Code, this file and `README.md` are the living source of truth.
- `specs/NNNN-*/` hold the history of decisions. A spec folder whose files say `Status: done` is
  history, not instructions: never follow or edit it. While a spec is in progress, its
  `clarifications.md` (owner's decisions), `plan.md` and `tasks.md` are binding.
- How specs are written and closed: `specs/principles.md`.

## How work is done

- Spec → clarifications → plan → tasks → code. No code without an accepted plan.
- Decisions that change behavior belong to the owner: ask, record the answer in
  `clarifications.md`, do not pick silently.
- One task from `tasks.md` = one commit; tick its checkbox in the same commit.
- Before a task: state a time estimate. After it: stop, summarize what changed and the check result,
  wait for the owner's OK, then commit.
- If a task shows the plan is wrong: stop, fix the plan with the owner, then continue.

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
- `npm run check:push`: what the pre-push hook runs; grows with `typecheck` and `test`.

Run `format:check`, `lint` and `check:push` before calling a task done.

## Structure

- Root: shared tooling (Prettier, ESLint, commitlint, lint-staged, gitleaks), `.githooks/`,
  `.claude/`, `specs/`.
- `api/src/<module>/`: controller (thin) → service (logic) → Prisma. Imports go downward only.
  Generated Prisma client in `api/src/generated/` (git-ignored, never edited by hand).
- `web/`: `app/` holds routing only and re-exports pages from `src/_pages`. FSD layers in `web/src/`,
  imports only downward: `_app → _pages → widgets → features → entities → shared`.
- `deploy/`: production compose files, nginx, deploy scripts, Ansible (server setup).

## Conventions

- `api` is an ESM package: relative imports end in `.js`.
- Configuration comes from validated environment variables (zod schemas), never hard-coded
  addresses; containers reach each other by service name.
- Logging: `api` through the injected pino logger, never `console` (ESLint enforces it).
- `web` data from the api renders at request time inside `<Suspense>`: the web image must build with
  no api, Redis or database running.
- Every new environment variable goes into `.env.example` with a comment.
- Migrations stay compatible with the previous release: add in one release, remove in a later one.
  A bad migration is fixed by rolling forward.

## Dependencies

- Check a package before adding it (rules in `CONTRIBUTING.md`). Plain `npm ci` must work: never
  `--legacy-peer-deps`.
- npm 12 blocks install scripts that are not approved. Approve only what needs one
  (`npm install-scripts approve <pkg>`), and say why in the commit.
- ESLint and its plugins live only in the root `package.json`.

## Git

- Commits: `type(scope): subject`, subject lower-case. Types: feat, fix, perf, refactor, style,
  test, docs, build, ci, chore, revert. Scope required: api, web, infra, deploy, ci, deps, docs,
  specs, tooling.
- No `Co-Authored-By` lines in commit messages.
- Hooks: pre-commit (lint-staged, then gitleaks on staged changes), commit-msg (commitlint),
  pre-push (`check:push`). Never skip them; `.claude/hooks/guard-bash.sh` blocks `--no-verify`.
- A gitleaks hit is a real secret until proven otherwise: unstage it. Only a value confirmed to be a
  placeholder goes into the `.gitleaks.toml` allowlist, with a description.
- One branch and pull request per phase of `tasks.md`; merged with "Rebase and merge".
  After a merge, start the next branch from a fresh `main`.

@CONTRIBUTING.md
