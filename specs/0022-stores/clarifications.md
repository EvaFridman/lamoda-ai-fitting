# 0022 stores: Lamoda Sport stores on a Yandex map: clarifications

Status: done (2026-10-26); amended 2026-10-26 at the review of PR 1 (X16, X19–X22), at T9
(X23, X24), after the owner read Yandex's terms (X6, X14, X21) and at T10 (X25, X26).

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
  or the map only after the cookie consent. Re-confirmed by the owner on 2026-10-26 after reading
  Yandex's terms (`yandex.ru/legal/maps_api`, p. 8.1: Yandex collects the visitor's address, device
  id and geolocation, and the site guarantees the visitors' consents): the map still loads at once
  and the `/privacy` paragraph is the notice.
- **X7. One list, Moscow first, local search.** Every store is in one list and on one map, which
  opens on Moscow. The search filters the list and the map by store name, mall, city, street and
  metro station, in the browser, and fits the map to what is left; nothing matching shows «Ничего не
  нашлось». No city picker, no city by the visitor's address or geolocation. The header's city
  (0010 L5, inert) stays «Укажите ваш населенный пункт»: the owner first chose «Москва» there,
  then dropped it at the tasks (2026-10-26).
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
  any case, so it is a public build setting of web, as Mixpanel's token is: a GitHub repository
  variable (not a secret) passed to the images built from `main` (owner, 2026-10-26, after the
  plan's research; weighed: a server setting of web read per request, which changes without a
  build but needs a new path through the deploy). Without it (tests, CI, a local copy with none) the map's place shows
  a placeholder and the rest of the page works.

## Settled after the first answers (2026-10-26)

