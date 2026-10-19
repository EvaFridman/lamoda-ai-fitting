# 0015 analytics events: clarifications

Status: open (2026-10-19): decisions are added while the spec stays accepted.

The owner's decisions for this spec. Ids `R1`, `R2`, … are referred to by the spec, the plan and
code comments. All decisions below: owner, 2026-10-19.

## Order

- **R1. Two pull requests, the implementation right after the documents.** The documents go first;
  the implementation starts from a fresh `main` once they are merged. Specs 0012, 0013 and 0016
  are closed; spec 0014's catalog analytics (its T20 and PR 3) wait for this spec's catalog on
  `main` (0014 O35, O40), so this spec's PR 2 comes before them.
- **R2. Events of other specs move into or follow the catalog.** The first implementation task
  moves everything `events.ts` lists into the catalog: 0008's `ui-kit.button-primary`, and 0013's
  `Login Opened`, `Signed In`, `Signed Out` with the elements `login.google`,
  `profile-menu.sign-out` and `profile-menu.sign-out-everywhere`, none renamed. Spec 0014 adds its
  events and elements (0014 plan §3.6: `Catalog Filter Applied`, `Catalog Sorted`,
  `Catalog Searched`, `Catalog Page Loaded`, `catalog.card`, `catalog.category`,
  `catalog.filter-*`, `catalog.sort`) directly to the catalog, and the catalog's format must admit
  them. Later page specs do the same, following R10.

## Catalog

- **R3. One catalog in code is the source of truth.** A TypeScript catalog (`as const`) in
  `shared/analytics` lists every event, its properties and every tracked element with a
  description. The types `track` and `useTrackedElement` accept are derived from it, so sending
  anything it does not list still fails `npm run typecheck` (0008 AC9). The human-readable document
  is generated from it, and a test fails when the document is stale.
- **R4. Blocks by product zone, each entry with a type; a zone owns areas.** The catalog and the
  document are grouped by zone: header, catalog, product card, fitting, sign-in and profile,
  service (cookie consent, `/ui-kit`); zones are added as pages appear. A zone declares its areas,
  the prefixes its element ids may use (sign-in and profile: `login`, `profile-menu`; service:
  `ui-kit`, `cookie`; catalog: `catalog`), so existing ids keep their names and their history in
  Mixpanel. Every event and every tracked element also carries a type: navigation, interaction,
  conversion or service.
- **R5. Clicks and hovers stay two generic events; an element may carry properties.**
  `Element Clicked` and `Element Hovered` keep the property `element`; they also get `zone` and
  `type`, filled in from the catalog by `useTrackedElement`. An element may declare properties of
  its own (a product card's `position`, a number), under the limits of R7–R9; they are sent with
  its clicks and hovers, and `useTrackedElement` requires them by type. Business events
  (`Signed In`, later the start of a fitting, a generation) are events of their own name.
- **R6. The document.** `web/src/shared/analytics/EVENTS.md`, in Russian: the catalog's
  descriptions are Russian, event, property and element names English.

## Limits

- **R7. No personal data in properties.** A property's value is a value from a closed list (enum), a
  number or a boolean; the catalog's property types admit no free string, so text, an email, a
  name, a storage key, a product id or a link cannot be declared. What the SDK sends by itself (page
  URL, heatmap clicks) stays under the rules of 0008 and `CLAUDE.md`.
- **R8. Names.** Events: Title Case words with a verb in the past tense, either "Object Action"
  (`Login Opened`, `Catalog Sorted`) or a phrasal verb (`Signed In`). Properties: snake_case.
  Tracked elements: `area.element`, kebab-case, the area being one of its zone's areas (R4). A test
  checks the patterns.
- **R9. Size and budget.** At most 5 properties of its own per event and per element (the automatic
  `element`/`zone`/`type` of R5 not counted) and at most 50 values per enum property, checked by a
  test. Every event carries an estimate of how often it is sent; the analytics agent (R11) warns
  when the estimated or the actual monthly volume passes 80 % of the free plan's 1 M events a month
  (0008 J4).

## Rules and agent

- **R10. The rule lives in `.claude/rules/analytics.md`.** It is loaded when Claude works on
  `web/src/**` or `specs/**` and says: a new event or tracked element goes into the catalog (and the
  document is regenerated) in the same commit that sends it; the limits of R7–R9; when to call the
  analytics agent. In `CLAUDE.md`'s analytics bullet the sentence on `events.ts` and the list of
  sign-in events and elements give way to a pointer to the catalog and the rule; the rest (consent,
  recordings, `client.ts`, the sign-in identity and its flag, 0013 N13, N55, N56) stays.
- **R11. One analytics agent with two roles.** `.claude/agents/analytics.md`: (1) while a spec or a
  plan with UI is written, it proposes the events and tracked elements (zone, type, properties,
  frequency) and checks them against R7–R9, for the owner to decide; (2) on request, it answers
  questions about the collected data. It is not a step of `finish-task` and does not run after
  deploys.
- **R12. The agent reads only aggregates from Mixpanel.** It gets the main session's Mixpanel MCP
  server through its `tools:`, limited to the schema and aggregate tools (`Get-Events`,
  `List-Properties`, `Get-Query-Schema`, `Run-Query`); no live events, profiles, replays or write
  tools. Every call still asks for permission. This replaces 0008 J14 ("no agent gets it") for this
  agent only.
