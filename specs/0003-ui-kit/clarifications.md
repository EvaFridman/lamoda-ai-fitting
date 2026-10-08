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
- D7i. Decided in T10. A price field whose thumb stands at the bound is empty and shows the bound
  in grey as its placeholder, as on the reference screenshot; a moved thumb puts its price into the
  field in black ("1 500"). An emptied field sends its thumb back to the bound.
- D7j. Decided in T10. A typed price moves its thumb at once, to where the correction puts it: a
  price out of the bounds to the bound, a min above the max (or a max below the min) to the other
  thumb. The thumbs always show what "Применить" applies, and it follows them, so Tab from a field
  reaches an enabled button. On blur or Enter the field's text is corrected the same way.
  Characters other than digits and spaces never reach a field.
- D7k. Decided in T10. An applied price chip reads "от 1 500 до 9 000 ₽", or "от 1 500 ₽" and
  "до 9 000 ₽" when only one side moved, and a single price ("3 000 ₽") when both thumbs stand on
  one price; priced with `formatPrice` (the first price of a range with `formatAmount`, the same
  digits without "₽").
- D7l. Decided in T10, a change to plan, "Components" (TextField). The price fields are not a
  compact TextField: their label stays above in 11px grey (no floating label, D7c), the field is
  47px high, an empty field shows its bound as the placeholder (D7i), and there is no hint or
  error. They are built on Base UI `Field` and `Input` inside `PriceFilter`.
- D7m. Decided in T11, a change to plan, "Components" (SizePicker). The size filter picks several
  sizes, as Lamoda's catalog filters do: its cells are checkboxes in a `CheckboxGroup`, the value
  is the list of picked sizes, and Tab moves from cell to cell. SizeSelector (one size of a
  product) stays a radio group.
- D7n. Decided in T11, a change to plan, "Components" (SizeSelector). An out-of-stock size of
  SizeSelector cannot be picked: a click does not select it, and the arrow keys and Tab pass it
  by, as in a radio group with a disabled radio. A screen reader announces it as unavailable
  (`aria-disabled`) when it reads the group. The plan's "still focusable" cannot be built: Base
  UI's radio group skips every `aria-disabled` radio and has no option to stop it (checked in
  T11). Lamoda's "Сообщить о поступлении" is not part of the kit.
- D7o. Decided in T11. A ColorSwatch is a checkbox row of the colour filter, as in Lamoda's
  `FilterValue` CSS: an 18px round swatch in place of the box, the colour's name and an optional
  count. The colours are Lamoda's filter palette, one token each (`--color-swatch-*`); the tick is
  white, and black on the light colours Lamoda inverts it on.
- D7p. Decided in T12. Select's list opens under the field, as wide as it, as on Lamoda, not over
  the field as Base UI does by default; the page keeps scrolling while it is open (not modal).
  The picked option is marked only by the grey background it has when the list opens, as on
  Lamoda, with no tick; screen readers get it from `aria-selected`.
- D7q. Decided in T12, an exception to AC3. Select's open state is shown live only (open any
  example), not as a static example open from the start: Base UI's select moves the focus into
  its list whenever it opens and has no option to stop it, so a list open on load would take the
  focus, and maybe the scroll, as the page loads. The screenshots for AC6 show it opened.
- D7r. Decided in T13. Price's old prices have no "₽", as on Lamoda ("10 399 4 521 ₽"), and keep
  kopecks when there are any. Screen readers get hidden words: "Старая цена 10 399 ₽, цена 4 521 ₽"
  (each old price so named). The discount badge is not part of Price: the page puts it next to it.
  A change to plan, "Components" (Price): its two layouts are measured on the references, not the
  plan's sizes 16 and 20: `catalog` (old prices 13px, the price 16px bold) and `product` (all 16px
  regular).
- D7s. Decided in T13, a change to plan, "Components" (Rating). Rating is one star and the value,
  as on Lamoda, with no "(count)": the value in black with a dot ("4.7"), the star black. Its
  accessible name is "Рейтинг 4,7 из 5". A product with no rating shows nothing.
- D7t. Decided in T13. FavoriteToggle's name stays "В избранное" and its state comes from
  `aria-pressed`, as the APG advises for toggle buttons. The heart beats once (0.6s) when it is
  pressed, not when it is released, and not under `prefers-reduced-motion`. It has a disabled
  state.
- D7u. Decided in T13. OrderStatus takes the date as text: the page decides between "5 октября"
  and "31 июля 2024 года" (the current year differs between server and browser around New Year,
  and `Intl` writes "2024 г."). The `caution` tone is Lamoda's orange `#be5b04`
  (`--color-caution`), `secondary` is `#888`.
- D7v. Decided in T14. An arrow key on Tabs moves to the next tab and shows its panel at once
  (automatic activation, as the APG advises when panels need no loading). A disabled tab is grey
  and cannot be shown, but the arrows stop on it: Base UI's tab list has no option to skip disabled
  tabs (checked in T14). Tab from the list goes to the panel. The active tab's underline does not
  slide, as on Lamoda. With no `defaultValue` the first enabled tab is shown. The large size uses
  the kit's headline-m (24/28), not the plan's and Lamoda's 24/32: no token has a 32px line.
- D7w. Decided in T14. The last item of Breadcrumbs, the current page, is text, not a link (Lamoda
  links it to itself), with `aria-current="page"`. On a narrow screen the crumbs wrap to a new
  line instead of scrolling sideways as Lamoda's do.
- D7x. Decided in T14, a change to plan, "Components" (Pagination). Pagination works as links
  (`getHref`, `next/link`: the catalog's pages have addresses) or as buttons (`onPageChange`).
  "← Назад" is not shown on the first page and "Дальше →" not on the last, as on Lamoda, rather
  than disabled (a link has no disabled state, D7b). The counter is items, not pages: "10 из 11"
  is 10 orders shown of 11, as on Lamoda. With many pages it shows the first, the last and the
  current one with its neighbours, and "…" for the rest. "Показать ещё" is an outline button
  across the width, shown only with `onShowMore` while pages remain.
- D7y. Decided in T14. One Accordion item is open at a time unless `multiple` is set. Closed panels
  are `hidden="until-found"`: the browser's find-in-page opens them and search engines see them.
  The panel's height is animated (0.3s), not under `prefers-reduced-motion`. The rows' titles are
  `h3`. Tab moves from row to row; the arrows do nothing (Base UI follows the APG's update).

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
