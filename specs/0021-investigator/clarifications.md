# 0021 investigator: clarifications

Status: draft (2026-10-25); amended 2026-10-25 at the plan (Q6: SQLite instead of LanceDB), at
the tasks (Q15: three pull requests), at the review of PR 1 (Q2: the US region; Q7: the plan's
§3.2 holds the exact rules) and on 2026-10-26 at T4 (Q16, Q17), at T6 (Q18, Q19) and at T7
(Q20).

The owner's decisions for this spec. Ids `Q1`, `Q2`, … are referred to by the spec, the plan and
code comments. All decisions below: owner, 2026-10-25, while the spec was written, except where a
decision names a later step.

## Scope

**Q1. Two modes: investigate and review.** The agent investigates one failure from a Sentry issue
link, a request id or a symptom (the events, the log lines with that request id, the code of the
release, a cause and a proposed fix), and reviews what broke since a release or within a number of
days: the unresolved issues of both Sentry projects, grouped by cause, most important first. The
owner weighed investigation only (smaller) and a digest only (no root cause).

**Q11. The agent only reports.** Its report: the cause, the evidence (the issue, the request id,
`path:line`, log lines with no personal data), the impact, a proposed fix and a test. It writes
nothing to Sentry (no resolve, assign or comment) and nothing to GitHub: the main session fixes
the code and opens issues with the owner's OK, as for every other agent of this repository. The
owner weighed Sentry write tools for triage: handy, but against the rule that agents read.

**Q12. Sources.** Both Sentry projects (`lamoda-ai-fitting` for web's server and browser,
`lamoda-ai-fitting-api` for the api, the worker and the backup job, its cron monitor included);
the production logs of api of both copies (blue and green), the worker, the backup job, web and
nginx (its access log carries `request_id=`), and `/opt/ai-fitting/.deploy-state` for the active
colour and tag. The local stack's logs are out of scope.

**Q13. The session's model.** The agent declares no `model:`, as `code-reviewer` and `analytics`:
finding a cause across a stack trace, log lines and code is the most demanding task an agent here
has. `sonnet` was weighed as cheaper.

**Q14. Started by hand or by `/investigate`.** The owner names a link, an id or a symptom, or runs
the skill `/investigate`, which refreshes the index, runs the agent and relays its report. It is
not a step of `finish-task`, does not run after deploys and never runs from CI. "Also after every
deploy, by hand" was weighed and left for later.

**Q15. Three pull requests, the first documents only.** The owner asked for as few pull requests
as possible, and for the first one to hold only the spec's documents: the review bot checks a
documents-only pull request in a mode of its own. The log headers (Q9) must be deployed before the
agent's production run, so they cannot share a pull request with the agent either. Hence three:
the documents, the api's log headers, everything else (the plan's §1). Weighed: two pull requests
with the headers in the first (mixes code into the documents' review) or in the second (the run
would read logs that still carry every header, against Q9).

## Sentry

**Q2. Sentry's hosted MCP server, read-only tools by name.** `.mcp.json` declares Sentry's hosted
server (`https://mcp.sentry.dev/mcp/<org>`, OAuth), as it declares Mixpanel's; Claude Code keeps
the token outside the repository. The agent lists its Sentry tools by name, reads only, and gets
no Seer tool. Weighed: the local `@sentry/mcp-server` over stdio with a user token in the owner's
environment (its stdio transport is marked work in progress; the token would sit on the
development machine), and Sentry's REST API through `curl` with a new guard rule set. The
organization is in Sentry's US region (`sentry.io`, owner, at the review of PR 1), which the
hosted server serves; the local server stays only as the fallback of the plan's §4 should the
connection fail for another reason.

**Q10. Permissions.** Every Sentry call asks for permission, as Mixpanel's do: the text of events
and issues is written by the outside world, and "don't ask again" is never answered for a remote
server (`.claude/README.md`). The index's own server reads only this repository, so its three tools
go into `allow` and never ask. `ssh` asks always (the existing `ask` rule). Weighed: `allow` for
Sentry's read tools too (faster, against the README's rule), and asking for the index's tools too
(an investigation makes ten to twenty searches).

## Logs

