# 0021 investigator: an agent for Sentry events and the api's logs

Status: draft (2026-10-25); amended 2026-10-25 at the plan (Q6: the index's store), at the tasks
(Q15: three pull requests), at the review of PR 1 (AC3's source list, AC9's record, the
region assumption) and on 2026-10-26 at T4 (AC1's referer and length, Q16).

Issue #44. Decisions: `clarifications.md` (Q1–Q17).

## Goal

Today an error in production is investigated by hand: the owner opens Sentry, reads the api's log
over ssh, then looks for the code. An agent of this repository does the three in one call and
returns the cause with its evidence: the Sentry issue, the request id, the log lines, the place in
the code of the release that failed, and a proposed fix with a test. It finds code by meaning,
through a vector index of the repository, not only by name.

## In scope

- The agent `investigator` in `.claude/agents/`, with two modes: investigate one failure (a Sentry
  issue link, a request id or a symptom) and review what broke since a release or within a number
  of days (Q1).
- Sentry read through its hosted MCP server, both projects (web; api, the Temporal worker and the
  backup job), read-only tools only (Q2, Q12).
- The production logs of api (both copies), the worker, the backup job, web and nginx, read over
  `ssh ai-fitting` with `docker logs` in allowlisted shapes, each call confirmed by the owner
  (Q3, Q12).
- A vector index of the repository (code, specs, docs, deploy) in `tools/code-rag/`: embeddings by
  Voyage AI, stored in one SQLite file (Node's built-in SQLite with the `sqlite-vec` extension) in a
  git-ignored folder, served to the agent by an MCP server of this repository with `search_code`,
  `search_docs` and `index_status`; updated by `npm run rag:index` (Q4–Q8).
- The api's request log lines carry only four chosen headers (backlog "Request headers in the
  log", Q9), deployed before the agent reads them.
- A skill `/investigate` that refreshes the index, runs the agent and relays its report (Q14).
- Permission rules: Sentry calls ask each time, the index's tools do not, ssh asks (Q10); guard
  rules and tests for the agent's shell, its tool list and the denial of Sentry's write tools.
- Docs: `.claude/README.md`, `CLAUDE.md`, `README.md` (setting up the key, the index and the Sentry
  connection).

## Non-goals

- Writing to Sentry (resolve, assign, comment): the agent reports; the main session and the owner
  act (Q11).
- Shipping logs anywhere (Loki, Sentry Logs): logs stay in Docker's files on the server (Q3).
- Alerts, on-call, uptime monitors; running the agent after a deploy or from CI (Q14).
- The local stack's logs (Q12).
- The index in production, in images or in CI; indexing other repositories (Q5–Q7).
- Seer (Sentry's AI analysis): not among the agent's tools (Q2).

## Acceptance criteria

### The api's log

- **AC1.** A request's log line carries, of the request's headers, only `user-agent`,
  `content-type`, `content-length` and `referer`; `authorization`, `cookie`, `x-proxy-secret` and
  any other header are absent, and a `set-cookie` of the answer is redacted. The referer is logged
  without its query or fragment, and each kept value is cut to 512 characters followed by `…`
  (Q16). Checked by
  an api test and in one production log line.
- **AC2.** The backlog item "Request headers in the log" is removed by the commit of AC1.

### The index

- **AC3.** `npm run rag:index` builds the index from the tracked files the plan's §3.2 names (Q7)
  and prints how many files and chunks it embedded. Run again without a change, it embeds nothing;
  after a change to one file it embeds that file's chunks only. `.env*`, lock files, generated code
  and media are never indexed. Checked by tests with a stand-in embedder and by one run with the
  real key.
- **AC4.** `search_code` with a question in words ("where are storage paths cut out of Sentry
  events") returns `api/src/sentry.options.ts` with line numbers among its first results, and a
  query holding an exact symbol name returns that symbol's definition (hybrid search). The first is
  checked by hand with the real key and recorded in `tasks.md`, the second by a test.
- **AC5.** `index_status`, and the header of every search answer, name the commit the index was
  built on and the files changed since; an edited file shows there before the next `rag:index`.
- **AC6.** Without `VOYAGE_API_KEY` the index command and the MCP server answer a clear message and
  make no network request; `npm run verify` passes without the key and without network.

### Permissions and guards

- **AC7.** The agent's `tools:` are exactly the list `plan.md` gives; `.claude/settings.json`
  denies every Sentry write tool and the dispatcher tools by name and allows only the three tools
  of the index's server; no other agent names a Sentry or index tool. `npm test` fails otherwise.
- **AC8.** The agent's shell guard lets the allowed shapes through (`docker logs` of a named
  production container with its time and tail flags, the deploy state, the compose projects'
  list, each optionally filtered by `rg` or `grep`) and blocks everything else: another host, another docker
  command, an unknown container, a pipe to anything else, any write. Each has a case in
  `guards.test.mjs`.

### Production

- **AC9.** Given the link of a real Sentry issue, `/investigate` returns a report naming the issue,
  the request id(s), the log lines of the copy that served them, the place in the code of that
  release (`path:line`), the cause, a proposed fix and a test. The report holds no personal data
  (no email, name, token, cookie or signed link; the owner reads it). Recorded in `tasks.md` after
  the owner's reading, its request urls without their query: the repository is public.
- **AC10.** `/investigate since <release tag>` lists the unresolved issues of both Sentry projects
  first seen since that release, grouped by cause, most important first.
- **AC11.** In those runs every Sentry call and every ssh asked for permission; the index's calls
  did not.

### Hygiene

- **AC12.** `.rag/` is git-ignored and excluded from the images; `VOYAGE_API_KEY` appears in no
  image, log line or browser bundle (`check:web-bundle` refuses it) and compose passes it to no
  container.

## Owner actions (Claude cannot do them)

- A Voyage AI account and an API key, put into the local `.env` as `VOYAGE_API_KEY` (Q5).
- The first connection to Sentry's MCP server (OAuth in the browser) and the organization's slug
  for `.mcp.json` (Q2).
- Confirming each ssh call and each Sentry call while the agent runs (Q10).
- Choosing a real Sentry issue for AC9 and reading the report for personal data; running
  `/investigate since` for AC10.
- Merging and deploying PR 2 (the log headers) before PR 3's production run, so the logs the agent
  reads carry only four headers (Q9, Q15).

## Assumptions

- Sentry's hosted MCP server serves the owner's organization, which is in Sentry's US region
  (`sentry.io`); should the connection still fail, the local `@sentry/mcp-server` with a user token
  takes its place, the agent's tools unchanged.
- The hosted server's tool names are those of its catalog on 2026-10-25; the task that connects it
  checks them again, as spec 0015 did for Mixpanel's.
- Voyage AI's free allowance (200 M tokens per account on its pricing page) covers the
  repository's index (about 2 M tokens) many times over.
- Node 26 runs the tool's TypeScript sources directly (type stripping); the plan names the
  fallback.
- The repository is public, so sending its tracked files to an embeddings API discloses nothing;
  `.env*` and other untracked files never leave the machine.
