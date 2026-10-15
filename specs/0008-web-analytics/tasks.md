# 0008 web analytics: tasks

Status: done (2026-10-16). History, not instructions.
Implements [plan.md](plan.md). `👤` marks a step only the owner can do.

## How the work flows

- One pull request per phase, merged with "Rebase and merge" once CI is green; the next branch
  starts from a fresh `main`. Before opening one, rebase onto `main` if a 0007 pull request merged
  meanwhile (J1, 0006 F1).
- Each task: brief from `spec-finder`, a time estimate, the code, `finish-task`, the owner's OK, one
  commit that ticks its box.
- The last pull request carries `Closes #40` under "Что сделано".

## PR 1 · `docs/0008-spec` · documents

- [x] **T1. Spec and clarifications.** `spec.md`, `clarifications.md` (J1–J21).
      Check: owner's acceptance of `spec.md`.
      Commit: `docs(specs): add spec 0008 web analytics`
- [x] **T2. Plan.** `plan.md`; J16 revised and J22 added (the footer), the spec amended with AC15.
      Check: owner's acceptance of `plan.md`.
      Commit: `docs(specs): add the plan of spec 0008`
- [x] **T3. Tasks.** This file.
      Check: owner's acceptance; `npm run format:check`.
      Commit: `docs(specs): add the tasks of spec 0008`

## PR 2 · `feat/0008-analytics` · MCP, analytics, consent, policy, footer

- [x] **T4. MCP server.** `.mcp.json` (plan §7); `.claude/README.md`: the server, why the main
      session only, the built-in agents' inheritance.
      Check: 👤 restarts Claude Code, approves the server, signs in with `/mcp`; the main session
      lists the project 4073843 through MCP (AC12, first half).
      Commit: `chore(tooling): add the mixpanel mcp server`
- [x] **T5. Token variable.** `NEXT_PUBLIC_MIXPANEL_TOKEN` in `web/Dockerfile`,
      `scripts/ci-build-images.sh`, `images.yml`, `docker-compose.yml`, `.env.example`,
      `deploy/README.md`; `shared/config/public-env.ts` and the barrel `shared/config/index.ts`
      (plan §2).
      Check: `npm run verify`; `docker compose config web` shows the variable, empty.
      Commit: `build(web): pass the mixpanel token to the web build`
- [x] 👤 Creates the repository variable `NEXT_PUBLIC_MIXPANEL_TOKEN` (deploy/README.md), any time
      before PR 2 merges; Claude reminds the owner at T5 with the command.
      Check (Claude): `gh variable list` shows it, and its value equals the project token in
      Mixpanel's project settings.
- [x] **T6. Analytics client.** `mixpanel-browser` (plan §1, checked by `CONTRIBUTING.md`);
      `shared/analytics`: `events.ts`, `client.ts`, `use-tracked-element.ts` and their tests;
      `CLAUDE.md` "Conventions" and the web row of "Stack and versions", the `README.md` line
      (plan §3, §9, J27).
      Check: unit tests (start once, no-op before start, empty token, failed load, stop, start
      again after stop or a stored opt-out, hover 499/500 ms, once per page, reset on path change);
      the `@ts-expect-error` test (AC9); `npm run verify`.
      Commit: `feat(web): add the analytics client`
- [x] **T7. Consent.** `features/cookie-consent`: the store, the banner, the gate, the settings
      button; `--z-banner`; `_app/providers.tsx` (plan §4); the gate calls `useHoverReset()`.
      Check: unit tests (no answer, granted, denied, 366 days old, storage error, reopen, empty
      token, the gate resets hovers on a path change); `qa-tester` on the local stack with an empty token (AC13) and with a dummy token and
      Mixpanel requests intercepted (AC1–AC6); `npm run verify`.
      Commit: `feat(web): ask for analytics consent`
- [x] **T8. Policy page.** `/privacy` with the placeholder text and "Настройки cookies" (plan §5).
      Check: a page test; `qa-tester` opens it from the banner; `npm run verify`.
      Commit: `feat(web): add the personal data policy page`
- [x] **T9. Footer.** `widgets/footer` as Lamoda's: columns, bottom row, icons, tokens, narrow
      layouts, the version; the backlog item "Footer links" (plan §6, §9).
      Check: a test (every item rendered, one link, to `/privacy`); `qa-tester` screenshots at
      1440, 900 and 375 px for the owner to compare with the screenshot (AC15); `npm run verify`.
      Commit: `feat(web): rebuild the footer as lamoda's`
