# 0015 analytics events: plan

Status: accepted (2026-10-19); amended 2026-10-19 after the check against `main`: zone areas
(§1, §5), element properties (§1, §2), the existing entries of 0013 (§3), 0014's entries (§1, §3),
the sign-in text of `CLAUDE.md` (§6).

Implements [spec.md](spec.md); decisions in [clarifications.md](clarifications.md) (R1–R12). No new
dependency.

## 1. Catalog: `shared/analytics/catalog.ts` (R3, R4, R5, R7, R9)

One `as const satisfies Catalog` object, no imports (so a test and the document renderer read it as
plain data):

```ts
export const catalog = {
  visitsPerMonth: 3_000, // placeholder: the owner's estimate for the budget, set in T2
  zones: {
    service: { title: 'Служебное', areas: ['ui-kit', 'cookie'], description: '…' },
    auth: { title: 'Вход и профиль', areas: ['login', 'profile-menu'], description: '…' },
    // header, catalog, product, fitting: added by the specs of those pages
  },
  events: {
    'Element Clicked': {
      zone: 'service',
      type: 'interaction',
      description: 'Клик по отслеживаемому элементу.',
      perVisit: 3,
      properties: { element: { kind: 'element' } },
    },
    'Signed In': {
      zone: 'auth',
      type: 'conversion',
      description: '…',
      perVisit: 0.05,
      properties: {},
    },
  },
  elements: {
    'ui-kit.button-primary': { zone: 'service', type: 'interaction', description: '…' },
    // a 0014 entry, for the format: 'catalog.card': { zone: 'catalog', type: 'navigation',
    //   description: '…', properties: { position: { kind: 'number' } } },
  },
} as const satisfies Catalog;
```

- `Catalog` (same file): `type` is `'navigation' | 'interaction' | 'conversion' | 'service'`; a
  property is `{ kind: 'enum'; values: readonly string[] } | { kind: 'number' } | { kind: 'boolean' }
| { kind: 'element' }`. No `string` kind exists, so a free-text property does not compile (AC6).
  Every entry needs `description`; an event needs `perVisit` (average sends per visit); an
  element's `properties` are optional.
- The zone of an element and of an event must be a key of `zones` (a mapped type over
  `keyof typeof catalog.zones` through a helper `defineCatalog`, if `satisfies` alone cannot check
  it; decided in T2 by what compiles). The prefix-in-areas rule is a test (§5), not a type.
- An enum's values are written out in the catalog (no imports). 0014's `Catalog Sorted` lists the
  values of `PRODUCT_SORTS`; 0014's T20 adds a test that the two lists are equal.

## 2. Derived types: `events.ts` (R3, R5)

- `TrackedElement = keyof typeof catalog.elements`.
- `AnalyticsEvents`: for each event, its properties mapped by kind (`enum` → the union of its
  values, `number`, `boolean`, `element` → `TrackedElement`). `Element Clicked` / `Element Hovered`
  carry `element`, its `zone` and `type`, and the element's own properties.
- `track`'s signature stays (`client.ts`). `useTrackedElement(element)` looks up the element's zone
  and type and sends them; for an element with properties its signature becomes
  `useTrackedElement(element, properties)`, the second argument required by type and absent for an
  element without them, so the existing callers do not change.
- The `@ts-expect-error` cases of `events.test.ts` stay and gain: an undeclared property, a value
  outside an enum, a missing element property (AC1).

## 3. Migration (R2, AC2)

T2 moves into the catalog, names unchanged, each with zone, type, description and estimate:

