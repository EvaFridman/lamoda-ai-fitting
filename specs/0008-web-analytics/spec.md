# 0008 web analytics

Status: accepted (2026-10-15); amended the same day: the footer (J22).

Issue #40. Decisions: `clarifications.md` (J1–J22).

## Goal

The owner sees how visitors use the site: where they click and scroll (heatmaps), which elements
they click or hover, and which referral links bring them. The data lives in one service that the
main Claude session can query through MCP, and it is collected only from visitors who agreed to it.

## In scope

- Mixpanel in web, EU residency, production only (J3, J4, J11).
- A consent banner and a policy page with placeholder text; nothing loads before consent (J10); the
  answer is remembered for 12 months and can be changed from the policy page (J16–J21).
- One typed way to send an event, with every event listed in code; page views; UTM tags (J7, J9).
- Hover events with a 500 ms threshold, once per element per page view (J8).
- Heatmaps through masked session replay (J6).
- The Mixpanel MCP server for the main session (J14).
- The footer rebuilt as Lamoda's, with the policy link as its only link (J22).
- The build-time token as for Sentry's DSN: Dockerfile, CI, GitHub variable, `.env.example`,
  `deploy/README.md`.
- A backlog item for a full web CSP with Mixpanel's domains (J12).

## Non-goals

- Click and hover events on catalog and fitting pages (their own specs, J7).
- Events from the api or the Temporal worker; identifying signed-in users (there are none).
- A referral program of our own, or storing UTM tags on our side (J9).
- The real policy text and a legal review (J2).
- A tag manager (J5), a full CSP (J12), a proxy against ad blockers (J13), a development project
  in Mixpanel (J11).
- Feature flags, experiments and surveys, even though Mixpanel has them.
- Pages behind the footer's items, and a support chat (J22).

## Acceptance criteria

### Consent

- **AC1.** A first visit to any page in production shows the banner, and the browser makes no
  request to a Mixpanel domain while the banner is unanswered.
- **AC2.** After "decline", the banner is gone, and neither this page nor the pages after it,
  including after a reload, make a request to a Mixpanel domain.
- **AC3.** After "accept", the banner is gone, and the page view reaches the Mixpanel project
  (seen through MCP, AC12) without another click.
- **AC4.** The banner is a bar at the bottom with "Принять" and "Отказаться" of equal weight, and
  links to `/privacy`, which opens with its placeholder text.
- **AC5.** "Cookie settings" on `/privacy` shows the banner again; after a new "decline" the tab
  sends nothing more to Mixpanel.
- **AC6.** The answer survives a reload and a new tab; once it is older than 12 months the banner
  shows again.

### Events

- **AC7.** A visit to `/?utm_source=ac7&utm_campaign=spec-0008` after consent reaches Mixpanel
  with those UTM values.
- **AC8.** On the element the plan marks for the check, a click sends one event; a hover of
  500 ms or more sends one hover event; a shorter hover sends none; a second hover on the same
  page view sends none.
- **AC9.** Sending an event whose name or properties are not in the list fails `npm run typecheck`.

### Heatmaps and replays

- **AC10.** The clicks of AC8 show on the page's heatmap in Mixpanel.
- **AC11.** In the replay of that session, text, inputs and images are masked.

### Environments and tools

- **AC12.** The main Claude session reads the project's events through the Mixpanel MCP server; no
  agent in `.claude/agents/` has it, and the repository holds no Mixpanel token besides the public
  project token's variable name.
- **AC13.** With an empty token (development, CI pull requests) the site makes no request to a
  Mixpanel domain and shows no banner.
- **AC14.** `npm run verify` passes, and the web image still builds with no api, Redis or database.

### Footer

- **AC15.** On every page the footer matches the owner's screenshot of Lamoda's footer in columns,
  items and bottom row; only "Политика по работе с персональными данными" is a link, and it opens
  `/privacy`.

## Owner actions (Claude cannot do them)

- Set the project's time zone to Europe/Moscow and give the organization and project names.
- Create the GitHub repository variable with the project token (its name is in the plan).
- Sign in to Mixpanel through OAuth the first time the MCP server is used; restart Claude Code after
  the MCP config is added.
- Merge the pull requests; supply the real policy text when there is one.

## Assumptions

- Mixpanel stays reachable from Russia, for visitors and for the owner, and keeps its free plan
  limits (J4).
- Mixpanel heatmaps are marked beta; their data comes from session replay (J6).
- 0007 PR 3 changes `_app/providers.tsx` and `next.config.ts` too; whichever branch merges later
  rebases (J1).
- No catalog or fitting pages exist yet, so AC8 uses an element on an existing page.
