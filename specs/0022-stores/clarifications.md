# 0022 stores: Lamoda Sport stores on a Yandex map: clarifications

Status: draft (2026-10-26).

The owner's decisions for this spec. Ids `X1`, `X2`, … are referred to by the spec, the plan and
code comments. All of them are the owner's answers given on 2026-10-26 while the spec was written;
X14 and X15 came after the first draft.

## The reference

**X0. Lamoda's page «Магазины Lamoda Sport»** (`lamoda.ru/lamoda-sport/`, the owner's screenshots of
2026-10-26 at desktop width, Saint Petersburg, and at a narrow width, Moscow). Top to bottom: the
heading, the legend «lamoda sport — Мультибрендовый розничный магазин спортивной одежды и обуви»
and «lamoda sport outlet — Спортивная одежда и обувь по сниженным ценам», then a list of store
cards on the left and a Yandex map on the right with the search field «Магазин, адрес или метро»
over it, the zoom buttons and the location button. A card: the name, «›», the address, the metro
stations, the hours, «Смотреть товары магазина». Below them Lamoda has «Акции и новости магазинов»
and «Популярные бренды»: not taken. The page's saved HTML holds no stores (they load later by a
script) and holds the owner's personal data, so it is not used and never committed.

## Data

- **X1. Real stores, every city.** The stores are Lamoda's own, as its stores page answers them
  (the owner's DevTools export of 2026-10-26, 48 stores: 16 in Moscow and its region, 4 in Saint
  Petersburg, 28 in 24 other cities), kept as `specs/0022-stores/source/lamoda-stores.json`. Taken
  from it: the name, the type, the city, the street and house, the mall, the coordinates, the metro
  stations, the hours, the description and the phones, and Lamoda's store code as the natural key.
  Dropped: the app's deep link, booking, sizes, photos (all empty) and the flags. Weighed: invented
  demo stores as the demo catalog's (0002 C9d); a store's address is a public fact, and the page is
  only useful with real ones.
- **X2. The api keeps them.** A table filled by the seed and a public read for everyone; no api
  route writes them. A changed list is a new seed release; the seed only adds what is missing, so a
  changed or closed store is fixed by a migration. Weighed: a JSON file in web, quicker but
  out of reach of any later per-store data (stock).

## Page

- **X3. `/customer/stores` becomes the page.** It replaces the stub of 0017 U5; the menu item
  stays «Магазины», the page's heading is Lamoda's «Магазины Lamoda Sport».
- **X4. Open to everyone, not indexed.** Signed out the page shows the stores, not 0017 U7's
  invitation to sign in, as Lamoda's page does. It stays `noindex` and under `/customer` in
  `robots.txt` (0017 U12); since a visitor reaches it without signing in, the deploy warms it up.
  Weighed: indexing it (with the sitemap), left out.
- **X5. Yandex Maps' JavaScript API (version 3).** Our own black «la» pins, a circle with the count
  where pins overlap, and a card and its pin linked both ways (a card's click centres and marks its
  pin; a pin's click marks its card and scrolls the list to it). Weighed: Yandex's map constructor
  in an iframe: no key or code, but the list and the map would not be linked and the pins would be
  Yandex's.
- **X6. The map loads at once, no consent.** It is the page's function, not analytics, so it does
  not wait for the cookie banner. `/privacy` gets a paragraph: the stores page shows Yandex's map,
  and Yandex receives the visitor's address and its own cookies. Weighed: a «Показать карту» button,
  or the map only after the cookie consent.
- **X7. One list, Moscow first, local search.** Every store is in one list and on one map, which
  opens on Moscow. The search filters the list and the map by store name, mall, city, street and
  metro station, in the browser, and fits the map to what is left; nothing matching shows «Ничего не
  нашлось». No city picker, no city by the visitor's address or geolocation. The header's city
  (0010 L5, inert) reads «Москва» in place of «Укажите ваш населенный пункт» and stays inert.
- **X8. A card's details.** «›» opens and closes the store's details: the description (entrance,
  floor, parking), the phones as `tel:` links and «Проложить маршрут», Yandex Maps' route to the
  store in a new tab. A click elsewhere on the card selects the store (X5). No «Смотреть товары
  магазина» (no stock per store), no page per store.
- **X9. Store kinds.** Lamoda's three types «Lamoda Sport», «Lamoda Sport Urban» and «Lamoda Sport
  Outlet» are kept; every pin is the same black «la», and the type shows in the name, as on Lamoda.
  The legend above the list has the two logos «lamoda sport» and «lamoda sport outlet», drawn from
  the SVGs the owner takes from Lamoda's page, as is the pin. Weighed: orange pins for outlets, a
  Sport/Outlet filter.
- **X10. Phones: tabs.** Below 600 px the page shows the search, then tabs «Список» and «Карта»,
  the list first; a click on a card switches to «Карта» with the store marked. Weighed: the map
  above the list on one column. No board on the design canvas: the layout follows Lamoda's desktop
  page and this decision.
- **X11. The footer's link.** The footer's «Магазины Lamoda Sport» (0008 J22) links to the page;
  the backlog's "Footer links" item stays for the other entries.
- **X12. No "my location" button.** Lamoda's map has one; ours does not (the owner left it out of
  scope), so the page asks for no geolocation permission.

## The key

- **X13. The owner gets the key.** Yandex's developer cabinet, «JavaScript API и HTTP Геокодер»,
  restricted by HTTP Referer to `lamoda-ai-fitting.ru` and `localhost`. The browser sees the key in
  any case, so it is a public build setting of web, as Mixpanel's token is, and a GitHub secret for
  the images built from `main`. Without it (tests, CI, a local copy with none) the map's place shows
  a placeholder and the rest of the page works.

## Settled after the first answers (2026-10-26)

- **X14. Yandex's free plan.** The free JavaScript API plan, as Yandex's terms read on 2026-10-26
  (`yandex.ru/dev/commercial/doc/ru/`, `yandex.ru/maps-api/tariffs`): only for a site any visitor
  can reach, its registration open to all (so it is); not for a solution made for resale; data got
  through the API is never stored (the page uses no geocoder: its coordinates are Lamoda's, X1);
  Yandex's copyright, logo and «Открыть в Картах» always visible on the map; up to 500 requests a
  day (what counts as one is not stated), and a key regularly over it is blocked for good; the map
  may show Yandex's ads (the paid «Базовый» plan, 2 000 ₽ a month, removes them). The deploy's
  warm-up renders the page on the server and loads no map. The owner takes the free plan and
  accepts the risk that a demo shown to Lamoda could be read as made for resale, which would need a
  paid licence.

- **X15. The account menu signed out.** Signed out, the page keeps the account's side menu as
  signed in (its other sections then show the invitation to sign in); below 1024 px «‹ Личный
  кабинет» stays. The main session's proposal, accepted by the owner.
