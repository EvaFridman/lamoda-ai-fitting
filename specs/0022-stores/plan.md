# 0022 stores: plan

Status: done (2026-10-26); amended 2026-10-26 at the tasks (no header change: X7) and at the
review of PR 1 (§2.2: X22; §3.3: X19, X20; §3.5, §5: X16) and after the owner read Yandex's
terms (§3.6: the cabinet's menu) and at T10 (§3.3: X25, X26).

How [spec.md](spec.md) is built. Decisions: [clarifications.md](clarifications.md) (X0–X26).

## 1. Overview

```
lamoda-stores.json ──(transcribed, cleaned)──▶ api/src/seed/stores.data.ts ──seed──▶ table stores
                                                                                        │
web: /customer/stores ◀── getStores (page cache) ◀── GET /stores (@Public, read tier) ◀─┘
      │  AccountShell (public section, X4, X15)
      ├─ StoresView (client): search, selection, details, phone tabs (X7, X8, X10)
      │    ├─ StoreCard × N            (entities/store)
      │    └─ StoresMap                (widgets/stores-map: Yandex JS API v3, X5)
      └─ proxy.ts: CSP with Yandex's origins and 'unsafe-eval' on this path only (X16)
```

No new api dependency. web adds `@yandex/ymaps3-clusterer` (runtime) and `@yandex/ymaps3-types`
(types only); both are checked against the registry at their task (CONTRIBUTING's rules; on
2026-10-26 the latest were `0.0.13` and `1.0.21703254`, both published 2026-10-20).

## 2. api

### 2.1 Table `stores` (migration `…_stores`)

`schema.prisma`:

```prisma
enum StoreType {
  sport
  urban
  outlet
  @@map("store_type")
}

model Store {
  id            String    @id @default(dbgenerated("uuidv7()")) @db.Uuid
  code          String    @unique                  // Lamoda's store code (X1), the seed's natural key
  position      Int       @unique                  // the list's order: Lamoda's
  name          String
  type          StoreType
  city          String
  street        String
  house         String
  mall          String
  latitude      Float
  longitude     Float
  metroStations String[]  @default([]) @map("metro_stations")
  workTime      String    @map("work_time")
  description   String
  phones        String[]  @default([])
  createdAt     DateTime  @default(now()) @map("created_at") @db.Timestamptz(3)
  @@map("stores")
}
```

CHECKs in `migration.sql`: `code ~ '^[a-z0-9]{4}$'`, `position >= 0`, `latitude BETWEEN -90 AND
90`, `longitude BETWEEN -180 AND 180`, and every text column non-empty and trimmed
(`~ '^\S(.*\S)?$'`, as `ai_generations_prompt_text_check`). `constraint-fields.ts` gets a row per
constraint. Additive only: an older release ignores the table.

The order is Lamoda's (Moscow, its region, Saint Petersburg, then other cities in alphabetical
order), kept by `position`, so the list opens on the stores the map shows first (X7).

### 2.2 Seed

- `api/src/seed/stores.data.ts`: `STORES: SeedStore[]`, transcribed from
  `specs/0022-stores/source/lamoda-stores.json` in its order, with only the kept fields (X1):
  `code` ← `store_warehouse_code`, `type` ← `Lamoda Sport` / `… Urban` / `… Outlet`,
  `metroStations` ← `underground_station`, `workTime` ← `work_time`, `mall` ← `shopping_mall`.
  Cleaning: `&nbsp;` → space, runs of spaces → one, trimmed (`ТЦ  Командор Outlet`, `Макси `).
  Phones keep Lamoda's text.
- At T4 a script outside the repository (the scratchpad) compares `stores.data.ts` with the source
  JSON once: the same 48 codes in the same order, each kept field equal after the cleaning; its
  result goes into the task's summary (X22). `stores.data.spec.ts` (unit) checks what holds for any
  list: codes unique and of the CHECK's shape, positions unique, coordinates in range, every text
  trimmed and non-empty, types known. No api test reads `specs/`.
- `SeedService.seedStores()`: `createMany({ data, skipDuplicates: true })` by `code` (and
  `position`), after the catalog; it never updates (CLAUDE.md, seed). The database seed e2e gets a
  case: twice → 48 rows.

### 2.3 `GET /stores`

