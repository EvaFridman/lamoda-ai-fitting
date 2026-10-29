# lamoda-ai-fitting

Monorepo: `api` (NestJS) and `web` (Next.js), delivered to https://lamoda-ai-fitting.ru: every
merge into `main` is checked and deployed automatically. Set up by spec `0001-bootstrap`; database
schema and demo catalog by `0002-database-schema`; the UI kit (`web/src/shared/ui`, page `/ui-kit`)
by `0003-ui-kit`; the api's CRUD routes, product filters, admin access, pagination, error format,
Swagger and Sentry by `0004-crud-api`; parallel CI jobs and tests, publishing images only from
`main` and faster health checks by `0005-faster-ci`; access closed by default, quota tiers, the
client address and request id, body, timeout and socket limits, and nginx's limits and security
headers by `0006-api-guards`; web's data layer (server and browser api clients, typed catalog
entities, Russian error texts, Sentry reports, the OpenAPI contract check, the browser bundle check)
by `0007-web-data-layer`; Mixpanel analytics behind a cookie consent banner,
the page `/privacy` and Lamoda's footer by `0008-web-analytics`; attribute values' swatch colour,
the catalog product card, filters and category list, and their sections on `/ui-kit` by
`0009-entity-ui`; Lamoda's header by `0010-web-header`; the S3 bucket, the catalog photos served
from it through nginx, users' files with signed links and their deletion through Temporal by
`0011-s3-storage`; sign-in with Google, sessions, the admin token's removal, user routes that serve
only the signed-in user's own data, account deletion and the header's profile menu by `0013-auth`;
nightly encrypted copies of the database and the bucket, a database copy before a deploy migrates
and the restore procedures by `0012-backups`, whose production checks are a backlog item; the catalog at `/catalog` and
`/catalog/<slug>` (full-text search, cursor paging in a virtual grid, filters in the URL, the
filter counts' cache, the database pool's limits, SEO, page and media limits in nginx and the
Content Security Policy) by `0014-catalog`; the
analytics events' catalog, its document `EVENTS.md`, their checks, the rule
`.claude/rules/analytics.md` and the `analytics` agent by `0015-analytics-events`; the account
pages under `/customer`, the page "Мои данные" with `PATCH /me` and deleting the account
from its page by `0017-account`; the caches' Redis and both Redis' memory limits, the page cache
of the public catalog's reads, the deploy's warm-up and its route list, the first-request measurement after a deploy, the rule
`.claude/rules/web-pages.md` and the deploy job's time limit by `0018-cache-warmup`; the catalog's
loading placeholders, its phone layout below 600 px and the filters' sheet with a screen per
filter below 1024 px by `0020-catalog-mobile`; the AI fitting by `0019-ai-fitting`: the OpenAI
module and its checks through the proxy abroad, the fitting photos (`/me/photos`, nginx's 20 MB
upload route, "Мои фото"), the file deletions' outbox and the schedule `fitting-housekeeping`,
the generation (the image model and its prompt, the workflow `generateFitting`, `/fittings` with
the monthly limit, the push `fitting:finished`), the try-on of one item and of a look
(`widgets/try-on`), the history "Мои примерки" with its repeat and compare, the product page
`/products/<id>` (on phones as Lamoda's), the catalog card's hanger and heart, the header on
phones as Lamoda's, the fitting room (`/me/fitting-room`, the header's `FittingRoomButton` and
`widgets/fitting-room-drawer`) and the fitting's analytics (all closed). The AI fitting's vision
`0016-ai-fitting` stays accepted: 0019 checked its AC5–AC10, AC14 and AC15 (for the account), the rest wait for
specs of their own. Spec `0021-investigator` added the investigator: a request's log line with
four headers only, the code index `tools/code-rag` and its MCP server, Sentry's MCP server
read-only, the `investigator` agent with its shell guard and the skill `/investigate`. Spec
`0022-stores` added Lamoda Sport's stores: the table `stores` filled by the seed, `GET /stores`,
the page `/customer/stores` open to everyone (the search, the cards and Yandex's map), its
Content Security Policy on that one path, the footer's link and the analytics zones `stores` and
`footer`. Spec `0023-ui-feedback` applied the owner's notes on the UI: the calmer catalog card and
header icons with «скоро», the gallery's full screen and lens, the tidier fitting room, the try-on's
drop zone, photo replacement and one steady photo frame, the success screen, the real download
(`GET /fittings/:id/image`), the regeneration without reasons, freer wishes checked with the
items' names, the photo consents kept with the user and a text of its own for each refusal's
reason and safety category. Spec `0026-city` made the header's city live: the stores' cities, the
window «Ваш город» (a pick, a search, «Определить автоматически»: the browser's position turned
into the nearest store's city in the browser, no geocoder), the choice kept in the browser
(`features/choose-city`), the burger's row, the stores page on the visitor's city (its switch,
its own ask once per browser, the search's pause), `/privacy`'s paragraph and the city's
analytics.

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
  summarize what changed and the check result, wait for the owner's OK, then commit. A spec whose
  `clarifications.md` chooses the review at phase boundaries (`specs/principles.md`, spec 0019 A2)
  commits each task after its `finish-task` without a stop and stops once at the phase's end, with
  the pull request and a summary of what was done, what the agents found and which assumptions
  were taken.
- If a task shows the plan is wrong: stop, fix the plan with the owner, then continue.
- Sessions: write the spec, clarifications, plan and tasks in one session; do each task of
  `tasks.md` in a fresh session (or after `/clear`). Every call re-reads the whole context, so a
  long session costs more and keeps less in focus; the task's section of `tasks.md`, the
  `spec-finder` brief and `clarifications.md` carry what the next task needs. After a task's
  commit, suggest `/clear` before the next one.
- After implementing a task, before the owner's review, run the `finish-task` skill
  (`.claude/skills/finish-task/`): it picks the agents for the changed files and carries out these
  steps (agents: see "Agents" below):
  1. `test-writer`: tests for new or changed api or web logic. Then `git status`: only test files may have
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
- `test-writer`: writes and runs api and web tests; reports bugs instead of fixing code.
- `qa-tester`: tests the running local stack with curl and a browser; reports reproduced bugs and
  scenarios no test covers.
- `code-reviewer`, `security-reviewer`, `fsd-reviewer`, `temporal-reviewer`: review a diff
  (read-only). `fsd-reviewer` and `temporal-reviewer` use the skills `fsd` and
  `temporal-developer`; use them when writing that code too.
- `analytics`: proposes the events of a spec's or plan's pages against the catalog's rules, and
  answers questions about the collected data with aggregate Mixpanel queries only (pass the
  project id, `4073843`). Every such question goes to it: the main session and the built-in agents
  never query the data through Mixpanel themselves (spec 0015 R25).
  Not a step of `finish-task`.
- `investigator`: investigates a production failure (a Sentry issue link, a request id, a
  symptom) or reviews what broke `since <release tag | N days>`, from both Sentry projects, the
  production logs over `ssh ai-fitting` in the shapes of its guard, the release's code
  (`git show <tag>:<path>`) and the code index; only reports, in Russian (spec 0021 plan §5).
  Every Sentry call and ssh asks the owner. Not a step of `finish-task`, never after a deploy or
  from CI. It is started by the skill `/investigate <link | request id | symptom | since …>`
  (`.claude/skills/investigate/`: refreshes the index with `rag:index`, runs the agent, relays
  its report as it came and proposes the next step, spec 0021 plan §7) or from the owner's plain
  words, with the same steps; no code changes in the same turn without the owner's OK.

What each agent may do, how the guard hooks work, the owner's decisions and the accepted risks:
[.claude/README.md](.claude/README.md). Working rules:

- A guard bypass found gets a case in `.claude/hooks/guards.test.mjs` (part of `npm test`).
- Agent files are loaded when a session starts: restart Claude Code after changing one.
- A change to `.claude/` updates `.claude/README.md` in the same commit when it changes what the
  README describes.

## Stack and versions

Pinned on purpose; each "not newer" has a reason and a condition to move on.

| What       | Version                                                                                                                                                                                                                                                                                               | Why                                                                                                                                                          |
| ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Node / npm | 26 / 12                                                                                                                                                                                                                                                                                               | Node 26 is LTS from 2026-10-28. npm 12 runs install scripts only from `allowScripts` in `package.json`; Node images ship npm 11, so images and CI install 12 |
| TypeScript | 6.0                                                                                                                                                                                                                                                                                                   | 7.0 has no JS API (typescript-eslint, Nest Swagger plugin, Next need it). Move when they support 7                                                           |
| ESLint     | 10                                                                                                                                                                                                                                                                                                    | React/a11y rules from `@eslint-react/eslint-plugin` and `eslint-plugin-jsx-a11y-x`; the classic plugins do not run on 10                                     |
| Prisma     | 7.10                                                                                                                                                                                                                                                                                                  | install as `prisma@7`: npm's `latest` tag points at an 8.0 release candidate                                                                                 |
| api        | NestJS 12, PostgreSQL 18, Redis 8 (ioredis), Temporal (SDK 1.x), Better Auth 1.7, pino, socket.io, Sentry, Vitest                                                                                                                                                                                     |                                                                                                                                                              |
| web        | Next 16, React 19, TanStack Query 5, TanStack Virtual 3, Zustand 5, zod, SCSS, Base UI, Better Auth (client, the api's version), socket.io-client, Sentry, Mixpanel, Yandex Maps JS API 3 (`@yandex/ymaps3-clusterer`, `@yandex/ymaps3-types`), Vitest, Testing Library, Agentation (`next dev` only) |                                                                                                                                                              |
| Server     | Docker Compose, nginx + certbot, blue-green deploys                                                                                                                                                                                                                                                   | `deploy/README.md`                                                                                                                                           |

## Commands (from the root)

- `npm ci`: install; also sets git hooks (`core.hooksPath .githooks`).
- `npm run format` / `format:check`: Prettier on the whole repo.
- `npm run lint`: ESLint for root, `api` and `web` (one config, `eslint.config.mjs`).
- `npm run typecheck`, `npm test`, `npm run build`: for every package that has them. `npm test`
  runs the api and web tests at the same time (`scripts/run-parallel.mjs`), each Vitest with half
  the CPUs (two full pools at once were slower than one after the other); each one's output prints
  as one block when it ends, and the run fails if either does.
- `npm run verify`: format check, lint, typecheck, tests and build in one command. The pre-push
  hook and CI run exactly this, so the list of checks lives in one place (root `package.json`).
- `npm run rag:index`: brings the code index `.rag/index.sqlite` up to the tracked files, embedding
  only files whose blob changed (needs `VOYAGE_API_KEY`, else it exits 1 and sends nothing);
  `-- --full` rebuilds it, `-- --dry-run` lists what would be indexed and skipped, with no key.

`verify` covers `api` (lint, typecheck, tests, build), `web` (lint, Stylelint, typecheck, tests,
`next build`), the agents' guard hooks and root `scripts/*.mjs` (lint, `node --test`), and
`tools/code-rag` (lint, `tsc --noEmit`, `node --test`). Last, after
`build`, `check:web-bundle` (`scripts/check-web-bundle.mjs`) fails when a file under
`web/.next/static` (the browser bundle) contains `x-proxy-secret` (any case), `PROXY_SECRET`,
`S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, `BETTER_AUTH_SECRET`, `GOOGLE_CLIENT_SECRET`,
`OPENAI_API_KEY`, `OPENAI_PROXY_URL`, `VOYAGE_API_KEY` or the
backup job's `BACKUP_{READ,WRITE}_{ACCESS_KEY_ID,SECRET_ACCESS_KEY}`, or when that directory is
missing or empty; the one exception is Better Auth's env getter of `BETTER_AUTH_SECRET` in its
browser client, cut out in exactly its shape (spec 0013 N53). Then `check:web-shells`
(`scripts/check-web-shells.mjs`) fails when a page shell under `web/.next/server/app` (but
`_global-error.html`) holds an inline script (a nonce in it too) whose hash is not in
`web/src/shared/csp/shell-script-hashes.json` (the CSP, spec 0014 O112). Docker must be running for `verify` and
`npm test`: the Vitest project `database` (`api/test/database/`) starts a throwaway PostgreSQL,
SeaweedFS and Temporal with Testcontainers (`api/test/support/`), never the development ones; without Docker it fails
with a message to start it. The project `unit` (everything else) needs no Docker. `web` tests
(Vitest in jsdom with Testing Library, `web/vitest.config.mts`) sit next to their code as
`web/src/**/*.test.ts(x)` and need no Docker: `npm --prefix web test`.

Before calling a task done: `npm run verify`. Before opening a pull request, also a clean install
the way CI does it (`npm ci` in the root and in each package), then `verify` again. A spec that
reviews at phase boundaries may also choose in its `clarifications.md` that a task inside a phase
ends with `typecheck`, `lint` and its own tests, `qa-tester` runs once per phase at its last task,
and the full `verify` once at the phase's end (as spec 0019 A58 did).

## Structure

- Root: shared tooling (Prettier, ESLint, commitlint, lint-staged, gitleaks), `.githooks/`,
  `.claude/`, `.mcp.json` (the Mixpanel MCP server: the main session, which leaves data questions
  to the `analytics` agent, and that agent's four aggregate tools, `.claude/README.md`; Sentry's
  hosted server, read-only: its write tools, dispatchers, Seer, `whoami` and replays denied by
  name in `.claude/settings.json`, spec 0021 Q2, Q21; and `code-rag`, the code index's server, whose three tools are the only `allow` rules of
  `.claude/settings.json`), `specs/`.
- `api/src/<module>/`: controller (thin) → service (logic) → Prisma. Imports go downward only.
  Generated Prisma client in `api/src/generated/` (git-ignored, never edited by hand).
- `api/prisma/`: `schema.prisma` and migrations. CHECK constraints live only in the migrations'
  `migration.sql` (Prisma does not model them); `schema.prisma` notes the rules queries must follow.
- `api/src/seed/`: the demo catalog. Its image columns hold keys, not URLs; the files are in
  `api/seed-media/<key>`, and the seed uploads the missing ones to the bucket's `media/<key>`
  (served at `/media/<key>`). `seed/large-catalog.ts` (`npm run seed:dev-large -- <count>`, spec
  0014 plan §2.8) adds development products `DEV-00001…` made of the demo catalog's, with its photo
  keys; it refuses to run in production. `seed/stores.data.ts` holds Lamoda Sport's stores in
  Lamoda's order (spec 0022 X1, X2), added by their `code` after the catalog; a changed, closed or
  reordered store needs a migration (the file's head says how).
- `api/src/storage/`: the S3 bucket (`StorageService`: `put`, `get`, `exists`,
  `deletePrefix`, `signedUrl`) and `keys.ts`, the one place object keys are built and checked.
- `api/src/ai/`: OpenAI (spec 0019 plan §3): `AiModule` provides `AI_SETTINGS` (the
  `OPENAI_API_KEY`, `OPENAI_PROXY_URL` and `FITTING_*` env) and `AI_PROVIDER`: `OpenAiProvider` in production only,
  elsewhere always `FakeAiProvider` (A49), which answers without the network and refuses on the
  marker `refuse:<reason>` in a photo's bytes or a text (`refuse:moderation:<category>` for a
  safety category, spec 0023 plan §3.5), and on a photo of one solid colour
  (`REFUSAL_COLOURS`, one per reason and per category: an upload reaches the check as sharp's
  WebP, where no byte of the marker survives, A53; `test/support/photos.ts` makes such images);
  `fail:unreadable_verdict` in a text is the text check's unreadable verdict (Y19); a test sets
  its `delayMs`. `safety-category.ts` maps OpenAI's flagged names (the moderation endpoint's, the
  image model's `moderation_details`) to one coarse category of `SAFETY_CATEGORIES`, the first
  found of `minors`, `sexual`, `violence`, `self_harm`, `hate` (harassment too), `illicit`, else
  `unknown` (Y2).
  `OpenAiClient` (undici's own `fetch`, no SDK) calls `/v1/images/edits`, `/v1/responses` and
  `/v1/moderations` at `OPENAI_ORIGIN`, with a proxy (`config/openai-proxy-url.ts`, which the env
  schema shares) through its `ProxyAgent`
  (spec 0019 A73), and `/v1/models` for `check-openai.ts`, the deploy's check; `checks/` hold `PhotoChecker`, `PromptChecker` and `ModerationChecker`.
  `generate(job)` is the one paid call: `image-models/` builds the edits request (`gptImage2`
  behind `ImageModel`, the person's image first, 1 to 5 items) with `prompts.ts`'s one prompt,
  sends again only a request that never reached OpenAI (a connection that did not open, a rate
  limit's 429: one generation, one payment, A67), under the caller's `timeoutMs`, else
  `FITTING_TIMEOUT_SECONDS`, and answers the model's refusal as `{ ok: false, reason: 'moderation',
stage, category }` (the stage of `moderation_details`, else `input`);
  the fake's picture is the person's photo at 1024×1536, and `fail:moderation|provider_error|timeout`
  in the wishes or the comment gets that failure (A66; `fail:moderation:<stage>:<category>` a
  refusal of that stage and category, a bare one `input` and `unknown`).
- `api/src/backup/`: the backup job (spec 0012), a plain Node process outside Nest, run as
  `dist/backup/main.js` from the `backup` target of `api/Dockerfile` (image `ai-fitting-backup`):
  a nightly service, `--once`, and `--pre-deploy <tag>` for the deploy. Its object names are
  built only by `backup/keys.ts`.
- `api/scripts/`: development-only scripts, not in the runtime image: `fake-oidc.mjs`, the fake
  Google of the compose service `oidc` and of e2e (spec 0013 N14, N19, N20).
- `tools/code-rag/`: the code index for the agents (spec 0021), a package of its own whose
  TypeScript Node runs as it is (type stripping: only erasable syntax, relative imports end in
  `.ts`), tested by `node --test`. `verify` (so the pre-push hook) needs `npm ci` in it, as in
  `api` and `web`. `files.ts` picks the committed regular files it reads (`git ls-tree` of `HEAD`,
  spec 0021 Q19: never a staged or working tree change; the
  included places and the exclusions are spec 0021 plan §3.2; never a `.env*` but the root
  `.env.example`, a symlink or an unmerged path) and `findSecretLine` tells a piece that looks
  like a secret; `chunk.ts` cuts TypeScript and JavaScript by top-level statement (a class over
  80 lines by member), Markdown by heading section, the rest and anything too long by windows of
  at most 60 lines and 6000 characters. The indexer reads a file's content by its blob hash
  (`git cat-file`, `readBlobs`), never the working tree, and leaves out a chunk whose embedded text
  (`<path> <symbol>` and the chunk) looks like a secret (`indexer.ts`). `embed.ts` posts to
  Voyage's `voyage-code-4` (1024 dimensions) through `fetch` (no SDK; `FakeEmbedder` in tests)
  at the pace of Voyage's free tier, 3 requests and 10 K tokens a minute (spec 0021 Q18: batches of
  about 5 K estimated tokens, at least 20 s apart, a batch refused twice with 429 split in
  halves, so the first full index takes hours);
  `voyageKey()` takes `VOYAGE_API_KEY` from the environment, else only that one variable from the
  repository's `.env`. `store.ts` keeps `.rag/index.sqlite` with `node:sqlite` (`DatabaseSync`)
  and the `sqlite-vec` extension: the chunks, a `vec0` table and FTS5, searched by both merged by
  reciprocal rank fusion; another schema version, model or dimension rebuilds it. The index lives
  in the git-ignored `.rag/`; the images' build contexts (`api`, `web`) reach neither.
  `server.ts` is the MCP server `code-rag` of `.mcp.json` (stdio, `@modelcontextprotocol/sdk`):
  `search_code` (kinds `code`, `test`, `deploy`, a path prefix), `search_docs` (`spec` with its
  binding or history, `doc`) and `index_status`, `limit` at most 50 (`MAX_LIMIT`; `Store` caps
  `k` at sqlite-vec's 4096). It opens the index read-only for each call (`Store`'s `readOnly`: a
  missing index or another schema, model or dimension is `IndexMismatchError`), never indexes
  and runs only read-only git commands with `--no-optional-locks` (so `git status` never takes
  `.git/index.lock` from a commit); `rag:index` forgets the indexed commit while it runs, so a
  run that stopped halfway says no run has finished. Every answer starts with the indexed commit and the
  indexable files changed since, committed or not (`git diff-tree` of the indexed commit and
  `HEAD`, and `git status`; never `git diff <commit>`, which writes `.git/index`), or says the commit is not in this history (a rebase). A query that
  looks like data (`queryData`: a secret, an email, a uuid, a request id of exactly 32 hex, 10+ digits, `X-Amz-`,
  `/keep/users/`; spec 0021 Q20, the request id added at PR 3's review) is refused before anything is sent; any other is embedded by a `VoyageEmbedder` with `retry: false` (one attempt, no pace: it shares the
  minute's limits with a running index, so a 429 answers at once); a missing key, a missing or
  mismatched index and any other failure answer as a tool error, never a crash.
- `web/`: `app/` holds routing only and re-exports pages from `src/_pages`. FSD layers in `web/src/`,
  imports only downward: `_app → _pages → widgets → features → entities → shared`. A slice or a
  `shared` segment exposes `index.ts` (browser-safe) and/or `server.ts`, which starts with
  `import 'server-only'`; one with only server-only exports has only `server.ts` (the `fsd` skill).
  The one segment with neither is `shared/page-cache`: only `web/cache-handlers/redis.mjs`, the
  page cache's handler that Next loads by path with plain Node, imports its `handler.mts` (no
  `server-only`, no `@/`, types only; spec 0018 V21).
  An entity slice's `ui` segment only displays: its components take entity data, the current
  choice (`value`, `checked`), if any, and either callbacks (`onApply`, `onValueChange`,
  `onCheckedChange`) or the links the page builds (`href`,
  `getHref`); they keep no state beyond their own open dropdown, search or unapplied choice, read
  no URL and make no requests (spec 0009 K7). The page that places them owns the filter state, the
  URL and the requests.
- `deploy/`: production compose files, nginx, deploy scripts, Ansible (the server's setup,
  `base.yml`, and the proxy to OpenAI's, `openai-proxy.yml`).

## Docker (local development)

- The app runs in Docker: `docker compose up -d --wait` (quick start in `README.md`). Do not run
  api or web natively against the compose services, or two copies end up fighting over ports.
- Another copy in Docker (e.g. a git worktree) needs its own `COMPOSE_PROJECT_NAME` and host
  ports in its `.env` (README, "Другие копии стека"). `qa-tester` reaches only the ports of three
  copies (3000/3001/8233/8333/4010, 4000/4001/8234/8334/4011 and 9000/9001/8235/8335/4012) and
  picks its own from `docker compose ps`.
- `.env` (git-ignored, created by `scripts/init-env.sh`) holds local values; every variable is
  listed in `.env.example`. Claude cannot read `.env` (settings deny it) and does not need to.
- Sources are bind-mounted; rebuild an image (`docker compose up -d --build <service>`) only after
  a dependency or config change. After a Prisma schema change:
  `docker compose up -d --build --renew-anon-volumes --wait api temporal-worker s3-init`. The generated
  client lives in the image and in each container's anonymous volume: `prisma generate` in a
  `run --rm` container reaches neither the running services nor the next `run`.
- Local database: `docker compose run --rm api npx prisma migrate dev`, then
  `docker compose run --rm api npm run seed:dev` (the demo catalog of `api/src/seed/`). The seed
  only adds rows that are missing, found by natural keys, and never changes existing ones; then it
  uploads the photos missing from the bucket and never rewrites one that is there.
- Local storage: SeaweedFS (service `s3`, port 8333, bucket `S3_BUCKET`, volume `s3data`) stands in
  for Timeweb's S3; the one-shot `s3-init` (`api/src/storage/dev-setup.ts`) lets anyone read
  `media/*` and expires `tmp/` after a day, and api, the worker and web start after it. Signed links carry `S3_PUBLIC_ENDPOINT`
  (`http://localhost:<S3_HOST_PORT>`), the browser's address of the emulator. `next dev`
  forwards `/media/` to the emulator (`rewrites()` in `next.config.ts`, development only); in
  production nginx answers it. A fresh `s3data` holds no photos until `seed:dev` runs again.
- Containers reach each other by service name, never `localhost`; addresses come from compose.
  Startup order uses health checks with `depends_on: service_healthy`, never sleeps.
- `next dev` mounts Agentation's toolbar (`_app/dev-annotations.tsx`, from `Providers`): the owner
  annotates the UI and pastes its "Copy" markdown into the chat; with no `endpoint` or
  `webhookUrl` it keeps the notes in `localStorage` and sends nothing while its settings' "Webhook
  URL" stays empty (a prop cannot turn that field off: it posts every note, with the page's
  address and text, wherever it points). The `NODE_ENV` check is
  inlined at build time, so no production bundle holds it (README, «Замечания по интерфейсу»).
- `docker compose down -v` and `docker volume rm/prune` delete data; the Bash guard blocks them.
  The owner runs them by hand.

## Conventions

- Files are changed with the Edit and Write tools, never with `sed -i`, `perl`, `python` or other
  scripts: the formatting hook runs and the owner sees each change as a diff.
- `api` is an ESM package: relative imports end in `.js`.
- Configuration comes from validated environment variables (zod schemas), never hard-coded
  addresses; containers reach each other by service name.
- Logging: `api` through the injected pino logger, never `console` (ESLint enforces it). A
  request's log line keeps of its headers only `user-agent`, `content-type`, `content-length` and
  `referer`, the referer without its query or fragment and each value cut to 512 characters, then
  `…` (`serializeRequest`, `core/core.module.ts`; `/api/auth`'s line too, without its query; spec 0021
  Q9, Q16); the answer's `Set-Cookie` is redacted.
- `api` errors: every HTTP error answers `{ error: { code, message, details } }` (successful
  responses are the data itself); `details` is `[{ field, code, message }]`, `message` is English,
  at most 50 entries (`MAX_DETAILS`, `common/validation/`) and then one `TOO_MANY_ERRORS` entry that
  counts the rest; a detail's `field` keeps at most 100 characters and its `message` 200. A JSON
  body over `BODY_LIMIT` (at most 1 MB) answers 413 `PAYLOAD_TOO_LARGE`. Only JSON bodies are read
  (Nest's default parsers off, `bodyParser: false`): a route that needs form bodies turns the
  urlencoded parser on with the same limit (spec 0006 F26); the one multipart route,
  `POST /me/photos`, reads its body itself with `busboy` (`me/photos/photo-upload.ts`, spec 0019
  plan §5), up to `FITTING_PHOTO_MAX_BYTES`.
  Codes and their statuses (`ERROR_STATUS`) are `api/src/common/errors/error-codes.ts`; throw
  `AppException` or its subclasses (`common/errors/app.exception.ts`, the status follows from the
  code), and let Prisma errors through: `AppExceptionFilter`
  (`common/filters/`) maps them, with `common/errors/constraint-fields.ts` naming the field of
  each database constraint (a new constraint gets a row there). Path ids use `@UuidParam('id')`
  (`common/pipes/`): `UuidPipe` plus the uuid format in Swagger. Services write references as scalar ids (`brandId`), not nested `connect`,
  so a missing one answers `RELATED_NOT_FOUND`. `/health/*` keep their own format (the deploy
  reads them). `server.ts` and every e2e app whose module provides `ConfigService` are created by
  `createHttpApp()` (`common/http/http-app.ts`): `AppExpressAdapter` (else broken JSON is a plain 400) with `bodyParser: false`, `useRequestContext(app)` (else every route behind the global
  guards answers 500), CORS, the JSON parser with `BODY_LIMIT`, `createValidationPipe()`
  (`common/validation/`) and `TimeoutInterceptor` (a handler slower than `REQUEST_TIMEOUT_MS`, at
  most 30 s, answers 503 `SERVICE_UNAVAILABLE`; its work is not cancelled, its end is logged, and
  only a route's first timeout within a minute goes to Sentry, spec 0006 F29). The timeout starts
  after the global guards; the counters' Redis client's `commandTimeout` (1 s; the caches' client
  has the same) keeps the throttler from hanging there, and after a failed command it counts in memory for 10 s (F28). The database pool
  (`PrismaService`, spec 0014 plan §2.7) holds at most `DATABASE_POOL_MAX` connections (10, at most
  50); a query waits for one `DATABASE_CONNECTION_TIMEOUT_MS` (2000) and a statement runs
  `DATABASE_STATEMENT_TIMEOUT_MS` (5000), then 503 `SERVICE_UNAVAILABLE` (`57014`, the pool's
  timeout, `P2028` of a transaction's timeout); the two together stay below `REQUEST_TIMEOUT_MS` or
  the api does not start (O59), so a test that lowers the request timeout lowers them too. Every
  transaction gets them as `maxWait` and `timeout`. The bound holds per query; a transaction's last
  statement may run on to its statement timeout, and a handler is bounded only by the request
  timeout. A 503 of a dependency down, too slow or busy (not a request timeout or a session read)
  goes to Sentry once per route template and minute, the rest to the log (O60). The filter counts'
  queries take at most half the pool (`FacetQuerySlots`, O62); their wait for a slot, up to the
  connection timeout, comes on top of the bound. The migrations and the seed (`UnlimitedPrismaService`) connect without these limits. A step the server and the tests share goes into `createHttpApp()`, and no
  e2e spec repeats one; a unit spec of a single piece (the middleware, Swagger metadata) may build
  a bare app. Database e2e get such an app from `createTestApp()` (`test/support/test-app.ts`).
  Node's server timeouts are set only by `server.ts`, after `listen()` (`common/http/server-timeouts.ts`). Swagger error responses: `swagger.ts` adds the
  ones a route's shape implies (body, query, `@UuidParam`, another path parameter's 400
  `VALIDATION_FAILED`, `@SignedIn()`/`@Closed()`'s 401, 429/500/503); a route that can
  answer 409 `ALREADY_EXISTS`/`IN_USE`, 400 `RELATED_NOT_FOUND`/`CONSTRAINT_VIOLATION` or, by a
  non-uuid path parameter such as a slug, 404 `NOT_FOUND` declares them with `@ApiErrors(...)`
  (`common/errors/`). A non-uuid path parameter is checked by a param DTO (`@Param() dto`). The OpenAPI document is committed as
  `api/openapi.json`, a snapshot `test/openapi-snapshot.e2e-spec.ts` checks: a route or DTO change
  fails it until `npm --prefix api test -- -u` rewrites it, committed with the change. web's
  `*.contract.test.ts` compare its response schemas with that file through `@/shared/contract`
  (test-only; ESLint refuses it outside `*.test.ts(x)`). Those schemas hold no `.catch()`,
  `.default()` or transforms, and dates stay ISO strings: the check reports all but
  `z.preprocess` and codecs. In the same way `api/validation-codes.json` lists every `details`
  code the DTOs' rules can answer (`test/validation-codes.e2e-spec.ts` reads class-validator's
  metadata after importing `AppModule`, rewritten with `-u`, spec 0017 plan §3), and web's
  `error-text.contract.test.ts` fails on a code there with no text in `DETAIL_TEXTS`. Codes from
  elsewhere (an unknown field, a database rule, a path id, the owner check) are not in the
  snapshot; their texts in `DETAIL_TEXTS` are kept by hand. A refusal's detail message
  (`PHOTO_REFUSED`, `PROMPT_REFUSED`) is built only by `refusalMessage` (`ai/refusal-message.ts`),
  and every one the api can answer is the snapshot `api/refusal-messages.json`
  (`test/refusal-messages.e2e-spec.ts`, rewritten with `-u`), against which web's
  `refusal.contract.test.ts` and `prompt-refusal.contract.test.ts` check its parsers through
  `refusalMessages()` (`@/shared/contract`). A name
  (`IsPersonName`, `common/validation/rules.ts`, one `ValidateBy`) answers the one code
  `IS_PERSON_NAME` for any failure (U19); its check is the exported `isPersonName`, which
  `auth/auth-hooks.ts` uses for Google's given name.
- `api` access is closed by default: the global `AccessGuard` (`common/auth/`) answers 401
  `UNAUTHORIZED` on a route that carries none of `@Public()`, `@SignedIn()` and `@Closed()` (per
  controller or route; a route's marker overrides its controller's). `@Public()` serves anyone, a
  broken or expired session cookie too (catalog reads, `/health/*`, the socket gateway);
  `@SignedIn()` lets through the principal `user` (`/me`, the user's own fitting sessions and
  generations: someone else's row answers 404, as a missing one, spec 0013 N8); `@Closed()`
  answers 401 to everyone (catalog writes, other users' routes, writing generations) and stays for
  the tests and a later spec that opens it. `test/access-markers.e2e-spec.ts` fails on a route
  with no marker, on a route missing from its lists `PUBLIC_HANDLERS` and
  `SIGNED_IN_HANDLERS` (a new one is added there on purpose), on `@Public()` under a `@Closed()` or
  `@SignedIn()` controller and on either on a socket handler. There is no admin token (spec 0013
  AC6). Both global guards are registered in `AppModule`, the throttler first, so a refused request
  is counted against that route's limit (counters are per route, spec 0006 F22). Lists take
  `PaginationQueryDto` and answer `Paginated<T>` (`common/pagination/`), except `GET /products`:
  `limit` and `cursor` only (an `offset` answers 400), answering `CursorPaginated<T>` (spec 0014
  O11, O44).
- `api` `PATCH /me` (spec 0017, `me/`) saves the signed-in user's own data through
  `MeService.update` (`UsersService.update`, a missing row answers 401): its `UpdateMeDto` (not `UpdateUserDto`) takes only `lastName`,
  `firstName`, `patronymic`, `dateOfBirth` and `gender`, each optional; `null` clears a name or the
  date, `firstName` too, while `gender` is changed but never cleared (`ValidateIf` + `IsEnum`, not
  `@IsOptional()`, so `null` answers 400, U9). Any other field (`email`, `phone`, a storage key) is
  refused by the whitelist; an empty body answers 200 unchanged. It is the `write` tier and goes
  through `signOutWhenGone` (`me/sign-out-when-gone.ts`), as `GET` and `DELETE /me` do.
- `api` `POST /me/photos` (spec 0019 plan §5, `me/photos/`, `@Expensive()`): the multipart body
  (`photo`, `save` = `true` by default, `consent`) read by `busboy`. The photo consents live on the
  user's row (spec 0023 Y1, Y17: `photo_consent_at` and `photo_consent_version`, both or neither;
  `UserResponseDto`'s `photoConsentVersion`, the time not answered): `consent` must be
  `PHOTO_CONSENT_VERSION` (`me/photos/consent.ts`, else the detail `IS_IN`); a user with no stored
  consent of that version who sends none gets 400 with the detail `CONSENT_REQUIRED` before
  anything else is spent; a sent one is written in a statement of its own after sharp and before
  the check, so a refused photo keeps it. `sharp` turns the JPG, PNG or WebP into a
  WebP of at most 2048 px without metadata (anything else: 400 with the detail `IS_IMAGE`), the
  check `checkPhoto` runs on that WebP (a refusal: the detail `PHOTO_REFUSED`, its reason in the
  message, a moderation one as `moderation:<category>`; a failed or timed-out check: 503, nothing stored), then one transaction locks the user's
  row (gone: 401 through `signOutWhenGone`), counts the saved photos (a sixth: 409 `LIMIT_REACHED`;
  `save=false` makes a transient one, not counted), writes the object under `userPhotoKey` with a
  3 s limit (a failure: 503, no row; an object left by an abort or a failed insert goes with the
  user's folder) and the row; the first saved photo is the default. The answer is
  `UserPhotoDto` with a signed `url`. A54–A57 say why. `GET /me/photos` answers the saved photos
  as a plain array, oldest first (not `Paginated<T>`, plan §5; a gone user gets an empty one);
  `PATCH /me/photos/:id` takes only `{ isDefault: true }` (`SetDefaultPhotoDto`, `false` answers
  the detail `IS_IN`) and moves the default; `DELETE /me/photos/:id` (204) deletes the row with
  its outbox entry in one transaction and the file after it, and makes no other photo the default
  (the next saved upload is, A54). A transient photo, another user's or a missing one answers 404
  on both; both lock the user's row as the upload does, so a gone user answers 401 through
  `signOutWhenGone` (A59). Closing the try-on calls `DELETE /me/photos/transient/:id` (204, only a
  transient photo, else 404), which leaves one a running fitting uses to the housekeeping (A70).
- `api` fittings (spec 0019 plan §5, `fittings/`): `POST /fittings` (`@Expensive()`,
  `StartFittingDto`: `photoId`, `kind` `single` with one item or `look` with 2–5, `items` of
  `productId` and `attributeValueId`, `promptText` ≤ 200) checks the items (a missing product or a
  colour not of its product (a value of its colour attribute, A76, A91): 400 `RELATED_NOT_FOUND`; the details `HAS_SLOT`, `DISTINCT_SLOTS`) and
  the photo, answers 200 with an earlier completed result of the same fingerprint
  (`fingerprint.ts`: photo, items, wishes; `repeated: true`, A7) or the running one (A32), checks
  the text with the items' catalog names (refused: 400 `PROMPT_REFUSED` with one detail of the
  same code on `promptText` or `comment`, «<field> was refused: <reason>», the reason one of the
  classification's or `moderation:<category>`, spec 0023 plan §3.5; no answer or an unreadable
  verdict: 503), then in one transaction locks the
  user's row (`me/lock-user.ts`), looks for the running one again, reads the photo again, reserves
  a try-on of the month (`FittingQuotaService.reserve`, `fitting_quota`; at the limit 409
  `LIMIT_REACHED`, A20) and inserts the `pending` row in the active session; after the commit it
  starts `generateFitting` (a failed start ends the row `failed` through `endFitting`, which the
  workflow's `complete` shares, and goes to Sentry with the id only) and answers 201
  `StartedFittingDto`. `FittingDto` carries the wishes as `promptText` (the user's own text, for a
  colour change to send again, A92.1), each item's `slot` and, for a `moderation` failure,
  `failureCategory` and `failureStage` (`input`, `output`), kept in `ai_generations`'
  `failure_category` and `failure_stage` (both or neither, only with `moderation`, a CHECK) and
  read as `unknown` and `input` on an older row; null otherwise (spec 0023 plan §3.5). `POST /fittings/:id/regenerate` (`{ reasons?, comment? }`, an empty body is one more attempt
  with `reasons` stored as `[]`, spec 0023 Y9) copies the parent's photo, items, wishes and
  fingerprint, and checks the comment with the parent's items; a parent not completed is 409 `NOT_COMPLETED`,
  its photo gone 409 `PHOTO_GONE`; a try-on's own result has one free regeneration
  (`free_regeneration_used`, given back by a failed one; a regeneration is created with it set, so
  its regenerations spend, A70), and a paid start or regeneration at the limit is refused before
  the paid text check. One generation of a fingerprint runs at a time, so a try-on and its
  regenerations run one after another. `GET /fittings/:id/image` (spec 0023 Y8, plan §3.2) answers
  a completed fitting's result from the bucket as a `StreamableFile`: `image/webp`, `attachment`
  named `primerka-<YYYY-MM-DD-HHmm>.webp` by `finishedAt` (else its start) in Moscow time
  (`result-file-name.ts`), `Cache-Control: private, no-store`; someone else's, a missing one, one
  not completed, a key outside the owner's folder or an object the bucket lacks is 404, another
  storage failure or a read over 5 s 503. The handler returns once the bytes are read, so
  `TimeoutInterceptor` never cuts a slow client's download. `GET /fittings`
  (`CursorPaginated`, `fitting-cursor.ts`, `kind`), `GET /fittings/:id`, `DELETE /fittings/:id` (the row and the outbox first, then the
  file deletion's start and the workflow's cancel side by side, the try-on stays spent, A47) and
  `GET /me/fitting-quota` see only the user's fittings (rows with a `kind`). A fitting still
  running an hour after its start is ended `failed` with its try-on given back by the
  housekeeping's first step (`endStuckFittings`, behind the patch `end-stuck-fittings`). `POST`
  and `PATCH /fitting-sessions` are `@Closed()` (A21).
- `api` fitting room (spec 0019 plan §5, A12, A86, `me/fitting-room/`): one row per user and slot
  in `fitting_room_items` (gone with the user or the product; the colour references the product's
  own link, set to NULL when it goes). `GET /me/fitting-room` answers `{ items, count, sum }`, the
  items in the slots' order with the catalog's list item and the colour, `sum` of `finalPrice`,
  leaving out a row whose category is inactive or of another slot now. `PUT /me/fitting-room/:slot`
  (`{ productId, attributeValueId? }`, 200) puts or replaces and answers `{ room, replaced }` for
  «Вернуть» (`null` after a repeat of the same product and colour): an unknown product, one of an inactive category or a colour not of it (`COLOUR_VALUE`, `products/colour.ts`: a value of a colour attribute, A76, A91) is 400
  `RELATED_NOT_FOUND`, a category without a slot the detail `HAS_SLOT`, another slot's product
  `MATCHES_SLOT` (so `accessory` is always refused). `DELETE /:slot` (an empty one too) and
  `DELETE` (204) empty one slot or all; the writes lock the user's row and go through
  `signOutWhenGone`, `GET` of a gone user is empty.
- `api` the product page's reads (spec 0019 A36, A80): `GET /products/:id` still answers a product
  of an inactive category (web compares its `category.id` with the active categories);
  `GET /products/:id/related` (`@Public()`) answers the six newest products of other active
  categories that have a slot, the product left out, and 404 for an unknown product or one of an
  inactive category; `GET /products/:id/fittings/last` (`@SignedIn()`,
  `ProductFittingsController`) the user's newest completed fitting that holds the product,
  regenerations included, else 404. `ProductListItemDto` carries `updatedAt` (the sitemap's).
- `api` stores (spec 0022, `stores/`): `GET /stores` (`@Public()`, the `read` tier) answers every
  row of `stores` as a plain array in `position` order (no paging; `code`, `position` and
  `createdAt` stay in the database). Only the seed writes them; no route does (X2).
- `api` sign-in (spec 0013): Better Auth (`auth/`) with Google only (locally the fake provider of
  the compose service `oidc`), mounted by `mountAuth()` (from `createHttpApp()`) at `/api/auth`
  as an Express route ahead of Nest's; only the routes in `AUTH_ROUTES` (`auth-routes.ts`) answer,
  anything else there is 404. These routes are the second exception to the error format: their
  answers are Better Auth's `{ code, message }` (N17), except their own rate limit's 429, which
  keeps the api's format (N32); no Nest guard, interceptor or filter sees them. A session is a row
  in `sessions` plus a signed cookie; its signed copy answers without the database for 5 minutes
  (N18), so a sign-out or a deleted user may still pass for that long. Expired `sessions` and
  `verifications` rows are deleted, 1000 per statement, every day at 03:00 Moscow time by the
  Temporal schedule `delete-expired-auth-rows` (workflow `deleteExpiredAuthRows`). The worker
  creates it at start, or brings an existing one to the code's settings at every start; a pause
  set by hand stays (N27, N50; `temporal/schedules.ts`, shared with `fitting-housekeeping`,
  spec 0019 A38). Production needs
  `BETTER_AUTH_SECRET` (32+ letters or digits, not a proxy secret), `GOOGLE_CLIENT_ID` and
  `GOOGLE_CLIENT_SECRET`, and refuses the fake provider's `AUTH_FAKE_OIDC_*` (`assertServerEnv`);
  elsewhere an empty `BETTER_AUTH_SECRET` logs a warning at start (`serverEnvWarnings`, N51).
- `api` socket.io is set up by `SocketIoAdapter` (`realtime/`, used by `server.ts` and the socket
  e2e): CORS for `WEB_ORIGIN` and `maxHttpBufferSize` from `SOCKET_MAX_MESSAGE_BYTES` (64 KB, at
  most 1 MB, spec 0006 F30). A bigger message never reaches the gateway: over WebSocket the server
  closes the connection, over long-polling the request answers 413. nginx does not limit WebSocket
  frames, so this is the only size limit. At the handshake the adapter reads the session cookie
  through the request context's session reader (`SESSION_READER`, one per app, so both share its
  cap, sockets at most 5 of its 20 reads, N42; one read per connection) and puts the principal in
  `socket.data.principal`; a new connection whose `Origin` is not `WEB_ORIGIN` (an exact origin,
  checked at start, N43) is refused (N40), a failed read connects as anonymous, and a sign-out
  does not close an open socket (spec 0013 plan §7, N36). A database socket e2e gets its app from
  `createTestApp({ socketAdapter })`. Clients may not send binary attachments (F31): the adapter's
  parser (`NoAttachmentsDecoder`) takes none and closes the connection; the server's own emits may
  carry binary data. `socket.io-parser` is a direct dependency for that parser; its range
  stays in socket.io's minor line, so `npm ls socket.io-parser` shows one copy.
- `api` rate limit (`throttling/`): `TieredThrottlerGuard` counts a request in one quota tier, each
  with a 1-second and a 60-second limit from `THROTTLE_*` env: `expensive` for a route marked
  `@Expensive()` (a route that starts an AI generation or a photo upload gets it), else `read` for
  GET/HEAD, else `write`. The minute window is checked first, so a client over its minute quota is
  told that wait in `Retry-After` (spec 0006 F23). `@SkipThrottle()` (any form; with no argument it skips every tier) is allowed
  only on the classes in `SKIPPED` of `test/throttle-markers.e2e-spec.ts` (health, the gateway; a new one is
  added there on purpose). A per-route `@Throttle()` names one of its tier's two throttlers
  (`expensive-minute`), not `default`; that test fails on any other name. The counters are in the
  counters' Redis (`REDIS`, `REDIS_URL`), which never evicts: once it is full a write fails with
  `OOM` and the throttler counts in memory (F28; `test/database/throttling-full-redis.e2e-spec.ts`,
  spec 0018 AC7).
- `api` has two Redis clients (`redis/redis.module.ts`): `REDIS` for the rate-limit counters and
  `/health/ready`, `REDIS_CACHE` (`REDIS_CACHE_URL`) for caches only, which readiness never checks
  (spec 0018 V4, V5). Every process that validates the api's environment (the worker, `s3-init`,
  the seed) needs both URLs. A database e2e that needs a real Redis starts its own with
  `startTestRedis()` (`test/support/redis.ts`).
- `api` product search (spec 0014): `q` of `GET /products` and `/products/facets` matches
  `products.search_vector` (the name, brand and category, Russian stemming, a GIN index) with
  `to_tsquery('russian', …)`, the last word as a prefix from `MIN_PREFIX_LENGTH` (2) characters,
  or an article in any case (`toProductSql`, `products/listing/product-filter.ts`). Triggers of
  the migration `…_product_search` on `products`, `brands` and `categories` keep the vector up to
  date, so a rename there rewrites its products' vectors (backlog "Catalog renames when catalog
  writes open").
- `api` filter counts (`GET /products/facets`) are cached in the caches' Redis (`REDIS_CACHE`) by
  `ProductFacetsCache` (`products/listing/facets-cache.ts`, spec 0014 plan §2.6) for `FACETS_CACHE_TTL_SECONDS` (60 s),
  under `facets:v1:<sha256>` of the normalized filter, `q` as sent (O58) (`facetsCacheKey`, which names every field of
  `ProductFilterQueryDto`: a new filter goes into the key; `v1` goes up with any change to the
  answer's shape or to how counts are made, since blue and green share Redis). Nothing invalidates
  it: a catalog change shows within the TTL (O49). The cache is skipped while the client is not
  connected; a failed Redis command is a miss, logged at most once a minute, and the cache is then
  skipped for 10 s (O56), so the counts answer without Redis. The write after a miss is not awaited.
  Once that Redis is full it evicts the least recently used keys, so a flood of filters evicts
  only cache entries and writes go on (spec 0018 AC6).
- `api` request context (`common/http/request-context.ts`): a middleware ahead of the body parser
  sets the client address, the request id (answered in `X-Request-Id`, on log lines and Sentry
  events) and the principal (`@CurrentPrincipal()`, `common/auth/`): `user` from a valid session
  cookie, read by the session reader (`auth/session-reader.ts`; not on `/api/auth`, which reads its
  own), else `anonymous`. A read that fails, takes over its timeout or finds 20 reads in progress
  answers 503 `SERVICE_UNAVAILABLE` (spec 0013 N29). Code reads them with
  `requestContextOf(req)`, never `req.ip` or the headers: `X-Forwarded-For` and `X-Request-Id`
  count only on requests that carry `X-Proxy-Secret` equal to `PROXY_SECRET` (nginx, web) or, while
  it is rotated, to `PROXY_SECRET_NEXT` (api only; rotation in two deploys: `deploy/README.md`).
- `web` calls the api from the server only through `apiFetch` (`@/shared/api/server`): it forwards
  the visitor's address and the request id with `X-Proxy-Secret` (server env `PROXY_SECRET`, never
  `NEXT_PUBLIC_`), so the api's per-client rate limit applies to the visitor and not to the web
  container. A direct `fetch` to the api would put all visitors into one limit. Paths come only
  from `buildPath('/products/:id', { id }, query)` (`@/shared/api`): each param is encoded into one
  segment, and an empty, `.` or `..` param, like a path off the api's origin, is an `ApiError` of
  kind `path` before any request. It reads the visitor's request from `headers()`; `proxy.ts`, which
  has no `headers()`, passes the request's headers as its fourth argument. The one exception is the
  page cache's reads, below.
- `web` page cache (spec 0018): the public catalog's reads with no filter (V15) are cached in the
  caches' Redis through `'use cache: remote'`, in the entity slices' `server-queries.ts`: the first
  page of `getCategories`, and `getProductBatch` and `getProductFacets` when the query holds nothing
  but at most one `categoryId` (no filter, sort, `limit` or cursor), a product's
  `getRelatedProducts` once the product page has read it as the visitor (`getProductById`, never
  cached) and found it in an active category, and the sitemap's batches of products
  (`getSitemapProducts`, cursors the api answered, at most 10 keys, one batch every 200 ms so their background refreshes
  stay under web's per-second quota of `GET /products`; spec 0019 A80, A81), and the stores'
  list (`getStores`, `entities/store`, no parameters, spec 0022 plan §3.1); anything
  else goes through `apiFetch` as the visitor. `getCategoryBySlug` (the page's) takes an active category from the
  cached list of active ones and reads any other slug as the visitor, as `proxy.ts`'s
  `findCategoryBySlug` does, so no slug a visitor types becomes a key or spends web's quota (V24);
  the header and that lookup share `getActiveCategories`, once per render. While the handler skips
  Redis it publishes until when in a slot of `globalThis` (`SKIP_UNTIL`, a `Symbol.for`), and
  `pageCacheOpen()` sends every read as the visitor meanwhile, so a Redis outage does not put all
  visitors into web's one quota (V24): a failure or a lost connection (reconnecting too) for 10 s,
  then one probe; a client's first connection after the process starts for 1 s at a time, not
  logged. A cached function takes only the query (its arguments, and anything its closure
  captures, become the cache key and are stored: never a header, a cookie, a secret or user data)
  and calls `cachedApiFetch` (`@/shared/api/server`): `apiFetch` without the visitor's address,
  request id or `X-Proxy-Secret`, so its misses count under web's own address. Its lifetime is
  `cacheLife({ stale: 60, revalidate: PAGE_CACHE_REVALIDATE_SECONDS, expire: 3600 })`: past
  `revalidate` the next request gets the entry and refreshes it in the background. A failed read is
  returned as `{ failure }` with lifetime 0, so it is not stored, and `cachedData` throws it again as
  the `ApiError` (an error thrown inside `'use cache'` reaches the caller as a plain `Error`, V23),
  so nothing else may throw inside a cached function (a path that `buildPath` could refuse is built
  by its caller). A failed refresh leaves the stored entry as it was, served until `expire`. The handler
  (`cache-handlers/redis.mjs` → `shared/page-cache/handler.mts`) stores an entry under
  `page-cache:v1:<build id>:<sha256 of Next's key>`, so releases never share entries and Redis and
  Sentry's Redis spans see no arguments, stores none over 1 MB, and on a failed or slow Redis (200
  ms) answers a miss, logged at most once a minute, then skips Redis for 10 s (V5, V22).
- `web` calls the api from the browser only through `clientFetch` (`@/shared/api`): the site's own
  `/api` (no public api address, no cross-origin calls), no secret, a 15 s timeout (an upload
  passes its own `timeoutMs`: `uploadPhoto`'s 120 s, spec 0019 plan §7), the same
  response step and errors as `apiFetch`. In production nginx serves `/api/`; locally `next dev`
  forwards it to `API_URL` (`rewrites()` in `next.config.ts`, development only; the config is in
  the image, so rebuild web after changing it), and all browser calls share the web container's
  quota. With the api stopped that rewrite answers a plain 500, not nginx's 503: the local 503 text
  is checked with a stubbed answer. A `null` schema is for an answer with no body: a 204 resolves
  to `undefined` without reading it (`clientFetch` only; `apiFetch` always takes one), and
  `BLOB_ANSWER` for a file, `{ blob, fileName }` from `Content-Disposition`, within 30 s
  (`downloadFittingImage`, `entities/fitting`: `GET /fittings/:id/image` saved through an object
  URL and an `<a download>` never put into the page; `useFittingImageDownload` of
  `features/download-fitting`, the result's and the history's «Скачать», waits for it and shows the
  toast «Фото скачано» or the error's text, spec 0023 P28);
  the JSON body of a write is the caller's
  `init` (`body: JSON.stringify(...)`, `Content-Type: application/json`). Queries retry only a
  network error or a 503, at most twice
  (`shouldRetry`, `_app/providers.tsx`); a request cancelled by its caller is not an error. The first
  write, `ProfileForm`'s `PATCH /me`, is TanStack Query's `useMutation` with no retry (spec 0017
  plan §4: a write is not repeated by itself) and `gcTime: 0` (its body and answer are personal
  data); a success puts the answer into the cache with `setQueryData`, only over the same user's,
  instead of a new read. `DeleteAccount` calls `deleteMe()` directly, since it ends in a full load. The
  one other browser client is Better Auth's (`@/shared/auth`, the site's own `/api/auth`, spec
  0013): its calls go through `callAuth`, and `useSession` (`@/entities/session`) turns a failed
  read into one with `authFailure`, so their failures are `ApiError`s too. Besides them the
  browser holds one live connection, `@/shared/realtime` (spec 0019 plan §6, A72): `socket.io-client`
  (in socket.io's minor line, as `socket.io-parser`), loaded by `import()` with the first
  connection, to the site's own `/socket.io` with the session cookie, long-polling then WebSocket;
  `useSessionRealtime` (`features/auth`, mounted by the header's profile icon) opens it signed in,
  again for another user, and closes it on a seen end of the session. A slice listens for a push
  through a `RealtimeEvent` of its own (a name, a parser, a key it is delivered once by per
  connection: `fittingFinishedEvent` of `entities/fitting`); a push is only a signal to read again
  through the api. Locally `next dev` rewrites `/socket.io` to the api's `/socket.io/`, long-polling
  only: Next answers `/socket.io/` with a 308, so there the client asks without the slash.
- `web` reads every api answer through a zod schema of its entity slice (an extra field is dropped,
  an unknown enum value is an `ApiError` of kind `schema`). Errors show Russian text only through
  `errorText` / `detailText` (`@/shared/api`, `error-text.ts`: one text per api code, a general one
  for the rest, a table of its own for `/api/auth`, and `signInRedirectText` for a sign-in that
  failed at Google; a contract test fails on an `ErrorCode` missing there). All clients report a
  network error, a timeout, a schema failure, a 5xx or a 401 to Sentry (`report.ts`), one event per
  cause (kind, method, route template, and an `http` answer's status) per 60 s, counted per server
  process or browser tab; other 4xx, 429, refused paths and a status the caller expects
  (`callAuth`'s `acceptStatus`: the 401 of `revoke-sessions`; `clientFetch`'s `expectedStatus`,
  still thrown: the 401 of `DELETE /me`, spec 0017 U25; a 5xx is reported even when passed there)
  are not reported. A component that
  catches an error renders it with `errorText` and passes it to `reportFailure` (an `ApiError` is
  already reported, anything else is sent then). A page loads data on the server with `prefetch`
  (`@/shared/api/server`, which returns a failure instead of throwing) into a `HydrationBoundary`,
  and the browser's hooks start from it with the same query key, without a request.
- `web` sign-in (spec 0013): the session is read only in the browser. `apiFetch` forwards no
  cookies, so no page reads user data on the server (the first one that does adds it, backlog).
  `authClient` (`@/shared/auth`) is Better Auth's `better-auth/react` client, at the api's exact
  version (N33); its `get-session` read also extends the session (the api never does, N30).
  `useSession()` (`@/entities/session`) parses its answer with the slice's schema and gives
  `pending`, `signed-in` with the user, or `signed-out` with `failed`: true when the read failed or
  did not match, so the session may still be there (a failure after a session was read keeps it).
  `features/auth` holds the sign-in and the sign-outs: `signInWithGoogle(callbackURL)` sends
  `errorCallbackURL` equal to `callbackURL`, which `callbackUrl()` builds from the router's path and
  query (without `error` and `error_description`) only, never from a query parameter, every leading
  run of `/` and `\` cut to one `/` (no open redirect); `signOutEverywhere()` revokes every session,
  then signs out (a 401 of the revoke still signs out). A sign-in that fails at Google comes back to
  its page with Better Auth's `error` code: `LoginModal` opens with `signInRedirectText` (a text of
  its own for `access_denied`, a general one otherwise), and the code and `error_description` leave
  the address, signed in (`DropSignInError`) or not (N54). A second `LoginModal` on a page (the
  account invitation, spec 0017; the product page's buy box, the header's burger and fitting
  room, the grid's and the related row's hangers, spec 0019) passes `handlesReturnedError={false}`
  (a placer that opens it from many controls passes `open` and no `trigger`, and the opening still
  sends `Login Opened`): the returned code, its
  report, the flag taken on mount and the address stay with the header's. A code other than `access_denied` is
  reported to Sentry as `SignInFailed` only when the sign-in flag (see analytics) shows a sign-in
  started in this tab, so someone else's link with a made-up `error` reports nothing. The header's profile icon (`widgets/header`, `HeaderProfile`,
  rendered per request inside `<Suspense>` since the modal reads the query) is inert while the session
  loads, opens `LoginModal` signed out (a failed read too) and, signed in, the kit's `Menu`: a circle
  with the first letter of the name (or of the email) and the name or "Профиль" (no email or avatar,
  N6; `user-label.ts`) in a `MenuHeader` with `mp-block`, the account's five sections as
  `MenuLinkItem`s (`shared/config/account-sections.ts`, spec 0017 AC2; a section with `fullLoad`,
  the stores', is a plain `<a>` there, in the burger, the side menu and the footer, so its page
  loads in full with its own policy, spec 0022 X16), a separator and `SignOutItems` ("Выйти", "Выйти со всех устройств"; a
  failure shows a toast). It also mounts `useDropUserQueries` (`features/auth`): whenever the
  session is `signed-out` and not `failed`, the queries of `userKeys.all` leave the cache, so the
  next person at the tab never sees `/me` (spec 0017 U22); another user signed in with no end
  seen in between resets them, so a page reads them again as that user. Below 600px the header is
  Lamoda's phone row (spec 0019 A87.4–7): the burger and the loupe, the logo (still `/`, A89),
  «Избранное», the fitting room and «Корзина» (on every width the icons have no frame, and the
  inert «Избранное» and «Корзина» carry «скоро», spec 0023 C2–C5); the gender switch, the city, the profile icon and the category row
  are hidden by CSS, not unmounted, so `HeaderProfile`, its hooks and its `LoginModal` (the one
  that answers a returned sign-in error) run once on every width. The city (spec 0026 plan §4)
  is `HeaderCitySlot` (per request, inside `<Suspense>` whose fallback is the inert button):
  `loadHeaderCities()` (React's `cache`, shared with the burger; `getStores()` → `storeCities`,
  only names and points reach the page, a failure `null`) and `HeaderCity`, the chosen city's
  name or «Укажите ваш населенный пункт» (also before hydration), opening `CityModal`. The loupe (`HeaderLoupe`)
  opens and closes the search row (`HeaderSearchRow`, kept mounted while closed), which slides as
  its grid row goes `0fr → 1fr`, the field focused at the click itself so iOS opens the keyboard
  (spec 0024 Z30); the row is open while `q` is in the address, drawn so with no slide, until the
  loupe closes it, and a new `q` opens it again. The burger
  opens `HeaderMenu`, a left `Drawer`: signed out «Войти» (a second `LoginModal`,
  `handlesReturnedError={false}`), signed in `SessionUserBadge` in an `mp-block`, the account's
  sections and the sign-outs (`useSignOuts`, `features/auth`, which `SignOutItems` shares), then
  a list «Город» of one row, «Город: <name>» or «Укажите ваш населенный пункт», which closes the
  drawer and opens its own `CityModal`, the focus back on the burger (spec 0026 C5), then
  «Все товары» and the header's categories; a link closes it. The header stays not sticky.
- `web` the visitor's city (spec 0026, `features/choose-city`): the cities are the stores'
  (`entities/store`'s `storeCities`: one per `cityName`, the table's `city` without «г. » and
  what follows a comma, Москва and Санкт-Петербург first, then alphabetical), and the choice is a
  name of them in `localStorage` (`city`, at most 100 characters; `city-asked` once the stores
  page asked or a city was chosen; both kept in memory when the browser stores nothing, until the
  tab reloads; not `mp_`/`__mp` keys), one per browser, shared by tabs, never on the server.
  `useCity(cities)` gives it only while it is one of them (else `null`, `undefined` while
  hydrating or with no cities, C8); only a pick, «Определить автоматически» or the stores page's
  own ask (a found city) changes it. `locateCity` (`lib/`) is
  the one caller of `navigator.geolocation.getCurrentPosition` (`enableHighAccuracy: false`,
  10 s, a position up to 10 minutes old, and its own 30 s deadline, C15): the coordinates go only
  to `nearestCity` (the city of the nearest store by the haversine distance, `null` past 100 km)
  and are kept, logged or sent nowhere; its results (`found`, `far`, `refused`, `failed`) go to
  no Sentry. `findCity` sends `City Located`. `CityModal` (the kit's wide `Modal` «Ваш город»:
  «Определить автоматически» with C7's texts in a `role="status"` line, the uncontrolled search
  «Найти город» with `matchCities`, one button per city, the chosen one `aria-current`; with
  `cities` `null` the general error text) closes on a pick or a found city (`onChosen`); a
  control that opens it spreads `useCityOpenEvents(source, cities)`. `useAskCityOnce(cities)` is
  the stores page's own ask, the only one no click starts (C6).
- `web` account (spec 0017): `/customer` and its sections `/customer/orders`, `stores`,
  `account` ("Мои данные"), `fittings` and `photos` ("Мои фото", spec 0019 A19: `_pages/photos`,
  `widgets/my-photos`, `features/upload-photo`) (`web/app/customer/`, whose layout holds only the
  metadata: `noindex`, the titles; `robots.ts` disallows `/customer`). Every page is
  `AccountShell({ section, public, aside, title, back })` (`widgets/account-shell`; `aside`, a
  block under the menu shown signed in on a wide screen, is the history's `LimitMeter`; `title` and
  `back`, a page's own title and way back on every width, are the compare page's; `public` shows
  the section to everyone at once, the stores', spec 0022 X4, X15): the side menu of
  `shared/config/account-sections.ts` (the header reads the same list, since a widget imports no
  widget), `Skeleton`s while the session loads, signed out (a failed read too) an invitation whose
  button is a second `LoginModal` (no redirect), signed in the section. Below 1024 px `/customer`
  is the list of sections and a section shows "‹ Личный кабинет" in place of the menu, one DOM
  switched by CSS. `_pages/customer` has no section, `_pages/account-stubs` holds the one stub
  (orders), `_pages/stores` «Магазины Lamoda Sport» (spec 0022: the search and the list of
  `entities/store`'s cards; the city's row above them and no legend of the store kinds, spec 0026
  C16; `server.ts` only; `/privacy` says it shows Yandex's map, which
  receives the visitor's address and its cookies, X6, and how the city is found and kept, spec
  0026 C10), `_pages/fittings` the history («Мои примерки», spec 0019 T16: `widgets/fitting-history`,
  `features/delete-fitting`, `entities/fitting`'s `HistoryCard`; a card opens its fitting through
  `?fitting=<id>` in T15's try-on window; «Примерить ещё раз» is `useRepeatFitting` with the
  entry's `repeatBody`, disabled once its photo is gone, a repeat's answer the toast «Такая
  примерка уже есть…», T27, A93; the selection mode of `features/compare-fittings` leads to
  `_pages/fitting-compare`, `/customer/fittings/compare?a=<id>&b=<id>`, `widgets/fitting-compare`
  with `fittingDifference`), and `_pages/account-data` shows the user's data from `entities/user` (`useMe`,
  `updateMe`, `deleteMe`, `userKeys`, `UserInitials`, `profileInitials`), read only in the
  browser (U11), with `ProfileForm` (`features/edit-profile`: the date mask `ДД.ММ.ГГГГ`, only
  changed fields sent, the api's `details` under their fields, the whole form `mp-block`) and
  `DeleteAccount` (`features/delete-account`). A save that changes `firstName` calls `refreshSession()`
  (`@/entities/session`): `get-session` with `disableCookieCache`, which writes the session's
  signed copy again, then `$sessionSignal`, so the header shows the new name at once (AC8).
  `DeleteAccount` opens a `Modal` with the focus on "Отмена" (U26); confirming calls `deleteMe()`,
  then `track('Account Deleted', {}, { sendNow: true })`, `reset()` and
  `window.location.assign('/')`, a full load, so nothing of the deleted user stays in the tab; a
  401 (the session already gone, U25) does the same without the event, any other failure keeps
  the modal open with its text.
- The kit (`web/src/shared/ui`, its examples on `/ui-kit`) has, besides its controls,
  `MenuLinkItem` (Base UI's `Menu.LinkItem` rendering `next/link`, with `fullLoad` a plain `<a>`,
  as the kit's `Link` with `fullLoad`, for a page that loads in full or another site's; `MenuItem`
  has no link form),
  `LinkButton` (a `<button>` styled as the kit's `Link`, for an action that is not navigation),
  `Modal`'s `finalFocus` (a function giving the element focused when it closes, `true` for the
  trigger; `LoginModal` passes it through, so the header's modal returns the focus to the burger
  while its icon is hidden, spec 0019 A87.7),
  `Modal`'s `initialFocus` (a ref of the element focused when it opens, `'popup'` for the frame
  itself, else the first focusable one), `Modal`'s `wide` (up to 1000px, the whole window below 600px) and `media` (a picture's
  column), `Modal`'s `animateSize` (the frame's height follows its content over `--duration-slow`,
  a `ResizeObserver` on a box around the children; not on a phone's `wide`; the try-on's window,
  spec 0023 P10), `FileInput` (a kit `Button` that clicks a hidden `<input type="file">`, one file, with
  `accept` and `capture`, spec 0019 A30; `bare` is a plain button the page styles), `IconButton`'s
  `plain` and `Sheet` (spec 0019 A64: the kit's one bottom sheet is `Drawer side="bottom"`, which
  takes `description`, `media` (a picture left of the heading, which then has no "‹" or header
  action), `grip`, `closable` and `initialFocus`; `Sheet` is it with a grip and no ×),
  `ProgressBar`, `CountBadge` (nothing at 0; its parent places it and names the count),
  `SoonChip` (board 3's «скоро», placed by its parent as `CountBadge`, hidden from screen readers:
  the header's inert «Избранное» and «Корзина», spec 0023 C4, C5),
  `Chip`/`ChipGroup` (Base UI's Toggle and ToggleGroup; spec 0019 plan §7), `Select`'s option
  `swatch` (a colour circle in place of a thumbnail, spec 0019 A90.3) and `Gallery` (a
  product's photos, board 1: from 600px two large and up to three small with «Показать ещё фото»,
  below it a swiped strip whose slides, the photo covering them, are as high as the window less
  the page's `--gallery-offset`, with Lamoda's dots above the page's `--gallery-overlap`, spec
  0019 A87.1, A88; one list switched by CSS, `unoptimized`; spec 0023 P2: a photo is a button
  that opens `GalleryViewer`, its full screen, at it: black, each photo whole, a swiped strip,
  «‹» «›» with a mouse and the arrow keys gliding to the next photo (a smooth `scrollTo`, instant
  under `REDUCED_MOTION_QUERY`), «N из M», × and Escape; with a mouse, `MOUSE_QUERY`, the
  cursor over a photo is a round lens of 160 px showing the part under it 2.5 times larger, the
  photo unchanged, Y14; catalog photos only, since the lens puts the address in an inline style)
  and `ScrollRow` (one row of `<li>`s scrolling sideways with snapping, as many in
  view as the parent's `--scroll-row-visible` and `--scroll-row-gap`; from 600px «‹» «›»,
  disabled at the ends, gone while everything fits, taking `events`; A87.3). For the
  catalog's sheet (spec 0020) `Drawer` takes `fullHeight` (a bottom sheet as high as it can be, so
  a `Drawer` nested in it, Base UI's nested drawer, is as high and the outer one steps back behind
  it), `onBack` (a "‹" before the title, `backLabel`, `backRef`), `headerAction` (a control before
  the ×), and passes Base UI's close `reason` to `onOpenChange`; `CheckboxFilterPanel` and
  `SortFilterPanel` take `layout: 'sheet'` (rows split by hairlines, the box or circle on the
  right), the checkbox panel `selectAll` ("Выбрать все", W24); the icons include `FilterIcon`.
  `Drawer side="left"` is the side modal from the left edge (the header's burger, with
  `MenuIcon`, spec 0019 A87.6).
  Phones are below 600px: `PHONE_QUERY` (`@/shared/config`) with `useMediaQuery` (`@/shared/lib`,
  a client module) where the DOM must differ, else CSS. Where the device kind decides a control
  (the camera, the magnifier, hover effects), the primary pointer does, not the width (spec 0023
  Y13): `COARSE_POINTER_QUERY` (a finger) and `MOUSE_QUERY` (`@/shared/config`), the same way;
  a motion a script starts follows `REDUCED_MOTION_QUERY` there.
  Tracking handlers reach the kit and entity
  components as props, from the widget or page that calls `useTrackedElement`: `FilterDropdown`'s
  and the catalog filters' `chipEvents` (on the chip's trigger, not its ×), `FileInput`'s and
  `Chip`'s `events`, `ScrollRow`'s `events` (by direction), `MiniSwatches`' `events` (hovers of its row), `CatalogProductCard`'s and `CatalogCategoryList`'s `linkEvents`,
  `SavedPhotoCard`'s `makeDefaultEvents`, `HistoryCard`'s `openEvents`, `StoresMap`'s
  `pinEvents`, `Gallery`'s `photoEvents` (by index, from `useTrackedElements`, which gives the
  props of any number of copies of one element by their properties). The kit's `Tabs` with no `panel` on its items only switch: the page shows what they
  choose (the stores page's list and map, spec 0022 X25); their underline is Base UI's
  `Tabs.Indicator`, sliding from the old tab to the new one (the active tab draws it until it is
  measured, spec 0024 AC4).
  Motion (spec 0024 Z2): every movement (a transform, a height, a position, a size) takes
  `var(--ease-standard)` (`shared/styles/tokens.scss`, slow at both ends) and one of
  `--duration-fast`, `--duration-slow` or `--duration-long` (a bottom sheet's and a side drawer's
  slide, their overlay in step), all three 0 under `prefers-reduced-motion`; colour changes and
  opacity-only fades keep `ease`, endless loops `linear`, and a script's smooth scroll the
  browser's own curve (Z26.3). Stylelint (`.stylelintrc.json`) refuses
  `cubic-bezier(` and `ease-in`/`ease-out` literals in transitions and animations.

- `web` photos (spec 0019 plan §7): `entities/user-photo` reads `GET /me/photos` in the browser
  (`useMyPhotos`) under `userPhotoKeys.all`, which starts with `userKeys.all`, so a session's end
  drops it; `uploadPhoto` (multipart `save`, `consent` and `photo`), `setDefaultPhoto` and `deletePhoto` are
  plain requests for the feature's mutations. `PhotoThumb` shows a photo only as `next/image`'s
  `src` (`unoptimized`, no `priority`) inside an `mp-block` container, never the link in another
  attribute (A37). web's Sentry (`web/sentry.options.ts`) drops the spans, breadcrumbs and root
  span attributes (`lcp.url`) that hold `X-Amz-` or `/keep/users/`, since the browser's tracing
  names a span after each image's whole link. `features/upload-photo` shows the tips and the two
  consents before a user's first upload of the account: `usePhotoConsent` (`model/consent.ts`)
  reads `photoConsentVersion` of `useMe` (the pickers wait while it loads), the upload after the
  boxes sends `consent` (`PHOTO_CONSENT_VERSION`, the api's) and puts the version into the cached
  `/me`, and a `CONSENT_REQUIRED` (a stale tab) shows the consents again with the file waiting
  (spec 0023 Y1, Y17); spec 0019's `localStorage` keys `fitting-photo-consent:<userId>` are not
  read and are removed on sight. It refuses a file over `MAX_PHOTO_BYTES` before the upload (the
  api's limit less 64 KB of multipart, `lib/upload-error.ts`; its texts say 20 МБ) and turns the
  upload off at five saved photos. In the try-on (spec 0023 P3–P9, P25) `UploadPhoto`'s `zone`
  fills the photo frame: a file dropped on it (not JPG, PNG or WebP: «Нужно изображение JPG, PNG
  или WebP») uploads as `source: drop`, before the consents once they are given; with no photo it
  is a dashed area a click on which picks a file, «Загрузить фото» (under `COARSE_POINTER_QUERY`
  it and «Сделать фото» as two white tiles, Y21) and the save switch at its bottom; with a photo
  chosen, `replace` is
  «Заменить фото» under the frame, whose window (a `Sheet` on a phone) holds the saved photos, the
  pickers, the switch and «Перейти в «Мои фото»». «Мои фото» keeps `card` and `buttons`, the
  camera, as in the try-on, only under `COARSE_POINTER_QUERY` (Y23). `/privacy` says the photos go to OpenAI and are not used for
  training (A46). The screens follow the canvas's boards 4, 5 and 10 (A63.8): `PhotoTips` draws
  the canvas's seven example pictures as inline SVG components (`ui/pictograms.tsx`, web keeps no
  files); a refusal shows the chosen file from an object URL set on the `<img>` by an effect and
  revoked when it goes (`RefusedPreview`, `mp-block`; none for `child` or the category
  `minors`). Refusal texts (spec 0023 plan §4.5, never naming who refused): a photo's by the
  check's reason or the safety category of `moderation:<category>` (`lib/refusal.ts`), a refused
  wish or comment's by its detail's reason (`fittingErrorText`, `entities/fitting`'s
  `lib/prompt-refusal.ts`), a failed generation's by its code, `failureStage` and
  `failureCategory` (`features/start-fitting`'s `lib/failure-text.ts`); «Мои фото» is
  `SavedPhotoCard`s (`entities/user-photo`; its radio's value is a constant, since Base UI writes
  it into a hidden input) and one `UploadPhoto` kept in the list's last item for both layouts.
- An attribute value's `colorHex` is its swatch colour, `#RRGGBB` (either case) or `null` (an
  empty bordered circle); the DTOs and a CHECK in the migration refuse anything else. web draws it with
  `ColorSwatch`, and an attribute with at least one coloured value is a colour filter
  (`splitFacetAttributes`). The seed never changes existing rows, so a colour of an existing seed
  value is changed by a migration.
- `web` analytics (Mixpanel, spec 0008) go only through `@/shared/analytics`: `track` and
  `useTrackedElement` (a click, and a hover of 500 ms once per element, for an element with
  properties per set of their values, per page view; a page view
  for hovers ends on a path change, seen by `useHoverReset()`, mounted once in the consent gate). Every event,
  its properties and every tracked element are listed in `catalog.ts` (`events.ts` derives the
  types from it, spec 0015) and described in `EVENTS.md` (generated from it); anything else fails
  `typecheck`. A property marked `optional` may be left out of a send (`EVENTS.md`'s «не
  всегда»: `Fitting Refused.prompt_reason`, only with `prompt_refused`, spec 0023 Y11). Rules for
  new events and elements: `.claude/rules/analytics.md`. `track`'s optional
  third argument `{ sendNow }` sends the event at once by beacon, delivered even while the page
  unloads (only `Account Deleted`, before a full load); others go in the SDK's batches. The SDK sends its own page views and, for heatmaps, `$mp_click`-style events, from
  which `strip-attributes.ts` drops element attributes, ids, links and text; it also drops the
  search parameter `q`, the fittings' ids (`fitting`, the compare's `a` and `b`, spec 0019 A77,
  A93) and the fragment from every event's addresses (`$current_url`,
  `current_url_search`, `$referrer`, `$initial_referrer`), `mp_keyword`, and `q` from the
  profile's (the stored `$initial_referrer` in `loaded`, and `before_send_people`, which the SDK's
  types do not list); recordings keep `q`
  (backlog; spec 0014 O104). Recordings mask all
  text and inputs and block image elements and inline `url(...)` styles, but keep attributes and
  stylesheets as they are: personal data never goes into attributes (`title`, `aria-*`, `alt`,
  `href`, `data-*`) or stylesheets (the kit's `SearchField`, uncontrolled, keeps typed text and
  its starting query out of attributes, L9), a fitting photo renders only through `<img>`/`next/image`
  without `priority`/`preload`, and a container of personal data gets the class `mp-block` (not
  recorded). `mixpanel-browser` is imported only by `client.ts`,
  through `import()` (`eslint.config.mjs` fails any other import of the package or its files, except type imports), so nothing loads before consent: `startAnalytics()` loads and inits the SDK
  once per tab and opts it back in after a decline (a no-op with an empty
  `NEXT_PUBLIC_MIXPANEL_TOKEN`, which only images published from `main` have); `stopAnalytics()`
  stops sending and clears the SDK's storage, and with no SDK started in the tab removes the keys
  and IndexedDB databases an earlier one left (`client.ts` lists them; check on an SDK update). A failed SDK load leaves analytics off until the page
  reloads and is not reported to Sentry. Only `AnalyticsGate` (`features/cookie-consent`, mounted
  in `_app/providers.tsx`) calls them, following the visitor's answer in `localStorage`
  (`cookie-consent`, kept 365 days, shared by open tabs; an answer the browser will not store counts
  as a decline until the page reloads); the banner and "Настройки cookies" render only with a token.
  Sign-in (spec 0013 N13): `client.ts`'s `identify(id, { signedIn })` ties the SDK to the user's id
  only (no email or name), now or at the next start after consent, and with `signedIn` sends
  `Signed In` after it; `reset()` forgets the user. `identify` is called only by
  `useSignInAnalytics`, `reset` by it, by `useSignOuts` (`features/auth`, shared by `SignOutItems` and the burger,
  after `Signed Out`) and
  by `DeleteAccount` (`features/delete-account`, before its full load of the home page, after
  `Account Deleted` or, on a 401, without it, spec 0017 U25).
  `useSignInAnalytics` (`features/auth`, mounted once by the header's profile icon) calls `identify` on
  every page load with a session, `reset` whenever the session is `signed-out` and not `failed`, so
  every real end (a sign-out here, in another tab or browser, an expiry) forgets the user and a
  failed read does not. An identity left by another user is reset before `identify`. Its events
  and tracked elements are the catalog's zone `auth` (`Signed Out` goes before `reset`); the
  account's are the zone `account` (spec 0017 U14), the catalog page's the zone `catalog` (spec
  0014 plan §3.6, O97–O103), the fitting photos' the zone `fitting`, area `photos` (spec 0019
  plan §9, A60; `Photo Uploaded`'s and `Photo Refused`'s `source` `drop`, spec 0023 Y11), the
  picker's area `try-on` (`try-on.replace-photo`, `.my-photos`, `.favourite` by `kind`, spec 0023
  Y11), the product page's the zone `product` (areas `buy-box` and `related`, seven
  elements with the row's arrows `related.scroll`, A87.8, and `buy-box.to-look`, `related.to-look`,
  A90.9, and `gallery`, the photos' `gallery.photo` by `position`, spec 0023 Y11), the fitting room's the zone `fitting`, area `room` (`room.open`, `.remove`, `.undo`,
  `.fill`, `.clear`, `.add-to-cart-all`, A90.9, `.try-on`, T26, `.favourite`, spec 0023 P12; `.open`'s `source` `picker` and
  `result` from the look's try-on, A94; a toast's action sends its click through
  `trackElementClick`, `@/shared/analytics`), the history's and the compare page's the zone
  `fitting`, areas `history` and `compare` (`history.repeat`, `.compare`, `.compare-open`,
  `compare.open`, `.add-to-cart`, `source: history`, A93.6), the result's `result.to-look`,
  `.item-colour`, `.add-to-cart-all`, `.add-to-cart`'s `kind` and
  `.regenerate`'s `with_item` (A94; a look's item chosen, its `reasons` and `result.reason`
  gone, spec 0023 Y11) and `result.history` (the link of «Сохранено в «Мои
  примерки»», spec 0023 Y7), the grid's hanger `catalog.to-look` in the zone
  `catalog` (A90.9), the header's the zone `header` (areas `header` and
  `burger`: `header.burger`, `header.search`, `burger.category`, A87.8; `city`: `city.open` by
  `source` `header`, `burger` or `stores`, `city.pick`, `city.auto`, spec 0026 C13), the footer's
  `footer.link` in the zone `footer` (`link`: `stores`, spec 0022 X18), the stores page's the zone
  `stores` (`stores.card`, `.details`, `.phone`, `.route`, `.pin`, `.tab`, `.scope`,
  `.search-all`, `Stores Searched`, its text's length, the count and `scope`, `city` or `all`,
  X17, spec 0026 C13, and `City Located`, its `result` and `trigger`); no property names a city
  or carries a position; `profile-menu.*` take
  `surface` (`menu`, `burger`; older sends have none).
  `Signed In` is sent once, on the page a sign-in of this tab came back to: `markSignInStarted()`
  (`features/auth`) puts the time in `sessionStorage` (`sign-in-started`, not an `mp_`/`__mp` key
  the SDK clearing removes) before leaving for Google, and a flag older than 10 minutes counts as
  none (N55). `takeSignInStarted()` takes it once: `useSignInAnalytics` signed in, `LoginModal`
  signed out (a failed read too, so a sign-in whose session read fails on the way back loses its
  `Signed In`, N55), on "Back" from the browser's cache or after a failed start. A sign-in seen
  without consent is not kept: a later consent sends only the identity.
- `web` catalog (spec 0014): `/catalog` and `/catalog/<slug>` keep the filters, the sort, `q` and
  `cursor` in the address, read and written only by `_pages/catalog/model/url-state.ts` (unknown
  parameters dropped, `q` cut to 100); a filter change replaces the address and drops `cursor`.
  The first batch is prefetched on the server, the next ones load by cursor in
  `widgets/product-grid`'s virtual grid; with no JavaScript, "Дальше" opens `?cursor=`.
  Loading and the phone layout (spec 0020): a category change, the first load and Back show
  `CatalogSkeleton` (`_pages/catalog`) and `ProductGridSkeleton` (`widgets/product-grid`) at once,
  the footer kept below the window; a filter or sort change keeps the current list until the new
  one arrives, and the filter chips and both category lists keep the last counts while new ones
  load. Below 600 px the heading is a row of "←" (back when the previous entry is this site's,
  else `/catalog`; none on `/catalog` opened from elsewhere, `lib/back-target.ts`), the title and
  "N товаров"; it and a bar with the category toggle (the kit's `Sheet` «Категории»,
  `CatalogCategorySheet`, spec 0024 Z3: «Все товары» and the rows with their counts, each keeping
  the query, a choice closing it) and "Фильтры" (a dot while a filter, a sort other than the default or `q` is applied)
  stick to the window's top; the grid keeps 16 px from the sides and 8 px between the cards, and
  the breadcrumbs render under the list (both copies in the DOM, one hidden). Below 1024 px the
  filters are a bottom sheet (`widgets/catalog-filters`) of rows, each opening its filter's
  screen as a second sheet nested over the list; a screen's "Применить" keeps its choice in the
  draft, "‹", Escape and a swipe drop it, nothing reaches the address until "Показать N товаров",
  and any close of the sheet drops the draft and returns the focus to "Фильтры". Its chips and
  rows send their elements with `surface`. The grid's cards link to `/products/<id>` with
  `prefetch={false}`: one card's prefetch reads the api about 4 times on the visitor's quota
  (spec 0019 A82.1, backlog «Catalog card prefetch»).
- `web` product page (spec 0019 plan §8, `_pages/product`): the product is read once per render
  as the visitor (`getProductById`, never cached) and its category compared with the cached active
  ones (`loadProductWithSlot`; `proxy.ts` gives the real 404 first, the page a soft one when it was
  skipped, A81); «С этим товаром выбирают» is prefetched through the page cache only after that.
  The page joins `widgets/product-gallery` (the kit's `Gallery`), `widgets/product-buy-box`
  (rating, price, colour and size, `features/product-stubs`, the primary «Примерить», its own
  button, through which `ProductPurchase` opens `widgets/try-on` in place, closed when the page is
  left or hidden by Next's kept routes, spec 0023 Y22 (the window's start is
  `features/start-fitting`), signed out the second
  `LoginModal`; `features/fitting-room`'s `ToLookButton` «Добавить к образу», «В образе» while
  the product is in the room, with the colour chosen beside it, A82.2, A90.1, spec 0023 P1; from
  1024 px the buy box keeps board 1's 280 px and the gallery narrows below 1280 px, its photos
  keeping their proportions; a row too narrow for its two buttons stacks them, spec 0023 P11, Y18; `entities/fitting`'s
  `LimitMeter`, at the limit only «Закончились · снова с <date>» under the disabled «Примерить»,
  A82.5; its `TriedOnNote` from `/products/:id/fittings/last`, whose «Смотреть» opens
  `/customer/fittings?fitting=<id>`; on phones in the page's flow in the same order, nothing
  fixed, A87.2, a white panel with rounded top corners lying 16 px over the photo, A88), `ProductAbout` (`entities/product`: the description whole, every attribute, then
  «Артикул», A83) and `widgets/related-products` (`CatalogProductCard`'s `compact` variant with
  «В корзину» in one `ScrollRow` on every width: four cards in view from 1024px, three below,
  about two and a third on phones, A87.3; fewer than six shows as many, none hides the block). The
  stubs
  «Добавить в корзину», «В корзину» and «В избранное» (`CartStubButton`, `FavoriteStub`, taking
  `events`) are enabled, send their click and show the toast «В прототипе нет корзины и
  избранного» (`showStubToast`, A33). The catalog card has two corners (A63.1): the hanger
  `LookToggle` top left, only for a product whose category has a slot (`categorySlots` of the
  active categories, `@/entities/category`), live through `RoomLookToggle` (A90.1), and the
  heart stub top right (untracked, A83.10); with a mouse (`MOUSE_QUERY`) the photo grows to 1.03,
  with no shadow, and the hovered hanger gets a white outline (spec 0023 C1, C7). A visitor's hanger opens the grid's or the row's
  one `LoginModal`, opened through its `open` (no trigger).
- `web` fitting room (spec 0019 board 2, AC13, A12, A90): `entities/fitting-room` reads
  `GET /me/fitting-room` in the browser (`useFittingRoom`) under `fittingRoomKeys.all`, which
  starts with `userKeys.all`; its store (`useRoomStore`, Zustand) holds whether the drawer is open
  (`openRoom()`, also from a toast's action) and the wishes of one user in the tab's memory only
  (A90.5). `features/fitting-room`'s `useRoomActions` puts, removes and clears, answering the cache
  with the write's answer (writes that overlap or fail, a write answered while the room is being
  read and a remove over a room waiting for a read read it again instead, A97), and shows the toasts (names in quotes, A90.10; no slot's name, spec 0023 Y15): «Заменили «<прежняя>»
  на «<новая>»» and «Убрали «…» из примерочной» with «Вернуть» (a `PUT` of the item back), ««…» в
  примерочной» with «Открыть»; `useLookToggle` is the hanger's, the buy box's
  «Добавить к образу»'s and the result's tile «К образу»'s (A90.11). `widgets/fitting-room-drawer` (`FittingRoomDrawer`, mounted once in
  `app/layout.tsx` inside its `<Suspense>`, signed in only, closed by a new path or the session's
  end) is the kit's wide `Drawer`, on phones the whole window with «‹» and «…» («Очистить
  примерочную»), with no counter line: the five slots, named by `SLOT_TITLES` («Верхний слой и
  платья», «Нижний слой», «Верхняя одежда», «Обувь», «Аксессуары», spec 0023 Y5) (`OutfitSlotRow`
  with the colour `Select` of `swatch` circles, the size stub, the heart stub `room.favourite`,
  «В корзину», «Убрать»; on phones one field opening the `Sheet` «Цвет «…»» of `MiniSwatches`;
  `EmptySlotRow`, with no caption, whose «+» box, out of the tab order, and «Подобрать в
  каталоге» both lead to the slot's first active category, none for the accessory), the wishes
  (only the counter under them, Y6), the sum, «Примерить образ» (from two items;
  `openLookTryOn()` closes the drawer and opens the store's `lookOpen`, `room.try-on`),
  «Добавить образ в корзину» (the row wraps when both do not fit), `LimitMeter` and «Очистить
  примерочную». `widgets/try-on`'s `LookTryOn`, mounted
  beside the drawer and closed the same way, is `TryOn` with `look` (T26, A92): the picker with
  the room's items, its sum and «Изменить» (back to the room), started with the store's wishes;
  a look's result (`LookResult`, also from the history's `?fitting=`) lists the items in the
  slots' order with `MiniSwatches`, and another colour is `POST /fittings` with the result's
  photo, items and `promptText`, run over the result; «Что поменять?» (no reasons' chips: the
  hint of what may change, an optional comment, `POST /fittings/:id/regenerate` with no
  `reasons`, spec 0023 Y9) asks a look «Какая именно?», an optional item that goes before the
  comment. The header's `HeaderRoom`
  (`FittingRoomButton` with `CountBadge`, between «Избранное» and «Корзина», per request inside
  `<Suspense>`) opens it, or a visitor's `LoginModal`; so do the limit card's «Перейти в
  примерочную», after the try-on window closes (A90.12), and the add toast's «Открыть». The
  try-on shows the photo in one frame, `PhotoFrame` (`entities/fitting`, spec 0023 P24, Y15):
  the picker's photo, an upload, `TryOnLoader`'s wait and both results, 2:3, every image in it
  `contain` on the light grey, its size from the window only (up to 640 px high from 1024 px,
  560 px at 600–1023 px, never more than the window's height less 240 px nor less than 320 px, Y20; on a phone the whole
  width up to 60svh); «Во весь экран» opens that frame, black and whole (P29). A fitting the
  window saw running that completes (a colour or a regeneration over a result too) shows
  `FittingSuccess` (`features/start-fitting`: the result blurred in the frame, «Готово!» and
  «Сохранили в «Мои примерки»») for 1.5 s, then the result; one opened completed shows the result
  at once (P26). Both results carry `SavedNote` (`entities/fitting`, «Сохранено в «Мои
  примерки»», Y7) under the picture; the look's buttons read «Добавить образ в корзину» and
  «Добавить образ в избранное» (P31, P32).
- `web` stores page (spec 0022, `_pages/stores`): `useStores` (`entities/store`) starts from the
  page cache's `getStores`; the search (`matchStores`: every word the start of a word of the
  name, mall, city, street or a metro station, X7) runs in the browser, its text never in an
  attribute or the address. `StoreCard`'s «›» opens the description, the phones as `tel:` links
  and «Проложить маршрут» (Yandex Maps in a new tab, X8). `widgets/stores-map` loads Yandex Maps
  version 3 once per tab (`loadYmaps`: one script from `https://api-maps.yandex.ru/v3/`, reactify,
  `@yandex/ymaps3-clusterer`; 15 s, then «Карта недоступна», as with no key), draws the «la» pins
  and circles with counts, and keeps Yandex's logo, copyright and «Открыть в Картах» (X14); its
  container is `mp-block` (X26). From 1024 px the list and the map are side by side; below it the
  kit's `Tabs` «Список» and «Карта» switch them by CSS, so the map never loads again, and a pin's
  click shows its store's card over the map (X10, X19, X25). With a city chosen (spec 0026 plan
  §5) the page shows its stores (`storesOfCity`) and fits the map to them (`'stores'` with
  `singleZoom: CITY_ZOOM`), over the search a `ChipGroup` «<Город>» / «Все города» (a view only,
  the city again on each open and on any new choice) and «Изменить город» («Выбрать город»
  without one), opening the page's `CityModal` on every width; with no city or on «Все города»
  every store and the map on Moscow (X7). The page asks for the position by itself once per
  browser while no city is chosen (`useAskCityOnce`, C6); past 100 km «Рядом с вами пока нет
  магазинов» over every store. Nothing found in the city offers «Искать во всех городах». The
  list and the map follow the text 300 ms after typing (`SEARCH_APPLY_MS`, C12), an empty text at
  once; `Stores Searched` keeps its 1 s pause.
- `web` data from the api renders at request time inside `<Suspense>`: the web image must build with
  no api, Redis or database running. So a page has sent its static shell with 200 before it reads
  anything, and a `notFound()` there is a soft 404 (the not-found page with `noindex`). A real 404
  is decided in `web/proxy.ts` before routing: `/catalog/<slug>` of an unknown or inactive category
  is rewritten to a path no route matches (spec 0014 O65), and so is `/products/<id>` of an unknown
  product or one of an inactive category (`productProxy`, two reads as the visitor, spec 0019
  A81); an api failure lets the request through.
  A `<Link>` prefetch skips that check. A client component of the root layout that reads the URL
  (`usePathname`, `useSearchParams`) sits inside its own `<Suspense>`, or every route with a dynamic
  segment fails the build.
- `web` Content Security Policy (spec 0014 plan §5, O112): `web/proxy.ts` (its test
  `web/proxy.test.ts` next to it) runs on every path that may render a page (not
  `/_next/static/`, `/_next/image`, `next dev`'s HMR socket, `/api/`, `/media/`, `/socket.io/`,
  `/healthz` and everything under it; `/socket.io` without the slash gets it, since in production
  it renders web's not-found page),
  makes a nonce per request and sets the policy of
  `contentSecurityPolicy` (`@/shared/csp/server`) on the answer and on the request, where Next
  reads the nonce for the scripts it renders per request; a server component that renders a
  `<script>` takes `requestNonce()` (the JSON-LD). Scripts are `'self'`, the nonce and the hashes
  of `shell-script-hashes.json`, no `'strict-dynamic'`: the shell `cacheComponents` prerenders has
  no nonce, so its script tags load by `'self'` and React's inline one by its hash (`verify`'s
  `check:web-shells`; a new hash is added only after reading the script). `connect-src` is
  `'self'`, Mixpanel's EU origin and the origin of `sentryDsn` (`@/shared/config`); images
  `'self'`, `data:`, `blob:` and `<S3_PUBLIC_ENDPOINT's origin>/<S3_BUCKET>/keep/users/` of web's
  server env (the signed links of users' photos; `S3_ENDPOINT` in production, spec 0019; a path,
  since the storage's host serves every client's buckets), everything else only `'self'`:
  a page that loads from another origin (a connection) adds it to the policy. Styles allow
  `'unsafe-inline'` (Next, Base UI), workers `blob:` (the recorder, O45), `next dev` adds
  `'unsafe-eval'`. The stores page `/customer/stores` alone (the exact path) adds Yandex Maps'
  origins for version 3 and `'unsafe-eval'` (`yandexMaps`, spec 0022 X16; `https://yastatic.net`
  only in `style-src` and `img-src`; scripts only from `https://api-maps.yandex.ru/v3/`
  and yastatic's folder `/s3/front-maps-static/maps-front-jsapi-3/`, no subdomain, X23), so every link to it loads it in full, and its account side
  menu and «‹ Личный кабинет» load theirs in full (`AccountShell`, X24); its key
  `NEXT_PUBLIC_YANDEX_MAPS_API_KEY` (`yandexMapsApiKey`, `@/shared/config`) is public and, like
  Mixpanel's token, only in images published from `main` (X13). nginx adds its `frame-ancestors 'none'` to every answer except one whose CSP
  already says `frame-ancestors 'none'` (`$edge_csp`), so a page carries one policy.
- `web` routes (spec 0014): `/` redirects to `/catalog` (307, `redirects()` in `next.config.ts`);
  `/healthz` answers 200 without calling the api. The root layout's title template is
  `%s — Виртуальная примерка | Lamoda AI Fitting` (`siteTitle`, `@/shared/config`); a page with a
  full title of its own sets it as `absolute`. `metadataBase` comes from the server env `SITE_URL`
  and is set by the pages that render per request, never the root layout, whose metadata is built
  with the static pages (O67). SEO (spec 0014 plan §3.5, `_pages/catalog`): the catalog's
  `generateMetadata` sets the description (the category's, else a template with the unfiltered
  count, asked only on an indexed address; no price, O94), the canonical address without parameters, `noindex, follow` with a filter,
  `q` or `cursor` (a sort alone stays indexed, O92), and Open Graph and Twitter with the one static
  image of `app/catalog/opengraph-image.tsx` / `twitter-image.tsx` (named by each page, since a
  category's `openGraph` replaces the catalog's; `categoryProxy` lets these two paths through).
  Next streams the metadata into `<body>` for browsers and puts it in `<head>` for the bots of its
  default `htmlLimitedBots` (Yandex, `Chrome-Lighthouse`, link previews); widening that list makes
  every page skip its prerendered shell, so Lighthouse is run with a `Chrome-Lighthouse` user agent
  (O93). Each catalog page renders JSON-LD with the
  first batch (`CatalogJsonLd`, every `<` escaped; `jsonLdText`, `@/shared/lib`). `/sitemap.xml`
  (the catalog, the active categories, the first `CATEGORY_LIST_MAX` of them (100, backlog
  «Category list past 100»), and, of the 1000 newest products, those of these categories,
  with the api's `updatedAt`, spec 0019 A81; only the catalog when the categories fail) and `/robots.txt` (`/customer`, `/ui-kit`,
  `/healthz` disallowed, the sitemap named) render per request; `app/` re-exports both from
  `_pages/catalog`. The product page `/products/<id>` (spec 0019 plan §8, `_pages/product`) sets
  its own full title as `absolute` («<бренд> <название> — купить в Lamoda AI Fitting»), the
  description cut to 160, `metadataBase`, the canonical `/products/<id>` and Open Graph and Twitter
  with the first photo (else the cover); an unknown or inactive product gets only `noindex`. It
  renders JSON-LD `Product` and `BreadcrumbList` (`ProductJsonLd`, `jsonLdText`).
- `web` warm-up list (spec 0018 plan §4): every route of `web/app` (a page, a route handler, a
  metadata file such as `sitemap.ts` or `opengraph-image.tsx`) is in `WARMUP` or in `EXCLUDED`
  with its reason (`web/src/_app/warmup/routes.ts`); `routes.test.ts` fails on a route in neither
  (or both) and on an entry no file backs (but a `redirect` one, `/`, which must be a source of
  `redirects()` in `next.config.ts`), so a new page route is added there in the same commit.
  Warm up what a visitor reaches without signing in; exclude what reads the user's data or is not
  for visitors (the account's pages one by one, `/ui-kit`; `/customer/stores`, open to everyone,
  is warmed up, spec 0022 X4). A dynamic route names its source (`/catalog/[slug]`:
  the first 50 active categories, V16; `/products/[id]`: the newest product of each of the first
  25, read one at a time at most 5 a second, spec 0019 A81). `/healthz/warmup` (re-exported from `@/_app/server`)
  answers `{ paths, skipped }`, resolved at request time, the categories read past the page cache
  (`readActiveCategories`, V28); nginx answers 404 for `/healthz` and everything under it, so only
  the container reaches it.
- `api` AI (spec 0019): every call to OpenAI goes through `AI_PROVIDER` (`api/src/ai/`), never a
  direct `fetch`. A check inside a request (`checkPhoto`, `checkPrompt`) runs its two calls, the
  vision model `FITTING_VISION_MODEL` and the moderation endpoint, in parallel under one deadline
  of `FITTING_CHECK_TIMEOUT_MS` (A45), or of the caller's `timeoutMs` (an activity's budget). The
  text check (`checkPrompt(text, { items })`) gets the chosen items' catalog names and categories
  in the model's instructions, never the user's text there (spec 0023 Y16); it allows wishes about
  the items' fit and styling, the scene, the pose, the person's own clothes and small additions,
  and refuses other people, nudity, minors, violence, politics, and changing the person, adding
  text or changing a chosen item's cut or colour (Y12; `PROMPT_INSTRUCTIONS`), which the image
  prompt (`ai/prompts.ts`) mirrors. A
  flagged image or text answers the reason `moderation:<category>`; a malformed verdict of the
  photo check's model counts as accepted with a warning, while the text check's (incomplete, a
  refusal, no JSON) throws an `AiProviderError` of operation `check_prompt` and reason
  `unreadable_verdict` (its `max_output_tokens` 500, spec 0023 Y19); a passed deadline or a cancelled caller signal throws an
  `AiProviderError` whose `isTimeout` or `reason: 'aborted'` says which (the routes that call the
  checks, `POST /me/photos` and `POST /fittings`, answer any `AiProviderError` as 503 with
  nothing stored).
  The client makes three attempts (`retry: false` makes one, for an activity with a retry policy of
  its own) for a network error, a 429 or a 5xx, none for another 4xx, `insufficient_quota` or a
  timeout; `AiProviderError` carries the operation, reason, status, OpenAI's `error.code`, an error
  answer's `moderation_details` (the stage and the category labels, `moderation`) and request id,
  never the input or the key, and Sentry cuts requests to `api.openai.com` to method
  and origin as the bucket's. `assertServerEnv` refuses production without `OPENAI_API_KEY` or
  `OPENAI_PROXY_URL` and, everywhere, a `FITTING_CHECK_TIMEOUT_MS` above half of
  `REQUEST_TIMEOUT_MS`; the worker's `assertWorkerEnv` refuses production without the key or the
  proxy; outside production the fake provider answers whatever they say, and either one set there
  is a warning at start. Only the site reaches OpenAI; tests and CI never set the key (AC27).
  OpenAI blocks the server's region, so every request to it goes through a Squid proxy on a VPS
  abroad (A73, `deploy/ansible/openai-proxy.yml`): `OPENAI_PROXY_URL`
  (`http://<user>:<password>@<host>:<port>`, letters and digits) is parsed once into the origin
  and the `Proxy-Authorization` token, never logged or put into an error; only `OpenAiClient`
  uses it (S3, Sentry and Google go directly), with `fetch` and `ProxyAgent` from the `undici`
  package, since Node's bundled undici is another version (so the client copies the image
  model's global `FormData` into undici's, which its `fetch` would otherwise send as the text
  `[object FormData]`). A refusal of the proxy (its 407, 403 or 503 to `CONNECT`, or a connection
  closed before it answers) counts as never sent (A67). Sentry drops the breadcrumb of a `CONNECT`
  (the proxy's address) and makes no span of one.
- `api` storage (spec 0011): one private bucket. The first segment of a key is its class, since
  Timeweb's lifecycle rules match prefixes only: `media/` (the catalog media, no expiry; the
  database keeps the key without `media/`, nginx and the seed add it), `keep/users/<userId>/…`
  (users' photos and generations, no expiry; the database keeps the whole key) and `tmp/` (deleted
  after a day). Keys are built only by `storage/keys.ts`; the server names every private key, and
  a write (of a `@Closed()` route for now) of `fittingProfileImageKey`, `userImageKey` or `resultImageKey` outside the row
  owner's `keep/users/<userId>/` answers 400 `VALIDATION_FAILED` with the detail code `IN_OWNER_FOLDER`
  (`owner-check.ts`; a new user has no folder yet, so any key is refused). Responses carry
  a signed link instead (`*ImageUrl`, `S3_SIGNED_URL_TTL_SECONDS`, 15 min by default), signed only
  for a key in the owner's folder, else `null` and a warning naming the row and the field. Deleting
  a user, a fitting session, a generation or a photo writes its folders (a photo: its key) into
  the outbox `file_deletions` in the delete's transaction (`FileDeletion.enqueue`, spec 0019 A38),
  then after the commit `FileDeletion.start` starts the Temporal workflow `deleteFiles` (id
  `delete-files-<kind>-<id>`, `file-deletion-id.ts`) and marks the row started; the workflow clears
  the folders, retries a failed storage request without limit, heartbeats before each request (A39)
  and deletes the row when every folder is gone; a prefix outside `keys.ts`'s shapes
  (`isDeletablePrefix`) fails at once, and the workflow fails after all the other folders are done
  (M33), keeping the row. A failed start never fails the delete: it is logged (no Sentry), and the
  schedule `fitting-housekeeping` (workflow `housekeeping`, every 10 minutes, overlap skipped,
  kept like `delete-expired-auth-rows`) starts the rows older than a minute left unstarted, 100 per
  run, through the worker's own client with the same id (a run of at most 8 minutes), and before
  that deletes the transient photos older than an hour (A24) into the same outbox, but one a
  running generation of the last day uses or whose last generation ended within the hour (a
  regeneration from the open try-on, spec 0019 A69). The workflow `generateFitting`
  (`temporal/workflows/generate-fitting.workflow.ts`, plan §4, A68) passes its images through the
  bucket, never Temporal's history: `markProcessing`, `generate` (the one paid call, one attempt),
  `moderate` of the result, `complete` (a failure gives the try-on back, a cancelled one keeps it
  spent), then `notify` publishes
  `{ userId, generationId, kind, status }` on the counters' Redis channel `fitting-events`, which
  every api's `FittingNotifier` (`realtime/`) pushes as `fitting:finished` to the room
  `user:<userId>` its sockets join at the handshake (A71: only the workflow pushes; a lost push
  costs nothing, the waiting screen polls).
  `StorageError` carries the operation, S3 code, status and request id, never a key; Sentry keeps no
  storage paths (requests to `S3_ENDPOINT` are cut to method and origin, a failed deletion sends
  only the kind and the id). `REQUEST_TIMEOUT_MS` stays at 6000 or more: a delete may wait up to
  5 s for Temporal. `S3_ACCESS_KEY_ID` alone grants nothing (every signed link carries it),
  but it stays a GitHub secret, is not logged and `check:web-bundle` refuses it;
  `S3_SECRET_ACCESS_KEY` appears in no image, log line or bundle.
- `api` backups (spec 0012): every night at 04:00 Moscow time the job copies the database
  (`pg_dump --format=custom`, stored only after `pg_restore --list` reads it) and the app bucket's
  `media/` and `keep/` (one tar, `tmp/` skipped) into the backup bucket `BACKUP_BUCKET` as
  `daily/<UTC stamp>-<16 random hex>/database.dump.age` and `storage.tar.age`, encrypted with age
  to the owner's public key `BACKUP_AGE_RECIPIENT`. The private key is only in the owner's password
  manager: never on the server, in GitHub or the chat. Everything streams, nothing unencrypted
  touches a disk. The job reads the app bucket with `BACKUP_READ_*` (list, and read `media/*` and
  `keep/*`: a new key class needs that role widened, P26) and writes with `BACKUP_WRITE_*` (upload
  only), never the api's key. Neither can list or read the backup bucket, and log lines show
  `<suffix>` in place of the random part, so a copy is found only by listing with the owner's main
  key (P27). The bucket keeps versions; its lifecycle deletes copies after 7 days. Each nightly run
  checks in with the Sentry monitor `nightly-backup`; `--once` does not. The image's
  `postgresql-client-18` moves together with the `postgres` image (P16). Restoring, returning a
  copy to production (the site stopped, every session deleted, users deleted after the copy
  deleted again, P31) and replacing the age key: `deploy/README.md`, «Бэкапы»; running it locally: `README.md`, «Бэкап локально».
- `web` has no files of its own under `public/`, and its image copies no `public/` (it comes back
  with the first static file). Images from `/media/` skip Next's optimizer (`unoptimized`), or
  `/_next/image` would fetch them from web itself.
- Every new environment variable goes into `.env.example` with a comment.
- Migrations stay compatible with the previous release: add in one release, remove in a later one.
  A bad migration is fixed by rolling forward.

## Production and deploys

A merge into `main` is the deploy (blue-green for api and web; the Temporal worker and the nightly
backup job, `deploy/compose/backup.yml`, are replaced in place; a changed `infra.yml` service is recreated in place, with an outage, except `redis-cache`). The infrastructure has two Redis, both shared by blue and green (spec
0018 V4, V10): `redis` holds the rate-limit counters only
(`maxmemory` 64 MB, `noeviction`: once full the throttler counts in memory, spec 0006 F28;
nothing on disk, V20);
`redis-cache` (`REDIS_CACHE_URL`) is for caches only, the filter counts and web's page cache (128 MB, `allkeys-lru`, nothing on
disk; recreating it empties them and is no outage, V5); the same two run locally, `redis-cache`
with no host port. After the infrastructure is up, the deploy sets
Temporal's `default` namespace retention to 24 hours (spec 0013 N45, read back by
`ci-deploy-check.sh`). Before the new copy starts, the deploy stores an encrypted database copy in
the backup bucket's `pre-deploy/` if the release brings a migration not yet applied (spec 0012 P3;
a throwaway container of the `ai-fitting-backup` image, `deploy/compose/backup.yml`; a version from
before that image skips it, P24), runs the migrations, then the seed (the demo catalog
and its photos, a no-op once loaded), then fetches one catalog photo from the bucket and through
nginx; a failure of any stops it, the running copy keeps serving. After the new copy's readiness
it checks OpenAI from inside its api (`dist/ai/check-openai.js`: `GET /v1/models` with the key
through the proxy, spec 0019 A73); anything but a 200 stops the copy and the deploy. A rollback to
the copy that still runs, an image without the script and `SKIP_OPENAI_CHECK=1` (the variable
of the Environment `production`, the owner's way round an outage of OpenAI or the proxy, every
deploy warning while it is set; `ci-deploy-check.sh`) skip it. Then, before the switch, a rollback too, it warms the copy up from inside its web container
(`deploy/scripts/warmup.mjs`, every address of `/healthz/warmup` twice, both times logged; spec
0018 V6–V8): any status but the expected one, a 10 s answer or 120 s in all stops the copy and the
deploy, the running copy keeps serving. nginx serves `/media/<key>` from
the bucket's `media/<key>` (the bucket lets only the server's address read it, so a new address
needs the policy updated first: `deploy/README.md`, "Хранилище S3"), with a cache, a 404 or 503 in
the api's error format and nothing of the visitor's request passed on. nginx limits
requests, sockets and requests in progress per client address above the api's own quotas, web's
pages at 3× a measured catalog visit and `/media/` at 3× its rate with a burst of one batch
(spec 0014 O109–O111; plain GETs of `/_next/static/` are not counted, `/healthz` and everything
under it answer 404 from outside), slow clients to 10 s, and bodies to 1 MB (20 MB on the
photo upload's `location = /api/me/photos`, which moves with `FITTING_PHOTO_MAX_BYTES` and web's
`MAX_PHOTO_BYTES` and texts, spec 0019 A31; `ci-deploy-check.sh` sends it 2 MB and 21 MB, A57), and
answers 429, 413 and
`/api/`'s 502/504 (as 503) in the api's error format (`deploy/README.md`, "Лимиты nginx"). How deploys, rollbacks and images work: `.claude/rules/deploy.md`, loaded when you work on
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
- The Bash guard (`.claude/hooks/main-rules.mjs`) blocks data deletion, skipped hooks, force pushes,
  printing secrets and `gh` beyond its own commands, with `gh api` only reading (a path,
  `--paginate`, `--jq`) and a write starting its command so its `ask` rule applies; for recursive search use `rg`. Quoted strings and heredocs no shell reads
  are data, so a commit message may mention a blocked command. A real need for a blocked command:
  the owner runs it by hand; a false positive: fix the rule and add a case to `guards.test.mjs`.
- A gitleaks hit is a real secret until proven otherwise: unstage it. Only a value confirmed to be a
  placeholder goes into the `.gitleaks.toml` allowlist, with a description.
- One branch and pull request per phase of `tasks.md`; merged with "Rebase and merge".
  After a merge, start the next branch from a fresh `main`.
- A review bot reviews a pull request when it opens and again on every push to it, and each run
  costs tokens; a branch with no pull request costs nothing. So a pull request is opened once its
  phase is done, and an open one gets one push per round: every fix of a review, and anything else
  meant for the pull request, is committed first, then pushed together. Review fixes are not pushed
  one by one, and before a push to an open pull request ask the owner whether anything else is
  pending. The one exception: a fix for a failed check of the pull request (CI, a conflict with
  `main`) when nothing else is pending, pushed alone with the owner's OK. A round's fixes are one `fix(...)` commit, outside `tasks.md`; a pushed commit is never
  amended. The bot's reviews are handled with the `apply-review` skill.

@CONTRIBUTING.md
