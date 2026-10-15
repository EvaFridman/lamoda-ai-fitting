# 0010 web header: plan

Status: accepted (2026-10-16).

Implements [spec.md](spec.md); decisions in [clarifications.md](clarifications.md) (L1–L9).

## 1. Widget `widgets/header` (L2, L5, L6, L7; AC1, AC2, AC6, AC7)

Built like `widgets/footer`: a server component with its own SCSS module; the only client code is
the search feature (§3).

- `index.ts` exports `Header`. Files: `ui/header.tsx`, `ui/header.module.scss`, `ui/logo.tsx`,
  `ui/header-categories.tsx`, `ui/header.test.tsx`, `ui/header-categories.test.tsx`.
- **Top row**, three columns:
  - Left: "Женщинам" with `ChevronDownIcon` (16px), then "Укажите ваш населенный пункт".
  - Centre: the logo, a `Link` to `/` with `aria-label="Lamoda, на главную"`.
  - Right: profile (`ProfileIcon`), favourites (`HeartIcon`) and cart (`BagIcon`), each an
    `IconButton` with an `aria-label` ("Профиль", "Избранное", "Корзина").
- **Second row**: the category row on the left (§2), the search field on the right at Lamoda's
  width (§3).
- **Inert elements (L5)**: the gender switch, the city and the icons are buttons rendered
  `disabled` with `focusableWhenDisabled` (Base UI), so they carry `aria-disabled="true"`, stay in
  the tab order and do nothing.
- **Logo (L7)**: `ui/logo.tsx` holds the SVG of the saved page (`viewBox="0 0 168 28"`), `fill`
  `currentColor`, `aria-hidden` (the link carries the name). It stays in the widget, not in the
  kit: nothing else uses it.
- **Styles**: sizes, spacing, colours and the bottom border or shadow come from Lamoda's CSS
  (`.d-header`, `.d-header-topmenu`, `.d-header-genders`, `.user-nav-premium` in the a.lmcdn.ru
  chunks used by 0003); new values become tokens in `shared/styles/tokens.scss`. Content at most
  1200px wide with the footer's side padding, so header, page and footer line up.
- **Narrow screens (L6; AC2)**: below 1024px a grid with areas: "Женщинам" and the city in a row
  of their own; the logo (left) and the icons (right); the search field at full width; the category
  row with `overflow-x: auto`, no wrapping and no visible scrollbar. Below 600px the footer's
  narrow padding.
- No sticky position, so no z-index token.

## 2. Categories in the header (L3, L4; AC3, AC4, AC5)

- `HeaderCategories` is an async server component inside `<Suspense fallback={null}>`, as the
  footer's version and the greeting are: `await connection()`, then
  `getCategories({ isActive: true, limit: 100 })` from `@/entities/category/server`.
  - The api orders by `sortOrder`, then name (0004 E39); the header keeps that order.
  - 100 is the api's page maximum; more categories than that would not fit a row anyway.
- No `HydrationBoundary`: nothing in the browser reads categories here.
- Each category is an `<li>` with its name as text (L4), no `href`.
- **Failure**: the same `load()` shape as `widgets/greeting`. A thrown error goes to
  `reportFailure` (an `ApiError` was already reported by `apiFetch`) and the component renders
  `null`: no error text, the row is empty and the page answers 200 (L3, AC5; web's health check
  fetches `/`).
- The second row keeps its height without categories (the search field sets it), so the page does
  not jump when they arrive.

## 3. Search (L8; AC7a)

- A feature slice `features/header-search` (`index.ts` → `HeaderSearch`), a client component:
  - Reads `q` with `useSearchParams()` and renders the kit's `SearchField` uncontrolled, starting
    from `q` (`defaultValue`), with `key={q}` so a URL change (back, another link) refreshes it.
  - `onSearch(query)` (the kit already trims and skips a blank value): copies the current
    parameters, sets `q`, and calls `router.push(\`${pathname}?${params}\`)`. Other parameters
    stay; nothing is fetched.
- `useSearchParams` needs a `<Suspense>` boundary for the prerendered shell: the header wraps
  `HeaderSearch` in one whose fallback is a plain `SearchField`, so the field is visible before
  hydration and the shell's height does not change.
