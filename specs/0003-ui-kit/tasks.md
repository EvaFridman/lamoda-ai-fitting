# 0003 UI-kit: tasks

Status: accepted (2026-10-08).
Implements [plan.md](plan.md). `👤` marks a step only the owner can do.

## How the work flows

- One pull request per phase, merged with "Rebase and merge" once CI is green; the next branch
  starts from a fresh `main`.
- One task = one commit, with its checkbox ticked in the same commit. Each task runs in a fresh
  session: brief from `spec-finder`, time estimate, implementation, `finish-task`, the owner's OK,
  commit.
- Every component task follows the same steps:
  - the component in `web/src/shared/ui/<component>/` with its `.module.scss`, styled from the
    tokens and the measurements in plan, "Components";
  - its export in `web/src/shared/ui/index.ts`;
  - its section on `/ui-kit` and its entry in `_pages/ui-kit/ui/sections.ts`;
  - tests for its logic;
  - a look at the section next to the references in `specs/0003-ui-kit/references/`.
- A task that changes what `CLAUDE.md` or a README describes updates it in the same commit.
- Checks name the acceptance criteria they cover; the evidence goes into "Acceptance record".

## PR 1 · `feat/0003-ui-kit` · documents, web tests, tokens, page, icons

- [x] **T1. Spec documents.** `spec.md`, `clarifications.md`, `plan.md` (committed as they were
      accepted) and this file; `specs/0003-ui-kit/references/` git-ignored.
      Check: `npm run format:check`; AC12 (`git check-ignore -v specs/0003-ui-kit/references/x.png`);
      the owner has accepted spec, plan and tasks.
      Commit: `docs(specs): add the tasks of spec 0003`
- [x] **T2. Web tests.**
  - `vitest`, `jsdom` and `@testing-library/{react,user-event,jest-dom}` in web devDependencies,
    at the versions in plan, "Versions"; none needs an install script.
  - `web/vitest.config.mts` and `web/vitest.setup.ts`; a `test` script in `web/package.json`; the
    root `test` script runs it.
  - The first tested code: `web/src/shared/lib/format-price.ts` (`ru-RU`, thin spaces, "₽") with
    its test.
  - `CLAUDE.md` ("Commands") no longer says web has no tests.
  - Check: `npm --prefix web test` passes; AC10 (`npm run verify` runs the web tests; a broken
    assertion makes it fail, tried once and reverted).
  - Commit: `test(web): run component tests with vitest and testing library`
- [x] **T3. `test-writer` for web.**
  - `.claude/hooks/test-writer-rules.mjs` also allows writing `web/src/**/*.test.ts(x)`, running
    `npm --prefix web test [-- <src/... paths>]` and running ESLint on `web/` files.
  - Cases for the new paths, and for paths still refused, in `guards.test.mjs`.
  - `.claude/agents/test-writer.md` gets a web section; `.claude/README.md` is updated.
  - 👤 Restart Claude Code.
  - Check: `npm test` (guard cases); after the restart, `test-writer` writes and runs one web test
    for `format-price`.
  - Commit: `chore(tooling): let test-writer write and run web tests`
- [x] **T4. Tokens, font and the page.**
  - `web/src/shared/styles/tokens.scss` with the values of plan, "Tokens"; imported by
    `web/app/globals.scss`; the dark theme removed (D8).
  - Onest through `next/font/google` in `web/app/layout.tsx`, its variable feeding `--font-sans`.
  - `_pages/ui-kit` (table of contents and sections from `ui/sections.ts`, the tokens section)
    and `web/app/ui-kit/page.tsx` with `robots: { index: false, follow: false }`.
  - `web/README.md` describes `shared/ui`, the tokens and `/ui-kit`.
  - Check: AC1 for the tokens section; AC2 (`curl -s localhost:4001/ui-kit | rg noindex`); AC5 at
    375px; AC7 (`qa-tester` network log); AC11 (`npm run build` in web with no api).
  - Commit: `feat(web): add design tokens, the onest font and the ui-kit page`
- [x] **T5. Icons.**
  - The 16 icons of plan, "Components" (Icons), fetched once from Lamoda's icon modules into the
    scratchpad.
  - Written with the Write tool as components in `web/src/shared/ui/icon/`, with `currentColor`,
    `aria-hidden` by default and a `title` when they stand alone.
  - An "Иконки" section on the page.
  - Check: the section shows every icon at 16 and 24px; `npm run verify`.
  - Commit: `feat(web): add the icon set`

## PR 2 · `feat/0003-ui-kit-controls` · basic controls and filters

- [x] **T6. Button, IconButton, Link, Spinner.** `@base-ui/react` 1.8.0 added to web (no install
      script). Buttons in every variant, size and state of plan, "Components".
      Check: AC3 and AC8 for the section (Tab, Enter, Space; `loading` sets `aria-busy`); tests;
      `npm run verify`.
      Commit: `feat(web): add buttons, links and the spinner`
