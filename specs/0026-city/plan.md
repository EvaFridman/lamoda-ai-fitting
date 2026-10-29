# 0026 city: plan

Status: accepted (2026-10-29); amended at the review of PR 1 (§3.1, §3.3: C14; §5: the map's
fit; §9, §10); amended at T3 (§3.2: C15; §3.3, §4, §5: `useCityOpenEvents`).

How [spec.md](spec.md) is built. Decisions: [clarifications.md](clarifications.md) (C0–C14).

## 1. Overview

```
GET /stores (as today) ──page cache──▶ getStores ──storeCities──▶ cities (name + store points)
                                            │                        │
                                            ▼                        ▼
                              _pages/stores (useStores)     header (HeaderCitySlot, burger)
                                            │                        │
                                            └──── features/choose-city ────┘
                                     localStorage `city`, `city-asked`; navigator.geolocation
                                     (coordinates stay in the function that finds the city)
```

No api, database, nginx or CSP change: `GET /stores` already answers every store's `city`,
`latitude` and `longitude` (0022 plan §2.3), and geolocation is not governed by the CSP; the site
sends no `Permissions-Policy`, so the top-level page may ask. Everything is web.

## 2. `entities/store`: the cities

New `lib/cities.ts`, exported from `index.ts` (browser-safe, pure):

- `cityName(raw)`: the table's `city` without the leading «г. » (any case, `г.` then spaces) and
  without what follows the first comma, trimmed (C1): «г. Видное, пос. совхоза им. Ленина» →
  «Видное». A value with neither stays as it is.
- `interface City { name: string; points: readonly [lng: number, lat: number][] }` and
  `storeCities(stores): City[]`: one entry per distinct `cityName`, each with its stores' points;
  «Москва» and «Санкт-Петербург» first, the rest by `localeCompare(…, 'ru')` (C4).
- `storesOfCity(stores, name)`: the stores whose `cityName` is `name`, in the api's order.
- `nearestCity(cities, position, maxKm = 100): string | null`: the name of the city of the
  nearest point by the haversine distance (radius 6371 km), or `null` when none is within `maxKm`
  (C2, C0). `position` is `{ latitude, longitude }`; nothing keeps it.
- `matchCities(cities, text)`: the window's search, with `matchStores`' word rule (every word of
  the text the start of a word of the name, `ё` as `е`); the rule's `words` moves to a shared
  private helper of the slice.

The header gets the cities as props, not the stores: 31 names and 48 points instead of every
store's description, hours and phones in each page's payload.

## 3. `features/choose-city`

A new feature slice (`index.ts`, client modules only). The header (a widget) and the stores page
both use it.

### 3.1 The choice (`model/city-store.ts`)

As `features/cookie-consent`'s store: `useSyncExternalStore` over `localStorage`, a `storage`
listener for other tabs (C0), a value in memory when the browser refuses to store it, kept until
the tab reloads (C9, as 0019 A60).

- Key `city`: the city's name, at most 100 characters, else read as none. Not an `mp_`/`__mp` key
  (C9). One per browser.
- Key `city-asked`: `1` once the stores page has asked by itself (C6) (amended by C14).
- `useStoredCity()`: the stored name; `undefined` on the server and while hydrating, so nothing
  acts on it then.
- `useCity(cities)`: the stored name only if it is one of `cities` (C8), else `null`; `undefined`
  while hydrating or while `cities` is not there.
- `chooseCity(name)`, which also calls `markAsked()` (C14), `wasAsked()`, `markAsked()`.

### 3.2 Finding the city (`lib/locate.ts`)

