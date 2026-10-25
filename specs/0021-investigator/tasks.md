# 0021 investigator: tasks

Status: draft (2026-10-25); amended 2026-10-25 at the tasks (three pull requests, Q15) and at the
review of PR 1 (T12's record).

Implements [plan.md](plan.md). 👤 marks a step only the owner can do.

## How the work flows

- Three pull requests (Q15): PR 1 the documents only (the review bot's documents mode); PR 2 the
  one api change that must be deployed before the agent reads logs (Q9); PR 3 everything else, its
  production run made from the branch, and the closing. Each is merged with "Rebase and merge"
  once CI is green; each next branch starts from the `main` that holds the previous one.
- Each task: brief from `spec-finder`, a time estimate, the code, `finish-task`, the owner's OK,
  one commit that ticks its box. A fresh session (or `/clear`) per task.
- `security-reviewer` joins every task that touches `.claude/`, `.mcp.json`, env, the guard
  hooks, the api's logging or CI; `code-reviewer` every task. No `qa-tester` for the tool and the
  agent (nothing runs in the local stack); T4 gets it for the api's log line.
- T4 removes the backlog item "Request headers in the log" in its commit (AC2) and brings
  `CLAUDE.md` in line.
- PR 3 is opened once T13 is done (CLAUDE.md, "Git": one push per review round). Its description
  carries `Closes #44` under "Что сделано".

## PR 1 · `docs/0021-investigator` · documents

- [x] **T1. Spec and clarifications.** `spec.md`, `clarifications.md` (Q1–Q14).
      Check: owner's acceptance of `spec.md`.
      Commit: `docs(specs): add the investigator spec and its decisions`
- [x] **T2. Plan.** `plan.md`; Q6 amended at the plan (SQLite instead of LanceDB).
      Check: owner's acceptance of `plan.md`.
      Commit: `docs(specs): add the investigator plan`
- [x] **T3. Tasks.** This file; Q15 (three pull requests) added to the decisions, the plan's §1
      and the spec's owner actions.
      Check: owner's acceptance of `tasks.md`.
      Commit: `docs(specs): add the tasks of spec 0021`
- 👤 merges PR 1.

## PR 2 · `fix/0021-log-headers` · the api's log headers

- [x] **T4. The api's log headers.** `serializeRequest` in `core.module.ts` (plan §2),
      `withoutQuery` wrapping it in `mount-auth.ts`, the tests of both, `CLAUDE.md`'s "Logging"
      bullet, the backlog item removed (AC2).
      Check: `core.module.spec.ts` and `mount-auth.spec.ts` (AC1); `qa-tester` reads one request
      line of the local api's log and finds exactly the four headers; `npm run verify`.
      Commit: `fix(api): log only four request headers`
- 👤 merges PR 2. After its deploy: one request line of the api container's last 20 log lines on
  the server carries only the four headers (AC1's production check), noted in the acceptance
  record.

## PR 3 · `feat/0021-investigator` · the index, the servers, the agent, the skill

- [x] **T5. The package, file selection and chunking.** `tools/code-rag/` with `package.json`,
      `tsconfig.json`, `files.ts`, `chunk.ts` and their tests (plan §3.1–3.3); the root scripts
      (`rag:index`, `typecheck`, the `node --test` line), `eslint.config.mjs`'s Node block, CI's
      `npm ci` for the package, `.gitignore`'s `.rag/`.
      Check: `files.test.ts` and `chunk.test.ts`; `npm ci` in the package prints no blocked
      script; `npm run verify`.
      Commit: `feat(tooling): add the code index package with file selection and chunking`
- [ ] **T6. Embeddings, the store and `rag:index`.** `embed.ts` (Voyage through `fetch`,
      `FakeEmbedder`, `voyageKey()`), `store.ts` (`node:sqlite` + `sqlite-vec`, hybrid search),
      `cli.ts` (`index`, `--full`, `--dry-run`) and their tests (plan §3.4–3.6); `VOYAGE_API_KEY`
      in `.env.example` and in `check-web-bundle.mjs`'s list.
      Check: `embed.test.ts`, `store.test.ts` (AC3, AC4's symbol search); a dry run of the index
      command lists no excluded path; 👤 the first real `npm run rag:index` with the key, its
      summary (files, chunks, tokens, time) and a second run that embeds nothing, in the
      acceptance record (AC3); `npm run verify` with no key in the environment (AC6).
      Commit: `feat(tooling): index the repository with voyage embeddings in sqlite`
- [ ] **T7. The index's MCP server.** `server.ts` with `search_code`, `search_docs`,
      `index_status` and its tests (plan §3.7–3.8); `code-rag` in `.mcp.json`; its three tools in
      `settings.json`'s `allow` and the guards test that `allow` holds nothing else; `README.md`'s
      section on the key and the index.
      Check: `server.test.ts` (AC5, AC6); after a restart of Claude Code, `search_code` from the
      main session answers "where are storage paths cut out of Sentry events" with
      `api/src/sentry.options.ts` among the first results, recorded (AC4); an edit to a file shows
      in the status line (AC5); `npm run verify`.
      Commit: `feat(tooling): serve the code index to agents over mcp`
- [ ] **T8. Sentry's MCP server.** `sentry` in `.mcp.json` (plan §4); 👤 the OAuth connection
      and the organization's slug; the live tool list read and compared with the plan's names
      (`clarifications.md` records a difference, or the switch to the local server should the
      connection fail, plan §4); the `deny` list in `settings.json`; the guards tests
      for the deny names and that no agent but `investigator` names Sentry (AC7's Sentry part,
      with the agent file's check added in T10).
      Check: the guards tests; a `get_issue_details` call from the main session asks for
      permission and answers; `npm run verify`.
      Commit: `feat(tooling): connect sentry's mcp server read-only`
- [ ] **T9. The agent's shell guard.** `investigator-rules.mjs`, `splitPipeline` in
      `guard-lib.mjs`, the registration in `guard.mjs`, the cases of plan §6 in
      `guards.test.mjs` (AC8); `.claude/README.md`'s hooks section.
      Check: `node --test .claude/hooks/guards.test.mjs`; `npm run verify`.
      Commit: `feat(tooling): add the investigator agent's shell guard`
- [ ] **T10. The agent.** `.claude/agents/investigator.md` (plan §5); the guards test that its
      `tools:` are exactly the plan's list (AC7); `.claude/README.md` (the agents' table, the
      servers' section, the decisions, the risks) and `CLAUDE.md` (agents, commands, structure).
      Check: the guards tests; after a restart, the agent called by hand on a Sentry issue link
      reads the issue, the logs and the index and returns the report's six parts (a dry run of
      AC9, not yet recorded); `npm run verify`.
      Commit: `feat(tooling): add the investigator agent`
- [ ] **T11. The skill `/investigate`.** `.claude/skills/investigate/SKILL.md` (plan §7);
      `README.md`'s section «Расследование ошибок прода»; `CLAUDE.md`'s mention.
      Check: `/investigate` with a link refreshes the index, runs the agent and relays the report;
      `npm run verify`.
      Commit: `feat(tooling): add the investigate skill`
- [ ] **T12. 👤 Production run.** `/investigate <a real Sentry issue link>` (AC9) and
      `/investigate since <the live release's tag>` (AC10); the permission prompts seen (AC11).
      The owner reads the report for personal data. The reports go into the acceptance record
      only after that reading, with every request url cut at `?` (the repository is public:
      request ids and `path:line` may stay, nothing a visitor typed may), the prompts seen with
      them; a bug found in the tool or the agent is fixed in a task added here with the owner.
      Check: AC9–AC11 recorded.
      Commit: `docs(specs): record the production run of spec 0021`
- [ ] **T13. Closing.** `Status: done` in the four files, the acceptance record completed
      (AC1–AC12), `CLAUDE.md`'s header line, `.claude/README.md` and `README.md` read against
      what was built.
      Check: `npm run verify`; the record names evidence for every criterion.
      Commit: `docs(specs): close spec 0021`
- 👤 opens PR 3 (`Closes #44`), merges it after the review.

## Acceptance record

Filled at T13.

| AC   | Result | Evidence                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| ---- | ------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| AC1  | pass   | Tests: `core.module.spec.ts`, `mount-auth.spec.ts` (T4). Production, 2026-10-26, after PR 2's deploy (#111, `ae05815`): the last request line of the active api copy, a signed-in `GET /fittings?limit=20` (200), carried of its headers only `user-agent` and `referer`, the referer without query (`https://lamoda-ai-fitting.ru/customer/fittings`); no `cookie`, `authorization`, `x-proxy-secret` or `x-forwarded-for`; `req.id` equal to the answer's `x-request-id`. |
| AC2  |        |                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| AC3  |        |                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| AC4  |        |                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| AC5  |        |                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| AC6  |        |                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| AC7  |        |                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| AC8  |        |                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| AC9  |        |                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| AC10 |        |                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| AC11 |        |                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| AC12 |        |                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