- FSD: `widgets/header` → `features/header-search` → `shared/ui`; the feature knows nothing of
  the catalog. The catalog page spec gives the query a results page.

## 4. Typed text out of attributes (L9; AC8)

`SearchField` keeps its value in React state and passes it as `value`, so React writes the text
into the input's `value` attribute too; `defaultValue` is written there as well. Change in the kit:
when no `value` prop is given,

- the input is uncontrolled and gets no `value`/`defaultValue` prop; `defaultValue` is put into the
  DOM property (`input.value`) through the ref on mount, so it never becomes an attribute;
- the field tracks only whether it is filled (for the reset button); submit reads `input.value`;
  reset sets `input.value = ''`.

The controlled form (`value` prop) stays as it is; its users pass the value on purpose, and its doc
comment says the value then appears as an attribute. A kit test types into an uncontrolled field,
and starts one from a `defaultValue`, and checks that no attribute of the form holds the text; the
existing `SearchField` tests keep passing. The fallback field of §3 starts empty, so the query
shows only after hydration.

## 5. Icons (AC1)

`ProfileIcon` and `BagIcon` join `shared/ui/icon/icons.tsx` through `createIcon`, taken once from
Lamoda's icon modules into the scratchpad as in 0003 T5 (D3), `currentColor`, at the sizes Lamoda
draws them (24px; 16px scaled as D3a). They appear in the `/ui-kit` icons section and
`shared/ui/index.ts`. `CartIcon` stays: Lamoda uses the bag in the header and the cart elsewhere.

## 6. Root layout

`web/app/layout.tsx` renders `<Header />` before `{children}` inside `Providers`; its comment says
"providers, the site header and footer". Every page gets the header (AC1).

## Backlog

- "Category tree" stays: the header shows the flat list (spec non-goals).
- "Taint the proxy secret" is not taken: the header passes no server data to client components
  (`HeaderSearch` reads the URL itself).

## Docs

- At closing: CLAUDE.md's opening paragraph gains "Lamoda's header by `0010-web-header`".
- CLAUDE.md's analytics bullet gets one clause: the kit's `SearchField`, uncontrolled, keeps typed
  text out of attributes (L9).

## Risks

- **L7 logo**: Lamoda's logo in a public repository and on prod; accepted by the owner, as D3.
- **The query in the URL reaches Mixpanel**: the SDK sends the page URL (`$current_url`) with every
  event, so after a search `q` goes with the visitor's events, as on Lamoda. A search phrase is not
  meant to hold personal data; if it must stay out, the catalog page spec strips `q` from the URL
  the SDK sees.
- **A long category list** would scroll sideways on desktop too; with six it fits (spec
  assumptions).
- **0009 in parallel (L1)**: both touch `shared/ui/icon` and `/ui-kit`; the later branch rebases.

## How each criterion is verified

| AC   | Check                                                                                                                                                 |
| ---- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| AC1  | `qa-tester` screenshots of `/`, `/privacy`, `/ui-kit`, `/dev/catalog` at 1440px for the owner; a test: no "15 лет", parts present                     |
| AC2  | `qa-tester` at 900 and 375px: no sideways page scroll, row order, category row scrolls                                                                |
| AC3  | A test (order, only active requested); `qa-tester` deactivates a category through the api (admin token), reloads, restores it                         |
| AC4  | A test: no category has a link; `qa-tester` clicks one, URL unchanged                                                                                 |
| AC5  | A test (loader throws → no row, rest renders); `qa-tester` stops the api: `/` answers 200 with the header                                             |
| AC6  | A test: the logo links to `/`                                                                                                                         |
| AC7  | A test: the buttons are `aria-disabled`; `qa-tester` clicks them, checks URL and network                                                              |
| AC7a | A test of `HeaderSearch` with a mocked router: pushed URL keeps other parameters, blank does nothing, `q` fills the field; `qa-tester` in the browser |
| AC8  | The `SearchField` tests (§4); `qa-tester` types in the header search, reloads with `?q=`, inspects the DOM                                            |
| AC9  | `npm run verify` (includes `next build` with no api)                                                                                                  |
