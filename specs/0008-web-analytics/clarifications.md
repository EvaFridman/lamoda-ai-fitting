# 0008 web analytics: clarifications

Status: open (2026-10-15).

The owner's decisions for this spec. Ids `J1`, `J2`, … are referred to by the spec, the plan and
code comments (`I` is skipped: it reads as `1`). All decisions below: owner, 2026-10-15.

## Order

- **J1. Number and order.** This spec is 0008, for issue #40, written in a second worktree while
  0007 is in progress. Its first pull request holds only the documents (spec, clarifications, plan
  and tasks). 0007's PR 3 changes the same files (`web/src/_app/providers.tsx`, `web/next.config.ts`,
  `CLAUDE.md`, `.env.example`, `specs/backlog.md`); the branch that merges later rebases onto `main`
  (0006 F1). The other pull requests are set by the plan.

## Purpose

- **J2. A demo.** The site is a demo, not a product with real customers. That sets how far privacy
  goes: a consent banner and a policy page with placeholder text (J10), no legal review in this
  spec. The owner is the only person on the project and owns every account (J15).

## Service

- **J3. Mixpanel, one service for all three tasks.** Heatmaps, click and hover events, and visits
  from referral links (J9) all go to Mixpanel. Main reason: an official MCP server that agents can
  use without a daily cap (J14). Checked on 2026-10-15 and rejected:
  - PostHog blocks every visitor from Russia by IP (its public handbook, "Who we do business with").
  - Hotjar takes no new accounts; its successor Contentsquare allows about 300 MCP calls a month on
    its free plan.
  - Microsoft Clarity's MCP works through the Data Export API: 10 requests a project a day, data of
    the last 1–3 days only.
  - Amplitude has heatmaps only on a paid plan.
  - Google Analytics 4 with Tag Manager: no heatmaps, its MCP server is experimental and written in
    Python (a second runtime), and it is the clearest case of foreign analytics on Russian visitors.
  - Yandex Metrica: no official MCP server, only community ones; on 2026-10-08…11 drone strikes
    stopped three of Yandex's five data centres and Metrica's dashboard was still down on
    2026-10-15.

  The owner signed up from Russia on 2026-10-15 without problems.

- **J4. EU data residency and the free plan.** The project (id `4073843`) stores data in the EU and
  runs on the free plan (1 M events and 10 k session replays a month, replays kept 30 days). Data of
  Russian visitors leaves the country; for a demo the owner accepts that risk. The project token is
  public by design: it reaches the browser.
- **J5. No tag manager.** Every script on the site comes from code reviewed in a pull request; no
  service can add one at run time.

## What is collected

- **J6. Heatmaps through session replay, masked.** Mixpanel builds heatmaps only from sessions it
  records, so sessions are recorded. Replays are not a goal of this spec; they exist for the heatmaps.
  Masked in every recording: all text, every input field, and all images (fitting photos among
  them). How many sessions are recorded is set by the plan within the free plan.
- **J7. Infrastructure now, page events later.** This spec adds one typed way to send an event, with
  every event name and its properties listed in code; page views; and UTM tags. Click and hover
  events on catalog and fitting pages come with the specs of those pages. No events from the api or
  the Temporal worker.
- **J8. Hover events.** A hover counts when the pointer stays on a tracked element for at least
  500 ms; it is sent at most once per element per page view.
- **J9. Referral links are UTM tags.** A visit from a link with `utm_*` parameters is attributed in
  Mixpanel. No referral program of our own (invites, rewards), and nothing about referrals is stored
  on our side.

## Privacy

- **J10. Consent first.** A banner asks for consent; a policy page holds placeholder text until the
  owner supplies the real one. Until the visitor accepts, nothing is loaded from Mixpanel and nothing
  is sent: no answer counts as no.
- **J11. Production only.** An empty token turns analytics off, as an empty DSN turns off Sentry:
  development and CI pull requests send nothing. No separate development project.
- **J12. CSP unchanged.** The Content Security Policy stays `frame-ancestors 'none'` (0006 F9 defers
  a full one to the pages). The plan lists the domains Mixpanel needs, and a backlog item for a full
  web CSP carries them.
- **J13. Ad blockers.** Visitors whose blocker cuts Mixpanel are lost to analytics; no proxy through
  our domain.

## Tools

- **J14. Mixpanel MCP in the main session only.** A project-level MCP config points at Mixpanel's EU
  endpoint with OAuth, so no token is stored in the repository. No agent in `.claude/agents/` gets
  it: none needs analytics data, and a server declared in an agent is not limited by its `tools:`.
  The owner enabled MCP for the organization (Settings → Org → AI Settings) on 2026-10-15.
- **J15. Accounts.** The owner owns the Mixpanel organization and project; nobody else gets access.
- **J23. Irreversible MCP tools denied (T4).** The server also has write tools; none is needed by 0008. The irreversible ones are denied in `.claude/settings.json` by exact name (the list
  in plan §7), so text planted in an event cannot lead to deleting or rewriting the project's data.
  `Edit-Event` and `Edit-Property` count as irreversible: their `dropped` flag makes Mixpanel stop
  ingesting the event or property, and what arrives meanwhile is lost. `Get-User-Replays-Data` is
  denied too: one visitor's session replays are not needed and would bring personal data into the
  session. `Get-Live-Events` stays (event name, time and anonymous id; used to see events arrive).
  Other write tools (create, update) are not denied: they ask per call in the default permission
  mode, and the classifier decides in `auto`. No `ask` rule for the whole server: reads would ask
  in `auto` too and gain nothing.

