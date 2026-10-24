# 0020 catalog: loading and the phone layout: tasks

Status: accepted (2026-10-23); amended 2026-10-23 at the review of PR 1 (T4, T5, T8, T9); amended 2026-10-23 at T10 (T10: W27–W29).

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
- [ ] **T11. Cards and breadcrumbs (W1, W5; plan §2).** The grid's phone gaps, the card's phone
      padding, the breadcrumbs' two places.
      Check: qa-tester AC7–AC9 at 375, 700 and 1280 px; Vitest: one breadcrumb landmark visible.
      Commit: `feat(web): lay the catalog's grid edge to edge on phones`
- 👤 merges PR 2; checks the phone layout on a real phone (owner action).

## PR 3 · `docs/0020-close` · closing

- [ ] **T12. Close the spec.** `CLAUDE.md` (plan §6), the acceptance record below (AC1–AC17 with
      their evidence), every file `Status: done`.
      Check: `npm run verify`; spec-finder confirms no living rule contradicts the code.
      Commit: `docs(specs): close spec 0020`
- 👤 merges PR 3.

## Acceptance record

Filled at T12.
