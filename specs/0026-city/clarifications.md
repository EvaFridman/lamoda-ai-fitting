# 0026 city: clarifications

Status: done (2026-10-29): C0 carried in from spec 0024; C1–C12 settled at the first answers,
C13 at the plan, C14 at the review of PR 1 (C6, C7 amended), C15 at T3.
Decision ids `C0`, `C1`, …; the notes are `S1`, `S2` and `S3` of
[../0024-ui-feedback-2/source/agentation-notes.md](../0024-ui-feedback-2/source/agentation-notes.md).

## The canvas

The canvas «Онлайн-примерка 2.0» draws no board for the city or the stores page (spec 0024,
"Differences from the canvas": S1–S3 silent, the header's city a placeholder). The screens follow
Lamoda's header and the answers below.

## Carried in

**C0. The starting decisions (spec 0024 Z1, Z24, 2026-10-29).** The city is spec 0026 (Z1). No
external geocoder: the browser's geolocation gives coordinates only, and turning them into a
city's name would need a third party (Yandex's Geocoder HTTP API, DaData) with a key, its limits
and the visitor's coordinates sent out. Instead the stores table holds each store's coordinates and
city, so the browser picks the nearest of the cities that have stores, and the header's list
offers the same cities; the coordinates never leave the browser and no key is needed. The price,
accepted: a visitor in a city with no Lamoda Sport store sees the nearest city that has one (or
«Рядом с вами пока нет магазинов» past 100 km), and the header offers only cities with stores.
The choice lives in the browser (`localStorage`, shared by tabs), never on the server; the
permission is asked on the first open of `/customer/stores` and on «Определить автоматически» in
the header's window, never on another page by itself. This lifts spec 0010 L5 for the city, and
0022 X7's "no city picker, no city by geolocation" and its map always on Moscow; 0022 X12 (no
"my location" button on the map) stays.

## Settled at the first answers (2026-10-29)

The owner took the recommended option of every question.

**C1. The Moscow region's towns are cities of their own.** Each distinct `city` of the table is
one city, named without the leading «г. » and without what follows the first comma
(«г. Видное, пос. совхоза им. Ленина» → «Видное»): 31 cities on 2026-10-29. A visitor in Moscow
gets «Москва» unless a town's store is nearer. Weighed: one «Москва и область» for the six; the
region's stores right after Moscow's with «Москва» chosen.

**C2. The nearest city is the city of the nearest store.** One great-circle distance per store;
C0's 100 km reads "no store within 100 km". Weighed: the middle of a city's stores as its centre.

**C3. A switch «<Город>» / «Все города» over the list (S3).** With a city chosen the page shows
that city's stores only and fits the map to them; «Все города» shows every store and the map as
the page opens today. «Все города» is a view only: the chosen city stays, and the next open shows
the city again. Weighed: every store with the city's first; the other cities' matches of the
search under «В других городах».

**C4. The city window is the kit's `Modal`.** The heading «Ваш город», «Определить автоматически»
above a search field over the list of cities (Москва and Санкт-Петербург first, the rest
alphabetical), the chosen city marked; picking a city closes the window. On phones it is the whole
screen, as `Modal` is there. Weighed: a short `Menu` under the button with no search.

**C5. Phones: the burger and the stores page.** Below 600 px the header still hides the city
(0019 A87.4); the burger's menu (`HeaderMenu`) gets a row «Город: <name>» («Укажите ваш
населенный пункт» without one) opening the same window, and the stores page has its own control
opening it on every width («Изменить город», «Выбрать город» without one). Weighed: the stores
page only; the city back in the phone header.

**C6. The page asks once per browser.** `/customer/stores` asks for the permission by itself only
while no city is chosen and the page has never asked in this browser (a `localStorage` mark set
when it asks); a city chosen by hand never asks (amended by C14). While the browser's prompt waits, the page shows
every store as today and moves to the city once one is found (amended by C15). Weighed: every open while no city is
chosen and the permission is not refused (it would ask on every visit of someone who closed the
prompt without answering).

