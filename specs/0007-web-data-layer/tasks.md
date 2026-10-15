# 0007 web data layer: tasks

Status: done (2026-10-15); amended 2026-10-15 in T4, T6 and T9–T11: the descriptions of T5 and T9
and the checks of T10 and T13 follow decisions H16–H30. History, not instructions.
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
- [x] **T10. Sentry.** `report.ts`: which failures, fingerprint, one event per cause per 60 s,
      tags; the greeting renders `errorText` and drops `console.error`. Removes the backlog item
      "api call failures in Sentry" (plan §3, §8).
      Check: unit tests (5xx, network, timeout, schema and 401 reported (H23); other 4xx and 429
      not, nor `path` (H17); a cut error body stays `http` (H30); an error that is not an
      `ApiError` reported by the component (H29); ten failures → one event; two templates → two
      fingerprints); `/` with the api stopped
      answers 200 with the Russian text. AC8 (unit part), AC13 (local part).
      Commit: `feat(web): report api failures to sentry once per cause`
- 👤 merges PR 2.

## PR 3 · `feat/0007-browser-data` · browser client, handoff, dev page

- [x] **T11. Browser client.** `clientFetch` on `/api` (15 s timeout); the dev rewrite in
      `next.config.ts`; QueryClient retry defaults in `_app/providers.tsx`. `CLAUDE.md`
      "Conventions": the browser calls the api only through `clientFetch` (plan §4).
      Check: unit tests of `clientFetch` and the retry policy (503 and network retried twice, 4xx
      and 429 never); locally `curl localhost:3001/api/products` answers the api's list. AC7 (unit
      part).
      Commit: `feat(web): add the browser api client`
- [x] **T12. Hooks and handoff.** Query options and hooks in the catalog slices' `index.ts`;
      `prefetch` and `HydrationBoundary` (plan §4, §5).
      Check: a test renders a hook under a hydrated cache and asserts no request; the same key on
      server and browser. AC4 (unit part).
      Commit: `feat(web): load catalog data in the browser after the server`
- [x] **T13. Dev page.** `web/app/dev/catalog`, `_pages/dev-catalog`, `noindex` (plan §9).
      Check: qa-tester: data in the HTML, no catalog request on load, brand filter and next page
      request `/api/...`, 404 and 400 cases show their texts; 503: a stubbed `/api/` answer (503
      `SERVICE_UNAVAILABLE` in the api's format) shows its text after two retries; with the api
      stopped the dev rewrite answers a plain 500 (T11, H26), so the general text, no retry; 429
      with the api limited, no retry; `curl` shows `noindex`. AC1, AC3, AC4, AC5 and AC7 (local), AC12 (local part).
      Commit: `feat(web): add a hidden page that shows the catalog data layer`
- [x] **T14. Bundle check.** `scripts/check-web-bundle.mjs` in `verify` after `build`, with a
      `node --test` case. Removes the backlog item "Web data layer" (plan §10).
      Check: `npm run verify`; a planted `x-proxy-secret` string in a client file turns it red
      (recorded here). AC6.
      Recorded 2026-10-15: `h.set('x-proxy-secret', …)` planted in `shared/api/client-fetch.ts`,
      `next build` passed and `npm run check:web-bundle` exited 1 naming
      `web/.next/static/chunks/1oajra54t-oyj.js`; reverted, it exits 0. As plan §10 lists, it
      searches the names, not the secret's value: no build holds the value (`verify` and CI build
      without it, images take no secrets, Next inlines only `NEXT_PUBLIC_`). A value a server
      component passes to a client one would reach the browser at request time, which no bundle
      check sees (H32, H33).
      Commit: `build(tooling): fail the build when server secrets reach the browser bundle`
- 👤 merges PR 3; it deploys.

## PR 4 · `docs/0007-close` · acceptance

