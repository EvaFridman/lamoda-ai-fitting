# 0003 UI-kit: plan

Status: accepted (2026-10-08).
Implements [spec.md](spec.md); decisions in [clarifications.md](clarifications.md).

## Overview

- Every component of the kit is presentational. It takes props, has no api data and no business
  rules, so it lives in `web/src/shared/ui/<component>/` (FSD: "a button → shared"). This also
  covers Price, OrderStatus and SizeSelector: they format what they are given and know nothing of
  products or orders.
- The `/ui-kit` page is the slice `web/src/_pages/ui-kit`, and the route `web/app/ui-kit/page.tsx`
  re-exports it.
- Each component has its own folder, `web/src/shared/ui/<component>/`, with its `.tsx`, its own
  `.module.scss` and, where it has logic, a `.test.tsx`. Only the design tokens share one file:
  `web/src/shared/styles/tokens.scss` holds CSS custom properties (colours, type, spacing, radii,
  shadows), imported once by `web/app/globals.scss`. Component styles read them through `var(--…)`,
  so a value such as the accent colour is written once.
- Behaviour (focus, keyboard, ARIA, layering, positioning) comes from Base UI (D7a). Every Base UI
  part is wrapped in our component and styled through `className` and its `data-*` state
  attributes. The page and other code never import `@base-ui/react` directly, only `@/shared/ui`.
- Components that need state or browser events are client components (`'use client'` in their
  file). The page itself stays a server component. Live examples that hold demo state live in
  small client files inside `_pages/ui-kit/ui/`.

## Versions (checked against the registry on 2026-10-08)

| Package                       | Version | Where     | Why / check                                                                                                                                            |
| ----------------------------- | ------- | --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `@base-ui/react`              | 1.8.0   | web       | D7a. MUI/Radix authors, github.com/mui/base-ui, ~19M downloads/week, released 2026-09-04; peers React 17–19 (`date-fns` peers optional, not installed) |
| `vitest`                      | 5.0.3   | web (dev) | same version as `api`                                                                                                                                  |
| `jsdom`                       | 30.1.2  | web (dev) | DOM for component tests; the environment Base UI itself is tested in                                                                                   |
| `@testing-library/react`      | 16.3.3  | web (dev) | render and query by role                                                                                                                               |
| `@testing-library/user-event` | 14.6.7  | web (dev) | keyboard and pointer as a user does them                                                                                                               |
| `@testing-library/jest-dom`   | 7.0.1   | web (dev) | `toBeChecked`, `toHaveAccessibleName`, …                                                                                                               |

- No `@vitejs/plugin-react`: Vitest 5 compiles TSX on its own (`jsx: react-jsx`), and the `@/`
  alias comes from `resolve.tsconfigPaths`. T2 confirms it. If either fails, adding the plugin
  needs the owner's OK.
- Every new package's install scripts are checked: none of the above needs one. Nothing goes into
  `allowScripts`.

## Tokens (from Lamoda's CSS, D1, D2)

The values come from Lamoda's stylesheets, which are referenced by the saved pages (`core.css`,
`main.css` and the component chunks). Our names are our own; Lamoda's names are not copied.

- **Colour**
  - text: `#000` primary, `#888` secondary, `#ccc` disabled;
  - accent (sale price, discount badge, "Скидки"): `#f93c00`, hover `#db0d00`;
  - warning or error (failed order status): `#c20000`;
  - success: `#00a200`;
  - backgrounds: `#fff`, `#f5f5f5` secondary (hover, selected page, search), `#e5e5e5` tertiary;
  - borders: `#e5e5e5` thin separator and chip border, `#ccc`, `#888` (select and input outline),
    `#000` (hover, open, focus);
  - badges: club text `#3c5064` on `#cde6ff`, premium `#000`, promo or mint `#a5d2a0`;
  - overlay: `rgba(0, 0, 0, .5)`.
- **Type** (Onest, D4a), size/line-height:
  - headline-l 32/40, headline-m 24/28, headline-s 20/24;
  - body-m and subline 16/20, body-s 13/16;
  - caption 11/16;
  - weights 400, 500 and 700 (bold prices).
- **Shape**:
  - radius 4px for buttons, chips, selects and pagination; 8px for filter search; round for
    switches, radios and slider thumbs; 3px for checkboxes;
  - borders 1px.
- **Shadow**:
  - popover `0 2px 8px rgba(0,0,0,.08)`;
  - box `0 0 8px rgba(0,0,0,.16)`;
  - modal `0 2px 48px rgba(0,0,0,.24)`.
- **Spacing**: a 4px scale (4, 8, 12, 16, 24, 32, 48).
- **Motion**: 0.2–0.3s. Animations are off under `prefers-reduced-motion`.
- The dark values in `globals.scss` go (D8). `--font-sans` points to the `next/font` variable.

