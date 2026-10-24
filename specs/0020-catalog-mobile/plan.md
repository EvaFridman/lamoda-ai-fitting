# 0020 catalog: loading and the phone layout: plan

Status: accepted (2026-10-23); amended 2026-10-23 at the review of PR 1 (§1, §2, §3, §4, risks,
verification: W19–W22); amended 2026-10-23 at T10 (§1, §2, risks: W27–W29); amended 2026-10-24 at T10a (§3, risks:
W30); amended 2026-10-24 at T11 (§2: W31).

How `spec.md` (AC1–AC17) is built, with the decisions of `clarifications.md` (W0–W31). No new
package, no api change, no migration. Paths are under `web/src/` unless they start otherwise.

## 1. Loading placeholders (W2; AC1–AC3)

**Cause.** A category is a page (0014 O73), so a click on another one mounts a new
`/catalog/[slug]` tree. Until `getCategoryBySlug` answers, `CategoryPage`'s
`<Suspense fallback={null}>` (`_pages/catalog/ui/catalog-page.tsx`) leaves `<main>` empty, so the
footer rises under the header; then only the `<h1>` fallback shows until the products, the counts
and the categories are prefetched. `CatalogBrowser.renderList()` renders `null` while its list has
no data.

**Change.**

- `widgets/product-grid` exports `ProductGridSkeleton({ rows })`: the grid's `.grid`/`.list`
  markup (the same container queries, so the columns match the grid that replaces it) filled with
  `CatalogProductCardSkeleton` (0009 K11), `aria-hidden`. Three rows.
- `_pages/catalog/ui/catalog-skeleton.tsx` (server-safe, no state): `CatalogSkeleton({ title? })`
  draws the page's shape with the same classes as the page: the breadcrumbs' line, the title (a
  `Skeleton` line when no title is known yet, else `CatalogHeading` with the title and a count
  placeholder), the phone bar (§2: two text-sized lines below 600 px, the "Фильтры" button's
  size from 600 to 1023 px), the chips (chip-sized `Skeleton`s from 1024 px), the category column (eight `Skeleton` lines, from 1024 px) and
  `ProductGridSkeleton`. Its block has `min-height: 100dvh`, so the footer stays out of the window
  whatever the rows' height. A visually hidden `role="status"` says "Загружаем товары".
- Fallbacks: `CategoryPage`'s outer `Suspense` → `<CatalogSkeleton />`; `CategoryContent`'s inner
  and `CatalogPage`'s → `<CatalogSkeleton title={…} />`. The breadcrumbs of `CatalogPage` and
  `CategoryContent` stay outside the fallback, as today.
- `renderList()`: no data and no error → `ProductGridSkeleton` in place of `null`.
- A filter or sort change keeps today's behaviour (AC3): `router.replace` on the same segment keeps
  the list shown until the new one arrives.
- The page itself (W22): `.page` gets `min-height: 100dvh` (with its `content-box` padding, so the
  footer starts below the window), loaded or not, so a short list or the empty state leaves room
  under it instead of pulling the footer up when the placeholders give way.

The fallbacks are part of the prerendered shells (`cacheComponents`): they add markup and no
script, so `shell-script-hashes.json` and `check:web-shells` stay as they are (AC17). Next shows the
prefetched shell of the new category at once on a click, which is the placeholder.

## 2. The phone page (W3–W5, W7, W10, W14, W31; AC4–AC9)

All of it below a 600 px window (`@media (width < 600px)`), one DOM switched by CSS, as the account
shell does. From 600 px the page renders as today.

**Edge to edge.** `.page` loses its side padding below 600 px; the heading, the phone bar, the
breadcrumbs, the empty state, the alerts and the grid (W31) get `padding-inline: var(--space-4)`
of their own.

**Heading row (AC4, W4, W14).** `CatalogHeading` becomes a row: `CatalogBack` (below 600 px only),
then the `<h1>` with the title and the count span; below 600 px the count is a block under the
title (`display: block`), from 600 px it stays inline (0014 O5). While the count loads, a
`Skeleton` of its line keeps the row's height (on a line of its own below 600 px, inline from
600 px as the page's placeholders show it, W26).