- [x] **T15. Acceptance.** After PR 3 is deployed and 0006 PR 3 is merged: AC5, AC8, AC12, AC13 in
      production; every AC recorded below; all files `Status: done`; `CLAUDE.md` and `README.md`
      in line with what was built.
      Check: the acceptance record is complete.
      Recorded 2026-10-15 on `66c9da2` (blue). With the api up: `/dev/catalog` answers 200 with the
      30 products in its HTML and `noindex, nofollow`; `/` and `/ui-kit` do not link to it; the
      page's browser chunks hold `/api` and no api address or secret. Owner's network panel: no
      catalog request on load; a brand or page change requests
      `https://lamoda-ai-fitting.ru/api/products?brandId=…&limit=12&offset=0` and shows the new
      data; the unknown product id case answers 404 with its text and creates no Sentry issue.
      With the owner's OK, `ai-fitting-blue-api-1` was stopped 10:12:47–10:13:53 UTC: ten `curl` loads of
      `/dev/catalog` and three of `/` answered 200 with "Нет связи с сервером, попробуйте позже",
      `/api/products` 503 `SERVICE_UNAVAILABLE`. web's Sentry project got three issues, one per
      cause: `/products` (1 event), `/products/facets` (1 event, same trace as `/products`) and
      `/hello` (2 events: web's health check fetches `/` every 5 s and the outage outlasted the 60 s
      window). After the start `/` shows "Hello, world!" again.
      Commit: `docs(specs): record the acceptance of spec 0007`
- 👤 merges PR 4, which closes #28.

## Acceptance record

| AC   | Result | Evidence                                                                                                                                                                                                                                                                                                               |
| ---- | ------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| AC1  | pass   | a loader test per route against a stubbed `fetch` (T7); the dev page has the product list in its HTML locally (T13) and in production (T15)                                                                                                                                                                            |
| AC2  | pass   | `buildPath` unit tests: `../users`, `a/b`, empty, `.`/`..`, unicode, a path off the origin refused before any request (T5)                                                                                                                                                                                             |
| AC3  | pass   | unit tests per code, an unknown code and a non-envelope answer (T9); on the dev page locally the 404, 400 and stubbed 503 show their texts (T13's check, passed at the owner's review, results not written down); in production with the api stopped the dev page shows "Нет связи с сервером, попробуйте позже" (T15) |
| AC4  | pass   | a hook under a hydrated cache makes no request (T12); no catalog request on load in production (T15, owner's network panel); locally T13's check (results not written down)                                                                                                                                            |
| AC5  | pass   | in production a brand or page change requests `/api/products?…` and shows the new data (T15, owner's network panel)                                                                                                                                                                                                    |
| AC6  | pass   | `check:web-bundle` in `verify` searches the names; a planted header fails it (T14); the value: no build holds it (H32)                                                                                                                                                                                                 |
| AC7  | pass   | retry unit tests: 503 and network retried twice, 4xx and 429 never (T11); locally a stubbed 503 shows its text after two retries, a 429 its own text without a retry (T13's check, passed at the owner's review, results not written down)                                                                             |
| AC8  | pass   | unit: ten failures → one event, two routes → two fingerprints (T10); in production ten server-side (`curl`) loads with the api stopped made one issue per route, one event each (the window is per server process; in a browser, per tab); a 404 made none (T15)                                                       |
| AC9  | pass   | an unknown enum value fails the schema, is reported and shows the general text (T8–T10); an extra field is dropped (T7)                                                                                                                                                                                                |
| AC10 | pass   | a required field added to `ProductListItemDto`: `verify` red with 4 tests naming schema, target and field (recorded in T7)                                                                                                                                                                                             |
| AC11 | pass   | a DTO change without `-u` fails `openapi-snapshot.e2e-spec.ts` (T6, again in T7)                                                                                                                                                                                                                                       |
| AC12 | pass   | production: data in the HTML, `noindex, nofollow`, no link from `/` or `/ui-kit` (curl), browser calls to `/api` only (owner's network panel, chunks) (T15)                                                                                                                                                            |
| AC13 | pass   | production: "Hello, world!" with the api up; with it stopped `/` answers 200 with the Russian text and the failure is a Sentry issue (T15)                                                                                                                                                                             |
