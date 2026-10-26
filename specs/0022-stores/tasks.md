# 0022 stores: Lamoda Sport stores on a Yandex map: tasks

Status: done (2026-10-26); amended 2026-10-26 at the review of PR 1 (T4: X22; T6, T10, T11:
X19–X21), at T9 (T9, T10: X23, X24) and at T10 (X25, X26).

## How the work flows

- One pull request per phase, merged with "Rebase and merge" once CI is green; the next branch
  starts from a fresh `main`.
- Each task: brief from `spec-finder`, a time estimate, the code, `finish-task`, the owner's OK, one
  commit that ticks its box. A fresh session (or `/clear`) per task.
- Reviewers beside `code-reviewer`: `security-reviewer` on the api route, the migration, the CSP,
  the env path and the rendering of store data (T4, T5, T7, T9, T10); `fsd-reviewer` on every web
  task.
- `qa-tester` checks at 375 and 1280 px; the owner's screenshots (X0) are described in
  `clarifications.md`.
- A pull request holds documents only or code only: the documents (PR 1), all the code (PR 2), the
  closing after the deploy (PR 3, AC11 needs the site).

## PR 1 · `docs/0022-stores` · documents

- [x] **T1. Spec and clarifications.** `spec.md`, `clarifications.md` (X0–X15), the stores'
      source `source/lamoda-stores.json`.
      Check: owner's acceptance of `spec.md`.
      Commit: `docs(specs): add the stores spec and its decisions`
- [x] **T2. Plan.** `plan.md`, `clarifications.md` (X16–X18).
      Check: owner's acceptance of `plan.md`.
      Commit: `docs(specs): add the stores plan`
- [x] **T3. Tasks.** This file.
      Check: owner's acceptance; `npm run format:check`.
      Commit: `docs(specs): add the tasks of spec 0022`
- 👤 merges PR 1.

## PR 2 · `feat/0022-stores` · the code

### api

- [x] **T4. The stores table and seed (X1, X2; plan §2.1, §2.2).** `StoreType`, `Store` in
      `schema.prisma`; migration `…_stores` with its CHECKs; rows in `constraint-fields.ts`;
      `seed/stores.data.ts` (48 stores, cleaned); `seedStores()` in `SeedService`.
      Check: the one-off comparison with the source JSON (X22, result in the summary);
      `stores.data.spec.ts` (invariants); the seed e2e (twice → 48 rows); the
      migration applied locally (`prisma migrate dev`, `seed:dev`).
      Commit: `feat(api): add lamoda sport stores to the database`
- [x] **T5. `GET /stores` (X2; plan §2.3).** `stores/` module, controller, service,
      `StoreResponseDto`; `PUBLIC_HANDLERS`; `openapi.json` (`-u`).
      Check: database e2e (no cookie, 200, 48 rows in order, fields, no `code`/`position`);
      access and throttle marker tests; OpenAPI snapshot; AC1, AC2.
      Commit: `feat(api): add the public stores read`

### web: the page without the map

- [x] **T6. The store entity (X7, X8, X20; plan §3.1).** `entities/store`: schemas and contract test,
      keys, `getStores` (page cache), `storeListOptions`, `useStores`, `lib/search.ts`,
      `lib/links.ts`, `ui/store-card`.
      Check: Vitest (contract, `matchStores` cases of AC7, `telHref`, `routeHref`, the card's
      details, links and `aria-expanded`); AC4.
      Commit: `feat(web): add the store entity`
