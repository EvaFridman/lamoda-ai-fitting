# 0008 web analytics: plan

Status: accepted (2026-10-15); §6 (the footer, J22) added at the owner's request the same day;
its bottom row amended at T9 (J36).

Implements [spec.md](spec.md); decisions in [clarifications.md](clarifications.md). One new
dependency in web: `mixpanel-browser`.

## 1. Dependency (J3)

- `mixpanel-browser@^2.84.0` (2026-10-06): Apache-2.0, public repository `mixpanel/mixpanel-js`,
  Mixpanel's own SDK. It ships its types (`src/index.d.ts`) and has no install scripts, so nothing
  goes into `allowScripts`. Its dependencies are `@mixpanel/rrweb*` (Mixpanel's fork of rrweb, the
  session recorder) and `json-logic-js`.
- Its ES module entry (`dist/mixpanel.module.js`) bundles the recorder (`loader-module.js` loads
  with `loadNoop`), so the SDK never loads a script from `cdn.mxpnl.com`. That build is about
  1.2 MB before minification; it is imported dynamically, after consent, so it is its own chunk and
  a visitor who declines never downloads it.

## 2. Configuration (J4, J11, J17, J24)

- `NEXT_PUBLIC_MIXPANEL_TOKEN`, inlined at build time as `NEXT_PUBLIC_SENTRY_DSN` is:
  - `web/Dockerfile`: an `ARG` next to the Sentry ones;
  - `scripts/ci-build-images.sh`: `--build-arg NEXT_PUBLIC_MIXPANEL_TOKEN="${…:-}"`, and its header
    comment;
  - `.github/workflows/images.yml`:
    `NEXT_PUBLIC_MIXPANEL_TOKEN: ${{ inputs.publish && vars.NEXT_PUBLIC_MIXPANEL_TOKEN || '' }}`
    (a repository variable, as the image job runs with no environment for pull requests; only
    published images get it, J24);
  - `docker-compose.yml`, service `web`: `NEXT_PUBLIC_MIXPANEL_TOKEN: ${NEXT_PUBLIC_MIXPANEL_TOKEN:-}`,
    so a local run can be given a dummy token for checks ("How each criterion is verified"); empty by default;
  - `.env.example`: the variable, empty, with a comment (public by design, empty turns analytics
    off);
  - `deploy/README.md`: `gh variable set NEXT_PUBLIC_MIXPANEL_TOKEN` and the variable check list.
- `web/src/shared/config/public-env.ts`: `mixpanelToken = process.env.NEXT_PUBLIC_MIXPANEL_TOKEN ?? ''`
  (a literal property access, so Next inlines it); `analyticsEnabled = mixpanelToken !== ''`.
  Exported from a new browser-safe barrel `shared/config/index.ts`; `server.ts` stays server-only.

## 3. `shared/analytics` (J6, J7, J8, J18)

A new segment of `shared`, browser only (`'use client'` where it holds hooks).

- `events.ts`: the list of events (AC9). A type map, event name → properties:
  `'Element Clicked': { element: TrackedElement }`, `'Element Hovered': { element: TrackedElement }`.
  `TrackedElement` is a union of string literals, one per marked element (§8 adds the first);
  page specs add theirs. Page views are Mixpanel's own `$mp_web_page_view`.