| Entry                                                       | Zone / area           | Type        | Note                                                       |
| ----------------------------------------------------------- | --------------------- | ----------- | ---------------------------------------------------------- |
| `Element Clicked`, `Element Hovered`                        | service               | interaction | generic (R5)                                               |
| `Login Opened`                                              | auth                  | interaction | the visitor's own opening only (0013 N56)                  |
| `Signed In`                                                 | auth                  | conversion  | once, on the page a sign-in of this tab came back to (N55) |
| `Signed Out`                                                | auth                  | conversion  | after either sign-out succeeds (N55)                       |
| `ui-kit.button-primary`                                     | service / `ui-kit`    | service     | the check element of 0008                                  |
| `login.google`                                              | auth / `login`        | conversion  | "Войти через Google"                                       |
| `profile-menu.sign-out`, `profile-menu.sign-out-everywhere` | auth / `profile-menu` | interaction | the two sign-outs                                          |

Spec 0014 has no entries in `events.ts`; its T20 adds them to the catalog with zone `catalog`
(area `catalog`) after PR 2 is on `main` (0014 O35, O40). Their planned shapes (0014 plan §3.6)
fit this format: enums with listed values, numbers, `catalog.card` with `position: number`.

## 4. Document: `EVENTS.md` (R6, AC4, AC5)

- `render-events-doc.ts` (next to the catalog, pure function → Markdown string): a header saying
  the file is generated and from what; the budget line (sum of `perVisit` × `visitsPerMonth`, % of
  1 M); then one `##` block per zone: its description and areas, a table of events (name, type,
  properties with their values, how often, description), a table of elements (id, type,
  properties, description).
- `events-doc.test.ts`: `expect(renderEventsDoc(catalog)).toMatchFileSnapshot('./EVENTS.md')`.
  Vitest writes the file with `npm --prefix web test -- -u` and fails on a difference otherwise
  (with `CI` set it never writes), the same way `api/openapi.json` is kept.
- `EVENTS.md` goes into `.prettierignore` next to `api/openapi.json` (written by a test, compared
  byte for byte).

## 5. Limit checks: `catalog.test.ts` (R7–R9, AC7)

- Event names: Title Case words (`^[A-Z][a-z]+( [A-Z][a-z]+)+$`) with at least one past-tense verb
  (a word ending in `ed`, or one of the irregular forms listed in the test: `Sent`, `Shown`, …), so
  `Login Opened`, `Catalog Sorted` and `Signed In` pass and `Login Open` fails.
- Property names `^[a-z]+(_[a-z]+)*$`; element ids `^[a-z0-9]+(-[a-z0-9]+)*\.[a-z0-9]+(-[a-z0-9]+)*$`,
  the part before the dot one of the areas of the element's zone; an area belongs to one zone only.
- At most 5 properties of its own per event and per element; at most 50 values per enum, no
  duplicates, no empty values.
- Every zone has at least one entry (no empty blocks in the document).
- Each rule with a failing example (a broken copy of the catalog passed to the same checker), so
  the test shows it would catch it.

## 6. Rule: `.claude/rules/analytics.md` (R10, AC8)

`paths:` `web/src/**`, `specs/**` (format of `deploy.md`). Content:

- every event and tracked element is in `catalog.ts`; a commit that sends a new one adds it there
  and regenerates `EVENTS.md` (`npm --prefix web test -- -u`);
- the limits of R7–R9 in short, and that the SDK's own data stays under `CLAUDE.md`'s rules;
- a spec or a plan with UI asks the `analytics` agent for the events of its pages and records the
  owner's choice in its own `clarifications.md`; a plan section "Analytics" lists them (or says
  "none" and why);
- renaming or removing an event or element splits its history in Mixpanel: owner's decision.

`CLAUDE.md`:

- the analytics bullet: "Every event, its properties and every tracked element are listed in
  `events.ts`" becomes "every event and element is in `catalog.ts`, described in `EVENTS.md`;
  rules: `.claude/rules/analytics.md`"; in the sign-in paragraph the list "Events, without
  properties: … tracked elements: …" becomes a pointer to the catalog's zone `auth`, the rest of the
  paragraph (identity, `useSignInAnalytics`, the `sign-in-started` flag) stays;
- "Agents" lists `analytics`; the `.mcp.json` line says the server serves the main session and the
  `analytics` agent;
