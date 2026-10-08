# 0003 UI-kit: clarifications

Status: in progress (2026-10-08).

Decisions made by the owner. Each line is final unless the owner changes it here. The model is
lamoda.ru: the catalog, a product page and the order history.

## Scope

- D1. References: the owner's screenshots and the three pages saved from the browser as HTML. They
  live in `specs/0003-ui-kit/references/`, which is git-ignored, because they hold Lamoda's code and
  images and the order history holds the owner's personal data. Only values taken from them
  (colours, sizes, spacing, copy) enter the spec files and the code. lamoda.ru answers 403 to
  automated fetches, so there is no other source.
- D5. Components of the kit:
  - basic: Button (variants, sizes, loading, disabled), IconButton, Link, TextField, Checkbox,
    Radio, Switch, Spinner;
  - catalog filters: filter chip, filter dropdown (checkbox list with search), sort select, size
    picker, colour swatches, price range;
  - product and order pieces: Price (current, old, discount), Badge, read-only star Rating, size
    selector (selected, out of stock), favourite toggle, order status;
  - navigation and feedback: Tabs, Breadcrumbs, Pagination, Accordion, Modal and Drawer, Tooltip,
    Toast, Skeleton.
- D5a. Added after the screenshots: a search field (grey field with a black square search button)
  and a select with a thumbnail and a border (the colour and size selects of the product page).
- D5b. The order status follows Lamoda: coloured text with a grey date ("Доставлен" in black,
  "Не выкуплен" in red), not a filled badge.
- D6. Not in the kit: the product card and the order card.
- D6a. Not in the kit, left for the pages that need them: the header, the footer, the black
  announcement bar and the floating chat button. Also left out of the kit: the side category and
  account menus, pill buttons ("С чем носить", "Идет размер в размер"), the round carousel arrow,
  bordered link rows ("Узнать условия доставки"), the characteristics list with dotted leaders, the
  promo countdown and small product labels.

## Look

- D2. As close to Lamoda as possible: colours, sizes, spacing, states and copy. No Lamoda logo and
  no Lamoda font files.
- D2a. Decided in T6. Button text has weight 400, as in Lamoda's `.x-button` CSS. The text looks
  heavier on the screenshots only because of Lamoda's own font. The Spinner follows the plan's
  description: Lamoda's stylesheets have no rule for it, and the loader in the saved "Заказы" page
  is the anti-bot check's, not Lamoda's. Its ring is 2px thick at 24px and 4px at 64px.
- D3. Icons are SVGs taken from Lamoda's code. Accepted risk, raised during the questions:
  someone else's graphics in a public repository and on the production site.
- D3a. Icons drawn at one size only are scaled to the other (decided in T5). The map pin, drawn
  with fills at 24px, stays as drawn: at 16px its lines thin to about 0.7px. The outline heart is
  hollow (the source's was filled white); FavoriteToggle (T13) gives itself a white backing for
  photos.
- D4. Font: the closest free font with Cyrillic from Google Fonts, served through `next/font` from
  our own domain. The plan offers two or three candidates; the owner picks one.
- D4a. Lamoda's font is CoFo Sans (commercial). The owner picked Onest (candidates: Onest, Golos
  Text, Inter).
- D8. Light theme only, as on Lamoda. The dark values in `web/app/globals.scss` go. Tokens stay CSS
  custom properties, so a dark theme can be added later.
- D9. The model is desktop Lamoda. Components do not break and the page does not scroll sideways
  on a narrow screen, but there are no mobile variants (bottom sheets instead of dropdowns): the kit
  serves `/ui-kit` for now, and mobile variants come with the real pages.
- D13. Prices (`formatPrice`, decided in T2): the input is rubles, as the api stores them
  (`Decimal(10,2)`). Kopecks show only when there are any: 1299 → "1 299 ₽", 1299.5 →
  "1 299,50 ₽". The spaces are what `Intl.NumberFormat('ru-RU')` puts in (no-break U+00A0, between
  digit groups and before "₽"); the plan's "thin spaces" means these.

