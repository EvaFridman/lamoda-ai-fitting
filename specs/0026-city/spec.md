# 0026 city: the visitor's city in the header and on the stores page

Status: done (2026-10-29), with the owner's answers C1–C16; amended at the review of PR 1
(AC1, AC3, AC6: C14). History, not instructions.

Decisions: `clarifications.md` (C0–C16). Starting decisions: spec 0024's Z1 and Z24, carried in
as C0.

Source: the owner's Agentation notes of 2026-10-29, notes `S1`, `S2` and `S3` of
[../0024-ui-feedback-2/source/agentation-notes.md](../0024-ui-feedback-2/source/agentation-notes.md),
split off from spec 0024 as its part 4 (Z1; S2 by C12). Design: the canvas «Онлайн-примерка 2.0»
draws no board for the city (spec 0024's "Differences from the canvas": S1–S3 are silent boards,
the header's city is a placeholder), so the screens follow Lamoda's header and the decisions here.

## Goal

The header's «Укажите ваш населенный пункт» has been inert since spec 0010 (L5), and the stores
page opens on Moscow for everyone (0022 X7). The note S1 asks for the visitor's city by the
browser's geolocation, asked as browsers usually ask, and for a way to choose it; S3 asks the
stores page to show the stores of that place first; S2 asks the stores search to wait for a pause
in typing. The city is found without a geocoder: of the cities that have Lamoda Sport stores, the
browser picks the nearest, and the visitor's coordinates never leave the browser (C0).

## In scope

- The visitor's city: one of the cities of the `stores` table (C1), chosen by hand or found by the
  browser's geolocation as the city of the nearest store (C2); kept in the browser (`localStorage`,
  one per browser, shared by its tabs), never on the server or in the address (C0, C9). Only the
  visitor changes it (C8).
- The header's city button (600 px and wider) becomes live: it shows the chosen city's name, or
  «Укажите ваш населенный пункт» while there is none, and opens the city window: the kit's
  `Modal` with «Определить автоматически», a search field and the list of cities (C4). On phones
  the burger's menu gets a row «Город: …» opening the same window (C5).
- Geolocation is asked only on the first open of `/customer/stores` in a browser with no city
  (C6) and by «Определить автоматически»; never on another page by itself (C0). The results'
  texts: C7.
- The stores page with a city chosen: a switch «<Город>» / «Все города» over the list, the city's
  stores only and the map fitted to them; «Все города» shows every store and the map as today, for
  this view only (C3); its own control «Изменить город» / «Выбрать город» opens the window (C5).
- The stores search: the list and the map follow the text after a pause in typing (C12, S2).
- `/privacy` says how the city is found and kept (C10).
- The analytics of the new controls in the zones `stores` and `header`, proposed by the `analytics`
  agent at the plan (0024 Z25).

## Non-goals

- A geocoder or any request with the visitor's coordinates to the api, Yandex or another service
  (C0); cities without stores; a city found by the visitor's address (IP).
- The map's "my location" button and a pin of the visitor (0022 X12 stays).
- Using the city anywhere but the header and the stores page (the catalog, prices, delivery).
- Keeping the city in the user's account or syncing it between devices (C0, C9).
- The try-on window and the result screen: spec 0024's part 2 rebuilds them, and 0026 does not
  touch them.
- A change to the stores' data or to `GET /stores`.

## Acceptance criteria

### The city

- **AC1.** With no city chosen, the header's city button (at 600 px and wider) reads «Укажите ваш
  населенный пункт» and opens the window «Ваш город»: «Определить автоматически», a search field
  and the cities of the `stores` table (31 on 2026-10-29; Москва and Санкт-Петербург first, then
  alphabetical), each once, named
  without «г. » or a settlement («Видное»).
- **AC2.** Choosing a city closes the window; the button shows the city's name on every page, and
  the choice survives a reload and shows in another open tab of the same browser.
- **AC3.** «Определить автоматически» asks the browser's permission; allowed, with a store within
  100 km, the city of the nearest store becomes the chosen one and the window closes; refused, the
  window says «Доступ к геопозиции запрещён» (C14); failed or timed out (10 s), «Не удалось
  определить местоположение»; the city stays as it was in both.
- **AC4.** With no store within 100 km, the window says «Рядом с вами пока нет магазинов» and the
  city stays as it was.
- **AC5.** No request leaving the browser carries the visitor's coordinates (the browser's network
  log while the city is found), and they are in no `localStorage` key, attribute, address or
  analytics event.
- **AC6.** No page but `/customer/stores` asks for the permission by itself; the stores page asks
  on its first open in a browser with no city, and not again after any answer, a reload or a city
  ever chosen by hand, even one that later left the table (C14). A browser that stores nothing
  is asked on each load of the page (C14).
- **AC7.** Below 600 px the burger's menu has «Город: <name>» (or «Укажите ваш населенный
  пункт»), which opens the same window.
- **AC8.** A stored city that is no longer among the stores' cities shows as no city.

### The stores page

- **AC9.** With a city chosen, `/customer/stores` shows the switch with the city on, that city's
  stores only and the map on them; «Все города» shows every store and the map on Moscow; a reload
  shows the city again.
- **AC10.** On the page's own ask, a city found moves the page to it and the header shows it; no
  store within 100 km shows «Рядом с вами пока нет магазинов» over every store; a refusal, a
  failure or a timeout leaves the page as today: every store, the map on Moscow, no switch.
- **AC11.** «Изменить город» (or «Выбрать город» without a city) opens the city window on every
  width; a city chosen there moves the page to it.
- **AC12.** The search still filters by name, mall, city, street and metro (0022 X7) over what the
  page shows; typing fast moves the list and the map once after the pause, not on every key, and
  clearing the field shows the stores at once.

### Around the pages

- **AC13.** `/privacy` has C10's paragraph.
- **AC14.** The new elements and events are in the analytics catalog and `EVENTS.md`, carry no
  city name, coordinates or distance, and `typecheck` passes.
- **AC15.** `npm run verify` passes.

## Owner actions (Claude cannot do them)

- After the deploy: check the permission prompt and the nearest city on a real phone and on a
  desktop browser (the agents' browser has no real position, only an emulated one).

## Assumptions

- The cities are the distinct cities of the `stores` table (48 stores, 31 cities on 2026-10-29),
  read through `GET /stores`, which already answers each store's city and coordinates.
- The distance is the great-circle distance, computed in the browser.
- The site sends no `Permissions-Policy` header today, so nothing blocks the top-level page's
  geolocation.
