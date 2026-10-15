# 0008 web analytics: tasks

Status: accepted (2026-10-15).
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
- [ ] **T8. Policy page.** `/privacy` with the placeholder text and "Настройки cookies" (plan §5).
      Check: a page test; `qa-tester` opens it from the banner; `npm run verify`.
      Commit: `feat(web): add the personal data policy page`
- [ ] **T9. Footer.** `widgets/footer` as Lamoda's: columns, bottom row, icons, tokens, narrow
      layouts, the version; the backlog item "Footer links" (plan §6, §9).
      Check: a test (every item rendered, one link, to `/privacy`); `qa-tester` screenshots at
      1440, 900 and 375 px for the owner to compare with the screenshot (AC15); `npm run verify`.
      Commit: `feat(web): rebuild the footer as lamoda's`
- [ ] **T10. Tracked element and backlog.** `'ui-kit.button-primary'` on `/ui-kit` (plan §8); the
      backlog item "Full CSP for web" (plan §9).
      Check: a test that the button sends both events; `npm run verify`.
      Commit: `feat(web): track the ui-kit primary button`

## PR 3 · `docs/0008-close` · acceptance

- [ ] 👤 Sets the Mixpanel project's time zone to Europe/Moscow and names the organization and
      project (spec, owner actions).
- [ ] **T11. Acceptance.** AC1–AC15 in production after PR 2 is deployed, each with its evidence
      below (plan, "How each criterion is verified"); 👤 checks AC10 and AC11 in the Mixpanel UI
      and AC15 against the screenshot. All files get `Status: done`; `CLAUDE.md` (opening paragraph)
      and `README.md` name the spec.
      Check: every criterion has evidence; `npm run verify`.
      Commit: `docs(specs): close spec 0008`

## Acceptance record

Filled in by T11.