- `_pages/catalog/ui/catalog-back.tsx` (client): a plain 32px button/link drawn as the sheet's "‹"
  (W25, W26) with `ArrowBackIcon`,
  "Назад". The decision (`lib/back-target.ts`, pure, tested): `history` when the Navigation API's
  `navigation.currentEntry.index` is above 0 (the previous entry is this site's, W26); without
  that API, when the tab has made a
  client-side step since the document loaded (a module flag, kept till a reload, set once
  `usePathname` shows a path other than the one the document was loaded at, its navigation
  entry's: a step made before the catalog mounted counts, and `router.replace` of a filter keeps
  the path, W26) or `document.referrer` is this origin and the tab has an earlier entry
  (`history.length > 1`, W26); else `catalog`, unless the path is `/catalog`, where the arrow is not rendered. The server
  renders `<a href="/catalog">` on a category page and nothing on `/catalog`, so the arrow works
  without JavaScript; after mount `history` turns it into a button calling `router.back()`.
  The arrow reserves its width on `/catalog` too, so its appearance moves nothing.
  `document.referrer` is a weak signal: empty after the `/` → `/catalog` redirect, a bookmark or a
  new tab, and kept across a reload (a reload of a category page after a step on the site then goes
  back to the previous document, which AC4 allows). The tests cover a reload, a direct link in a
  new tab, an entry from another site, the redirect from `/` and a client-side step.

**Phone bar (AC5, AC6, W27, W28).** A row right after the heading row, outside `.layout`: on the
left the category toggle, on the right the filters' trigger. The heading row's full-width hairline
is its top line; it has none under it while the list is closed. The heading row and the bar are one
block (`.top`), `position: sticky; top: 0` on the page's background below 600 px. `CatalogFilters`
takes `part?: 'row' | 'sheet'` (both when omitted): the page renders `part="sheet"` in the bar and
`part="row"` (the chips) in the column. From 600 px the bar's toggle and phone list are
`display: none`; from 600 to 1023 px the bar holds the outline "Фильтры" with today's spacing,
from 1024 px the bar is `display: none`. The scroll-up after a change (0014 O82) reads its target
by `lib/scroll-target.ts` (pure, tested): below 600 px (the block is sticky) the column's top less
the block's height, else the bar's top while it shows, else the column's top.

- `entities/category/ui/catalog-category-toggle.tsx`: `CatalogCategoryToggle({ label, open,
onOpenChange, controls, toggleEvents })` — a `<button aria-expanded aria-controls>` with the label
  and `ChevronDownIcon`/`ChevronUpIcon`. Display-only (0009 K7): the page owns `open`, since its
  analytics property `expanded` needs it (W16). The label is the category's name or "Все товары".
- `CatalogCategoryList` gains `layout?: 'column' | 'rows'`: `rows` is the phone list (a full-width
  hairline on top, rows split by hairlines from 16 px off the left edge, the last too, no count,
  the chosen row bold with `aria-current`, W27). The page renders it a second time under the bar
  with `id` for `aria-controls`, `hidden` while closed. The same `getHref` (the query kept, 0014
  O86) and `linkEvents` (`catalog.category`, W17).
- A new page (another category) mounts closed. Opened on a page scrolled past it, the page goes
  up so the list starts right under the stuck block (`underStuck`, W28). Both lists are built
  from the counts the filters keep (§4), so they stay while new counts load or after they fail
  (W29).

**Filters' trigger (AC6, W10).** `CatalogFiltersDrawer`'s trigger becomes a widget button: the
new kit icon `FilterIcon` (a funnel, `shared/ui/icon/icons.tsx`), "Фильтры", and a dot while
`hasAppliedFilters(value) || value.sort !== undefined` (`lib/filter-value.ts`: `hasSheetChoice`).
Below 600 px it is plain text with the icon (the bar); from 600 to 1023 px it keeps today's outline
button's look. It carries `catalog.sheet-open` with `active` (W16).

**Cards (AC7, W31).** `widgets/product-grid` below a 600 px window: the list's own
`padding-inline: var(--space-4)`, column gap `--space-2`, row gap as today; `measureLayout`
takes the list's side padding off the width before it splits it into cards, so the measured rows
match the drawn ones. The card is unchanged. Image `sizes` stays `50vw` there.

**Breadcrumbs (AC8, W1).** Rendered twice, one shown per breakpoint: above the title from 600 px,
under the list below it. Not moved by CSS `order`, which would part the focus order from the
visual one. A hidden copy is `display: none`, so out of the accessibility tree: one breadcrumb
landmark at a time. The JSON-LD (0014 O27) is unchanged. The placeholders' breadcrumbs line (§1)
shows from 600 px only: below it the breadcrumbs sit under the list, out of the first screen.

## 3. The filters sheet with screens (W6, W8, W9, W11, W12; AC10–AC14)

Below 1024 px, as the accordion sheet today; it replaces it (W8).

**Kit (`shared/ui`), each with its `/ui-kit` example.**

- `Drawer`: `fullHeight` (bottom: `height: calc(100dvh - 48px)`, so switching screens does not
  resize the sheet), `onBack` (a "‹" button before the title, drawn as the ×, named by
  `backLabel`, which the sheet sets to "Назад к фильтрам", `aria-describedby` the title, so a
  screen reader hears "Назад к фильтрам, Цвет" when the focus lands on it, AC14; `backRef` for
  the focus, W25), `headerAction` (a node on the right of the title, in place of the ×'s
  position; the × stays on the list screen only via `closable`, default true),
  `onOpenChangeComplete`.
- `CheckboxFilterPanel`: `layout?: 'list' | 'sheet'` and `selectAll?: boolean`. `sheet`: rows of
  the value, its count in grey and a checkbox on the right, hairlines between; with `swatches`, the
  swatch is a decorative circle before the label and the checkbox stays on the right. `selectAll`:
  a grey chip "Выбрать все" under the search that ticks every shown, enabled option.
- `SortFilterPanel`: `layout?: 'list' | 'sheet'`; `sheet` puts the radio on the right of each
  label, with hairlines.

**Entity (`entities/product/ui/catalog-filter-panels.tsx`).** The panels pass `layout` through;
`ColorFilterPanel` takes `selectAll` and the placeholder "Поиск" in `sheet`. A new pure
`filterSummary` per filter (`entities/product/lib/filter-summary.ts`): the chosen labels joined by
", " (sizes in clothing order, colours lower-case as Lamoda), the price as the chip's
`priceLabel`, the sort's label (W12). Display-only, tested.

**Widget (`widgets/catalog-filters/ui/catalog-filters-drawer.tsx`), rewritten around a screen
stack.** State: `draft` (as today), `screen` (`list` | `sort` | `size` | `brand` | `price` |
`attribute:<id>`), `screenOpen` and `screenDraft` (the draft the open screen edits). The list is
the sheet's content; a screen is a second `Drawer` nested in it (W30, Base UI stacks a drawer
rendered inside another), open while `screenOpen`, its `screen` kept until it has slid out
(`onOpenChangeComplete`). The kit's bottom sheet with `[data-nested-drawer-open]` steps back
(`translateY` −8px, `scale` 0.92 from its top, dimmed by an `::after`).

