# 0015 analytics events

Status: accepted (2026-10-19); amended 2026-10-19 after the check against `main` (0013 closed, 0014
waits for the catalog): zones own areas (R4), elements may carry properties (R5), phrasal verbs in
event names (R8).

Issue #70. Decisions: `clarifications.md` (R1–R12).

## Goal

Every analytics event and tracked element of web is described in one place, by product zone, with
what it means, how often it is sent and what it carries; that description is the code the events
are typed from, so it cannot drift. Claude follows written rules and limits when adding events, and
an analytics agent helps design them and read what Mixpanel collected.

## In scope

- A catalog of events, their properties and tracked elements in `shared/analytics`, grouped by zone,
  each zone with its areas, each entry with a type, a Russian description and a frequency estimate
  (R3, R4, R9); the types of `track` and `useTrackedElement` come from it.
- `Element Clicked` and `Element Hovered` also send the element's `zone` and `type`, and the
  element's own properties if it declares any (R5).
- The document `EVENTS.md`, generated from the catalog, in Russian (R6).
- Checks of the limits: names, property types, sizes (R7–R9).
- Moving every event and element in `events.ts` (0008's and 0013's) into the catalog without
  renaming (R2); a format that admits spec 0014's planned entries.
- The rule file `.claude/rules/analytics.md` and the changed analytics bullet in `CLAUDE.md` (R10).
- The analytics agent with read-only, aggregate Mixpanel tools (R11, R12) and its description in
  `.claude/README.md`.

## Non-goals

- New events or tracked elements of pages: their own specs add them, following R10 (spec 0014's
  catalog entries come with its T20).
- Events from the api or the Temporal worker (0008 J7).
- Writing to Mixpanel: Lexicon descriptions, dashboards, metrics, cohorts.
- The agent as a step of `finish-task` or a check after deploys (R11).
- A change to consent, recordings, heatmaps, the sign-in identity or what the SDK sends by itself
  (0008, 0013).
- Feature flags and experiments.
- The backlog items "Full CSP for web" and "Signed links in reports": they touch Mixpanel but
  belong to the page specs (0014, the fitting specs).

## Acceptance criteria

### Catalog and types

- **AC1.** Sending an event or using a tracked element that the catalog does not list, with a
  property it does not declare, or without a property an element declares, fails
  `npm run typecheck`.
- **AC2.** Every event and element in `events.ts` before the change is in the catalog under a zone,
  an area and a type with its name unchanged, and the site sends the same events as before, plus
  `zone` and `type` on clicks and hovers.
- **AC3.** A click on the tracked `/ui-kit` button sends `Element Clicked` with `element`, `zone` and
  `type` (with consent, a token set).

### Document

- **AC4.** `EVENTS.md` lists every zone as a block with its areas, events and elements, their types,
  properties, descriptions and frequency estimates.
- **AC5.** Changing the catalog without regenerating `EVENTS.md` fails `npm run verify`.

### Limits

- **AC6.** A catalog property declared as a free string does not compile.
- **AC7.** An event, property or element name off the patterns of R8, an element whose prefix is not
  an area of its zone, an event or element with more than 5 properties of its own or an enum with
  more than 50 values fails `npm test`.

### Rules and agent

- **AC8.** `.claude/rules/analytics.md` is loaded when a file under `web/src/` or `specs/` is
  read, and states the rule of R10.
- **AC9.** The analytics agent answers an aggregate question (e.g. clicks per element over 7 days)
  through Mixpanel, each call asking for permission.
- **AC10.** The analytics agent is the only agent in `.claude/agents/` with Mixpanel tools, and has
  exactly those of R12; `npm test` fails otherwise.
- **AC11.** Asked to design the events of a described page, the agent returns entries with zone,
  area, type, properties and frequency that pass R7–R9, and the estimated monthly volume against
  the 80 % threshold.

## Owner actions (Claude cannot do them)

- Restart Claude Code after the agent and the rule file are added.
- Set the expected number of visits a month the budget estimate uses (plan).

## Assumptions

- The Mixpanel MCP server keeps the tool names of R12; the plan checks them again at the agent's
  task.
- The project stays on the free plan (1 M events a month).