- [x] **T7. TextField and SearchField.** Lamoda's material field with label, hint and error, plus
      the grey search field with its black button.
      Check: AC3 (empty, filled, error, disabled); AC9 (label and error are announced); tests;
      `npm run verify`.
      Commit: `feat(web): add text and search fields`
- [x] **T8. Checkbox, Radio and Switch.** With their groups (`CheckboxGroup`, `RadioGroup`).
      Check: AC3; AC8 (Space toggles, arrows move within a radio group); AC9 (checked state in the
      accessibility tree); tests; `npm run verify`.
      Commit: `feat(web): add checkbox, radio and switch`
- [x] **T9. Filter chips and dropdowns.** `FilterChip` (default, open, applied, toggle),
      `FilterChips` with "Очистить фильтры", `FilterDropdown` with `CheckboxFilter` (counts,
      search, "Применить") and `SortFilter`.
      Check: AC4 (open, pick, apply → applied chip; × clears; sort applies on click); AC8 (Esc
      closes, focus returns to the chip); tests of these flows; `npm run verify`.
      Commit: `feat(web): add filter chips with checkbox and sort dropdowns`
- [x] **T10. Price filter.** `PriceFilter` with the two-thumb slider and the "Мин. цена" and "Макс.
      цена" inputs.
      Check: AC4 ("Применить" disabled until the range changes; inputs and slider agree;
      min ≤ max); AC8 (arrows move a thumb); tests; `npm run verify`.
      Commit: `feat(web): add the price range filter`
- [ ] **T11. Size and colour pickers.** `SizePicker` (filter), `SizeSelector` (product page, out of
      stock) and `ColorSwatch`.
      Check: AC3; AC9 (an out-of-stock size is announced as unavailable); tests; `npm run verify`.
      Commit: `feat(web): add size and colour pickers`
- [ ] **T12. Select.** Lamoda's product select, with and without a thumbnail, and disabled.
      Check: AC8 (open with Enter, arrows, select, Esc); AC9; tests; `npm run verify`.
      Commit: `feat(web): add the select`

## PR 3 · `feat/0003-ui-kit-display` · product and order pieces, navigation, feedback

- [ ] **T13. Price, Badge, Rating, FavoriteToggle, OrderStatus.**
      Check: AC3 (price alone, with one and two old prices; every badge tone; every status tone);
      AC4 (favourite switches); AC9 (rating's accessible name, `aria-pressed`); tests;
      `npm run verify`.
      Commit: `feat(web): add price, badges, rating, favourite and order status`
- [ ] **T14. Tabs, Breadcrumbs, Pagination, Accordion.**
      Check: AC4 (a tab switches its panel); AC8 (arrows across tabs; Enter on an accordion row);
      pagination edges in tests; `npm run verify`.
      Commit: `feat(web): add tabs, breadcrumbs, pagination and accordion`
- [ ] **T15. Modal, Drawer, Tooltip.**
      Check: AC8 (open, Esc closes, focus returns; focus stays inside an open modal); AC9 (dialog
      role and name); tests; `npm run verify`.
      Commit: `feat(web): add modal, drawer and tooltip`
- [ ] **T16. Toast and Skeleton.** `ToastProvider` in `web/src/_app/providers.tsx`.
      Check: AC4 (a toast appears and goes away; the error tone); animations off under
      `prefers-reduced-motion`; `npm run verify`.
      Commit: `feat(web): add toasts and skeletons`

## PR 4 · `docs/0003-ui-kit-close` · acceptance

- [ ] **T17. Acceptance pass.**
  - `qa-tester` over the whole page: AC1–AC5 and AC7–AC9 at 1600px and 375px.
  - 👤 The owner compares the screenshots of every section with the references (AC6).
  - Differences are fixed, each in its own commit (`fix(web): …`).
  - Check: every AC has evidence; AC6 accepted by the owner.
  - Commit: `docs(specs): record the acceptance of spec 0003`
- [ ] **T18. Close the spec.** "Acceptance record" filled in; a last pass over `CLAUDE.md`,
      `README.md` and `web/README.md` against what was built; all spec files `Status: done`.
      Check: every AC has evidence below; `npm run format:check`.
      Commit: `docs(specs): close spec 0003`

## Acceptance record

Filled in by T17 and T18.

| AC   | Result | Evidence |
| ---- | ------ | -------- |
| AC1  |        |          |
| AC2  |        |          |
| AC3  |        |          |
| AC4  |        |          |
| AC5  |        |          |
| AC6  |        |          |
| AC7  |        |          |
| AC8  |        |          |
| AC9  |        |          |
| AC10 |        |          |
| AC11 |        |          |
| AC12 |        |          |
