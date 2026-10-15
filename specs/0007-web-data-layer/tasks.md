# 0007 web data layer: tasks

Status: accepted (2026-10-15).
Implements [plan.md](plan.md). `👤` marks a step only the owner can do.

## How the work flows

- One pull request per phase, merged with "Rebase and merge" once CI is green; the next branch
  starts from a fresh `main`. Before opening one, rebase onto `main` if a 0006 pull request merged
  meanwhile (H1, 0006 F1).
- Each task: brief from `spec-finder`, a time estimate, the code, `finish-task`, the owner's OK, one
  commit that ticks its box.
- T9 and later start after 0006 PR 2 merges (H1); T4–T8 do not need it.
- The last pull request carries `Closes #28` under "Что сделано" (H2).

## PR 1 · `docs/0007-spec` · documents

- [x] **T1. Spec and clarifications.** `spec.md`, `clarifications.md` (H1–H15); the backlog notes
      the overlap with 0006.
      Check: owner's acceptance of `spec.md`.
      Commit: `docs(specs): add spec 0007`
- [x] **T2. Plan.** `plan.md`; H2 revised (four pull requests), H16 added.
      Check: owner's acceptance of `plan.md`.
      Commit: `docs(specs): add the plan of spec 0007`
- [x] **T3. Tasks.** This file.
      Check: owner's acceptance; `npm run format:check`.
      Commit: `docs(specs): add the tasks of spec 0007`

## PR 2 · `feat/0007-server-data` · server side, schemas, errors, Sentry

- [x] **T4. Second public entry.** `.claude/skills/fsd/SKILL.md`, `.claude/agents/fsd-reviewer.md`
      and `.claude/README.md` allow `server.ts` next to `index.ts` for server-only exports
      (plan §7, H16). H16 settled with the owner during T4; plan §1 and T5 gained the move of
      `shared/config` and `shared/redis`.
      Check: `npm run verify`; 👤 restarts Claude Code.
      Commit: `chore(tooling): allow a server-only public entry in fsd slices`
- [x] **T5. `shared/api` split and paths.** `index.ts` / `server.ts`; `buildPath` and `ApiPath`;
      `query` serialization; one response step shared by both clients (status, schema →
      `ApiError` with `kind`); `apiFetch` takes an `ApiPath`. `entities/greeting/server.ts`;
      `shared/config/server.ts` and `shared/redis/server.ts` in place of their `index.ts` (H16).
      `CLAUDE.md` "Conventions" and the `fsd` skill's example point to `@/shared/api/server`
      (plan §1, §8).
      Check: unit tests of `buildPath` (`../users`, `a/b`, empty, unicode) and the origin check;
      existing `apiFetch` tests pass on the new entry; `/` still shows "Hello, world!". AC2.
      Commit: `refactor(web): split the api client into browser-safe and server-only entries`
- [x] **T6. OpenAPI snapshot and contract helper.** `api/test/openapi-snapshot.e2e-spec.ts` with
      `toMatchFileSnapshot('../openapi.json')`, `api/openapi.json`, `.prettierignore`; the web
      helper comparing a zod schema with an OpenAPI component (plan §6).
      Check: a DTO change without `-u` fails the api tests; helper unit tests (missing, extra,
      wrong type, nullable, enum). AC11.
      Commit: `test(api): keep a snapshot of the openapi document`
- [x] **T7. Catalog entities.** Slices `category`, `brand`, `attribute`, `product`: schemas, server
      query options in `server.ts`, contract tests per schema (plan §5).
      Check: a loader per route against a stubbed `fetch`; an extra field is dropped; adding a
      field to a DTO locally turns `verify` red, naming it (recorded here). AC1, AC9 (extra
      field), AC10.
      Recorded 2026-10-15: a required `colorName` added to `ProductListItemDto` (optional in TS,
      so the api still compiles) fails the snapshot test until `-u`; after `-u`, `npm run verify`
      exits 1 with 4 failed tests, each naming the schema, the target and the field, e.g.
      "productListItemSchema ↔ ProductListItemDto: colorName: in api, missing in web" and
      "productListSchema ↔ GET /products 200: items[].colorName: …". Reverted.
      Commit: `feat(web): add typed catalog entities`