- [x] **T7. The stores page with its list (X3, X4, X7, X8, X9, X15, X17; plan §3.3, §3.4, §4).**
      Needs the owner's SVGs (spec, owner actions). `AccountShell`'s `public`; `_pages/stores`
      (heading, legend, `SearchField`, list, «Ничего не нашлось», the map's place left empty);
      the route; `account-stubs` without `StoresPage`; the warm-up entry; the zone `stores` with
      `stores.card`, `stores.details`, `stores.phone`, `stores.route` and `Stores Searched`;
      `EVENTS.md`.
      Check: Vitest (signed out and in, search, details, debounce of `Stores Searched`),
      `routes.test.ts`, `catalog.test.ts`; qa-tester AC3, AC4, AC7, AC15 at 375 and 1280 px.
      Commit: `feat(web): list the lamoda sport stores on the stores page`
- [x] **T8. Footer, menus and privacy (X6, X11, X16, X18; plan §3.4).** The footer's link with `footer.link` (zone `footer`); `fullLoad` in
      `account-sections.ts` and plain links in the side menu, the profile menu and the burger menu;
      the `/privacy` paragraph.
      Check: Vitest (footer href and plain anchor, each menu's anchor, privacy text,
      `catalog.test.ts`); AC13, AC14.
      Commit: `feat(web): link the stores page from the footer and the menus`

### web: the map

- [x] **T9. The map's policy and key (X13, X16, X24; plan §3.5, §3.6).** `policy.ts`'s
      `yandexMaps`, `proxy.ts` by path (`STORES_HREF`); `NEXT_PUBLIC_YANDEX_MAPS_API_KEY` through
      `images.yml`, `ci-build-images.sh`, `web/Dockerfile`, `public-env.ts`, `docker-compose.yml`,
      `.env.example`, `deploy/README.md`; `AccountShell` leaves the stores page in full (X24).
      The owner puts the key into the local `.env`.
      Check: `policy.test.ts` and `proxy.test.ts` (the stores path has Yandex's list, `/catalog`,
      `/customer`, `/customer/stores/x` do not); `npm run verify` (`check:web-shells`,
      `check:web-bundle` unchanged).
      Commit: `feat(web): allow yandex maps on the stores page`
- [x] **T10. The map (X5, X10, X12, X14, X16, X17, X19; plan §3.2, §3.3, §4).**
      `@yandex/ymaps3-clusterer`, `@yandex/ymaps3-types` (versions checked, CONTRIBUTING);
      `widgets/stores-map` (loader, pins, clusters, selection, fit, placeholder); the page's map,
      phone tabs and the card over the map on a pin's click; `stores.pin`, `stores.tab`,
      `sdkPerVisit` 17; `EVENTS.md`. `yastatic.net`, fonts or frames go into the policy only after
      the browser shows them blocked (plan §3.5); `script-src`'s `https://api-maps.yandex.ru`
      narrowed to `/v3/` if the map loads with it (X23).
      Check: Vitest (placeholder without a key, the loader once, `fit.ts`, tabs, switch on select,
      the card over the map and its close); `npm run verify`; qa-tester with the owner's key AC5, AC6, AC8, AC9, AC10 and the
      console free of CSP violations, at 375 and 1280 px.
      Commit: `feat(web): show the stores on a yandex map`
- 👤 adds the repository variable `NEXT_PUBLIC_YANDEX_MAPS_API_KEY` (plan §3.6), then merges PR 2.

## PR 3 · `docs/0022-close` · closing

- [x] **T11. Close the spec.** AC11 on lamoda-ai-fitting.ru; the acceptance record below
      (AC1–AC17 with evidence); `CLAUDE.md` (the stores table and route, the page, the map's CSP
      on one path, the key, the zones `stores` and `footer`, the summary's spec list), `README.md`
      (the key in local setup), `backlog.md` ("Footer links" without the stores' entry; a new item:
      the Yandex key's daily requests and the paid plan, X21); every file `Status: done`.
      Check: `npm run format:check`; the owner's check on a real phone; the owner's first week of
      the key's statistics (X21).
      Commit: `docs(specs): close spec 0022`

## Acceptance record

Checked 2026-10-26 after PR 2 (#114) was merged and deployed (`main` 8bb8588, CI with the deploy
green). "Production" is lamoda-ai-fitting.ru, checked with curl by the main session.

| AC   | Result | Evidence                                                                                                                                                                                                                                                                                       |
| ---- | ------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| AC1  | ✅     | T4: `stores.data.spec.ts`, `seed.e2e-spec.ts` (the seed twice → 48 rows), the comparison with the source (X22). T5: `stores.e2e-spec.ts` (no cookie, 200, 48 rows in order, the fields, no `code`/`position`). Production: `GET /api/stores` without a cookie, 48 stores with the 13 fields.   |
| AC2  | ✅     | T5: `throttle-markers.e2e-spec.ts` (no skip, the `read` tier). Production: the answer carries `X-RateLimit-Limit-read-minute` and `-read-burst`.                                                                                                                                               |
| AC3  | ✅     | T7: `stores-page.test.tsx` and `account-shell.test.tsx` (signed out and in, `public`); qa-tester on the local stack at 375 and 1280 px.                                                                                                                                                        |
| AC4  | ✅     | T6: `store-card.test.tsx` (details, `tel:` links, the route's link and `target`, `aria-expanded`, no metro or phone line, X20), `links.test.ts`; T7: qa-tester.                                                                                                                                |
| AC5  | ✅     | T10: the owner in the browser with the key (pins, circles, a zoom splitting them, Yandex's logo, copyright and «Открыть в Картах»).                                                                                                                                                            |
| AC6  | ✅     | T10: `stores-view.test.tsx` (a card's click fits the map and selects its pin, a pin's click selects the store), `fit.test.ts`; the card marked and the list scrolled to it on a pin's click: qa-tester at 1280 px only.                                                                        |
| AC7  | ✅     | T6: `search.test.ts` («Ладожская», «Екатеринбург», no match, empty text); T7: `stores-view.test.tsx` with fixtures; the seed's 48 stores: qa-tester.                                                                                                                                           |
| AC8  | ✅     | T10: `fit.test.ts` (`START_LOCATION`), qa-tester.                                                                                                                                                                                                                                              |
| AC9  | ✅     | T10: `stores-view.test.tsx` (tabs, the switch on a card's click, the card over the map and its close), qa-tester at 375 px; tabs below 1024 px (X25).                                                                                                                                          |
| AC10 | ✅     | T10: `stores-map.test.tsx` (the placeholder without a key), `load-ymaps.test.ts` (a failed or slow load); qa-tester without a key.                                                                                                                                                             |
| AC11 | ✅     | The owner, 2026-10-26, in the browser on production: the map loads, no CSP violation in the console. Production's policy on `/customer/stores` holds `https://api-maps.yandex.ru/v3/`, yastatic's `maps-front-jsapi-3` folder and `'unsafe-eval'` (X16, X23); `/catalog`'s has none of Yandex. |
| AC12 | —      | Removed (X7).                                                                                                                                                                                                                                                                                  |
| AC13 | ✅     | T8: `footer.test.tsx`, `footer-link.test.tsx` (the `href`, a plain `<a>`).                                                                                                                                                                                                                     |
| AC14 | ✅     | T8: `privacy-page.test.tsx`.                                                                                                                                                                                                                                                                   |
| AC15 | ✅     | T7: `routes.test.ts`, the `noindex` of `app/customer`'s layout in `_pages/customer/model/metadata.test.ts`. The deploy of 8bb8588: `warm-up: /customer/stores 200`, first 32–111 ms. Production without a cookie: 200 and `<meta name="robots" content="noindex, nofollow"/>`.                 |
| AC16 | ✅     | T7, T8, T10: `catalog.test.ts`, `EVENTS.md` regenerated; the zones `stores` and `footer` as X17, X18 chose, `Stores Searched` carries only `query_length` and `results`, no property names a store.                                                                                            |
| AC17 | ✅     | `npm run verify` at T9 and T10; CI green on #114 and on `main` 8bb8588.                                                                                                                                                                                                                        |

Owner's checks after the deploy: the page on a real phone, OK (2026-10-26); the key's request statistics daily for the first week (X21), then the backlog item "Yandex Maps
key's requests and the paid plan".
