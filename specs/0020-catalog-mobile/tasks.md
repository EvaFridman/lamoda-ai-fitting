# 0020 catalog: loading and the phone layout: tasks

Status: done (2026-10-24): all 17 criteria pass (record below). History, not instructions.
Accepted 2026-10-23; amended 2026-10-23 at the review of PR 1 (T4, T5, T8, T9); amended 2026-10-23
at T10 (T10: W27–W29); amended 2026-10-24 at T10a (T10a added: W30); amended 2026-10-24 at T11
(T11: W31); amended 2026-10-24 at T12 (AC16's evidence: W32).

## How the work flows

- One pull request per phase, merged with "Rebase and merge" once CI is green; the next branch
  starts from a fresh `main`.
- Each task: brief from `spec-finder`, a time estimate, the code, `finish-task`, the owner's OK, one
  commit that ticks its box. A fresh session (or `/clear`) per task.
- Every code task touches `web/src`, so `fsd-reviewer` joins `code-reviewer`; `security-reviewer`
  where the task renders data or touches the CSP's shells (T4).
- `qa-tester` checks at 375, 700 and 1280 px; the owner's screenshots (W0) are described in
  `clarifications.md`.
- A pull request holds documents only or code only (the review bot checks the two differently):
  the documents (PR 1), all the code (PR 2) and the closing (PR 3), the owner's choice of fewer
  pull requests. Its cost: a large diff for one review round, and the placeholders (the bug) reach
  production only with the rest. Each task stays one commit, so the branch can still be split
  after T5 if the owner wants the fix out first.

## PR 1 · `docs/0020-catalog-mobile` · documents

- [x] **T1. Spec and clarifications.** `spec.md`, `clarifications.md` (W0–W18).
      Check: owner's acceptance of `spec.md`.
      Commit: `docs(specs): add the catalog mobile spec and its decisions`
- [x] **T2. Plan.** `plan.md`.
      Check: owner's acceptance of `plan.md`.
      Commit: `docs(specs): add the catalog mobile plan`
- [x] **T3. Tasks.** This file.
      Check: owner's acceptance; `npm run format:check`.
      Commit: `docs(specs): add the tasks of spec 0020`
- 👤 merges PR 1.

## PR 2 · `feat/0020-catalog-mobile` · the code

### Placeholders and focus

- [x] **T4. Loading placeholders (W2; plan §1).** `ProductGridSkeleton` in `widgets/product-grid`;
      `CatalogSkeleton` in `_pages/catalog/ui`; the fallbacks of `CatalogPage`, `CategoryPage` and
      `CategoryContent`; `renderList()` without data; `.page` at least the window's height (W22).
      Its `/ui-kit` example is not needed (a page part).
      Check: Vitest (fallbacks, `renderList`); `npm run verify` with `check:web-shells` unchanged;
      qa-tester AC1–AC3 at 375 and 1280 px with the api slowed.
      Commit: `fix(web): show the catalog's placeholders while a category loads`
- [x] **T5. Focus kept when the counts fail (W13, W23; plan §4).** The filters read the last
      facets the page kept for its category while new ones load and after they fail; backlog
      item removed.
      Check: Vitest AC15, a pending and a failed refetch each, and a failed one after the category
      changed (no counts of the earlier category); qa-tester with the facets request failing on
      category A, then a step to category B: B's chips never show A's counts.
      Commit: `fix(web): keep the catalog's filter chips while their counts load`

### The filters sheet

- [x] **T6. Kit pieces (plan §3).** `FilterIcon`; `Drawer`'s `fullHeight`, `onBack`,
      `headerAction`, `closable`; `CheckboxFilterPanel`'s `layout` and `selectAll`;
      `SortFilterPanel`'s `layout`; their `/ui-kit` examples.
      Check: Vitest of each prop (focus, names, ticking, "Выбрать все" with a search); `/ui-kit` at
      375 px.
      Commit: `feat(web): add the kit's sheet forms of the drawer and the filter panels`
- [x] **T7. Entity panels and summaries (W12; plan §3).** The panels' `layout` and `selectAll`;
      `filterSummary`.
      Check: Vitest of `filterSummary` (sizes' order, colours, price, sort).
      Commit: `feat(web): add the catalog filters' sheet panels and summaries`
- [x] **T8. The sheet with screens (W6, W8–W11, W15, W16, W19–W21; plan §3, §5).** `CatalogFiltersDrawer`
      rewritten; the trigger with `FilterIcon` and the dot; `resetSheet`, `hasSheetChoice`;
      `surface` on the chips and the rows, `catalog.sheet-open`; `catalog.ts`, `EVENTS.md`,
      `catalog.test.ts`.
      Check: Vitest AC10–AC14, the analytics tests; qa-tester at 375 and 700 px with the keyboard,
      and AC16 by the requests to Mixpanel (W21).
      Commit: `feat(web): open each catalog filter on its own screen of the sheet`

### The phone page

- [x] **T9. Heading row and back arrow (W4, W14; plan §2).** `CatalogHeading` as a row,
      `CatalogBack`, `lib/back-target.ts`, the page's edge-to-edge padding; `catalog.back`.
      Check: Vitest of `back-target` and `CatalogBack` (a reload, a direct link in a new tab, an
      entry from another site, the redirect from `/`, a client-side step); qa-tester AC4.
      Commit: `feat(web): add the catalog's phone heading with a back arrow`
- [x] **T10. Phone bar and categories (W3, W10, W17, W27–W29; plan §2).** `CatalogCategoryToggle`,
      `CatalogCategoryList`'s `layout="rows"`, the bar after the heading row with the sheet's
      trigger (`CatalogFilters`' `part`), the sticky block below 600 px, `lib/scroll-target.ts`;
      `catalog.category-toggle`, `catalog.category`'s description.
      Check: Vitest (toggle, rows' links keep the query, scroll target); qa-tester AC5, AC6.
      Commit: `feat(web): add the catalog's phone bar with the category list`
- [x] **T10a. A filter's screen as a second sheet (W30; plan §3).** The screen's nested `Drawer`
      in `CatalogFiltersDrawer`; the kit's bottom sheet steps back while one is nested.
      Check: Vitest of the drawer (AC11–AC14 with two sheets, Escape on a screen then on the list);
      qa-tester at 375 and 700 px against the owner's screenshots, with the keyboard.
      Commit: `feat(web): open a catalog filter's screen as a sheet over the filters`
- [x] **T11. Cards and breadcrumbs (W1, W31; plan §2).** The grid's phone margins and gaps, the
      breadcrumbs' two places.
      Check: qa-tester AC7–AC9 at 375, 700 and 1280 px; Vitest: one breadcrumb landmark visible.
      Commit: `feat(web): add the catalog's phone grid margins and breadcrumbs below the list`
- 👤 merges PR 2; checks the phone layout on a real phone (owner action).

## PR 3 · `docs/0020-close` · closing

- [x] **T12. Close the spec.** `CLAUDE.md` (plan §6), the acceptance record below (AC1–AC17 with
      their evidence), every file `Status: done`.
      Check: `npm run verify`; spec-finder confirms no living rule contradicts the code.
      Commit: `docs(specs): close spec 0020`
- 👤 merges PR 3.

## Acceptance record

Checked on 2026-10-24. The local criteria rest on the Vitest tests named (all under `web/src`) and
on the `qa-tester` runs of the tasks named, at 375, 700 and 1280 px against the owner's
screenshots (W0). PR 2 (#104, `main` 235bef6) was deployed by CI run 40073330232. The phone
layout and the sheet's swipe were checked by the owner on a real phone after that deploy (spec
«Owner actions», plan's risks) on a Samsung Galaxy S25 Ultra in Chrome: the layout as specified,
and a swipe down on a screen and on the list does not fight their scroll. `npm run verify` on the closing commit passed
(api 4006 tests, web 3564, guards and scripts 674; `check:web-bundle` and `check:web-shells`
green).

| AC   | Result | Evidence                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| ---- | ------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| AC1  | pass   | T4's `qa-tester` at 375 and 1280 px with the api slowed (the footer's top below the window during and after the switch, a short category too, W22). `catalog-browser.grid.test.tsx` "shows the grid placeholders, then the grid once the batch answers"; `catalog-skeleton.test.tsx` "holds the chips, the filters button and the category column; the CSS picks by width".                                                                                                                                                                        |
| AC2  | pass   | T4's `qa-tester` (first load of `/catalog` and `/catalog/<slug>`, Back to another category). `catalog-page.test.tsx` "draws the whole page as placeholders, with no title, until the category is read".                                                                                                                                                                                                                                                                                                                                            |
| AC3  | pass   | T4's `qa-tester`. `catalog-browser.grid.test.tsx` "shows the server's batch for the new selection without placeholders", "does not let the grid ask for a next batch during a refetch, and lets it once that ends"; the earlier `catalog-browser` tests unchanged and green.                                                                                                                                                                                                                                                                       |
| AC4  | pass   | T9's `qa-tester`. `catalog-heading.test.tsx` "comes before the heading in the row", "is the level 1 heading with the count after the title"; `back-target.test.ts` "goes back in the history when the referrer is this site (a reload keeps it)"; `catalog-back.test.tsx` "shows no arrow on /catalog entered from another site". Without the Navigation API: W26.                                                                                                                                                                                 |
| AC5  | pass   | T10's `qa-tester`; the owner's phone. `catalog-browser.analytics.test.tsx` "shows the phone list on the first click and hides it on the second", "keeps the selection in the phone rows' links like the desktop ones", "goes under the stuck block when the heading and bar stick"; `catalog-category-toggle.test.tsx` "swaps the chevron with the state".                                                                                                                                                                                         |
| AC6  | pass   | T10's `qa-tester`. `catalog-filters-drawer.test.tsx` "with %s it is %s" (nothing applied, a sort alone, a search alone, a filter).                                                                                                                                                                                                                                                                                                                                                                                                                 |
| AC7  | pass   | T11's `qa-tester` at 375, 700 and 1280 px; the owner's phone. `product-grid.test.tsx` "takes the list side padding off the width before it splits it into cards", "counts the whole width when the list has no padding". Margins instead of edge to edge: W31.                                                                                                                                                                                                                                                                                     |
| AC8  | pass   | T11's `qa-tester`. `catalog-page.test.tsx` "gives the two copies the same items and the classes that hide one per width", "keeps the breadcrumbs outside the Suspense of the products, once above it and once under it".                                                                                                                                                                                                                                                                                                                           |
| AC9  | pass   | T11's `qa-tester` at 700 and 1280 px against the layout before this spec, apart from the differences AC9 names.                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| AC10 | pass   | T8's and T10a's `qa-tester` at 375 and 700 px. `catalog-filters-drawer.test.tsx` "opens a titled sheet with the rows in order, then the switch and the footer", "shows the draft choice in grey and clears one filter with the row \"Сбросить\"", "shows the total of the counts once they arrive, in the right plural", "is off while only the search is applied".                                                                                                                                                                                |
| AC11 | pass   | T10a's `qa-tester` against the owner's screenshots. `catalog-filters-drawer.test.tsx` "has the right header action and footer on each kind of screen", "chooses a sort; \"По умолчанию\" picks the default only on the screen", "ticks every colour with \"Выбрать все\""; `catalog-filter-panels.test.tsx` "draws the swatches, named after the attribute, with a colour search".                                                                                                                                                                 |
| AC12 | pass   | T10a's `qa-tester`; the swipe on the owner's phone. `catalog-filters-drawer.test.tsx` "keeps the choice with \"Применить\" and returns the focus to the row it came from", "drops the screen’s changes with \"Назад к фильтрам\"", "applies the draft with the rest of the selection once, closes, and focuses \"Фильтры\"".                                                                                                                                                                                                                       |
| AC13 | pass   | T10a's `qa-tester`; the swipe on the owner's phone. `catalog-filters-drawer.test.tsx` "drops every unapplied choice on Escape (twice from a screen); reopening starts at the list", "closes on the ×, drops the draft and focuses \"Фильтры\"".                                                                                                                                                                                                                                                                                                    |
| AC14 | pass   | T8's and T10a's `qa-tester` with the keyboard. `catalog-filters-drawer.test.tsx` "opens with the filter name, \"Назад к фильтрам\" and no ×, focus on the back button", "closes only the screen on Escape: the list stays, the changes go, the focus returns to the row", "closes the list on a second Escape, drops the draft and focuses \"Фильтры\""; `drawer.test.tsx` "is named by backLabel and described by the title".                                                                                                                     |
| AC15 | pass   | T5's `qa-tester` (the counts failing on category A, then a step to B). `catalog-browser.test.tsx` "keeps the chip mounted and focused while the new counts load", "keeps the chip focused and the counts when the new counts fail".                                                                                                                                                                                                                                                                                                                |
| AC16 | pass   | By the tests (W32). `catalog-filters.analytics.test.tsx` "sends each row’s element with the sheet surface, and the discount switch"; `catalog-back.test.tsx` "sends the history target and goes back when the button is clicked"; `catalog-browser.analytics.test.tsx` "sends Element Clicked catalog.category-toggle with the state the click opens to", "sends Element Clicked catalog.sheet-open with active for the drawer button, and no hover", "sends Element Clicked catalog.category for a phone row"; `catalog.test.ts` (names, budget). |
| AC17 | pass   | `npm run verify` on the closing commit; `shell-script-hashes.json` unchanged since the spec (`check:web-shells` green); CI run 40073330232 deployed `235bef6`, its smoke test reading `/catalog` and a category page.                                                                                                                                                                                                                                                                                                                              |