## Components (Lamoda's measurements → our component, Base UI part)

- **Button**: `primary` (black, hover `#888`), `secondary` (`#f5f5f5`, hover `#e5e5e5`) and
  `outline` (black border, transparent fill, as in "Оценить доставку" and "Показать ещё").
  - Sizes 32, 40, 48, 56px with 16px text; the small catalog size is 32px with 13px text.
  - `fullWidth`; `loading` (Spinner inside, `aria-busy`); `disabled` (opacity .4 for primary,
    `#e5e5e5` fill for the others).
  - Renders `<a>` when given `href`. **IconButton**: a square outline (48, 56px) with a required
    `aria-label`.
- **Link**: black with a grey underline (`#888`). A `secondary` variant uses grey text.
- **TextField**: Lamoda's "material" field — 56px high, label above, bottom border `#888`, black
  on hover and focus, `#c20000` with an error text. Built on Base UI `Field` and `Input`. The
  underlined price inputs reuse it in a compact form.
- **SearchField**: `#f5f5f5` field, 4px radius, 16px text, white with a shadow on hover and focus,
  and a black square button with the search icon.
- **Checkbox**: 14px box with a 3px radius, black when checked with a white tick, `#888` border on
  hover; label 16px. **CheckboxGroup** from Base UI.
- **Radio**: a 20px circle, black dot. **RadioGroup** from Base UI.
- **Switch**: a 34×14 track (`#bababa80`, black when on) and a 20px white thumb with a shadow.
- **Spinner**: Lamoda's ring loader in black (gradient ring, 1.4s), sizes 24 and 64.
- **FilterChip** (trigger, Base UI `Popover.Trigger`):
  - 36px high, `8px 12px` padding, `#e5e5e5` border, 16px text, chevron 16px;
  - hover and open: black border; open also gets an `#f5f5f5` fill;
  - applied: black fill, white text, the chosen value after the title, and × to clear;
  - a `toggle` variant has no chevron ("Только со скидкой").
  - **FilterChips** lays the chips out in a wrap with 8px gaps, plus a "Очистить фильтры" link.
- **FilterDropdown** (Base UI `Popover`): white, 4px radius, popover shadow, 246px minimum width,
  340px maximum height with scrolling inside.
  - `CheckboxFilter`: checkbox rows with counts (grey, right-aligned) and an optional search (8px
    radius, `#f5f5f5`, 12px/44px padding, search and reset icons). The footer holds a full-width
    "Применить" in 16px padding.
  - `SortFilter`: radio rows that apply on click.
  - `PriceFilter`: Base UI `Slider` with two thumbs (white 20px thumb with a `#e5e5e5` border and
    a shadow; rail `#e5e5e5`, range `#888`), two underlined inputs "Мин. цена" and "Макс. цена"
    (11px grey label), and "Применить", disabled until the range changes.
- **SizePicker** (filter) and **SizeSelector** (product): 46×46 (filter) or 56×52 (product)
  cells, `#e5e5e5` border, 4px radius, hover `#f5f5f5`, selected black with white text. Out of
  stock: grey on `#e5e5e5` with a diagonal strike, still focusable but marked `aria-disabled`.
  Built on Base UI `Radio`.
- **ColorSwatch** (colour filter): a round swatch in Lamoda's filter colours (black `#000`, grey
  `#b6b6b6`, white with a border, beige `#dfbd93`, red `#e50101`, pink `#ff9bd5`, …). The tick is
  inverted on light colours. Multi-select through `CheckboxGroup`.
- **Select** (Base UI `Select`): Lamoda's product select — 1px `#888` border, 4px radius, `8px 16px
8px 8px` padding, optional 23×32 thumbnail, 16px value, chevron. Options have `8px 14px` padding
  with an `#f5f5f5` hover; the list is at most 216px high with a box shadow. Disabled is greyed
  ("40/44 RUS").
- **Price**:
  - current price alone: 16px bold black;
  - with a discount: one or two old prices struck through in black, then the current price in
    `#f93c00`.
  - Formatted with `Intl.NumberFormat('ru-RU')`: thin spaces, "₽". A `size` prop (16 for the
    catalog, 20 for the product page).
- **Badge**: Lamoda's skewed label (`skew(7deg)` box, `0 6px` padding, 11/16 text). Tones:
  `discount` (`#f93c00`, white), `club` (`#cde6ff`, `#3c5064`), `premium` (black, white) and
  `promo` (`#a5d2a0`, black). A larger size uses 16/20 text.
- **Rating**: star 16px (black filled, `#ccc` empty), value and "(count)" in grey, 13px. It gets
  an `aria-label` such as "Рейтинг 4,7 из 5, 54 отзыва". Read-only.
