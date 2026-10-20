# 0015 analytics events: clarifications

Status: open (2026-10-19): decisions are added while the spec stays accepted.

The owner's decisions for this spec. Ids `R1`, `R2`, … are referred to by the spec, the plan and
code comments. All decisions below: owner, 2026-10-19.

## Order

- **R1. Two pull requests, the implementation right after the documents.** The documents go first;
  the implementation starts from a fresh `main` once they are merged. Specs 0012 and 0013 are
  closed, and spec 0016's documents are merged (the spec itself stays accepted, 0016 S18); spec
  0014's catalog analytics (its T20 and PR 3) wait for this spec's catalog on `main` (0014 O35,
  O40), so this spec's PR 2 comes before them.
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

## Decided at the review of PR 1

- **R13. A hover is sent once per element and its properties per page view.** An element with
  properties counts as one element per set of values: hovering the cards at positions 1 and 2
  sends two hovers, hovering position 1 twice sends one. An element without properties keeps
  0008 J8 as it is.
- **R14. The two generic events form a block of their own.** `Element Clicked` and
  `Element Hovered` sit in a block "Общие события" with no zone, which says that each send carries
  the zone of its element. Every element carries its own estimate of clicks and hovers per visit,
  and the generic events' volume is the sum of those, not one number of their own. A new element
  comes with its estimates (R10's rule says so).
- **R15. The budget is a test.** The catalog also carries an estimate of what the SDK sends by
  itself per visit (page views, heatmap clicks: `$mp_web_page_view`, `$mp_click` and the like),
  set by the owner with the visits a month. A test fails when the catalog's events, its elements'
  clicks and hovers and the SDK's estimate, times the visits a month, pass 80 % of 1 M events; the
  document shows the same sum with its parts. The agent still checks the actual volume (R9).
- **R16. Abbreviations in event names from a list.** The name test accepts a word in capitals only
  from a list kept in the test (`AI` at first), like the list of irregular past forms; a new entry
  in either list is the owner's decision.
- **Fixed at the review (no decision needed).** Types: `conversion` marks only an event of a
  reached goal (`Signed In`); a click on an element is `interaction` or `navigation`, so
  `login.google` and `Signed Out` are `interaction` (plan §3). Zone descriptions say where their areas sit on the
  page (`profile-menu` is in the header, its zone is sign-in and profile). The restart of Claude
  Code comes after T6, when both the agent and the rule exist.

## Decided in T2

- **R17. The budget's estimates.** The owner has no traffic data and asked for plausible values
  (2026-10-19): `visitsPerMonth` 3 000 (a demo site) and `sdkPerVisit` 10 (with `autocapture`
  off, the SDK sends about 4 page views and 6 heatmap clicks a visit). Revisited once Mixpanel
  shows real volume (R9).
- **R18. The catalog's checks are `defineCatalog`.** `as const satisfies Catalog` cannot check
  that an entry's zone is a key of `zones`, so the catalog goes through `defineCatalog` in the same
  file (plan §1 left this to T2); a wrong zone fails at that entry's `zone`. Found at T2's review,
  the same check refuses an own property named `element`, `zone` or `type` (it would replace the
  automatic one) or `time`, `token`, `distinct_id`, `mp_…` (Mixpanel reserves them), and the generic
  events under `events`. `useTrackedElement` sends only the properties the catalog declares, so a
  variable with more fields than its type shows sends none of them (R7).
- **R19. `CLAUDE.md` names the catalog from T2.** Its sentence on where events are listed would be
  false after T2, so T2 changes `events.ts` to `catalog.ts` there; the rest of the bullet stays
  with T6 (owner, 2026-10-20).
- **R20. No user data in properties, even as numbers.** The types refuse free text but not a
  measurement (height, weight, sizes) or an age sent as a number or an enum. The rule of T6 says so
  and the analytics agent checks it; values are not checked at run time (owner, 2026-10-20).
- **R21. Enum values have a pattern.** `EVENTS.md` prints each value in backticks, so a value with
  a backtick, a space or a `|` would break its table. T4 checks every enum value against
  `^[a-z0-9]+([_-][a-z0-9]+)*$`, which 0014's sorts (`price_asc`) pass (owner, 2026-10-20, T3's
  review).
- **R22. The first list of irregular past forms.** The name test (R16) starts with `Sent`, `Shown`,
  `Seen`, `Made`, `Done`, `Chosen`, `Taken`, `Found`, `Paid` and `Bought`; `Left` stays out, since
  as a direction it would pass a name with no verb (`Left Arrow`) (owner, 2026-10-20, T4's review).
- **R23. Areas have a pattern.** `EVENTS.md` prints every area of a zone in backticks, used by an
  element or not, so T4 checks each area against `^[a-z0-9]+(-[a-z0-9]+)*$`, the part of an
  element id before the dot (owner, 2026-10-20, T4's review).
- **R24. Where the verb stands.** The name test checks R8's two shapes, not a past form anywhere:
  the last word is a verb in the past tense ("Object Action": `Login Opened`), or the last word is
  a particle from the test's list (`In`, `Out`, `Up`, `Off`, `Down` at first; a new one is the
  owner's decision, like R16) and the word before it is that verb (`Signed In`). So `Red Button`,
  `Opened Login` and `Login In` fail; a word ending in `ed` still counts as a verb (`Bed Seed`
  passes), names are also read at review and by the analytics agent (owner, 2026-10-20, T4's
  review).

## Decided in T6

- **R25. Data questions go only to the analytics agent.** The main session and the built-in
  agents do not query the collected data through Mixpanel (`Run-Query`, events, properties,
  reports, live events); a question about it goes to the `analytics` agent with the project id,
  so only R12's aggregate tools answer it. `CLAUDE.md` says so, since the rule loads only with
  `web/src/**` or `specs/**`. A `deny` cannot hold it: it would bind the agent too, so it rests on
  the text and the permission prompt of every call (owner, 2026-10-20, T6's review, after the
  security review).
- **R26. T7 marks 0015 closed in the docs.** T6 lists 0015 in `CLAUDE.md`'s header "in
  progress"; T7 moves it among the closed specs there and adds it to `README.md`'s list of closed
  specs (owner, 2026-10-20, T6's review).
