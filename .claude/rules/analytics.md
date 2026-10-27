---
paths:
  - web/src/**
  - specs/**
---

# Analytics events (Mixpanel)

What is sent and why: spec 0015. The list itself: `web/src/shared/analytics/EVENTS.md`, generated
from `catalog.ts`.

## The catalog

- Every event and every tracked element is in `web/src/shared/analytics/catalog.ts`; `track` and
  `useTrackedElement` take nothing else (`typecheck` fails). A commit that sends a new one adds it
  there and regenerates `EVENTS.md` in the same commit (`npm --prefix web test -- -u`); a catalog
  changed without it fails `npm run verify`.
- `Element Clicked` and `Element Hovered` are the two generic events (`commonEvents`): each send
  carries the element's `element`, `zone` and `type`, plus the element's own properties. Any other
  event is a business event of its own name in `events`.
- A hover is sent once per element and set of its property values per page view: hovering the
  cards at positions 1 and 2 sends two hovers, position 1 twice sends one.

## Limits

Names, sizes, areas, zone keys, the estimates' sign and the budget are checked by
`catalog.test.ts`; property kinds, reserved names and that every estimate is given by the types
(`typecheck`); types and user data only at review.

- Event names: Title Case words, ending in a past-tense verb ("Object Action": `Login Opened`,
  `Catalog Sorted`) or in that verb and a particle (`Signed In`). The verb is a word ending in `ed`
  or an irregular form from the test's list (`Sent`, `Shown`, `Seen`, `Made`, `Done`, `Chosen`,
  `Taken`, `Found`, `Paid`, `Bought`; not `Left`); particles are `In`, `Out`, `Up`, `Off`, `Down`;
  a word in capitals only from the abbreviations list (`AI`). So `Red Button`, `Opened Login` and
  `Login In` fail. A new entry in any of these lists is the owner's decision. The test cannot tell
  a verb from a noun ending in `ed`: names are read at review too.
- Properties: snake_case names of letters only (`^[a-z]+(_[a-z]+)*$`, so not `step_2`), at most 5 of an entry's own (the automatic `element`, `zone`,
  `type` not counted); `element`, `zone`, `type` on an element and `time`, `token`,
  `distinct_id`, `mp_…` anywhere are refused. A value is an enum (at most 50 values, no
  duplicates, each `^[a-z0-9]+([_-][a-z0-9]+)*$`), a number or a boolean; there is no free text.
  A property sent with only some sends of its event is marked `optional: true`, and the event's
  description says when it is sent (`Fitting Refused.prompt_reason`).
- Element ids: `area.element`, each part kebab-case (`login.google`). The area is one of its
  zone's `areas`; an area belongs to one zone, matches `^[a-z0-9]+(-[a-z0-9]+)*$` and is declared
  in the zone before use. A zone's key matches the same pattern, and every zone has at least one
  entry.
- Types: `conversion` only for an event of a reached goal (`Signed In`), never for an element; an
  element is `interaction` or `navigation`; `service` for an event or element that serves the
  site, not the visitor's goal (`/ui-kit`, cookie consent: `ui-kit.button-primary`).
- Budget: a new event comes with its `perVisit`, a new element with its `clicksPerVisit` and
  `hoversPerVisit`. `estimateMonthly` (all of them plus `sdkPerVisit`, times `visitsPerMonth`)
  stays at most 80 % of the free plan's 1 M events a month, and none of these numbers is negative. A page that changes how often the SDK sends by
  itself (more page views) revisits `sdkPerVisit`.

## No user data

- No user data in a property, not even as a number or an enum: no text, email, name, id of a user
  or a product, storage key or link, and no measurement (height, weight, sizes) or age. The types
  refuse free text (so an email, a name, a link or a string id), but an id, a measurement or an age
  sent as a number or a closed list passes them, and nothing checks values at run time: review
  catches it. Only values about the page: a card's position, a sort order, a step of a flow.
- What the SDK sends by itself (page views, heatmap clicks, recordings) stays under `CLAUDE.md`'s
  analytics rules: no personal data in attributes or stylesheets, `mp-block` on a container of it.

## The `analytics` agent

- A spec or a plan with UI asks the `analytics` agent for the events and tracked elements of its
  pages, records the owner's choice in its own `clarifications.md`, and its plan has a section
  "Analytics" that lists them (or says "none" and why).
- A question about the collected data goes to the agent with the Mixpanel project id (`4073843`,
  spec 0008 J4): the agent has no tool to find it. Its answers are aggregates only. The main
  session and the built-in agents never query the data through Mixpanel themselves (R25).
- Renaming or removing an event, an element or a property value splits its history in Mixpanel:
  the owner's decision.