`locateCity(cities): Promise<LocateResult>`, `LocateResult = { kind: 'found', name } | { kind:
'far' } | { kind: 'refused' } | { kind: 'failed' }`. One `navigator.geolocation.getCurrentPosition`
with `enableHighAccuracy: false`, `timeout: 10_000`, `maximumAge: 600_000` (C7's 10 s); the error
code `PERMISSION_DENIED` is `refused`, any other, a missing API or an insecure context `failed`.
The browser's `timeout` starts only once the permission is given, so the function also ends
`failed` 30 s after the ask (`LOCATE_DEADLINE_MS`), a later answer ignored (C15, amended at T3).
The coordinates live only inside this function: they are passed to `nearestCity` and dropped, never
stored, logged, put into state, an attribute, an address, an event or a Sentry report (AC5). None
of the results is reported to Sentry: each is the visitor's answer or the device's, not a fault of
the site.

### 3.3 The window (`ui/city-modal.tsx`)

`CityModal({ cities, failure?, open, onOpenChange, finalFocus? })`, the kit's `Modal` (C4); the
control that opens it spreads `useCityOpenEvents(source, cities)`, its `city.open` with `source`
`header`, `burger` or `stores` and `had_city` (§7) (amended at T3: no `surface` on the window):

- title «Ваш город»; on phones the whole screen (`wide`, which fills the window below 600 px);
- «Определить автоматически» (a kit `Button`, `secondary`): while finding, disabled with a
  `Spinner`; `found` chooses the city and closes the window (a city chosen meanwhile elsewhere
  wins, the window closes too, C8); the others show their C7 text in a `role="status"` line under
  the button and keep the city; a result after the window closed only chooses the city;
- the kit's `SearchField` «Найти город» (uncontrolled, its text in no attribute, L9), filtering
  with `matchCities`; nothing left: «Ничего не нашлось»;
- the list: one `button` per city, the chosen one marked with `aria-current="true"` and a check
  icon; a click chooses it and closes the window;
- `cities === null` (the header's read failed): `errorText(failure)`, no list and no
  «Определить автоматически».

Its search text and list hold no personal data; the window needs no `mp-block`.

### 3.4 The stores page's own ask (`model/use-ask-once.ts`)

`useAskCityOnce(cities)`: once `cities` is there and the stored city is `null` and not
`wasAsked()`, it calls `markAsked()` first (so a reload while the prompt waits does not ask
twice), then `locateCity`; `found` chooses the city, `far` returns `true` for the page's line
(C7), the others nothing. A city chosen by hand meanwhile wins: a later `found` does not replace
it (C8).

## 4. The header (`widgets/header`)

- `loadHeaderCities()` (next to `loadHeaderCategories`, React's `cache`, so the button and the
  burger read once per render): `getStores()` (the page cache, 0022 plan §3.1) → `storeCities`;
  a failure is `null` (the read already reported it, as `apiFetch` does).
- `HeaderCitySlot` (server, `connection()`, inside `<Suspense>` in place of today's button, whose
  inert copy stays as the fallback) renders `HeaderCity` (client): the button with the name from
  `useCity(cities)`, «Укажите ваш населенный пункт» while it is `null` or `undefined` (so the first
  paint of a visitor with a city shows the placeholder for a moment: accepted, as the profile's
  initials), opening its `CityModal` (the button's `useCityOpenEvents('header', cities)`,
  amended at T3). The button keeps today's look and
  ellipsis; `aria-disabled` goes.
- The burger (C5): `HeaderMenuSlot` passes the cities to `HeaderMenu`, which gets a row «Город:
  <name>» (or «Укажите ваш населенный пункт») above «Все товары»; it closes the drawer and opens
  its own `CityModal` (the row's `useCityOpenEvents('burger', cities)`, amended at T3;
  `finalFocus` the burger, `BURGER_ID`, as A87.7).
- `header.tsx`'s comment and its tests drop the city from the inert elements (L5).

The warm-up's list does not change (no route). The page shells keep no new inline script.

## 5. The stores page (`_pages/stores`)

`StoresView`:

- `cities = storeCities(stores)`, `city = useCity(cities)`, `far = useAskCityOnce(cities)`.
- `view: 'city' | 'all'`, starting `'city'` on each open (C3: «Все города» a view only). The
  pool is `storesOfCity(stores, city)` when `city` and `view === 'city'`, else every store; the
  search filters the pool.
- Over the search: with a city, the kit's `ChipGroup` «<Город>» / «Все города»; then a
  `LinkButton` «Изменить город» («Выбрать город» without one) opening the page's `CityModal`
  (its `useCityOpenEvents('stores', cities)`, amended at T3) on every width (C5). A new city chosen anywhere (also in another tab) sets
  `view` back to `'city'`.
- `far`: «Рядом с вами пока нет магазинов» (`role="status"`) over the list, every store (C7).
- Nothing found in the city: «Ничего не нашлось» and `LinkButton` «Искать во всех городах»,
  which sets `view` to `'all'`.
- The map's fit (`widgets/stores-map`, `lib/fit.ts`): the kind `'stores'` takes an optional
  `singleZoom`, the zoom of one point (a street's, `STORE_ZOOM`, by default); the city's fit is
  `'stores'` with the city's stores and `singleZoom: CITY_ZOOM` (12), no new kind. The base fit is
  that in the city's view, else `'start'` (Moscow, as today); a non-empty search fits what it
  left, as today. The map is created in the browser after hydration, so it starts on the city.
- The search's pause (C12): the text the list and the map follow is set 300 ms
  (`SEARCH_APPLY_MS`) after the last change; an empty text at once. `Stores Searched` keeps
  `SEARCH_PAUSE_MS` (1000) on the typed text.

## 6. `/privacy` (C10)

A paragraph after the Yandex map's: «На странице магазинов и по кнопке «Определить
автоматически» сайт просит у браузера ваше местоположение. Оно используется только в браузере,
чтобы выбрать ближайший город с магазином Lamoda Sport, и никуда не передаётся. Выбранный город
хранится в вашем браузере.»

## 7. Analytics

The `analytics` agent's proposal (2026-10-29), taken by the owner as it stands (C13). No city name,
coordinates, distance or a list row's position in any property (0022 X17, AC5, AC14).

The zone `header` gets the area `city` (the window) and its description becomes the site's
header, not only the phone's.

| Zone / id or name             | Type        | Properties                                                                         | Clicks / hovers / perVisit | When                                                                                 |
| ----------------------------- | ----------- | ---------------------------------------------------------------------------------- | -------------------------- | ------------------------------------------------------------------------------------ |
| header / `city.open`          | interaction | `source`: `header` \| `burger` \| `stores`; `had_city`: boolean                    | 0.05 / 0.08                | the header's button, the burger's row, the page's «Изменить город» / «Выбрать город» |
| header / `city.pick`          | interaction | `searched`: boolean; `had_city`: boolean                                           | 0.03 / 0.03                | a city in the window's list (one element for every row)                              |
| header / `city.auto`          | interaction | `had_city`: boolean                                                                | 0.01 / 0.01                | «Определить автоматически»                                                           |
| stores / `stores.scope`       | interaction | `scope`: `city` \| `all`                                                           | 0.01 / 0                   | the switch «<Город>» / «Все города»                                                  |
| stores / `stores.search-all`  | interaction | —                                                                                  | 0.003 / 0.002              | «Искать во всех городах»                                                             |
| stores / event `City Located` | interaction | `result`: `found` \| `far` \| `refused` \| `failed`; `trigger`: `page` \| `button` | perVisit 0.025             | the end of every ask, the page's own or the button's                                 |

`Stores Searched` gets `scope`: `city` | `all` (its `results` now count what the page shows; older
sends have none). `sdkPerVisit` stays 17 (no new page). The estimate goes from 118 046 to about
118 796 events a month, 11.9 % of the free plan.

## 8. Docs

`CLAUDE.md`: the header (the live city, its window, the burger's row), the stores page (the city,
the switch, the page's ask, the search's pause), the keys `city` and `city-asked`, `/privacy`,
`features/choose-city` and the analytics zones; the spec list at the top. No README change.

## 9. Risks

- A permission prompt on a page load with no click: some browsers show it quietly or not at all
  (Chrome's quieter prompts, Safari asks per site). Accepted by C0; «Определить автоматически» is
  the way after that.
- The placeholder before hydration for a visitor with a city (§4): a short flash of «Укажите…».
- A store's `city` with a new shape (another prefix, a district) gives a new city name; `cityName`'s
  test pins the 31 names of today's seed.
- `[lng, lat]` points against geolocation's `{ latitude, longitude }`: swapped axes in the
  haversine pass a test of two near points. `nearestCity`'s test takes real cities and a known
  distance (Москва–Санкт-Петербург, about 635 km).
- While the page cache skips Redis (V24), the header's `getStores` goes as the visitor on every
  page's render, beside the categories' read: one more `read`-tier request per page, accepted as
  V24 accepts the categories'.
- A city chosen in another tab moves the stores page from «Все города» back to the city (§5): on
  purpose, with a test.
- The agents' browser has no real position: tests stub `navigator.geolocation`; `qa-tester` stubs it
  through the page's script; the real prompt is the owner's check after the deploy.

## 10. Acceptance criteria → checks

| AC       | Check                                                                                                                                                                         |
| -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| AC1, AC2 | `HeaderCity` and `CityModal` tests (the list, the order, a pick, a `storage` event); `qa-tester` at 1280 px, two tabs                                                         |
| AC3, AC4 | `locateCity` tests with a stubbed geolocation (found, far, refused, timeout, no API); `CityModal` texts                                                                       |
| AC5      | `locateCity` and `CityModal` tests: no `localStorage` key but the name, no `track` with a position; `qa-tester`'s network log with a stubbed position                         |
| AC6      | `useAskCityOnce` tests (asks once, not with a city, not after the mark, not after a hand-chosen city that left the table); `rg getCurrentPosition` shows the two callers only |
| AC7      | `HeaderMenu` test; `qa-tester` at 375 px                                                                                                                                      |
| AC8      | `useCity` test with a name not among the cities                                                                                                                               |
| AC9–AC11 | `StoresView` tests (a city chosen in another tab ends «Все города»); `qa-tester` at 375 and 1280 px                                                                           |
| AC12     | `StoresView` test with fake timers (one fit after 300 ms, empty at once)                                                                                                      |
| AC13     | `privacy-page.test.tsx`                                                                                                                                                       |
| AC14     | `catalog.test.ts`, `EVENTS.md` regenerated, review of the properties                                                                                                          |
| AC15     | `npm run verify`                                                                                                                                                              |