- [x] **T10. Tracked element and backlog.** `'ui-kit.button-primary'` on `/ui-kit` (plan §8); the
      backlog item "Full CSP for web" (plan §9).
      Check: a test that the button sends both events; `npm run verify`.
      Commit: `feat(web): track the ui-kit primary button`

## PR 3 · `docs/0008-close` · acceptance

- [x] 👤 Sets the Mixpanel project's time zone to Europe/Moscow and names the organization and
      project (spec, owner actions).
- [x] **T11. Acceptance.** AC1–AC15 in production after PR 2 is deployed, each with its evidence
      below (plan, "How each criterion is verified"); 👤 checks AC10 and AC11 in the Mixpanel UI
      and AC15 against the screenshot. All files get `Status: done`; `CLAUDE.md` (opening paragraph)
      and `README.md` name the spec.
      Check: every criterion has evidence; `npm run verify`.
      Commit: `docs(specs): close spec 0008`

## Acceptance record

Production checks on 2026-10-16 with main at `91f66b8`, in a private window with no ad blocker and
no Do Not Track; Mixpanel data read through the MCP server (project 4073843).

| AC   | Result | Evidence                                                                                                                                                                                                                                                                                       |
| ---- | ------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| AC1  | pass   | production, new private window: banner shown, no request to a Mixpanel domain (owner's network panel); the page's initial scripts hold the SDK's settings but not the SDK (no `mp_lib`/`MixpanelLib`, curl of every script of `/`)                                                             |
| AC2  | pass   | production: "Отказаться", reload, `/ui-kit`: no banner, no Mixpanel request (owner's network panel); `consent-store.test.ts`                                                                                                                                                                   |
| AC3  | pass   | production: "Принять" sends to `api-eu.mixpanel.com` (owner's network panel); MCP: the page view of `/?utm_source=ac7&utm_campaign=spec-0008` with no other click, and page views of `/ui-kit` after a navigation                                                                              |
| AC4  | pass   | production: a bar at the bottom, "Принять" and "Отказаться" of equal weight, its link opens `/privacy` with the placeholder text (owner); component tests                                                                                                                                      |
| AC5  | pass   | production: `/privacy`, "Настройки cookies", "Отказаться": no further request (owner's network panel); MCP: that page view of `/privacy` is the project's last event; unit test of the gate                                                                                                    |
| AC6  | pass   | `consent-store.test.ts` (another tab through the storage event, 364 days kept, 366 days asked again); production: the answer survives a reload and a new tab (owner)                                                                                                                           |
| AC7  | pass   | MCP: 5 page views with `utm_source=ac7`, `utm_campaign=spec-0008`                                                                                                                                                                                                                              |
| AC8  | pass   | MCP: one `Element Clicked` and one `Element Hovered`, `element=ui-kit.button-primary` on `/ui-kit#buttons`; a second hover of 500 ms and a short one sent none; unit tests of `useTrackedElement`                                                                                              |
| AC9  | pass   | `events.test.ts`: `// @ts-expect-error` on an unknown event and property, checked by `npm run typecheck` in `verify`                                                                                                                                                                           |
| AC10 | pass   | the heatmap of `/ui-kit` shows the clicks of AC8 (owner, Mixpanel UI); it had no data until the session's replay was processed, about an hour later                                                                                                                                            |
| AC11 | pass   | the replay of that session: text, inputs and images masked (owner, Mixpanel UI)                                                                                                                                                                                                                |
| AC12 | pass   | MCP queries above from the main session; `rg -i mixpanel .claude/agents` finds nothing; `.mcp.json` signs in through OAuth                                                                                                                                                                     |
| AC13 | pass   | local stack with an empty token (`qa-tester`): `/`, `/privacy`, `/ui-kit`, a click and a hover: no banner, no "Настройки cookies", no request to a Mixpanel domain; `client.test.ts`, `consent-banner.test.tsx`. `next dev` downloads the SDK's chunk from the local server without running it |
| AC14 | pass   | `npm run verify`; CI on main `91f66b8` green, the web image built and published                                                                                                                                                                                                                |
| AC15 | pass   | `footer.test.tsx`: one link, to `/privacy`; production HTML of `/`: one footer link, `/privacy`; a screenshot at 1440 px (local stack, the same code) matches the owner's (owner)                                                                                                              |