`api/src/stores/`: `StoresController.list` (`@Public()`, read tier, `@ApiOkResponse({ type:
StoreResponseDto, isArray: true })`) → `StoresService.list()` (`findMany`, `orderBy: { position:
'asc' }`) → `StoreResponseDto[]`, a plain array (48 rows; as `GET /me/photos`, not `Paginated`).
`StoreResponseDto`: `id`, `name`, `type` (enum), `city`, `street`, `house`, `mall`, `latitude`,
`longitude`, `metroStations`, `workTime`, `description`, `phones`; no `code`, `position` or dates.
`StoresModule` in `AppModule`; `'StoresController.list'` in `PUBLIC_HANDLERS`; `openapi.json`
rewritten with `-u`. No new error code.

## 3. web

### 3.1 `entities/store`

- `model/schemas.ts`: `storeSchema` (zod, `type: z.enum(['sport', 'urban', 'outlet'])`),
  `storeListSchema = z.array(storeSchema)`; `schemas.contract.test.ts` against
  `StoreResponseDto` and `GET /stores` 200.
- `api/keys.ts` (`storeKeys.list()`), `api/server-queries.ts`: `getStores()` through the page
  cache as `getCategories` (`'use cache: remote'`, `cachedApiFetch`, `pageCacheOpen()`, else
  `apiFetch` as the visitor): a public read with no parameters, the same for every visitor.
  `storeListOptions` for `prefetch` and the browser's `useStores()` (`clientFetch`). `server.ts` /
  `index.ts` per the `fsd` skill.
- `lib/search.ts`: `matchStores(stores, text)`: lower case, `ё` → `е`, words split on spaces and
  punctuation; a store matches when every word is a prefix of a word of its name, mall, city,
  street or a metro station (`Ладожская` → Охта Молл; `екат` → Екатеринбург). Unit tests.
- `lib/links.ts`: `telHref(phone)` (`+` and digits only), `routeHref(store)`
  (`https://yandex.ru/maps/?rtext=~<lat>,<lon>&rtt=auto`, Yandex's documented link; the empty start
  is "from where I am"), `storeAddress(store)`.
- `ui/store-card`: displays one store (name, address, metro, hours, a line left out when its
  data is empty, X20; «›» and, open, the
  description, phones and «Проложить маршрут» with `target="_blank" rel="noopener"`). Props:
  `store`, `selected`, `expanded`, `onSelect`, `onExpandedChange`, and the tracking handlers
  (`events`); no state, no URL (0009 K7). The «›» is a `<button aria-expanded>`; the card's main
  area is a `<button>` that selects. Data of a store is not personal: no `mp-block`.

### 3.2 `widgets/stores-map`

A client component, `StoresMap({ stores, selectedId, onSelect, fit, pinEvents })`:

- `lib/load-ymaps.ts`: one `<script src="https://api-maps.yandex.ru/v3/?apikey=…&lang=ru_RU">`
  per tab, a promise for `ymaps3.ready`; then `ymaps3.import('@yandex/ymaps3-reactify')` and
  `reactify.bindTo(React, ReactDOM)`; the clusterer from npm by `import('@yandex/ymaps3-clusterer')`
  after `ready` (it extends the global `ymaps3` when evaluated), so no other CDN in the policy.
  Types from `@yandex/ymaps3-types` (`tsconfig` `paths`/`typeRoots`).