## Behaviour

- D7. Keyboard and screen-reader behaviour of dropdowns, selects, dialogs, tabs and tooltips comes
  from a headless library (Radix UI or Base UI, chosen in the plan after the checks in
  `CONTRIBUTING.md`), styled with our own SCSS.
- D7a. The owner picked Base UI (`@base-ui/react`) over Radix UI: one package that also has the
  Drawer, Toast, two-thumb Slider and CheckboxGroup the kit needs.
- D7b. Decided in T6. `Link`, and `Button` given `href`, render `next/link`, so links inside the
  site navigate without a full page load. A button-styled link does not use Base UI's Button: its
  docs say a link must not get button semantics. A link has no `disabled` or `loading`.
- D7c. Decided in T7. TextField's label floats, as in Lamoda's `x-input-material` CSS: inside the
  empty field in 16px grey, 11px above the value once the field is focused or filled. The hint and
  the error sit under the field in 11px; the error replaces the hint.
- D7d. Decided in T7. SearchField is a `<form role="search">`: Enter or the black button ("Найти")
  submits the value. A reset button ("Очистить") shows while the field is filled, as on Lamoda; it
  empties the field and puts the focus back into it.
- D7e. Decided in T8. Checkbox, Radio and Switch have no error state, as on Lamoda: default,
  checked and disabled. An error is added with the first form that needs one. Checkbox has no
  indeterminate (parent) state: the plan's filters and colour swatches do not use it.
  A disabled radio leaves the Tab order when its group has nothing to pick. Accepted: when the
  checked radio is disabled but others are enabled, or radios are enabled after the first render,
  Tab may land on the disabled radio first and the arrows move to the enabled ones (Base UI keeps
  its tab stop there).
- D7f. Decided in T9. SortFilter applies every change at once, the arrow keys included (a radio
  group selects as it moves). A click closes the dropdown; with the arrows it stays open, and
  Enter, Space or Esc close it, the focus back on the chip.
- D7g. Decided in T9. Filter dropdowns are at least 292px wide, as on the reference screenshots
  (Lamoda's "Применить" is at least 260px wide inside 16px padding), not the 246px of Lamoda's
  `FilterDefault`; the sort dropdown is as wide as the checkbox one.
- D7h. Decided in T9. "Очистить фильтры" is a `<button>` styled as the
  Link (black, grey underline), not a link: it resets the filters on the page and has no address.

## Page

- D10. `/ui-kit` is public in production, closed to search engines (`noindex`).
- D11. One page: tokens first (colours, type, spacing), then a section per component with every
  variant and state, and a table of contents on the left with anchor links. Examples are live: they
  can be clicked and change state.
- D11a. Hover and focus are shown live (pointer, Tab) with a caption, not frozen: freezing them
  would put demo-only code into every component. Disabled, selected, open, error and applied are
  shown as static examples. AC3 amended accordingly.
- D11b. The page's section list lives in `_pages/ui-kit/ui/sections.ts`, not `config/`: it holds
  the section components, and `config/` keeps plain data (decided in T4, after the FSD review).
- D11c. z-index tokens (plan, "Risks") are added with the first component that needs them, not
  ahead of it (decided in T4).

## Tests

- D12. Vitest and Testing Library for components with logic. `web` joins the root `npm test` and so
  `verify`. The `test-writer` agent is extended to `web`; `.claude/README.md` is updated with it.
- D12a. `test-writer` in web (decided in T3): web test runs take `-t <name>` and `--reporter=` like
  api's; the agent may run `npm --prefix web run typecheck` (`next typegen` writes only git-ignored
  files). A test writing git-ignored files (`.claude/settings.local.json`, `node_modules`) stays
  part of the accepted risk that a test runs with the owner's rights; the check after the agent
  does not cover them.