- `list`: rows in Lamoda's order — Сортировка, Размер, colour attributes, Цена, Бренд, the other
  attributes — then "Только со скидкой" (`DiscountFilterPanel`). A row is a `<button>` with the
  name and the summary in grey (ellipsis), and beside it (not inside) a `LinkButton` "Сбросить"
  while the draft holds a choice for it, which clears that filter in the draft. Footer: "Сбросить"
  (outline, disabled while the draft has no filter and the default sort; clears the filters and the
  sort, keeps `q`, `resetSheet` in `lib/filter-value.ts`, focus to "Показать", W11) and
  "Показать N товаров" (today's count logic: `countDelayMs`, `settled`, "Показать товары").
- A screen: `onBack` returns to `list` dropping `screenDraft` (W9); "Применить" copies
  `screenDraft` into `draft` and returns; `headerAction` "Сбросить" (lists of values) clears the
  screen's filter in `screenDraft`. Sort: footer "По умолчанию" (disabled at the default; sets
  the default in `screenDraft` only, W19) and "Применить". Price: `PriceRangeFilterPanel` and "Применить". On entering, the focus goes to "‹"
  (the nested drawer's first control); on return, to the row it came from (Base UI gives it back
  to the control focused before it opened). A swipe or Escape on a screen is its `onBack` (W30).
