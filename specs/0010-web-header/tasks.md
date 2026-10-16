# 0010 web header: tasks

Status: done (2026-10-16): all 10 criteria pass (record below). History, not instructions.
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

- [x] **T4. `SearchField` keeps text out of attributes.** The uncontrolled form of plan §4: no
      `value`/`defaultValue` on the input, `defaultValue` set through the ref, reset and submit
      through the DOM value; the doc comment on the controlled form (L9).
      Check: kit tests — typed text and a `defaultValue` appear in no attribute of the form; the
      existing `SearchField` tests pass; `/ui-kit` search section works as before (AC8).
      Commit: `fix(web): keep the search field's text out of attributes`
- [x] **T5. Profile and bag icons.** `ProfileIcon` and `BagIcon` from Lamoda's icon modules,
      written with the Write tool into `shared/ui/icon/icons.tsx`, exported from `shared/ui`, shown
      on `/ui-kit` (plan §5).
      Check: the icon tests cover them; `/ui-kit` shows both at 16 and 24px.
      Commit: `feat(web): add the profile and bag icons`
- [x] **T6. Header and the layout.** `widgets/header`: top row, logo, inert gender switch, city
      and icons, the second row with a plain `SearchField` in place of the search feature, styles
      from Lamoda's CSS, narrow layouts; `<Header />` in `web/app/layout.tsx` (plan §1, §6).
      Check: `header.test.tsx` (no "15 лет", the logo links to `/`, buttons `aria-disabled`);
      `qa-tester` screenshots at 1440, 900 and 375 px for the owner (AC1, AC2, AC6, AC7).
      Commit: `feat(web): add lamoda's header`
- [x] **T7. Categories in the header.** `HeaderCategories` in `<Suspense>` with `connection()`,
      active categories in the api's order, plain text, an empty row on failure (plan §2).
      Check: `header-categories.test.tsx` (order and query, no links, loader failure renders
      nothing and reports a non-`ApiError`); `qa-tester`: six categories, a category deactivated
      through the api disappears and comes back, `/` answers 200 with the api stopped (AC3–AC5).
      Commit: `feat(web): show the categories in the header`
- [x] **T8. Header search.** `features/header-search`: `q` from the URL, `router.push` with the
      other parameters kept, the fallback field in `<Suspense>`, the search after `connection()`
      (plan §3, L10), a query of at most 100 characters (L11).
      Check: `header-search.test.tsx` with a mocked router (AC7a); `qa-tester` in the browser:
      submit, reload with `?q=`, blank submit, reset, no attribute holds the query (AC7a, AC8); on a
      production build, text typed before hydration stays in the field (L10).
      Commit: `feat(web): make the header search keep its query in the url`
- [x] **T9. Close the spec.** The acceptance record below; every file gets `Status: done`;
      CLAUDE.md as plan "Docs"; `README.md` if it describes the layout.
      Check: every criterion has evidence; `npm run verify` (AC9).
      Commit: `docs(specs): close spec 0010`
- 👤 compares the screenshots with Lamoda's header (AC1, AC2) and merges PR 2.

## Acceptance record

Checks on 2026-10-16 on `feat/0010-web-header` at `0752313` (T8), on the local stack (`next dev`)
by `qa-tester` in a browser and, for AC3, by the main session; `npm run verify` on the closing
commit passed (api 2117 tests, web 1647, guards and scripts 420). Web tests are in `web/src`; screenshots for the owner's comparison
(AC1, AC2) are `qa-tester`'s, not committed.

| AC   | Result | Evidence                                                                                                                                                                                                                                                                                                                                                                                                                |
| ---- | ------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| AC1  | pass   | `header.test.tsx` "has no announcement bar" (no "15 лет"), the logo, inert buttons and search field present; browser at 1440 px on `/`, `/privacy`, `/ui-kit`, `/dev/catalog`: header first in `body` (height 126, `main` from y=126), gender switch and city left, logo centred, profile, favourites and cart right, categories and search in the second row, no announcement bar, no sideways scroll                  |
| AC2  | pass   | Browser at 900 and 375 px: `scrollWidth` equals `clientWidth`; gender switch and city in the first row, logo and icons in the second, search in the third, categories below; at 375 px the category list scrolls (`scrollWidth` 618 of 343, `overflow-x: auto`), the city cut with an ellipsis                                                                                                                          |
| AC3  | pass   | `header-categories.test.tsx`: asks for the active categories (100 at most), names in the api's order and nothing else; local stack: `PATCH /categories/:id` with the admin token set "Футболки" inactive (200), `/privacy` then listed the other five in order, set it active again (200), all six back in order                                                                                                        |
| AC4  | pass   | `header-categories.test.tsx` "renders no links"; browser: the header's only `<a>` is the logo, categories are `li`, clicks on all six leave the URL unchanged                                                                                                                                                                                                                                                           |
| AC5  | pass   | `header-categories.test.tsx`: on an `ApiError` and on a plain error it renders nothing and reports once; `header.test.tsx`: the rest renders without categories; api stopped: `/`, `/privacy`, `/ui-kit`, `/dev/catalog` answered 200 with the header and no category row; after `docker compose start api` the categories came back on reload                                                                          |
| AC6  | pass   | `header.test.tsx` "links the logo to the home page"; browser: the logo on `/privacy` leads to `/`                                                                                                                                                                                                                                                                                                                       |
| AC7  | pass   | `header.test.tsx`: inert controls are `type="button"`, `aria-disabled`, a click changes nothing; browser: clicks on the gender switch, city and three icons left the URL, `header` and `main` unchanged, no new requests                                                                                                                                                                                                |
| AC7a | pass   | `header-search.test.tsx` (mocked router): trimmed `q` on Enter and "Найти", other parameters kept, `q` replaced, blank pushes nothing, `q` fills the field, reset, 100-character limit (L11); browser: " платье " on `/dev/catalog?foo=1` gave `?foo=1&q=платье`, reload and `/privacy?q=джинсы` show the query, blank and empty submits change nothing, "Очистить" empties the field, a 123-character `q` shows as 100 |
| AC8  | pass   | `search-field.test.tsx` "uncontrolled text stays out of attributes (L9)" and "hydration (L9)", `header-search.test.tsx` "puts neither the url query nor typed text into any attribute"; browser: every attribute of every element scanned while typing, after a submit and after loading with `?q=`: no match, plain or percent-encoded                                                                                 |
| AC9  | pass   | `npm run verify` above, exit 0 (its `next build` runs with no api); `docker build --target runtime web` exit 0, outside the compose network (no api reachable)                                                                                                                                                                                                                                                          |