- The map: `YMap` (start `center` Moscow, zoom 10; `location` from `fit`: the bounds of the
  matching stores, or the selected store's point at zoom 15), `YMapDefaultSchemeLayer`,
  `YMapDefaultFeaturesLayer`, `YMapClusterer` with `clusterByGrid({ gridSize: 64 })`: a feature per
  store, `marker` = our «la» pin (the owner's SVG, X9) in a `YMapMarker` whose `onClick` calls
  `onSelect`, `cluster` = a black circle with the count whose click zooms to its bounds. The
  selected pin: a class and a higher `zIndex`. Yandex's copyright block stays at its default
  (`copyrights: true`, X14); nothing covers its corner.
- No key (`yandexMapsApiKey === ''`), a failed script or `ready`: a placeholder in the map's place
  («Карта недоступна»), reported once through `reportFailure` only for a failure with a key; the
  list keeps working (AC10).
- Tests: the placeholder without a key; the loader called once; selection and fit logic as pure
  functions (`lib/fit.ts`). The map itself is checked in the browser (qa-tester, the owner's key).

### 3.3 `_pages/stores`

- `ui/stores-page.tsx` (server): `prefetch(storeListOptions)` into a `HydrationBoundary`, inside
  `AccountShell({ section: 'stores', public: true })`; the heading «Магазины Lamoda Sport» and the
  legend (the two logos, X9, with Lamoda's two texts).
- `ui/stores-view.tsx` (client) owns the state: the search text (the kit's `SearchField`, label and
  placeholder «Магазин, адрес или метро»; nothing in the URL: `strip-attributes` drops only `q`
  from event addresses), the selected id, the expanded ids, the phone tab. Desktop: list (its own
  scroll, the height of the map, 640 px) beside the map; a pin's click scrolls its card into view.
  Below 1024 px (X25): the kit's `Tabs` «Список» / «Карта» under the search; a card's click selects and
  switches to «Карта» (X10); on «Карта» a pin's click shows the store's `StoreCard` over the
  map's bottom with a close button (X19), above Yandex's copyright block, which stays visible.
  «Ничего не нашлось» for no match. Both panels stay mounted (the map is
  not reloaded on a tab switch); the hidden one is `hidden` by CSS. The map's container is
  `mp-block` (X26).
- `Stores Searched` (X17) from a 1 s debounce of the text, not for empty or unchanged text.
- `web/app/customer/stores/page.tsx` re-exports `StoresPage` from `@/_pages/stores`;
  `_pages/account-stubs` keeps `OrdersPage` and `FittingsPage` only. The metadata stays
  `accountSectionMetadata('stores')` (title «Магазины», `noindex` from the layout, X4).

### 3.4 Around the page

- `AccountShell`: a `public` prop: the section renders at once, whatever the session (no
  skeleton, no invitation); the menu stays as for everyone (X15).
- Plain links (X16): `account-sections.ts` gets `fullLoad: true` on `stores`; the side menu, the
  header's profile menu and its burger menu render such an entry as a plain `<a>` (the kit's `Link`
  / `MenuLinkItem` with a plain-anchor form), and so does the footer's item. A test per menu.
- Footer: `items.ts` `{ label: 'Магазины Lamoda Sport', href: '/customer/stores', track: 'stores'
}`; `footer.link` (X18) on items with `track`.
- `/privacy`: a paragraph (X6): «На странице магазинов показана карта Яндекса: Яндекс получает
  адрес вашего устройства и может сохранять свои cookie. Условия: …» with a link to Yandex's
  terms.
- Warm-up (X4): `WARMUP` gets `{ route: '/customer/stores', source: 'static' }`; `EXCLUDED`
  drops `/customer/*` for its routes one by one (`/customer`, `/customer/account`,
  `/customer/orders`, `/customer/fittings`, `/customer/photos`, each with 0017's reason), or
  `routes.test.ts` learns that an exact entry beats a wildcard: the task picks the smaller change.

### 3.5 Content Security Policy (X16)

`policy.ts` gets `yandexMaps: boolean`; `proxy.ts` passes `pathname === '/customer/stores'`.
With it, Yandex's list for version 3 is added:

```
script-src  … https://api-maps.yandex.ru https://*.api-maps.yandex.ru 'unsafe-eval'
connect-src … https://api-maps.yandex.ru https://*.api-maps.yandex.ru https://*.maps.yandex.net
style-src   … https://api-maps.yandex.ru https://*.api-maps.yandex.ru https://yastatic.net
img-src     … https://api-maps.yandex.ru https://*.api-maps.yandex.ru https://*.maps.yandex.net https://yastatic.net
worker-src  … data: https://api-maps.yandex.ru https://*.api-maps.yandex.ru
```

(`img-src` already has `data:`.) Yandex's list also has `https://yastatic.net` in `script-src` and
`worker-src`; it is left out (X16) and added only if the browser shows the map blocked without it. Fonts and frames are not in Yandex's list; the task checks the
page in a browser with the owner's key and adds an origin only after seeing it blocked. `policy.test.ts`
and `proxy.test.ts`: the stores path has the list, any other path (`/catalog`, `/customer`,
`/customer/stores/x`) does not. `check:web-shells` is unaffected (no new inline script).

### 3.6 The key (X13)

`NEXT_PUBLIC_YANDEX_MAPS_API_KEY`, the path of `NEXT_PUBLIC_MIXPANEL_TOKEN`: the repository
variable in `.github/workflows/images.yml` (publish only) → `scripts/ci-build-images.sh`
`--build-arg` → `web/Dockerfile` `ARG` → `web/src/shared/config/public-env.ts`
(`yandexMapsApiKey`, a literal `process.env.` access) ; `.env.example` with a comment;
`docker-compose.yml`'s web environment. It is public: not in `check:web-bundle`'s list.

The owner's key (spec, owner actions): developer.tech.yandex.ru → «Все продукты» → «JavaScript
API» (its «Подключить», shown on hover) → the free plan → the key's «Ограничение по HTTP Referer»: `lamoda-ai-fitting.ru` and
`localhost`, one per line (version 3 refuses a key without it); it works 15 minutes later. Then
GitHub → Settings → Secrets and variables → Actions → Variables → `NEXT_PUBLIC_YANDEX_MAPS_API_KEY`,
and the same line in the local `.env` (then `docker compose up -d --build web`).

## 4. Analytics (X17, X18)

`catalog.ts`:

| Entry             | Zone / area         | Type        | Properties                        | Estimate                |
| ----------------- | ------------------- | ----------- | --------------------------------- | ----------------------- |
| `Stores Searched` | `stores`            | interaction | `query_length`, `results`: number | 0.03 per visit          |
| `stores.card`     | `stores` / `stores` | interaction | —                                 | 0.1 clicks, 0.03 hovers |
| `stores.details`  | `stores` / `stores` | interaction | `expanded`: boolean               | 0.05, 0.03              |
| `stores.phone`    | `stores` / `stores` | navigation  | —                                 | 0.0025, 0.003           |
| `stores.route`    | `stores` / `stores` | navigation  | —                                 | 0.01, 0.01              |
| `stores.pin`      | `stores` / `stores` | interaction | —                                 | 0.05, 0.02              |
| `stores.tab`      | `stores` / `stores` | interaction | `tab`: `list`, `map`              | 0.03, 0                 |
| `footer.link`     | `footer` / `footer` | navigation  | `link`: `stores`                  | 0.01, 0.02              |

`sdkPerVisit` 16 → 17 (its comment names the page). Budget after: about 115 800 events a month,
14.5 % of the free plan (the limit is 80 %). `EVENTS.md` regenerated in the commit that adds each
entry. A pin is not a React element of ours only if reactify fails; then `trackElementClick`
(clicks only). The heatmap's clicks on `tel:` and the route link lose their links and text by
`strip-attributes.ts`; the task checks it on these elements.

## 5. Risks

- **The map's CSP.** Yandex's list may miss an origin our browser test finds (fonts); the
  `'unsafe-eval'` on one page weakens that page's protection (X16; the page renders only the
  store data and the visitor's own search text).
- **A client navigation keeps the old policy.** Every link to the page is plain (X16); a link
  missed would show the placeholder until a reload: the menus' and footer's tests pin it. The other
  way, a link away from the stores page keeps the loosened policy in the tab until its next full
  load (accepted, X16), but for the account's side menu and «‹ Личный кабинет», which load their
  page in full (X24).
- **The free plan** (X14): a key over its limit for long is blocked for good; ads may appear.
- **Young packages**: both Yandex packages were six days old on 2026-10-26; the task takes the
  latest one at least a few days old.
- **Stale data**: Lamoda's stores change; the seed never updates (spec, assumptions).

## 6. Acceptance criteria → checks

| AC            | Check                                                                              |
| ------------- | ---------------------------------------------------------------------------------- |
| AC1           | database e2e of `GET /stores` without a cookie (48 rows, fields), seed run twice   |
| AC2           | `throttle-markers` (no skip) and a unit check of the tier for `GET /stores`        |
| AC3           | `stores-page` tests signed out / signed in; qa-tester on the local stack           |
| AC4           | `store-card` tests (details, `tel:` hrefs, route link, `target`)                   |
| AC5, AC6, AC8 | qa-tester in a browser with the owner's local key; `fit.ts` unit tests             |
| AC7           | `matchStores` unit tests; `stores-view` test with the seed's data                  |
| AC9           | `stores-view` test at a phone width (tabs, switch on select); qa-tester at 375 px  |
| AC10          | `stores-map` test without a key; qa-tester without a key                           |
| AC11          | after the deploy: the page on the site, the console clean (owner and main session) |
| AC12          | removed (X7)                                                                       |
| AC13          | `footer.test.tsx` (href, plain link)                                               |
| AC14          | `privacy-page.test.tsx`                                                            |
| AC15          | `routes.test.ts`; the deploy's warm-up log; the page's `noindex` in a test         |
| AC16          | `catalog.test.ts`, `EVENTS.md` check, the review of properties                     |
| AC17          | `npm run verify`                                                                   |
