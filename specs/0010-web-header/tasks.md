# 0010 web header: tasks

Status: accepted (2026-10-16).
Implements [plan.md](plan.md). `👤` marks a step only the owner can do.

## How the work flows

- One pull request per phase, merged with "Rebase and merge" once CI is green; the next branch
  starts from a fresh `main`. If a 0009 pull request merged meanwhile, rebase onto `main` first
  (L1).
- Each task: brief from `spec-finder`, a time estimate, the code, `finish-task`, the owner's OK, one
  commit that ticks its box. A fresh session (or `/clear`) per task.
- The last pull request carries `Closes #39` under "Что сделано".

## PR 1 · `docs/0010-spec` · documents

- [x] **T1. Spec and clarifications.** `spec.md`, `clarifications.md` (L1–L9).
      Check: owner's acceptance of `spec.md`.
      Commit: `docs(specs): add spec 0010`
- [x] **T2. Plan.** `plan.md`.
      Check: owner's acceptance of `plan.md`.
      Commit: `docs(specs): add the plan of spec 0010`
- [x] **T3. Tasks.** This file.
      Check: owner's acceptance; `npm run format:check`.
      Commit: `docs(specs): add the tasks of spec 0010`
- 👤 merges PR 1.

## PR 2 · `feat/0010-web-header` · the header

- [ ] **T4. `SearchField` keeps text out of attributes.** The uncontrolled form of plan §4: no
      `value`/`defaultValue` on the input, `defaultValue` set through the ref, reset and submit
      through the DOM value; the doc comment on the controlled form (L9).
      Check: kit tests — typed text and a `defaultValue` appear in no attribute of the form; the
      existing `SearchField` tests pass; `/ui-kit` search section works as before (AC8).
      Commit: `fix(web): keep the search field's text out of attributes`
- [ ] **T5. Profile and bag icons.** `ProfileIcon` and `BagIcon` from Lamoda's icon modules,
      written with the Write tool into `shared/ui/icon/icons.tsx`, exported from `shared/ui`, shown
      on `/ui-kit` (plan §5).
      Check: the icon tests cover them; `/ui-kit` shows both at 16 and 24px.
      Commit: `feat(web): add the profile and bag icons`
- [ ] **T6. Header and the layout.** `widgets/header`: top row, logo, inert gender switch, city
      and icons, the second row with a plain `SearchField` in place of the search feature, styles
      from Lamoda's CSS, narrow layouts; `<Header />` in `web/app/layout.tsx` (plan §1, §6).
      Check: `header.test.tsx` (no "15 лет", the logo links to `/`, buttons `aria-disabled`);
      `qa-tester` screenshots at 1440, 900 and 375 px for the owner (AC1, AC2, AC6, AC7).
      Commit: `feat(web): add lamoda's header`
- [ ] **T7. Categories in the header.** `HeaderCategories` in `<Suspense>` with `connection()`,
      active categories in the api's order, plain text, an empty row on failure (plan §2).
      Check: `header-categories.test.tsx` (order and query, no links, loader failure renders
      nothing and reports a non-`ApiError`); `qa-tester`: six categories, a category deactivated
      through the api disappears and comes back, `/` answers 200 with the api stopped (AC3–AC5).
      Commit: `feat(web): show the categories in the header`
- [ ] **T8. Header search.** `features/header-search`: `q` from the URL, `router.push` with the
      other parameters kept, the fallback field in `<Suspense>` (plan §3).
      Check: `header-search.test.tsx` with a mocked router (AC7a); `qa-tester` in the browser:
      submit, reload with `?q=`, blank submit, reset, no attribute holds the query (AC7a, AC8).
      Commit: `feat(web): make the header search keep its query in the url`
- [ ] **T9. Close the spec.** The acceptance record below; every file gets `Status: done`;
      CLAUDE.md as plan "Docs"; `README.md` if it describes the layout.
      Check: every criterion has evidence; `npm run verify` (AC9).
      Commit: `docs(specs): close spec 0010`
- 👤 compares the screenshots with Lamoda's header (AC1, AC2) and merges PR 2.

## Acceptance record

Filled in at T9.

| AC  | Result | Evidence |
| --- | ------ | -------- |