- **FavoriteToggle**: heart outline that turns black filled when pressed (`aria-pressed`), with
  Lamoda's heartbeat animation (0.6s). Sizes 24, 32 (on photos) and 48 or 56 (square bordered
  next to "Добавить в корзину"). Built on Base UI `Toggle`.
- **OrderStatus** (D5b): title in 20/24 coloured by tone, then the date in grey.
  - `primary` black ("Доставлен"), `success` `#00a200`, `warning` `#c20000` ("Не выкуплен",
    "Отменён"), `caution` orange, `secondary` grey.
  - Takes `{ title, date, tone }`; status codes are mapped by the pages that use it.
- **Tabs** (Base UI `Tabs`): grey labels that turn black on hover and when active. The active tab
  has a 2px black underline. Sizes `l` (24/32, product page), `m` (20/24) and `s` (16/20), with 24
  or 16px gaps. A label may carry a counter ("Отзывы 54").
- **Breadcrumbs**: 13px grey links, "/" separators with 8px margins, the last item grey and
  `aria-current="page"`. The `<nav>` has an `aria-label`.
- **Pagination**: page buttons with `8px 16px` padding and 4px radius. The current page and hover
  get `#f5f5f5`. "Дальше →" and "← Назад" (disabled at the ends), "N из M" in grey on the right,
  and a `Показать ещё` outline button above.
- **Accordion** (Base UI `Accordion`): a row with a title and a chevron that turns, a thin
  separator, and the panel animated by height.
- **Modal** (Base UI `Dialog`): `rgba(0,0,0,.5)` overlay, white frame with a modal shadow, header
  24/28 with `24px 24px 8px` padding, content `4px 24px 24px`, footer `16px 24px`, a close ×.
  Esc and click outside close it.
- **Drawer** (Base UI `Drawer`): side sheet from the right, 432px (636px wide variant), header
  24/28.
- **Tooltip** (Base UI `Tooltip`): white with a `#e5e5e5` border, popover shadow, 4px radius and an
  arrow. Plus Lamoda's 14px round "?" trigger.
- **Toast** (Base UI `Toast`): Lamoda's snackbar — dark body with white 16/20 text, an optional
  action button, on the error tone a pale pink body (`#ffeae8`). Bottom of the screen, goes away
  after 5s. `ToastProvider` in `_app/providers.tsx`, because toasts are app-wide.
- **Skeleton**: `#f5f5f5` box with Lamoda's 1.4s colour pulse; width, height and radius props.
- **Icons**: `shared/ui/icon/` holds one React component per SVG, at 16 and 24px, `currentColor`
  where Lamoda uses black (D3).
  - The set: chevron down and up, arrow forward and back, close, search, heart outline and filled,
    star, check, cart, clock, map pin, info, plus, minus.
  - The SVG source is Lamoda's icon modules (`a.lmcdn.ru/static/<release>/assets/<name>-<hash>.js`,
    each exports one SVG string). They are fetched once into the scratchpad and written as
    components with the Write tool. No script and no runtime fetch.

## The page `/ui-kit`

- `web/app/ui-kit/page.tsx` re-exports `UiKitPage`. `metadata`: title "UI-kit — Lamoda AI
  Fitting" and `robots: { index: false, follow: false }`, which renders
  `<meta name="robots" content="noindex, nofollow">` (AC2).
- Layout: a sticky table of contents on the left (anchor links, 200px) and the sections on the
  right, at most 1200px wide like Lamoda's grid. Under 768px the table of contents moves above the
  sections, and wide rows (chips, pagination) wrap or scroll inside their own box, so the page
  itself never scrolls sideways (AC5).
- Sections in order:
  1. Tokens: colour swatches with names and hex, the type scale, spacing and shadows.
  2. One section per component group, each component with a heading, its static states (D11a) and
     a live example. A grey caption says "Наведите курсор / нажмите Tab" where hover and focus
     matter.
- The section list is one array in `_pages/ui-kit/config/sections.ts`. The table of contents and
  the sections are rendered from it, so they cannot drift apart (AC1).
- The page has no api data, so it is static. `next build` prerenders it with no api running
  (AC11).

## Tests (D12)

- `web/vitest.config.ts`: `environment: 'jsdom'`, `resolve.tsconfigPaths`, CSS modules on with
  class names kept, a setup file for `jest-dom`, and tests matching `src/**/*.test.tsx?`.
- `web/package.json`: `"test": "vitest run"`. The root `test` script gets `npm --prefix web run
test`, so `verify` runs it (AC10). `CLAUDE.md` loses "web has no tests yet".
- What is tested is behaviour, not looks:
  - FilterChip with CheckboxFilter: open, pick, apply → applied text; × clears.
  - CheckboxFilter search narrows the list.
  - PriceFilter: "Применить" disabled until a change; inputs and slider agree; min ≤ max.
  - SizeSelector keeps out-of-stock sizes reachable but announced as unavailable.
  - Price formatting and the discount layout.
  - Rating's accessible name.
  - Tabs and Select keyboard paths.
  - FavoriteToggle's `aria-pressed`.
  - Pagination edges.