- **X14. Yandex's free plan.** The free JavaScript API plan, as Yandex's terms read on 2026-10-26
  (`yandex.ru/dev/commercial/doc/ru/`, `yandex.ru/maps-api/tariffs`): only for a site any visitor
  can reach, its registration open to all (so it is); not for a solution made for resale; data got
  through the API is never stored (the page uses no geocoder: its coordinates are Lamoda's, X1);
  Yandex's copyright, logo, «Открыть в Картах» and the terms' link always visible on the map, never
  covered (p. 4.1.3; the phone's card over the map, X19, keeps clear of them); no daily request
  limit for the JavaScript API in the terms (corrected 2026-10-26 after the owner read
  `yandex.ru/legal/maps_api`: the 500 a day of the first draft is not there; the one daily limit,
  Panoramas' 100, is for a product the page does not use), but Yandex may limit or block a key at
  its discretion (p. 4.5, 6.7); the map may show Yandex's ads (the paid «Базовый» plan, 2 000 ₽ a month, removes them). The deploy's
  warm-up renders the page on the server and loads no map. The owner takes the free plan and
  accepts the risk that a demo shown to Lamoda could be read as made for resale, which would need a
  paid licence.

- **X15. The account menu signed out.** Signed out, the page keeps the account's side menu as
  signed in (its other sections then show the invitation to sign in); below 1024 px «‹ Личный
  кабинет» stays. The main session's proposal, accepted by the owner.

## Settled while the plan was written (2026-10-26)

- **X16. The map's Content Security Policy, on this page only.** Yandex's documented policy for
  version 3 (`yandex.ru/dev/jsapi30/doc/ru/common/connection/csp`) needs `'unsafe-eval'` in
  `script-src` (its vector engine parses tiles) and its origins in `script-src`, `style-src`,
  `img-src`, `connect-src` and `worker-src` (with `data:`). The page `/customer/stores` alone gets
  them; every other page keeps 0014 O112's policy. A page keeps the policy it was loaded with, so
  every link to the stores page (the account menus, the footer) is a plain link that loads it in
  full. Weighed: the whole site (no full load, but `'unsafe-eval'` everywhere); no `'unsafe-eval'`
  (Yandex documents the map as needing it). Amended at the review of PR 1 (2026-10-26): a link
  away from the stores page is a client navigation and keeps the loosened policy in that tab until
  its next full load; the owner accepts it (Yandex's scripts are already loaded in the tab, and the
  site's pages render no foreign HTML). Weighed: every link on the stores page as a full load
  (many components, and a new link could miss it). `https://yastatic.net` (Yandex's shared CDN,
  with many libraries: with `'unsafe-eval'`, a known way around a policy) is left out of
  `script-src` and `worker-src` and added only if the browser shows the map needs it.
- **X17. Analytics: a zone `stores`.** The page's elements are a zone of their own, `stores`
  («Магазины Lamoda Sport»), area `stores`, since the page is public and not about the user's data:
  `stores.card` (a card's click), `stores.details` (`expanded`: boolean), `stores.phone`,
  `stores.route` (navigation), `stores.pin` (a pin's click), `stores.tab` (`tab`: `list` | `map`).
  The event `Stores Searched` (`query_length`, `results`: numbers; sent after a pause of 1 s in
  typing, not for an empty or unchanged text). No property names a store: no city, card position or
  store type (a city or a position names one store, and there is one Urban store). Zoom, drag and a
  cluster's click are not tracked. `sdkPerVisit` goes from 16 to 17. The menus' existing
  `section: stores` stays as it is. Weighed: an area of the zone `account`.
- **X18. Analytics: the footer.** A zone `footer` («Подвал»), area `footer`, element `footer.link`
  (navigation) with `link`: enum `stores`; each later footer link adds a value. Weighed: one
  element per link, or none.

## Added at the review of PR 1 (2026-10-26)

- **X19. A pin's click on a phone.** Below 600 px, on «Карта», a pin's click marks the pin and
  shows its store's card over the bottom of the map (the same card, with «›»), with a close
  button; the map stays as it is. As on Lamoda. Weighed: switching to «Список» (the map's context
  is lost), only marking the pin.
- **X20. Missing metro or phones.** A store with no metro station has no metro line on its card;
  one with no phone has none in its details (description and route only). As on Lamoda. Weighed:
  a line saying there is none.
- **X21. Watching the key's counter.** The owner looks at the key's request statistics in Yandex's
  cabinet daily for the first week after the deploy (no stated daily limit, but Yandex may limit or
  block a key, X14); then a
  backlog item keeps the watch and the paid plan in view.
- **X22. The seed's data is the canon.** `stores.data.ts` is checked against
  `source/lamoda-stores.json` once, at T4, by a script outside the repository, its result in the
  task's summary; the permanent test checks only what holds for any list (unique codes, ranges,
  trimmed text, known types), so no api test reads `specs/`, which becomes history at the close.
  Weighed: moving the JSON into `api/`; a test reading `specs/` for good.

## Added at T9 (2026-10-26)

- **X23. `script-src` narrowed to version 3, if the map allows it.** The security review of T9
  found that the whole host `https://api-maps.yandex.ru` in `script-src`, with `'unsafe-eval'`,
  lets an injected tag load the old 2.1 loader (its `onload` calls a global function), a known
  way around a policy. T10 tries `https://api-maps.yandex.ru/v3/` in its place with the owner's key
  and keeps it if the map loads with no violation in the console; else the host stays and the
  summary says why. A path is checked only before a redirect, so this is defence in depth.
  (owner, 2026-10-26.) Outcome at T10, in the owner's browser with the key: the loader takes its
  bundle from `https://yastatic.net/s3/front-maps-static/maps-front-jsapi-3/`, which is added as
  that folder only (X16's host stays out); no script comes from a subdomain, so
  `https://*.api-maps.yandex.ru` leaves `script-src` too (the security review of T10: its loader
  2.1 would get round the path). `script-src` holds `https://api-maps.yandex.ru/v3/` and that
  folder; the console is clean.
- **X24. The stores page is left in full.** X16's accepted risk also keeps Yandex's loaded code
  running in the tab after a client navigation, beside the profile and the photos' signed links.
  So the account's side menu and «‹ Личный кабинет» on the stores page are plain links that load
  their page in full (`AccountShell`: a section with `fullLoad` is left in full too); the header's
  and the footer's links stay client navigations, as X16 accepted. Weighed: only noting it in X16.
  (owner, 2026-10-26, on the security review's proposal.)
- **X25. Tabs below 1024 px.** X10's tabs «Список» / «Карта», with X19's card over the map on a
  pin's click, hold below 1024 px, not only below 600 px: between 600 and 1023 px the 360 px list
  beside the map left the map a narrow strip. From 1024 px the list and the map stay side by side.
  Weighed: the map in the strip as it is; the map above the list at full width below 1024 px.
  (owner, 2026-10-26, at T10.)
- **X26. The map is not recorded.** The map's container has `mp-block`: Mixpanel's recordings
  would hold Yandex's map DOM, which is no personal data but only noise (its tiles are images,
  already blocked). The pins' clicks are still sent (`stores.pin`). (owner, 2026-10-26, at T10.)