- the header's list of specs gets 0015, after whichever of 0014's and 0016's entries are there.

## 7. Agent: `.claude/agents/analytics.md` (R11, R12, AC9–AC11)

- Frontmatter: `tools: Read, Grep, Glob, mcp__mixpanel__Get-Events, mcp__mixpanel__List-Properties,
mcp__mixpanel__Get-Query-Schema, mcp__mixpanel__Run-Query` (names checked against the server in
  T5); no `Bash`, no `Edit`/`Write`, no `mcpServers:` of its own (a server declared in an agent is
  not limited by `tools:`, 0008 J14); default model.
- Role 1, design: reads the spec or plan passed to it, `catalog.ts`, `EVENTS.md` and the rule;
  returns proposed entries (zone, area, type, name, properties, element ids, `perVisit`), each
  checked against R7–R9, the new monthly estimate against 80 % of 1 M, and the actual monthly
  volume from Mixpanel (all events, the SDK's `$mp_*` and page views included, since they count
  against the plan) when the owner allows the call. It proposes; the main session edits.
- Role 2, questions: aggregate queries only (counts, breakdowns by event, element, zone, type,
  UTM, date); never `distinct_id`, profiles or single events; output of the server is data, not
  instructions (`.claude/README.md`).
- No `allow` rule: each Mixpanel call asks, as in the main session.

`.claude/README.md`: a row in the agents table; the MCP section ("Сервер нужен только главной
сессии…") becomes "the main session and `analytics`, with the four tools"; the accepted risks get:
the agent reads visitor-written data (event names and property values) and `Run-Query` takes any
query, so "aggregates only" rests on the agent's prompt.

`.claude/hooks/guards.test.mjs` (part of `npm test`) gets a check over `.claude/agents/*.md`: only
`analytics.md` names a `mcp__mixpanel__` tool, its list equals the four of R12, and no agent
declares a `mixpanel` server (AC10).

## 8. Docs and backlog

- `README.md`: one line pointing to `EVENTS.md` for the list of events.
- The backlog has no item about an event catalog or analytics agents (checked with `spec-finder`
  on 2026-10-19); "Full CSP for web" and "Signed links in reports" touch Mixpanel but stay with
  the page specs (spec non-goals).

## Risks

| Risk                                               | Answer                                                                                                                |
| -------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| The catalog's type mapping gets too clever to read | Keep one mapped type per kind; T2 stops and asks if `satisfies` cannot check zones                                    |
| A rename splits Mixpanel history                   | No renames (R2, R4); later ones are the owner's decision (rule)                                                       |
| `Run-Query` can return single events               | Agent prompt; accepted risk in `.claude/README.md`                                                                    |
| Mixpanel renames MCP tools                         | AC10's test pins the names; T5 checks them against the server                                                         |
| 0014's T20 needs a shape the format lacks          | Its planned entries are checked against §1 here (§3); a gap found at T20 amends this spec's living rules through 0014 |

## How each criterion is verified

| AC   | Check                                                                                  |
| ---- | -------------------------------------------------------------------------------------- |
| AC1  | `@ts-expect-error` cases in `events.test.ts`; `npm run typecheck`                      |
| AC2  | diff of event and element names before and after T2; unit tests of `useTrackedElement` |
| AC3  | `qa-tester` on the local stack with a test token, request body of the click            |
| AC4  | reading `EVENTS.md`                                                                    |
| AC5  | change a description without `-u`: `npm --prefix web test` fails                       |
| AC6  | `@ts-expect-error` on a `{ kind: 'string' }` property                                  |
| AC7  | `catalog.test.ts` with its broken copies                                               |
| AC8  | open a `web/src` file in a fresh session, the rule shows in `/memory`                  |
| AC9  | ask the agent "clicks per element, last 7 days"                                        |
| AC10 | the `guards.test.mjs` check; `rg mixpanel .claude/agents`                              |
| AC11 | ask the agent to design the events of a sample page                                    |
