# 0015 analytics events: tasks

Status: accepted (2026-10-19); amended 2026-10-19 after the check against `main`: PR 2 starts once
PR 1 is merged (R1), T2 moves 0013's entries (plan §3).
Implements [plan.md](plan.md). `👤` marks a step only the owner can do.

## How the work flows

Two pull requests (R1). PR 2 starts from a fresh `main` once PR 1 is merged; spec 0014's T20 waits
for PR 2 (0014 O35, O40). Each task is one commit, reviewed by the owner first. PR 2 carries
`Closes #70` under "Что сделано".

## PR 1 · `docs/0015-spec` · documents

- [x] **T1. Spec, clarifications, plan and tasks.** `spec.md`, `clarifications.md` (R1–R12),
      `plan.md`, `tasks.md`.
      Check: owner's acceptance of each file; `npm run format:check`.
      Commit: `docs(specs): add spec 0015 analytics events`
- 👤 merges PR 1.

## PR 2 · `feat/0015-analytics-events` · catalog, document, rules, agent

- [ ] **T2. The catalog and the derived types.** `catalog.ts`, `events.ts` derived from it,
      `useTrackedElement` sending `zone`, `type` and an element's own properties; every event and
      element of `events.ts` moved in, names unchanged (plan §1–§3); `👤` the owner's estimate of
      visits a month.
      Check: `events.test.ts` with the new `@ts-expect-error` cases (AC1, AC6); unit tests of
      `useTrackedElement` (AC2); the list of names before and after; `npm run verify`.
      Commit: `feat(web): describe analytics events in one catalog`
- [ ] **T3. The document.** `render-events-doc.ts`, `events-doc.test.ts`, `EVENTS.md`,
      `.prettierignore` (plan §4).
      Check: a changed description without `-u` fails the test (AC5); `EVENTS.md` read (AC4);
      `npm run verify`.
      Commit: `feat(web): generate the events document from the catalog`
- [ ] **T4. The limit checks.** `catalog.test.ts` (plan §5).
      Check: each rule's broken copy fails (AC7); `npm run verify`.
      Commit: `test(web): check the names and sizes of analytics events`
- [ ] **T5. The analytics agent.** `.claude/agents/analytics.md`, the agents check in
      `guards.test.mjs`, `.claude/README.md` (plan §7); tool names checked against the server.
      Check: `npm test` (AC10); `rg mixpanel .claude/agents`; after a restart, AC9 and AC11 asked of
      the agent.
      Commit: `feat(tooling): add the analytics agent`
- 👤 restarts Claude Code (agent and rule files load at start).
- [ ] **T6. The rule and the docs.** `.claude/rules/analytics.md`, `CLAUDE.md` (analytics bullet and
      its sign-in list, "Agents", `.mcp.json` line, the spec list in the header), `README.md`
      (plan §6, §8).
      Check: the rule shows for a `web/src` file (AC8); `npm run format:check`.
      Commit: `docs(tooling): add the analytics rules`
- [ ] **T7. Acceptance.** AC1–AC11 on the local stack, each with its evidence below (AC3 through
      `qa-tester` with a test token); all files get `Status: done`.
      Check: the record below.
      Commit: `docs(specs): close spec 0015`
- 👤 merges PR 2.

## Acceptance record

(filled in at T7)