**Q3. Production logs over `ssh ai-fitting 'docker logs …'`, read-only.** The logs stay where they
are (Docker's `json-file`, 3 × 10 MB per container, no shipper). The agent runs allowlisted shapes
of `ssh ai-fitting` (`docker logs` of a named container with time and tail flags, the deploy state,
the compose projects' list), optionally filtered locally by `rg` or `grep`, and each call asks for the
owner's confirmation. Weighed: Sentry Logs through the pino integration (no ssh, but logs would
leave the server and spend the Sentry quota, and the headers would have to be cut first); the owner
pasting logs by hand; a log shipper (Loki) as a new service.

**Q9. The headers' backlog item joins this spec.** Before the agent reads logs, the api logs only
`user-agent`, `content-type`, `content-length` and `referer` of a request's headers through
pino-http's `req` serializer, the redaction of secrets kept for what stays (backlog "Request
headers in the log"). The agent's report never quotes an email, a name, a token, a cookie or a
signed storage link; an opaque user id is allowed, as it already reaches Sentry (0011 M32). Weighed:
leaving the log as it is and relying on the agent's text alone (the headers would still enter the
model's context).

**Q16. The kept headers' values are trimmed (owner, at T4's security review).** The referer is
the browser's page address (`strict-origin-when-cross-origin` sends it whole within the site), so
it carries the page's query (`/catalog?q=…`, a failed sign-in's `?error=…`) and could one day
carry a token: it is logged without its query and fragment, as Sentry and `/api/auth`'s line
already cut theirs. Every kept value is cut to 512 characters with `…`, since the backlog item
also counted a header's size (Node allows 16 KB). The query of the request to the api itself
stays on the line: filters and the cursor matter to an investigation, and the agent's report never
quotes it. Weighed: removing `q` too, cutting every query, leaving both as they were.