- Closing (the list's ×, swipe or Escape, the backdrop) drops everything (AC13); opening starts at
  `list` from the address's selection. The window crossing 1024 px still closes it.
- "Показать N товаров" calls `onChange(draft)` once; the page sends `Catalog Filter Applied` and
  `Catalog Sorted` as today (0014 O101, W18). The sheet closes and the `Drawer` returns the focus
  to its trigger, "Фильтры" (W20).
- The desktop row's "Очистить фильтры" and the empty state's button keep `clearFilters` (W11).

## 4. Focus kept when the counts fail (W13; AC15)

`CatalogBrowser` keeps the last facets it had for the filters only. While the new counts load and
once they have failed, TanStack's `data` is `undefined`, so the page keeps the last successful
answer itself, with the category it was counted for (state updated in render when `facets.data`
changes), and passes `facets.data ?? lastFacets` to the filters only while that category is the
page's. So another category never shows the counts of the one before, whether or not Next mounts
a new page for it (it does for another slug; tests mount the component directly and cannot see
that). No `keepPreviousData` (W23).

The chips stay mounted with the previous counts, so the focus stays on the applied chip. The title's count, the live region and `categoryRows` keep reading the current answer
only. Closes backlog «Focus lost when the filter counts fail».

## 5. Analytics (W15–W18)

`shared/analytics/catalog.ts`, `EVENTS.md` regenerated (`npm --prefix web test -- -u`), the
known-elements list of `catalog.test.ts` extended:

| Element                                      | Change                                                                          |
| -------------------------------------------- | ------------------------------------------------------------------------------- |
| `catalog.filter-*` (6), `catalog.sort`       | property `surface` (`chips`, `sheet`); descriptions; clicks +0.63, hovers +0.02 |
| `catalog.category`                           | description (the phone list too); clicks 0.4 → 0.5                              |
| `catalog.back` (new, navigation)             | `target`: `history`, `catalog`; 0.1 / 0.005                                     |
| `catalog.category-toggle` (new, interaction) | `expanded`: boolean; 0.25 / 0.005                                               |
| `catalog.sheet-open` (new, interaction)      | `active`: boolean; 0.3 / 0.02                                                   |

The chips pass `{ surface: 'chips' }`, the sheet's rows `{ surface: 'sheet' }` (a colour row
`catalog.filter-color`, another attribute `catalog.filter-attribute`, the switch
`catalog.filter-discount`). Their descriptions say that a report of the chips alone filters on
`surface != sheet`: sends before this spec have no `surface` (W15). No new event; `sdkPerVisit` stays 13. Estimate about 94 000 a month,
under the 800 000 limit (`catalog.test.ts` checks it).

## 6. Docs

`CLAUDE.md`: the «web catalog» bullet (the placeholders, the phone layout below 600 px, the sheet
with screens below 1024 px) and the kit bullet (`Drawer`'s `fullHeight`/`onBack`/`headerAction`,
the panels' `layout`/`selectAll`, `FilterIcon`, `ProductGridSkeleton`). `specs/backlog.md`: the
focus item removed (§4).

## Risks

- **Base UI Drawer and a swipe on a screen.** A downward swipe on a screen closes that screen
  alone (W30); on the list, the whole sheet with the draft (AC13). A screen's list scrolls inside
  the content; check the swipe does not fight the scroll on a real phone (owner action).
- **Hydration of the back arrow.** The server cannot know the history; the arrow's slot keeps its
  width so its switch from link to button moves nothing.
- **Two copies of the category list and the breadcrumbs.** Hidden ones are `display: none`;
  tests query by role, so they see one. Tracked links: the hidden list cannot be clicked.
- **The sticky block (W28).** It covers the top of whatever scrolls under it: the scroll-up goes
  to the column's top less the block's height, and the block stays a child of `<main>` (no
  wrapper), whose height bounds where it sticks. A control the keyboard focuses under it may sit
  hidden behind it (no `scroll-padding-top`, since the block's height varies with the title).
- **Placeholders vs the virtual grid's restore (0014 O77).** The skeleton is a fallback of the
  server parts only; the grid's own restore after Back is unchanged.

## Verification

| AC        | How                                                                                                                                                                                                                                                                                                                                    |
| --------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| AC1, AC2  | qa-tester at 375 and 1280 px with the api slowed (route delay): screenshots during the switch; the footer's `getBoundingClientRect().top` ≥ the window's height during the switch and after it, a category with a few products too (W22); Vitest: the fallbacks render `CatalogSkeleton`, `renderList()` renders `ProductGridSkeleton` |
| AC3       | existing `catalog-browser` tests stay green                                                                                                                                                                                                                                                                                            |
| AC4       | Vitest of `back-target.ts` and `CatalogBack`; qa-tester: arrow after a step, none on `/catalog` opened directly, `/catalog` from a link opened in a new tab                                                                                                                                                                            |
| AC5–AC9   | qa-tester at 375, 700 and 1280 px (screenshots against W0); Vitest: toggle `aria-expanded`, rows keep the query, the dot's rule                                                                                                                                                                                                        |
| AC10–AC14 | Vitest of the drawer: rows, summaries, screens, "Применить"/"‹"/"По умолчанию"/"Сбросить", "Показать" applies once and returns the focus to "Фильтры", close drops the draft, focus moves; qa-tester with the keyboard and at 375 px                                                                                                   |
| AC15      | Vitest: a failing facets refetch keeps the chip focused                                                                                                                                                                                                                                                                                |
| AC16      | analytics tests (`surface`, new elements' properties); qa-tester reads the browser's requests to Mixpanel's EU endpoint on a local stack with a token (W21)                                                                                                                                                                            |
| AC17      | `npm run verify`; the CI deploy                                                                                                                                                                                                                                                                                                        |
