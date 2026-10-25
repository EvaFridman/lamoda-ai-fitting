# 0022 stores: Lamoda Sport stores on a Yandex map

Status: draft (2026-10-26).

Decisions: `clarifications.md` (X0–X15).

Issue #73, «Интеграция яндекс-карт и вывод магазинов на карте».

## Goal

The account section "Магазины" (`/customer/stores`) has been a stub since spec 0017. It becomes
Lamoda's page "Магазины Lamoda Sport" (X0): the real Lamoda Sport and Lamoda Sport Outlet stores of
every city, as a list beside a Yandex map, with a search by store, address or metro. Anyone may open
it, signed in or not. Lamoda's sections "Акции и новости магазинов" and "Популярные бренды" are not
part of it.

## In scope

- The stores of Lamoda Sport (X1): name, type, city and address, coordinates, metro stations,
  opening hours, a description of how to find the store, phones. They are kept by the api, filled by
  the seed and read by everyone (X2).
- The page `/customer/stores` (X3, X4): the heading "Магазины Lamoda Sport", the legend of the two
  store kinds with their logos (X9), the search field "Магазин, адрес или метро", the list of stores
  and the Yandex map with a pin per store, grouped where pins overlap (X5). A card and its pin are
  linked both ways. A card's «›» shows the details (X8).
- The search (X7): it filters the list and the map by store name, mall, city, street and metro
  station, with no request to the api or to Yandex.
- The phone layout below 600 px: tabs «Список» and «Карта» (X10).
- The map starts on Moscow (X7); the header's city reads «Москва» (X7).
- The footer's «Магазины Lamoda Sport» becomes a link to the page (X11).
- `/privacy` says the stores page shows Yandex's map, which receives the visitor's address (X6).

## Non-goals

- Stock per store, «Смотреть товары магазина», booking a size in a store (X8).
- Choosing a city in the header, finding the visitor's city by address or by geolocation; the
  "my location" button of the map (X7, X12).
- Lamoda's sections "Акции и новости магазинов" and "Популярные бренды" (X0).
- Store photos, a page per store (X8).
- Indexing the page by search engines (X4).
- Editing stores through the api: the list changes through the seed (X2).

## Acceptance criteria

### Data

- **AC1.** After the seed, `GET /api/stores` without a session cookie answers 200 with every store of
  the owner's list (X1), each with its type, city, address, coordinates, metro stations, hours,
  description and phones; running the seed again adds nothing.
- **AC2.** `GET /api/stores` counts in the `read` quota tier, as the catalog's reads do.

### Page

- **AC3.** `/customer/stores` opened signed out shows the heading «Магазины Lamoda Sport», the
  legend, the search field, the list and the map, with no invitation to sign in; signed in it shows
  the same inside the account menu.
- **AC4.** Each card shows the store's name, address, metro stations and hours; «›» opens the
  description, the phones as links that dial them and «Проложить маршрут», which opens Yandex Maps'
  route to the store in a new tab; «›» again closes them.
- **AC5.** The map shows one black «la» pin per store and a circle with a count where pins overlap;
  zooming in splits the circle into pins. Yandex's logo, copyright and «Открыть в Картах» stay
  visible on the map (X14).
- **AC6.** A click on a card centres the map on its pin and marks the pin; a click on a pin marks
  its card and scrolls the list to it.
- **AC7.** Typing «Ладожская» leaves only «ТЦ Охта Молл Sport» in the list and on the map, and fits
  the map to it; typing «Екатеринбург» leaves the city's stores; a text that matches nothing shows
  «Ничего не нашлось»; clearing the field brings every store back.
- **AC8.** The page opens with the map on Moscow.
- **AC9.** At 375 px the page shows the tabs «Список» and «Карта» under the search, the list first;
  a click on a card switches to «Карта» with that store marked.
- **AC10.** With no Yandex key (local development, tests, CI) the map's place shows a placeholder
  and the list and the search work.
- **AC11.** On lamoda-ai-fitting.ru the page loads the map with no Content Security Policy violation
  in the browser's console.

### Around the page

- **AC12.** The header shows «Москва» in place of «Укажите ваш населенный пункт», inert as before.
- **AC13.** The footer's «Магазины Lamoda Sport» opens `/customer/stores`.
- **AC14.** `/privacy` has the paragraph about Yandex Maps on the stores page.
- **AC15.** The page answers 200 to a request with no cookie within the deploy's warm-up limits and
  carries `noindex`.

### Analytics and build

- **AC16.** The events and tracked elements the owner chooses for the page (from the `analytics`
  agent, recorded in `clarifications.md`) are in the catalog and `EVENTS.md`; no property carries
  a search text or a store.
- **AC17.** `npm run verify` passes.

## Owner actions (Claude cannot do them)

- Send the SVG (DevTools → the element → Copy outerHTML) of the logos «lamoda sport», «lamoda sport
  outlet» and of the map pin «la» from Lamoda's stores page (X9).
- Get the key of «JavaScript API и HTTP Геокодер» in Yandex's developer cabinet, restricted by HTTP
  Referer to `lamoda-ai-fitting.ru` and `localhost`; put it into the local `.env` and the GitHub
  secret the plan names (X13).
- Check the page on a real phone after the deploy.

## Assumptions

- The page runs on Yandex's free plan of the JavaScript API (X14): the site's daily map loads stay
  well under its limit.
- The list of stores changes rarely; a change is a new seed release, and a store that closes is
  removed by a migration (the seed never changes or removes rows).