**C7. The texts.** After the page's own ask: a city found moves the page to it (C3) and the header
shows it, with no message; past 100 km a line over the list «Рядом с вами пока нет магазинов» and
every store; refused, failed or timed out (10 s, amended by C15): nothing, today's view. In the window after
«Определить автоматически»: a city found closes it with the city chosen; past 100 km «Рядом с вами
пока нет магазинов»; refused «Доступ к геопозиции запрещён» (amended by C14); failed or timed
out «Не удалось определить местоположение».

**C8. A chosen city changes only by the visitor.** Only a pick in the window or «Определить
автоматически» replaces it; nothing finds it again by itself. A stored city no longer in the table
(a seed release) counts as no city.

**C9. One choice per browser.** The key is one per browser, not per signed-in user: a city is not
personal, and the header shows it signed out too. Its key and the page's mark are not `mp_`/`__mp`
keys, which the analytics clearing removes. A browser that will not store them keeps the choice
until the tab reloads (as 0019 A60).

**C10. `/privacy` gets a paragraph.** The stores page and «Определить автоматически» ask the
browser for the location; it is used in the browser only to pick the nearest city with a Lamoda
Sport store and is sent nowhere; the chosen city is kept in the browser.

**C11. Review at the phase's end.** As spec 0019 A2 and 0024: each task is committed after its
`finish-task` without a stop; the phase ends with a clean install, `verify`, the pull request and
one stop with a summary. One pull request of documents, then the fewest of code.

**C12. The stores search waits for a pause (S2).** Note S2 («добавить дебаунс» on the field
«Магазин, адрес или метро»), assigned to no spec by 0024, joins 0026: the list and the map follow
the text after a short pause in typing instead of every key; clearing the field applies at once.
`Stores Searched` keeps its own pause (0022 X17).

## Settled at the plan (2026-10-29)

**C13. The analytics (plan §7, the `analytics` agent's proposal).** The owner took the proposal
as it stands:

1. `City Located` (`result`, `trigger`) is an event of its own, since its end comes without a
   click and the page's own ask has none; a timeout counts as `failed`.
2. No `City Chosen`: a pick is `city.pick`, a found city `City Located` `found`.
3. `Stores Searched` gets `scope` (`city` | `all`); old sends have none, so a report filters
   `scope != city`.
4. `result: far` («no store within 100 km») stays a value of its own: coarser than the city
   Mixpanel takes from the address (0008 J18).
5. One `city.open` with `source` (as `room.open`) rather than three elements; `City Located` in
   the zone `stores`.
6. The zone `header`'s description becomes the site's header (it says the phone's now); only the
   text changes, no history splits.

## Added at the review of PR 1 (2026-10-29)

**C14. The page's ask, the refusal's text, the key.** The owner, at the review bot's notes:

1. A city chosen by hand also sets the page's mark (`city-asked`), so a city chosen and later gone
   from the table (C8) does not make the stores page ask by itself (C6, AC6). A browser that
   stores nothing keeps the mark in memory until the tab reloads (C9), so it is asked on each load
   of the stores page: accepted. Weighed: the mark only when the page asks.
2. The refusal says «Доступ к геопозиции запрещён», without «в браузере»: the device or its
   system may refuse too (C7 amended).
3. The key stays `city` (and `city-asked`), unprefixed as `cookie-consent` and
   `fitting-photo-consent:<userId>`; nothing of the SDK's (`mp_`, `__mp`) can clash. Weighed:
   `lamoda-city`.

## Added at T3 (2026-10-29)

**C15. The ask's own deadline.** The browser's geolocation `timeout` (C7's 10 s) starts only once
the permission is given, and a prompt closed without an answer (Firefox, Safari) may call neither
callback, leaving «Определить автоматически» busy and no `City Located` sent. The owner, at
T3's review: `locateCity` ends `failed` («Не удалось определить местоположение») 30 s after the
ask, time to read the prompt and C7's 10 s for the position; a later answer is ignored, for the
stores page's own ask too (C6: it then stays on every store). Weighed:
10 s from the click (a slow reader is told it failed before answering); the browser's timeout
alone, as a risk.
