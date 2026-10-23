# 0020 catalog: loading and the phone layout: clarifications

Status: accepted (2026-10-23); amended 2026-10-23 at the review of PR 1 (W15, W19–W22).

The owner's decisions for this spec. Ids `W1`, `W2`, … are referred to by the spec, the plan and
code comments. W1–W7, W15–W18 and W19–W22 are the owner's answers given on 2026-10-23; W8–W14 were the
main session's assumptions where no answer covered a fork, confirmed by the owner the same day.

## The reference

**W0. Lamoda's phone catalog** (the owner's screenshots of a Lamoda category page at about 390 px,
described, not stored, as 0014 O50):

- Under the site header: "←", the category's title, and under it the count in grey
  ("361566 товаров"); a hairline under the row.
- A row: on the left a chevron and the current category ("⌄ Одежда"), on the right a funnel icon
  and "Фильтры"; with a filter applied the funnel has an orange dot. A tap on the category turns
  the chevron up and lists the subcategories under the row, full width, one per line, separated by
  hairlines, pushing the grid down.
- The grid: two cards per row from edge to edge, photos touching with a thin light line between
  them; under the photo, padded: the price (bold; an old price crossed out and the new one in
  orange), the brand, the name, the sizes, the rating.
- At the end of the list: page numbers, then the breadcrumbs ("Главная / Женщинам / Одежда").
- "Фильтры" opens a sheet nearly as high as the screen, with rounded top corners: "Фильтры" and ×
  at the top; rows "Сортировка", "Размер", "Цвет", "Цена", "Бренд", "Основной материал",
  "Детали", "Стиль", "Страна производства", "Узор", "Утеплитель", separated by hairlines; a footer
  with "Сбросить" (grey, inactive) and "Показать" (black).
- With choices made, a row shows its value in grey after the name ("Сортировка Сначала дороже",
  "Размер 1", "Цвет бежевый") and "Сбросить" in blue on the right; the footer's "Сбросить"
  becomes an outlined active button.
- "Сортировка" opens a screen of the same sheet: "‹ Сортировать", the orders as lines with a radio
  button on the right ("подобрали для вас", "новинки", "сначала дороже", "сначала дешевле", "по
  величине скидки"), a footer "По умолчанию" (inactive while the default is chosen) and
  "Применить".
- "Цвет" opens "‹ Цвет" with "Сбросить" on the right, a grey search field "Поиск", a grey chip
  "Выбрать все", then lines: a round swatch, the colour, its count in grey and a checkbox on the
  right; a footer "Применить" across the width.
- "Размер" opens "‹ Размер" with "Сбросить": lines with the size, its count and a checkbox; a
  footer "Применить".

## Owner's decisions (2026-10-23)

- **W1. The list stays one virtual list.** No page numbers on any width; 0014 O10 and the "Дальше"
  link stay. On phones the breadcrumbs move under the list.
- **W2. Loading shows placeholders.** While a category or the catalog loads: the title, the
  filters, the category list and a grid of card placeholders (0009 K11) at least one screen high,
  so the footer stays below the window.
- **W3. The phone's category row lists every category.** Categories stay flat (backlog «Category
  tree»): the row shows the current category ("Все товары" on `/catalog`) and expands the same
  list as the desktop column, each row a link that keeps the query (0014 O86).
- **W4. The back arrow goes back.** It goes back in the history when the previous page was this
  site's, else to `/catalog`; on `/catalog` with no earlier page of this site it is not shown.