- [x] **T8. Admin-only entities.** Slices `user`, `fitting-session`, `generation`: schemas and
      types only, contract tests (H3).
      Check: contract tests; an unknown `GenerationStatus` fails the schema.
      Commit: `feat(web): add schemas for users, fitting sessions and generations`
- [x] **T9. Errors and texts.** The response step parses the error envelope into `code` and
      `details`; `error-text.ts` with the texts of every api and `details` code, 0006's included;
      the contract check of the dictionary against `ErrorCode` (plan §1, §2, §6). Starts after
      0006 PR 2.
      Check: unit tests per code, unknown code, non-envelope answer (nginx HTML); a code missing
      from the dictionary fails the contract test. AC3 (unit part), AC9 (unknown enum shows the
      general text).
      Commit: `feat(web): read api errors and show them in russian`
- [ ] **T10. Sentry.** `report.ts`: which failures, fingerprint, one event per cause per 60 s,
      tags; the greeting renders `errorText` and drops `console.error`. Removes the backlog item
      "api call failures in Sentry" (plan §3, §8).
      Check: unit tests (5xx, network, timeout, schema and 401 reported (H23); other 4xx and 429
      not; ten failures → one event; two templates → two fingerprints); `/` with the api stopped
      answers 200 with the Russian text. AC8 (unit part), AC13 (local part).
      Commit: `feat(web): report api failures to sentry once per cause`
- 👤 merges PR 2.

## PR 3 · `feat/0007-browser-data` · browser client, handoff, dev page

- [ ] **T11. Browser client.** `clientFetch` on `/api` (15 s timeout); the dev rewrite in
      `next.config.ts`; QueryClient retry defaults in `_app/providers.tsx`. `CLAUDE.md`
      "Conventions": the browser calls the api only through `clientFetch` (plan §4).
      Check: unit tests of `clientFetch` and the retry policy (503 and network retried twice, 4xx
      and 429 never); locally `curl localhost:3001/api/products` answers the api's list. AC7 (unit
      part).
      Commit: `feat(web): add the browser api client`
- [ ] **T12. Hooks and handoff.** Query options and hooks in the catalog slices' `index.ts`;
      `prefetch` and `HydrationBoundary` (plan §4, §5).
      Check: a test renders a hook under a hydrated cache and asserts no request; the same key on
      server and browser. AC4 (unit part).
      Commit: `feat(web): load catalog data in the browser after the server`
- [ ] **T13. Dev page.** `web/app/dev/catalog`, `_pages/dev-catalog`, `noindex` (plan §9).
      Check: qa-tester: data in the HTML, no catalog request on load, brand filter and next page
      request `/api/...`, 404 and 400 cases show their texts, 503 and 429 with the api stopped or
      limited; `curl` shows `noindex`. AC1, AC3, AC4, AC5 and AC7 (local), AC12 (local part).
      Commit: `feat(web): add a hidden page that shows the catalog data layer`
- [ ] **T14. Bundle check.** `scripts/check-web-bundle.mjs` in `verify` after `build`, with a
      `node --test` case. Removes the backlog item "Web data layer" (plan §10).
      Check: `npm run verify`; a planted `x-proxy-secret` string in a client file turns it red
      (recorded here). AC6.
      Commit: `build(tooling): fail the build when server secrets reach the browser bundle`
- 👤 merges PR 3; it deploys.

## PR 4 · `docs/0007-close` · acceptance

- [ ] **T15. Acceptance.** After PR 3 is deployed and 0006 PR 3 is merged: AC5, AC8, AC12, AC13 in
      production; every AC recorded below; all files `Status: done`; `CLAUDE.md` and `README.md`
      in line with what was built.
      Check: the acceptance record is complete.
      Commit: `docs(specs): record the acceptance of spec 0007`
- 👤 merges PR 4, which closes #28.

## Acceptance record

| AC   | Result | Evidence |
| ---- | ------ | -------- |
| AC1  |        |          |
| AC2  |        |          |
| AC3  |        |          |
| AC4  |        |          |
| AC5  |        |          |
| AC6  |        |          |
| AC7  |        |          |
| AC8  |        |          |
| AC9  |        |          |
| AC10 |        |          |
| AC11 |        |          |
| AC12 |        |          |
| AC13 |        |          |
