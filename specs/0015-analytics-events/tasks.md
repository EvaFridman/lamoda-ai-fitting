# 0015 analytics events: tasks

Status: done (2026-10-20): all 12 criteria pass (record below). History, not instructions.
Accepted 2026-10-19; amended 2026-10-19 after the check against `main`: PR 2 starts once
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
- [x] **T5. The analytics agent.** `.claude/agents/analytics.md`, the agents check in
      `guards.test.mjs`, `.claude/README.md` (plan §7); tool names checked against the server.
      Check: `npm test` (AC10); `rg mixpanel .claude/agents`.
      Commit: `feat(tooling): add the analytics agent`
- [x] **T6. The rule and the docs.** `.claude/rules/analytics.md` (with no user data in
      properties, even as numbers; a data question to the agent passes the Mixpanel project id,
      which the agent has no tool to find, owner at T5's review), `CLAUDE.md` (analytics bullet:
      `EVENTS.md` and the rule, the hover sentence, the sign-in list; "Agents", the spec list in
      the header; the `.mcp.json` line moved to T5), `README.md` (plan §6, §8).
      Check: `npm run format:check`.
      Commit: `docs(tooling): add the analytics rules`
- 👤 restarts Claude Code (agent and rule files load at start).
- [x] **T7. Acceptance.** AC1–AC12 on the local stack, each with its evidence below (AC3 through
      `qa-tester` with a test token; AC8, AC9 and AC11 in the restarted session); all files get
      `Status: done`; `CLAUDE.md`'s header moves 0015 among the closed specs and `README.md`'s list
      of closed specs gets it (R26).
      Check: the record below.
      Commit: `docs(specs): close spec 0015`
- 👤 merges PR 2.

## Acceptance record

Checked on 2026-10-20 on the local stack of `feat/0015-analytics-events` at `97e519b` (T6) and in
the session restarted after T6. The spec changes no server code, so it has no production part:
`zone` and `type` reach Mixpanel's production data with PR 2's deploy (AC9's query found no such
properties yet, as expected). AC3 ran with web started with a dummy `NEXT_PUBLIC_MIXPANEL_TOKEN`
(`qa-test-token-0015`, set for that command only, not in `.env`); Mixpanel refused it, and the
request bodies were read in the browser. `npm run verify` on the closing commit passed (api 3105
tests, web 1984, guards and scripts 599).

| AC   | Result | Evidence                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| ---- | ------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| AC1  | pass   | T2: `events.test.ts`, `@ts-expect-error` on an unknown event and element, a missing, extra or undeclared property, another element's properties, a value outside an enum; `npm run typecheck` in `verify`                                                                                                                                                                                                                                                                                                        |
| AC2  | pass   | T2: `catalog.test.ts` "lists exactly the known events" and "…elements with their zone and type"; the names of `main`'s `events.ts` (`Element Clicked`, `Element Hovered`, `Login Opened`, `Signed In`, `Signed Out`, `login.google`, `profile-menu.sign-out`, `profile-menu.sign-out-everywhere`, `ui-kit.button-primary`) equal the catalog's at T7; `use-tracked-element*.test.tsx` send `zone` and `type` on clicks and hovers                                                                                |
| AC3  | pass   | T7, `qa-tester` in the browser: after "Принять" on `/ui-kit`, a click on the first primary button posted `Element Clicked` with `element` `ui-kit.button-primary`, `zone` `service`, `type` `service` to `api-eu.mixpanel.com/track/`; before consent and after "Отказаться" no request went to Mixpanel                                                                                                                                                                                                         |
| AC4  | pass   | T3: `EVENTS.md` read: the budget with its parts, the block of generic events, the zones `service` and `auth` with their areas, events, elements, types, properties, descriptions and estimates                                                                                                                                                                                                                                                                                                                   |
| AC5  | pass   | T3, again at T7: one description in `catalog.ts` changed, `npm --prefix web test -- src/shared/analytics/events-doc.test.ts` failed (1 snapshot); reverted, it passed                                                                                                                                                                                                                                                                                                                                            |
| AC6  | pass   | T2: `events.test.ts` "refuses a malformed catalog", `@ts-expect-error a free-text property (AC6)` on `{ kind: 'string' }`                                                                                                                                                                                                                                                                                                                                                                                        |
| AC7  | pass   | T4: `catalog.test.ts` "analytics catalog limits": broken copies of names, an area outside its zone, an area in two zones, 6 own properties, 51 or duplicate enum values, an empty zone, estimates over 80 % each fail                                                                                                                                                                                                                                                                                            |
| AC8  | pass   | T7, restarted session: the rule's text came into the context when `specs/0015-analytics-events/tasks.md` was read, before any other file; a second fresh session, whose context at start held only the root `CLAUDE.md`, `CONTRIBUTING.md` and the memory index, got it when it read `web/src/shared/analytics/index.ts`. `/memory` (plan's check) lists no `.claude/rules/` files, so it was not the evidence. It states R10's rule (sections "The catalog", "Limits", "No user data", "The `analytics` agent") |
| AC9  | pass   | T7: the `analytics` agent, project `4073843`, "clicks per element, last 7 days": `Get-Events`, `List-Properties`, `Get-Query-Schema`, `Run-Query` (insights, `Element Clicked` by `element`, 2026-10-13 – 2026-10-20), each asking for permission: 6 clicks, `login.google` 3, `ui-kit.button-primary`, `profile-menu.sign-out`, `profile-menu.sign-out-everywhere` 1 each                                                                                                                                       |
| AC10 | pass   | T5: `guards.test.mjs` "only analytics names Mixpanel tools" and "analytics lists exactly its read tools and the aggregate Mixpanel tools" in `npm test`; `rg -il mixpanel .claude/agents` finds only `analytics.md`                                                                                                                                                                                                                                                                                              |
| AC11 | pass   | T7: the agent, asked for the events of a sample `/catalog/<category>` page (cards, sort, filters, "Показать ещё"), returned a zone `catalog` with 4 areas, 2 events (`Product Opened` `conversion`, `Catalog Sorted`) with `perVisit` and 7 elements with `clicksPerVisit` and `hoversPerVisit`, each checked against R7–R9 and R14–R16 (no user data: no product id, size or price), and 53 385 events a month against the 800 000 threshold, with questions for the owner                                      |
| AC12 | pass   | T2: `use-tracked-element.properties.test.tsx`, `hoverKey` "differs for different values and matches for the same ones" and "follows the catalog order of properties, not the object order", `useTrackedElement` "sends a hover per property values: positions 1 and 2, not 1 again" and "sends the same hover again after the path changes"; T7, `qa-tester` on `/ui-kit` (an element without properties): one `Element Hovered` per page view, one more after a path change                                     |