- **W5. Cards edge to edge, no sizes.** Two cards per row with no side margins and a thin line
  between them, the text padded inside; no sizes row (the list's answer has none, no api change).
- **W6. A filter's screen applies to the draft.** "Применить" on a filter's screen returns to the
  list with the choice kept in the draft; the list shows the chosen values and a reset per row;
  the products change only on "Показать N товаров" (0014 O88's draft and its 300 ms count stay).
- **W7. The phone layout starts below 600 px.** Below a 600 px window: the arrow row, the category
  row, the edge-to-edge grid and the breadcrumbs at the bottom. From 600 to 1023 px the page stays
  as today (0014 O84, O88), apart from W8.

## Assumptions confirmed by the owner (2026-10-23)

- **W8. One sheet below 1024 px.** The new sheet with a screen per filter replaces 0014's accordion
  sheet on every width below 1024 px, so the page has one form of the sheet. The 600–1023 px
  trigger stays the outline "Фильтры" button of today.
- **W9. "‹" drops the screen's changes.** Leaving a filter's screen by "‹" (or a swipe back) keeps
  the draft as it was before the screen opened; only "Применить" keeps the screen's choice.
- **W10. What the dot means.** The funnel's dot shows while the address holds any filter, a sort
  other than the default or a search (`q`). A sort alone shows it too, as on Lamoda, though it
  keeps the page indexed (0014 O92).
- **W11. The sheet's "Сбросить" clears the sheet.** The footer's "Сбросить" clears every filter
  and the sort in the draft (the sort back to the default) and keeps the search, which is not in
  the sheet; the focus goes to "Показать" (as 0014 O90). A row's "Сбросить" clears that filter in
  the draft. 0014 O88's "Очистить фильтры", which also cleared the search and kept the sort, goes
  from the sheet; the desktop row and the empty state keep it.
- **W12. Sort labels.** The sheet keeps the sort labels of the desktop chip (0014), not Lamoda's
  wording; the sort screen's title is "Сортировка".
- **W13. Backlog «Focus lost when the filter counts fail» goes into this spec** (CLAUDE.md: a
  backlog item of the same area goes into the spec): the desktop chips stay mounted with the
  previous counts while the new ones load or fail.
- **W14. The count line.** The phone's count line uses the same count and agreement as the
  desktop title (the facets' `total`, 0014 O49); while it loads, a placeholder of its size.

## Analytics

The `analytics` agent's proposal (zone `catalog`, area `catalog`), the owner's choice. No new
events: `Catalog Filter Applied` and `Catalog Sorted` stay as 0014 O101 sends them. The skeletons
send nothing; a category change is the SDK's own page view, so `sdkPerVisit` stays. Hovers are
sent for a mouse only, so the phone-only elements get almost none. Together the estimate grows
from about 89 000 to about 94 000 events a month, far below the 800 000 limit.

- **W15. The sheet's rows reuse the chips' elements.** `catalog.filter-brand`, `filter-size`,
  `filter-color`, `filter-attribute`, `filter-price`, `filter-discount` and `catalog.sort` are
  also sent by the sheet's rows and gain the property `surface` (`chips`, `sheet`); their
  descriptions say "a chip in the row or a row in the sheet". An added property splits no history:
  earlier sends lack it and were all chips. So a report of the chips only filters on
  `surface != sheet`, never `surface == chips`, which would drop every click before this spec;
  the descriptions say so (corrected at the review of PR 1). Clicks per
  visit grow by 0.63 in all (sort 0.15, size, colour and brand 0.1 each, price 0.08, attribute and
  discount 0.05 each), hovers by 0.02.
- **W16. New elements.** `catalog.back` (navigation, `target`: `history`, `catalog`; 0.1 clicks,
  0.005 hovers per visit), `catalog.category-toggle` (interaction, `expanded`: boolean, the state
  it opens to; 0.25 / 0.005) and `catalog.sheet-open` (interaction, `active`: boolean, whether the
  dot shows; 0.3 / 0.02, the "Фильтры" button 0014 O99 left untracked).
- **W17. `catalog.category` covers the phone's list.** The same element is sent by the expanded
  list on phones; its description says so and its clicks per visit go from 0.4 to 0.5.
- **W18. Not tracked:** the resets (a row's and the footer's "Сбросить": a removed filter already
  comes as `Catalog Filter Applied` with `values: 0`), "Показать N товаров", anything inside a
  filter's screen ("Применить", "По умолчанию", "Выбрать все", the colour search, whose text is
  never sent) and the breadcrumbs.

## Added at the review of PR 1 (2026-10-23)

The review bot's open questions, answered by the owner.

- **W19. "По умолчанию" only chooses.** On the sort screen it chooses the default order on the
  screen, as a radio button would; "Применить" keeps it in the draft, "‹" drops it (W9).
- **W20. The focus after "Показать N товаров".** It returns to "Фильтры", as after any close of the
  sheet (the kit's `Drawer`); the page's live region reads the new count (0014 plan §3.4).
- **W21. The analytics are checked by their requests.** `qa-tester` reads the browser's requests to
  Mixpanel's EU endpoint on a local stack with a token: each send's element, zone and properties
  (AC16). Nobody opens Mixpanel's live view for it (spec 0015 R25 keeps the data with the
  `analytics` agent).
- **W22. The catalog is never shorter than the window.** The page's `<main>` is at least the
  window's height, loaded or not: a short list (or the empty state) leaves room under it, and the
  footer never rises into the first screen when the placeholders give way.