## Consent details

- **J16. Changing one's mind.** The policy page has a "Cookie settings" link that shows the banner
  again. After a new "decline", Mixpanel stops sending in that tab. The footer links to the policy
  page (J22). (Revised while writing the plan: the footer already exists.)
- **J17. No banner without analytics.** With an empty token (J11) the banner is not shown: there is
  nothing to ask about.
- **J18. Geolocation kept.** Mixpanel derives country and city from the visitor's address, as it does
  by default; it does not store the address itself.
- **J19. Policy page at `/privacy`,** linked from the banner.
- **J20. The answer is remembered for 12 months,** then the banner asks again. Clearing the browser's
  site data also brings it back.
- **J21. The banner.** A bar at the bottom of the screen with two equally prominent buttons,
  "Принять" and "Отказаться", so declining is as easy as accepting.

## Footer

- **J22. The footer as Lamoda's.** The footer is rebuilt now, copying Lamoda's site footer (the
  owner's screenshot of 2026-10-15): four columns "Помощь", "О нас", "Партнерам", "Правовая
  информация" with Lamoda's items, and a bottom row with "Россия", the VK icon, the payment marks
  (Mastercard, МИР, Visa) with "Доступны другие способы оплаты", and "Мобильная версия". Items are
  plain text, not links, since the pages do not exist; only "Политика по работе с персональными
  данными" links to `/privacy`. An item becomes a link when its page appears (a backlog item lists
  them). The floating support chat button of the screenshot is not part of the footer and is left
  out.

## Build

- **J24. The token only in published images.** CI passes the repository variable to the web build
  only when the image is published (from `main`); images of pull requests build with an empty token,
  so they send nothing even when run locally (J11, AC13). `NEXT_PUBLIC_SENTRY_DSN` stays in every
  build: errors from a pull request's image spoil no data. (Owner, 2026-10-15, after T5's review.)

## Analytics client

- **J25. A failed SDK load is not reported.** When the SDK's chunk does not load or `init` throws
  (an ad blocker, a network error), analytics stays off for that page and nothing goes to Sentry:
  broken analytics costs heatmaps, not the site, and blocked visitors would flood Sentry. (Owner,
  2026-10-15, at T6.)
- **J26. Accepting again after a decline sends again.** The SDK keeps its own opt-out in
  `localStorage`; our consent store (§4 of the plan) is the only source of truth, so starting
  analytics opts the SDK back in, after a reload or in the same tab. (Owner, 2026-10-15, at T6.)
- **J27. The `README.md` line on analytics lands with T6,** next to the `CLAUDE.md` changes.
  (Owner, 2026-10-15, at T6.)
- **J28. The SDK's own heatmap events carry no attributes.** `record_heatmap_data` makes the SDK
  send `$mp_click`, `$mp_dead_click`, `$mp_rage_click` and `$mp_page_leave` with the attributes of
  the clicked element and its ancestors, which recording masks do not cover. An `on_track` hook
  drops attributes, ids, links and text; tag, classes and position stay. (Owner, 2026-10-15, after
  T6's security review.)
- **J29. Recordings block images in any form:** `img`, `picture`, `svg image`, inline `url(...)`
  styles, image preloads, `input type="image"`, `og:image`, embedded frames and objects, as well as
  video, audio and canvas. Attributes and stylesheets are recorded as they are, so personal data
  stays out of them (`CLAUDE.md`). (Owner, 2026-10-15, after T6's
  security review.)
- **J30. The banner's sentence:** "Мы используем cookies для аналитики, чтобы улучшать сайт.
  Аналитика включится, только если вы согласитесь." (Owner, 2026-10-15, at T7.)
- **J31. An answer reaches every open tab.** The consent store listens to the `storage` event, so
  an answer given in one tab hides the banner and starts or stops analytics in the others at once.
  (Owner, 2026-10-15, at T7.)
- **J32. No answer or a decline clears what the SDK left.** When the answer expired after 365 days,
  or the SDK never loaded in the tab that declined, `opt_out_tracking()` never ran, and the SDK's
  keys would join the next visitor of that browser to the earlier one. So without consent the
  SDK's storage is cleared without loading it: `localStorage` and `sessionStorage` keys starting
  with `mp_` or `__mp`, and its IndexedDB databases. Its opt-out (`__mp_opt_in_out_*`) stays: it
  names no visitor, and an SDK running in another tab needs it to stop sending. (Owner, 2026-10-15,
  after T7's security review.)
- **J33. Storage blocked:** an answer the browser will not store hides the banner and sends nothing
  until the page reloads; navigation inside the site does not ask again. (Owner, 2026-10-15, at
  T7.)
- **AC3 is checked in production only** (T11): no local tool intercepts the SDK's requests, and a
  dummy token would still send to Mixpanel. (Owner, 2026-10-15, at T7.)