- **`test-writer` extended to web**:
  - `.claude/hooks/test-writer-rules.mjs` also allows writing `web/src/**/*.test.ts(x)` and running
    `npm --prefix web test [-- <src/... paths>]` and `npx eslint --max-warnings=0 web/<files>`;
  - new cases in `guards.test.mjs`;
  - `.claude/agents/test-writer.md` gets a web section;
  - `.claude/README.md` is updated;
  - the owner restarts Claude Code after this change.

## Files

- New:
  - `web/src/shared/styles/tokens.scss`;
  - `web/src/shared/ui/<component>/{<component>.tsx, <component>.module.scss}`, plus
    `<component>.test.tsx` where there is logic;
  - `web/src/shared/ui/index.ts` (public API);
  - `web/src/shared/lib/format-price.ts`;
  - `web/src/_pages/ui-kit/{index.ts, ui/*, config/sections.ts}`;
  - `web/app/ui-kit/page.tsx`;
  - `web/vitest.config.ts`, `web/vitest.setup.ts`.
- Changed:
  - `web/app/globals.scss` (tokens, font, no dark theme);
  - `web/app/layout.tsx` (Onest via `next/font/google`, variable on `<html>`);
  - `web/src/_app/providers.tsx` (ToastProvider);
  - `web/package.json` and its lockfile;
  - root `package.json` (`test`);
  - `.claude/` files for `test-writer`;
  - `web/README.md` (shared/ui and the page);
  - `CLAUDE.md` (web tests).
- Not touched: `next.config.ts`, `web/Dockerfile`, compose and `web/public`. The kit needs none of
  them.

## Backlog

No item of `specs/backlog.md` is in this area. "Security headers" (`frame-ancestors`, `nosniff`)
touches every page, including `/ui-kit`, but belongs to nginx and stays in the backlog. "Page
cache in a read-only image" does not apply: `/ui-kit` is prerendered at build time, with no ISR and
no `'use cache'`.

## Risks

- **D3 Icons**: Lamoda's SVGs in a public repo and on prod. Accepted by the owner. Each icon file
  carries no Lamoda name.
- **Font at build time**: `next/font/google` downloads Onest during `next build`. The files are
  then served from our domain (AC7), but the build needs network access to Google, as CI and the
  image build have now. If it fails, switch to `next/font/local` with the OFL files committed:
  the owner decides.
- **Base UI styling**: state lives in `data-*` attributes (`data-checked`, `data-open`,
  `data-disabled`, `data-highlighted`). The SCSS uses them, and Stylelint must accept attribute
  selectors. Base UI's portals render into `body`, so popovers need z-index tokens.
- **Lamoda's measurements are from 2026-10-07** (release `R-2026.10.07`). They may drift; the kit
  follows the snapshot.
- **Parallel work in the other worktree**: the seed, images, `next.config.ts`, `web/Dockerfile` and
  compose of spec 0002 are on `main` (this branch is rebased on `e6d2fb9`). Only 0002's closing T7
  remains, and it touches no code. A later branch that changes `web/package.json` would conflict
  in the lockfile; whichever merges second rebases and runs `npm install`.
- **React Compiler**: it compiles our components. Base UI works with it, but a component that
  breaks under it gets `'use no memo'` with a comment.

## How each criterion is verified

| AC   | Check                                                                                                         |
| ---- | ------------------------------------------------------------------------------------------------------------- |
| AC1  | `curl -s localhost:3001/ui-kit` → 200; `qa-tester` checks one `<section id>` and one TOC link per D5/D5a item |
| AC2  | `curl -s localhost:3001/ui-kit \| rg 'name="robots" content="noindex'`                                        |
| AC3  | `qa-tester` walks the sections against the state list; screenshots for the owner                              |
| AC4  | `qa-tester` clicks the live examples; component tests cover the same flows                                    |
| AC5  | `qa-tester` at 375px: `document.documentElement.scrollWidth <= innerWidth`                                    |
| AC6  | screenshots of each section next to the references; the owner accepts them                                    |
| AC7  | `qa-tester` network log on `/ui-kit`: every request goes to the site's own host                               |
| AC8  | `qa-tester` keyboard-only pass; component tests with `user-event` for Tab, arrows, Esc and focus return       |
| AC9  | `qa-tester` reads the accessibility tree (roles and checked/expanded/selected states)                         |
| AC10 | `npm run verify` runs the web tests; a deliberately broken assertion fails it (tried once, not committed)     |
| AC11 | `docker build web` with no other service running; CI does the same                                            |
| AC12 | `git check-ignore -v specs/0003-ui-kit/references/x.png`                                                      |