- `client.ts`: the only module that imports `mixpanel-browser`, always through `import()`.
  - `startAnalytics()`: once per tab (a module-level promise, so React's double effects in
    development do not init twice), when `analyticsEnabled`, imports the SDK and calls
    `mixpanel.init(token, options)`. When the SDK is opted out (a stored opt-out of an earlier
    decline, or `stopAnalytics()` in this tab), it calls `opt_in_tracking()` without the `$opt_in`
    event and `start_session_recording()` (J26). A failed import or `init` leaves analytics off and
    is not reported (J25).
  - `stopAnalytics()`: if started, `stop_session_recording()` and `opt_out_tracking()` (clears the
    SDK's storage); the next page load starts nothing (§4).
  - `track(name, props)`: typed by `events.ts`; a no-op until started, so callers need no checks.
- `init` options (values in "Values"): EU host; storage in `localStorage`, no cookies;
  `track_pageview: 'url-with-path'` (one page view per path, including App Router navigations, with
  UTM tags from the URL, J9); `autocapture: false` (only listed events, J7); session recording on
  for heatmaps (`record_sessions_percent`, `record_heatmap_data: true`, J6); masking: all text, all
  inputs, images in any form blocked (J29), console and network not recorded; `ip: true` (J18);
  Do Not Track respected (the SDK's default); an `on_track` hook (`strip-attributes.ts`) drops
  element attributes, ids, links and text from the SDK's own heatmap events (J28).
- `use-tracked-element.ts`: `useTrackedElement(element)` returns props to spread on the element:
  `onClick` sends `Element Clicked`; `onPointerEnter` with `pointerType === 'mouse'` starts a
  500 ms timer, `onPointerLeave` clears it; when it fires, `Element Hovered` is sent unless that
  element was already sent on this page view. The set of hovered elements is shared by every copy
  of an element and cleared when `usePathname()` changes (J8): by `useHoverReset()`, mounted once
  in the gate (§4), so a return to a path after a page with no tracked element is a new page view;
  a path check when a hover fires covers a page without the gate.

## 4. Consent: `features/cookie-consent` (J10, J16, J17, J20, J21)

- `model/consent-store.ts`: the answer in `localStorage` under `cookie-consent` as
  `{ value: 'granted' | 'denied', at: <ISO date> }`. Missing, unreadable, malformed or older than
  365 days counts as no answer (J20). A storage error (private mode) means no answer and nothing
  stored: the banner shows on each page, nothing is sent. Read with `useSyncExternalStore`; the
  server snapshot is "unknown", so nothing renders on the server and the static shell holds no
  banner.
- State: `asking` (no answer, or reopened by "Cookie settings"), `granted`, `denied`. `reopen()`
  shows the banner again without forgetting the stored answer until a new one is given.
- `ui/consent-banner.tsx`: a fixed bar at the bottom: one sentence, a link "Политика по
  работе с персональными данными" to `/privacy` (the footer's wording, J22), and two `Button`s of
  the same variant and size, "Принять" and "Отказаться" (J21). Rendered only when `analyticsEnabled` and the state is `asking` (J17). A new
  z-index token `--z-banner: 10`: under modals, drawers, tooltips and toasts.
- `ui/analytics-gate.tsx`: no markup; `startAnalytics()` when the state becomes `granted`,
  `stopAnalytics()` when it changes from `granted` to `denied` (J16); calls `useHoverReset()` (§3).
- `ui/cookie-settings-button.tsx`: "Настройки cookies", calls `reopen()`; rendered only when
  `analyticsEnabled`.
- `_app/providers.tsx` renders `<AnalyticsGate />` and `<ConsentBanner />` next to `{children}`.

## 5. Policy page (J10, J19)

- `web/app/privacy/page.tsx` re-exports `PrivacyPage` from `_pages/privacy`; metadata title
  "Политика по работе с персональными данными — Lamoda AI Fitting". Indexed like any page.
- `_pages/privacy`: a heading, the placeholder text (the real text comes from the owner later; the
  placeholder says so), and the `CookieSettingsButton`. Static: it builds into the shell.

## 6. Footer (J22, J36)

- `widgets/footer` is rebuilt after the owner's screenshot of Lamoda's footer:
  - **Columns.** A dark band with four columns, each a heading and a list:
    - "Помощь": Мои заказы, Условия доставки, Магазины Lamoda Sport, Возврат, Как оформить заказ,
      Как выбрать размер, Центр поддержки Lamoda, Lamoda о мошенничестве, Часто задаваемые
      вопросы, Lamoda club, Подарочные карты, Чат с поддержкой.
    - "О нас": Новости компании, Устойчивое развитие, Журнал, Вакансии, Статьи.
    - "Партнерам": Lamoda Seller Academy — База знаний для продавцов и партнеров, Стать продавцом
      маркетплейса, Продвижение на Lamoda, Стать подрядчиком Lamoda, Стать подрядчиком для складских
      операций, Стать подрядчиком транспортных услуг, Стать подрядчиком для ремонта и эксплуатации
      ПВЗ, Арендодателям, Подарочные сертификаты для бизнеса, Стать участником Lamoda Fashion
      Accelerator.
    - "Правовая информация": Публичная оферта, Пользовательское соглашение, Сотрудничество,
      Политика по работе с персональными данными, Конфиденциальная информация, Комплаенс,
      Устойчивое развитие.
  - **Bottom row**, under a divider: the VK icon; the Mastercard and Visa marks over "Доступны
    другие способы оплаты" (the last three words underlined, as on Lamoda, but not a link); a phone
    icon and "Мобильная версия" on the right. No flag, "Россия" or МИР mark (J36).
- The items live in one list in `widgets/footer/config/items.ts`, each `{ label, href? }`; only the
  policy has `href: '/privacy'` (a `Link` from the UI kit). The others render as text, not as links
  to nowhere.
- Colours, font sizes and spacing come from Lamoda's CSS (the a.lmcdn.ru chunks used by 0003);
  new values become tokens in `shared/styles/tokens.scss`. The icons (VK, payment marks, phone)
  are inline SVG components in `shared/ui/icon`, as the UI kit's icons are.
- Narrow screens: two columns under 1024 px, one under 600 px; the bottom row wraps.
- The deployed version ("версия …", read at request time) stays, small and muted, at the end of the
  bottom row: it is how the owner sees which release is live.
- The server component stays a server component; the policy link needs no client code.

## 7. MCP (J14)

- `.mcp.json` at the root: `{ "mcpServers": { "mixpanel": { "type": "http", "url":
"https://mcp-eu.mixpanel.com/mcp" } } }`. OAuth on first use (`/mcp` in Claude Code); no token in
  the repository or in `.env`.
- Claude Code asks once to approve a project MCP server; no allow rule is added, so each tool call
  asks for permission in the default permission mode, and the classifier decides in `auto`. The irreversible tools are denied in `.claude/settings.json`
  by name (J23): `Delete-Cohort`, `Delete-Dashboard`, `Delete-Tag`, `Bulk-Edit-Events`,
  `Bulk-Edit-Properties`, `Merge-Group`, `Dismiss-Duplicate-Group`, `Dismiss-Issues`, `Edit-Event`,
  `Edit-Property` (their `dropped` flag stops ingestion), and `Get-User-Replays-Data` (one
  visitor's session replays).
- `.claude/README.md`: what the server is, why only the main session (J14), the denied tools (J23),
  and that the built-in agents (`general-purpose`, `Explore`, `Plan`) inherit the main session's
  MCP tools: the project's agents list their `tools:`, so they do not.

## 8. The element for the checks (AC8, AC10)

- `/ui-kit`, the first button of the "Button" section: `TrackedElement` `'ui-kit.button-primary'`.
  The page is hidden from search (0003 D10) and already in production, so the checks touch no real
  page.

## 9. Docs and backlog

- `CLAUDE.md`, "Conventions": web analytics only through `@/shared/analytics` (`track`,
  `useTrackedElement`); each event and element is listed in `events.ts`; nothing loads before
  consent; `mixpanel-browser` is imported only by `client.ts`. The opening paragraph names 0008. The
  web row of "Stack and versions" gets Mixpanel.
- `README.md`: one line on analytics and the token variable (T6, J27).
- `specs/backlog.md`, "web": **Footer links.** Each footer item without a page (J22) becomes a link
  when its page appears; the list is `widgets/footer/config/items.ts`.
- `specs/backlog.md`, "web": **Full CSP for web.** When it comes (0006 F9), allow `connect-src
https://api-eu.mixpanel.com` and check whether the recorder needs `worker-src blob:` (J12).

## Values

| What                  | Value                                                                                                                                                      | Why                                    |
| --------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------- |
| API host              | `https://api-eu.mixpanel.com`                                                                                                                              | EU residency (J4)                      |
| Sessions recorded     | 100 %                                                                                                                                                      | demo traffic is far below 10 k a month |
| Hover threshold       | 500 ms, once per element per page                                                                                                                          | J8                                     |
| Consent kept          | 365 days                                                                                                                                                   | J20                                    |
| Storage               | `localStorage` (`persistence`)                                                                                                                             | no cookies of ours or Mixpanel's       |
| Blocked in recordings | `img, picture, video, audio, canvas, svg image, iframe, object, embed, [style*="url("], link[as="image"], input[type="image"], meta[property^="og:image"]` | fitting photos (J6, J29)               |
| Masked in recordings  | all text, all inputs                                                                                                                                       | J6                                     |
| Console, network      | not recorded                                                                                                                                               | they may carry data                    |
| Banner z-index        | 10                                                                                                                                                         | under modal 20, popover 30, toast 50   |

## Environment

One new variable, `NEXT_PUBLIC_MIXPANEL_TOKEN` (§2). The GitHub repository variable is set by the
owner before the code PR merges; until then production builds with an empty token, and analytics
stays off.

## Risks

- Mixpanel may close access from Russia, as PostHog did (assumption of the spec): the token is
  emptied, and analytics turns off with no code change.
- The recorder depends on an alpha of Mixpanel's rrweb fork, and heatmaps are beta; a broken
  recording costs heatmaps, not the site: the SDK runs only after consent, in its own chunk.
- Visitors with Do Not Track or an ad blocker send nothing after "Принять" (J13); the acceptance
  checks run in a browser without either.
- `track_pageview: 'url-with-path'` follows the History API; Next's App Router navigations go
  through it. The QA run checks one navigation (AC3).
- 0007 PR 3 also edits `_app/providers.tsx`, `CLAUDE.md`, `.env.example` and `specs/backlog.md`
  (J1): the later branch rebases.
- Built-in agents inherit the Mixpanel MCP tools (§7); each call still asks for permission.

## How each criterion is verified

| AC   | How                                                                                        |
| ---- | ------------------------------------------------------------------------------------------ |
| AC1  | Production, new browser profile: banner visible; DevTools Network, filter `mixpanel`: none |
| AC2  | Same, "Отказаться", reload, open `/ui-kit`: no request; unit test of the store             |
| AC3  | Same, "Принять": requests to `api-eu.mixpanel.com`; the page view found through MCP        |
| AC4  | Production: the banner's look and link; `/privacy` opens; component tests                  |
| AC5  | Production: "Настройки cookies" → "Отказаться": no further requests; unit test of the gate |
| AC6  | Unit tests of the store (reload, another tab, 366 days old); production reload check       |
| AC7  | Production visit with `?utm_source=ac7&utm_campaign=spec-0008`; the values through MCP     |
| AC8  | Unit tests of `useTrackedElement` (fake timers); production check of the events via MCP    |
| AC9  | A test with `// @ts-expect-error` on an unknown event; `npm run typecheck`                 |
| AC10 | Mixpanel heatmap of `/ui-kit` shows the clicks of AC8 (owner, in the Mixpanel UI)          |
| AC11 | The replay of that session: text, inputs and images masked (owner, in the Mixpanel UI)     |
| AC12 | An MCP query from the main session; `rg -i mixpanel .claude/agents` finds nothing          |
| AC13 | Local stack with an empty token: no banner, no request (`qa-tester`); a unit test          |
| AC14 | `npm run verify`; CI builds the web image                                                  |
| AC15 | Screenshot of the footer at 1440 px next to the owner's; a test: one link, to `/privacy`   |
