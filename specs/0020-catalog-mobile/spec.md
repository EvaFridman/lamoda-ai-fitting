# 0020 catalog: loading and the phone layout

Status: accepted (2026-10-23); amended 2026-10-23 at the review of PR 1 (AC1, AC9, AC11, AC14,
AC16); amended 2026-10-23 at T10 (AC5: W28).

Decisions: `clarifications.md` (W0–W29).

## Goal

Two faults of the catalog (`/catalog`, `/catalog/<slug>`, spec 0014) the owner found:

- A change of category looks like a bug: the page goes blank, the footer jumps up under the header
  and flickers back down while the new category loads, and the only sign of loading is the title.
- The phone layout is not Lamoda's: the category list is gone below 1024 px with nothing in its
  place, the filters are one accordion in a sheet, and the cards keep their desktop look.

After this spec a category change shows the page's shape at once with placeholders, nothing below
it moves up, and a phone shows the catalog the way Lamoda's mobile site does (the owner's
screenshots of a Lamoda category page, described in `clarifications.md`).

## In scope

- Loading placeholders on every width: while a category (or the catalog) loads, the title, the
  filters, the category list and a grid of card placeholders take their places, at least one
  screen high.
- The phone layout, below a 600 px window (W7):
  - a row with a back arrow, the title and the number of products under it;
  - a row with the current category, which expands the category list in place, and a "Фильтры"
    button with a dot while anything is applied;
  - a grid of two cards per row from edge to edge, the text padded inside the card;
  - the breadcrumbs under the list.
- The filters sheet below 1024 px: a list of filters, each opening its own screen in the sheet
  (sort, size, colour, price, brand, the other attributes), the chosen values shown in the list,
  a reset per filter and for all, and one button that applies everything.
- Analytics of the changed elements (`clarifications.md`, «Analytics»).
- Backlog «Focus lost when the filter counts fail» (W13).

## Non-goals

- Page numbers: the list stays one virtual list that loads as it scrolls, on every width (W1).
- A category tree: categories stay flat (backlog «Category tree»).
- Sizes on the card: the list's answer has none; no api change.
- The site header, the footer and the product card on wider screens.
- The desktop layout from 1024 px, apart from the loading placeholders.

## Acceptance criteria

### Loading

- **AC1.** At 375 px and 1280 px, with the api slowed down, a click on another category shows the
  placeholders at once; the footer's top edge stays below the bottom of the window, while the
  placeholders show and after the products replace them, a short list too (W22), and the page
  never shows an empty main area.
- **AC2.** The same holds for the first load of `/catalog` and `/catalog/<slug>` and for Back to
  another category.
- **AC3.** A filter or sort change keeps showing the current list until the new one arrives, as
  today (0014).

### Phone layout (375 px)

- **AC4.** Under the site header: "←", the title ("Каталог" or the category's name) and
  "N товаров" under it in grey, the noun agreeing with N. "←" goes back when the previous page was
  this site's, else to `/catalog`; on `/catalog` opened from elsewhere there is no arrow.
- **AC5.** The next row has the current category ("Все товары" on `/catalog`) with a chevron and,
  on the right, a funnel with "Фильтры". A tap on the category expands the list of categories in
  place (the chevron turns up), pushing the grid down; a category there opens its page with the
  current filters and search kept; a second tap collapses it. Below 600 px the heading row and this
  row stay at the window's top while the page scrolls; the open list scrolls with the page (W28).
- **AC6.** The funnel has a dot while a filter, a sort other than the default or a search is
  applied, and none otherwise.
- **AC7.** The grid has two cards per row with no side margins and a thin line between cards; the
  card's price, brand and name are padded from its edges.
- **AC8.** The breadcrumbs are under the list, not above the title.
- **AC9.** At 700 px and at 1280 px the page is laid out as before this spec, apart from the
  loading placeholders (AC1, AC2), the count's placeholder while the counts load (W14, W26), the
  page's height (W22), the chips kept while the counts load (AC15) and the sheet (AC10–AC14) at
  700 px.

### Filters sheet (below 1024 px)

- **AC10.** "Фильтры" opens a sheet titled "Фильтры" with ×: rows "Сортировка", then each filter of
  the current counts ("Размер", "Цвет", "Цена", "Бренд", the other attributes) and "Только со
  скидкой" as a switch. A row with a choice shows it in grey and "Сбросить" on the right. The
  footer has "Сбросить" (inactive while nothing is chosen) and "Показать N товаров".
- **AC11.** A row opens its screen in the same sheet: "‹" and the filter's name at the top, and
  "Сбросить" on the right for a list of values. "Сортировка": radio buttons on the right of each
  order, the footer "По умолчанию" (chooses the default order on the screen, kept by "Применить",
  W19) and "Применить". A list of values: the value, its count and a
  checkbox on the right; "Цвет" also has a search field, "Выбрать все" and a swatch before each
  colour. "Цена": the price fields. Each screen's footer has "Применить".
- **AC12.** "Применить" or "‹" on a screen returns to the list; "Применить" keeps the choice, "‹"
  drops what was changed on that screen. Nothing changes in the address or the products until
  "Показать N товаров", which applies every choice at once, updates the address and closes the
  sheet. N follows the choices as today (0014).
- **AC13.** Closing the sheet (×, swipe, Escape, the backdrop) drops every unapplied choice; it
  opens again with the address's selection.
- **AC14.** Keyboard: Tab reaches every row and control; opening a screen moves the focus to its
  "‹", returning moves it to the row it came from; Escape closes the sheet. A screen reader hears
  the screen's name when it opens. Any close of the sheet, "Показать N товаров" too, returns the
  focus to "Фильтры" (W20).

### Focus

- **AC15.** On desktop, applying a filter while the new counts fail to load keeps the focus on the
  filter's chip (backlog «Focus lost when the filter counts fail»).

### Analytics and build

- **AC16.** The events and tracked elements of `clarifications.md` («Analytics») are sent as listed
  there, checked by the browser's requests to Mixpanel's EU endpoint on a local stack with a token
  (the element, its zone and properties in each, W21).
- **AC17.** `npm run verify` passes, the static shells add no inline script, and the CI deploy
  serves the new pages.

## Owner actions (Claude cannot do them)

- Check the phone layout on a real phone after the deploy.

## Assumptions

- The owner's screenshots stay in the chat; `clarifications.md` describes them (0014 O50).
