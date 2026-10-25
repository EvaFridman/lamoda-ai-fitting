# 0022 stores: Lamoda Sport stores on a Yandex map: tasks

Status: accepted (2026-10-26).

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

- [ ] **T4. The stores table and seed (X1, X2; plan §2.1, §2.2).** `StoreType`, `Store` in
      `schema.prisma`; migration `…_stores` with its CHECKs; rows in `constraint-fields.ts`;
      `seed/stores.data.ts` (48 stores, cleaned); `seedStores()` in `SeedService`.
      Check: `stores.data.spec.ts` against the source JSON; the seed e2e (twice → 48 rows); the
      migration applied locally (`prisma migrate dev`, `seed:dev`).
      Commit: `feat(api): add lamoda sport stores to the database`
- [ ] **T5. `GET /stores` (X2; plan §2.3).** `stores/` module, controller, service,
      `StoreResponseDto`; `PUBLIC_HANDLERS`; `openapi.json` (`-u`).
      Check: database e2e (no cookie, 200, 48 rows in order, fields, no `code`/`position`);
      access and throttle marker tests; OpenAPI snapshot; AC1, AC2.
      Commit: `feat(api): add the public stores read`

### web: the page without the map

- [ ] **T6. The store entity (X7, X8; plan §3.1).** `entities/store`: schemas and contract test,
      keys, `getStores` (page cache), `storeListOptions`, `useStores`, `lib/search.ts`,
      `lib/links.ts`, `ui/store-card`.
      Check: Vitest (contract, `matchStores` cases of AC7, `telHref`, `routeHref`, the card's
      details, links and `aria-expanded`); AC4.
      Commit: `feat(web): add the store entity`
- [ ] **T7. The stores page with its list (X3, X4, X7, X8, X9, X15, X17; plan §3.3, §3.4, §4).**
      Needs the owner's SVGs (spec, owner actions). `AccountShell`'s `public`; `_pages/stores`
      (heading, legend, `SearchField`, list, «Ничего не нашлось», the map's place left empty);
      the route; `account-stubs` without `StoresPage`; the warm-up entry; the zone `stores` with
      `stores.card`, `stores.details`, `stores.phone`, `stores.route` and `Stores Searched`;
      `EVENTS.md`.
      Check: Vitest (signed out and in, search, details, debounce of `Stores Searched`),
      `routes.test.ts`, `catalog.test.ts`; qa-tester AC3, AC4, AC7, AC15 at 375 and 1280 px.
      Commit: `feat(web): list the lamoda sport stores on the stores page`
- [ ] **T8. Footer, menus and privacy (X6, X11, X16, X18; plan §3.4).** The footer's link with `footer.link` (zone `footer`); `fullLoad` in
      `account-sections.ts` and plain links in the side menu, the profile menu and the burger menu;
      the `/privacy` paragraph.
      Check: Vitest (footer href and plain anchor, each menu's anchor, privacy text,
      `catalog.test.ts`); AC13, AC14.
      Commit: `feat(web): link the stores page from the footer and the menus`

### web: the map

- [ ] **T9. The map's policy and key (X13, X16; plan §3.5, §3.6).** `policy.ts`'s `yandexMaps`,
      `proxy.ts` by path; `NEXT_PUBLIC_YANDEX_MAPS_API_KEY` through `images.yml`,
      `ci-build-images.sh`, `web/Dockerfile`, `public-env.ts`, `docker-compose.yml`,
      `.env.example`. The owner puts the key into the local `.env`.
      Check: `policy.test.ts` and `proxy.test.ts` (the stores path has Yandex's list, `/catalog`,
      `/customer`, `/customer/stores/x` do not); `npm run verify` (`check:web-shells`,
      `check:web-bundle` unchanged).
      Commit: `feat(web): allow yandex maps on the stores page`
- [ ] **T10. The map (X5, X10, X12, X14, X17; plan §3.2, §3.3, §4).** `@yandex/ymaps3-clusterer`,
      `@yandex/ymaps3-types` (versions checked, CONTRIBUTING); `widgets/stores-map` (loader,
      pins, clusters, selection, fit, placeholder); the page's map and phone tabs; `stores.pin`,
      `stores.tab`, `sdkPerVisit` 17; `EVENTS.md`. Fonts or frames the browser blocks go into the
      policy only after they are seen (plan §3.5).
      Check: Vitest (placeholder without a key, the loader once, `fit.ts`, tabs and switch on
      select); `npm run verify`; qa-tester with the owner's key AC5, AC6, AC8, AC9, AC10 and the
      console free of CSP violations, at 375 and 1280 px.
      Commit: `feat(web): show the stores on a yandex map`
- 👤 adds the repository variable `NEXT_PUBLIC_YANDEX_MAPS_API_KEY` (plan §3.6), then merges PR 2.

## PR 3 · `docs/0022-close` · closing

- [ ] **T11. Close the spec.** AC11 on lamoda-ai-fitting.ru; the acceptance record below
      (AC1–AC17 with evidence); `CLAUDE.md` (the stores table and route, the page, the map's CSP
      on one path, the key, the zones `stores` and `footer`, the summary's spec list), `README.md`
      (the key in local setup), `backlog.md` ("Footer links" without the stores' entry); every file
      `Status: done`.
      Check: `npm run format:check`; the owner's check on a real phone.
      Commit: `docs(specs): close spec 0022`

## Acceptance record

Filled at T11.
