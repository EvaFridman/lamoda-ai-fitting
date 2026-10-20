# 0015 analytics events: tasks

Status: accepted (2026-10-19); amended 2026-10-19 after the check against `main`: PR 2 starts once
PR 1 is merged (R1), T2 moves 0013's entries (plan §3); amended 2026-10-19 at the review of PR 1:
hovers per properties in T2 (R13), the budget test in T4 (R15), the restart after T6; amended
2026-10-20 at T2's review: `CLAUDE.md`'s catalog sentence in T2, the user-data rule in T6 (R19, R20).
Implements [plan.md](plan.md). `👤` marks a step only the owner can do.

## How the work flows

Two pull requests (R1). PR 2 starts from a fresh `main` once PR 1 is merged; spec 0014's T20 waits
for PR 2 (0014 O35, O40). Each task is one commit, reviewed by the owner first. PR 2 carries
`Closes #70` under "Что сделано".

## PR 1 · `docs/0015-spec` · documents

- [x] **T1. Spec, clarifications, plan and tasks.** `spec.md`, `clarifications.md` (R1–R16),
      `plan.md`, `tasks.md`.
      Check: owner's acceptance of each file; `npm run format:check`.
      Commit: `docs(specs): add spec 0015 analytics events`
- 👤 merges PR 1.

## PR 2 · `feat/0015-analytics-events` · catalog, document, rules, agent

- [x] **T2. The catalog and the derived types.** `catalog.ts`, `events.ts` derived from it,
      `useTrackedElement` sending `zone`, `type` and an element's own properties, hovers keyed by
      element and properties; every event and element of `events.ts` moved in, names unchanged
      (plan §1–§3); `👤` the owner's estimates of visits a month and the SDK's events per visit;
      `CLAUDE.md`'s sentence on where events are listed names `catalog.ts` (plan §6).
      Check: `events.test.ts` with the new `@ts-expect-error` cases (AC1, AC6); unit tests of
      `useTrackedElement` (AC2, AC12); the list of names before and after; `npm run verify`.
      Commit: `feat(web): describe analytics events in one catalog`
- [x] **T3. The document.** `render-events-doc.ts`, `budget.ts` with its test,
      `events-doc.test.ts`, `EVENTS.md`, `.prettierignore` (plan §4).
      Check: a changed description without `-u` fails the test (AC5); `EVENTS.md` read (AC4);
      `npm run verify`.
      Commit: `feat(web): generate the events document from the catalog`
- [x] **T4. The limit checks.** `catalog.test.ts` (plan §5).
      Check: each rule's broken copy fails (AC7); `npm run verify`.
      Commit: `test(web): check the names, sizes and budget of analytics events`
- [ ] **T5. The analytics agent.** `.claude/agents/analytics.md`, the agents check in
      `guards.test.mjs`, `.claude/README.md` (plan §7); tool names checked against the server.
      Check: `npm test` (AC10); `rg mixpanel .claude/agents`.
      Commit: `feat(tooling): add the analytics agent`
- [ ] **T6. The rule and the docs.** `.claude/rules/analytics.md` (with no user data in
      properties, even as numbers), `CLAUDE.md` (analytics bullet: `EVENTS.md` and the rule, the
      hover sentence, the sign-in list; "Agents", `.mcp.json` line, the spec list
      in the header), `README.md` (plan §6, §8).
      Check: `npm run format:check`.
      Commit: `docs(tooling): add the analytics rules`
- 👤 restarts Claude Code (agent and rule files load at start).
- [ ] **T7. Acceptance.** AC1–AC12 on the local stack, each with its evidence below (AC3 through
      `qa-tester` with a test token; AC8, AC9 and AC11 in the restarted session); all files get
      `Status: done`.
      Check: the record below.
      Commit: `docs(specs): close spec 0015`
- 👤 merges PR 2.

## Acceptance record

(filled in at T7)