**Q17. nginx's log only through a filter (owner, at T4's security review).** nginx's access log
holds the whole request line with its query (the Google callback's `code` and `state`, the search
text), the visitor's address and the referer with its query. Its format stays; the agent's guard
lets `docker logs` of `ai-fitting-infra-nginx-1` through only piped into `rg -F` or `grep -F` with
a request id, so the agent sees that request's lines and not thousands of others. nginx's error
log goes to the container's stderr, which a pipe does not see and whose upstream errors quote the
same request line and address, so for nginx the remote command ends in exactly `2>&1` and both
streams pass the filter; no other redirection is allowed (owner, at T4's review). Weighed: a new
`log_format` without queries (cleaner, but a change to production's nginx in this spec) and no
nginx log at all (the 502s and 504s that never reach the api would be lost).

## The index (RAG)

**Q4. A real vector index, served by an MCP server of this repository.** The owner asked for
embeddings and a vector database, not only for Grep: a semantic search ("where are storage paths
cut out of Sentry events", "why is a 503 reported once a minute") over the code and over the
specs' decisions. The agent keeps Grep, Glob and Read next to it. Weighed: Grep and `git show`
only (what Claude Code already does), and a generated repository map plus Grep.

**Q5. Voyage AI, model `voyage-code-4`.** Voyage's code model; its pricing page gives every account
200 M free tokens, and the repository's full index is about 2 M, so indexing stays free.
`VOYAGE_API_KEY` lives only in the local `.env` (the file Claude cannot read): not in the
repository, not in `.env` values compose passes to containers, not in images or CI. The repository
is public, so its tracked files going to the API disclose nothing. Weighed: a local model through
`@huggingface/transformers` (no key and offline, but a native ONNX dependency, minutes of CPU per
full index and lower quality) and OpenAI's `text-embedding-3-small` (a general model, paid).

**Q6. One SQLite file: Node's built-in SQLite with the `sqlite-vec` extension.** The index is
`.rag/index.sqlite`, git-ignored: Node 26's `node:sqlite` (SQLite 3.53 with FTS5, extension
loading allowed; checked on this machine) opens it and loads `sqlite-vec` 0.1.9, whose npm package
ships the extension as 160 KB platform packages with no install script. Vectors live in a `vec0`
table, the words in an FTS5 table, and a search merges both rankings (reciprocal rank fusion):
hybrid search matters for code, where an exact symbol name is as common a query as a question. No
server, no Docker, no native npm build, about 1 MB of dependencies. First chosen and then dropped
at the plan: LanceDB (`@lancedb/lancedb`), whose platform binary is 254 MB, which needs
`apache-arrow` as a peer and pulls `@huggingface/transformers` (38 MB), `onnxruntime-node` and
`sharp` as optional dependencies, each with an install script npm 12 blocks, so they would sit as
dead weight on the machine and in CI. Also weighed: `better-sqlite3` with `sqlite-vec` (an install
script to approve), pgvector in the development PostgreSQL (a changed image, and no search without
the stack running) and a Qdrant container (a server for 8 thousand vectors). Risks accepted:
`node:sqlite` is a release candidate in Node 26 (the pinned version) and `sqlite-vec` is 0.1.x; the
index stores its schema version and is rebuilt on a mismatch.

**Q7. What is indexed.** Tracked files (`git ls-files`) of: `api/` (`src`, `prisma`, `test`),
`web/` (`src`, `app`), `specs/`, `CLAUDE.md`, `README.md` and the packages' READMEs,
`CONTRIBUTING.md`, `.claude/rules/`, `deploy/`, `.github/`, `scripts/`, every Dockerfile, the
compose files and nginx's templates. Never: `.env*`, lock files, generated code
(`api/src/generated`, `api/openapi.json`, `api/validation-codes.json`, `EVENTS.md`), media and
`api/seed-media/`, and the third-party skills under `.claude/skills/`. Tests are indexed: they
state expected behavior. Specs carry whether they are binding or history. The exact rules are the
plan's §3.2, the source of truth for `files.ts` (owner, at the review of PR 1): it adds the api's
scripts, web's root files (`next.config.ts`, `proxy.ts`, the instrumentation files,
`sentry.options.ts`) and `.env.example` (variable names and comments, no values), reads only a
whitelist of extensions and skips files over 512 KB.

**Q8. Updated on demand, with a freshness check.** `npm run rag:index` re-embeds only the files
whose git blob changed; the skill runs it before the agent, and the index's server names in every
answer the commit the index was built on and the files changed since. Weighed: a git hook after
each commit (every commit waits for the network and fails without the key) and the server indexing
on demand inside a search (slow after a large rebase, a network call from a search tool).

**Q18. Voyage's free tier's rate (owner, at T6).** An account without a payment method gets 3
requests and 10 K tokens a minute (seen on T6's first run: every 100 K-token batch answered 429),
so the embedder keeps to them instead of the plan's §3.4 batches: about 5 K estimated tokens a
request and, after each, a pause of at least 20 s and as long as the tokens Voyage counted
(`usage.total_tokens`) take at 9 K a minute; a 429 or 5xx is retried after 20, 40, 60 and 60 s,
but a batch of several texts refused twice with 429 is split in halves. The estimate (characters ÷
3.5) falls far short of Voyage's count for dense text: on the first run a batch of SVG paths
(`icons.tsx`) estimated at 4.4 K was refused at 8 K and again at 5 K, and no estimate fits every
kind of text, while one chunk (6000 characters at most) always fits.
The repository's first index (about 2.6 M tokens) then takes about five hours, and a run stopped
on the way keeps the files embedded so far. Weighed: adding a payment method (the 200 M free tokens
stay free, the run takes minutes).

**Q19. Only committed files are indexed (owner, at T6's security review).** The index reads the
files of `HEAD` (`git ls-tree`), the commit it records as `indexedCommit`, not the staged ones of
`git ls-files`: a staged change has not passed gitleaks (the pre-commit hook), and the secret guard
(plan §3.2) cannot catch every token, so only what is about to be public goes to Voyage. An
uncommitted change is not in the index; the server names such files as stale (`git status`, plan
§3.7). Weighed: the staged files (the index sees the work in progress, but a staged token may be
sent before gitleaks sees it).

**Q20. The server refuses a query that looks like data (owner, at T7's security review).** A
search's query goes to Voyage under `allow`, with no question asked, so the rule of plan §5 (code
terms and the symptom in the agent's own words, never a quote) gets a check in the server too:
a query that looks like a secret (`findSecretLine`), or holds an email, a uuid, a run of 10 or
more digits, `X-Amz-` or `/keep/users/` is answered as a tool error and nothing is sent. It is a
net for a pasted log line, not a filter of every personal datum. Weighed: the rule and the tools'
description alone (no false refusals, but a pasted line leaves the machine unseen).
